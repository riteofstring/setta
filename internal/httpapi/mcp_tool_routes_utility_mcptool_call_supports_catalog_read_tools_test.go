package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/config"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/terminals"
	"setta/internal/testutil/firstpartyplugin"

	"github.com/go-chi/chi/v5"
)

func TestMCPToolCallRouteSupportsAppCatalogReadTools(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics: diagnostics,
		ContributedToolRegistrations: appDefinitionToolRegistrationsForTest(
			appdefinition.NewAppDefinitionService(projectRuntime, firstpartyplugin.AppSubsystemPluginID),
		),
	})
	if err != nil {
		t.Fatalf("new mcp server: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RegisterAuthenticatedRoot: func(r chi.Router) {
			if err := RegisterMCPRootRoutes(r, MCPRootRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Server:     server,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	catalogResponse := postMCPToolRoute(t, handler, `{
		"tool":"get_app_catalog",
		"arguments":{}
	}`)
	if catalogResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", catalogResponse.Code, catalogResponse.Body.String())
	}
	catalogPayload := decodeCallToolRouteResult(t, catalogResponse.Body.Bytes())
	if catalogPayload.IsError {
		t.Fatalf("expected get_app_catalog success, got %#v", catalogPayload.StructuredContent)
	}
	catalogResult := mustStructuredMapForRoute(t, catalogPayload.StructuredContent)
	catalog := mustStructuredMapForRoute(t, catalogResult["catalog"])
	if catalog["id"] != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", appspec.DefaultCatalogID, catalog["id"])
	}

	componentsResponse := postMCPToolRoute(t, handler, `{
		"tool":"list_app_components",
		"arguments":{}
	}`)
	if componentsResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", componentsResponse.Code, componentsResponse.Body.String())
	}
	componentsPayload := decodeCallToolRouteResult(t, componentsResponse.Body.Bytes())
	if componentsPayload.IsError {
		t.Fatalf("expected list_app_components success, got %#v", componentsPayload.StructuredContent)
	}
	componentsResult := mustStructuredMapForRoute(t, componentsPayload.StructuredContent)
	componentTypes := mustStringListForRoute(t, componentsResult["components"])
	if len(componentTypes) == 0 || componentTypes[0] != "Stack" {
		t.Fatalf("expected ordered component list, got %#v", componentTypes)
	}
}

