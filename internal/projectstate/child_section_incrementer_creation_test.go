package projectstate

import (
	"errors"
	"testing"
)

func TestProjectCreateChildSectionsViaIncrementerPrependsWhenCalledByIsParent(t *testing.T) {
	t.Parallel()

	project := testIncrementerProject()

	result, err := project.CreateChildSectionsViaIncrementer(CreateChildSectionsViaIncrementerInput{
		CalledBy:    "parent",
		ImplType:    "TextBlock",
		NumChildren: 2,
	}, defaultAutoLayoutSectionSizingPolicy(), defaultTerminalSectionHeight)
	if err != nil {
		t.Fatalf("create child sections via incrementer on parent: %v", err)
	}

	if len(result.SectionIDs) != 2 {
		t.Fatalf("expected two created section ids, got %#v", result.SectionIDs)
	}

	parentPayload, err := effectiveSectionPayload(project, "parent", "parent-variant")
	if err != nil {
		t.Fatalf("parent payload: %v", err)
	}
	children := payloadStringArrayField(parentPayload, "children")
	want := []string{result.SectionIDs[0], result.SectionIDs[1], "child-a", "child-b"}
	if len(children) != len(want) {
		t.Fatalf("expected children %#v, got %#v", want, children)
	}
	for index, expected := range want {
		if children[index] != expected {
			t.Fatalf("expected child order %#v, got %#v", want, children)
		}
	}
}

func TestProjectCreateChildSectionsViaIncrementerInsertsAfterCalledByChild(t *testing.T) {
	t.Parallel()

	project := testIncrementerProject()

	result, err := project.CreateChildSectionsViaIncrementer(CreateChildSectionsViaIncrementerInput{
		CalledBy:    "child-a",
		ImplType:    "TextBlock",
		NumChildren: 1,
	}, defaultAutoLayoutSectionSizingPolicy(), defaultTerminalSectionHeight)
	if err != nil {
		t.Fatalf("create child sections via incrementer on child: %v", err)
	}

	if len(result.SectionIDs) != 1 {
		t.Fatalf("expected one created section id, got %#v", result.SectionIDs)
	}

	parentPayload, err := effectiveSectionPayload(project, "parent", "parent-variant")
	if err != nil {
		t.Fatalf("parent payload: %v", err)
	}
	children := payloadStringArrayField(parentPayload, "children")
	want := []string{"child-a", result.SectionIDs[0], "child-b"}
	if len(children) != len(want) {
		t.Fatalf("expected children %#v, got %#v", want, children)
	}
	for index, expected := range want {
		if children[index] != expected {
			t.Fatalf("expected child order %#v, got %#v", want, children)
		}
	}

	createdSection := project.Sections[result.SectionIDs[0]]
	if createdSection.ParentSectionID != "parent" {
		t.Fatalf("expected created child parent parent, got %#v", createdSection)
	}
}

func TestProjectCreateChildSectionsViaIncrementerSupportsExpandedChildTypes(t *testing.T) {
	t.Parallel()

	project := testIncrementerProject()

	result, err := project.CreateChildSectionsViaIncrementer(CreateChildSectionsViaIncrementerInput{
		CalledBy:    "child-a",
		ImplType:    "Browser",
		NumChildren: 1,
	}, defaultAutoLayoutSectionSizingPolicy(), defaultTerminalSectionHeight)
	if err != nil {
		t.Fatalf("create browser child sections via incrementer: %v", err)
	}
	if len(result.SectionIDs) != 1 {
		t.Fatalf("expected one created browser child id, got %#v", result.SectionIDs)
	}

	payload, err := effectiveSectionPayload(project, result.SectionIDs[0], project.SectionVariantMap[result.SectionIDs[0]])
	if err != nil {
		t.Fatalf("browser payload: %v", err)
	}
	if got := payloadStringField(payload, "type"); got != "Browser" {
		t.Fatalf("expected Browser payload type, got %q", got)
	}
	if got := payloadStringField(payload, "viewMode"); got != string(BrowserAreaViewModeList) {
		t.Fatalf("expected browser view mode %q, got %q", BrowserAreaViewModeList, got)
	}
}

func TestProjectCreateChildSectionsViaIncrementerRejectsUnsupportedCallerState(t *testing.T) {
	t.Parallel()

	t.Run("top-level leaf without parent", func(t *testing.T) {
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

		_, err := project.CreateChildSectionsViaIncrementer(CreateChildSectionsViaIncrementerInput{
			CalledBy:    "leaf",
			ImplType:    "TextBlock",
			NumChildren: 1,
		}, defaultAutoLayoutSectionSizingPolicy(), defaultTerminalSectionHeight)
		if !errors.Is(err, ErrChildSectionIncrementerCalledByUnsupported) {
			t.Fatalf("expected ErrChildSectionIncrementerCalledByUnsupported, got %v", err)
		}
	})

	t.Run("child missing from parent children list", func(t *testing.T) {
		project := testIncrementerProject()
		parentImpl := project.SectionImpls["parent-impl"]
		parentImpl.Payload = mustMarshalProjectObject(map[string]any{
			"id":   "parent-impl",
			"type": "Group",
			"children": []string{
				"child-b",
			},
			"size": map[string]any{"width": 500.0, "height": 180.0},
		})
		project.SectionImpls["parent-impl"] = parentImpl

		_, err := project.CreateChildSectionsViaIncrementer(CreateChildSectionsViaIncrementerInput{
			CalledBy:    "child-a",
			ImplType:    "TextBlock",
			NumChildren: 1,
		}, defaultAutoLayoutSectionSizingPolicy(), defaultTerminalSectionHeight)
		if !errors.Is(err, ErrChildSectionIncrementerCalledByNotInParent) {
			t.Fatalf("expected ErrChildSectionIncrementerCalledByNotInParent, got %v", err)
		}
	})
}

func testIncrementerProject() Project {
	return Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"parent":  "parent-variant",
			"child-a": "child-a-variant",
			"child-b": "child-b-variant",
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
		},
		SectionVariants: map[string]SectionVariant{
			"parent-variant":  {ID: "parent-variant", ImplID: "parent-impl"},
			"child-a-variant": {ID: "child-a-variant", ImplID: "child-a-impl"},
			"child-b-variant": {ID: "child-b-variant", ImplID: "child-b-impl"},
		},
		SectionImpls: map[string]SectionImpl{
			"parent-impl": {
				ID:      "parent-impl",
				Kind:    SectionKind("group"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "parent-impl", "type": "Group", "children": []string{"child-a", "child-b"}, "size": map[string]any{"width": 500.0, "height": 180.0}}),
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
		},
	}
}
