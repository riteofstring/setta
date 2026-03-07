package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
)

func TestRegisterProjectRoutesSetsCodegenTargetsAndReturnsProjectState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
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

	validatedTargets := make([]string, 0, 1)
	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, projectstate.CodegenTargetValidatorFunc(func(_ context.Context, target projectstate.ProjectCodegenTarget) error {
		validatedTargets = append(validatedTargets, target.Language)
		return nil
	}), nil, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"setta-fixture-backend-codegen:typescript","options":{"className":"AlphaState"}}]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectview.SingleConfig
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode project state payload: %v", err)
	}
	if payload.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha response, got %q", payload.ProjectConfig.ID)
	}
	if len(payload.ProjectConfig.CodegenTargets) != 1 {
		t.Fatalf("expected one returned codegen target, got %d", len(payload.ProjectConfig.CodegenTargets))
	}
	if string(payload.ProjectConfig.CodegenTargets[0]) != `{"language":"setta-fixture-backend-codegen:typescript","options":{"className":"AlphaState"}}` {
		t.Fatalf("unexpected returned codegen target %q", string(payload.ProjectConfig.CodegenTargets[0]))
	}
	if len(validatedTargets) != 1 || validatedTargets[0] != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("unexpected validated targets %#v", validatedTargets)
	}

	snapshot := projectRuntime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if len(project.CodegenTargets) != 1 {
		t.Fatalf("expected one persisted codegen target, got %d", len(project.CodegenTargets))
	}
	if string(project.CodegenTargets[0].Payload) != `{"language":"setta-fixture-backend-codegen:typescript","options":{"className":"AlphaState"}}` {
		t.Fatalf("unexpected persisted payload %q", string(project.CodegenTargets[0].Payload))
	}
}

func TestRegisterProjectRoutesReturnsLatestProjectStateEnvelope(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project state payload: %v", err)
	}
	if payload.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha response, got %q", payload.ProjectState.ProjectConfig.ID)
	}
	if len(payload.CompletedOpIDs) != 0 || len(payload.PendingOpIDs) != 0 {
		t.Fatalf("expected empty op ids, got completed=%#v pending=%#v", payload.CompletedOpIDs, payload.PendingOpIDs)
	}
}

func TestRegisterProjectRoutesDisablesPythonCodegenAndReturnsCleanedProjectState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{
						Language: string(projectstate.CodeLanguagePython),
						Payload:  projectstate.RawJSON(`{"language":"python","generateMetadata":true}`),
					},
				},
				GeneratedCodeBinding: &projectstate.CodeFileBinding{
					Path:       "code/sections/alpha/setta_gen.py",
					AccessMode: projectstate.CodeFileAccessModeReadOnly,
				},
				GeneratedMetadataBinding: &projectstate.CodeFileBinding{
					Path:       "code/sections/alpha/setta_gen_meta.py",
					AccessMode: projectstate.CodeFileAccessModeReadOnly,
				},
				EntryCodeBlockID:   "gen-python-section",
				TopLevelSectionIDs: []string{"manual-section", "gen-python-section", "gen-python-metadata-section"},
				SectionVariantMap: map[string]string{
					"manual-section":              "manual-variant",
					"gen-python-section":          "gen-python-variant",
					"gen-python-metadata-section": "gen-python-metadata-variant",
				},
				Sections: map[string]projectstate.Section{
					"manual-section": {
						ID:               "manual-section",
						Name:             "Manual",
						VariantIDs:       []string{"manual-variant"},
						DefaultVariantID: "manual-variant",
					},
					"gen-python-section": {
						ID:               "gen-python-section",
						Name:             "Generated Python",
						VariantIDs:       []string{"gen-python-variant"},
						DefaultVariantID: "gen-python-variant",
					},
					"gen-python-metadata-section": {
						ID:               "gen-python-metadata-section",
						Name:             "Generated Python Metadata",
						VariantIDs:       []string{"gen-python-metadata-variant"},
						DefaultVariantID: "gen-python-metadata-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"manual-variant": {
						ID:     "manual-variant",
						ImplID: "manual-impl",
					},
					"gen-python-variant": {
						ID:     "gen-python-variant",
						ImplID: "gen-python-impl",
					},
					"gen-python-metadata-variant": {
						ID:     "gen-python-metadata-variant",
						ImplID: "gen-python-metadata-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"manual-impl": {
						ID:   "manual-impl",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
					},
					"gen-python-impl": {
						ID:   "gen-python-impl",
						Kind: projectstate.SectionKindGenerated,
						Generated: &projectstate.GeneratedSectionImpl{
							Kind: projectstate.GeneratedSectionKindPythonCode,
						},
					},
					"gen-python-metadata-impl": {
						ID:   "gen-python-metadata-impl",
						Kind: projectstate.SectionKindGenerated,
						Generated: &projectstate.GeneratedSectionImpl{
							Kind: projectstate.GeneratedSectionKindPythonMetadata,
						},
					},
				},
			},
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
		return nil
	}), nil, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectview.SingleConfig
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode project state payload: %v", err)
	}
	if len(payload.ProjectConfig.CodegenTargets) != 0 {
		t.Fatalf("expected codegen targets to be cleared, got %#v", payload.ProjectConfig.CodegenTargets)
	}
	if payload.ProjectConfig.EntryCodeBlockID != nil {
		t.Fatalf("expected entry code block id to be cleared, got %q", *payload.ProjectConfig.EntryCodeBlockID)
	}
	if payload.SingletonSections.GenPythonCode != nil {
		t.Fatalf("expected generated python singleton to be cleared, got %q", *payload.SingletonSections.GenPythonCode)
	}
	if payload.SingletonSections.GenPythonMetadata != nil {
		t.Fatalf("expected generated python metadata singleton to be cleared, got %q", *payload.SingletonSections.GenPythonMetadata)
	}
	if payload.GenCodeBinding != nil {
		t.Fatalf("expected generated code binding to be cleared, got %#v", payload.GenCodeBinding)
	}

	snapshot := projectRuntime.Snapshot()
	project := snapshot.Document.Projects["project-alpha"]
	if _, ok := project.Sections["gen-python-section"]; ok {
		t.Fatal("expected generated python section to be removed from runtime state")
	}
}

