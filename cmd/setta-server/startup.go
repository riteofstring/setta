package main

import (
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"setta/internal/app"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/deployments"
)

const (
	defaultLocalStartBootstrapTTL = 10 * time.Minute
	defaultManualTunnelPort       = 61000
)

type localStartupDependencies struct {
	now                func() time.Time
	mintBootstrapToken func(string, []byte, time.Time) (string, error)
	openBrowser        func(string) error
	envLookup          func(string) (string, bool)
	stdinIsTTY         func() bool
	hasGUI             func(func(string) (string, bool)) bool
}

type deploymentStartupDependencies struct {
	loadManifest func(string) (deployments.Manifest, error)
	openBrowser  func(string) error
	envLookup    func(string) (string, bool)
	stdinIsTTY   func() bool
	hasGUI       func(func(string) (string, bool)) bool
}

type shareStartupDependencies = deploymentStartupDependencies
type appStartupDependencies = deploymentStartupDependencies

func emitLocalStartupOutput(cfg config.Config, localSession *localProcessSession, noOpen bool, stdout io.Writer, stderr io.Writer, deps localStartupDependencies) error {
	if localSession == nil {
		return nil
	}
	deps = withLocalStartupDefaults(deps)
	bootstrapOutput, err := prepareLocalStartupOutput(localSession, deps)
	if err != nil {
		return err
	}
	autoOpen := maybeAutoOpenBootstrapURL(noOpen, deps, bootstrapOutput.fragmentURL, stderr)

	message := renderLocalStartupMessage(
		localSession.metadata,
		cfg.Paths.WorkspaceRoot,
		bootstrapOutput.fragmentURL,
		bootstrapOutput.plainURL,
		bootstrapOutput.token,
		autoOpen,
		isSSHSession(deps.envLookup),
	)
	if stdout == nil {
		return nil
	}
	_, err = fmt.Fprintln(stdout, message)
	return err
}

type preparedLocalStartupOutput struct {
	token       string
	fragmentURL string
	plainURL    string
}

func withLocalStartupDefaults(deps localStartupDependencies) localStartupDependencies {
	if deps.now == nil {
		deps.now = time.Now
	}
	if deps.mintBootstrapToken == nil {
		tokenManager := auth.NewBootstrapTokenManager(defaultLocalStartBootstrapTTL, auth.NewNonceTracker())
		deps.mintBootstrapToken = tokenManager.Mint
	}
	if deps.openBrowser == nil {
		deps.openBrowser = openBrowserURL
	}
	if deps.envLookup == nil {
		deps.envLookup = os.LookupEnv
	}
	if deps.stdinIsTTY == nil {
		deps.stdinIsTTY = stdinIsTTY
	}
	if deps.hasGUI == nil {
		deps.hasGUI = processHasGUI
	}
	return deps
}

func prepareLocalStartupOutput(localSession *localProcessSession, deps localStartupDependencies) (preparedLocalStartupOutput, error) {
	token, err := deps.mintBootstrapToken(localSession.metadata.ID, localSession.secret, deps.now().UTC())
	if err != nil {
		return preparedLocalStartupOutput{}, fmt.Errorf("mint bootstrap token: %w", err)
	}
	bootstrapURLFragment, bootstrapURLPlain, err := buildBootstrapURLs(localSession.metadata.Host, localSession.metadata.Port, token)
	if err != nil {
		return preparedLocalStartupOutput{}, fmt.Errorf("build bootstrap urls: %w", err)
	}
	return preparedLocalStartupOutput{
		token:       token,
		fragmentURL: bootstrapURLFragment,
		plainURL:    bootstrapURLPlain,
	}, nil
}

func maybeAutoOpenBootstrapURL(noOpen bool, deps localStartupDependencies, bootstrapURL string, stderr io.Writer) bool {
	if !shouldAutoOpenLocalStart(noOpen, deps.envLookup, deps.stdinIsTTY, deps.hasGUI) {
		return false
	}
	if err := deps.openBrowser(bootstrapURL); err != nil {
		if stderr != nil {
			_, _ = fmt.Fprintf(stderr, "Failed to open browser automatically. Open manually: %s (%v)\n", bootstrapURL, err)
		}
		return false
	}
	return true
}

