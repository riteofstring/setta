package settacli

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"setta/internal/config"
	"setta/internal/launcher"
	"setta/internal/sshx"
)

const foregroundTunnelReadyTimeout = 2 * time.Second

type connectFlags struct {
	workspaceRoot string
	sessionID     string
	latest        bool
	sshArgs       string
	remoteCommand string
	localPort     int
	detach        bool
	printOnly     bool
	noOpen        bool
	verbose       bool
}

func runConnect(args []string, global globalFlags, stdout io.Writer, stderr io.Writer, stdin io.Reader, envLookup func(string) (string, bool), cwd string) error {
	sshTarget := ""
	flagArgs := args
	if len(args) > 0 && !strings.HasPrefix(strings.TrimSpace(args[0]), "-") {
		sshTarget = strings.TrimSpace(args[0])
		flagArgs = args[1:]
	}

	var parsed connectFlags
	flags := flag.NewFlagSet("connect", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(&parsed.workspaceRoot, "workspace", "", "Remote workspace root.")
	flags.StringVar(&parsed.workspaceRoot, "w", "", "Remote workspace root.")
	flags.StringVar(&parsed.sessionID, "session", "", "Session ID.")
	flags.BoolVar(&parsed.latest, "latest", false, "Select the latest session.")
	flags.StringVar(&parsed.sshArgs, "ssh-args", "", "Extra SSH arguments.")
	flags.StringVar(&parsed.remoteCommand, "remote-cmd", "", "Override the remote Setta command.")
	flags.IntVar(&parsed.localPort, "local-port", 0, "Pin the local tunnel port.")
	flags.BoolVar(&parsed.detach, "detach", false, "Keep the tunnel running in the background.")
	flags.BoolVar(&parsed.printOnly, "print-only", false, "Print the tunnel command and URLs without running them.")
	flags.BoolVar(&parsed.noOpen, "no-open", false, "Skip opening the browser.")
	flags.BoolVar(&parsed.verbose, "verbose", false, "Print SSH and resolution details.")
	if err := flags.Parse(flagArgs); err != nil {
		return err
	}
	if sshTarget == "" {
		return fmt.Errorf("connect requires <ssh_target>")
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("connect accepts flags after a single ssh_target, not additional positional arguments")
	}
	if strings.TrimSpace(parsed.sessionID) != "" && parsed.latest {
		return fmt.Errorf("Use either --session or --latest, not both.")
	}
	if parsed.detach && parsed.printOnly {
		return fmt.Errorf("Use either --detach or --print-only, not both.")
	}
	if parsed.localPort < 0 || parsed.localPort > 65535 {
		return fmt.Errorf("Invalid local port: %d", parsed.localPort)
	}

	workspaceRoot, err := resolveRemoteWorkspaceFlag(global.workspaceRoot, parsed.workspaceRoot, "connect")
	if err != nil {
		return err
	}
	if strings.TrimSpace(workspaceRoot) == "" {
		return fmt.Errorf("--workspace is required for SSH connect")
	}

	service, sshBin, err := newSSHServiceForRemoteConnectCLI(cwd, envLookup)
	if err != nil {
		return err
	}
	localPort := optionalLocalPort(parsed.localPort)
	connectPlan, err := service.PrepareConnectWorkspaceSession(sshx.PrepareConnectWorkspaceInput{
		SSHTarget:          sshTarget,
		Workspace:          workspaceRoot,
		SessionID:          strings.TrimSpace(parsed.sessionID),
		Latest:             parsed.latest,
		Profile:            strings.TrimSpace(global.profile),
		SettaHome:          strings.TrimSpace(global.settaHome),
		SettaFilesRoot:     strings.TrimSpace(global.settaFilesRoot),
		SettaFilesLocation: strings.TrimSpace(global.settaFilesLocation),
		RuntimeRoot:        strings.TrimSpace(global.runtimeRoot),
		SSHArgs:            strings.TrimSpace(parsed.sshArgs),
		RemoteCommand:      strings.TrimSpace(parsed.remoteCommand),
	})
	if err != nil {
		return addExpandedLocalHomeWorkspaceHint(err, workspaceRoot)
	}

	if parsed.verbose {
		if strings.TrimSpace(parsed.sshArgs) == "" {
			_, _ = fmt.Fprintln(stdout, "SSH args: (none)")
		} else {
			_, _ = fmt.Fprintf(stdout, "SSH args: %s\n", strings.TrimSpace(parsed.sshArgs))
		}
		_, _ = fmt.Fprintf(stdout, "Remote shell: %s\n", connectPlan.RemoteShell)
		_, _ = fmt.Fprintf(stdout, "Remote workspace: %s\n", connectPlan.RemoteWorkspace)
		_, _ = fmt.Fprintf(stdout, "Remote Setta command: %s\n", connectPlan.RemoteCommand)
		_, _ = fmt.Fprintf(stdout, "Remote sessions found: %d\n", connectPlan.InitialSessionCount)
		if connectPlan.StartedNew {
			_, _ = fmt.Fprintln(stdout, "Started new remote Setta session.")
		}
	}

	if !parsed.printOnly {
		_, _ = fmt.Fprintf(stdout, "Using session %s (port %d).\n", connectPlan.Session.ID, connectPlan.Session.Port)
	}

	switch {
	case parsed.printOnly:
		return runPrintOnlyConnect(stdout, sshTarget, strings.TrimSpace(parsed.sshArgs), sshBin, connectPlan, localPort)
	case parsed.detach:
		return runDetachedConnect(stdout, stderr, service, sshTarget, strings.TrimSpace(parsed.sshArgs), connectPlan, localPort, parsed.noOpen, parsed.verbose)
	default:
		return runForegroundConnect(stdout, stderr, stdin, envLookup, sshTarget, strings.TrimSpace(parsed.sshArgs), sshBin, connectPlan, localPort, parsed.noOpen, parsed.verbose)
	}
}

func newSSHServiceForRemoteConnectCLI(cwd string, envLookup func(string) (string, bool)) (*sshx.Service, string, error) {
	runtimeRoot, err := resolveLocalConnectRuntimeRoot(cwd)
	if err != nil {
		return nil, "", err
	}
	sshBin := resolvedSSHBin(envLookup)
	service, err := sshx.NewService(sshx.ServiceOptions{
		RuntimeRoot: runtimeRoot,
		SSHBin:      sshBin,
	})
	if err != nil {
		return nil, "", err
	}
	return service, sshBin, nil
}

func resolveLocalConnectRuntimeRoot(cwd string) (string, error) {
	cfg, err := config.Load(config.LoadOptions{
		CWD: cwd,
		// Remote connect flags are forwarded to the SSH target only. Local tunnel
		// metadata is owned by a local default runtime root derived from cwd.
		EnvLookup: func(string) (string, bool) { return "", false },
	})
	if err != nil {
		return "", fmt.Errorf("resolve local connect runtime root: %w", err)
	}
	return cfg.Paths.RuntimeRoot, nil
}

func resolvedSSHBin(envLookup func(string) (string, bool)) string {
	if envLookup == nil {
		return ""
	}
	value, _ := envLookup("SETTA_SSH_BIN")
	return strings.TrimSpace(value)
}

func optionalLocalPort(value int) *int {
	if value <= 0 {
		return nil
	}
	return &value
}

func runPrintOnlyConnect(stdout io.Writer, sshTarget string, sshArgs string, sshBin string, connectPlan sshx.PreparedConnectWorkspaceResult, localPort *int) error {
	resolvedLocalPort, err := resolveConnectLocalPort(localPort)
	if err != nil {
		return err
	}
	localBootstrapURL, err := buildLocalBootstrapURL(resolvedLocalPort, connectPlan.Token)
	if err != nil {
		return err
	}
	tunnelArgs, err := buildConnectTunnelArgs(sshTarget, sshArgs, sshBin, connectPlan.Session.Host, resolvedLocalPort, connectPlan.Session.Port)
	if err != nil {
		return err
	}
	_, _ = fmt.Fprintln(stdout, shellJoinArgs(tunnelArgs))
	_, _ = fmt.Fprintln(stdout, localBootstrapURL)
	_, _ = fmt.Fprintln(stdout, connectPlan.Token)
	return nil
}

func runDetachedConnect(stdout io.Writer, stderr io.Writer, service *sshx.Service, sshTarget string, sshArgs string, connectPlan sshx.PreparedConnectWorkspaceResult, localPort *int, noOpen bool, verbose bool) error {
	_, _ = fmt.Fprintln(stdout, "Ensuring local tunnel is running (background).")
	tunnel, err := service.EnsureSSHTunnel(sshx.EnsureSSHTunnelInput{
		SSHTarget:  sshTarget,
		SSHArgs:    sshArgs,
		RemoteHost: connectPlan.Session.Host,
		RemotePort: connectPlan.Session.Port,
		LocalPort:  localPort,
	})
	if err != nil {
		return err
	}
	localBootstrapURL, err := buildLocalBootstrapURL(tunnel.LocalPort, connectPlan.Token)
	if err != nil {
		return err
	}
	if verbose {
		_, _ = fmt.Fprintf(stdout, "Local bootstrap URL: %s\n", localBootstrapURL)
	}
	if !noOpen {
		_, _ = fmt.Fprintln(stdout, "Opening browser...")
		openBrowserBestEffort(localBootstrapURL, stderr)
	}
	_, _ = fmt.Fprintf(stdout, "Tunnel running in background (pid %d, local port %d).\n", tunnel.PID, tunnel.LocalPort)
	_, _ = fmt.Fprintf(stdout, "To stop: kill %d\n", tunnel.PID)
	return nil
}

func runForegroundConnect(stdout io.Writer, stderr io.Writer, stdin io.Reader, envLookup func(string) (string, bool), sshTarget string, sshArgs string, sshBin string, connectPlan sshx.PreparedConnectWorkspaceResult, localPort *int, noOpen bool, verbose bool) error {
	resolvedLocalPort, err := resolveConnectLocalPort(localPort)
	if err != nil {
		return err
	}
	localBootstrapURL, err := buildLocalBootstrapURL(resolvedLocalPort, connectPlan.Token)
	if err != nil {
		return err
	}
	tunnelArgs, err := buildConnectTunnelArgs(sshTarget, sshArgs, sshBin, connectPlan.Session.Host, resolvedLocalPort, connectPlan.Session.Port)
	if err != nil {
		return err
	}
	if verbose {
		_, _ = fmt.Fprintf(stdout, "Local bootstrap URL: %s\n", localBootstrapURL)
	}
	_, _ = fmt.Fprintf(stdout, "Opening local tunnel on %d (keep this terminal open).\n", resolvedLocalPort)
	cmd := exec.Command(tunnelArgs[0], tunnelArgs[1:]...)
	cmd.Stdin = stdin
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		return err
	}
	if !connectTunnelReady(cmd, resolvedLocalPort, envLookup) {
		if cmd.ProcessState != nil && cmd.ProcessState.Exited() {
			return silentExecWait(cmd)
		}
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
		return fmt.Errorf("SSH tunnel did not bind local port %d within 2 seconds.", resolvedLocalPort)
	}
	if !noOpen {
		_, _ = fmt.Fprintln(stdout, "Opening browser...")
		openBrowserBestEffort(localBootstrapURL, stderr)
	}
	_, _ = fmt.Fprintln(stdout, "Tunnel active (Ctrl+C to stop).")
	_, _ = fmt.Fprintln(stdout, "Tip: use --detach to background the tunnel or --print-only to copy commands.")
	return silentExecWait(cmd)
}

