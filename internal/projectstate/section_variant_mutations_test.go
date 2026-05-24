package projectstate

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestRuntimeSetSectionVariantNameUpdatesVariantMetadata(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantMutationTestRuntime(t, true)

	if _, err := runtime.SetSectionVariantName(context.Background(), "project-alpha", "dict-variant", "source.json"); err != nil {
		t.Fatalf("SetSectionVariantName returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after SetSectionVariantName: %v", err)
	}
	if got := project.SectionVariants["dict-variant"].Name; got != "source.json" {
		t.Fatalf("expected dict-variant name source.json, got %q", got)
	}
}

func TestRuntimeToggleVariantFrozenFlipsFrozenFlag(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantMutationTestRuntime(t, true)

	if _, err := runtime.ToggleVariantFrozen(context.Background(), "project-alpha", "dict-variant"); err != nil {
		t.Fatalf("ToggleVariantFrozen returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after ToggleVariantFrozen: %v", err)
	}
	if !project.SectionVariants["dict-variant"].IsFrozen {
		t.Fatal("expected dict-variant to be frozen after toggle")
	}
}

func TestRuntimeToggleVariantJSONSourceUpdatesDictPayload(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantMutationTestRuntime(t, true)

	if _, err := runtime.ToggleVariantJSONSource(context.Background(), "project-alpha", "dict-section", "dict-variant"); err != nil {
		t.Fatalf("ToggleVariantJSONSource returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after ToggleVariantJSONSource: %v", err)
	}
	payload, err := project.EffectiveSectionPayload("dict-section", "dict-variant")
	if err != nil {
		t.Fatalf("effective section payload after ToggleVariantJSONSource: %v", err)
	}
	if !payloadBoolField(payload, "isJsonSource") {
		t.Fatal("expected dict-section payload to enable json source")
	}
	if got := payloadStringField(payload, "configLanguage"); got != "json" {
		t.Fatalf("expected configLanguage json after toggle, got %q", got)
	}
}

func TestRuntimeSetVariantJSONSourceKeysStoresNormalizedKeys(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantMutationTestRuntime(t, true)

	if _, err := runtime.SetVariantJSONSourceKeys(
		context.Background(),
		"project-alpha",
		"dict-section",
		"dict-variant",
		[]string{" config ", "", "nested"},
	); err != nil {
		t.Fatalf("SetVariantJSONSourceKeys returned error: %v", err)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after SetVariantJSONSourceKeys: %v", err)
	}
	payload, err := project.EffectiveSectionPayload("dict-section", "dict-variant")
	if err != nil {
		t.Fatalf("effective section payload after SetVariantJSONSourceKeys: %v", err)
	}
	if got := payloadStringArrayField(payload, "jsonSourceKeys"); len(got) != 2 || got[0] != "config" || got[1] != "nested" {
		t.Fatalf("expected normalized jsonSourceKeys [config nested], got %#v", got)
	}
}

func TestRuntimeSetVariantJSONSourceKeysRejectsDisabledEdits(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantMutationTestRuntime(t, false)

	_, err := runtime.SetVariantJSONSourceKeys(
		context.Background(),
		"project-alpha",
		"dict-section",
		"dict-variant",
		[]string{"config"},
	)
	if !errors.Is(err, ErrJSONSourceKeyEditsDisabled) {
		t.Fatalf("expected ErrJSONSourceKeyEditsDisabled, got %v", err)
	}
}

func TestResolveVariantJSONSourceKeysRejectsMissingExistingPath(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"config\":{\"nested\":{}},\"leaf\":1}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	document := sectionVariantMutationTestDocument(t, true, "data/source.json")
	_, err := ResolveVariantJSONSourceKeys(
		document,
		workspaceRoot,
		"project-alpha",
		"dict-section",
		"dict-variant",
		[]string{"missing"},
	)
	if !errors.Is(err, ErrJSONSourceKeysPathNotFound) {
		t.Fatalf("expected ErrJSONSourceKeysPathNotFound, got %v", err)
	}
	if got := err.Error(); got != "jsonSourceKeys path not found: missing" {
		t.Fatalf("expected missing-path detail, got %q", got)
	}
}

