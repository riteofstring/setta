package mcpx

import (
	"context"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/projectstate"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestServerSetSectionParamFilterRejectsUnsupportedSectionType(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"paramFilter":     "alpha",
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_section_param_filter: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_section_param_filter call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "section does not support param filter") {
		t.Fatalf("expected unsupported param filter message, got %#v", payload["message"])
	}
}

func TestServerSetMetaControlShowSectionTitleRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestMetaControlSections(t, projectRuntime)

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "allowed-meta-section",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_meta_control_show_section_title allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_meta_control_show_section_title success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_meta_control_show_section_title: %v", err)
	}
	allowedPayload := mustDecodedProjectPayload(t, project.Sections["allowed-meta-section"].SharedModifier)
	if got := allowedPayload["showSectionTitle"]; got != true {
		t.Fatalf("expected allowed-meta-section showSectionTitle=true, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "blocked-meta-section",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_meta_control_show_section_title blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_meta_control_show_section_title call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-meta-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if ids := mustStringList(t, blockedPayload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-meta-section" {
		t.Fatalf("unexpected targetSectionIds %#v", ids)
	}
}

func TestServerSetMetaControlShowSectionTitleRejectsNonMetaControlSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "allowed-params-section",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_meta_control_show_section_title: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_meta_control_show_section_title call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "section must resolve to a meta control section") {
		t.Fatalf("expected non-meta-control message, got %#v", payload["message"])
	}
}

func TestServerSetCodeRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"code":            "print('updated by set_code')\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_code success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_code: %v", err)
	}
	payload := mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := payload["code"]; got != "print('updated by set_code')\n" {
		t.Fatalf("expected updated code payload, got %#v", got)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
			"code":            "print('blocked')\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_code call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerFormatCodeRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	var capturedProjectID string
	var capturedSectionID string
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		CodeUpdates: testCodeUpdateService{
			formatCode: func(_ context.Context, projectID string, sectionID string) error {
				capturedProjectID = projectID
				capturedSectionID = sectionID
				return nil
			},
		},
	})
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "format_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
		},
	})
	if err != nil {
		t.Fatalf("call format_code allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed format_code success, got %#v", allowedResult.StructuredContent)
	}
	if capturedProjectID != "project-alpha" || capturedSectionID != "allowed-section" {
		t.Fatalf("unexpected allowed format_code call project=%q section=%q", capturedProjectID, capturedSectionID)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "format_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
		},
	})
	if err != nil {
		t.Fatalf("call format_code blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked format_code call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
	if capturedProjectID != "project-alpha" || capturedSectionID != "allowed-section" {
		t.Fatalf("expected blocked format_code not to reach provider, got project=%q section=%q", capturedProjectID, capturedSectionID)
	}
}

func TestServerSetTopLevelSectionLayoutRespectsScopedStructuralTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	allowedLayout := map[string]any{
		"x":      345.5,
		"y":      210.25,
		"zIndex": 7,
		"w":      640.0,
		"h":      320.0,
	}
	allowedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_top_level_section_layout",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"topLevelSections": map[string]any{
				"allowed-section": allowedLayout,
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_top_level_section_layout allowed: %v", err)
	}
	if allowedResult.IsError {
		t.Fatalf("expected allowed set_top_level_section_layout success, got %#v", allowedResult.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_top_level_section_layout: %v", err)
	}
	layout := project.TopLevelSections["allowed-section"]
	if layout.X != 345.5 || layout.Y != 210.25 || layout.ZIndex != 7 {
		t.Fatalf("unexpected persisted top-level layout %#v", layout)
	}
	if layout.W == nil || *layout.W != 640.0 {
		t.Fatalf("expected persisted width 640, got %#v", layout.W)
	}
	if layout.H == nil || *layout.H != 320.0 {
		t.Fatalf("expected persisted height 320, got %#v", layout.H)
	}
	viewMode := project.ViewModes[project.ActiveViewModeID]
	activeLayout := viewMode.TopLevelSections["allowed-section"]
	if activeLayout.X != layout.X || activeLayout.Y != layout.Y || activeLayout.ZIndex != layout.ZIndex {
		t.Fatalf("expected active view-mode layout %#v, got %#v", layout, activeLayout)
	}

	blockedResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_top_level_section_layout",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"topLevelSections": map[string]any{
				"blocked-section": map[string]any{"x": 1.0, "y": 2.0},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_top_level_section_layout blocked: %v", err)
	}
	if !blockedResult.IsError {
		t.Fatal("expected blocked set_top_level_section_layout call to fail")
	}
	blockedPayload := mustStructuredMap(t, blockedResult.StructuredContent)
	if blockedPayload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", blockedPayload["reason"])
	}
	if ids := mustStringList(t, blockedPayload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("unexpected blockedSectionIds %#v", ids)
	}
}

