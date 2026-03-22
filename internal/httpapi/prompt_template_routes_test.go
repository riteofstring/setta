package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/prompttemplates"
	"setta/internal/realtime"
)

func TestRegisterPromptTemplateRoutesListsTemplates(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	if err := store.Save(prompttemplates.Template{
		ID:          "template-1",
		Name:        "Greeting",
		Description: "Greeting template",
		Template:    "Hello {{ name }}",
		InputSchema: map[string]any{"name": map[string]any{"type": "string"}},
		Metadata:    map[string]any{"category": "greeting"},
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}

	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetPromptTemplates, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var templates []prompttemplates.Template
	if err := json.Unmarshal(response.Body.Bytes(), &templates); err != nil {
		t.Fatalf("decode templates: %v", err)
	}
	if len(templates) != 1 {
		t.Fatalf("expected one template, got %#v", templates)
	}
	if templates[0].Format != prompttemplates.FormatJinja {
		t.Fatalf("expected default format, got %#v", templates[0])
	}
	if templates[0].Metadata["category"] != "greeting" {
		t.Fatalf("expected metadata, got %#v", templates[0])
	}
}

func TestRegisterPromptTemplateRoutesReturnsEmptyList(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetPromptTemplates, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var templates []prompttemplates.Template
	if err := json.Unmarshal(response.Body.Bytes(), &templates); err != nil {
		t.Fatalf("decode templates: %v", err)
	}
	if len(templates) != 0 {
		t.Fatalf("expected empty templates, got %#v", templates)
	}
}

func TestRegisterPromptTemplateRoutesGetsTemplate(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	if err := store.Save(prompttemplates.Template{
		ID:       "template-1",
		Name:     "Greeting",
		Template: "Hello {{ name }}",
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}
	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)

	response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, RouteGetPromptTemplate, map[string]any{
		"templateId": "template-1",
	})

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var template prompttemplates.Template
	if err := json.Unmarshal(response.Body.Bytes(), &template); err != nil {
		t.Fatalf("decode template: %v", err)
	}
	if template.ID != "template-1" || template.Name != "Greeting" {
		t.Fatalf("unexpected template %#v", template)
	}
}

func TestRegisterPromptTemplateRoutesAllowDeploymentReadsWhenLLMAccessEnabled(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	if err := store.Save(prompttemplates.Template{
		ID:       "template-1",
		Name:     "Greeting",
		Template: "Hello {{ name }}",
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}
	testCases := []struct {
		name string
		mode config.Mode
		path string
		body string
	}{
		{name: "share list", mode: config.ModeShare, path: RouteGetPromptTemplates},
		{name: "share get", mode: config.ModeShare, path: RouteGetPromptTemplate, body: `{"templateId":"template-1"}`},
		{name: "app list", mode: config.ModeApp, path: RouteGetPromptTemplates},
		{name: "app get", mode: config.ModeApp, path: RouteGetPromptTemplate, body: `{"templateId":"template-1"}`},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:   testCase.mode,
				Policy: map[string]any{"allowLLM": true},
			})
			handler := newPromptTemplateRouteTestHandler(t, testCase.mode, store, deploymentRuntime)

			method := http.MethodGet
			var body io.Reader
			if testCase.body != "" {
				method = http.MethodPost
				body = strings.NewReader(testCase.body)
			}
			request := httptest.NewRequest(method, "/api"+testCase.path, body)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusOK {
				t.Fatalf("expected 200 for %s, got %d with body %q", testCase.path, response.Code, response.Body.String())
			}
			if testCase.path == RouteGetPromptTemplates {
				var templates []prompttemplates.Template
				if err := json.Unmarshal(response.Body.Bytes(), &templates); err != nil {
					t.Fatalf("decode templates: %v", err)
				}
				if len(templates) != 1 || templates[0].ID != "template-1" {
					t.Fatalf("unexpected templates payload %#v", templates)
				}
				return
			}
			var template prompttemplates.Template
			if err := json.Unmarshal(response.Body.Bytes(), &template); err != nil {
				t.Fatalf("decode template: %v", err)
			}
			if template.ID != "template-1" || template.Name != "Greeting" {
				t.Fatalf("unexpected template payload %#v", template)
			}
		})
	}
}

