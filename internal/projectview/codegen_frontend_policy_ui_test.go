package projectview

import (
	"reflect"
	"testing"

	"setta/internal/projectstate"
)

func TestFrontendValuePythonCodegenPolicyUIConfigUsesCanonicalPolicyMetadata(t *testing.T) {
	config := FrontendValuePythonCodegenPolicyUIConfig()

	if got, want := config.SectionModeOptions, []SectionCodegenMode{
		SectionCodegenModeInherit,
		SectionCodegenModeInclude,
		SectionCodegenModeExclude,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected section mode options: %#v", got)
	}

	if got, want := config.SectionTypes, []projectstate.FrontendSectionType{
		projectstate.FrontendSectionTypeCallable,
		projectstate.FrontendSectionTypeDict,
		projectstate.FrontendSectionTypeListRoot,
		projectstate.FrontendSectionTypeGroup,
		projectstate.FrontendSectionTypeGlobalVariables,
		projectstate.FrontendSectionTypeTextBlock,
		projectstate.FrontendSectionTypeDraw,
		projectstate.FrontendSectionTypeImage,
		projectstate.FrontendSectionTypeMetaControl,
		projectstate.FrontendSectionTypeChat,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected visible section types: %#v", got)
	}

	if got, want := config.MetaControlCodeObjTypes, []PythonCodegenPolicyCodeObjOption{
		{Type: projectstate.FrontendCodeObjTypeDropdownParam, Label: "Dropdown"},
		{Type: projectstate.FrontendCodeObjTypeSliderParam, Label: "Slider"},
		{Type: projectstate.FrontendCodeObjTypeRotaryParam, Label: "Rotary"},
		{Type: projectstate.FrontendCodeObjTypeSwitchParam, Label: "Switch"},
		{Type: projectstate.FrontendCodeObjTypeTextParam, Label: "Text Input"},
		{Type: projectstate.FrontendCodeObjTypeDateParam, Label: "Date Input"},
		{Type: projectstate.FrontendCodeObjTypeTimeParam, Label: "Time Input"},
		{Type: projectstate.FrontendCodeObjTypeTextAreaParam, Label: "Text Area"},
		{Type: projectstate.FrontendCodeObjTypeCodeParam, Label: "Code Input"},
		{Type: projectstate.FrontendCodeObjTypePasswordParam, Label: "Password Field"},
		{Type: projectstate.FrontendCodeObjTypeColorPickerParam, Label: "Color Picker"},
		{Type: projectstate.FrontendCodeObjTypeButtonParam, Label: "Button"},
		{Type: projectstate.FrontendCodeObjTypeDropzoneParam, Label: "Dropzone"},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected visible meta control code object types: %#v", got)
	}

	if got, want := config.CodeObjTypes, []projectstate.FrontendCodeObjType{
		projectstate.FrontendCodeObjTypeCodeParam,
		projectstate.FrontendCodeObjTypeTextParam,
		projectstate.FrontendCodeObjTypeDateParam,
		projectstate.FrontendCodeObjTypeTimeParam,
		projectstate.FrontendCodeObjTypeButtonParam,
		projectstate.FrontendCodeObjTypeSliderParam,
		projectstate.FrontendCodeObjTypeRotaryParam,
		projectstate.FrontendCodeObjTypeSwitchParam,
		projectstate.FrontendCodeObjTypeColorPickerParam,
		projectstate.FrontendCodeObjTypeDropdownParam,
		projectstate.FrontendCodeObjTypePasswordParam,
		projectstate.FrontendCodeObjTypeTextAreaParam,
		projectstate.FrontendCodeObjTypeDropzoneParam,
		projectstate.FrontendCodeObjTypeNestedParam,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected visible code object types: %#v", got)
	}

	if got, want := config.DefaultSectionRepresentationOptions, []SectionRepresentationMode{
		SectionRepresentationModeExpression,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected default section representation options: %#v", got)
	}

	if got, want := config.DefaultCodeObjRepresentationOptions, []CodeObjValueRepresentationMode{
		CodeObjValueRepresentationModeExpression,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected default code object representation options: %#v", got)
	}

	if got, want := config.SectionRepresentationOptionsByType["Chat"], []SectionRepresentationMode{
		SectionRepresentationModeExpression,
		SectionRepresentationModeFilePath,
		SectionRepresentationModeFileRead,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected chat representation options: %#v", got)
	}

	if got, want := config.SectionRepresentationOptionsByType["Draw"], []SectionRepresentationMode{
		SectionRepresentationModeFilePath,
		SectionRepresentationModeFileRead,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected draw representation options: %#v", got)
	}

	if got, want := config.SectionRepresentationOptionsByType["Chart"], []SectionRepresentationMode{
		SectionRepresentationModeExpression,
		SectionRepresentationModeFilePath,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected chart representation options: %#v", got)
	}

	if got, want := config.CodeObjRepresentationOptionsByType["SliderParam"], []CodeObjValueRepresentationMode{
		CodeObjValueRepresentationModeExpression,
		CodeObjValueRepresentationModeJSONParsed,
		CodeObjValueRepresentationModeString,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected slider representation options: %#v", got)
	}

	if got, want := config.CodeObjRepresentationOptionsByType["DropzoneParam"], []CodeObjValueRepresentationMode{
		CodeObjValueRepresentationModeFilePath,
		CodeObjValueRepresentationModeFileRead,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected dropzone representation options: %#v", got)
	}

	if got, want := config.CodeObjRepresentationOptionsByType["ButtonParam"], []CodeObjValueRepresentationMode{
		CodeObjValueRepresentationModeExpression,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected button representation options: %#v", got)
	}
}