func TestRegisterProjectRoutesRejectsInvalidCodegenTargetPayload(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
		return nil
	}), nil, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[[]]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_project_codegen_targets"`) {
		t.Fatalf("expected invalid_project_codegen_targets error, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesEnablesPythonCodegenAndReturnsGeneratedSingletonSections(t *testing.T) {
	t.Parallel()

	settaFilesRoot := filepath.Join(t.TempDir(), "setta_files")
	runtimeRoot := filepath.Join(settaFilesRoot, "runtime")
	materializer, err := codegen.NewPythonMaterializer(codegen.PythonMaterializerOptions{
		SettaFilesRoot: settaFilesRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("new python materializer: %v", err)
	}

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:                 "project-alpha",
				Name:               "Alpha",
				TopLevelSectionIDs: []string{"section-1"},
				SectionVariantMap: map[string]string{
					"section-1": "section-variant-1",
				},
				Sections: map[string]projectstate.Section{
					"section-1": {
						ID:               "section-1",
						Name:             "Greeting",
						VariantIDs:       []string{"section-variant-1"},
						DefaultVariantID: "section-variant-1",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"section-variant-1": {
						ID:     "section-variant-1",
						ImplID: "section-impl-1",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"section-impl-1": {
						ID:   "section-impl-1",
						Kind: projectstate.SectionKind("text_block"),
						Payload: projectstate.RawJSON(
							`{"id":"section-impl-1","type":"TextBlock","text":"hello world"}`,
						),
					},
				},
				ViewModes: map[string]projectstate.ViewMode{
					"focus": {
						ID: "focus",
					},
				},
			},
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

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error {
		return nil
	}), materializer, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[{"language":"python","genCodePrefix":"import math","generateMetadata":true}]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectview.SingleConfig
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode project state payload: %v", err)
	}
	if got := derefString(payload.SingletonSections.GenPythonCode); got != projectstate.GeneratedPythonCodeSectionID {
		t.Fatalf("expected generated python singleton %q, got %q", projectstate.GeneratedPythonCodeSectionID, got)
	}
	if got := derefString(payload.SingletonSections.GenPythonMetadata); got != projectstate.GeneratedPythonMetadataSectionID {
		t.Fatalf("expected generated python metadata singleton %q, got %q", projectstate.GeneratedPythonMetadataSectionID, got)
	}
	if payload.GenCodeBinding == nil {
		t.Fatal("expected generated code binding in response")
	}
	if payload.GenCodeBinding.CanonicalPath != projectstate.GeneratedPythonCodeRelativePath("Alpha") {
		t.Fatalf("unexpected generated code binding path %q", payload.GenCodeBinding.CanonicalPath)
	}

	codeVariantID := payload.ProjectConfig.SectionVariantMap[projectstate.GeneratedPythonCodeSectionID]
	codeImplID := payload.SectionVariants[codeVariantID].Impl
	codePayload := string(payload.SectionImpls[codeImplID])
	if !strings.Contains(codePayload, `"type":"GenPythonCode"`) {
		t.Fatalf("expected generated python impl payload, got %q", codePayload)
	}
	if !strings.Contains(codePayload, `state.Greeting = 'hello world'`) {
		t.Fatalf("expected generated python body assignment, got %q", codePayload)
	}

	metaVariantID := payload.ProjectConfig.SectionVariantMap[projectstate.GeneratedPythonMetadataSectionID]
	metaImplID := payload.SectionVariants[metaVariantID].Impl
	metaPayload := string(payload.SectionImpls[metaImplID])
	if !strings.Contains(metaPayload, `"type":"GenPythonMetadata"`) {
		t.Fatalf("expected generated python metadata impl payload, got %q", metaPayload)
	}
	if !strings.Contains(metaPayload, `class SettaGenMetadata:`) {
		t.Fatalf("expected generated metadata code in payload, got %q", metaPayload)
	}
}

