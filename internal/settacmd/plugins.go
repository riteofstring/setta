package settacmd

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"strings"

	"setta/internal/config"
	"setta/internal/plugins"
	"setta/internal/pythonenv"
)

type pluginsFlags struct {
	jsonOutput bool
}

type pluginsInstallFlags struct {
	jsonOutput      bool
	scope           string
	globalScope     bool
	settaFilesScope bool
	noEnable        bool
	force           bool
	installer       plugins.PluginInstallerBackend
}

type pluginsUpdateFlags struct {
	jsonOutput      bool
	scope           string
	globalScope     bool
	settaFilesScope bool
	to              string
}

type pluginsInitFlags struct {
	template string
	outDir   string
}

type pluginsScopedMutationFlags struct {
	jsonOutput      bool
	scope           string
	globalScope     bool
	settaFilesScope bool
	noEnable        bool
	force           bool
}

type pluginsEnableDisableFlags struct {
	jsonOutput bool
}

type pluginsLockApplyFlags struct {
	jsonOutput bool
	check      bool
}

type pluginsRescanJSON struct {
	ServerMode       config.Mode `json:"serverMode"`
	InstalledPlugins int         `json:"installedPlugins"`
	ActivePlugins    int         `json:"activePlugins"`
}

func runPlugins(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	if len(args) == 0 {
		return writePluginsUsage(stdout)
	}
	if args[0] == "-h" || args[0] == "--help" {
		return writePluginsUsage(stdout)
	}

	switch args[0] {
	case "init":
		return runPluginsInit(args[1:], global, stdout, stderr, envLookup, cwd)
	case "validate":
		return runPluginsValidate(args[1:], global, stdout, stderr, envLookup, cwd)
	case "list":
		return runPluginsList(args[1:], global, stdout, stderr, envLookup, cwd)
	case "install":
		return runPluginsInstall(args[1:], global, stdout, stderr, envLookup, cwd)
	case "update":
		return runPluginsUpdate(args[1:], global, stdout, stderr, envLookup, cwd)
	case "pin":
		return runPluginsPin(args[1:], global, stdout, stderr, envLookup, cwd)
	case "rescan":
		return runPluginsRescan(args[1:], global, stdout, stderr, envLookup, cwd)
	case "restart":
		return runPluginsRestart(args[1:], global, stdout, stderr, envLookup, cwd)
	case "restart-required":
		return runPluginsRestartRequired(args[1:], global, stdout, stderr, envLookup, cwd)
	case "link":
		return runPluginsLink(args[1:], global, stdout, stderr, envLookup, cwd)
	case "enable":
		return runPluginsEnable(args[1:], global, stdout, stderr, envLookup, cwd)
	case "disable":
		return runPluginsDisable(args[1:], global, stdout, stderr, envLookup, cwd)
	case "uninstall":
		return runPluginsUninstall(args[1:], global, stdout, stderr, envLookup, cwd)
	case "rollback":
		return runPluginsRollback(args[1:], global, stdout, stderr, envLookup, cwd)
	case "lock":
		return runPluginsLock(args[1:], global, stdout, stderr, envLookup, cwd)
	default:
		err := fmt.Errorf("unknown plugins subcommand %q", args[0])
		if writeErr := writeUsageError(stderr, err.Error(), writePluginsUsage); writeErr != nil {
			return writeErr
		}
		return &ExitError{Code: 2, Err: err, Silent: true}
	}
}

func runPluginsLock(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	if len(args) == 0 {
		return writePluginsLockUsage(stdout)
	}
	if args[0] == "-h" || args[0] == "--help" {
		return writePluginsLockUsage(stdout)
	}

	switch args[0] {
	case "write":
		return runPluginsLockWrite(args[1:], global, stdout, stderr, envLookup, cwd)
	case "apply":
		return runPluginsLockApply(args[1:], global, stdout, stderr, envLookup, cwd)
	default:
		err := fmt.Errorf("unknown plugins lock subcommand %q", args[0])
		if writeErr := writeUsageError(stderr, err.Error(), writePluginsLockUsage); writeErr != nil {
			return writeErr
		}
		return &ExitError{Code: 2, Err: err, Silent: true}
	}
}

