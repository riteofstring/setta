package projectstate

import "testing"

func TestProjectPrepareSectionsForCopyIncludesDescendantsAndActiveVariantMap(t *testing.T) {
	t.Parallel()

	project := sectionStructureSelectionTestProject(t)

	clipboard, err := project.prepareSectionsForCopy([]string{"top-group"})
	if err != nil {
		t.Fatalf("prepareSectionsForCopy returned error: %v", err)
	}

	if clipboard.Type != ClipboardDataTypeSections {
		t.Fatalf("expected clipboard type %q, got %q", ClipboardDataTypeSections, clipboard.Type)
	}
	if len(clipboard.Data.Core.Sections) != 3 {
		t.Fatalf("expected copied top-group subtree with three sections, got %#v", clipboard.Data.Core.Sections)
	}
	for _, sectionID := range []string{"top-group", "top-child-a", "top-child-b"} {
		if _, ok := clipboard.Data.Core.Sections[sectionID]; !ok {
			t.Fatalf("expected copied section %q in clipboard payload", sectionID)
		}
		if got := clipboard.Data.SectionVariantMap[sectionID]; got != project.SectionVariantMap[sectionID] {
			t.Fatalf("expected copied active variant %q for %q, got %q", project.SectionVariantMap[sectionID], sectionID, got)
		}
	}
	if _, ok := clipboard.Data.Core.Sections["nested-parent"]; ok {
		t.Fatalf("did not expect unrelated nested-parent section in copied subtree: %#v", clipboard.Data.Core.Sections)
	}
}

func TestDocumentPasteSectionsClonesNestedIDsAndClearsPasswordSecrets(t *testing.T) {
	t.Parallel()

	sourceProject := passwordParamNameAndValueTestProject(t)
	clipboard, err := sourceProject.prepareSectionsForCopy([]string{"dict-a"})
	if err != nil {
		t.Fatalf("prepareSectionsForCopy password source: %v", err)
	}

	document := newClipboardPasteTargetDocument()

	if err := document.PasteSections("project-target", PasteSectionsInput{
		Data:     clipboard.Data,
		Position: Position{X: 320, Y: 160},
		AsRef:    false,
	}); err != nil {
		t.Fatalf("PasteSections returned error: %v", err)
	}

	targetProject := document.Projects["project-target"]
	pastedSectionID := assertOnlyRemappedPastedRootSection(t, targetProject, "dict-a", TopLevelSectionLayout{X: 320, Y: 160})
	childIDs := assertPastedNestedRootParamRemapped(t, targetProject, pastedSectionID)
	assertPastedPasswordChildSecretCleared(t, targetProject, pastedSectionID, childIDs)
}

func TestDocumentPasteSectionsPreservesCopiedDescendantActiveVariants(t *testing.T) {
	t.Parallel()

	sourceProject := clipboardVariantPreservationSourceProject(t)
	clipboard, err := sourceProject.prepareSectionsForCopy([]string{"group-root"})
	if err != nil {
		t.Fatalf("prepareSectionsForCopy variant source: %v", err)
	}

	if got := clipboard.Data.SectionVariantMap["group-root"]; got != "group-root-variant" {
		t.Fatalf("expected copied root active variant group-root-variant, got %q", got)
	}
	if got := clipboard.Data.SectionVariantMap["group-child-a"]; got != "group-child-a-variant-alt" {
		t.Fatalf("expected copied descendant active variant group-child-a-variant-alt, got %q", got)
	}
	if got := clipboard.Data.SectionVariantMap["group-child-b"]; got != "group-child-b-variant-default" {
		t.Fatalf("expected copied descendant active variant group-child-b-variant-default, got %q", got)
	}

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-target",
		Projects: map[string]Project{
			"project-target": {
				ID:   "project-target",
				Name: "Target",
			},
		},
	}

	if err := document.PasteSections("project-target", PasteSectionsInput{
		Data:     clipboard.Data,
		Position: Position{X: 180, Y: 120},
		AsRef:    false,
	}); err != nil {
		t.Fatalf("PasteSections variant source: %v", err)
	}

	targetProject := document.Projects["project-target"]
	var pastedRootID string
	for sectionID, section := range targetProject.Sections {
		if section.ParentSectionID == "" {
			pastedRootID = sectionID
			break
		}
	}
	if pastedRootID == "" {
		t.Fatalf("expected pasted root section, got %#v", targetProject.Sections)
	}

	rootVariantID := targetProject.SectionVariantMap[pastedRootID]
	if rootVariantID == "" {
		t.Fatalf("expected pasted root active variant, got %#v", targetProject.SectionVariantMap)
	}
	rootPayload, err := targetProject.EffectiveSectionPayload(pastedRootID, rootVariantID)
	if err != nil {
		t.Fatalf("resolve pasted root payload: %v", err)
	}

	children := payloadStringArrayField(rootPayload, "children")
	if len(children) != 2 {
		t.Fatalf("expected two pasted children, got %#v", children)
	}

	for _, childID := range children {
		child := targetProject.Sections[childID]
		childVariantID := targetProject.SectionVariantMap[childID]
		if childVariantID == "" {
			t.Fatalf("expected pasted child %q to keep an explicit active variant entry, got %#v", childID, targetProject.SectionVariantMap)
		}
		childPayload, err := targetProject.EffectiveSectionPayload(childID, childVariantID)
		if err != nil {
			t.Fatalf("resolve pasted child payload %q: %v", childID, err)
		}
		switch child.Name {
		case "Group Child A":
			if got := payloadStringField(childPayload, "text"); got != "Child A Alt" {
				t.Fatalf("expected pasted Group Child A active payload text %q, got %q", "Child A Alt", got)
			}
		case "Group Child B":
			if got := payloadStringField(childPayload, "text"); got != "Child B Default" {
				t.Fatalf("expected pasted Group Child B active payload text %q, got %q", "Child B Default", got)
			}
		default:
			t.Fatalf("unexpected pasted child section %#v", child)
		}
	}
}

