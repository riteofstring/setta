package mcpx

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"testing"

	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/projectstate"
	"setta/internal/testutil/firstpartyplugin"
	"setta/internal/tools"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestServerCanOmitDefaultAppSubsystemTools(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:                t.TempDir(),
		ProjectState:                 projectRuntime,
		LSPDiagnostics:               openScopedTestLSPDiagnosticsRegistry(),
		SkipDefaultAppSubsystemTools: true,
	})
	defer clientSession.Close()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools without default app subsystem tools: %v", err)
	}

	names := make([]string, 0, len(toolsResult.Tools))
	for _, tool := range toolsResult.Tools {
		names = append(names, tool.Name)
	}
	for _, name := range []string{
		"get_app_catalog",
		"list_app_components",
		"get_app_definition",
		"validate_app_definition",
		"set_app_definition",
		"stream_app_definition",
		"update_app_definition",
	} {
		if slices.Contains(names, name) {
			t.Fatalf("expected %s to be absent without app subsystem contributions; tools=%#v", name, names)
		}
	}
}

func TestServerToolCatalogOmitsLegacyInvokeLinkedChatTool(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}
	for _, tool := range toolsResult.Tools {
		if tool.Name == "invoke_linked_chat" {
			t.Fatalf("did not expect legacy invoke_linked_chat tool in live catalog: %#v", tool)
		}
	}

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      "list_mcp_tools",
		Arguments: map[string]any{},
	})
	if err != nil {
		t.Fatalf("call list_mcp_tools: %v", err)
	}
	payload, ok := result.StructuredContent.(map[string]any)
	if !ok {
		t.Fatalf("expected structured list payload, got %#v", result.StructuredContent)
	}
	rawNames, ok := payload["tools"].([]any)
	if !ok {
		t.Fatalf("expected tool list array, got %#v", payload["tools"])
	}
	for _, rawName := range rawNames {
		if name, ok := rawName.(string); ok && name == "invoke_linked_chat" {
			t.Fatalf("did not expect invoke_linked_chat in list_mcp_tools payload: %#v", rawNames)
		}
	}
}

func TestServerDiscoverableToolsHaveExplicitAccessMetadata(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	toolsResult, err := clientSession.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("list tools: %v", err)
	}

	allowNoTargets := map[string]struct{}{
		"getInstalledPythonPackages": {},
		"get_agent_profile":          {},
		"list_agent_profiles":        {},
		"read_file_range":            {},
	}
	missingAccess := []string{}
	missingTargets := []string{}
	for _, tool := range toolsResult.Tools {
		if tool == nil {
			continue
		}

		rawMeta, ok := tool.Meta[toolMetaNamespace]
		if !ok {
			missingAccess = append(missingAccess, tool.Name+" (missing setta metadata)")
			continue
		}
		meta := mustStructuredMap(t, rawMeta)
		if meta["toolKind"] != string(tools.KindDiscoverable) {
			continue
		}

		accessType, _ := meta["accessType"].(string)
		if strings.TrimSpace(accessType) == "" {
			missingAccess = append(missingAccess, tool.Name+" (missing accessType)")
			continue
		}
		if accessType != string(tools.AccessTypeRead) && accessType != string(tools.AccessTypeWrite) {
			continue
		}

		idPaths := map[string]any{}
		if rawPaths, ok := meta["idPathsByType"]; ok {
			idPaths = mustStructuredMap(t, rawPaths)
		}
		_, hasResultFilter := meta["resultFilter"]
		defaultSingleton, _ := meta["defaultTargetSingletonSection"].(string)
		if len(idPaths) != 0 || hasResultFilter || strings.TrimSpace(defaultSingleton) != "" {
			continue
		}
		if _, ok := allowNoTargets[tool.Name]; ok {
			continue
		}
		missingTargets = append(missingTargets, tool.Name)
	}

	sort.Strings(missingAccess)
	sort.Strings(missingTargets)
	if len(missingAccess) != 0 {
		t.Fatalf("expected explicit access metadata for discoverable tools, missing %#v", missingAccess)
	}
	if len(missingTargets) != 0 {
		t.Fatalf("expected discoverable read/write tools to publish target hints, missing %#v", missingTargets)
	}
}