func shouldAutoOpenLocalStart(noOpen bool, envLookup func(string) (string, bool), stdinIsTTY func() bool, hasGUI func(func(string) (string, bool)) bool) bool {
	if noOpen {
		return false
	}
	if stdinIsTTY == nil || !stdinIsTTY() {
		return false
	}
	if isSSHSession(envLookup) {
		return false
	}
	if hasGUI == nil || !hasGUI(envLookup) {
		return false
	}
	return true
}

func stdinIsTTY() bool {
	info, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return info.Mode()&os.ModeCharDevice != 0
}

func processHasGUI(envLookup func(string) (string, bool)) bool {
	if runtime.GOOS == "darwin" || runtime.GOOS == "windows" {
		return true
	}
	if envLookup == nil {
		envLookup = os.LookupEnv
	}
	if value, ok := envLookup("DISPLAY"); ok && strings.TrimSpace(value) != "" {
		return true
	}
	if value, ok := envLookup("WAYLAND_DISPLAY"); ok && strings.TrimSpace(value) != "" {
		return true
	}
	return false
}

func emitShareStartupOutput(cfg config.Config, listener net.Listener, noOpen bool, stdout io.Writer, stderr io.Writer, deps shareStartupDependencies) error {
	return emitRegisteredDeploymentStartupOutput(cfg, listener, noOpen, stdout, stderr, deps, string(config.ModeShare))
}

func emitAppStartupOutput(cfg config.Config, listener net.Listener, noOpen bool, stdout io.Writer, stderr io.Writer, deps appStartupDependencies) error {
	return emitRegisteredDeploymentStartupOutput(cfg, listener, noOpen, stdout, stderr, deps, string(config.ModeApp))
}

func emitRegisteredDeploymentStartupOutput(cfg config.Config, listener net.Listener, noOpen bool, stdout io.Writer, stderr io.Writer, deps deploymentStartupDependencies, modeName string) error {
	typeRegistry, err := app.NewDeploymentTypeRegistry(cfg)
	if err != nil {
		return err
	}
	return emitDeploymentStartupOutput(cfg, listener, noOpen, stdout, stderr, deps, typeRegistry, modeName)
}

func emitDeploymentStartupOutput(cfg config.Config, listener net.Listener, noOpen bool, stdout io.Writer, stderr io.Writer, deps deploymentStartupDependencies, typeRegistry *deployments.TypeRegistry, modeName string) error {
	if listener == nil {
		return fmt.Errorf("%s listener is required", modeName)
	}
	deps = withDeploymentStartupDefaults(deps)
	registration, manifest, deploymentURL, err := prepareDeploymentStartup(cfg, listener, deps, typeRegistry, modeName)
	if err != nil {
		return err
	}
	warnIfPublicDeploymentHost(stderr, registration.Startup.ModeName, cfg.Server.Host)
	maybeAutoOpenDeploymentURL(noOpen, deps, deploymentURL, stderr)
	return writeDeploymentStartupMessage(stdout, registration, manifest, deploymentURL)
}

func withDeploymentStartupDefaults(deps deploymentStartupDependencies) deploymentStartupDependencies {
	if deps.loadManifest == nil {
		deps.loadManifest = deployments.LoadManifest
	}
	if deps.openBrowser == nil {
		deps.openBrowser = openBrowserURL
	}
	if deps.envLookup == nil {
		deps.envLookup = os.LookupEnv
	}
	if deps.stdinIsTTY == nil {
		deps.stdinIsTTY = stdinIsTTY
	}
	if deps.hasGUI == nil {
		deps.hasGUI = processHasGUI
	}
	return deps
}

