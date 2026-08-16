package lsp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
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

func TestSessionSignalsDiagnosticWaiterForMalformedPublishDiagnostics(t *testing.T) {
	waiter := newDiagnosticWaiter()
	session := sessionWithDiagnosticWaiter(waiter)

	session.dispatch(rpcEnvelope{
		Method: "textDocument/publishDiagnostics",
		Params: json.RawMessage(`{"uri":"file:///temporary/setta_gen.py","version":1}`),
	})

	err := waitForDiagnosticFailure(t, waiter)
	if !errors.Is(err, ErrSessionStreamFailed) {
		t.Fatalf("waitForExactDiagnostics() error = %v, want session stream failure", err)
	}
	if !strings.Contains(err.Error(), "diagnostics array is required") {
		t.Fatalf("waitForExactDiagnostics() error = %v, want malformed publishDiagnostics cause", err)
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
