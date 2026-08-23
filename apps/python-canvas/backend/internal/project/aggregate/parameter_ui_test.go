package aggregate

import "testing"

func TestCallableAndDictionaryParameterUIsPersistThroughTheirOwningMutations(t *testing.T) {
	t.Parallel()

	state := mustBlank(t, "project-parameter-ui")
	createdCallable, err := state.CreateCallable(CreateCallableCommand{
		ProjectID:        state.Project.ID,
		ExpectedRevision: state.Project.Revision,
		Name:             "Configured callable",
	}, sequenceIDs("callable-configured"))
	state = mustChangedCandidate(t, "CreateCallable", createdCallable, err)

	slider := DefaultParameterUI(ParameterUITypeSlider)
	setCallableUI, err := state.SetParameters(SetParametersCommand{
		ProjectID:        state.Project.ID,
		CallableID:       "callable-configured",
		ExpectedRevision: state.Project.Revision,
		Parameters: []ParameterProposal{{
			ID:                 "parameter-amount",
			Name:               "amount",
			AuthoredExpression: "4",
			UI:                 &slider,
		}},
	})
	state = mustChangedCandidate(t, "SetParameters(slider)", setCallableUI, err)
	if got := state.ResolveParameterUI("parameter-amount"); !SameParameterUI(got, slider) {
		t.Fatalf("callable parameter UI = %#v, want %#v", got, slider)
	}

	code := DefaultParameterUI(ParameterUITypeCode)
	resetCallableUI, err := state.SetParameters(SetParametersCommand{
		ProjectID:        state.Project.ID,
		CallableID:       "callable-configured",
		ExpectedRevision: state.Project.Revision,
		Parameters: []ParameterProposal{{
			ID:                 "parameter-amount",
			Name:               "amount",
			AuthoredExpression: "4",
			UI:                 &code,
		}},
	})
	state = mustChangedCandidate(t, "SetParameters(code)", resetCallableUI, err)
	if _, exists := state.ParameterUIOverrides["parameter-amount"]; exists {
		t.Fatal("canonical CodeParam was redundantly retained as an override")
	}

	createdDictionary, err := state.CreateParameterDictionary(
		CreateParameterDictionaryCommand{
			ProjectID:        state.Project.ID,
			ExpectedRevision: state.Project.Revision,
			Name:             "Options",
		},
		sequenceIDs("dictionary-options"),
	)
	state = mustChangedCandidate(
		t,
		"CreateParameterDictionary",
		createdDictionary,
		err,
	)
	dropdown := DefaultParameterUI(ParameterUITypeDropdown)
	setDictionaryUI, err := state.SetParameterDictionaryEntries(
		SetParameterDictionaryEntriesCommand{
			ProjectID:        state.Project.ID,
			DictionaryID:     "dictionary-options",
			ExpectedRevision: state.Project.Revision,
			Entries: []DictionaryEntry{{
				ID:   "entry-size",
				Name: "size",
				Leaf: &DictionaryLeaf{AuthoredExpression: `"large"`},
			}},
			UIOverrides: map[string]ParameterUI{"entry-size": dropdown},
		},
	)
	state = mustChangedCandidate(
		t,
		"SetParameterDictionaryEntries(dropdown)",
		setDictionaryUI,
		err,
	)
	if got := state.ResolveParameterUI("entry-size"); !SameParameterUI(got, dropdown) {
		t.Fatalf("dictionary entry UI = %#v, want %#v", got, dropdown)
	}

	promoted, err := state.SetParameterDictionaryEntries(
		SetParameterDictionaryEntriesCommand{
			ProjectID:        state.Project.ID,
			DictionaryID:     "dictionary-options",
			ExpectedRevision: state.Project.Revision,
			Entries: []DictionaryEntry{{
				ID:     "entry-size",
				Name:   "size",
				Parent: &DictionaryParent{Children: []DictionaryEntry{}},
			}},
			UIOverrides: map[string]ParameterUI{},
		},
	)
	state = mustChangedCandidate(
		t,
		"SetParameterDictionaryEntries(parent)",
		promoted,
		err,
	)
	if _, exists := state.ParameterUIOverrides["entry-size"]; exists {
		t.Fatal("promoting a dictionary leaf retained its obsolete UI override")
	}
	if err := state.Validate(); err != nil {
		t.Fatalf("Validate() after parameter UI mutations = %v", err)
	}
}
