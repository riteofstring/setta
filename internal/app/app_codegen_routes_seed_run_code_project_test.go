package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
	"setta/internal/terminals"
	"setta/internal/testutil/firstpartyplugin"
	"setta/internal/watchcodecontracts"
)

func seedAppRunCodeProject(t *testing.T, app *App, cfg config.Config, source string) {
	t.Helper()

	codeRoot := filepath.Join(cfg.Paths.SettaFilesRoot, "code")
	if err := os.MkdirAll(codeRoot, 0o755); err != nil {
		t.Fatalf("mkdir code root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.py"), []byte(source), 0o644); err != nil {
		t.Fatalf("write run.py: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "run.sh"), []byte("echo APP_BASH_OK\n"), 0o644); err != nil {
		t.Fatalf("write run.sh: %v", err)
	}
	if err := os.WriteFile(filepath.Join(codeRoot, "helper.py"), []byte("print('helper')\n"), 0o644); err != nil {
		t.Fatalf("write helper.py: %v", err)
	}

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:               "project-alpha",
			Name:             "Alpha",
			EntryCodeBlockID: "code-section",
			TopLevelSectionIDs: []string{
				"code-section",
				"helper-section",
				"draw-section",
			},
			SectionVariantMap: map[string]string{
				"code-section":   "code-python-variant",
				"helper-section": "helper-variant",
				"draw-section":   "draw-variant",
			},
			Sections: map[string]projectstate.Section{
				"code-section": {
					ID:               "code-section",
					Name:             "Runner",
					VariantIDs:       []string{"code-python-variant", "code-bash-variant"},
					DefaultVariantID: "code-python-variant",
				},
				"helper-section": {
					ID:               "helper-section",
					Name:             "Helper",
					VariantIDs:       []string{"helper-variant"},
					DefaultVariantID: "helper-variant",
				},
				"draw-section": {
					ID:               "draw-section",
					Name:             "Canvas",
					VariantIDs:       []string{"draw-variant"},
					DefaultVariantID: "draw-variant",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"code-python-variant": {
					ID:     "code-python-variant",
					ImplID: "code-python-impl",
				},
				"code-bash-variant": {
					ID:     "code-bash-variant",
					ImplID: "code-bash-impl",
				},
				"helper-variant": {
					ID:     "helper-variant",
					ImplID: "helper-impl",
				},
				"draw-variant": {
					ID:     "draw-variant",
					ImplID: "draw-impl",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"code-python-impl": {
					ID:   "code-python-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "code/run.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
				},
				"code-bash-impl": {
					ID:   "code-bash-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguageBash,
						Binding: &projectstate.CodeFileBinding{
							Path:       "code/run.sh",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
				},
				"helper-impl": {
					ID:   "helper-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "code/helper.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
				},
				"draw-impl": {
					ID:   "draw-impl",
					Kind: projectstate.SectionKindDraw,
					Draw: &projectstate.DrawSectionImpl{},
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}
	if _, err := app.ProjectStates().Main().Save(context.Background()); err != nil {
		t.Fatalf("save project runtime: %v", err)
	}
}

func seedAppLSPCodeSectionProject(t *testing.T, app *App) {
	t.Helper()

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "print('runner')\n")
}

func seedAppLSPCodeSectionProjectWithSource(t *testing.T, app *App, source string) {
	t.Helper()

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, source)
}

func seedAppLSPCodeSectionProjectWithLanguage(t *testing.T, app *App, language projectstate.CodeLanguage, source string) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			SectionVariantMap: map[string]string{
				"runner": "runner-variant",
			},
			Sections: map[string]projectstate.Section{
				"runner": {
					ID:               "runner",
					Name:             "Runner",
					VariantIDs:       []string{"runner-variant"},
					DefaultVariantID: "runner-variant",
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"runner-variant": {
					ID:     "runner-variant",
					ImplID: "runner-impl",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"runner-impl": {
					ID:   "runner-impl",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: language,
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":           "runner-impl",
						"type":         "Code",
						"code":         source,
						"codeLanguage": string(language),
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate lsp code section project: %v", err)
	}
}

func seedAppPythonCodegenProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:                    "project-alpha",
			Name:                  "Alpha",
			EntryCodeBlockID:      "section-1",
			ShowParamDisplayNames: true,
			PreviewImgColor:       "#112233",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload: mustAppJSON(t, map[string]any{
						"language":         string(projectstate.CodeLanguagePython),
						"generateMetadata": true,
					}),
				},
			},
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
					Name:   "Greeting Variant",
					ImplID: "section-impl-1",
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"section-impl-1": {
					ID:   "section-impl-1",
					Kind: projectstate.SectionKind("text_block"),
					Payload: mustAppJSON(t, map[string]any{
						"id":   "section-impl-1",
						"type": "TextBlock",
						"text": "hello world",
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		return document, nil
	}); err != nil {
		t.Fatalf("mutate project runtime: %v", err)
	}
}

func seedAppWatchCodeBoundSectionProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  mustAppJSON(t, map[string]any{"language": string(projectstate.CodeLanguagePython)}),
				},
			},
			SectionVariantMap: map[string]string{
				"section-main": "variant-main",
			},
			Sections: map[string]projectstate.Section{
				"section-main": {
					ID:               "section-main",
					Name:             "Main",
					VariantIDs:       []string{"variant-main"},
					DefaultVariantID: "variant-main",
					UnsharedKeys:     []string{"code"},
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"variant-main": {
					ID:               "variant-main",
					ImplID:           "impl-main",
					NonPresetImplIDs: []string{"impl-main"},
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"impl-main": {
					ID:   "impl-main",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "pkg/bound.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":   "impl-main",
						"type": "Code",
						"code": "def existing(value):\n    return value\n",
						"codeFileBinding": map[string]any{
							"canonical_path": "pkg/bound.py",
							"access_mode":    "read_write",
						},
						"codeLanguage": "python",
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
			Files: []string{"pkg/bound.py"},
		})
		return document, nil
	}); err != nil {
		t.Fatalf("mutate watch code bound section project: %v", err)
	}
}

func appWatchCodeCallableRegistryProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
				UnsharedKeys:     []string{"callable", "codeObjVariantMap"},
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant": {
				ID:     "callable-variant",
				ImplID: "callable-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl": {
				ID:   "callable-impl",
				Kind: projectstate.SectionKind("callable"),
				Payload: mustAppJSON(t, map[string]any{
					"id":       "callable-impl",
					"type":     "Callable",
					"callable": "seed-callable",
					"codeObjVariantMap": map[string]string{
						"seed-callable":   "seed-callable-variant",
						"target-callable": "target-callable-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"seed-callable": {
				ID:               "seed-callable",
				Name:             "seed_callable",
				VariantIDs:       []string{"seed-callable-variant"},
				DefaultVariantID: "seed-callable-variant",
			},
			"target-callable": {
				ID:               "target-callable",
				Name:             "target_callable",
				VariantIDs:       []string{"target-callable-variant"},
				DefaultVariantID: "target-callable-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"seed-callable-variant": {
				ID:     "seed-callable-variant",
				ImplID: "seed-callable-impl",
			},
			"target-callable-variant": {
				ID:     "target-callable-variant",
				ImplID: "target-callable-impl",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"seed-callable-impl": {
				ID:      "seed-callable-impl",
				Type:    "CodeCallable",
				Payload: mustAppJSON(t, map[string]any{"id": "seed-callable-impl", "type": "CodeCallable", "children": []string{}}),
			},
			"target-callable-impl": {
				ID:      "target-callable-impl",
				Type:    "CodeCallable",
				Payload: mustAppJSON(t, map[string]any{"id": "target-callable-impl", "type": "CodeCallable", "children": []string{}}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize callable registry project: %v", err)
	}
	return project
}

func seedAppRootWatchCodeBoundSectionProject(t *testing.T, app *App) {
	t.Helper()

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
			CodegenTargets: []projectstate.ProjectCodegenTarget{
				{
					Language: string(projectstate.CodeLanguagePython),
					Payload:  mustAppJSON(t, map[string]any{"language": string(projectstate.CodeLanguagePython)}),
				},
			},
			SectionVariantMap: map[string]string{
				"section-main": "variant-main",
			},
			Sections: map[string]projectstate.Section{
				"section-main": {
					ID:               "section-main",
					Name:             "Main",
					VariantIDs:       []string{"variant-main"},
					DefaultVariantID: "variant-main",
					UnsharedKeys:     []string{"code"},
				},
			},
			SectionVariants: map[string]projectstate.SectionVariant{
				"variant-main": {
					ID:               "variant-main",
					ImplID:           "impl-main",
					NonPresetImplIDs: []string{"impl-main"},
				},
			},
			SectionImpls: map[string]projectstate.SectionImpl{
				"impl-main": {
					ID:   "impl-main",
					Kind: projectstate.SectionKindCode,
					Code: &projectstate.CodeSectionImpl{
						Language: projectstate.CodeLanguagePython,
						Binding: &projectstate.CodeFileBinding{
							Path:       "watch_code_test.py",
							AccessMode: projectstate.CodeFileAccessModeReadWrite,
						},
					},
					Payload: mustAppJSON(t, map[string]any{
						"id":   "impl-main",
						"type": "Code",
						"code": "",
						"codeFileBinding": map[string]any{
							"canonical_path": "watch_code_test.py",
							"access_mode":    "read_write",
						},
						"codeLanguage": "python",
						"children":     []string{},
					}),
				},
			},
		}
		document.DefaultProjectID = "project-alpha"
		setAppWatchCodePluginProjectData(t, &document, "project-alpha", projectstate.WatchCodePluginProjectData{
			Files: []string{"watch_code_test.py"},
		})
		return document, nil
	}); err != nil {
		t.Fatalf("mutate root watch code bound section project: %v", err)
	}
}

func prepareAppLSPFixture(t *testing.T) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	t.Setenv("SETTA_LSP_COMMAND", appTestWorkerPython(t, repoRoot))
	t.Setenv(
		"SETTA_LSP_ARGS",
		filepath.Join(
			repoRoot,
			"tests",
			"fixtures",
			"lsp",
			"mini_language_server.py",
		),
	)
}

