package projectstate

import (
	"errors"
	"testing"
)

func TestProjectCreateChildSectionsInsertsAtIndexAndSetsParentIDs(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"parent":   "parent-variant",
			"child-a":  "child-a-variant",
			"child-b":  "child-b-variant",
			"outside":  "outside-variant",
			"sibling2": "sibling2-variant",
		},
		Sections: map[string]Section{
			"parent": {
				ID:               "parent",
				Name:             "Parent",
				VariantIDs:       []string{"parent-variant"},
				DefaultVariantID: "parent-variant",
			},
			"child-a": {
				ID:               "child-a",
				Name:             "Child A",
				ParentSectionID:  "parent",
				VariantIDs:       []string{"child-a-variant"},
				DefaultVariantID: "child-a-variant",
			},
			"child-b": {
				ID:               "child-b",
				Name:             "Child B",
				ParentSectionID:  "parent",
				VariantIDs:       []string{"child-b-variant"},
				DefaultVariantID: "child-b-variant",
			},
			"outside": {
				ID:               "outside",
				Name:             "Outside",
				VariantIDs:       []string{"outside-variant"},
				DefaultVariantID: "outside-variant",
			},
			"sibling2": {
				ID:               "sibling2",
				Name:             "Text Block",
				ParentSectionID:  "parent",
				VariantIDs:       []string{"sibling2-variant"},
				DefaultVariantID: "sibling2-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"parent-variant":   {ID: "parent-variant", ImplID: "parent-impl"},
			"child-a-variant":  {ID: "child-a-variant", ImplID: "child-a-impl"},
			"child-b-variant":  {ID: "child-b-variant", ImplID: "child-b-impl"},
			"outside-variant":  {ID: "outside-variant", ImplID: "outside-impl"},
			"sibling2-variant": {ID: "sibling2-variant", ImplID: "sibling2-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"parent-impl": {
				ID:      "parent-impl",
				Kind:    SectionKind("group"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "parent-impl", "type": "Group", "children": []string{"child-a", "child-b", "sibling2"}, "size": map[string]any{"width": 640.0, "height": 220.0}}),
			},
			"child-a-impl": {
				ID:      "child-a-impl",
				Kind:    SectionKind("textblock"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "child-a-impl", "type": "TextBlock"}),
			},
			"child-b-impl": {
				ID:      "child-b-impl",
				Kind:    SectionKind("textblock"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "child-b-impl", "type": "TextBlock"}),
			},
			"outside-impl": {
				ID:      "outside-impl",
				Kind:    SectionKind("textblock"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "outside-impl", "type": "TextBlock"}),
			},
			"sibling2-impl": {
				ID:      "sibling2-impl",
				Kind:    SectionKind("textblock"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "sibling2-impl", "type": "TextBlock"}),
			},
		},
	}

	startIdx := 1
	result, err := project.CreateChildSections(CreateChildSectionsInput{
		ParentID:    "parent",
		ImplType:    "TextBlock",
		NumChildren: 2,
		StartIdx:    &startIdx,
	}, defaultAutoLayoutSectionSizingPolicy(), Document{})
	if err != nil {
		t.Fatalf("create child sections: %v", err)
	}

	if len(result.SectionIDs) != 2 {
		t.Fatalf("expected two created section ids, got %#v", result.SectionIDs)
	}

	parentPayload, err := effectiveSectionPayload(project, "parent", "parent-variant")
	if err != nil {
		t.Fatalf("parent effective payload: %v", err)
	}
	gotChildren := payloadStringArrayField(parentPayload, "children")
	wantChildren := []string{"child-a", result.SectionIDs[0], result.SectionIDs[1], "child-b", "sibling2"}
	if len(gotChildren) != len(wantChildren) {
		t.Fatalf("expected children %#v, got %#v", wantChildren, gotChildren)
	}
	for index, want := range wantChildren {
		if gotChildren[index] != want {
			t.Fatalf("expected child order %#v, got %#v", wantChildren, gotChildren)
		}
	}

	for _, sectionID := range result.SectionIDs {
		section, ok := project.Sections[sectionID]
		if !ok {
			t.Fatalf("expected created section %q in project", sectionID)
		}
		if section.ParentSectionID != "parent" {
			t.Fatalf("expected parent id parent, got %#v", section)
		}
		payload, err := effectiveSectionPayload(project, sectionID, project.SectionVariantMap[sectionID])
		if err != nil {
			t.Fatalf("effective payload for %s: %v", sectionID, err)
		}
		size, ok := payloadObjectField(payload, "size")
		if !ok {
			t.Fatalf("expected created child size payload, got %#v", payload)
		}
		if width, _, _, err := payloadAutoLayoutSizeValue(size, "width"); err != nil || width != 640.0 {
			t.Fatalf("expected width 640, got width=%v err=%v payload=%#v", width, err, size)
		}
	}
	if project.Sections[result.SectionIDs[0]].Name != "Text Block 2" {
		t.Fatalf("expected sibling-safe name Text Block 2, got %q", project.Sections[result.SectionIDs[0]].Name)
	}
	if project.Sections[result.SectionIDs[1]].Name != "Text Block 3" {
		t.Fatalf("expected sibling-safe name Text Block 3, got %q", project.Sections[result.SectionIDs[1]].Name)
	}
}

