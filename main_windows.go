//go:build windows

package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"
)

const (
	mbOK              = 0x00000000
	mbOKCancel        = 0x00000001
	mbIconError       = 0x00000010
	mbIconQuestion    = 0x00000020
	mbIconInformation = 0x00000040
	mbSetForeground   = 0x00010000
	idOK              = 1

	keyRead       = 0x20019
	regSZ         = 1
	regExpandSZ   = 2
	errorNoMore   = 259
	vsFixedSig    = 0xFEEF04BD
	maxRegKeyName = 255
)

var (
	user32                    = syscall.NewLazyDLL("user32.dll")
	messageBoxW               = user32.NewProc("MessageBoxW")
	advapi32                  = syscall.NewLazyDLL("advapi32.dll")
	regOpenKeyExW             = advapi32.NewProc("RegOpenKeyExW")
	regEnumKeyExW             = advapi32.NewProc("RegEnumKeyExW")
	regQueryValueExW          = advapi32.NewProc("RegQueryValueExW")
	regCloseKey               = advapi32.NewProc("RegCloseKey")
	kernel32                  = syscall.NewLazyDLL("kernel32.dll")
	expandEnvironmentStringsW = kernel32.NewProc("ExpandEnvironmentStringsW")
	versionDLL                = syscall.NewLazyDLL("version.dll")
	getFileVersionInfoSizeW   = versionDLL.NewProc("GetFileVersionInfoSizeW")
	getFileVersionInfoW       = versionDLL.NewProc("GetFileVersionInfoW")
	installerLog              *os.File
)

func main() {
	initInstallerLog()
	defer func() {
		if recovered := recover(); recovered != nil {
			logf("panic: %v", recovered)
			showMessage("PSD Optimizer Setup", fmt.Sprintf(
				"安装器遇到意外错误，没有继续修改 Adobe 文件。\n\nInstaller error; no further Adobe files were modified.\n\n%v\n\n日志 / Log:\n%s",
				recovered, installerLogPath()), mbOK|mbIconError)
		}
		if installerLog != nil {
			_ = installerLog.Close()
		}
	}()

	logf("starting PSD Optimizer %s installer", pluginVersion)
	if photoshopIsRunning() {
		showPhotoshopRunning()
		return
	}

	installs := detectPhotoshopInstallations()
	if len(installs) == 0 {
		logf("no Photoshop installation found")
		showMessage("PSD Optimizer Setup",
			"没有检测到 Adobe Photoshop。\n\n"+
				"请先安装 Photoshop 2024 或更新版本（25.0+），然后重新运行此安装器。\n\n"+
				"Adobe Photoshop was not found. Install Photoshop 2024 or later (25.0+) and run this installer again.\n\n"+
				"日志 / Log:\n"+installerLogPath(),
			mbOK|mbIconError)
		return
	}

	compatible, incompatible := splitCompatibleInstalls(installs)
	if len(compatible) == 0 {
		logf("only incompatible Photoshop installations found")
		showMessage("PSD Optimizer Setup",
			"检测到的 Photoshop 版本低于 25.0，无法安装 PSD Optimizer。\n\n"+
				formatInstallations(incompatible)+
				"\n\n需要 Photoshop 2024 或更新版本。\nPhotoshop 2024 or later is required.",
			mbOK|mbIconError)
		return
	}

	appData := strings.TrimSpace(os.Getenv("APPDATA"))
	if appData == "" || !filepath.IsAbs(appData) {
		showMessage("PSD Optimizer Setup",
			"无法读取当前 Windows 用户的 APPDATA 目录，安装已取消。\n\nCannot locate the current user's APPDATA folder.",
			mbOK|mbIconError)
		return
	}
	installTarget := filepath.Join(appData, "Adobe", "UXP", "Plugins", "External", pluginID)
	message := fmt.Sprintf(
		"即将安装 %s %s\n\n检测到 / Detected:\n%s\n\n安装位置 / Install location:\n%s\n\n安装前请关闭 Photoshop。是否继续？\nClose Photoshop before installation. Continue?",
		pluginName, pluginVersion, formatInstallations(compatible), installTarget)
	if len(incompatible) > 0 {
		message += "\n\n以下旧版本不会使用此插件 / Older versions ignored:\n" + formatInstallations(incompatible)
	}
	if showMessage("PSD Optimizer Setup", message, mbOKCancel|mbIconQuestion) != idOK {
		logf("installation cancelled by user")
		return
	}

	if photoshopIsRunning() {
		showPhotoshopRunning()
		return
	}

	if err := installForCurrentUser(appData, logf); err != nil {
		logf("installation failed: %v", err)
		showMessage("PSD Optimizer Setup",
			fmt.Sprintf("安装失败，旧版本和 Adobe 注册信息已尽可能恢复。\n\nInstallation failed; previous files were restored where applicable.\n\n错误 / Error:\n%v\n\n日志 / Log:\n%s",
				err, installerLogPath()),
			mbOK|mbIconError)
		return
	}

	logf("installation completed successfully")
	showMessage("PSD Optimizer Setup",
		fmt.Sprintf("安装成功：%s %s\n\n插件位置 / Plug-in location:\n%s\n\n现在可以打开 Photoshop，然后选择：\n增效工具 / Plugins → PSD Optimizer → PSD Optimizer\n\n日志 / Log:\n%s",
			pluginName, pluginVersion, installTarget, installerLogPath()),
		mbOK|mbIconInformation)
}