func TestRegisterPromptTemplateRoutesBlockDeploymentReadsWhenLLMAccessDisabled(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	testCases := []struct {
		name string
		mode config.Mode
		path string
		body string
	}{
		{name: "share list", mode: config.ModeShare, path: RouteGetPromptTemplates},
		{name: "share get", mode: config.ModeShare, path: RouteGetPromptTemplate, body: `{"templateId":"template-1"}`},
		{name: "app list", mode: config.ModeApp, path: RouteGetPromptTemplates},
		{name: "app get", mode: config.ModeApp, path: RouteGetPromptTemplate, body: `{"templateId":"template-1"}`},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: testCase.mode,
			})
			handler := newPromptTemplateRouteTestHandler(t, testCase.mode, store, deploymentRuntime)

			method := http.MethodGet
			var body io.Reader
			if testCase.body != "" {
				method = http.MethodPost
				body = strings.NewReader(testCase.body)
			}
			request := httptest.NewRequest(method, "/api"+testCase.path, body)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403 for %s, got %d with body %q", testCase.path, response.Code, response.Body.String())
			}
			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error payload: %v", err)
			}
			if payload.Error.Code != "llm_access_forbidden" {
				t.Fatalf("expected llm_access_forbidden, got %#v", payload)
			}
		})
	}
}

func TestRegisterPromptTemplateRoutesCreatesTemplate(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)

	// Create should generate an id and persist normalized defaults through the store.
	response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, RouteCreatePromptTemplate, map[string]any{
		"name":     "Greeting",
		"template": "Hello {{ name }}",
	})

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var template prompttemplates.Template
	if err := json.Unmarshal(response.Body.Bytes(), &template); err != nil {
		t.Fatalf("decode created template: %v", err)
	}
	if strings.TrimSpace(template.ID) == "" {
		t.Fatalf("expected created template id, got %#v", template)
	}
	if template.Format != prompttemplates.FormatJinja {
		t.Fatalf("expected default format, got %#v", template)
	}
	if template.Description != "" {
		t.Fatalf("expected empty description default, got %#v", template)
	}
	if template.InputSchema == nil || len(template.InputSchema) != 0 {
		t.Fatalf("expected empty inputSchema default, got %#v", template)
	}
	if template.Metadata == nil || len(template.Metadata) != 0 {
		t.Fatalf("expected empty metadata default, got %#v", template)
	}

	saved, err := store.Get(template.ID)
	if err != nil {
		t.Fatalf("read created template from store: %v", err)
	}
	if saved.Template != "Hello {{ name }}" {
		t.Fatalf("expected persisted template body, got %#v", saved)
	}
}

func TestRegisterPromptTemplateRoutesRejectsMissingCreateTemplateField(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)

	// Missing required fields should be rejected even though empty strings remain valid when present.
	response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, RouteCreatePromptTemplate, map[string]any{
		"name": "Greeting",
	})

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "prompt_template_template_required" {
		t.Fatalf("expected prompt_template_template_required, got %#v", payload)
	}
}

func TestRegisterPromptTemplateRoutesUpdatesTemplate(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	if err := store.Save(prompttemplates.Template{
		ID:          "template-1",
		Name:        "Greeting",
		Description: "Original greeting",
		Template:    "Hello {{ name }}",
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}
	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)

	// Update should preserve explicit empty strings while replacing the stored document.
	response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, RouteUpdatePromptTemplate, map[string]any{
		"template": map[string]any{
			"id":          "template-1",
			"name":        "",
			"description": "Updated greeting",
			"template":    "",
			"format":      "Jinja",
			"inputSchema": map[string]any{},
			"metadata":    map[string]any{"category": "updated"},
		},
	})

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var template prompttemplates.Template
	if err := json.Unmarshal(response.Body.Bytes(), &template); err != nil {
		t.Fatalf("decode updated template: %v", err)
	}
	if template.Name != "" || template.Template != "" {
		t.Fatalf("expected explicit empty strings to persist, got %#v", template)
	}
	if template.Metadata["category"] != "updated" {
		t.Fatalf("expected updated metadata, got %#v", template)
	}

	saved, err := store.Get("template-1")
	if err != nil {
		t.Fatalf("read updated template from store: %v", err)
	}
	if saved.Description != "Updated greeting" || saved.Template != "" {
		t.Fatalf("expected updated persisted template, got %#v", saved)
	}
}