func runPluginsLockWrite(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, err := parsePluginsFlags("plugins lock write", args, stderr)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	result, err := service.WriteLockfile()
	if err != nil {
		return asPluginsCommandError(err)
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, result)
	}
	_, err = fmt.Fprintf(stdout, "Wrote lockfile %s with %d plugin entries\n", result.LockfilePath, result.PluginCount)
	return err
}

func runPluginsLockApply(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, err := parsePluginsLockApplyFlags("plugins lock apply", args)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	result, err := service.ApplyLockfile(context.Background(), parsed.check)
	if err != nil {
		return asPluginsCommandError(err)
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, result)
	}
	if _, err := fmt.Fprintf(stdout, "Lockfile: %s\n", result.LockfilePath); err != nil {
		return err
	}
	if len(result.PlannedChanges) == 0 {
		if _, err := fmt.Fprintln(stdout, "No plugin changes needed."); err != nil {
			return err
		}
	} else {
		if _, err := fmt.Fprintln(stdout, "Planned changes:"); err != nil {
			return err
		}
		for _, item := range result.PlannedChanges {
			if _, err := fmt.Fprintf(stdout, "- %s\n", item); err != nil {
				return err
			}
		}
	}
	_, err = fmt.Fprintf(stdout, "Applied: %s\n", boolToYesNo(result.Applied))
	return err
}

func runPluginsInit(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, pluginID, err := parsePluginsInitFlags("plugins init", args)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	pluginRoot, err := service.InitTemplate(plugins.InitTemplateOptions{
		PluginID: pluginID,
		Template: parsed.template,
		OutDir:   parsed.outDir,
	})
	if err != nil {
		return asPluginsCommandError(err)
	}
	_, err = fmt.Fprintf(stdout, "Initialized plugin template at %s\n", pluginRoot)
	return err
}

func runPluginsValidate(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	pluginFolder, err := parsePluginsValidateArgs("plugins validate", args)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	_, err = service.ValidateFolder(plugins.ValidateFolderOptions{
		PluginRoot: pluginFolder,
	})
	if err != nil {
		return asPluginsCommandError(err)
	}
	_, err = fmt.Fprintf(stdout, "Plugin manifest is valid: %s\n", pluginFolder)
	return err
}

func runPluginsInstall(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, sourceSpec, err := parsePluginsInstallArgs("plugins install", args)
	if err != nil {
		return err
	}
	resolvedScope, err := resolvePluginsScopeFlag(pluginsScopedMutationFlags{
		scope:           parsed.scope,
		globalScope:     parsed.globalScope,
		settaFilesScope: parsed.settaFilesScope,
	})
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	result, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: sourceSpec,
		Scope:      resolvedScope,
		Installer:  installerPointer(parsed.installer),
		Enable:     !parsed.noEnable,
		Force:      parsed.force,
	})
	if err != nil {
		return asPluginsCommandError(err)
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, buildPluginsInstallCommandJSON(result))
	}
	if _, err := fmt.Fprintf(stdout, "Installed %s %s to %s (%s)\n", result.PluginID, result.Version, result.SourceScope, result.SourcePath); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(stdout, "Source: %s\n", result.CanonicalSourceKey); err != nil {
		return err
	}
	if result.RestartRequired {
		_, err := fmt.Fprintln(stdout, "Backend restart required.")
		return err
	}
	return nil
}

func runPluginsUpdate(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, pluginID, err := parsePluginsUpdateArgs("plugins update", args)
	if err != nil {
		return err
	}
	result, err := runPluginsUpdateLike(parsed, pluginID, global, envLookup, cwd)
	if err != nil {
		return err
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, result)
	}
	if _, err := fmt.Fprintf(stdout, "Updated %s: %s -> %s\n", result.PluginID, result.FromVersion, result.ToVersion); err != nil {
		return err
	}
	if result.RestartRequired {
		_, err := fmt.Fprintln(stdout, "Backend restart required.")
		return err
	}
	return nil
}

func runPluginsPin(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, pluginID, sourceSpecOrVersion, err := parsePluginsPinArgs("plugins pin", args)
	if err != nil {
		return err
	}
	result, err := runPluginsUpdateLike(pluginsUpdateFlags{
		jsonOutput:      parsed.jsonOutput,
		scope:           parsed.scope,
		globalScope:     parsed.globalScope,
		settaFilesScope: parsed.settaFilesScope,
		to:              sourceSpecOrVersion,
	}, pluginID, global, envLookup, cwd)
	if err != nil {
		return err
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, result)
	}
	if _, err := fmt.Fprintf(stdout, "Pinned %s: %s -> %s\n", result.PluginID, result.FromVersion, result.ToVersion); err != nil {
		return err
	}
	if result.RestartRequired {
		_, err := fmt.Fprintln(stdout, "Backend restart required.")
		return err
	}
	return nil
}

