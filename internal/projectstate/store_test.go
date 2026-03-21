package projectstate

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreLoadReturnsEmptyDocumentWhenFileMissing(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))

	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load project document: %v", err)
	}

	if document.SchemaVersion != CurrentSchemaVersion {
		t.Fatalf("expected schema version %d, got %d", CurrentSchemaVersion, document.SchemaVersion)
	}
	if len(document.Projects) != 0 {
		t.Fatalf("expected no projects, got %d", len(document.Projects))
	}
}

func TestStoreLoadRejectsNonObjectPayload(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestFile(t, projectPath, []byte(`["not-an-object"]`))
	store := newTestStore(t, projectPath)

	_, err := store.Load(context.Background())
	if !errors.Is(err, ErrProjectPayloadNotObject) {
		t.Fatalf("expected non-object payload error, got %v", err)
	}
}

func TestStoreLoadRejectsInvalidJSON(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestFile(t, projectPath, []byte(`{`))
	store := newTestStore(t, projectPath)

	_, err := store.Load(context.Background())
	if err == nil {
		t.Fatal("expected invalid JSON error")
	}
}

func TestStoreLoadRejectsUnsupportedSchemaVersion(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestJSON(t, projectPath, map[string]any{
		"schemaVersion": 99,
	})
	store := newTestStore(t, projectPath)

	_, err := store.Load(context.Background())
	if !errors.Is(err, ErrUnsupportedSchemaVersion) {
		t.Fatalf("expected unsupported schema version error, got %v", err)
	}
}

func TestStoreLoadRejectsMissingAuthoritativeProjectChatWindowingState(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestJSON(t, projectPath, map[string]any{
		"schemaVersion":    CurrentSchemaVersion,
		"defaultProjectId": "project-alpha",
		"projects": map[string]any{
			"project-alpha": map[string]any{
				"id":   "project-alpha",
				"name": "Alpha",
			},
		},
	})
	store := newTestStore(t, projectPath)

	_, err := store.Load(context.Background())
	if !errors.Is(err, ErrProjectChatWindowingRequired) {
		t.Fatalf("expected missing project chat windowing error, got %v", err)
	}
	if !strings.Contains(err.Error(), "project-alpha") {
		t.Fatalf("expected missing project id in error, got %v", err)
	}
}

func TestStoreLoadRepairsDuplicateWindowSpaceSortIndicesUsingPersistedOrder(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestFile(t, projectPath, []byte(`{
  "schemaVersion": 1,
  "defaultProjectId": "project-alpha",
  "projects": {
    "project-alpha": {
      "id": "project-alpha",
      "name": "Alpha",
      "activeViewModeId": "view-main",
      "topLevelSections": {},
      "viewModes": {
        "view-main": {
          "id": "view-main",
          "name": "Main",
          "sortIndex": 0,
          "visibilityBySectionId": {},
          "topLevelSections": {}
        }
      },
      "sectionVariantMap": {},
      "projectChatWindowing": {
        "instancesById": {},
        "order": [],
        "nextInstanceNumber": 1
      },
      "sections": {},
      "sectionVariants": {},
      "sectionImpls": {},
      "codeObjs": {},
      "codeObjVariants": {},
      "codeObjImpls": {},
      "windowSpaces": {
        "space-zeta": {
          "id": "space-zeta",
          "name": "Zulu Layout",
          "sortIndex": 0,
          "windowsById": {
            "window-zeta": {
              "surfaceKind": "project_chat",
              "mode": "project_ai_mode"
            }
          },
          "order": ["window-zeta"]
        },
        "space-alpha": {
          "id": "space-alpha",
          "name": "Alpha Layout",
          "sortIndex": 0,
          "windowsById": {
            "window-alpha": {
              "surfaceKind": "project_chat",
              "mode": "project_ai_mode"
            }
          },
          "order": ["window-alpha"]
        },
        "space-beta": {
          "id": "space-beta",
          "name": "Beta Layout",
          "sortIndex": 2,
          "windowsById": {
            "window-beta": {
              "surfaceKind": "project_chat",
              "mode": "project_ai_mode"
            }
          },
          "order": ["window-beta"]
        }
      }
    }
  }
}`))
	store := newTestStore(t, projectPath)

	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load project document: %v", err)
	}

	project := document.Projects["project-alpha"]
	if got := project.WindowSpaces["space-zeta"].SortIndex; got != 0 {
		t.Fatalf("expected space-zeta sort index 0, got %d", got)
	}
	if got := project.WindowSpaces["space-alpha"].SortIndex; got != 1 {
		t.Fatalf("expected space-alpha sort index 1, got %d", got)
	}
	if got := project.WindowSpaces["space-beta"].SortIndex; got != 2 {
		t.Fatalf("expected space-beta sort index 2, got %d", got)
	}
}

