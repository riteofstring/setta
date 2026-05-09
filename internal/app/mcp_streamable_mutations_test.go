package app

import (
	"context"
	"io"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"setta/internal/config"
	"setta/internal/observability"
	"setta/internal/projectstate"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestAppIDEMCPServerSupportsScopedWriteMutationOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	setScopedMutationAgenticContext(t, session)

	assertScopedMutationDiagnosticsMute(t, app, session)
	assertScopedMutationDiagnosticsSuppression(t, app, session)

	assertScopedMutationSectionName(t, app, session)
	assertScopedMutationParamEnteredValue(t, app, session)
	assertScopedMutationTypeErrorIgnore(t, app, session)
	assertScopedMutationCodeObjName(t, app, session)
	assertScopedMutationParamNameAndValue(t, app, session)

	assertScopedMutationParamImplConfig(t, app, session)
	assertScopedMutationChangeParamImpl(t, app, session)

	assertScopedMutationCallableSelection(t, app, session)

	addedCallableParamID := addScopedMutationKwarg(t, session, "first")
	canonicalAddedCallableParamID := assertScopedMutationAddedKwarg(t, cfg, app, addedCallableParamID)
	assertScopedMutationCallableParamNameAndValue(t, app, session, addedCallableParamID, canonicalAddedCallableParamID)
	assertScopedMutationDeletedKwarg(t, app, session, addedCallableParamID, canonicalAddedCallableParamID)

	secondAddedCallableParamID := addScopedMutationKwarg(t, session, "second")
	secondCanonicalAddedCallableParamID := assertScopedMutationSecondKwarg(t, cfg, app, secondAddedCallableParamID)
	assertScopedMutationDeleteSelectedParams(t, app, session, secondAddedCallableParamID, secondCanonicalAddedCallableParamID)

	assertScopedMutationDisplayName(t, app, session)
}

func callScopedMutationTool(
	t *testing.T,
	session *sdkmcp.ClientSession,
	name string,
	arguments map[string]any,
) *sdkmcp.CallToolResult {
	t.Helper()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      name,
		Arguments: arguments,
	})
	if err != nil {
		t.Fatalf("call %s: %v", name, err)
	}
	if result.IsError {
		t.Fatalf("expected %s success, got %#v", name, result.StructuredContent)
	}
	return result
}

func setScopedMutationAgenticContext(t *testing.T, session *sdkmcp.ClientSession) {
	t.Helper()

	callScopedMutationTool(t, session, "set_agentic_context", map[string]any{
		"projectConfigId": "project-alpha",
		"chatId":          "chat-1",
		"sectionId":       "chat-section",
	})
}

func assertScopedMutationDiagnosticsMute(t *testing.T, app *App, session *sdkmcp.ClientSession) {
	t.Helper()

	callScopedMutationTool(t, session, "set_code_section_diagnostics_mute", map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "allowed-section",
		"mute":            true,
	})

	project := loadScopedMutationProject(t, app, "after scoped mute")
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after scoped mute: %v", err)
	}
	if !ignoreState.Muted {
		t.Fatalf("expected allowed-section to be muted, got %#v", ignoreState)
	}
}

func assertScopedMutationDiagnosticsSuppression(t *testing.T, app *App, session *sdkmcp.ClientSession) {
	t.Helper()

	callScopedMutationTool(t, session, "set_code_section_diagnostic_code_suppression", map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "allowed-section",
		"code":            "reportFoo",
		"suppress":        true,
	})

	project := loadScopedMutationProject(t, app, "after scoped suppression")
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after scoped suppression: %v", err)
	}
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected reportFoo suppression, got %#v", ignoreState.SuppressedCodes)
	}
}

func assertScopedMutationSectionName(t *testing.T, app *App, session *sdkmcp.ClientSession) {
	t.Helper()

	callScopedMutationTool(t, session, "set_section_name", map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "allowed-section",
		"name":            "Allowed Renamed",
	})

	project := loadScopedMutationProject(t, app, "after set_section_name")
	if got := project.Sections["allowed-section"].Name; got != "Allowed Renamed" {
		t.Fatalf("expected renamed section name, got %q", got)
	}
}