func TestDocumentPasteSectionsRemapsAttachedTerminalForCopiedBaseCodeSections(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name       string
		source     Project
		rootID     string
		rootType   string
		assertImpl func(t *testing.T, project Project, rootID string, attachedTerminalID string)
	}{
		{
			name:     "code",
			source:   newClipboardCodeSectionWithAttachedTerminalProject(t),
			rootID:   "code-section",
			rootType: "Code",
			assertImpl: func(t *testing.T, project Project, rootID string, attachedTerminalID string) {
				t.Helper()
				_, _, impl, err := project.ResolveSection(rootID)
				if err != nil {
					t.Fatalf("resolve pasted code section: %v", err)
				}
				if impl.Code == nil {
					t.Fatalf("expected pasted code impl, got %#v", impl)
				}
				if impl.Code.AttachedTerminalSectionID != attachedTerminalID {
					t.Fatalf("expected pasted code attached terminal id %q, got %q", attachedTerminalID, impl.Code.AttachedTerminalSectionID)
				}
			},
		},
		{
			name:     "generated python code",
			source:   newClipboardGeneratedPythonSectionWithAttachedTerminalProject(t),
			rootID:   "generated-section",
			rootType: "GenPythonCode",
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			clipboard, err := testCase.source.prepareSectionsForCopy([]string{testCase.rootID})
			if err != nil {
				t.Fatalf("prepareSectionsForCopy: %v", err)
			}

			document := newClipboardPasteTargetDocument()
			if err := document.PasteSections("project-target", PasteSectionsInput{
				Data:     clipboard.Data,
				Position: Position{X: 240, Y: 160},
				AsRef:    false,
			}); err != nil {
				t.Fatalf("PasteSections returned error: %v", err)
			}

			targetProject := document.Projects["project-target"]
			pastedRootID := onlyTopLevelPastedSectionID(t, targetProject)
			pastedVariantID := targetProject.SectionVariantMap[pastedRootID]
			pastedPayload, err := targetProject.EffectiveSectionPayload(pastedRootID, pastedVariantID)
			if err != nil {
				t.Fatalf("resolve pasted payload: %v", err)
			}
			if got := payloadStringField(pastedPayload, "type"); got != testCase.rootType {
				t.Fatalf("expected pasted root type %q, got %q", testCase.rootType, got)
			}

			childIDs := payloadStringArrayField(pastedPayload, "children")
			if len(childIDs) != 1 {
				t.Fatalf("expected one pasted terminal child, got %#v", childIDs)
			}
			attachedTerminalID := payloadStringField(pastedPayload, "attachedTerminalSectionId")
			if attachedTerminalID == "" {
				t.Fatalf("expected pasted attached terminal id, got payload %#v", pastedPayload)
			}
			if attachedTerminalID != childIDs[0] {
				t.Fatalf("expected pasted attached terminal id %q to match child id, got %q", childIDs[0], attachedTerminalID)
			}
			if attachedTerminalID == "terminal-section" {
				t.Fatalf("expected pasted attached terminal id to be remapped, got %q", attachedTerminalID)
			}
			if got := targetProject.Sections[attachedTerminalID].ParentSectionID; got != pastedRootID {
				t.Fatalf("expected pasted terminal parent %q, got %q", pastedRootID, got)
			}

			if testCase.assertImpl != nil {
				testCase.assertImpl(t, targetProject, pastedRootID, attachedTerminalID)
			}
		})
	}
}