func prepareDeploymentStartup(cfg config.Config, listener net.Listener, deps deploymentStartupDependencies, typeRegistry *deployments.TypeRegistry, modeName string) (deployments.TypeRegistration, deployments.Manifest, string, error) {
	manifest, err := deps.loadManifest(cfg.Paths.DeploymentRoot)
	if err != nil {
		return deployments.TypeRegistration{}, deployments.Manifest{}, "", err
	}
	registration, err := typeRegistry.ResolveStartupRegistration(modeName, manifest)
	if err != nil {
		return deployments.TypeRegistration{}, deployments.Manifest{}, "", err
	}
	deploymentURL, err := buildDeploymentURL(cfg.Server.Host, listener, registration.Startup.ModeName)
	if err != nil {
		return deployments.TypeRegistration{}, deployments.Manifest{}, "", err
	}
	return registration, manifest, deploymentURL, nil
}

func warnIfPublicDeploymentHost(stderr io.Writer, modeName string, host string) {
	if isLoopbackHost(host) || stderr == nil {
		return
	}
	_, _ = fmt.Fprintf(
		stderr,
		"WARNING: %s mode disables auth. Binding to %q may expose your deployment publicly.\n",
		modeName,
		host,
	)
}

func maybeAutoOpenDeploymentURL(noOpen bool, deps deploymentStartupDependencies, deploymentURL string, stderr io.Writer) {
	if !shouldAutoOpenLocalStart(noOpen, deps.envLookup, deps.stdinIsTTY, deps.hasGUI) {
		return
	}
	if err := deps.openBrowser(deploymentURL); err != nil && stderr != nil {
		_, _ = fmt.Fprintf(stderr, "Failed to open browser automatically. Open manually: %s (%v)\n", deploymentURL, err)
	}
}

func writeDeploymentStartupMessage(stdout io.Writer, registration deployments.TypeRegistration, manifest deployments.Manifest, deploymentURL string) error {
	if stdout == nil {
		return nil
	}
	_, err := fmt.Fprintf(
		stdout,
		"Starting %s backend for %s/%s\n%s: %s\n",
		registration.Startup.ModeName,
		manifest.DeploymentName,
		manifest.DeploymentVersion,
		registration.Startup.URLLabel,
		deploymentURL,
	)
	return err
}

func buildDeploymentURL(host string, listener net.Listener, modeName string) (string, error) {
	trimmedHost := strings.TrimSpace(host)
	if trimmedHost == "" {
		return "", fmt.Errorf("%s host is required", modeName)
	}
	tcpAddr, ok := listener.Addr().(*net.TCPAddr)
	if !ok || tcpAddr == nil {
		return "", fmt.Errorf("%s listener must be tcp", modeName)
	}
	if tcpAddr.Port <= 0 {
		return "", fmt.Errorf("%s listener port must be positive", modeName)
	}
	return "http://" + net.JoinHostPort(trimmedHost, strconv.Itoa(tcpAddr.Port)), nil
}

func isLoopbackHost(host string) bool {
	normalizedHost := strings.ToLower(strings.TrimSpace(host))
	return normalizedHost == "127.0.0.1" || normalizedHost == "localhost" || normalizedHost == "::1"
}

func isSSHSession(envLookup func(string) (string, bool)) bool {
	if envLookup == nil {
		envLookup = os.LookupEnv
	}
	if value, ok := envLookup("SSH_CONNECTION"); ok && strings.TrimSpace(value) != "" {
		return true
	}
	if value, ok := envLookup("SSH_TTY"); ok && strings.TrimSpace(value) != "" {
		return true
	}
	return false
}

func buildBootstrapURLs(host string, port int, token string) (string, string, error) {
	normalizedHost := formatHostForURL(host)
	if normalizedHost == "" {
		return "", "", fmt.Errorf("bootstrap host is required")
	}
	if port <= 0 {
		return "", "", fmt.Errorf("bootstrap port must be positive")
	}
	trimmedToken := strings.TrimSpace(token)
	if trimmedToken == "" {
		return "", "", fmt.Errorf("bootstrap token is required")
	}

	baseURL := "http://" + net.JoinHostPort(normalizedHost, strconv.Itoa(port)) + "/__setta__/bootstrap"
	return baseURL + "#token=" + trimmedToken, baseURL, nil
}

