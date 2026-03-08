package settacmd

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

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
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return runLauncherRoot(args, stdout, stderr)
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
		return fmt.Errorf("unknown launcher command %q", args[0])
	}
}

func runLauncherRoot(args []string, stdout io.Writer, stderr io.Writer) error {
	flags := flag.NewFlagSet("launcher", flag.ContinueOnError)
	flags.SetOutput(stderr)
	jsonOutput := flags.Bool("json", false, "Emit JSON payload only.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("launcher run does not accept positional arguments")
	}
	return emitLauncherCommandError(
		stdout,
		stderr,
		*jsonOutput,
		"NotImplemented",
		"launcher run is not implemented in cmd/setta yet",
		2,
	)
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