func TestResolveVariantJSONSourceKeysAcceptsMissingFileAndMarksMissing(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	document := sectionVariantMutationTestDocument(t, true, "data/source.json")

	resolution, err := ResolveVariantJSONSourceKeys(
		document,
		workspaceRoot,
		"project-alpha",
		"dict-section",
		"dict-variant",
		[]string{" config ", "", "nested"},
	)
	if err != nil {
		t.Fatalf("ResolveVariantJSONSourceKeys returned error: %v", err)
	}
	if !resolution.JSONSourceMissing {
		t.Fatal("expected missing json source file to mark jsonSourceMissing")
	}
	if len(resolution.JSONSourceKeys) != 2 || resolution.JSONSourceKeys[0] != "config" || resolution.JSONSourceKeys[1] != "nested" {
		t.Fatalf("expected normalized jsonSourceKeys [config nested], got %#v", resolution.JSONSourceKeys)
	}
	if resolution.JSONSourceObject == nil {
		t.Fatal("expected missing json source file to return an empty selected object")
	}
}

func TestDocumentRefreshVariantJSONSourceLiveTreeReplacesLiveSubtreeWithoutChangingKeys(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"beta\":{\"second\":2,\"first\":[1,true]}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	document := jsonSourceLiveRefreshTestDocument(t)
	resolution, err := ResolveVariantJSONSourceKeys(
		document,
		workspaceRoot,
		"project-alpha",
		"json-section",
		"json-variant-a",
		[]string{"beta"},
	)
	if err != nil {
		t.Fatalf("ResolveVariantJSONSourceKeys returned error: %v", err)
	}
	if resolution.JSONSourceMissing {
		t.Fatal("expected existing json source file not to be marked missing")
	}
	if resolution.JSONSourceObject == nil {
		t.Fatal("expected ResolveVariantJSONSourceKeys to return a selected object")
	}

	if err := document.RefreshVariantJSONSourceLiveTree(
		"project-alpha",
		"json-section",
		"json-variant-a",
		resolution.JSONSourceKeys,
		*resolution.JSONSourceObject,
	); err != nil {
		t.Fatalf("RefreshVariantJSONSourceLiveTree returned error: %v", err)
	}

	project, err := document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after refresh: %v", err)
	}
	sectionPayload, err := project.EffectiveSectionPayload("json-section", "json-variant-a")
	if err != nil {
		t.Fatalf("effective section payload after refresh: %v", err)
	}
	codeObjVariantMap := assertJSONSourceLiveRefreshSectionPayload(t, project, sectionPayload)
	assertJSONSourceLiveRefreshChildren(t, project, codeObjVariantMap)
}

func assertJSONSourceLiveRefreshSectionPayload(t *testing.T, project Project, sectionPayload map[string]any) map[string]string {
	t.Helper()

	if got := payloadStringArrayField(sectionPayload, "jsonSourceKeys"); len(got) != 1 || got[0] != "alpha" {
		t.Fatalf("expected persisted jsonSourceKeys to remain [alpha], got %#v", got)
	}
	if got := payloadStringField(sectionPayload, "topLevelParamId"); got != "old-root" {
		t.Fatalf("expected topLevelParamId old-root, got %q", got)
	}
	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	if len(codeObjVariantMap) != 3 {
		t.Fatalf("expected codeObjVariantMap size 3 after refresh, got %#v", codeObjVariantMap)
	}
	if _, ok := project.CodeObjs["old-leaf"]; ok {
		t.Fatalf("expected old-leaf code object to be pruned, got %#v", project.CodeObjs["old-leaf"])
	}
	return codeObjVariantMap
}

func assertJSONSourceLiveRefreshChildren(t *testing.T, project Project, codeObjVariantMap map[string]string) {
	t.Helper()

	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, "old-root")
	if err != nil {
		t.Fatalf("effective root payload after refresh: %v", err)
	}
	childIDs := payloadStringArrayField(rootPayload, "children")
	if len(childIDs) != 2 {
		t.Fatalf("expected root children [second first], got %#v", childIDs)
	}
	secondPayload, secondCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[0])
	if err != nil {
		t.Fatalf("effective second payload after refresh: %v", err)
	}
	if secondCodeObj.Name != "second" {
		t.Fatalf("expected first refreshed child to be named second, got %q", secondCodeObj.Name)
	}
	if got := payloadStringField(secondPayload, "value"); got != "2" {
		t.Fatalf("expected second child value 2, got %q", got)
	}
	firstPayload, firstCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, childIDs[1])
	if err != nil {
		t.Fatalf("effective first payload after refresh: %v", err)
	}
	if firstCodeObj.Name != "first" {
		t.Fatalf("expected second refreshed child to be named first, got %q", firstCodeObj.Name)
	}
	if got := payloadStringField(firstPayload, "value"); got != "[1,true]" {
		t.Fatalf("expected first child value [1,true], got %q", got)
	}
}