func TestProjectCreateChildSectionsCreatesAttachedTerminalForCodeParent(t *testing.T) {
	t.Parallel()

	project := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"code-parent": "code-parent-variant",
		},
		Sections: map[string]Section{
			"code-parent": {
				ID:               "code-parent",
				Name:             "Code",
				VariantIDs:       []string{"code-parent-variant"},
				DefaultVariantID: "code-parent-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"code-parent-variant": {ID: "code-parent-variant", ImplID: "code-parent-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"code-parent-impl": {
				ID:   "code-parent-impl",
				Kind: SectionKindCode,
				Code: &CodeSectionImpl{
					Language: CodeLanguagePython,
				},
				Payload: mustMarshalProjectObject(map[string]any{
					"id":           "code-parent-impl",
					"type":         "Code",
					"codeLanguage": "python",
					"children":     []string{},
					"size": map[string]any{
						"width":  720.0,
						"height": "auto",
					},
				}),
			},
		},
	}

	settingsDocument := testChildCreationSettingsDocument(t, 222.0)
	result, err := project.CreateChildSections(CreateChildSectionsInput{
		ParentID:    "code-parent",
		ImplType:    "Terminal",
		NumChildren: 1,
	}, defaultAutoLayoutSectionSizingPolicy(), settingsDocument)
	if err != nil {
		t.Fatalf("create terminal child section: %v", err)
	}

	if len(result.SectionIDs) != 1 {
		t.Fatalf("expected one created terminal id, got %#v", result.SectionIDs)
	}
	terminalID := result.SectionIDs[0]

	parentPayload, err := effectiveSectionPayload(project, "code-parent", "code-parent-variant")
	if err != nil {
		t.Fatalf("code parent payload: %v", err)
	}
	if attached := payloadStringField(parentPayload, "attachedTerminalSectionId"); attached != terminalID {
		t.Fatalf("expected attachedTerminalSectionId %q, got %q", terminalID, attached)
	}
	children := payloadStringArrayField(parentPayload, "children")
	if len(children) != 1 || children[0] != terminalID {
		t.Fatalf("expected code children [%q], got %#v", terminalID, children)
	}
	size, ok := payloadObjectField(parentPayload, "size")
	if !ok {
		t.Fatalf("expected parent size payload, got %#v", parentPayload)
	}
	height, isAuto, present, err := payloadAutoLayoutSizeValue(size, "height")
	if err != nil {
		t.Fatalf("parse parent height: %v", err)
	}
	if !present || isAuto {
		t.Fatalf("expected concrete parent height, got %#v", size)
	}
	if height < 238.2 {
		t.Fatalf("expected parent height promoted to attached-terminal minimum, got %v", height)
	}

	terminalSection := project.Sections[terminalID]
	if terminalSection.ParentSectionID != "code-parent" {
		t.Fatalf("expected terminal parent code-parent, got %#v", terminalSection)
	}
	terminalPayload, err := effectiveSectionPayload(project, terminalID, project.SectionVariantMap[terminalID])
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
	if width != 720.0 {
		t.Fatalf("expected terminal width 720, got %v", width)
	}
	terminalHeight, isAuto, present, err := payloadAutoLayoutSizeValue(terminalSize, "height")
	if err != nil {
		t.Fatalf("parse terminal height: %v", err)
	}
	if !present || isAuto {
		t.Fatalf("expected concrete terminal height, got %#v", terminalSize)
	}
	if terminalHeight != 222.0 {
		t.Fatalf("expected settings-backed terminal height 222, got %v", terminalHeight)
	}

	parentImpl := project.SectionImpls["code-parent-impl"]
	if parentImpl.Code.AttachedTerminalSectionID != terminalID {
		t.Fatalf("expected typed attached terminal id %q, got %#v", terminalID, parentImpl.Code)
	}
	if len(parentImpl.Code.Children) != 1 || parentImpl.Code.Children[0] != terminalID {
		t.Fatalf("expected typed code children [%q], got %#v", terminalID, parentImpl.Code.Children)
	}
}