func TestMCPToolCallRouteSupportsGetTerminalOutput(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("PTY-backed terminal history tests currently target macOS and Linux")
	}

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	terminalService := openMCPToolRouteTerminalService(t)
	sessionID := terminals.BuildTerminalID("allowed-section", "")
	if _, _, err := terminalService.Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-alpha",
		AllowInput: true,
		Command:    quietMCPToolRouteCatCommand(t),
	}); err != nil {
		t.Fatalf("open route terminal: %v", err)
	}
	attachment := attachMCPToolRouteTerminal(t, terminalService, sessionID)
	if err := terminalService.Write(sessionID, []byte("route terminal output\n")); err != nil {
		t.Fatalf("write route terminal output: %v", err)
	}
	waitForMCPToolRouteOutputContains(t, attachment, "route terminal output")

	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics: diagnostics,
		Terminals:      terminalService,
	})
	if err != nil {
		t.Fatalf("new mcp server: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RegisterAuthenticatedRoot: func(r chi.Router) {
			if err := RegisterMCPRootRoutes(r, MCPRootRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Server:     server,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := postMCPToolRoute(t, handler, `{
		"tool":"getTerminalOutput",
		"arguments":{"sectionId":"allowed-section"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected getTerminalOutput success, got %#v", payload.StructuredContent)
	}
	history, ok := payload.StructuredContent.(string)
	if !ok {
		t.Fatalf("expected string terminal output payload, got %#v", payload.StructuredContent)
	}
	if !strings.Contains(history, "route terminal output") {
		t.Fatalf("expected route terminal history to include written output, got %q", history)
	}
}

func TestMCPToolCallRouteGetSettaDocsRejectsPathEscapes(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	writeMCPToolRouteDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-listener-examples.md"), "# Examples\n")

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  workspaceRoot,
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics: diagnostics,
		DocsRoot:       filepath.Join(workspaceRoot, "docs"),
	})
	if err != nil {
		t.Fatalf("new mcp server: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RegisterAuthenticatedRoot: func(r chi.Router) {
			if err := RegisterMCPRootRoutes(r, MCPRootRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Server:     server,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := postMCPToolRoute(t, handler, `{
		"tool":"get_setta_docs",
		"arguments":{"docIds":["../outside"]}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if !payload.IsError {
		t.Fatal("expected invalid docs path to fail")
	}
	structured := mustStructuredMapForRoute(t, payload.StructuredContent)
	if structured["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments, got %#v", structured["code"])
	}
}

func openMCPToolRouteProjectRuntime(t *testing.T) *projectstate.Runtime {
	t.Helper()

	passwordSecrets, err := projectstate.NewFilePasswordSecretStore(t.TempDir())
	if err != nil {
		t.Fatalf("new password secret store: %v", err)
	}

	runtime, err := projectstate.OpenOverlayRuntimeWithOptions(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				TopLevelSectionIDs: []string{
					"chat-section",
					"peer-chat-section",
					"allowed-section",
					"allowed-callable-section",
					"blocked-section",
					"blocked-callable-section",
					"allowed-params-section",
					"blocked-params-section",
				},
				SectionVariantMap: map[string]string{
					"chat-section":             "chat-variant",
					"peer-chat-section":        "peer-chat-variant",
					"allowed-section":          "allowed-variant",
					"allowed-callable-section": "allowed-callable-variant",
					"blocked-section":          "blocked-variant",
					"blocked-callable-section": "blocked-callable-variant",
					"allowed-params-section":   "allowed-params-variant",
					"blocked-params-section":   "blocked-params-variant",
				},
				AgenticEdges: []projectstate.AgenticEdge{
					{
						ID:              "edge-context",
						SourceSectionID: "allowed-section",
						TargetSectionID: "chat-section",
						Kind:            "section_chat",
					},
					{
						ID:              "edge-peer",
						SourceSectionID: "chat-section",
						TargetSectionID: "peer-chat-section",
						Kind:            "chat_chat",
					},
					{
						ID:              "edge-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-section",
						Kind:            "chat_section",
					},
					{
						ID:              "edge-callable-context",
						SourceSectionID: "allowed-callable-section",
						TargetSectionID: "chat-section",
						Kind:            "section_chat",
					},
					{
						ID:              "edge-callable-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-callable-section",
						Kind:            "chat_section",
					},
					{
						ID:              "edge-params-context",
						SourceSectionID: "allowed-params-section",
						TargetSectionID: "chat-section",
						Kind:            "section_chat",
					},
					{
						ID:              "edge-params-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-params-section",
						Kind:            "chat_section",
					},
				},
				Sections: map[string]projectstate.Section{
					"chat-section": {
						ID:               "chat-section",
						Name:             "Chat",
						VariantIDs:       []string{"chat-variant"},
						DefaultVariantID: "chat-variant",
					},
					"peer-chat-section": {
						ID:               "peer-chat-section",
						Name:             "Peer Chat",
						VariantIDs:       []string{"peer-chat-variant"},
						DefaultVariantID: "peer-chat-variant",
					},
					"allowed-section": {
						ID:               "allowed-section",
						Name:             "Allowed",
						VariantIDs:       []string{"allowed-variant"},
						DefaultVariantID: "allowed-variant",
					},
					"allowed-callable-section": {
						ID:               "allowed-callable-section",
						Name:             "Allowed Callable",
						VariantIDs:       []string{"allowed-callable-variant"},
						DefaultVariantID: "allowed-callable-variant",
						UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
					},
					"blocked-section": {
						ID:               "blocked-section",
						Name:             "Blocked",
						VariantIDs:       []string{"blocked-variant"},
						DefaultVariantID: "blocked-variant",
					},
					"blocked-callable-section": {
						ID:               "blocked-callable-section",
						Name:             "Blocked Callable",
						VariantIDs:       []string{"blocked-callable-variant"},
						DefaultVariantID: "blocked-callable-variant",
						UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
					},
					"allowed-params-section": {
						ID:               "allowed-params-section",
						Name:             "Allowed Params",
						VariantIDs:       []string{"allowed-params-variant"},
						DefaultVariantID: "allowed-params-variant",
					},
					"blocked-params-section": {
						ID:               "blocked-params-section",
						Name:             "Blocked Params",
						VariantIDs:       []string{"blocked-params-variant"},
						DefaultVariantID: "blocked-params-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"chat-variant":             {ID: "chat-variant", ImplID: "chat-impl"},
					"peer-chat-variant":        {ID: "peer-chat-variant", ImplID: "peer-chat-impl"},
					"allowed-variant":          {ID: "allowed-variant", ImplID: "allowed-impl"},
					"allowed-callable-variant": {ID: "allowed-callable-variant", ImplID: "allowed-callable-impl"},
					"blocked-variant":          {ID: "blocked-variant", ImplID: "blocked-impl"},
					"blocked-callable-variant": {ID: "blocked-callable-variant", ImplID: "blocked-callable-impl"},
					"allowed-params-variant":   {ID: "allowed-params-variant", ImplID: "allowed-params-impl"},
					"blocked-params-variant":   {ID: "blocked-params-variant", ImplID: "blocked-params-impl"},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"chat-impl": {
						ID:      "chat-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRouteRawJSON(t, map[string]any{"id": "chat-impl", "type": "Chat"}),
					},
					"peer-chat-impl": {
						ID:      "peer-chat-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRouteRawJSON(t, map[string]any{"id": "peer-chat-impl", "type": "Chat"}),
					},
					"allowed-impl": {
						ID:   "allowed-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
						Payload: mustRouteRawJSON(t, map[string]any{
							"id":           "allowed-impl",
							"type":         "Code",
							"codeLanguage": "python",
							"code":         "print('allowed')\n",
							"children":     []any{},
						}),
					},
					"allowed-callable-impl": {
						ID:   "allowed-callable-impl",
						Kind: projectstate.SectionKind("callable"),
						Payload: mustRouteRawJSON(t, map[string]any{
							"id":       "allowed-callable-impl",
							"type":     "Callable",
							"callable": "allowed-callable-1",
							"codeObjVariantMap": map[string]string{
								"allowed-callable-1":     "allowed-callable-variant-a",
								"allowed-callable-2":     "allowed-callable-variant-b",
								"allowed-param-existing": "allowed-param-existing-variant",
							},
						}),
					},
					"blocked-impl": {
						ID:   "blocked-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
						Payload: mustRouteRawJSON(t, map[string]any{
							"id":           "blocked-impl",
							"type":         "Code",
							"codeLanguage": "python",
							"code":         "print('blocked')\n",
							"children":     []any{},
						}),
					},
					"blocked-callable-impl": {
						ID:   "blocked-callable-impl",
						Kind: projectstate.SectionKind("callable"),
						Payload: mustRouteRawJSON(t, map[string]any{
							"id":                "blocked-callable-impl",
							"type":              "Callable",
							"callable":          nil,
							"codeObjVariantMap": map[string]string{},
						}),
					},
					"allowed-params-impl": {
						ID:      "allowed-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: mustRawJSONForRoute(t, map[string]any{"id": "allowed-params-impl", "type": "Dict", "topLevelParamId": "allowed-param", "codeObjVariantMap": map[string]string{"allowed-param": "allowed-param-variant"}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
					},
					"blocked-params-impl": {
						ID:      "blocked-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: mustRawJSONForRoute(t, map[string]any{"id": "blocked-params-impl", "type": "Dict", "topLevelParamId": "blocked-param", "codeObjVariantMap": map[string]string{"blocked-param": "blocked-param-variant"}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"allowed-callable-1": {
						ID:               "allowed-callable-1",
						Name:             "existing_callable",
						VariantIDs:       []string{"allowed-callable-variant-a"},
						DefaultVariantID: "allowed-callable-variant-a",
					},
					"allowed-callable-2": {
						ID:               "allowed-callable-2",
						Name:             "sorted",
						VariantIDs:       []string{"allowed-callable-variant-b"},
						DefaultVariantID: "allowed-callable-variant-b",
					},
					"allowed-param-existing": {
						ID:               "allowed-param-existing",
						Name:             "iterable",
						VariantIDs:       []string{"allowed-param-existing-variant"},
						DefaultVariantID: "allowed-param-existing-variant",
					},
					"allowed-param": {
						ID:               "allowed-param",
						Name:             "allowed_param",
						VariantIDs:       []string{"allowed-param-variant"},
						DefaultVariantID: "allowed-param-variant",
					},
					"blocked-param": {
						ID:               "blocked-param",
						Name:             "blocked_param",
						VariantIDs:       []string{"blocked-param-variant"},
						DefaultVariantID: "blocked-param-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"allowed-callable-variant-a": {
						ID:     "allowed-callable-variant-a",
						ImplID: "allowed-callable-impl-a",
					},
					"allowed-callable-variant-b": {
						ID:     "allowed-callable-variant-b",
						ImplID: "allowed-callable-impl-b",
					},
					"allowed-param-existing-variant": {
						ID:     "allowed-param-existing-variant",
						ImplID: "allowed-param-existing-impl",
					},
					"allowed-param-variant": {
						ID:     "allowed-param-variant",
						ImplID: "allowed-param-impl",
					},
					"blocked-param-variant": {
						ID:     "blocked-param-variant",
						ImplID: "blocked-param-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"allowed-callable-impl-a": {
						ID:      "allowed-callable-impl-a",
						Type:    "CodeCallable",
						Payload: mustRawJSONForRoute(t, map[string]any{"id": "allowed-callable-impl-a", "type": "CodeCallable", "children": []any{}}),
					},
					"allowed-callable-impl-b": {
						ID:      "allowed-callable-impl-b",
						Type:    "CodeCallable",
						Payload: mustRawJSONForRoute(t, map[string]any{"id": "allowed-callable-impl-b", "type": "CodeCallable", "children": []any{"allowed-param-existing"}}),
					},
					"allowed-param-existing-impl": {
						ID:      "allowed-param-existing-impl",
						Type:    "CodeParam",
						Payload: mustRawJSONForRoute(t, map[string]any{"id": "allowed-param-existing-impl", "type": "CodeParam", "value": "user_value", "passingStyle": "DEFAULT"}),
					},
					"allowed-param-impl": {
						ID:      "allowed-param-impl",
						Type:    "TextParam",
						Payload: mustRawJSONForRoute(t, map[string]any{"id": "allowed-param-impl", "type": "TextParam", "value": "1"}),
					},
					"blocked-param-impl": {
						ID:      "blocked-param-impl",
						Type:    "TextParam",
						Payload: mustRawJSONForRoute(t, map[string]any{"id": "blocked-param-impl", "type": "TextParam", "value": "2"}),
					},
				},
			},
		},
	}, projectstate.RuntimeOptions{
		PasswordSecrets: passwordSecrets,
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})
	return runtime
}

func openPersistedMCPToolRouteAppDefinitionRuntime(t *testing.T) (string, *projectstate.Runtime) {
	t.Helper()

	root := t.TempDir()
	store, err := projectstate.NewStore(filepath.Join(root, projectstate.MainFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new persisted app-definition store: %v", err)
	}
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save persisted app-definition document: %v", err)
	}
	runtime, err := projectstate.OpenRuntimeWithOptions(context.Background(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open persisted app-definition runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close persisted app-definition runtime: %v", err)
		}
	})
	return root, runtime
}

