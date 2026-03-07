package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/lsp"
	"setta/internal/lspcompletion"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

// The Go-owned completion routes should accept the existing frontend payloads,
// run real fixture-language-server completions, and clean up temp snapshots.
func TestRegisterLSPRoutesServesSnapshotCompletionEndpoints(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	projectRuntime := completionRouteTestRuntime(t)
	defer func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	}()

	completions, closeCompletions := newFixtureLSPCompletionService(t, settaFilesRoot, 0)
	defer closeCompletions()

	handler := newCompletionRouteTestHandler(t, config.ModeIDE, projectRuntime, completions)
	cases := []struct {
		name           string
		path           string
		body           string
		expectNullBody bool
		expectLabel    string
	}{
		{
			name:        "code area completion",
			path:        RouteCodeAreaCompletion,
			body:        `{"projectConfigId":"project-alpha","sectionId":"code-section","fullText":"fixture.","position":8}`,
			expectLabel: "fixtureCompletion",
		},
		{
			name:        "text field completion",
			path:        RouteTextFieldCompletion,
			body:        `{"projectConfigId":"project-alpha","sectionId":"callable-section","paramInfoId":"param-1","fullText":"fixture.","position":8}`,
			expectLabel: "fixtureCompletion",
		},
		{
			name:        "output accessor completion",
			path:        RouteOutputAccessorCompletion,
			body:        `{"projectConfigId":"project-alpha","sectionId":"callable-section","fullText":".branch","position":7}`,
			expectLabel: "fixtureCompletion",
		},
		{
			name:        "gen code prefix completion",
			path:        RouteGenCodePrefixCompletion,
			body:        `{"projectConfigId":"project-alpha","fullText":"fixture.","position":8}`,
			expectLabel: "fixtureCompletion",
		},
		{
			name:        "gen code suffix completion",
			path:        RouteGenCodeSuffixCompletion,
			body:        `{"projectConfigId":"project-alpha","fullText":"fixture.","position":8}`,
			expectLabel: "fixtureCompletion",
		},
		{
			name:           "clear text field completion",
			path:           RouteClearTextFieldCompletion,
			body:           `{"projectConfigId":"project-alpha","sectionId":"callable-section","paramInfoId":"param-1"}`,
			expectNullBody: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+tc.path,
				strings.NewReader(tc.body),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
			}
			if tc.expectNullBody {
				if strings.TrimSpace(response.Body.String()) != "null" {
					t.Fatalf("expected null response body, got %q", response.Body.String())
				}
			} else {
				var payload []lspcompletion.CodeMirrorCompletion
				if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
					t.Fatalf("decode completion payload: %v", err)
				}
				if len(payload) != 1 || payload[0].Label != tc.expectLabel {
					t.Fatalf("unexpected completion payload %#v", payload)
				}
			}

			assertNoLSPRouteTempFiles(t, filepath.Join(settaFilesRoot, "code", "sections", "Alpha"), "*__*.py")
		})
	}
}

// Completion routes should stay IDE-only just like diagnostics routes.
func TestRegisterLSPRoutesRejectsShareModeCompletionRequests(t *testing.T) {
	t.Parallel()

	handler := newLSPRouteTestHandler(t, config.ModeShare, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCodeAreaCompletion,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"code-section","fullText":"fixture.","position":8}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
}

