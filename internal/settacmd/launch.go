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

type launchPreparedExecution struct {
	resolvedInputs  resolvedLaunchInputs
	sessionLauncher launcher.IDEWorkspaceSessionLauncher
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
	parsed, err := parseLaunchFlags(args, stderr)
	if err != nil {
		return err
	}
	if !parsed.jsonOutput {
		return &ExitError{
			Code: 2,
			Err:  fmt.Errorf("use --json with launch"),
		}
	}

	payload, launchErr := buildLaunchJSONPayload(parsed, global, envLookup, cwd, deps)
	if launchErr != nil {
		return launchErr.emitJSON(stdout, stderr)
	}
	return writeJSONPayload(stdout, payload)
}

func parseLaunchFlags(args []string, stderr io.Writer) (launchFlags, error) {
	flags := flag.NewFlagSet("launch", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var parsed launchFlags
	configureLaunchFlags(flags, &parsed)
	if err := flags.Parse(args); err != nil {
		return launchFlags{}, err
	}
	if len(flags.Args()) != 0 {
		return launchFlags{}, fmt.Errorf("launch does not accept positional arguments")
	}
	return parsed, nil
}

func configureLaunchFlags(flags *flag.FlagSet, parsed *launchFlags) {
	flags.BoolVar(&parsed.jsonOutput, "json", false, "Emit JSON payload only.")
	flags.StringVar(&parsed.workspaceRoot, "workspace", "", "Workspace root.")
	flags.StringVar(&parsed.workspaceRoot, "w", "", "Workspace root.")
	flags.StringVar(&parsed.profile, "profile", "", "Runtime profile name.")
	flags.StringVar(&parsed.settaHome, "setta-home", "", "Setta home.")
	flags.StringVar(&parsed.settaFilesRoot, "setta-files-root", "", "Explicit setta_files root.")
	flags.StringVar(&parsed.settaFilesLocation, "setta-files-location", "", "setta_files location mode: auto, local, or global.")
	flags.StringVar(&parsed.runtimeRoot, "runtime-root", "", "Runtime root.")
	flags.Float64Var(&parsed.timeoutSeconds, "timeout", 30.0, "Seconds to wait for session startup.")
}

func buildLaunchJSONPayload(parsed launchFlags, global globalFlags, envLookup func(string) (string, bool), cwd string, deps launchDependencies) (map[string]any, *launchCommandError) {
	if parsed.timeoutSeconds <= 0 {
		return nil, badLaunchCommandRequest("--timeout must be greater than 0.")
	}

	prepared, launchErr := prepareLaunchExecution(parsed, global, envLookup, cwd, deps)
	if launchErr != nil {
		return nil, launchErr
	}
	launchResult, launchErr := ensureLaunchSession(prepared, global.profileLookupHome)
	if launchErr != nil {
		return nil, launchErr
	}
	bootstrapURLFragment, launchErr := buildLaunchBootstrapURLFragment(launchResult, deps)
	if launchErr != nil {
		return nil, launchErr
	}
	return launchPayload(launchResult, bootstrapURLFragment), nil
}

func prepareLaunchExecution(parsed launchFlags, global globalFlags, envLookup func(string) (string, bool), cwd string, deps launchDependencies) (launchPreparedExecution, *launchCommandError) {
	resolved, err := resolveLaunchInputs(parsed, global, cwd)
	if err != nil {
		return launchPreparedExecution{}, badLaunchCommandRequest(err.Error())
	}
	serverExecutable, launchErr := resolveLaunchServerExecutable(envLookup, deps)
	if launchErr != nil {
		return launchPreparedExecution{}, launchErr
	}
	sessionLauncher, err := deps.newSessionLauncher(serverExecutable, time.Duration(parsed.timeoutSeconds*float64(time.Second)))
	if err != nil {
		return launchPreparedExecution{}, internalLaunchCommandError(err.Error())
	}
	return launchPreparedExecution{
		resolvedInputs:  resolved,
		sessionLauncher: sessionLauncher,
	}, nil
}

func resolveLaunchServerExecutable(envLookup func(string) (string, bool), deps launchDependencies) (string, *launchCommandError) {
	currentExecutable, err := deps.resolveCurrentExecutable()
	if err != nil {
		return "", internalLaunchCommandError(fmt.Sprintf("resolve current executable: %v", err))
	}
	serverExecutable, err := deps.resolveServerExecutable(currentExecutable, envLookup)
	if err != nil {
		return "", launchFailedCommandError(err.Error())
	}
	return serverExecutable, nil
}

func ensureLaunchSession(prepared launchPreparedExecution, profileLookupHome string) (launcher.IDELaunchResult, *launchCommandError) {
	launchResult, err := prepared.sessionLauncher.EnsureSession(launcher.IDELaunchInput{
		WorkspaceRoot:      prepared.resolvedInputs.workspaceRoot,
		SettaHome:          prepared.resolvedInputs.settaHome,
		ProfileLookupHome:  strings.TrimSpace(profileLookupHome),
		Profile:            prepared.resolvedInputs.profile,
		SettaFilesRoot:     prepared.resolvedInputs.settaFilesRoot,
		SettaFilesLocation: prepared.resolvedInputs.settaFilesLocation,
		RuntimeRoot:        prepared.resolvedInputs.runtimeRoot,
		ServerMode:         config.ModeIDE,
	})
	if err != nil {
		var sessionLaunchErr *launcher.SessionLaunchError
		if errors.As(err, &sessionLaunchErr) {
			return launcher.IDELaunchResult{}, &launchCommandError{
				code:     sessionLaunchErr.Code,
				message:  sessionLaunchErr.Message,
				exitCode: 2,
			}
		}
		return launcher.IDELaunchResult{}, internalLaunchCommandError(err.Error())
	}
	return launchResult, nil
}

func buildLaunchBootstrapURLFragment(launchResult launcher.IDELaunchResult, deps launchDependencies) (string, *launchCommandError) {
	token, err := deps.mintBootstrapToken(launchResult.Session.ID, launchResult.Secret, deps.now().UTC())
	if err != nil {
		return "", internalLaunchCommandError(err.Error())
	}
	bootstrapURLFragment, err := launcher.BuildBootstrapURLFragment(launchResult.Session.Host, launchResult.Session.Port, token)
	if err != nil {
		return "", internalLaunchCommandError(err.Error())
	}
	return bootstrapURLFragment, nil
}

func launchPayload(launchResult launcher.IDELaunchResult, bootstrapURLFragment string) map[string]any {
	return map[string]any{
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

type launchCommandError struct {
	code     string
	message  string
	exitCode int
}

func (e *launchCommandError) emitJSON(stdout io.Writer, stderr io.Writer) error {
	if e == nil {
		return nil
	}
	return emitLaunchCommandError(stdout, stderr, true, e.code, e.message, e.exitCode)
}

func badLaunchCommandRequest(message string) *launchCommandError {
	return &launchCommandError{
		code:     "BadRequest",
		message:  message,
		exitCode: 2,
	}
}

func launchFailedCommandError(message string) *launchCommandError {
	return &launchCommandError{
		code:     "LaunchFailed",
		message:  message,
		exitCode: 2,
	}
}

func internalLaunchCommandError(message string) *launchCommandError {
	return &launchCommandError{
		code:     "InternalError",
		message:  message,
		exitCode: 1,
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
