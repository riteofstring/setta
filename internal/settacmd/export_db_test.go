package settacmd

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"

	"setta/internal/projectstate"
)

func TestRunExportDBDefaultsToReadableWithVariants(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	writeExportDBFixtureProject(t, workspaceRoot, settaFilesRoot)

	stdout, stderr, err := runExportDBSettaCommand(t, workspaceRoot, "export-db")
	if err != nil {
		t.Fatalf("run export-db: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	outputPath := filepath.Join(settaFilesRoot, "project.readable.yaml")
	if !strings.Contains(stdout, "Wrote readable export to "+outputPath) {
		t.Fatalf("expected export path in stdout, got %q", stdout)
	}

	payload := readReadableExportYAML(t, outputPath)
	section := firstReadableSectionMap(t, payload)
	if got := section["variant"]; got != "Code Variant" {
		t.Fatalf("expected readable export variant, got %#v", got)
	}
}

func TestRunExportDBReadableOmitsVariantsAndHonorsOutputPath(t *testing.T) {
	t.Parallel()

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	writeExportDBFixtureProject(t, workspaceRoot, settaFilesRoot)

	stdout, stderr, err := runExportDBSettaCommand(t, workspaceRoot, "export-db", "--readable", "--output", "exports/project.yaml")
	if err != nil {
		t.Fatalf("run export-db --readable: %v", err)
	}
	if stderr != "" {
		t.Fatalf("expected empty stderr, got %q", stderr)
	}

	outputPath := filepath.Join(workspaceRoot, "exports", "project.yaml")
	if !strings.Contains(stdout, "Wrote readable export to "+outputPath) {
		t.Fatalf("expected export path in stdout, got %q", stdout)
	}

	payload := readReadableExportYAML(t, outputPath)
	section := firstReadableSectionMap(t, payload)
	if _, ok := section["variant"]; ok {
		t.Fatalf("expected readable export without variant, got %#v", section["variant"])
	}
}

func runExportDBSettaCommand(t *testing.T, cwd string, args ...string) (string, string, error) {
	t.Helper()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	err := Run(args, RunOptions{
		Stdout: &stdout,
		Stderr: &stderr,
		CWD:    cwd,
		Now: func() time.Time {
			return time.Date(2026, time.March, 8, 12, 30, 0, 0, time.UTC)
		},
		EnvLookup: func(string) (string, bool) { return "", false },
	})
	return stdout.String(), stderr.String(), err
}

func writeExportDBFixtureProject(t *testing.T, workspaceRoot string, settaFilesRoot string) {
	t.Helper()

	codePath := filepath.Join(workspaceRoot, "scripts", "main.py")
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				EntryCodeBlockID: "section-code",
				TopLevelSectionIDs: []string{
					"section-code",
				},
				TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
					"section-code": {},
				},
				SectionVariantMap: map[string]string{
					"section-code": "variant-code",
				},
				Sections: map[string]projectstate.Section{
					"section-code": {
						ID:               "section-code",
						Name:             "Script",
						VariantIDs:       []string{"variant-code"},
						DefaultVariantID: "variant-code",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"variant-code": {
						ID:     "variant-code",
						Name:   "Code Variant",
						ImplID: "impl-code",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"impl-code": {
						ID:   "impl-code",
						Kind: projectstate.SectionKindCode,
						Code: &projectstate.CodeSectionImpl{
							Language: projectstate.CodeLanguagePython,
							Binding: &projectstate.CodeFileBinding{
								Path:       codePath,
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
							Children: []string{},
						},
						Payload: mustExportDBRawJSON(t, map[string]any{
							"id":           "impl-code",
							"type":         "Code",
							"code":         "print('hello')",
							"codeLanguage": "python",
							"children":     []any{},
							"codeFileBinding": map[string]any{
								"canonical_path": codePath,
								"access_mode":    "read_write",
								"autoBinding":    false,
							},
						}),
					},
				},
			},
		},
	}

	normalized, err := document.Normalized()
	if err != nil {
		t.Fatalf("normalize export-db fixture: %v", err)
	}

	store, err := projectstate.NewStore(filepath.Join(settaFilesRoot, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), normalized); err != nil {
		t.Fatalf("save project store: %v", err)
	}
}

func readReadableExportYAML(t *testing.T, path string) map[string]any {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read readable export: %v", err)
	}
	var payload map[string]any
	if err := yaml.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode readable export yaml: %v", err)
	}
	return payload
}

func firstReadableSectionMap(t *testing.T, payload map[string]any) map[string]any {
	t.Helper()

	configs, ok := payload["configs"].([]any)
	if !ok || len(configs) != 1 {
		t.Fatalf("expected one config, got %#v", payload["configs"])
	}
	config, ok := configs[0].(map[string]any)
	if !ok {
		t.Fatalf("expected config map, got %#v", configs[0])
	}
	sections, ok := config["sections"].([]any)
	if !ok || len(sections) != 1 {
		t.Fatalf("expected one section, got %#v", config["sections"])
	}
	section, ok := sections[0].(map[string]any)
	if !ok {
		t.Fatalf("expected section map, got %#v", sections[0])
	}
	return section
}

func mustExportDBRawJSON(t *testing.T, value any) projectstate.RawJSON {
	t.Helper()

	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json fixture: %v", err)
	}
	return projectstate.RawJSON(raw)
}
