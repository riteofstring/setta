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

	_, remaining, err := parseGlobalFlags(args, stderr)
	if err != nil {
		return err
	}
	if len(remaining) == 0 {
		return fmt.Errorf("missing command (supported: version, launcher, status, auth, tools, api, stop, connect)")
	}

	switch remaining[0] {
	case "version":
		if len(remaining) != 1 {
			return fmt.Errorf("version does not accept arguments")
		}
		_, err := fmt.Fprintf(stdout, "setta version %s\n", buildinfo.Version())
		return err
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
		return fmt.Errorf("launcher commands are not implemented in cmd/setta yet")
	default:
		return fmt.Errorf("unknown command %q", remaining[0])
	}
}

func parseGlobalFlags(args []string, stderr io.Writer) (globalFlags, []string, error) {
	var parsed globalFlags
	flags := flag.NewFlagSet("setta", flag.ContinueOnError)
	flags.SetOutput(stderr)
	flags.StringVar(&parsed.workspaceRoot, "workspace", "", "Workspace root.")
	flags.StringVar(&parsed.profile, "profile", "", "Runtime profile name.")
	flags.StringVar(&parsed.settaHome, "setta-home", "", "Setta home.")
	flags.StringVar(&parsed.profileLookupHome, "profile-lookup-home", "", "Setta profile lookup home.")
	flags.StringVar(&parsed.settaFilesRoot, "setta-files-root", "", "Explicit setta_files root.")
	flags.StringVar(&parsed.settaFilesLocation, "setta-files-location", "", "setta_files location mode: auto, local, or global.")
	flags.StringVar(&parsed.runtimeRoot, "runtime-root", "", "Runtime root.")
	if err := flags.Parse(args); err != nil {
		return globalFlags{}, nil, err
	}
	return parsed, flags.Args(), nil
}
