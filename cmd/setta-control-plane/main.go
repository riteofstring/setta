package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
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
	"syscall"
	"time"

	"setta/internal/controlplane"
	"setta/internal/runtimecost"
	spritescost "setta/internal/runtimecost/sprites"
	"setta/internal/sprites"
)

const (
	defaultMaxConcurrentRequests = 64
	defaultMaxRequestBytes       = 1 << 20
	defaultRuntimeTarget         = "127.0.0.1:7345"
	defaultShutdownTimeout       = 10 * time.Second
	defaultReconcilerLease       = 2 * time.Minute
	defaultReconcilerOperation   = 90 * time.Second
	defaultReconcilerRetry       = 30 * time.Second
	defaultAccountingWindow      = time.Minute
	defaultReconcilerAttempts    = 10
)

type commandConfig struct {
	DataDirectory        string
	Host                 string
	MaxConcurrentRequest int
	MaxRequestBytes      int64
	Port                 int
	ProviderBaseURL      string
	ProviderToken        string
	RuntimeTarget        string
	SecretDirectory      string
	ShutdownTimeout      time.Duration
}

type readyEvent struct {
	Address string `json:"address"`
	Event   string `json:"event"`
}

type controlPlaneServices struct {
	admin      *controlplane.AdminServer
	observer   *controlplane.JSONLinesObserver
	reconciler *controlplane.Reconciler
	server     *controlplane.Server
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr, os.Getenv, os.Unsetenv))
}

func run(
	args []string,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
	getenv func(string) string,
	unsetenv func(string) error,
) int {
	if len(args) == 0 {
		fmt.Fprintln(stderr, "usage: setta-control-plane <serve|backup|restore|bootstrap|ensure-runtime|generate-runtime-reporting-credential|admin> [options]")
		return 2
	}
	if code, handled := runControlPlaneUtilityCommand(
		args,
		stdin,
		stdout,
		stderr,
		getenv,
	); handled {
		return code
	}
	if args[0] != "serve" {
		fmt.Fprintf(stderr, "unknown setta-control-plane command %q\n", args[0])
		return 2
	}
	config, err := configFromArgs(args[1:], stderr, getenv)
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 2
	}
	if err := unsetenv("SPRITE_TOKEN"); err != nil {
		fmt.Fprintf(stderr, "unset SPRITE_TOKEN: %v\n", err)
		return 1
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := serve(ctx, config, stdout); err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 1
	}
	return 0
}

func runControlPlaneUtilityCommand(
	args []string,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
	getenv func(string) string,
) (int, bool) {
	switch args[0] {
	case "backup":
		return runBackup(args[1:], stdout, stderr), true
	case "restore":
		return runRestore(args[1:], stdout, stderr), true
	case "bootstrap":
		return runBootstrap(args[1:], stdin, stdout, stderr, getenv), true
	case "ensure-runtime":
		return runEnsureRuntime(args[1:], stdout, stderr, getenv), true
	case "generate-runtime-reporting-credential":
		return runGenerateRuntimeReportingCredential(args[1:], stdout, stderr), true
	case "admin":
		return runAdmin(args[1:], stdin, stdout, stderr), true
	default:
		return 0, false
	}
}

func serve(ctx context.Context, config commandConfig, stdout io.Writer) (returnErr error) {
	store, err := controlplane.OpenStore(controlplane.StoreConfig{Directory: config.DataDirectory})
	if err != nil {
		return fmt.Errorf("open control-plane store: %w", err)
	}
	defer closeStore(store, &returnErr)
	services, err := startControlPlaneServices(config, store, stdout)
	if err != nil {
		return err
	}
	if err := json.NewEncoder(stdout).Encode(readyEvent{Address: services.server.Addr().String(), Event: "control_plane_ready"}); err != nil {
		return errors.Join(fmt.Errorf("write control-plane ready event: %w", err), services.shutdownGateway(config.ShutdownTimeout))
	}
	return services.run(ctx, config.ShutdownTimeout)
}