func TestServerAutoLayoutTopLevelSectionsRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "auto_layout_top_level_sections",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"margin":          10,
		},
	})
	if err != nil {
		t.Fatalf("call auto_layout_top_level_sections blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked auto_layout_top_level_sections call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerAutoLayoutTopLevelSectionsAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before auto layout: %v", err)
	}
	beforeAllowed := project.TopLevelSections["allowed-section"]
	beforeBlocked := project.TopLevelSections["blocked-section"]

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
		Name: "auto_layout_top_level_sections",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"margin":          10,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id auto_layout_top_level_sections: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id auto_layout_top_level_sections success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after auto layout: %v", err)
	}
	afterAllowed := project.TopLevelSections["allowed-section"]
	afterBlocked := project.TopLevelSections["blocked-section"]
	if afterAllowed == beforeAllowed && afterBlocked == beforeBlocked {
		t.Fatalf(
			"expected auto layout to rewrite top-level layouts, allowed before=%#v after=%#v blocked before=%#v after=%#v",
			beforeAllowed,
			afterAllowed,
			beforeBlocked,
			afterBlocked,
		)
	}
}

func TestServerAutoLayoutTopLevelSectionsRejectsInvalidMargin(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "auto_layout_top_level_sections",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"margin":          -1,
		},
	})
	if err != nil {
		t.Fatalf("call invalid-margin auto_layout_top_level_sections: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid-margin auto_layout_top_level_sections call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "Auto layout margin must be non-negative.") {
		t.Fatalf("expected invalid margin message, got %#v", payload["message"])
	}
}

func TestServerSetShowParamDisplayNamesRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_show_param_display_names",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"showParamDisplayNames": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_show_param_display_names blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_show_param_display_names call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetShowParamDisplayNamesAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before mutation")
	}

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
		Name: "set_show_param_display_names",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":       "11",
			"showParamDisplayNames": true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_show_param_display_names: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_show_param_display_names success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after mutation")
	}
}

func TestServerSetAppDefinitionRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_app_definition",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"appSpec": map[string]any{
				"root":     map[string]any{"key": "root", "type": "Stack"},
				"elements": map[string]any{},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_app_definition blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_app_definition call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerGetAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	setTestAppDefinition(t, projectRuntime, appdefinition.SetInput{
		AppSpec: map[string]any{
			"root":     map[string]any{"key": "root", "type": "Stack"},
			"elements": map[string]any{},
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
		Name: "get_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id get_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id get_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appDefinition := mustStructuredMap(t, payload["appDefinition"])
	if appDefinition["appSpecPath"] != appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %#v", appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(), appDefinition["appSpecPath"])
	}
	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(root, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", storedSpec, payload["appSpec"])
	}
}

func TestServerValidateAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	_, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
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
		Name: "validate_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"appSpec": map[string]any{
				"root": map[string]any{
					"key":  "run-btn",
					"type": "ActionButton",
					"props": map[string]any{
						"label":  "Run",
						"action": "run",
					},
				},
				"elements": map[string]any{},
			},
			"theme": map[string]any{
				"vars": map[string]any{
					"accent":       "#fff",
					"--app-accent": "#fff",
				},
			},
			"assets": []any{
				map[string]any{"href": "https://example.com/app.css"},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id validate_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id validate_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errors, ok := payload["errors"].([]any)
	if !ok {
		t.Fatalf("expected errors array, got %#v", payload["errors"])
	}
	if len(errors) != 0 {
		t.Fatalf("expected no validation errors, got %#v", errors)
	}
	warnings, ok := payload["warnings"].([]any)
	if !ok {
		t.Fatalf("expected warnings array, got %#v", payload["warnings"])
	}
	if len(warnings) < 3 {
		t.Fatalf("expected multiple warnings, got %#v", warnings)
	}
	capabilities := mustStructuredMap(t, payload["capabilities"])
	if capabilities["catalogId"] != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", appspec.DefaultCatalogID, capabilities["catalogId"])
	}
	features := mustStructuredMap(t, capabilities["features"])
	if features["responsive"] != true || features["motion"] != true {
		t.Fatalf("expected responsive and motion feature flags, got %#v", features)
	}
}

func TestServerSetAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
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
		Name: "set_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"appSpec": map[string]any{
				"root":     map[string]any{"key": "root", "type": "Stack"},
				"elements": map[string]any{},
			},
			"appSpecPath":    appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json"),
			"appSpecVersion": "v2",
			"catalogId":      appspec.DefaultCatalogID,
			"routes": []any{
				map[string]any{"path": "/", "name": "Home", "rootKey": "root"},
			},
			"theme": map[string]any{"mode": "dark"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appDefinition := mustStructuredMap(t, payload["appDefinition"])
	if appDefinition["appSpecPath"] != appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json") {
		t.Fatalf("expected normalized app spec path, got %#v", appDefinition["appSpecPath"])
	}
	if appDefinition["appSpecVersion"] != "v2" {
		t.Fatalf("expected app spec version v2, got %#v", appDefinition["appSpecVersion"])
	}

	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(root, appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json"))
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", payload["appSpec"], storedSpec)
	}
	storedAppDefinition := mustDecodeStoredAppDefinition(
		t,
		appdefinition.MustStorageForPlugin("setta-json-render-app-gen").StoredDocumentAppDefinitionRaw(projectRuntime.Snapshot().Document),
	)
	if storedAppDefinition.AppSpecPath != appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json") {
		t.Fatalf("expected runtime app definition after mutation, got %#v", storedAppDefinition)
	}
}

func TestServerUpdateAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	setTestAppDefinition(t, projectRuntime, appdefinition.SetInput{
		AppSpec: map[string]any{
			"root": map[string]any{
				"key":  "root",
				"type": "Stack",
				"props": map[string]any{
					"gap":       float64(8),
					"direction": "column",
				},
			},
			"elements": map[string]any{},
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
		Name: "update_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"patch": map[string]any{
				"root": map[string]any{
					"props": map[string]any{
						"gap": float64(12),
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id update_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id update_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appSpec := mustStructuredMap(t, payload["appSpec"])
	rootSpec := mustStructuredMap(t, appSpec["root"])
	props := mustStructuredMap(t, rootSpec["props"])
	if props["gap"] != float64(12) {
		t.Fatalf("expected merged gap 12, got %#v", props["gap"])
	}
	if props["direction"] != "column" {
		t.Fatalf("expected preserved direction column, got %#v", props["direction"])
	}

	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(root, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", payload["appSpec"], storedSpec)
	}
}

func TestServerUpdateAppDefinitionReturnsFileNotFoundWhenStoredSpecIsMissing(t *testing.T) {
	t.Parallel()

	_, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	if _, err := projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document = appdefinition.MustStorageForPlugin("setta-json-render-app-gen").WithStoredDocumentAppDefinition(document, mustMarshalStoredAppDefinition(t, appdefinition.AppDefinition{
			AppSpecPath:    appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(),
			AppSpecVersion: "v1",
			CatalogID:      appspec.DefaultCatalogID,
		}))
		return document, nil
	}); err != nil {
		t.Fatalf("seed missing app definition metadata: %v", err)
	}
	if _, err := projectRuntime.Save(context.Background()); err != nil {
		t.Fatalf("save missing app definition metadata: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"patch": map[string]any{
				"root": map[string]any{"type": "Stack"},
			},
		},
	})
	if err != nil {
		t.Fatalf("call missing-spec update_app_definition: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing-spec update_app_definition call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "file_not_found" {
		t.Fatalf("expected file_not_found code, got %#v", payload["code"])
	}
}

func TestServerCompareAndSetShowParamDisplayNamesRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "compare_and_set_show_param_display_names",
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"showParamDisplayNames": true,
			"expectedOldValue":      false,
		},
	})
	if err != nil {
		t.Fatalf("call compare_and_set_show_param_display_names blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked compare_and_set_show_param_display_names call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerCompareAndSetShowParamDisplayNamesAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before CAS show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before mutation")
	}

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
		Name: "compare_and_set_show_param_display_names",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":       "11",
			"showParamDisplayNames": true,
			"expectedOldValue":      false,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id compare_and_set_show_param_display_names: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id compare_and_set_show_param_display_names success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after CAS show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after mutation")
	}
}

