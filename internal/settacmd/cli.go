package settacmd

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"setta/internal/buildinfo"
	"setta/internal/settacli"
)

type RunOptions struct {
	Stdout    io.Writer
	Stderr    io.Writer
	Stdin     io.Reader
	EnvLookup func(string) (string, bool)
	Now       func() time.Time
	CWD       string
}

type ExitError struct {
	Code   int
	Err    error
	Silent bool
}

func (e *ExitError) Error() string {
	if e == nil {
		return ""
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return fmt.Sprintf("exit %d", e.Code)
}

func ExitCode(err error) int {
	var cmdExitErr *ExitError
	if errors.As(err, &cmdExitErr) && cmdExitErr.Code > 0 {
		return cmdExitErr.Code
	}
	var cliExitErr *settacli.ExitError
	if errors.As(err, &cliExitErr) && cliExitErr.Code > 0 {
		return cliExitErr.Code
	}
	return 1
}

func ShouldPrintError(err error) bool {
	var cmdExitErr *ExitError
	if errors.As(err, &cmdExitErr) {
		return !cmdExitErr.Silent && cmdExitErr.Err != nil
	}
	return settacli.ShouldPrintError(err)
}

func DisplayError(err error) string {
	var cmdExitErr *ExitError
	if errors.As(err, &cmdExitErr) && cmdExitErr.Err != nil {
		return cmdExitErr.Err.Error()
	}
	return settacli.DisplayError(err)
}

type globalFlags struct {
	workspaceRoot      string
	settaHome          string
	profileLookupHome  string
	settaFilesRoot     string
	settaFilesLocation string
	runtimeRoot        string
	profile            string
	host               string
	port               string
	logLevel           string
	noOpen             bool
	reload             bool
}

func Run(args []string, options RunOptions) error {
	stdout := options.Stdout
	if stdout == nil {
		stdout = io.Discard
	}
	stderr := options.Stderr
	if stderr == nil {
		stderr = io.Discard
	}
	stdin := options.Stdin
	if stdin == nil {
		stdin = os.Stdin
	}
	envLookup := options.EnvLookup
	if envLookup == nil {
		envLookup = os.LookupEnv
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	cwd := options.CWD
	if strings.TrimSpace(cwd) == "" {
		resolvedCWD, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("resolve cwd: %w", err)
		}
		cwd = resolvedCWD
	}

	global, remaining, helpShown, err := parseGlobalFlags(args, stdout, stderr)
	if err != nil {
		return err
	}
	if helpShown {
		return nil
	}
	if len(remaining) == 0 {
		return runDefaultStartWithDeps(global, stdin, stdout, stderr, envLookup, cwd, defaultStartCommandDependencies())
	}

	switch remaining[0] {
	case "version":
		if len(remaining) != 1 {
			return fmt.Errorf("version does not accept arguments")
		}
		_, err := fmt.Fprintf(stdout, "setta version %s\n", buildinfo.Version())
		return err
	case "export-db":
		return runExportDB(remaining[1:], global, stdout, stderr, envLookup, cwd)
	case "backups":
		return runBackups(remaining[1:], global, stdin, stdout, stderr, envLookup, cwd)
	case "plugins":
		return runPlugins(remaining[1:], global, stdout, stderr, envLookup, cwd)
	case "launch":
		return runLaunch(remaining[1:], global, stdout, stderr, envLookup, cwd)
	case "share":
		return runShare(remaining[1:], global, stdin, stdout, stderr, envLookup, cwd)
	case "app":
		return runApp(remaining[1:], global, stdin, stdout, stderr, envLookup, cwd)
	case "status", "auth", "tools", "api", "stop", "connect", "c":
		return settacli.Run(args, settacli.RunOptions{
			Stdout:    stdout,
			Stderr:    stderr,
			Stdin:     stdin,
			EnvLookup: envLookup,
			Now:       now,
			CWD:       cwd,
		})
	case "launcher":
		return runLauncher(remaining[1:], global, stdout, stderr, envLookup, cwd)
	default:
		err := fmt.Errorf("unknown command %q", remaining[0])
		if writeErr := writeUsageError(stderr, err.Error(), writeRootUsage); writeErr != nil {
			return writeErr
		}
		return &ExitError{Code: 2, Err: err, Silent: true}
	}
}

func parseGlobalFlags(args []string, stdout io.Writer, stderr io.Writer) (globalFlags, []string, bool, error) {
	var parsed globalFlags
	flags := flag.NewFlagSet("setta", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	configureGlobalFlags(flags, &parsed)
	if err := flags.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			if writeErr := writeRootUsage(stdout); writeErr != nil {
				return globalFlags{}, nil, false, writeErr
			}
			return globalFlags{}, nil, true, nil
		}
		if writeErr := writeUsageError(stderr, err.Error(), writeRootUsage); writeErr != nil {
			return globalFlags{}, nil, false, writeErr
		}
		return globalFlags{}, nil, false, &ExitError{Code: 2, Err: err, Silent: true}
	}
	return parsed, flags.Args(), false, nil
}
