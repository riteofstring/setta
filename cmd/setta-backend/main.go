package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"

	"setta/internal/evalharness/tokenusage"
	"setta/internal/evalharness/toolpolicy"
	"setta/internal/runtime"
	"setta/internal/speech"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr, os.Getenv))
}

func run(
	args []string,
	stdout io.Writer,
	stderr io.Writer,
	getenv func(string) string,
) int {
	config, err := configFromArgs(args, stdout, stderr, getenv)
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 2
	}
	tokenSink, err := configureTokenUsageSink(&config, getenv)
	if err != nil {
		fmt.Fprintf(stderr, "%v\n", err)
		return 2
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	server, err := runtime.Start(ctx, config)
	if err != nil {
		_ = tokenSink.Close()
		fmt.Fprintf(stderr, "start backend: %v\n", err)
		return 1
	}

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		_ = tokenSink.Close()
		fmt.Fprintf(stderr, "shutdown backend: %v\n", err)
		return 1
	}
	if err := server.Wait(); err != nil {
		_ = tokenSink.Close()
		fmt.Fprintf(stderr, "wait for backend: %v\n", err)
		return 1
	}
	if err := tokenSink.Close(); err != nil {
		fmt.Fprintf(stderr, "close eval token telemetry: %v\n", err)
		return 1
	}
	return 0
}

func configureTokenUsageSink(
	config *runtime.Config,
	getenv func(string) string,
) (*tokenusage.FileSink, error) {
	path := getenv(tokenusage.PathEnvironment)
	if path == "" {
		return nil, nil
	}
	sink, err := tokenusage.OpenFileSink(path)
	if err != nil {
		return nil, fmt.Errorf("configure eval token telemetry: %w", err)
	}
	config.TokenUsageObserver = sink
	return sink, nil
}

func configFromArgs(
	args []string,
	stdout io.Writer,
	stderr io.Writer,
	getenv func(string) string,
) (runtime.Config, error) {
	config := runtime.DefaultConfig()
	config.SpeechCredentialOwner = runtime.SpeechCredentialOwnerElectronVault
	config.Stdout = stdout
	config.Stderr = stderr

	port, err := defaultPort(getenv("SETTA_BACKEND_PORT"))
	if err != nil {
		return config, err
	}
	allowRemote, err := defaultBool(getenv("SETTA_BACKEND_ALLOW_REMOTE"), "SETTA_BACKEND_ALLOW_REMOTE")
	if err != nil {
		return config, err
	}
	restrictExternalTools, err := defaultBool(
		getenv(toolpolicy.RestrictExternalToolsEnvironment),
		toolpolicy.RestrictExternalToolsEnvironment,
	)
	if err != nil {
		return config, err
	}
	appDataDir, err := defaultAppDataDir(getenv)
	if err != nil {
		return config, err
	}
	speechConfig, err := speech.OpenAIProviderConfigFromDesktopEnvironment(getenv)
	if err != nil {
		return config, err
	}
	config.Speech = speechConfig
	config.RestrictAgentExternalTools = restrictExternalTools

	flagSet := flag.NewFlagSet("setta-backend", flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	flagSet.StringVar(&config.AppDataDir, "app-data-dir", appDataDir, "directory for persisted Setta app state")
	flagSet.BoolVar(&config.AllowRemote, "allow-remote", allowRemote, "allow binding to non-loopback numeric IP addresses")
	flagSet.StringVar(&config.RuntimeDisplayName, "display-name", envOrDefault(getenv, "SETTA_RUNTIME_DISPLAY_NAME", config.RuntimeDisplayName), "runtime display name to persist for this Setta instance")
	flagSet.StringVar(&config.Host, "host", envOrDefault(getenv, "SETTA_BACKEND_HOST", config.Host), "loopback host to bind")
	flagSet.IntVar(&config.Port, "port", port, "port to bind, or 0 for an ephemeral port")
	flagSet.BoolVar(&config.SkipBootstrapDeviceSession, "skip-bootstrap-device-session", config.SkipBootstrapDeviceSession, "do not mint a bootstrap device token on startup")
	flagSet.StringVar(&config.Version, "version", envOrDefault(getenv, "SETTA_BACKEND_VERSION", config.Version), "backend version metadata")
	if err := flagSet.Parse(args); err != nil {
		return config, err
	}
	return validatedConfig(config)
}

func validatedConfig(config runtime.Config) (runtime.Config, error) {
	if err := config.Validate(); err != nil {
		return config, fmt.Errorf("invalid configuration: %w", err)
	}
	return config, nil
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

func defaultPort(rawPort string) (int, error) {
	if rawPort == "" {
		return 0, nil
	}
	port, err := strconv.Atoi(rawPort)
	if err != nil {
		return 0, fmt.Errorf("SETTA_BACKEND_PORT must be an integer: %w", err)
	}
	return port, nil
}

func defaultBool(rawValue string, name string) (bool, error) {
	if rawValue == "" || rawValue == "0" {
		return false, nil
	}
	if rawValue == "1" {
		return true, nil
	}
	return false, fmt.Errorf("%s must be 0 or 1", name)
}

func envOrDefault(getenv func(string) string, name string, fallback string) string {
	value := getenv(name)
	if value == "" {
		return fallback
	}
	return value
}
