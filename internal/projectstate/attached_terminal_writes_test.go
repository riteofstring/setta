package projectstate

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestRuntimeSetCodeSectionAttachedTerminalRoundTripsAttachAndDetach(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newAttachedTerminalWriteTestDocument())
	settings := testStructuralMutationSettingsWithTerminalHeight(222.0)
	terminalSectionID := "terminal-section"

	attachSnapshot, err := runtime.SetCodeSectionAttachedTerminal(
		context.Background(),
		"project-alpha",
		"code-section",
		&terminalSectionID,
		settings,
	)
	if err != nil {
		t.Fatalf("attach terminal: %v", err)
	}
	if attachSnapshot.Revision != 2 {
		t.Fatalf("expected revision 2 after attach, got %d", attachSnapshot.Revision)
	}

	project := attachSnapshot.Document.Projects["project-alpha"]
	_, codeVariant, codeImpl, err := project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve code section: %v", err)
	}
	if codeImpl.Code.AttachedTerminalSectionID != "terminal-section" {
		t.Fatalf("expected attached terminal id terminal-section, got %q", codeImpl.Code.AttachedTerminalSectionID)
	}
	if !reflect.DeepEqual(codeImpl.Code.Children, []string{"terminal-section"}) {
		t.Fatalf("expected attached terminal child, got %#v", codeImpl.Code.Children)
	}

	codePayload, err := effectiveSectionPayload(project, "code-section", codeVariant.ID)
	if err != nil {
		t.Fatalf("code payload: %v", err)
	}
	codeSize, ok := payloadObjectField(codePayload, "size")
	if !ok {
		t.Fatalf("expected code size payload, got %#v", codePayload)
	}
	codeHeight, isAuto, present, err := payloadAutoLayoutSizeValue(codeSize, "height")
	if err != nil {
		t.Fatalf("parse code height: %v", err)
	}
	if !present || isAuto {
		t.Fatalf("expected concrete code height, got %#v", codeSize)
	}
	if codeHeight < 238.2 {
		t.Fatalf("expected attached terminal minimum height, got %v", codeHeight)
	}

	terminalSection, terminalVariant, _, err := project.ResolveSection("terminal-section")
	if err != nil {
		t.Fatalf("resolve terminal section: %v", err)
	}
	if terminalSection.ParentSectionID != "code-section" {
		t.Fatalf("expected terminal parent code-section, got %q", terminalSection.ParentSectionID)
	}
	if project.HasTopLevelSection("terminal-section") {
		t.Fatal("did not expect attached terminal to remain top-level")
	}
	if _, ok := project.TopLevelSections["terminal-section"]; ok {
		t.Fatalf("did not expect attached terminal layout to remain active, got %#v", project.TopLevelSections["terminal-section"])
	}
	if _, ok := project.ViewModes["focus"].TopLevelSections["terminal-section"]; ok {
		t.Fatalf("did not expect focus view mode layout for attached terminal, got %#v", project.ViewModes["focus"].TopLevelSections)
	}
	if _, ok := project.ViewModes["secondary"].TopLevelSections["terminal-section"]; ok {
		t.Fatalf("did not expect secondary view mode layout for attached terminal, got %#v", project.ViewModes["secondary"].TopLevelSections)
	}

	terminalPayload, err := effectiveSectionPayload(project, "terminal-section", terminalVariant.ID)
	if err != nil {
		t.Fatalf("terminal payload: %v", err)
	}
	terminalSize, ok := payloadObjectField(terminalPayload, "size")
	if !ok {
		t.Fatalf("expected terminal size payload, got %#v", terminalPayload)
	}
	width, _, _, err := payloadAutoLayoutSizeValue(terminalSize, "width")
	if err != nil {
		t.Fatalf("parse terminal width: %v", err)
	}
	if width != 640.0 {
		t.Fatalf("expected terminal width 640, got %v", width)
	}
	terminalHeight, isAuto, present, err := payloadAutoLayoutSizeValue(terminalSize, "height")
	if err != nil {
		t.Fatalf("parse terminal height: %v", err)
	}
	if !present || isAuto {
		t.Fatalf("expected concrete terminal height, got %#v", terminalSize)
	}
	if terminalHeight != 222.0 {
		t.Fatalf("expected terminal height 222, got %v", terminalHeight)
	}

	detachSnapshot, err := runtime.SetCodeSectionAttachedTerminal(
		context.Background(),
		"project-alpha",
		"code-section",
		nil,
		settings,
	)
	if err != nil {
		t.Fatalf("detach terminal: %v", err)
	}
	if detachSnapshot.Revision != 3 {
		t.Fatalf("expected revision 3 after detach, got %d", detachSnapshot.Revision)
	}

	project = detachSnapshot.Document.Projects["project-alpha"]
	_, _, codeImpl, err = project.ResolveSection("code-section")
	if err != nil {
		t.Fatalf("resolve detached code section: %v", err)
	}
	if codeImpl.Code.AttachedTerminalSectionID != "" {
		t.Fatalf("expected cleared attached terminal id, got %q", codeImpl.Code.AttachedTerminalSectionID)
	}
	if len(codeImpl.Code.Children) != 0 {
		t.Fatalf("expected cleared code children, got %#v", codeImpl.Code.Children)
	}

	terminalSection, _, _, err = project.ResolveSection("terminal-section")
	if err != nil {
		t.Fatalf("resolve detached terminal section: %v", err)
	}
	if terminalSection.ParentSectionID != "" {
		t.Fatalf("expected detached terminal to become top-level, got parent %q", terminalSection.ParentSectionID)
	}
	if !project.HasTopLevelSection("terminal-section") {
		t.Fatal("expected detached terminal to return to top-level ids")
	}

	layout, ok := project.TopLevelSections["terminal-section"]
	if !ok {
		t.Fatalf("expected detached terminal layout, got %#v", project.TopLevelSections)
	}
	if layout.X != 1224.0 || layout.Y != 40.0 || layout.ZIndex != 3 {
		t.Fatalf("expected deterministic detached terminal layout {1224 40 3}, got %#v", layout)
	}
	if secondaryLayout, ok := project.ViewModes["secondary"].TopLevelSections["terminal-section"]; !ok {
		t.Fatalf("expected detached terminal in secondary view mode, got %#v", project.ViewModes["secondary"].TopLevelSections)
	} else if secondaryLayout != layout {
		t.Fatalf("expected secondary view mode layout %#v, got %#v", layout, secondaryLayout)
	}
}

