package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
)

func TestRegisterProjectRoutesPromptSectionMutationsPersistAndTrackFrontendOps(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(promptSectionRouteTestDocument(t))
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	// These writes should update the stored prompt payload and surface their op ids in the next hydration.
	for _, requestBody := range []struct {
		route string
		body  string
	}{
		{
			route: RouteSetPromptTemplate,
			body:  `{"projectConfigId":"project-alpha","sectionId":"prompt-section","template":"Hello {{ name }}","frontendOpId":"prompt-template-op"}`,
		},
		{
			route: RouteSetPromptInputs,
			body:  `{"projectConfigId":"project-alpha","sectionId":"prompt-section","inputs":{"name":""},"frontendOpId":"prompt-inputs-op"}`,
		},
		{
			route: RouteSetPromptFormat,
			body:  `{"projectConfigId":"project-alpha","sectionId":"prompt-section","format":"Jinja","frontendOpId":"prompt-format-op"}`,
		},
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+requestBody.route,
			strings.NewReader(requestBody.body),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d with body %q", requestBody.route, response.Code, response.Body.String())
		}
	}

	latestRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	latestRequest.Header.Set("Content-Type", "application/json")
	latestResponse := httptest.NewRecorder()
	handler.ServeHTTP(latestResponse, latestRequest)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var latestPayload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &latestPayload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}
	if !reflect.DeepEqual(latestPayload.CompletedOpIDs, []string{
		"prompt-template-op",
		"prompt-inputs-op",
		"prompt-format-op",
	}) {
		t.Fatalf("unexpected completed op ids %#v", latestPayload.CompletedOpIDs)
	}

	// Prompt writes land in the section shared modifier, and the latest-state envelope should carry that authored state through hydration.
	promptPayload := promptSectionRoutePayload(t, latestPayload.ProjectState.Sections["prompt-section"].SharedModifier)
	if got := promptPayload["template"]; got != "Hello {{ name }}" {
		t.Fatalf("expected template to persist, got %#v", got)
	}
	inputs, ok := promptPayload["inputs"].(map[string]any)
	if !ok || inputs["name"] != "" {
		t.Fatalf("expected blank-string inputs to persist, got %#v", promptPayload["inputs"])
	}
	if got := promptPayload["renderedText"]; got != "Hello " {
		t.Fatalf("expected renderedText Hello<space>, got %#v", got)
	}
	if got := promptPayload["missingVariables"]; !reflect.DeepEqual(got, []any{}) {
		t.Fatalf("expected empty missingVariables, got %#v", got)
	}
	if value, ok := promptPayload["renderError"]; !ok || value != nil {
		t.Fatalf("expected renderError to be null, got %#v", promptPayload["renderError"])
	}
}

