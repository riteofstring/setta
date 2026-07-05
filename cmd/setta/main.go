package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/mdp/qrterminal/v3"
)

const defaultServePort = 7345

var version = "dev"

type cliDeps struct {
	commandRunner commandRunner
	getenv        func(string) string
	httpClient    *http.Client
	now           func() time.Time
	pid           func() int
	renderQR      func(io.Writer, string)
	stderr        io.Writer
	stdout        io.Writer
}

type usageError struct {
	err error
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

	var err error
	switch args[0] {
	case "serve":
		err = runServe(args[1:], deps)
	case "pair":
		err = runPair(args[1:], deps)
	case "devices":
		err = runDevices(args[1:], deps)
	case "runtime":
		err = runRuntime(args[1:], deps)
	case "version":
		if len(args) != 1 {
			err = usageError{err: fmt.Errorf("setta version does not accept arguments")}
		} else {
			fmt.Fprintln(deps.stdout, version)
			return 0
		}
	case "help", "-h", "--help":
		printUsage(deps.stdout)
		return 0
	default:
		err = usageError{err: fmt.Errorf("unknown command %q", args[0])}
	}
	if err == nil {
		return 0
	}
	fmt.Fprintf(deps.stderr, "%v\n", err)
	var usage usageError
	if errors.As(err, &usage) {
		return 2
	}
	return 1
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
	if deps.commandRunner == nil {
		deps.commandRunner = runExternalCommand
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
	return deps
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
	fmt.Fprintln(output, "  setta pair [--app-data-dir DIR]")
	fmt.Fprintln(output, "  setta runtime rename <display-name> [--app-data-dir DIR]")
	fmt.Fprintln(output, "  setta devices list [--app-data-dir DIR]")
	fmt.Fprintln(output, "  setta devices revoke <device-id> [--app-data-dir DIR]")
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
