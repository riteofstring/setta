package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/setta/realtime/backend/internal/contracts"
)

type fakeCoordinator struct {
	project       contracts.Project
	runtime       contracts.RuntimeSnapshot
	applyResult   contracts.Project
	reloadResult  contracts.InitializeResult
	invokeResult  contracts.InvokeResult
	applyRequest  contracts.ApplyRequest
	invokeRequest contracts.DirectInvokeRequest
	handler       string
	reloadCount   int
}

func (coordinator *fakeCoordinator) ProjectSnapshot() (contracts.Project, error) {
	return coordinator.project, nil
}

func (coordinator *fakeCoordinator) Apply(request contracts.ApplyRequest) (contracts.Project, error) {
	coordinator.applyRequest = request
	return coordinator.applyResult, nil
}

func (coordinator *fakeCoordinator) RuntimeSource() (contracts.RuntimeSourceDocument, error) {
	return contracts.RuntimeSourceDocument{}, nil
}

func (coordinator *fakeCoordinator) ApplyRuntimeSource(context.Context, contracts.ApplyRuntimeSourceRequest) (contracts.ApplyRuntimeSourceResult, error) {
	return contracts.ApplyRuntimeSourceResult{}, nil
}

func (coordinator *fakeCoordinator) Reload(context.Context) (contracts.InitializeResult, error) {
	coordinator.reloadCount++
	return coordinator.reloadResult, nil
}

func (coordinator *fakeCoordinator) Invoke(_ context.Context, handler string, request contracts.DirectInvokeRequest) (contracts.InvokeResult, error) {
	coordinator.handler = handler
	coordinator.invokeRequest = request
	return coordinator.invokeResult, nil
}

func (coordinator *fakeCoordinator) Snapshot() (contracts.RuntimeSnapshot, error) {
	return coordinator.runtime, nil
}

func (coordinator *fakeCoordinator) Subscribe(ctx context.Context) (<-chan contracts.RuntimeEnvelope, error) {
	updates := make(chan contracts.RuntimeEnvelope)
	go func() {
		<-ctx.Done()
		close(updates)
	}()
	return updates, nil
}

func (coordinator *fakeCoordinator) HandleEvent(contracts.RuntimeEvent) (int, error) {
	return 0, nil
}

func (coordinator *fakeCoordinator) Cancel(contracts.RuntimeCancelRequest) error {
	return nil
}

type fakeProjectEvents struct{}

func (fakeProjectEvents) Subscribe(ctx context.Context) (<-chan contracts.Project, error) {
	projects := make(chan contracts.Project)
	go func() {
		<-ctx.Done()
		close(projects)
	}()
	return projects, nil
}

type fakeContentStore struct{}

func (fakeContentStore) Put(string, string, io.Reader) (contracts.ContentReference, error) {
	return contracts.ContentReference{}, errors.New("unexpected content upload")
}

func (fakeContentStore) OpenID(string) (contracts.ContentReference, io.ReadCloser, error) {
	return contracts.ContentReference{}, nil, errors.New("unexpected content download")
}

type fakeApplication struct {
	coordinator *fakeCoordinator
	closed      int
}

func (application *fakeApplication) Coordinator() commandCoordinator {
	return application.coordinator
}

func (application *fakeApplication) ServerCoordinator() serverCoordinator {
	return application.coordinator
}

func (application *fakeApplication) ProjectEvents() projectEvents {
	return fakeProjectEvents{}
}

func (application *fakeApplication) ContentStore() contentStore {
	return fakeContentStore{}
}

func (application *fakeApplication) Close() error {
	application.closed++
	return nil
}

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) {
	return 0, errors.New("stdin must not be read")
}

