package projectstate

import (
	"reflect"
	"testing"
)

func TestFrontendValueChangeParamImplUIConfigUsesCanonicalRuntimeAllowlists(t *testing.T) {
	config := FrontendValueChangeParamImplUIConfig()

	if got, want := config.AllParamCodeObjTypes, []FrontendCodeObjType{
		FrontendCodeObjTypeCodeParam,
		FrontendCodeObjTypeTextParam,
		FrontendCodeObjTypeDateParam,
		FrontendCodeObjTypeTimeParam,
		FrontendCodeObjTypeButtonParam,
		FrontendCodeObjTypeSliderParam,
		FrontendCodeObjTypeRotaryParam,
		FrontendCodeObjTypeSwitchParam,
		FrontendCodeObjTypeColorPickerParam,
		FrontendCodeObjTypeDropdownParam,
		FrontendCodeObjTypePasswordParam,
		FrontendCodeObjTypeTextAreaParam,
		FrontendCodeObjTypeDropzoneParam,
		FrontendCodeObjTypeNestedParam,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected all param code object types: %#v", got)
	}

	if got, want := config.ControlCodeObjTypes, []FrontendCodeObjType{
		FrontendCodeObjTypeCodeParam,
		FrontendCodeObjTypeTextParam,
		FrontendCodeObjTypeDateParam,
		FrontendCodeObjTypeTimeParam,
		FrontendCodeObjTypeButtonParam,
		FrontendCodeObjTypeSliderParam,
		FrontendCodeObjTypeRotaryParam,
		FrontendCodeObjTypeSwitchParam,
		FrontendCodeObjTypeColorPickerParam,
		FrontendCodeObjTypeDropdownParam,
		FrontendCodeObjTypePasswordParam,
		FrontendCodeObjTypeTextAreaParam,
		FrontendCodeObjTypeDropzoneParam,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected control code object types: %#v", got)
	}

	if got, want := config.SectionParamCodeObjTypes, []FrontendCodeObjType{
		FrontendCodeObjTypeCodeParam,
		FrontendCodeObjTypeTextParam,
		FrontendCodeObjTypeDateParam,
		FrontendCodeObjTypeTimeParam,
		FrontendCodeObjTypeSliderParam,
		FrontendCodeObjTypeRotaryParam,
		FrontendCodeObjTypeSwitchParam,
		FrontendCodeObjTypeColorPickerParam,
		FrontendCodeObjTypeDropdownParam,
		FrontendCodeObjTypePasswordParam,
		FrontendCodeObjTypeTextAreaParam,
		FrontendCodeObjTypeDropzoneParam,
		FrontendCodeObjTypeNestedParam,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected section param code object types: %#v", got)
	}
}
