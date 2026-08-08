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

type runContext struct {
	stdout    io.Writer
	stderr    io.Writer
	stdin     io.Reader
	envLookup func(string) (string, bool)
	now       func() time.Time
	cwd       string
}

type rootCommandHandler func(args []string, global globalFlags, ctx runContext) error

var rootCommandHandlers = map[string]rootCommandHandler{
	"version":        runVersionCommand,
	"paths":          runPathsCommand,
	"export-db":      runExportDBCommand,
	"backups":        runBackupsCommand,
	"plugins":        runPluginsCommand,
	"launch":         runLaunchCommand,
	"share":          runShareCommand,
	"app":            runAppCommand,
	"mcp":            runMCPCommand,
	"sdk-local-core": runSDKLocalCoreCommand,
	"launcher":       runLauncherCommand,
}

var delegatedRootCommands = map[string]struct{}{
	"status":  {},
	"auth":    {},
	"tools":   {},
	"api":     {},
	"stop":    {},
	"connect": {},
	"c":       {},
}

func Run(args []string, options RunOptions) error {
	ctx, err := resolveRunContext(options)
	if err != nil {
		return err
	}

	global, remaining, helpShown, err := parseGlobalFlags(args, ctx.stdout, ctx.stderr)
	if err != nil {
		return err
	}
	if helpShown {
		return nil
	}
	if len(remaining) == 0 {
		return runDefaultStartWithDeps(
			global,
			ctx.stdin,
			ctx.stdout,
			ctx.stderr,
			ctx.envLookup,
			ctx.cwd,
			defaultStartCommandDependencies(),
		)
	}
	return dispatchRootCommand(args, remaining, global, ctx)
}

func resolveRunContext(options RunOptions) (runContext, error) {
	ctx := runContext{
		stdout:    options.Stdout,
		stderr:    options.Stderr,
		stdin:     options.Stdin,
		envLookup: options.EnvLookup,
		now:       options.Now,
		cwd:       options.CWD,
	}
	if ctx.stdout == nil {
		ctx.stdout = io.Discard
	}
	if ctx.stderr == nil {
		ctx.stderr = io.Discard
	}
	if ctx.stdin == nil {
		ctx.stdin = os.Stdin
	}
	if ctx.envLookup == nil {
		ctx.envLookup = os.LookupEnv
	}
	if ctx.now == nil {
		ctx.now = time.Now
	}
	if strings.TrimSpace(ctx.cwd) == "" {
		resolvedCWD, err := os.Getwd()
		if err != nil {
			return runContext{}, fmt.Errorf("resolve cwd: %w", err)
		}
		ctx.cwd = resolvedCWD
	}
	return ctx, nil
}

func dispatchRootCommand(args []string, remaining []string, global globalFlags, ctx runContext) error {
	command := remaining[0]
	if handler, ok := rootCommandHandlers[command]; ok {
		return handler(remaining[1:], global, ctx)
	}
	if _, ok := delegatedRootCommands[command]; ok {
		return settacli.Run(args, settacli.RunOptions{
			Stdout:    ctx.stdout,
			Stderr:    ctx.stderr,
			Stdin:     ctx.stdin,
			EnvLookup: ctx.envLookup,
			Now:       ctx.now,
			CWD:       ctx.cwd,
		})
	}
	return writeUnknownRootCommand(command, ctx.stderr)
}

func runVersionCommand(args []string, _ globalFlags, ctx runContext) error {
	if len(args) != 0 {
		return fmt.Errorf("version does not accept arguments")
	}
	_, err := fmt.Fprintf(ctx.stdout, "setta version %s\n", buildinfo.Version())
	return err
}

func runPathsCommand(args []string, global globalFlags, ctx runContext) error {
	return runPaths(args, global, ctx.stdout, ctx.stderr, ctx.envLookup, ctx.cwd)
}

func runExportDBCommand(args []string, global globalFlags, ctx runContext) error {
	return runExportDB(args, global, ctx.stdout, ctx.stderr, ctx.envLookup, ctx.cwd)
}

func runBackupsCommand(args []string, global globalFlags, ctx runContext) error {
	return runBackups(args, global, ctx.stdin, ctx.stdout, ctx.stderr, ctx.envLookup, ctx.cwd)
}

func runPluginsCommand(args []string, global globalFlags, ctx runContext) error {
	return runPlugins(args, global, ctx.stdout, ctx.stderr, ctx.envLookup, ctx.cwd)
}

func runLaunchCommand(args []string, global globalFlags, ctx runContext) error {
	return runLaunch(args, global, ctx.stdout, ctx.stderr, ctx.envLookup, ctx.cwd)
}

func runShareCommand(args []string, global globalFlags, ctx runContext) error {
	return runShare(args, global, ctx.stdin, ctx.stdout, ctx.stderr, ctx.envLookup, ctx.cwd)
}

func runAppCommand(args []string, global globalFlags, ctx runContext) error {
	return runApp(args, global, ctx.stdin, ctx.stdout, ctx.stderr, ctx.envLookup, ctx.cwd)
}

func runMCPCommand(args []string, global globalFlags, ctx runContext) error {
	return runMCP(args, global, ctx.stdin, ctx.stdout, ctx.stderr, ctx.envLookup, ctx.now, ctx.cwd)
}

func runSDKLocalCoreCommand(args []string, _ globalFlags, ctx runContext) error {
	return runSDKLocalCore(args, ctx.stdin, ctx.stdout)
}

func runLauncherCommand(args []string, global globalFlags, ctx runContext) error {
	return runLauncher(args, global, ctx.stdout, ctx.stderr, ctx.envLookup, ctx.cwd)
}

func writeUnknownRootCommand(command string, stderr io.Writer) error {
	err := fmt.Errorf("unknown command %q", command)
	if writeErr := writeUsageError(stderr, err.Error(), writeRootUsage); writeErr != nil {
		return writeErr
	}
	return &ExitError{Code: 2, Err: err, Silent: true}
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