func TestServerSetProjectConfigCodegenTargetsRejectsPluginTargetsBeforeScopeCheck(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_project_config_codegen_targets",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codegenTargets": []any{
				map[string]any{
					"language": "setta-fixture-backend-codegen:typescript",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_project_config_codegen_targets blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_project_config_codegen_targets call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "scope_violation" {
		t.Fatalf("expected scope_violation code, got %#v", payload["code"])
	}
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerSetProjectConfigCodegenTargetsSupportsPluginTargetsWithTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
		CodegenTargetValidator: projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		}),
		PythonCodegenSectionReconciler: projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		}),
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_project_config_codegen_targets",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"codegenTargets": []any{
				map[string]any{
					"language": "setta-fixture-backend-codegen:typescript",
					"options":  map[string]any{"className": "ScopedMCPState"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_project_config_codegen_targets: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_project_config_codegen_targets success, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["status"] != "ok" {
		t.Fatalf("expected ok status, got %#v", payload)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_project_config_codegen_targets: %v", err)
	}
	if len(project.CodegenTargets) != 1 || project.CodegenTargets[0].Language != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("expected persisted plugin codegen target, got %#v", project.CodegenTargets)
	}
}

func TestServerSetProjectConfigCodegenTargetsRejectsDuplicateLanguages(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot: t.TempDir(),
		ProjectState:  projectRuntime,
		CodegenTargetValidator: projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
			return nil
		}),
		PythonCodegenSectionReconciler: projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error {
			return nil
		}),
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_project_config_codegen_targets",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codegenTargets": []any{
				map[string]any{"language": "python"},
				map[string]any{"language": "python", "generateMetadata": true},
			},
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_project_config_codegen_targets: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_project_config_codegen_targets call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "project codegen target language must be unique") {
		t.Fatalf("expected duplicate codegen target message, got %#v", payload["message"])
	}
}

func TestServerSetGenCodePrefixRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	enableScopedTestPythonCodegenTarget(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_prefix",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodePrefix":   "import math\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_gen_code_prefix blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_gen_code_prefix call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python targetSectionIds, got %#v", ids)
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python blockedSectionIds, got %#v", ids)
	}
}

func TestServerSetGenCodePrefixAllowsUnscopedCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	enableScopedTestPythonCodegenTarget(t, projectRuntime)
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
		Name: "set_gen_code_prefix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"genCodePrefix":   "import math\n",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_gen_code_prefix: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_gen_code_prefix success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_gen_code_prefix: %v", err)
	}
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target after set_gen_code_prefix: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after set_gen_code_prefix")
	}
	if config.GenCodePrefix != "import math\n" {
		t.Fatalf("expected persisted gen code prefix, got %q", config.GenCodePrefix)
	}
}

func TestServerSetGenCodePrefixRejectsProjectsWithoutPythonCodegen(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_prefix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodePrefix":   "import math\n",
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_gen_code_prefix: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_gen_code_prefix call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "project python codegen target was not found") {
		t.Fatalf("expected missing python target message, got %#v", payload["message"])
	}
}

func TestServerSetGenCodeSuffixRespectsScopedWriteTargets(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	enableScopedTestPythonCodegenTarget(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_suffix",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodeSuffix":   "state = CustomState()\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_gen_code_suffix blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_gen_code_suffix call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python targetSectionIds, got %#v", ids)
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python blockedSectionIds, got %#v", ids)
	}
}

func TestServerSetGenCodeSuffixAllowsUnscopedCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	enableScopedTestPythonCodegenTarget(t, projectRuntime)
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
		Name: "set_gen_code_suffix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"genCodeSuffix":   "state = CustomState()\n",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_gen_code_suffix: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_gen_code_suffix success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after set_gen_code_suffix: %v", err)
	}
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target after set_gen_code_suffix: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after set_gen_code_suffix")
	}
	if config.GenCodeSuffix != "state = CustomState()\n" {
		t.Fatalf("expected persisted gen code suffix, got %q", config.GenCodeSuffix)
	}
}

