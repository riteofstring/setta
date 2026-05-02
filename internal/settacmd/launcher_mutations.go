package settacmd

import (
	"flag"
	"fmt"
	"io"
)

func runLauncherRepair(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	flags := flag.NewFlagSet("launcher repair", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	jsonOutput := flags.Bool("json", false, "Emit JSON payload only.")
	if err := flags.Parse(args); err != nil {
		return emitLauncherFlagParseError(stderr, flags, err)
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
	flags.SetOutput(io.Discard)
	jsonOutput := flags.Bool("json", false, "Emit JSON payload only.")
	if err := flags.Parse(args); err != nil {
		return emitLauncherFlagParseError(stderr, flags, err)
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
	flags.SetOutput(io.Discard)
	jsonOutput := flags.Bool("json", false, "Emit JSON payload only.")
	packageSpec := flags.String("package", "setta", "Package spec passed to uv tool install --upgrade.")
	if err := flags.Parse(args); err != nil {
		return emitLauncherFlagParseError(stderr, flags, err)
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
