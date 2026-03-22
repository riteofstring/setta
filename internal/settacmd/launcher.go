package settacmd

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/launcher"
)

type launcherErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type launcherStatusPayload struct {
	Ok                       bool                  `json:"ok"`
	Installed                bool                  `json:"installed"`
	SettaHome                string                `json:"settaHome,omitempty"`
	LauncherDir              string                `json:"launcherDir,omitempty"`
	MetadataPath             string                `json:"metadataPath,omitempty"`
	TargetCommand            []string              `json:"targetCommand,omitempty"`
	TargetValid              *bool                 `json:"targetValid,omitempty"`
	TargetError              *string               `json:"targetError,omitempty"`
	Channel                  *string               `json:"channel,omitempty"`
	SettaVersion             *string               `json:"settaVersion,omitempty"`
	OpenMode                 *string               `json:"openMode,omitempty"`
	WorkspaceBehavior        *string               `json:"workspaceBehavior,omitempty"`
	LastUsedWorkspace        *string               `json:"lastUsedWorkspace,omitempty"`
	ArtifactOptions          map[string]string     `json:"artifactOptions"`
	ManagedArtifacts         map[string]string     `json:"managedArtifacts"`
	ExistingManagedArtifacts []string              `json:"existingManagedArtifacts"`
	MissingManagedArtifacts  []string              `json:"missingManagedArtifacts"`
	UpdateCapability         string                `json:"updateCapability,omitempty"`
	UpdateGuidance           *string               `json:"updateGuidance,omitempty"`
	Error                    *launcherErrorPayload `json:"error,omitempty"`
}

type launcherRemovePayload struct {
	Ok              bool                  `json:"ok"`
	MetadataRemoved bool                  `json:"metadataRemoved"`
	RemovedPaths    []string              `json:"removedPaths"`
	MissingPaths    []string              `json:"missingPaths"`
	Error           *launcherErrorPayload `json:"error,omitempty"`
}

type launcherRepairPayload struct {
	Ok     bool                   `json:"ok"`
	Status *launcherStatusPayload `json:"status,omitempty"`
	Error  *launcherErrorPayload  `json:"error,omitempty"`
}

type launcherUpdatePayload struct {
	Ok          bool                   `json:"ok"`
	PackageSpec string                 `json:"packageSpec,omitempty"`
	FromVersion *string                `json:"fromVersion,omitempty"`
	ToVersion   *string                `json:"toVersion,omitempty"`
	Status      *launcherStatusPayload `json:"status,omitempty"`
	Error       *launcherErrorPayload  `json:"error,omitempty"`
}

type launcherRootFlags struct {
	jsonOutput bool
	workspace  string
	openMode   string
	noOpen     bool
	timeout    float64
}

type launcherRunPayload struct {
	Ok                    bool                  `json:"ok"`
	BootstrapURL          string                `json:"bootstrapUrl,omitempty"`
	WorkspaceRoot         string                `json:"workspaceRoot,omitempty"`
	SessionID             string                `json:"sessionId,omitempty"`
	StartedNew            bool                  `json:"startedNew"`
	ReusedSession         bool                  `json:"reusedSession"`
	SessionServerMode     string                `json:"sessionServerMode,omitempty"`
	OpenMode              string                `json:"openMode,omitempty"`
	WorkspaceBehavior     string                `json:"workspaceBehavior,omitempty"`
	OpenWorkspaceSwitcher bool                  `json:"openWorkspaceSwitcher"`
	SettaHome             string                `json:"settaHome,omitempty"`
	Profile               *string               `json:"profile,omitempty"`
	Error                 *launcherErrorPayload `json:"error,omitempty"`
}

type launcherSetupFlags struct {
	jsonOutput           bool
	channel              string
	installSource        string
	openMode             string
	workspaceBehavior    string
	artifactOptionSpecs  stringSliceFlag
	clearArtifactOptions bool
	installArtifacts     optionalBoolChoice
}

type stringSliceFlag struct {
	values []string
}

func (f *stringSliceFlag) String() string {
	if f == nil {
		return ""
	}
	return strings.Join(f.values, ",")
}

func (f *stringSliceFlag) Set(value string) error {
	f.values = append(f.values, value)
	return nil
}

type optionalBoolChoice struct {
	value *bool
}

type boolChoiceFlag struct {
	target *optionalBoolChoice
	value  bool
}

