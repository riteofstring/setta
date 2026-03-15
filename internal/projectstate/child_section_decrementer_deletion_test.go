package projectstate

import (
	"errors"
	"reflect"
	"testing"
)

func TestProjectDeleteChildSectionsViaDecrementerDeletesFirstChildrenWhenCalledByIsParent(t *testing.T) {
	t.Parallel()

	project := testIncrementerProject()

	result, err := project.DeleteChildSectionsViaDecrementer(DeleteChildSectionsViaDecrementerInput{
		CalledBy:    "parent",
		NumChildren: 1,
	})
	if err != nil {
		t.Fatalf("delete child sections via decrementer on parent: %v", err)
	}

	if !reflect.DeepEqual(result.SectionIDs, []string{"child-a"}) {
		t.Fatalf("expected deleted child ids [child-a], got %#v", result.SectionIDs)
	}
	if _, ok := project.Sections["child-a"]; ok {
		t.Fatalf("expected child-a to be removed, got %#v", project.Sections)
	}

	parentPayload, err := effectiveSectionPayload(project, "parent", "parent-variant")
	if err != nil {
		t.Fatalf("parent payload: %v", err)
	}
	children := payloadStringArrayField(parentPayload, "children")
	if !reflect.DeepEqual(children, []string{"child-b"}) {
		t.Fatalf("expected remaining children [child-b], got %#v", children)
	}
}

func TestProjectDeleteChildSectionsViaDecrementerDeletesNextChildrenWhenCalledByIsChild(t *testing.T) {
	t.Parallel()

	project := testIncrementerProject()

	result, err := project.DeleteChildSectionsViaDecrementer(DeleteChildSectionsViaDecrementerInput{
		CalledBy:    "child-a",
		NumChildren: 1,
	})
	if err != nil {
		t.Fatalf("delete child sections via decrementer on child: %v", err)
	}

	if !reflect.DeepEqual(result.SectionIDs, []string{"child-b"}) {
		t.Fatalf("expected deleted child ids [child-b], got %#v", result.SectionIDs)
	}
	if _, ok := project.Sections["child-b"]; ok {
		t.Fatalf("expected child-b to be removed, got %#v", project.Sections)
	}

	parentPayload, err := effectiveSectionPayload(project, "parent", "parent-variant")
	if err != nil {
		t.Fatalf("parent payload: %v", err)
	}
	children := payloadStringArrayField(parentPayload, "children")
	if !reflect.DeepEqual(children, []string{"child-a"}) {
		t.Fatalf("expected remaining children [child-a], got %#v", children)
	}
}

func TestProjectDeleteChildSectionsViaDecrementerReturnsNoopWhenDeletionWindowIsEmpty(t *testing.T) {
	t.Parallel()

	project := testIncrementerProject()

	result, err := project.DeleteChildSectionsViaDecrementer(DeleteChildSectionsViaDecrementerInput{
		CalledBy:    "child-b",
		NumChildren: 1,
	})
	if err != nil {
		t.Fatalf("delete child sections via decrementer no-op: %v", err)
	}

	if len(result.SectionIDs) != 0 {
		t.Fatalf("expected no deleted child ids, got %#v", result.SectionIDs)
	}
	if _, ok := project.Sections["child-a"]; !ok {
		t.Fatalf("expected child-a to remain, got %#v", project.Sections)
	}
	if _, ok := project.Sections["child-b"]; !ok {
		t.Fatalf("expected child-b to remain, got %#v", project.Sections)
	}

	parentPayload, err := effectiveSectionPayload(project, "parent", "parent-variant")
	if err != nil {
		t.Fatalf("parent payload: %v", err)
	}
	children := payloadStringArrayField(parentPayload, "children")
	if !reflect.DeepEqual(children, []string{"child-a", "child-b"}) {
		t.Fatalf("expected children to remain unchanged, got %#v", children)
	}
}

func TestProjectDeleteChildSectionsViaDecrementerRejectsUnsupportedCallerState(t *testing.T) {
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

		_, err := project.DeleteChildSectionsViaDecrementer(DeleteChildSectionsViaDecrementerInput{
			CalledBy:    "leaf",
			NumChildren: 1,
		})
		if !errors.Is(err, ErrChildSectionDecrementerCalledByUnsupported) {
			t.Fatalf("expected ErrChildSectionDecrementerCalledByUnsupported, got %v", err)
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

		_, err := project.DeleteChildSectionsViaDecrementer(DeleteChildSectionsViaDecrementerInput{
			CalledBy:    "child-a",
			NumChildren: 1,
		})
		if !errors.Is(err, ErrChildSectionDecrementerCalledByNotInParent) {
			t.Fatalf("expected ErrChildSectionDecrementerCalledByNotInParent, got %v", err)
		}
	})

	t.Run("negative count", func(t *testing.T) {
		project := testIncrementerProject()

		_, err := project.DeleteChildSectionsViaDecrementer(DeleteChildSectionsViaDecrementerInput{
			CalledBy:    "parent",
			NumChildren: -1,
		})
		if !errors.Is(err, ErrChildSectionDecrementerCountInvalid) {
			t.Fatalf("expected ErrChildSectionDecrementerCountInvalid, got %v", err)
		}
	})
}
