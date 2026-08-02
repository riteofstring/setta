package settingsstate

import (
	"reflect"
	"testing"
)

func TestFrontendBindingTagsLiveOnOwnerTypes(t *testing.T) {
	type tagExpectation struct {
		typ      reflect.Type
		field    string
		tagName  string
		tagValue string
	}

	expectations := []tagExpectation{
		{typ: reflect.TypeOf(FrontendSettingsGUI{}), field: "SnapGrid", tagName: "ts_type", tagValue: "[number, number]"},
		{typ: reflect.TypeOf(FrontendSettingsGUI{}), field: "SectionTagColorChoices", tagName: "ts_type", tagValue: "Array<ColorPickerChoice>"},
		{typ: reflect.TypeOf(FrontendSettingsBackend{}), field: "DefaultTerminalShell", tagName: "ts_create_expr", tagValue: "null"},
	}

	for _, expectation := range expectations {
		field, ok := expectation.typ.FieldByName(expectation.field)
		if !ok {
			t.Fatalf("%s.%s field not found", expectation.typ.Name(), expectation.field)
		}
		if got := field.Tag.Get(expectation.tagName); got != expectation.tagValue {
			t.Fatalf(
				"%s.%s tag %q = %q, want %q",
				expectation.typ.Name(),
				expectation.field,
				expectation.tagName,
				got,
				expectation.tagValue,
			)
		}
	}
}
