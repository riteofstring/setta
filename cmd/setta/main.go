package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/mdp/qrterminal/v3"
)

const defaultServePort = 7345

var version = "dev"

type cliDeps struct {
	commandRunner      commandRunner
	commandStdinRunner commandStdinRunner
	getenv             func(string) string
	lookPath           func(string) (string, error)
	httpClient         *http.Client
	now                func() time.Time
	pid                func() int
	renderQR           func(io.Writer, string)
	sleep              func(context.Context, time.Duration) error
	stderr             io.Writer
	stdout             io.Writer
}

type usageError struct {
	err error
}

type cliCommandHandler func([]string, cliDeps) error

var cliCommandHandlers = map[string]cliCommandHandler{
	"serve":     runServe,
	"pair":      runPair,
	"devices":   runDevices,
	"doctor":    runDoctor,
	"provision": runProvision,
	"remote":    runRemote,
	"service":   runService,
	"runtime":   runRuntime,
	"version":   runVersion,
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, os.Getenv))
}

func run(args []string, stdout io.Writer, stderr io.Writer, getenv func(string) string) int {
	return runWithDeps(args, cliDeps{
		getenv: getenv,
		stderr: stderr,
		stdout: stdout,
	})
}

func runWithDeps(args []string, deps cliDeps) int {
	deps = normalizeDeps(deps)
	if len(args) == 0 {
		printUsage(deps.stderr)
		return 2
	}

	if args[0] == "help" || args[0] == "-h" || args[0] == "--help" {
		printUsage(deps.stdout)
		return 0
	}
	handler, ok := cliCommandHandlers[args[0]]
	if !ok {
		return commandErrorExitCode(usageError{err: fmt.Errorf("unknown command %q", args[0])}, deps)
	}
	err := handler(args[1:], deps)
	if err == nil {
		return 0
	}
	return commandErrorExitCode(err, deps)
}

func commandErrorExitCode(err error, deps cliDeps) int {
	fmt.Fprintf(deps.stderr, "%v\n", err)
	var usage usageError
	if errors.As(err, &usage) {
		return 2
	}
	return 1
}

func runVersion(args []string, deps cliDeps) error {
	if len(args) != 0 {
		return usageError{err: fmt.Errorf("setta version does not accept arguments")}
	}
	fmt.Fprintln(deps.stdout, version)
	return nil
}

func normalizeDeps(deps cliDeps) cliDeps {
	if deps.stdout == nil {
		deps.stdout = io.Discard
	}
	if deps.stderr == nil {
		deps.stderr = io.Discard
	}
	if deps.getenv == nil {
		deps.getenv = os.Getenv
	}
	deps.commandRunner = normalizedCommandRunner(deps.commandRunner)
	deps.commandStdinRunner = normalizedCommandStdinRunner(deps.commandStdinRunner)
	if deps.lookPath == nil {
		deps.lookPath = exec.LookPath
	}
	if deps.httpClient == nil {
		deps.httpClient = &http.Client{Timeout: 5 * time.Second}
	}
	if deps.now == nil {
		deps.now = time.Now
	}
	if deps.pid == nil {
		deps.pid = os.Getpid
	}
	if deps.renderQR == nil {
		deps.renderQR = renderTerminalQR
	}
	if deps.sleep == nil {
		deps.sleep = sleepContext
	}
	return deps
}

func normalizedCommandRunner(runner commandRunner) commandRunner {
	if runner != nil {
		return runner
	}
	return runExternalCommand
}

func normalizedCommandStdinRunner(runner commandStdinRunner) commandStdinRunner {
	if runner != nil {
		return runner
	}
	return runExternalCommandWithStdin
}

func (err usageError) Error() string {
	return err.err.Error()
}

func (err usageError) Unwrap() error {
	return err.err
}

func printUsage(output io.Writer) {
	fmt.Fprintln(output, "Usage:")
	fmt.Fprintln(output, "  setta serve [--app-data-dir DIR] [--port PORT] [--tailnet]")
	fmt.Fprintln(output, "  setta pair [--json] [--app-data-dir DIR]")
	fmt.Fprintln(output, "  setta runtime rename <display-name> [--app-data-dir DIR]")
	fmt.Fprintln(output, "  setta devices list [--app-data-dir DIR]")
	fmt.Fprintln(output, "  setta devices revoke <device-id> [--app-data-dir DIR]")
	fmt.Fprintln(output, "  setta doctor --json [--app-data-dir DIR] [--workspace-dir DIR]")
	fmt.Fprintln(output, "  setta provision shapes --json")
	fmt.Fprintln(output, "  setta provision detect --json")
	fmt.Fprintln(output, "  setta provision resolve --json [--provider ID] [--shape ID] [--region REGION]")
	fmt.Fprintln(output, "  setta provision render-link --provider aws --json [flags]")
	fmt.Fprintln(output, "  setta provision render-cloudinit --json [flags]")
	fmt.Fprintln(output, "  setta provision up --json (--plan-only | --approve) [flags]")
	fmt.Fprintln(output, "  setta provision down --json (--plan-only | --approve) [flags]")
	fmt.Fprintln(output, "  setta remote add ssh://user@host [flags]")
	fmt.Fprintln(output, "  setta service wait-tailnet [--timeout DURATION] [--poll-interval DURATION]")
	fmt.Fprintln(output, "  setta service configure-tailscale-serve [--app-data-dir DIR] [--timeout DURATION] [--poll-interval DURATION]")
	fmt.Fprintln(output, "  setta version")
}

func newFlagSet(name string, stderr io.Writer) *flag.FlagSet {
	flagSet := flag.NewFlagSet(name, flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	return flagSet
}

func defaultAppDataDir(getenv func(string) string) (string, error) {
	if value := getenv("SETTA_APP_DATA_DIR"); value != "" {
		return value, nil
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve default app data directory: %w", err)
	}
	return filepath.Join(homeDir, ".setta"), nil
}

func renderTerminalQR(output io.Writer, text string) {
	qrterminal.GenerateHalfBlock(text, qrterminal.M, output)
}

func signalContext() (context.Context, context.CancelFunc) {
	return signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
}

func sleepContext(ctx context.Context, duration time.Duration) error {
	if duration <= 0 {
		return nil
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
