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
)

func TestRegisterProjectRoutesTextBlockMutationsPersistLatestState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": textBlockRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	post := newProjectRoutePost(handler)

	for _, format := range []string{"Plaintext", "Markdown"} {
		assertProjectRoutePostOK(t, post, RouteSetTextBlockFormat, `{"projectConfigId":"project-alpha","sectionId":"text-section","format":"`+format+`"}`)
		modifier := latestTextBlockModifier(t, post)
		if got := modifier["format"]; got != format {
			t.Fatalf("expected format %s, got %#v", format, got)
		}
	}
	assertProjectRoutePostOK(t, post, RouteSetTextBlockHeadingAsSectionName, `{"projectConfigId":"project-alpha","sectionId":"text-section","headingAsSectionName":true}`)
	assertProjectRoutePostOK(t, post, RouteSetTextBlockText, `{"projectConfigId":"project-alpha","sectionId":"text-section","text":"# Updated Heading\n\nBody"}`)
	for _, displayMode := range []string{"Render", "Edit"} {
		assertProjectRoutePostOK(t, post, RouteSetTextBlockDisplayMode, `{"projectConfigId":"project-alpha","sectionId":"text-section","textDisplayMode":"`+displayMode+`"}`)
		modifier := latestTextBlockModifier(t, post)
		if got := modifier["textDisplayMode"]; got != displayMode {
			t.Fatalf("expected textDisplayMode %s, got %#v", displayMode, got)
		}
	}
	assertProjectRoutePostOK(t, post, RouteSetTextBlockMetaControlStyle, `{"projectConfigId":"project-alpha","sectionId":"text-section","metaControlStyle":true}`)
	assertProjectRoutePostOK(t, post, RouteSetTextBlockMasterFontSize, `{"projectConfigId":"project-alpha","sectionId":"text-section","masterFontSizePx":64}`)

	payload := latestProjectRoutePayload(t, post)
	textSection := payload.ProjectState.Sections["text-section"]
	if textSection.Name != "Updated Heading" {
		t.Fatalf("expected section name Updated Heading, got %q", textSection.Name)
	}
	assertTextBlockPersistedModifier(t, decodeProjectRouteRawObject(t, textSection.SharedModifier))
}

func latestTextBlockModifier(t *testing.T, post projectRoutePostFunc) map[string]any {
	t.Helper()

	payload := latestProjectRoutePayload(t, post)
	return decodeProjectRouteRawObject(t, payload.ProjectState.Sections["text-section"].SharedModifier)
}

func assertTextBlockPersistedModifier(t *testing.T, modifier map[string]any) {
	t.Helper()

	assertProjectRouteModifierValue(t, modifier, "format", "Markdown", "expected format Markdown")
	assertProjectRouteModifierValue(t, modifier, "text", "# Updated Heading\n\nBody", "expected updated text")
	assertProjectRouteModifierValue(t, modifier, "textDisplayMode", "Edit", "expected textDisplayMode Edit")
	assertProjectRouteModifierValue(t, modifier, "headingAsSectionName", true, "expected headingAsSectionName true")
	assertProjectRouteModifierValue(t, modifier, "metaControlStyle", true, "expected metaControlStyle true")
	assertProjectRouteModifierValue(t, modifier, "masterFontSizePx", float64(48), "expected masterFontSizePx 48")
}

