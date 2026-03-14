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
