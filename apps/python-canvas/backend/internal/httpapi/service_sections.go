package httpapi

import (
	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

func parameterDictionariesV2(state aggregate.State) ([]contracts.ParameterDictionaryV2, error) {
	result := make([]contracts.ParameterDictionaryV2, 0, len(state.ParameterDictionaries))
	for _, value := range state.ParameterDictionaries {
		entries, err := dictionaryEntriesV2(state, value.Entries)
		if err != nil {
			return nil, err
		}
		result = append(result, contracts.ParameterDictionaryV2{
			ID:      value.ID,
			Name:    value.Name,
			Entries: entries,
		})
	}
	return result, nil
}

func dictionaryEntriesV2(state aggregate.State, values []aggregate.DictionaryEntry) ([]contracts.DictionaryEntryV2, error) {
	result := make([]contracts.DictionaryEntryV2, 0, len(values))
	for _, value := range values {
		if value.Leaf != nil {
			ui, err := contracts.NewParameterUIV2(state.ResolveParameterUI(value.ID))
			if err != nil {
				return nil, err
			}
			expression := value.Leaf.AuthoredExpression
			result = append(result, contracts.DictionaryEntryV2{
				Kind:               contracts.DictionaryEntryKindLeafV2,
				ID:                 value.ID,
				Name:               value.Name,
				UI:                 ui,
				AuthoredExpression: &expression,
			})
			continue
		}
		ui, err := contracts.NewParameterUIV2(aggregate.DefaultParameterUI(aggregate.ParameterUITypeNested))
		if err != nil {
			return nil, err
		}
		children, err := dictionaryEntriesV2(state, value.Parent.Children)
		if err != nil {
			return nil, err
		}
		result = append(result, contracts.DictionaryEntryV2{
			Kind:     contracts.DictionaryEntryKindParentV2,
			ID:       value.ID,
			Name:     value.Name,
			UI:       ui,
			Children: children,
		})
	}
	return result, nil
}

func dictionaryEntriesFromV2(values []contracts.DictionaryEntryV2) ([]aggregate.DictionaryEntry, map[string]aggregate.ParameterUI, error) {
	result := make([]aggregate.DictionaryEntry, 0, len(values))
	overrides := make(map[string]aggregate.ParameterUI)
	for _, value := range values {
		if value.Kind == contracts.DictionaryEntryKindLeafV2 && value.AuthoredExpression != nil {
			ui, err := value.UI.Aggregate()
			if err != nil {
				return nil, nil, err
			}
			if !aggregate.SameParameterUI(ui, aggregate.DefaultParameterUI(aggregate.ParameterUITypeCode)) {
				overrides[value.ID] = ui
			}
			result = append(result, aggregate.DictionaryEntry{
				ID:   value.ID,
				Name: value.Name,
				Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: *value.AuthoredExpression},
			})
			continue
		}
		children, childOverrides, err := dictionaryEntriesFromV2(value.Children)
		if err != nil {
			return nil, nil, err
		}
		for targetID, ui := range childOverrides {
			overrides[targetID] = ui
		}
		result = append(result, aggregate.DictionaryEntry{
			ID:     value.ID,
			Name:   value.Name,
			Parent: &aggregate.DictionaryParent{Children: children},
		})
	}
	return result, overrides, nil
}

func listsV2(values []aggregate.List) []contracts.ListV2 {
	result := make([]contracts.ListV2, 0, len(values))
	for _, value := range values {
		result = append(result, contracts.ListV2{
			ID:              value.ID,
			Name:            value.Name,
			ChildSectionIDs: cloneSectionIDs(value.ChildSectionIDs),
		})
	}
	return result
}

func listChildrenFromV2(values []contracts.ListChildrenV2) []aggregate.ListChildrenProposal {
	result := make([]aggregate.ListChildrenProposal, 0, len(values))
	for _, value := range values {
		result = append(result, aggregate.ListChildrenProposal{
			ListID:          value.ListID,
			ChildSectionIDs: cloneSectionIDs(value.ChildSectionIDs),
		})
	}
	return result
}

func cloneSectionIDs(values []string) []string {
	result := make([]string, len(values))
	copy(result, values)
	return result
}