func startControlPlaneServices(
	config commandConfig,
	store *controlplane.Store,
	stdout io.Writer,
) (controlPlaneServices, error) {
	secrets, err := controlplane.OpenFileSecretStore(config.SecretDirectory)
	if err != nil {
		return controlPlaneServices{}, fmt.Errorf("open control-plane secret store: %w", err)
	}
	provider, err := sprites.NewAdapterWithBaseURL(config.ProviderToken, config.ProviderBaseURL)
	if err != nil {
		return controlPlaneServices{}, fmt.Errorf("configure Sprites provider: %w", err)
	}
	observer, err := controlplane.NewJSONLinesObserver(stdout)
	if err != nil {
		return controlPlaneServices{}, err
	}
	alertingObserver, err := controlplane.NewAlertingObserver(observer, observer, observer)
	if err != nil {
		return controlPlaneServices{}, err
	}
	workerID, err := newReconcilerWorkerID()
	if err != nil {
		return controlPlaneServices{}, err
	}
	reconciler, err := controlplane.NewReconciler(controlplane.ReconcilerConfig{
		AccountingObserver: alertingObserver,
		AccountingWindow:   defaultAccountingWindow,
		LeaseDuration:      defaultReconcilerLease,
		MaxAttempts:        defaultReconcilerAttempts,
		OperationTimeout:   defaultReconcilerOperation,
		Observer:           alertingObserver,
		PriceSchedule:      controlPlanePriceSchedule(),
		Provider:           provider,
		RetryDelay:         defaultReconcilerRetry,
		Store:              store,
		WorkerID:           workerID,
	})
	if err != nil {
		return controlPlaneServices{}, fmt.Errorf("configure runtime reconciler: %w", err)
	}
	server, err := controlplane.StartServer(controlplane.ServerConfig{
		Attachments:           store,
		Authorizer:            store,
		Dialer:                provider,
		ListenAddress:         net.JoinHostPort(config.Host, strconv.Itoa(config.Port)),
		MaxConcurrentRequests: config.MaxConcurrentRequest,
		MaxRequestBytes:       config.MaxRequestBytes,
		Observer:              alertingObserver,
		ReportingObserver:     alertingObserver,
		ReportingStore:        store,
		Routes:                store,
		RuntimeTarget:         config.RuntimeTarget,
		Secrets:               secrets,
	})
	if err != nil {
		return controlPlaneServices{}, fmt.Errorf("start control-plane gateway: %w", err)
	}
	admin, err := controlplane.StartAdminServer(controlplane.AdminServerConfig{
		Observer:      alertingObserver,
		PriceSchedule: controlPlanePriceSchedule(),
		SocketPath:    controlplane.AdminSocketPath(config.DataDirectory),
		Store:         store,
	})
	if err != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
		defer cancel()
		return controlPlaneServices{}, errors.Join(
			fmt.Errorf("start control-plane administration: %w", err),
			server.Shutdown(shutdownCtx),
			server.Wait(),
		)
	}
	return controlPlaneServices{admin: admin, observer: observer, reconciler: reconciler, server: server}, nil
}

func controlPlanePriceSchedule() runtimecost.PriceSchedule {
	return spritescost.PublishedRates20260714()
}

func (services controlPlaneServices) run(ctx context.Context, shutdownTimeout time.Duration) error {
	reconcileCtx, stopReconciler := context.WithCancel(ctx)
	reconcileResult := make(chan error, 1)
	go func() {
		reconcileResult <- services.reconciler.Run(reconcileCtx)
	}()
	var reconcileErr error
	reconcileReceived := false
	select {
	case <-ctx.Done():
	case reconcileErr = <-reconcileResult:
		reconcileReceived = true
	}
	stopReconciler()
	shutdownErr := services.shutdownGateway(shutdownTimeout)
	if !reconcileReceived {
		reconcileErr = <-reconcileResult
	}
	return errors.Join(shutdownErr, reconcileErr, services.observer.Err())
}

func (services controlPlaneServices) shutdownGateway(timeout time.Duration) error {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	shutdownErr := errors.Join(services.admin.Shutdown(shutdownCtx), services.server.Shutdown(shutdownCtx))
	adminErr := services.admin.Wait()
	if adminErr != nil {
		adminErr = fmt.Errorf("wait for control-plane administration: %w", adminErr)
	}
	serverErr := services.server.Wait()
	if serverErr != nil {
		serverErr = fmt.Errorf("wait for control-plane gateway: %w", serverErr)
	}
	return errors.Join(shutdownErr, adminErr, serverErr)
}

func closeStore(store *controlplane.Store, returnErr *error) {
	if err := store.Close(); err != nil && *returnErr == nil {
		*returnErr = err
	}
}

func newReconcilerWorkerID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate reconciler worker id: %w", err)
	}
	return "worker_" + base64.RawURLEncoding.EncodeToString(raw), nil
}

