package mcpx

import (
	"context"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

func TestServerStreamAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	setTestAppDefinition(t, projectRuntime, projectstate.SetAppDefinitionInput{
		AppSpec: map[string]any{
			"root": "root",
			"elements": map[string]any{
				"root": map[string]any{
					"key":  "root",
					"type": "Stack",
					"props": map[string]any{
						"gap": float64(8),
					},
				},
			},
		},
	})

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "stream_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"patches":         "{\"op\":\"replace\",\"path\":\"/elements/root/props/gap\",\"value\":12}",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id stream_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id stream_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appSpec := mustStructuredMap(t, payload["appSpec"])
	props := mustStructuredMap(t, mustStructuredMap(t, appSpec["elements"])["root"])
	rootProps := mustStructuredMap(t, props["props"])
	if rootProps["gap"] != float64(12) {
		t.Fatalf("expected streamed gap 12, got %#v", rootProps["gap"])
	}

	storedSpec, err := appspec.Read(root, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", payload["appSpec"], storedSpec)
	}
}

func TestServerStreamAppDefinitionRejectsInvalidPatchPayload(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		patches string
	}{
		{
			name:    "unsupported patch path",
			patches: "{\"op\":\"set\",\"path\":\"/not-allowed\",\"value\":1}",
		},
		{
			name:    "invalid nested patch application",
			patches: "{\"op\":\"set\",\"path\":\"/elements/missing/props/title\",\"value\":\"Hello\"}",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			_, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
			_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
			defer clientSession.Close()

			result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
				Name: "stream_app_definition",
				Meta: sdkmcp.Meta{
					"projectConfigId": "project-alpha",
					"allowUnscoped":   true,
				},
				Arguments: map[string]any{
					"projectConfigId": "project-alpha",
					"patches":         tc.patches,
				},
			})
			if err != nil {
				t.Fatalf("call invalid stream_app_definition: %v", err)
			}
			if !result.IsError {
				t.Fatal("expected invalid stream_app_definition call to fail")
			}

			payload := mustStructuredMap(t, result.StructuredContent)
			if payload["code"] != "invalid_arguments" {
				t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
			}
			message, ok := payload["message"].(string)
			if !ok || !strings.Contains(message, "Invalid patches payload") {
				t.Fatalf("expected invalid patches payload message, got %#v", payload["message"])
			}
		})
	}
}