func TestRegisterPromptTemplateRoutesUpdateRefreshesLinkedPromptSections(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	if err := store.Save(prompttemplates.Template{
		ID:       "template-1",
		Name:     "Greeting",
		Template: "Old {{ name }}",
		Format:   prompttemplates.FormatJinja,
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}
	projectRuntime := newPromptTemplateRouteLinkedPromptSectionRuntimeWithState(
		t,
		"template-1",
		"Old {{ name }}",
		map[string]string{"name": "Ada"},
	)
	handler := newPromptTemplateRouteTestHandlerWithProjectState(t, config.ModeIDE, store, projectRuntime)

	response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, RouteUpdatePromptTemplate, map[string]any{
		"template": map[string]any{
			"id":       "template-1",
			"name":     "Greeting",
			"template": "Hello {{ name }}",
			"format":   "Jinja",
		},
	})

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	project := projectRuntime.Snapshot().Document.Projects["project-alpha"]
	promptPayload := promptTemplateRoutePromptPayload(t, project.Sections["prompt-section"].SharedModifier)
	if got := promptPayload["promptTemplateId"]; got != "template-1" {
		t.Fatalf("expected promptTemplateId template-1, got %#v", got)
	}
	if got := promptPayload["template"]; got != "Hello {{ name }}" {
		t.Fatalf("expected refreshed template, got %#v", got)
	}
	if got := promptPayload["format"]; got != string(projectstate.PromptFormatJinja) {
		t.Fatalf("expected prompt format Jinja, got %#v", got)
	}
	if got := promptPayload["renderedText"]; got != "Hello Ada" {
		t.Fatalf("expected refreshed renderedText Hello Ada, got %#v", got)
	}
	if value, ok := promptPayload["renderError"]; !ok || value != nil {
		t.Fatalf("expected renderError to clear after refresh, got %#v", promptPayload["renderError"])
	}
}

