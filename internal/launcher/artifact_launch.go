package launcher

import (
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/localsessions"
)

type BrowserOpenFunc func(string) error

type ArtifactLaunchResult struct {
	URL        string
	SessionID  string
	StartedNew bool
}

type ArtifactLaunchOptions struct {
	ExecutablePath      string
	Env                 []string
	Now                 func() time.Time
	Sleep               func(time.Duration)
	LaunchTimeout       time.Duration
	PollInterval        time.Duration
	ExistingSessionWait time.Duration
	ConnectTimeout      time.Duration
	ProcessStarter      func(processStartRequest) (startedProcess, error)
	RegistryFactory     func(string) (*localsessions.Registry, error)
	OpenBrowser         BrowserOpenFunc
	UserHomeDir         func() (string, error)
}

type ArtifactLauncher struct {
	executablePath      string
	env                 []string
	now                 func() time.Time
	sleep               func(time.Duration)
	launchTimeout       time.Duration
	pollInterval        time.Duration
	existingSessionWait time.Duration
	connectTimeout      time.Duration
	processStarter      func(processStartRequest) (startedProcess, error)
	registryFactory     func(string) (*localsessions.Registry, error)
	openBrowser         BrowserOpenFunc
	userHomeDir         func() (string, error)
}

func NewArtifactLauncher(options ArtifactLaunchOptions) (*ArtifactLauncher, error) {
	resolvedExecutablePath, err := resolveArtifactLaunchExecutablePath(options.ExecutablePath)
	if err != nil {
		return nil, err
	}

	return &ArtifactLauncher{
		executablePath:      resolvedExecutablePath,
		env:                 append([]string(nil), options.Env...),
		now:                 launcherNowOrDefault(options.Now),
		sleep:               launcherSleepOrDefault(options.Sleep),
		launchTimeout:       launcherDurationOrDefault(options.LaunchTimeout, defaultLaunchTimeout),
		pollInterval:        launcherDurationOrDefault(options.PollInterval, defaultLaunchPollInterval),
		existingSessionWait: launcherDurationOrDefault(options.ExistingSessionWait, defaultExistingSessionWait),
		connectTimeout:      launcherDurationOrDefault(options.ConnectTimeout, defaultConnectTimeout),
		processStarter:      artifactLaunchProcessStarterOrDefault(options.ProcessStarter),
		registryFactory:     artifactLaunchRegistryFactoryOrDefault(options.RegistryFactory),
		openBrowser:         artifactLaunchBrowserOpenerOrDefault(options.OpenBrowser),
		userHomeDir:         artifactLaunchUserHomeDirOrDefault(options.UserHomeDir),
	}, nil
}

func (l *ArtifactLauncher) Launch(settaHome string) (ArtifactLaunchResult, error) {
	if l == nil {
		return ArtifactLaunchResult{}, fmt.Errorf("artifact launcher is required")
	}
	paths, registry, err := l.prepareArtifactLaunch(settaHome)
	if err != nil {
		return ArtifactLaunchResult{}, err
	}
	if result, ok, err := l.reuseOrWaitForArtifactSession(paths, registry); err != nil || ok {
		return result, err
	}
	process, err := l.startArtifactSession(paths)
	if err != nil {
		return ArtifactLaunchResult{}, err
	}
	return l.waitForStartedArtifactSession(paths, registry, process)
}

func resolveArtifactLaunchExecutablePath(raw string) (string, error) {
	executablePath := strings.TrimSpace(raw)
	if executablePath == "" {
		return "", fmt.Errorf("launcher executable path is required")
	}
	resolvedExecutablePath, err := resolvePathLoose(executablePath)
	if err != nil {
		return "", fmt.Errorf("resolve launcher executable path: %w", err)
	}
	return resolvedExecutablePath, nil
}

func launcherNowOrDefault(now func() time.Time) func() time.Time {
	if now != nil {
		return now
	}
	return time.Now
}

func launcherSleepOrDefault(sleep func(time.Duration)) func(time.Duration) {
	if sleep != nil {
		return sleep
	}
	return time.Sleep
}

func launcherDurationOrDefault(value time.Duration, fallback time.Duration) time.Duration {
	if value > 0 {
		return value
	}
	return fallback
}

func artifactLaunchProcessStarterOrDefault(
	processStarter func(processStartRequest) (startedProcess, error),
) func(processStartRequest) (startedProcess, error) {
	if processStarter != nil {
		return processStarter
	}
	return startLauncherProcess
}

func artifactLaunchRegistryFactoryOrDefault(
	registryFactory func(string) (*localsessions.Registry, error),
) func(string) (*localsessions.Registry, error) {
	if registryFactory != nil {
		return registryFactory
	}
	return func(sessionsRoot string) (*localsessions.Registry, error) {
		return localsessions.NewRegistry(localsessions.RegistryOptions{
			SessionsRoot: sessionsRoot,
		})
	}
}

