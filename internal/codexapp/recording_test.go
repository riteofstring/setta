package codexapp

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestClientRecordsCodexRPCWhenRecordingDirSet(t *testing.T) {
	recordingDir := t.TempDir()
	t.Setenv(codexRPCRecordingEnv, recordingDir)

	client, err := StartProcess(testProcessConfig("exit-after-echo"))
	if err != nil {
		t.Fatalf("start process: %v", err)
	}
	raw, err := client.Call(context.Background(), "echo", map[string]any{"value": "recorded"})
	if err != nil {
		t.Fatalf("echo: %v", err)
	}
	if string(raw) != `{"value":"recorded"}` {
		t.Fatalf("echo response = %s, want recorded value", raw)
	}
	client.Close()

	data, err := os.ReadFile(filepath.Join(recordingDir, "codex-rpc.jsonl"))
	if err != nil {
		t.Fatalf("read codex rpc recording: %v", err)
	}
	text := string(data)
	if !strings.Contains(text, `"direction":"client_to_server"`) ||
		!strings.Contains(text, `"method":"echo"`) ||
		!strings.Contains(text, `"direction":"server_to_client"`) ||
		!strings.Contains(text, `"result":{"value":"recorded"}`) {
		t.Fatalf("codex rpc recording = %s, want client and server JSON-RPC messages", text)
	}
}