func TestRegisterProjectRoutesPromptSectionMutationsRejectInvalidPayloads(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(promptSectionRouteTestDocument(t))
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	// Non-prompt sections should fail closed rather than silently writing a mismatched payload.
	templateRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetPromptTemplate,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"plain-section","template":"Hello"}`),
	)
	templateRequest.Header.Set("Content-Type", "application/json")
	templateResponse := httptest.NewRecorder()
	handler.ServeHTTP(templateResponse, templateRequest)
	if templateResponse.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 template response, got %d with body %q", templateResponse.Code, templateResponse.Body.String())
	}

	var templateError errorResponse
	if err := json.Unmarshal(templateResponse.Body.Bytes(), &templateError); err != nil {
		t.Fatalf("decode template error: %v", err)
	}
	if templateError.Error.Code != "prompt_section_required" {
		t.Fatalf("expected prompt_section_required, got %#v", templateError)
	}

	workspaceRoot := t.TempDir()
	templateStore, err := prompttemplates.NewStore(workspaceRoot)
	if err != nil {
		t.Fatalf("new prompt template store: %v", err)
	}
	if err := templateStore.Save(prompttemplates.Template{
		ID:       "template-alpha",
		Name:     "Greeting",
		Template: "Hello {{ name }}",
		Format:   prompttemplates.FormatJinja,
	}); err != nil {
		t.Fatalf("save prompt template: %v", err)
	}
	handler = newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)

	linkRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetPromptTemplateLink,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"plain-section","promptTemplateId":"template-alpha"}`),
	)
	linkRequest.Header.Set("Content-Type", "application/json")
	linkResponse := httptest.NewRecorder()
	handler.ServeHTTP(linkResponse, linkRequest)
	if linkResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 link response, got %d with body %q", linkResponse.Code, linkResponse.Body.String())
	}

	var linkError map[string]any
	if err := json.Unmarshal(linkResponse.Body.Bytes(), &linkError); err != nil {
		t.Fatalf("decode link error: %v", err)
	}
	if got := linkError["detail"]; got != "Section plain-section failed type guard" {
		t.Fatalf("expected failed type guard detail from link, got %#v", linkError)
	}

	// Format validation should reject unsupported prompt engines instead of falling back heuristically.
	formatRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetPromptFormat,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"prompt-section","format":"Liquid"}`),
	)
	formatRequest.Header.Set("Content-Type", "application/json")
	formatResponse := httptest.NewRecorder()
	handler.ServeHTTP(formatResponse, formatRequest)
	if formatResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 format response, got %d with body %q", formatResponse.Code, formatResponse.Body.String())
	}

	var formatError errorResponse
	if err := json.Unmarshal(formatResponse.Body.Bytes(), &formatError); err != nil {
		t.Fatalf("decode format error: %v", err)
	}
	if formatError.Error.Code != "prompt_format_invalid" {
		t.Fatalf("expected prompt_format_invalid, got %#v", formatError)
	}
}

func TestRegisterProjectRoutesPromptTemplateLinkPersistsResolvedTemplateAndRejectsMissingTemplate(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(promptSectionRouteTestDocument(t))
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	workspaceRoot := t.TempDir()
	templateStore, err := prompttemplates.NewStore(workspaceRoot)
	if err != nil {
		t.Fatalf("new prompt template store: %v", err)
	}
	if err := templateStore.Save(prompttemplates.Template{
		ID:       "template-alpha",
		Name:     "Greeting",
		Template: "Hello {{ name }}",
		Format:   prompttemplates.FormatJinja,
	}); err != nil {
		t.Fatalf("save prompt template: %v", err)
	}

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)

	linkRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetPromptTemplateLink,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"prompt-section","promptTemplateId":"template-alpha","frontendOpId":"prompt-template-link-op"}`),
	)
	linkRequest.Header.Set("Content-Type", "application/json")
	linkResponse := httptest.NewRecorder()
	handler.ServeHTTP(linkResponse, linkRequest)
	if linkResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 link response, got %d with body %q", linkResponse.Code, linkResponse.Body.String())
	}

	latestRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	latestRequest.Header.Set("Content-Type", "application/json")
	latestResponse := httptest.NewRecorder()
	handler.ServeHTTP(latestResponse, latestRequest)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var latestPayload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &latestPayload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}
	if !reflect.DeepEqual(latestPayload.CompletedOpIDs, []string{"prompt-template-link-op"}) {
		t.Fatalf("unexpected completed op ids %#v", latestPayload.CompletedOpIDs)
	}

	promptPayload := promptSectionRoutePayload(t, latestPayload.ProjectState.Sections["prompt-section"].SharedModifier)
	if got := promptPayload["promptTemplateId"]; got != "template-alpha" {
		t.Fatalf("expected promptTemplateId template-alpha, got %#v", got)
	}
	if got := promptPayload["template"]; got != "Hello {{ name }}" {
		t.Fatalf("expected linked template contents, got %#v", got)
	}
	if got := promptPayload["format"]; got != string(prompttemplates.FormatJinja) {
		t.Fatalf("expected prompt format Jinja, got %#v", got)
	}

	missingRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetPromptTemplateLink,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"prompt-section","promptTemplateId":"missing-template"}`),
	)
	missingRequest.Header.Set("Content-Type", "application/json")
	missingResponse := httptest.NewRecorder()
	handler.ServeHTTP(missingResponse, missingRequest)
	if missingResponse.Code != http.StatusNotFound {
		t.Fatalf("expected 404 missing-template response, got %d with body %q", missingResponse.Code, missingResponse.Body.String())
	}
	stateMachineRouteErrorCode(t, missingResponse, "prompt_template_not_found")
}

func TestRegisterProjectRoutesPromptTemplateLinkRejectsUnlinkWhenLinkedTemplateIsMissing(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(promptSectionRouteTestDocument(t))
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	workspaceRoot := t.TempDir()
	templateStore, err := prompttemplates.NewStore(workspaceRoot)
	if err != nil {
		t.Fatalf("new prompt template store: %v", err)
	}
	if err := templateStore.Save(prompttemplates.Template{
		ID:       "template-broken-link",
		Name:     "Greeting",
		Template: "Hello {{ name }}",
		Format:   prompttemplates.FormatJinja,
	}); err != nil {
		t.Fatalf("save prompt template: %v", err)
	}

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, workspaceRoot, nil, nil, nil)

	linkRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetPromptTemplateLink,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"prompt-section","promptTemplateId":"template-broken-link"}`),
	)
	linkRequest.Header.Set("Content-Type", "application/json")
	linkResponse := httptest.NewRecorder()
	handler.ServeHTTP(linkResponse, linkRequest)
	if linkResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 link response, got %d with body %q", linkResponse.Code, linkResponse.Body.String())
	}

	if err := templateStore.Delete("template-broken-link"); err != nil {
		t.Fatalf("delete prompt template: %v", err)
	}

	unlinkRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetPromptTemplateLink,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"prompt-section","promptTemplateId":null}`),
	)
	unlinkRequest.Header.Set("Content-Type", "application/json")
	unlinkResponse := httptest.NewRecorder()
	handler.ServeHTTP(unlinkResponse, unlinkRequest)
	if unlinkResponse.Code != http.StatusNotFound {
		t.Fatalf("expected 404 unlink response, got %d with body %q", unlinkResponse.Code, unlinkResponse.Body.String())
	}
	stateMachineRouteErrorCode(t, unlinkResponse, "prompt_template_not_found")
}

func TestRegisterProjectRoutesPromptSectionMutationsRespectDeploymentParamPolicy(t *testing.T) {
	t.Parallel()

	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:     config.ModeShare,
		Document: promptSectionRouteTestDocument(t),
		Policy: map[string]any{
			"allowParamChanges": false,
		},
	})
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler := newProjectRouteDeploymentTestHandler(t, config.ModeShare, deploymentRuntime)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetPromptTemplate,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"prompt-section","template":"Hello {{ name }}"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(modes.ShareSessionHeaderName, "share-a")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403 response, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "Deployment policy disallows param changes.") {
		t.Fatalf("expected param policy denial, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesPromptSectionMutationsUseDeploymentOverlay(t *testing.T) {
	t.Parallel()

	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:     config.ModeShare,
		Document: promptSectionRouteTestDocument(t),
		Policy: map[string]any{
			"allowParamChanges": true,
		},
	})
	if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
		t.Fatalf("create share session: %v", err)
	}

	handler := newProjectRouteDeploymentTestHandler(t, config.ModeShare, deploymentRuntime)

	// Share-session prompt writes should land in the overlay runtime, not the base deployment document.
	for _, requestBody := range []struct {
		route string
		body  string
	}{
		{
			route: RouteSetPromptTemplate,
			body:  `{"projectConfigId":"project-alpha","sectionId":"prompt-section","template":"Hello {{ name }}"}`,
		},
		{
			route: RouteSetPromptInputs,
			body:  `{"projectConfigId":"project-alpha","sectionId":"prompt-section","inputs":{"name":"Ada"}}`,
		},
		{
			route: RouteSetPromptFormat,
			body:  `{"projectConfigId":"project-alpha","sectionId":"prompt-section","format":"Jinja"}`,
		},
	} {
		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+requestBody.route,
			strings.NewReader(requestBody.body),
		)
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set(modes.ShareSessionHeaderName, "share-a")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d with body %q", requestBody.route, response.Code, response.Body.String())
		}
	}

	overlay, err := deploymentRuntime.Overlay("share-a")
	if err != nil {
		t.Fatalf("deployment overlay: %v", err)
	}
	project := overlay.Snapshot().Document.Projects["project-alpha"]
	promptPayload := promptSectionRoutePayload(t, project.Sections["prompt-section"].SharedModifier)
	if got := promptPayload["renderedText"]; got != "Hello Ada" {
		t.Fatalf("expected overlay renderedText Hello Ada, got %#v", got)
	}
	if value, ok := promptPayload["renderError"]; !ok || value != nil {
		t.Fatalf("expected overlay renderError to be null, got %#v", promptPayload["renderError"])
	}
}

func promptSectionRouteTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	project, err := (projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"prompt-section": "prompt-variant",
			"plain-section":  "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"prompt-section": {
				ID:               "prompt-section",
				Name:             "Prompt Section",
				VariantIDs:       []string{"prompt-variant"},
				DefaultVariantID: "prompt-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"prompt-variant": {
				ID:     "prompt-variant",
				ImplID: "prompt-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"prompt-impl": {
				ID:   "prompt-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: promptSectionRouteMustMarshalObject(t, map[string]any{
					"id":               "prompt-impl",
					"type":             "Prompt",
					"template":         "",
					"inputs":           map[string]string{},
					"format":           string(prompttemplates.FormatJinja),
					"renderedText":     "",
					"missingVariables": []string{},
					"renderError":      nil,
				}),
			},
			"plain-impl": {
				ID:   "plain-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: promptSectionRouteMustMarshalObject(t, map[string]any{
					"id":   "plain-impl",
					"type": "TextBlock",
				}),
			},
		},
	}).Normalized()
	if err != nil {
		t.Fatalf("normalize prompt route project: %v", err)
	}

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
		},
	}
}

func promptSectionRouteMustMarshalObject(t *testing.T, value map[string]any) projectstate.RawJSON {
	t.Helper()

	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal prompt route payload: %v", err)
	}
	return projectstate.RawJSON(raw)
}

func promptSectionRoutePayload(t *testing.T, payload json.RawMessage) map[string]any {
	t.Helper()

	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode prompt payload: %v", err)
	}
	return decoded
}