func artifactLaunchBrowserOpenerOrDefault(openBrowser BrowserOpenFunc) BrowserOpenFunc {
	if openBrowser != nil {
		return openBrowser
	}
	return openLauncherBrowser
}

func artifactLaunchUserHomeDirOrDefault(userHomeDir func() (string, error)) func() (string, error) {
	if userHomeDir != nil {
		return userHomeDir
	}
	return os.UserHomeDir
}

func (l *ArtifactLauncher) prepareArtifactLaunch(settaHome string) (config.Paths, *localsessions.Registry, error) {
	cfg, err := l.loadLauncherConfig(settaHome)
	if err != nil {
		return config.Paths{}, nil, err
	}
	registry, err := l.registryFactory(filepath.Join(cfg.Paths.RuntimeRoot, "sessions"))
	if err != nil {
		return config.Paths{}, nil, fmt.Errorf("create launcher session registry: %w", err)
	}
	return cfg.Paths, registry, nil
}

func (l *ArtifactLauncher) reuseOrWaitForArtifactSession(
	paths config.Paths,
	registry *localsessions.Registry,
) (ArtifactLaunchResult, bool, error) {
	matchingSessions, err := l.matchingLauncherSessions(registry, paths)
	if err != nil {
		return ArtifactLaunchResult{}, false, err
	}
	if result, ok, err := l.openFirstConnectableSession(matchingSessions, paths.SettaHome, false); err != nil || ok {
		return result, ok, err
	}
	if len(matchingSessions) == 0 {
		return ArtifactLaunchResult{}, false, nil
	}
	return l.waitForExistingArtifactSession(matchingSessions, paths.SettaHome)
}

func (l *ArtifactLauncher) openFirstConnectableSession(
	sessions []auth.SessionMetadata,
	settaHome string,
	startedNew bool,
) (ArtifactLaunchResult, bool, error) {
	reused, ok := l.firstConnectableSession(sessions)
	if !ok {
		return ArtifactLaunchResult{}, false, nil
	}
	result, err := l.openSession(reused, settaHome, startedNew)
	if err != nil {
		return ArtifactLaunchResult{}, false, err
	}
	return result, true, nil
}

func (l *ArtifactLauncher) waitForExistingArtifactSession(
	sessions []auth.SessionMetadata,
	settaHome string,
) (ArtifactLaunchResult, bool, error) {
	deadline := l.now().Add(l.existingSessionWait)
	for l.now().Before(deadline) {
		if result, ok, err := l.openFirstConnectableSession(sessions, settaHome, false); err != nil || ok {
			return result, ok, err
		}
		l.sleep(minDuration(l.pollInterval, time.Until(deadline)))
	}
	return ArtifactLaunchResult{}, false, nil
}

func (l *ArtifactLauncher) startArtifactSession(paths config.Paths) (startedProcess, error) {
	return l.processStarter(processStartRequest{
		Args:        l.buildLaunchArgs(paths),
		Env:         l.launchEnv(),
		CWD:         paths.WorkspaceRoot,
		RuntimeRoot: paths.RuntimeRoot,
	})
}

func (l *ArtifactLauncher) waitForStartedArtifactSession(
	paths config.Paths,
	registry *localsessions.Registry,
	process startedProcess,
) (ArtifactLaunchResult, error) {
	deadline := l.now().Add(l.launchTimeout)
	for {
		latestSessions, err := l.matchingLauncherSessions(registry, paths)
		if err != nil {
			_ = process.Kill()
			return ArtifactLaunchResult{}, err
		}
		if result, ok, err := l.openFirstConnectableSession(latestSessions, paths.SettaHome, true); err != nil || ok {
			return result, err
		}
		if err := l.waitForStartedArtifactProcess(process, deadline); err != nil {
			return ArtifactLaunchResult{}, err
		}
		l.sleep(l.pollInterval)
	}
}

func (l *ArtifactLauncher) waitForStartedArtifactProcess(process startedProcess, deadline time.Time) error {
	if process.Exited() {
		return fmt.Errorf("%s", launchFailureMessage(process.LogPath()))
	}
	if l.now().Before(deadline) {
		return nil
	}
	_ = process.Kill()
	return fmt.Errorf("Timed out waiting for Setta launcher mode to start. Check logs at: %s", process.LogPath())
}