func showMessage(title, message string, flags uintptr) int {
	titlePtr, _ := syscall.UTF16PtrFromString(title)
	messagePtr, _ := syscall.UTF16PtrFromString(message)
	result, _, _ := messageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(messagePtr)),
		uintptr(unsafe.Pointer(titlePtr)),
		flags|mbSetForeground,
	)
	return int(result)
}

func showPhotoshopRunning() {
	logf("Photoshop is running; installation stopped")
	showMessage("PSD Optimizer Setup",
		"Photoshop 正在运行。请关闭 Photoshop 后重新运行安装器。\n\nPhotoshop is running. Close it, then run this installer again.",
		mbOK|mbIconError)
}

func initInstallerLog() {
	path := installerLogPath()
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err == nil {
		installerLog = file
	}
}

func installerLogPath() string {
	return filepath.Join(os.TempDir(), "PSD-Optimizer-installer.log")
}

func logf(format string, values ...any) {
	if installerLog == nil {
		return
	}
	_, _ = fmt.Fprintf(installerLog, "%s  %s\n", time.Now().Format(time.RFC3339), fmt.Sprintf(format, values...))
	_ = installerLog.Sync()
}

func photoshopIsRunning() bool {
	output, err := exec.Command("tasklist.exe", "/FI", "IMAGENAME eq Photoshop.exe", "/NH").CombinedOutput()
	if err != nil {
		logf("tasklist check failed (continuing): %v", err)
		return false
	}
	return strings.Contains(strings.ToLower(string(output)), "photoshop.exe")
}

