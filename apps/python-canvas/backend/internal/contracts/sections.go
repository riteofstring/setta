package contracts

import (
	"bytes"
	"encoding/json"
	"fmt"
)

type DictionaryEntryKindV2 string

const (
	DictionaryEntryKindLeafV2   DictionaryEntryKindV2 = "leaf"
	DictionaryEntryKindParentV2 DictionaryEntryKindV2 = "parent"
)

// ParameterDictionaryV2 is one typed authored dictionary section.
type ParameterDictionaryV2 struct {
	ID      string              `json:"id"`
	Name    string              `json:"name"`
	Entries []DictionaryEntryV2 `json:"entries"`
}

// DictionaryEntryV2 is a recursive discriminated transport union. A leaf has
// only authoredExpression; a parent has only children.
type DictionaryEntryV2 struct {
	Kind               DictionaryEntryKindV2
	ID                 string
	Name               string
	UI                 ParameterUIV2
	AuthoredExpression *string
	Children           []DictionaryEntryV2
}

func (entry DictionaryEntryV2) MarshalJSON() ([]byte, error) {
	switch entry.Kind {
	case DictionaryEntryKindLeafV2:
		if entry.AuthoredExpression == nil || entry.Children != nil {
			return nil, fmt.Errorf("marshal malformed dictionary leaf %q", entry.ID)
		}
		return json.Marshal(struct {
			Kind               DictionaryEntryKindV2 `json:"kind"`
			ID                 string                `json:"id"`
			Name               string                `json:"name"`
			UI                 ParameterUIV2         `json:"ui"`
			AuthoredExpression string                `json:"authoredExpression"`
		}{
			Kind:               entry.Kind,
			ID:                 entry.ID,
			Name:               entry.Name,
			UI:                 entry.UI,
			AuthoredExpression: *entry.AuthoredExpression,
		})
	case DictionaryEntryKindParentV2:
		if entry.AuthoredExpression != nil || entry.Children == nil {
			return nil, fmt.Errorf("marshal malformed dictionary parent %q", entry.ID)
		}
		return json.Marshal(struct {
			Kind     DictionaryEntryKindV2 `json:"kind"`
			ID       string                `json:"id"`
			Name     string                `json:"name"`
			UI       ParameterUIV2         `json:"ui"`
			Children []DictionaryEntryV2   `json:"children"`
		}{
			Kind:     entry.Kind,
			ID:       entry.ID,
			Name:     entry.Name,
			UI:       entry.UI,
			Children: entry.Children,
		})
	default:
		return nil, fmt.Errorf("marshal unsupported dictionary entry kind %q", entry.Kind)
	}
}

func (entry *DictionaryEntryV2) UnmarshalJSON(content []byte) error {
	fields, kind, err := decodeDictionaryEntryFields(content)
	if err != nil {
		return err
	}
	decoded, err := decodeDictionaryEntryByKind(kind, fields)
	if err != nil {
		return err
	}
	*entry = decoded
	return nil
}

func decodeDictionaryEntryFields(content []byte) (map[string]json.RawMessage, DictionaryEntryKindV2, error) {
	fields := make(map[string]json.RawMessage)
	if err := json.Unmarshal(content, &fields); err != nil {
		return nil, "", err
	}
	kindRaw, exists := fields["kind"]
	if !exists {
		return nil, "", fmt.Errorf("dictionary entry is missing kind")
	}
	var kind DictionaryEntryKindV2
	if err := json.Unmarshal(kindRaw, &kind); err != nil || kind == "" {
		return nil, "", fmt.Errorf("dictionary entry kind is invalid")
	}
	return fields, kind, nil
}

func decodeDictionaryEntryByKind(kind DictionaryEntryKindV2, fields map[string]json.RawMessage) (DictionaryEntryV2, error) {
	switch kind {
	case DictionaryEntryKindLeafV2:
		return decodeDictionaryLeafV2(fields)
	case DictionaryEntryKindParentV2:
		return decodeDictionaryParentV2(fields)
	default:
		return DictionaryEntryV2{}, fmt.Errorf("dictionary entry kind %q is unsupported", kind)
	}
}

