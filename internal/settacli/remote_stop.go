package settacli

import (
	"flag"
	"fmt"
	"io"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/auth"
	"setta/internal/localsessions"
	"setta/internal/sshx"
)

type stopFlags struct {
	workspaceRoot string
	sessionID     string
	latest        bool
	stopAll       bool
	serverMode    string
	sshArgs       string
	remoteCommand string
}

func runStop(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, envLookup func(string) (string, bool), cwd string) error {
	sshTarget := ""
	flagArgs := args
	if len(args) > 0 && !strings.HasPrefix(strings.TrimSpace(args[0]), "-") {
		sshTarget = strings.TrimSpace(args[0])
		flagArgs = args[1:]
	}

	var parsed stopFlags
	flags := flag.NewFlagSet("stop", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(&parsed.workspaceRoot, "workspace", "", "Remote workspace root.")
	flags.StringVar(&parsed.workspaceRoot, "w", "", "Remote workspace root.")
	flags.StringVar(&parsed.sessionID, "session", "", "Session ID.")
	flags.BoolVar(&parsed.latest, "latest", false, "Select the latest session.")
	flags.BoolVar(&parsed.stopAll, "all", false, "Stop all matching sessions.")
	flags.StringVar(&parsed.serverMode, "server-mode", "", "Filter sessions by server mode: ide or launcher.")
	flags.StringVar(&parsed.sshArgs, "ssh-args", "", "Extra SSH arguments.")
	flags.StringVar(&parsed.remoteCommand, "remote-cmd", "", "Override the remote Setta command.")
	if err := flags.Parse(flagArgs); err != nil {
		return err
	}
	if strings.TrimSpace(parsed.sessionID) != "" && parsed.latest {
		return fmt.Errorf("use either --session or --latest, not both")
	}
	if parsed.stopAll && (strings.TrimSpace(parsed.sessionID) != "" || parsed.latest) {
		return fmt.Errorf("use --all by itself")
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("stop accepts flags after a single ssh_target, not additional positional arguments")
	}
	if sshTarget == "" {
		return runLocalStop(parsed, global, stdout, envLookup, cwd)
	}

	workspaceRoot, err := resolveRemoteWorkspaceFlag(global.workspaceRoot, parsed.workspaceRoot, "stop")
	if err != nil {
		return err
	}
	if strings.TrimSpace(workspaceRoot) == "" {
		return fmt.Errorf("--workspace is required for remote stop")
	}

	serverMode, err := resolveRemoteStopServerMode(parsed.serverMode)
	if err != nil {
		return err
	}
	service, err := newSSHServiceForRemoteCLI(cwd, envLookup)
	if err != nil {
		return err
	}

	sessions, err := service.ListRemoteWorkspaceSessions(sshx.ListRemoteWorkspaceSessionsInput{
		SSHTarget:          sshTarget,
		Workspace:          workspaceRoot,
		Profile:            strings.TrimSpace(global.profile),
		SettaHome:          strings.TrimSpace(global.settaHome),
		SettaFilesRoot:     strings.TrimSpace(global.settaFilesRoot),
		SettaFilesLocation: strings.TrimSpace(global.settaFilesLocation),
		RuntimeRoot:        strings.TrimSpace(global.runtimeRoot),
		SSHArgs:            strings.TrimSpace(parsed.sshArgs),
		RemoteCommand:      strings.TrimSpace(parsed.remoteCommand),
		ServerMode:         serverMode,
	})
	if err != nil {
		return err
	}
	if len(sessions) == 0 {
		return fmt.Errorf("No matching Setta sessions found.")
	}

	targets, err := selectRemoteStopTargets(sessions, parsed.sessionID, parsed.latest, parsed.stopAll)
	if err != nil {
		return err
	}
	for _, session := range targets {
		if err := service.DeleteRemoteWorkspaceSession(sshx.DeleteRemoteWorkspaceSessionInput{
			SSHTarget:          sshTarget,
			Workspace:          workspaceRoot,
			SessionID:          session.ID,
			Profile:            strings.TrimSpace(global.profile),
			SettaHome:          strings.TrimSpace(global.settaHome),
			SettaFilesRoot:     strings.TrimSpace(global.settaFilesRoot),
			SettaFilesLocation: strings.TrimSpace(global.settaFilesLocation),
			RuntimeRoot:        strings.TrimSpace(global.runtimeRoot),
			SSHArgs:            strings.TrimSpace(parsed.sshArgs),
			RemoteCommand:      strings.TrimSpace(parsed.remoteCommand),
		}); err != nil {
			return err
		}
		_, _ = fmt.Fprintf(stdout, "Stopped session %s.\n", session.ID)
	}
	return nil
}

func runLocalStop(parsed stopFlags, global globalFlags, stdout io.Writer, envLookup func(string) (string, bool), cwd string) error {
	commandCfg, err := resolveCommandConfig(global, parsed.workspaceRoot, "stop", cwd, envLookup)
	if err != nil {
		return err
	}
	registry, err := localsessions.NewRegistry(localsessions.RegistryOptions{
		SessionsRoot: filepath.Join(commandCfg.Paths.RuntimeRoot, "sessions"),
	})
	if err != nil {
		return err
	}
	sessions, err := registry.LoadSessions()
	if err != nil {
		return err
	}
	sessions = filterSessionsForWorkspace(sessions, commandCfg.Paths.WorkspaceRoot)
	if parsed.serverMode != "" && parsed.serverMode != "ide" && parsed.serverMode != "launcher" {
		return fmt.Errorf("invalid --server-mode %q", parsed.serverMode)
	}
	sessions = filterSessionsByDefaultMode(sessions, "stop", false, strings.TrimSpace(parsed.serverMode))
	sessions = localsessions.FilterActiveSessions(sessions)
	if len(sessions) == 0 {
		return fmt.Errorf("No matching Setta sessions found.")
	}
	targets, err := selectLocalStopTargets(sessions, parsed.sessionID, parsed.latest, parsed.stopAll)
	if err != nil {
		return err
	}
	for _, session := range targets {
		if err := deleteLocalSession(registry, session); err != nil {
			return err
		}
		_, _ = fmt.Fprintf(stdout, "Stopped session %s.\n", session.ID)
	}
	return nil
}

func resolveRemoteWorkspaceFlag(globalWorkspace string, subcommandWorkspace string, command string) (string, error) {
	trimmedGlobal := strings.TrimSpace(globalWorkspace)
	trimmedSubcommand := strings.TrimSpace(subcommandWorkspace)
	switch {
	case trimmedGlobal == "":
		return trimmedSubcommand, nil
	case trimmedSubcommand == "":
		return trimmedGlobal, nil
	case trimmedGlobal == trimmedSubcommand:
		return trimmedGlobal, nil
	default:
		return "", fmt.Errorf("conflicting --workspace provided at both the global CLI level and the %s subcommand", command)
	}
}

func resolveRemoteStopServerMode(raw string) (sshx.RemoteServerMode, error) {
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	switch trimmed {
	case "":
		return sshx.RemoteServerModeIDE, nil
	case string(sshx.RemoteServerModeIDE):
		return sshx.RemoteServerModeIDE, nil
	case string(sshx.RemoteServerModeLauncher):
		return sshx.RemoteServerModeLauncher, nil
	default:
		return "", fmt.Errorf("invalid --server-mode %q", raw)
	}
}

func newSSHServiceForRemoteCLI(cwd string, envLookup func(string) (string, bool)) (*sshx.Service, error) {
	sshBin := ""
	if envLookup != nil {
		sshBin, _ = envLookup("SETTA_SSH_BIN")
	}
	return sshx.NewService(sshx.ServiceOptions{
		// Stage 1 remote stop does not persist local runtime state, so the local
		// cwd is sufficient until connect lands and takes local tunnel ownership.
		RuntimeRoot: cwd,
		SSHBin:      sshBin,
	})
}

func selectRemoteStopTargets(sessions []sshx.RemoteSessionSummary, sessionID string, latest bool, stopAll bool) ([]sshx.RemoteSessionSummary, error) {
	if stopAll {
		return append([]sshx.RemoteSessionSummary(nil), sessions...), nil
	}
	if trimmed := strings.TrimSpace(sessionID); trimmed != "" {
		for _, session := range sessions {
			if session.ID == trimmed {
				return []sshx.RemoteSessionSummary{session}, nil
			}
		}
		return nil, fmt.Errorf("Session %s not found.", trimmed)
	}
	if latest {
		sorted := append([]sshx.RemoteSessionSummary(nil), sessions...)
		sort.Slice(sorted, func(i int, j int) bool {
			return sorted[i].StartedAt.After(sorted[j].StartedAt)
		})
		return []sshx.RemoteSessionSummary{sorted[0]}, nil
	}
	if len(sessions) == 1 {
		return append([]sshx.RemoteSessionSummary(nil), sessions...), nil
	}
	return nil, fmt.Errorf("Multiple sessions found; use --session <id>, --latest, or --all.")
}

func selectLocalStopTargets(sessions []auth.SessionMetadata, sessionID string, latest bool, stopAll bool) ([]auth.SessionMetadata, error) {
	if stopAll {
		return append([]auth.SessionMetadata(nil), sessions...), nil
	}
	if trimmed := strings.TrimSpace(sessionID); trimmed != "" {
		for _, session := range sessions {
			if session.ID == trimmed {
				return []auth.SessionMetadata{session}, nil
			}
		}
		return nil, fmt.Errorf("Session %s not found.", trimmed)
	}
	if latest {
		sorted := append([]auth.SessionMetadata(nil), sessions...)
		sort.Slice(sorted, func(i int, j int) bool {
			return sorted[i].StartedAt.After(sorted[j].StartedAt)
		})
		return []auth.SessionMetadata{sorted[0]}, nil
	}
	if len(sessions) == 1 {
		return append([]auth.SessionMetadata(nil), sessions...), nil
	}
	return nil, fmt.Errorf("Multiple sessions found; use --session <id>, --latest, or --all.")
}