func runPluginsUpdateLike(parsed pluginsUpdateFlags, pluginID string, global globalFlags, envLookup func(string) (string, bool), cwd string) (plugins.PluginUpdateResponse, error) {
	resolvedScope, err := resolvePluginsScopeFlag(pluginsScopedMutationFlags{
		scope:           parsed.scope,
		globalScope:     parsed.globalScope,
		settaFilesScope: parsed.settaFilesScope,
	})
	if err != nil {
		return plugins.PluginUpdateResponse{}, err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return plugins.PluginUpdateResponse{}, &ExitError{Code: 2, Err: err}
	}
	result, err := service.Update(context.Background(), plugins.UpdateOptions{
		PluginID: pluginID,
		Scope:    resolvedScope,
		To:       parsed.to,
	})
	if err != nil {
		return plugins.PluginUpdateResponse{}, asPluginsCommandError(err)
	}
	return result, nil
}

func runPluginsList(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, err := parsePluginsFlags("plugins list", args, stderr)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	status, err := service.Status()
	if err != nil {
		return asPluginsCommandError(err)
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, status)
	}
	if len(status.Plugins) == 0 {
		_, err := fmt.Fprintln(stdout, "No plugins discovered.")
		return err
	}
	for _, plugin := range status.Plugins {
		restartSuffix := ""
		if plugin.RestartRequired {
			restartSuffix = " (restart required)"
		}
		componentsSuffix := ""
		if len(plugin.Components) > 0 {
			componentsSuffix = " components=" + strings.Join(plugin.Components, ",")
		}
		shadowedSuffix := ""
		if plugin.ShadowedBySourcePath != nil && strings.TrimSpace(*plugin.ShadowedBySourcePath) != "" {
			shadowedSuffix = " shadowed_by=" + *plugin.ShadowedBySourcePath
		}
		if _, err := fmt.Fprintf(stdout, "%s %s [%s] scope=%s%s%s%s\n", plugin.PluginID, plugin.Version, plugin.State, plugin.SourceScopeLabel, componentsSuffix, restartSuffix, shadowedSuffix); err != nil {
			return err
		}
		for _, pluginErr := range plugin.Errors {
			if _, err := fmt.Fprintf(stdout, "  - %s: %s\n", pluginErr.Code, pluginErr.Message); err != nil {
				return err
			}
		}
	}
	return nil
}

func runPluginsRescan(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, err := parsePluginsFlags("plugins rescan", args, stderr)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	snapshot, err := service.Rescan()
	if err != nil {
		return asPluginsCommandError(err)
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, pluginsRescanJSON{
			ServerMode:       snapshot.ServerMode,
			InstalledPlugins: snapshot.InstalledPlugins,
			ActivePlugins:    snapshot.ActivePlugins,
		})
	}
	_, err = fmt.Fprintf(stdout, "Rescanned plugins: installed=%d active=%d\n", snapshot.InstalledPlugins, snapshot.ActivePlugins)
	return err
}