func TestRegisterPromptTemplateRoutesUpdateBroadcastsLinkedPromptProjectState(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	if err := store.Save(prompttemplates.Template{
		ID:       "template-1",
		Name:     "Greeting",
		Template: "Old {{ name }}",
		Format:   prompttemplates.FormatJinja,
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}
	projectRuntime := newPromptTemplateRouteLinkedPromptSectionRuntimeWithState(
		t,
		"template-1",
		"Old {{ name }}",
		map[string]string{"name": "Ada"},
	)
	websocketHub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	handler := newPromptTemplateRouteTestHandlerWithProjectStateAndHub(
		t,
		config.ModeIDE,
		store,
		projectRuntime,
		websocketHub,
	)

	websocketServer := newTranscriptionProfileRouteTestWebsocketServer(t, websocketHub)
	defer websocketServer.Close()

	websocketClient := dialTranscriptionProfileRouteTestWebsocketClient(t, websocketServer.URL)
	defer websocketClient.CloseNow()
	waitForTranscriptionProfileRouteTestHubConnection(t, websocketHub, "frontend-a")

	response := performPromptTemplateRouteJSONRequest(
		t,
		handler,
		http.MethodPost,
		RouteUpdatePromptTemplate,
		map[string]any{
			"template": map[string]any{
				"id":       "template-1",
				"name":     "Greeting",
				"template": "Hello {{ name }}",
				"format":   "Jinja",
			},
		},
	)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var projectUpdate realtime.ProjectStateUpdateContent
	foundProjectUpdate := false
	foundPromptTemplatesUpdated := false
	for range 2 {
		envelope := readTranscriptionProfileRouteTestEnvelope(t, websocketClient)
		switch envelope.MessageType {
		case realtime.MessageTypeUpdateFrontendProjectState:
			foundProjectUpdate = true
			if err := json.Unmarshal(envelope.Content, &projectUpdate); err != nil {
				t.Fatalf("decode project state update: %v", err)
			}
		case realtime.MessageTypePromptTemplatesUpdated:
			foundPromptTemplatesUpdated = true
		default:
			t.Fatalf("unexpected websocket message type %q", envelope.MessageType)
		}
	}

	if !foundProjectUpdate {
		t.Fatal("expected linked prompt project state update broadcast")
	}
	if !foundPromptTemplatesUpdated {
		t.Fatal("expected prompt templates updated broadcast")
	}
	if projectUpdate.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf(
			"expected project-alpha project update, got %q",
			projectUpdate.ProjectState.ProjectConfig.ID,
		)
	}

	promptVariantID := projectUpdate.ProjectState.ProjectConfig.SectionVariantMap["prompt-section"]
	if promptVariantID == "" {
		t.Fatalf("expected prompt-section variant mapping, got %#v", projectUpdate.ProjectState.ProjectConfig.SectionVariantMap)
	}
	promptPayload := promptTemplateRouteEffectivePromptPayloadFromView(
		t,
		projectUpdate.ProjectState,
		"prompt-section",
		promptVariantID,
	)
	if got := promptPayload["renderedText"]; got != "Hello Ada" {
		t.Fatalf("expected websocket renderedText Hello Ada, got %#v", got)
	}
	if value, ok := promptPayload["renderError"]; !ok || value != nil {
		t.Fatalf("expected websocket renderError to clear, got %#v", promptPayload["renderError"])
	}
}

func TestRegisterPromptTemplateRoutesReturnsNotFoundForUpdate(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)

	response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, RouteUpdatePromptTemplate, map[string]any{
		"template": map[string]any{
			"id":       "missing-template",
			"name":     "Greeting",
			"template": "Hello {{ name }}",
		},
	})

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "prompt_template_not_found" {
		t.Fatalf("expected prompt_template_not_found, got %#v", payload)
	}
}

func TestRegisterPromptTemplateRoutesReturnsNotFoundForGet(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)

	response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, RouteGetPromptTemplate, map[string]any{
		"templateId": "missing-template",
	})

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "prompt_template_not_found" {
		t.Fatalf("expected prompt_template_not_found, got %#v", payload)
	}
}

func TestRegisterPromptTemplateRoutesDeletesTemplate(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	if err := store.Save(prompttemplates.Template{
		ID:       "template-1",
		Name:     "Greeting",
		Template: "Hello {{ name }}",
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}
	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)

	// Delete should require prior existence and return a JSON null payload on success.
	response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, RouteDeletePromptTemplate, map[string]any{
		"templateId": "template-1",
	})

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "null" {
		t.Fatalf("expected null delete payload, got %q", response.Body.String())
	}
	templates, err := store.List()
	if err != nil {
		t.Fatalf("list templates after delete: %v", err)
	}
	if len(templates) != 0 {
		t.Fatalf("expected no templates after delete, got %#v", templates)
	}
}

func TestRegisterPromptTemplateRoutesReturnsNotFoundForDelete(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)

	response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, RouteDeletePromptTemplate, map[string]any{
		"templateId": "missing-template",
	})

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "prompt_template_not_found" {
		t.Fatalf("expected prompt_template_not_found, got %#v", payload)
	}
}

