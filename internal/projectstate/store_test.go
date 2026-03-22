package projectstate

import (
	"bytes"
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

func TestStoreLoadRejectsLegacyRemovedClockSectionPayload(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestJSON(t, projectPath, map[string]any{
		"schemaVersion":    CurrentSchemaVersion,
		"defaultProjectId": "project-alpha",
		"projects": map[string]any{
			"project-alpha": map[string]any{
				"id":               "project-alpha",
				"name":             "Alpha",
				"activeViewModeId": "view-main",
				"viewModes": map[string]any{
					"view-main": map[string]any{
						"id":   "view-main",
						"name": "Main",
						"visibilityBySectionId": map[string]any{
							"legacy-clock-section": true,
						},
						"topLevelSections": map[string]any{},
					},
				},
				"projectChatWindowing": map[string]any{
					"instancesById":      map[string]any{},
					"order":              []any{},
					"nextInstanceNumber": 1,
				},
				"sectionVariantMap": map[string]any{
					"legacy-clock-section": "legacy-clock-variant",
				},
				"sections": map[string]any{
					"legacy-clock-section": map[string]any{
						"id":               "legacy-clock-section",
						"name":             "Clock",
						"variantIds":       []any{"legacy-clock-variant"},
						"defaultVariantId": "legacy-clock-variant",
					},
				},
				"sectionVariants": map[string]any{
					"legacy-clock-variant": map[string]any{
						"id":     "legacy-clock-variant",
						"implId": "legacy-clock-impl",
					},
				},
				"sectionImpls": map[string]any{
					"legacy-clock-impl": map[string]any{
						"type": "Clock",
					},
				},
				"codeObjs":        map[string]any{},
				"codeObjVariants": map[string]any{},
				"codeObjImpls":    map[string]any{},
			},
		},
	})
	store := newTestStore(t, projectPath)

	_, err := store.Load(context.Background())
	if !errors.Is(err, ErrSectionImplIDRequired) {
		t.Fatalf("expected legacy removed section payload to fail closed with missing impl id, got %v", err)
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
	payload := map[string]any{
		"schemaVersion":    CurrentSchemaVersion,
		"defaultProjectId": "project-alpha",
		"projects": map[string]any{
			"project-alpha": map[string]any{
				"id":   "project-alpha",
				"name": "Alpha",
			},
		},
	}
	writeTestJSON(t, projectPath, payload)
	store := newTestStore(t, projectPath)

	_, err := store.Load(context.Background())
	if !errors.Is(err, ErrProjectChatWindowingRequired) {
		t.Fatalf("expected missing project chat windowing error, got %v", err)
	}
	if !strings.Contains(err.Error(), "project-alpha") {
		t.Fatalf("expected missing project id in error, got %v", err)
	}

	expectedContent, marshalErr := json.MarshalIndent(payload, "", "  ")
	if marshalErr != nil {
		t.Fatalf("marshal expected content: %v", marshalErr)
	}
	expectedContent = append(expectedContent, '\n')
	currentContent, readErr := os.ReadFile(projectPath)
	if readErr != nil {
		t.Fatalf("read persisted project after failed load: %v", readErr)
	}
	if !bytes.Equal(currentContent, expectedContent) {
		t.Fatalf("expected failed load to leave persisted payload unchanged, got %q", string(currentContent))
	}
}

func TestStoreLoadRejectsDuplicateWindowSpaceSortIndices(t *testing.T) {
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

	_, err := store.Load(context.Background())
	if !IsInvalidWindowSpaceSortOrderError(err) {
		t.Fatalf("expected duplicate window space sort indices to fail closed, got %v", err)
	}
}

func TestStoreLoadRejectsViewModesThatRequireRepair(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestJSON(t, projectPath, map[string]any{
		"schemaVersion":    CurrentSchemaVersion,
		"defaultProjectId": "project-alpha",
		"projects": map[string]any{
			"project-alpha": map[string]any{
				"id":               "project-alpha",
				"name":             "Alpha",
				"activeViewModeId": "",
				"viewModes":        map[string]any{},
				"topLevelSections": map[string]any{},
				"projectChatWindowing": map[string]any{
					"instancesById":      map[string]any{},
					"order":              []any{},
					"nextInstanceNumber": 1,
				},
				"sectionVariantMap": map[string]any{},
				"sections":          map[string]any{},
				"sectionVariants":   map[string]any{},
				"sectionImpls":      map[string]any{},
				"codeObjs":          map[string]any{},
				"codeObjVariants":   map[string]any{},
				"codeObjImpls":      map[string]any{},
			},
		},
	})
	store := newTestStore(t, projectPath)

	_, err := store.Load(context.Background())
	if !errors.Is(err, ErrPersistedProjectViewModesRequireRepair) {
		t.Fatalf("expected repaired view modes to fail closed, got %v", err)
	}
}

func TestStoreLoadRejectsStaleActiveIDs(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestJSON(t, projectPath, map[string]any{
		"schemaVersion":    CurrentSchemaVersion,
		"defaultProjectId": "project-alpha",
		"projects": map[string]any{
			"project-alpha": map[string]any{
				"id":               "project-alpha",
				"name":             "Alpha",
				"activeViewModeId": "view-main",
				"viewModes": map[string]any{
					"view-main": map[string]any{
						"id":                    "view-main",
						"name":                  "Main",
						"visibilityBySectionId": map[string]any{},
						"topLevelSections":      map[string]any{},
					},
				},
				"topLevelSections": map[string]any{},
				"activeIds":        []any{"missing-section"},
				"projectChatWindowing": map[string]any{
					"instancesById":      map[string]any{},
					"order":              []any{},
					"nextInstanceNumber": 1,
				},
				"sectionVariantMap": map[string]any{},
				"sections":          map[string]any{},
				"sectionVariants":   map[string]any{},
				"sectionImpls":      map[string]any{},
				"codeObjs":          map[string]any{},
				"codeObjVariants":   map[string]any{},
				"codeObjImpls":      map[string]any{},
			},
		},
	})
	store := newTestStore(t, projectPath)

	_, err := store.Load(context.Background())
	if !errors.Is(err, ErrPersistedProjectActiveIDsRequireRepair) {
		t.Fatalf("expected stale active ids to fail closed, got %v", err)
	}
}

func TestStoreLoadRejectsProjectChatWindowingThatRequiresRepair(t *testing.T) {
	t.Parallel()

	projectPath := filepath.Join(t.TempDir(), "project.json")
	writeTestJSON(t, projectPath, map[string]any{
		"schemaVersion":    CurrentSchemaVersion,
		"defaultProjectId": "project-alpha",
		"projects": map[string]any{
			"project-alpha": map[string]any{
				"id":               "project-alpha",
				"name":             "Alpha",
				"activeViewModeId": "view-main",
				"viewModes": map[string]any{
					"view-main": map[string]any{
						"id":                    "view-main",
						"name":                  "Main",
						"visibilityBySectionId": map[string]any{},
						"topLevelSections":      map[string]any{},
					},
				},
				"topLevelSections": map[string]any{},
				"projectChatWindowing": map[string]any{
					"instancesById": map[string]any{
						"instance-a": map[string]any{
							"instanceId": "instance-a",
							"title":      "Project AI",
							"chatId":     "chat-a",
							"bounds": map[string]any{
								"x":      10,
								"y":      20,
								"width":  0,
								"height": 0,
							},
						},
					},
					"order":              []any{"instance-a"},
					"nextInstanceNumber": 1,
				},
				"sectionVariantMap": map[string]any{},
				"sections":          map[string]any{},
				"sectionVariants":   map[string]any{},
				"sectionImpls":      map[string]any{},
				"codeObjs":          map[string]any{},
				"codeObjVariants":   map[string]any{},
				"codeObjImpls":      map[string]any{},
			},
		},
	})
	store := newTestStore(t, projectPath)

	_, err := store.Load(context.Background())
	if !errors.Is(err, ErrPersistedProjectChatWindowingRequireRepair) {
		t.Fatalf("expected repaired project chat windowing to fail closed, got %v", err)
	}
}

func TestStoreLoadRejectsLegacyCodeFileBindingPayloadKeys(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name          string
		bindingObject map[string]any
	}{
		{
			name: "legacy path key",
			bindingObject: map[string]any{
				"path":        "pkg/legacy.py",
				"access_mode": "read_write",
				"autoBinding": false,
			},
		},
		{
			name: "legacy accessMode key",
			bindingObject: map[string]any{
				"canonical_path": "pkg/legacy.py",
				"accessMode":     "read_write",
				"autoBinding":    false,
			},
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			projectPath := filepath.Join(t.TempDir(), "project.json")
			writeTestJSON(t, projectPath, legacyCodeFileBindingStorePayload(testCase.bindingObject))
			store := newTestStore(t, projectPath)

			_, err := store.Load(context.Background())
			if !errors.Is(err, ErrCodeFileBindingLegacyPayloadKeys) {
				t.Fatalf("expected legacy code file binding keys to fail closed, got %v", err)
			}
		})
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
	document := NewDocument()
	projectID, _, err := document.CreateProject("")
	if err != nil {
		t.Fatalf("create project document fixture: %v", err)
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
	project, ok := loaded.Projects[projectID]
	if !ok {
		t.Fatalf("expected %s to be present", projectID)
	}
	if project.Name == "" {
		t.Fatal("expected persisted project name")
	}
	if project.ProjectChatWindowing == nil {
		t.Fatal("expected saved project chat windowing to remain present")
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

func TestStoreSavePersistsChatMessageStartedAtAsString(t *testing.T) {
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
				Sections: map[string]Section{
					"section-chat": {
						ID:               "section-chat",
						Name:             "Chat",
						VariantIDs:       []string{"variant-chat"},
						DefaultVariantID: "variant-chat",
					},
				},
				SectionVariants: map[string]SectionVariant{
					"variant-chat": {
						ID:     "variant-chat",
						ImplID: "impl-chat",
					},
				},
				SectionImpls: map[string]SectionImpl{
					"impl-chat": {
						ID:   "impl-chat",
						Kind: SectionKind("chat"),
						Payload: mustRawJSON(t, `{
							"id":"impl-chat",
							"type":"Chat",
							"messages":[
								{
									"id":"tool-message-1",
									"role":"tool",
									"tool_call_id":"tool-call-1",
									"tool_name":"setta.test",
									"arguments":{},
									"result":{},
									"content":[],
									"is_error":false,
									"started_at":"2026-03-20T01:02:03Z",
									"completed_at":null
								}
							],
							"inputText":"",
							"waitingForResponse":false,
							"toolCallArguments":{},
							"branches":{}
						}`),
					},
				},
			},
		},
	}

	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save project document: %v", err)
	}

	content, err := os.ReadFile(projectPath)
	if err != nil {
		t.Fatalf("read saved project document: %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode saved project document: %v", err)
	}

	projects, ok := payload["projects"].(map[string]any)
	if !ok {
		t.Fatalf("expected projects object, got %#v", payload["projects"])
	}
	project, ok := projects["project-alpha"].(map[string]any)
	if !ok {
		t.Fatalf("expected project-alpha object, got %#v", projects["project-alpha"])
	}
	sectionImpls, ok := project["sectionImpls"].(map[string]any)
	if !ok {
		t.Fatalf("expected sectionImpls object, got %#v", project["sectionImpls"])
	}
	sectionImpl, ok := sectionImpls["impl-chat"].(map[string]any)
	if !ok {
		t.Fatalf("expected impl-chat object, got %#v", sectionImpls["impl-chat"])
	}
	sectionPayload, ok := sectionImpl["payload"].(map[string]any)
	if !ok {
		t.Fatalf("expected section payload object, got %#v", sectionImpl["payload"])
	}
	messages, ok := sectionPayload["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("expected one persisted chat message, got %#v", sectionPayload["messages"])
	}
	message, ok := messages[0].(map[string]any)
	if !ok {
		t.Fatalf("expected persisted chat message object, got %#v", messages[0])
	}
	startedAt, ok := message["started_at"].(string)
	if !ok {
		t.Fatalf("expected started_at string, got %#v", message["started_at"])
	}
	if startedAt != "2026-03-20T01:02:03Z" {
		t.Fatalf("expected started_at to round-trip, got %q", startedAt)
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

func legacyCodeFileBindingStorePayload(bindingObject map[string]any) map[string]any {
	return map[string]any{
		"schemaVersion":    CurrentSchemaVersion,
		"defaultProjectId": "project-alpha",
		"projects": map[string]any{
			"project-alpha": map[string]any{
				"id":               "project-alpha",
				"name":             "Alpha",
				"activeViewModeId": "view-main",
				"viewModes": map[string]any{
					"view-main": map[string]any{
						"id":   "view-main",
						"name": "Main",
						"visibilityBySectionId": map[string]any{
							"section-main": true,
						},
						"topLevelSections": map[string]any{},
					},
				},
				"projectChatWindowing": map[string]any{
					"instancesById":      map[string]any{},
					"order":              []any{},
					"nextInstanceNumber": 1,
				},
				"sectionVariantMap": map[string]any{
					"section-main": "variant-main",
				},
				"sections": map[string]any{
					"section-main": map[string]any{
						"id":               "section-main",
						"name":             "Main",
						"variantIds":       []any{"variant-main"},
						"defaultVariantId": "variant-main",
					},
				},
				"sectionVariants": map[string]any{
					"variant-main": map[string]any{
						"id":     "variant-main",
						"implId": "impl-main",
					},
				},
				"sectionImpls": map[string]any{
					"impl-main": map[string]any{
						"id":   "impl-main",
						"kind": string(SectionKindCode),
						"payload": map[string]any{
							"id":              "impl-main",
							"type":            "Code",
							"code":            "print('hello')\n",
							"codeLanguage":    "python",
							"children":        []any{},
							"codeFileBinding": bindingObject,
						},
						"code": map[string]any{
							"language": "python",
						},
					},
				},
				"codeObjs":        map[string]any{},
				"codeObjVariants": map[string]any{},
				"codeObjImpls":    map[string]any{},
			},
		},
	}
}