func writeAppGeneratedPythonCodeFixture(t *testing.T, cfg config.Config, projectName string) {
	t.Helper()

	codePath := filepath.Join(
		cfg.Paths.SettaFilesRoot,
		filepath.FromSlash(projectstate.GeneratedPythonCodeRelativePath(projectName)),
	)
	if err := os.MkdirAll(filepath.Dir(codePath), 0o755); err != nil {
		t.Fatalf("mkdir generated python code dir: %v", err)
	}
	if err := os.WriteFile(codePath, []byte("class SettaState:\n    pass\n"), 0o644); err != nil {
		t.Fatalf("write generated python code fixture: %v", err)
	}
}

func prepareAppFirstPartyBasedpyrightPlugin(t *testing.T, cfg config.Config) {
	t.Helper()

	t.Setenv("SETTA_PYTHON", firstpartyplugin.BasedpyrightPython(t))
	installAppRepoPlugin(t, cfg, "setta-basedpyright")
}

func prepareAppPluginLanguageServerFixture(t *testing.T) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	t.Setenv("SETTA_PLUGIN_FIXTURE_PYTHON", appTestWorkerPython(t, repoRoot))
	t.Setenv(
		"SETTA_PLUGIN_FIXTURE_LSP_SCRIPT",
		filepath.Join(
			repoRoot,
			"tests",
			"fixtures",
			"lsp",
			"mini_language_server.py",
		),
	)
}

func installAppLanguageServerOnlyFixturePlugin(t *testing.T, cfg config.Config) {
	t.Helper()

	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	rewriteAppPluginManifest(t, filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})
}

