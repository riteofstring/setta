package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/cli"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/contracts"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/httpapi"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/lsp"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/aggregate"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/coordinator"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/materializer"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/pythonenv"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/runner"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/terminal"
	"github.com/riteofstring/setta/packages/local-backend/localweb"
)

const terminalShutdownTimeout = 5 * time.Second

func main() {
	if handled, err := terminal.RunPrivatePTYGuardian(os.Args[1:]); handled {
		if err != nil {
			_, _ = fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	exitCode := runCommand(ctx, os.Args[1:], serve, cli.Options{
		Stdin:  os.Stdin,
		Stdout: os.Stdout,
		Stderr: os.Stderr,
	})
	if exitCode != 0 {
		os.Exit(exitCode)
	}
}

type serveOptions struct {
	Port            uint16
	ProjectPath     string
	Create          bool
	LauncherPython  string
	Basedpyright    string
	WebRoot         string
	SessionNonce    string
	SupervisedStdin bool
}

type serviceStarter func(context.Context, serveOptions) error

func runCommand(ctx context.Context, arguments []string, start serviceStarter, options cli.Options) int {
	if len(arguments) > 0 && arguments[0] == "serve" {
		if err := run(ctx, arguments, start); err != nil {
			writer := options.Stderr
			if writer == nil {
				writer = io.Discard
			}
			_, _ = fmt.Fprintln(writer, err)
			return 1
		}
		return 0
	}
	if cli.IsCommand(arguments) {
		return cli.Run(ctx, arguments, options)
	}
	if isRootHelp(arguments) {
		writer := options.Stdout
		if writer == nil {
			writer = io.Discard
		}
		_, _ = fmt.Fprintln(writer, "Usage: python-canvas {schema|snapshot|apply|run} ...")
		return 0
	}

	return cli.Run(ctx, arguments, options)
}

func isRootHelp(arguments []string) bool {
	return len(arguments) == 1 && (arguments[0] == "--help" || arguments[0] == "-h" || arguments[0] == "help")
}

func run(ctx context.Context, arguments []string, start serviceStarter) error {
	if len(arguments) == 0 || arguments[0] != "serve" {
		return fmt.Errorf("python-canvas requires the private serve command")
	}
	if start == nil {
		return errors.New("python-canvas service starter is required")
	}
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	projectPath := &uniqueStringFlag{name: "project"}
	launcherPython := &uniqueStringFlag{name: "launcher-python"}
	basedpyright := &uniqueStringFlag{name: "basedpyright"}
	webRoot := &uniqueStringFlag{name: "web-root"}
	sessionNonce := &uniqueStringFlag{name: "session-nonce"}
	port := &portFlag{}
	create := &booleanFlag{name: "create"}
	supervisedStdin := &booleanFlag{name: "supervised-stdin"}
	flags.Var(projectPath, "project", "authored project path")
	flags.Var(launcherPython, "launcher-python", "exact Python executable that launched Setta")
	flags.Var(basedpyright, "basedpyright", "exact packaged Basedpyright language-server executable")
	flags.Var(webRoot, "web-root", "packaged production SPA root")
	flags.Var(sessionNonce, "session-nonce", "opaque Setta live-session nonce")
	flags.Var(port, "port", "loopback port, including 0 for an ephemeral port")
	flags.Var(create, "create", "exclusively create the project if it is absent")
	flags.Var(supervisedStdin, "supervised-stdin", "stop when the package supervisor closes stdin")
	if err := flags.Parse(arguments[1:]); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("serve does not accept positional arguments")
	}
	for _, required := range []*uniqueStringFlag{projectPath, launcherPython, basedpyright, webRoot, sessionNonce} {
		if !required.set {
			return fmt.Errorf("serve requires --%s", required.name)
		}
	}
	if !port.set {
		return fmt.Errorf("serve requires --port")
	}
	if !supervisedStdin.set || !supervisedStdin.value {
		return fmt.Errorf("serve requires --supervised-stdin")
	}
	return start(ctx, serveOptions{
		Port:            port.value,
		ProjectPath:     projectPath.value,
		Create:          create.value,
		LauncherPython:  launcherPython.value,
		Basedpyright:    basedpyright.value,
		WebRoot:         webRoot.value,
		SessionNonce:    sessionNonce.value,
		SupervisedStdin: supervisedStdin.value,
	})
}

type uniqueStringFlag struct {
	name  string
	value string
	set   bool
}

func (value *uniqueStringFlag) String() string {
	if value == nil {
		return ""
	}
	return value.value
}

func (value *uniqueStringFlag) Set(raw string) error {
	if value == nil {
		return errors.New("string flag is required")
	}
	if value.set {
		return fmt.Errorf("--%s may be provided only once", value.name)
	}
	if strings.TrimSpace(raw) == "" || raw != strings.TrimSpace(raw) || !utf8.ValidString(raw) || strings.ContainsRune(raw, '\x00') {
		return fmt.Errorf("--%s must be a non-empty valid value", value.name)
	}
	value.value = raw
	value.set = true
	return nil
}

type portFlag struct {
	value uint16
	set   bool
}

func (value *portFlag) String() string {
	if value == nil || !value.set {
		return ""
	}
	return strconv.Itoa(int(value.value))
}

func (value *portFlag) Set(raw string) error {
	if value == nil {
		return errors.New("port flag is required")
	}
	if value.set {
		return errors.New("--port may be provided only once")
	}
	parsed, err := strconv.ParseUint(raw, 10, 16)
	if err != nil {
		return fmt.Errorf("--port must be between 0 and 65535")
	}
	value.value = uint16(parsed)
	value.set = true
	return nil
}

type booleanFlag struct {
	name  string
	value bool
	set   bool
}

func (value *booleanFlag) String() string {
	if value == nil {
		return "false"
	}
	return strconv.FormatBool(value.value)
}

func (value *booleanFlag) Set(raw string) error {
	if value == nil {
		return errors.New("boolean flag is required")
	}
	if value.set {
		return fmt.Errorf("--%s may be provided only once", value.name)
	}
	parsed, err := strconv.ParseBool(raw)
	if err != nil {
		return fmt.Errorf("--%s must be true or false", value.name)
	}
	value.value = parsed
	value.set = true
	return nil
}

func (value *booleanFlag) IsBoolFlag() bool { return true }

func serve(ctx context.Context, options serveOptions) error {
	return serveWithStreams(ctx, options, os.Stdin, os.Stdout)
}

func serveWithStreams(ctx context.Context, options serveOptions, stdin io.Reader, stdout io.Writer) (result error) {
	if err := validateServeStreams(options, stdin, stdout); err != nil {
		return err
	}
	resources, err := prepareServeResources(ctx, options, stdin)
	if err != nil {
		return err
	}
	defer resources.Close()
	runtime, err := openServiceRuntime(resources.context, resources, options)
	if err != nil {
		return err
	}
	defer func() { result = joinResult(result, runtime.Close()) }()
	return serveOpenedRuntime(resources, runtime, options, stdout)
}

type serveResources struct {
	context          context.Context
	stop             context.CancelFunc
	listener         net.Listener
	origin           string
	canonicalProject string
	assets           *localweb.Assets
}

func validateServeStreams(options serveOptions, stdin io.Reader, stdout io.Writer) error {
	if stdout == nil {
		return errors.New("python-canvas readiness output is required")
	}
	if options.SupervisedStdin && stdin == nil {
		return errors.New("python-canvas supervised stdin is required")
	}
	return nil
}

func prepareServeResources(ctx context.Context, options serveOptions, stdin io.Reader) (resources serveResources, result error) {
	listener, err := localweb.Listen(options.Port)
	if err != nil {
		return serveResources{}, err
	}
	resources.listener = listener
	defer func() {
		if result != nil {
			resources.Close()
		}
	}()
	resources.origin, err = localweb.URL(listener)
	if err != nil {
		return resources, err
	}
	resources.canonicalProject, err = canonicalProjectPath(options.ProjectPath)
	if err != nil {
		return resources, err
	}
	if err := validateSessionNonce(options.SessionNonce); err != nil {
		return resources, err
	}
	resources.assets, err = localweb.OpenAssets(options.WebRoot)
	if err != nil {
		return resources, err
	}
	resources.context, resources.stop = context.WithCancel(normalizedServiceContext(ctx))
	if options.SupervisedStdin {
		cancelWhenStdinCloses(resources.context, stdin, resources.stop)
	}
	return resources, nil
}

func normalizedServiceContext(ctx context.Context) context.Context {
	if ctx == nil {
		return context.Background()
	}
	return ctx
}

func (resources *serveResources) Close() {
	if resources == nil {
		return
	}
	if resources.stop != nil {
		resources.stop()
	}
	if resources.listener != nil {
		_ = resources.listener.Close()
	}
}

type serviceRuntime struct {
	application       *coordinator.Coordinator
	generatedDocument *materializer.Document
	provider          *lsp.BasedpyrightProvider
	terminal          *terminal.Service
	runner            *runner.Service
}

func openServiceRuntime(ctx context.Context, resources serveResources, options serveOptions) (runtime *serviceRuntime, result error) {
	pythonEnvironment, err := pythonenv.Resolve(ctx, pythonenv.Options{
		ProjectPath:    resources.canonicalProject,
		LauncherPython: options.LauncherPython,
	})
	if err != nil {
		return nil, err
	}
	workspaceRoot := filepath.Dir(resources.canonicalProject)
	provider, err := lsp.NewBasedpyrightProvider(lsp.BasedpyrightOptions{
		Command:           options.Basedpyright,
		WorkspaceRoot:     workspaceRoot,
		PythonEnvironment: pythonEnvironment,
	})
	if err != nil {
		return nil, err
	}
	runtime = &serviceRuntime{provider: provider}
	defer func() {
		if result != nil {
			result = joinResult(result, runtime.Close())
		}
	}()
	runtime.terminal, err = terminal.New(terminal.Options{
		ProjectDirectory:  workspaceRoot,
		PythonEnvironment: pythonEnvironment,
	})
	if err != nil {
		return runtime, err
	}
	runtime.runner, err = runner.New(runner.Options{
		Interpreter:      pythonEnvironment.InterpreterPath(),
		ProjectDirectory: workspaceRoot,
		Environment:      pythonEnvironment.ChildEnvironment(),
	})
	if err != nil {
		return runtime, err
	}
	if err := ctx.Err(); err != nil {
		return runtime, err
	}
	runtime.generatedDocument, err = materializer.New(resources.canonicalProject)
	if err != nil {
		return runtime, err
	}
	if err := ctx.Err(); err != nil {
		return runtime, err
	}
	runtime.application, err = coordinator.Open(ctx, coordinator.Options{
		ProjectPath:  resources.canonicalProject,
		Create:       options.Create,
		IDGenerator:  generatedID,
		Materializer: runtime.generatedDocument,
		Provider:     runtime.provider,
	})
	if err != nil {
		return runtime, err
	}
	return runtime, nil
}

func (runtime *serviceRuntime) Close() error {
	if runtime == nil {
		return nil
	}
	if runtime.application != nil {
		return joinResult(nil, runtime.application.Close(), closeTerminalRuntime(runtime.terminal))
	}
	return joinResult(nil, closeGeneratedDocument(runtime.generatedDocument), closeProvider(runtime.provider), closeTerminalRuntime(runtime.terminal))
}

func closeGeneratedDocument(document *materializer.Document) error {
	if document == nil {
		return nil
	}
	return document.Close()
}

func closeProvider(provider *lsp.BasedpyrightProvider) error {
	if provider == nil {
		return nil
	}
	return provider.Close()
}

func serveOpenedRuntime(resources serveResources, runtime *serviceRuntime, options serveOptions, stdout io.Writer) error {
	service, err := httpapi.NewCoordinatorService(runtime.application)
	if err != nil {
		return err
	}
	apiHandler, err := httpapi.NewHandler(service, httpapi.HandlerOptions{
		Terminal: runtime.terminal,
		Runner:   runtime.runner,
		RuntimeSession: contracts.RuntimeSessionIdentityV2{
			SchemaVersion: contracts.RuntimeSessionSchemaVersionV1,
			AppID:         contracts.RuntimeSessionAppIDV1,
			ProjectPath:   resources.canonicalProject,
			InstanceNonce: options.SessionNonce,
		},
		AppOrigin: resources.origin,
		Lifecycle: resources.context,
	})
	if err != nil {
		return err
	}
	handler, err := resources.assets.Handler(apiHandler)
	if err != nil {
		return err
	}
	secureHandler, err := localweb.SecureHandler(resources.listener, handler)
	if err != nil {
		return err
	}
	return localweb.ServeReady(resources.context, resources.listener, secureHandler, func() error {
		return writeReadiness(stdout, resources.canonicalProject, options.SessionNonce, resources.origin)
	})
}

func canonicalProjectPath(value string) (string, error) {
	if strings.TrimSpace(value) == "" || value != strings.TrimSpace(value) || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') {
		return "", errors.New("python-canvas project path is invalid")
	}
	absolute, err := filepath.Abs(value)
	if err != nil {
		return "", fmt.Errorf("resolve project path: %w", err)
	}
	if resolved, err := filepath.EvalSymlinks(absolute); err == nil {
		return filepath.Clean(resolved), nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("resolve project path symlinks: %w", err)
	}
	resolvedDirectory, err := filepath.EvalSymlinks(filepath.Dir(absolute))
	if err != nil {
		return "", fmt.Errorf("resolve project directory symlinks: %w", err)
	}
	return filepath.Join(resolvedDirectory, filepath.Base(absolute)), nil
}