func TestRegisterPromptTemplateRoutesBlocksDeleteForWorkflowReferences(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	if err := store.Save(prompttemplates.Template{
		ID:       "template-1",
		Name:     "Greeting",
		Template: "Hello {{ name }}",
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}
	projectRuntime := newPromptTemplateRouteWorkflowReferenceRuntime(t, "template-1")
	handler := newPromptTemplateRouteTestHandlerWithProjectState(t, config.ModeIDE, store, projectRuntime)

	response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, RouteDeletePromptTemplate, map[string]any{
		"templateId": "template-1",
	})

	if response.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "prompt_template_in_use" {
		t.Fatalf("expected prompt_template_in_use, got %#v", payload)
	}
	if !strings.Contains(payload.Error.Message, "project project-alpha, edge edge-send-prompt") {
		t.Fatalf("expected workflow reference detail, got %#v", payload)
	}
	if _, err := store.Get("template-1"); err != nil {
		t.Fatalf("expected template to remain after blocked delete, got %v", err)
	}
}

func TestRegisterPromptTemplateRoutesDeleteAllowsPromptSectionLinks(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	if err := store.Save(prompttemplates.Template{
		ID:       "template-1",
		Name:     "Greeting",
		Template: "Hello {{ name }}",
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}
	projectRuntime := newPromptTemplateRouteLinkedPromptSectionRuntime(t, "template-1")
	handler := newPromptTemplateRouteTestHandlerWithProjectState(t, config.ModeIDE, store, projectRuntime)

	response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, RouteDeletePromptTemplate, map[string]any{
		"templateId": "template-1",
	})

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "null" {
		t.Fatalf("expected null delete payload, got %q", response.Body.String())
	}
	templates, err := store.List()
	if err != nil {
		t.Fatalf("list templates after delete: %v", err)
	}
	if len(templates) != 0 {
		t.Fatalf("expected linked prompt section not to block delete, got %#v", templates)
	}
}

