package projectfile

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/aggregate"
)

func TestStrictProjectFilePersistsTheCompleteSectionForestAndEntryUnion(t *testing.T) {
	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-forest", Name: "Forest", Revision: 3},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{{
			ID: "callable-child", Name: "Child", Parameters: []aggregate.Parameter{},
		}},
		ParameterDictionaries: []aggregate.ParameterDictionary{
			{
				ID: "dictionary-options", Name: "Options", Entries: []aggregate.DictionaryEntry{
					{ID: "entry-radius", Name: "radius", Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: "4"}},
					{ID: "entry-group", Name: "group", Parent: &aggregate.DictionaryParent{Children: []aggregate.DictionaryEntry{}}},
				},
			},
		},
		Lists: []aggregate.List{{
			ID: "list-objects", Name: "Objects", ChildSectionIDs: []string{"callable-child", "dictionary-options"},
		}},
		TopLevelSectionIDs:   []string{"list-objects"},
		ParameterUIOverrides: map[string]aggregate.ParameterUI{},
	}
	encoded, err := Encode(state)
	if err != nil {
		t.Fatalf("Encode() error = %v", err)
	}
	for _, expected := range []string{
		`"parameterDictionaries"`,
		`"lists"`,
		`"topLevelSectionIds"`,
		`"kind": "leaf"`,
		`"kind": "parent"`,
	} {
		if !strings.Contains(string(encoded), expected) {
			t.Fatalf("encoded document does not contain %s:\n%s", expected, encoded)
		}
	}
	decoded, err := Decode(encoded)
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	if !reflect.DeepEqual(decoded, state) {
		t.Fatalf("decoded state = %#v, want %#v", decoded, state)
	}

	formerShape := strings.Replace(string(encoded), `,
  "parameterDictionaries": [
    {
      "id": "dictionary-options",
      "name": "Options",
      "entries": [
        {
          "kind": "leaf",
          "id": "entry-radius",
          "name": "radius",
          "authoredExpression": "4"
        },
        {
          "kind": "parent",
          "id": "entry-group",
          "name": "group",
          "children": []
        }
      ]
    }
  ],
  "lists": [
    {
      "id": "list-objects",
      "name": "Objects",
      "childSectionIds": [
        "callable-child",
        "dictionary-options"
      ]
    }
  ],
  "topLevelSectionIds": [
    "list-objects"
  ]`, "", 1)
	if _, err := Decode([]byte(formerShape)); !errors.Is(err, ErrInvalidProjectFile) {
		t.Fatalf("former document field set error = %v, want ErrInvalidProjectFile", err)
	}
}