func installAppWatchCodeProviderFixture(t *testing.T, cfg config.Config) {
	t.Helper()

	installAppWatchCodeProviderFixtureWithRouteSuffixes(t, cfg, watchcodecontracts.BackendRouteSuffixes())
}

func installAppWatchCodeProviderFixtureWithRouteSuffixes(t *testing.T, cfg config.Config, suffixes []string) string {
	t.Helper()

	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	pluginRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend")
	writeAppFixtureWatchCodeBackendRoutes(t, pluginRoot, suffixes)
	writeAppFixtureWatchCodeBackendUISettings(t, pluginRoot)
	rewriteAppPluginManifest(t, pluginRoot, func(payload map[string]any) {
		enableAppPluginManifestWatchCodeProvider(payload)
	})
	return pluginRoot
}

func enableAppPluginManifestWatchCodeProvider(payload map[string]any) {
	ensureAppPluginManifestCapability(payload, "registerWatchCodeBackend")
	ensureAppPluginManifestCapability(payload, "registerRouter")
	featureCapabilities, ok := payload["featureCapabilities"].(map[string]any)
	if !ok {
		featureCapabilities = map[string]any{}
		payload["featureCapabilities"] = featureCapabilities
	}
	featureCapabilities["watchCode"] = map[string]any{}
}

func writeAppFixtureWatchCodeBackendRoutes(
	t *testing.T,
	pluginRoot string,
	suffixes []string,
) {
	t.Helper()

	backendPath := filepath.Join(pluginRoot, "backend", "main.go")
	content, err := os.ReadFile(backendPath)
	if err != nil {
		t.Fatalf("read backend fixture source: %v", err)
	}
	routeEntries := make([]string, 0, len(suffixes))
	for _, suffix := range suffixes {
		routeEntries = append(routeEntries, fmt.Sprintf(
			"{\"path\": %q, \"methods\": []string{\"POST\"}}",
			watchcodecontracts.BackendRoutePath(testAppWatchCodeProviderPluginID, suffix),
		))
	}
	const marker = `"routes": []map[string]any{`
	if len(routeEntries) == 0 {
		if !strings.Contains(string(content), marker) {
			t.Fatalf("failed to find backend routes marker in %s", backendPath)
		}
		return
	}
	replacement := marker
	replacement += "\n\t\t\t\t" + strings.Join(routeEntries, ",\n\t\t\t\t") + ","
	next := strings.Replace(string(content), marker, replacement, 1)
	if next == string(content) {
		t.Fatalf("failed to insert Watch Code backend routes into %s", backendPath)
	}
	if err := os.WriteFile(backendPath, []byte(next), 0o644); err != nil {
		t.Fatalf("write backend fixture source: %v", err)
	}
}

func writeAppFixtureWatchCodeBackendUISettings(t *testing.T, pluginRoot string) {
	t.Helper()

	backendPath := filepath.Join(pluginRoot, "backend", "main.go")
	content, err := os.ReadFile(backendPath)
	if err != nil {
		t.Fatalf("read backend fixture source: %v", err)
	}
	const marker = `"staticDirs": []map[string]any{`
	uiSettings := fmt.Sprintf(`"uiSettings": []map[string]any{
				{
					"id":             %q,
					"title":          "Watch Code Folders",
					"description":    "List of folders watched by Watch Code.",
					"synonyms":       []string{"watch folders", "watch code folders"},
					"revealKey":      "watch-code-settings",
					"mutability":     "writable",
					"valueSchema":    map[string]any{"type": "array"},
					"readHandlerId":  %q,
					"writeHandlerId": %q,
				},
				{
					"id":             %q,
					"title":          "Watch Code Files",
					"description":    "List of explicit files watched by Watch Code.",
					"synonyms":       []string{"watch files", "watch code files"},
					"revealKey":      "watch-code-settings",
					"mutability":     "writable",
					"valueSchema":    map[string]any{"type": "array"},
					"readHandlerId":  %q,
					"writeHandlerId": %q,
				},
			},
			`,
		watchcodecontracts.BackendLocalSettingIDFolders,
		watchcodecontracts.BackendReadHandlerIDFolders,
		watchcodecontracts.BackendWriteHandlerIDFolders,
		watchcodecontracts.BackendLocalSettingIDFiles,
		watchcodecontracts.BackendReadHandlerIDFiles,
		watchcodecontracts.BackendWriteHandlerIDFiles,
	)
	replacement := uiSettings + marker
	next := strings.Replace(string(content), marker, replacement, 1)
	if next == string(content) {
		t.Fatalf("failed to insert Watch Code backend UI settings into %s", backendPath)
	}
	if err := os.WriteFile(backendPath, []byte(next), 0o644); err != nil {
		t.Fatalf("write backend fixture source: %v", err)
	}
}

