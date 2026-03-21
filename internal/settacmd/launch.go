package settacmd

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/launcher"
)

const defaultLaunchBootstrapTTL = 10 * time.Minute

type launchFlags struct {
	jsonOutput         bool
	workspaceRoot      string
	profile            string
	settaHome          string
	settaFilesRoot     string
	settaFilesLocation string
	runtimeRoot        string
	timeoutSeconds     float64
}

type launchDependencies struct {
	resolveCurrentExecutable func() (string, error)
	resolveServerExecutable  func(string, func(string) (string, bool)) (string, error)
	newSessionLauncher       func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error)
	now                      func() time.Time
	mintBootstrapToken       func(string, []byte, time.Time) (string, error)
}

type launchSessionPayload struct {
	ID                     string    `json:"id"`
	WorkspacePath          string    `json:"workspacePath"`
	WorkspacePathCanonical string    `json:"workspacePathCanonical"`
	Host                   string    `json:"host"`
	Port                   int       `json:"port"`
	PID                    int       `json:"pid"`
	StartedAt              time.Time `json:"startedAt"`
	ServerMode             string    `json:"serverMode"`
}

func runLaunch(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	return runLaunchWithDeps(args, global, stdout, stderr, envLookup, cwd, defaultLaunchDependencies())
}

func runLaunchWithDeps(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string, deps launchDependencies) error {
	flags := flag.NewFlagSet("launch", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var parsed launchFlags
	flags.BoolVar(&parsed.jsonOutput, "json", false, "Emit JSON payload only.")
	flags.StringVar(&parsed.workspaceRoot, "workspace", "", "Workspace root.")
	flags.StringVar(&parsed.workspaceRoot, "w", "", "Workspace root.")
	flags.StringVar(&parsed.profile, "profile", "", "Runtime profile name.")
	flags.StringVar(&parsed.settaHome, "setta-home", "", "Setta home.")
	flags.StringVar(&parsed.settaFilesRoot, "setta-files-root", "", "Explicit setta_files root.")
	flags.StringVar(&parsed.settaFilesLocation, "setta-files-location", "", "setta_files location mode: auto, local, or global.")
	flags.StringVar(&parsed.runtimeRoot, "runtime-root", "", "Runtime root.")
	flags.Float64Var(&parsed.timeoutSeconds, "timeout", 30.0, "Seconds to wait for session startup.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("launch does not accept positional arguments")
	}
	if !parsed.jsonOutput {
		return &ExitError{
			Code: 2,
			Err:  fmt.Errorf("use --json with launch"),
		}
	}
	if parsed.timeoutSeconds <= 0 {
		return emitLaunchCommandError(stdout, stderr, parsed.jsonOutput, "BadRequest", "--timeout must be greater than 0.", 2)
	}

	resolved, err := resolveLaunchInputs(parsed, global, cwd)
	if err != nil {
		return emitLaunchCommandError(stdout, stderr, parsed.jsonOutput, "BadRequest", err.Error(), 2)
	}

	currentExecutable, err := deps.resolveCurrentExecutable()
	if err != nil {
		return emitLaunchCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", fmt.Sprintf("resolve current executable: %v", err), 1)
	}
	serverExecutable, err := deps.resolveServerExecutable(currentExecutable, envLookup)
	if err != nil {
		return emitLaunchCommandError(stdout, stderr, parsed.jsonOutput, "LaunchFailed", err.Error(), 2)
	}

	sessionLauncher, err := deps.newSessionLauncher(serverExecutable, time.Duration(parsed.timeoutSeconds*float64(time.Second)))
	if err != nil {
		return emitLaunchCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", err.Error(), 1)
	}

	launchResult, err := sessionLauncher.EnsureSession(launcher.IDELaunchInput{
		WorkspaceRoot:      resolved.workspaceRoot,
		SettaHome:          resolved.settaHome,
		ProfileLookupHome:  strings.TrimSpace(global.profileLookupHome),
		Profile:            resolved.profile,
		SettaFilesRoot:     resolved.settaFilesRoot,
		SettaFilesLocation: resolved.settaFilesLocation,
		RuntimeRoot:        resolved.runtimeRoot,
		ServerMode:         config.ModeIDE,
	})
	if err != nil {
		var sessionLaunchErr *launcher.SessionLaunchError
		if errors.As(err, &sessionLaunchErr) {
			return emitLaunchCommandError(stdout, stderr, parsed.jsonOutput, sessionLaunchErr.Code, sessionLaunchErr.Message, 2)
		}
		return emitLaunchCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", err.Error(), 1)
	}

	token, err := deps.mintBootstrapToken(launchResult.Session.ID, launchResult.Secret, deps.now().UTC())
	if err != nil {
		return emitLaunchCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", err.Error(), 1)
	}
	bootstrapURLFragment, err := launcher.BuildBootstrapURLFragment(launchResult.Session.Host, launchResult.Session.Port, token)
	if err != nil {
		return emitLaunchCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", err.Error(), 1)
	}

	payload := map[string]any{
		"ok":                   true,
		"bootstrapUrlFragment": bootstrapURLFragment,
		"workspaceRoot":        launchResult.Paths.WorkspaceRoot,
		"settaFilesLocation":   launchSettaFilesLocationPayload(launchResult.Paths),
		"settaFilesRoot":       launchResult.Paths.SettaFilesRoot,
		"runtimeRoot":          launchResult.Paths.RuntimeRoot,
		"settaHome":            launchResult.Paths.SettaHome,
		"profile":              launchOptionalStringPayload(launchResult.Paths.ProfileName),
		"sessionId":            launchResult.Session.ID,
		"startedNew":           launchResult.StartedNew,
		"session":              launchSessionPayloadFromSession(launchResult.Session),
	}
	return writeJSONPayload(stdout, payload)
}

func defaultLaunchDependencies() launchDependencies {
	tokenManager := auth.NewBootstrapTokenManager(defaultLaunchBootstrapTTL, auth.NewNonceTracker())
	return launchDependencies{
		resolveCurrentExecutable: os.Executable,
		resolveServerExecutable:  resolveLauncherServerExecutable,
		newSessionLauncher: func(serverExecutable string, launchTimeout time.Duration) (launcher.IDEWorkspaceSessionLauncher, error) {
			return launcher.NewLocalIDESessionLauncher(launcher.LocalIDESessionLauncherOptions{
				ExecutablePath: serverExecutable,
				LaunchTimeout:  launchTimeout,
			})
		},
		now:                time.Now,
		mintBootstrapToken: tokenManager.Mint,
	}
}

type resolvedLaunchInputs struct {
	workspaceRoot      string
	profile            string
	settaHome          string
	settaFilesRoot     string
	settaFilesLocation *string
	runtimeRoot        string
}

func resolveLaunchInputs(parsed launchFlags, global globalFlags, cwd string) (resolvedLaunchInputs, error) {
	workspaceRoot, err := mergeLaunchPathOption(parsed.workspaceRoot, global.workspaceRoot, "--workspace", cwd)
	if err != nil {
		return resolvedLaunchInputs{}, err
	}
	if strings.TrimSpace(workspaceRoot) == "" {
		workspaceRoot = filepath.Clean(cwd)
	}
	profile, err := mergeLaunchTextOption(parsed.profile, global.profile, "--profile")
	if err != nil {
		return resolvedLaunchInputs{}, err
	}
	settaHome, err := mergeLaunchPathOption(parsed.settaHome, global.settaHome, "--setta-home", cwd)
	if err != nil {
		return resolvedLaunchInputs{}, err
	}
	settaFilesRoot, err := mergeLaunchPathOption(parsed.settaFilesRoot, global.settaFilesRoot, "--setta-files-root", cwd)
	if err != nil {
		return resolvedLaunchInputs{}, err
	}
	runtimeRoot, err := mergeLaunchPathOption(parsed.runtimeRoot, global.runtimeRoot, "--runtime-root", cwd)
	if err != nil {
		return resolvedLaunchInputs{}, err
	}
	settaFilesLocation, err := mergeLaunchLocationOption(parsed.settaFilesLocation, global.settaFilesLocation)
	if err != nil {
		return resolvedLaunchInputs{}, err
	}

	return resolvedLaunchInputs{
		workspaceRoot:      workspaceRoot,
		profile:            profile,
		settaHome:          settaHome,
		settaFilesRoot:     settaFilesRoot,
		settaFilesLocation: settaFilesLocation,
		runtimeRoot:        runtimeRoot,
	}, nil
}

func mergeLaunchTextOption(subcommandValue string, globalValue string, label string) (string, error) {
	subcommandTrimmed := strings.TrimSpace(subcommandValue)
	globalTrimmed := strings.TrimSpace(globalValue)
	if subcommandTrimmed == "" {
		return globalTrimmed, nil
	}
	if globalTrimmed == "" {
		return subcommandTrimmed, nil
	}
	if subcommandTrimmed != globalTrimmed {
		return "", fmt.Errorf("Conflicting %s provided at both the global CLI level and the launch subcommand.", label)
	}
	return subcommandTrimmed, nil
}

func mergeLaunchLocationOption(subcommandValue string, globalValue string) (*string, error) {
	subcommandTrimmed := strings.ToLower(strings.TrimSpace(subcommandValue))
	globalTrimmed := strings.ToLower(strings.TrimSpace(globalValue))
	if subcommandTrimmed == "" {
		if globalTrimmed == "" {
			return nil, nil
		}
		return &globalTrimmed, nil
	}
	if globalTrimmed == "" {
		return &subcommandTrimmed, nil
	}
	if subcommandTrimmed != globalTrimmed {
		return nil, fmt.Errorf("Conflicting --setta-files-location provided at both the global CLI level and the launch subcommand.")
	}
	return &subcommandTrimmed, nil
}

func mergeLaunchPathOption(subcommandValue string, globalValue string, label string, cwd string) (string, error) {
	subcommandTrimmed := strings.TrimSpace(subcommandValue)
	globalTrimmed := strings.TrimSpace(globalValue)
	if subcommandTrimmed == "" {
		return globalTrimmed, nil
	}
	if globalTrimmed == "" {
		return subcommandTrimmed, nil
	}
	subcommandResolved, err := normalizeLaunchComparisonPath(subcommandTrimmed, cwd)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", label, err)
	}
	globalResolved, err := normalizeLaunchComparisonPath(globalTrimmed, cwd)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", label, err)
	}
	if subcommandResolved != globalResolved {
		return "", fmt.Errorf("Conflicting %s provided at both the global CLI level and the launch subcommand.", label)
	}
	return subcommandTrimmed, nil
}