func enableRoutePythonCodegenTarget(t *testing.T, runtime *projectstate.Runtime) {
	t.Helper()

	_, err := runtime.SetProjectCodegenTargets(
		context.Background(),
		"project-alpha",
		[]projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
				Payload:  projectstate.RawJSON(`{"language":"python"}`),
			},
		},
		nil,
		projectstate.PythonCodegenSectionReconcilerFunc(func(_ context.Context, project *projectstate.Project) error {
			if project == nil {
				return projectstate.ErrProjectNotFound
			}
			if err := project.ReconcilePythonGeneratedBindings(); err != nil {
				return err
			}

			project.Sections[projectstate.GeneratedPythonCodeSectionID] = projectstate.Section{
				ID:               projectstate.GeneratedPythonCodeSectionID,
				Name:             projectstate.GeneratedPythonCodeSectionName,
				VariantIDs:       []string{projectstate.GeneratedPythonCodeVariantID},
				DefaultVariantID: projectstate.GeneratedPythonCodeVariantID,
			}
			project.SectionVariants[projectstate.GeneratedPythonCodeVariantID] = projectstate.SectionVariant{
				ID:     projectstate.GeneratedPythonCodeVariantID,
				ImplID: projectstate.GeneratedPythonCodeImplID,
			}
			project.SectionImpls[projectstate.GeneratedPythonCodeImplID] = projectstate.SectionImpl{
				ID:   projectstate.GeneratedPythonCodeImplID,
				Kind: projectstate.SectionKindGenerated,
				Payload: mustRouteRawJSON(t, map[string]any{
					"id":   projectstate.GeneratedPythonCodeImplID,
					"type": "GenPythonCode",
					"codeFileBinding": map[string]any{
						"canonical_path": projectstate.GeneratedPythonCodeRelativePath(project.Name),
						"access_mode":    "write_only",
						"autoBinding":    false,
					},
				}),
				Generated: &projectstate.GeneratedSectionImpl{
					Kind: projectstate.GeneratedSectionKindPythonCode,
				},
			}
			project.SectionVariantMap[projectstate.GeneratedPythonCodeSectionID] = projectstate.GeneratedPythonCodeVariantID
			if !containsRouteString(project.TopLevelSectionIDs, projectstate.GeneratedPythonCodeSectionID) {
				project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, projectstate.GeneratedPythonCodeSectionID)
			}
			return nil
		}),
	)
	if err != nil {
		t.Fatalf("enable python codegen target: %v", err)
	}
}

