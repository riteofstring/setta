package projectfile

import (
	"encoding/json"
	"fmt"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/aggregate"
)

type diskParameterDictionary struct {
	ID      string                `json:"id"`
	Name    string                `json:"name"`
	Entries []diskDictionaryEntry `json:"entries"`
}

type diskList struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	ChildSectionIDs []string `json:"childSectionIds"`
}

type decodedSectionState struct {
	parameterDictionaries []aggregate.ParameterDictionary
	lists                 []aggregate.List
	topLevelSectionIDs    []string
}

func decodeSectionState(fields map[string]json.RawMessage) (decodedSectionState, error) {
	parameterDictionaries, err := decodeParameterDictionaries(fields["parameterDictionaries"])
	if err != nil {
		return decodedSectionState{}, err
	}
	lists, err := decodeLists(fields["lists"])
	if err != nil {
		return decodedSectionState{}, err
	}
	topLevelSectionIDs, err := decodeStringArray(fields["topLevelSectionIds"], "topLevelSectionIds")
	if err != nil {
		return decodedSectionState{}, err
	}
	return decodedSectionState{
		parameterDictionaries: parameterDictionaries,
		lists:                 lists,
		topLevelSectionIDs:    topLevelSectionIDs,
	}, nil
}

type diskDictionaryEntry struct {
	value aggregate.DictionaryEntry
}

func (entry diskDictionaryEntry) MarshalJSON() ([]byte, error) {
	if entry.value.Leaf != nil {
		return json.Marshal(struct {
			Kind               string `json:"kind"`
			ID                 string `json:"id"`
			Name               string `json:"name"`
			AuthoredExpression string `json:"authoredExpression"`
		}{
			Kind:               "leaf",
			ID:                 entry.value.ID,
			Name:               entry.value.Name,
			AuthoredExpression: entry.value.Leaf.AuthoredExpression,
		})
	}
	if entry.value.Parent != nil {
		return json.Marshal(struct {
			Kind     string                `json:"kind"`
			ID       string                `json:"id"`
			Name     string                `json:"name"`
			Children []diskDictionaryEntry `json:"children"`
		}{
			Kind:     "parent",
			ID:       entry.value.ID,
			Name:     entry.value.Name,
			Children: encodeDictionaryEntries(entry.value.Parent.Children),
		})
	}
	return nil, fmt.Errorf("encode malformed dictionary entry %q", entry.value.ID)
}

func encodeParameterDictionaries(values []aggregate.ParameterDictionary) []diskParameterDictionary {
	result := make([]diskParameterDictionary, 0, len(values))
	for _, value := range values {
		result = append(result, diskParameterDictionary{
			ID:      value.ID,
			Name:    value.Name,
			Entries: encodeDictionaryEntries(value.Entries),
		})
	}
	return result
}

func encodeDictionaryEntries(values []aggregate.DictionaryEntry) []diskDictionaryEntry {
	result := make([]diskDictionaryEntry, 0, len(values))
	for _, value := range values {
		result = append(result, diskDictionaryEntry{value: value})
	}
	return result
}

func encodeLists(values []aggregate.List) []diskList {
	result := make([]diskList, 0, len(values))
	for _, value := range values {
		result = append(result, diskList{
			ID:              value.ID,
			Name:            value.Name,
			ChildSectionIDs: cloneStringSlice(value.ChildSectionIDs),
		})
	}
	return result
}

func decodeParameterDictionaries(raw json.RawMessage) ([]aggregate.ParameterDictionary, error) {
	values, err := decodeArray(raw, "parameterDictionaries")
	if err != nil {
		return nil, err
	}
	result := make([]aggregate.ParameterDictionary, 0, len(values))
	for index, value := range values {
		label := fmt.Sprintf("parameterDictionary %d", index)
		fields, err := decodeObject(value, label)
		if err != nil {
			return nil, err
		}
		if err := requireExactFields(fields, label, "id", "name", "entries"); err != nil {
			return nil, err
		}
		id, err := decodeString(fields["id"], label+" id")
		if err != nil {
			return nil, err
		}
		name, err := decodeString(fields["name"], label+" name")
		if err != nil {
			return nil, err
		}
		entries, err := decodeDictionaryEntries(fields["entries"], label+" entries")
		if err != nil {
			return nil, err
		}
		result = append(result, aggregate.ParameterDictionary{ID: id, Name: name, Entries: entries})
	}
	return result, nil
}

