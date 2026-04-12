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
	if got := FrontendDefaultSectionCodegenPolicy(); !reflect.DeepEqual(got, FrontendDefaultPythonSectionCodegenPolicy()) {
		t.Fatalf("expected exact section codegen provider to match python defaults, got %#v", got)
	}
	if got := FrontendDefaultCodeObjValuePolicy(); !reflect.DeepEqual(got, FrontendDefaultPythonCodeObjValuePolicy()) {
		t.Fatalf("expected exact codeobj value provider to match python defaults, got %#v", got)
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
		{typ: reflect.TypeOf(SingleConfig{}), field: "SectionImpls", tagName: "ts_type", tagValue: "Record<string, BaseSectionImplUnion>"},
		{typ: reflect.TypeOf(SingleConfig{}), field: "CodeObjImpls", tagName: "ts_type", tagValue: "Record<string, BaseCodeObjImplUnion>"},
		{typ: reflect.TypeOf(Core{}), field: "SharedModifier", tagName: "ts_type", tagValue: "Record<string, unknown>"},
		{typ: reflect.TypeOf(Variant{}), field: "Modifier", tagName: "ts_type", tagValue: "Record<string, unknown>"},
		{typ: reflect.TypeOf(SectionCodegenPolicy{}), field: "Allowlist", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(SectionCodegenPolicy{}), field: "MetaControlAllowlist", tagName: "ts_optional", tagValue: "true"},
		{typ: reflect.TypeOf(SectionCodegenPolicy{}), field: "TypePolicies", tagName: "ts_type", tagValue: "Record<SectionType, SectionTypeCodegenPolicy>"},
		{typ: reflect.TypeOf(SectionCodegenPolicy{}), field: "TypePolicies", tagName: "ts_create_map_values", tagValue: "true"},
		{typ: reflect.TypeOf(SectionCodegenPolicy{}), field: "SectionOverrides", tagName: "ts_type", tagValue: "Record<string, SectionCodegenOverride>"},
		{typ: reflect.TypeOf(SectionCodegenPolicy{}), field: "SectionOverrides", tagName: "ts_create_map_values", tagValue: "true"},
		{typ: reflect.TypeOf(CodeObjValuePolicy{}), field: "TypePolicies", tagName: "ts_type", tagValue: "Record<CodeObjType, CodeObjTypeValuePolicy>"},
		{typ: reflect.TypeOf(CodeObjValuePolicy{}), field: "TypePolicies", tagName: "ts_create_map_values", tagValue: "true"},
		{typ: reflect.TypeOf(CodeObjValuePolicy{}), field: "CodeObjOverrides", tagName: "ts_type", tagValue: "Record<string, CodeObjValueOverride>"},
		{typ: reflect.TypeOf(CodeObjValuePolicy{}), field: "CodeObjOverrides", tagName: "ts_create_map_values", tagValue: "true"},
		{typ: reflect.TypeOf(ProjectCodegenPythonTarget{}), field: "Language", tagName: "ts_type", tagValue: "typeof ProjectCodegenLanguageEnum.python"},
		{typ: reflect.TypeOf(PythonCodegenPolicyUIConfigValue{}), field: "SectionRepresentationOptionsByType", tagName: "ts_type", tagValue: "Record<SectionType, SectionRepresentationMode[]>"},
		{typ: reflect.TypeOf(PythonCodegenPolicyUIConfigValue{}), field: "CodeObjRepresentationOptionsByType", tagName: "ts_type", tagValue: "Record<CodeObjType, CodeObjValueRepresentationMode[]>"},
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
