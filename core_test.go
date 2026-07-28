package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVersionInference(t *testing.T) {
	tests := []struct {
		input string
		want  int
	}{
		{"25.0", 25},
		{"v26.11", 26},
		{"Photoshop-27", 27},
		{"invalid", 0},
	}
	for _, test := range tests {
		if got := majorFromVersionLabel(test.input); got != test.want {
			t.Fatalf("majorFromVersionLabel(%q) = %d; want %d", test.input, got, test.want)
		}
	}

	pathTests := []struct {
		input string
		want  int
	}{
		{`C:\Program Files\Adobe\Adobe Photoshop 2024\Photoshop.exe`, 25},
		{`C:\Program Files\Adobe\Adobe Photoshop 2026\Photoshop.exe`, 27},
		{`C:\Photoshop\Photoshop.exe`, 0},
	}
	for _, test := range pathTests {
		if got := majorFromPhotoshopPath(test.input); got != test.want {
			t.Fatalf("majorFromPhotoshopPath(%q) = %d; want %d", test.input, got, test.want)
		}
	}
}

func TestMergePhotoshopInstalls(t *testing.T) {
	got := mergePhotoshopInstalls([]photoshopInstall{
		{Path: `/Applications/Photoshop`, Source: "folder"},
		{Path: `/Applications/Photoshop`, Major: 27, Source: "registry"},
	})
	if len(got) != 1 || got[0].Major != 27 || !strings.Contains(got[0].Source, "registry") {
		t.Fatalf("unexpected merge result: %#v", got)
	}
}

func TestRegistryUpdatePreservesOtherPluginsAndReplacesCurrentEntry(t *testing.T) {
	original := []byte(`{
	  "schema": 1,
	  "plugins": [
	    {"pluginId":"keep.me","custom":{"x":true}},
	    {"pluginId":"caveman.optimizer.uxp","versionString":"1.7.1"}
	  ]
	}`)
	updated, err := updatePluginRegistry(original)
	if err != nil {
		t.Fatal(err)
	}

	var root struct {
		Schema  int `json:"schema"`
		Plugins []struct {
			PluginID       string          `json:"pluginId"`
			VersionString  string          `json:"versionString"`
			Path           string          `json:"path"`
			HostMinVersion string          `json:"hostMinVersion"`
			Custom         json.RawMessage `json:"custom"`
		} `json:"plugins"`
	}
	if err := json.Unmarshal(updated, &root); err != nil {
		t.Fatal(err)
	}
	if root.Schema != 1 || len(root.Plugins) != 2 {
		t.Fatalf("unexpected registry: %s", updated)
	}
	if root.Plugins[0].PluginID != "keep.me" || len(root.Plugins[0].Custom) == 0 {
		t.Fatalf("unrelated plug-in was changed: %s", updated)
	}
	got := root.Plugins[1]
	if got.PluginID != pluginID ||
		got.VersionString != pluginVersion ||
		got.Path != registryPathHint ||
		got.HostMinVersion != hostMinVersion {
		t.Fatalf("new entry is incorrect: %#v", got)
	}
	if !strings.Contains(string(updated), `"$localPlugins\\External\\caveman.optimizer.uxp"`) {
		t.Fatalf("registry path is not encoded with Windows separators: %s", updated)
	}
}

func TestRegistryUpdateRejectsDamagedRegistry(t *testing.T) {
	if _, err := updatePluginRegistry([]byte(`{"plugins": [`)); err == nil {
		t.Fatal("expected damaged registry to be rejected")
	}
}

func TestExtractedPayloadMatchesManifest(t *testing.T) {
	destination := filepath.Join(t.TempDir(), pluginID)
	if err := extractAndVerifyPlugin(destination); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(filepath.Join(destination, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(content), `"caveman.optimizer.uxp"`) {
		t.Fatal("staged manifest does not contain the expected plug-in ID")
	}
}

func TestPathContainment(t *testing.T) {
	parent := t.TempDir()
	if !isPathInside(parent, filepath.Join(parent, pluginID)) {
		t.Fatal("expected child path to be accepted")
	}
	if isPathInside(parent, filepath.Dir(parent)) {
		t.Fatal("expected parent escape to be rejected")
	}
	if isPathInside(parent, parent) {
		t.Fatal("expected the parent itself to be rejected")
	}
}

func TestInstallTransactionReplacesCurrentAndPreservesOtherPlugins(t *testing.T) {
	appData := t.TempDir()
	pluginParent := filepath.Join(appData, "Adobe", "UXP", "Plugins", "External")
	registry := filepath.Join(appData, "Adobe", "UXP", "PluginsInfo", "v1", "PS.json")
	currentTarget := filepath.Join(pluginParent, pluginID)

	for _, path := range []string{currentTarget, filepath.Dir(registry)} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(currentTarget, "old-marker"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	originalRegistry := []byte(`{
	  "schema": 7,
	  "plugins": [
	    {"pluginId":"keep.me","name":"Keep Me","custom":true},
	    {"pluginId":"caveman.optimizer.uxp","versionString":"1.7.1"}
	  ]
	}`)
	if err := os.WriteFile(registry, originalRegistry, 0o644); err != nil {
		t.Fatal(err)
	}

	if err := installForCurrentUser(appData, nil); err != nil {
		t.Fatal(err)
	}
	if err := verifyPluginPayload(currentTarget); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(currentTarget, "old-marker")); !os.IsNotExist(err) {
		t.Fatalf("old plug-in payload was not replaced: %v", err)
	}

	updatedRegistry, err := os.ReadFile(registry)
	if err != nil {
		t.Fatal(err)
	}
	var root struct {
		Schema  int `json:"schema"`
		Plugins []struct {
			PluginID string `json:"pluginId"`
			Name     string `json:"name"`
		} `json:"plugins"`
	}
	if err := json.Unmarshal(updatedRegistry, &root); err != nil {
		t.Fatal(err)
	}
	if root.Schema != 7 || len(root.Plugins) != 2 {
		t.Fatalf("unexpected installed registry: %s", updatedRegistry)
	}
	if root.Plugins[0].PluginID != "keep.me" || root.Plugins[1].PluginID != pluginID {
		t.Fatalf("unrelated registry entries were not preserved: %s", updatedRegistry)
	}

	leftovers, err := filepath.Glob(filepath.Join(pluginParent, ".*.backup.*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(leftovers) != 0 {
		t.Fatalf("transaction backups were not cleaned up: %v", leftovers)
	}
}

func TestInstallTransactionRejectsInvalidRegistryBeforeReplacement(t *testing.T) {
	appData := t.TempDir()
	pluginParent := filepath.Join(appData, "Adobe", "UXP", "Plugins", "External")
	registry := filepath.Join(appData, "Adobe", "UXP", "PluginsInfo", "v1", "PS.json")
	currentTarget := filepath.Join(pluginParent, pluginID)
	if err := os.MkdirAll(currentTarget, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(registry), 0o755); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(currentTarget, "do-not-replace")
	if err := os.WriteFile(marker, []byte("preserve"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(registry, []byte(`{"plugins":[`), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := installForCurrentUser(appData, nil); err == nil {
		t.Fatal("expected invalid registry to stop installation")
	}
	content, err := os.ReadFile(marker)
	if err != nil || string(content) != "preserve" {
		t.Fatalf("existing plug-in changed after preflight failure: %q, %v", content, err)
	}
}