func decodeDictionaryLeafV2(fields map[string]json.RawMessage) (DictionaryEntryV2, error) {
	if err := requireExactJSONFields(fields, "kind", "id", "name", "ui", "authoredExpression"); err != nil {
		return DictionaryEntryV2{}, err
	}
	id, name, err := decodeDictionaryEntryIdentity(fields)
	if err != nil {
		return DictionaryEntryV2{}, err
	}
	expression, err := decodeRequiredJSONString(fields["authoredExpression"])
	if err != nil {
		return DictionaryEntryV2{}, fmt.Errorf("dictionary leaf authoredExpression is invalid: %w", err)
	}
	ui, err := decodeDictionaryEntryUI(fields["ui"])
	if err != nil {
		return DictionaryEntryV2{}, err
	}
	return DictionaryEntryV2{Kind: DictionaryEntryKindLeafV2, ID: id, Name: name, UI: ui, AuthoredExpression: &expression}, nil
}

func decodeDictionaryParentV2(fields map[string]json.RawMessage) (DictionaryEntryV2, error) {
	if err := requireExactJSONFields(fields, "kind", "id", "name", "ui", "children"); err != nil {
		return DictionaryEntryV2{}, err
	}
	id, name, err := decodeDictionaryEntryIdentity(fields)
	if err != nil {
		return DictionaryEntryV2{}, err
	}
	if bytes.Equal(bytes.TrimSpace(fields["children"]), []byte("null")) {
		return DictionaryEntryV2{}, fmt.Errorf("dictionary parent children is invalid")
	}
	var children []DictionaryEntryV2
	if err := json.Unmarshal(fields["children"], &children); err != nil || children == nil {
		return DictionaryEntryV2{}, fmt.Errorf("dictionary parent children is invalid")
	}
	ui, err := decodeDictionaryEntryUI(fields["ui"])
	if err != nil {
		return DictionaryEntryV2{}, err
	}
	return DictionaryEntryV2{Kind: DictionaryEntryKindParentV2, ID: id, Name: name, UI: ui, Children: children}, nil
}

func decodeDictionaryEntryUI(raw json.RawMessage) (ParameterUIV2, error) {
	var ui ParameterUIV2
	if err := json.Unmarshal(raw, &ui); err != nil {
		return ParameterUIV2{}, fmt.Errorf("dictionary entry UI is invalid: %w", err)
	}
	return ui, nil
}

func decodeDictionaryEntryIdentity(fields map[string]json.RawMessage) (string, string, error) {
	id, err := decodeRequiredJSONString(fields["id"])
	if err != nil {
		return "", "", err
	}
	name, err := decodeRequiredJSONString(fields["name"])
	if err != nil {
		return "", "", err
	}
	return id, name, nil
}

func decodeRequiredJSONString(value json.RawMessage) (string, error) {
	if len(value) == 0 || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		return "", fmt.Errorf("must be a string")
	}
	var result string
	if err := json.Unmarshal(value, &result); err != nil {
		return "", err
	}
	return result, nil
}

func requireExactJSONFields(fields map[string]json.RawMessage, expected ...string) error {
	if len(fields) != len(expected) {
		return fmt.Errorf("dictionary entry has unexpected fields")
	}
	for _, field := range expected {
		if _, exists := fields[field]; !exists {
			return fmt.Errorf("dictionary entry is missing %s", field)
		}
	}
	return nil
}

// ListV2 is one authored List of Objects section and its ordered child IDs.
type ListV2 struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	ChildSectionIDs []string `json:"childSectionIds"`
}

type CreateParameterDictionaryRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	Name             string `json:"name"`
}

type RenameParameterDictionaryRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	Name             string `json:"name"`
}

type DeleteParameterDictionaryRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
}

type SetParameterDictionaryEntriesRequestV2 struct {
	ProjectID        string              `json:"projectId"`
	ExpectedRevision int                 `json:"expectedRevision"`
	Entries          []DictionaryEntryV2 `json:"entries"`
}

type CreateListRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	Name             string `json:"name"`
}

type RenameListRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	Name             string `json:"name"`
}

type DeleteListRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
}

type IncrementListChildrenRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	Count            int    `json:"count"`
}

type DecrementListChildrenRequestV2 struct {
	ProjectID        string `json:"projectId"`
	ExpectedRevision int    `json:"expectedRevision"`
	Count            int    `json:"count"`
}

// ListChildrenV2 owns one list's children in a complete forest proposal.
type ListChildrenV2 struct {
	ListID          string   `json:"listId"`
	ChildSectionIDs []string `json:"childSectionIds"`
}

type ReplaceSectionForestRequestV2 struct {
	ProjectID          string           `json:"projectId"`
	ExpectedRevision   int              `json:"expectedRevision"`
	TopLevelSectionIDs []string         `json:"topLevelSectionIds"`
	ListChildren       []ListChildrenV2 `json:"listChildren"`
}

