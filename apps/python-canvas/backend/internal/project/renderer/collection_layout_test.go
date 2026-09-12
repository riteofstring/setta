package renderer

import (
	"strings"
	"testing"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

func TestRenderCollectionsUseMainLayoutThresholdsAndByteCoordinates(t *testing.T) {
	t.Parallel()

	result, err := Render(collectionLayoutState())
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}

	wantCallableFour := "café.four(\n" +
		"            first=state.Callable_Four__first,\n" +
		"            second=state.Callable_Four__second,\n" +
		"            third=state.Callable_Four__third,\n" +
		"            fourth=state.Callable_Four__fourth,\n" +
		"        )"
	wantDictionaryFour := "{\n" +
		"            \"first\": state.Dictionary_Four__first,\n" +
		"            \"second\": state.Dictionary_Four__second,\n" +
		"            \"third\": state.Dictionary_Four__third,\n" +
		"            \"fourth\": state.Dictionary_Four__fourth,\n" +
		"        }"
	wantListFour := "[\n" +
		"            state.List_Four__0,\n" +
		"            state.List_Four__1,\n" +
		"            state.List_Four__2,\n" +
		"            state.List_Four__3,\n" +
		"        ]"
	wantCallableInline := "f(a=state.C__a, b=state.C__b, c=state.C__c)"
	wantDictionaryInline := "{\"a\": state.D__a, \"b\": state.D__b, \"c\": state.D__c}"
	wantListInline := "[state.L__0, state.L__1, state.L__2]"
	wantCallableLong := "long.call(\n" +
		"            very_long_first_parameter_name=state.Long_Callable__very_long_first_parameter_name,\n" +
		"            very_long_second_parameter_name=state.Long_Callable__very_long_second_parameter_name,\n" +
		"            very_long_third_parameter_name=state.Long_Callable__very_long_third_parameter_name,\n" +
		"        )"
	wantDictionaryLong := "{\n" +
		"            \"very_long_first_dictionary_entry\": state.Long_Dictionary__very_long_first_dictionary_entry,\n" +
		"            \"very_long_second_dictionary_entry\": state.Long_Dictionary__very_long_second_dictionary_entry,\n" +
		"            \"very_long_third_dictionary_entry\": state.Long_Dictionary__very_long_third_dictionary_entry,\n" +
		"        }"
	wantListLong := "[\n" +
		"            state.An_Especially_Long_List_Name__0,\n" +
		"            state.An_Especially_Long_List_Name__1,\n" +
		"            state.An_Especially_Long_List_Name__2,\n" +
		"        ]"

	assertCallableValue(t, result, "callable-four", wantCallableFour)
	assertCompositionValue(t, result, "dictionary-four", wantDictionaryFour)
	assertCompositionValue(t, result, "list-four", wantListFour)
	assertCallableValue(t, result, "callable-inline", wantCallableInline)
	assertCompositionValue(t, result, "dictionary-inline", wantDictionaryInline)
	assertCompositionValue(t, result, "list-inline", wantListInline)
	assertCallableValue(t, result, "callable-long", wantCallableLong)
	assertCompositionValue(t, result, "dictionary-long", wantDictionaryLong)
	assertCompositionValue(t, result, "list-long", wantListLong)

	assertExactByteRange(t, result.Code, result.PrefixRange, "import café")
	assertExactByteRange(t, result.Code, result.SuffixRange, "state = SettaState() # ω")
	assertExactByteRange(t, result.Code, result.SourceRangesByTargetID["callable-four"], "café.four")
	assertExactByteRange(t, result.Code, result.SourceRangesByTargetID["dictionary-four-first"], "café_value")
	assertExactByteRange(t, result.Code, result.SourceRangesByTargetID["list-four-child-1"], "café.child")
	assertExactByteRange(t, result.Code, result.CompositionRangesByTargetID["dictionary-four"], wantDictionaryFour)
	assertExactByteRange(t, result.Code, result.CompositionRangesByTargetID["list-four"], wantListFour)

	callableRange := result.SourceRangesByTargetID["callable-four"]
	callPosition := result.CallableCallPositionsByID["callable-four"]
	wantCallPosition := CallPosition{
		Offset: callableRange.Start + strings.Index(wantCallableFour, "(") + 1,
		End:    callableRange.Start + len(wantCallableFour),
	}
	if callPosition != wantCallPosition || result.Code[callPosition.Offset:callPosition.End] != wantCallableFour[len("café.four("):] {
		t.Fatalf("call position = %#v, want exact UTF-8 byte coordinates %#v", callPosition, wantCallPosition)
	}
}

