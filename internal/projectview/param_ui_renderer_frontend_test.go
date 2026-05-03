package projectview

import (
	"reflect"
	"testing"

	"setta/internal/projectstate"
)

func TestFrontendValueParamUIRendererConfigUsesGoOwnedParamMetadata(t *testing.T) {
	config := FrontendValueParamUIRendererConfig()

	if got, want := config.TextLikeParamTypes, []projectstate.FrontendCodeObjType{
		projectstate.FrontendCodeObjTypeCodeParam,
		projectstate.FrontendCodeObjTypeTextParam,
		projectstate.FrontendCodeObjTypeTextAreaParam,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected text-like param types: %#v", got)
	}

	if got, want := config.DateTimeParamTypes, []projectstate.FrontendCodeObjType{
		projectstate.FrontendCodeObjTypeDateParam,
		projectstate.FrontendCodeObjTypeTimeParam,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected date/time param types: %#v", got)
	}

	if got, want := config.RendererTypes, []projectstate.FrontendCodeObjType{
		projectstate.FrontendCodeObjTypeCodeParam,
		projectstate.FrontendCodeObjTypeTextParam,
		projectstate.FrontendCodeObjTypeTextAreaParam,
		projectstate.FrontendCodeObjTypeDateParam,
		projectstate.FrontendCodeObjTypeTimeParam,
		projectstate.FrontendCodeObjTypeSliderParam,
		projectstate.FrontendCodeObjTypeRotaryParam,
		projectstate.FrontendCodeObjTypeSwitchParam,
		projectstate.FrontendCodeObjTypeColorPickerParam,
		projectstate.FrontendCodeObjTypeDropdownParam,
		projectstate.FrontendCodeObjTypePasswordParam,
		projectstate.FrontendCodeObjTypeDropzoneParam,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected renderer types: %#v", got)
	}

	expectedFamilies := map[string]ParamUIRendererFamily{
		"CodeParam":        ParamUIRendererFamilyTextLike,
		"TextParam":        ParamUIRendererFamilyTextLike,
		"TextAreaParam":    ParamUIRendererFamilyTextLike,
		"DateParam":        ParamUIRendererFamilyDateTime,
		"TimeParam":        ParamUIRendererFamilyDateTime,
		"SliderParam":      ParamUIRendererFamilySlider,
		"RotaryParam":      ParamUIRendererFamilyRotary,
		"SwitchParam":      ParamUIRendererFamilySwitch,
		"ColorPickerParam": ParamUIRendererFamilyColorPicker,
		"DropdownParam":    ParamUIRendererFamilyDropdown,
		"PasswordParam":    ParamUIRendererFamilyPassword,
		"DropzoneParam":    ParamUIRendererFamilyDropzone,
	}
	if got := config.RendererFamiliesByType; !reflect.DeepEqual(got, expectedFamilies) {
		t.Fatalf("unexpected renderer families by type: %#v", got)
	}

	expectedSpecializedFamilies := map[string]ParamUIRendererFamily{
		"SliderParam":      ParamUIRendererFamilySlider,
		"RotaryParam":      ParamUIRendererFamilyRotary,
		"SwitchParam":      ParamUIRendererFamilySwitch,
		"ColorPickerParam": ParamUIRendererFamilyColorPicker,
		"DropdownParam":    ParamUIRendererFamilyDropdown,
		"PasswordParam":    ParamUIRendererFamilyPassword,
		"DropzoneParam":    ParamUIRendererFamilyDropzone,
	}
	if got := config.SpecializedRendererFamilies; !reflect.DeepEqual(got, expectedSpecializedFamilies) {
		t.Fatalf("unexpected specialized renderer families: %#v", got)
	}
}

func TestFrontendValueParamUIRendererConfigClonesMutableCollections(t *testing.T) {
	config := FrontendValueParamUIRendererConfig()
	config.TextLikeParamTypes[0] = projectstate.FrontendCodeObjTypeNestedParam
	config.RendererFamiliesByType["CodeParam"] = ParamUIRendererFamilyDropzone
	config.SpecializedRendererFamilies["SliderParam"] = ParamUIRendererFamilyTextLike

	next := FrontendValueParamUIRendererConfig()
	if got := next.TextLikeParamTypes[0]; got != projectstate.FrontendCodeObjTypeCodeParam {
		t.Fatalf("expected cloned text-like param types, got %q", got)
	}
	if got := next.RendererFamiliesByType["CodeParam"]; got != ParamUIRendererFamilyTextLike {
		t.Fatalf("expected cloned renderer families by type, got %q", got)
	}
	if got := next.SpecializedRendererFamilies["SliderParam"]; got != ParamUIRendererFamilySlider {
		t.Fatalf("expected cloned specialized renderer families, got %q", got)
	}
}
