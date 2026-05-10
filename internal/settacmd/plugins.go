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
	pluginsScopedMutationFlags
	installer plugins.PluginInstallerBackend
}

type pluginsUpdateFlags struct {
	pluginsScopedMutationFlags
	to string
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

type pluginsCommandRunner func([]string, globalFlags, io.Writer, io.Writer, func(string) (string, bool), string) error

var pluginsSubcommands = map[string]pluginsCommandRunner{
	"init":             runPluginsInit,
	"validate":         runPluginsValidate,
	"list":             runPluginsList,
	"install":          runPluginsInstall,
	"update":           runPluginsUpdate,
	"pin":              runPluginsPin,
	"rescan":           runPluginsRescan,
	"restart":          runPluginsRestart,
	"restart-required": runPluginsRestartRequired,
	"link":             runPluginsLink,
	"enable":           runPluginsEnable,
	"disable":          runPluginsDisable,
	"uninstall":        runPluginsUninstall,
	"rollback":         runPluginsRollback,
	"lock":             runPluginsLock,
}

var pluginsLockSubcommands = map[string]pluginsCommandRunner{
	"write": runPluginsLockWrite,
	"apply": runPluginsLockApply,
}

func runPlugins(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	return runPluginsSubcommand("plugins", args, global, stdout, stderr, envLookup, cwd, writePluginsUsage, pluginsSubcommands)
}

func runPluginsLock(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	return runPluginsSubcommand("plugins lock", args, global, stdout, stderr, envLookup, cwd, writePluginsLockUsage, pluginsLockSubcommands)
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
		pluginsScopedMutationFlags: pluginsScopedMutationFlags{
			jsonOutput:      parsed.jsonOutput,
			scope:           parsed.scope,
			globalScope:     parsed.globalScope,
			settaFilesScope: parsed.settaFilesScope,
		},
		to: sourceSpecOrVersion,
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
	return writePluginsListText(stdout, status)
}

func writePluginsListText(stdout io.Writer, status plugins.PluginStatusResponse) error {
	if len(status.Plugins) == 0 {
		_, err := fmt.Fprintln(stdout, "No plugins discovered.")
		return err
	}
	for _, plugin := range status.Plugins {
		if err := writePluginsListEntry(stdout, plugin); err != nil {
			return err
		}
	}
	return nil
}

func writePluginsListEntry(stdout io.Writer, plugin plugins.PluginStatusEntry) error {
	if _, err := fmt.Fprintf(
		stdout,
		"%s %s [%s] scope=%s%s\n",
		plugin.PluginID,
		plugin.Version,
		plugin.State,
		plugin.SourceScopeLabel,
		pluginsListEntrySuffix(plugin),
	); err != nil {
		return err
	}
	for _, pluginErr := range plugin.Errors {
		if _, err := fmt.Fprintf(stdout, "  - %s: %s\n", pluginErr.Code, pluginErr.Message); err != nil {
			return err
		}
	}
	return nil
}

func pluginsListEntrySuffix(plugin plugins.PluginStatusEntry) string {
	return pluginsComponentsSuffix(plugin.Components) +
		pluginsRestartRequiredSuffix(plugin.RestartRequired) +
		pluginsShadowedBySuffix(plugin.ShadowedBySourcePath)
}

func pluginsComponentsSuffix(components []string) string {
	if len(components) == 0 {
		return ""
	}
	return " components=" + strings.Join(components, ",")
}

func pluginsRestartRequiredSuffix(required bool) string {
	if !required {
		return ""
	}
	return " (restart required)"
}

func pluginsShadowedBySuffix(shadowedBy *string) string {
	trimmed, ok := pluginsTrimmedText(shadowedBy)
	if !ok {
		return ""
	}
	return " shadowed_by=" + trimmed
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
	return writePluginsRestartSummary(stdout, summary)
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
	return writePluginsRestartCapabilityDetails(stdout, result.Command, result.Reason, "Run: %s\n")
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

func runPluginsSubcommand(
	name string,
	args []string,
	global globalFlags,
	stdout io.Writer,
	stderr io.Writer,
	envLookup func(string) (string, bool),
	cwd string,
	usage func(io.Writer) error,
	handlers map[string]pluginsCommandRunner,
) error {
	if len(args) == 0 || isPluginsHelpArg(args[0]) {
		return usage(stdout)
	}

	handler, ok := handlers[args[0]]
	if !ok {
		err := fmt.Errorf("unknown %s subcommand %q", name, args[0])
		if writeErr := writeUsageError(stderr, err.Error(), usage); writeErr != nil {
			return writeErr
		}
		return &ExitError{Code: 2, Err: err, Silent: true}
	}
	return handler(args[1:], global, stdout, stderr, envLookup, cwd)
}

func isPluginsHelpArg(arg string) bool {
	return arg == "-h" || arg == "--help"
}

func writePluginsRestartSummary(stdout io.Writer, summary plugins.RestartRequiredResponse) error {
	if err := writePluginsPendingRestartEntries(stdout, summary); err != nil {
		return err
	}
	if summary.RestartCapability.Mode == plugins.PluginRestartCapabilityModeProgrammatic {
		_, err := fmt.Fprintln(stdout, "Programmatic restart available: setta plugins restart")
		return err
	}
	return writePluginsRestartCapabilityDetails(
		stdout,
		summary.RestartCapability.Command,
		summary.RestartCapability.Reason,
		"Manual restart command: %s\n",
	)
}

func writePluginsPendingRestartEntries(stdout io.Writer, summary plugins.RestartRequiredResponse) error {
	if len(summary.PendingPlugins) == 0 && len(summary.PendingPluginIDsWithoutStatus) == 0 {
		_, err := fmt.Fprintln(stdout, "No pending restart plugins.")
		return err
	}
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
	return nil
}

func writePluginsRestartCapabilityDetails(stdout io.Writer, command *string, reason *string, commandFormat string) error {
	if trimmedCommand, ok := pluginsTrimmedText(command); ok {
		if _, err := fmt.Fprintf(stdout, commandFormat, trimmedCommand); err != nil {
			return err
		}
	}
	if trimmedReason, ok := pluginsTrimmedText(reason); ok {
		if _, err := fmt.Fprintln(stdout, trimmedReason); err != nil {
			return err
		}
	}
	return nil
}

func pluginsTrimmedText(value *string) (string, bool) {
	if value == nil {
		return "", false
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return "", false
	}
	return trimmed, true
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
		if handled, err := consumePluginsInstallOption(token, args, &index, &parsed); handled {
			if err != nil {
				return pluginsInstallFlags{}, "", err
			}
			continue
		}
		if strings.HasPrefix(token, "-") {
			return pluginsInstallFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		}
		if sourceSpec != "" {
			return pluginsInstallFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one source spec", name)}
		}
		sourceSpec = token
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
		if handled, err := consumePluginsScopedMutationOption(token, args, &index, &parsed.pluginsScopedMutationFlags); handled {
			if err != nil {
				return pluginsUpdateFlags{}, "", err
			}
			continue
		}
		if handled, err := consumePluginsStringOption(token, args, &index, "--to", &parsed.to); handled {
			if err != nil {
				return pluginsUpdateFlags{}, "", err
			}
			continue
		}
		if strings.HasPrefix(token, "-") {
			return pluginsUpdateFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		}
		if pluginID != "" {
			return pluginsUpdateFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id", name)}
		}
		pluginID = token
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
		if handled, err := consumePluginsScopedMutationOption(token, args, &index, &parsed); handled {
			if err != nil {
				return pluginsScopedMutationFlags{}, "", "", err
			}
			continue
		}
		if strings.HasPrefix(token, "-") {
			return pluginsScopedMutationFlags{}, "", "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		}
		if pluginID == "" {
			pluginID = token
			continue
		}
		if sourceSpecOrVersion == "" {
			sourceSpecOrVersion = token
			continue
		}
		return pluginsScopedMutationFlags{}, "", "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id and one source spec or version", name)}
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
		if handled, err := consumePluginsScopedMutationOption(token, args, &index, &parsed); handled {
			if err != nil {
				return pluginsScopedMutationFlags{}, "", err
			}
			continue
		}
		if strings.HasPrefix(token, "-") {
			return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		}
		if pluginID != "" {
			return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one plugin id", name)}
		}
		pluginID = token
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
		if handled, err := consumePluginsLinkOption(token, args, &index, &parsed); handled {
			if err != nil {
				return pluginsScopedMutationFlags{}, "", err
			}
			continue
		}
		if strings.HasPrefix(token, "-") {
			return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("unknown option %q", token)}
		}
		if pluginRoot != "" {
			return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one local plugin root", name)}
		}
		pluginRoot = token
	}
	if pluginRoot == "" {
		return pluginsScopedMutationFlags{}, "", &ExitError{Code: 2, Err: fmt.Errorf("%s requires exactly one local plugin root", name)}
	}
	return parsed, pluginRoot, nil
}