func TestSchemaEmitsVersionedCommandsAndContracts(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	status := execute([]string{"schema", "--pretty"}, strings.NewReader(""), &stdout, &stderr, os.Getenv, func(string, bool, string) (openedApplication, error) {
		t.Fatal("schema opened an application")
		return nil, nil
	})
	if status != 0 || stderr.Len() != 0 {
		t.Fatalf("execute(schema) = %d, stderr = %q", status, stderr.String())
	}
	if !strings.HasPrefix(stdout.String(), "{\n  \"schemaVersion\"") || !strings.HasSuffix(stdout.String(), "\n") {
		t.Fatalf("pretty schema output = %q", stdout.String())
	}
	var document cliSchemaDocument
	if err := json.Unmarshal(stdout.Bytes(), &document); err != nil {
		t.Fatalf("decode schema: %v", err)
	}
	if document.SchemaVersion != "setta-realtime-schema/v1" || len(document.Commands) != 5 {
		t.Fatalf("schema identity = %#v", document)
	}
	if document.Schemas.ApplyRequest["$id"] == nil || document.Schemas.ApplyRuntimeSourceRequest["$id"] == nil || document.Schemas.ApplyRuntimeSourceResult["$id"] == nil || document.Schemas.DirectInvokeRequest["$id"] == nil || document.Schemas.Project["$id"] == nil || document.Schemas.Runtime["$id"] == nil || document.Schemas.RuntimeCommand["$id"] == nil || document.Schemas.RuntimeSource["$id"] == nil {
		t.Fatalf("schema contracts = %#v", document.Schemas)
	}
}

func TestLocalApplicationCreatesAndLoadsCanonicalProject(t *testing.T) {
	projectRoot := filepath.Join(t.TempDir(), "project")
	launcher, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve executable: %v", err)
	}
	created, err := openLocalApplication(projectRoot, true, launcher)
	if err != nil {
		t.Fatalf("openLocalApplication(create) error = %v", err)
	}
	createdSnapshot, err := created.Coordinator().ProjectSnapshot()
	if err != nil {
		t.Fatalf("created snapshot: %v", err)
	}
	if createdSnapshot.Name != "Realtime App" || createdSnapshot.Runtime.Entrypoint != "app.py" {
		t.Fatalf("created project = %#v", createdSnapshot)
	}
	if err := created.Close(); err != nil {
		t.Fatalf("close created application: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRoot, ".local", "realtime", "project.json")); err != nil {
		t.Fatalf("stat project document: %v", err)
	}
	loaded, err := openLocalApplication(projectRoot, false, launcher)
	if err != nil {
		t.Fatalf("openLocalApplication(load) error = %v", err)
	}
	loadedSnapshot, err := loaded.Coordinator().ProjectSnapshot()
	if err != nil {
		t.Fatalf("loaded snapshot: %v", err)
	}
	if loadedSnapshot.ID != createdSnapshot.ID || loadedSnapshot.Revision != createdSnapshot.Revision {
		t.Fatalf("loaded project = %#v, want identity %#v", loadedSnapshot, createdSnapshot)
	}
	if err := loaded.Close(); err != nil {
		t.Fatalf("close loaded application: %v", err)
	}
}

func TestWorkerEnvironmentDoesNotExposeLauncherSelection(t *testing.T) {
	t.Setenv(launcherPythonEnvironment, "/launcher/python")
	for _, value := range workerEnvironment() {
		if strings.HasPrefix(strings.ToUpper(value), launcherPythonEnvironment+"=") {
			t.Fatalf("worker environment includes %q", value)
		}
	}
}

func TestInvokeReadsStrictInputReloadsAndInvokes(t *testing.T) {
	coordinator := &fakeCoordinator{
		reloadResult: contracts.InitializeResult{ProtocolVersion: 1, RuntimeKind: "python", Handlers: []string{"stream"}},
		invokeResult: contracts.InvokeResult{Outputs: map[string]json.RawMessage{"result": json.RawMessage(`7`)}, Error: nil},
	}
	application := &fakeApplication{coordinator: coordinator}
	var openedRoot string
	var openedLauncher string
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	projectRoot := filepath.Join(t.TempDir(), "project")
	status := execute(
		[]string{"invoke", "--project-root", projectRoot, "--handler", "stream", "--file", "-", "--pretty"},
		strings.NewReader(`{"arguments":{"count":3},"content":[]}`),
		&stdout,
		&stderr,
		func(name string) string {
			if name == launcherPythonEnvironment {
				return "/launcher/python"
			}
			return ""
		},
		func(root string, create bool, launcher string) (openedApplication, error) {
			openedRoot = root
			openedLauncher = launcher
			if create {
				t.Fatal("invoke requested project creation")
			}
			return application, nil
		},
	)
	if status != 0 || stderr.Len() != 0 {
		t.Fatalf("execute(invoke) = %d, stderr = %q", status, stderr.String())
	}
	if openedRoot != projectRoot || openedLauncher != "/launcher/python" {
		t.Fatalf("opened application = %q, %q", openedRoot, openedLauncher)
	}
	if application.closed != 1 || coordinator.reloadCount != 1 || coordinator.handler != "stream" {
		t.Fatalf("lifecycle = closed %d, reload %d, handler %q", application.closed, coordinator.reloadCount, coordinator.handler)
	}
	if string(coordinator.invokeRequest.Arguments["count"]) != "3" || coordinator.invokeRequest.Content == nil {
		t.Fatalf("invoke request = %#v", coordinator.invokeRequest)
	}
	if !strings.Contains(stdout.String(), "\n  \"outputs\"") {
		t.Fatalf("pretty invoke output = %q", stdout.String())
	}
}

