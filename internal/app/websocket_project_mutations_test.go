package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/terminals"
	"setta/internal/wsapi"

	"github.com/coder/websocket"
)

func TestAppToggleIsEditingViewModeRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:                "project-alpha",
			Name:              "Alpha",
			ActiveViewModeID:  "focus",
			IsEditingViewMode: true,
			Sections:          map[string]projectstate.Section{"section-a": {ID: "section-a", Name: "Section A"}},
			TopLevelSections:  map[string]projectstate.TopLevelSectionLayout{},
			WindowSpaces:      map[string]projectstate.WindowSpaceConfig{},
			ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
				InstancesByID: map[string]projectstate.ProjectChatWindowInstance{},
				Order:         []string{},
			},
			ViewModes: map[string]projectstate.ViewMode{
				"focus": {
					ID:                    "focus",
					Name:                  "Focus",
					SortIndex:             0,
					VisibilityBySectionID: map[string]bool{"section-a": true},
					TopLevelSections:      map[string]projectstate.TopLevelSectionLayout{},
				},
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed view mode project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteToggleIsEditingViewMode,
		strings.NewReader(`{"projectConfigId":"project-alpha","frontendOpId":"toggle-view-mode-op"}`),
	)
	if err != nil {
		t.Fatalf("new toggle view mode request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post toggle view mode: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if content.ProjectState.ProjectConfig.IsEditingViewMode {
		t.Fatal("expected websocket update to leave project outside view editing mode")
	}
	completedToggleOp := false
	for _, completedOpID := range content.CompletedOpIDs {
		if completedOpID == "toggle-view-mode-op" {
			completedToggleOp = true
			break
		}
	}
	if !completedToggleOp {
		t.Fatalf("expected completed toggle op in websocket update, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids after toggle, got %#v", content.PendingOpIDs)
	}

	project := app.ProjectStates().Main().Snapshot().Document.Projects["project-alpha"]
	if project.IsEditingViewMode {
		t.Fatal("expected persisted project state to exit view editing mode")
	}
}

func TestAppSetCallableRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetCallable,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section","callableName":"sorted","refetchParams":false,"frontendOpId":"set-callable-op"}`),
	)
	if err != nil {
		t.Fatalf("new set callable request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set callable: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "set-callable-op") {
		t.Fatalf("expected completed set-callable-op in websocket update, got %#v", content.CompletedOpIDs)
	}

	callableVariantID := content.ProjectState.ProjectConfig.SectionVariantMap["allowed-callable-section"]
	callableImplID := content.ProjectState.SectionVariants[callableVariantID].Impl
	var payload struct {
		Callable string `json:"callable"`
	}
	if err := json.Unmarshal(content.ProjectState.SectionImpls[callableImplID], &payload); err != nil {
		t.Fatalf("decode callable section impl payload: %v", err)
	}
	if payload.Callable != "allowed-callable-2" {
		t.Fatalf("expected websocket update to select allowed-callable-2, got %#v", payload)
	}
}

func TestAppChangeParamImplRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteChangeParamImpl,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","selectedId":"SliderParam","frontendOpId":"change-param-impl-op"}`),
	)
	if err != nil {
		t.Fatalf("new change param impl request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post change param impl: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "change-param-impl-op") {
		t.Fatalf("expected completed change-param-impl-op in websocket update, got %#v", content.CompletedOpIDs)
	}

	paramVariant := content.ProjectState.CodeObjVariants["allowed-param-variant"]
	if !containsAppString(paramVariant.NonPresetImpls, paramVariant.Impl) {
		t.Fatalf(
			"expected current impl %q to be selectable in nonPresetImpls, got %#v",
			paramVariant.Impl,
			paramVariant.NonPresetImpls,
		)
	}
	var payload struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(content.ProjectState.CodeObjImpls[paramVariant.Impl], &payload); err != nil {
		t.Fatalf("decode changed param impl payload: %v", err)
	}
	if payload.Type != "SliderParam" {
		t.Fatalf("expected websocket update to switch param impl to SliderParam, got %#v", payload)
	}
}

func TestAppSetTextBlockTextRouteBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	project, textSectionID := websocketTextBlockTestProject(t)
	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = project
		return document, nil
	}); err != nil {
		t.Fatalf("seed text block project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetTextBlockText,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"`+textSectionID+`","text":"hello from websocket text block","frontendOpId":"set-text-block-op"}`),
	)
	if err != nil {
		t.Fatalf("new set text block text request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set text block text: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if !containsAppString(content.CompletedOpIDs, "set-text-block-op") {
		t.Fatalf("expected completed set-text-block-op in websocket update, got %#v", content.CompletedOpIDs)
	}

	var payload struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(content.ProjectState.Sections[textSectionID].SharedModifier, &payload); err != nil {
		t.Fatalf("decode text block shared modifier payload: %v", err)
	}
	if payload.Text != "hello from websocket text block" {
		t.Fatalf("expected websocket update to include edited text, got %#v", payload)
	}
}

// LSP-driven callable auto-refetches are backend-owned mutations, so the app
// must explicitly rebroadcast the updated project graph back to connected IDE
// frontends when missing imports later become valid.
func TestAppCallableAutoRefetchBroadcastsProjectStateUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = appCallableAutoRefetchProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed callable auto-refetch project state: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	resolver := &appTestCallableSignatureResolver{
		ok: true,
		result: projectstate.CallableSignatureResult{
			Status: projectstate.SignatureHelpStatusMatched,
			Params: []projectstate.CallableParamProposal{
				{
					Name:           "x",
					TypeAnnotation: "SupportsFloat",
					PassingStyle:   "POSITIONAL_ONLY",
				},
			},
		},
	}
	if err := refetchCallableParamsAndBroadcast(
		context.Background(),
		app.ProjectStates().Main(),
		app.websocketHub,
		"project-alpha",
		[]string{"callable-section"},
		resolver,
	); err != nil {
		t.Fatalf("refetch callable params and broadcast: %v", err)
	}
	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectState, 4)
	var content realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project state update content: %v", err)
	}
	if content.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha state update, got %q", content.ProjectState.ProjectConfig.ID)
	}
	if len(content.CompletedOpIDs) != 0 {
		t.Fatalf("expected no completed op ids for auto-refetch broadcast, got %#v", content.CompletedOpIDs)
	}
	if len(content.PendingOpIDs) != 0 {
		t.Fatalf("expected no pending op ids for auto-refetch broadcast, got %#v", content.PendingOpIDs)
	}

	callableVariantID := content.ProjectState.ProjectConfig.SectionVariantMap["callable-section"]
	callableSectionImplID := content.ProjectState.SectionVariants[callableVariantID].Impl
	var sectionPayload struct {
		Callable          string            `json:"callable"`
		CodeObjVariantMap map[string]string `json:"codeObjVariantMap"`
	}
	if err := json.Unmarshal(content.ProjectState.SectionImpls[callableSectionImplID], &sectionPayload); err != nil {
		t.Fatalf("decode callable section impl payload: %v", err)
	}
	if sectionPayload.Callable == "" {
		t.Fatalf("expected callable section to remain bound after auto-refetch, got %#v", sectionPayload)
	}
	if got := content.ProjectState.CodeObjs[sectionPayload.Callable].Name; got != "math.sqrt" {
		t.Fatalf("expected auto-refetched callable name math.sqrt, got %q", got)
	}
	if _, ok := sectionPayload.CodeObjVariantMap[sectionPayload.Callable]; !ok {
		t.Fatalf("expected callable variant mapping for %q, got %#v", sectionPayload.Callable, sectionPayload.CodeObjVariantMap)
	}

	shownParams, ok := content.ProjectState.ShownParamIDs[callableVariantID]
	if !ok {
		t.Fatalf("expected shown params for callable variant %q, got %#v", callableVariantID, content.ProjectState.ShownParamIDs)
	}
	if len(shownParams.Pinned.TopLevelParamIDs) != 0 {
		t.Fatalf("expected no pinned auto-refetched params, got %#v", shownParams.Pinned.TopLevelParamIDs)
	}
	if len(shownParams.Unpinned.TopLevelParamIDs) != 1 {
		t.Fatalf("expected one unpinned auto-refetched param, got %#v", shownParams.Unpinned.TopLevelParamIDs)
	}

	paramID := shownParams.Unpinned.TopLevelParamIDs[0]
	if got := content.ProjectState.CodeObjs[paramID].Name; got != "x" {
		t.Fatalf("expected auto-refetched param name x, got %q", got)
	}
	paramVariantID := content.ProjectState.CodeObjs[paramID].DefaultVariant
	if paramVariantID == nil {
		t.Fatalf("expected auto-refetched param %q to have a default variant", paramID)
	}
	paramImplID := content.ProjectState.CodeObjVariants[*paramVariantID].Impl
	var paramPayload struct {
		TypeAnnotation string `json:"typeAnnotation"`
	}
	if err := json.Unmarshal(content.ProjectState.CodeObjImpls[paramImplID], &paramPayload); err != nil {
		t.Fatalf("decode auto-refetched param impl payload: %v", err)
	}
	if paramPayload.TypeAnnotation != "SupportsFloat" {
		t.Fatalf("expected auto-refetched param type annotation SupportsFloat, got %q", paramPayload.TypeAnnotation)
	}
}

