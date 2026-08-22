package contracts

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestProjectSnapshotV2ValidatesTypedForestAndRecursiveDictionaryUnion(t *testing.T) {
	snapshot := FixtureProjectSnapshotV2()
	expression := "4"
	snapshot.Callables = []CallableV2{{
		ID: "callable-child", Name: "Child", Parameters: []ParameterV2{},
	}}
	snapshot.ParameterDictionaries = []ParameterDictionaryV2{{
		ID: "dictionary-options", Name: "Options", Entries: []DictionaryEntryV2{
			{Kind: DictionaryEntryKindLeafV2, ID: "entry-radius", Name: "radius", AuthoredExpression: &expression},
			{Kind: DictionaryEntryKindParentV2, ID: "entry-group", Name: "group", Children: []DictionaryEntryV2{}},
		},
	}}
	snapshot.Lists = []ListV2{{
		ID: "list-objects", Name: "Objects", ChildSectionIDs: []string{"callable-child", "dictionary-options"},
	}}
	snapshot.TopLevelSectionIDs = []string{"list-objects"}
	if err := snapshot.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}

	malformed := snapshot
	malformed.ParameterDictionaries = append([]ParameterDictionaryV2(nil), snapshot.ParameterDictionaries...)
	malformed.ParameterDictionaries[0].Entries = append([]DictionaryEntryV2(nil), snapshot.ParameterDictionaries[0].Entries...)
	malformed.ParameterDictionaries[0].Entries[0].Children = []DictionaryEntryV2{}
	var validationError ValidationError
	if !errors.As(malformed.Validate(), &validationError) || validationError.Field != "parameterDictionaries[0].entries[0]" {
		t.Fatalf("leaf-plus-children validation = %v", malformed.Validate())
	}

	if err := json.Unmarshal([]byte(`{"kind":"leaf","id":"entry","name":"value","authoredExpression":"1","children":[]}`), new(DictionaryEntryV2)); err == nil {
		t.Fatal("UnmarshalJSON accepted a dictionary leaf with parent fields")
	}
}

func TestSectionMutationRequestsRequireClosedArraysAndPositiveCounts(t *testing.T) {
	for _, request := range []interface{ Validate() error }{
		SetParameterDictionaryEntriesRequestV2{ProjectID: "project:test", ExpectedRevision: 1},
		IncrementListChildrenRequestV2{ProjectID: "project:test", ExpectedRevision: 1, Count: 0},
		DecrementListChildrenRequestV2{ProjectID: "project:test", ExpectedRevision: 1, Count: 0},
		ReplaceSectionForestRequestV2{ProjectID: "project:test", ExpectedRevision: 1},
	} {
		if err := request.Validate(); err == nil {
			t.Fatalf("Validate() accepted malformed request %#v", request)
		}
	}
}