type launcherRootDependencies struct {
	loadBaseConfig           func(global globalFlags, cwd string, envLookup func(string) (string, bool)) (config.Config, error)
	loadMetadata             func(string) (*launcher.LauncherInstallMetadata, error)
	resolveUserHome          func() (string, error)
	validateMetadataTarget   func(launcher.LauncherInstallMetadata) string
	resolveCurrentExecutable func() (string, error)
	resolveServerExecutable  func(string, func(string) (string, bool)) (string, error)
	newSessionLauncher       func(string, time.Duration) (launcher.IDEWorkspaceSessionLauncher, error)
	now                      func() time.Time
	mintBootstrapToken       func(string, []byte, time.Time) (string, error)
	updateLastUsedWorkspace  func(string, string) error
	openURLWithMode          func(string, launcher.LauncherOpenMode, io.Writer) launcher.LauncherOpenMode
}

func (f *boolChoiceFlag) String() string {
	if f == nil || f.target == nil || f.target.value == nil {
		return ""
	}
	return strconv.FormatBool(*f.target.value)
}

func (f *boolChoiceFlag) Set(string) error {
	if f.target == nil {
		return fmt.Errorf("bool flag target is required")
	}
	if f.target.value != nil && *f.target.value != f.value {
		return fmt.Errorf("use either --install-artifacts or --no-install-artifacts, not both")
	}
	resolved := f.value
	f.target.value = &resolved
	return nil
}

func (f *boolChoiceFlag) IsBoolFlag() bool {
	return true
}

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
	flags.SetOutput(stderr)
	var parsed launcherRootFlags
	flags.BoolVar(&parsed.jsonOutput, "json", false, "Emit JSON payload only.")
	flags.StringVar(&parsed.workspace, "workspace", "", "Workspace root.")
	flags.StringVar(&parsed.workspace, "w", "", "Workspace root.")
	flags.StringVar(&parsed.openMode, "open-mode", "", "Launcher open mode.")
	flags.BoolVar(&parsed.noOpen, "no-open", false, "Skip opening browser or Chrome app.")
	flags.Float64Var(&parsed.timeout, "timeout", 30.0, "Seconds to wait for session startup.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("launcher run does not accept positional arguments")
	}
	if parsed.timeout <= 0 {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "BadRequest", "--timeout must be greater than 0.", 2)
	}

	baseConfig, err := deps.loadBaseConfig(global, cwd, envLookup)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "BadRequest", err.Error(), 2)
	}

	resolvedWorkspaceOption, err := resolveLauncherWorkspaceOption(parsed.workspace, global.workspaceRoot)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "BadRequest", err.Error(), 2)
	}

	installedMetadata, err := deps.loadMetadata(baseConfig.Paths.SettaHome)
	if err != nil {
		var metadataErr *launcher.LauncherMetadataError
		if errors.As(err, &metadataErr) {
			return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "LauncherMetadata", metadataErr.Error(), 2)
		}
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", err.Error(), 1)
	}
	if installedMetadata != nil {
		targetError := deps.validateMetadataTarget(*installedMetadata)
		if targetError != "" {
			return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "LauncherTargetMissing", targetError, 2)
		}
	}

	resolvedWorkspaceRoot, shouldOpenSwitcher, err := resolveLauncherWorkspaceRoot(
		resolvedWorkspaceOption,
		installedMetadata,
		deps.resolveUserHome,
	)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "InvalidWorkspace", fmt.Sprintf("Failed to initialize launcher workspace: %v", err), 2)
	}

	normalizedProfile := strings.TrimSpace(global.profile)
	normalizedSettaFilesRoot := strings.TrimSpace(global.settaFilesRoot)
	normalizedRuntimeRoot := strings.TrimSpace(global.runtimeRoot)
	resolvedSettaFilesLocation := normalizeLauncherRunSettaFilesLocation(global.settaFilesLocation, normalizedSettaFilesRoot, normalizedProfile)
	if shouldOpenSwitcher && resolvedSettaFilesLocation != nil && *resolvedSettaFilesLocation == string(config.FilesLocationAuto) {
		globalLocation := string(config.FilesLocationGlobal)
		resolvedSettaFilesLocation = &globalLocation
	}

	requestedOpenMode, err := resolveLauncherRunOpenMode(parsed.openMode, installedMetadata)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "BadRequest", err.Error(), 2)
	}
	serverMode := config.ModeIDE
	if shouldOpenSwitcher {
		serverMode = config.ModeLauncher
	}

	currentExecutable, err := deps.resolveCurrentExecutable()
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", fmt.Sprintf("resolve current executable: %v", err), 1)
	}
	serverExecutable, err := deps.resolveServerExecutable(currentExecutable, envLookup)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "LaunchFailed", err.Error(), 2)
	}
	sessionLauncher, err := deps.newSessionLauncher(serverExecutable, time.Duration(parsed.timeout*float64(time.Second)))
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", err.Error(), 1)
	}

	profileLookupHome := ""
	if normalizedProfile != "" {
		profileLookupHome = baseConfig.Paths.ProfileLookupHome
	}
	launchResult, err := sessionLauncher.EnsureSession(launcher.IDELaunchInput{
		WorkspaceRoot:      resolvedWorkspaceRoot,
		SettaHome:          baseConfig.Paths.SettaHome,
		ProfileLookupHome:  profileLookupHome,
		Profile:            normalizedProfile,
		SettaFilesRoot:     normalizedSettaFilesRoot,
		SettaFilesLocation: resolvedSettaFilesLocation,
		RuntimeRoot:        normalizedRuntimeRoot,
		ServerMode:         serverMode,
	})
	if err != nil {
		var sessionLaunchErr *launcher.SessionLaunchError
		if errors.As(err, &sessionLaunchErr) {
			return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, sessionLaunchErr.Code, sessionLaunchErr.Message, 2)
		}
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", err.Error(), 1)
	}

	token, err := deps.mintBootstrapToken(launchResult.Session.ID, launchResult.Secret, deps.now().UTC())
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", "Unexpected launcher failure. Check logs for details.", 1)
	}
	bootstrapURL, err := launcher.BuildBootstrapURLFragment(launchResult.Session.Host, launchResult.Session.Port, token)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", "Unexpected launcher failure. Check logs for details.", 1)
	}
	if shouldOpenSwitcher {
		bootstrapURL, err = appendBootstrapURLFragmentParam(bootstrapURL, "osw", "1")
		if err != nil {
			return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", "Unexpected launcher failure. Check logs for details.", 1)
		}
	}

	if !shouldOpenSwitcher {
		_ = deps.updateLastUsedWorkspace(launchResult.Paths.SettaHome, launchResult.Paths.WorkspaceRoot)
	}

	actualOpenMode := requestedOpenMode
	if !(parsed.jsonOutput || parsed.noOpen) {
		actualOpenMode = deps.openURLWithMode(bootstrapURL, requestedOpenMode, stderr)
	}

	payload := launcherRunPayload{
		Ok:                    true,
		BootstrapURL:          bootstrapURL,
		WorkspaceRoot:         launchResult.Paths.WorkspaceRoot,
		SessionID:             launchResult.Session.ID,
		StartedNew:            launchResult.StartedNew,
		ReusedSession:         !launchResult.StartedNew,
		SessionServerMode:     string(serverMode),
		OpenMode:              string(actualOpenMode),
		WorkspaceBehavior:     effectiveLauncherWorkspaceBehavior(installedMetadata),
		OpenWorkspaceSwitcher: shouldOpenSwitcher,
		SettaHome:             launchResult.Paths.SettaHome,
		Profile:               stringPointer(launchResult.Paths.ProfileName),
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, payload)
	}
	if parsed.noOpen {
		fmt.Fprintf(stdout, "Bootstrap URL: %s\n", bootstrapURL)
		if shouldOpenSwitcher {
			fmt.Fprintln(stdout, "Workspace switcher will open after bootstrap.")
		}
		return nil
	}
	fmt.Fprintf(stdout, "Opened Setta (%s) for workspace %s\n", actualOpenMode, launchResult.Paths.WorkspaceRoot)
	return nil
}

