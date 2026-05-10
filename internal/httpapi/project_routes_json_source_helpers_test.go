package httpapi

import (
	"strings"
	"testing"

	"setta/internal/projectstate"
)

func jsonSourceLiveRefreshRouteTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	project := mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Project Alpha",
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
			InstancesByID: map[string]projectstate.ProjectChatWindowInstance{},
			Order:         []string{},
		},
		SectionVariantMap: map[string]string{
			"json-section": "json-variant-a",
		},
		Sections: map[string]projectstate.Section{
			"json-section": {
				ID:               "json-section",
				Name:             "JSON Source",
				VariantIDs:       []string{"json-variant-a"},
				DefaultVariantID: "json-variant-a",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"json-variant-a": {
				ID:     "json-variant-a",
				ImplID: "json-impl-a",
				Name:   "data/source.json",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"json-impl-a": {
				ID:   "json-impl-a",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "json-impl-a",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"alpha"},
					"topLevelParamId": "old-root",
					"codeObjVariantMap": map[string]any{
						"old-root": "old-root-variant",
						"old-leaf": "old-leaf-variant",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"old-root": {
				ID:               "old-root",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant"},
				DefaultVariantID: "old-root-variant",
			},
			"old-leaf": {
				ID:               "old-leaf",
				Name:             "one",
				VariantIDs:       []string{"old-leaf-variant"},
				DefaultVariantID: "old-leaf-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"old-root-variant": {
				ID:               "old-root-variant",
				ImplID:           "old-root-impl",
				NonPresetImplIDs: []string{"old-root-impl"},
			},
			"old-leaf-variant": {
				ID:               "old-leaf-variant",
				ImplID:           "old-leaf-impl",
				NonPresetImplIDs: []string{"old-leaf-impl"},
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"old-root-impl": {
				ID:   "old-root-impl",
				Type: "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "old-root-impl",
					"type":     "NestedParam",
					"children": []string{"old-leaf"},
				}),
			},
			"old-leaf-impl": {
				ID:   "old-leaf-impl",
				Type: "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":    "old-leaf-impl",
					"type":  "CodeParam",
					"value": "1",
				}),
			},
		},
	})

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}
}

func jsonSourceLeafRootRouteTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	document := jsonSourceLiveRefreshRouteTestDocument(t)
	project := document.Projects["project-alpha"]

	leafRoot := project.CodeObjs["old-leaf"]
	leafRoot.Name = "alpha"
	project.CodeObjs["old-leaf"] = leafRoot
	delete(project.CodeObjs, "old-root")
	delete(project.CodeObjVariants, "old-root-variant")
	delete(project.CodeObjImpls, "old-root-impl")
	project.SectionImpls["json-impl-a"] = projectstate.SectionImpl{
		ID:   "json-impl-a",
		Kind: projectstate.SectionKind("dict"),
		Payload: mustProjectRouteRawJSON(t, map[string]any{
			"id":              "json-impl-a",
			"type":            "Dict",
			"isJsonSource":    true,
			"configLanguage":  "json",
			"jsonSourceKeys":  []string{"alpha"},
			"topLevelParamId": "old-leaf",
			"codeObjVariantMap": map[string]any{
				"old-leaf": "old-leaf-variant",
			},
		}),
	}
	document.Projects["project-alpha"] = project
	return document
}

func jsonSourceSharedRouteTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	project := mustNormalizedProjectRouteProject(t, projectstate.Project{
		ID:                      "project-alpha",
		Name:                    "Project Alpha",
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing: &projectstate.ProjectChatWindowingState{
			InstancesByID: map[string]projectstate.ProjectChatWindowInstance{},
			Order:         []string{},
		},
		SectionVariantMap: map[string]string{
			"json-section-a": "json-variant-a",
			"json-section-b": "json-variant-b",
		},
		Sections: map[string]projectstate.Section{
			"json-section-a": {
				ID:               "json-section-a",
				Name:             "JSON Source A",
				VariantIDs:       []string{"json-variant-a"},
				DefaultVariantID: "json-variant-a",
			},
			"json-section-b": {
				ID:               "json-section-b",
				Name:             "JSON Source B",
				VariantIDs:       []string{"json-variant-b"},
				DefaultVariantID: "json-variant-b",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"json-variant-a": {
				ID:     "json-variant-a",
				ImplID: "json-impl-a",
				Name:   "data/source.json",
			},
			"json-variant-b": {
				ID:     "json-variant-b",
				ImplID: "json-impl-b",
				Name:   "data/source.json",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"json-impl-a": {
				ID:   "json-impl-a",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "json-impl-a",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"alpha"},
					"topLevelParamId": "old-root-a",
					"codeObjVariantMap": map[string]any{
						"old-root-a": "old-root-variant-a",
						"old-leaf-a": "old-leaf-variant-a",
					},
				}),
			},
			"json-impl-b": {
				ID:   "json-impl-b",
				Kind: projectstate.SectionKind("dict"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":              "json-impl-b",
					"type":            "Dict",
					"isJsonSource":    true,
					"configLanguage":  "json",
					"jsonSourceKeys":  []string{"alpha"},
					"topLevelParamId": "old-root-b",
					"codeObjVariantMap": map[string]any{
						"old-root-b": "old-root-variant-b",
						"old-leaf-b": "old-leaf-variant-b",
					},
				}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"old-root-a": {
				ID:               "old-root-a",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant-a"},
				DefaultVariantID: "old-root-variant-a",
			},
			"old-leaf-a": {
				ID:               "old-leaf-a",
				Name:             "target-leaf",
				VariantIDs:       []string{"old-leaf-variant-a"},
				DefaultVariantID: "old-leaf-variant-a",
			},
			"old-root-b": {
				ID:               "old-root-b",
				Name:             "alpha",
				VariantIDs:       []string{"old-root-variant-b"},
				DefaultVariantID: "old-root-variant-b",
			},
			"old-leaf-b": {
				ID:               "old-leaf-b",
				Name:             "peer-leaf",
				VariantIDs:       []string{"old-leaf-variant-b"},
				DefaultVariantID: "old-leaf-variant-b",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"old-root-variant-a": {
				ID:               "old-root-variant-a",
				ImplID:           "old-root-impl-a",
				NonPresetImplIDs: []string{"old-root-impl-a"},
			},
			"old-leaf-variant-a": {
				ID:               "old-leaf-variant-a",
				ImplID:           "old-leaf-impl-a",
				NonPresetImplIDs: []string{"old-leaf-impl-a"},
			},
			"old-root-variant-b": {
				ID:               "old-root-variant-b",
				ImplID:           "old-root-impl-b",
				NonPresetImplIDs: []string{"old-root-impl-b"},
			},
			"old-leaf-variant-b": {
				ID:               "old-leaf-variant-b",
				ImplID:           "old-leaf-impl-b",
				NonPresetImplIDs: []string{"old-leaf-impl-b"},
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"old-root-impl-a": {
				ID:   "old-root-impl-a",
				Type: "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "old-root-impl-a",
					"type":     "NestedParam",
					"children": []string{"old-leaf-a"},
				}),
			},
			"old-leaf-impl-a": {
				ID:   "old-leaf-impl-a",
				Type: "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":    "old-leaf-impl-a",
					"type":  "CodeParam",
					"value": "1",
				}),
			},
			"old-root-impl-b": {
				ID:   "old-root-impl-b",
				Type: "NestedParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":       "old-root-impl-b",
					"type":     "NestedParam",
					"children": []string{"old-leaf-b"},
				}),
			},
			"old-leaf-impl-b": {
				ID:   "old-leaf-impl-b",
				Type: "CodeParam",
				Payload: mustProjectRouteRawJSON(t, map[string]any{
					"id":    "old-leaf-impl-b",
					"type":  "CodeParam",
					"value": "2",
				}),
			},
		},
	})

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			project.ID: project,
		},
	}
}

func projectstatePayloadString(payload map[string]any, key string) string {
	value, _ := payload[key].(string)
	return value
}

func projectstatePayloadStringArray(payload map[string]any, key string) []string {
	rawEntries, _ := payload[key].([]any)
	output := make([]string, 0, len(rawEntries))
	for _, rawEntry := range rawEntries {
		entry, ok := rawEntry.(string)
		if !ok || strings.TrimSpace(entry) == "" {
			continue
		}
		output = append(output, entry)
	}
	return output
}

func projectstatePayloadStringMap(payload map[string]any, key string) map[string]string {
	rawEntries, _ := payload[key].(map[string]any)
	output := make(map[string]string, len(rawEntries))
	for entryKey, rawValue := range rawEntries {
		value, ok := rawValue.(string)
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		output[entryKey] = value
	}
	return output
}

func projectstatePayloadBool(payload map[string]any, key string) bool {
	value, _ := payload[key].(bool)
	return value
}

func assertProjectRouteJSONSourceFreshValue(t *testing.T, project projectstate.Project, codeObjVariantMap map[string]string, topLevelParamID string) {
	t.Helper()

	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		t.Fatalf("effective root payload after json-source check: %v", err)
	}
	childIDs := projectstatePayloadStringArray(rootPayload, "children")
	if len(childIDs) != 1 {
		t.Fatalf("expected one refreshed child, got %#v", childIDs)
	}
	childPayload, childCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective child payload after json-source check: %v", err)
	}
	if childCodeObj.Name != "fresh" {
		t.Fatalf("expected child name fresh, got %q", childCodeObj.Name)
	}
	if got := projectstatePayloadString(childPayload, "value"); got != "2" {
		t.Fatalf("expected child value 2, got %q", got)
	}
}

func assertProjectRouteJSONSourceOldLeafValue(t *testing.T, project projectstate.Project, codeObjVariantMap map[string]string, topLevelParamID string, expectedName string, expectedValue string) {
	t.Helper()

	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		t.Fatalf("effective root payload after persisted json-source check: %v", err)
	}
	childIDs := projectstatePayloadStringArray(rootPayload, "children")
	if len(childIDs) != 1 {
		t.Fatalf("expected one persisted child, got %#v", childIDs)
	}
	childPayload, childCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective child payload after persisted json-source check: %v", err)
	}
	if childCodeObj.Name != expectedName {
		t.Fatalf("expected child name %q, got %q", expectedName, childCodeObj.Name)
	}
	if got := projectstatePayloadString(childPayload, "value"); got != expectedValue {
		t.Fatalf("expected child value %q, got %q", expectedValue, got)
	}
}
