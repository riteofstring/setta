package projectview

import (
	"encoding/json"
	"testing"

	"setta/internal/projectstate"
)

func testProjectViewDocument(t *testing.T) projectstate.Document {
	t.Helper()

	project := projectstate.Project{
		ID:                 "project-alpha",
		Name:               "Project Alpha",
		TopLevelSectionIDs: []string{"callable-section", "gen-section", "global-section"},
		TopLevelSections: map[string]projectstate.TopLevelSectionLayout{
			"callable-section": {X: 10, Y: 20},
		},
		CodegenTargets: []projectstate.ProjectCodegenTarget{
			{Language: string(projectstate.CodeLanguagePython)},
		},
		SectionVariantMap: map[string]string{
			"callable-section": "callable-variant",
			"draw-section":     "draw-variant",
			"gen-section":      "gen-variant",
			"global-section":   "global-variant",
		},
		Sections: map[string]projectstate.Section{
			"callable-section": {
				ID:               "callable-section",
				Name:             "Callable Section",
				VariantIDs:       []string{"callable-variant"},
				DefaultVariantID: "callable-variant",
				SharedModifier: mustRawJSON(t, map[string]any{
					"callable": "callable-root",
					"codeObjVariantMap": map[string]string{
						"callable-root": "callable-root-variant",
						"param-a":       "param-a-variant",
						"param-b":       "param-b-variant",
						"param-b-child": "param-b-child-variant",
					},
				}),
			},
			"draw-section": {
				ID:               "draw-section",
				Name:             "Draw Section",
				VariantIDs:       []string{"draw-variant"},
				DefaultVariantID: "draw-variant",
				ParentSectionID:  "callable-section",
				SharedModifier: mustRawJSON(t, map[string]any{
					"layers": []any{
						map[string]any{
							"elements": []any{
								map[string]any{"type": "Image", "dataPath": "images/a.png"},
								map[string]any{"type": "Text", "dataPath": "ignored"},
								map[string]any{"type": "Image", "dataPath": "images/b.png"},
							},
						},
					},
				}),
			},
			"gen-section": {
				ID:               "gen-section",
				Name:             "Generated Python",
				VariantIDs:       []string{"gen-variant"},
				DefaultVariantID: "gen-variant",
				SharedModifier: mustRawJSON(t, map[string]any{
					"codeFileBinding": map[string]any{
						"canonical_path": "src/generated.py",
						"access_mode":    "read_write",
						"autoBinding":    true,
					},
				}),
			},
			"global-section": {
				ID:               "global-section",
				Name:             "Global Variables",
				VariantIDs:       []string{"global-variant"},
				DefaultVariantID: "global-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"callable-variant": {
				ID:       "callable-variant",
				Name:     "Callable Variant",
				ImplID:   "callable-impl",
				Modifier: mustRawJSON(t, map[string]any{"pinnedParams": []string{"param-b"}}),
			},
			"draw-variant": {
				ID:     "draw-variant",
				Name:   "Draw Variant",
				ImplID: "draw-impl",
			},
			"gen-variant": {
				ID:     "gen-variant",
				Name:   "Generated Variant",
				ImplID: "gen-impl",
			},
			"global-variant": {
				ID:     "global-variant",
				Name:   "Global Variant",
				ImplID: "global-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"callable-impl": {
				ID:      "callable-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustRawJSON(t, map[string]any{"id": "callable-impl", "type": "Callable"}),
			},
			"draw-impl": {
				ID:      "draw-impl",
				Kind:    projectstate.SectionKindDraw,
				Draw:    &projectstate.DrawSectionImpl{},
				Payload: mustRawJSON(t, map[string]any{"id": "draw-impl", "type": "Draw"}),
			},
			"gen-impl": {
				ID:        "gen-impl",
				Kind:      projectstate.SectionKindGenerated,
				Generated: &projectstate.GeneratedSectionImpl{Kind: projectstate.GeneratedSectionKindPythonCode},
			},
			"global-impl": {
				ID:      "global-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustRawJSON(t, map[string]any{"id": "global-impl", "type": "GlobalVariables"}),
			},
		},
		CodeObjs: map[string]projectstate.CodeObject{
			"callable-root": {
				ID:               "callable-root",
				Name:             "callable_root",
				VariantIDs:       []string{"callable-root-variant"},
				DefaultVariantID: "callable-root-variant",
				SharedModifier:   mustRawJSON(t, map[string]any{"children": []string{"param-a", "param-b"}}),
			},
			"param-a": {
				ID:               "param-a",
				Name:             "param_a",
				VariantIDs:       []string{"param-a-variant"},
				DefaultVariantID: "param-a-variant",
			},
			"param-b": {
				ID:               "param-b",
				Name:             "param_b",
				VariantIDs:       []string{"param-b-variant"},
				DefaultVariantID: "param-b-variant",
				SharedModifier:   mustRawJSON(t, map[string]any{"children": []string{"param-b-child"}}),
			},
			"param-b-child": {
				ID:               "param-b-child",
				Name:             "param_b_child",
				VariantIDs:       []string{"param-b-child-variant"},
				DefaultVariantID: "param-b-child-variant",
			},
		},
		CodeObjVariants: map[string]projectstate.CodeObjectVariant{
			"callable-root-variant": {
				ID:     "callable-root-variant",
				Name:   "Callable Root Variant",
				ImplID: "callable-root-impl",
			},
			"param-a-variant": {
				ID:     "param-a-variant",
				Name:   "Param A Variant",
				ImplID: "param-a-impl",
			},
			"param-b-variant": {
				ID:     "param-b-variant",
				Name:   "Param B Variant",
				ImplID: "param-b-impl",
			},
			"param-b-child-variant": {
				ID:     "param-b-child-variant",
				Name:   "Param B Child Variant",
				ImplID: "param-b-child-impl",
			},
		},
		CodeObjImpls: map[string]projectstate.CodeObjectImpl{
			"callable-root-impl": {
				ID:   "callable-root-impl",
				Type: "CodeCallable",
			},
			"param-a-impl": {
				ID:   "param-a-impl",
				Type: "TextParam",
			},
			"param-b-impl": {
				ID:   "param-b-impl",
				Type: "TextParam",
			},
			"param-b-child-impl": {
				ID:   "param-b-child-impl",
				Type: "TextParam",
			},
		},
	}

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
			"project-beta": {
				ID:   "project-beta",
				Name: "Project Beta",
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("Normalize document: %v", err)
	}
	return document
}