func TestDocumentPasteSectionsClearsMissingAttachedTerminalForCopiedBaseCodeSections(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name       string
		source     Project
		rootID     string
		rootType   string
		assertImpl func(t *testing.T, project Project, rootID string)
	}{
		{
			name:     "code",
			source:   newClipboardCodeSectionWithMissingAttachedTerminalProject(t),
			rootID:   "code-section",
			rootType: "Code",
			assertImpl: func(t *testing.T, project Project, rootID string) {
				t.Helper()
				_, _, impl, err := project.ResolveSection(rootID)
				if err != nil {
					t.Fatalf("resolve pasted code section: %v", err)
				}
				if impl.Code == nil {
					t.Fatalf("expected pasted code impl, got %#v", impl)
				}
				if impl.Code.AttachedTerminalSectionID != "" {
					t.Fatalf("expected pasted code attached terminal id to clear, got %q", impl.Code.AttachedTerminalSectionID)
				}
				if len(impl.Code.Children) != 0 {
					t.Fatalf("expected pasted code children to stay empty, got %#v", impl.Code.Children)
				}
			},
		},
		{
			name:     "generated python code",
			source:   newClipboardGeneratedPythonSectionWithMissingAttachedTerminalProject(t),
			rootID:   "generated-section",
			rootType: "GenPythonCode",
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			clipboard, err := testCase.source.prepareSectionsForCopy([]string{testCase.rootID})
			if err != nil {
				t.Fatalf("prepareSectionsForCopy: %v", err)
			}

			document := newClipboardPasteTargetDocument()
			if err := document.PasteSections("project-target", PasteSectionsInput{
				Data:     clipboard.Data,
				Position: Position{X: 240, Y: 160},
				AsRef:    false,
			}); err != nil {
				t.Fatalf("PasteSections returned error: %v", err)
			}

			targetProject := document.Projects["project-target"]
			if len(targetProject.Sections) != 1 {
				t.Fatalf("expected one pasted section when attachment target is missing, got %#v", targetProject.Sections)
			}
			pastedRootID := onlyTopLevelPastedSectionID(t, targetProject)
			pastedVariantID := targetProject.SectionVariantMap[pastedRootID]
			pastedPayload, err := targetProject.EffectiveSectionPayload(pastedRootID, pastedVariantID)
			if err != nil {
				t.Fatalf("resolve pasted payload: %v", err)
			}
			if got := payloadStringField(pastedPayload, "type"); got != testCase.rootType {
				t.Fatalf("expected pasted root type %q, got %q", testCase.rootType, got)
			}
			if attachedTerminalID := payloadStringField(pastedPayload, "attachedTerminalSectionId"); attachedTerminalID != "" {
				t.Fatalf("expected pasted attached terminal id to clear, got %q", attachedTerminalID)
			}
			if childIDs := payloadStringArrayField(pastedPayload, "children"); len(childIDs) != 0 {
				t.Fatalf("expected pasted children to stay empty, got %#v", childIDs)
			}

			if testCase.assertImpl != nil {
				testCase.assertImpl(t, targetProject, pastedRootID)
			}
		})
	}
}

