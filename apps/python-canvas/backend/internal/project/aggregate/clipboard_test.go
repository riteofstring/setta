package aggregate

import (
	"errors"
	"reflect"
	"testing"
)

func TestSectionClipboardCapturesNormalizedSubtreeWithoutUnselectedState(t *testing.T) {
	state := clipboardStateForTest()
	payload, err := state.CopySectionClipboard(CopySectionClipboardCommand{
		ProjectID:        state.Project.ID,
		ObservedRevision: state.Project.Revision,
		RootSectionIDs:   []string{"list:objects"},
	})
	if err != nil {
		t.Fatalf("CopySectionClipboard() error = %v", err)
	}
	if !reflect.DeepEqual(payload.RootSectionIDs, []string{"list:objects"}) {
		t.Fatalf("root ids = %#v", payload.RootSectionIDs)
	}
	if len(payload.Callables) != 1 || payload.Callables[0].ID != "callable:child" {
		t.Fatalf("captured callables = %#v", payload.Callables)
	}
	if len(payload.ParameterDictionaries) != 1 || payload.ParameterDictionaries[0].ID != "dictionary:options" {
		t.Fatalf("captured dictionaries = %#v", payload.ParameterDictionaries)
	}
	if len(payload.Lists) != 1 || !reflect.DeepEqual(payload.Lists[0].ChildSectionIDs, []string{"callable:child", "dictionary:options"}) {
		t.Fatalf("captured lists = %#v", payload.Lists)
	}
	if _, err := payload.State(); err != nil {
		t.Fatalf("payload State() error = %v", err)
	}
}

func TestSectionClipboardPasteAllocatesEveryTargetOnceAndAppendsRoots(t *testing.T) {
	state := clipboardStateForTest()
	payload, err := state.CopySectionClipboard(CopySectionClipboardCommand{
		ProjectID:        state.Project.ID,
		ObservedRevision: state.Project.Revision,
		RootSectionIDs:   []string{"list:objects"},
	})
	if err != nil {
		t.Fatalf("CopySectionClipboard() error = %v", err)
	}

	prepared, err := state.PasteSectionClipboard(PasteSectionClipboardCommand{
		ProjectID:        state.Project.ID,
		ExpectedRevision: state.Project.Revision,
		Payload:          payload,
	}, sequenceIDsForClipboardTest(
		"list:objects:copy",
		"callable:child:copy",
		"parameter:child:value:copy",
		"dictionary:options:copy",
		"entry:options:scale:copy",
	))
	if err != nil {
		t.Fatalf("PasteSectionClipboard() error = %v", err)
	}
	if prepared.Candidate.State.Project.Revision != state.Project.Revision+1 {
		t.Fatalf("revision = %d, want %d", prepared.Candidate.State.Project.Revision, state.Project.Revision+1)
	}
	if !reflect.DeepEqual(prepared.PastedRootSectionIDs, []string{"list:objects:copy"}) {
		t.Fatalf("pasted roots = %#v", prepared.PastedRootSectionIDs)
	}
	if !reflect.DeepEqual(prepared.Candidate.State.TopLevelSectionIDs, []string{"callable:external", "list:objects", "list:objects:copy"}) {
		t.Fatalf("top-level sections = %#v", prepared.Candidate.State.TopLevelSectionIDs)
	}
	if prepared.SourceToDestinationIDs["callable:child"] != "callable:child:copy" || prepared.SourceToDestinationIDs["entry:options:scale"] != "entry:options:scale:copy" {
		t.Fatalf("id map = %#v", prepared.SourceToDestinationIDs)
	}
	copiedList := prepared.Candidate.State.Lists[1]
	if copiedList.ID != "list:objects:copy" || copiedList.Name != "Objects 2" || !reflect.DeepEqual(copiedList.ChildSectionIDs, []string{"callable:child:copy", "dictionary:options:copy"}) {
		t.Fatalf("copied list = %#v", copiedList)
	}
	copiedCallable := prepared.Candidate.State.Callables[2]
	if copiedCallable.ID != "callable:child:copy" || copiedCallable.Name != "Child 2" || copiedCallable.Parameters[0].ID != "parameter:child:value:copy" {
		t.Fatalf("copied callable = %#v", copiedCallable)
	}
	if err := prepared.Candidate.State.Validate(); err != nil {
		t.Fatalf("pasted candidate Validate() error = %v", err)
	}
}

func TestSectionClipboardRejectsNestedRootsAndInvalidPayloadBeforeAllocation(t *testing.T) {
	state := clipboardStateForTest()
	_, err := state.CopySectionClipboard(CopySectionClipboardCommand{
		ProjectID:        state.Project.ID,
		ObservedRevision: state.Project.Revision,
		RootSectionIDs:   []string{"list:objects", "callable:child"},
	})
	if !errors.Is(err, ErrValidation) {
		t.Fatalf("CopySectionClipboard() error = %v, want validation failure", err)
	}

	_, err = state.PasteSectionClipboard(PasteSectionClipboardCommand{
		ProjectID:        state.Project.ID,
		ExpectedRevision: state.Project.Revision,
		Payload: SectionClipboardPayload{
			Version:               SectionClipboardVersionV1,
			RootSectionIDs:        []string{"callable:missing"},
			Callables:             []Callable{},
			ParameterDictionaries: []ParameterDictionary{},
			Lists:                 []List{},
		},
	}, sequenceIDsForClipboardTest("unused"))
	if !errors.Is(err, ErrValidation) {
		t.Fatalf("PasteSectionClipboard() error = %v, want validation failure", err)
	}
}

func clipboardStateForTest() State {
	return State{
		Project:      Project{ID: "project:clipboard", Name: "Clipboard project", Revision: 7},
		PythonTarget: PythonTarget{Suffix: DefaultPythonSuffix},
		Callables: []Callable{
			{ID: "callable:external", Name: "External", AuthoredExpression: "fixture.external", Parameters: []Parameter{}},
			{
				ID:                 "callable:child",
				Name:               "Child",
				AuthoredExpression: "fixture.child",
				Parameters: []Parameter{{
					ID:                 "parameter:child:value",
					Name:               "value",
					NameEditable:       true,
					PassingStyle:       PassingStylePositionalOrKeyword,
					AuthoredExpression: "state.Objects__0",
				}},
			},
		},
		ParameterDictionaries: []ParameterDictionary{{
			ID:   "dictionary:options",
			Name: "Options",
			Entries: []DictionaryEntry{{
				ID:   "entry:options:scale",
				Name: "scale",
				Leaf: &DictionaryLeaf{AuthoredExpression: "2"},
			}},
		}},
		ParameterUIOverrides: map[string]ParameterUI{},
		Lists: []List{{
			ID:              "list:objects",
			Name:            "Objects",
			ChildSectionIDs: []string{"callable:child", "dictionary:options"},
		}},
		TopLevelSectionIDs: []string{"callable:external", "list:objects"},
	}
}

func sequenceIDsForClipboardTest(ids ...string) IDGenerator {
	index := 0
	return func() (string, error) {
		if index >= len(ids) {
			return "", ErrIDGeneratorRequired
		}
		id := ids[index]
		index++
		return id, nil
	}
}
