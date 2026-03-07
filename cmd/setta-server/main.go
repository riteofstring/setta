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
	"setta/internal/observability"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string) error {
	var cli config.CLIOptions
	var noOpen bool

	flags := flag.NewFlagSet("setta-server", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	flags.StringVar(&cli.WorkspaceRoot, "workspace", "", "Workspace root.")
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
	flags.BoolVar(&noOpen, "no-open", false, "Accepted for compatibility; browser launch is not implemented in Go.")
	if err := flags.Parse(args); err != nil {
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
	if noOpen {
		logger.Debug("browser launch requested but not implemented in go runtime")
	}

	application, err := app.New(cfg, logger)
	if err != nil {
		return err
	}

	listener, err := net.Listen("tcp", net.JoinHostPort(cfg.Server.Host, strconv.Itoa(cfg.Server.Port)))
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	defer listener.Close()

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
		if err := server.Shutdown(shutdownCtx); err != nil && err != http.ErrServerClosed {
			return fmt.Errorf("shutdown http server: %w", err)
		}
		if err := application.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown runtime: %w", err)
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