func TestDocumentRefreshVariantJSONSourceLiveTreeReusesMatchingChildNamesAndPrunesRemovedSiblings(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"beta\":{\"second\":2}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	// Keep one matching child name so refresh can reuse its code-object id, and
	// add one stale sibling so the same refresh pass has to prune it.
	document := jsonSourceLiveRefreshReuseTestDocument(t)
	resolution, err := ResolveVariantJSONSourceKeys(
		document,
		workspaceRoot,
		"project-alpha",
		"json-section",
		"json-variant-a",
		[]string{"beta"},
	)
	if err != nil {
		t.Fatalf("ResolveVariantJSONSourceKeys returned error: %v", err)
	}
	if resolution.JSONSourceObject == nil {
		t.Fatal("expected ResolveVariantJSONSourceKeys to return a selected object")
	}

	if err := document.RefreshVariantJSONSourceLiveTree(
		"project-alpha",
		"json-section",
		"json-variant-a",
		resolution.JSONSourceKeys,
		*resolution.JSONSourceObject,
	); err != nil {
		t.Fatalf("RefreshVariantJSONSourceLiveTree returned error: %v", err)
	}

	project, err := document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after refresh: %v", err)
	}
	sectionPayload, err := project.EffectiveSectionPayload("json-section", "json-variant-a")
	if err != nil {
		t.Fatalf("effective section payload after refresh: %v", err)
	}
	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")

	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, "old-root")
	if err != nil {
		t.Fatalf("effective root payload after refresh: %v", err)
	}
	childIDs := payloadStringArrayField(rootPayload, "children")
	if len(childIDs) != 1 {
		t.Fatalf("expected root children [old-leaf], got %#v", childIDs)
	}
	if childIDs[0] != "old-leaf" {
		t.Fatalf("expected matching child path to reuse old-leaf, got %#v", childIDs)
	}
	secondPayload, secondCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, "old-leaf")
	if err != nil {
		t.Fatalf("effective reused child payload after refresh: %v", err)
	}
	if secondCodeObj.Name != "second" {
		t.Fatalf("expected reused child to stay named second, got %q", secondCodeObj.Name)
	}
	if got := payloadStringField(secondPayload, "value"); got != "2" {
		t.Fatalf("expected reused child value 2, got %q", got)
	}
	if _, ok := project.CodeObjs["old-drop"]; ok {
		t.Fatalf("expected stale sibling old-drop to be pruned, got %#v", project.CodeObjs["old-drop"])
	}
}

func TestDocumentRefreshVariantJSONSourceLiveTreeRecreatesRootWhenCurrentRootIsLeaf(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "data"), 0o755); err != nil {
		t.Fatalf("mkdir data: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "data", "source.json"), []byte("{\"beta\":{\"second\":2,\"first\":[1,true]}}\n"), 0o644); err != nil {
		t.Fatalf("write json source payload: %v", err)
	}

	document := jsonSourceLiveRefreshLeafRootTestDocument(t)
	resolution, err := ResolveVariantJSONSourceKeys(
		document,
		workspaceRoot,
		"project-alpha",
		"json-section",
		"json-variant-a",
		[]string{"beta"},
	)
	if err != nil {
		t.Fatalf("ResolveVariantJSONSourceKeys returned error: %v", err)
	}
	if resolution.JSONSourceObject == nil {
		t.Fatal("expected ResolveVariantJSONSourceKeys to return a selected object")
	}

	if err := document.RefreshVariantJSONSourceLiveTree(
		"project-alpha",
		"json-section",
		"json-variant-a",
		resolution.JSONSourceKeys,
		*resolution.JSONSourceObject,
	); err != nil {
		t.Fatalf("RefreshVariantJSONSourceLiveTree returned error: %v", err)
	}

	project, err := document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after refresh: %v", err)
	}
	sectionPayload, err := project.EffectiveSectionPayload("json-section", "json-variant-a")
	if err != nil {
		t.Fatalf("effective section payload after refresh: %v", err)
	}
	rootID := payloadStringField(sectionPayload, "topLevelParamId")
	if rootID == "" || rootID == "old-root" {
		t.Fatalf("expected refresh to create a new root id, got %q", rootID)
	}
	if _, ok := project.CodeObjs["old-root"]; ok {
		t.Fatalf("expected old-root code object to be pruned, got %#v", project.CodeObjs["old-root"])
	}

	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	rootPayload, rootCodeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, rootID)
	if err != nil {
		t.Fatalf("effective recreated root payload after refresh: %v", err)
	}
	if rootCodeObj.Name != "alpha" {
		t.Fatalf("expected recreated root to keep name alpha, got %q", rootCodeObj.Name)
	}
	childIDs := payloadStringArrayField(rootPayload, "children")
	if len(childIDs) != 2 {
		t.Fatalf("expected recreated root children [second first], got %#v", childIDs)
	}
}