func runLauncherSetup(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	flags := flag.NewFlagSet("launcher setup", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var parsed launcherSetupFlags
	flags.BoolVar(&parsed.jsonOutput, "json", false, "Emit JSON payload only.")
	flags.StringVar(&parsed.channel, "channel", "", "Launcher setup channel.")
	flags.StringVar(&parsed.installSource, "install-source", "", "Canonical launcher install source classification.")
	flags.StringVar(&parsed.openMode, "open-mode", "", "Launcher open mode.")
	flags.StringVar(&parsed.workspaceBehavior, "workspace-behavior", "", "Workspace fallback behavior.")
	flags.Var(&parsed.artifactOptionSpecs, "artifact-option", "Platform artifact option in NAME=VALUE form.")
	flags.BoolVar(&parsed.clearArtifactOptions, "clear-artifact-options", false, "Clear all stored launcher artifact options.")
	flags.Var(&boolChoiceFlag{target: &parsed.installArtifacts, value: true}, "install-artifacts", "Install managed platform artifacts.")
	flags.Var(&boolChoiceFlag{target: &parsed.installArtifacts, value: false}, "no-install-artifacts", "Skip managed platform artifacts.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("launcher setup does not accept positional arguments")
	}

	if parsed.clearArtifactOptions && len(parsed.artifactOptionSpecs.values) != 0 {
		return emitLauncherCommandError(
			stdout,
			stderr,
			parsed.jsonOutput,
			"BadRequest",
			"Use either --artifact-option or --clear-artifact-options, not both.",
			2,
		)
	}

	commandCfg, err := resolveLauncherCommandConfig(global, cwd, envLookup)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "BadRequest", err.Error(), 2)
	}
	manager, err := newLauncherManagementService()
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "InternalError", err.Error(), 1)
	}

	artifactOptions, err := parseLauncherArtifactOptionSpecs(parsed.artifactOptionSpecs.values, parsed.clearArtifactOptions)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "BadRequest", err.Error(), 2)
	}
	installSource, err := normalizeLauncherInstallSource(parsed.installSource)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "BadRequest", err.Error(), 2)
	}
	openMode, err := normalizeLauncherOpenMode(parsed.openMode)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "BadRequest", err.Error(), 2)
	}
	workspaceBehavior, err := normalizeLauncherWorkspaceBehavior(parsed.workspaceBehavior)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, parsed.jsonOutput, "BadRequest", err.Error(), 2)
	}

	setupInput := launcher.LauncherSetupInput{
		Channel:           stringPointer(parsed.channel),
		InstallSource:     installSource,
		OpenMode:          openMode,
		WorkspaceBehavior: workspaceBehavior,
		InstallArtifacts:  parsed.installArtifacts.value,
		ArtifactOptions:   artifactOptions,
	}
	if _, err := manager.Setup(commandCfg.Paths.SettaHome, setupInput); err != nil {
		return emitLauncherSetupError(stdout, stderr, parsed.jsonOutput, err)
	}
	status, err := manager.CollectStatus(commandCfg.Paths.SettaHome)
	if err != nil {
		return emitLauncherSetupError(stdout, stderr, parsed.jsonOutput, err)
	}
	payload := launcherStatusPayloadFromSnapshot(status)
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, payload)
	}
	fmt.Fprintf(stdout, "Launcher metadata written: %s\n", payload.MetadataPath)
	fmt.Fprintf(stdout, "Target command: %s\n", shellJoin(payload.TargetCommand))
	return nil
}