func validateSnapshotParameterDictionaries(
	dictionaries []ParameterDictionaryV2,
	targetIDs map[string]struct{},
	sectionIDs map[string]struct{},
	projectID string,
) error {
	for index, dictionary := range dictionaries {
		field := fmt.Sprintf("parameterDictionaries[%d]", index)
		if err := requireStableID(field+".id", dictionary.ID); err != nil {
			return err
		}
		if dictionary.ID == projectID {
			return ValidationError{Field: field + ".id", Problem: "must be globally unique"}
		}
		if err := claimSnapshotTargetID(field+".id", dictionary.ID, targetIDs); err != nil {
			return err
		}
		if err := claimSnapshotSectionID(field+".id", dictionary.ID, sectionIDs); err != nil {
			return err
		}
		if err := requireDisplayName(field+".name", dictionary.Name); err != nil {
			return err
		}
		if dictionary.Entries == nil {
			return ValidationError{Field: field + ".entries", Problem: "must be an array"}
		}
		if err := validateSnapshotDictionaryEntries(dictionary.Entries, field+".entries", targetIDs, projectID); err != nil {
			return err
		}
	}
	return nil
}

func validateSnapshotDictionaryEntries(entries []DictionaryEntryV2, field string, targetIDs map[string]struct{}, projectID string) error {
	names := make(map[string]struct{}, len(entries))
	for index, entry := range entries {
		entryField := fmt.Sprintf("%s[%d]", field, index)
		if err := validateSnapshotDictionaryEntryBase(entry, entryField, targetIDs, projectID, names); err != nil {
			return err
		}
		if err := validateSnapshotDictionaryEntryVariant(entry, entryField, targetIDs, projectID); err != nil {
			return err
		}
	}
	return nil
}

func validateSnapshotDictionaryEntryBase(
	entry DictionaryEntryV2,
	field string,
	targetIDs map[string]struct{},
	projectID string,
	names map[string]struct{},
) error {
	if err := requireStableID(field+".id", entry.ID); err != nil {
		return err
	}
	if entry.ID == projectID {
		return ValidationError{Field: field + ".id", Problem: "must be globally unique"}
	}
	if err := claimSnapshotTargetID(field+".id", entry.ID, targetIDs); err != nil {
		return err
	}
	if err := requireDisplayName(field+".name", entry.Name); err != nil {
		return err
	}
	return claimSnapshotDictionaryEntryName(field+".name", entry.Name, names)
}

func claimSnapshotDictionaryEntryName(field string, name string, names map[string]struct{}) error {
	if _, exists := names[name]; exists {
		return ValidationError{Field: field, Problem: "must be unique within its dictionary parent"}
	}
	names[name] = struct{}{}
	return nil
}

func validateSnapshotDictionaryEntryVariant(entry DictionaryEntryV2, field string, targetIDs map[string]struct{}, projectID string) error {
	switch entry.Kind {
	case DictionaryEntryKindLeafV2:
		return validateSnapshotDictionaryLeaf(entry, field)
	case DictionaryEntryKindParentV2:
		return validateSnapshotDictionaryParent(entry, field, targetIDs, projectID)
	default:
		return ValidationError{Field: field + ".kind", Problem: "is unsupported"}
	}
}

func validateSnapshotDictionaryLeaf(entry DictionaryEntryV2, field string) error {
	if entry.AuthoredExpression == nil || entry.Children != nil {
		return ValidationError{Field: field, Problem: "must be an exact leaf union"}
	}
	_, err := entry.UI.Aggregate()
	if err != nil || entry.UI.Type == ParameterUITypeNestedV2 {
		return ValidationError{Field: field + ".ui", Problem: "must be a configurable leaf UI"}
	}
	return validateText(field+".authoredExpression", *entry.AuthoredExpression, true)
}

func validateSnapshotDictionaryParent(entry DictionaryEntryV2, field string, targetIDs map[string]struct{}, projectID string) error {
	if entry.AuthoredExpression != nil || entry.Children == nil {
		return ValidationError{Field: field, Problem: "must be an exact parent union"}
	}
	_, err := entry.UI.Aggregate()
	if err != nil || entry.UI.Type != ParameterUITypeNestedV2 {
		return ValidationError{Field: field + ".ui", Problem: "must be NestedParam"}
	}
	return validateSnapshotDictionaryEntries(entry.Children, field+".children", targetIDs, projectID)
}