func clipboardVariantPreservationSourceProject(t *testing.T) Project {
	t.Helper()

	project, err := (Project{
		ID:   "project-source",
		Name: "Source",
		SectionVariantMap: map[string]string{
			"group-root":    "group-root-variant",
			"group-child-a": "group-child-a-variant-alt",
			"group-child-b": "group-child-b-variant-default",
		},
		TopLevelSectionIDs: []string{"group-root"},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"group-root": {X: 40, Y: 60, ZIndex: 1},
		},
		Sections: map[string]Section{
			"group-root": {
				ID:               "group-root",
				Name:             "Group Root",
				VariantIDs:       []string{"group-root-variant"},
				DefaultVariantID: "group-root-variant",
			},
			"group-child-a": {
				ID:               "group-child-a",
				Name:             "Group Child A",
				ParentSectionID:  "group-root",
				VariantIDs:       []string{"group-child-a-variant-default", "group-child-a-variant-alt"},
				DefaultVariantID: "group-child-a-variant-default",
			},
			"group-child-b": {
				ID:               "group-child-b",
				Name:             "Group Child B",
				ParentSectionID:  "group-root",
				VariantIDs:       []string{"group-child-b-variant-default", "group-child-b-variant-alt"},
				DefaultVariantID: "group-child-b-variant-default",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"group-root-variant":            {ID: "group-root-variant", ImplID: "group-root-impl"},
			"group-child-a-variant-default": {ID: "group-child-a-variant-default", ImplID: "group-child-a-impl-default"},
			"group-child-a-variant-alt":     {ID: "group-child-a-variant-alt", ImplID: "group-child-a-impl-alt"},
			"group-child-b-variant-default": {ID: "group-child-b-variant-default", ImplID: "group-child-b-impl-default"},
			"group-child-b-variant-alt":     {ID: "group-child-b-variant-alt", ImplID: "group-child-b-impl-alt"},
		},
		SectionImpls: map[string]SectionImpl{
			"group-root-impl": {
				ID:      "group-root-impl",
				Kind:    SectionKind("group"),
				Payload: RawJSON(`{"id":"group-root-impl","type":"Group","children":["group-child-a","group-child-b"]}`),
			},
			"group-child-a-impl-default": {
				ID:      "group-child-a-impl-default",
				Kind:    SectionKind("frontend"),
				Payload: RawJSON(`{"id":"group-child-a-impl-default","type":"TextBlock","text":"Child A Default"}`),
			},
			"group-child-a-impl-alt": {
				ID:      "group-child-a-impl-alt",
				Kind:    SectionKind("frontend"),
				Payload: RawJSON(`{"id":"group-child-a-impl-alt","type":"TextBlock","text":"Child A Alt"}`),
			},
			"group-child-b-impl-default": {
				ID:      "group-child-b-impl-default",
				Kind:    SectionKind("frontend"),
				Payload: RawJSON(`{"id":"group-child-b-impl-default","type":"TextBlock","text":"Child B Default"}`),
			},
			"group-child-b-impl-alt": {
				ID:      "group-child-b-impl-alt",
				Kind:    SectionKind("frontend"),
				Payload: RawJSON(`{"id":"group-child-b-impl-alt","type":"TextBlock","text":"Child B Alt"}`),
			},
		},
	}).Normalized()
	if err != nil {
		t.Fatalf("normalize clipboard variant-preservation source project: %v", err)
	}
	return project
}

func newClipboardPasteTargetDocument() Document {
	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-target",
		Projects: map[string]Project{
			"project-target": {
				ID:   "project-target",
				Name: "Target",
			},
		},
	}
}

func assertOnlyRemappedPastedRootSection(t *testing.T, project Project, originalID string, wantLayout TopLevelSectionLayout) string {
	t.Helper()

	if len(project.Sections) != 1 {
		t.Fatalf("expected one pasted root section, got %#v", project.Sections)
	}
	pastedSectionID := onlyTopLevelPastedSectionID(t, project)
	if pastedSectionID == originalID {
		t.Fatalf("expected pasted section id to be remapped, got %q", pastedSectionID)
	}
	layout := project.TopLevelSections[pastedSectionID]
	if layout.X != wantLayout.X || layout.Y != wantLayout.Y || layout.ZIndex != wantLayout.ZIndex {
		t.Fatalf("expected pasted section layout %#v, got %#v", wantLayout, layout)
	}
	return pastedSectionID
}