func runLauncherStatus(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	flags := flag.NewFlagSet("launcher status", flag.ContinueOnError)
	flags.SetOutput(stderr)
	jsonOutput := flags.Bool("json", false, "Emit JSON payload only.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("launcher status does not accept positional arguments")
	}

	commandCfg, err := resolveLauncherCommandConfig(global, cwd, envLookup)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, *jsonOutput, "BadRequest", err.Error(), 2)
	}
	manager, err := newLauncherManagementService()
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, *jsonOutput, "InternalError", err.Error(), 1)
	}
	status, err := manager.CollectStatus(commandCfg.Paths.SettaHome)
	if err != nil {
		return emitLauncherSetupError(stdout, stderr, *jsonOutput, err)
	}
	payload := launcherStatusPayloadFromSnapshot(status)
	if *jsonOutput {
		return writeJSONPayload(stdout, payload)
	}
	if !payload.Installed {
		fmt.Fprintln(stdout, "Launcher status: not installed")
		fmt.Fprintln(stdout, "Run `setta launcher setup` to install launcher metadata.")
		return nil
	}
	fmt.Fprintln(stdout, "Launcher status: installed")
	fmt.Fprintf(stdout, "Metadata: %s\n", payload.MetadataPath)
	fmt.Fprintf(stdout, "Target: %s\n", shellJoin(payload.TargetCommand))
	if payload.Channel != nil {
		fmt.Fprintf(stdout, "Channel: %s\n", *payload.Channel)
	}
	if payload.UpdateCapability != "" {
		fmt.Fprintf(stdout, "Update capability: %s\n", payload.UpdateCapability)
	}
	if payload.UpdateGuidance != nil {
		fmt.Fprintf(stdout, "Update guidance: %s\n", *payload.UpdateGuidance)
	}
	if payload.TargetError != nil {
		fmt.Fprintf(stdout, "Target error: %s\n", *payload.TargetError)
	}
	if len(payload.MissingManagedArtifacts) != 0 {
		fmt.Fprintln(stdout, "Missing managed artifacts:")
		for _, path := range payload.MissingManagedArtifacts {
			fmt.Fprintf(stdout, "  - %s\n", path)
		}
	}
	return nil
}