func formatHostForURL(host string) string {
	trimmed := strings.TrimSpace(host)
	switch trimmed {
	case "0.0.0.0":
		trimmed = "127.0.0.1"
	case "::":
		trimmed = "::1"
	}
	return trimmed
}

func formatHostForSSHTunnel(host string) string {
	trimmed := strings.TrimSpace(host)
	switch trimmed {
	case "0.0.0.0":
		trimmed = "127.0.0.1"
	case "::":
		trimmed = "::1"
	}
	return trimmed
}

func renderLocalStartupMessage(session auth.SessionMetadata, workspaceRoot string, bootstrapURLFragment string, bootstrapURLPlain string, token string, autoOpen bool, isRemoteSession bool) string {
	workspacePath := strings.TrimSpace(session.WorkspacePathCanonical)
	if workspacePath == "" {
		workspacePath = strings.TrimSpace(workspaceRoot)
	}

	lines := []string{
		fmt.Sprintf("Setta running (session %s)", session.ID),
		fmt.Sprintf("Bind: %s", formatBindHint(session.Host, session.Port)),
	}
	if autoOpen {
		lines = append(lines, "Opening browser to:", "  "+bootstrapURLFragment)
		return strings.Join(lines, "\n")
	}

	if !isRemoteSession {
		lines = append(
			lines,
			"",
			"Bootstrap URL (recommended):",
			"  "+bootstrapURLFragment,
			"",
			"Manual token entry:",
			"  "+bootstrapURLPlain,
			"  Token: "+token,
		)
		return strings.Join(lines, "\n")
	}

	lines = append(
		lines,
		"",
		"From your laptop (Setta installed):",
		"  setta connect <user@host> --workspace "+shellQuote(workspacePath)+" --session "+session.ID,
		"",
		"Manual tunnel (no local Setta install):",
		fmt.Sprintf("  LOCAL_PORT=%d", defaultManualTunnelPort),
		"  "+buildSSHTunnelCommand(session.Host, session.Port),
		"  Open in browser (recommended):",
		fmt.Sprintf("    http://127.0.0.1:${LOCAL_PORT}/__setta__/bootstrap#token=%s", token),
		"  Manual token entry:",
		"    http://127.0.0.1:${LOCAL_PORT}/__setta__/bootstrap",
		"    and paste: "+token,
		"  Tip: set LOCAL_PORT to change the local port.",
		"  macOS: open URL | Linux: xdg-open URL | Windows: start URL | Python: python -m webbrowser URL",
	)
	return strings.Join(lines, "\n")
}

func formatBindHint(host string, port int) string {
	bindHost := strings.TrimSpace(host)
	if bindHost == "" {
		bindHost = "127.0.0.1"
	}
	label := net.JoinHostPort(bindHost, strconv.Itoa(port))
	if bindHost == "127.0.0.1" || bindHost == "::1" {
		return label + " (remote only)"
	}
	return label
}

func buildSSHTunnelCommand(host string, port int) string {
	return fmt.Sprintf(
		"ssh -N -L ${LOCAL_PORT}:%s <user@host> -o ExitOnForwardFailure=yes",
		net.JoinHostPort(formatHostForSSHTunnel(host), strconv.Itoa(port)),
	)
}

func shellQuote(value string) string {
	if value == "" {
		return "''"
	}
	if !strings.ContainsAny(value, " \t\n'\"\\$`!&*()[]{}<>?|;") {
		return value
	}
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func openBrowserURL(rawURL string) error {
	command := []string{"xdg-open", rawURL}
	switch runtime.GOOS {
	case "darwin":
		command = []string{"open", rawURL}
	case "windows":
		command = []string{"rundll32", "url.dll,FileProtocolHandler", rawURL}
	}
	return exec.Command(command[0], command[1:]...).Start()
}