func TestRegisterProjectRoutesTextBlockMutationsRejectInvalidInputs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": textBlockRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	post := func(route string, body string) *httptest.ResponseRecorder {
		t.Helper()

		request := httptest.NewRequest(
			http.MethodPost,
			"/api"+route,
			strings.NewReader(body),
		)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}

	for _, requestSpec := range []struct {
		name                string
		route               string
		body                string
		expectedCode        int
		expectedErrorCode   string
		expectedMessagePart string
	}{
		{
			name:                "text_requires_text_block_section",
			route:               RouteSetTextBlockText,
			body:                `{"projectConfigId":"project-alpha","sectionId":"plain-section","text":"hello"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "text_block_section_required",
			expectedMessagePart: "Section must resolve to a text block section.",
		},
		{
			name:                "display_mode_rejects_unknown_literal_at_transport",
			route:               RouteSetTextBlockDisplayMode,
			body:                `{"projectConfigId":"project-alpha","sectionId":"text-section","textDisplayMode":"Preview"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid textDisplayMode value "Preview".`,
		},
		{
			name:                "display_mode_rejects_padded_literal_without_trimming",
			route:               RouteSetTextBlockDisplayMode,
			body:                `{"projectConfigId":"project-alpha","sectionId":"text-section","textDisplayMode":" Edit "}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid textDisplayMode value " Edit ".`,
		},
		{
			name:                "format_rejects_unknown_literal_at_transport",
			route:               RouteSetTextBlockFormat,
			body:                `{"projectConfigId":"project-alpha","sectionId":"text-section","format":"HTML"}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid format value "HTML".`,
		},
		{
			name:                "format_rejects_padded_literal_without_trimming",
			route:               RouteSetTextBlockFormat,
			body:                `{"projectConfigId":"project-alpha","sectionId":"text-section","format":" Markdown "}`,
			expectedCode:        http.StatusUnprocessableEntity,
			expectedErrorCode:   "invalid_request",
			expectedMessagePart: `Invalid format value " Markdown ".`,
		},
	} {
		response := post(requestSpec.route, requestSpec.body)
		if response.Code != requestSpec.expectedCode {
			t.Fatalf("%s: expected %d for %s, got %d with body %q", requestSpec.name, requestSpec.expectedCode, requestSpec.route, response.Code, response.Body.String())
		}

		var payload errorResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("%s: decode error payload: %v", requestSpec.name, err)
		}
		if payload.Error.Code != requestSpec.expectedErrorCode {
			t.Fatalf("%s: expected error code %q, got %#v", requestSpec.name, requestSpec.expectedErrorCode, payload)
		}
		if !strings.Contains(payload.Error.Message, requestSpec.expectedMessagePart) {
			t.Fatalf("%s: expected error message to contain %q, got %#v", requestSpec.name, requestSpec.expectedMessagePart, payload)
		}
	}

	latestResponse := post(RouteGetLatestProjectState, `{"projectConfigId":"project-alpha"}`)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}

	textVariantID := payload.ProjectState.ProjectConfig.SectionVariantMap["text-section"]
	textImplID := payload.ProjectState.SectionVariants[textVariantID].Impl
	textImplPayload := decodeProjectRouteRawObject(t, payload.ProjectState.SectionImpls[textImplID])
	if got := textImplPayload["textDisplayMode"]; got != "Render" {
		t.Fatalf("expected invalid display-mode requests to leave textDisplayMode unchanged, got %#v", got)
	}
	if got := textImplPayload["format"]; got != "Plaintext" {
		t.Fatalf("expected invalid format requests to leave format unchanged, got %#v", got)
	}
}

func TestRegisterProjectRoutesTextBlockMutationsUseDeploymentOverlayWhenPolicyAllows(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("text_uses_param_policy", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": textBlockRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowParamChanges":  true,
						"allowLayoutChanges": false,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteSetTextBlockText,
					strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"text-section","text":"# Overlay Heading\n\nBody"}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetTextBlockText, response.Code, response.Body.String())
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayText := decodeProjectRouteRawObject(t, overlay.Snapshot().Document.Projects["project-alpha"].Sections["text-section"].SharedModifier)
				if got := overlayText["text"]; got != "# Overlay Heading\n\nBody" {
					t.Fatalf("expected overlay text update, got %#v", got)
				}

				baseText := decodeProjectRouteRawObject(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"].Sections["text-section"].SharedModifier)
				if got := baseText["text"]; got != nil {
					t.Fatalf("expected base text block modifier unchanged, got %#v", got)
				}
			})

			t.Run("layout_uses_layout_policy", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": textBlockRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowParamChanges":  false,
						"allowLayoutChanges": true,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				for _, requestSpec := range []struct {
					route string
					body  string
				}{
					{
						route: RouteSetTextBlockDisplayMode,
						body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","textDisplayMode":"Edit"}`,
					},
					{
						route: RouteSetTextBlockFormat,
						body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","format":"Markdown"}`,
					},
					{
						route: RouteSetTextBlockMasterFontSize,
						body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","masterFontSizePx":64}`,
					},
				} {
					request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusOK {
						t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
					}
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayText := decodeProjectRouteRawObject(t, overlay.Snapshot().Document.Projects["project-alpha"].Sections["text-section"].SharedModifier)
				if got := overlayText["textDisplayMode"]; got != "Edit" {
					t.Fatalf("expected overlay textDisplayMode Edit, got %#v", got)
				}
				if got := overlayText["format"]; got != "Markdown" {
					t.Fatalf("expected overlay format Markdown, got %#v", got)
				}
				if got := overlayText["masterFontSizePx"]; got != float64(48) {
					t.Fatalf("expected overlay masterFontSizePx 48, got %#v", got)
				}

				baseText := decodeProjectRouteRawObject(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"].Sections["text-section"].SharedModifier)
				if len(baseText) != 0 {
					t.Fatalf("expected base text block modifier unchanged, got %#v", baseText)
				}
			})
		})
	}
}