func runLauncherRepair(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	flags := flag.NewFlagSet("launcher repair", flag.ContinueOnError)
	flags.SetOutput(stderr)
	jsonOutput := flags.Bool("json", false, "Emit JSON payload only.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("launcher repair does not accept positional arguments")
	}

	commandCfg, err := resolveLauncherCommandConfig(global, cwd, envLookup)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, *jsonOutput, "BadRequest", err.Error(), 2)
	}
	manager, err := newLauncherManagementService()
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, *jsonOutput, "InternalError", err.Error(), 1)
	}
	status, err := manager.Repair(commandCfg.Paths.SettaHome)
	if err != nil {
		return emitLauncherSetupError(stdout, stderr, *jsonOutput, err)
	}
	payload := launcherRepairPayload{
		Ok:     true,
		Status: pointerToStatusPayload(launcherStatusPayloadFromSnapshot(status)),
	}
	if *jsonOutput {
		return writeJSONPayload(stdout, payload)
	}
	fmt.Fprintf(stdout, "Launcher repaired: %s\n", status.MetadataPath)
	if len(status.MissingManagedArtifacts) != 0 {
		fmt.Fprintln(stdout, "Missing managed artifacts remain:")
		for _, path := range status.MissingManagedArtifacts {
			fmt.Fprintf(stdout, "  - %s\n", path)
		}
	}
	return nil
}

func runLauncherRemove(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	flags := flag.NewFlagSet("launcher remove", flag.ContinueOnError)
	flags.SetOutput(stderr)
	jsonOutput := flags.Bool("json", false, "Emit JSON payload only.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("launcher remove does not accept positional arguments")
	}

	commandCfg, err := resolveLauncherCommandConfig(global, cwd, envLookup)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, *jsonOutput, "BadRequest", err.Error(), 2)
	}
	manager, err := newLauncherManagementService()
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, *jsonOutput, "InternalError", err.Error(), 1)
	}
	result, err := manager.Remove(commandCfg.Paths.SettaHome)
	if err != nil {
		return emitLauncherSetupError(stdout, stderr, *jsonOutput, err)
	}
	payload := launcherRemovePayload{
		Ok:              true,
		MetadataRemoved: result.MetadataRemoved,
		RemovedPaths:    cloneStrings(result.RemovedPaths),
		MissingPaths:    cloneStrings(result.MissingPaths),
	}
	if *jsonOutput {
		return writeJSONPayload(stdout, payload)
	}
	fmt.Fprintf(stdout, "Launcher metadata removed: %t\n", result.MetadataRemoved)
	for _, removed := range result.RemovedPaths {
		fmt.Fprintf(stdout, "Removed: %s\n", removed)
	}
	return nil
}

func runLauncherUpdate(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	flags := flag.NewFlagSet("launcher update", flag.ContinueOnError)
	flags.SetOutput(stderr)
	jsonOutput := flags.Bool("json", false, "Emit JSON payload only.")
	packageSpec := flags.String("package", "setta", "Package spec passed to uv tool install --upgrade.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("launcher update does not accept positional arguments")
	}

	commandCfg, err := resolveLauncherCommandConfig(global, cwd, envLookup)
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, *jsonOutput, "BadRequest", err.Error(), 2)
	}
	manager, err := newLauncherManagementService()
	if err != nil {
		return emitLauncherCommandError(stdout, stderr, *jsonOutput, "InternalError", err.Error(), 1)
	}
	result, err := manager.Update(commandCfg.Paths.SettaHome, *packageSpec)
	if err != nil {
		return emitLauncherSetupError(stdout, stderr, *jsonOutput, err)
	}
	payload := launcherUpdatePayload{
		Ok:          true,
		PackageSpec: result.PackageSpec,
		FromVersion: cloneStringPointer(result.FromVersion),
		ToVersion:   cloneStringPointer(result.ToVersion),
		Status:      pointerToStatusPayload(launcherStatusPayloadFromSnapshot(result.Status)),
	}
	if *jsonOutput {
		return writeJSONPayload(stdout, payload)
	}
	fmt.Fprintf(stdout, "Updated Setta package %s: %s -> %s\n", result.PackageSpec, stringPointerValue(result.FromVersion), stringPointerValue(result.ToVersion))
	return nil
}

func defaultLauncherRootDependencies() launcherRootDependencies {
	tokenManager := auth.NewBootstrapTokenManager(auth.DefaultBootstrapTokenTTL, auth.NewNonceTracker())
	return launcherRootDependencies{
		loadBaseConfig:           resolveLauncherCommandConfig,
		loadMetadata:             launcher.LoadLauncherInstallMetadata,
		resolveUserHome:          os.UserHomeDir,
		validateMetadataTarget:   launcher.LauncherTargetValidationError,
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
		updateLastUsedWorkspace: func(settaHome string, workspaceRoot string) error {
			return launcher.UpdateLauncherLastUsedWorkspaceIfInstalled(settaHome, workspaceRoot)
		},
		openURLWithMode: openURLWithLauncherMode,
	}
}