func openScopedTestProjectRuntime(t *testing.T) *projectstate.Runtime {
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
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"chat-section":             {X: 10, Y: 20},
					"peer-chat-section":        {X: 20, Y: 30},
					"allowed-section":          {X: 30, Y: 40},
					"allowed-callable-section": {X: 35, Y: 45},
					"blocked-section":          {X: 40, Y: 50},
					"blocked-callable-section": {X: 45, Y: 55},
					"allowed-params-section":   {X: 50, Y: 60},
					"blocked-params-section":   {X: 60, Y: 70},
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
						Kind:            agenticEdgeKindSectionChat,
					},
					{
						ID:              "edge-peer",
						SourceSectionID: "chat-section",
						TargetSectionID: "peer-chat-section",
						Kind:            agenticEdgeKindChatChat,
					},
					{
						ID:              "edge-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-section",
						Kind:            agenticEdgeKindChatSection,
					},
					{
						ID:              "edge-callable-context",
						SourceSectionID: "allowed-callable-section",
						TargetSectionID: "chat-section",
						Kind:            agenticEdgeKindSectionChat,
					},
					{
						ID:              "edge-callable-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-callable-section",
						Kind:            agenticEdgeKindChatSection,
					},
					{
						ID:              "edge-params-context",
						SourceSectionID: "allowed-params-section",
						TargetSectionID: "chat-section",
						Kind:            agenticEdgeKindSectionChat,
					},
					{
						ID:              "edge-params-write",
						SourceSectionID: "chat-section",
						TargetSectionID: "allowed-params-section",
						Kind:            agenticEdgeKindChatSection,
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
						Payload: mustRawJSON(t, map[string]any{"id": "chat-impl", "type": "Chat"}),
					},
					"peer-chat-impl": {
						ID:      "peer-chat-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: mustRawJSON(t, map[string]any{"id": "peer-chat-impl", "type": "Chat"}),
					},
					"allowed-impl": {
						ID:   "allowed-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
						Payload: mustRawJSON(t, map[string]any{
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
						Payload: mustRawJSON(t, map[string]any{
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
						Payload: mustRawJSON(t, map[string]any{
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
						Payload: mustRawJSON(t, map[string]any{
							"id":                "blocked-callable-impl",
							"type":              "Callable",
							"callable":          nil,
							"codeObjVariantMap": map[string]string{},
						}),
					},
					"allowed-params-impl": {
						ID:      "allowed-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: mustRawJSON(t, map[string]any{"id": "allowed-params-impl", "type": "Dict", "topLevelParamId": "allowed-param", "codeObjVariantMap": map[string]string{"allowed-param": "allowed-param-variant"}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
					},
					"blocked-params-impl": {
						ID:      "blocked-params-impl",
						Kind:    projectstate.SectionKind("dict"),
						Payload: mustRawJSON(t, map[string]any{"id": "blocked-params-impl", "type": "Dict", "topLevelParamId": "blocked-param", "codeObjVariantMap": map[string]string{"blocked-param": "blocked-param-variant"}, "ignoreTypeErrors": map[string]any{"callable": false, "params": map[string]any{}}}),
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
						Payload: mustRawJSON(t, map[string]any{"id": "allowed-callable-impl-a", "type": "CodeCallable", "children": []any{}}),
					},
					"allowed-callable-impl-b": {
						ID:      "allowed-callable-impl-b",
						Type:    "CodeCallable",
						Payload: mustRawJSON(t, map[string]any{"id": "allowed-callable-impl-b", "type": "CodeCallable", "children": []any{"allowed-param-existing"}}),
					},
					"allowed-param-existing-impl": {
						ID:      "allowed-param-existing-impl",
						Type:    "CodeParam",
						Payload: mustRawJSON(t, map[string]any{"id": "allowed-param-existing-impl", "type": "CodeParam", "value": "user_value", "passingStyle": "DEFAULT"}),
					},
					"allowed-param-impl": {
						ID:      "allowed-param-impl",
						Type:    "TextParam",
						Payload: mustRawJSON(t, map[string]any{"id": "allowed-param-impl", "type": "TextParam", "value": "1"}),
					},
					"blocked-param-impl": {
						ID:      "blocked-param-impl",
						Type:    "TextParam",
						Payload: mustRawJSON(t, map[string]any{"id": "blocked-param-impl", "type": "TextParam", "value": "2"}),
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

func TestInvokeToolRecordsRunScopedToolActivity(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	recorder := &toolInvocationRecorderSpy{}
	server, err := NewServer(ServerOptions{
		WorkspaceRoot:   t.TempDir(),
		ProjectState:    projectRuntime,
		ToolInvocations: recorder,
	})
	if err != nil {
		t.Fatalf("new server: %v", err)
	}
	headers := http.Header{}
	headers.Set(AgenticContextProjectConfigIDHeader, "project-alpha")
	headers.Set(AgenticContextChatIDHeader, "chat-1")
	headers.Set(AgenticContextRunIDHeader, "run-1")
	headers.Set(AgenticContextSectionIDHeader, "chat-section")

	result, err := server.InvokeTool(context.Background(), "get_latest_project_state_summary", map[string]any{
		"projectConfigId": "project-alpha",
	}, ToolRequestContext{
		Headers: headers,
	})
	if err != nil {
		t.Fatalf("invoke tool: %v", err)
	}
	if result == nil || result.IsError {
		t.Fatalf("expected success result, got %#v", result)
	}
	if len(recorder.started) != 1 || recorder.started[0] != "run-1:get_latest_project_state_summary" {
		t.Fatalf("expected one started record, got %#v", recorder.started)
	}
	if len(recorder.completed) != 1 || recorder.completed[0] != "run-1:get_latest_project_state_summary" {
		t.Fatalf("expected one completed record, got %#v", recorder.completed)
	}
}

type toolInvocationRecorderSpy struct {
	started   []string
	completed []string
}

func (s *toolInvocationRecorderSpy) RecordMCPToolInvocationStarted(runID string, toolName string) {
	s.started = append(s.started, strings.TrimSpace(runID)+":"+strings.TrimSpace(toolName))
}

func (s *toolInvocationRecorderSpy) RecordMCPToolInvocationCompleted(runID string, toolName string) {
	s.completed = append(s.completed, strings.TrimSpace(runID)+":"+strings.TrimSpace(toolName))
}

func openPersistedAppDefinitionTestProjectRuntime(t *testing.T) (string, *projectstate.Runtime) {
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

func enableScopedTestPythonCodegenTarget(t *testing.T, runtime *projectstate.Runtime) {
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

			if project.Sections == nil {
				project.Sections = map[string]projectstate.Section{}
			}
			if project.SectionVariants == nil {
				project.SectionVariants = map[string]projectstate.SectionVariant{}
			}
			if project.SectionImpls == nil {
				project.SectionImpls = map[string]projectstate.SectionImpl{}
			}
			if project.SectionVariantMap == nil {
				project.SectionVariantMap = map[string]string{}
			}
			if project.TopLevelSections == nil {
				project.TopLevelSections = map[string]projectstate.TopLevelSectionLayout{}
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
				Payload: mustRawJSON(t, map[string]any{
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
			if !containsString(project.TopLevelSectionIDs, projectstate.GeneratedPythonCodeSectionID) {
				project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, projectstate.GeneratedPythonCodeSectionID)
			}
			if _, ok := project.TopLevelSections[projectstate.GeneratedPythonCodeSectionID]; !ok {
				project.TopLevelSections[projectstate.GeneratedPythonCodeSectionID] = projectstate.TopLevelSectionLayout{X: 90, Y: 100}
			}
			return nil
		}),
	)
	if err != nil {
		t.Fatalf("enable python codegen target: %v", err)
	}
}

func mustSeedScopedTestChildSection(t *testing.T, runtime *projectstate.Runtime, parentID string) string {
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

func mustSeedScopedTestTopLevelTerminal(t *testing.T, runtime *projectstate.Runtime) string {
	t.Helper()

	_, sectionID, err := runtime.CreateTemporaryTerminal("project-alpha", projectstate.TerminalSectionSeed{
		SectionID: "attached-terminal",
		VariantID: "attached-terminal-variant",
		ImplID:    "attached-terminal-impl",
		Name:      "Terminal",
	})
	if err != nil {
		t.Fatalf("seed top-level terminal: %v", err)
	}
	return sectionID
}

func mustAddScopedTestAlternateSectionVariant(t *testing.T, runtime *projectstate.Runtime) {
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
		if containsString(section.VariantIDs, "allowed-variant-alt") {
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
			Payload: mustRawJSON(t, map[string]any{
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
		t.Fatalf("add scoped test alternate section variant: %v", err)
	}
}

func mustAddScopedTestGroupSection(t *testing.T, runtime *projectstate.Runtime) {
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
		project.TopLevelSections["group-section"] = projectstate.TopLevelSectionLayout{X: 70, Y: 80}
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
			Payload: mustRawJSON(t, map[string]any{
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
		t.Fatalf("add scoped test group section: %v", err)
	}
}

func mustAddScopedTestMetaControlSections(t *testing.T, runtime *projectstate.Runtime) {
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
		project.TopLevelSections["allowed-meta-section"] = projectstate.TopLevelSectionLayout{X: 70, Y: 80}
		project.TopLevelSections["blocked-meta-section"] = projectstate.TopLevelSectionLayout{X: 80, Y: 90}
		project.SectionVariantMap["allowed-meta-section"] = "allowed-meta-variant"
		project.SectionVariantMap["blocked-meta-section"] = "blocked-meta-variant"
		project.AgenticEdges = append(project.AgenticEdges, projectstate.AgenticEdge{
			ID:              "edge-meta-context",
			SourceSectionID: "allowed-meta-section",
			TargetSectionID: "chat-section",
			Kind:            agenticEdgeKindSectionChat,
		}, projectstate.AgenticEdge{
			ID:              "edge-meta-write",
			SourceSectionID: "chat-section",
			TargetSectionID: "allowed-meta-section",
			Kind:            agenticEdgeKindChatSection,
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
			Payload: mustRawJSON(t, map[string]any{"id": "allowed-meta-impl", "type": "MetaControl", "showSectionTitle": false, "codeObjVariantMap": map[string]any{}}),
		}
		project.SectionImpls["blocked-meta-impl"] = projectstate.SectionImpl{
			ID:      "blocked-meta-impl",
			Kind:    projectstate.SectionKind("frontend"),
			Payload: mustRawJSON(t, map[string]any{"id": "blocked-meta-impl", "type": "MetaControl", "showSectionTitle": false, "codeObjVariantMap": map[string]any{}}),
		}

		normalizedProject, err := project.Normalized()
		if err != nil {
			return document, err
		}
		document.Projects[normalizedProject.ID] = normalizedProject
		return document, nil
	}); err != nil {
		t.Fatalf("add scoped test meta control sections: %v", err)
	}
}

func mustSetTestCodeSectionReadOnly(t *testing.T, runtime *projectstate.Runtime, projectID string, sectionID string) {
	t.Helper()

	_, err := runtime.SetCodeFileBinding(context.Background(), projectID, sectionID, projectstate.CodeFileBinding{
		Path:       "code/readonly.py",
		AccessMode: projectstate.CodeFileAccessModeReadOnly,
	})
	if err != nil {
		t.Fatalf("mark code section %q read-only: %v", sectionID, err)
	}
}

func readScopedTestWatchCodeProjectData(
	t *testing.T,
	document projectstate.Document,
	projectID string,
) projectstate.WatchCodePluginProjectData {
	t.Helper()
	projectData, _, err := document.WatchCodePluginProjectData(activeScopedTestWatchCodeProviderID, projectID)
	if err != nil {
		t.Fatalf("read watch code plugin data: %v", err)
	}
	return projectData
}

func setScopedAgenticContext(t *testing.T, clientSession *sdkmcp.ClientSession, projectConfigID string, chatID string, sectionID string) {
	t.Helper()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": projectConfigID,
			"chatId":          chatID,
			"sectionId":       sectionID,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}
}

func newScopedTestServerSession(t *testing.T, workspaceRoot string, projectRuntime *projectstate.Runtime) (*Server, *sdkmcp.ClientSession) {
	t.Helper()

	return newScopedTestServerSessionWithOptions(t, workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:  workspaceRoot,
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
	})
}

func newScopedTestServerSessionWithOptions(t *testing.T, workspaceRoot string, projectRuntime *projectstate.Runtime, options ServerOptions) (*Server, *sdkmcp.ClientSession) {
	t.Helper()

	if strings.TrimSpace(options.WorkspaceRoot) == "" {
		options.WorkspaceRoot = workspaceRoot
	}
	if options.ProjectState == nil {
		options.ProjectState = projectRuntime
	}
	if !options.SkipDefaultAppSubsystemTools &&
		projectRuntime != nil &&
		len(options.ContributedToolRegistrations) == 0 {
		options.ContributedToolRegistrations = appDefinitionToolRegistrationsForTest(
			appdefinition.NewAppDefinitionService(
				projectRuntime,
				firstpartyplugin.AppSubsystemPluginID,
			),
		)
	}
	if options.LSPDiagnostics == nil {
		options.LSPDiagnostics = openScopedTestLSPDiagnosticsRegistry()
	}
	if options.SectionNames == nil && projectRuntime != nil {
		options.SectionNames = testSectionNameService{runtime: projectRuntime}
	}
	if options.CodeUpdates == nil && projectRuntime != nil {
		options.CodeUpdates = testCodeUpdateService{runtime: projectRuntime}
	}
	if options.CodegenTargetValidator == nil && projectRuntime != nil {
		options.CodegenTargetValidator = projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		})
	}
	if options.PythonCodegenSectionReconciler == nil && projectRuntime != nil {
		options.PythonCodegenSectionReconciler = projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		})
	}

	server, err := NewServer(options)
	if err != nil {
		t.Fatalf("new server: %v", err)
	}

	ctx := context.Background()
	serverTransport, clientTransport := sdkmcp.NewInMemoryTransports()
	serverSession, err := server.server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatalf("connect server session: %v", err)
	}
	t.Cleanup(func() {
		if err := serverSession.Close(); err != nil {
			t.Fatalf("close server session: %v", err)
		}
	})

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		t.Fatalf("connect client session: %v", err)
	}
	return server, clientSession
}

const activeScopedTestWatchCodeProviderID = "setta-fixture-watch-code-provider"

type stubPythonPackageProvider struct {
	packages []string
	err      error
}

func (s stubPythonPackageProvider) InstalledPackages(context.Context) ([]string, error) {
	if s.err != nil {
		return nil, s.err
	}
	return append([]string(nil), s.packages...), nil
}

type stubCallableSignatureResolver struct {
	result projectstate.CallableSignatureResult
	ok     bool
	err    error
}

func (s stubCallableSignatureResolver) ResolveCallableSignature(
	_ context.Context,
	_ projectstate.Project,
	_ string,
	_ string,
) (projectstate.CallableSignatureResult, bool, error) {
	return s.result, s.ok, s.err
}

type testSectionNameService struct {
	runtime *projectstate.Runtime
}

func (s testSectionNameService) SetSectionName(ctx context.Context, projectID string, sectionID string, name string) error {
	if s.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	_, err := s.runtime.SetSectionName(ctx, projectID, sectionID, name)
	return err
}

type testCodeUpdateService struct {
	runtime    *projectstate.Runtime
	formatCode func(ctx context.Context, projectID string, sectionID string) error
}

func (s testCodeUpdateService) SetCode(ctx context.Context, projectID string, sectionID string, code string) error {
	if s.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	_, err := s.runtime.SetCode(ctx, projectID, sectionID, code)
	return err
}

func (s testCodeUpdateService) FormatCode(ctx context.Context, projectID string, sectionID string) error {
	if s.formatCode != nil {
		return s.formatCode(ctx, projectID, sectionID)
	}
	if s.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	return nil
}

func mustReadFileRangeResult(t *testing.T, handler tools.Handler, arguments map[string]any) readFileRangeResult {
	t.Helper()

	result, err := handler(context.Background(), arguments)
	if err != nil {
		t.Fatalf("unexpected handler error: %v", err)
	}
	typed, ok := result.(readFileRangeResult)
	if !ok {
		t.Fatalf("expected readFileRangeResult, got %#v", result)
	}
	return typed
}

func mustToolError(t *testing.T, handler tools.Handler, arguments map[string]any) *toolError {
	t.Helper()

	_, err := handler(context.Background(), arguments)
	if err == nil {
		t.Fatal("expected tool error")
	}
	typed, ok := err.(*toolError)
	if !ok {
		t.Fatalf("expected *toolError, got %T", err)
	}
	return typed
}

func assertSummaryPayload(t *testing.T, payload any) {
	t.Helper()

	summary := mustStructuredMap(t, payload)
	projectConfig := mustStructuredMap(t, summary["projectConfig"])
	sectionVariantMap := mustStructuredMap(t, projectConfig["sectionVariantMap"])
	if len(sectionVariantMap) != 4 {
		t.Fatalf("expected four allowed section variants, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["allowed-section"]; !ok {
		t.Fatalf("expected allowed-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["allowed-callable-section"]; !ok {
		t.Fatalf("expected allowed-callable-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["allowed-params-section"]; !ok {
		t.Fatalf("expected allowed-params-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["peer-chat-section"]; !ok {
		t.Fatalf("expected peer-chat-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-callable-section"]; ok {
		t.Fatalf("did not expect blocked-callable-section in summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-params-section"]; ok {
		t.Fatalf("did not expect blocked-params-section in summary, got %#v", sectionVariantMap)
	}

	parentSectionMap := mustStructuredMap(t, summary["parentSectionMap"])
	if _, ok := parentSectionMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section in parent map, got %#v", parentSectionMap)
	}

	sections := mustStructuredList(t, summary["sections"])
	var sectionIDs []string
	for _, rawSection := range sections {
		section := mustStructuredMap(t, rawSection)
		sectionID, ok := section["sectionId"].(string)
		if !ok {
			t.Fatalf("expected sectionId string, got %#v", section["sectionId"])
		}
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)
	if len(sectionIDs) != 4 || sectionIDs[0] != "allowed-callable-section" || sectionIDs[1] != "allowed-params-section" || sectionIDs[2] != "allowed-section" || sectionIDs[3] != "peer-chat-section" {
		t.Fatalf("unexpected filtered section ids %#v", sectionIDs)
	}
}

func assertDiagnosticsPayload(t *testing.T, payload any) {
	t.Helper()

	diagnostics := mustStructuredMap(t, payload)
	codeSections := mustStructuredMap(t, diagnostics["codeSections"])
	if len(codeSections) != 1 {
		t.Fatalf("expected one allowed code section diagnostics entry, got %#v", codeSections)
	}
	if _, ok := codeSections["allowed-section"]; !ok {
		t.Fatalf("expected allowed-section diagnostics, got %#v", codeSections)
	}
	genCode := mustStructuredMap(t, diagnostics["genCode"])
	genErrors := mustStructuredMap(t, genCode["errors"])
	if len(genErrors) != 1 {
		t.Fatalf("expected one allowed generated diagnostics entry, got %#v", genErrors)
	}
	if _, ok := genErrors["allowed-section"]; !ok {
		t.Fatalf("expected allowed-section generated diagnostics, got %#v", genErrors)
	}
	if unmapped := mustStructuredList(t, diagnostics["unmappedGenCode"]); len(unmapped) != 0 {
		t.Fatalf("expected scoped diagnostics to drop unmapped gen code, got %#v", unmapped)
	}
}
