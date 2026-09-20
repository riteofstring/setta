package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/setta/local-backend/localweb"
	"github.com/setta/realtime/backend/internal/server"
)

type serveOptions struct {
	projectRoot    string
	create         bool
	launcherPython string
	webRoot        string
	sessionNonce   string
	port           uint16
}

type readinessDocument struct {
	App     string `json:"app"`
	Nonce   string `json:"nonce"`
	Project string `json:"project"`
	URL     string `json:"url"`
}

func runServe(arguments []string, stdin io.Reader, stdout io.Writer, opener applicationOpener) error {
	options, err := parseServeOptions(arguments)
	if err != nil {
		return err
	}
	assets, err := localweb.OpenAssets(options.webRoot)
	if err != nil {
		return operationalError(err)
	}
	application, err := opener(options.projectRoot, options.create, options.launcherPython)
	if err != nil {
		return operationalError(err)
	}
	serveErr := serveApplication(stdin, stdout, application, assets, options)
	closeErr := application.Close()
	if serveErr != nil {
		return operationalError(errors.Join(serveErr, closeErr))
	}
	if closeErr != nil {
		return operationalError(closeErr)
	}
	return nil
}

func parseServeOptions(arguments []string) (serveOptions, error) {
	parsed, err := parseOptions(arguments, map[string]optionKind{
		"--project-root":     valueOption,
		"--create":           booleanValueOption,
		"--launcher-python":  valueOption,
		"--web-root":         valueOption,
		"--session-nonce":    valueOption,
		"--supervised-stdin": booleanValueOption,
		"--port":             valueOption,
	})
	if err != nil {
		return serveOptions{}, err
	}
	for _, name := range []string{"--project-root", "--create", "--launcher-python", "--web-root", "--session-nonce", "--supervised-stdin", "--port"} {
		if err := requireValue(parsed, name); err != nil {
			return serveOptions{}, err
		}
	}
	if parsed.values["--supervised-stdin"] != "true" {
		return serveOptions{}, usageError("--supervised-stdin must be true")
	}
	projectRoot, err := canonicalProjectRoot(parsed.values["--project-root"])
	if err != nil {
		return serveOptions{}, err
	}
	port, err := parsePort(parsed.values["--port"])
	if err != nil {
		return serveOptions{}, err
	}
	return serveOptions{
		projectRoot:    projectRoot,
		create:         parsed.values["--create"] == "true",
		launcherPython: parsed.values["--launcher-python"],
		webRoot:        parsed.values["--web-root"],
		sessionNonce:   parsed.values["--session-nonce"],
		port:           port,
	}, nil
}

func serveApplication(stdin io.Reader, stdout io.Writer, application openedApplication, assets *localweb.Assets, options serveOptions) error {
	listener, err := localweb.Listen(options.port)
	if err != nil {
		return err
	}
	defer listener.Close()
	serverURL, err := localweb.URL(listener)
	if err != nil {
		return err
	}
	api, err := server.New(application.ServerCoordinator(), application.ProjectEvents(), application.ContentStore(), options.projectRoot, options.sessionNonce, serverURL)
	if err != nil {
		return err
	}
	handler, err := assets.Handler(api)
	if err != nil {
		return err
	}
	secureHandler, err := localweb.SecureHandler(listener, handler)
	if err != nil {
		return err
	}
	ctx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()
	cancelled, cancel := context.WithCancel(ctx)
	defer cancel()
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- localweb.Serve(cancelled, listener, secureHandler)
	}()
	readiness := readinessDocument{App: "realtime", Nonce: options.sessionNonce, Project: options.projectRoot, URL: serverURL}
	if err := json.NewEncoder(stdout).Encode(readiness); err != nil {
		cancel()
		<-serverErrors
		return fmt.Errorf("write readiness: %w", err)
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
	case <-cancelled.Done():
		cancel()
		return <-serverErrors
	}
}