func detectPhotoshopInstallations() []photoshopInstall {
	var candidates []photoshopInstall
	hives := []syscall.Handle{
		syscall.Handle(0x80000002), // HKEY_LOCAL_MACHINE
		syscall.Handle(0x80000001), // HKEY_CURRENT_USER
	}
	adobeKeys := []string{
		`SOFTWARE\Adobe\Photoshop`,
		`SOFTWARE\WOW6432Node\Adobe\Photoshop`,
	}
	for _, hive := range hives {
		for _, baseKey := range adobeKeys {
			for _, subkey := range enumRegistrySubkeys(hive, baseKey) {
				value, ok := queryRegistryString(hive, baseKey+`\`+subkey, "ApplicationPath")
				if !ok {
					continue
				}
				path := photoshopExecutablePath(value)
				candidates = append(candidates, photoshopInstall{
					Path:   path,
					Major:  majorFromVersionLabel(subkey),
					Source: "Windows Registry",
				})
			}
		}
	}

	appPathsKeys := []string{
		`SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Photoshop.exe`,
		`SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\Photoshop.exe`,
	}
	for _, hive := range hives {
		for _, key := range appPathsKeys {
			if value, ok := queryRegistryString(hive, key, ""); ok {
				candidates = append(candidates, photoshopInstall{
					Path:   photoshopExecutablePath(value),
					Source: "Windows App Paths",
				})
			}
		}
	}

	for _, root := range []string{os.Getenv("ProgramFiles"), os.Getenv("ProgramW6432"), os.Getenv("ProgramFiles(x86)")} {
		if strings.TrimSpace(root) == "" {
			continue
		}
		pattern := filepath.Join(root, "Adobe", "Adobe Photoshop*", "Photoshop.exe")
		matches, _ := filepath.Glob(pattern)
		for _, match := range matches {
			candidates = append(candidates, photoshopInstall{
				Path:   match,
				Major:  majorFromPhotoshopPath(match),
				Source: "Adobe program folder",
			})
		}
	}

	candidates = mergePhotoshopInstalls(candidates)
	valid := candidates[:0]
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate.Path); err != nil || info.IsDir() {
			logf("ignoring missing Photoshop candidate: %s", candidate.Path)
			continue
		}
		if major, err := fileMajorVersion(candidate.Path); err == nil && major > 0 {
			candidate.Major = major
		} else if candidate.Major == 0 {
			candidate.Major = majorFromPhotoshopPath(candidate.Path)
		}
		logf("detected Photoshop path=%q major=%d source=%s", candidate.Path, candidate.Major, candidate.Source)
		valid = append(valid, candidate)
	}
	sort.Slice(valid, func(i, j int) bool {
		if valid[i].Major != valid[j].Major {
			return valid[i].Major > valid[j].Major
		}
		return strings.ToLower(valid[i].Path) < strings.ToLower(valid[j].Path)
	})
	return valid
}

func photoshopExecutablePath(value string) string {
	value = expandWindowsEnvironment(strings.Trim(strings.TrimSpace(value), `"`))
	if strings.EqualFold(filepath.Ext(value), ".exe") {
		return filepath.Clean(value)
	}
	return filepath.Join(value, "Photoshop.exe")
}

func splitCompatibleInstalls(installs []photoshopInstall) (compatible, incompatible []photoshopInstall) {
	for _, install := range installs {
		// An unknown file version is accepted here because manifest.json still
		// enforces host minVersion=25.0.0 inside Photoshop.
		if install.Major == 0 || install.Major >= 25 {
			compatible = append(compatible, install)
		} else {
			incompatible = append(incompatible, install)
		}
	}
	return compatible, incompatible
}

func formatInstallations(installs []photoshopInstall) string {
	lines := make([]string, 0, len(installs))
	for _, install := range installs {
		version := "version unknown"
		if install.Major > 0 {
			version = fmt.Sprintf("v%d", install.Major)
		}
		lines = append(lines, fmt.Sprintf("• %s\n  %s", version, install.Path))
	}
	return strings.Join(lines, "\n")
}

func enumRegistrySubkeys(root syscall.Handle, path string) []string {
	handle, err := openRegistryKey(root, path)
	if err != nil {
		return nil
	}
	defer regCloseKey.Call(uintptr(handle))

	var names []string
	for index := uint32(0); ; index++ {
		buffer := make([]uint16, maxRegKeyName+1)
		length := uint32(maxRegKeyName)
		result, _, _ := regEnumKeyExW.Call(
			uintptr(handle),
			uintptr(index),
			uintptr(unsafe.Pointer(&buffer[0])),
			uintptr(unsafe.Pointer(&length)),
			0, 0, 0, 0,
		)
		if result == errorNoMore {
			break
		}
		if result != 0 {
			logf("RegEnumKeyExW failed for %q: code %d", path, result)
			break
		}
		names = append(names, string(utf16.Decode(buffer[:length])))
	}
	return names
}

func openRegistryKey(root syscall.Handle, path string) (syscall.Handle, error) {
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, err
	}
	var handle syscall.Handle
	result, _, _ := regOpenKeyExW.Call(
		uintptr(root),
		uintptr(unsafe.Pointer(pathPtr)),
		0,
		keyRead,
		uintptr(unsafe.Pointer(&handle)),
	)
	if result != 0 {
		return 0, syscall.Errno(result)
	}
	return handle, nil
}

func queryRegistryString(root syscall.Handle, path, valueName string) (string, bool) {
	handle, err := openRegistryKey(root, path)
	if err != nil {
		return "", false
	}
	defer regCloseKey.Call(uintptr(handle))

	var valuePtr *uint16
	if valueName != "" {
		valuePtr, err = syscall.UTF16PtrFromString(valueName)
		if err != nil {
			return "", false
		}
	}
	var valueType uint32
	var size uint32
	result, _, _ := regQueryValueExW.Call(
		uintptr(handle),
		uintptr(unsafe.Pointer(valuePtr)),
		0,
		uintptr(unsafe.Pointer(&valueType)),
		0,
		uintptr(unsafe.Pointer(&size)),
	)
	if result != 0 || (valueType != regSZ && valueType != regExpandSZ) || size < 2 {
		return "", false
	}
	buffer := make([]uint16, (size+1)/2)
	result, _, _ = regQueryValueExW.Call(
		uintptr(handle),
		uintptr(unsafe.Pointer(valuePtr)),
		0,
		uintptr(unsafe.Pointer(&valueType)),
		uintptr(unsafe.Pointer(&buffer[0])),
		uintptr(unsafe.Pointer(&size)),
	)
	if result != 0 {
		return "", false
	}
	length := 0
	for length < len(buffer) && buffer[length] != 0 {
		length++
	}
	value := string(utf16.Decode(buffer[:length]))
	if valueType == regExpandSZ {
		value = expandWindowsEnvironment(value)
	}
	return value, value != ""
}

func expandWindowsEnvironment(value string) string {
	valuePtr, err := syscall.UTF16PtrFromString(value)
	if err != nil {
		return value
	}
	required, _, _ := expandEnvironmentStringsW.Call(
		uintptr(unsafe.Pointer(valuePtr)), 0, 0,
	)
	if required == 0 {
		return value
	}
	buffer := make([]uint16, required)
	written, _, _ := expandEnvironmentStringsW.Call(
		uintptr(unsafe.Pointer(valuePtr)),
		uintptr(unsafe.Pointer(&buffer[0])),
		uintptr(len(buffer)),
	)
	if written == 0 || written > uintptr(len(buffer)) {
		return value
	}
	length := int(written)
	if length > 0 && buffer[length-1] == 0 {
		length--
	}
	return string(utf16.Decode(buffer[:length]))
}

func fileMajorVersion(path string) (int, error) {
	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, err
	}
	var ignored uint32
	size, _, callErr := getFileVersionInfoSizeW.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&ignored)),
	)
	if size == 0 {
		return 0, callErr
	}
	buffer := make([]byte, size)
	ok, _, callErr := getFileVersionInfoW.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		0,
		size,
		uintptr(unsafe.Pointer(&buffer[0])),
	)
	if ok == 0 {
		return 0, callErr
	}
	// VS_FIXEDFILEINFO is DWORD-aligned inside the version resource. Locate
	// its documented signature and read dwFileVersionMS without retaining a
	// pointer returned by the Windows API.
	for offset := 0; offset+16 <= len(buffer); offset++ {
		if binary.LittleEndian.Uint32(buffer[offset:offset+4]) != vsFixedSig {
			continue
		}
		return int(binary.LittleEndian.Uint32(buffer[offset+8:offset+12]) >> 16), nil
	}
	return 0, errors.New("file version information is missing VS_FIXEDFILEINFO")
}
