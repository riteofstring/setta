package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/setta/python-canvas/backend/internal/httpapi"
	"github.com/setta/python-canvas/backend/internal/lsp"
	"github.com/setta/python-canvas/backend/internal/project"
)

const defaultPort = 8080

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:], serve); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

type serviceStarter func(context.Context, uint16) error

func run(ctx context.Context, arguments []string, start serviceStarter) error {
	flags := flag.NewFlagSet("python-canvas", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	port := flags.Uint("port", defaultPort, "loopback port")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("python-canvas does not accept positional arguments")
	}
	if *port > 65535 {
		return fmt.Errorf("port must be between 0 and 65535")
	}
	return start(ctx, uint16(*port))
}

func serve(ctx context.Context, port uint16) error {
	appRoot, err := findAppRoot()
	if err != nil {
		return err
	}
	generatedFile, err := project.NewTemporaryGeneratedFile()
	if err != nil {
		return err
	}
	provider, err := lsp.NewBasedpyrightProvider(lsp.BasedpyrightOptions{
		AppRoot:       appRoot,
		WorkspaceRoot: filepath.Dir(generatedFile.Path()),
	})
	if err != nil {
		_ = generatedFile.Close()
		return err
	}
	store, err := project.NewStoreWithProvider(generatedFile, provider)
	if err != nil {
		_ = provider.Close()
		_ = generatedFile.Close()
		return err
	}
	defer store.Close()
	return httpapi.ServeLoopback(ctx, port, store)
}

func findAppRoot() (string, error) {
	directory, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get Python Canvas working directory: %w", err)
	}
	for {
		if isRegularFile(filepath.Join(directory, "package.json")) &&
			isRegularFile(filepath.Join(directory, "backend", "go.mod")) {
			return directory, nil
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			return "", fmt.Errorf("find Python Canvas app root from %s", directory)
		}
		directory = parent
	}
}

func isRegularFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}