func collectionLayoutState() aggregate.State {
	return aggregate.State{
		Project:      aggregate.Project{ID: "project-collection-layout", Name: "Collection layout", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Prefix: "import café", Suffix: "state = SettaState() # ω"},
		Callables: []aggregate.Callable{
			{
				ID: "callable-four", Name: "Callable Four", AuthoredExpression: "café.four",
				Parameters: []aggregate.Parameter{
					collectionAppParameter("callable-four-first", "first", "first_value"),
					collectionAppParameter("callable-four-second", "second", "second_value"),
					collectionAppParameter("callable-four-third", "third", "third_value"),
					collectionAppParameter("callable-four-fourth", "fourth", "fourth_value"),
				},
			},
			{
				ID: "callable-inline", Name: "C", AuthoredExpression: "f",
				Parameters: []aggregate.Parameter{
					collectionAppParameter("callable-inline-a", "a", "a_value"),
					collectionAppParameter("callable-inline-b", "b", "b_value"),
					collectionAppParameter("callable-inline-c", "c", "c_value"),
				},
			},
			{
				ID: "callable-long", Name: "Long Callable", AuthoredExpression: "long.call",
				Parameters: []aggregate.Parameter{
					collectionAppParameter("callable-long-first", "very_long_first_parameter_name", "long_first_value"),
					collectionAppParameter("callable-long-second", "very_long_second_parameter_name", "long_second_value"),
					collectionAppParameter("callable-long-third", "very_long_third_parameter_name", "long_third_value"),
				},
			},
			{ID: "list-four-child-1", Name: "First", AuthoredExpression: "café.child", Parameters: []aggregate.Parameter{}},
			{ID: "list-four-child-2", Name: "Second", AuthoredExpression: "fixture.second", Parameters: []aggregate.Parameter{}},
			{ID: "list-four-child-3", Name: "Third", AuthoredExpression: "fixture.third", Parameters: []aggregate.Parameter{}},
			{ID: "list-four-child-4", Name: "Fourth", AuthoredExpression: "fixture.fourth", Parameters: []aggregate.Parameter{}},
			{ID: "list-inline-child-1", Name: "Inline First", AuthoredExpression: "fixture.inline_first", Parameters: []aggregate.Parameter{}},
			{ID: "list-inline-child-2", Name: "Inline Second", AuthoredExpression: "fixture.inline_second", Parameters: []aggregate.Parameter{}},
			{ID: "list-inline-child-3", Name: "Inline Third", AuthoredExpression: "fixture.inline_third", Parameters: []aggregate.Parameter{}},
			{ID: "list-long-child-1", Name: "Long First", AuthoredExpression: "fixture.long_first", Parameters: []aggregate.Parameter{}},
			{ID: "list-long-child-2", Name: "Long Second", AuthoredExpression: "fixture.long_second", Parameters: []aggregate.Parameter{}},
			{ID: "list-long-child-3", Name: "Long Third", AuthoredExpression: "fixture.long_third", Parameters: []aggregate.Parameter{}},
		},
		ParameterDictionaries: []aggregate.ParameterDictionary{
			{
				ID: "dictionary-four", Name: "Dictionary Four", Entries: []aggregate.DictionaryEntry{
					collectionDictionaryLeaf("dictionary-four-first", "first", "café_value"),
					collectionDictionaryLeaf("dictionary-four-second", "second", "second_value"),
					collectionDictionaryLeaf("dictionary-four-third", "third", "third_value"),
					collectionDictionaryLeaf("dictionary-four-fourth", "fourth", "fourth_value"),
				},
			},
			{
				ID: "dictionary-inline", Name: "D", Entries: []aggregate.DictionaryEntry{
					collectionDictionaryLeaf("dictionary-inline-a", "a", "a_value"),
					collectionDictionaryLeaf("dictionary-inline-b", "b", "b_value"),
					collectionDictionaryLeaf("dictionary-inline-c", "c", "c_value"),
				},
			},
			{
				ID: "dictionary-long", Name: "Long Dictionary", Entries: []aggregate.DictionaryEntry{
					collectionDictionaryLeaf("dictionary-long-first", "very_long_first_dictionary_entry", "long_first_value"),
					collectionDictionaryLeaf("dictionary-long-second", "very_long_second_dictionary_entry", "long_second_value"),
					collectionDictionaryLeaf("dictionary-long-third", "very_long_third_dictionary_entry", "long_third_value"),
				},
			},
		},
		Lists: []aggregate.List{
			{ID: "list-four", Name: "List Four", ChildSectionIDs: []string{"list-four-child-1", "list-four-child-2", "list-four-child-3", "list-four-child-4"}},
			{ID: "list-inline", Name: "L", ChildSectionIDs: []string{"list-inline-child-1", "list-inline-child-2", "list-inline-child-3"}},
			{ID: "list-long", Name: "An Especially Long List Name", ChildSectionIDs: []string{"list-long-child-1", "list-long-child-2", "list-long-child-3"}},
		},
		TopLevelSectionIDs: []string{
			"callable-four", "callable-inline", "callable-long",
			"dictionary-four", "dictionary-inline", "dictionary-long",
			"list-four", "list-inline", "list-long",
		},
	}
}

func collectionAppParameter(id string, name string, expression string) aggregate.Parameter {
	return aggregate.Parameter{
		ID:                 id,
		Name:               name,
		NameEditable:       true,
		PassingStyle:       aggregate.PassingStylePositionalOrKeyword,
		AuthoredExpression: expression,
	}
}

func collectionDictionaryLeaf(id string, name string, expression string) aggregate.DictionaryEntry {
	return aggregate.DictionaryEntry{ID: id, Name: name, Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: expression}}
}

func assertCallableValue(t *testing.T, result Result, callableID string, want string) {
	t.Helper()
	sourceRange := result.SourceRangesByTargetID[callableID]
	callPosition := result.CallableCallPositionsByID[callableID]
	if got := result.Code[sourceRange.Start:callPosition.End]; got != want {
		t.Fatalf("callable %q = %q, want %q", callableID, got, want)
	}
}

func assertCompositionValue(t *testing.T, result Result, targetID string, want string) {
	t.Helper()
	byteRange, exists := result.CompositionRangesByTargetID[targetID]
	if !exists {
		t.Fatalf("composition range for %q is missing", targetID)
	}
	assertExactByteRange(t, result.Code, byteRange, want)
}

func assertExactByteRange(t *testing.T, code string, got ByteRange, want string) {
	t.Helper()
	start := strings.Index(code, want)
	wantRange := ByteRange{Start: start, End: start + len(want)}
	if start == -1 || got != wantRange || code[got.Start:got.End] != want {
		t.Fatalf("byte range = %#v, want exact UTF-8 range %#v for %q", got, wantRange, want)
	}
}
