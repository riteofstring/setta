package settacmd

import (
	"flag"
	"fmt"
	"io"
	"strings"

	"setta/internal/config"
	"setta/internal/plugins"
)

type pluginsFlags struct {
	jsonOutput bool
}

type pluginsRescanJSON struct {
	ServerMode       config.Mode `json:"serverMode"`
	InstalledPlugins int         `json:"installedPlugins"`
	ActivePlugins    int         `json:"activePlugins"`
}

func runPlugins(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	if len(args) == 0 {
		return &ExitError{
			Code: 2,
			Err:  fmt.Errorf("missing plugins subcommand (supported: list, rescan, restart-required)"),
		}
	}

	switch args[0] {
	case "list":
		return runPluginsList(args[1:], global, stdout, stderr, envLookup, cwd)
	case "rescan":
		return runPluginsRescan(args[1:], global, stdout, stderr, envLookup, cwd)
	case "restart-required":
		return runPluginsRestartRequired(args[1:], global, stdout, stderr, envLookup, cwd)
	default:
		return &ExitError{
			Code: 2,
			Err:  fmt.Errorf("unknown plugins subcommand %q", args[0]),
		}
	}
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
		return err
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
		shadowedSuffix := ""
		if plugin.ShadowedBySourcePath != nil && strings.TrimSpace(*plugin.ShadowedBySourcePath) != "" {
			shadowedSuffix = " shadowed_by=" + *plugin.ShadowedBySourcePath
		}
		if _, err := fmt.Fprintf(stdout, "%s %s [%s] scope=%s%s%s\n", plugin.PluginID, plugin.Version, plugin.State, plugin.SourceScopeLabel, restartSuffix, shadowedSuffix); err != nil {
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
		return err
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
		return err
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

	if summary.RestartCapability.Mode == plugins.RestartCapabilityModeProgrammatic {
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

func resolvePluginsService(global globalFlags, envLookup func(string) (string, bool), cwd string) (*plugins.Service, error) {
	commandCfg, err := resolvePluginsCommandConfig(global, cwd, envLookup)
	if err != nil {
		return nil, err
	}
	return plugins.NewService(plugins.ServiceOptions{
		WorkspaceRoot:  commandCfg.Paths.WorkspaceRoot,
		SettaFilesRoot: commandCfg.Paths.SettaFilesRoot,
		SettaHome:      commandCfg.Paths.SettaHome,
		ServerMode:     commandCfg.Server.Mode,
		RestartCommand: "setta",
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