func assertSingleConfigFrontendEmptyCollections(t *testing.T, view SingleConfig) {
	t.Helper()

	if view.ProjectConfig.ActiveIDs == nil {
		t.Fatal("expected active ids slice to be non-nil")
	}
	if view.ProjectConfig.WindowSpaces == nil {
		t.Fatal("expected window spaces map to be non-nil")
	}
	if view.PluginData == nil {
		t.Fatal("expected plugin data map to be non-nil")
	}
	if view.Sections["global-section"].UnsharedKeys == nil {
		t.Fatal("expected section unshared keys slice to be non-nil")
	}
	if view.SectionVariants["draw-variant"].NonPresetImpls == nil {
		t.Fatal("expected variant non-preset impls slice to be non-nil")
	}
	if view.CodeObjs["callable-root"].UnsharedKeys == nil {
		t.Fatal("expected code object unshared keys slice to be non-nil")
	}
}

func assertSingleConfigFrontendEmptyModifiers(t *testing.T, view SingleConfig) {
	t.Helper()

	if string(view.Sections["global-section"].SharedModifier) != "{}" {
		t.Fatalf(
			"expected empty section sharedModifier object, got %s",
			string(view.Sections["global-section"].SharedModifier),
		)
	}
	if string(view.SectionVariants["draw-variant"].Modifier) != "{}" {
		t.Fatalf(
			"expected empty section variant modifier object, got %s",
			string(view.SectionVariants["draw-variant"].Modifier),
		)
	}
	if string(view.CodeObjs["param-a"].SharedModifier) != "{}" {
		t.Fatalf(
			"expected empty code object sharedModifier object, got %s",
			string(view.CodeObjs["param-a"].SharedModifier),
		)
	}
	if string(view.CodeObjVariants["param-b-variant"].Modifier) != "{}" {
		t.Fatalf(
			"expected empty code object variant modifier object, got %s",
			string(view.CodeObjVariants["param-b-variant"].Modifier),
		)
	}
}

func assertSingleConfigFrontendJSONContracts(t *testing.T, view SingleConfig) {
	t.Helper()

	decoded := decodeSingleConfigJSON(t, view)
	projectConfig := requireJSONObjectField(t, decoded, "projectConfig")
	requireJSONArrayField(t, projectConfig, "activeIds")
	requireMissingJSONField(t, projectConfig, "watchCodeFiles")
	pluginData := requireJSONObjectField(t, decoded, "pluginData")
	if len(pluginData) != 0 {
		t.Fatalf("expected no default plugin data entries, got %#v", pluginData)
	}
	projectChatWindowing := requireJSONObjectField(t, decoded, "projectChatWindowing")
	requireJSONObjectField(t, projectChatWindowing, "instancesById")
	requireJSONArrayField(t, projectChatWindowing, "order")
	sections := requireJSONObjectField(t, decoded, "sections")
	globalSection := requireJSONObjectField(t, sections, "global-section")
	requireJSONObjectField(t, globalSection, "sharedModifier")
	sectionVariants := requireJSONObjectField(t, decoded, "sectionVariants")
	drawVariant := requireJSONObjectField(t, sectionVariants, "draw-variant")
	requireJSONObjectField(t, drawVariant, "modifier")
}

