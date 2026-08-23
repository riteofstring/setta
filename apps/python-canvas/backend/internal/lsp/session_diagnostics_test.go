package lsp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

const pullDiagnosticsHelperEnvironment = "SETTA_PULL_DIAGNOSTICS_HELPER"

func TestSessionPullDiagnosticsDoesNotWaitForPublishNotification(t *testing.T) {
	workspaceRoot := t.TempDir()
	documentPath := filepath.Join(workspaceRoot, "generated.py")
	code := "missing_name\n"
	if err := os.WriteFile(documentPath, []byte(code), 0o600); err != nil {
		t.Fatalf("write diagnostic document: %v", err)
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}
	t.Setenv(pullDiagnosticsHelperEnvironment, "1")
	session, err := NewSession(SessionOptions{
		Command:        executable,
		Args:           []string{"-test.run=^TestPullDiagnosticsHelperProcess$"},
		WorkspaceRoot:  workspaceRoot,
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

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := session.SynchronizeDocument(ctx, documentPath, "python", 1, code); err != nil {
		t.Fatalf("SynchronizeDocument() error = %v", err)
	}
	diagnostics, err := session.PullDiagnostics(ctx, documentPath, 1)
	if err != nil {
		t.Fatalf("PullDiagnostics() error = %v", err)
	}
	uri, err := pathToURI(documentPath)
	if err != nil {
		t.Fatalf("pathToURI() error = %v", err)
	}
	if diagnostics.URI != uri || diagnostics.Version != 1 || len(diagnostics.Diagnostics) != 1 {
		t.Fatalf("pulled diagnostics = %#v", diagnostics)
	}
	diagnostic := diagnostics.Diagnostics[0]
	if diagnostic.Message != "name is not defined" || diagnostic.Code != "reportUndefinedVariable" || diagnostic.Severity != 1 {
		t.Fatalf("pulled diagnostic = %#v", diagnostic)
	}
}

func TestPullDiagnosticsHelperProcess(t *testing.T) {
	if os.Getenv(pullDiagnosticsHelperEnvironment) != "1" {
		return
	}
	if err := runPullDiagnosticsHelper(os.Stdin, os.Stdout); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	os.Exit(0)
}

func runPullDiagnosticsHelper(input io.Reader, output io.Writer) error {
	reader := bufio.NewReader(input)
	for {
		envelope, err := readEnvelope(reader)
		if err != nil {
			return err
		}
		switch envelope.Method {
		case "initialize":
			if err := requirePullCapabilityAdvertisement(envelope.Params); err != nil {
				return err
			}
			if err := writeHelperEnvelope(output, map[string]any{
				"jsonrpc": "2.0",
				"id":      json.RawMessage(envelope.ID),
				"result":  map[string]any{"capabilities": map[string]any{}},
			}); err != nil {
				return err
			}
		case "initialized":
			if err := writeHelperEnvelope(output, map[string]any{
				"jsonrpc": "2.0",
				"id":      "pull-registration",
				"method":  "client/registerCapability",
				"params": map[string]any{
					"registrations": []map[string]any{{
						"id":     "pull-registration-id",
						"method": pullDiagnosticsMethod,
					}},
				},
			}); err != nil {
				return err
			}
		case "textDocument/didOpen", "textDocument/didChange":
			// Intentionally publish nothing. The client must request diagnostics.
		case pullDiagnosticsMethod:
			if err := writeHelperEnvelope(output, map[string]any{
				"jsonrpc": "2.0",
				"id":      json.RawMessage(envelope.ID),
				"result": map[string]any{
					"kind": "full",
					"items": []map[string]any{{
						"range": map[string]any{
							"start": map[string]int{"line": 0, "character": 0},
							"end":   map[string]int{"line": 0, "character": 12},
						},
						"severity": 1,
						"message":  "name is not defined",
						"code":     "reportUndefinedVariable",
					}},
				},
			}); err != nil {
				return err
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
		case "":
			// Capability-registration and refresh acknowledgements are responses.
		default:
			return fmt.Errorf("helper received unsupported method %q", envelope.Method)
		}
	}
}

func requirePullCapabilityAdvertisement(raw json.RawMessage) error {
	var params struct {
		Capabilities struct {
			TextDocument struct {
				Diagnostic struct {
					DynamicRegistration bool `json:"dynamicRegistration"`
				} `json:"diagnostic"`
			} `json:"textDocument"`
			Workspace struct {
				Diagnostics struct {
					RefreshSupport bool `json:"refreshSupport"`
				} `json:"diagnostics"`
			} `json:"workspace"`
		} `json:"capabilities"`
	}
	if err := json.Unmarshal(raw, &params); err != nil {
		return fmt.Errorf("decode initialize params: %w", err)
	}
	if !params.Capabilities.TextDocument.Diagnostic.DynamicRegistration || !params.Capabilities.Workspace.Diagnostics.RefreshSupport {
		return fmt.Errorf("pull diagnostic capabilities were not advertised")
	}
	return nil
}

func writeHelperEnvelope(output io.Writer, payload map[string]any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(output, "Content-Length: %d\r\n\r\n", len(encoded)); err != nil {
		return err
	}
	_, err = output.Write(encoded)
	return err
}
