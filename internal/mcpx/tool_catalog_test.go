package mcpx

import (
	"context"
	"encoding/json"
	"testing"
)

func TestBuildToolPayloadsMatchesServerList(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, workspaceRoot, projectRuntime)
	defer clientSession.Close()

	liveResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	payloads, err := BuildToolPayloads()
	if err != nil {
		t.Fatalf("build tool payloads: %v", err)
	}
	if len(payloads) != len(liveResult.Tools) {
		t.Fatalf("expected %d payloads, got %d", len(liveResult.Tools), len(payloads))
	}

	liveByName := make(map[string]string, len(liveResult.Tools))
	for _, tool := range liveResult.Tools {
		encoded, err := json.Marshal(tool)
		if err != nil {
			t.Fatalf("marshal live tool %q: %v", tool.Name, err)
		}
		liveByName[tool.Name] = string(encoded)
	}

	for _, payload := range payloads {
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload %q: %v", payload.Name, err)
		}
		live, ok := liveByName[payload.Name]
		if !ok {
			t.Fatalf("missing live tool %q", payload.Name)
		}
		if string(encoded) != live {
			t.Fatalf("payload mismatch for %q", payload.Name)
		}
	}
}