func validateSnapshotLists(lists []ListV2, targetIDs map[string]struct{}, sectionIDs map[string]struct{}, projectID string) error {
	for index, list := range lists {
		field := fmt.Sprintf("lists[%d]", index)
		if err := requireStableID(field+".id", list.ID); err != nil {
			return err
		}
		if list.ID == projectID {
			return ValidationError{Field: field + ".id", Problem: "must be globally unique"}
		}
		if err := claimSnapshotTargetID(field+".id", list.ID, targetIDs); err != nil {
			return err
		}
		if err := claimSnapshotSectionID(field+".id", list.ID, sectionIDs); err != nil {
			return err
		}
		if err := requireDisplayName(field+".name", list.Name); err != nil {
			return err
		}
		if list.ChildSectionIDs == nil {
			return ValidationError{Field: field + ".childSectionIds", Problem: "must be an array"}
		}
		for childIndex, childID := range list.ChildSectionIDs {
			if err := requireStableID(fmt.Sprintf("%s.childSectionIds[%d]", field, childIndex), childID); err != nil {
				return err
			}
		}
	}
	return nil
}

func claimSnapshotSectionID(field string, value string, sectionIDs map[string]struct{}) error {
	if _, exists := sectionIDs[value]; exists {
		return ValidationError{Field: field, Problem: "must be unique"}
	}
	sectionIDs[value] = struct{}{}
	return nil
}

type snapshotSectionForest struct {
	placements map[string]struct{}
	children   map[string][]string
	listIDs    map[string]struct{}
}

func validateSnapshotSectionForest(topLevel []string, lists []ListV2, sectionIDs map[string]struct{}) error {
	forest, err := newSnapshotSectionForest(topLevel, lists, sectionIDs)
	if err != nil {
		return err
	}
	if len(forest.placements) != len(sectionIDs) {
		return ValidationError{Field: "topLevelSectionIds", Problem: "must place every section exactly once"}
	}
	if err := validateSnapshotListCycles(forest.children, forest.listIDs); err != nil {
		return err
	}
	return validateSnapshotForestReachability(topLevel, forest.children, forest.listIDs, sectionIDs)
}

func newSnapshotSectionForest(topLevel []string, lists []ListV2, sectionIDs map[string]struct{}) (snapshotSectionForest, error) {
	forest := snapshotSectionForest{
		placements: make(map[string]struct{}, len(sectionIDs)),
		children:   make(map[string][]string, len(lists)),
		listIDs:    make(map[string]struct{}, len(lists)),
	}
	if err := forest.claimTopLevel(topLevel, sectionIDs); err != nil {
		return snapshotSectionForest{}, err
	}
	if err := forest.addLists(lists, sectionIDs); err != nil {
		return snapshotSectionForest{}, err
	}
	return forest, nil
}

func (forest *snapshotSectionForest) claimTopLevel(topLevel []string, sectionIDs map[string]struct{}) error {
	for index, id := range topLevel {
		field := fmt.Sprintf("topLevelSectionIds[%d]", index)
		if err := forest.claimPlacement(field, id, sectionIDs); err != nil {
			return err
		}
	}
	return nil
}

func (forest *snapshotSectionForest) addLists(lists []ListV2, sectionIDs map[string]struct{}) error {
	for listIndex, list := range lists {
		forest.listIDs[list.ID] = struct{}{}
		forest.children[list.ID] = list.ChildSectionIDs
		if err := forest.claimListChildren(listIndex, list.ChildSectionIDs, sectionIDs); err != nil {
			return err
		}
	}
	return nil
}

func (forest *snapshotSectionForest) claimListChildren(listIndex int, children []string, sectionIDs map[string]struct{}) error {
	for childIndex, id := range children {
		field := fmt.Sprintf("lists[%d].childSectionIds[%d]", listIndex, childIndex)
		if err := forest.claimPlacement(field, id, sectionIDs); err != nil {
			return err
		}
	}
	return nil
}

func (forest *snapshotSectionForest) claimPlacement(field string, id string, sectionIDs map[string]struct{}) error {
	if err := requireStableID(field, id); err != nil {
		return err
	}
	if _, exists := sectionIDs[id]; !exists {
		return ValidationError{Field: field, Problem: "references an unknown section"}
	}
	if _, exists := forest.placements[id]; exists {
		return ValidationError{Field: field, Problem: "gives a section multiple parents"}
	}
	forest.placements[id] = struct{}{}
	return nil
}

func validateSnapshotListCycles(children map[string][]string, listIDs map[string]struct{}) error {
	colors := make(map[string]uint8, len(listIDs))
	for listID := range listIDs {
		if err := visitSnapshotList(listID, children, listIDs, colors); err != nil {
			return err
		}
	}
	return nil
}