func assertScopedMutationParamEnteredValue(t *testing.T, app *App, session *sdkmcp.ClientSession) {
	t.Helper()

	callScopedMutationTool(t, session, "set_param_entered_value", map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "allowed-params-section",
		"paramInfoId":     "allowed-param",
		"value":           "updated",
	})

	project := loadScopedMutationProject(t, app, "after set_param_entered_value")
	paramPayload := resolveScopedMutationAllowedParamPayload(t, project, "after set_param_entered_value")
	if got := paramPayload["value"]; got != "updated" {
		t.Fatalf("expected updated param value, got %#v", got)
	}
}

func assertScopedMutationTypeErrorIgnore(t *testing.T, app *App, session *sdkmcp.ClientSession) {
	t.Helper()

	callScopedMutationTool(t, session, "set_type_error_ignore", map[string]any{
		"projectConfigId":  "project-alpha",
		"sectionId":        "allowed-params-section",
		"paramInfoId":      "allowed-param",
		"ignoreTypeErrors": true,
	})

	project := loadScopedMutationProject(t, app, "after set_type_error_ignore")
	typeErrorIgnoreState, err := project.TypeErrorIgnoreStateForSection("allowed-params-section")
	if err != nil {
		t.Fatalf("type error ignore state after set_type_error_ignore: %v", err)
	}
	if !typeErrorIgnoreState.Params["allowed-param"] {
		t.Fatalf("expected allowed-param type-error ignore state, got %#v", typeErrorIgnoreState)
	}
}

func assertScopedMutationCodeObjName(t *testing.T, app *App, session *sdkmcp.ClientSession) {
	t.Helper()

	callScopedMutationTool(t, session, "set_code_obj_name", map[string]any{
		"projectConfigId": "project-alpha",
		"codeObjId":       "allowed-param",
		"name":            "user-id@v2",
	})

	project := loadScopedMutationProject(t, app, "after set_code_obj_name")
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}
}

func assertScopedMutationParamNameAndValue(t *testing.T, app *App, session *sdkmcp.ClientSession) {
	t.Helper()

	callScopedMutationTool(t, session, "set_param_name_and_value", map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "allowed-params-section",
		"codeObjId":       "allowed-param",
		"name":            "user-id@v3",
		"value":           "combined",
	})

	project := loadScopedMutationProject(t, app, "after set_param_name_and_value")
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v3" {
		t.Fatalf("expected code object name user-id@v3, got %q", got)
	}
	paramPayload := resolveScopedMutationAllowedParamPayload(t, project, "after set_param_name_and_value")
	if got := paramPayload["value"]; got != "combined" {
		t.Fatalf("expected combined param value, got %#v", got)
	}
}

func assertScopedMutationParamImplConfig(t *testing.T, app *App, session *sdkmcp.ClientSession) {
	t.Helper()

	if _, err := app.ProjectStates().Main().ChangeParamImpl(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "SliderParam"); err != nil {
		t.Fatalf("prepare slider impl before update_param_impl_config: %v", err)
	}
	if _, err := app.ProjectStates().Main().SetSectionCodeObjectValue(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "75"); err != nil {
		t.Fatalf("prepare slider value before update_param_impl_config: %v", err)
	}

	result := callScopedMutationTool(t, session, "update_param_impl_config", map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "allowed-params-section",
		"paramInfoId":     "allowed-param",
		"newConfig": map[string]any{
			"max": 10,
		},
	})
	updateParamImplConfigPayload := mustStructuredMapValue(t, result.StructuredContent)
	if updateParamImplConfigPayload["status"] != "ok" {
		t.Fatalf("expected update_param_impl_config status ok, got %#v", updateParamImplConfigPayload["status"])
	}

	project := loadScopedMutationProject(t, app, "after update_param_impl_config")
	paramPayload, _, _, updatedParamImpl, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after update_param_impl_config: %v", err)
	}
	if updatedParamImpl.Type != "SliderParam" {
		t.Fatalf("expected SliderParam impl after update_param_impl_config, got %q", updatedParamImpl.Type)
	}
	if got := paramPayload["value"]; got != "10" {
		t.Fatalf("expected slider value to clamp to 10, got %#v", got)
	}
}