func (l *ArtifactLauncher) loadLauncherConfig(settaHome string) (config.Config, error) {
	homeDir, err := l.userHomeDir()
	if err != nil {
		return config.Config{}, fmt.Errorf("resolve user home: %w", err)
	}
	baseConfig, err := config.Load(config.LoadOptions{
		CWD:       homeDir,
		EnvLookup: func(string) (string, bool) { return "", false },
		CLI: config.CLIOptions{
			WorkspaceRoot: homeDir,
			SettaHome:     strings.TrimSpace(settaHome),
			Host:          defaultLaunchHost,
			Port:          "0",
			Mode:          string(config.ModeLauncher),
		},
	})
	if err != nil {
		return config.Config{}, err
	}

	launcherSettaFilesRoot, err := resolveLauncherArtifactSettaFilesRoot(baseConfig.Paths.SettaHome)
	if err != nil {
		return config.Config{}, err
	}
	launcherRuntimeRoot, err := resolveLauncherArtifactRuntimeRoot(baseConfig.Paths.SettaHome)
	if err != nil {
		return config.Config{}, err
	}

	return config.Load(config.LoadOptions{
		CWD:       homeDir,
		EnvLookup: func(string) (string, bool) { return "", false },
		CLI: config.CLIOptions{
			WorkspaceRoot:  homeDir,
			SettaHome:      baseConfig.Paths.SettaHome,
			SettaFilesRoot: launcherSettaFilesRoot,
			RuntimeRoot:    launcherRuntimeRoot,
			Host:           defaultLaunchHost,
			Port:           "0",
			Mode:           string(config.ModeLauncher),
		},
	})
}

func (l *ArtifactLauncher) matchingLauncherSessions(registry *localsessions.Registry, paths config.Paths) ([]auth.SessionMetadata, error) {
	sessions, err := registry.FindSessionsByWorkspaceAndMode(paths.WorkspaceRoot, string(config.ModeLauncher))
	if err != nil {
		return nil, fmt.Errorf("Read launcher session registry: %v", err)
	}
	matches := make([]auth.SessionMetadata, 0, len(sessions))
	for _, session := range sessions {
		if sessionMatchesPaths(session, paths) {
			matches = append(matches, session)
		}
	}
	sort.Slice(matches, func(i int, j int) bool {
		return matches[i].StartedAt.After(matches[j].StartedAt)
	})
	return matches, nil
}

func (l *ArtifactLauncher) firstConnectableSession(sessions []auth.SessionMetadata) (auth.SessionMetadata, bool) {
	for _, session := range sessions {
		if sessionConnectable(session, l.connectTimeout) {
			return session, true
		}
	}
	return auth.SessionMetadata{}, false
}

func (l *ArtifactLauncher) buildLaunchArgs(paths config.Paths) []string {
	return []string{
		l.executablePath,
		"--no-open",
		"--host", defaultLaunchHost,
		"--port", "0",
		"--mode", string(config.ModeLauncher),
		"--workspace", paths.WorkspaceRoot,
		"--setta-home", paths.SettaHome,
		"--setta-files-root", paths.SettaFilesRoot,
		"--runtime-root", paths.RuntimeRoot,
	}
}

func (l *ArtifactLauncher) launchEnv() []string {
	baseEnv := l.env
	if len(baseEnv) == 0 {
		baseEnv = os.Environ()
	}
	filteredEnv := make([]string, 0, len(baseEnv))
	for _, entry := range baseEnv {
		key, _, found := strings.Cut(entry, "=")
		if !found {
			continue
		}
		switch key {
		case "SETTA_WORKSPACE_ROOT",
			"SETTA_HOME",
			"SETTA_PROFILE_LOOKUP_HOME",
			"SETTA_RUNTIME_ROOT",
			"SETTA_FILES_ROOT",
			"SETTA_FILES_LOCATION",
			"SETTA_PROFILE",
			"SETTA_SERVER_MODE",
			"SETTA_SESSION_ID",
			"SETTA_SESSIONS_ROOT":
			continue
		default:
			filteredEnv = append(filteredEnv, entry)
		}
	}
	return filteredEnv
}

func (l *ArtifactLauncher) openSession(session auth.SessionMetadata, settaHome string, startedNew bool) (ArtifactLaunchResult, error) {
	sessionURL, err := launcherSessionURL(session, settaHome)
	if err != nil {
		return ArtifactLaunchResult{}, err
	}
	if err := l.openBrowser(sessionURL); err != nil {
		return ArtifactLaunchResult{}, fmt.Errorf("Open launcher URL manually: %s (%v)", sessionURL, err)
	}
	return ArtifactLaunchResult{
		URL:        sessionURL,
		SessionID:  session.ID,
		StartedNew: startedNew,
	}, nil
}

func launcherSessionURL(session auth.SessionMetadata, settaHome string) (string, error) {
	host := strings.TrimSpace(session.Host)
	switch host {
	case "", "0.0.0.0":
		host = "127.0.0.1"
	case "::":
		host = "::1"
	}
	if host == "" || session.Port <= 0 {
		return "", fmt.Errorf("launcher session did not publish a usable host/port")
	}
	return (&url.URL{
		Scheme:   "http",
		Host:     fmt.Sprintf("%s:%d", host, session.Port),
		Path:     "/",
		RawQuery: url.Values{"setta_home": []string{settaHome}}.Encode(),
	}).String(), nil
}

func openLauncherBrowser(rawURL string) error {
	var command []string
	switch runtime.GOOS {
	case "darwin":
		command = []string{"open", rawURL}
	case "windows":
		command = []string{"rundll32", "url.dll,FileProtocolHandler", rawURL}
	default:
		command = []string{"xdg-open", rawURL}
	}
	cmd := exec.Command(command[0], command[1:]...)
	return cmd.Start()
}
