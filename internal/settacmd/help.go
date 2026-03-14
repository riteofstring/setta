package settacmd

import (
	"flag"
	"fmt"
	"io"
)

func configureGlobalFlags(flags *flag.FlagSet, parsed *globalFlags) {
	flags.BoolVar(&parsed.reload, "reload", false, "Reload is not supported in the Go CLI.")
	flags.StringVar(&parsed.host, "host", "", "Listen host.")
	flags.StringVar(&parsed.port, "port", "", "Listen port.")
	flags.StringVar(&parsed.workspaceRoot, "workspace", "", "Workspace root.")
	flags.StringVar(&parsed.workspaceRoot, "w", "", "Workspace root.")
	flags.StringVar(&parsed.profile, "profile", "", "Runtime profile name.")
	flags.StringVar(&parsed.settaHome, "setta-home", "", "Setta home.")
	flags.StringVar(&parsed.profileLookupHome, "profile-lookup-home", "", "Setta profile lookup home.")
	flags.StringVar(&parsed.settaFilesRoot, "setta-files-root", "", "Explicit setta_files root.")
	flags.StringVar(&parsed.settaFilesLocation, "setta-files-location", "", "setta_files location mode: auto, local, or global.")
	flags.StringVar(&parsed.runtimeRoot, "runtime-root", "", "Runtime root.")
	flags.StringVar(&parsed.logLevel, "log-level", "", "Log level.")
	flags.BoolVar(&parsed.noOpen, "no-open", false, "Skip automatic browser opening.")
}

func writeRootUsage(w io.Writer) error {
	if _, err := fmt.Fprintln(w, "Usage:"); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w, "  setta [global options]"); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w, "  setta <command> [options]"); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w, "Default behavior:"); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w, "  Running `setta` without a command starts the server in the current workspace."); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w, "Commands:"); err != nil {
		return err
	}
	for _, line := range []string{
		"  version       Print the installed Setta version.",
		"  export-db     Export project state in readable YAML.",
		"  backups       List and restore local backups.",
		"  plugins       Manage plugin authoring and install state.",
		"  launch        Start or reuse a local session and emit bootstrap JSON.",
		"  share         Serve a share deployment.",
		"  app           Serve an app deployment.",
		"  status        Read local session registry.",
		"  auth          Emit auth info for API calls.",
		"  tools         Emit the MCP tool list.",
		"  api           Call Setta MCP tools.",
		"  launcher      Desktop launcher setup and status commands.",
		"  stop          Stop a local or remote session.",
		"  connect, c    Connect to a remote session over SSH.",
	} {
		if _, err := fmt.Fprintln(w, line); err != nil {
			return err
		}
	}
	if _, err := fmt.Fprintln(w); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w, "Global options:"); err != nil {
		return err
	}
	flags := flag.NewFlagSet("setta", flag.ContinueOnError)
	flags.SetOutput(w)
	var parsed globalFlags
	configureGlobalFlags(flags, &parsed)
	flags.PrintDefaults()
	return nil
}

func writePluginsUsage(w io.Writer) error {
	if _, err := fmt.Fprintln(w, "Usage:"); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w, "  setta plugins <subcommand> [options]"); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w, "Subcommands:"); err != nil {
		return err
	}
	for _, line := range []string{
		"  init              Scaffold a new plugin template.",
		"  validate          Validate a plugin folder.",
		"  list              List discovered plugins.",
		"  install           Install a plugin from a source spec.",
		"  update            Update an installed plugin.",
		"  pin               Pin an installed plugin to a version or source.",
		"  rescan            Rescan plugin state.",
		"  restart           Emit backend restart guidance.",
		"  restart-required  Show pending restart plugins.",
		"  link              Link a local plugin folder.",
		"  enable            Enable a plugin.",
		"  disable           Disable a plugin.",
		"  uninstall         Uninstall a plugin.",
		"  rollback          Restore a prior plugin snapshot.",
		"  lock              Manage plugins lockfile state.",
	} {
		if _, err := fmt.Fprintln(w, line); err != nil {
			return err
		}
	}
	return nil
}

func writePluginsLockUsage(w io.Writer) error {
	if _, err := fmt.Fprintln(w, "Usage:"); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w, "  setta plugins lock <subcommand> [options]"); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w, "Subcommands:"); err != nil {
		return err
	}
	for _, line := range []string{
		"  write  Write the plugins lockfile.",
		"  apply  Apply the plugins lockfile.",
	} {
		if _, err := fmt.Fprintln(w, line); err != nil {
			return err
		}
	}
	return nil
}

func writeUsageError(w io.Writer, message string, usage func(io.Writer) error) error {
	if _, err := fmt.Fprintln(w, message); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(w); err != nil {
		return err
	}
	return usage(w)
}
