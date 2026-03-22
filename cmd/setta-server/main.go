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

func run(args []string) (err error) {
	var cli config.CLIOptions
	var noOpen bool
	var launcherArtifactRun bool

	flags := flag.NewFlagSet("setta-server", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	flags.StringVar(&cli.WorkspaceRoot, "workspace", "", "Workspace root.")
	flags.StringVar(&cli.DeploymentRoot, "deployment-root", "", "Deployment root for share/app mode.")
	flags.StringVar(&cli.SettaHome, "setta-home", "", "Setta home.")
	flags.StringVar(&cli.ProfileLookupHome, "profile-lookup-home", "", "Setta profile lookup home.")
	flags.StringVar(&cli.Profile, "profile", "", "Runtime profile name.")
	flags.StringVar(&cli.SettaFilesRoot, "setta-files-root", "", "Explicit setta_files root.")
	flags.StringVar(&cli.SettaFilesLocation, "setta-files-location", "", "setta_files location mode: auto, local, or global.")
	flags.StringVar(&cli.RuntimeRoot, "runtime-root", "", "Runtime root.")
	flags.StringVar(&cli.Host, "host", "", "Listen host.")
	flags.StringVar(&cli.Port, "port", "", "Listen port.")
	flags.StringVar(&cli.Mode, "mode", "", "Server mode: ide, share, app, or launcher.")
	flags.StringVar(&cli.LogLevel, "log-level", "", "Log level: debug, info, warn, or error.")
	flags.BoolVar(&noOpen, "no-open", false, "Skip automatic browser opening.")
	flags.BoolVar(&launcherArtifactRun, "launcher-artifact-run", false, "Run the managed desktop launcher entrypoint.")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if launcherArtifactRun {
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
		_, err = artifactLauncher.Launch(cli.SettaHome)
		return err
	}

	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("resolve cwd: %w", err)
	}
	cfg, err := config.Load(config.LoadOptions{
		CWD: cwd,
		CLI: cli,
	})
	if err != nil {
		return err
	}
	if err := config.EnsureUserConfigExists(cfg.Paths.SettaHome); err != nil {
		return err
	}

	logger := observability.NewLogger(cfg.Server.LogLevel, os.Stderr)

	listener, err := net.Listen("tcp", net.JoinHostPort(cfg.Server.Host, strconv.Itoa(cfg.Server.Port)))
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	defer listener.Close()

	localSession, err := maybeBootstrapLocalSession(cfg, listener)
	if err != nil {
		return err
	}
	defer func() {
		if localSession == nil {
			return
		}
		cleanupErr := localSession.Cleanup()
		if err == nil && cleanupErr != nil {
			err = cleanupErr
		}
	}()

	application, err := app.New(cfg, logger)
	if err != nil {
		return err
	}
	switch cfg.Server.Mode {
	case config.ModeIDE:
		if err := emitLocalStartupOutput(cfg, localSession, noOpen, os.Stdout, os.Stderr, localStartupDependencies{}); err != nil {
			return err
		}
	case config.ModeShare:
		if err := emitShareStartupOutput(cfg, listener, noOpen, os.Stdout, os.Stderr, shareStartupDependencies{}); err != nil {
			return err
		}
	case config.ModeApp:
		if err := emitAppStartupOutput(cfg, listener, noOpen, os.Stdout, os.Stderr, appStartupDependencies{}); err != nil {
			return err
		}
	}

	server := &http.Server{
		Addr:    listener.Addr().String(),
		Handler: application.Handler(),
		BaseContext: func(net.Listener) context.Context {
			return application.Runtime().Context()
		},
	}

	logger.Info("setta server listening", "addr", server.Addr, "mode", cfg.Server.Mode)

	serverErr := make(chan error, 1)
	go func() {
		serverErr <- server.Serve(listener)
	}()

	signalCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	select {
	case <-signalCtx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := application.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown runtime: %w", err)
		}
		if err := server.Shutdown(shutdownCtx); err != nil && err != http.ErrServerClosed {
			return fmt.Errorf("shutdown http server: %w", err)
		}
		if err := <-serverErr; err != nil && err != http.ErrServerClosed {
			return err
		}
		return nil
	case err := <-serverErr:
		if err != nil && err != http.ErrServerClosed {
			return err
		}
		return nil
	}
}
