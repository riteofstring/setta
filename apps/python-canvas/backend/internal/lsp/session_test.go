package lsp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/setta/python-canvas/backend/internal/project"
)

func TestReadEnvelopeRejectsMalformedProtocolFrame(t *testing.T) {
	_, err := readEnvelope(bufio.NewReader(strings.NewReader("Content-Length: not-a-number\r\n\r\n")))
	if err == nil {
		t.Fatal("readEnvelope() error = nil, want malformed Content-Length failure")
	}
}

func TestSessionReadLoopSignalsDiagnosticWaiterOnStreamFailure(t *testing.T) {
	waiter := newDiagnosticWaiter()
	session := sessionWithDiagnosticWaiter(waiter)

	session.readLoop(strings.NewReader(""))

	err := waitForDiagnosticFailure(t, waiter)
	if !errors.Is(err, ErrSessionStreamFailed) {
		t.Fatalf("waitForExactDiagnostics() error = %v, want session stream failure", err)
	}
	if !errors.Is(err, io.EOF) {
		t.Fatalf("waitForExactDiagnostics() error = %v, want EOF cause", err)
	}
	if !errors.Is(session.terminalErr, ErrSessionStreamFailed) {
		t.Fatalf("session terminal error = %v, want stream failure", session.terminalErr)
	}
}

func TestSessionSignalsDiagnosticWaiterForStructurallyMalformedPublishDiagnostic(t *testing.T) {
	waiter := newDiagnosticWaiter()
	session := sessionWithDiagnosticWaiter(waiter)

	session.dispatch(rpcEnvelope{
		Method: "textDocument/publishDiagnostics",
		Params: json.RawMessage(`{"uri":"file:///temporary/setta_gen.py","version":1,"diagnostics":[{}]}`),
	})

	err := waitForDiagnosticFailure(t, waiter)
	if !errors.Is(err, ErrSessionStreamFailed) {
		t.Fatalf("waitForExactDiagnostics() error = %v, want session stream failure", err)
	}
	if !strings.Contains(err.Error(), "diagnostic 0 is malformed") {
		t.Fatalf("waitForExactDiagnostics() error = %v, want malformed publishDiagnostics cause", err)
	}
}

func TestDecodePublishDiagnosticsRetainsStringDiagnosticCode(t *testing.T) {
	publication, err := decodePublishDiagnostics(json.RawMessage(`{
  "uri":"file:///temporary/setta_gen.py",
  "version":1,
  "diagnostics":[{
    "range":{"start":{"line":0,"character":0},"end":{"line":0,"character":4}},
    "severity":1,
    "message":"Argument missing",
    "code":"reportCallIssue"
  }]
}`))
	if err != nil {
		t.Fatalf("decodePublishDiagnostics() error = %v", err)
	}
	if len(publication.Diagnostics) != 1 || publication.Diagnostics[0].Code != "reportCallIssue" {
		t.Fatalf("decoded diagnostics = %#v", publication.Diagnostics)
	}
}

func TestDecodePublishDiagnosticsRejectsMalformedDiagnosticCodes(t *testing.T) {
	for _, code := range []string{"42", `" "`, "null", "{}"} {
		t.Run(code, func(t *testing.T) {
			_, err := decodePublishDiagnostics(json.RawMessage(`{
  "uri":"file:///temporary/setta_gen.py",
  "diagnostics":[{
    "range":{"start":{"line":0,"character":0},"end":{"line":0,"character":0}},
    "message":"diagnostic",
    "code":` + code + `
  }]
}`))
			if err == nil || !strings.Contains(err.Error(), "code") {
				t.Fatalf("decodePublishDiagnostics() error = %v, want malformed code failure", err)
			}
		})
	}
}

func TestNormalizeDiagnosticsCarriesValidatedCodeToProjectBoundary(t *testing.T) {
	diagnostics := normalizeDiagnostics("value", []Diagnostic{{
		Range: Range{
			Start: Position{Line: 0, Character: 0},
			End:   Position{Line: 0, Character: 5},
		},
		Severity: 1,
		Message:  "Argument missing",
		Code:     "reportCallIssue",
	}})
	if len(diagnostics) != 1 || diagnostics[0].Code != "reportCallIssue" {
		t.Fatalf("normalized diagnostics = %#v", diagnostics)
	}
}

const (
	sessionInitializationHelperEnv          = "SETTA_LSP_SESSION_INITIALIZATION_HELPER"
	sessionInitializationSignalDirectoryEnv = "SETTA_LSP_SESSION_INITIALIZATION_SIGNAL_DIRECTORY"
)