func TestProjectCreateChildSectionsRejectsInvalidParentsAndArguments(t *testing.T) {
	t.Parallel()

	t.Run("rejects non-parent sections", func(t *testing.T) {
		project := Project{
			ID:   "project-alpha",
			Name: "Alpha",
			SectionVariantMap: map[string]string{
				"leaf": "leaf-variant",
			},
			Sections: map[string]Section{
				"leaf": {
					ID:               "leaf",
					Name:             "Leaf",
					VariantIDs:       []string{"leaf-variant"},
					DefaultVariantID: "leaf-variant",
				},
			},
			SectionVariants: map[string]SectionVariant{
				"leaf-variant": {ID: "leaf-variant", ImplID: "leaf-impl"},
			},
			SectionImpls: map[string]SectionImpl{
				"leaf-impl": {
					ID:      "leaf-impl",
					Kind:    SectionKind("textblock"),
					Payload: mustMarshalProjectObject(map[string]any{"id": "leaf-impl", "type": "TextBlock"}),
				},
			},
		}

		_, err := project.CreateChildSections(CreateChildSectionsInput{
			ParentID:    "leaf",
			ImplType:    "TextBlock",
			NumChildren: 1,
		}, defaultAutoLayoutSectionSizingPolicy(), Document{})
		if !errors.Is(err, ErrChildSectionParentUnsupported) {
			t.Fatalf("expected ErrChildSectionParentUnsupported, got %v", err)
		}
	})

	t.Run("rejects non-terminal code children", func(t *testing.T) {
		project := Project{
			ID:   "project-alpha",
			Name: "Alpha",
			SectionVariantMap: map[string]string{
				"code-parent": "code-parent-variant",
			},
			Sections: map[string]Section{
				"code-parent": {
					ID:               "code-parent",
					Name:             "Code",
					VariantIDs:       []string{"code-parent-variant"},
					DefaultVariantID: "code-parent-variant",
				},
			},
			SectionVariants: map[string]SectionVariant{
				"code-parent-variant": {ID: "code-parent-variant", ImplID: "code-parent-impl"},
			},
			SectionImpls: map[string]SectionImpl{
				"code-parent-impl": {
					ID:   "code-parent-impl",
					Kind: SectionKindCode,
					Code: &CodeSectionImpl{Language: CodeLanguagePython},
					Payload: mustMarshalProjectObject(map[string]any{
						"id":           "code-parent-impl",
						"type":         "Code",
						"codeLanguage": "python",
						"children":     []string{},
					}),
				},
			},
		}

		_, err := project.CreateChildSections(CreateChildSectionsInput{
			ParentID:    "code-parent",
			ImplType:    "TextBlock",
			NumChildren: 1,
		}, defaultAutoLayoutSectionSizingPolicy(), Document{})
		if !errors.Is(err, ErrCodeSectionChildTypeInvalid) {
			t.Fatalf("expected ErrCodeSectionChildTypeInvalid, got %v", err)
		}
	})

	t.Run("rejects out-of-range startIdx", func(t *testing.T) {
		project := Project{
			ID:   "project-alpha",
			Name: "Alpha",
			SectionVariantMap: map[string]string{
				"parent": "parent-variant",
			},
			Sections: map[string]Section{
				"parent": {
					ID:               "parent",
					Name:             "Parent",
					VariantIDs:       []string{"parent-variant"},
					DefaultVariantID: "parent-variant",
				},
			},
			SectionVariants: map[string]SectionVariant{
				"parent-variant": {ID: "parent-variant", ImplID: "parent-impl"},
			},
			SectionImpls: map[string]SectionImpl{
				"parent-impl": {
					ID:      "parent-impl",
					Kind:    SectionKind("group"),
					Payload: mustMarshalProjectObject(map[string]any{"id": "parent-impl", "type": "Group", "children": []string{}}),
				},
			},
		}

		startIdx := 1
		_, err := project.CreateChildSections(CreateChildSectionsInput{
			ParentID:    "parent",
			ImplType:    "TextBlock",
			NumChildren: 1,
			StartIdx:    &startIdx,
		}, defaultAutoLayoutSectionSizingPolicy(), Document{})
		if !errors.Is(err, ErrChildSectionStartIdxInvalid) {
			t.Fatalf("expected ErrChildSectionStartIdxInvalid, got %v", err)
		}
	})
}

