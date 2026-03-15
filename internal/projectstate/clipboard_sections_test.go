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
		Position: Position{X: 320, Y: 160},
		AsRef:    false,
	}); err != nil {
		t.Fatalf("PasteSections returned error: %v", err)
	}

	targetProject := document.Projects["project-target"]
	if len(targetProject.Sections) != 1 {
		t.Fatalf("expected one pasted root section, got %#v", targetProject.Sections)
	}

	var pastedSectionID string
	for sectionID := range targetProject.Sections {
		pastedSectionID = sectionID
	}
	if pastedSectionID == "dict-a" {
		t.Fatalf("expected pasted section id to be remapped, got %q", pastedSectionID)
	}
	if !targetProject.HasTopLevelSection(pastedSectionID) {
		t.Fatalf("expected pasted section %q to become top-level", pastedSectionID)
	}
	layout, ok := targetProject.TopLevelSections[pastedSectionID]
	if !ok {
		t.Fatalf("expected pasted section layout in top-level map, got %#v", targetProject.TopLevelSections)
	}
	if layout.X != 320 || layout.Y != 160 || layout.ZIndex != 0 {
		t.Fatalf("expected pasted section layout {320 160 0}, got %#v", layout)
	}

	pastedVariantID := targetProject.SectionVariantMap[pastedSectionID]
	pastedPayload, err := targetProject.EffectiveSectionPayload(pastedSectionID, pastedVariantID)
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

	rootPayload, _, _, _, err := targetProject.ResolveSectionCodeObject(pastedSectionID, topLevelParamID)
	if err != nil {
		t.Fatalf("resolve pasted root param: %v", err)
	}
	childIDs := payloadStringArrayField(rootPayload, "children")
	if len(childIDs) != 3 {
		t.Fatalf("expected remapped nested param children, got %#v", childIDs)
	}

	passwordParamID := ""
	for _, childID := range childIDs {
		childPayload, _, _, childImpl, err := targetProject.ResolveSectionCodeObject(pastedSectionID, childID)
		if err != nil {
			t.Fatalf("resolve pasted child param %q: %v", childID, err)
		}
		if childImpl.Type == "PasswordParam" {
			passwordParamID = childID
			if got := payloadStringField(childPayload, "value"); got != "" {
				t.Fatalf("expected copied password payload value to be cleared, got %q", got)
			}
			if payloadBoolField(childPayload, "hasSecret") {
				t.Fatalf("expected copied password payload hasSecret to reset false, got %#v", childPayload)
			}
		}
	}
	if passwordParamID == "" {
		t.Fatalf("expected remapped password child among %#v", childIDs)
	}
	if passwordParamID == "shared-secret" {
		t.Fatalf("expected password param id to be remapped, got %q", passwordParamID)
	}
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