func TestAppSetParamEnteredValueRouteBroadcastsProjectParamUpdate(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)
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

	authCookie := newAppTestAuthCookie(t, app)
	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+wsapi.RouteFrontend, &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{authCookie.Name + "=" + authCookie.Value},
		},
	})
	if err != nil {
		t.Fatalf("dial frontend websocket route: %v", err)
	}
	defer conn.CloseNow()

	_ = readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeFrontendIdentity, 2)

	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteSetParamEnteredValue,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","value":"99","frontendOpId":"set-param-op"}`),
	)
	if err != nil {
		t.Fatalf("new set param entered value request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post set param entered value: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	envelope := readAppRouteEnvelopeUntilType(t, conn, realtime.MessageTypeUpdateFrontendProjectParam, 4)
	var content realtime.ProjectParamUpdateContent
	if err := json.Unmarshal(envelope.Content, &content); err != nil {
		t.Fatalf("decode project param update content: %v", err)
	}
	if content.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha param update, got %q", content.ProjectConfigID)
	}
	if content.SectionID != "allowed-params-section" {
		t.Fatalf("expected allowed-params-section update, got %q", content.SectionID)
	}
	if content.ParamInfoID != "allowed-param" {
		t.Fatalf("expected allowed-param update, got %q", content.ParamInfoID)
	}
	if !containsAppString(content.CompletedOpIDs, "set-param-op") {
		t.Fatalf("expected completed set-param-op in websocket update, got %#v", content.CompletedOpIDs)
	}

	if content.CodeObj.ID != "allowed-param" {
		t.Fatalf("expected code object allowed-param, got %#v", content.CodeObj)
	}
	if content.CodeObjVariant.ID != "allowed-param-variant" {
		t.Fatalf("expected code object variant allowed-param-variant, got %#v", content.CodeObjVariant)
	}
	var payload struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(content.CodeObjImpl, &payload); err != nil {
		t.Fatalf("decode param impl payload: %v", err)
	}
	if payload.Value != "99" {
		t.Fatalf("expected websocket update to include updated param value, got %#v", payload)
	}
}

