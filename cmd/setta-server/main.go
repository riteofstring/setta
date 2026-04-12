package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"time"

	"setta/internal/app"
	"setta/internal/config"
	"setta/internal/launcher"
	"setta/internal/observability"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

type runOptions struct {
	cli                 config.CLIOptions
	noOpen              bool
	launcherArtifactRun bool
}

func run(args []string) (err error) {
	options, err := parseRunOptions(args)
	if err != nil {
		return err
	}
	if options.launcherArtifactRun {
		return launchArtifactRun(options.cli.SettaHome)
	}

	cfg, err := loadRunConfig(options.cli)
	if err != nil {
		return err
	}
	if err := config.EnsureUserConfigExists(cfg.Paths.SettaHome); err != nil {
		return err
	}

	logger := observability.NewLogger(cfg.Server.LogLevel, os.Stderr)

	listener, err := openServerListener(cfg)
	if err != nil {
		return err
	}
	defer listener.Close()

	localSession, err := maybeBootstrapLocalSession(cfg, listener)
	if err != nil {
		return err
	}
	defer cleanupLocalProcessSession(localSession, &err)

	application, err := app.New(cfg, logger)
	if err != nil {
		return err
	}
	if err := emitModeStartupOutput(cfg, listener, localSession, options.noOpen); err != nil {
		return err
	}

	logger.Info("setta server listening", "addr", listener.Addr().String(), "mode", cfg.Server.Mode)
	return serveUntilInterrupted(application, listener)
}

func parseRunOptions(args []string) (runOptions, error) {
	options := runOptions{}
	flags := flag.NewFlagSet("setta-server", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	flags.StringVar(&options.cli.WorkspaceRoot, "workspace", "", "Workspace root.")
	flags.StringVar(&options.cli.DeploymentRoot, "deployment-root", "", "Deployment root for share/app mode.")
	flags.StringVar(&options.cli.SettaHome, "setta-home", "", "Setta home.")
	flags.StringVar(&options.cli.ProfileLookupHome, "profile-lookup-home", "", "Setta profile lookup home.")
	flags.StringVar(&options.cli.Profile, "profile", "", "Runtime profile name.")
	flags.StringVar(&options.cli.SettaFilesRoot, "setta-files-root", "", "Explicit setta_files root.")
	flags.StringVar(&options.cli.SettaFilesLocation, "setta-files-location", "", "setta_files location mode: auto, local, or global.")
	flags.StringVar(&options.cli.RuntimeRoot, "runtime-root", "", "Runtime root.")
	flags.StringVar(&options.cli.Host, "host", "", "Listen host.")
	flags.StringVar(&options.cli.Port, "port", "", "Listen port.")
	flags.StringVar(&options.cli.Mode, "mode", "", "Server mode: ide, share, app, or launcher.")
	flags.StringVar(&options.cli.LogLevel, "log-level", "", "Log level: debug, info, warn, or error.")
	flags.BoolVar(&options.noOpen, "no-open", false, "Skip automatic browser opening.")
	flags.BoolVar(&options.launcherArtifactRun, "launcher-artifact-run", false, "Run the managed desktop launcher entrypoint.")
	if err := flags.Parse(args); err != nil {
		return runOptions{}, err
	}
	return options, nil
}

func launchArtifactRun(settaHome string) error {
	executablePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve current executable: %w", err)
	}
	artifactLauncher, err := launcher.NewArtifactLauncher(launcher.ArtifactLaunchOptions{
		ExecutablePath: executablePath,
	})
	if err != nil {
		return err
	}
	_, err = artifactLauncher.Launch(settaHome)
	return err
}

func loadRunConfig(cli config.CLIOptions) (config.Config, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return config.Config{}, fmt.Errorf("resolve cwd: %w", err)
	}
	return config.Load(config.LoadOptions{
		CWD: cwd,
		CLI: cli,
	})
}

func openServerListener(cfg config.Config) (net.Listener, error) {
	listener, err := net.Listen("tcp", net.JoinHostPort(cfg.Server.Host, strconv.Itoa(cfg.Server.Port)))
	if err != nil {
		return nil, fmt.Errorf("listen: %w", err)
	}
	return listener, nil
}

func cleanupLocalProcessSession(localSession *localProcessSession, runErr *error) {
	if localSession == nil {
		return
	}
	cleanupErr := localSession.Cleanup()
	if cleanupErr == nil || runErr == nil || *runErr != nil {
		return
	}
	*runErr = cleanupErr
}

func emitModeStartupOutput(cfg config.Config, listener net.Listener, localSession *localProcessSession, noOpen bool) error {
	switch cfg.Server.Mode {
	case config.ModeIDE:
		return emitLocalStartupOutput(cfg, localSession, noOpen, os.Stdout, os.Stderr, localStartupDependencies{})
	case config.ModeShare:
		return emitShareStartupOutput(cfg, listener, noOpen, os.Stdout, os.Stderr, shareStartupDependencies{})
	case config.ModeApp:
		return emitAppStartupOutput(cfg, listener, noOpen, os.Stdout, os.Stderr, appStartupDependencies{})
	default:
		return nil
	}
}

func serveUntilInterrupted(application *app.App, listener net.Listener) error {
	server := newHTTPServer(application, listener)
	serverErr := startHTTPServer(server, listener)
	signalCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	select {
	case <-signalCtx.Done():
		return shutdownOnInterrupt(application, server, serverErr)
	case err := <-serverErr:
		return normalizeServerExit(err)
	}
}

func newHTTPServer(application *app.App, listener net.Listener) *http.Server {
	return &http.Server{
		Addr:    listener.Addr().String(),
		Handler: application.Handler(),
		BaseContext: func(net.Listener) context.Context {
			return application.Runtime().Context()
		},
	}
}

func startHTTPServer(server *http.Server, listener net.Listener) <-chan error {
	serverErr := make(chan error, 1)
	go func() {
		serverErr <- server.Serve(listener)
	}()
	return serverErr
}

func shutdownOnInterrupt(application *app.App, server *http.Server, serverErr <-chan error) error {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := application.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown runtime: %w", err)
	}
	if err := server.Shutdown(shutdownCtx); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("shutdown http server: %w", err)
	}
	return normalizeServerExit(<-serverErr)
}

func normalizeServerExit(err error) error {
	if err == nil || err == http.ErrServerClosed {
		return nil
	}
	return err
}