func mustSeedRouteChildSection(t *testing.T, runtime *projectstate.Runtime, parentID string) string {
	t.Helper()

	_, result, err := runtime.CreateChildSections(context.Background(), "project-alpha", projectstate.CreateChildSectionsInput{
		ParentID:    parentID,
		ImplType:    "Terminal",
		NumChildren: 1,
	}, projectstate.DefaultStructuralMutationSettings())
	if err != nil {
		t.Fatalf("seed child section under %q: %v", parentID, err)
	}
	if len(result.SectionIDs) != 1 {
		t.Fatalf("expected one seeded child section under %q, got %#v", parentID, result.SectionIDs)
	}
	return result.SectionIDs[0]
}

func mustSeedRouteTopLevelTerminal(t *testing.T, runtime *projectstate.Runtime) string {
	t.Helper()

	_, sectionID, err := runtime.CreateTemporaryTerminal("project-alpha", projectstate.TerminalSectionSeed{
		SectionID: "attached-terminal",
		VariantID: "attached-terminal-variant",
		ImplID:    "attached-terminal-impl",
		Name:      "Terminal",
	})
	if err != nil {
		t.Fatalf("seed route top-level terminal: %v", err)
	}
	return sectionID
}

func openMCPToolRouteDiagnosticsRegistry() *projectstate.LSPDiagnosticsRegistry {
	diagnostics := projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{})
	diagnostics.UpdateCodeSection("project-alpha", "allowed-section", []projectstate.LSPDiagnostic{
		{Message: "error", Code: "reportFoo", Range: projectstate.LSPDiagnosticRange{}},
	})
	diagnostics.UpdateCodeSection("project-alpha", "blocked-section", []projectstate.LSPDiagnostic{
		{Message: "error", Code: "reportFoo", Range: projectstate.LSPDiagnosticRange{}},
	})
	return diagnostics
}