func testChildCreationSettingsDocument(t *testing.T, terminalHeight float64) Document {
	t.Helper()

	codeObjVariantMap := map[string]string{
		"terminal-root":   "terminal-root-variant",
		"terminal-size":   "terminal-size-variant",
		"terminal-height": "terminal-height-variant",
	}

	settingsProject, err := Project{
		ID:   "settings-home",
		Name: "settings",
		SectionVariantMap: map[string]string{
			"terminal-default": "terminal-default-variant",
		},
		Sections: map[string]Section{
			"terminal-default": {
				ID:               "terminal-default",
				Name:             "terminalSectionDefault",
				VariantIDs:       []string{"terminal-default-variant"},
				DefaultVariantID: "terminal-default-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"terminal-default-variant": {
				ID:     "terminal-default-variant",
				ImplID: "terminal-default-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"terminal-default-impl": {
				ID:   "terminal-default-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":                "terminal-default-impl",
					"type":              "Dict",
					"topLevelParamId":   "terminal-root",
					"codeObjVariantMap": codeObjVariantMap,
				}),
			},
		},
		CodeObjs: map[string]CodeObject{
			"terminal-root": {
				ID:               "terminal-root",
				Name:             "terminalSectionDefaultRoot",
				VariantIDs:       []string{"terminal-root-variant"},
				DefaultVariantID: "terminal-root-variant",
			},
			"terminal-size": {
				ID:               "terminal-size",
				Name:             "size",
				VariantIDs:       []string{"terminal-size-variant"},
				DefaultVariantID: "terminal-size-variant",
			},
			"terminal-height": {
				ID:               "terminal-height",
				Name:             "height",
				VariantIDs:       []string{"terminal-height-variant"},
				DefaultVariantID: "terminal-height-variant",
			},
		},
		CodeObjVariants: map[string]CodeObjectVariant{
			"terminal-root-variant": {
				ID:     "terminal-root-variant",
				ImplID: "terminal-root-impl",
			},
			"terminal-size-variant": {
				ID:     "terminal-size-variant",
				ImplID: "terminal-size-impl",
			},
			"terminal-height-variant": {
				ID:     "terminal-height-variant",
				ImplID: "terminal-height-impl",
			},
		},
		CodeObjImpls: map[string]CodeObjectImpl{
			"terminal-root-impl": {
				ID:      "terminal-root-impl",
				Type:    "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "terminal-root-impl", "type": "NestedParam", "children": []string{"terminal-size"}}),
			},
			"terminal-size-impl": {
				ID:      "terminal-size-impl",
				Type:    "NestedParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "terminal-size-impl", "type": "NestedParam", "children": []string{"terminal-height"}}),
			},
			"terminal-height-impl": {
				ID:      "terminal-height-impl",
				Type:    "TextParam",
				Payload: mustMarshalProjectObject(map[string]any{"id": "terminal-height-impl", "type": "TextParam", "value": strconvFormat(terminalHeight)}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize terminal settings project: %v", err)
	}

	document, err := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "settings-home",
		Projects: map[string]Project{
			"settings-home": settingsProject,
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize terminal settings document: %v", err)
	}
	return document
}