func ensureAppPluginManifestCapability(payload map[string]any, capability string) {
	capabilities := map[string]struct{}{}
	switch values := payload["capabilities"].(type) {
	case []any:
		for _, value := range values {
			capability, ok := value.(string)
			if !ok {
				continue
			}
			capabilities[capability] = struct{}{}
		}
	case []string:
		for _, capability := range values {
			capabilities[capability] = struct{}{}
		}
	}
	capabilities[capability] = struct{}{}

	next := make([]string, 0, len(capabilities))
	for capability := range capabilities {
		next = append(next, capability)
	}
	slices.Sort(next)
	payload["capabilities"] = next
}

func prepareAppCurrentSession(t *testing.T, cfg config.Config) {
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

func buildAppBinaryUploadBody(t *testing.T, payload []byte, durable string) (*bytes.Buffer, string) {
	t.Helper()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	fileWriter, err := writer.CreateFormFile("file", "snapshot.png")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := fileWriter.Write(payload); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.WriteField("durable", durable); err != nil {
		t.Fatalf("write durable field: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	return body, writer.FormDataContentType()
}

func mustAppJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()

	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal app test json: %v", err)
	}
	return payload
}

func quietAppTestCatCommand(t *testing.T) []string {
	t.Helper()

	shell := requireAppTestCommand(t, "sh")
	return []string{shell, "-c", "stty -echo; cat"}
}

func interactiveAppTestBashCommand(t *testing.T) []string {
	t.Helper()

	bash := requireAppTestCommand(t, "bash")
	return []string{bash, "--noprofile", "--norc", "-i"}
}

func attachAppTestTerminal(t *testing.T, service *terminals.Service, sessionID string) *terminals.Attachment {
	t.Helper()

	attachment, err := service.Attach(sessionID)
	if err != nil {
		t.Fatalf("attach terminal %q: %v", sessionID, err)
	}
	t.Cleanup(attachment.Close)
	return attachment
}

func prepareAppInterruptShell(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment) {
	t.Helper()

	if err := service.Write(sessionID, []byte("set -m\nstty -echo\nprintf 'READY\\n'\n")); err != nil {
		t.Fatalf("prepare interactive shell: %v", err)
	}
	output := waitForAppTestOutputContains(t, service, sessionID, attachment, "READY")
	if !strings.Contains(output, "READY") {
		t.Fatalf("expected shell readiness output, got %q", output)
	}
}

func writeAppInterruptibleScript(t *testing.T) string {
	t.Helper()

	scriptPath := filepath.Join(t.TempDir(), "interruptible-child.sh")
	script := strings.Join([]string{
		"#!/bin/sh",
		"trap 'printf \"CHILD_INTERRUPTED\\n\"; exit 130' INT",
		"printf 'CHILD_RUNNING\\n'",
		"while :; do sleep 1; done",
		"",
	}, "\n")
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write interruptible script: %v", err)
	}
	return scriptPath
}