func postMCPToolRoute(t *testing.T, handler http.Handler, body string) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, RouteMCPToolCall, bytes.NewBufferString(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request.WithContext(context.Background()))
	return response
}

func decodeCallToolRouteResult(t *testing.T, payload []byte) mcpxCallToolResult {
	t.Helper()

	var decoded mcpxCallToolResult
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode call tool result: %v", err)
	}
	return decoded
}

type mcpxCallToolResult struct {
	StructuredContent any  `json:"structuredContent"`
	IsError           bool `json:"isError"`
}

type routeSectionNameService struct {
	runtime *projectstate.Runtime
}

func (s routeSectionNameService) SetSectionName(ctx context.Context, projectID string, sectionID string, name string) error {
	if s.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	_, err := s.runtime.SetSectionName(ctx, projectID, sectionID, name)
	return err
}

type routeCodeUpdateService struct {
	runtime    *projectstate.Runtime
	formatCode func(ctx context.Context, projectID string, sectionID string) error
}

func (s routeCodeUpdateService) SetCode(ctx context.Context, projectID string, sectionID string, code string) error {
	if s.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	_, err := s.runtime.SetCode(ctx, projectID, sectionID, code)
	return err
}

func (s routeCodeUpdateService) FormatCode(ctx context.Context, projectID string, sectionID string) error {
	if s.formatCode != nil {
		return s.formatCode(ctx, projectID, sectionID)
	}
	if s.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	return nil
}