func TestRuntimeToggleVariantJSONSourceRejectsNonDictSection(t *testing.T) {
	t.Parallel()

	runtime := openSectionVariantMutationTestRuntime(t, true)

	_, err := runtime.ToggleVariantJSONSource(context.Background(), "project-alpha", "code-section", "code-variant")
	if !errors.Is(err, ErrSectionVariantDictSectionRequired) {
		t.Fatalf("expected ErrSectionVariantDictSectionRequired, got %v", err)
	}
}

func openSectionVariantMutationTestRuntime(t *testing.T, allowJSONSourceKeyEdits bool) *Runtime {
	t.Helper()

	document := sectionVariantMutationTestDocument(t, allowJSONSourceKeyEdits, "")
	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})
	return runtime
}

func sectionVariantMutationTestDocument(t *testing.T, allowJSONSourceKeyEdits bool, dictVariantName string) Document {
	t.Helper()

	project, err := Project{
		ID:                      "project-alpha",
		Name:                    "Alpha",
		AllowJSONSourceKeyEdits: allowJSONSourceKeyEdits,
		SectionVariantMap: map[string]string{
			"dict-section": "dict-variant",
			"code-section": "code-variant",
		},
		Sections: map[string]Section{
			"dict-section": {
				ID:               "dict-section",
				Name:             "Dict Section",
				VariantIDs:       []string{"dict-variant"},
				DefaultVariantID: "dict-variant",
			},
			"code-section": {
				ID:               "code-section",
				Name:             "Code Section",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"dict-variant": {
				ID:     "dict-variant",
				ImplID: "dict-impl",
				Name:   dictVariantName,
			},
			"code-variant": {
				ID:     "code-variant",
				ImplID: "code-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"dict-impl": {
				ID:   "dict-impl",
				Kind: SectionKind("frontend"),
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":             "dict-impl",
					"type":           "Dict",
					"isJsonSource":   false,
					"configLanguage": "python",
					"jsonSourceKeys": []string{},
				}),
			},
			"code-impl": {
				ID:   "code-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language: CodeLanguagePython,
				},
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":           "code-impl",
					"type":         "Code",
					"codeLanguage": "python",
					"children":     []string{},
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize section variant mutation project: %v", err)
	}

	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			project.ID: project,
		},
	}
}