func runPluginsRestartRequired(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, err := parsePluginsFlags("plugins restart-required", args, stderr)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	summary, err := service.RestartRequiredSummary()
	if err != nil {
		return asPluginsCommandError(err)
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, summary)
	}

	if len(summary.PendingPlugins) == 0 && len(summary.PendingPluginIDsWithoutStatus) == 0 {
		if _, err := fmt.Fprintln(stdout, "No pending restart plugins."); err != nil {
			return err
		}
	} else {
		if _, err := fmt.Fprintln(stdout, "Pending restart plugins:"); err != nil {
			return err
		}
		for _, plugin := range summary.PendingPlugins {
			if _, err := fmt.Fprintf(stdout, "- %s (%s)\n", plugin.PluginID, plugin.Version); err != nil {
				return err
			}
		}
		for _, pluginID := range summary.PendingPluginIDsWithoutStatus {
			if _, err := fmt.Fprintf(stdout, "- %s (status unavailable)\n", pluginID); err != nil {
				return err
			}
		}
	}

	if summary.RestartCapability.Mode == plugins.PluginRestartCapabilityModeProgrammatic {
		_, err := fmt.Fprintln(stdout, "Programmatic restart available: setta plugins restart")
		return err
	}
	if summary.RestartCapability.Command != nil && strings.TrimSpace(*summary.RestartCapability.Command) != "" {
		if _, err := fmt.Fprintf(stdout, "Manual restart command: %s\n", *summary.RestartCapability.Command); err != nil {
			return err
		}
	}
	if summary.RestartCapability.Reason != nil && strings.TrimSpace(*summary.RestartCapability.Reason) != "" {
		if _, err := fmt.Fprintln(stdout, *summary.RestartCapability.Reason); err != nil {
			return err
		}
	}
	return nil
}

func runPluginsRestart(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, err := parsePluginsFlags("plugins restart", args, stderr)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	result, err := service.Restart(context.Background())
	if err != nil {
		return asPluginsCommandError(err)
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, result)
	}
	if result.Accepted {
		_, err := fmt.Fprintln(stdout, "Restart request accepted.")
		return err
	}
	if _, err := fmt.Fprintln(stdout, "Programmatic restart unavailable."); err != nil {
		return err
	}
	if result.Command != nil && strings.TrimSpace(*result.Command) != "" {
		if _, err := fmt.Fprintf(stdout, "Run: %s\n", *result.Command); err != nil {
			return err
		}
	}
	if result.Reason != nil && strings.TrimSpace(*result.Reason) != "" {
		if _, err := fmt.Fprintln(stdout, *result.Reason); err != nil {
			return err
		}
	}
	return nil
}

func runPluginsLink(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, pluginRoot, err := parsePluginsLinkArgs("plugins link", args)
	if err != nil {
		return err
	}
	resolvedScope, err := resolvePluginsScopeFlag(parsed)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	result, err := service.Link(plugins.LinkOptions{
		LocalPluginRoot: pluginRoot,
		Scope:           resolvedScope,
		Enable:          !parsed.noEnable,
		Force:           parsed.force,
	})
	if err != nil {
		return asPluginsCommandError(err)
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, buildPluginsInstallCommandJSON(result))
	}
	if _, err := fmt.Fprintf(stdout, "Linked %s from %s into %s\n", result.PluginID, pluginRoot, result.SourceScope); err != nil {
		return err
	}
	if result.RestartRequired {
		_, err := fmt.Fprintln(stdout, "Backend restart required.")
		return err
	}
	return nil
}

func runPluginsEnable(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, pluginID, err := parsePluginsEnableDisableArgs("plugins enable", args)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	result, err := service.Enable(context.Background(), plugins.EnableDisableOptions{
		PluginID: pluginID,
	})
	if err != nil {
		return asPluginsCommandError(err)
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, result)
	}
	if _, err := fmt.Fprintf(stdout, "%s -> %s\n", result.PluginID, result.State); err != nil {
		return err
	}
	if result.RestartRequired {
		_, err := fmt.Fprintln(stdout, "Backend restart required.")
		return err
	}
	return nil
}

func runPluginsDisable(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, pluginID, err := parsePluginsEnableDisableArgs("plugins disable", args)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	result, err := service.Disable(context.Background(), plugins.EnableDisableOptions{
		PluginID: pluginID,
	})
	if err != nil {
		return asPluginsCommandError(err)
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, result)
	}
	if _, err := fmt.Fprintf(stdout, "%s -> %s\n", result.PluginID, result.State); err != nil {
		return err
	}
	if result.RestartRequired {
		_, err := fmt.Fprintln(stdout, "Backend restart required.")
		return err
	}
	return nil
}

func runPluginsUninstall(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, pluginID, err := parsePluginsScopedMutationFlags("plugins uninstall", args, stderr)
	if err != nil {
		return err
	}
	resolvedScope, err := resolvePluginsScopeFlag(parsed)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	result, err := service.Uninstall(context.Background(), plugins.UninstallOptions{
		PluginID: pluginID,
		Scope:    resolvedScope,
	})
	if err != nil {
		return asPluginsCommandError(err)
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, result)
	}
	if _, err := fmt.Fprintf(stdout, "Uninstalled %s from %s scope\n", result.PluginID, result.RemovedFromScope); err != nil {
		return err
	}
	if result.RestartRequired {
		_, err := fmt.Fprintln(stdout, "Backend restart required.")
		return err
	}
	return nil
}

