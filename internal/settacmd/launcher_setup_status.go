package settacmd

import (
	"flag"
	"fmt"
	"io"

	"setta/internal/launcher"
)

func runLauncherSetup(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	flags := flag.NewFlagSet("launcher setup", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
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
		return emitLauncherFlagParseError(stderr, flags, err)
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("launcher setup does not accept positional arguments")
	}
	setupInput, failure := prepareLauncherSetupInput(parsed)
	if failure != nil {
		return failure.emit(stdout, stderr, parsed.jsonOutput)
	}
	settaHome, manager, failure := loadLauncherManagementContext(global, cwd, envLookup)
	if failure != nil {
		return failure.emit(stdout, stderr, parsed.jsonOutput)
	}
	if _, err := manager.Setup(settaHome, setupInput); err != nil {
		return emitLauncherSetupError(stdout, stderr, parsed.jsonOutput, err)
	}
	status, err := manager.CollectStatus(settaHome)
	if err != nil {
		return emitLauncherSetupError(stdout, stderr, parsed.jsonOutput, err)
	}
	return writeLauncherSetupResponse(stdout, parsed.jsonOutput, launcherStatusPayloadFromSnapshot(status))
}

func runLauncherStatus(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	flags := flag.NewFlagSet("launcher status", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	jsonOutput := flags.Bool("json", false, "Emit JSON payload only.")
	if err := flags.Parse(args); err != nil {
		return emitLauncherFlagParseError(stderr, flags, err)
	}
	if len(flags.Args()) != 0 {
		return fmt.Errorf("launcher status does not accept positional arguments")
	}
	settaHome, manager, failure := loadLauncherManagementContext(global, cwd, envLookup)
	if failure != nil {
		return failure.emit(stdout, stderr, *jsonOutput)
	}
	status, err := manager.CollectStatus(settaHome)
	if err != nil {
		return emitLauncherSetupError(stdout, stderr, *jsonOutput, err)
	}
	payload := launcherStatusPayloadFromSnapshot(status)
	if *jsonOutput {
		return writeJSONPayload(stdout, payload)
	}
	return writeLauncherStatusText(stdout, payload)
}

func prepareLauncherSetupInput(parsed launcherSetupFlags) (launcher.LauncherSetupInput, *launcherCommandFailure) {
	if parsed.clearArtifactOptions && len(parsed.artifactOptionSpecs.values) != 0 {
		return launcher.LauncherSetupInput{}, newLauncherCommandFailure("BadRequest", "Use either --artifact-option or --clear-artifact-options, not both.", 2)
	}
	artifactOptions, err := parseLauncherArtifactOptionSpecs(parsed.artifactOptionSpecs.values, parsed.clearArtifactOptions)
	if err != nil {
		return launcher.LauncherSetupInput{}, newLauncherCommandFailure("BadRequest", err.Error(), 2)
	}
	installSource, err := normalizeLauncherInstallSource(parsed.installSource)
	if err != nil {
		return launcher.LauncherSetupInput{}, newLauncherCommandFailure("BadRequest", err.Error(), 2)
	}
	openMode, err := normalizeLauncherOpenMode(parsed.openMode)
	if err != nil {
		return launcher.LauncherSetupInput{}, newLauncherCommandFailure("BadRequest", err.Error(), 2)
	}
	workspaceBehavior, err := normalizeLauncherWorkspaceBehavior(parsed.workspaceBehavior)
	if err != nil {
		return launcher.LauncherSetupInput{}, newLauncherCommandFailure("BadRequest", err.Error(), 2)
	}
	return launcher.LauncherSetupInput{
		Channel:           stringPointer(parsed.channel),
		InstallSource:     installSource,
		OpenMode:          openMode,
		WorkspaceBehavior: workspaceBehavior,
		InstallArtifacts:  parsed.installArtifacts.value,
		ArtifactOptions:   artifactOptions,
	}, nil
}

func writeLauncherSetupResponse(stdout io.Writer, jsonOutput bool, payload launcherStatusPayload) error {
	if jsonOutput {
		return writeJSONPayload(stdout, payload)
	}
	fmt.Fprintf(stdout, "Launcher metadata written: %s\n", payload.MetadataPath)
	fmt.Fprintf(stdout, "Target command: %s\n", shellJoin(payload.TargetCommand))
	return nil
}

func writeLauncherStatusText(stdout io.Writer, payload launcherStatusPayload) error {
	if !payload.Installed {
		fmt.Fprintln(stdout, "Launcher status: not installed")
		fmt.Fprintln(stdout, "Run `setta launcher setup` to install launcher metadata.")
		return nil
	}
	fmt.Fprintln(stdout, "Launcher status: installed")
	fmt.Fprintf(stdout, "Metadata: %s\n", payload.MetadataPath)
	fmt.Fprintf(stdout, "Target: %s\n", shellJoin(payload.TargetCommand))
	writeOptionalLauncherStatusLine(stdout, "Channel", payload.Channel)
	writeOptionalLauncherStatusValue(stdout, "Update capability", payload.UpdateCapability)
	writeOptionalLauncherStatusLine(stdout, "Update guidance", payload.UpdateGuidance)
	writeOptionalLauncherStatusLine(stdout, "Target error", payload.TargetError)
	writeLauncherStatusMissingArtifacts(stdout, payload.MissingManagedArtifacts)
	return nil
}

func writeOptionalLauncherStatusLine(stdout io.Writer, label string, value *string) {
	if value == nil {
		return
	}
	fmt.Fprintf(stdout, "%s: %s\n", label, *value)
}

func writeOptionalLauncherStatusValue(stdout io.Writer, label string, value string) {
	if value == "" {
		return
	}
	fmt.Fprintf(stdout, "%s: %s\n", label, value)
}

func writeLauncherStatusMissingArtifacts(stdout io.Writer, missingPaths []string) {
	if len(missingPaths) == 0 {
		return
	}
	fmt.Fprintln(stdout, "Missing managed artifacts:")
	for _, path := range missingPaths {
		fmt.Fprintf(stdout, "  - %s\n", path)
	}
}