func assertScopedMutationChangeParamImpl(t *testing.T, app *App, session *sdkmcp.ClientSession) {
	t.Helper()

	result := callScopedMutationTool(t, session, "change_param_impl", map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "allowed-params-section",
		"paramInfoId":     "allowed-param",
		"selectedId":      "PasswordParam",
	})
	changeParamImplPayload := mustStructuredMapValue(t, result.StructuredContent)
	if changeParamImplPayload["status"] != "ok" {
		t.Fatalf("expected change_param_impl status ok, got %#v", changeParamImplPayload["status"])
	}

	project := loadScopedMutationProject(t, app, "after change_param_impl")
	paramPayload, _, _, paramImpl, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after change_param_impl: %v", err)
	}
	if paramImpl.Type != "PasswordParam" {
		t.Fatalf("expected PasswordParam impl after change_param_impl, got %q", paramImpl.Type)
	}
	if got := paramPayload["value"]; got != "" {
		t.Fatalf("expected password param value to stay blank, got %#v", got)
	}
	if got := paramPayload["hasSecret"]; got != true {
		t.Fatalf("expected hasSecret true after change_param_impl, got %#v", got)
	}
}

func assertScopedMutationCallableSelection(t *testing.T, app *App, session *sdkmcp.ClientSession) {
	t.Helper()

	result := callScopedMutationTool(t, session, "set_callable", map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "allowed-callable-section",
		"callableName":    "sorted",
		"refetchParams":   false,
	})
	callableResultPayload := mustStructuredMapValue(t, result.StructuredContent)
	if callableResultPayload["callableId"] == "" {
		t.Fatalf("expected non-empty callable id result, got %#v", callableResultPayload["callableId"])
	}

	project := loadScopedMutationProject(t, app, "after set_callable")
	_, _, callableImpl, err := project.ResolveSection("allowed-callable-section")
	if err != nil {
		t.Fatalf("resolve allowed-callable-section after set_callable: %v", err)
	}
	callableSectionPayload := mustDecodedProjectPayloadValue(t, callableImpl.Payload)
	if got := callableSectionPayload["callable"]; got != "allowed-callable-2" {
		t.Fatalf("expected persisted callable allowed-callable-2, got %#v", got)
	}
}

func addScopedMutationKwarg(t *testing.T, session *sdkmcp.ClientSession, label string) string {
	t.Helper()

	result := callScopedMutationTool(t, session, "add_kwarg", map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "allowed-callable-section",
	})
	addKwargPayload := mustStructuredMapValue(t, result.StructuredContent)
	addedCallableParamID, ok := addKwargPayload["codeObjId"].(string)
	if !ok || addedCallableParamID == "" {
		t.Fatalf("expected %s add_kwarg codeObjId string, got %#v", label, addKwargPayload["codeObjId"])
	}
	return addedCallableParamID
}

func assertScopedMutationAddedKwarg(t *testing.T, cfg config.Config, app *App, addedCallableParamID string) string {
	t.Helper()

	project := loadScopedMutationProject(t, app, "after add_kwarg")
	callableChildren := scopedMutationCallableChildren(t, project, "after add_kwarg")
	if len(callableChildren) != 2 {
		t.Fatalf("expected two callable children after add_kwarg, got %#v", callableChildren)
	}
	canonicalAddedCallableParamID := callableChildren[1]
	assertScopedMutationTemporaryMapEntry(t, cfg, canonicalAddedCallableParamID, addedCallableParamID, "")
	assertScopedMutationEmptyCallableParam(t, project, canonicalAddedCallableParamID)
	return canonicalAddedCallableParamID
}