func runPluginsRollback(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	parsed, pluginID, err := parsePluginsScopedMutationFlags("plugins rollback", args, stderr)
	if err != nil {
		return err
	}
	resolvedScope, err := resolvePluginsScopeFlag(parsed)
	if err != nil {
		return err
	}

	service, err := resolvePluginsService(global, envLookup, cwd)
	if err != nil {
		return &ExitError{Code: 2, Err: err}
	}
	result, err := service.Rollback(context.Background(), plugins.RollbackOptions{
		PluginID: pluginID,
		Scope:    resolvedScope,
	})
	if err != nil {
		return asPluginsCommandError(err)
	}
	if parsed.jsonOutput {
		return writeJSONPayload(stdout, result)
	}
	if _, err := fmt.Fprintf(stdout, "Rolled back %s to version %s\n", result.PluginID, result.RestoredVersion); err != nil {
		return err
	}
	if result.RestartRequired {
		_, err := fmt.Fprintln(stdout, "Backend restart required.")
		return err
	}
	return nil
}

func parsePluginsFlags(name string, args []string, stderr io.Writer) (pluginsFlags, error) {
	flags := flag.NewFlagSet(name, flag.ContinueOnError)
	flags.SetOutput(stderr)

	var parsed pluginsFlags
	flags.BoolVar(&parsed.jsonOutput, "json", false, "Emit JSON output.")
	if err := flags.Parse(args); err != nil {
		return pluginsFlags{}, err
	}
	if len(flags.Args()) != 0 {
		return pluginsFlags{}, &ExitError{Code: 2, Err: fmt.Errorf("%s does not accept positional arguments", name)}
	}
	return parsed, nil
}

func parsePluginsInstallArgs(name string, args []string) (pluginsInstallFlags, string, error) {
	parsed := pluginsInstallFlags{
		installer: plugins.PluginInstallerBackendAuto,
	}
	sourceSpec := ""
	for index := 0; index < len(args); index++ {
		token := strings.TrimSpace(args[index])
		switch {
		case token == "--json":
			parsed.jsonOutput = true
		case token == "--global":
			parsed.globalScope = true
		case token == "--setta-files":
			parsed.settaFilesScope = true
		case token == "--no-enable":
			parsed.noEnable = true
		case token == "--force":
			parsed.force = true
		case token == "--scope":
			if index+1 >= len(args) {
				return pluginsInstallFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("missing value for --scope")}
			}
			index++
			parsed.scope = strings.TrimSpace(args[index])
		case strings.HasPrefix(token, "--scope="):
			parsed.scope = strings.TrimSpace(strings.TrimPrefix(token, "--scope="))
		case token == "--installer":
			if index+1 >= len(args) {
				return pluginsInstallFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("missing value for --installer")}
			}
			index++
			installer, err := parsePluginInstallerBackend(args[index])
			if err != nil {
				return pluginsInstallFlags{}, "", err
			}
			parsed.installer = installer
		case strings.HasPrefix(token, "--installer="):
			installer, err := parsePluginInstallerBackend(strings.TrimPrefix(token, "--installer="))
			if err != nil {
				return pluginsInstallFlags{}, "", err
			}
			parsed.installer = installer
		case strings.HasPrefix(token, "-"):
			return pluginsInstallFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		case sourceSpec != "":
			return pluginsInstallFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one source spec", name)}
		default:
			sourceSpec = token
		}
	}
	if sourceSpec == "" {
		return pluginsInstallFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one source spec", name)}
	}
	return parsed, sourceSpec, nil
}

