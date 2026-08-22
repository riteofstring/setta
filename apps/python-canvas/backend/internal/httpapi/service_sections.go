package httpapi

import (
	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

func parameterDictionariesV2(values []aggregate.ParameterDictionary) []contracts.ParameterDictionaryV2 {
	result := make([]contracts.ParameterDictionaryV2, 0, len(values))
	for _, value := range values {
		result = append(result, contracts.ParameterDictionaryV2{
			ID:      value.ID,
			Name:    value.Name,
			Entries: dictionaryEntriesV2(value.Entries),
		})
	}
	return result
}

func dictionaryEntriesV2(values []aggregate.DictionaryEntry) []contracts.DictionaryEntryV2 {
	result := make([]contracts.DictionaryEntryV2, 0, len(values))
	for _, value := range values {
		if value.Leaf != nil {
			expression := value.Leaf.AuthoredExpression
			result = append(result, contracts.DictionaryEntryV2{
				Kind:               contracts.DictionaryEntryKindLeafV2,
				ID:                 value.ID,
				Name:               value.Name,
				AuthoredExpression: &expression,
			})
			continue
		}
		result = append(result, contracts.DictionaryEntryV2{
			Kind:     contracts.DictionaryEntryKindParentV2,
			ID:       value.ID,
			Name:     value.Name,
			Children: dictionaryEntriesV2(value.Parent.Children),
		})
	}
	return result
}

func dictionaryEntriesFromV2(values []contracts.DictionaryEntryV2) []aggregate.DictionaryEntry {
	result := make([]aggregate.DictionaryEntry, 0, len(values))
	for _, value := range values {
		if value.Kind == contracts.DictionaryEntryKindLeafV2 && value.AuthoredExpression != nil {
			result = append(result, aggregate.DictionaryEntry{
				ID:   value.ID,
				Name: value.Name,
				Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: *value.AuthoredExpression},
			})
			continue
		}
		result = append(result, aggregate.DictionaryEntry{
			ID:     value.ID,
			Name:   value.Name,
			Parent: &aggregate.DictionaryParent{Children: dictionaryEntriesFromV2(value.Children)},
		})
	}
	return result
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
