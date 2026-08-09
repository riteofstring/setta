package settingsstate

import (
	"testing"

	"setta/internal/projectstate"
)

func TestApplySettingsProjectDocumentOverlaysJSONSourceSections(t *testing.T) {
	t.Parallel()

	base, err := DefaultDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}
	base["backend"].(map[string]any)["autoRefetchCallableParamsOnLspMismatch"] = false

	output, err := ApplySettingsProjectDocument(base, settingsProjectMaterializerTestDocument(t))
	if err != nil {
		t.Fatalf("ApplySettingsProjectDocument returned error: %v", err)
	}

	backend := output["backend"].(map[string]any)
	if got := backend["renameRefactorMode"]; got != "ALWAYS_RENAME" {
		t.Fatalf("expected renameRefactorMode ALWAYS_RENAME, got %#v", got)
	}
	if got := backend["autosave"]; got != false {
		t.Fatalf("expected autosave false, got %#v", got)
	}
	if got := backend["autoRefetchCallableParamsOnLspMismatch"]; got != false {
		t.Fatalf("expected base autoRefetchCallableParamsOnLspMismatch false, got %#v", got)
	}

	terminal := output["terminalSectionDefault"].(map[string]any)
	size := terminal["size"].(map[string]any)
	if got := size["height"]; got != float64(222) {
		t.Fatalf("expected terminal height 222, got %#v", got)
	}
}

func TestApplySettingsProjectDocumentReturnsBaseForEmptySettingsProject(t *testing.T) {
	t.Parallel()

	base, err := DefaultDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}
	base["backend"].(map[string]any)["renameRefactorMode"] = "NEVER_RENAME"

	output, err := ApplySettingsProjectDocument(base, projectstate.NewDocument())
	if err != nil {
		t.Fatalf("ApplySettingsProjectDocument empty project returned error: %v", err)
	}
	if got := output["backend"].(map[string]any)["renameRefactorMode"]; got != "NEVER_RENAME" {
		t.Fatalf("expected base renameRefactorMode NEVER_RENAME, got %#v", got)
	}
}

func TestApplySettingsProjectDocumentSkipsInvalidEnumValues(t *testing.T) {
	t.Parallel()

	base, err := DefaultDocument()
	if err != nil {
		t.Fatalf("NewDocument returned error: %v", err)
	}

	projectDocument, err := buildProjectDocumentWithSharedSettingsPath(
		base,
		DefaultFileName,
	)
	if err != nil {
		t.Fatalf("buildProjectDocumentWithSharedSettingsPath returned error: %v", err)
	}

	implID := settingsCodeObjImplID(
		"sectionSizingPolicy",
		[]string{
			"sectionSizingPolicy",
			"metaControlByType",
			"TimeParam",
			"sizeModeWidth",
		},
	)
	impl, ok := projectDocument.Projects[SettingsProjectID].CodeObjImpls[implID]
	if !ok {
		t.Fatalf("expected settings project code object impl %q", implID)
	}
	impl.Payload = projectstate.RawJSON(`{
		"id":"` + implID + `",
		"type":"DropdownParam",
		"value":""
	}`)
	project := projectDocument.Projects[SettingsProjectID]
	project.CodeObjImpls[implID] = impl
	projectDocument.Projects[SettingsProjectID] = project

	output, err := ApplySettingsProjectDocument(base, projectDocument)
	if err != nil {
		t.Fatalf("ApplySettingsProjectDocument returned error: %v", err)
	}

	sectionSizingPolicy := output["sectionSizingPolicy"].(map[string]any)
	metaControlByType := sectionSizingPolicy["metaControlByType"].(map[string]any)
	timeParam := metaControlByType["TimeParam"].(map[string]any)
	if got := timeParam["sizeModeWidth"]; got != "any" {
		t.Fatalf("expected invalid enum overwrite to keep base value \"any\", got %#v", got)
	}
}