func assertPastedNestedRootParamRemapped(t *testing.T, project Project, pastedSectionID string) []string {
	t.Helper()

	pastedVariantID := project.SectionVariantMap[pastedSectionID]
	pastedPayload, err := project.EffectiveSectionPayload(pastedSectionID, pastedVariantID)
	if err != nil {
		t.Fatalf("resolve pasted section payload: %v", err)
	}
	topLevelParamID := payloadStringField(pastedPayload, "topLevelParamId")
	if topLevelParamID == "" || topLevelParamID == "shared-root" {
		t.Fatalf("expected pasted root param id to be remapped, got %q", topLevelParamID)
	}

	codeObjVariantMap := payloadStringMapField(pastedPayload, "codeObjVariantMap")
	if len(codeObjVariantMap) != 4 {
		t.Fatalf("expected four remapped code object variants, got %#v", codeObjVariantMap)
	}
	if _, ok := codeObjVariantMap["shared-secret"]; ok {
		t.Fatalf("expected password param id to be remapped, got %#v", codeObjVariantMap)
	}
	if _, ok := codeObjVariantMap[topLevelParamID]; !ok {
		t.Fatalf("expected top-level param %q in remapped code-object map, got %#v", topLevelParamID, codeObjVariantMap)
	}

	rootPayload, _, _, _, err := project.ResolveSectionCodeObject(pastedSectionID, topLevelParamID)
	if err != nil {
		t.Fatalf("resolve pasted root param: %v", err)
	}
	childIDs := payloadStringArrayField(rootPayload, "children")
	if len(childIDs) != 3 {
		t.Fatalf("expected remapped nested param children, got %#v", childIDs)
	}
	return childIDs
}

func assertPastedPasswordChildSecretCleared(t *testing.T, project Project, pastedSectionID string, childIDs []string) {
	t.Helper()

	passwordParamID := ""
	for _, childID := range childIDs {
		childPayload, _, _, childImpl, err := project.ResolveSectionCodeObject(pastedSectionID, childID)
		if err != nil {
			t.Fatalf("resolve pasted child param %q: %v", childID, err)
		}
		if childImpl.Type != "PasswordParam" {
			continue
		}
		passwordParamID = childID
		if got := payloadStringField(childPayload, "value"); got != "" {
			t.Fatalf("expected copied password payload value to be cleared, got %q", got)
		}
		if payloadBoolField(childPayload, "hasSecret") {
			t.Fatalf("expected copied password payload hasSecret to reset false, got %#v", childPayload)
		}
	}
	if passwordParamID == "" {
		t.Fatalf("expected remapped password child among %#v", childIDs)
	}
	if passwordParamID == "shared-secret" {
		t.Fatalf("expected password param id to be remapped, got %q", passwordParamID)
	}
}

func onlyTopLevelPastedSectionID(t *testing.T, project Project) string {
	t.Helper()

	if len(project.TopLevelSectionIDs) != 1 {
		t.Fatalf("expected one pasted top-level section id, got %#v", project.TopLevelSectionIDs)
	}
	sectionID := project.TopLevelSectionIDs[0]
	if _, ok := project.TopLevelSections[sectionID]; !ok {
		t.Fatalf("expected pasted top-level layout for %q, got %#v", sectionID, project.TopLevelSections)
	}
	return sectionID
}

func newClipboardCodeSectionWithAttachedTerminalProject(t *testing.T) Project {
	t.Helper()

	project, err := (Project{
		ID:                 "project-source",
		Name:               "Source",
		TopLevelSectionIDs: []string{"code-section"},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"code-section": {X: 20, Y: 40, ZIndex: 0},
		},
		SectionVariantMap: map[string]string{
			"code-section":     "code-variant",
			"terminal-section": "terminal-variant",
		},
		Sections: map[string]Section{
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
			"terminal-section": {
				ID:               "terminal-section",
				Name:             "Terminal",
				ParentSectionID:  "code-section",
				VariantIDs:       []string{"terminal-variant"},
				DefaultVariantID: "terminal-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"code-variant":     {ID: "code-variant", ImplID: "code-impl"},
			"terminal-variant": {ID: "terminal-variant", ImplID: "terminal-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"code-impl": {
				ID:   "code-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language:                  CodeLanguagePython,
					AttachedTerminalSectionID: "terminal-section",
					Children:                  []string{"terminal-section"},
				},
				Payload: mustMarshalProjectObject(map[string]any{
					"id":                        "code-impl",
					"type":                      "Code",
					"codeLanguage":              "python",
					"children":                  []string{"terminal-section"},
					"attachedTerminalSectionId": "terminal-section",
				}),
			},
			"terminal-impl": {
				ID:       "terminal-impl",
				Kind:     SectionKindTerminal,
				Terminal: &TerminalSectionImpl{},
				Payload:  mustMarshalProjectObject(map[string]any{"id": "terminal-impl", "type": "Terminal"}),
			},
		},
	}).Normalized()
	if err != nil {
		t.Fatalf("normalize clipboard code source project: %v", err)
	}
	return project
}

