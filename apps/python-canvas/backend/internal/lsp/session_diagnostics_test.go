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

const (
	pullDiagnosticsHelperEnvironment   = "SETTA_PULL_DIAGNOSTICS_HELPER"
	configurationHelperEnvironment     = "SETTA_CONFIGURATION_HELPER"
	configuredSessionEnvironmentMarker = "SETTA_RESOLVED_PYTHON_MARKER"
)

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
	if os.Getenv(pullDiagnosticsHelperEnvironment) != "1" && os.Getenv(configurationHelperEnvironment) != "1" {
		return
	}
	if err := runPullDiagnosticsHelper(os.Stdin, os.Stdout); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	os.Exit(0)
}

func TestSessionConfiguresExactPythonBeforeDocumentsAndUsesPreparedEnvironment(t *testing.T) {
	workspaceRoot := t.TempDir()
	executable, err := os.Executable()
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}
	session, err := NewSession(SessionOptions{
		Command:       executable,
		Args:          []string{"-test.run=^TestPullDiagnosticsHelperProcess$"},
		WorkspaceRoot: workspaceRoot,
		Environment: []string{
			configurationHelperEnvironment + "=1",
			configuredSessionEnvironmentMarker + "=selected",
		},
		Configuration: map[string]any{
			"python": map[string]string{"pythonPath": "/selected/project/.venv/bin/python"},
		},
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
	documentPath := filepath.Join(workspaceRoot, "generated.py")
	if err := os.WriteFile(documentPath, []byte("value = 1\n"), 0o600); err != nil {
		t.Fatalf("write generated document: %v", err)
	}
	if err := session.SynchronizeDocument(ctx, documentPath, "python", 1, "value = 1\n"); err != nil {
		t.Fatalf("SynchronizeDocument() error = %v", err)
	}
}

func runPullDiagnosticsHelper(input io.Reader, output io.Writer) error {
	reader := bufio.NewReader(input)
	configurationReceived := false
	for {
		envelope, err := readEnvelope(reader)
		if err != nil {
			return err
		}
		var finished bool
		configurationReceived, finished, err = handlePullDiagnosticsEnvelope(output, envelope, configurationReceived)
		if err != nil {
			return err
		}
		if finished {
			return nil
		}
	}
}

func handlePullDiagnosticsEnvelope(output io.Writer, envelope rpcEnvelope, configurationReceived bool) (bool, bool, error) {
	switch envelope.Method {
	case "initialize":
		return configurationReceived, false, respondToHelperInitialize(output, envelope)
	case "initialized":
		return configurationReceived, false, registerHelperPullDiagnostics(output)
	case "workspace/didChangeConfiguration":
		return validateHelperPythonConfiguration(envelope.Params)
	case "textDocument/didOpen", "textDocument/didChange":
		return configurationReceived, false, validateHelperDocumentSynchronization(configurationReceived)
	case pullDiagnosticsMethod:
		return configurationReceived, false, respondToHelperPullDiagnostics(output, envelope)
	case "shutdown":
		return configurationReceived, false, respondToHelperShutdown(output, envelope)
	case "exit":
		return configurationReceived, true, nil
	case "":
		// Capability-registration and refresh acknowledgements are responses.
		return configurationReceived, false, nil
	default:
		return configurationReceived, false, fmt.Errorf("helper received unsupported method %q", envelope.Method)
	}
}

func respondToHelperInitialize(output io.Writer, envelope rpcEnvelope) error {
	if err := requirePullCapabilityAdvertisement(envelope.Params); err != nil {
		return err
	}
	return writeHelperEnvelope(output, map[string]any{
		"jsonrpc": "2.0",
		"id":      json.RawMessage(envelope.ID),
		"result":  map[string]any{"capabilities": map[string]any{}},
	})
}

func registerHelperPullDiagnostics(output io.Writer) error {
	if os.Getenv(configurationHelperEnvironment) == "1" {
		return nil
	}
	return writeHelperEnvelope(output, map[string]any{
		"jsonrpc": "2.0",
		"id":      "pull-registration",
		"method":  "client/registerCapability",
		"params": map[string]any{
			"registrations": []map[string]any{{
				"id":     "pull-registration-id",
				"method": pullDiagnosticsMethod,
			}},
		},
	})
}

func validateHelperPythonConfiguration(params json.RawMessage) (bool, bool, error) {
	if os.Getenv(configurationHelperEnvironment) != "1" {
		return false, false, fmt.Errorf("helper received unexpected configuration")
	}
	if os.Getenv(configuredSessionEnvironmentMarker) != "selected" {
		return false, false, fmt.Errorf("helper did not receive prepared environment")
	}
	if err := requireExactPythonConfiguration(params); err != nil {
		return false, false, err
	}
	return true, false, nil
}

func validateHelperDocumentSynchronization(configurationReceived bool) error {
	if os.Getenv(configurationHelperEnvironment) == "1" && !configurationReceived {
		return fmt.Errorf("document synchronized before Python configuration")
	}
	// Intentionally publish nothing. The client must request diagnostics.
	return nil
}

func respondToHelperPullDiagnostics(output io.Writer, envelope rpcEnvelope) error {
	return writeHelperEnvelope(output, map[string]any{
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
	})
}

func respondToHelperShutdown(output io.Writer, envelope rpcEnvelope) error {
	return writeHelperEnvelope(output, map[string]any{
		"jsonrpc": "2.0",
		"id":      json.RawMessage(envelope.ID),
		"result":  nil,
	})
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

func requireExactPythonConfiguration(raw json.RawMessage) error {
	var params struct {
		Settings struct {
			Python struct {
				PythonPath string `json:"pythonPath"`
			} `json:"python"`
		} `json:"settings"`
	}
	if err := json.Unmarshal(raw, &params); err != nil {
		return fmt.Errorf("decode configuration params: %w", err)
	}
	if params.Settings.Python.PythonPath != "/selected/project/.venv/bin/python" {
		return fmt.Errorf("configured Python path = %q", params.Settings.Python.PythonPath)
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