func startAppInterruptibleForegroundJob(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment, scriptPath string) {
	t.Helper()

	command := "sh " + shellSingleQuoteApp(scriptPath) + "; printf 'CHILD_EXIT:%s\\n' \"$?\"\n"
	if err := service.Write(sessionID, []byte(command)); err != nil {
		t.Fatalf("start foreground job: %v", err)
	}
	output := waitForAppTestOutputContains(t, service, sessionID, attachment, "CHILD_RUNNING")
	if !strings.Contains(output, "CHILD_RUNNING") {
		t.Fatalf("expected child process to start, got %q", output)
	}
}

func waitForAppTestOutputContains(t *testing.T, service *terminals.Service, sessionID string, attachment *terminals.Attachment, needle string) string {
	t.Helper()

	buffer := strings.Builder{}
	buffer.Write(attachment.History)
	if strings.Contains(buffer.String(), needle) {
		return buffer.String()
	}

	readHistory := func() string {
		history, err := service.History(sessionID)
		if err == nil && history != "" {
			return history
		}
		return buffer.String()
	}

	timeout := time.NewTimer(5 * time.Second)
	defer timeout.Stop()

	for {
		select {
		case chunk, ok := <-attachment.Output:
			if !ok {
				history := readHistory()
				if strings.Contains(history, needle) {
					return history
				}
				t.Fatalf("attachment output closed before %q appeared; collected output: %q", needle, history)
			}
			buffer.Write(chunk)
			if strings.Contains(buffer.String(), needle) {
				return buffer.String()
			}
		case <-timeout.C:
			history := readHistory()
			if strings.Contains(history, needle) {
				return history
			}
			t.Fatalf("timed out waiting for %q; collected output: %q", needle, history)
		}
	}
}

func shellSingleQuoteApp(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func requireAppTestCommand(t *testing.T, name string) string {
	t.Helper()

	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("required command %q not available: %v", name, err)
	}
	return path
}

func installAppPluginFixture(t *testing.T, cfg config.Config, fixtureName string, pluginID string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	targetRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", pluginID)
	copyAppTestDir(t, sourceRoot, targetRoot)
}

func installAppRepoPlugin(t *testing.T, cfg config.Config, pluginID string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "plugins", pluginID)
	targetRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", pluginID)
	copyAppTestDir(t, sourceRoot, targetRoot)
	materializeAppRuntimeManagedPluginFrontendAssets(t, targetRoot)
}

func materializeAppRuntimeManagedPluginFrontendAssets(t *testing.T, pluginRoot string) {
	t.Helper()

	if err := plugins.EnsureRuntimeManagedPluginFrontendAssetsForRoot(pluginRoot); err != nil {
		t.Fatalf("materialize runtime-managed plugin frontend assets for %s: %v", pluginRoot, err)
	}
}

func selectAppLanguageServer(t *testing.T, app *App, language string, pluginID string) {
	t.Helper()

	setAppLanguageServerSelectionWithoutRefresh(t, app, language, pluginID)
	if _, err := app.pluginRuntime.Refresh(context.Background()); err != nil {
		t.Fatalf("refresh plugin runtime after selection change: %v", err)
	}
}

func setAppLanguageServerSelectionWithoutRefresh(t *testing.T, app *App, language string, pluginID string) {
	t.Helper()

	selections := map[string]string{}
	if current, err := settingsstate.LanguageServerSelectedByLanguage(app.SettingsState().Snapshot().Document); err == nil {
		for currentLanguage, currentPluginID := range current {
			if currentPluginID == nil {
				continue
			}
			selections[currentLanguage] = *currentPluginID
		}
	}
	selections[language] = pluginID
	replaceAppLanguageServerSelectionsWithoutRefresh(t, app, selections)
}

func replaceAppLanguageServerSelectionsWithoutRefresh(t *testing.T, app *App, selections map[string]string) {
	t.Helper()

	if _, err := app.SettingsState().MutateAndSave(context.Background(), func(document settingsstate.Document) (settingsstate.Document, error) {
		languageServerSettings := document["languageServer"].(map[string]any)
		selectedByLanguage := make(map[string]any, len(selections))
		for language, pluginID := range selections {
			selectedByLanguage[language] = pluginID
		}
		languageServerSettings["selectedByLanguage"] = selectedByLanguage
		return document, nil
	}); err != nil {
		t.Fatalf("save language server selection: %v", err)
	}
}