func resolveLauncherWorkspaceOption(subcommandWorkspace string, globalWorkspace string) (string, error) {
	trimmedSubcommandWorkspace := strings.TrimSpace(subcommandWorkspace)
	trimmedGlobalWorkspace := strings.TrimSpace(globalWorkspace)
	if trimmedSubcommandWorkspace == "" {
		return trimmedGlobalWorkspace, nil
	}
	if trimmedGlobalWorkspace == "" {
		return trimmedSubcommandWorkspace, nil
	}
	resolvedSubcommandWorkspace, err := resolveCLIPath(trimmedSubcommandWorkspace)
	if err != nil {
		return "", err
	}
	resolvedGlobalWorkspace, err := resolveCLIPath(trimmedGlobalWorkspace)
	if err != nil {
		return "", err
	}
	if resolvedSubcommandWorkspace != resolvedGlobalWorkspace {
		return "", fmt.Errorf("Conflicting --workspace provided at both the global CLI level and the launcher subcommand.")
	}
	return trimmedSubcommandWorkspace, nil
}

func resolveLauncherWorkspaceRoot(explicitWorkspace string, installedMetadata *launcher.LauncherInstallMetadata, resolveUserHome func() (string, error)) (string, bool, error) {
	if strings.TrimSpace(explicitWorkspace) != "" {
		resolvedWorkspace, err := resolveCLIPath(explicitWorkspace)
		if err != nil {
			return "", false, err
		}
		return resolvedWorkspace, false, nil
	}

	workspaceBehavior := launcher.LauncherWorkspaceBehaviorDefault
	if installedMetadata != nil && strings.TrimSpace(installedMetadata.WorkspaceBehavior) != "" {
		workspaceBehavior = launcher.LauncherWorkspaceBehavior(installedMetadata.WorkspaceBehavior)
	}
	if workspaceBehavior != launcher.LauncherWorkspaceBehaviorAlwaysPrompt &&
		installedMetadata != nil &&
		installedMetadata.LastUsedWorkspace != nil &&
		strings.TrimSpace(*installedMetadata.LastUsedWorkspace) != "" {
		candidate, err := resolveCLIPath(*installedMetadata.LastUsedWorkspace)
		if err != nil {
			return "", false, err
		}
		info, statErr := os.Stat(candidate)
		if statErr == nil && info.IsDir() {
			return candidate, false, nil
		}
	}

	homeDir, err := resolveUserHome()
	if err != nil {
		return "", false, fmt.Errorf("resolve user home: %w", err)
	}
	resolvedHome, err := resolveCLIPath(homeDir)
	if err != nil {
		return "", false, err
	}
	info, err := os.Stat(resolvedHome)
	if err != nil {
		return "", false, err
	}
	if !info.IsDir() {
		return "", false, fmt.Errorf("Home directory is not a directory: %s", resolvedHome)
	}
	return resolvedHome, true, nil
}

func resolveLauncherRunOpenMode(rawOpenMode string, installedMetadata *launcher.LauncherInstallMetadata) (launcher.LauncherOpenMode, error) {
	if strings.TrimSpace(rawOpenMode) != "" {
		normalized, err := normalizeLauncherOpenMode(rawOpenMode)
		if err != nil {
			return "", err
		}
		return *normalized, nil
	}
	if installedMetadata != nil && strings.TrimSpace(installedMetadata.OpenMode) != "" {
		return launcher.LauncherOpenMode(installedMetadata.OpenMode), nil
	}
	return launcher.LauncherOpenModeChromeApp, nil
}

func effectiveLauncherWorkspaceBehavior(installedMetadata *launcher.LauncherInstallMetadata) string {
	if installedMetadata != nil && strings.TrimSpace(installedMetadata.WorkspaceBehavior) != "" {
		return installedMetadata.WorkspaceBehavior
	}
	return string(launcher.LauncherWorkspaceBehaviorDefault)
}

func normalizeLauncherRunSettaFilesLocation(rawLocation string, settaFilesRoot string, profile string) *string {
	trimmedLocation := strings.ToLower(strings.TrimSpace(rawLocation))
	switch {
	case trimmedLocation != "":
		if strings.TrimSpace(settaFilesRoot) != "" && trimmedLocation == string(config.FilesLocationAuto) {
			return nil
		}
		return stringPointer(trimmedLocation)
	case strings.TrimSpace(settaFilesRoot) != "", strings.TrimSpace(profile) != "":
		return nil
	default:
		auto := string(config.FilesLocationAuto)
		return &auto
	}
}