func newClipboardGeneratedPythonSectionWithAttachedTerminalProject(t *testing.T) Project {
	t.Helper()

	project, err := (Project{
		ID:                 "project-source",
		Name:               "Source",
		TopLevelSectionIDs: []string{"generated-section"},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"generated-section": {X: 20, Y: 40, ZIndex: 0},
		},
		SectionVariantMap: map[string]string{
			"generated-section": "generated-variant",
			"terminal-section":  "terminal-variant",
		},
		Sections: map[string]Section{
			"generated-section": {
				ID:               "generated-section",
				Name:             "Generated Python Code",
				VariantIDs:       []string{"generated-variant"},
				DefaultVariantID: "generated-variant",
			},
			"terminal-section": {
				ID:               "terminal-section",
				Name:             "Terminal",
				ParentSectionID:  "generated-section",
				VariantIDs:       []string{"terminal-variant"},
				DefaultVariantID: "terminal-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"generated-variant": {ID: "generated-variant", ImplID: "generated-impl"},
			"terminal-variant":  {ID: "terminal-variant", ImplID: "terminal-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"generated-impl": {
				ID:   "generated-impl",
				Kind: SectionKindGenerated,
				Generated: &GeneratedSectionImpl{
					Kind: GeneratedSectionKindPythonCode,
				},
				Payload: mustMarshalProjectObject(map[string]any{
					"id":                        "generated-impl",
					"type":                      "GenPythonCode",
					"children":                  []string{"terminal-section"},
					"attachedTerminalSectionId": "terminal-section",
				}),
			},
			"terminal-impl": {
				ID:       "terminal-impl",
				Kind:     SectionKindTerminal,
				Terminal: &TerminalSectionImpl{},
				Payload:  mustMarshalProjectObject(map[string]any{"id": "terminal-impl", "type": "Terminal"}),
			},
		},
	}).Normalized()
	if err != nil {
		t.Fatalf("normalize clipboard generated source project: %v", err)
	}
	return project
}

func newClipboardCodeSectionWithMissingAttachedTerminalProject(t *testing.T) Project {
	t.Helper()

	project, err := (Project{
		ID:                 "project-source",
		Name:               "Source",
		TopLevelSectionIDs: []string{"code-section"},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"code-section": {X: 20, Y: 40, ZIndex: 0},
		},
		SectionVariantMap: map[string]string{
			"code-section": "code-variant",
		},
		Sections: map[string]Section{
			"code-section": {
				ID:               "code-section",
				Name:             "Code",
				VariantIDs:       []string{"code-variant"},
				DefaultVariantID: "code-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"code-variant": {ID: "code-variant", ImplID: "code-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"code-impl": {
				ID:   "code-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language:                  CodeLanguagePython,
					AttachedTerminalSectionID: "missing-terminal",
				},
				Payload: mustMarshalProjectObject(map[string]any{
					"id":                        "code-impl",
					"type":                      "Code",
					"codeLanguage":              "python",
					"children":                  []string{},
					"attachedTerminalSectionId": "missing-terminal",
				}),
			},
		},
	}).Normalized()
	if err != nil {
		t.Fatalf("normalize clipboard code missing-terminal source project: %v", err)
	}
	return project
}

func newClipboardGeneratedPythonSectionWithMissingAttachedTerminalProject(t *testing.T) Project {
	t.Helper()

	project, err := (Project{
		ID:                 "project-source",
		Name:               "Source",
		TopLevelSectionIDs: []string{"generated-section"},
		TopLevelSections: map[string]TopLevelSectionLayout{
			"generated-section": {X: 20, Y: 40, ZIndex: 0},
		},
		SectionVariantMap: map[string]string{
			"generated-section": "generated-variant",
		},
		Sections: map[string]Section{
			"generated-section": {
				ID:               "generated-section",
				Name:             "Generated Python Code",
				VariantIDs:       []string{"generated-variant"},
				DefaultVariantID: "generated-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"generated-variant": {ID: "generated-variant", ImplID: "generated-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"generated-impl": {
				ID:   "generated-impl",
				Kind: SectionKindGenerated,
				Generated: &GeneratedSectionImpl{
					Kind: GeneratedSectionKindPythonCode,
				},
				Payload: mustMarshalProjectObject(map[string]any{
					"id":                        "generated-impl",
					"type":                      "GenPythonCode",
					"children":                  []string{},
					"attachedTerminalSectionId": "missing-terminal",
				}),
			},
		},
	}).Normalized()
	if err != nil {
		t.Fatalf("normalize clipboard generated missing-terminal source project: %v", err)
	}
	return project
}
