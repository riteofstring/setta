package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"

	"github.com/setta/bench/backend/internal/coordinator"
	"github.com/setta/bench/backend/internal/httpapi"
	"github.com/setta/bench/backend/internal/localweb"
	"github.com/setta/bench/backend/internal/project"
	"github.com/setta/bench/backend/internal/runstore"
)

type serveOptions struct {
	projectRoot     string
	create          bool
	webRoot         string
	sessionNonce    string
	supervisedStdin bool
	port            uint16
}

type readinessDocument struct {
	App     string `json:"app"`
	Project string `json:"project"`
	Nonce   string `json:"nonce"`
	URL     string `json:"url"`
}

type application struct {
	coordinator *coordinator.Coordinator
}

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(arguments []string, stdin io.Reader, stdout io.Writer) error {
	if len(arguments) == 0 || arguments[0] != "serve" {
		return errors.New("usage: bench serve --project-root PATH --create=BOOL --web-root PATH --session-nonce NONCE --supervised-stdin=true --port PORT")
	}
	options, err := parseServeOptions(arguments[1:])
	if err != nil {
		return err
	}
	assets, err := localweb.OpenAssets(options.webRoot)
	if err != nil {
		return err
	}
	projects, err := project.Open(options.projectRoot, options.create)
	if err != nil {
		return err
	}
	runs, err := runstore.Open(projects.StateRoot())
	if err != nil {
		return err
	}
	control, err := coordinator.New(projects, runs)
	if err != nil {
		return err
	}
	app := &application{coordinator: control}
	serveErr := serve(stdin, stdout, app, projects.Root(), assets, options)
	return errors.Join(serveErr, app.coordinator.Close())
}

func parseServeOptions(arguments []string) (serveOptions, error) {
	flags := flag.NewFlagSet("bench serve", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	projectRoot := flags.String("project-root", "", "")
	create := flags.Bool("create", false, "")
	webRoot := flags.String("web-root", "", "")
	sessionNonce := flags.String("session-nonce", "", "")
	supervisedStdin := flags.Bool("supervised-stdin", false, "")
	portText := flags.String("port", "", "")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return serveOptions{}, errors.New("bench serve arguments are invalid")
	}
	if strings.TrimSpace(*projectRoot) == "" || strings.TrimSpace(*webRoot) == "" || strings.TrimSpace(*sessionNonce) == "" || !*supervisedStdin {
		return serveOptions{}, errors.New("bench serve requires project root, web root, session nonce, and supervised stdin")
	}
	port, err := strconv.ParseUint(*portText, 10, 16)
	if err != nil {
		return serveOptions{}, errors.New("bench serve port is invalid")
	}
	return serveOptions{
		projectRoot: *projectRoot, create: *create, webRoot: *webRoot,
		sessionNonce: *sessionNonce, supervisedStdin: *supervisedStdin, port: uint16(port),
	}, nil
}

func serve(stdin io.Reader, stdout io.Writer, app *application, projectRoot string, assets *localweb.Assets, options serveOptions) error {
	listener, err := localweb.Listen(options.port)
	if err != nil {
		return err
	}
	defer listener.Close()
	serverURL, err := localweb.URL(listener)
	if err != nil {
		return err
	}
	api, err := httpapi.New(app.coordinator, projectRoot, options.sessionNonce, serverURL)
	if err != nil {
		return err
	}
	handler, err := assets.Handler(api)
	if err != nil {
		return err
	}
	secure, err := localweb.SecureHandler(listener, handler)
	if err != nil {
		return err
	}
	signalContext, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()
	ctx, cancel := context.WithCancel(signalContext)
	defer cancel()
	serverErrors := make(chan error, 1)
	go func() { serverErrors <- localweb.Serve(ctx, listener, secure) }()
	readiness := readinessDocument{App: "bench", Project: projectRoot, Nonce: options.sessionNonce, URL: serverURL}
	if err := json.NewEncoder(stdout).Encode(readiness); err != nil {
		cancel()
		return errors.Join(err, <-serverErrors)
	}
	stdinDone := make(chan struct{})
	go func() {
		_, _ = io.Copy(io.Discard, stdin)
		close(stdinDone)
	}()
	select {
	case err := <-serverErrors:
		cancel()
		return err
	case <-stdinDone:
		cancel()
		return <-serverErrors
	case <-ctx.Done():
		cancel()
		return <-serverErrors
	}
}