func appendBootstrapURLFragmentParam(rawURL string, key string, value string) (string, error) {
	trimmedURL := strings.TrimSpace(rawURL)
	if trimmedURL == "" {
		return "", fmt.Errorf("bootstrap url is required")
	}
	if strings.TrimSpace(key) == "" {
		return "", fmt.Errorf("bootstrap fragment key is required")
	}
	parts := strings.SplitN(trimmedURL, "#", 2)
	fragmentValues, err := parseFragmentValues(trimmedURL)
	if err != nil {
		return "", err
	}
	fragmentValues.Set(strings.TrimSpace(key), strings.TrimSpace(value))
	if len(parts) == 1 {
		return parts[0] + "#" + fragmentValues.Encode(), nil
	}
	return parts[0] + "#" + fragmentValues.Encode(), nil
}

func parseFragmentValues(rawURL string) (url.Values, error) {
	parts := strings.SplitN(strings.TrimSpace(rawURL), "#", 2)
	if len(parts) != 2 || strings.TrimSpace(parts[1]) == "" {
		return url.Values{}, nil
	}
	values, err := url.ParseQuery(parts[1])
	if err != nil {
		return nil, fmt.Errorf("parse bootstrap fragment query: %w", err)
	}
	return values, nil
}

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

func resolveLauncherCommandConfig(global globalFlags, cwd string, envLookup func(string) (string, bool)) (config.Config, error) {
	return config.Load(config.LoadOptions{
		CWD:       cwd,
		EnvLookup: envLookup,
		CLI: config.CLIOptions{
			WorkspaceRoot:      global.workspaceRoot,
			SettaHome:          global.settaHome,
			ProfileLookupHome:  global.profileLookupHome,
			SettaFilesRoot:     global.settaFilesRoot,
			SettaFilesLocation: global.settaFilesLocation,
			RuntimeRoot:        global.runtimeRoot,
			Profile:            global.profile,
			Mode:               string(config.ModeLauncher),
		},
	})
}

func newLauncherManagementService() (*launcher.ManagementService, error) {
	executablePath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve current executable: %w", err)
	}
	return launcher.NewManagementService(launcher.ManagementServiceOptions{
		ExecutablePath: executablePath,
	})
}

func parseLauncherArtifactOptionSpecs(specs []string, clear bool) (*map[string]string, error) {
	if clear {
		cleared := map[string]string{}
		return &cleared, nil
	}
	if len(specs) == 0 {
		return nil, nil
	}
	parsed := make(map[string]string, len(specs))
	for _, rawSpec := range specs {
		spec := strings.TrimSpace(rawSpec)
		if spec == "" {
			return nil, fmt.Errorf("artifact option entries must be non-empty")
		}
		name, value, ok := strings.Cut(spec, "=")
		if !ok {
			return nil, fmt.Errorf("artifact option entries must use NAME=VALUE format")
		}
		trimmedName := strings.TrimSpace(name)
		if trimmedName == "" {
			return nil, fmt.Errorf("artifact option names must be non-empty")
		}
		trimmedValue := strings.TrimSpace(value)
		if trimmedValue == "" {
			return nil, fmt.Errorf("artifact option values must be non-empty")
		}
		parsed[trimmedName] = trimmedValue
	}
	return &parsed, nil
}

func normalizeLauncherInstallSource(raw string) (*launcher.LauncherInstallSource, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	normalized := strings.ToLower(strings.TrimSpace(strings.ReplaceAll(raw, "-", "_")))
	switch launcher.LauncherInstallSource(normalized) {
	case launcher.LauncherInstallSourceUVTool, launcher.LauncherInstallSourceInstallerManaged, launcher.LauncherInstallSourceUnsupported:
		resolved := launcher.LauncherInstallSource(normalized)
		return &resolved, nil
	default:
		return nil, fmt.Errorf("install source must be one of: uv-tool, installer-managed, unsupported")
	}
}

func normalizeLauncherOpenMode(raw string) (*launcher.LauncherOpenMode, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch launcher.LauncherOpenMode(normalized) {
	case launcher.LauncherOpenModeBrowser, launcher.LauncherOpenModeChromeApp:
		resolved := launcher.LauncherOpenMode(normalized)
		return &resolved, nil
	default:
		return nil, fmt.Errorf("open mode must be one of: browser, chrome-app")
	}
}