func parsePluginsInitFlags(name string, args []string) (pluginsInitFlags, string, error) {
	parsed := pluginsInitFlags{template: "full"}
	pluginID := ""
	for index := 0; index < len(args); index++ {
		token := strings.TrimSpace(args[index])
		switch {
		case token == "--template":
			if index+1 >= len(args) {
				return pluginsInitFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("missing value for --template")}
			}
			index++
			parsed.template = strings.TrimSpace(args[index])
		case strings.HasPrefix(token, "--template="):
			parsed.template = strings.TrimSpace(strings.TrimPrefix(token, "--template="))
		case token == "--out":
			if index+1 >= len(args) {
				return pluginsInitFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("missing value for --out")}
			}
			index++
			parsed.outDir = strings.TrimSpace(args[index])
		case strings.HasPrefix(token, "--out="):
			parsed.outDir = strings.TrimSpace(strings.TrimPrefix(token, "--out="))
		case strings.HasPrefix(token, "-"):
			return pluginsInitFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		case pluginID != "":
			return pluginsInitFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id", name)}
		default:
			pluginID = token
		}
	}
	if pluginID == "" {
		return pluginsInitFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id", name)}
	}
	return parsed, pluginID, nil
}

func parsePluginsUpdateArgs(name string, args []string) (pluginsUpdateFlags, string, error) {
	var parsed pluginsUpdateFlags
	pluginID := ""
	for index := 0; index < len(args); index++ {
		token := strings.TrimSpace(args[index])
		switch {
		case token == "--json":
			parsed.jsonOutput = true
		case token == "--global":
			parsed.globalScope = true
		case token == "--setta-files":
			parsed.settaFilesScope = true
		case token == "--scope":
			if index+1 >= len(args) {
				return pluginsUpdateFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("missing value for --scope")}
			}
			index++
			parsed.scope = strings.TrimSpace(args[index])
		case strings.HasPrefix(token, "--scope="):
			parsed.scope = strings.TrimSpace(strings.TrimPrefix(token, "--scope="))
		case token == "--to":
			if index+1 >= len(args) {
				return pluginsUpdateFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("missing value for --to")}
			}
			index++
			parsed.to = strings.TrimSpace(args[index])
		case strings.HasPrefix(token, "--to="):
			parsed.to = strings.TrimSpace(strings.TrimPrefix(token, "--to="))
		case strings.HasPrefix(token, "-"):
			return pluginsUpdateFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		case pluginID != "":
			return pluginsUpdateFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id", name)}
		default:
			pluginID = token
		}
	}
	if pluginID == "" {
		return pluginsUpdateFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id", name)}
	}
	return parsed, pluginID, nil
}

func parsePluginsPinArgs(name string, args []string) (pluginsScopedMutationFlags, string, string, error) {
	var parsed pluginsScopedMutationFlags
	pluginID := ""
	sourceSpecOrVersion := ""
	for index := 0; index < len(args); index++ {
		token := strings.TrimSpace(args[index])
		switch {
		case token == "--json":
			parsed.jsonOutput = true
		case token == "--global":
			parsed.globalScope = true
		case token == "--setta-files":
			parsed.settaFilesScope = true
		case token == "--scope":
			if index+1 >= len(args) {
				return pluginsScopedMutationFlags{}, "", "", &ExitError{Code: 2, Err: fmt.Errorf("missing value for --scope")}
			}
			index++
			parsed.scope = strings.TrimSpace(args[index])
		case strings.HasPrefix(token, "--scope="):
			parsed.scope = strings.TrimSpace(strings.TrimPrefix(token, "--scope="))
		case strings.HasPrefix(token, "-"):
			return pluginsScopedMutationFlags{}, "", "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		case pluginID == "":
			pluginID = token
		case sourceSpecOrVersion == "":
			sourceSpecOrVersion = token
		default:
			return pluginsScopedMutationFlags{}, "", "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id and one source spec or version", name)}
		}
	}
	if pluginID == "" || sourceSpecOrVersion == "" {
		return pluginsScopedMutationFlags{}, "", "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id and one source spec or version", name)}
	}
	return parsed, pluginID, sourceSpecOrVersion, nil
}

func parsePluginsValidateArgs(name string, args []string) (string, error) {
	pluginFolder := ""
	for _, rawToken := range args {
		token := strings.TrimSpace(rawToken)
		switch {
		case strings.HasPrefix(token, "-"):
			return "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		case pluginFolder != "":
			return "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin folder", name)}
		default:
			pluginFolder = token
		}
	}
	if pluginFolder == "" {
		return "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin folder", name)}
	}
	return pluginFolder, nil
}

