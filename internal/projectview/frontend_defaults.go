package projectview

import (
	"encoding/json"
	"reflect"

	"setta/internal/projectstate"
)

const pythonSharedDefaultProjectPreviewImageColor = "bg-blue-500/60 dark:bg-blue-600/30"

func FrontendDefaultProjectConfig() ProjectConfig {
	defaults := ProjectConfig{
		RunCapabilities: ProjectRunCapabilities{},
	}
	initializeNilCollections(&defaults)
	return defaults
}

func FrontendDefaultProjectRunCapabilities() ProjectRunCapabilities {
	return ProjectRunCapabilities{}
}

func FrontendDefaultSectionCapabilities() SectionCapabilities {
	return SectionCapabilities{}
}

func FrontendDefaultSectionCodegenPolicy() SectionCodegenPolicy {
	return FrontendDefaultPythonSectionCodegenPolicy()
}

func FrontendDefaultCodeObjValuePolicy() CodeObjValuePolicy {
	return FrontendDefaultPythonCodeObjValuePolicy()
}

func PythonSharedDefaultProjectConfig() ProjectConfig {
	viewport := projectstate.FrontendDefaultViewport()
	defaults := ProjectConfig{
		AllowJSONSourceKeyEdits: true,
		PreviewImgColor:         pythonSharedDefaultProjectPreviewImageColor,
		Viewport:                &viewport,
		CodegenTargets: []ProjectCodegenTarget{
			ProjectCodegenTarget(mustMarshal(FrontendDefaultProjectCodegenPythonTarget())),
		},
	}
	initializeNilCollections(&defaults)
	return defaults
}

func frontendSectionTypeCodegenPolicyValue(
	policy projectstate.PythonSectionTypeCodegenPolicy,
) SectionTypeCodegenPolicy {
	return SectionTypeCodegenPolicy{
		Mode:           SectionCodegenMode(policy.Mode),
		Representation: SectionRepresentationMode(policy.Representation),
	}
}

func frontendSectionCodegenOverrideValue(
	override projectstate.PythonSectionCodegenOverride,
) SectionCodegenOverride {
	return SectionCodegenOverride{
		Mode:           SectionCodegenMode(override.Mode),
		Representation: SectionRepresentationMode(override.Representation),
	}
}

func frontendCodeObjTypeValuePolicyValue(
	policy projectstate.PythonCodeObjTypeValuePolicy,
) CodeObjTypeValuePolicy {
	return CodeObjTypeValuePolicy{
		Representation: CodeObjValueRepresentationMode(policy.Representation),
	}
}

func frontendCodeObjValueOverrideValue(
	override projectstate.PythonCodeObjValueOverride,
) CodeObjValueOverride {
	return CodeObjValueOverride{
		Representation: CodeObjValueRepresentationMode(override.Representation),
	}
}

func FrontendDefaultSectionTypeCodegenPolicy() SectionTypeCodegenPolicy {
	return frontendSectionTypeCodegenPolicyValue(
		projectstate.DefaultPythonSectionTypeCodegenPolicy(),
	)
}

func FrontendDefaultSectionCodegenOverride() SectionCodegenOverride {
	return frontendSectionCodegenOverrideValue(
		projectstate.DefaultPythonSectionCodegenOverride(),
	)
}

func FrontendDefaultCodeObjTypeValuePolicy() CodeObjTypeValuePolicy {
	return frontendCodeObjTypeValuePolicyValue(
		projectstate.DefaultPythonCodeObjTypeValuePolicy(),
	)
}

func FrontendDefaultCodeObjValueOverride() CodeObjValueOverride {
	return frontendCodeObjValueOverrideValue(
		projectstate.DefaultPythonCodeObjValueOverride(),
	)
}

func FrontendDefaultProjectCodegenPluginTarget() ProjectCodegenPluginTarget {
	defaults := ProjectCodegenPluginTarget{}
	initializeNilCollections(&defaults)
	return defaults
}

func FrontendDefaultSingleConfig() SingleConfig {
	defaults := SingleConfig{
		ProjectConfig:        FrontendDefaultProjectConfig(),
		ProjectChatWindowing: projectstate.DefaultProjectChatWindowingState(),
	}
	initializeNilCollections(&defaults)
	return defaults
}

func FrontendDefaultCore() Core {
	defaults := Core{
		SharedModifier: json.RawMessage("{}"),
	}
	initializeNilCollections(&defaults)
	return defaults
}

func FrontendDefaultVariant() Variant {
	defaults := Variant{
		Modifier: json.RawMessage("{}"),
	}
	initializeNilCollections(&defaults)
	return defaults
}

func FrontendDefaultSingletonSections() SingletonSections {
	return SingletonSections{}
}

func FrontendDefaultShownParamIDDetails() ShownParamIDDetails {
	defaults := ShownParamIDDetails{}
	initializeNilCollections(&defaults)
	return defaults
}

func FrontendDefaultShownParamIDs() ShownParamIDs {
	return ShownParamIDs{
		Pinned:   FrontendDefaultShownParamIDDetails(),
		Unpinned: FrontendDefaultShownParamIDDetails(),
	}
}

func initializeNilCollections(target any) {
	value := reflect.ValueOf(target)
	if !value.IsValid() || value.Kind() != reflect.Pointer || value.IsNil() {
		panic("initializeNilCollections requires a non-nil pointer")
	}
	initializeNilCollectionsValue(value.Elem())
}

func initializeNilCollectionsValue(value reflect.Value) {
	switch value.Kind() {
	case reflect.Interface, reflect.Pointer:
		if value.IsNil() {
			return
		}
		initializeNilCollectionsValue(value.Elem())
	case reflect.Struct:
		for fieldIndex := 0; fieldIndex < value.NumField(); fieldIndex++ {
			field := value.Field(fieldIndex)
			if !field.CanSet() {
				continue
			}
			initializeNilCollectionsValue(field)
		}
	case reflect.Map:
		if value.IsNil() {
			value.Set(reflect.MakeMap(value.Type()))
		}
	case reflect.Slice:
		if value.IsNil() {
			value.Set(reflect.MakeSlice(value.Type(), 0, 0))
		}
	}
}