func settingsProjectMaterializerTestDocument(t *testing.T) projectstate.Document {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "settings-home",
		Projects: map[string]projectstate.Project{
			"settings-home": {
				ID:   "settings-home",
				Name: "Settings Home",
				TopLevelSectionIDs: []string{
					"backend-section",
					"terminal-section",
				},
				SectionVariantMap: map[string]string{
					"backend-section":  "backend-variant",
					"terminal-section": "terminal-variant",
				},
				Sections: map[string]projectstate.Section{
					"backend-section": {
						ID:               "backend-section",
						Name:             "backend",
						VariantIDs:       []string{"backend-variant"},
						DefaultVariantID: "backend-variant",
					},
					"terminal-section": {
						ID:               "terminal-section",
						Name:             "terminalSectionDefault",
						VariantIDs:       []string{"terminal-variant"},
						DefaultVariantID: "terminal-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"backend-variant": {
						ID:     "backend-variant",
						ImplID: "backend-impl",
					},
					"terminal-variant": {
						ID:     "terminal-variant",
						ImplID: "terminal-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"backend-impl": {
						ID:   "backend-impl",
						Kind: projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{
							"id":"backend-impl",
							"type":"Dict",
							"isJsonSource":true,
							"jsonSourceKeys":["backend"],
							"topLevelParamId":"backend-root",
							"codeObjVariantMap":{
								"backend-root":"backend-root-variant",
								"rename-setting":"rename-setting-variant",
								"autosave-setting":"autosave-setting-variant"
							}
						}`),
					},
					"terminal-impl": {
						ID:   "terminal-impl",
						Kind: projectstate.SectionKind("dict"),
						Payload: projectstate.RawJSON(`{
							"id":"terminal-impl",
							"type":"Dict",
							"isJsonSource":true,
							"jsonSourceKeys":["terminalSectionDefault"],
							"topLevelParamId":"terminal-root",
							"codeObjVariantMap":{
								"terminal-root":"terminal-root-variant",
								"size-setting":"size-setting-variant",
								"height-setting":"height-setting-variant"
							}
						}`),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"backend-root": {
						ID:               "backend-root",
						Name:             "backend",
						VariantIDs:       []string{"backend-root-variant"},
						DefaultVariantID: "backend-root-variant",
					},
					"rename-setting": {
						ID:               "rename-setting",
						Name:             "renameRefactorMode",
						VariantIDs:       []string{"rename-setting-variant"},
						DefaultVariantID: "rename-setting-variant",
					},
					"autosave-setting": {
						ID:               "autosave-setting",
						Name:             "autosave",
						VariantIDs:       []string{"autosave-setting-variant"},
						DefaultVariantID: "autosave-setting-variant",
					},
					"terminal-root": {
						ID:               "terminal-root",
						Name:             "terminalSectionDefault",
						VariantIDs:       []string{"terminal-root-variant"},
						DefaultVariantID: "terminal-root-variant",
					},
					"size-setting": {
						ID:               "size-setting",
						Name:             "size",
						VariantIDs:       []string{"size-setting-variant"},
						DefaultVariantID: "size-setting-variant",
					},
					"height-setting": {
						ID:               "height-setting",
						Name:             "height",
						VariantIDs:       []string{"height-setting-variant"},
						DefaultVariantID: "height-setting-variant",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"backend-root-variant": {
						ID:     "backend-root-variant",
						ImplID: "backend-root-impl",
					},
					"rename-setting-variant": {
						ID:     "rename-setting-variant",
						ImplID: "rename-setting-impl",
					},
					"autosave-setting-variant": {
						ID:     "autosave-setting-variant",
						ImplID: "autosave-setting-impl",
					},
					"terminal-root-variant": {
						ID:     "terminal-root-variant",
						ImplID: "terminal-root-impl",
					},
					"size-setting-variant": {
						ID:     "size-setting-variant",
						ImplID: "size-setting-impl",
					},
					"height-setting-variant": {
						ID:     "height-setting-variant",
						ImplID: "height-setting-impl",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"backend-root-impl": {
						ID:   "backend-root-impl",
						Type: "NestedParam",
						Payload: projectstate.RawJSON(`{
							"id":"backend-root-impl",
							"type":"NestedParam",
							"children":["rename-setting","autosave-setting"]
						}`),
					},
					"rename-setting-impl": {
						ID:   "rename-setting-impl",
						Type: "TextParam",
						Payload: projectstate.RawJSON(`{
							"id":"rename-setting-impl",
							"type":"TextParam",
							"value":"ALWAYS_RENAME"
						}`),
					},
					"autosave-setting-impl": {
						ID:   "autosave-setting-impl",
						Type: "SwitchParam",
						Payload: projectstate.RawJSON(`{
							"id":"autosave-setting-impl",
							"type":"SwitchParam",
							"value":"false"
						}`),
					},
					"terminal-root-impl": {
						ID:   "terminal-root-impl",
						Type: "NestedParam",
						Payload: projectstate.RawJSON(`{
							"id":"terminal-root-impl",
							"type":"NestedParam",
							"children":["size-setting"]
						}`),
					},
					"size-setting-impl": {
						ID:   "size-setting-impl",
						Type: "NestedParam",
						Payload: projectstate.RawJSON(`{
							"id":"size-setting-impl",
							"type":"NestedParam",
							"children":["height-setting"]
						}`),
					},
					"height-setting-impl": {
						ID:   "height-setting-impl",
						Type: "TextParam",
						Payload: projectstate.RawJSON(`{
							"id":"height-setting-impl",
							"type":"TextParam",
							"value":"222"
						}`),
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize settings project document: %v", err)
	}
	return document
}
