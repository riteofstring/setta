package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
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

func browserSectionRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"browser-section": "browser-variant",
			"plain-section":   "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"browser-section": {
				ID:               "browser-section",
				Name:             "Browser Section",
				VariantIDs:       []string{"browser-variant"},
				DefaultVariantID: "browser-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"browser-variant": {
				ID:     "browser-variant",
				ImplID: "browser-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"browser-impl": {
				ID:   "browser-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":               "browser-impl",
					"type":             "Browser",
					"folder":           "",
					"hideColumn":       false,
					"columnWidth":      nil,
					"typesColumnWidth": nil,
					"viewMode":         "list",
					"savedSearches":    []any{},
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
		t.Fatalf("normalize browser route project: %v", err)
	}
	return project
}

func sectionDataRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"group-section":       "group-variant",
			"spreadsheet-section": "spreadsheet-variant",
			"task-board-section":  "task-board-variant",
			"image-section":       "image-variant",
			"social-section":      "social-variant",
			"plain-section":       "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"group-section": {
				ID:               "group-section",
				Name:             "Group Section",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"spreadsheet-section": {
				ID:               "spreadsheet-section",
				Name:             "Spreadsheet Section",
				VariantIDs:       []string{"spreadsheet-variant"},
				DefaultVariantID: "spreadsheet-variant",
			},
			"task-board-section": {
				ID:               "task-board-section",
				Name:             "Task Board Section",
				VariantIDs:       []string{"task-board-variant"},
				DefaultVariantID: "task-board-variant",
			},
			"image-section": {
				ID:               "image-section",
				Name:             "Image Section",
				VariantIDs:       []string{"image-variant"},
				DefaultVariantID: "image-variant",
			},
			"social-section": {
				ID:               "social-section",
				Name:             "Social Section",
				VariantIDs:       []string{"social-variant"},
				DefaultVariantID: "social-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"group-variant":       {ID: "group-variant", ImplID: "group-impl"},
			"spreadsheet-variant": {ID: "spreadsheet-variant", ImplID: "spreadsheet-impl"},
			"task-board-variant":  {ID: "task-board-variant", ImplID: "task-board-impl"},
			"image-variant":       {ID: "image-variant", ImplID: "image-impl"},
			"social-variant":      {ID: "social-variant", ImplID: "social-impl"},
			"plain-variant":       {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
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
			"spreadsheet-impl": {
				ID:   "spreadsheet-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                         "spreadsheet-impl",
					"type":                       "Spreadsheet",
					"filePath":                   "seed.csv",
					"activeSheet":                nil,
					"readOnly":                   false,
					"showRowNumbers":             true,
					"density":                    "compact",
					"autoReloadOnExternalChange": false,
				}),
			},
			"task-board-impl": {
				ID:   "task-board-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "task-board-impl",
					"type":     "TaskBoard",
					"viewMode": "kanban",
					"columns": []map[string]any{
						{"id": "seed-column", "name": "Backlog", "color": "#3b82f6", "sortIndex": 0},
					},
					"tasks": []map[string]any{
						{
							"id":               "seed-task",
							"title":            "Seed Task",
							"description":      "",
							"completed":        false,
							"columnId":         "seed-column",
							"dueDateIso":       "",
							"recurrence":       "none",
							"recurrenceDays":   []string{},
							"recurrenceMonths": []string{},
							"recurrenceYears":  []int{},
							"sortIndex":        0,
						},
					},
				}),
			},
			"image-impl": {
				ID:   "image-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":        "image-impl",
					"type":      "Image",
					"imagePath": "/tmp/seed.png",
				}),
			},
			"social-impl": {
				ID:   "social-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":   "social-impl",
					"type": "Social",
					"url":  "https://example.com/seed",
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
		t.Fatalf("normalize section data route project: %v", err)
	}
	return project
}

func drawAreaRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"draw-section":  "draw-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"draw-section": {
				ID:               "draw-section",
				Name:             "Draw Section",
				VariantIDs:       []string{"draw-variant"},
				DefaultVariantID: "draw-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"draw-variant":  {ID: "draw-variant", ImplID: "draw-impl"},
			"plain-variant": {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"draw-impl": {
				ID:   "draw-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":   "draw-impl",
					"type": "Draw",
					"layers": []any{
						map[string]any{
							"name":         "Layer 1",
							"visible":      true,
							"layerOpacity": 1.0,
							"elements": []any{
								map[string]any{
									"type":        "BrushStroke",
									"dataPath":    "artifacts/existing-stroke.json",
									"transformId": "artifacts/existing-transform.json",
								},
							},
						},
					},
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
		t.Fatalf("normalize draw area route project: %v", err)
	}
	return project
}

func chartRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"chart-section": "chart-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"chart-section": {
				ID:               "chart-section",
				Name:             "Chart Section",
				VariantIDs:       []string{"chart-variant"},
				DefaultVariantID: "chart-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"chart-variant": {ID: "chart-variant", ImplID: "chart-impl"},
			"plain-variant": {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"chart-impl": {
				ID:   "chart-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "chart-impl",
					"type":     "Chart",
					"dataPath": "seed-chart.csv",
					"chartSettings": map[string]any{
						"type":               "line",
						"xAxisColumn":        nil,
						"secondYAxisColumns": []string{"humidity"},
						"xAxisLog":           true,
						"y1AxisLog":          false,
						"y2AxisLog":          false,
					},
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
		t.Fatalf("normalize chart route project: %v", err)
	}
	return project
}

func textBlockRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"text-section":  "text-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"text-section": {
				ID:               "text-section",
				Name:             "Seed Section",
				VariantIDs:       []string{"text-variant"},
				DefaultVariantID: "text-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"text-variant": {
				ID:     "text-variant",
				ImplID: "text-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"text-impl": {
				ID:   "text-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                   "text-impl",
					"type":                 "TextBlock",
					"text":                 "# Seed Heading\n\nBody",
					"format":               "Plaintext",
					"masterFontSizePx":     14.0,
					"headingAsSectionName": false,
					"metaControlStyle":     false,
					"textDisplayMode":      "Render",
				}),
			},
			"plain-impl": {
				ID:   "plain-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":   "plain-impl",
					"type": "Chat",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize text block route project: %v", err)
	}
	return project
}

func codeFileBindingRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"code-section":  "code-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"code-section": {
				ID:               "code-section",
				Name:             "Code Section",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"code-variant": {
				ID:     "code-variant",
				ImplID: "code-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"code-impl": {
				ID:   "code-impl",
				Kind: projectstate.SectionKindCode,
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":           "code-impl",
					"type":         "Code",
					"code":         "print('hello')\n",
					"codeLanguage": "python",
					"children":     []any{},
				}),
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
					Binding: &projectstate.CodeFileBinding{
						Path:       "pkg/original.py",
						AccessMode: projectstate.CodeFileAccessModeReadWrite,
					},
				},
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize code file binding route project: %v", err)
	}
	return project
}

func viewModesRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:                  "project-alpha",
		Name:                "Alpha",
		ActiveViewModeID:    "focus",
		IsEditingViewMode:   false,
		Viewport:            &projectstate.Viewport{X: 5, Y: 10, Zoom: 0.8},
		ViewportInitialized: true,
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"parent-section":     {X: 0, Y: 0, ZIndex: 0},
			"standalone-section": {X: 100, Y: 50, ZIndex: 1},
			"moving-section":     {X: 220, Y: 120, ZIndex: 2},
		},
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID:        "focus",
				Name:      "Focus",
				SortIndex: 0,
				Viewport:  &projectstate.Viewport{X: 5, Y: 10, Zoom: 0.8},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"parent-section":     {X: 0, Y: 0, ZIndex: 0},
					"standalone-section": {X: 100, Y: 50, ZIndex: 1},
					"moving-section":     {X: 220, Y: 120, ZIndex: 2},
				},
				ViewportInitialized: true,
				VisibilityBySectionID: map[string]bool{
					"parent-section":     true,
					"standalone-section": true,
					"moving-section":     true,
				},
			},
		},
		SectionVariantMap: map[string]string{
			"parent-section":     "parent-variant",
			"standalone-section": "standalone-variant",
			"moving-section":     "moving-variant",
		},
		Sections: map[string]projectstate.Section{
			"parent-section": {
				ID:               "parent-section",
				Name:             "Parent Section",
				VariantIDs:       []string{"parent-variant"},
				DefaultVariantID: "parent-variant",
			},
			"standalone-section": {
				ID:               "standalone-section",
				Name:             "Standalone Section",
				VariantIDs:       []string{"standalone-variant"},
				DefaultVariantID: "standalone-variant",
			},
			"moving-section": {
				ID:               "moving-section",
				Name:             "Moving Section",
				VariantIDs:       []string{"moving-variant"},
				DefaultVariantID: "moving-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"parent-variant": {
				ID:     "parent-variant",
				ImplID: "parent-impl",
			},
			"standalone-variant": {
				ID:     "standalone-variant",
				ImplID: "standalone-impl",
			},
			"moving-variant": {
				ID:     "moving-variant",
				ImplID: "moving-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"parent-impl": {
				ID:      "parent-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "parent-impl", "type": "Group"}),
			},
			"standalone-impl": {
				ID:      "standalone-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "standalone-impl", "type": "TextBlock"}),
			},
			"moving-impl": {
				ID:      "moving-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "moving-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize view modes route project: %v", err)
	}
	return project
}

func viewModesDeploymentRouteTestDocument(t *testing.T) (projectstate.Document, string) {
	t.Helper()

	project := viewModesRouteTestProject(t)
	alternateViewModeID, err := project.CreateViewMode()
	if err != nil {
		t.Fatalf("create alternate view mode: %v", err)
	}
	alternateViewMode := project.ViewModes[alternateViewModeID]
	alternateViewMode.Name = "Review"
	alternateViewMode.TopLevelSections["standalone-section"] = projectstate.TopLevelSectionLayout{X: 460, Y: 310, ZIndex: 9}
	alternateViewMode.Viewport = &projectstate.Viewport{X: 42, Y: 24, Zoom: 1.1}
	alternateViewMode.ViewportInitialized = true
	project.ViewModes[alternateViewModeID] = alternateViewMode
	project.ActiveViewModeID = "focus"
	project.IsEditingViewMode = false

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
		},
	}, alternateViewModeID
}

func sectionStructureRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	topLevelSections := map[string]projectstate.TopLevelSectionLayout{
		"alpha-section": {X: 120, Y: 40, ZIndex: 1},
		"beta-section":  {X: 20, Y: 10, ZIndex: 2},
		"top-group":     {X: 400, Y: 60, ZIndex: 3},
		"nested-parent": {X: 700, Y: 80, ZIndex: 4},
	}

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		TopLevelSectionIDs: []string{
			"alpha-section",
			"beta-section",
			"top-group",
			"nested-parent",
		},
		TopLevelSections: topLevelSections,
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID:               "focus",
				TopLevelSections: topLevelSections,
				VisibilityBySectionID: map[string]bool{
					"alpha-section":  true,
					"beta-section":   true,
					"top-group":      true,
					"top-child-a":    true,
					"top-child-b":    true,
					"nested-parent":  true,
					"nested-group":   true,
					"nested-child-a": true,
					"nested-child-b": true,
					"nested-sibling": true,
				},
			},
		},
		SectionVariantMap: map[string]string{
			"alpha-section":  "alpha-variant",
			"beta-section":   "beta-variant",
			"top-group":      "top-group-variant",
			"top-child-a":    "top-child-a-variant",
			"top-child-b":    "top-child-b-variant",
			"nested-parent":  "nested-parent-variant",
			"nested-group":   "nested-group-variant",
			"nested-child-a": "nested-child-a-variant",
			"nested-child-b": "nested-child-b-variant",
			"nested-sibling": "nested-sibling-variant",
		},
		Sections: map[string]projectstate.Section{
			"alpha-section": {
				ID:               "alpha-section",
				Name:             "Alpha Section",
				VariantIDs:       []string{"alpha-variant"},
				DefaultVariantID: "alpha-variant",
			},
			"beta-section": {
				ID:               "beta-section",
				Name:             "Beta Section",
				VariantIDs:       []string{"beta-variant"},
				DefaultVariantID: "beta-variant",
			},
			"top-group": {
				ID:               "top-group",
				Name:             "Top Group",
				VariantIDs:       []string{"top-group-variant"},
				DefaultVariantID: "top-group-variant",
			},
			"top-child-a": {
				ID:               "top-child-a",
				Name:             "Top Child A",
				ParentSectionID:  "top-group",
				VariantIDs:       []string{"top-child-a-variant"},
				DefaultVariantID: "top-child-a-variant",
			},
			"top-child-b": {
				ID:               "top-child-b",
				Name:             "Top Child B",
				ParentSectionID:  "top-group",
				VariantIDs:       []string{"top-child-b-variant"},
				DefaultVariantID: "top-child-b-variant",
			},
			"nested-parent": {
				ID:               "nested-parent",
				Name:             "Nested Parent",
				VariantIDs:       []string{"nested-parent-variant"},
				DefaultVariantID: "nested-parent-variant",
			},
			"nested-group": {
				ID:               "nested-group",
				Name:             "Nested Group",
				ParentSectionID:  "nested-parent",
				VariantIDs:       []string{"nested-group-variant"},
				DefaultVariantID: "nested-group-variant",
			},
			"nested-child-a": {
				ID:               "nested-child-a",
				Name:             "Nested Child A",
				ParentSectionID:  "nested-group",
				VariantIDs:       []string{"nested-child-a-variant"},
				DefaultVariantID: "nested-child-a-variant",
			},
			"nested-child-b": {
				ID:               "nested-child-b",
				Name:             "Nested Child B",
				ParentSectionID:  "nested-group",
				VariantIDs:       []string{"nested-child-b-variant"},
				DefaultVariantID: "nested-child-b-variant",
			},
			"nested-sibling": {
				ID:               "nested-sibling",
				Name:             "Nested Sibling",
				ParentSectionID:  "nested-parent",
				VariantIDs:       []string{"nested-sibling-variant"},
				DefaultVariantID: "nested-sibling-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"alpha-variant":          {ID: "alpha-variant", ImplID: "alpha-impl"},
			"beta-variant":           {ID: "beta-variant", ImplID: "beta-impl"},
			"top-group-variant":      {ID: "top-group-variant", ImplID: "top-group-impl"},
			"top-child-a-variant":    {ID: "top-child-a-variant", ImplID: "top-child-a-impl"},
			"top-child-b-variant":    {ID: "top-child-b-variant", ImplID: "top-child-b-impl"},
			"nested-parent-variant":  {ID: "nested-parent-variant", ImplID: "nested-parent-impl"},
			"nested-group-variant":   {ID: "nested-group-variant", ImplID: "nested-group-impl"},
			"nested-child-a-variant": {ID: "nested-child-a-variant", ImplID: "nested-child-a-impl"},
			"nested-child-b-variant": {ID: "nested-child-b-variant", ImplID: "nested-child-b-impl"},
			"nested-sibling-variant": {ID: "nested-sibling-variant", ImplID: "nested-sibling-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"alpha-impl": {
				ID:      "alpha-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "alpha-impl", "type": "TextBlock"}),
			},
			"beta-impl": {
				ID:      "beta-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "beta-impl", "type": "TextBlock"}),
			},
			"top-group-impl": {
				ID:   "top-group-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "top-group-impl",
					"type":     "Group",
					"children": []string{"top-child-a", "top-child-b"},
				}),
			},
			"top-child-a-impl": {
				ID:      "top-child-a-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "top-child-a-impl", "type": "TextBlock"}),
			},
			"top-child-b-impl": {
				ID:      "top-child-b-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "top-child-b-impl", "type": "TextBlock"}),
			},
			"nested-parent-impl": {
				ID:   "nested-parent-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "nested-parent-impl",
					"type":     "Group",
					"children": []string{"nested-group", "nested-sibling"},
				}),
			},
			"nested-group-impl": {
				ID:   "nested-group-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "nested-group-impl",
					"type":     "Group",
					"children": []string{"nested-child-a", "nested-child-b"},
				}),
			},
			"nested-child-a-impl": {
				ID:      "nested-child-a-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "nested-child-a-impl", "type": "TextBlock"}),
			},
			"nested-child-b-impl": {
				ID:      "nested-child-b-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "nested-child-b-impl", "type": "TextBlock"}),
			},
			"nested-sibling-impl": {
				ID:      "nested-sibling-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "nested-sibling-impl", "type": "TextBlock"}),
			},
		},
	})
}

func moveSectionsRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:               "project-alpha",
		Name:             "Alpha",
		ActiveViewModeID: "focus",
		TopLevelSectionIDs: []string{
			"code-section",
			"group-parent",
			"top-a",
			"top-b",
		},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"code-section": {X: 20, Y: 40, ZIndex: 0},
			"group-parent": {X: 400, Y: 60, ZIndex: 1},
			"top-a":        {X: 120, Y: 40, ZIndex: 2},
			"top-b":        {X: 220, Y: 80, ZIndex: 3},
		},
		ViewModes: map[string]projectstate.ViewMode{
			"focus": {
				ID: "focus",
				VisibilityBySectionID: map[string]bool{
					"code-section":     true,
					"group-parent":     true,
					"nested-group":     true,
					"top-a":            true,
					"top-b":            true,
					"terminal-section": true,
				},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"code-section": {X: 20, Y: 40, ZIndex: 0},
					"group-parent": {X: 400, Y: 60, ZIndex: 1},
					"top-a":        {X: 120, Y: 40, ZIndex: 2},
					"top-b":        {X: 220, Y: 80, ZIndex: 3},
				},
			},
		},
		SectionVariantMap: map[string]string{
			"code-section":     "code-variant",
			"group-parent":     "group-variant",
			"nested-group":     "nested-group-variant",
			"top-a":            "top-a-variant",
			"top-b":            "top-b-variant",
			"terminal-section": "terminal-variant",
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
				Name:             "Group Parent",
				VariantIDs:       []string{"group-variant"},
				DefaultVariantID: "group-variant",
			},
			"nested-group": {
				ID:               "nested-group",
				Name:             "Nested Group",
				ParentSectionID:  "group-parent",
				VariantIDs:       []string{"nested-group-variant"},
				DefaultVariantID: "nested-group-variant",
			},
			"top-a": {
				ID:               "top-a",
				Name:             "Top A",
				VariantIDs:       []string{"top-a-variant"},
				DefaultVariantID: "top-a-variant",
			},
			"top-b": {
				ID:               "top-b",
				Name:             "Top B",
				VariantIDs:       []string{"top-b-variant"},
				DefaultVariantID: "top-b-variant",
			},
			"terminal-section": {
				ID:               "terminal-section",
				Name:             "Terminal",
				ParentSectionID:  "code-section",
				VariantIDs:       []string{"terminal-variant"},
				DefaultVariantID: "terminal-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"code-variant":         {ID: "code-variant", ImplID: "code-impl"},
			"group-variant":        {ID: "group-variant", ImplID: "group-impl"},
			"nested-group-variant": {ID: "nested-group-variant", ImplID: "nested-group-impl"},
			"top-a-variant":        {ID: "top-a-variant", ImplID: "top-a-impl"},
			"top-b-variant":        {ID: "top-b-variant", ImplID: "top-b-impl"},
			"terminal-variant":     {ID: "terminal-variant", ImplID: "terminal-impl"},
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
					"children":                  []string{"terminal-section"},
					"attachedTerminalSectionId": "terminal-section",
					"size": map[string]any{
						"width":  640.0,
						"height": 160.0,
					},
				}),
			},
			"group-impl": {
				ID:   "group-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "group-impl",
					"type":     "Group",
					"children": []string{"nested-group"},
					"size": map[string]any{
						"width":  520.0,
						"height": 220.0,
					},
				}),
			},
			"nested-group-impl": {
				ID:   "nested-group-impl",
				Kind: projectstate.SectionKind("group"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "nested-group-impl",
					"type":     "Group",
					"children": []string{},
				}),
			},
			"top-a-impl": {
				ID:      "top-a-impl",
				Kind:    projectstate.SectionKind("textblock"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "top-a-impl", "type": "TextBlock"}),
			},
			"top-b-impl": {
				ID:      "top-b-impl",
				Kind:    projectstate.SectionKind("textblock"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "top-b-impl", "type": "TextBlock"}),
			},
			"terminal-impl": {
				ID:       "terminal-impl",
				Kind:     projectstate.SectionKindTerminal,
				Terminal: &projectstate.TerminalSectionImpl{},
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":   "terminal-impl",
					"type": "Terminal",
					"size": map[string]any{
						"width":  640.0,
						"height": 150.0,
					},
				}),
			},
		},
	})
}

func mustProjectRouteRawJSON(t *testing.T, value map[string]any) projectstate.RawJSON {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal raw JSON: %v", err)
	}
	return projectstate.RawJSON(encoded)
}

func mustMarshalProjectRouteRequest(t *testing.T, value any) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal project route request: %v", err)
	}
	return string(encoded)
}

func passwordParamRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"dict-a": "dict-a-variant",
		},
		Sections: map[string]projectstate.Section{
			"dict-a": {
				ID:               "dict-a",
				Name:             "Dict A",
				VariantIDs:       []string{"dict-a-variant"},
				DefaultVariantID: "dict-a-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"dict-a-variant": {
				ID:     "dict-a-variant",
				ImplID: "dict-a-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"dict-a-impl": {
				ID:   "dict-a-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "dict-a-impl",
					"type":            "Dict",
					"selectedParams":  []string{},
					"topLevelParamId": "shared-root",
					"codeObjVariantMap": map[string]string{
						"shared-root":   "shared-root-variant",
						"shared-child":  "shared-child-variant",
						"shared-secret": "shared-secret-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"shared-root": {
				ID:               "shared-root",
				Name:             "root",
				VariantIDs:       []string{"shared-root-variant"},
				DefaultVariantID: "shared-root-variant",
			},
			"shared-child": {
				ID:               "shared-child",
				Name:             "child",
				VariantIDs:       []string{"shared-child-variant"},
				DefaultVariantID: "shared-child-variant",
			},
			"shared-secret": {
				ID:               "shared-secret",
				Name:             "secret",
				VariantIDs:       []string{"shared-secret-variant"},
				DefaultVariantID: "shared-secret-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"shared-root-variant": {
				ID:     "shared-root-variant",
				ImplID: "shared-root-impl",
			},
			"shared-child-variant": {
				ID:     "shared-child-variant",
				ImplID: "shared-child-impl",
			},
			"shared-secret-variant": {
				ID:     "shared-secret-variant",
				ImplID: "shared-secret-impl",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"shared-root-impl": {
				ID:      "shared-root-impl",
				Type:    "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "shared-root-impl", "type": "NestedParam", "children": []string{"shared-child", "shared-secret"}}),
			},
			"shared-child-impl": {
				ID:      "shared-child-impl",
				Type:    "TextParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "shared-child-impl", "type": "TextParam", "value": "seed", "coreNameEditable": true}),
			},
			"shared-secret-impl": {
				ID:      "shared-secret-impl",
				Type:    "PasswordParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "shared-secret-impl", "type": "PasswordParam", "value": ""}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize password route test project: %v", err)
	}
	return project
}

func metaControlParamRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"meta-section": "meta-variant",
		},
		Sections: map[string]projectstate.Section{
			"meta-section": {
				ID:               "meta-section",
				Name:             "Meta",
				VariantIDs:       []string{"meta-variant"},
				DefaultVariantID: "meta-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"meta-variant": {
				ID:     "meta-variant",
				ImplID: "meta-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"meta-impl": {
				ID:   "meta-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":                 "meta-impl",
					"type":               "MetaControl",
					"metaControlParamId": "meta-param",
					"codeObjVariantMap": map[string]string{
						"meta-param": "meta-param-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"meta-param": {
				ID:               "meta-param",
				Name:             "meta_param",
				VariantIDs:       []string{"meta-param-variant"},
				DefaultVariantID: "meta-param-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"meta-param-variant": {
				ID:     "meta-param-variant",
				ImplID: "meta-param-impl",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"meta-param-impl": {
				ID:      "meta-param-impl",
				Type:    "TextParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "meta-param-impl", "type": "TextParam", "value": "seed"}),
			},
		},
	})
}

func genCodePrefixSuffixRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
				Payload:  projectstate.RawJSON(`{"language":"python","generateMetadata":true}`),
			},
		},
	})
}

func graphEdgeRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{
				Language: string(projectstate.CodeLanguagePython),
				Payload:  projectstate.RawJSON(`{"language":"python"}`),
			},
		},
		TopLevelSectionIDs: []string{
			"source-section",
			"target-a",
			"target-b",
			"chat-source",
			"chat-target",
			"plain-section",
		},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"source-section": {X: 10, Y: 10},
			"target-a":       {X: 20, Y: 20},
			"target-b":       {X: 30, Y: 30},
			"chat-source":    {X: 40, Y: 40},
			"chat-target":    {X: 50, Y: 50},
			"plain-section":  {X: 60, Y: 60},
		},
		SectionVariantMap: map[string]string{
			"source-section": "source-variant",
			"target-a":       "target-a-variant",
			"target-b":       "target-b-variant",
			"chat-source":    "chat-source-variant",
			"chat-target":    "chat-target-variant",
			"plain-section":  "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"source-section": {
				ID:               "source-section",
				Name:             "Source Call",
				VariantIDs:       []string{"source-variant"},
				DefaultVariantID: "source-variant",
			},
			"target-a": {
				ID:               "target-a",
				Name:             "Target A",
				VariantIDs:       []string{"target-a-variant"},
				DefaultVariantID: "target-a-variant",
			},
			"target-b": {
				ID:               "target-b",
				Name:             "Target B",
				VariantIDs:       []string{"target-b-variant"},
				DefaultVariantID: "target-b-variant",
			},
			"chat-source": {
				ID:               "chat-source",
				Name:             "Chat Source",
				VariantIDs:       []string{"chat-source-variant"},
				DefaultVariantID: "chat-source-variant",
			},
			"chat-target": {
				ID:               "chat-target",
				Name:             "Chat Target",
				VariantIDs:       []string{"chat-target-variant"},
				DefaultVariantID: "chat-target-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"source-variant":      {ID: "source-variant", ImplID: "source-impl"},
			"target-a-variant":    {ID: "target-a-variant", ImplID: "target-a-impl"},
			"target-b-variant":    {ID: "target-b-variant", ImplID: "target-b-impl"},
			"chat-source-variant": {ID: "chat-source-variant", ImplID: "chat-source-impl"},
			"chat-target-variant": {ID: "chat-target-variant", ImplID: "chat-target-impl"},
			"plain-variant":       {ID: "plain-variant", ImplID: "plain-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"source-impl": {
				ID:   "source-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "source-impl",
					"type":     "Callable",
					"callable": "source-callable",
					"codeObjVariantMap": map[string]string{
						"source-callable": "source-callable-variant",
					},
					"edgeOutputPorts": []map[string]any{
						{"id": "result", "accessor": ".result"},
						{"id": "summary", "accessor": ""},
					},
				}),
			},
			"target-a-impl": {
				ID:   "target-a-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "target-a-impl",
					"type":            "Dict",
					"topLevelParamId": "target-a-root",
					"codeObjVariantMap": map[string]string{
						"target-a-root": "target-a-root-variant",
						"input-a":       "input-a-variant",
					},
					"edgeInputParams": []string{"input-a"},
				}),
			},
			"target-b-impl": {
				ID:   "target-b-impl",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "target-b-impl",
					"type":            "Dict",
					"topLevelParamId": "target-b-root",
					"codeObjVariantMap": map[string]string{
						"target-b-root": "target-b-root-variant",
						"input-b":       "input-b-variant",
					},
					"edgeInputParams": []string{"input-b"},
				}),
			},
			"chat-source-impl": {
				ID:      "chat-source-impl",
				Kind:    projectstate.SectionKind("chat"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chat-source-impl", "type": "Chat"}),
			},
			"chat-target-impl": {
				ID:      "chat-target-impl",
				Kind:    projectstate.SectionKind("chat"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chat-target-impl", "type": "Chat"}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"source-callable": {
				ID:               "source-callable",
				Name:             "source_callable",
				VariantIDs:       []string{"source-callable-variant"},
				DefaultVariantID: "source-callable-variant",
			},
			"target-a-root": {
				ID:               "target-a-root",
				Name:             "target_a_root",
				VariantIDs:       []string{"target-a-root-variant"},
				DefaultVariantID: "target-a-root-variant",
			},
			"input-a": {
				ID:               "input-a",
				Name:             "input_a",
				VariantIDs:       []string{"input-a-variant"},
				DefaultVariantID: "input-a-variant",
			},
			"target-b-root": {
				ID:               "target-b-root",
				Name:             "target_b_root",
				VariantIDs:       []string{"target-b-root-variant"},
				DefaultVariantID: "target-b-root-variant",
			},
			"input-b": {
				ID:               "input-b",
				Name:             "input_b",
				VariantIDs:       []string{"input-b-variant"},
				DefaultVariantID: "input-b-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"source-callable-variant": {ID: "source-callable-variant", ImplID: "source-callable-impl"},
			"target-a-root-variant":   {ID: "target-a-root-variant", ImplID: "target-a-root-impl"},
			"input-a-variant":         {ID: "input-a-variant", ImplID: "input-a-impl"},
			"target-b-root-variant":   {ID: "target-b-root-variant", ImplID: "target-b-root-impl"},
			"input-b-variant":         {ID: "input-b-variant", ImplID: "input-b-impl"},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"source-callable-impl": {
				ID:      "source-callable-impl",
				Type:    "CodeCallable",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "source-callable-impl", "type": "CodeCallable", "children": []string{}}),
			},
			"target-a-root-impl": {
				ID:      "target-a-root-impl",
				Type:    "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "target-a-root-impl", "type": "NestedParam", "children": []string{"input-a"}}),
			},
			"input-a-impl": {
				ID:      "input-a-impl",
				Type:    "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "input-a-impl", "type": "CodeParam", "value": "seed-a"}),
			},
			"target-b-root-impl": {
				ID:      "target-b-root-impl",
				Type:    "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "target-b-root-impl", "type": "NestedParam", "children": []string{"input-b"}}),
			},
			"input-b-impl": {
				ID:      "input-b-impl",
				Type:    "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "input-b-impl", "type": "CodeParam", "value": "seed-b"}),
			},
		},
	})
}

func sectionVariantDeletionRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return sectionVariantRouteTestProject(t, true)
}

func sectionVariantRouteTestProject(t *testing.T, allowJSONSourceKeyEdits bool) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Alpha",
		AllowJSONSourceKeyEdits: allowJSONSourceKeyEdits,
		SectionVariantMap: map[string]string{
			"source-section": "source-variant-b",
			"json-section":   "json-variant-a",
			"code-section":   "code-variant",
		},
		Sections: map[string]projectstate.Section{
			"source-section": {
				ID:               "source-section",
				Name:             "Source",
				VariantIDs:       []string{"source-variant-a", "source-variant-b"},
				DefaultVariantID: "source-variant-b",
			},
			"json-section": {
				ID:               "json-section",
				Name:             "JSON Source",
				VariantIDs:       []string{"json-variant-a", "json-variant-b"},
				DefaultVariantID: "json-variant-a",
			},
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"source-variant-a": {
				ID:     "source-variant-a",
				ImplID: "source-impl-a",
			},
			"source-variant-b": {
				ID:     "source-variant-b",
				ImplID: "source-impl-b",
			},
			"json-variant-a": {
				ID:     "json-variant-a",
				ImplID: "json-impl-a",
				Name:   "data/source.json",
			},
			"json-variant-b": {
				ID:     "json-variant-b",
				ImplID: "json-impl-b",
			},
			"code-variant": {
				ID:     "code-variant",
				ImplID: "code-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"source-impl-a": {
				ID:      "source-impl-a",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "source-impl-a", "type": "TextBlock"}),
			},
			"source-impl-b": {
				ID:      "source-impl-b",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "source-impl-b", "type": "TextBlock"}),
			},
			"json-impl-a": {
				ID:      "json-impl-a",
				Kind:    projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "json-impl-a", "type": "Dict", "isJsonSource": true, "jsonSourceKeys": []string{"config"}}),
			},
			"json-impl-b": {
				ID:      "json-impl-b",
				Kind:    projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "json-impl-b", "type": "Dict", "configLanguage": "python", "jsonSourceKeys": []string{}}),
			},
			"code-impl": {
				ID:   "code-impl",
				Kind: projectstate.SectionKindCode,
				Code: &projectstate.CodeSectionImpl{
					Language: projectstate.CodeLanguagePython,
				},
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "code-impl", "type": "Code", "codeLanguage": "python", "children": []string{}}),
			},
		},
	})
}

func sectionVariantAgenticEdgeRouteTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	return mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"chat-source": "chat-source-variant",
			"chat-target": "chat-target-chat-variant",
		},
		AgenticEdges: []projectstate.AgenticEdge{
			{
				ID:              "agentic-edge-1",
				SourceSectionID: "chat-source",
				TargetSectionID: "chat-target",
				Kind:            "chat_chat",
				ContextMode:     "reference_only",
			},
		},
		Sections: map[string]projectstate.Section{
			"chat-source": {
				ID:               "chat-source",
				Name:             "Chat Source",
				VariantIDs:       []string{"chat-source-variant"},
				DefaultVariantID: "chat-source-variant",
			},
			"chat-target": {
				ID:               "chat-target",
				Name:             "Chat Target",
				VariantIDs:       []string{"chat-target-chat-variant", "chat-target-text-variant"},
				DefaultVariantID: "chat-target-chat-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"chat-source-variant":      {ID: "chat-source-variant", ImplID: "chat-source-impl"},
			"chat-target-chat-variant": {ID: "chat-target-chat-variant", ImplID: "chat-target-chat-impl"},
			"chat-target-text-variant": {ID: "chat-target-text-variant", ImplID: "chat-target-text-impl"},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"chat-source-impl": {
				ID:      "chat-source-impl",
				Kind:    projectstate.SectionKind("chat"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chat-source-impl", "type": "Chat"}),
			},
			"chat-target-chat-impl": {
				ID:      "chat-target-chat-impl",
				Kind:    projectstate.SectionKind("chat"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chat-target-chat-impl", "type": "Chat"}),
			},
			"chat-target-text-impl": {
				ID:      "chat-target-text-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chat-target-text-impl", "type": "TextBlock"}),
			},
		},
	})
}

func jsonSourceLiveRefreshRouteTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	project := mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Project Alpha",
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
			InstancesByID: map[string]projectstate.ProjectChatWindowInstance{},
			Order:         []string{},
		},
		SectionVariantMap: map[string]string{
			"json-section": "json-variant-a",
		},
		Sections: map[string]projectstate.Section{
			"json-section": {
				ID:               "json-section",
				Name:             "JSON Source",
				VariantIDs:       []string{"json-variant-a"},
				DefaultVariantID: "json-variant-a",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"json-variant-a": {
				ID:     "json-variant-a",
				ImplID: "json-impl-a",
				Name:   "data/source.json",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"json-impl-a": {
				ID:   "json-impl-a",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "json-impl-a",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"alpha"},
					"topLevelParamId": "old-root",
					"codeObjVariantMap": map[string]any{
						"old-root": "old-root-variant",
						"old-leaf": "old-leaf-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"old-root": {
				ID:               "old-root",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant"},
				DefaultVariantID: "old-root-variant",
			},
			"old-leaf": {
				ID:               "old-leaf",
				Name:             "one",
				VariantIDs:       []string{"old-leaf-variant"},
				DefaultVariantID: "old-leaf-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"old-root-variant": {
				ID:               "old-root-variant",
				ImplID:           "old-root-impl",
				NonPresetImplIDs: []string{"old-root-impl"},
			},
			"old-leaf-variant": {
				ID:               "old-leaf-variant",
				ImplID:           "old-leaf-impl",
				NonPresetImplIDs: []string{"old-leaf-impl"},
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"old-root-impl": {
				ID:   "old-root-impl",
				Type: "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "old-root-impl",
					"type":     "NestedParam",
					"children": []string{"old-leaf"},
				}),
			},
			"old-leaf-impl": {
				ID:   "old-leaf-impl",
				Type: "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":    "old-leaf-impl",
					"type":  "CodeParam",
					"value": "1",
				}),
			},
		},
	})

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}
}

func jsonSourceLeafRootRouteTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	document := jsonSourceLiveRefreshRouteTestDocument(t)
	project := document.Projects["project-alpha"]

	leafRoot := project.CodeObjs["old-leaf"]
	leafRoot.Name = "alpha"
	project.CodeObjs["old-leaf"] = leafRoot
	delete(project.CodeObjs, "old-root")
	delete(project.CodeObjVariants, "old-root-variant")
	delete(project.CodeObjImpls, "old-root-impl")
	project.SectionImpls["json-impl-a"] = projectstate.SectionImpl{
		ID:   "json-impl-a",
		Kind: projectstate.SectionKind("dict"),
		Payload: mustProjectRouteRawJSON(t, map[string]any{
			"id":              "json-impl-a",
			"type":            "Dict",
			"isJsonSource":    true,
			"configLanguage":  "json",
			"jsonSourceKeys":  []string{"alpha"},
			"topLevelParamId": "old-leaf",
			"codeObjVariantMap": map[string]any{
				"old-leaf": "old-leaf-variant",
			},
		}),
	}
	document.Projects["project-alpha"] = project
	return document
}

func jsonSourceSharedRouteTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	project := mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Project Alpha",
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
			InstancesByID: map[string]projectstate.ProjectChatWindowInstance{},
			Order:         []string{},
		},
		SectionVariantMap: map[string]string{
			"json-section-a": "json-variant-a",
			"json-section-b": "json-variant-b",
		},
		Sections: map[string]projectstate.Section{
			"json-section-a": {
				ID:               "json-section-a",
				Name:             "JSON Source A",
				VariantIDs:       []string{"json-variant-a"},
				DefaultVariantID: "json-variant-a",
			},
			"json-section-b": {
				ID:               "json-section-b",
				Name:             "JSON Source B",
				VariantIDs:       []string{"json-variant-b"},
				DefaultVariantID: "json-variant-b",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"json-variant-a": {
				ID:     "json-variant-a",
				ImplID: "json-impl-a",
				Name:   "data/source.json",
			},
			"json-variant-b": {
				ID:     "json-variant-b",
				ImplID: "json-impl-b",
				Name:   "data/source.json",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"json-impl-a": {
				ID:   "json-impl-a",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "json-impl-a",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"alpha"},
					"topLevelParamId": "old-root-a",
					"codeObjVariantMap": map[string]any{
						"old-root-a": "old-root-variant-a",
						"old-leaf-a": "old-leaf-variant-a",
					},
				}),
			},
			"json-impl-b": {
				ID:   "json-impl-b",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "json-impl-b",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"alpha"},
					"topLevelParamId": "old-root-b",
					"codeObjVariantMap": map[string]any{
						"old-root-b": "old-root-variant-b",
						"old-leaf-b": "old-leaf-variant-b",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"old-root-a": {
				ID:               "old-root-a",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant-a"},
				DefaultVariantID: "old-root-variant-a",
			},
			"old-leaf-a": {
				ID:               "old-leaf-a",
				Name:             "target-leaf",
				VariantIDs:       []string{"old-leaf-variant-a"},
				DefaultVariantID: "old-leaf-variant-a",
			},
			"old-root-b": {
				ID:               "old-root-b",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant-b"},
				DefaultVariantID: "old-root-variant-b",
			},
			"old-leaf-b": {
				ID:               "old-leaf-b",
				Name:             "peer-leaf",
				VariantIDs:       []string{"old-leaf-variant-b"},
				DefaultVariantID: "old-leaf-variant-b",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"old-root-variant-a": {
				ID:               "old-root-variant-a",
				ImplID:           "old-root-impl-a",
				NonPresetImplIDs: []string{"old-root-impl-a"},
			},
			"old-leaf-variant-a": {
				ID:               "old-leaf-variant-a",
				ImplID:           "old-leaf-impl-a",
				NonPresetImplIDs: []string{"old-leaf-impl-a"},
			},
			"old-root-variant-b": {
				ID:               "old-root-variant-b",
				ImplID:           "old-root-impl-b",
				NonPresetImplIDs: []string{"old-root-impl-b"},
			},
			"old-leaf-variant-b": {
				ID:               "old-leaf-variant-b",
				ImplID:           "old-leaf-impl-b",
				NonPresetImplIDs: []string{"old-leaf-impl-b"},
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"old-root-impl-a": {
				ID:   "old-root-impl-a",
				Type: "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "old-root-impl-a",
					"type":     "NestedParam",
					"children": []string{"old-leaf-a"},
				}),
			},
			"old-leaf-impl-a": {
				ID:   "old-leaf-impl-a",
				Type: "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":    "old-leaf-impl-a",
					"type":  "CodeParam",
					"value": "1",
				}),
			},
			"old-root-impl-b": {
				ID:   "old-root-impl-b",
				Type: "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "old-root-impl-b",
					"type":     "NestedParam",
					"children": []string{"old-leaf-b"},
				}),
			},
			"old-leaf-impl-b": {
				ID:   "old-leaf-impl-b",
				Type: "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":    "old-leaf-impl-b",
					"type":  "CodeParam",
					"value": "2",
				}),
			},
		},
	})

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}
}

func projectstatePayloadString(payload map[string]any, key string) string {
	value, _ := payload[key].(string)
	return value
}

func projectstatePayloadStringArray(payload map[string]any, key string) []string {
	rawEntries, _ := payload[key].([]any)
	output := make([]string, 0, len(rawEntries))
	for _, rawEntry := range rawEntries {
		entry, ok := rawEntry.(string)
		if !ok || strings.TrimSpace(entry) == "" {
			continue
		}
		output = append(output, entry)
	}
	return output
}

func projectstatePayloadStringMap(payload map[string]any, key string) map[string]string {
	rawEntries, _ := payload[key].(map[string]any)
	output := make(map[string]string, len(rawEntries))
	for entryKey, rawValue := range rawEntries {
		value, ok := rawValue.(string)
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		output[entryKey] = value
	}
	return output
}

func projectstatePayloadBool(payload map[string]any, key string) bool {
	value, _ := payload[key].(bool)
	return value
}

func assertProjectRouteJSONSourceFreshValue(t *testing.T, project projectstate.Project, codeObjVariantMap map[string]string, topLevelParamID string) {
	t.Helper()

	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		t.Fatalf("effective root payload after json-source check: %v", err)
	}
	childIDs := projectstatePayloadStringArray(rootPayload, "children")
	if len(childIDs) != 1 {
		t.Fatalf("expected one refreshed child, got %#v", childIDs)
	}
	childPayload, childCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective child payload after json-source check: %v", err)
	}
	if childCodeObj.Name != "fresh" {
		t.Fatalf("expected child name fresh, got %q", childCodeObj.Name)
	}
	if got := projectstatePayloadString(childPayload, "value"); got != "2" {
		t.Fatalf("expected child value 2, got %q", got)
	}
}

func assertProjectRouteJSONSourceOldLeafValue(t *testing.T, project projectstate.Project, codeObjVariantMap map[string]string, topLevelParamID string, expectedName string, expectedValue string) {
	t.Helper()

	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		t.Fatalf("effective root payload after persisted json-source check: %v", err)
	}
	childIDs := projectstatePayloadStringArray(rootPayload, "children")
	if len(childIDs) != 1 {
		t.Fatalf("expected one persisted child, got %#v", childIDs)
	}
	childPayload, childCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective child payload after persisted json-source check: %v", err)
	}
	if childCodeObj.Name != expectedName {
		t.Fatalf("expected child name %q, got %q", expectedName, childCodeObj.Name)
	}
	if got := projectstatePayloadString(childPayload, "value"); got != expectedValue {
		t.Fatalf("expected child value %q, got %q", expectedValue, got)
	}
}

func mustNormalizedProjectRouteProject(t *testing.T, project projectstate.Project) projectstate.Project {
	t.Helper()

	normalized, err := project.Normalized()
	if err != nil {
		t.Fatalf("normalize project route project: %v", err)
	}
	return normalized
}

func projectRouteStringPointer(value string) *string {
	return &value
}