func websocketIncrementerTestProject(t *testing.T) (projectstate.Project, string) {
	t.Helper()

	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	project := projectstate.Project{
		ID:                   "project-alpha",
		Name:                 "Alpha",
		ProjectChatWindowing: &defaultWindowing,
	}
	result, err := project.CreateTopLevelSection(
		projectstate.CreateTopLevelSectionInput{ImplType: "ListRoot"},
		projectstate.DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create list root project fixture: %v", err)
	}
	return project, result.SectionID
}

func websocketMoveSectionsTestProject(t *testing.T) (projectstate.Project, string, string) {
	t.Helper()

	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	project := projectstate.Project{
		ID:                   "project-alpha",
		Name:                 "Alpha",
		ProjectChatWindowing: &defaultWindowing,
	}
	dictName := "Settings"
	listName := "Items"

	dictResult, err := project.CreateTopLevelSection(
		projectstate.CreateTopLevelSectionInput{
			ImplType: "Dict",
			Name:     &dictName,
			Position: &projectstate.Position{X: 240, Y: 80},
		},
		projectstate.DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create dict project fixture: %v", err)
	}

	listResult, err := project.CreateTopLevelSection(
		projectstate.CreateTopLevelSectionInput{
			ImplType: "ListRoot",
			Name:     &listName,
			Position: &projectstate.Position{X: 40, Y: 80},
		},
		projectstate.DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create list project fixture: %v", err)
	}

	return project, dictResult.SectionID, listResult.SectionID
}

func websocketTextBlockTestProject(t *testing.T) (projectstate.Project, string) {
	t.Helper()

	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	project := projectstate.Project{
		ID:                   "project-alpha",
		Name:                 "Alpha",
		ProjectChatWindowing: &defaultWindowing,
	}
	textName := "Notes"
	result, err := project.CreateTopLevelSection(
		projectstate.CreateTopLevelSectionInput{
			ImplType: "TextBlock",
			Name:     &textName,
			Position: &projectstate.Position{X: 40, Y: 80},
		},
		projectstate.DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create text block project fixture: %v", err)
	}

	return project, result.SectionID
}

func TestAppServesTerminalWebsocketRoute(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

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

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(strings.Replace(wsapi.RouteTerminalBySection, "{projectID}", "project-a", 1), "{sectionID}", "section-a", 1), &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial terminal websocket route: %v", err)
	}
	defer conn.CloseNow()

	if frame := readAppRawFrame(t, conn); frame != wsapi.TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", frame)
	}
}

func websocketStateMachineTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"gate-section",
		},
		SectionVariantMap: map[string]string{
			"gate-section": "gate-variant",
		},
		Sections: map[string]projectstate.Section{
			"gate-section": {
				ID:               "gate-section",
				Name:             "Gate Section",
				VariantIDs:       []string{"gate-variant"},
				DefaultVariantID: "gate-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"gate-variant": {
				ID:     "gate-variant",
				ImplID: "gate-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"gate-impl": {
				ID:   "gate-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: websocketStateMachineTestRawJSON(t, map[string]any{
					"id":             "gate-impl",
					"type":           "StateMachineGate",
					"machineGroupId": "workflow-a",
					"label":          "Gate",
					"gateType":       string(projectstate.StateMachineGateTypeAND),
					"ui": map[string]any{
						"showDetails": false,
					},
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize workflow test project: %v", err)
	}
	return project
}

func websocketStateMachineTestRawJSON(t *testing.T, payload map[string]any) projectstate.RawJSON {
	t.Helper()

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal workflow test payload: %v", err)
	}
	return projectstate.RawJSON(raw)
}

func appNameValidationTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				ActiveViewModeID: "focus",
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"section-a": {X: 0, Y: 0},
				},
				ViewModes: map[string]projectstate.ViewMode{
					"focus": {
						ID:   "focus",
						Name: "Focus",
						TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
							"section-a": {X: 0, Y: 0},
						},
						VisibilityBySectionID: map[string]bool{
							"section-a": true,
						},
					},
				},
				SectionVariantMap: map[string]string{
					"section-a": "section-a-variant",
				},
				Sections: map[string]projectstate.Section{
					"section-a": {
						ID:               "section-a",
						Name:             "Section A",
						VariantIDs:       []string{"section-a-variant"},
						DefaultVariantID: "section-a-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"section-a-variant": {
						ID:     "section-a-variant",
						ImplID: "section-a-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"section-a-impl": {
						ID:      "section-a-impl",
						Kind:    projectstate.SectionKind("frontend"),
						Payload: websocketStateMachineTestRawJSON(t, map[string]any{"id": "section-a-impl", "type": "TextBlock"}),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize app name validation test document: %v", err)
	}

	project := document.Projects["project-alpha"]
	project.Name = "bad/name"
	section := project.Sections["section-a"]
	section.Name = "bad/name"
	project.Sections[section.ID] = section
	viewMode := project.ViewModes[project.ActiveViewModeID]
	viewMode.Name = "bad/name"
	project.ViewModes[viewMode.ID] = viewMode
	document.Projects[project.ID] = project
	return document
}

func decodeAppNameValidationErrors(t *testing.T, raw json.RawMessage) projectstate.NameValidationErrors {
	t.Helper()

	var payload projectstate.NameValidationErrors
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode name validation errors payload: %v", err)
	}
	return payload
}

func assertAppNameValidationPayloadOmitsViewModeErrors(t *testing.T, raw json.RawMessage) {
	t.Helper()

	var payload map[string]json.RawMessage
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode raw name validation payload: %v", err)
	}
	if _, ok := payload["viewModeErrors"]; ok {
		t.Fatalf("expected name validation payload to omit viewModeErrors, got %s", string(raw))
	}
}

func TestAppServesTerminalWebsocketReconnectAndReplaysBufferedHistory(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	sessionID := terminals.BuildTerminalID("section-a", "")
	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open app terminal: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + strings.Replace(strings.Replace(wsapi.RouteTerminalBySection, "{projectID}", "project-a", 1), "{sectionID}", "section-a", 1)
	headers := http.Header{
		"Cookie": []string{cookieName + "=" + token},
	}

	first, _, err := websocket.Dial(context.Background(), wsURL, &websocket.DialOptions{
		HTTPHeader: headers,
	})
	if err != nil {
		t.Fatalf("dial first terminal websocket route: %v", err)
	}

	if frame := readAppRawFrame(t, first); frame != wsapi.TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", frame)
	}

	if err := first.Write(context.Background(), websocket.MessageText, []byte("first app line\n")); err != nil {
		t.Fatalf("write first terminal input: %v", err)
	}
	if output := readAppRawFrameUntilContains(t, first, "first app line", 4); !strings.Contains(output, "first app line") {
		t.Fatalf("expected terminal output to include first app line, got %q", output)
	}
	if err := first.Close(websocket.StatusNormalClosure, ""); err != nil {
		t.Fatalf("close first terminal websocket: %v", err)
	}

	if err := app.Terminals().Write(sessionID, []byte("after disconnect\n")); err != nil {
		t.Fatalf("write buffered app terminal output after disconnect: %v", err)
	}
	waitForCondition(t, func() bool {
		history, err := app.Terminals().History(sessionID)
		if err != nil {
			return false
		}
		return strings.Contains(history, "after disconnect")
	})

	second, _, err := websocket.Dial(context.Background(), wsURL, &websocket.DialOptions{
		HTTPHeader: headers,
	})
	if err != nil {
		t.Fatalf("dial second terminal websocket route: %v", err)
	}
	defer second.CloseNow()

	if frame := readAppRawFrame(t, second); frame != wsapi.TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker on reconnect, got %q", frame)
	}
	replayedHistory := readAppRawFrame(t, second)
	if !strings.Contains(replayedHistory, "first app line") || !strings.Contains(replayedHistory, "after disconnect") {
		t.Fatalf("expected reattached app terminal history to include buffered output, got %q", replayedHistory)
	}
}