func decodeSingleConfigJSON(t *testing.T, view SingleConfig) map[string]any {
	t.Helper()

	jsonPayload, err := json.Marshal(view)
	if err != nil {
		t.Fatalf("marshal single config: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(jsonPayload, &decoded); err != nil {
		t.Fatalf("unmarshal single config json: %v", err)
	}
	return decoded
}

func requireJSONObjectField(t *testing.T, parent map[string]any, key string) map[string]any {
	t.Helper()

	value, ok := parent[key].(map[string]any)
	if !ok || value == nil {
		t.Fatalf("expected %s json object, got %#v", key, parent[key])
	}
	return value
}

func requireJSONArrayField(t *testing.T, parent map[string]any, key string) []any {
	t.Helper()

	value, ok := parent[key].([]any)
	if !ok || value == nil {
		t.Fatalf("expected %s json array, got %#v", key, parent[key])
	}
	return value
}

func requireMissingJSONField(t *testing.T, parent map[string]any, key string) {
	t.Helper()

	if _, ok := parent[key]; ok {
		t.Fatalf("did not expect legacy %s on JSON payload, got %#v", key, parent[key])
	}
}

func projectViewDocumentWithDeletedLastDictKwarg(t *testing.T) (projectstate.Document, string) {
	t.Helper()

	project := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
	}
	defaultWindowing := projectstate.DefaultProjectChatWindowingState()
	project.ProjectChatWindowing = &defaultWindowing

	createdSection, err := project.CreateTopLevelSection(
		projectstate.CreateTopLevelSectionInput{ImplType: "Dict"},
		projectstate.DefaultStructuralMutationSettings(),
	)
	if err != nil {
		t.Fatalf("create dict section: %v", err)
	}
	if _, err := project.AddKwarg(createdSection.SectionID); err != nil {
		t.Fatalf("add first kwarg: %v", err)
	}
	if _, err := project.DeleteKwarg(createdSection.SectionID); err != nil {
		t.Fatalf("delete last kwarg: %v", err)
	}

	return projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": project,
		},
	}, createdSection.SectionID
}

func assertShownParamsEmpty(t *testing.T, shown ShownParamIDs) {
	t.Helper()

	if len(shown.Pinned.TopLevelParamIDs) != 0 || len(shown.Unpinned.TopLevelParamIDs) != 0 {
		t.Fatalf("expected no visible params after deleting last kwarg, got %#v", shown)
	}
}

func assertDictRootChildrenEmpty(t *testing.T, view SingleConfig, dictVariantID string) {
	t.Helper()

	dictImplID := view.SectionVariants[dictVariantID].Impl
	dictPayload := decodeRawMessagePayload(t, view.SectionImpls[dictImplID], "dict payload")
	rootID, ok := dictPayload["topLevelParamId"].(string)
	if !ok || rootID == "" {
		t.Fatalf("expected dict root id after add/delete flow, got %#v", dictPayload["topLevelParamId"])
	}
	rootCore, ok := view.CodeObjs[rootID]
	if !ok {
		t.Fatalf("expected root code object %q in view", rootID)
	}
	variantMap, ok := dictPayload["codeObjVariantMap"].(map[string]any)
	if !ok {
		t.Fatalf("expected dict codeObjVariantMap object, got %#v", dictPayload["codeObjVariantMap"])
	}
	rootVariantID, ok := variantMap[rootID].(string)
	if !ok || rootVariantID == "" {
		t.Fatalf("expected dict codeObjVariantMap entry for root %q, got %#v", rootID, variantMap)
	}
	rootImplID := view.CodeObjVariants[rootVariantID].Impl
	rootImplPayload := decodeRawMessagePayload(t, view.CodeObjImpls[rootImplID], "root impl payload")
	assertJSONArrayEmpty(t, rootImplPayload, "children", "root impl children")
	rootModifier := decodeRawMessagePayload(t, rootCore.SharedModifier, "root shared modifier")
	assertJSONArrayEmpty(t, rootModifier, "children", "root sharedModifier children")
}