func TestInvokeWithoutFileDoesNotReadStdin(t *testing.T) {
	coordinator := &fakeCoordinator{
		reloadResult: contracts.InitializeResult{ProtocolVersion: 1, RuntimeKind: "python", Handlers: []string{"run"}},
		invokeResult: contracts.InvokeResult{Outputs: map[string]json.RawMessage{}},
	}
	application := &fakeApplication{coordinator: coordinator}
	status := execute(
		[]string{"invoke", "--project-root", t.TempDir(), "--handler", "run"},
		failingReader{},
		io.Discard,
		io.Discard,
		func(string) string { return "/launcher/python" },
		func(string, bool, string) (openedApplication, error) { return application, nil },
	)
	if status != 0 {
		t.Fatalf("execute(invoke) = %d", status)
	}
	if coordinator.invokeRequest.Arguments == nil || coordinator.invokeRequest.Content == nil {
		t.Fatalf("default invoke request = %#v", coordinator.invokeRequest)
	}
}

func TestApplyRejectsUnknownInputBeforeOpeningProject(t *testing.T) {
	var stderr bytes.Buffer
	status := execute(
		[]string{"apply", "--project-root", t.TempDir(), "--file", "-"},
		strings.NewReader(`{"projectId":"project-1","expectedRevision":0,"operations":[],"extra":true}`),
		io.Discard,
		&stderr,
		func(string) string { return "/launcher/python" },
		func(string, bool, string) (openedApplication, error) {
			t.Fatal("invalid apply opened an application")
			return nil, nil
		},
	)
	if status != 2 {
		t.Fatalf("execute(apply) = %d, stderr = %q", status, stderr.String())
	}
	var document map[string]contracts.StructuredError
	if err := json.Unmarshal(stderr.Bytes(), &document); err != nil {
		t.Fatalf("decode error: %v", err)
	}
	if document["error"].Code != "invalid_input" || !strings.Contains(document["error"].Message, "unknown field") {
		t.Fatalf("error document = %#v", document)
	}
}

func TestSnapshotRequiresSelectedLauncherEnvironment(t *testing.T) {
	var stderr bytes.Buffer
	status := execute(
		[]string{"snapshot", "--project-root", t.TempDir()},
		strings.NewReader(""),
		io.Discard,
		&stderr,
		func(string) string { return "" },
		func(string, bool, string) (openedApplication, error) {
			t.Fatal("snapshot opened without selected launcher")
			return nil, nil
		},
	)
	if status != 2 || !strings.Contains(stderr.String(), launcherPythonEnvironment) {
		t.Fatalf("execute(snapshot) = %d, stderr = %q", status, stderr.String())
	}
}