func TestRegisterPromptTemplateRoutesRejectsInvalidCreateJSON(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)

	// Strict JSON decode should reject unknown fields instead of silently accepting them.
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreatePromptTemplate,
		strings.NewReader(`{"name":"Greeting","template":"Hello {{ name }}","extra":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_json" {
		t.Fatalf("expected invalid_json, got %#v", payload)
	}
}

func TestRegisterPromptTemplateRoutesRejectsMissingTemplateIDOnGet(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	handler := newPromptTemplateRouteTestHandler(t, config.ModeIDE, store)

	response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, RouteGetPromptTemplate, map[string]any{})

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "template_id_required" {
		t.Fatalf("expected template_id_required, got %#v", payload)
	}
}

func TestRegisterPromptTemplateRoutesMutationModeGuardsMatchSourceDetailBodies(t *testing.T) {
	t.Parallel()

	store := newPromptTemplateRouteTestStore(t)
	if err := store.Save(prompttemplates.Template{
		ID:       "template-1",
		Name:     "Greeting",
		Template: "Hello {{ name }}",
	}); err != nil {
		t.Fatalf("save template: %v", err)
	}

	testCases := []struct {
		name           string
		mode           config.Mode
		expectedDetail string
		path           string
		payload        map[string]any
	}{
		{
			name:           "share create",
			mode:           config.ModeShare,
			expectedDetail: "Share mode does not allow creating prompt templates.",
			path:           RouteCreatePromptTemplate,
			payload: map[string]any{
				"name":     "Greeting",
				"template": "Hello {{ name }}",
			},
		},
		{
			name:           "share update",
			mode:           config.ModeShare,
			expectedDetail: "Share mode does not allow updating prompt templates.",
			path:           RouteUpdatePromptTemplate,
			payload: map[string]any{
				"template": map[string]any{
					"id":       "template-1",
					"name":     "Greeting",
					"template": "Hello {{ name }}",
				},
			},
		},
		{
			name:           "share delete",
			mode:           config.ModeShare,
			expectedDetail: "Share mode does not allow deleting prompt templates.",
			path:           RouteDeletePromptTemplate,
			payload: map[string]any{
				"templateId": "template-1",
			},
		},
		{
			name:           "app create",
			mode:           config.ModeApp,
			expectedDetail: "Share mode does not allow creating prompt templates.",
			path:           RouteCreatePromptTemplate,
			payload: map[string]any{
				"name":     "Greeting",
				"template": "Hello {{ name }}",
			},
		},
		{
			name:           "launcher create",
			mode:           config.ModeLauncher,
			expectedDetail: "Launcher mode does not allow this endpoint.",
			path:           RouteCreatePromptTemplate,
			payload: map[string]any{
				"name":     "Greeting",
				"template": "Hello {{ name }}",
			},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			var deploymentRuntime *deployments.Runtime
			if testCase.mode == config.ModeShare || testCase.mode == config.ModeApp {
				deploymentRuntime = newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode:   testCase.mode,
					Policy: map[string]any{"allowLLM": true},
				})
			}
			handler := newPromptTemplateRouteTestHandler(t, testCase.mode, store, deploymentRuntime)
			response := performPromptTemplateRouteJSONRequest(t, handler, http.MethodPost, testCase.path, testCase.payload)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403 for %s, got %d with body %q", testCase.path, response.Code, response.Body.String())
			}
			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error payload for %s: %v", testCase.path, err)
			}
			if payload.Error.Code != "mode_forbidden" {
				t.Fatalf("expected mode_forbidden for %s, got %#v", testCase.path, payload)
			}
			if payload.Error.Message != testCase.expectedDetail {
				t.Fatalf("expected detail %q, got %#v", testCase.expectedDetail, payload)
			}
		})
	}
}

func newPromptTemplateRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	store *prompttemplates.Store,
	deploymentRuntimes ...*deployments.Runtime,
) http.Handler {
	t.Helper()

	return newPromptTemplateRouteTestHandlerWithProjectStateAndHub(
		t,
		mode,
		store,
		nil,
		nil,
		deploymentRuntimes...,
	)
}

func newPromptTemplateRouteTestHandlerWithProjectState(
	t *testing.T,
	mode config.Mode,
	store *prompttemplates.Store,
	projectRuntime *projectstate.Runtime,
	deploymentRuntimes ...*deployments.Runtime,
) http.Handler {
	t.Helper()

	return newPromptTemplateRouteTestHandlerWithProjectStateAndHub(
		t,
		mode,
		store,
		projectRuntime,
		nil,
		deploymentRuntimes...,
	)
}

func newPromptTemplateRouteTestHandlerWithProjectStateAndHub(
	t *testing.T,
	mode config.Mode,
	store *prompttemplates.Store,
	projectRuntime *projectstate.Runtime,
	websocketHub *realtime.WebsocketHub,
	deploymentRuntimes ...*deployments.Runtime,
) http.Handler {
	t.Helper()

	var deploymentRuntime *deployments.Runtime
	if len(deploymentRuntimes) != 0 {
		deploymentRuntime = deploymentRuntimes[0]
	}
	if deploymentRuntime == nil && (mode == config.ModeShare || mode == config.ModeApp) {
		deploymentRuntime = newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
			Mode: mode,
		})
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterPromptTemplateRoutes(r, PromptTemplateRouteDependencies{
				ModePolicy:   modes.NewPolicy(mode),
				Templates:    store,
				ProjectState: projectRuntime,
				Deployment:   deploymentRuntime,
				WebsocketHub: websocketHub,
			}); err != nil {
				t.Fatalf("register prompt template routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newPromptTemplateRouteWorkflowReferenceRuntime(t *testing.T, templateID string) *projectstate.Runtime {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				StateMachineEdges: []projectstate.StateMachineEdge{
					{
						ID:              "edge-send-prompt",
						MachineGroupID:  "workflow-a",
						SourceSectionID: "gate-section",
						SourcePortID:    projectstate.StateMachineEdgeSourcePortID,
						TargetSectionID: "chat-section",
						TargetPortID:    projectstate.StateMachineEdgeTargetPortID,
						TargetAction: &projectstate.StateMachineTargetAction{
							Type:             projectstate.StateMachineTargetActionTypeSendPrompt,
							PromptTemplateID: promptTemplateRouteStringPointer(templateID),
							ThreadStrategy:   projectstate.StateMachineThreadStrategyContinueCurrentThread,
						},
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("open workflow reference runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close workflow reference runtime: %v", err)
		}
	})
	return projectRuntime
}

func newPromptTemplateRouteLinkedPromptSectionRuntime(t *testing.T, templateID string) *projectstate.Runtime {
	t.Helper()

	return newPromptTemplateRouteLinkedPromptSectionRuntimeWithState(
		t,
		templateID,
		"Linked {{ name }}",
		map[string]string{},
	)
}

func newPromptTemplateRouteLinkedPromptSectionRuntimeWithState(
	t *testing.T,
	templateID string,
	template string,
	inputs map[string]string,
) *projectstate.Runtime {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": promptTemplateRouteLinkedPromptProject(t, templateID, template, inputs),
		},
	})
	if err != nil {
		t.Fatalf("open linked prompt runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close linked prompt runtime: %v", err)
		}
	})
	return projectRuntime
}

func promptTemplateRouteLinkedPromptProject(
	t *testing.T,
	templateID string,
	template string,
	inputs map[string]string,
) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"prompt-section": "prompt-variant",
		},
		Sections: map[string]projectstate.Section{
			"prompt-section": {
				ID:               "prompt-section",
				Name:             "Prompt Section",
				VariantIDs:       []string{"prompt-variant"},
				DefaultVariantID: "prompt-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"prompt-variant": {
				ID:     "prompt-variant",
				ImplID: "prompt-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"prompt-impl": {
				ID:   "prompt-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":               "prompt-impl",
					"type":             "Prompt",
					"promptTemplateId": templateID,
					"template":         template,
					"inputs":           inputs,
					"format":           string(projectstate.PromptFormatJinja),
					"renderedText":     "",
					"missingVariables": []string{},
					"renderError":      nil,
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize linked prompt project: %v", err)
	}
	return project
}

func promptTemplateRoutePromptPayload(t *testing.T, raw projectstate.RawJSON) map[string]any {
	t.Helper()

	payload := map[string]any{}
	if len(raw) == 0 {
		return payload
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode prompt payload: %v", err)
	}
	return payload
}

func promptTemplateRouteEffectivePromptPayloadFromView(
	t *testing.T,
	view projectview.SingleConfig,
	sectionID string,
	variantID string,
) map[string]any {
	t.Helper()

	payload := map[string]any{}
	section := view.Sections[sectionID]
	variant := view.SectionVariants[variantID]
	if variant.Impl == "" {
		t.Fatalf("expected section variant impl for %q, got %#v", sectionID, variant)
	}

	for _, raw := range []projectstate.RawJSON{
		view.SectionImpls[variant.Impl],
		projectstate.RawJSON(section.SharedModifier),
		projectstate.RawJSON(variant.Modifier),
	} {
		if len(raw) == 0 {
			continue
		}
		decoded := map[string]any{}
		if err := json.Unmarshal(raw, &decoded); err != nil {
			t.Fatalf("decode effective prompt payload fragment: %v", err)
		}
		for key, value := range decoded {
			payload[key] = value
		}
	}

	return payload
}

func mustMarshalProjectObject(value map[string]any) projectstate.RawJSON {
	content, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return projectstate.RawJSON(content)
}

func promptTemplateRouteStringPointer(value string) *string {
	return &value
}

func newPromptTemplateRouteTestStore(t *testing.T) *prompttemplates.Store {
	t.Helper()

	store, err := prompttemplates.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new prompt template store: %v", err)
	}
	return store
}

func performPromptTemplateRouteJSONRequest(
	t *testing.T,
	handler http.Handler,
	method string,
	path string,
	payload any,
) *httptest.ResponseRecorder {
	t.Helper()

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal request payload: %v", err)
	}
	request := httptest.NewRequest(method, "/api"+path, strings.NewReader(string(body)))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