func TestSessionCancellationDuringInitializationDoesNotCloseSharedSession(t *testing.T) {
	signalDirectory := t.TempDir()
	releasePath := filepath.Join(signalDirectory, "release")
	t.Setenv(sessionInitializationHelperEnv, "1")
	t.Setenv(sessionInitializationSignalDirectoryEnv, signalDirectory)

	session, err := NewSession(SessionOptions{
		Command:        os.Args[0],
		Args:           []string{"-test.run=^TestSessionInitializationHelperProcess$"},
		RequestTimeout: time.Second,
	})
	if err != nil {
		t.Fatalf("NewSession() error = %v", err)
	}
	t.Cleanup(func() {
		if err := session.Close(); err != nil {
			t.Errorf("Close() error = %v", err)
		}
	})
	t.Cleanup(func() {
		_ = os.WriteFile(releasePath, []byte("release"), 0o600)
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	firstCompletionDone := make(chan error, 1)
	go func() {
		_, err := session.Completion(ctx, filepath.Join(signalDirectory, "first.py"), Position{})
		firstCompletionDone <- err
	}()
	waitForSessionInitializationMarker(t, signalDirectory)
	cancel()
	if err := os.WriteFile(releasePath, []byte("release"), 0o600); err != nil {
		t.Fatalf("release initialization helper: %v", err)
	}

	select {
	case err := <-firstCompletionDone:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("first Completion() error = %v, want cancellation", err)
		}
	case <-time.After(time.Second):
		t.Fatal("first Completion() did not return after cancellation")
	}

	result, err := session.Completion(context.Background(), filepath.Join(signalDirectory, "later.py"), Position{})
	if err != nil {
		t.Fatalf("later Completion() error = %v, want usable shared session", err)
	}
	if result.Items == nil || len(result.Items) != 0 {
		t.Fatalf("later completion items = %#v, want an empty result", result.Items)
	}
}

func TestSessionInitializationHelperProcess(t *testing.T) {
	if os.Getenv(sessionInitializationHelperEnv) != "1" {
		return
	}

	reader := bufio.NewReader(os.Stdin)
	for {
		request, err := readEnvelope(reader)
		if err != nil {
			return
		}
		switch request.Method {
		case "initialize":
			signalDirectory := os.Getenv(sessionInitializationSignalDirectoryEnv)
			if err := os.WriteFile(filepath.Join(signalDirectory, "initialize-received"), []byte("received"), 0o600); err != nil {
				os.Exit(2)
			}
			waitForSessionInitializationRelease(signalDirectory)
			writeSessionTestResult(request.ID, json.RawMessage(`{}`))
		case "textDocument/completion":
			writeSessionTestResult(request.ID, json.RawMessage(`{"items":[]}`))
		case "shutdown":
			writeSessionTestResult(request.ID, json.RawMessage(`{}`))
		case "exit":
			os.Exit(0)
		}
	}
}

func waitForSessionInitializationMarker(t *testing.T, signalDirectory string) {
	t.Helper()
	marker := filepath.Join(signalDirectory, "initialize-received")
	deadline := time.Now().Add(time.Second)
	for {
		if _, err := os.Stat(marker); err == nil {
			return
		} else if !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("check initialization marker: %v", err)
		}
		if time.Now().After(deadline) {
			t.Fatal("initialization helper did not receive initialize")
		}
		time.Sleep(time.Millisecond)
	}
}

func waitForSessionInitializationRelease(signalDirectory string) {
	releasePath := filepath.Join(signalDirectory, "release")
	for {
		if _, err := os.Stat(releasePath); err == nil {
			return
		} else if !errors.Is(err, os.ErrNotExist) {
			os.Exit(2)
		}
		time.Sleep(time.Millisecond)
	}
}

func writeSessionTestResult(id json.RawMessage, result json.RawMessage) {
	payload, err := json.Marshal(struct {
		JSONRPC string          `json:"jsonrpc"`
		ID      json.RawMessage `json:"id"`
		Result  json.RawMessage `json:"result"`
	}{
		JSONRPC: "2.0",
		ID:      id,
		Result:  result,
	})
	if err != nil {
		os.Exit(2)
	}
	if _, err := fmt.Fprintf(os.Stdout, "Content-Length: %d\r\n\r\n%s", len(payload), payload); err != nil {
		os.Exit(2)
	}
}

func sessionWithDiagnosticWaiter(waiter *diagnosticWaiter) *Session {
	return &Session{
		pending:    make(map[string]chan rpcEnvelope),
		callbacks:  map[string]diagnosticsCallback{"file:///temporary/setta_gen.py": waiter.notify},
		readerDone: make(chan struct{}),
	}
}

func waitForDiagnosticFailure(t *testing.T, waiter *diagnosticWaiter) error {
	t.Helper()
	provider := &BasedpyrightProvider{diagnosticTimeout: time.Second}
	_, err := provider.waitForExactDiagnostics(context.Background(), project.GeneratedDocumentRequest{
		Revision: 1,
	}, waiter)
	return err
}