func parsePluginsEnableDisableArgs(name string, args []string) (pluginsEnableDisableFlags, string, error) {
	var parsed pluginsEnableDisableFlags
	pluginID := ""
	for index := 0; index < len(args); index++ {
		token := strings.TrimSpace(args[index])
		switch {
		case token == "--json":
			parsed.jsonOutput = true
		case strings.HasPrefix(token, "-"):
			return pluginsEnableDisableFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		case pluginID != "":
			return pluginsEnableDisableFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id", name)}
		default:
			pluginID = token
		}
	}
	if pluginID == "" {
		return pluginsEnableDisableFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id", name)}
	}
	return parsed, pluginID, nil
}

func parsePluginsLockApplyFlags(name string, args []string) (pluginsLockApplyFlags, error) {
	var parsed pluginsLockApplyFlags
	for _, rawToken := range args {
		token := strings.TrimSpace(rawToken)
		switch token {
		case "--json":
			parsed.jsonOutput = true
		case "--check":
			parsed.check = true
		default:
			if strings.HasPrefix(token, "-") {
				return pluginsLockApplyFlags{}, &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
			}
			return pluginsLockApplyFlags{}, &ExitError{Code: 2, Err: fmt.Errorf("%s does not accept positional arguments", name)}
		}
	}
	return parsed, nil
}

func parsePluginsScopedMutationFlags(name string, args []string, _ io.Writer) (pluginsScopedMutationFlags, string, error) {
	var parsed pluginsScopedMutationFlags
	pluginID := ""
	for index := 0; index < len(args); index++ {
		token := strings.TrimSpace(args[index])
		switch {
		case token == "--json":
			parsed.jsonOutput = true
		case token == "--global":
			parsed.globalScope = true
		case token == "--setta-files":
			parsed.settaFilesScope = true
		case token == "--scope":
			if index+1 >= len(args) {
				return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("missing value for --scope")}
			}
			index++
			parsed.scope = strings.TrimSpace(args[index])
		case strings.HasPrefix(token, "--scope="):
			parsed.scope = strings.TrimSpace(strings.TrimPrefix(token, "--scope="))
		case strings.HasPrefix(token, "-"):
			return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		case pluginID != "":
			return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id", name)}
		default:
			pluginID = token
		}
	}
	if pluginID == "" {
		return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id", name)}
	}
	return parsed, pluginID, nil
}

func parsePluginsLinkArgs(name string, args []string) (pluginsScopedMutationFlags, string, error) {
	var parsed pluginsScopedMutationFlags
	pluginRoot := ""
	for index := 0; index < len(args); index++ {
		token := strings.TrimSpace(args[index])
		switch {
		case token == "--json":
			parsed.jsonOutput = true
		case token == "--no-enable":
			parsed.noEnable = true
		case token == "--force":
			parsed.force = true
		case token == "--global":
			parsed.globalScope = true
		case token == "--setta-files":
			parsed.settaFilesScope = true
		case token == "--scope":
			if index+1 >= len(args) {
				return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("missing value for --scope")}
			}
			index++
			parsed.scope = strings.TrimSpace(args[index])
		case strings.HasPrefix(token, "--scope="):
			parsed.scope = strings.TrimSpace(strings.TrimPrefix(token, "--scope="))
		case strings.HasPrefix(token, "-"):
			return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		case pluginRoot != "":
			return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one local plugin root", name)}
		default:
			pluginRoot = token
		}
	}
	if pluginRoot == "" {
		return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one local plugin root", name)}
	}
	return parsed, pluginRoot, nil
}

func resolvePluginsScopeFlag(parsed pluginsScopedMutationFlags) (*plugins.PluginScope, error) {
	if strings.TrimSpace(parsed.scope) != "" && (parsed.globalScope || parsed.settaFilesScope) {
		return nil, &ExitError{Code: 2, Err: fmt.Errorf("Use either --scope or scope shortcut flags, not both.")}
	}
	if parsed.globalScope && parsed.settaFilesScope {
		return nil, &ExitError{Code: 2, Err: fmt.Errorf("Use only one of --global or --setta-files.")}
	}
	if parsed.globalScope {
		scope := plugins.PluginScopeGlobal
		return &scope, nil
	}
	if parsed.settaFilesScope {
		scope := plugins.PluginScopeSettaFiles
		return &scope, nil
	}
	if strings.TrimSpace(parsed.scope) == "" {
		return nil, nil
	}
	scope := plugins.PluginScope(strings.TrimSpace(parsed.scope))
	normalizedScope, err := plugins.NormalizeScope(&scope)
	if err != nil {
		return nil, &ExitError{Code: 2, Err: err}
	}
	return &normalizedScope, nil
}