func buildConnectTunnelArgs(sshTarget string, sshArgsRaw string, sshBin string, remoteHost string, localPort int, remotePort int) ([]string, error) {
	sshArgs, err := sshx.ParseSSHArgs(sshArgsRaw)
	if err != nil {
		return nil, err
	}
	sshArgs = sshx.ApplyControlSocketArgs(sshArgs)
	return sshx.BuildSSHTunnelArgs(
		sshTarget,
		sshArgs,
		remoteHost,
		localPort,
		remotePort,
		sshx.SSHCommandPrefix(true, sshBin),
	), nil
}

func buildLocalBootstrapURL(localPort int, token string) (string, error) {
	return launcher.BuildBootstrapURLFragment("127.0.0.1", localPort, token)
}

func resolveConnectLocalPort(localPort *int) (int, error) {
	if localPort != nil {
		return *localPort, nil
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, fmt.Errorf("select local port: %w", err)
	}
	defer listener.Close()
	addr, ok := listener.Addr().(*net.TCPAddr)
	if !ok || addr.Port <= 0 {
		return 0, fmt.Errorf("select local port: invalid listener address %#v", listener.Addr())
	}
	return addr.Port, nil
}

func connectTunnelReady(cmd *exec.Cmd, localPort int, envLookup func(string) (string, bool)) bool {
	if testStubForwardDisabledForSettacli(envLookup) {
		return true
	}
	deadline := time.Now().Add(foregroundTunnelReadyTimeout)
	for time.Now().Before(deadline) {
		if cmd.ProcessState != nil && cmd.ProcessState.Exited() {
			return false
		}
		conn, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", fmt.Sprintf("%d", localPort)), 100*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

func testStubForwardDisabledForSettacli(envLookup func(string) (string, bool)) bool {
	if envLookup == nil {
		return false
	}
	raw, ok := envLookup("SETTA_SSH_STUB_DISABLE_FORWARD")
	if !ok {
		return false
	}
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	return trimmed != "" && trimmed != "0" && trimmed != "false"
}

func silentExecWait(cmd *exec.Cmd) error {
	if err := cmd.Wait(); err != nil {
		exitCode := 1
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			exitCode = exitErr.ExitCode()
		}
		return &ExitError{Code: exitCode, Silent: true}
	}
	return nil
}

func openBrowserBestEffort(rawURL string, stderr io.Writer) {
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
}

func shellJoinArgs(args []string) string {
	joined := make([]string, 0, len(args))
	for _, arg := range args {
		joined = append(joined, shellQuoteForDisplay(arg))
	}
	return strings.Join(joined, " ")
}

func shellQuoteForDisplay(value string) string {
	if value == "" {
		return "''"
	}
	if !strings.ContainsAny(value, " \t\n\r'\"\\$&;|<>()[*?!#~") {
		return value
	}
	return "'" + strings.ReplaceAll(value, "'", `'"'"'`) + "'"
}
