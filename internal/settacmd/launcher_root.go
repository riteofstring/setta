package settacmd

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"strings"
	"time"

	"setta/internal/config"
	"setta/internal/launcher"
)

func runLauncher(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	return runLauncherWithDeps(args, global, stdout, stderr, envLookup, cwd, defaultLauncherRootDependencies())
}

func runLauncherWithDeps(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string, deps launcherRootDependencies) error {
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return runLauncherRoot(args, global, stdout, stderr, envLookup, cwd, deps)
	}

	switch args[0] {
	case "setup":
		return runLauncherSetup(args[1:], global, stdout, stderr, envLookup, cwd)
	case "status":
		return runLauncherStatus(args[1:], global, stdout, stderr, envLookup, cwd)
	case "repair":
		return runLauncherRepair(args[1:], global, stdout, stderr, envLookup, cwd)
	case "remove":
		return runLauncherRemove(args[1:], global, stdout, stderr, envLookup, cwd)
	case "update":
		return runLauncherUpdate(args[1:], global, stdout, stderr, envLookup, cwd)
	default:
		return fmt.Errorf("No such command '%s'", args[0])
	}
}

func runLauncherRoot(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string, deps launcherRootDependencies) error {
	flags := flag.NewFlagSet("launcher", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	var parsed launcherRootFlags
	flags.BoolVar(&parsed.jsonOutput, "json", false, "Emit JSON payload only.")
	flags.StringVar(&parsed.workspace, "workspace", "", "Workspace root.")
	flags.StringVar(&parsed.workspace, "w", "", "Workspace root.")
	flags.StringVar(&parsed.openMode, "open-mode", "", "Launcher open mode.")
	flags.BoolVar(&parsed.noOpen, "no-open", false, "Skip opening browser or Chrome app.")
	flags.Float64Var(&parsed.timeout, "timeout", 30.0, "Seconds to wait for session startup.")
	if err := flags.Parse(args); err != nil {
		return emitLauncherFlagParseError(stderr, flags, err)
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("launcher run does not accept positional arguments")
	}
	request, failure := prepareLauncherRootRequest(parsed, global, envLookup, cwd, deps)
	if failure != nil {
		return failure.emit(stdout, stderr, parsed.jsonOutput)
	}

	result, failure := executeLauncherRootRequest(request, envLookup, deps)
	if failure != nil {
		return failure.emit(stdout, stderr, parsed.jsonOutput)
	}

	return writeLauncherRootResponse(stdout, stderr, request, result, deps)
}

func prepareLauncherRootRequest(parsed launcherRootFlags, global globalFlags, envLookup func(string) (string, bool), cwd string, deps launcherRootDependencies) (launcherRootRequest, *launcherCommandFailure) {
	if failure := validateLauncherRootTimeout(parsed.timeout); failure != nil {
		return launcherRootRequest{}, failure
	}
	baseConfig, resolvedWorkspaceOption, failure := loadLauncherRootBaseConfig(global, parsed.workspace, envLookup, cwd, deps)
	if failure != nil {
		return launcherRootRequest{}, failure
	}
	installedMetadata, failure := loadValidatedLauncherMetadata(baseConfig.Paths.SettaHome, deps)
	if failure != nil {
		return launcherRootRequest{}, failure
	}
	resolvedWorkspaceRoot, shouldOpenSwitcher, failure := resolveLauncherRootWorkspaceOption(resolvedWorkspaceOption, installedMetadata, deps.resolveUserHome)
	if failure != nil {
		return launcherRootRequest{}, failure
	}
	requestedOpenMode, failure := resolveRequestedLauncherOpenMode(parsed.openMode, installedMetadata)
	if failure != nil {
		return launcherRootRequest{}, failure
	}
	return buildLauncherRootRequest(parsed, global, baseConfig, installedMetadata, resolvedWorkspaceRoot, shouldOpenSwitcher, requestedOpenMode), nil
}

func validateLauncherRootTimeout(timeout float64) *launcherCommandFailure {
	if timeout > 0 {
		return nil
	}
	return newLauncherCommandFailure("BadRequest", "--timeout must be greater than 0.", 2)
}

func loadLauncherRootBaseConfig(global globalFlags, parsedWorkspace string, envLookup func(string) (string, bool), cwd string, deps launcherRootDependencies) (config.Config, string, *launcherCommandFailure) {
	baseConfig, err := deps.loadBaseConfig(global, cwd, envLookup)
	if err != nil {
		return config.Config{}, "", newLauncherCommandFailure("BadRequest", err.Error(), 2)
	}
	resolvedWorkspaceOption, err := resolveLauncherWorkspaceOption(parsedWorkspace, global.workspaceRoot)
	if err != nil {
		return config.Config{}, "", newLauncherCommandFailure("BadRequest", err.Error(), 2)
	}
	return baseConfig, resolvedWorkspaceOption, nil
}

func loadValidatedLauncherMetadata(settaHome string, deps launcherRootDependencies) (*launcher.LauncherInstallMetadata, *launcherCommandFailure) {
	installedMetadata, err := deps.loadMetadata(settaHome)
	if err != nil {
		return nil, launcherMetadataFailure(err)
	}
	if installedMetadata == nil {
		return nil, nil
	}
	targetError := deps.validateMetadataTarget(*installedMetadata)
	if targetError != "" {
		return nil, newLauncherCommandFailure("LauncherTargetMissing", targetError, 2)
	}
	return installedMetadata, nil
}

func resolveLauncherRootWorkspaceOption(resolvedWorkspaceOption string, installedMetadata *launcher.LauncherInstallMetadata, resolveUserHome func() (string, error)) (string, bool, *launcherCommandFailure) {
	resolvedWorkspaceRoot, shouldOpenSwitcher, err := resolveLauncherWorkspaceRoot(resolvedWorkspaceOption, installedMetadata, resolveUserHome)
	if err != nil {
		return "", false, newLauncherCommandFailure("InvalidWorkspace", fmt.Sprintf("Failed to initialize launcher workspace: %v", err), 2)
	}
	return resolvedWorkspaceRoot, shouldOpenSwitcher, nil
}

func resolveRequestedLauncherOpenMode(rawOpenMode string, installedMetadata *launcher.LauncherInstallMetadata) (launcher.LauncherOpenMode, *launcherCommandFailure) {
	requestedOpenMode, err := resolveLauncherRunOpenMode(rawOpenMode, installedMetadata)
	if err != nil {
		return "", newLauncherCommandFailure("BadRequest", err.Error(), 2)
	}
	return requestedOpenMode, nil
}

func buildLauncherRootRequest(parsed launcherRootFlags, global globalFlags, baseConfig config.Config, installedMetadata *launcher.LauncherInstallMetadata, resolvedWorkspaceRoot string, shouldOpenSwitcher bool, requestedOpenMode launcher.LauncherOpenMode) launcherRootRequest {
	normalizedProfile := strings.TrimSpace(global.profile)
	return launcherRootRequest{
		flags:              parsed,
		installedMetadata:  installedMetadata,
		requestedOpenMode:  requestedOpenMode,
		shouldOpenSwitcher: shouldOpenSwitcher,
		launchTimeout:      time.Duration(parsed.timeout * float64(time.Second)),
		sessionLaunchInput: launcher.IDELaunchInput{
			WorkspaceRoot:      resolvedWorkspaceRoot,
			SettaHome:          baseConfig.Paths.SettaHome,
			ProfileLookupHome:  launcherProfileLookupHome(normalizedProfile, baseConfig),
			Profile:            normalizedProfile,
			SettaFilesRoot:     strings.TrimSpace(global.settaFilesRoot),
			SettaFilesLocation: resolveLauncherRunSettaFilesLocationForRequest(global, shouldOpenSwitcher),
			RuntimeRoot:        strings.TrimSpace(global.runtimeRoot),
			ServerMode:         launcherServerMode(shouldOpenSwitcher),
		},
	}
}

func launcherProfileLookupHome(normalizedProfile string, baseConfig config.Config) string {
	if normalizedProfile == "" {
		return ""
	}
	return baseConfig.Paths.ProfileLookupHome
}

func resolveLauncherRunSettaFilesLocationForRequest(global globalFlags, shouldOpenSwitcher bool) *string {
	normalizedProfile := strings.TrimSpace(global.profile)
	resolvedSettaFilesLocation := normalizeLauncherRunSettaFilesLocation(global.settaFilesLocation, strings.TrimSpace(global.settaFilesRoot), normalizedProfile)
	if shouldOpenSwitcher && resolvedSettaFilesLocation != nil && *resolvedSettaFilesLocation == string(config.FilesLocationAuto) {
		globalLocation := string(config.FilesLocationGlobal)
		return &globalLocation
	}
	return resolvedSettaFilesLocation
}

func launcherServerMode(shouldOpenSwitcher bool) config.Mode {
	if shouldOpenSwitcher {
		return config.ModeLauncher
	}
	return config.ModeIDE
}

func executeLauncherRootRequest(request launcherRootRequest, envLookup func(string) (string, bool), deps launcherRootDependencies) (launcherRootResult, *launcherCommandFailure) {
	currentExecutable, err := deps.resolveCurrentExecutable()
	if err != nil {
		return launcherRootResult{}, newLauncherCommandFailure("InternalError", fmt.Sprintf("resolve current executable: %v", err), 1)
	}

	serverExecutable, err := deps.resolveServerExecutable(currentExecutable, envLookup)
	if err != nil {
		return launcherRootResult{}, newLauncherCommandFailure("LaunchFailed", err.Error(), 2)
	}

	sessionLauncher, err := deps.newSessionLauncher(serverExecutable, request.launchTimeout)
	if err != nil {
		return launcherRootResult{}, newLauncherCommandFailure("InternalError", err.Error(), 1)
	}

	launchResult, err := sessionLauncher.EnsureSession(request.sessionLaunchInput)
	if err != nil {
		return launcherRootResult{}, launcherSessionFailure(err)
	}

	bootstrapURL, failure := buildLauncherRootBootstrapURL(launchResult, request.shouldOpenSwitcher, deps)
	if failure != nil {
		return launcherRootResult{}, failure
	}

	if !request.shouldOpenSwitcher {
		_ = deps.updateLastUsedWorkspace(launchResult.Paths.SettaHome, launchResult.Paths.WorkspaceRoot)
	}

	return launcherRootResult{
		launchResult: launchResult,
		bootstrapURL: bootstrapURL,
	}, nil
}

func buildLauncherRootBootstrapURL(launchResult launcher.IDELaunchResult, shouldOpenSwitcher bool, deps launcherRootDependencies) (string, *launcherCommandFailure) {
	token, err := deps.mintBootstrapToken(launchResult.Session.ID, launchResult.Secret, deps.now().UTC())
	if err != nil {
		return "", unexpectedLauncherFailure()
	}
	bootstrapURL, err := launcher.BuildBootstrapURLFragment(launchResult.Session.Host, launchResult.Session.Port, token)
	if err != nil {
		return "", unexpectedLauncherFailure()
	}
	if shouldOpenSwitcher {
		bootstrapURL, err = appendBootstrapURLFragmentParam(bootstrapURL, "osw", "1")
		if err != nil {
			return "", unexpectedLauncherFailure()
		}
	}
	return bootstrapURL, nil
}

func writeLauncherRootResponse(stdout io.Writer, stderr io.Writer, request launcherRootRequest, result launcherRootResult, deps launcherRootDependencies) error {
	actualOpenMode := request.requestedOpenMode
	if !(request.flags.jsonOutput || request.flags.noOpen) {
		actualOpenMode = deps.openURLWithMode(result.bootstrapURL, request.requestedOpenMode, stderr)
	}

	payload := launcherRunPayload{
		Ok:                    true,
		BootstrapURL:          result.bootstrapURL,
		WorkspaceRoot:         result.launchResult.Paths.WorkspaceRoot,
		SessionID:             result.launchResult.Session.ID,
		StartedNew:            result.launchResult.StartedNew,
		ReusedSession:         !result.launchResult.StartedNew,
		SessionServerMode:     string(request.sessionLaunchInput.ServerMode),
		OpenMode:              string(actualOpenMode),
		WorkspaceBehavior:     effectiveLauncherWorkspaceBehavior(request.installedMetadata),
		OpenWorkspaceSwitcher: request.shouldOpenSwitcher,
		SettaHome:             result.launchResult.Paths.SettaHome,
		Profile:               stringPointer(result.launchResult.Paths.ProfileName),
	}
	if request.flags.jsonOutput {
		return writeJSONPayload(stdout, payload)
	}
	if request.flags.noOpen {
		fmt.Fprintf(stdout, "Bootstrap URL: %s\n", result.bootstrapURL)
		if request.shouldOpenSwitcher {
			fmt.Fprintln(stdout, "Workspace switcher will open after bootstrap.")
		}
		return nil
	}
	fmt.Fprintf(stdout, "Opened Setta (%s) for workspace %s\n", actualOpenMode, result.launchResult.Paths.WorkspaceRoot)
	return nil
}

func newLauncherCommandFailure(code string, message string, exitCode int) *launcherCommandFailure {
	return &launcherCommandFailure{code: code, message: message, exitCode: exitCode}
}

func launcherMetadataFailure(err error) *launcherCommandFailure {
	var metadataErr *launcher.LauncherMetadataError
	if errors.As(err, &metadataErr) {
		return newLauncherCommandFailure("LauncherMetadata", metadataErr.Error(), 2)
	}
	return newLauncherCommandFailure("InternalError", err.Error(), 1)
}

func launcherSessionFailure(err error) *launcherCommandFailure {
	var sessionLaunchErr *launcher.SessionLaunchError
	if errors.As(err, &sessionLaunchErr) {
		return newLauncherCommandFailure(sessionLaunchErr.Code, sessionLaunchErr.Message, 2)
	}
	return newLauncherCommandFailure("InternalError", err.Error(), 1)
}

func unexpectedLauncherFailure() *launcherCommandFailure {
	return newLauncherCommandFailure("InternalError", "Unexpected launcher failure. Check logs for details.", 1)
}