func openMCPToolRouteTerminalService(t *testing.T) *terminals.Service {
	t.Helper()

	service, err := terminals.New(terminals.Options{})
	if err != nil {
		t.Fatalf("new route terminal service: %v", err)
	}
	t.Cleanup(func() {
		if err := service.Close(context.Background()); err != nil {
			t.Fatalf("close route terminal service: %v", err)
		}
	})
	return service
}

func quietMCPToolRouteCatCommand(t *testing.T) []string {
	t.Helper()

	shell := requireMCPToolRouteCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func requireMCPToolRouteCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func attachMCPToolRouteTerminal(t *testing.T, service *terminals.Service, sessionID string) *terminals.Attachment {
	t.Helper()

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach route terminal %q: %v", sessionID, err)
	}
	t.Cleanup(attachment.Close)
	return attachment
}

func waitForMCPToolRouteOutputContains(t *testing.T, attachment *terminals.Attachment, needle string) string {
	t.Helper()

	buffer := strings.Builder{}
	buffer.Write(attachment.History)
	if strings.Contains(buffer.String(), needle) {
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				t.Fatalf("route terminal output closed before %q appeared; collected output: %q", needle, buffer.String())
			}
			buffer.Write(chunk)
			if strings.Contains(buffer.String(), needle) {
				return buffer.String()
			}
		case <-timeout.C:
			t.Fatalf("timed out waiting for %q; collected output: %q", needle, buffer.String())
		}
	}
}

func writeMCPToolRouteDocsFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir route docs parent: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write route docs file: %v", err)
	}
}

func writeTemporaryIDMapForRouteTest(t *testing.T, path string, payload map[string]string) {
	t.Helper()

	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal temporary id map: %v", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write temporary id map: %v", err)
	}
}

func mustStructuredMapForRoute(t *testing.T, value any) map[string]any {
	t.Helper()

	typed, ok := value.(map[string]any)
	if ok {
		return typed
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal structured map: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("decode structured map: %v", err)
	}
	return decoded
}

func mustStructuredListForRoute(t *testing.T, value any) []any {
	t.Helper()

	switch typed := value.(type) {
	case []any:
		return typed
	case []map[string]any:
		output := make([]any, 0, len(typed))
		for _, entry := range typed {
			output = append(output, entry)
		}
		return output
	default:
		encoded, err := json.Marshal(value)
		if err != nil {
			t.Fatalf("marshal structured list: %v", err)
		}
		var decoded []any
		if err := json.Unmarshal(encoded, &decoded); err != nil {
			t.Fatalf("decode structured list: %v", err)
		}
		return decoded
	}
}