func TestRegisterProjectRoutesBlocksDeploymentMode(t *testing.T) {
	t.Parallel()

	handler := newProjectRouteTestHandler(t, config.ModeShare, nil, nil, nil, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetProjectConfigCodegenTargets,
		strings.NewReader(`{"projectConfigId":"project-alpha","codegenTargets":[]}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden error, got %q", response.Body.String())
	}
}

func TestRegisterProjectRoutesSetsCallableAndPersistsUpdatedProjectState(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": callableRouteTestProject(t),
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

	handler := newProjectRouteTestHandler(
		t,
		config.ModeIDE,
		projectRuntime,
		nil,
		nil,
		projectstate.CallableSignatureResolver(&stubProjectRouteCallableSignatureResolver{
			result: projectstate.CallableSignatureResult{
				Documentation: "Sort values.",
				Status:        projectstate.SignatureHelpStatusMatched,
				Params: []projectstate.CallableParamProposal{
					{
						Name:         "iterable",
						Description:  "Values to sort.",
						PassingStyle: "POSITIONAL_ONLY",
					},
					{
						Name:         "reverse",
						DefaultValue: "False",
						Description:  "Descending order flag.",
						PassingStyle: "KEYWORD_ONLY",
					},
				},
			},
			ok: true,
		}),
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetCallable,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"callable-section","callableName":"sorted","refetchParams":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload projectstate.SetCallableResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode set callable payload: %v", err)
	}
	if payload.CallableID == nil || *payload.CallableID != "callable-2" {
		t.Fatalf("expected callable-2 response, got %#v", payload.CallableID)
	}
	if payload.LSPStatus != projectstate.SignatureHelpStatusMatched {
		t.Fatalf("expected matched status, got %q", payload.LSPStatus)
	}
	if len(payload.ChildCodeObjs) != 2 {
		t.Fatalf("expected two child params, got %#v", payload.ChildCodeObjs)
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
	callableVariantID := latestPayload.ProjectState.ProjectConfig.SectionVariantMap["callable-section"]
	callableImplID := latestPayload.ProjectState.SectionVariants[callableVariantID].Impl
	callableImplPayload := string(latestPayload.ProjectState.SectionImpls[callableImplID])
	if !strings.Contains(callableImplPayload, `"callable":"callable-2"`) {
		t.Fatalf("expected callable-2 in persisted payload, got %q", callableImplPayload)
	}
}

func newProjectRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	validator projectstate.CodegenTargetValidator,
	pythonReconciler projectstate.PythonCodegenSectionReconciler,
	callableResolver projectstate.CallableSignatureResolver,
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

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterProjectRoutes(r, ProjectRouteDependencies{
				ModePolicy:                     modes.NewPolicy(mode),
				ProjectState:                   projectRuntime,
				CodegenTargetValidator:         validator,
				PythonCodegenSectionReconciler: pythonReconciler,
				CallableSignatures:             callableResolver,
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

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

type stubProjectRouteCallableSignatureResolver struct {
	result projectstate.CallableSignatureResult
	ok     bool
	err    error
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