func jsonSourceLiveRefreshTestDocument(t *testing.T) Document {
	t.Helper()

	project, err := Project{
		ID:                      "project-alpha",
		Name:                    "Alpha",
		AllowJSONSourceKeyEdits: true,
		ProjectChatWindowing:    &ProjectChatWindowingState{InstancesByID: map[string]ProjectChatWindowInstance{}, Order: []string{}},
		SectionVariantMap: map[string]string{
			"json-section": "json-variant-a",
		},
		Sections: map[string]Section{
			"json-section": {
				ID:               "json-section",
				Name:             "JSON Source",
				VariantIDs:       []string{"json-variant-a"},
				DefaultVariantID: "json-variant-a",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"json-variant-a": {
				ID:     "json-variant-a",
				ImplID: "json-impl-a",
				Name:   "data/source.json",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"json-impl-a": {
				ID:   "json-impl-a",
				Kind: SectionKind("dict"),
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
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
		CodeObjs: map[string]CodeObject{
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
		CodeObjVariants: map[string]CodeObjectVariant{
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
		CodeObjImpls: map[string]CodeObjectImpl{
			"old-root-impl": {
				ID:   "old-root-impl",
				Type: "NestedParam",
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":       "old-root-impl",
					"type":     "NestedParam",
					"children": []string{"old-leaf"},
				}),
			},
			"old-leaf-impl": {
				ID:   "old-leaf-impl",
				Type: "CodeParam",
				Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
					"id":    "old-leaf-impl",
					"type":  "CodeParam",
					"value": "1",
				}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize json source live refresh project: %v", err)
	}

	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			project.ID: project,
		},
	}
}

func jsonSourceLiveRefreshReuseTestDocument(t *testing.T) Document {
	t.Helper()

	document := jsonSourceLiveRefreshTestDocument(t)
	project := document.Projects["project-alpha"]

	reusedChild := project.CodeObjs["old-leaf"]
	reusedChild.Name = "second"
	project.CodeObjs["old-leaf"] = reusedChild

	project.CodeObjs["old-drop"] = CodeObject{
		ID:               "old-drop",
		Name:             "drop",
		VariantIDs:       []string{"old-drop-variant"},
		DefaultVariantID: "old-drop-variant",
	}
	project.CodeObjVariants["old-drop-variant"] = CodeObjectVariant{
		ID:               "old-drop-variant",
		ImplID:           "old-drop-impl",
		NonPresetImplIDs: []string{"old-drop-impl"},
	}
	project.CodeObjImpls["old-drop-impl"] = CodeObjectImpl{
		ID:   "old-drop-impl",
		Type: "CodeParam",
		Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
			"id":    "old-drop-impl",
			"type":  "CodeParam",
			"value": "99",
		}),
	}
	project.CodeObjImpls["old-root-impl"] = CodeObjectImpl{
		ID:   "old-root-impl",
		Type: "NestedParam",
		Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
			"id":       "old-root-impl",
			"type":     "NestedParam",
			"children": []string{"old-leaf", "old-drop"},
		}),
	}
	project.SectionImpls["json-impl-a"] = SectionImpl{
		ID:   "json-impl-a",
		Kind: SectionKind("dict"),
		Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
			"id":              "json-impl-a",
			"type":            "Dict",
			"isJsonSource":    true,
			"configLanguage":  "json",
			"jsonSourceKeys":  []string{"alpha"},
			"topLevelParamId": "old-root",
			"codeObjVariantMap": map[string]any{
				"old-root": "old-root-variant",
				"old-leaf": "old-leaf-variant",
				"old-drop": "old-drop-variant",
			},
		}),
	}
	document.Projects["project-alpha"] = project
	return document
}

func jsonSourceLiveRefreshLeafRootTestDocument(t *testing.T) Document {
	t.Helper()

	document := jsonSourceLiveRefreshTestDocument(t)
	project := document.Projects["project-alpha"]

	delete(project.CodeObjs, "old-leaf")
	delete(project.CodeObjVariants, "old-leaf-variant")
	delete(project.CodeObjImpls, "old-leaf-impl")
	project.CodeObjImpls["old-root-impl"] = CodeObjectImpl{
		ID:   "old-root-impl",
		Type: "CodeParam",
		Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
			"id":    "old-root-impl",
			"type":  "CodeParam",
			"value": "1",
		}),
	}
	project.SectionImpls["json-impl-a"] = SectionImpl{
		ID:   "json-impl-a",
		Kind: SectionKind("dict"),
		Payload: mustSectionVariantMutationRawJSON(t, map[string]any{
			"id":              "json-impl-a",
			"type":            "Dict",
			"isJsonSource":    true,
			"configLanguage":  "json",
			"jsonSourceKeys":  []string{"alpha"},
			"topLevelParamId": "old-root",
			"codeObjVariantMap": map[string]any{
				"old-root": "old-root-variant",
			},
		}),
	}
	document.Projects["project-alpha"] = project
	return document
}

func mustSectionVariantMutationRawJSON(t *testing.T, value any) RawJSON {
	t.Helper()
	return mustMarshalProjectObject(value.(map[string]any))
}