func assertScopedMutationEmptyCallableParam(t *testing.T, project projectstate.Project, canonicalAddedCallableParamID string) {
	t.Helper()

	addedCallableParamPayload, addedCallableParam, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", canonicalAddedCallableParamID)
	if err != nil {
		t.Fatalf("resolve added callable param after add_kwarg: %v", err)
	}
	if addedCallableParam.Name != "" {
		t.Fatalf("expected added callable param name to start empty, got %q", addedCallableParam.Name)
	}
	if got := addedCallableParamPayload["value"]; got != "" {
		t.Fatalf("expected added callable param value to start empty, got %#v", got)
	}
}

func assertScopedMutationCallableParamNameAndValue(
	t *testing.T,
	app *App,
	session *sdkmcp.ClientSession,
	addedCallableParamID string,
	canonicalAddedCallableParamID string,
) {
	t.Helper()

	callScopedMutationTool(t, session, "set_param_name_and_value", map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "allowed-callable-section",
		"codeObjId":       addedCallableParamID,
		"name":            "key",
		"value":           "None",
	})

	project := loadScopedMutationProject(t, app, "after callable set_param_name_and_value")
	if got := project.CodeObjs[canonicalAddedCallableParamID].Name; got != "key" {
		t.Fatalf("expected added callable param name key, got %q", got)
	}
	addedCallableParamPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", canonicalAddedCallableParamID)
	if err != nil {
		t.Fatalf("resolve added callable param after callable rename/value: %v", err)
	}
	if got := addedCallableParamPayload["value"]; got != "None" {
		t.Fatalf("expected added callable param value None, got %#v", got)
	}
}

func assertScopedMutationDeletedKwarg(
	t *testing.T,
	app *App,
	session *sdkmcp.ClientSession,
	addedCallableParamID string,
	canonicalAddedCallableParamID string,
) {
	t.Helper()

	result := callScopedMutationTool(t, session, "delete_kwarg", map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "allowed-callable-section",
	})
	deleteKwargPayload := mustStructuredMapValue(t, result.StructuredContent)
	if got := deleteKwargPayload["codeObjId"]; got != addedCallableParamID {
		t.Fatalf("expected deleted codeObjId %q, got %#v", addedCallableParamID, got)
	}

	project := loadScopedMutationProject(t, app, "after delete_kwarg")
	assertScopedMutationCallableChildrenPruned(t, project, canonicalAddedCallableParamID, "after delete_kwarg")
}

func assertScopedMutationSecondKwarg(t *testing.T, cfg config.Config, app *App, secondAddedCallableParamID string) string {
	t.Helper()

	project := loadScopedMutationProject(t, app, "after second add_kwarg")
	callableChildren := scopedMutationCallableChildren(t, project, "after second add_kwarg")
	if len(callableChildren) != 2 {
		t.Fatalf("expected two callable children after second add_kwarg, got %#v", callableChildren)
	}
	secondCanonicalAddedCallableParamID := callableChildren[1]
	assertScopedMutationTemporaryMapEntry(t, cfg, secondCanonicalAddedCallableParamID, secondAddedCallableParamID, " after second add")
	return secondCanonicalAddedCallableParamID
}

func assertScopedMutationDeleteSelectedParams(
	t *testing.T,
	app *App,
	session *sdkmcp.ClientSession,
	secondAddedCallableParamID string,
	secondCanonicalAddedCallableParamID string,
) {
	t.Helper()

	result := callScopedMutationTool(t, session, "delete_selected_params", map[string]any{
		"projectConfigId": "project-alpha",
		"sectionId":       "allowed-callable-section",
		"paramInfoIds":    []any{secondAddedCallableParamID},
	})
	deleteSelectedParamsPayload := mustStructuredMapValue(t, result.StructuredContent)
	deletedParamIDs := mustStringSliceValue(t, deleteSelectedParamsPayload["paramInfoIds"])
	if len(deletedParamIDs) != 1 || deletedParamIDs[0] != secondAddedCallableParamID {
		t.Fatalf("expected deleted paramInfoIds [%s], got %#v", secondAddedCallableParamID, deletedParamIDs)
	}

	project := loadScopedMutationProject(t, app, "after delete_selected_params")
	assertScopedMutationCallableChildrenPruned(t, project, secondCanonicalAddedCallableParamID, "after delete_selected_params")
}