func normalizeLaunchComparisonPath(raw string, cwd string) (string, error) {
	trimmedPath := strings.TrimSpace(raw)
	if trimmedPath == "" {
		return "", nil
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
		expandedPath = filepath.Join(cwd, expandedPath)
	}
	return filepath.Clean(expandedPath), nil
}

func launchSettaFilesLocationPayload(paths config.Paths) any {
	if paths.UsesExplicitSettaFiles {
		return nil
	}
	return string(paths.ResolvedFilesLocation)
}

func launchOptionalStringPayload(value string) any {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return trimmed
}

func launchSessionPayloadFromSession(session auth.SessionMetadata) launchSessionPayload {
	return launchSessionPayload{
		ID:                     session.ID,
		WorkspacePath:          session.WorkspacePath,
		WorkspacePathCanonical: session.WorkspacePathCanonical,
		Host:                   session.Host,
		Port:                   session.Port,
		PID:                    session.PID,
		StartedAt:              session.StartedAt,
		ServerMode:             session.ServerMode,
	}
}

func emitLaunchCommandError(stdout io.Writer, stderr io.Writer, jsonOutput bool, code string, message string, exitCode int) error {
	if jsonOutput {
		if err := writeJSONPayload(stdout, map[string]any{
			"ok": false,
			"error": map[string]any{
				"code":    code,
				"message": message,
			},
		}); err != nil {
			return err
		}
		return &ExitError{Code: exitCode, Silent: true}
	}
	fmt.Fprintf(stderr, "Error: %s\n", message)
	return &ExitError{Code: exitCode, Silent: true}
}