func TestStoreLoadRawReturnsUnnormalizedDocument(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestJSON(t, projectPath, map[string]any{
		"schemaVersion": 99,
		"projects": map[string]any{
			"settings": map[string]any{
				"id":                "settings",
				"name":              "settings",
				"activeViewModeId":  "settings-param-defaults",
				"sectionVariantMap": map[string]any{},
				"sections":          map[string]any{},
				"sectionVariants":   map[string]any{},
				"sectionImpls":      map[string]any{},
				"codeObjs":          map[string]any{},
				"codeObjVariants":   map[string]any{},
				"codeObjImpls":      map[string]any{},
				"viewModes": map[string]any{
					"settings-param-defaults": map[string]any{
						"id":                    "settings-param-defaults",
						"name":                  "Param Defaults",
						"visibilityBySectionId": map[string]any{"settings-section__buttonParamCodeObjDefault": true},
						"topLevelSections":      map[string]any{},
					},
				},
			},
		},
	})
	store := newTestStore(t, projectPath)

	document, err := store.LoadRaw(context.Background())
	if err != nil {
		t.Fatalf("load raw project document: %v", err)
	}
	if document.SchemaVersion != 99 {
		t.Fatalf("expected raw schema version 99, got %d", document.SchemaVersion)
	}
	project, ok := document.Projects["settings"]
	if !ok {
		t.Fatal("expected raw settings project to be present")
	}
	viewMode, ok := project.ViewModes["settings-param-defaults"]
	if !ok {
		t.Fatal("expected raw param defaults view mode to be present")
	}
	if len(viewMode.TopLevelSections) != 0 {
		t.Fatalf("expected raw view mode layout to remain empty, got %#v", viewMode.TopLevelSections)
	}
}

func TestStoreSaveRoundTripsDocument(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	store := newTestStore(t, projectPath)
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}

	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save project document: %v", err)
	}

	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load saved project document: %v", err)
	}
	if loaded.SchemaVersion != document.SchemaVersion {
		t.Fatalf("expected schema version %d, got %d", document.SchemaVersion, loaded.SchemaVersion)
	}
	if loaded.DefaultProjectID != document.DefaultProjectID {
		t.Fatalf("expected default project id %q, got %q", document.DefaultProjectID, loaded.DefaultProjectID)
	}
	project, ok := loaded.Projects["project-alpha"]
	if !ok {
		t.Fatal("expected project-alpha to be present")
	}
	if project.Name != "Alpha" {
		t.Fatalf("expected project name Alpha, got %q", project.Name)
	}
	if project.ProjectChatWindowing == nil {
		t.Fatal("expected saved project chat windowing to be normalized onto the project")
	}
}

func TestStoreSaveRejectsInvalidDocument(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "missing",
		Projects:         map[string]Project{},
	}

	err := store.Save(context.Background(), document)
	if !errors.Is(err, ErrDefaultProjectNotFound) {
		t.Fatalf("expected missing default project error, got %v", err)
	}
}

func TestStoreSaveCreatesReadableJSONFile(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "nested", "project.json")
	store := newTestStore(t, projectPath)

	if err := store.Save(context.Background(), NewDocument()); err != nil {
		t.Fatalf("save empty project document: %v", err)
	}

	content, err := os.ReadFile(projectPath)
	if err != nil {
		t.Fatalf("read project document: %v", err)
	}
	if string(content) == "" {
		t.Fatal("expected saved project document content")
	}
	if content[len(content)-1] != '\n' {
		t.Fatal("expected saved project document to end with a newline")
	}
}

func newTestStore(t *testing.T, path string) *Store {
	t.Helper()

	store, err := NewStore(path, StoreOptions{})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return store
}

func writeTestFile(t *testing.T, path string, content []byte) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir parent: %v", err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}
}

func writeTestJSON(t *testing.T, path string, payload map[string]any) {
	t.Helper()

	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	content = append(content, '\n')
	writeTestFile(t, path, content)
}