func assertScopedMutationDisplayName(t *testing.T, app *App, session *sdkmcp.ClientSession) {
	t.Helper()

	callScopedMutationTool(t, session, "set_code_obj_display_name", map[string]any{
		"projectConfigId": "project-alpha",
		"codeObjId":       "allowed-param",
		"displayName":     "Height",
	})

	project := loadScopedMutationProject(t, app, "after set_code_obj_display_name")
	if got := project.CodeObjs["allowed-param"].DisplayName; got != "Height" {
		t.Fatalf("expected display name Height, got %q", got)
	}
}

func assertScopedMutationTemporaryMapEntry(t *testing.T, cfg config.Config, canonicalID string, tempID string, suffix string) {
	t.Helper()

	temporaryMap := readAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"))
	if got := temporaryMap[canonicalID]; got != tempID {
		t.Fatalf("expected temporary map %q -> %q%s, got %q", canonicalID, tempID, suffix, got)
	}
}

func assertScopedMutationCallableChildrenPruned(t *testing.T, project projectstate.Project, deletedCanonicalParamID string, contextLabel string) {
	t.Helper()

	callableChildren := scopedMutationCallableChildren(t, project, contextLabel)
	if len(callableChildren) != 1 || callableChildren[0] != "allowed-param-existing" {
		t.Fatalf("expected callable children [allowed-param-existing] %s, got %#v", contextLabel, callableChildren)
	}
	if _, ok := project.CodeObjs[deletedCanonicalParamID]; ok {
		t.Fatalf("expected deleted callable param %q to be pruned %s, got %#v", deletedCanonicalParamID, contextLabel, project.CodeObjs[deletedCanonicalParamID])
	}
}

func scopedMutationCallableChildren(t *testing.T, project projectstate.Project, contextLabel string) []string {
	t.Helper()

	callableRootPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-2")
	if err != nil {
		t.Fatalf("resolve allowed-callable-2 %s: %v", contextLabel, err)
	}
	return mustStringSliceValue(t, callableRootPayload["children"])
}

func loadScopedMutationProject(t *testing.T, app *App, contextLabel string) projectstate.Project {
	t.Helper()

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id %s: %v", contextLabel, err)
	}
	return project
}

func resolveScopedMutationAllowedParamPayload(t *testing.T, project projectstate.Project, contextLabel string) map[string]any {
	t.Helper()

	paramPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param %s: %v", contextLabel, err)
	}
	return paramPayload
}

func connectScopedMutationStreamableSession(t *testing.T, app *App) *sdkmcp.ClientSession {
	t.Helper()

	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	t.Cleanup(func() {
		session.Close()
	})
	return session
}

func callScopedMutationToolWithMeta(
	t *testing.T,
	session *sdkmcp.ClientSession,
	name string,
	meta sdkmcp.Meta,
	arguments map[string]any,
) *sdkmcp.CallToolResult {
	t.Helper()

	result := callScopedMutationToolWithMetaAllowError(t, session, name, meta, arguments)
	if result.IsError {
		t.Fatalf("expected %s success, got %#v", name, result.StructuredContent)
	}
	return result
}

func callScopedMutationToolWithMetaAllowError(
	t *testing.T,
	session *sdkmcp.ClientSession,
	name string,
	meta sdkmcp.Meta,
	arguments map[string]any,
) *sdkmcp.CallToolResult {
	t.Helper()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name:      name,
		Meta:      meta,
		Arguments: arguments,
	})
	if err != nil {
		t.Fatalf("call %s: %v", name, err)
	}
	return result
}

