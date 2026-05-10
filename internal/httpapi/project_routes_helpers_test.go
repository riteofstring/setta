package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/chatsections"
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/realtime"
	"setta/internal/settingsstate"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
)

func newProjectRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	workspaceRoot string,
	validator projectstate.CodegenTargetValidator,
	pythonReconciler projectstate.PythonCodegenSectionReconciler,
	callableResolver projectstate.CallableSignatureResolver,
	codeUpdates ...projectRouteCodeUpdateService,
) http.Handler {
	return newProjectRouteTestHandlerWithRouteOptions(
		t,
		mode,
		projectRuntime,
		workspaceRoot,
		validator,
		pythonReconciler,
		callableResolver,
		nil,
		nil,
		nil,
		codeUpdates...,
	)
}

func newProjectRouteTestHandlerWithWebsocketHub(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	workspaceRoot string,
	websocketHub *realtime.WebsocketHub,
	validator projectstate.CodegenTargetValidator,
	pythonReconciler projectstate.PythonCodegenSectionReconciler,
	callableResolver projectstate.CallableSignatureResolver,
	codeUpdates ...projectRouteCodeUpdateService,
) http.Handler {
	return newProjectRouteTestHandlerWithRouteOptions(
		t,
		mode,
		projectRuntime,
		workspaceRoot,
		validator,
		pythonReconciler,
		callableResolver,
		nil,
		nil,
		websocketHub,
		codeUpdates...,
	)
}

func newProjectRouteTestHandlerWithRenameService(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	workspaceRoot string,
	validator projectstate.CodegenTargetValidator,
	pythonReconciler projectstate.PythonCodegenSectionReconciler,
	callableResolver projectstate.CallableSignatureResolver,
	chatSectionChatID func(ctx context.Context, projectID string, sectionID string) (*string, error),
	renameRefactors *stubProjectRouteRenameRefactorService,
	codeUpdates ...projectRouteCodeUpdateService,
) http.Handler {
	return newProjectRouteTestHandlerWithRouteOptions(
		t,
		mode,
		projectRuntime,
		workspaceRoot,
		validator,
		pythonReconciler,
		callableResolver,
		chatSectionChatID,
		renameRefactors,
		nil,
		codeUpdates...,
	)
}

