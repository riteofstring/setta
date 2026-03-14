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
	executablePath := strings.TrimSpace(options.ExecutablePath)
	if executablePath == "" {
		return nil, fmt.Errorf("launcher executable path is required")
	}
	resolvedExecutablePath, err := resolvePathLoose(executablePath)
	if err != nil {
		return nil, fmt.Errorf("resolve launcher executable path: %w", err)
	}

	now := options.Now
	if now == nil {
		now = time.Now
	}
	sleep := options.Sleep
	if sleep == nil {
		sleep = time.Sleep
	}
	launchTimeout := options.LaunchTimeout
	if launchTimeout <= 0 {
		launchTimeout = defaultLaunchTimeout
	}
	pollInterval := options.PollInterval
	if pollInterval <= 0 {
		pollInterval = defaultLaunchPollInterval
	}
	existingSessionWait := options.ExistingSessionWait
	if existingSessionWait <= 0 {
		existingSessionWait = defaultExistingSessionWait
	}
	connectTimeout := options.ConnectTimeout
	if connectTimeout <= 0 {
		connectTimeout = defaultConnectTimeout
	}
	processStarter := options.ProcessStarter
	if processStarter == nil {
		processStarter = startLauncherProcess
	}
	registryFactory := options.RegistryFactory
	if registryFactory == nil {
		registryFactory = func(sessionsRoot string) (*localsessions.Registry, error) {
			return localsessions.NewRegistry(localsessions.RegistryOptions{
				SessionsRoot: sessionsRoot,
			})
		}
	}
	openBrowser := options.OpenBrowser
	if openBrowser == nil {
		openBrowser = openLauncherBrowser
	}
	userHomeDir := options.UserHomeDir
	if userHomeDir == nil {
		userHomeDir = os.UserHomeDir
	}

	return &ArtifactLauncher{
		executablePath:      resolvedExecutablePath,
		env:                 append([]string(nil), options.Env...),
		now:                 now,
		sleep:               sleep,
		launchTimeout:       launchTimeout,
		pollInterval:        pollInterval,
		existingSessionWait: existingSessionWait,
		connectTimeout:      connectTimeout,
		processStarter:      processStarter,
		registryFactory:     registryFactory,
		openBrowser:         openBrowser,
		userHomeDir:         userHomeDir,
	}, nil
}

func (l *ArtifactLauncher) Launch(settaHome string) (ArtifactLaunchResult, error) {
	if l == nil {
		return ArtifactLaunchResult{}, fmt.Errorf("artifact launcher is required")
	}
	cfg, err := l.loadLauncherConfig(settaHome)
	if err != nil {
		return ArtifactLaunchResult{}, err
	}
	registry, err := l.registryFactory(filepath.Join(cfg.Paths.RuntimeRoot, "sessions"))
	if err != nil {
		return ArtifactLaunchResult{}, fmt.Errorf("create launcher session registry: %w", err)
	}

	matchingSessions, err := l.matchingLauncherSessions(registry, cfg.Paths)
	if err != nil {
		return ArtifactLaunchResult{}, err
	}
	if reused, ok := l.firstConnectableSession(matchingSessions); ok {
		return l.openSession(reused, cfg.Paths.SettaHome, false)
	}

	if len(matchingSessions) > 0 {
		deadline := l.now().Add(l.existingSessionWait)
		for l.now().Before(deadline) {
			if reused, ok := l.firstConnectableSession(matchingSessions); ok {
				return l.openSession(reused, cfg.Paths.SettaHome, false)
			}
			l.sleep(minDuration(l.pollInterval, time.Until(deadline)))
		}
	}

	process, err := l.processStarter(processStartRequest{
		Args:        l.buildLaunchArgs(cfg.Paths),
		Env:         l.launchEnv(),
		CWD:         cfg.Paths.WorkspaceRoot,
		RuntimeRoot: cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		return ArtifactLaunchResult{}, err
	}

	deadline := l.now().Add(l.launchTimeout)
	for {
		latestSessions, err := l.matchingLauncherSessions(registry, cfg.Paths)
		if err != nil {
			_ = process.Kill()
			return ArtifactLaunchResult{}, err
		}
		if reused, ok := l.firstConnectableSession(latestSessions); ok {
			return l.openSession(reused, cfg.Paths.SettaHome, true)
		}
		if process.Exited() {
			return ArtifactLaunchResult{}, fmt.Errorf("%s", launchFailureMessage(process.LogPath()))
		}
		if !l.now().Before(deadline) {
			_ = process.Kill()
			return ArtifactLaunchResult{}, fmt.Errorf("Timed out waiting for Setta launcher mode to start. Check logs at: %s", process.LogPath())
		}
		l.sleep(l.pollInterval)
	}
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