func seedScopedMutationViewMode(t *testing.T, app *App) {
	t.Helper()

	if _, _, err := app.ProjectStates().Main().CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
}

func assertScopedMutationAllowedTopLevelLayout(t *testing.T, app *App, session *sdkmcp.ClientSession) {
	t.Helper()

	callScopedMutationToolWithMeta(t, session, "set_top_level_section_layout", sdkmcp.Meta{
		"projectConfigId": "project-alpha",
		"chatId":          "chat-1",
		"sectionId":       "chat-section",
	}, map[string]any{
		"projectConfigId": "project-alpha",
		"topLevelSections": map[string]any{
			"allowed-section": map[string]any{
				"x":      420.5,
				"y":      205.25,
				"zIndex": 5,
				"w":      680.0,
				"h":      340.0,
			},
		},
	})

	project := loadScopedMutationProject(t, app, "after set_top_level_section_layout")
	layout := project.TopLevelSections["allowed-section"]
	if layout.X != 420.5 || layout.Y != 205.25 || layout.ZIndex != 5 {
		t.Fatalf("unexpected persisted app layout %#v", layout)
	}
	if layout.W == nil || *layout.W != 680.0 {
		t.Fatalf("expected persisted width 680, got %#v", layout.W)
	}
	if layout.H == nil || *layout.H != 340.0 {
		t.Fatalf("expected persisted height 340, got %#v", layout.H)
	}
}

func assertScopedMutationBlockedTopLevelLayout(t *testing.T, cfg config.Config, session *sdkmcp.ClientSession) {
	t.Helper()

	result := callScopedMutationToolWithMetaAllowError(t, session, "set_top_level_section_layout", sdkmcp.Meta{
		"projectConfigId": "project-alpha",
		"chatId":          "chat-1",
		"sectionId":       "chat-section",
	}, map[string]any{
		"projectConfigId": "project-alpha",
		"topLevelSections": map[string]any{
			"blocked-section": map[string]any{
				"x": 1.0,
				"y": 2.0,
			},
		},
	})
	if !result.IsError {
		t.Fatal("expected blocked set_top_level_section_layout to fail")
	}
	payload := mustStructuredMapValue(t, result.StructuredContent)
	if payload["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", payload["reason"])
	}
	temporaryMap := readAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"))
	if ids := mustStructuredStringListValue(t, payload["blockedSectionIds"]); len(ids) != 1 || ids[0] != temporaryMap["blocked-section"] {
		t.Fatalf("expected blockedSectionIds [%q], got %#v", temporaryMap["blocked-section"], ids)
	}
}

func seedScopedMutationAutoLayoutState(
	t *testing.T,
	app *App,
	contextLabel string,
) (projectstate.TopLevelSectionLayout, projectstate.TopLevelSectionLayout) {
	t.Helper()

	seedScopedMutationViewMode(t, app)
	if _, err := app.ProjectStates().Main().SetTopLevelSectionLayout(context.Background(), "project-alpha", map[string]projectstate.TopLevelSectionLayout{
		"chat-section":    {X: 10, Y: 10, ZIndex: 0},
		"allowed-section": {X: 15, Y: 15, ZIndex: 1},
		"blocked-section": {X: 20, Y: 20, ZIndex: 2},
	}); err != nil {
		t.Fatalf("seed %s top-level layouts: %v", contextLabel, err)
	}

	project := loadScopedMutationProject(t, app, "before "+contextLabel+" auto layout")
	return project.TopLevelSections["allowed-section"], project.TopLevelSections["blocked-section"]
}