func newProjectRouteTestHandlerWithRouteOptions(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	workspaceRoot string,
	validator projectstate.CodegenTargetValidator,
	pythonReconciler projectstate.PythonCodegenSectionReconciler,
	callableResolver projectstate.CallableSignatureResolver,
	chatSectionChatID func(ctx context.Context, projectID string, sectionID string) (*string, error),
	renameRefactors *stubProjectRouteRenameRefactorService,
	websocketHub *realtime.WebsocketHub,
	codeUpdates ...projectRouteCodeUpdateService,
) http.Handler {
	t.Helper()
	if validator == nil {
		validator = projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		})
	}
	if pythonReconciler == nil {
		pythonReconciler = projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		})
	}
	var codeUpdateService projectRouteCodeUpdateService
	if len(codeUpdates) > 0 {
		codeUpdateService = codeUpdates[0]
	}
	if renameRefactors == nil {
		renameRefactors = &stubProjectRouteRenameRefactorService{}
	}
	if chatSectionChatID == nil {
		if projectRuntime == nil {
			chatSectionChatID = func(context.Context, string, string) (*string, error) {
				return nil, nil
			}
		} else {
			runStore, err := agentruns.NewRunStore(t.TempDir())
			if err != nil {
				t.Fatalf("new chat section run store: %v", err)
			}
			chatSectionService, err := chatsections.NewService(chatsections.ServiceOptions{
				ProjectState: projectRuntime,
				Runs:         runStore,
			})
			if err != nil {
				t.Fatalf("new chat section service: %v", err)
			}
			chatSectionChatID = chatSectionService.GetChatID
		}
	}
	settingsDocument, err := settingsstate.DefaultDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	settingsRuntime, _ := newSettingsRouteTestRuntimeWithDocument(t, settingsDocument)

	promptTemplatesRoot := workspaceRoot
	if strings.TrimSpace(promptTemplatesRoot) == "" {
		promptTemplatesRoot = t.TempDir()
	}
	promptTemplateStore, err := prompttemplates.NewStore(promptTemplatesRoot)
	if err != nil {
		t.Fatalf("new prompt template store: %v", err)
	}

	var shareSessions modes.ShareSessionStore
	var deploymentRuntime *deployments.Runtime
	if mode == config.ModeShare || mode == config.ModeApp {
		deploymentRuntime = newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
			Mode: mode,
		})
		shareSessions = newTestHTTPShareSessionStore("share-a")
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterProjectRoutes(r, ProjectRouteDependencies{
				ModePolicy:                     modes.NewPolicy(mode),
				WorkspaceRoot:                  workspaceRoot,
				ProjectState:                   projectRuntime,
				WebsocketHub:                   websocketHub,
				PromptTemplates:                promptTemplateStore,
				ShareSessions:                  shareSessions,
				Deployment:                     deploymentRuntime,
				SettingsState:                  settingsRuntime,
				ChatSectionChatID:              chatSectionChatID,
				EdgeExpressionBuilder:          projectstate.EdgeExpressionBuilderFunc(codegen.BuildPythonEdgeExpression),
				CodegenTargetValidator:         validator,
				PythonCodegenSectionReconciler: pythonReconciler,
				CallableSignatures:             callableResolver,
				SetCode:                        codeUpdateService.SetCode,
				FormatCode:                     codeUpdateService.FormatCode,
				SetSectionName:                 renameRefactors.SetSectionName,
				AcceptRenameRefactor:           renameRefactors.AcceptRenameRefactor,
				DeclineRenameRefactor:          renameRefactors.DeclineRenameRefactor,
			}); err != nil {
				t.Fatalf("register project routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func readProjectRouteTestProjectStateUpdate(t *testing.T, conn *websocket.Conn) realtime.ProjectStateUpdateContent {
	t.Helper()

	envelope := readTranscriptionProfileRouteTestEnvelope(t, conn)
	if envelope.MessageType != realtime.MessageTypeUpdateFrontendProjectState {
		t.Fatalf(
			"expected websocket message type %q, got %q",
			realtime.MessageTypeUpdateFrontendProjectState,
			envelope.MessageType,
		)
	}

	var update realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &update); err != nil {
		t.Fatalf("decode project state update: %v", err)
	}
	return update
}

func copyPasteRouteSourceProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := (projectstate.Project{
		ID:   "project-source",
		Name: "Source",
		SectionVariantMap: map[string]string{
			"group-root":    "group-root-variant",
			"group-child-a": "group-child-a-variant-alt",
			"group-child-b": "group-child-b-variant-default",
		},
		TopLevelSectionIDs: []string{"group-root"},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"group-root": {X: 40, Y: 60, ZIndex: 1},
		},
		Sections: map[string]projectstate.Section{
			"group-root": {
				ID:               "group-root",
				Name:             "Group Root",
				VariantIDs:       []string{"group-root-variant"},
				DefaultVariantID: "group-root-variant",
			},
			"group-child-a": {
				ID:               "group-child-a",
				Name:             "Group Child A",
				ParentSectionID:  "group-root",
				VariantIDs:       []string{"group-child-a-variant-default", "group-child-a-variant-alt"},
				DefaultVariantID: "group-child-a-variant-default",
			},
			"group-child-b": {
				ID:               "group-child-b",
				Name:             "Group Child B",
				ParentSectionID:  "group-root",
				VariantIDs:       []string{"group-child-b-variant-default", "group-child-b-variant-alt"},
				DefaultVariantID: "group-child-b-variant-default",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"group-root-variant":            {ID: "group-root-variant", ImplID: "group-root-impl"},
			"group-child-a-variant-default": {ID: "group-child-a-variant-default", ImplID: "group-child-a-impl-default"},
			"group-child-a-variant-alt":     {ID: "group-child-a-variant-alt", ImplID: "group-child-a-impl-alt"},
			"group-child-b-variant-default": {ID: "group-child-b-variant-default", ImplID: "group-child-b-impl-default"},
			"group-child-b-variant-alt":     {ID: "group-child-b-variant-alt", ImplID: "group-child-b-impl-alt"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"group-root-impl": {
				ID:   "group-root-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: projectstate.RawJSON(
					`{"id":"group-root-impl","type":"Group","children":["group-child-a","group-child-b"]}`,
				),
			},
			"group-child-a-impl-default": {
				ID:      "group-child-a-impl-default",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: projectstate.RawJSON(`{"id":"group-child-a-impl-default","type":"TextBlock","text":"Child A Default"}`),
			},
			"group-child-a-impl-alt": {
				ID:      "group-child-a-impl-alt",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: projectstate.RawJSON(`{"id":"group-child-a-impl-alt","type":"TextBlock","text":"Child A Alt"}`),
			},
			"group-child-b-impl-default": {
				ID:      "group-child-b-impl-default",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: projectstate.RawJSON(`{"id":"group-child-b-impl-default","type":"TextBlock","text":"Child B Default"}`),
			},
			"group-child-b-impl-alt": {
				ID:      "group-child-b-impl-alt",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: projectstate.RawJSON(`{"id":"group-child-b-impl-alt","type":"TextBlock","text":"Child B Alt"}`),
			},
		},
	}).Normalized()
	if err != nil {
		t.Fatalf("normalize copy/paste route source project: %v", err)
	}
	return project
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func findProjectRouteEdge(t *testing.T, project projectstate.Project, edgeID string) projectstate.Edge {
	t.Helper()

	for _, edge := range project.Edges {
		if edge.ID == edgeID {
			return edge
		}
	}
	t.Fatalf("edge %q not found in project edges %#v", edgeID, project.Edges)
	return projectstate.Edge{}
}