func TestServePublishesExactReadinessAndStopsOnStdinEOF(t *testing.T) {
	webRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(webRoot, "index.html"), []byte("ready"), 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}
	projectRoot := filepath.Join(t.TempDir(), "project")
	application := &fakeApplication{coordinator: &fakeCoordinator{}}
	stdinReader, stdinWriter := io.Pipe()
	stdoutReader, stdoutWriter := io.Pipe()
	var stderr bytes.Buffer
	done := make(chan int, 1)
	go func() {
		done <- execute(
			[]string{
				"serve",
				"--project-root", projectRoot,
				"--create=true",
				"--launcher-python", "/launcher/python",
				"--web-root", webRoot,
				"--session-nonce", "nonce-value",
				"--supervised-stdin=true",
				"--port", "0",
			},
			stdinReader,
			stdoutWriter,
			&stderr,
			os.Getenv,
			func(root string, create bool, launcher string) (openedApplication, error) {
				if root != projectRoot || !create || launcher != "/launcher/python" {
					t.Errorf("open application = %q, %t, %q", root, create, launcher)
				}
				return application, nil
			},
		)
	}()
	var readiness readinessDocument
	if err := json.NewDecoder(stdoutReader).Decode(&readiness); err != nil {
		t.Fatalf("decode readiness: %v", err)
	}
	if readiness.App != "realtime" || readiness.Nonce != "nonce-value" || readiness.Project != projectRoot {
		t.Fatalf("readiness = %#v", readiness)
	}
	assertReadinessIdentity(t, readiness, projectRoot)
	if err := stdinWriter.Close(); err != nil {
		t.Fatalf("close supervised stdin: %v", err)
	}
	assertServeCompletion(t, done, &stderr, application)
	_ = stdoutWriter.Close()
	_ = stdoutReader.Close()
}

func assertReadinessIdentity(t *testing.T, readiness readinessDocument, projectRoot string) {
	t.Helper()
	response, err := http.Get(readiness.URL + "/api/v2/runtime/session")
	if err != nil {
		t.Fatalf("get identity: %v", err)
	}
	defer response.Body.Close()
	var identity map[string]string
	if err := json.NewDecoder(response.Body).Decode(&identity); err != nil {
		t.Fatalf("decode identity: %v", err)
	}
	if identity["appId"] != "realtime" || identity["projectPath"] != projectRoot || identity["instanceNonce"] != "nonce-value" {
		t.Fatalf("identity = %#v", identity)
	}
}

func assertServeCompletion(t *testing.T, done <-chan int, stderr *bytes.Buffer, application *fakeApplication) {
	t.Helper()
	select {
	case status := <-done:
		if status != 0 || stderr.Len() != 0 || application.closed != 1 {
			t.Fatalf("serve completion = %d, stderr %q, closes %d", status, stderr.String(), application.closed)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("serve did not stop after stdin EOF")
	}
}

func TestServeRejectsNonSupervisedModeBeforeOpening(t *testing.T) {
	var stderr bytes.Buffer
	status := execute(
		[]string{
			"serve",
			"--project-root", t.TempDir(),
			"--create=false",
			"--launcher-python", "/launcher/python",
			"--web-root", t.TempDir(),
			"--session-nonce", "nonce-value",
			"--supervised-stdin=false",
			"--port", "0",
		},
		strings.NewReader(""),
		io.Discard,
		&stderr,
		os.Getenv,
		func(string, bool, string) (openedApplication, error) {
			t.Fatal("invalid serve opened an application")
			return nil, nil
		},
	)
	if status != 2 || !strings.Contains(stderr.String(), "must be true") {
		t.Fatalf("execute(serve) = %d, stderr = %q", status, stderr.String())
	}
}

func TestServePreflightsAssetsBeforeCreatingProject(t *testing.T) {
	var stderr bytes.Buffer
	status := execute(
		[]string{
			"serve",
			"--project-root", filepath.Join(t.TempDir(), "project"),
			"--create=true",
			"--launcher-python", "/launcher/python",
			"--web-root", t.TempDir(),
			"--session-nonce", "nonce-value",
			"--supervised-stdin=true",
			"--port", "0",
		},
		strings.NewReader(""),
		io.Discard,
		&stderr,
		os.Getenv,
		func(string, bool, string) (openedApplication, error) {
			t.Fatal("invalid assets opened an application")
			return nil, nil
		},
	)
	if status != 1 || !strings.Contains(stderr.String(), "production index") {
		t.Fatalf("execute(serve) = %d, stderr = %q", status, stderr.String())
	}
}

func TestServeRejectsDuplicateAndPositionalArguments(t *testing.T) {
	for _, arguments := range [][]string{
		{"--port", "0", "--port", "1"},
		{"--port", "0", "positional"},
		{"--create", "true"},
	} {
		if _, err := parseServeOptions(arguments); err == nil {
			t.Fatalf("parseServeOptions(%q) succeeded", arguments)
		}
	}
}
