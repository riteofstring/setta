package contracts

import (
	"errors"
	"testing"
)

func TestProjectClipboardPayloadV1ValidatesClosedCloneableForest(t *testing.T) {
	payload := projectClipboardPayloadForTest()
	if err := payload.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}

	response := CopyProjectClipboardResponseV2{Payload: payload}
	if err := response.Validate(); err != nil {
		t.Fatalf("CopyProjectClipboardResponseV2.Validate() error = %v", err)
	}
}

func TestProjectClipboardPayloadV1RejectsMalformedForestAndUnsupportedVersion(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*ProjectClipboardPayloadV1)
	}{
		{
			name: "unsupported version",
			change: func(payload *ProjectClipboardPayloadV1) {
				payload.Version++
			},
		},
		{
			name: "duplicate root placement",
			change: func(payload *ProjectClipboardPayloadV1) {
				payload.RootSectionIDs = []string{"list:objects", "callable:child"}
			},
		},
		{
			name: "missing descendant",
			change: func(payload *ProjectClipboardPayloadV1) {
				payload.Lists[0].ChildSectionIDs = []string{"callable:missing"}
			},
		},
		{
			name: "duplicate target id",
			change: func(payload *ProjectClipboardPayloadV1) {
				payload.ParameterDictionaries[0].Entries[0].ID = "callable:child"
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			payload := projectClipboardPayloadForTest()
			test.change(&payload)
			var validationError ValidationError
			if !errors.As(payload.Validate(), &validationError) {
				t.Fatalf("Validate() accepted malformed clipboard payload %#v", payload)
			}
		})
	}
}

func TestProjectClipboardRequestsRequireRevisionAndCanonicalRoots(t *testing.T) {
	payload := projectClipboardPayloadForTest()
	for _, request := range []interface{ Validate() error }{
		CopyProjectClipboardRequestV2{ProjectID: "project:clipboard", RootSectionIDs: []string{"list:objects"}},
		CopyProjectClipboardRequestV2{ProjectID: "project:clipboard", ObservedRevision: 1, RootSectionIDs: []string{"list:objects", "list:objects"}},
		PasteProjectClipboardRequestV2{ProjectID: "project:clipboard", ExpectedRevision: 1, Payload: ProjectClipboardPayloadV1{}},
		PasteProjectClipboardRequestV2{ProjectID: "project:clipboard", Payload: payload},
	} {
		if err := request.Validate(); err == nil {
			t.Fatalf("Validate() accepted malformed clipboard request %#v", request)
		}
	}
}

func projectClipboardPayloadForTest() ProjectClipboardPayloadV1 {
	expression := "state.Objects__0"
	return ProjectClipboardPayloadV1{
		Version:        ProjectClipboardPayloadVersionV1,
		RootSectionIDs: []string{"list:objects"},
		Callables: []CallableV2{{
			ID:                 "callable:child",
			Name:               "Child",
			AuthoredExpression: "fixture.child",
			Parameters: []ParameterV2{{
				ID:                 "parameter:child:value",
				Name:               "value",
				NameEditable:       true,
				PassingStyle:       ParameterPassingStylePositionalOrKeywordV2,
				AuthoredExpression: expression,
				UI:                 codeParameterUIForTest(),
			}},
		}},
		ParameterDictionaries: []ParameterDictionaryV2{{
			ID:   "dictionary:options",
			Name: "Options",
			Entries: []DictionaryEntryV2{{
				Kind:               DictionaryEntryKindLeafV2,
				ID:                 "entry:options:scale",
				Name:               "scale",
				UI:                 codeParameterUIForTest(),
				AuthoredExpression: stringPointerForTest("2"),
			}},
		}},
		Lists: []ListV2{{
			ID:              "list:objects",
			Name:            "Objects",
			ChildSectionIDs: []string{"callable:child", "dictionary:options"},
		}},
	}
}