func consumePluginsInstallOption(token string, args []string, index *int, parsed *pluginsInstallFlags) (bool, error) {
	if handled, err := consumePluginsLinkOption(token, args, index, &parsed.pluginsScopedMutationFlags); handled {
		return true, err
	}
	if handled, err := consumePluginsInstallerOption(token, args, index, &parsed.installer); handled {
		return true, err
	}
	return false, nil
}

func consumePluginsLinkOption(token string, args []string, index *int, parsed *pluginsScopedMutationFlags) (bool, error) {
	if handled, err := consumePluginsScopedMutationOption(token, args, index, parsed); handled {
		return true, err
	}
	switch token {
	case "--no-enable":
		parsed.noEnable = true
		return true, nil
	case "--force":
		parsed.force = true
		return true, nil
	default:
		return false, nil
	}
}

func consumePluginsScopedMutationOption(token string, args []string, index *int, parsed *pluginsScopedMutationFlags) (bool, error) {
	switch {
	case token == "--json":
		parsed.jsonOutput = true
		return true, nil
	case token == "--global":
		parsed.globalScope = true
		return true, nil
	case token == "--setta-files":
		parsed.settaFilesScope = true
		return true, nil
	case token == "--scope":
		value, err := requirePluginsOptionValue(args, index, "--scope")
		if err != nil {
			return true, err
		}
		parsed.scope = value
		return true, nil
	case strings.HasPrefix(token, "--scope="):
		parsed.scope = strings.TrimSpace(strings.TrimPrefix(token, "--scope="))
		return true, nil
	default:
		return false, nil
	}
}