func TestRegisterProjectRoutesTextBlockMutationsRejectDeploymentPolicyWhenDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("text_rejects_param_policy", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": textBlockRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowParamChanges":  false,
						"allowLayoutChanges": true,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay before rejected text mutation: %v", err)
				}
				before := overlay.Snapshot().Document.Projects["project-alpha"].Sections["text-section"]

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteSetTextBlockText,
					strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"text-section","text":"# Forbidden Heading\n\nBody"}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusForbidden {
					t.Fatalf("expected 403 for %s, got %d with body %q", RouteSetTextBlockText, response.Code, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), `"code":"param_changes_forbidden"`) {
					t.Fatalf("expected param_changes_forbidden body, got %q", response.Body.String())
				}
				if !strings.Contains(response.Body.String(), "Deployment policy disallows param changes.") {
					t.Fatalf("expected deployment param policy denial, got %q", response.Body.String())
				}

				after := overlay.Snapshot().Document.Projects["project-alpha"].Sections["text-section"]
				if !reflect.DeepEqual(after, before) {
					t.Fatalf("expected rejected text mutation to leave overlay unchanged, got %#v", after)
				}
			})

			t.Run("layout_rejects_layout_policy", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": textBlockRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowParamChanges":  true,
						"allowLayoutChanges": false,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay before rejected layout mutations: %v", err)
				}
				before := overlay.Snapshot().Document.Projects["project-alpha"].Sections["text-section"]

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				for _, requestSpec := range []struct {
					route string
					body  string
				}{
					{
						route: RouteSetTextBlockDisplayMode,
						body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","textDisplayMode":"Edit"}`,
					},
					{
						route: RouteSetTextBlockFormat,
						body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","format":"Markdown"}`,
					},
					{
						route: RouteSetTextBlockMasterFontSize,
						body:  `{"projectConfigId":"project-alpha","sectionId":"text-section","masterFontSizePx":64}`,
					},
				} {
					request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusForbidden {
						t.Fatalf("expected 403 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), `"code":"layout_changes_forbidden"`) {
						t.Fatalf("expected layout_changes_forbidden body, got %q", response.Body.String())
					}
					if !strings.Contains(response.Body.String(), "Deployment policy disallows layout changes.") {
						t.Fatalf("expected deployment layout policy denial, got %q", response.Body.String())
					}
				}

				after := overlay.Snapshot().Document.Projects["project-alpha"].Sections["text-section"]
				if !reflect.DeepEqual(after, before) {
					t.Fatalf("expected rejected layout mutations to leave overlay unchanged, got %#v", after)
				}
			})
		})
	}
}

func TestRegisterProjectRoutesTextBlockParamPolicyAppliesToAllProjectConfigs(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			projectBeta := textBlockRouteTestProject(t)
			projectBeta.ID = "project-beta"
			projectBeta.Name = "Beta"

			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: mode,
				Document: projectstate.Document{
					SchemaVersion:    projectstate.CurrentSchemaVersion,
					DefaultProjectID: "project-alpha",
					Projects: map[string]projectstate.Project{
						"project-alpha": textBlockRouteTestProject(t),
						"project-beta":  projectBeta,
					},
				},
				Policy: map[string]any{
					"allowParamChanges":  false,
					"allowLayoutChanges": true,
				},
			})
			if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
				t.Fatalf("create deployment session: %v", err)
			}

			overlay, err := deploymentRuntime.Overlay("share-a")
			if err != nil {
				t.Fatalf("deployment overlay before rejected text mutation: %v", err)
			}
			before := overlay.Snapshot().Document.Projects["project-beta"].Sections["text-section"]

			handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteSetTextBlockText,
				strings.NewReader(`{"projectConfigId":"project-beta","sectionId":"text-section","text":"blocked"}`),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, "share-a")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403 for %s on project-beta, got %d with body %q", RouteSetTextBlockText, response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"param_changes_forbidden"`) {
				t.Fatalf("expected param_changes_forbidden body for project-beta, got %q", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "Deployment policy disallows param changes.") {
				t.Fatalf("expected deployment param policy denial for project-beta, got %q", response.Body.String())
			}

			after := overlay.Snapshot().Document.Projects["project-beta"].Sections["text-section"]
			if !reflect.DeepEqual(after, before) {
				t.Fatalf("expected rejected project-beta text mutation to leave overlay unchanged, got %#v", after)
			}

			baseProjectBeta := deploymentRuntime.Base().Snapshot().Document.Projects["project-beta"].Sections["text-section"]
			if !reflect.DeepEqual(baseProjectBeta, before) {
				t.Fatalf("expected base project-beta section unchanged, got %#v", baseProjectBeta)
			}
		})
	}
}

func TestRegisterProjectRoutesSetSectionColumnWidthRejectsUnsupportedSection(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": layoutPresentationRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetSectionColumnWidth,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"plain-section","columnWidth":180}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"section_param_column_width_unsupported"`) {
		t.Fatalf("expected section_param_column_width_unsupported body, got %q", response.Body.String())
	}
}