func decodeProjectRouteRawObject(t *testing.T, payload json.RawMessage) map[string]any {
	t.Helper()
	if len(payload) == 0 {
		return map[string]any{}
	}
	var object map[string]any
	if err := json.Unmarshal(payload, &object); err != nil {
		t.Fatalf("decode raw object %q: %v", string(payload), err)
	}
	return object
}

func payloadStringField(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	value, _ := payload[key].(string)
	return value
}

func mustMarshalProjectRouteObject(t *testing.T, value map[string]any) json.RawMessage {
	t.Helper()

	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal route test payload: %v", err)
	}
	return payload
}

func decodeProjectRouteStringArray(value any) []string {
	entries, ok := value.([]any)
	if !ok {
		return nil
	}
	output := make([]string, 0, len(entries))
	for _, entry := range entries {
		stringValue, ok := entry.(string)
		if ok {
			output = append(output, stringValue)
		}
	}
	return output
}

func autoLayoutRouteMinX(layouts map[string]projectstate.TopLevelSectionLayout) float64 {
	first := true
	minX := 0.0
	for _, layout := range layouts {
		if first || layout.X < minX {
			minX = layout.X
		}
		first = false
	}
	return minX
}

func autoLayoutRouteMinY(layouts map[string]projectstate.TopLevelSectionLayout) float64 {
	first := true
	minY := 0.0
	for _, layout := range layouts {
		if first || layout.Y < minY {
			minY = layout.Y
		}
		first = false
	}
	return minY
}

type stubProjectRouteCallableSignatureResolver struct {
	result projectstate.CallableSignatureResult
	ok     bool
	err    error
}

type projectRouteSetCodeCall struct {
	ProjectID string
	SectionID string
	Code      string
}

type projectRouteFormatCodeCall struct {
	ProjectID string
	SectionID string
}

type projectRouteCodeUpdateService struct {
	setCode    func(ctx context.Context, projectID string, sectionID string, code string) error
	formatCode func(ctx context.Context, projectID string, sectionID string) error
}

func (s projectRouteCodeUpdateService) SetCode(ctx context.Context, projectID string, sectionID string, code string) error {
	if s.setCode == nil {
		return nil
	}
	return s.setCode(ctx, projectID, sectionID, code)
}

func (s projectRouteCodeUpdateService) FormatCode(ctx context.Context, projectID string, sectionID string) error {
	if s.formatCode == nil {
		return nil
	}
	return s.formatCode(ctx, projectID, sectionID)
}

type stubProjectRouteRenameRefactorService struct {
	setSectionNameErr   error
	acceptErr           error
	declineErr          error
	declineProjectID    string
	declineFrontendOpID string
}

func (s *stubProjectRouteRenameRefactorService) SetSectionName(context.Context, string, string, string) error {
	return s.setSectionNameErr
}