func callScopedMutationAutoLayout(t *testing.T, session *sdkmcp.ClientSession, projectConfigID string) {
	t.Helper()

	callScopedMutationToolWithMeta(t, session, "auto_layout_top_level_sections", sdkmcp.Meta{
		"projectConfigId": projectConfigID,
		"allowUnscoped":   true,
	}, map[string]any{
		"projectConfigId": projectConfigID,
		"margin":          10,
	})
}

func assertScopedMutationAutoLayoutChanged(
	t *testing.T,
	app *App,
	beforeAllowed projectstate.TopLevelSectionLayout,
	beforeBlocked projectstate.TopLevelSectionLayout,
	contextLabel string,
) {
	t.Helper()

	project := loadScopedMutationProject(t, app, "after "+contextLabel+" auto layout")
	afterAllowed := project.TopLevelSections["allowed-section"]
	afterBlocked := project.TopLevelSections["blocked-section"]
	if afterAllowed == beforeAllowed && afterBlocked == beforeBlocked {
		t.Fatalf(
			"expected %s auto layout to rewrite layouts, allowed before=%#v after=%#v blocked before=%#v after=%#v",
			contextLabel,
			beforeAllowed,
			afterAllowed,
			beforeBlocked,
			afterBlocked,
		)
	}
}

func TestAppIDEMCPServerRejectsReadOnlySetCodeOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedAppWatchCodeBoundSectionProject(t, app)
	mustSetAppCodeSectionReadOnly(t, app.ProjectStates().Main(), "project-alpha", "section-main")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "section-main",
			"code":            "def readonly(value):\n    return value\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code readonly: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected readonly set_code to fail")
	}
	payload := mustStructuredMapValue(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != `code section is read-only: "section-main"` {
		t.Fatalf("unexpected readonly set_code message %#v", payload["message"])
	}
}

func TestAppIDEMCPServerSupportsSetCodeOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	installAppWatchCodeProviderFixture(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedAppWatchCodeBoundSectionProject(t, app)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "section-main",
			"code":            "def sorted(iterable):\n    return iterable\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_code: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_code success, got %#v", result.StructuredContent)
	}

	assertAppBoundSetCodeState(t, app, "def sorted(iterable):\n    return iterable\n")
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetCodeOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	installAppWatchCodeProviderFixture(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
		"section-main":  "14",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedAppWatchCodeBoundSectionProject(t, app)

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "set_code",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"code":            "def sorted(iterable):\n    return iterable\n",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_code: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_code success, got %#v", result.StructuredContent)
	}

	assertAppBoundSetCodeState(t, app, "def sorted(iterable):\n    return iterable\n")
}

func TestAppIDEMCPServerSupportsFormatCodeOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	addRepoVenvRuffToPath(t)
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	installAppWatchCodeProviderFixture(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedAppWatchCodeBoundSectionProject(t, app)
	if _, err := app.ProjectStates().Main().SetCode(
		context.Background(),
		"project-alpha",
		"section-main",
		"def sorted( iterable ):\n return iterable\n",
	); err != nil {
		t.Fatalf("seed app set_code before format_code: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	result, err = session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "format_code",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "section-main",
		},
	})
	if err != nil {
		t.Fatalf("call format_code: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected format_code success, got %#v", result.StructuredContent)
	}

	assertAppBoundSetCodeState(t, app, "def sorted(iterable):\n    return iterable\n")
}