func resolvePluginsService(global globalFlags, envLookup func(string) (string, bool), cwd string) (*plugins.Service, error) {
	commandCfg, err := resolvePluginsCommandConfig(global, cwd, envLookup)
	if err != nil {
		return nil, err
	}

	pythonRuntime, err := pythonenv.NewRuntime(pythonenv.RuntimeOptions{
		LookupEnv: envLookup,
	})
	if err != nil {
		return nil, err
	}

	candidateProvider := plugins.NewProductionCandidateProvider(plugins.ProductionCandidateProviderOptions{
		PackageManagerRuntime: pythonRuntime,
		SettaFilesRoot:        commandCfg.Paths.SettaFilesRoot,
	})

	return plugins.NewService(plugins.ServiceOptions{
		WorkspaceRoot:         commandCfg.Paths.WorkspaceRoot,
		SettaFilesRoot:        commandCfg.Paths.SettaFilesRoot,
		SettaHome:             commandCfg.Paths.SettaHome,
		ServerMode:            commandCfg.Server.Mode,
		RestartCommand:        "setta",
		CandidateProvider:     candidateProvider,
		PackageManagerRuntime: pythonRuntime,
	})
}

func resolvePluginsCommandConfig(global globalFlags, cwd string, envLookup func(string) (string, bool)) (config.Config, error) {
	return config.Load(config.LoadOptions{
		CWD:       cwd,
		EnvLookup: envLookup,
		CLI: config.CLIOptions{
			WorkspaceRoot:      strings.TrimSpace(global.workspaceRoot),
			SettaHome:          strings.TrimSpace(global.settaHome),
			ProfileLookupHome:  strings.TrimSpace(global.profileLookupHome),
			SettaFilesRoot:     strings.TrimSpace(global.settaFilesRoot),
			SettaFilesLocation: strings.TrimSpace(global.settaFilesLocation),
			RuntimeRoot:        strings.TrimSpace(global.runtimeRoot),
			Profile:            strings.TrimSpace(global.profile),
		},
	})
}

func asPluginsCommandError(err error) error {
	var serviceErr *plugins.ServiceError
	if errors.As(err, &serviceErr) {
		return &ExitError{
			Code: 1,
			Err:  fmt.Errorf("%s: %s", serviceErr.Code, serviceErr.Message),
		}
	}
	return err
}

func buildPluginsInstallCommandJSON(result plugins.PluginInstallResponse) map[string]any {
	return map[string]any{
		"pluginId":              result.PluginID,
		"version":               result.Version,
		"sourceScope":           result.SourceScope,
		"sourceScopeLabel":      string(result.SourceScope),
		"sourcePath":            result.SourcePath,
		"canonicalSourceKey":    result.CanonicalSourceKey,
		"sourceDigestSha256":    result.SourceDigestSHA256,
		"requestedCapabilities": append([]string(nil), result.RequestedCapabilities...),
		"trustStatus":           "unverified",
		"trustWarning":          "Source is unverified. Install only from trusted owners.",
		"components":            append([]string(nil), result.Components...),
		"state":                 result.State,
		"restartRequired":       result.RestartRequired,
	}
}

func parsePluginInstallerBackend(raw string) (plugins.PluginInstallerBackend, error) {
	switch strings.TrimSpace(raw) {
	case string(plugins.PluginInstallerBackendAuto):
		return plugins.PluginInstallerBackendAuto, nil
	case string(plugins.PluginInstallerBackendPip):
		return plugins.PluginInstallerBackendPip, nil
	case string(plugins.PluginInstallerBackendUV):
		return plugins.PluginInstallerBackendUV, nil
	default:
		return "", &ExitError{Code: 2, Err: fmt.Errorf("invalid plugin installer backend %q (supported: auto, pip, uv)", raw)}
	}
}

func installerPointer(installer plugins.PluginInstallerBackend) *plugins.PluginInstallerBackend {
	resolvedInstaller := installer
	return &resolvedInstaller
}

func boolToYesNo(value bool) string {
	if value {
		return "yes"
	}
	return "no"
}
