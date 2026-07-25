package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"

	"setta/internal/runtime"
	"setta/internal/runtimereporting"
	"setta/internal/speech"
	"setta/internal/sprites"
)

type serveOptions struct {
	AppDataDir                       string
	DisplayName                      string
	Host                             string
	Port                             int
	LocalCredentialIssuer            bool
	MinimumDiskFreeMiB               int
	SpritesWorkloadLeases            bool
	WorkloadAccountingCredentialFile string
	WorkloadAccountingURL            string
	Speech                           speech.OpenAIClientConfig
}

type serveInstance struct {
	appDataDir string
	server     *runtime.Server
	state      serveState
}

func runServe(args []string, deps cliDeps) error {
	ctx, stop := signalContext()
	defer stop()
	options, err := serveOptionsFromArgs(ctx, args, deps)
	if err != nil {
		return err
	}
	instance, err := startServe(ctx, options, deps)
	if err != nil {
		return err
	}
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), runtime.DefaultConfig().ShutdownTimeout)
	defer cancel()
	return instance.Shutdown(shutdownCtx)
}

func serveOptionsFromArgs(_ context.Context, args []string, deps cliDeps) (serveOptions, error) {
	appDataDir, err := defaultAppDataDir(deps.getenv)
	if err != nil {
		return serveOptions{}, err
	}
	speechConfig, err := speech.OpenAIClientConfigFromEnvironment(deps.getenv, deps.unsetenv)
	if err != nil {
		return serveOptions{}, err
	}
	options := serveOptions{
		AppDataDir: appDataDir,
		Host:       runtime.DefaultConfig().Host,
		Port:       defaultServePort,
		Speech:     speechConfig,
	}
	flagSet := newFlagSet("setta serve", deps.stderr)
	flagSet.StringVar(&options.AppDataDir, "app-data-dir", options.AppDataDir, "directory for persisted Setta app state")
	flagSet.StringVar(&options.DisplayName, "display-name", deps.getenv("SETTA_RUNTIME_DISPLAY_NAME"), "runtime display name to persist for this Setta instance")
	flagSet.IntVar(&options.Port, "port", options.Port, "port to bind, or 0 for an ephemeral port")
	flagSet.BoolVar(&options.LocalCredentialIssuer, "local-credential-issuer", false, "host the local development credential issuer")
	flagSet.IntVar(&options.MinimumDiskFreeMiB, "minimum-disk-free-mib", 0, "reject new agent turns below this free-storage threshold")
	flagSet.BoolVar(&options.SpritesWorkloadLeases, "sprites-workload-leases", false, "enforce renewable agent workload leases through the Sprites management socket")
	flagSet.StringVar(&options.WorkloadAccountingCredentialFile, "workload-accounting-credential-file", "", "private runtime reporting credential file")
	flagSet.StringVar(&options.WorkloadAccountingURL, "workload-accounting-url", "", "Setta control-plane origin for workload accounting")
	if err := flagSet.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return serveOptions{}, usageError{err: err}
		}
		return serveOptions{}, usageError{err: err}
	}
	if flagSet.NArg() != 0 {
		return serveOptions{}, usageError{err: fmt.Errorf("setta serve does not accept positional arguments")}
	}
	if options.SpritesWorkloadLeases !=
		(options.WorkloadAccountingCredentialFile != "" && options.WorkloadAccountingURL != "") {
		return serveOptions{}, usageError{err: errors.New(
			"Sprites workload leases require an accounting URL and credential file",
		)}
	}
	return options, nil
}

