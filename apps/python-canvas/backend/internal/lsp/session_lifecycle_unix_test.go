//go:build !windows

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
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

const (
	sessionFailureHelperModeEnvironment = "SETTA_LSP_SESSION_FAILURE_HELPER_MODE"
	sessionFailureHelperPIDEnvironment  = "SETTA_LSP_SESSION_FAILURE_HELPER_PID"
	sessionFailureHelperCloseStdout     = "close-stdout"
	sessionFailureHelperCrash           = "crash"
)

func TestSessionTerminalStreamFailureStopsAndReapsLingeringProcess(t *testing.T) {
	session, pid := startSessionFailureHelper(t, sessionFailureHelperCloseStdout)
	triggerSessionFailure(t, session)
	assertSessionHelperProcessReaped(t, pid)
	closeSessionConcurrently(t, session)
}

func TestSessionTerminalStreamFailureReapsCrashedProcess(t *testing.T) {
	session, pid := startSessionFailureHelper(t, sessionFailureHelperCrash)
	triggerSessionFailure(t, session)
	assertSessionHelperProcessReaped(t, pid)
	closeSessionConcurrently(t, session)
}

func TestSessionTerminalFailureHelperProcess(t *testing.T) {
	mode := os.Getenv(sessionFailureHelperModeEnvironment)
	if mode == "" {
		return
	}
	pidPath := os.Getenv(sessionFailureHelperPIDEnvironment)
	if err := os.WriteFile(pidPath, []byte(strconv.Itoa(os.Getpid())), 0o600); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	if err := runSessionFailureHelper(os.Stdin, os.Stdout, mode); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	os.Exit(0)
}

func startSessionFailureHelper(t *testing.T, mode string) (*Session, int) {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}
	pidPath := filepath.Join(t.TempDir(), "helper.pid")
	t.Setenv(sessionFailureHelperModeEnvironment, mode)
	t.Setenv(sessionFailureHelperPIDEnvironment, pidPath)
	session, err := NewSession(SessionOptions{
		Command:        executable,
		Args:           []string{"-test.run=^TestSessionTerminalFailureHelperProcess$"},
		RequestTimeout: 2 * time.Second,
	})
	if err != nil {
		t.Fatalf("NewSession() error = %v", err)
	}
	t.Cleanup(func() {
		if err := session.Close(); err != nil {
			t.Errorf("Session.Close() error = %v", err)
		}
	})

	startContext, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := session.Start(startContext); err != nil {
		t.Fatalf("Session.Start() error = %v", err)
	}
	return session, readSessionFailureHelperPID(t, pidPath)
}

func triggerSessionFailure(t *testing.T, session *Session) {
	t.Helper()
	requestContext, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, err := session.Completion(requestContext, filepath.Join(t.TempDir(), "document.py"), Position{})
	if !errors.Is(err, ErrSessionStreamFailed) {
		t.Fatalf("Session.Completion() error = %v, want terminal stream failure", err)
	}
}

func runSessionFailureHelper(input io.Reader, output io.WriteCloser, mode string) error {
	reader := bufio.NewReader(input)
	for {
		envelope, err := readEnvelope(reader)
		if err != nil {
			return err
		}
		switch envelope.Method {
		case "initialize":
			if err := writeHelperEnvelope(output, map[string]any{
				"jsonrpc": "2.0",
				"id":      json.RawMessage(envelope.ID),
				"result":  map[string]any{"capabilities": map[string]any{}},
			}); err != nil {
				return err
			}
		case "initialized":
			continue
		case "textDocument/completion":
			switch mode {
			case sessionFailureHelperCloseStdout:
				if err := output.Close(); err != nil {
					return err
				}
				for {
					time.Sleep(time.Hour)
				}
			case sessionFailureHelperCrash:
				os.Exit(23)
			default:
				return fmt.Errorf("unsupported failure helper mode %q", mode)
			}
		case "shutdown":
			if err := writeHelperEnvelope(output, map[string]any{
				"jsonrpc": "2.0",
				"id":      json.RawMessage(envelope.ID),
				"result":  nil,
			}); err != nil {
				return err
			}
		case "exit":
			return nil
		default:
			return fmt.Errorf("helper received unsupported method %q", envelope.Method)
		}
	}
}

func readSessionFailureHelperPID(t *testing.T, path string) int {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		contents, err := os.ReadFile(path)
		if err == nil {
			pid, parseErr := strconv.Atoi(strings.TrimSpace(string(contents)))
			if parseErr == nil && pid > 0 {
				return pid
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for session helper process ID at %s", path)
	return 0
}

func assertSessionHelperProcessReaped(t *testing.T, pid int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for sessionHelperProcessExists(pid) && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if sessionHelperProcessExists(pid) {
		t.Fatalf("language-server helper process %d was not reaped after terminal stream failure", pid)
	}
}

func sessionHelperProcessExists(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}

func closeSessionConcurrently(t *testing.T, session *Session) {
	t.Helper()
	var group sync.WaitGroup
	errs := make(chan error, 2)
	for range 2 {
		group.Go(func() {
			errs <- session.Close()
		})
	}
	done := make(chan struct{})
	go func() {
		group.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("concurrent Session.Close() calls did not return")
	}
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("Session.Close() error = %v", err)
		}
	}
}
