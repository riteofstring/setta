package agentruns

import (
	"reflect"
	"testing"
)

func TestFrontendDefaultsMaterializeGeneratorValues(t *testing.T) {
	if got := FrontendDefaultEngineRuntimeSupport(); !reflect.DeepEqual(got, EngineRuntimeSupport{}) {
		t.Fatalf("expected empty runtime support defaults, got %#v", got)
	}

	event := FrontendDefaultRunEvent()
	if event.ID != "" || !event.Timestamp.IsZero() || event.Type != "" {
		t.Fatalf("unexpected run event defaults: %#v", event)
	}
	if event.Payload == nil {
		t.Fatal("expected run event payload map to be initialized")
	}
}

func TestFrontendBindingTagsLiveOnOwnerTypes(t *testing.T) {
	type tagExpectation struct {
		typ      reflect.Type
		field    string
		tagName  string
		tagValue string
	}

	expectations := []tagExpectation{
		{typ: reflect.TypeOf(RunEvent{}), field: "Timestamp", tagName: "ts_create_expr", tagValue: "\"\""},
		{typ: reflect.TypeOf(Run{}), field: "Inputs", tagName: "ts_type", tagValue: "Record<string, unknown> | null"},
		{typ: reflect.TypeOf(Run{}), field: "Outputs", tagName: "ts_type", tagValue: "Record<string, unknown> | null"},
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