func validateSessionNonce(value string) error {
	if len(value) < 16 || strings.TrimSpace(value) == "" || value != strings.TrimSpace(value) || !utf8.ValidString(value) || strings.ContainsRune(value, '\x00') {
		return errors.New("python-canvas session nonce is invalid")
	}
	return nil
}

func cancelWhenStdinCloses(ctx context.Context, stdin io.Reader, cancel context.CancelFunc) {
	if stdin == nil || cancel == nil {
		return
	}
	go func() {
		_, _ = io.Copy(io.Discard, stdin)
		if ctx.Err() == nil {
			cancel()
		}
	}()
}

func writeReadiness(writer io.Writer, projectPath string, nonce string, origin string) error {
	if writer == nil {
		return errors.New("python-canvas readiness output is required")
	}
	return json.NewEncoder(writer).Encode(struct {
		App     string `json:"app"`
		Nonce   string `json:"nonce"`
		Project string `json:"project"`
		URL     string `json:"url"`
	}{
		App:     contracts.RuntimeSessionAppIDV1,
		Nonce:   nonce,
		Project: projectPath,
		URL:     origin,
	})
}

func joinResult(primary error, cleanup ...error) error {
	all := make([]error, 0, len(cleanup)+1)
	if primary != nil {
		all = append(all, primary)
	}
	for _, err := range cleanup {
		if err != nil {
			all = append(all, err)
		}
	}
	return errors.Join(all...)
}

func closeTerminalRuntime(runtime *terminal.Service) error {
	if runtime == nil {
		return nil
	}
	shutdownContext, cancel := context.WithTimeout(context.Background(), terminalShutdownTimeout)
	defer cancel()
	return runtime.Close(shutdownContext)
}

func generatedID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("allocate project ID: %w", err)
	}
	return "id:" + hex.EncodeToString(bytes), nil
}

var _ aggregate.IDGenerator = generatedID