func visitSnapshotList(listID string, children map[string][]string, listIDs map[string]struct{}, colors map[string]uint8) error {
	if colors[listID] == 1 {
		return ValidationError{Field: "lists", Problem: "contains a section cycle"}
	}
	if colors[listID] == 2 {
		return nil
	}
	colors[listID] = 1
	for _, childID := range children[listID] {
		if _, isList := listIDs[childID]; !isList {
			continue
		}
		if err := visitSnapshotList(childID, children, listIDs, colors); err != nil {
			return err
		}
	}
	colors[listID] = 2
	return nil
}

func validateSnapshotForestReachability(topLevel []string, children map[string][]string, listIDs map[string]struct{}, sectionIDs map[string]struct{}) error {
	reachable := make(map[string]struct{}, len(sectionIDs))
	for _, sectionID := range topLevel {
		markSnapshotSectionReachable(sectionID, children, listIDs, reachable)
	}
	if len(reachable) != len(sectionIDs) {
		return ValidationError{Field: "topLevelSectionIds", Problem: "must reach every section"}
	}
	return nil
}

func markSnapshotSectionReachable(sectionID string, children map[string][]string, listIDs map[string]struct{}, reachable map[string]struct{}) {
	if _, exists := reachable[sectionID]; exists {
		return
	}
	reachable[sectionID] = struct{}{}
	if _, isList := listIDs[sectionID]; !isList {
		return
	}
	for _, childID := range children[sectionID] {
		markSnapshotSectionReachable(childID, children, listIDs, reachable)
	}
}

func (request CreateParameterDictionaryRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	return requireDisplayName("name", request.Name)
}

func (request RenameParameterDictionaryRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	return requireDisplayName("name", request.Name)
}

func (request DeleteParameterDictionaryRequestV2) Validate() error {
	return validateMutationRequest(request.ProjectID, request.ExpectedRevision)
}

func (request SetParameterDictionaryEntriesRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	if request.Entries == nil {
		return ValidationError{Field: "entries", Problem: "must be an array"}
	}
	return validateSnapshotDictionaryEntries(request.Entries, "entries", make(map[string]struct{}), "")
}

func (request CreateListRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	return requireDisplayName("name", request.Name)
}

func (request RenameListRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	return requireDisplayName("name", request.Name)
}

func (request DeleteListRequestV2) Validate() error {
	return validateMutationRequest(request.ProjectID, request.ExpectedRevision)
}

func (request IncrementListChildrenRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	if request.Count < 1 {
		return ValidationError{Field: "count", Problem: "must be positive"}
	}
	return nil
}

func (request DecrementListChildrenRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	if request.Count < 1 {
		return ValidationError{Field: "count", Problem: "must be positive"}
	}
	return nil
}

func (request ReplaceSectionForestRequestV2) Validate() error {
	if err := validateMutationRequest(request.ProjectID, request.ExpectedRevision); err != nil {
		return err
	}
	return validateSectionForestProposal(request.TopLevelSectionIDs, request.ListChildren)
}

func validateSectionForestProposal(topLevel []string, listChildren []ListChildrenV2) error {
	if topLevel == nil {
		return ValidationError{Field: "topLevelSectionIds", Problem: "must be an array"}
	}
	if listChildren == nil {
		return ValidationError{Field: "listChildren", Problem: "must be an array"}
	}
	if err := validateSectionForestTopLevel(topLevel); err != nil {
		return err
	}
	return validateSectionForestListChildren(listChildren)
}

func validateSectionForestTopLevel(topLevel []string) error {
	for index, id := range topLevel {
		if err := requireStableID(fmt.Sprintf("topLevelSectionIds[%d]", index), id); err != nil {
			return err
		}
	}
	return nil
}

func validateSectionForestListChildren(listChildren []ListChildrenV2) error {
	listIDs := make(map[string]struct{}, len(listChildren))
	for index, list := range listChildren {
		field := fmt.Sprintf("listChildren[%d]", index)
		if err := requireStableID(field+".listId", list.ListID); err != nil {
			return err
		}
		if _, exists := listIDs[list.ListID]; exists {
			return ValidationError{Field: field + ".listId", Problem: "must be unique"}
		}
		listIDs[list.ListID] = struct{}{}
		if list.ChildSectionIDs == nil {
			return ValidationError{Field: field + ".childSectionIds", Problem: "must be an array"}
		}
		if err := validateSectionForestChildren(field, list.ChildSectionIDs); err != nil {
			return err
		}
	}
	return nil
}

func validateSectionForestChildren(field string, childSectionIDs []string) error {
	for childIndex, childID := range childSectionIDs {
		childField := fmt.Sprintf("%s.childSectionIds[%d]", field, childIndex)
		if err := requireStableID(childField, childID); err != nil {
			return err
		}
	}
	return nil
}
