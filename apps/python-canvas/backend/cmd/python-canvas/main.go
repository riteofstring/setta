package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/setta/python-canvas/backend/internal/httpapi"
	"github.com/setta/python-canvas/backend/internal/lsp"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/coordinator"
	"github.com/setta/python-canvas/backend/internal/project/materializer"
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

type serviceStarter func(context.Context, uint16, string, bool) error

func run(ctx context.Context, arguments []string, start serviceStarter) error {
	flags := flag.NewFlagSet("python-canvas", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	port := flags.Uint("port", defaultPort, "loopback port")
	projectPath := flags.String("project", "", "authored project path")
	create := flags.Bool("create", false, "exclusively create the project if it is absent")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("python-canvas does not accept positional arguments")
	}
	if *port > 65535 {
		return fmt.Errorf("port must be between 0 and 65535")
	}
	if *projectPath == "" {
		return fmt.Errorf("python-canvas requires --project PATH")
	}
	return start(ctx, uint16(*port), *projectPath, *create)
}

func serve(ctx context.Context, port uint16, projectPath string, create bool) error {
	appRoot, err := findAppRoot()
	if err != nil {
		return err
	}
	generatedDocument, err := materializer.New(projectPath)
	if err != nil {
		return err
	}
	provider, err := lsp.NewBasedpyrightProvider(lsp.BasedpyrightOptions{
		AppRoot:       appRoot,
		WorkspaceRoot: filepath.Dir(projectPath),
	})
	if err != nil {
		_ = generatedDocument.Close()
		return err
	}
	application, err := coordinator.Open(ctx, coordinator.Options{
		ProjectPath:  projectPath,
		Create:       create,
		IDGenerator:  generatedID,
		Materializer: generatedDocument,
		Provider:     provider,
	})
	if err != nil {
		_ = provider.Close()
		_ = generatedDocument.Close()
		return err
	}
	defer application.Close()
	service, err := httpapi.NewCoordinatorService(application)
	if err != nil {
		return err
	}
	return httpapi.ServeLoopback(ctx, port, service)
}

func generatedID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("allocate project ID: %w", err)
	}
	return "id:" + hex.EncodeToString(bytes), nil
}

var _ aggregate.IDGenerator = generatedID

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