func TestRuntimeSetCodeSectionAttachedTerminalMovesTerminalFromExistingParent(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newMovedAttachedTerminalWriteTestDocument())
	settings := testStructuralMutationSettingsWithTerminalHeight(222.0)
	terminalSectionID := "terminal-section"

	snapshot, err := runtime.SetCodeSectionAttachedTerminal(
		context.Background(),
		"project-alpha",
		"code-section",
		&terminalSectionID,
		settings,
	)
	if err != nil {
		t.Fatalf("move terminal to code section: %v", err)
	}

	project := snapshot.Document.Projects["project-alpha"]
	groupPayload, err := effectiveSectionPayload(project, "group-section", "group-variant")
	if err != nil {
		t.Fatalf("group payload: %v", err)
	}
	if children := payloadStringArrayField(groupPayload, "children"); len(children) != 0 {
		t.Fatalf("expected moved terminal to leave group children empty, got %#v", children)
	}

	terminalSection, _, _, err := project.ResolveSection("terminal-section")
	if err != nil {
		t.Fatalf("resolve moved terminal: %v", err)
	}
	if terminalSection.ParentSectionID != "code-section" {
		t.Fatalf("expected terminal parent code-section after move, got %q", terminalSection.ParentSectionID)
	}
}

func TestRuntimeSetCodeSectionAttachedTerminalRejectsNonTerminalTarget(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newAttachedTerminalWriteTestDocument())
	settings := testStructuralMutationSettingsWithTerminalHeight(222.0)
	textSectionID := "text-section"

	_, err := runtime.SetCodeSectionAttachedTerminal(
		context.Background(),
		"project-alpha",
		"code-section",
		&textSectionID,
		settings,
	)
	if !errors.Is(err, ErrTerminalSectionRequired) {
		t.Fatalf("expected ErrTerminalSectionRequired, got %v", err)
	}
}

func TestRuntimeSetCodeSectionAttachedTerminalRejectsNonCodeParent(t *testing.T) {
	t.Parallel()

	runtime := openRunGraphTestRuntime(t, newAttachedTerminalWriteTestDocument())
	settings := testStructuralMutationSettingsWithTerminalHeight(222.0)
	terminalSectionID := "terminal-section"

	_, err := runtime.SetCodeSectionAttachedTerminal(
		context.Background(),
		"project-alpha",
		"terminal-section",
		&terminalSectionID,
		settings,
	)
	if !errors.Is(err, ErrCodeSectionRequired) {
		t.Fatalf("expected ErrCodeSectionRequired, got %v", err)
	}
}