func TestAppServesTerminalWebsocketResizeUpdatesStoredSessionDimensions(t *testing.T) {
	skipIfAppTerminalPTYUnsupported(t)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	sessionID := terminals.BuildTerminalID("section-a", "")
	if _, _, err := app.Terminals().Open(terminals.OpenOptions{
		ID:         sessionID,
		ProjectID:  "project-a",
		AllowInput: true,
		Command:    quietAppTestCatCommand(t),
	}); err != nil {
		t.Fatalf("open app terminal: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	token, _, err := app.Auth().MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	cookieName, err := app.Auth().CookieName("abc123")
	if err != nil {
		t.Fatalf("cookie name: %v", err)
	}

	conn, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(server.URL, "http")+strings.Replace(strings.Replace(wsapi.RouteTerminalBySection, "{projectID}", "project-a", 1), "{sectionID}", "section-a", 1), &websocket.DialOptions{
		HTTPHeader: http.Header{
			"Cookie": []string{cookieName + "=" + token},
		},
	})
	if err != nil {
		t.Fatalf("dial terminal websocket route: %v", err)
	}
	defer conn.CloseNow()

	if frame := readAppRawFrame(t, conn); frame != wsapi.TerminalReadyMessage {
		t.Fatalf("expected terminal ready marker, got %q", frame)
	}

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"terminalResize","rows":31,"cols":97}`)); err != nil {
		t.Fatalf("write app terminal resize message: %v", err)
	}

	waitForCondition(t, func() bool {
		info, ok := app.Terminals().Session(sessionID)
		return ok && info.Rows == 31 && info.Columns == 97
	})

	info, ok := app.Terminals().Session(sessionID)
	if !ok {
		t.Fatal("expected app terminal session to exist after resize")
	}
	if info.Rows != 31 || info.Columns != 97 {
		t.Fatalf("expected stored app terminal size 97x31, got %dx%d", info.Columns, info.Rows)
	}
}

func prepareCurrentSession(t *testing.T, cfg config.Config) {
	t.Helper()

	sessionID := "abc123"
	t.Setenv("SETTA_SESSION_ID", sessionID)

	sessionDir := filepath.Join(cfg.Paths.RuntimeRoot, "sessions", sessionID)
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}

	secretPath := filepath.Join(sessionDir, "secret")
	if err := os.WriteFile(secretPath, []byte("test-secret"), 0o600); err != nil {
		t.Fatalf("write session secret: %v", err)
	}

	metadata := auth.SessionMetadata{
		ID:                     sessionID,
		WorkspacePath:          cfg.Paths.WorkspaceRoot,
		WorkspacePathCanonical: cfg.Paths.WorkspaceRoot,
		Host:                   "127.0.0.1",
		Port:                   61234,
		PID:                    os.Getpid(),
		StartedAt:              time.Unix(1_700_000_000, 0).UTC(),
		SecretPath:             secretPath,
		RuntimeRoot:            cfg.Paths.RuntimeRoot,
		ServerMode:             string(cfg.Server.Mode),
	}
	metadataBytes, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		t.Fatalf("marshal session metadata: %v", err)
	}
	metadataBytes = append(metadataBytes, '\n')
	if err := os.WriteFile(filepath.Join(sessionDir, "session.json"), metadataBytes, 0o644); err != nil {
		t.Fatalf("write session metadata: %v", err)
	}
}

func readAppRouteEnvelope(t *testing.T, conn *websocket.Conn) appRouteEnvelope {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read app websocket message: %v", err)
	}

	var envelope appRouteEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatalf("decode app websocket message: %v", err)
	}
	return envelope
}

func artifactWatcherTestProject(t *testing.T, imagePath string) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"image-section": "image-variant",
		},
		Sections: map[string]projectstate.Section{
			"image-section": {
				ID:               "image-section",
				Name:             "Image",
				VariantIDs:       []string{"image-variant"},
				DefaultVariantID: "image-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"image-variant": {
				ID:     "image-variant",
				ImplID: "image-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"image-impl": {
				ID:   "image-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalAppWorkflowObject(t, map[string]any{
					"id":        "image-impl",
					"type":      "Image",
					"imagePath": imagePath,
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize artifact watcher test project: %v", err)
	}
	return project
}

func readAppBinaryEnvelope(t *testing.T, conn *websocket.Conn) (appRouteEnvelope, []byte) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	messageType, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read app websocket frame: %v", err)
	}
	if messageType != websocket.MessageBinary {
		t.Fatalf("expected binary websocket frame, got %d", messageType)
	}

	header, binaryPayload, err := realtime.DecodeBinaryFrame(payload)
	if err != nil {
		t.Fatalf("decode app binary frame: %v", err)
	}

	var envelope appRouteEnvelope
	if err := json.Unmarshal(header, &envelope); err != nil {
		t.Fatalf("decode app binary envelope: %v", err)
	}
	return envelope, binaryPayload
}

func readAppRouteEnvelopeUntilType(t *testing.T, conn *websocket.Conn, messageType realtime.ListenerMessageType, maxReads int) appRouteEnvelope {
	t.Helper()

	for range maxReads {
		envelope := readAppRouteEnvelope(t, conn)
		if envelope.MessageType == messageType {
			return envelope
		}
	}
	t.Fatalf("did not receive app websocket message type %q within %d reads", messageType, maxReads)
	return appRouteEnvelope{}
}

func readAppRouteAgentRunUpdate(
	t *testing.T,
	conn *websocket.Conn,
	runID string,
	status agentruns.RunStatus,
	maxReads int,
) agentruns.Run {
	t.Helper()

	for range maxReads {
		envelope := readAppRouteEnvelope(t, conn)
		if envelope.MessageType != realtime.MessageTypeAgentRunUpdated {
			continue
		}

		var run agentruns.Run
		if err := json.Unmarshal(envelope.Content, &run); err != nil {
			t.Fatalf("decode agent run update payload: %v", err)
		}
		if run.ID != runID || run.Status != status {
			continue
		}
		return run
	}

	t.Fatalf("did not receive workflow run update %q with status %q within %d reads", runID, status, maxReads)
	return agentruns.Run{}
}

func assertNoAppRouteEnvelopeOfType(t *testing.T, conn *websocket.Conn, messageType realtime.ListenerMessageType, timeout time.Duration) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), remaining)
		_, payload, err := conn.Read(ctx)
		cancel()
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) {
				return
			}
			t.Fatalf("read app websocket message: %v", err)
		}

		var envelope appRouteEnvelope
		if err := json.Unmarshal(payload, &envelope); err != nil {
			t.Fatalf("decode app websocket message: %v", err)
		}
		if envelope.MessageType == messageType {
			t.Fatalf("did not expect app websocket message type %q within %s", messageType, timeout)
		}
	}
}

func readAppRawFrame(t *testing.T, conn *websocket.Conn) string {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read app websocket frame: %v", err)
	}
	return string(payload)
}

func readAppRawFrameUntilContains(t *testing.T, conn *websocket.Conn, needle string, maxReads int) string {
	t.Helper()

	buffer := strings.Builder{}
	for range maxReads {
		frame := readAppRawFrame(t, conn)
		buffer.WriteString(frame)
		if strings.Contains(buffer.String(), needle) {
			return buffer.String()
		}
	}

	t.Fatalf("did not receive app terminal output containing %q within %d reads; collected output: %q", needle, maxReads, buffer.String())
	return ""
}

func waitForCondition(t *testing.T, check func() bool) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition did not become true before timeout")
}

func assertAppLSPDiagnosticsPayload(t *testing.T, payload projectstate.LSPDiagnosticsPayload) {
	t.Helper()

	if payload.ProjectID != "project-alpha" {
		t.Fatalf("unexpected diagnostics project id %q", payload.ProjectID)
	}
	sectionDiagnostics := payload.CodeSections["runner"]
	if len(sectionDiagnostics) != 1 {
		t.Fatalf("expected one runner diagnostic, got %#v", payload.CodeSections)
	}
	if sectionDiagnostics[0].Message != "Fixture TypeScript diagnostic" {
		t.Fatalf("unexpected diagnostic message %q", sectionDiagnostics[0].Message)
	}
	if sectionDiagnostics[0].Code != "fixture-ts" {
		t.Fatalf("unexpected diagnostic code %#v", sectionDiagnostics[0].Code)
	}
}

func canonicalAppJSONValue(t *testing.T, value any) string {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json value %#v: %v", value, err)
	}
	var decoded any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("decode json %q: %v", string(encoded), err)
	}
	normalized, err := json.Marshal(decoded)
	if err != nil {
		t.Fatalf("re-encode json %q: %v", string(encoded), err)
	}
	return string(normalized)
}

func appCallableAutoRefetchProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		TopLevelSectionIDs: []string{
			"callable-section",
		},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"callable-section": {X: 40, Y: 40},
		},
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant-1",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Call Section",
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
						"callable-1":"callable-variant-a"
					}
				}`),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-1": {
				ID:               "callable-1",
				Name:             "math.sqrt",
				VariantIDs:       []string{"callable-variant-a"},
				DefaultVariantID: "callable-variant-a",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-variant-a": {
				ID:     "callable-variant-a",
				ImplID: "callable-impl-a",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-impl-a": {
				ID:      "callable-impl-a",
				Type:    "CodeCallable",
				Payload: projectstate.RawJSON(`{"id":"callable-impl-a","type":"CodeCallable","children":[]}`),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize callable auto-refetch project: %v", err)
	}
	return project
}

