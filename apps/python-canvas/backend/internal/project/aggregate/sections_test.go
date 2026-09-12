package aggregate

import (
	"errors"
	"reflect"
	"testing"
)

func TestSectionForestCommandsKeepTypedCollectionsAndPlacementAtomic(t *testing.T) {
	state := mustBlank(t, "project-sections")

	dictionary, err := state.CreateParameterDictionary(CreateParameterDictionaryCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "Options",
	}, sequenceIDs("dictionary-options"))
	state = mustChangedCandidate(t, "CreateParameterDictionary", dictionary, err)
	list, err := state.CreateList(CreateListCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "Objects",
	}, sequenceIDs("list-objects"))
	state = mustChangedCandidate(t, "CreateList", list, err)
	callable, err := state.CreateCallable(CreateCallableCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "Build",
	}, sequenceIDs("callable-build"))
	state = mustChangedCandidate(t, "CreateCallable", callable, err)

	entries := []DictionaryEntry{
		{ID: "entry-radius", Name: "radius", Leaf: &DictionaryLeaf{AuthoredExpression: "4"}},
		{
			ID: "entry-options", Name: "options",
			Parent: &DictionaryParent{Children: []DictionaryEntry{
				{ID: "entry-scale", Name: "scale", Leaf: &DictionaryLeaf{AuthoredExpression: "2"}},
			}},
		},
	}
	setEntries, err := state.SetParameterDictionaryEntries(SetParameterDictionaryEntriesCommand{
		ProjectID: state.Project.ID, DictionaryID: "dictionary-options", ExpectedRevision: state.Project.Revision, Entries: entries,
	})
	state = mustChangedCandidate(t, "SetParameterDictionaryEntries", setEntries, err)

	forest, err := state.ReplaceSectionForest(ReplaceSectionForestCommand{
		ProjectID:          state.Project.ID,
		ExpectedRevision:   state.Project.Revision,
		TopLevelSectionIDs: []string{"list-objects"},
		ListChildren: []ListChildrenProposal{{
			ListID:          "list-objects",
			ChildSectionIDs: []string{"callable-build", "dictionary-options"},
		}},
	})
	state = mustChangedCandidate(t, "ReplaceSectionForest", forest, err)
	if !reflect.DeepEqual(state.TopLevelSectionIDs, []string{"list-objects"}) || !reflect.DeepEqual(state.Lists[0].ChildSectionIDs, []string{"callable-build", "dictionary-options"}) {
		t.Fatalf("forest = %#v", state)
	}
	if err := state.Validate(); err != nil {
		t.Fatalf("Validate() after forest move = %v", err)
	}

	before := state.Clone()
	_, err = state.ReplaceSectionForest(ReplaceSectionForestCommand{
		ProjectID:          state.Project.ID,
		ExpectedRevision:   state.Project.Revision,
		TopLevelSectionIDs: []string{},
		ListChildren: []ListChildrenProposal{{
			ListID:          "list-objects",
			ChildSectionIDs: []string{"list-objects", "callable-build", "dictionary-options"},
		}},
	})
	if !errors.Is(err, ErrValidation) {
		t.Fatalf("cyclic forest error = %v, want ErrValidation", err)
	}
	if !reflect.DeepEqual(state, before) {
		t.Fatalf("invalid forest changed published state\ngot: %#v\nwant: %#v", state, before)
	}
}

func TestListIncrementDecrementAndSubtreeDeletionAreAtomic(t *testing.T) {
	state := mustBlank(t, "project-list")
	created, err := state.CreateList(CreateListCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "List",
	}, sequenceIDs("list-root"))
	state = mustChangedCandidate(t, "CreateList", created, err)

	incremented, err := state.IncrementListChildren(IncrementListChildrenCommand{
		ProjectID: state.Project.ID, ListID: "list-root", ExpectedRevision: state.Project.Revision, Count: 2,
	}, sequenceIDs("callable-one", "callable-two"))
	state = mustChangedCandidate(t, "IncrementListChildren", incremented, err)
	if got, want := state.Lists[0].ChildSectionIDs, []string{"callable-one", "callable-two"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("list children = %#v, want %#v", got, want)
	}
	if state.Callables[0].Name != "Callable" || state.Callables[1].Name != "Callable 2" {
		t.Fatalf("allocated callable names = %#v", state.Callables)
	}

	decremented, err := state.DecrementListChildren(DecrementListChildrenCommand{
		ProjectID: state.Project.ID, ListID: "list-root", ExpectedRevision: state.Project.Revision, Count: 9,
	})
	state = mustChangedCandidate(t, "DecrementListChildren", decremented, err)
	if len(state.Lists[0].ChildSectionIDs) != 0 || len(state.Callables) != 0 {
		t.Fatalf("decrement did not remove trailing child subtrees: %#v", state)
	}

	idempotent, err := state.DecrementListChildren(DecrementListChildrenCommand{
		ProjectID: state.Project.ID, ListID: "list-root", ExpectedRevision: state.Project.Revision, Count: 1,
	})
	if err != nil || idempotent.Changed || !reflect.DeepEqual(idempotent.State, state) {
		t.Fatalf("empty decrement = %#v, %v", idempotent, err)
	}

	withChild, err := state.IncrementListChildren(IncrementListChildrenCommand{
		ProjectID: state.Project.ID, ListID: "list-root", ExpectedRevision: state.Project.Revision, Count: 1,
	}, sequenceIDs("callable-three"))
	state = mustChangedCandidate(t, "IncrementListChildren(second)", withChild, err)
	deleted, err := state.DeleteList(DeleteListCommand{
		ProjectID: state.Project.ID, ListID: "list-root", ExpectedRevision: state.Project.Revision,
	})
	state = mustChangedCandidate(t, "DeleteList", deleted, err)
	if len(state.Lists) != 0 || len(state.Callables) != 0 || len(state.TopLevelSectionIDs) != 0 {
		t.Fatalf("deleting list retained a subtree: %#v", state)
	}
}

func TestDictionaryEntryUnionAndCloneRejectInvalidOrAliasedTrees(t *testing.T) {
	state := State{
		Project:      Project{ID: "project-tree", Name: "Tree", Revision: 1},
		PythonTarget: PythonTarget{Suffix: DefaultPythonSuffix},
		Callables:    []Callable{},
		ParameterDictionaries: []ParameterDictionary{{
			ID: "dictionary-tree", Name: "Tree", Entries: []DictionaryEntry{{
				ID:     "entry-tree",
				Name:   "node",
				Leaf:   &DictionaryLeaf{AuthoredExpression: "1"},
				Parent: &DictionaryParent{Children: []DictionaryEntry{}},
			}},
		}},
		Lists:              []List{},
		TopLevelSectionIDs: []string{"dictionary-tree"},
	}
	if err := state.Validate(); !errors.Is(err, ErrValidation) {
		t.Fatalf("dual dictionary union error = %v, want ErrValidation", err)
	}

	state.ParameterDictionaries[0].Entries[0].Parent = nil
	if err := state.Validate(); err != nil {
		t.Fatalf("valid dictionary tree = %v", err)
	}
	clone := state.Clone()
	clone.ParameterDictionaries[0].Entries[0].Leaf.AuthoredExpression = "2"
	if state.ParameterDictionaries[0].Entries[0].Leaf.AuthoredExpression != "1" {
		t.Fatalf("Clone() aliased dictionary expression: %#v", state)
	}
}