func rewriteAppPluginManifest(t *testing.T, pluginRoot string, mutate func(map[string]any)) {
	t.Helper()

	manifestPath := filepath.Join(pluginRoot, "setta.plugin.json")
	payload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest %s: %v", manifestPath, err)
	}

	var manifest map[string]any
	if err := json.Unmarshal(payload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest %s: %v", manifestPath, err)
	}
	mutate(manifest)

	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest %s: %v", manifestPath, err)
	}
	encoded = append(encoded, '\n')
	if err := os.WriteFile(manifestPath, encoded, 0o644); err != nil {
		t.Fatalf("write plugin manifest %s: %v", manifestPath, err)
	}
}

func linkAppBackendCodegenFixture(t *testing.T, serverURL string, authCookie *http.Cookie) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")
	localPluginRoot := filepath.Join(t.TempDir(), "backend")
	copyAppTestDir(t, sourceRoot, localPluginRoot)
	rewriteAppPluginManifest(t, localPluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	requestBody := mustAppJSON(t, map[string]any{
		"localPluginRoot": localPluginRoot,
		"scope":           "workspace",
		"enable":          true,
		"force":           true,
	})
	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RoutePluginsLink, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new plugins link request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins link: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugins link 200, got %d with body %q", response.StatusCode, string(body))
	}
}

type appCompletionItem struct {
	Label string `json:"label"`
}

func requestAppCodeAreaCompletion(
	t *testing.T,
	serverURL string,
	authCookie *http.Cookie,
	projectID string,
	sectionID string,
	fullText string,
	position int,
) []appCompletionItem {
	t.Helper()

	requestBody := mustAppJSON(t, map[string]any{
		"projectConfigId": projectID,
		"sectionId":       sectionID,
		"fullText":        fullText,
		"position":        position,
	})
	request, err := http.NewRequest(http.MethodPost, serverURL+"/api"+httpapi.RouteCodeAreaCompletion, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new code area completion request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post code area completion: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected code area completion 200, got %d with body %q", response.StatusCode, string(payload))
	}

	var payload []appCompletionItem
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode code area completion payload: %v", err)
	}
	return payload
}

func appTestRepoRoot(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve app test file")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func appTestWorkerPython(t *testing.T, repoRoot string) string {
	t.Helper()

	candidates := []string{
		filepath.Join(repoRoot, ".venv", "bin", "python"),
		filepath.Join(repoRoot, ".venv", "bin", "python3"),
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	t.Fatalf("python interpreter not found under %s/.venv", repoRoot)
	return ""
}

func copyAppTestDir(t *testing.T, sourceRoot string, targetRoot string) {
	t.Helper()

	entries, err := os.ReadDir(sourceRoot)
	if err != nil {
		t.Fatalf("read fixture directory %s: %v", sourceRoot, err)
	}
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		t.Fatalf("mkdir fixture target %s: %v", targetRoot, err)
	}

	for _, entry := range entries {
		if entry.Name() == "node_modules" {
			continue
		}
		sourcePath := filepath.Join(sourceRoot, entry.Name())
		targetPath := filepath.Join(targetRoot, entry.Name())

		if entry.IsDir() {
			copyAppTestDir(t, sourcePath, targetPath)
			continue
		}

		info, err := entry.Info()
		if err != nil {
			t.Fatalf("stat fixture entry %s: %v", sourcePath, err)
		}
		payload, err := os.ReadFile(sourcePath)
		if err != nil {
			t.Fatalf("read fixture file %s: %v", sourcePath, err)
		}
		if err := os.WriteFile(targetPath, payload, info.Mode().Perm()); err != nil {
			t.Fatalf("write fixture file %s: %v", targetPath, err)
		}
	}
}

func skipIfAppTerminalPTYUnsupported(t *testing.T) {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("PTY integration tests currently target macOS and Linux")
	}
}
