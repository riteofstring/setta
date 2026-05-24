package settacmd

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"setta/internal/launcher"
)

func resolveLauncherServerExecutable(currentExecutable string, envLookup func(string) (string, bool)) (string, error) {
	if envLookup == nil {
		envLookup = os.LookupEnv
	}
	if rawOverride, ok := envLookup("SETTA_SERVER_BIN"); ok && strings.TrimSpace(rawOverride) != "" {
		return resolveRunnableExecutable(rawOverride)
	}

	candidateName := "setta-server"
	if runtime.GOOS == "windows" {
		candidateName = "setta-server.exe"
	}
	siblingCandidate := filepath.Join(filepath.Dir(currentExecutable), candidateName)
	if resolvedSibling, err := resolveRunnableExecutable(siblingCandidate); err == nil {
		return resolvedSibling, nil
	}
	if cwd, err := os.Getwd(); err == nil {
		if sourceCheckoutRoot, rootErr := resolveReloadSourceCheckoutRoot(cwd); rootErr == nil {
			sourceCheckoutCandidate := filepath.Join(sourceCheckoutRoot, "scripts", "run_setta_server.sh")
			if resolvedSourceCheckout, sourceErr := resolveRunnableExecutable(sourceCheckoutCandidate); sourceErr == nil {
				return resolvedSourceCheckout, nil
			}
		}
	}

	return "", fmt.Errorf(
		"Could not resolve the Setta server companion executable. Install %s alongside the setta binary or set SETTA_SERVER_BIN.",
		candidateName,
	)
}

func resolveRunnableExecutable(rawPath string) (string, error) {
	resolvedPath, err := resolveCLIPath(rawPath)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(resolvedPath)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", fmt.Errorf("executable path is a directory: %s", resolvedPath)
	}
	if runtime.GOOS != "windows" && info.Mode()&0o111 == 0 {
		return "", fmt.Errorf("executable path is not runnable: %s", resolvedPath)
	}
	return resolvedPath, nil
}

func resolveCLIPath(rawPath string) (string, error) {
	trimmedPath := strings.TrimSpace(rawPath)
	if trimmedPath == "" {
		return "", fmt.Errorf("missing path")
	}
	expandedPath := os.ExpandEnv(trimmedPath)
	if expandedPath == "~" || strings.HasPrefix(expandedPath, "~/") || strings.HasPrefix(expandedPath, "~\\") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home: %w", err)
		}
		suffix := strings.TrimPrefix(strings.TrimPrefix(expandedPath, "~"), string(os.PathSeparator))
		suffix = strings.TrimPrefix(strings.TrimPrefix(suffix, "/"), "\\")
		expandedPath = filepath.Join(homeDir, suffix)
	}
	if !filepath.IsAbs(expandedPath) {
		absolutePath, err := filepath.Abs(expandedPath)
		if err != nil {
			return "", fmt.Errorf("resolve path %q: %w", rawPath, err)
		}
		expandedPath = absolutePath
	}
	return filepath.Clean(expandedPath), nil
}

func openURLWithLauncherMode(rawURL string, requested launcher.LauncherOpenMode, stderr io.Writer) launcher.LauncherOpenMode {
	if requested == launcher.LauncherOpenModeChromeApp && openURLInChromeApp(rawURL) {
		return launcher.LauncherOpenModeChromeApp
	}
	command := []string{"xdg-open", rawURL}
	switch runtime.GOOS {
	case "darwin":
		command = []string{"open", rawURL}
	case "windows":
		command = []string{"rundll32", "url.dll,FileProtocolHandler", rawURL}
	}
	if err := exec.Command(command[0], command[1:]...).Run(); err != nil && stderr != nil {
		_, _ = fmt.Fprintf(stderr, "Failed to open browser automatically. Open manually: %s (%v)\n", rawURL, err)
	}
	return launcher.LauncherOpenModeBrowser
}

func openURLInChromeApp(rawURL string) bool {
	chromeFlag := "--app=" + strings.TrimSpace(rawURL)
	if runtime.GOOS == "darwin" {
		for _, appName := range []string{"Google Chrome", "Chromium"} {
			if launchMacOSChromeApp(appName, chromeFlag, false) {
				return true
			}
			if launchMacOSChromeApp(appName, chromeFlag, true) {
				return true
			}
		}
		return false
	}
	if runtime.GOOS == "windows" {
		for _, candidate := range windowsChromeCandidates() {
			if exec.Command(candidate, chromeFlag).Start() == nil {
				return true
			}
		}
		return false
	}
	for _, executableName := range []string{
		"google-chrome",
		"google-chrome-stable",
		"chromium",
		"chromium-browser",
		"microsoft-edge",
	} {
		located, err := exec.LookPath(executableName)
		if err != nil {
			continue
		}
		if exec.Command(located, chromeFlag).Start() == nil {
			return true
		}
	}
	return false
}

func launchMacOSChromeApp(appName string, chromeFlag string, forceNewInstance bool) bool {
	command := []string{"open"}
	if forceNewInstance {
		command = append(command, "-n")
	}
	command = append(command, "-a", appName, "--args", chromeFlag)
	if err := exec.Command(command[0], command[1:]...).Run(); err != nil {
		return false
	}
	for range 10 {
		if isMacOSChromeAppVisible(chromeFlag) {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

func isMacOSChromeAppVisible(chromeFlag string) bool {
	output, err := exec.Command("ps", "ax", "-o", "command=").Output()
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(output), "\n") {
		if isMacOSChromeProcessCommand(line, chromeFlag) {
			return true
		}
	}
	return false
}

func isMacOSChromeProcessCommand(command string, chromeFlag string) bool {
	if !strings.Contains(command, chromeFlag) {
		return false
	}
	strippedCommand := strings.TrimSpace(command)
	if strippedCommand == "" {
		return false
	}
	executableToken := strippedCommand
	if spaceIndex := strings.IndexAny(strippedCommand, " \t"); spaceIndex >= 0 {
		executableToken = strippedCommand[:spaceIndex]
	}
	if strings.EqualFold(filepath.Base(executableToken), "open") {
		return false
	}
	prefix := strings.TrimSpace(strings.SplitN(strippedCommand, chromeFlag, 2)[0])
	prefix = strings.ToLower(prefix)
	return strings.HasSuffix(prefix, "google chrome") || strings.HasSuffix(prefix, "chromium")
}

func windowsChromeCandidates() []string {
	candidates := make([]string, 0, 8)
	for _, envName := range []string{"LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)"} {
		root := strings.TrimSpace(os.Getenv(envName))
		if root == "" {
			continue
		}
		candidates = append(candidates,
			filepath.Join(root, "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
		)
	}
	for _, executableName := range []string{"chrome", "chrome.exe", "msedge", "msedge.exe"} {
		located, err := exec.LookPath(executableName)
		if err == nil {
			candidates = append(candidates, located)
		}
	}
	deduped := make([]string, 0, len(candidates))
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		if _, ok := seen[candidate]; ok {
			continue
		}
		seen[candidate] = struct{}{}
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			deduped = append(deduped, candidate)
		}
	}
	return deduped
}