func TestServerSetGenCodeSuffixRejectsProjectsWithoutPythonCodegen(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_suffix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodeSuffix":   "state = CustomState()\n",
		},
	})
	if err != nil {
		t.Fatalf("call invalid set_gen_code_suffix: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid set_gen_code_suffix call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "project python codegen target was not found") {
		t.Fatalf("expected missing python target message, got %#v", payload["message"])
	}
}

func TestServerTogglePositionLocksRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_position_locks",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionIds":      []string{"blocked-section"},
		},
	})
	if err != nil {
		t.Fatalf("call toggle_position_locks blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked toggle_position_locks call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected targetSectionIds [blocked-section], got %#v", ids)
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected blockedSectionIds [blocked-section], got %#v", ids)
	}
}

func TestServerTogglePositionLocksAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before toggle_position_locks: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 &&
		payloadBoolField(mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier), "positionAndSizeLocked") {
		t.Fatal("expected allowed-section to start unlocked")
	}
	if len(project.Sections["blocked-section"].SharedModifier) != 0 &&
		payloadBoolField(mustDecodedProjectPayload(t, project.Sections["blocked-section"].SharedModifier), "positionAndSizeLocked") {
		t.Fatal("expected blocked-section to start unlocked")
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
		"blocked-section": "16",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_position_locks",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionIds":      []string{"14", "16"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id toggle_position_locks: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id toggle_position_locks success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after toggle_position_locks: %v", err)
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier), "positionAndSizeLocked") {
		t.Fatal("expected allowed-section to be locked after mutation")
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["blocked-section"].SharedModifier), "positionAndSizeLocked") {
		t.Fatal("expected blocked-section to be locked after mutation")
	}
}

func TestServerTogglePositionLocksRejectsUnknownSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_position_locks",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionIds":      []string{"missing-section"},
		},
	})
	if err != nil {
		t.Fatalf("call invalid toggle_position_locks: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid toggle_position_locks call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "missing-section") {
		t.Fatalf("expected missing-section message, got %#v", payload["message"])
	}
}

func TestServerToggleMinimizedRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_minimized",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "blocked-section",
		},
	})
	if err != nil {
		t.Fatalf("call toggle_minimized blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked toggle_minimized call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["targetSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected targetSectionIds [blocked-section], got %#v", ids)
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected blockedSectionIds [blocked-section], got %#v", ids)
	}
}

func TestServerToggleMinimizedAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before toggle_minimized: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 &&
		payloadBoolField(mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier), "isMinimized") {
		t.Fatal("expected allowed-section to start unminimized")
	}

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_minimized",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id toggle_minimized: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id toggle_minimized success, got %#v", result.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after toggle_minimized: %v", err)
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["allowed-section"].SharedModifier), "isMinimized") {
		t.Fatal("expected allowed-section to be minimized after mutation")
	}
}

func TestServerToggleMinimizedRejectsUnknownSection(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_minimized",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "missing-section",
		},
	})
	if err != nil {
		t.Fatalf("call invalid toggle_minimized: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected invalid toggle_minimized call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if message, ok := payload["message"].(string); !ok || !strings.Contains(message, "missing-section") {
		t.Fatalf("expected missing-section message, got %#v", payload["message"])
	}
}

func TestServerToggleGroupOrientationRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestGroupSection(t, projectRuntime)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_group_orientation",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "group-section",
		},
	})
	if err != nil {
		t.Fatalf("call toggle_group_orientation blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked toggle_group_orientation call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
	if ids := mustStringList(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != "group-section" {
		t.Fatalf("expected blockedSectionIds [group-section], got %#v", ids)
	}
}

func TestServerToggleGroupOrientationAllowsUnscopedStructuralCallsAndTranslatesTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	mustAddScopedTestGroupSection(t, projectRuntime)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
		"group-section": "41",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_group_orientation",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "41",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id toggle_group_orientation: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id toggle_group_orientation success, got %#v", result.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after toggle_group_orientation: %v", err)
	}
	if !payloadBoolField(mustDecodedProjectPayload(t, project.Sections["group-section"].SharedModifier), "isHorizontalOrientation") {
		t.Fatal("expected group-section isHorizontalOrientation=true after mutation")
	}
}
