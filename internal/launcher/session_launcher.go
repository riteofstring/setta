package launcher

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/localsessions"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

const (
	defaultLaunchHost                  = "127.0.0.1"
	defaultLaunchTimeout               = 30 * time.Second
	defaultLaunchPollInterval          = 200 * time.Millisecond
	defaultExistingSessionWait         = 2 * time.Second
	defaultExistingSessionExtendedWait = 10 * time.Second
	defaultExistingSessionRecentAge    = 15 * time.Second
	defaultConnectTimeout              = 250 * time.Millisecond
)

type SessionLaunchError struct {
	Code    string
	Message string
}

func (e *SessionLaunchError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type IDELaunchInput struct {
	WorkspaceRoot      string
	SettaHome          string
	ProfileLookupHome  string
	Profile            string
	SettaFilesRoot     string
	SettaFilesLocation *string
	RuntimeRoot        string
	ServerMode         config.Mode
}

type IDELaunchResult struct {
	Session    auth.SessionMetadata
	Secret     []byte
	Paths      config.Paths
	StartedNew bool
}

type LocalIDESessionLauncherOptions struct {
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
}

type LocalIDESessionLauncher struct {
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
}

type processStartRequest struct {
	Args        []string
	Env         []string
	CWD         string
	RuntimeRoot string
}

type startedProcess interface {
	Exited() bool
	Kill() error
	LogPath() string
}

type invalidRuntimeRootError struct {
	message string
}

func (e *invalidRuntimeRootError) Error() string {
	if e == nil {
		return ""
	}
	return e.message
}

func NewLocalIDESessionLauncher(options LocalIDESessionLauncherOptions) (*LocalIDESessionLauncher, error) {
	executablePath := strings.TrimSpace(options.ExecutablePath)
	if executablePath == "" {
		return nil, fmt.Errorf("launcher executable path is required")
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

	return &LocalIDESessionLauncher{
		executablePath:      executablePath,
		env:                 append([]string(nil), options.Env...),
		now:                 now,
		sleep:               sleep,
		launchTimeout:       launchTimeout,
		pollInterval:        pollInterval,
		existingSessionWait: existingSessionWait,
		connectTimeout:      connectTimeout,
		processStarter:      processStarter,
		registryFactory:     registryFactory,
	}, nil
}

func (l *LocalIDESessionLauncher) EnsureSession(input IDELaunchInput) (IDELaunchResult, error) {
	targetConfig, err := loadIDELaunchConfig(input)
	if err != nil {
		return IDELaunchResult{}, err
	}
	serverMode := effectiveLaunchMode(input.ServerMode)
	registry, err := l.registryFactory(filepath.Join(targetConfig.Paths.RuntimeRoot, "sessions"))
	if err != nil {
		return IDELaunchResult{}, &SessionLaunchError{
			Code:    "LaunchFailed",
			Message: fmt.Sprintf("Create session registry: %v", err),
		}
	}

	matchingSessions, err := l.matchingSessions(registry, targetConfig.Paths, serverMode)
	if err != nil {
		return IDELaunchResult{}, err
	}
	if reused, ok := l.firstConnectableSession(matchingSessions); ok {
		secret, err := registry.LoadSecret(reused)
		if err != nil {
			return IDELaunchResult{}, &SessionLaunchError{
				Code:    "LaunchFailed",
				Message: fmt.Sprintf("Load session secret: %v", err),
			}
		}
		return IDELaunchResult{
			Session:    reused,
			Secret:     secret,
			Paths:      targetConfig.Paths,
			StartedNew: false,
		}, nil
	}

	if len(matchingSessions) > 0 {
		deadline := l.now().Add(existingSessionWaitWindow(
			matchingSessions[0],
			l.now(),
			l.launchTimeout,
			l.existingSessionWait,
		))
		for l.now().Before(deadline) {
			if reused, ok := l.firstConnectableSession(matchingSessions); ok {
				secret, err := registry.LoadSecret(reused)
				if err != nil {
					return IDELaunchResult{}, &SessionLaunchError{
						Code:    "LaunchFailed",
						Message: fmt.Sprintf("Load session secret: %v", err),
					}
				}
				return IDELaunchResult{
					Session:    reused,
					Secret:     secret,
					Paths:      targetConfig.Paths,
					StartedNew: false,
				}, nil
			}
			l.sleep(minDuration(l.pollInterval, time.Until(deadline)))
		}
	}

	if err := ensureSettingsProjectLaunchPreflight(targetConfig.Paths); err != nil {
		return IDELaunchResult{}, err
	}

	process, err := l.processStarter(processStartRequest{
		Args:        l.buildLaunchArgs(input),
		Env:         l.launchEnv(),
		CWD:         targetConfig.Paths.WorkspaceRoot,
		RuntimeRoot: targetConfig.Paths.RuntimeRoot,
	})
	if err != nil {
		var invalidRuntimeErr *invalidRuntimeRootError
		if errors.As(err, &invalidRuntimeErr) {
			return IDELaunchResult{}, &SessionLaunchError{
				Code:    "InvalidRuntimeRoot",
				Message: err.Error(),
			}
		}
		return IDELaunchResult{}, &SessionLaunchError{
			Code:    "LaunchFailed",
			Message: err.Error(),
		}
	}

	deadline := l.now().Add(l.launchTimeout)
	for {
		latestMatchingSessions, err := l.matchingSessions(registry, targetConfig.Paths, serverMode)
		if err != nil {
			_ = process.Kill()
			return IDELaunchResult{}, err
		}
		if reused, ok := l.firstConnectableSession(latestMatchingSessions); ok {
			secret, err := registry.LoadSecret(reused)
			if err != nil {
				_ = process.Kill()
				return IDELaunchResult{}, &SessionLaunchError{
					Code:    "LaunchFailed",
					Message: fmt.Sprintf("Load session secret: %v", err),
				}
			}
			return IDELaunchResult{
				Session:    reused,
				Secret:     secret,
				Paths:      targetConfig.Paths,
				StartedNew: true,
			}, nil
		}

		if process.Exited() {
			return IDELaunchResult{}, &SessionLaunchError{
				Code:    "LaunchFailed",
				Message: launchFailureMessage(process.LogPath()),
			}
		}
		if !l.now().Before(deadline) {
			_ = process.Kill()
			return IDELaunchResult{}, &SessionLaunchError{
				Code:    "LaunchTimeout",
				Message: fmt.Sprintf("Timed out waiting for Setta to launch. Check logs at: %s", process.LogPath()),
			}
		}
		l.sleep(l.pollInterval)
	}
}

func ensureSettingsProjectLaunchPreflight(paths config.Paths) error {
	projectPaths, err := projectstate.ResolvePaths(paths.SettaFilesRoot)
	if err != nil {
		return nil
	}
	if _, err := os.Stat(projectPaths.Settings); err != nil {
		return nil
	}

	store, err := projectstate.NewStore(projectPaths.Settings, projectstate.StoreOptions{})
	if err != nil {
		return nil
	}
	document, err := store.Load(context.Background())
	if err != nil {
		return nil
	}
	if err := settingsstate.ValidatePersistedSettingsProjectDocument(document); err != nil {
		var missingSectionErr settingsstate.MissingSettingsSectionError
		if errors.As(err, &missingSectionErr) {
			return &SessionLaunchError{
				Code: "OutdatedProjectSettings",
				Message: fmt.Sprintf(
					"This workspace uses an older Setta settings/project format (missing settings section %s). Please migrate the project metadata and try again.",
					missingSectionErr.SectionName,
				),
			}
		}
	}
	return nil
}

func (l *LocalIDESessionLauncher) matchingSessions(registry *localsessions.Registry, paths config.Paths, mode config.Mode) ([]auth.SessionMetadata, error) {
	sessions, err := registry.FindSessionsByWorkspaceAndMode(paths.WorkspaceRoot, string(mode))
	if err != nil {
		return nil, &SessionLaunchError{
			Code:    "LaunchFailed",
			Message: fmt.Sprintf("Read session registry: %v", err),
		}
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

func (l *LocalIDESessionLauncher) firstConnectableSession(sessions []auth.SessionMetadata) (auth.SessionMetadata, bool) {
	for _, session := range sessions {
		if sessionConnectable(session, l.connectTimeout) {
			return session, true
		}
	}
	return auth.SessionMetadata{}, false
}

func existingSessionWaitWindow(session auth.SessionMetadata, now time.Time, timeout time.Duration, base time.Duration) time.Duration {
	baseWait := minDuration(base, timeout)
	if session.PID <= 0 {
		return baseWait
	}
	if session.StartedAt.IsZero() {
		return baseWait
	}
	age := now.Sub(session.StartedAt)
	if age < 0 || age > defaultExistingSessionRecentAge {
		return baseWait
	}
	return minDuration(timeout, defaultExistingSessionExtendedWait)
}

func (l *LocalIDESessionLauncher) buildLaunchArgs(input IDELaunchInput) []string {
	mode := effectiveLaunchMode(input.ServerMode)
	args := []string{
		l.executablePath,
		"--no-open",
		"--host", defaultLaunchHost,
		"--port", "0",
		"--mode", string(mode),
		"--workspace", input.WorkspaceRoot,
	}
	profile := strings.TrimSpace(input.Profile)
	if profile == "" && strings.TrimSpace(input.SettaHome) != "" {
		args = append(args, "--setta-home", input.SettaHome)
	}
	if profile != "" {
		args = append(args, "--profile", profile)
	}
	if strings.TrimSpace(input.ProfileLookupHome) != "" {
		args = append(args, "--profile-lookup-home", input.ProfileLookupHome)
	}
	if strings.TrimSpace(input.SettaFilesRoot) != "" {
		args = append(args, "--setta-files-root", input.SettaFilesRoot)
	} else if input.SettaFilesLocation != nil && strings.TrimSpace(*input.SettaFilesLocation) != "" {
		args = append(args, "--setta-files-location", strings.TrimSpace(*input.SettaFilesLocation))
	}
	if strings.TrimSpace(input.RuntimeRoot) != "" {
		args = append(args, "--runtime-root", input.RuntimeRoot)
	}
	return args
}

func (l *LocalIDESessionLauncher) launchEnv() []string {
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
			"SETTA_AUTH_COOKIE_NAME",
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

func loadIDELaunchConfig(input IDELaunchInput) (config.Config, error) {
	mode := effectiveLaunchMode(input.ServerMode)
	settaHome := input.SettaHome
	if strings.TrimSpace(input.Profile) != "" && strings.TrimSpace(input.ProfileLookupHome) != "" {
		settaHome = ""
	}
	cli := config.CLIOptions{
		WorkspaceRoot:     input.WorkspaceRoot,
		SettaHome:         settaHome,
		ProfileLookupHome: input.ProfileLookupHome,
		Profile:           input.Profile,
		RuntimeRoot:       input.RuntimeRoot,
		Host:              defaultLaunchHost,
		Port:              "0",
		Mode:              string(mode),
	}
	if strings.TrimSpace(input.SettaFilesRoot) != "" {
		cli.SettaFilesRoot = input.SettaFilesRoot
	} else if input.SettaFilesLocation != nil && strings.TrimSpace(*input.SettaFilesLocation) != "" {
		cli.SettaFilesLocation = strings.TrimSpace(*input.SettaFilesLocation)
	}

	cfg, err := config.Load(config.LoadOptions{
		CWD:       input.WorkspaceRoot,
		EnvLookup: func(string) (string, bool) { return "", false },
		CLI:       cli,
	})
	if err != nil {
		code := "BadRequest"
		var configErr *config.ConfigError
		if errors.As(err, &configErr) {
			code = configErr.Code
		}
		return config.Config{}, &SessionLaunchError{
			Code:    code,
			Message: err.Error(),
		}
	}
	return cfg, nil
}

func effectiveLaunchMode(mode config.Mode) config.Mode {
	if mode == "" {
		return config.ModeIDE
	}
	return mode
}

func sessionMatchesPaths(session auth.SessionMetadata, paths config.Paths) bool {
	return strings.TrimSpace(session.Profile) == strings.TrimSpace(paths.ProfileName) &&
		normalizeMatchPath(session.SettaHome) == normalizeMatchPath(paths.SettaHome) &&
		normalizeMatchPath(session.SettaFilesRoot) == normalizeMatchPath(paths.SettaFilesRoot) &&
		normalizeMatchPath(session.RuntimeRoot) == normalizeMatchPath(paths.RuntimeRoot) &&
		strings.TrimSpace(session.SettaFilesLocation) == strings.TrimSpace(paths.ActiveSettaFilesLocation())
}

func normalizeMatchPath(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	normalized, err := resolvePathLoose(trimmed)
	if err != nil {
		return trimmed
	}
	return normalized
}

func sessionConnectable(session auth.SessionMetadata, timeout time.Duration) bool {
	host := strings.TrimSpace(session.Host)
	switch host {
	case "", "0.0.0.0":
		host = "127.0.0.1"
	case "::":
		host = "::1"
	}
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, strconv.Itoa(session.Port)), timeout)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

type execStartedProcess struct {
	cmd     *exec.Cmd
	logPath string
	exited  atomic.Bool
}

func (p *execStartedProcess) Exited() bool {
	if p == nil {
		return true
	}
	return p.exited.Load()
}

func (p *execStartedProcess) Kill() error {
	if p == nil || p.cmd == nil || p.cmd.Process == nil {
		return nil
	}
	return killStartedProcessTree(p.cmd)
}

func (p *execStartedProcess) LogPath() string {
	if p == nil {
		return ""
	}
	return p.logPath
}

func startLauncherProcess(request processStartRequest) (startedProcess, error) {
	logDir := filepath.Join(request.RuntimeRoot, "logs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, &invalidRuntimeRootError{
			message: fmt.Sprintf("failed to initialize runtime logs directory: %s: %v", logDir, err),
		}
	}
	logFile, err := os.CreateTemp(logDir, "launch-*.log")
	if err != nil {
		return nil, &invalidRuntimeRootError{
			message: fmt.Sprintf("failed to create launch log file in %s: %v", logDir, err),
		}
	}
	logPath := logFile.Name()

	cmd := exec.Command(request.Args[0], request.Args[1:]...)
	configureStartedProcessTree(cmd)
	cmd.Env = request.Env
	cmd.Dir = request.CWD
	cmd.Stdin = nil
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	if err := cmd.Start(); err != nil {
		_ = logFile.Close()
		return nil, fmt.Errorf("failed to start Setta. Check logs at: %s", logPath)
	}
	if err := logFile.Close(); err != nil {
		return nil, fmt.Errorf("close launch log file: %w", err)
	}

	process := &execStartedProcess{
		cmd:     cmd,
		logPath: logPath,
	}
	go func() {
		_ = cmd.Wait()
		process.exited.Store(true)
	}()
	return process, nil
}

func launchFailureMessage(logPath string) string {
	logTail := readLogTail(logPath, 8000)
	if strings.TrimSpace(logTail) == "" {
		return fmt.Sprintf("Setta exited before session startup completed. Check logs at: %s", logPath)
	}
	return fmt.Sprintf("%s\n\nCheck logs at: %s", logTail, logPath)
}

func readLogTail(path string, maxBytes int64) string {
	handle, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer handle.Close()

	if _, err := handle.Seek(0, io.SeekEnd); err != nil {
		return ""
	}
	size, err := handle.Seek(0, io.SeekCurrent)
	if err != nil {
		return ""
	}
	if size > maxBytes {
		if _, err := handle.Seek(size-maxBytes, io.SeekStart); err != nil {
			return ""
		}
	} else if _, err := handle.Seek(0, io.SeekStart); err != nil {
		return ""
	}
	content, err := io.ReadAll(handle)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(content))
}

func minDuration(left time.Duration, right time.Duration) time.Duration {
	if left <= 0 {
		return right
	}
	if right <= 0 {
		return left
	}
	if left < right {
		return left
	}
	return right
}
