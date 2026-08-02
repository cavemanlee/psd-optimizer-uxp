package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	pluginID         = "caveman.optimizer.uxp"
	pluginName       = "PSD Optimizer"
	pluginVersion    = "1.8.2"
	hostMinVersion   = "25.0.0"
	registryPathHint = `$localPlugins\External\` + pluginID
)

var photoshopYearPattern = regexp.MustCompile(`(?i)photoshop[^0-9]*(20[0-9]{2})`)

type pluginManifest struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Version string `json:"version"`
	Host    struct {
		App        string `json:"app"`
		MinVersion string `json:"minVersion"`
	} `json:"host"`
}

type photoshopInstall struct {
	Path   string
	Major  int
	Source string
}

type installTransaction struct {
	pluginParent   string
	target         string
	stage          string
	targetBackup   string
	registry       string
	registryTemp   string
	registryBackup string
	hadTarget      bool
	hadRegistry    bool
	targetPlaced   bool
	registryPlaced bool
	logger         func(string, ...any)
}

func majorFromVersionLabel(label string) int {
	label = strings.TrimSpace(label)
	for len(label) > 0 && (label[0] < '0' || label[0] > '9') {
		label = label[1:]
	}
	end := 0
	for end < len(label) && label[end] >= '0' && label[end] <= '9' {
		end++
	}
	if end == 0 {
		return 0
	}
	major, err := strconv.Atoi(label[:end])
	if err != nil || major < 1 || major > 999 {
		return 0
	}
	return major
}

func majorFromPhotoshopPath(path string) int {
	match := photoshopYearPattern.FindStringSubmatch(path)
	if len(match) != 2 {
		return 0
	}
	year, err := strconv.Atoi(match[1])
	if err != nil || year < 2024 {
		return 0
	}
	// Photoshop 2024 is version 25, 2025 is 26, and so on.
	return year - 1999
}

func mergePhotoshopInstalls(installs []photoshopInstall) []photoshopInstall {
	seen := make(map[string]int)
	out := make([]photoshopInstall, 0, len(installs))
	for _, install := range installs {
		install.Path = filepath.Clean(strings.TrimSpace(install.Path))
		if install.Path == "." || install.Path == "" {
			continue
		}
		key := strings.ToLower(install.Path)
		if index, ok := seen[key]; ok {
			if out[index].Major == 0 && install.Major > 0 {
				out[index].Major = install.Major
			}
			if !strings.Contains(out[index].Source, install.Source) && install.Source != "" {
				out[index].Source += ", " + install.Source
			}
			continue
		}
		seen[key] = len(out)
		out = append(out, install)
	}
	return out
}

func updatePluginRegistry(original []byte) ([]byte, error) {
	root := make(map[string]json.RawMessage)
	if len(bytes.TrimSpace(original)) > 0 {
		if err := json.Unmarshal(original, &root); err != nil {
			return nil, fmt.Errorf("Adobe plug-in registry is not valid JSON: %w", err)
		}
	}

	var existing []json.RawMessage
	if raw, ok := root["plugins"]; ok && len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, &existing); err != nil {
			return nil, fmt.Errorf("Adobe plug-in registry has an invalid plugins list: %w", err)
		}
	}

	filtered := make([]json.RawMessage, 0, len(existing)+1)
	for _, raw := range existing {
		var entry struct {
			PluginID string `json:"pluginId"`
		}
		if err := json.Unmarshal(raw, &entry); err != nil {
			return nil, fmt.Errorf("Adobe plug-in registry contains an invalid entry: %w", err)
		}
		if entry.PluginID == pluginID {
			continue
		}
		filtered = append(filtered, raw)
	}

	newEntry, err := json.Marshal(map[string]string{
		"hostMinVersion": hostMinVersion,
		"name":           pluginName,
		"path":           registryPathHint,
		"pluginId":       pluginID,
		"status":         "enabled",
		"type":           "uxp",
		"versionString":  pluginVersion,
	})
	if err != nil {
		return nil, err
	}
	filtered = append(filtered, newEntry)

	pluginsJSON, err := json.Marshal(filtered)
	if err != nil {
		return nil, err
	}
	root["plugins"] = pluginsJSON

	updated, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(updated, '\n'), nil
}

func extractAndVerifyPlugin(destination string) error {
	if destination == "" {
		return errors.New("empty staging destination")
	}
	if err := os.MkdirAll(destination, 0o755); err != nil {
		return fmt.Errorf("create staging folder: %w", err)
	}

	err := fs.WalkDir(pluginFiles, "plugin", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel("plugin", filepath.FromSlash(path))
		if err != nil {
			return err
		}
		if relative == "." {
			return nil
		}
		if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
			return fmt.Errorf("unsafe embedded path: %q", path)
		}
		target := filepath.Join(destination, relative)
		if entry.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("unsupported embedded file type: %q", path)
		}
		content, err := fs.ReadFile(pluginFiles, path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(target, content, 0o644); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("extract plug-in payload: %w", err)
	}
	return verifyPluginPayload(destination)
}

func verifyPluginPayload(destination string) error {
	if err := verifyPluginManifest(filepath.Join(destination, "manifest.json")); err != nil {
		return err
	}
	requiredFiles := []string{
		"index.html",
		"index.js",
		"styles.css",
		filepath.Join("icons", "panel-broom-dark.png"),
		filepath.Join("icons", "panel-broom-dark@1x.png"),
		filepath.Join("icons", "panel-broom-dark@2x.png"),
		filepath.Join("icons", "panel-broom-light.png"),
		filepath.Join("icons", "panel-broom-light@1x.png"),
		filepath.Join("icons", "panel-broom-light@2x.png"),
	}
	for _, relative := range requiredFiles {
		path := filepath.Join(destination, relative)
		info, err := os.Stat(path)
		if err != nil {
			return fmt.Errorf("required plug-in file %q is missing: %w", relative, err)
		}
		if !info.Mode().IsRegular() || info.Size() == 0 {
			return fmt.Errorf("required plug-in file %q is not a non-empty regular file", relative)
		}
	}
	return nil
}

func verifyPluginManifest(path string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read staged manifest: %w", err)
	}
	var manifest pluginManifest
	if err := json.Unmarshal(content, &manifest); err != nil {
		return fmt.Errorf("parse staged manifest: %w", err)
	}
	switch {
	case manifest.ID != pluginID:
		return fmt.Errorf("unexpected plug-in ID %q", manifest.ID)
	case manifest.Name != pluginName:
		return fmt.Errorf("unexpected plug-in name %q", manifest.Name)
	case manifest.Version != pluginVersion:
		return fmt.Errorf("unexpected plug-in version %q", manifest.Version)
	case !strings.EqualFold(manifest.Host.App, "PS"):
		return fmt.Errorf("unexpected host %q", manifest.Host.App)
	case manifest.Host.MinVersion != hostMinVersion:
		return fmt.Errorf("unexpected minimum Photoshop version %q", manifest.Host.MinVersion)
	default:
		return nil
	}
}

func isPathInside(parent, child string) bool {
	parentAbs, err := filepath.Abs(parent)
	if err != nil {
		return false
	}
	childAbs, err := filepath.Abs(child)
	if err != nil {
		return false
	}
	relative, err := filepath.Rel(parentAbs, childAbs)
	if err != nil {
		return false
	}
	return relative != "." &&
		relative != ".." &&
		!strings.HasPrefix(relative, ".."+string(filepath.Separator)) &&
		!filepath.IsAbs(relative)
}

func installForCurrentUser(appData string, logger func(string, ...any)) error {
	if !filepath.IsAbs(appData) {
		return errors.New("APPDATA is not an absolute path")
	}
	pluginParent := filepath.Join(appData, "Adobe", "UXP", "Plugins", "External")
	registry := filepath.Join(appData, "Adobe", "UXP", "PluginsInfo", "v1", "PS.json")
	return installIntoAdobePaths(pluginParent, registry, logger)
}

func installIntoAdobePaths(pluginParent, registry string, logger func(string, ...any)) error {
	if !filepath.IsAbs(pluginParent) || !filepath.IsAbs(registry) {
		return errors.New("Adobe installation paths must be absolute")
	}
	target := filepath.Join(pluginParent, pluginID)
	if !isPathInside(pluginParent, target) {
		return errors.New("refusing unsafe Adobe plug-in target path")
	}

	suffix := fmt.Sprintf("%s.%d", time.Now().UTC().Format("20060102T150405Z"), os.Getpid())
	transaction := &installTransaction{
		pluginParent:   pluginParent,
		target:         target,
		stage:          filepath.Join(pluginParent, "."+pluginID+".installing."+suffix),
		targetBackup:   filepath.Join(pluginParent, "."+pluginID+".backup."+suffix),
		registry:       registry,
		registryTemp:   registry + ".installing." + suffix,
		registryBackup: registry + ".backup." + suffix,
		logger:         logger,
	}
	if !isPathInside(pluginParent, transaction.stage) ||
		!isPathInside(pluginParent, transaction.targetBackup) {
		return errors.New("refusing unsafe transaction path")
	}

	if err := os.MkdirAll(pluginParent, 0o755); err != nil {
		return fmt.Errorf("create Adobe UXP plug-in folder: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(registry), 0o755); err != nil {
		return fmt.Errorf("create Adobe UXP registry folder: %w", err)
	}
	defer os.RemoveAll(transaction.stage)
	defer os.Remove(transaction.registryTemp)

	if err := extractAndVerifyPlugin(transaction.stage); err != nil {
		return err
	}
	transaction.log("staged and verified plug-in payload at %q", transaction.stage)

	var originalRegistry []byte
	registryOriginallyExisted := false
	if content, err := os.ReadFile(registry); err == nil {
		originalRegistry = content
		registryOriginallyExisted = true
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read Adobe plug-in registry: %w", err)
	}
	updatedRegistry, err := updatePluginRegistry(originalRegistry)
	if err != nil {
		return err
	}
	transaction.log("registering plug-in path %q in %q", registryPathHint, registry)
	if err := os.WriteFile(transaction.registryTemp, updatedRegistry, 0o644); err != nil {
		return fmt.Errorf("stage Adobe plug-in registry: %w", err)
	}
	if err := syncFile(transaction.registryTemp); err != nil {
		return fmt.Errorf("flush staged Adobe plug-in registry: %w", err)
	}

	if exists(target) {
		if err := os.Rename(target, transaction.targetBackup); err != nil {
			return fmt.Errorf("back up installed plug-in: %w", err)
		}
		transaction.hadTarget = true
		transaction.log("backed up existing plug-in to %q", transaction.targetBackup)
	}
	if err := os.Rename(transaction.stage, target); err != nil {
		transaction.rollback()
		return fmt.Errorf("activate new plug-in: %w", err)
	}
	transaction.targetPlaced = true

	if registryOriginallyExisted {
		currentRegistry, err := os.ReadFile(registry)
		if err != nil || !bytes.Equal(currentRegistry, originalRegistry) {
			transaction.rollback()
			return errors.New("Adobe plug-in registry changed during installation; no registry changes were applied")
		}
	} else if _, err := os.Stat(registry); !errors.Is(err, os.ErrNotExist) {
		transaction.rollback()
		return errors.New("Adobe plug-in registry appeared during installation; no registry changes were applied")
	}

	if exists(registry) {
		if err := os.Rename(registry, transaction.registryBackup); err != nil {
			transaction.rollback()
			return fmt.Errorf("back up Adobe plug-in registry: %w", err)
		}
		transaction.hadRegistry = true
	}
	if err := os.Rename(transaction.registryTemp, registry); err != nil {
		transaction.rollback()
		return fmt.Errorf("activate Adobe plug-in registry: %w", err)
	}
	transaction.registryPlaced = true

	if err := verifyPluginPayload(target); err != nil {
		transaction.rollback()
		return fmt.Errorf("post-install plug-in verification: %w", err)
	}
	installedRegistry, err := os.ReadFile(registry)
	if err != nil {
		transaction.rollback()
		return fmt.Errorf("post-install registry verification: %w", err)
	}
	recomputed, err := updatePluginRegistry(installedRegistry)
	if err != nil || !bytesEqualJSON(installedRegistry, recomputed) {
		transaction.rollback()
		if err != nil {
			return fmt.Errorf("post-install registry verification: %w", err)
		}
		return errors.New("post-install registry verification did not find the expected entry")
	}

	transaction.cleanupBackups()
	return nil
}

func (transaction *installTransaction) log(format string, values ...any) {
	if transaction.logger != nil {
		transaction.logger(format, values...)
	}
}

func (transaction *installTransaction) rollback() {
	transaction.log("rolling back installation transaction")
	if transaction.registryPlaced {
		_ = os.Remove(transaction.registry)
		transaction.registryPlaced = false
	}
	if transaction.hadRegistry && exists(transaction.registryBackup) {
		if err := os.Rename(transaction.registryBackup, transaction.registry); err != nil {
			transaction.log("registry rollback failed: %v", err)
		}
	}
	if transaction.targetPlaced {
		_ = os.RemoveAll(transaction.target)
		transaction.targetPlaced = false
	}
	if transaction.hadTarget && exists(transaction.targetBackup) {
		if err := os.Rename(transaction.targetBackup, transaction.target); err != nil {
			transaction.log("plug-in rollback failed: %v", err)
		}
	}
}

func (transaction *installTransaction) cleanupBackups() {
	if transaction.hadTarget {
		_ = os.RemoveAll(transaction.targetBackup)
	}
	if transaction.hadRegistry {
		_ = os.Remove(transaction.registryBackup)
	}
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func syncFile(path string) error {
	file, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return err
	}
	defer file.Close()
	return file.Sync()
}

func bytesEqualJSON(left, right []byte) bool {
	var a, b any
	if jsonErr := json.Unmarshal(left, &a); jsonErr != nil {
		return false
	}
	if jsonErr := json.Unmarshal(right, &b); jsonErr != nil {
		return false
	}
	return reflect.DeepEqual(a, b)
}