func decodeDictionaryEntries(raw json.RawMessage, label string) ([]aggregate.DictionaryEntry, error) {
	values, err := decodeArray(raw, label)
	if err != nil {
		return nil, err
	}
	result := make([]aggregate.DictionaryEntry, 0, len(values))
	for index, value := range values {
		entry, err := decodeDictionaryEntry(value, fmt.Sprintf("%s %d", label, index))
		if err != nil {
			return nil, err
		}
		result = append(result, entry)
	}
	return result, nil
}

func decodeDictionaryEntry(raw json.RawMessage, label string) (aggregate.DictionaryEntry, error) {
	fields, err := decodeObject(raw, label)
	if err != nil {
		return aggregate.DictionaryEntry{}, err
	}
	kind, err := decodeString(fields["kind"], label+" kind")
	if err != nil {
		return aggregate.DictionaryEntry{}, err
	}
	switch kind {
	case "leaf":
		return decodeDictionaryLeaf(fields, label)
	case "parent":
		return decodeDictionaryParent(fields, label)
	default:
		return aggregate.DictionaryEntry{}, invalidFile("%s kind %q is unsupported", label, kind)
	}
}

func decodeDictionaryLeaf(fields map[string]json.RawMessage, label string) (aggregate.DictionaryEntry, error) {
	if err := requireExactFields(fields, label, "kind", "id", "name", "authoredExpression"); err != nil {
		return aggregate.DictionaryEntry{}, err
	}
	id, name, err := decodeDictionaryEntryIdentity(fields, label)
	if err != nil {
		return aggregate.DictionaryEntry{}, err
	}
	expression, err := decodeString(fields["authoredExpression"], label+" authoredExpression")
	if err != nil {
		return aggregate.DictionaryEntry{}, err
	}
	return aggregate.DictionaryEntry{ID: id, Name: name, Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: expression}}, nil
}

func decodeDictionaryParent(fields map[string]json.RawMessage, label string) (aggregate.DictionaryEntry, error) {
	if err := requireExactFields(fields, label, "kind", "id", "name", "children"); err != nil {
		return aggregate.DictionaryEntry{}, err
	}
	id, name, err := decodeDictionaryEntryIdentity(fields, label)
	if err != nil {
		return aggregate.DictionaryEntry{}, err
	}
	children, err := decodeDictionaryEntries(fields["children"], label+" children")
	if err != nil {
		return aggregate.DictionaryEntry{}, err
	}
	return aggregate.DictionaryEntry{ID: id, Name: name, Parent: &aggregate.DictionaryParent{Children: children}}, nil
}

func decodeDictionaryEntryIdentity(fields map[string]json.RawMessage, label string) (string, string, error) {
	id, err := decodeString(fields["id"], label+" id")
	if err != nil {
		return "", "", err
	}
	name, err := decodeString(fields["name"], label+" name")
	if err != nil {
		return "", "", err
	}
	return id, name, nil
}

func decodeLists(raw json.RawMessage) ([]aggregate.List, error) {
	values, err := decodeArray(raw, "lists")
	if err != nil {
		return nil, err
	}
	result := make([]aggregate.List, 0, len(values))
	for index, value := range values {
		label := fmt.Sprintf("list %d", index)
		fields, err := decodeObject(value, label)
		if err != nil {
			return nil, err
		}
		if err := requireExactFields(fields, label, "id", "name", "childSectionIds"); err != nil {
			return nil, err
		}
		id, err := decodeString(fields["id"], label+" id")
		if err != nil {
			return nil, err
		}
		name, err := decodeString(fields["name"], label+" name")
		if err != nil {
			return nil, err
		}
		children, err := decodeStringArray(fields["childSectionIds"], label+" childSectionIds")
		if err != nil {
			return nil, err
		}
		result = append(result, aggregate.List{ID: id, Name: name, ChildSectionIDs: children})
	}
	return result, nil
}

func decodeStringArray(raw json.RawMessage, label string) ([]string, error) {
	values, err := decodeArray(raw, label)
	if err != nil {
		return nil, err
	}
	result := make([]string, 0, len(values))
	for index, value := range values {
		entry, err := decodeString(value, fmt.Sprintf("%s %d", label, index))
		if err != nil {
			return nil, err
		}
		result = append(result, entry)
	}
	return result, nil
}

func cloneStringSlice(values []string) []string {
	result := make([]string, len(values))
	copy(result, values)
	return result
}