func normalizeLauncherWorkspaceBehavior(raw string) (*launcher.LauncherWorkspaceBehavior, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	normalized := strings.ToLower(strings.TrimSpace(strings.ReplaceAll(raw, "-", "_")))
	switch launcher.LauncherWorkspaceBehavior(normalized) {
	case launcher.LauncherWorkspaceBehaviorLastUsedOrPrompt, launcher.LauncherWorkspaceBehaviorAlwaysPrompt:
		resolved := launcher.LauncherWorkspaceBehavior(normalized)
		return &resolved, nil
	default:
		return nil, fmt.Errorf("workspace behavior must be either 'last-used-or-prompt' or 'always-prompt'")
	}
}

func launcherStatusPayloadFromSnapshot(status launcher.LauncherStatusSnapshot) launcherStatusPayload {
	return launcherStatusPayload{
		Ok:                       true,
		Installed:                status.Installed,
		SettaHome:                status.SettaHome,
		LauncherDir:              status.LauncherDir,
		MetadataPath:             status.MetadataPath,
		TargetCommand:            cloneStrings(status.TargetCommand),
		TargetValid:              cloneBoolPointer(status.TargetValid),
		TargetError:              cloneStringPointer(status.TargetError),
		Channel:                  cloneStringPointer(status.Channel),
		SettaVersion:             cloneStringPointer(status.SettaVersion),
		OpenMode:                 launcherOpenModePointer(status.OpenMode),
		WorkspaceBehavior:        launcherWorkspaceBehaviorPointer(status.WorkspaceBehavior),
		LastUsedWorkspace:        cloneStringPointer(status.LastUsedWorkspace),
		ArtifactOptions:          cloneStringMap(status.ArtifactOptions),
		ManagedArtifacts:         cloneStringMap(status.ManagedArtifacts),
		ExistingManagedArtifacts: cloneStrings(status.ExistingManagedArtifacts),
		MissingManagedArtifacts:  cloneStrings(status.MissingManagedArtifacts),
		UpdateCapability:         string(status.UpdateCapability),
		UpdateGuidance:           cloneStringPointer(status.UpdateGuidance),
	}
}

func emitLauncherSetupError(stdout io.Writer, stderr io.Writer, jsonOutput bool, err error) error {
	var setupErr *launcher.LauncherSetupError
	if errors.As(err, &setupErr) {
		return emitLauncherCommandError(stdout, stderr, jsonOutput, setupErr.Code, setupErr.Message, 2)
	}
	return emitLauncherCommandError(stdout, stderr, jsonOutput, "InternalError", err.Error(), 1)
}

func emitLauncherCommandError(stdout io.Writer, stderr io.Writer, jsonOutput bool, code string, message string, exitCode int) error {
	if jsonOutput {
		if err := writeJSONPayload(stdout, map[string]any{
			"ok": false,
			"error": launcherErrorPayload{
				Code:    code,
				Message: message,
			},
		}); err != nil {
			return err
		}
		return &ExitError{Code: exitCode, Silent: true}
	}

	fmt.Fprintf(stderr, "Error: %s\n", message)
	switch code {
	case "LauncherTargetMissing":
		fmt.Fprintln(stderr, "Remediation: reinstall launcher metadata with `setta launcher setup`.")
	case "LauncherMetadata":
		fmt.Fprintln(stderr, "Remediation: fix or remove launcher metadata, then re-run `setta launcher setup`.")
	}
	return &ExitError{Code: exitCode, Silent: true}
}

func writeJSONPayload(writer io.Writer, payload any) error {
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	return encoder.Encode(payload)
}

func shellJoin(parts []string) string {
	if len(parts) == 0 {
		return ""
	}
	quoted := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" || strings.ContainsAny(part, " \t\n\"'\\") {
			quoted = append(quoted, strconv.Quote(part))
			continue
		}
		quoted = append(quoted, part)
	}
	return strings.Join(quoted, " ")
}

func launcherOpenModePointer(mode *launcher.LauncherOpenMode) *string {
	if mode == nil {
		return nil
	}
	value := string(*mode)
	return &value
}

func launcherWorkspaceBehaviorPointer(mode *launcher.LauncherWorkspaceBehavior) *string {
	if mode == nil {
		return nil
	}
	value := string(*mode)
	return &value
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneBoolPointer(value *bool) *bool {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	return append([]string(nil), values...)
}

func cloneStringMap(values map[string]string) map[string]string {
	if values == nil {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func pointerToStatusPayload(payload launcherStatusPayload) *launcherStatusPayload {
	return &payload
}

func stringPointer(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	trimmed := strings.TrimSpace(value)
	return &trimmed
}

func stringPointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