func (s *stubProjectRouteRenameRefactorService) AcceptRenameRefactor(context.Context, string, string) error {
	return s.acceptErr
}

func (s *stubProjectRouteRenameRefactorService) DeclineRenameRefactor(_ context.Context, projectID string, frontendOpID string) error {
	s.declineProjectID = projectID
	s.declineFrontendOpID = frontendOpID
	return s.declineErr
}

func (s *stubProjectRouteCallableSignatureResolver) ResolveCallableSignature(
	_ context.Context,
	_ projectstate.Project,
	_ string,
	_ string,
) (projectstate.CallableSignatureResult, bool, error) {
	return s.result, s.ok, s.err
}

func callableRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "CallSection",
				VariantIDs:       []string{"callable-variant-1"},
				DefaultVariantID: "callable-variant-1",
				UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant-1": {
				ID:     "callable-variant-1",
				ImplID: "callable-impl-1",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl-1": {
				ID:   "callable-impl-1",
				Kind: projectstate.SectionKind("callable"),
				Payload: projectstate.RawJSON(`{
					"id":"callable-impl-1",
					"type":"Callable",
					"callable":"callable-1",
					"codeObjVariantMap":{
						"callable-1":"callable-variant-a",
						"callable-2":"callable-variant-b",
						"param-existing":"param-variant-existing"
					}
				}`),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-1": {
				ID:               "callable-1",
				Name:             "existing_callable",
				VariantIDs:       []string{"callable-variant-a"},
				DefaultVariantID: "callable-variant-a",
			},
			"callable-2": {
				ID:               "callable-2",
				Name:             "sorted",
				VariantIDs:       []string{"callable-variant-b"},
				DefaultVariantID: "callable-variant-b",
			},
			"param-existing": {
				ID:               "param-existing",
				Name:             "iterable",
				VariantIDs:       []string{"param-variant-existing"},
				DefaultVariantID: "param-variant-existing",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-variant-a": {
				ID:     "callable-variant-a",
				ImplID: "callable-impl-a",
			},
			"callable-variant-b": {
				ID:     "callable-variant-b",
				ImplID: "callable-impl-b",
			},
			"param-variant-existing": {
				ID:     "param-variant-existing",
				ImplID: "param-impl-existing",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-impl-a": {
				ID:      "callable-impl-a",
				Type:    "CodeCallable",
				Payload: projectstate.RawJSON(`{"id":"callable-impl-a","type":"CodeCallable","children":[]}`),
			},
			"callable-impl-b": {
				ID:      "callable-impl-b",
				Type:    "CodeCallable",
				Payload: projectstate.RawJSON(`{"id":"callable-impl-b","type":"CodeCallable","children":["param-existing"]}`),
			},
			"param-impl-existing": {
				ID:      "param-impl-existing",
				Type:    "CodeParam",
				Payload: projectstate.RawJSON(`{"id":"param-impl-existing","type":"CodeParam","value":"user_value","passingStyle":"DEFAULT"}`),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize callable route project: %v", err)
	}
	return project
}

func layoutPresentationRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID: "focus",
			},
		},
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant",
			"group-section":    "group-variant",
			"plain-section":    "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable Section",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
			},
			"group-section": {
				ID:               "group-section",
				Name:             "Group Section",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant": {
				ID:     "callable-variant",
				ImplID: "callable-impl",
			},
			"group-variant": {
				ID:     "group-variant",
				ImplID: "group-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl": {
				ID:      "callable-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "callable-impl", "type": "Callable"}),
			},
			"group-impl": {
				ID:   "group-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                      "group-impl",
					"type":                    "Group",
					"isHorizontalOrientation": false,
					"overflowMode":            false,
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize layout presentation route project: %v", err)
	}
	return project
}

func sectionSizeRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		EntryCodeBlockID: "code-section",
		ActiveViewModeID: "focus",
		TopLevelSectionIDs: []string{
			"code-section",
			"chart-section",
		},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"code-section":  {X: 20, Y: 40, ZIndex: 0},
			"chart-section": {X: 900, Y: 120, ZIndex: 1},
		},
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID:   "focus",
				Name: "Focus",
				VisibilityBySectionID: map[string]bool{
					"code-section":  true,
					"chart-section": true,
				},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"code-section":  {X: 20, Y: 40, ZIndex: 0},
					"chart-section": {X: 900, Y: 120, ZIndex: 1},
				},
			},
		},
		SectionVariantMap: map[string]string{
			"code-section":     "code-variant",
			"terminal-section": "terminal-variant",
			"chart-section":    "chart-variant",
		},
		Sections: map[string]projectstate.Section{
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"terminal-section": {
				ID:               "terminal-section",
				Name:             "Terminal",
				ParentSectionID:  "code-section",
				VariantIDs:       []string{"terminal-variant"},
				DefaultVariantID: "terminal-variant",
			},
			"chart-section": {
				ID:               "chart-section",
				Name:             "Chart",
				VariantIDs:       []string{"chart-variant"},
				DefaultVariantID: "chart-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"code-variant":     {ID: "code-variant", ImplID: "code-impl"},
			"terminal-variant": {ID: "terminal-variant", ImplID: "terminal-impl"},
			"chart-variant":    {ID: "chart-variant", ImplID: "chart-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"code-impl": {
				ID:   "code-impl",
				Kind: projectstate.SectionKindCode,
				Code: &projectstate.CodeSectionImpl{
					Language:                  projectstate.CodeLanguagePython,
					AttachedTerminalSectionID: "terminal-section",
					Children:                  []string{"terminal-section"},
				},
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                        "code-impl",
					"type":                      "Code",
					"codeLanguage":              "python",
					"attachedTerminalSectionId": "terminal-section",
					"children":                  []string{"terminal-section"},
					"size": map[string]any{
						"width":  420.0,
						"height": 180.0,
					},
				}),
			},
			"terminal-impl": {
				ID:       "terminal-impl",
				Kind:     projectstate.SectionKindTerminal,
				Terminal: &projectstate.TerminalSectionImpl{},
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":   "terminal-impl",
					"type": "Terminal",
					"size": map[string]any{
						"width":  420.0,
						"height": 160.0,
					},
				}),
			},
			"chart-impl": {
				ID:      "chart-impl",
				Kind:    projectstate.SectionKind("chart"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chart-impl", "type": "Chart", "size": map[string]any{"width": 180.0, "height": 180.0}}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section size route project: %v", err)
	}
	return project
}

func childDefaultsRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"group-section":     "group-variant",
			"list-root-section": "list-root-variant",
			"plain-section":     "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"group-section": {
				ID:               "group-section",
				Name:             "Group",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"list-root-section": {
				ID:               "list-root-section",
				Name:             "ListRoot",
				VariantIDs:       []string{"list-root-variant"},
				DefaultVariantID: "list-root-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"group-variant":     {ID: "group-variant", ImplID: "group-impl"},
			"list-root-variant": {ID: "list-root-variant", ImplID: "list-root-impl"},
			"plain-variant":     {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"group-impl": {
				ID:   "group-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                      "group-impl",
					"type":                    "Group",
					"defaultChildSectionType": "Callable",
					"isHorizontalOrientation": false,
					"overflowMode":            false,
				}),
			},
			"list-root-impl": {
				ID:   "list-root-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                      "list-root-impl",
					"type":                    "ListRoot",
					"children":                []string{},
					"defaultChildSectionType": "Callable",
					"viewMode":                "default",
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize child defaults route project: %v", err)
	}
	return project
}

func childSectionRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:                 "project-alpha",
		Name:               "Alpha",
		TopLevelSectionIDs: []string{"code-section", "group-parent"},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"code-section": {X: 20, Y: 20, ZIndex: 0},
			"group-parent": {X: 480, Y: 40, ZIndex: 1},
		},
		SectionVariantMap: map[string]string{
			"code-section": "code-variant",
			"group-parent": "group-variant",
			"child-a":      "child-a-variant",
			"child-b":      "child-b-variant",
		},
		Sections: map[string]projectstate.Section{
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"group-parent": {
				ID:               "group-parent",
				Name:             "Group",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"child-a": {
				ID:               "child-a",
				Name:             "Child A",
				ParentSectionID:  "group-parent",
				VariantIDs:       []string{"child-a-variant"},
				DefaultVariantID: "child-a-variant",
			},
			"child-b": {
				ID:               "child-b",
				Name:             "Child B",
				ParentSectionID:  "group-parent",
				VariantIDs:       []string{"child-b-variant"},
				DefaultVariantID: "child-b-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"code-variant":    {ID: "code-variant", ImplID: "code-impl"},
			"group-variant":   {ID: "group-variant", ImplID: "group-impl"},
			"child-a-variant": {ID: "child-a-variant", ImplID: "child-a-impl"},
			"child-b-variant": {ID: "child-b-variant", ImplID: "child-b-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"code-impl": {
				ID:   "code-impl",
				Kind: projectstate.SectionKindCode,
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
					Children: []string{},
				},
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":           "code-impl",
					"type":         "Code",
					"codeLanguage": "python",
					"children":     []string{},
					"size": map[string]any{
						"width":  420.0,
						"height": 180.0,
					},
				}),
			},
			"group-impl": {
				ID:   "group-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                      "group-impl",
					"type":                    "Group",
					"children":                []string{"child-a", "child-b"},
					"defaultChildSectionType": "Callable",
					"isHorizontalOrientation": false,
					"overflowMode":            false,
					"size": map[string]any{
						"width":  500.0,
						"height": 180.0,
					},
				}),
			},
			"child-a-impl": {
				ID:      "child-a-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "child-a-impl", "type": "TextBlock"}),
			},
			"child-b-impl": {
				ID:      "child-b-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "child-b-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize child-section route project: %v", err)
	}
	return project
}

func sectionFilterMetaControlRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"params-section": "params-variant",
			"meta-section":   "meta-variant",
			"code-section":   "code-variant",
			"plain-section":  "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"params-section": {
				ID:               "params-section",
				Name:             "Params",
				VariantIDs:       []string{"params-variant"},
				DefaultVariantID: "params-variant",
			},
			"meta-section": {
				ID:               "meta-section",
				Name:             "Meta",
				VariantIDs:       []string{"meta-variant"},
				DefaultVariantID: "meta-variant",
			},
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"params-variant": {ID: "params-variant", ImplID: "params-impl"},
			"meta-variant":   {ID: "meta-variant", ImplID: "meta-impl"},
			"code-variant":   {ID: "code-variant", ImplID: "code-impl"},
			"plain-variant":  {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"params-impl": {
				ID:      "params-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "params-impl", "type": "Dict", "paramFilter": "", "codeObjVariantMap": map[string]any{}}),
			},
			"meta-impl": {
				ID:      "meta-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "meta-impl", "type": "MetaControl", "showSectionTitle": false, "codeObjVariantMap": map[string]any{}}),
			},
			"code-impl": {
				ID:   "code-impl",
				Kind: projectstate.SectionKindCode,
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
				},
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "code-impl", "type": "Code", "codeLanguage": "python", "code": "print('alpha')\n", "children": []any{}}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section filter/meta control route project: %v", err)
	}
	return project
}

func sectionEdgeRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
				Payload:  projectstate.RawJSON(`{"language":"python"}`),
			},
		},
		TopLevelSectionIDs: []string{
			"dict-section",
			"source-section",
			"sink-section",
			"plain-section",
		},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"dict-section":   {X: 10, Y: 10},
			"source-section": {X: 20, Y: 20},
			"sink-section":   {X: 30, Y: 30},
			"plain-section":  {X: 40, Y: 40},
		},
		SectionVariantMap: map[string]string{
			"dict-section":   "dict-variant",
			"source-section": "source-variant",
			"sink-section":   "sink-variant",
			"plain-section":  "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"dict-section": {
				ID:               "dict-section",
				Name:             "Dict",
				VariantIDs:       []string{"dict-variant"},
				DefaultVariantID: "dict-variant",
			},
			"source-section": {
				ID:               "source-section",
				Name:             "Source",
				VariantIDs:       []string{"source-variant"},
				DefaultVariantID: "source-variant",
			},
			"sink-section": {
				ID:               "sink-section",
				Name:             "Sink",
				VariantIDs:       []string{"sink-variant"},
				DefaultVariantID: "sink-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"dict-variant":   {ID: "dict-variant", ImplID: "dict-impl"},
			"source-variant": {ID: "source-variant", ImplID: "source-impl"},
			"sink-variant":   {ID: "sink-variant", ImplID: "sink-impl"},
			"plain-variant":  {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"dict-impl": {
				ID:   "dict-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "dict-impl",
					"type":            "Dict",
					"topLevelParamId": "dict-root",
					"codeObjVariantMap": map[string]string{
						"dict-root":    "dict-root-variant",
						"target-param": "target-param-variant",
						"added-param":  "added-param-variant",
					},
					"edgeInputParams": []string{"target-param"},
					"edgeOutputPorts": []map[string]any{{"id": "result", "accessor": ".old"}},
				}),
			},
			"source-impl": {
				ID:      "source-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "source-impl", "type": "TextBlock"}),
			},
			"sink-impl": {
				ID:   "sink-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "sink-impl",
					"type":            "Dict",
					"topLevelParamId": "sink-root",
					"codeObjVariantMap": map[string]string{
						"sink-root":  "sink-root-variant",
						"sink-param": "sink-param-variant",
					},
					"edgeInputParams": []string{"sink-param"},
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"dict-root": {
				ID:               "dict-root",
				Name:             "root",
				VariantIDs:       []string{"dict-root-variant"},
				DefaultVariantID: "dict-root-variant",
			},
			"target-param": {
				ID:               "target-param",
				Name:             "target",
				VariantIDs:       []string{"target-param-variant"},
				DefaultVariantID: "target-param-variant",
			},
			"added-param": {
				ID:               "added-param",
				Name:             "added",
				VariantIDs:       []string{"added-param-variant"},
				DefaultVariantID: "added-param-variant",
			},
			"sink-root": {
				ID:               "sink-root",
				Name:             "sink_root",
				VariantIDs:       []string{"sink-root-variant"},
				DefaultVariantID: "sink-root-variant",
			},
			"sink-param": {
				ID:               "sink-param",
				Name:             "sink_param",
				VariantIDs:       []string{"sink-param-variant"},
				DefaultVariantID: "sink-param-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"dict-root-variant":    {ID: "dict-root-variant", ImplID: "dict-root-impl"},
			"target-param-variant": {ID: "target-param-variant", ImplID: "target-param-impl"},
			"added-param-variant":  {ID: "added-param-variant", ImplID: "added-param-impl"},
			"sink-root-variant":    {ID: "sink-root-variant", ImplID: "sink-root-impl"},
			"sink-param-variant":   {ID: "sink-param-variant", ImplID: "sink-param-impl"},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"dict-root-impl": {
				ID:      "dict-root-impl",
				Type:    "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "dict-root-impl", "type": "NestedParam", "children": []string{"target-param", "added-param"}}),
			},
			"target-param-impl": {
				ID:      "target-param-impl",
				Type:    "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "target-param-impl", "type": "CodeParam", "coreNameEditable": true, "passingStyle": "DEFAULT", "value": "connected"}),
			},
			"added-param-impl": {
				ID:      "added-param-impl",
				Type:    "TextParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "added-param-impl", "type": "TextParam", "coreNameEditable": true, "passingStyle": "DEFAULT", "value": "typed"}),
			},
			"sink-root-impl": {
				ID:      "sink-root-impl",
				Type:    "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "sink-root-impl", "type": "NestedParam", "children": []string{"sink-param"}}),
			},
			"sink-param-impl": {
				ID:      "sink-param-impl",
				Type:    "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "sink-param-impl", "type": "CodeParam", "coreNameEditable": true, "passingStyle": "DEFAULT", "value": "connected"}),
			},
		},
		Edges: []projectstate.Edge{
			{
				ID:              "incoming-edge",
				SourceSectionID: "source-section",
				SourceVariantID: "source-variant",
				SourcePortID:    "source-port",
				TargetSectionID: "dict-section",
				TargetVariantID: "dict-variant",
				TargetPortID:    "target-param",
			},
			{
				ID:              "outgoing-edge",
				SourceSectionID: "dict-section",
				SourceVariantID: "dict-variant",
				SourcePortID:    "result",
				TargetSectionID: "sink-section",
				TargetVariantID: "sink-variant",
				TargetPortID:    "sink-param",
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section edge route project: %v", err)
	}
	return project
}

func paramMoveRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:                 "project-alpha",
		Name:               "Alpha",
		TopLevelSectionIDs: []string{"dict-section"},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"dict-section": {X: 10, Y: 20, ZIndex: 1},
		},
		SectionVariantMap: map[string]string{
			"dict-section": "dict-variant",
		},
		Sections: map[string]projectstate.Section{
			"dict-section": {
				ID:               "dict-section",
				Name:             "Dict",
				VariantIDs:       []string{"dict-variant"},
				DefaultVariantID: "dict-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"dict-variant": {ID: "dict-variant", ImplID: "dict-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"dict-impl": {
				ID:   "dict-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustMarshalProjectRouteObject(t, map[string]any{
					"id":              "dict-impl",
					"type":            "Dict",
					"topLevelParamId": "root-param",
					"paramFilter":     "",
					"selectedParams":  []string{},
					"edgeInputParams": []string{},
					"codeObjVariantMap": map[string]string{
						"root-param":   "root-param-variant",
						"parent-param": "parent-param-variant",
						"selected-a":   "selected-a-variant",
						"selected-b":   "selected-b-variant",
						"other-param":  "other-param-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"root-param": {
				ID:               "root-param",
				Name:             "root",
				VariantIDs:       []string{"root-param-variant"},
				DefaultVariantID: "root-param-variant",
			},
			"parent-param": {
				ID:               "parent-param",
				Name:             "parent",
				VariantIDs:       []string{"parent-param-variant"},
				DefaultVariantID: "parent-param-variant",
			},
			"selected-a": {
				ID:               "selected-a",
				Name:             "selected_a",
				VariantIDs:       []string{"selected-a-variant"},
				DefaultVariantID: "selected-a-variant",
			},
			"selected-b": {
				ID:               "selected-b",
				Name:             "selected_b",
				VariantIDs:       []string{"selected-b-variant"},
				DefaultVariantID: "selected-b-variant",
			},
			"other-param": {
				ID:               "other-param",
				Name:             "other",
				VariantIDs:       []string{"other-param-variant"},
				DefaultVariantID: "other-param-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"root-param-variant":   {ID: "root-param-variant", ImplID: "root-param-impl"},
			"parent-param-variant": {ID: "parent-param-variant", ImplID: "parent-param-impl"},
			"selected-a-variant":   {ID: "selected-a-variant", ImplID: "selected-a-impl"},
			"selected-b-variant":   {ID: "selected-b-variant", ImplID: "selected-b-impl"},
			"other-param-variant":  {ID: "other-param-variant", ImplID: "other-param-impl"},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"root-param-impl": {
				ID:      "root-param-impl",
				Type:    "NestedParam",
				Payload: mustMarshalProjectRouteObject(t, map[string]any{"id": "root-param-impl", "type": "NestedParam", "children": []string{"parent-param", "selected-a", "selected-b", "other-param"}}),
			},
			"parent-param-impl": {
				ID:      "parent-param-impl",
				Type:    "CodeParam",
				Payload: mustMarshalProjectRouteObject(t, map[string]any{"id": "parent-param-impl", "type": "CodeParam", "coreNameEditable": true, "coreNameType": "TEXT", "passingStyle": "DEFAULT", "typeAnnotation": "", "value": "parent"}),
			},
			"selected-a-impl": {
				ID:      "selected-a-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectRouteObject(t, map[string]any{"id": "selected-a-impl", "type": "TextParam", "coreNameEditable": true, "coreNameType": "TEXT", "passingStyle": "DEFAULT", "typeAnnotation": "", "value": "a"}),
			},
			"selected-b-impl": {
				ID:      "selected-b-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectRouteObject(t, map[string]any{"id": "selected-b-impl", "type": "TextParam", "coreNameEditable": true, "coreNameType": "TEXT", "passingStyle": "DEFAULT", "typeAnnotation": "", "value": "b"}),
			},
			"other-param-impl": {
				ID:      "other-param-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectRouteObject(t, map[string]any{"id": "other-param-impl", "type": "TextParam", "coreNameEditable": true, "coreNameType": "TEXT", "passingStyle": "DEFAULT", "typeAnnotation": "", "value": "other"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize param move route test project: %v", err)
	}
	return project
}
