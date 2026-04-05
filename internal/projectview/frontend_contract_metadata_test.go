package projectview

import (
	"reflect"
	"testing"
)

func TestFrontendCapabilityDefaultProvidersReturnZeroValueStructs(t *testing.T) {
	if got := FrontendDefaultProjectRunCapabilities(); !reflect.DeepEqual(got, ProjectRunCapabilities{}) {
		t.Fatalf("expected zero-value project run capabilities, got %#v", got)
	}
	if got := FrontendDefaultSectionCapabilities(); !reflect.DeepEqual(got, SectionCapabilities{}) {
		t.Fatalf("expected zero-value section capabilities, got %#v", got)
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
		{typ: reflect.TypeOf(ProjectRunCapabilities{}), field: "MainRunDisabledReason", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(ProjectRunCapabilities{}), field: "EffectiveEntrySectionID", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(SectionCapabilities{}), field: "RunDisabledReason", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(SectionCapabilities{}), field: "RunRequestSectionID", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(SectionCapabilities{}), field: "EntryCodeBlockValue", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(ProjectConfig{}), field: "CodegenTargets", tagName: "ts_type", tagValue: "Array<ProjectCodegenTarget>"},
		{typ: reflect.TypeOf(SingleConfig{}), field: "SectionImpls", tagName: "ts_type", tagValue: "Record<string, BaseSectionImplUnion>"},
		{typ: reflect.TypeOf(SingleConfig{}), field: "CodeObjImpls", tagName: "ts_type", tagValue: "Record<string, BaseCodeObjImplUnion>"},
		{typ: reflect.TypeOf(Core{}), field: "SharedModifier", tagName: "ts_type", tagValue: "Record<string, unknown>"},
		{typ: reflect.TypeOf(Variant{}), field: "Modifier", tagName: "ts_type", tagValue: "Record<string, unknown>"},
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
