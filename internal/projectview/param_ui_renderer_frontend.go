package projectview

import "setta/internal/projectstate"

// Keep param renderer-family metadata Go-owned so retained/canvas param
// renderers do not hand-maintain CodeObjType-to-renderer tables.
var (
	frontendParamUITextLikeTypes = []projectstate.FrontendCodeObjType{
		projectstate.FrontendCodeObjTypeCodeParam,
		projectstate.FrontendCodeObjTypeTextParam,
		projectstate.FrontendCodeObjTypeTextAreaParam,
	}
	frontendParamUIDateTimeTypes = []projectstate.FrontendCodeObjType{
		projectstate.FrontendCodeObjTypeDateParam,
		projectstate.FrontendCodeObjTypeTimeParam,
	}
	frontendSpecializedParamUIRendererFamilies = map[string]ParamUIRendererFamily{
		string(projectstate.FrontendCodeObjTypeSliderParam):      ParamUIRendererFamilySlider,
		string(projectstate.FrontendCodeObjTypeRotaryParam):      ParamUIRendererFamilyRotary,
		string(projectstate.FrontendCodeObjTypeSwitchParam):      ParamUIRendererFamilySwitch,
		string(projectstate.FrontendCodeObjTypeColorPickerParam): ParamUIRendererFamilyColorPicker,
		string(projectstate.FrontendCodeObjTypeDropdownParam):    ParamUIRendererFamilyDropdown,
		string(projectstate.FrontendCodeObjTypePasswordParam):    ParamUIRendererFamilyPassword,
		string(projectstate.FrontendCodeObjTypeDropzoneParam):    ParamUIRendererFamilyDropzone,
	}
)

type ParamUIRendererFamily string

const (
	ParamUIRendererFamilyTextLike    ParamUIRendererFamily = "text-like"
	ParamUIRendererFamilyDateTime    ParamUIRendererFamily = "date-time"
	ParamUIRendererFamilySlider      ParamUIRendererFamily = "slider"
	ParamUIRendererFamilyRotary      ParamUIRendererFamily = "rotary"
	ParamUIRendererFamilySwitch      ParamUIRendererFamily = "switch"
	ParamUIRendererFamilyColorPicker ParamUIRendererFamily = "color-picker"
	ParamUIRendererFamilyDropdown    ParamUIRendererFamily = "dropdown"
	ParamUIRendererFamilyPassword    ParamUIRendererFamily = "password"
	ParamUIRendererFamilyDropzone    ParamUIRendererFamily = "dropzone"
)

type ParamUIRendererConfigValue struct {
	TextLikeParamTypes          []projectstate.FrontendCodeObjType `json:"textLikeParamTypes"`
	DateTimeParamTypes          []projectstate.FrontendCodeObjType `json:"dateTimeParamTypes"`
	RendererTypes               []projectstate.FrontendCodeObjType `json:"rendererTypes"`
	RendererFamiliesByType      map[string]ParamUIRendererFamily   `json:"rendererFamiliesByType" ts_type:"Partial<Record<CodeObjType, ParamUIRendererFamily>>"`
	SpecializedRendererFamilies map[string]ParamUIRendererFamily   `json:"specializedRendererFamilies" ts_type:"Partial<Record<CodeObjType, ParamUIRendererFamily>>"`
}

func FrontendValueParamUIRendererConfig() ParamUIRendererConfigValue {
	return ParamUIRendererConfigValue{
		TextLikeParamTypes:          append([]projectstate.FrontendCodeObjType(nil), frontendParamUITextLikeTypes...),
		DateTimeParamTypes:          append([]projectstate.FrontendCodeObjType(nil), frontendParamUIDateTimeTypes...),
		RendererTypes:               frontendParamUIRendererTypes(),
		RendererFamiliesByType:      frontendParamUIRendererFamiliesByType(),
		SpecializedRendererFamilies: cloneParamUIRendererFamilyMap(frontendSpecializedParamUIRendererFamilies),
	}
}

func frontendParamUIRendererTypes() []projectstate.FrontendCodeObjType {
	types := make([]projectstate.FrontendCodeObjType, 0, len(frontendParamUITextLikeTypes)+len(frontendParamUIDateTimeTypes)+len(frontendSpecializedParamUIRendererFamilies))
	types = append(types, frontendParamUITextLikeTypes...)
	types = append(types, frontendParamUIDateTimeTypes...)
	types = append(types,
		projectstate.FrontendCodeObjTypeSliderParam,
		projectstate.FrontendCodeObjTypeRotaryParam,
		projectstate.FrontendCodeObjTypeSwitchParam,
		projectstate.FrontendCodeObjTypeColorPickerParam,
		projectstate.FrontendCodeObjTypeDropdownParam,
		projectstate.FrontendCodeObjTypePasswordParam,
		projectstate.FrontendCodeObjTypeDropzoneParam,
	)
	return types
}

func frontendParamUIRendererFamiliesByType() map[string]ParamUIRendererFamily {
	families := cloneParamUIRendererFamilyMap(frontendSpecializedParamUIRendererFamilies)
	for _, codeObjType := range frontendParamUITextLikeTypes {
		families[string(codeObjType)] = ParamUIRendererFamilyTextLike
	}
	for _, codeObjType := range frontendParamUIDateTimeTypes {
		families[string(codeObjType)] = ParamUIRendererFamilyDateTime
	}
	return families
}

func cloneParamUIRendererFamilyMap(input map[string]ParamUIRendererFamily) map[string]ParamUIRendererFamily {
	output := make(map[string]ParamUIRendererFamily, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}