func consumePluginsInstallerOption(token string, args []string, index *int, installer *plugins.PluginInstallerBackend) (bool, error) {
	value, handled, err := consumePluginsOptionValue(token, args, index, "--installer")
	if !handled || err != nil {
		return handled, err
	}
	parsedInstaller, err := parsePluginInstallerBackend(value)
	if err != nil {
		return true, err
	}
	*installer = parsedInstaller
	return true, nil
}

func consumePluginsStringOption(token string, args []string, index *int, flagName string, dest *string) (bool, error) {
	value, handled, err := consumePluginsOptionValue(token, args, index, flagName)
	if !handled || err != nil {
		return handled, err
	}
	*dest = value
	return true, nil
}

func consumePluginsOptionValue(token string, args []string, index *int, flagName string) (string, bool, error) {
	if token == flagName {
		value, err := requirePluginsOptionValue(args, index, flagName)
		return value, true, err
	}
	prefix := flagName + "="
	if strings.HasPrefix(token, prefix) {
		return strings.TrimSpace(strings.TrimPrefix(token, prefix)), true, nil
	}
	return "", false, nil
}

func requirePluginsOptionValue(args []string, index *int, flagName string) (string, error) {
	if *index+1 >= len(args) {
		return "", &ExitError{Code: 2, Err: fmt.Errorf("missing value for %s", flagName)}
	}
	*index = *index + 1
	return strings.TrimSpace(args[*index]), nil
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
	packageManagerSearchPaths := pythonenv.PluginDistributionSearchPathsFromEnvLookup(envLookup)

	candidateProvider := plugins.NewProductionCandidateProvider(plugins.ProductionCandidateProviderOptions{
		PackageManagerRuntime: pythonRuntime,
		SettaFilesRoot:        commandCfg.Paths.SettaFilesRoot,
	})

	return plugins.NewService(plugins.ServiceOptions{
		WorkspaceRoot:             commandCfg.Paths.WorkspaceRoot,
		SettaFilesRoot:            commandCfg.Paths.SettaFilesRoot,
		SettaHome:                 commandCfg.Paths.SettaHome,
		ServerMode:                commandCfg.Server.Mode,
		RestartCommand:            "setta",
		CandidateProvider:         candidateProvider,
		PackageManagerRuntime:     pythonRuntime,
		PackageManagerSearchPaths: packageManagerSearchPaths,
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