func startServe(ctx context.Context, options serveOptions, deps cliDeps) (*serveInstance, error) {
	var readyBuffer bytes.Buffer
	config, err := serveRuntimeConfig(options, deps, &readyBuffer)
	if err != nil {
		return nil, err
	}

	server, err := runtime.Start(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("start runtime: %w", err)
	}
	closeOnFailure := true
	defer func() {
		if closeOnFailure {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
			_ = server.Shutdown(shutdownCtx)
			_ = server.Wait()
			cancel()
		}
	}()
	ready, err := decodeReadyEvent(&readyBuffer)
	if err != nil {
		return nil, err
	}
	if ready.BootstrapToken != "" {
		return nil, errors.New("runtime returned a bootstrap device token even though setta serve disabled bootstrap minting")
	}
	info, err := getRuntimeInfo(ctx, deps.httpClient, "http://"+ready.Addr)
	if err != nil {
		return nil, err
	}
	state, err := buildServeState(options.AppDataDir, ready.Addr, info, deps)
	if err != nil {
		return nil, err
	}
	if err := writeServeState(options.AppDataDir, state); err != nil {
		return nil, err
	}
	pairing, err := mintPairing(ctx, options.AppDataDir, state)
	if err != nil {
		_ = removeServeStateIfMatches(options.AppDataDir, state)
		return nil, err
	}
	printServeStarted(deps.stdout, state, pairing, deps)
	closeOnFailure = false
	return &serveInstance{
		appDataDir: options.AppDataDir,
		server:     server,
		state:      state,
	}, nil
}

func serveRuntimeConfig(
	options serveOptions,
	deps cliDeps,
	readyWriter io.Writer,
) (runtime.Config, error) {
	config := runtime.DefaultConfig()
	config.AppDataDir = options.AppDataDir
	config.Host = options.Host
	config.Port = options.Port
	config.RuntimeDisplayName = options.DisplayName
	config.SkipBootstrapDeviceSession = true
	config.EnableLocalCredentialIssuer = options.LocalCredentialIssuer
	config.MinimumDiskFreeMiB = options.MinimumDiskFreeMiB
	config.Stderr = deps.stderr
	config.Stdout = readyWriter
	config.Version = version
	config.Speech = options.Speech
	if options.SpritesWorkloadLeases {
		credential, err := runtimereporting.ReadCredentialFile(
			options.WorkloadAccountingCredentialFile,
		)
		if err != nil {
			return runtime.Config{}, fmt.Errorf("read workload accounting credential: %w", err)
		}
		reporter, err := runtimereporting.NewClient(runtimereporting.ClientConfig{
			BaseURL:    options.WorkloadAccountingURL,
			Credential: credential,
		})
		if err != nil {
			return runtime.Config{}, fmt.Errorf("configure workload accounting: %w", err)
		}
		config.WorkloadLeaseManager = sprites.NewWorkloadLeaseClient()
		config.WorkloadLeaseReporter = reporter
	}
	return config, nil
}

func decodeReadyEvent(reader io.Reader) (runtime.ReadyEvent, error) {
	var ready runtime.ReadyEvent
	if err := json.NewDecoder(reader).Decode(&ready); err != nil {
		return runtime.ReadyEvent{}, fmt.Errorf("decode runtime ready event: %w", err)
	}
	if ready.Event != "ready" {
		return runtime.ReadyEvent{}, fmt.Errorf("runtime ready event = %q, want ready", ready.Event)
	}
	if ready.Addr == "" {
		return runtime.ReadyEvent{}, errors.New("runtime ready event did not include an address")
	}
	return ready, nil
}

func printServeStarted(output io.Writer, state serveState, pairing pairingResult, deps cliDeps) {
	fmt.Fprintln(output, "Setta runtime is ready.")
	fmt.Fprintf(output, "  Name: %s\n", state.DisplayName)
	fmt.Fprintf(output, "  ID: %s\n", state.RuntimeID)
	fmt.Fprintf(output, "  Listening: %s\n\n", state.BaseURL)
	fmt.Fprintln(output, "Pair this runtime within 10 minutes:")
	fmt.Fprintf(output, "  %s\n\n", pairing.URL)
	fmt.Fprintln(output, "QR:")
	deps.renderQR(output, pairing.URL)
	fmt.Fprintln(output)
}

func (instance *serveInstance) Shutdown(ctx context.Context) error {
	var shutdownErr error
	if err := removeServeStateIfMatches(instance.appDataDir, instance.state); err != nil {
		shutdownErr = err
	}
	if err := instance.server.Shutdown(ctx); err != nil && shutdownErr == nil {
		shutdownErr = err
	}
	if err := instance.server.Wait(); err != nil && shutdownErr == nil {
		shutdownErr = err
	}
	return shutdownErr
}