func addLegacyGroupSection(t *testing.T, project *projectstate.Project) {
	t.Helper()

	project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, "group-section")
	project.SectionVariantMap["group-section"] = "group-variant"
	project.Sections["group-section"] = projectstate.Section{
		ID:               "group-section",
		Name:             "Group Section",
		VariantIDs:       []string{"group-variant"},
		DefaultVariantID: "group-variant",
	}
	project.SectionVariants["group-variant"] = projectstate.SectionVariant{
		ID:     "group-variant",
		Name:   "Group Variant",
		ImplID: "group-impl",
	}
	project.SectionImpls["group-impl"] = projectstate.SectionImpl{
		ID:      "group-impl",
		Kind:    projectstate.SectionKind("frontend"),
		Payload: mustRawJSON(t, map[string]any{"id": "group-impl", "type": "Group"}),
	}
}

func assertLegacySectionImplDefaults(t *testing.T, view SingleConfig) {
	t.Helper()

	assertCallableImplDefaults(t, view)
	assertGlobalImplDefaults(t, view)
	assertGeneratedImplDefaults(t, view)
	assertGroupImplDefaults(t, view)
}

func assertCallableImplDefaults(t *testing.T, view SingleConfig) {
	t.Helper()

	payload := decodeRawMessagePayload(t, view.SectionImpls["callable-impl"], "callable payload")
	if got := payload["configLanguage"]; got != "python" {
		t.Fatalf("expected callable configLanguage python, got %#v", got)
	}
	if _, ok := payload["codeObjVariantMap"].(map[string]any); !ok {
		t.Fatalf("expected callable codeObjVariantMap object, got %#v", payload["codeObjVariantMap"])
	}
	if value, ok := payload["callable"]; !ok || value != nil {
		t.Fatalf("expected callable root explicit null, got %#v", payload["callable"])
	}
	if got := payload["hideParams"]; got != false {
		t.Fatalf("expected callable hideParams false, got %#v", got)
	}
	size, ok := payload["size"].(map[string]any)
	if !ok {
		t.Fatalf("expected callable size object, got %#v", payload["size"])
	}
	if size["width"] != 250.0 || size["height"] != 150.0 {
		t.Fatalf("expected callable default size {250 150}, got %#v", size)
	}
	assertJSONArrayEmpty(t, payload, "pinnedParams", "callable pinnedParams")
	ignoreState := requireJSONObjectField(t, payload, "ignoreTypeErrors")
	values := requireJSONObjectField(t, ignoreState, "params")
	if len(values) != 0 {
		t.Fatalf("expected callable ignoreTypeErrors.params empty object, got %#v", values)
	}
}

func assertGlobalImplDefaults(t *testing.T, view SingleConfig) {
	t.Helper()

	payload := decodeRawMessagePayload(t, view.SectionImpls["global-impl"], "global payload")
	if value, ok := payload["topLevelParamId"]; !ok || value != nil {
		t.Fatalf("expected global topLevelParamId explicit null, got %#v", payload["topLevelParamId"])
	}
	if got := payload["isJsonSource"]; got != false {
		t.Fatalf("expected global isJsonSource false, got %#v", got)
	}
	assertJSONArrayEmpty(t, payload, "jsonSourceKeys", "global jsonSourceKeys")
}

func assertGeneratedImplDefaults(t *testing.T, view SingleConfig) {
	t.Helper()

	payload := decodeRawMessagePayload(t, view.SectionImpls["gen-impl"], "generated payload")
	size := requireJSONObjectField(t, payload, "size")
	if size["width"] != 500.0 || size["height"] != 150.0 {
		t.Fatalf("expected generated default size {500 150}, got %#v", size)
	}
	assertJSONArrayEmpty(t, payload, "children", "generated children")
}

func assertGroupImplDefaults(t *testing.T, view SingleConfig) {
	t.Helper()

	payload := decodeRawMessagePayload(t, view.SectionImpls["group-impl"], "group payload")
	assertJSONArrayEmpty(t, payload, "children", "group children")
}

func decodeRawMessagePayload(t *testing.T, raw json.RawMessage, label string) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("decode %s: %v", label, err)
	}
	return payload
}

func assertJSONArrayEmpty(t *testing.T, payload map[string]any, key string, label string) {
	t.Helper()

	values, ok := payload[key].([]any)
	if !ok || values == nil {
		t.Fatalf("expected %s array, got %#v", label, payload[key])
	}
	if len(values) != 0 {
		t.Fatalf("expected %s to be empty, got %#v", label, values)
	}
}

func decodeProjectCodegenTargetPayload(t *testing.T, raw ProjectCodegenTarget) map[string]any {
	t.Helper()

	var payload map[string]any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("decode project codegen target payload: %v", err)
	}
	return payload
}

func mustRawJSON(t *testing.T, payload any) json.RawMessage {
	t.Helper()
	content, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return content
}

func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