func mustStringListForRoute(t *testing.T, value any) []string {
	t.Helper()

	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		output := make([]string, 0, len(typed))
		for _, entry := range typed {
			raw, ok := entry.(string)
			if ok {
				output = append(output, raw)
			}
		}
		return output
	default:
		encoded, err := json.Marshal(value)
		if err != nil {
			t.Fatalf("marshal structured string list: %v", err)
		}
		var decoded []string
		if err := json.Unmarshal(encoded, &decoded); err != nil {
			t.Fatalf("decode structured string list: %v", err)
		}
		return decoded
	}
}

func mustDecodedRouteProjectPayload(t *testing.T, raw projectstate.RawJSON) map[string]any {
	t.Helper()

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("decode route project payload: %v", err)
	}
	return decoded
}

func mustRouteRawJSON(t *testing.T, value any) projectstate.RawJSON {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal route raw json: %v", err)
	}
	return encoded
}

func mustRawJSONForRoute(t *testing.T, value any) projectstate.RawJSON {
	t.Helper()
	return mustRouteRawJSON(t, value)
}

func containsRouteString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func mustAddRouteAlternateSectionVariant(t *testing.T, runtime *projectstate.Runtime) {
	t.Helper()

	if _, err := runtime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		project, err := document.ProjectByID("project-alpha")
		if err != nil {
			return document, err
		}
		section, ok := project.Sections["allowed-section"]
		if !ok {
			return document, fmt.Errorf("%w: %q", projectstate.ErrSectionNotFound, "allowed-section")
		}
		if containsRouteString(section.VariantIDs, "allowed-variant-alt") {
			return document, nil
		}

		section.VariantIDs = append(section.VariantIDs, "allowed-variant-alt")
		project.Sections[section.ID] = section
		project.SectionVariants["allowed-variant-alt"] = projectstate.SectionVariant{
			ID:     "allowed-variant-alt",
			ImplID: "allowed-impl-alt",
		}
		project.SectionImpls["allowed-impl-alt"] = projectstate.SectionImpl{
			ID:   "allowed-impl-alt",
			Kind: projectstate.SectionKindCode,
			Code: &projectstate.CodeSectionImpl{
				Language: projectstate.CodeLanguagePython,
			},
			Payload: mustRouteRawJSON(t, map[string]any{
				"id":           "allowed-impl-alt",
				"type":         "Code",
				"codeLanguage": "python",
				"code":         "print('allowed alt')\n",
				"children":     []any{},
			}),
		}

		normalizedProject, err := project.Normalized()
		if err != nil {
			return document, err
		}
		document.Projects[normalizedProject.ID] = normalizedProject
		return document, nil
	}); err != nil {
		t.Fatalf("add route alternate section variant: %v", err)
	}
}

func mustAddRouteGroupSection(t *testing.T, runtime *projectstate.Runtime) {
	t.Helper()

	if _, err := runtime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		project, err := document.ProjectByID("project-alpha")
		if err != nil {
			return document, err
		}
		if _, ok := project.Sections["group-section"]; ok {
			return document, nil
		}

		project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, "group-section")
		project.SectionVariantMap["group-section"] = "group-variant"
		project.Sections["group-section"] = projectstate.Section{
			ID:               "group-section",
			Name:             "Group",
			VariantIDs:       []string{"group-variant"},
			DefaultVariantID: "group-variant",
		}
		project.SectionVariants["group-variant"] = projectstate.SectionVariant{
			ID:     "group-variant",
			ImplID: "group-impl",
		}
		project.SectionImpls["group-impl"] = projectstate.SectionImpl{
			ID:   "group-impl",
			Kind: projectstate.SectionKind("frontend"),
			Payload: mustRouteRawJSON(t, map[string]any{
				"id":                      "group-impl",
				"type":                    "Group",
				"isHorizontalOrientation": false,
				"overflowMode":            false,
			}),
		}

		normalizedProject, err := project.Normalized()
		if err != nil {
			return document, err
		}
		document.Projects[normalizedProject.ID] = normalizedProject
		return document, nil
	}); err != nil {
		t.Fatalf("add route group section: %v", err)
	}
}