func TestAppIDEMCPServerSupportsTemporaryIDsForFormatCodeOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	addRepoVenvRuffToPath(t)
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	installAppWatchCodeProviderFixture(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
		"section-main":  "14",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedAppWatchCodeBoundSectionProject(t, app)
	if _, err := app.ProjectStates().Main().SetCode(
		context.Background(),
		"project-alpha",
		"section-main",
		"def sorted( iterable ):\n return iterable\n",
	); err != nil {
		t.Fatalf("seed app set_code before temp-id format_code: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Name: "format_code",
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id format_code: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id format_code success, got %#v", result.StructuredContent)
	}

	assertAppBoundSetCodeState(t, app, "def sorted(iterable):\n    return iterable\n")
}

func TestAppIDEMCPServerSupportsSetTopLevelSectionLayoutOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedScopedMutationViewMode(t, app)
	session := connectScopedMutationStreamableSession(t, app)

	assertScopedMutationAllowedTopLevelLayout(t, app, session)
	assertScopedMutationBlockedTopLevelLayout(t, cfg, session)
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetTopLevelSectionLayoutOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
		"blocked-section": "16",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	if _, _, err := app.ProjectStates().Main().CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_top_level_section_layout",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"topLevelSections": map[string]any{
				"14": map[string]any{
					"x":      515.0,
					"y":      245.0,
					"zIndex": 8,
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_top_level_section_layout: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_top_level_section_layout success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id set_top_level_section_layout: %v", err)
	}
	layout := project.TopLevelSections["allowed-section"]
	if layout.X != 515.0 || layout.Y != 245.0 || layout.ZIndex != 8 {
		t.Fatalf("expected translated app layout update, got %#v", layout)
	}
}

func TestAppIDEMCPServerSupportsAutoLayoutTopLevelSectionsOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	beforeAllowed, beforeBlocked := seedScopedMutationAutoLayoutState(t, app, "app")
	session := connectScopedMutationStreamableSession(t, app)
	callScopedMutationAutoLayout(t, session, "project-alpha")
	assertScopedMutationAutoLayoutChanged(t, app, beforeAllowed, beforeBlocked, "app")
}

func TestAppIDEMCPServerSupportsTemporaryIDsForAutoLayoutTopLevelSectionsOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	beforeAllowed, beforeBlocked := seedScopedMutationAutoLayoutState(t, app, "temp-id app")
	session := connectScopedMutationStreamableSession(t, app)
	callScopedMutationAutoLayout(t, session, "11")
	assertScopedMutationAutoLayoutChanged(t, app, beforeAllowed, beforeBlocked, "temp-id app")
}

func TestAppIDEMCPServerSupportsSetShowParamDisplayNamesOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before app show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before app mutation")
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_show_param_display_names",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"showParamDisplayNames": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_show_param_display_names: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_show_param_display_names success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after app mutation")
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetShowParamDisplayNamesOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before temp-id app show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before temp-id app mutation")
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
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

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after temp-id app mutation")
	}
}

func TestAppIDEMCPServerSupportsSetSectionTagColorOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"tagColor":        "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_tag_color: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_section_tag_color success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app set_section_tag_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["tagColor"]; got != "#123456" {
		t.Fatalf("expected allowed-section tagColor #123456 after app mutation, got %#v", got)
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetSectionTagColorOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_tag_color",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"tagColor":        "#123456",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_tag_color: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_tag_color success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app set_section_tag_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["tagColor"]; got != "#123456" {
		t.Fatalf("expected allowed-section tagColor #123456 after temp-id app mutation, got %#v", got)
	}
}

func TestAppIDEMCPServerSupportsSetSectionStyleColorOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
			"styleColor":      "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_style_color: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_section_style_color success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app set_section_style_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["styleColor"]; got != "#654321" {
		t.Fatalf("expected allowed-section styleColor #654321 after app mutation, got %#v", got)
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetSectionStyleColorOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_style_color",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
			"styleColor":      "#654321",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_style_color: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_style_color success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app set_section_style_color: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["styleColor"]; got != "#654321" {
		t.Fatalf("expected allowed-section styleColor #654321 after temp-id app mutation, got %#v", got)
	}
}

func TestAppIDEMCPServerSupportsSetSectionParamFilterOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-params-section",
			"paramFilter":     "   ",
		},
	})
	if err != nil {
		t.Fatalf("call set_section_param_filter: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_section_param_filter success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app set_section_param_filter: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-params-section"].SharedModifier)
	if got := allowedPayload["paramFilter"]; got != "   " {
		t.Fatalf("expected allowed-params-section raw paramFilter whitespace after app mutation, got %#v", got)
	}
}
