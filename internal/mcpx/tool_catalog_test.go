package mcpx

import (
	"context"
	"encoding/json"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
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

func TestBuildToolPayloadsExposeReadOnlySDKAnnotationsOnlyForReadTools(t *testing.T) {
	t.Parallel()

	payloads, err := BuildToolPayloads()
	if err != nil {
		t.Fatalf("build tool payloads: %v", err)
	}

	var readTool *sdkmcp.Tool
	var writeTool *sdkmcp.Tool
	for index := range payloads {
		tool := &payloads[index]
		switch tool.Name {
		case "getProjectConfigNamesAndIds":
			readTool = tool
		case "create_top_level_section":
			writeTool = tool
		}
	}
	if readTool == nil {
		t.Fatal("expected read tool payload")
	}
	if writeTool == nil {
		t.Fatal("expected write tool payload")
	}

	// Read tools should advertise the SDK retry/read-only hints, while write
	// tools should leave annotations unset.
	if readTool.Annotations == nil {
		t.Fatal("expected read tool annotations")
	}
	if !readTool.Annotations.ReadOnlyHint || !readTool.Annotations.IdempotentHint {
		t.Fatalf("expected read-only/idempotent hints, got %#v", readTool.Annotations)
	}
	if readTool.Annotations.OpenWorldHint == nil || *readTool.Annotations.OpenWorldHint {
		t.Fatalf("expected read tool open-world hint false, got %#v", readTool.Annotations.OpenWorldHint)
	}
	if writeTool.Annotations != nil {
		t.Fatalf("expected write tool annotations to be nil, got %#v", writeTool.Annotations)
	}
}