func newAttachedTerminalWriteTestDocument() Document {
	return Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:               "project-alpha",
				Name:             "Alpha",
				EntryCodeBlockID: "code-section",
				ActiveViewModeID: "focus",
				TopLevelSectionIDs: []string{
					"code-section",
					"terminal-section",
					"text-section",
				},
				TopLevelSections: map[string]TopLevelSectionLayout{
					"code-section":     {X: 20, Y: 40, ZIndex: 0},
					"terminal-section": {X: 900, Y: 120, ZIndex: 1},
					"text-section":     {X: 1100, Y: 40, ZIndex: 2},
				},
				ViewModes: map[string]ViewMode{
					"focus": {
						ID:   "focus",
						Name: "Focus",
						VisibilityBySectionID: map[string]bool{
							"code-section":     true,
							"terminal-section": true,
							"text-section":     true,
						},
						TopLevelSections: map[string]TopLevelSectionLayout{
							"code-section":     {X: 20, Y: 40, ZIndex: 0},
							"terminal-section": {X: 900, Y: 120, ZIndex: 1},
							"text-section":     {X: 1100, Y: 40, ZIndex: 2},
						},
					},
					"secondary": {
						ID:   "secondary",
						Name: "Secondary",
						VisibilityBySectionID: map[string]bool{
							"code-section":     true,
							"terminal-section": true,
							"text-section":     true,
						},
						TopLevelSections: map[string]TopLevelSectionLayout{
							"code-section":     {X: 20, Y: 40, ZIndex: 0},
							"terminal-section": {X: 960, Y: 200, ZIndex: 1},
							"text-section":     {X: 1100, Y: 40, ZIndex: 2},
						},
					},
				},
				SectionVariantMap: map[string]string{
					"code-section":     "code-variant",
					"terminal-section": "terminal-variant",
					"text-section":     "text-variant",
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
						VariantIDs:       []string{"terminal-variant"},
						DefaultVariantID: "terminal-variant",
					},
					"text-section": {
						ID:               "text-section",
						Name:             "Text Block",
						VariantIDs:       []string{"text-variant"},
						DefaultVariantID: "text-variant",
					},
				},
				SectionVariants: map[string]SectionVariant{
					"code-variant":     {ID: "code-variant", ImplID: "code-impl"},
					"terminal-variant": {ID: "terminal-variant", ImplID: "terminal-impl"},
					"text-variant":     {ID: "text-variant", ImplID: "text-impl"},
				},
				SectionImpls: map[string]SectionImpl{
					"code-impl": {
						ID:   "code-impl",
						Kind: SectionKindCode,
						Code: &CodeSectionImpl{
							Language: CodeLanguagePython,
						},
						Payload: mustMarshalProjectObject(map[string]any{
							"id":           "code-impl",
							"type":         "Code",
							"codeLanguage": "python",
							"children":     []string{},
							"size": map[string]any{
								"width":  640.0,
								"height": 100.0,
							},
						}),
					},
					"terminal-impl": {
						ID:       "terminal-impl",
						Kind:     SectionKindTerminal,
						Terminal: &TerminalSectionImpl{},
						Payload: mustMarshalProjectObject(map[string]any{
							"id":   "terminal-impl",
							"type": "Terminal",
							"size": map[string]any{
								"width":  300.0,
								"height": "auto",
							},
						}),
					},
					"text-impl": {
						ID:      "text-impl",
						Kind:    SectionKind("textblock"),
						Payload: mustMarshalProjectObject(map[string]any{"id": "text-impl", "type": "TextBlock"}),
					},
				},
			},
		},
	}
}

func newMovedAttachedTerminalWriteTestDocument() Document {
	document := newAttachedTerminalWriteTestDocument()
	project := document.Projects["project-alpha"]

	project.TopLevelSectionIDs = []string{
		"code-section",
		"group-section",
		"text-section",
	}
	delete(project.TopLevelSections, "terminal-section")
	project.TopLevelSections["group-section"] = TopLevelSectionLayout{X: 900, Y: 120, ZIndex: 1}
	project.TopLevelSections["text-section"] = TopLevelSectionLayout{X: 1100, Y: 40, ZIndex: 2}

	focus := project.ViewModes["focus"]
	delete(focus.TopLevelSections, "terminal-section")
	focus.VisibilityBySectionID["group-section"] = true
	focus.TopLevelSections["group-section"] = TopLevelSectionLayout{X: 900, Y: 120, ZIndex: 1}
	project.ViewModes["focus"] = focus

	secondary := project.ViewModes["secondary"]
	delete(secondary.TopLevelSections, "terminal-section")
	secondary.VisibilityBySectionID["group-section"] = true
	secondary.TopLevelSections["group-section"] = TopLevelSectionLayout{X: 960, Y: 200, ZIndex: 1}
	project.ViewModes["secondary"] = secondary

	project.SectionVariantMap["group-section"] = "group-variant"
	project.Sections["group-section"] = Section{
		ID:               "group-section",
		Name:             "Group",
		VariantIDs:       []string{"group-variant"},
		DefaultVariantID: "group-variant",
	}
	project.Sections["terminal-section"] = Section{
		ID:               "terminal-section",
		Name:             "Terminal",
		ParentSectionID:  "group-section",
		VariantIDs:       []string{"terminal-variant"},
		DefaultVariantID: "terminal-variant",
	}
	project.SectionVariants["group-variant"] = SectionVariant{ID: "group-variant", ImplID: "group-impl"}
	project.SectionImpls["group-impl"] = SectionImpl{
		ID:      "group-impl",
		Kind:    SectionKind("group"),
		Payload: mustMarshalProjectObject(map[string]any{"id": "group-impl", "type": "Group", "children": []string{"terminal-section"}}),
	}

	document.Projects["project-alpha"] = project
	return document
}