func mustAddRouteMetaControlSections(t *testing.T, runtime *projectstate.Runtime) {
	t.Helper()

	if _, err := runtime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		project, err := document.ProjectByID("project-alpha")
		if err != nil {
			return document, err
		}
		if _, ok := project.Sections["allowed-meta-section"]; ok {
			return document, nil
		}

		project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, "allowed-meta-section", "blocked-meta-section")
		project.SectionVariantMap["allowed-meta-section"] = "allowed-meta-variant"
		project.SectionVariantMap["blocked-meta-section"] = "blocked-meta-variant"
		project.AgenticEdges = append(project.AgenticEdges, projectstate.AgenticEdge{
			ID:              "edge-meta-context",
			SourceSectionID: "allowed-meta-section",
			TargetSectionID: "chat-section",
			Kind:            "section_chat",
		}, projectstate.AgenticEdge{
			ID:              "edge-meta-write",
			SourceSectionID: "chat-section",
			TargetSectionID: "allowed-meta-section",
			Kind:            "chat_section",
		})
		project.Sections["allowed-meta-section"] = projectstate.Section{
			ID:               "allowed-meta-section",
			Name:             "Allowed Meta",
			VariantIDs:       []string{"allowed-meta-variant"},
			DefaultVariantID: "allowed-meta-variant",
		}
		project.Sections["blocked-meta-section"] = projectstate.Section{
			ID:               "blocked-meta-section",
			Name:             "Blocked Meta",
			VariantIDs:       []string{"blocked-meta-variant"},
			DefaultVariantID: "blocked-meta-variant",
		}
		project.SectionVariants["allowed-meta-variant"] = projectstate.SectionVariant{
			ID:     "allowed-meta-variant",
			ImplID: "allowed-meta-impl",
		}
		project.SectionVariants["blocked-meta-variant"] = projectstate.SectionVariant{
			ID:     "blocked-meta-variant",
			ImplID: "blocked-meta-impl",
		}
		project.SectionImpls["allowed-meta-impl"] = projectstate.SectionImpl{
			ID:      "allowed-meta-impl",
			Kind:    projectstate.SectionKind("frontend"),
			Payload: mustRouteRawJSON(t, map[string]any{"id": "allowed-meta-impl", "type": "MetaControl", "showSectionTitle": false, "codeObjVariantMap": map[string]any{}}),
		}
		project.SectionImpls["blocked-meta-impl"] = projectstate.SectionImpl{
			ID:      "blocked-meta-impl",
			Kind:    projectstate.SectionKind("frontend"),
			Payload: mustRouteRawJSON(t, map[string]any{"id": "blocked-meta-impl", "type": "MetaControl", "showSectionTitle": false, "codeObjVariantMap": map[string]any{}}),
		}

		normalizedProject, err := project.Normalized()
		if err != nil {
			return document, err
		}
		document.Projects[normalizedProject.ID] = normalizedProject
		return document, nil
	}); err != nil {
		t.Fatalf("add route meta control sections: %v", err)
	}
}

func mustSetRouteCodeSectionReadOnly(t *testing.T, runtime *projectstate.Runtime, projectID string, sectionID string) {
	t.Helper()

	_, err := runtime.SetCodeFileBinding(context.Background(), projectID, sectionID, projectstate.CodeFileBinding{
		Path:       "code/readonly.py",
		AccessMode: projectstate.CodeFileAccessModeReadOnly,
	})
	if err != nil {
		t.Fatalf("mark route code section %q read-only: %v", sectionID, err)
	}
}

func writeRouteTemporaryIDMap(t *testing.T, path string, payload map[string]string) {
	t.Helper()

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal temporary id map: %v", err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatalf("write temporary id map: %v", err)
	}
}