func completionRouteTestRuntime(t *testing.T) *projectstate.Runtime {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []projectstate.ProjectCodegenTarget{
					{Language: string(projectstate.CodeLanguagePython)},
				},
				TopLevelSectionIDs: []string{"code-section", "callable-section"},
				SectionVariantMap: map[string]string{
					"code-section":     "code-variant-1",
					"callable-section": "callable-variant-1",
				},
				Sections: map[string]projectstate.Section{
					"code-section": {
						ID:               "code-section",
						Name:             "Editor",
						VariantIDs:       []string{"code-variant-1"},
						DefaultVariantID: "code-variant-1",
					},
					"callable-section": {
						ID:               "callable-section",
						Name:             "CallSection",
						VariantIDs:       []string{"callable-variant-1"},
						DefaultVariantID: "callable-variant-1",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"code-variant-1": {
						ID:     "code-variant-1",
						ImplID: "code-impl-1",
					},
					"callable-variant-1": {
						ID:     "callable-variant-1",
						ImplID: "callable-impl-1",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"code-impl-1": {
						ID:   "code-impl-1",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
						},
						Payload: projectstate.RawJSON(`{
							"id":"code-impl-1",
							"type":"Code",
							"code":"print('editor')\n",
							"codeLanguage":"python",
							"children":[]
						}`),
					},
					"callable-impl-1": {
						ID:   "callable-impl-1",
						Kind: projectstate.SectionKind("callable"),
						Payload: projectstate.RawJSON(`{
							"id":"callable-impl-1",
							"type":"Callable",
							"callable":"callable-1",
							"codeObjVariantMap":{
								"callable-1":"callable-variant-1",
								"param-1":"param-variant-1"
							}
						}`),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"callable-1": {
						ID:               "callable-1",
						Name:             "MissingFunc",
						VariantIDs:       []string{"callable-variant-1"},
						DefaultVariantID: "callable-variant-1",
					},
					"param-1": {
						ID:               "param-1",
						Name:             "param",
						VariantIDs:       []string{"param-variant-1"},
						DefaultVariantID: "param-variant-1",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"callable-variant-1": {
						ID:     "callable-variant-1",
						ImplID: "callable-codeobj-impl-1",
					},
					"param-variant-1": {
						ID:     "param-variant-1",
						ImplID: "param-impl-1",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"callable-codeobj-impl-1": {
						ID:      "callable-codeobj-impl-1",
						Type:    "CodeCallable",
						Payload: projectstate.RawJSON(`{"id":"callable-codeobj-impl-1","type":"CodeCallable","children":["param-1"]}`),
					},
					"param-impl-1": {
						ID:      "param-impl-1",
						Type:    "CodeParam",
						Payload: projectstate.RawJSON(`{"id":"param-impl-1","type":"CodeParam","value":"value"}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize completion route document: %v", err)
	}

	runtime, err := projectstate.OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	return runtime
}

func newCompletionRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	projectRuntime *projectstate.Runtime,
	completions *lspcompletion.Service,
) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterLSPRoutes(r, LSPRouteDependencies{
				ModePolicy:   modes.NewPolicy(mode),
				ProjectState: projectRuntime,
				Diagnostics:  projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{}),
				Completions:  completions,
			}); err != nil {
				t.Fatalf("register lsp routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newFixtureLSPCompletionService(
	t *testing.T,
	settaFilesRoot string,
	delayMS int,
) (*lspcompletion.Service, func()) {
	t.Helper()

	pythonBinary := resolveRouteTestPythonBinary(t)
	fixtureServerPath := filepath.Join(
		routeTestRepoRoot(t),
		"tests",
		"fixtures",
		"plugins",
		"backend-language-server-e2e",
		"backend",
		"mini_language_server.py",
	)
	session, err := lsp.NewSession(lsp.SessionOptions{
		WorkspaceRoot: settaFilesRoot,
		Command:       pythonBinary,
		Args:          []string{fixtureServerPath},
		Environment:   append(os.Environ(), "FIXTURE_COMPLETION_DELAY_MS="+strconv.Itoa(delayMS)),
	})
	if err != nil {
		t.Fatalf("new route lsp session: %v", err)
	}
	lspService := lsp.NewService(session)
	service, err := lspcompletion.NewService(lspcompletion.ServiceOptions{
		SettaFilesRoot: settaFilesRoot,
		LSPService:     lspService,
	})
	if err != nil {
		t.Fatalf("new route completion service: %v", err)
	}
	return service, func() {
		if err := lspService.Close(context.Background()); err != nil {
			t.Fatalf("close route completion service: %v", err)
		}
	}
}

func resolveRouteTestPythonBinary(t *testing.T) string {
	t.Helper()

	for _, candidate := range []string{"python3", "python"} {
		resolved, err := exec.LookPath(candidate)
		if err == nil {
			return resolved
		}
	}
	t.Fatal("python binary not found in PATH")
	return ""
}

func routeTestRepoRoot(t *testing.T) string {
	t.Helper()

	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("resolve repo root: %v", err)
	}
	return root
}

func assertNoLSPRouteTempFiles(t *testing.T, root string, pattern string) {
	t.Helper()

	matches, err := filepath.Glob(filepath.Join(root, pattern))
	if err != nil {
		t.Fatalf("glob lsp route temp files: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("expected no lsp route temp files, found %v", matches)
	}
}