func configFromArgs(
	args []string,
	stderr io.Writer,
	getenv func(string) string,
) (commandConfig, error) {
	config := commandConfig{
		DataDirectory:        getenv("SETTA_CONTROL_PLANE_DATA_DIR"),
		Host:                 environmentOrDefault(getenv, "SETTA_CONTROL_PLANE_HOST", "127.0.0.1"),
		MaxConcurrentRequest: defaultMaxConcurrentRequests,
		MaxRequestBytes:      defaultMaxRequestBytes,
		Port:                 8080,
		ProviderBaseURL:      environmentOrDefault(getenv, "SETTA_SPRITES_API_BASE_URL", sprites.DefaultAPIBaseURL),
		ProviderToken:        getenv("SPRITE_TOKEN"),
		RuntimeTarget:        environmentOrDefault(getenv, "SETTA_CONTROL_PLANE_RUNTIME_TARGET", defaultRuntimeTarget),
		SecretDirectory:      getenv("SETTA_CONTROL_PLANE_SECRET_DIR"),
		ShutdownTimeout:      defaultShutdownTimeout,
	}
	flagSet := flag.NewFlagSet("setta-control-plane", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.DataDirectory, "data-dir", config.DataDirectory, "absolute durable control-plane database directory")
	flagSet.StringVar(&config.Host, "host", config.Host, "numeric IP address to bind behind the hosting TLS edge")
	flagSet.IntVar(&config.MaxConcurrentRequest, "max-concurrent-requests", config.MaxConcurrentRequest, "maximum concurrent gateway requests including SSE streams")
	flagSet.Int64Var(&config.MaxRequestBytes, "max-request-bytes", config.MaxRequestBytes, "maximum relayed request body bytes")
	flagSet.IntVar(&config.Port, "port", config.Port, "gateway port, or 0 for an ephemeral port")
	flagSet.StringVar(&config.ProviderBaseURL, "sprites-api-base-url", config.ProviderBaseURL, "Sprites API origin; HTTP is restricted to loopback")
	flagSet.StringVar(&config.RuntimeTarget, "runtime-target", config.RuntimeTarget, "loopback runtime HTTP target reached through provider private access")
	flagSet.StringVar(&config.SecretDirectory, "secret-dir", config.SecretDirectory, "absolute durable runtime credential directory")
	flagSet.DurationVar(&config.ShutdownTimeout, "shutdown-timeout", config.ShutdownTimeout, "maximum graceful gateway shutdown time")
	if err := flagSet.Parse(args); err != nil {
		return commandConfig{}, err
	}
	if flagSet.NArg() != 0 {
		return commandConfig{}, errors.New("setta-control-plane does not accept positional arguments")
	}
	if err := validateCommandConfig(config); err != nil {
		return commandConfig{}, err
	}
	return config, nil
}

func validateCommandConfig(config commandConfig) error {
	if err := validateCommandDirectories(config); err != nil {
		return err
	}
	if err := validateCommandBinding(config); err != nil {
		return err
	}
	if config.ProviderToken == "" {
		return errors.New("SPRITE_TOKEN is required from the hosting secret store")
	}
	if _, err := sprites.NewAdapterWithBaseURL(config.ProviderToken, config.ProviderBaseURL); err != nil {
		return fmt.Errorf("Sprites provider configuration: %w", err)
	}
	return validateCommandCeilings(config)
}

func validateCommandDirectories(config commandConfig) error {
	if config.DataDirectory == "" || !filepath.IsAbs(config.DataDirectory) {
		return errors.New("control-plane data directory must be absolute")
	}
	if config.SecretDirectory == "" || !filepath.IsAbs(config.SecretDirectory) {
		return errors.New("control-plane secret directory must be absolute")
	}
	return nil
}

func validateCommandBinding(config commandConfig) error {
	address := net.ParseIP(config.Host)
	if address == nil {
		return errors.New("control-plane host must be a numeric IP address")
	}
	if config.Port < 0 || config.Port > 65535 {
		return errors.New("control-plane port must be between 0 and 65535")
	}
	return nil
}

func validateCommandCeilings(config commandConfig) error {
	if config.MaxConcurrentRequest <= 0 || config.MaxRequestBytes <= 0 || config.ShutdownTimeout <= 0 {
		return errors.New("control-plane resource ceilings and shutdown timeout must be positive")
	}
	return nil
}

func environmentOrDefault(getenv func(string) string, name string, fallback string) string {
	if value := getenv(name); value != "" {
		return value
	}
	return fallback
}