func websocketSetSectionVariantCodegenProject(t *testing.T) projectstate.Project {
	t.Helper()

	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
		TopLevelSectionIDs: []string{
			"callable-section",
		},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"callable-section": {X: 40, Y: 40},
		},
		WindowSpaces: map[string]projectstate.WindowSpaceConfig{},
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant-1",
		},
		ProjectChatWindowing: &defaultWindowing,
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable Section",
				VariantIDs:       []string{"callable-variant-1", "callable-variant-2"},
				DefaultVariantID: "callable-variant-1",
				UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant-1": {
				ID:     "callable-variant-1",
				ImplID: "callable-impl-1",
			},
			"callable-variant-2": {
				ID:     "callable-variant-2",
				ImplID: "callable-impl-2",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl-1": {
				ID:   "callable-impl-1",
				Kind: projectstate.SectionKind("callable"),
				Payload: projectstate.RawJSON(`{
					"id":"callable-impl-1",
					"type":"Callable",
					"callable":null,
					"codeObjVariantMap":{}
				}`),
			},
			"callable-impl-2": {
				ID:   "callable-impl-2",
				Kind: projectstate.SectionKind("callable"),
				Payload: projectstate.RawJSON(`{
					"id":"callable-impl-2",
					"type":"Callable",
					"callable":"callable-2",
					"codeObjVariantMap":{
						"callable-2":"callable-code-variant-2"
					}
				}`),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-2": {
				ID:               "callable-2",
				Name:             "sorted",
				VariantIDs:       []string{"callable-code-variant-2"},
				DefaultVariantID: "callable-code-variant-2",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-code-variant-2": {
				ID:     "callable-code-variant-2",
				ImplID: "callable-code-impl-2",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-code-impl-2": {
				ID:      "callable-code-impl-2",
				Type:    "CodeCallable",
				Payload: projectstate.RawJSON(`{"id":"callable-code-impl-2","type":"CodeCallable","children":[]}`),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section variant codegen project: %v", err)
	}
	return project
}
