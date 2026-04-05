package frontendbindings

import (
	"reflect"
	"testing"
)

func TestGeneratedCodeObjTypeSetMembersFollowOwnerTraits(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		predicate func(reflect.Type) bool
		want      []string
	}{
		{
			name:      "base childless",
			predicate: generatedCodeObjImplIsChildless,
			want: []string{
				"CodeObjTypeEnum.CodeParam",
				"CodeObjTypeEnum.TextParam",
				"CodeObjTypeEnum.DateParam",
				"CodeObjTypeEnum.TimeParam",
				"CodeObjTypeEnum.SliderParam",
				"CodeObjTypeEnum.RotaryParam",
				"CodeObjTypeEnum.SwitchParam",
				"CodeObjTypeEnum.ColorPickerParam",
				"CodeObjTypeEnum.DropdownParam",
				"CodeObjTypeEnum.PasswordParam",
				"CodeObjTypeEnum.TextAreaParam",
				"CodeObjTypeEnum.DropzoneParam",
			},
		},
		{
			name:      "base param",
			predicate: generatedCodeObjImplIsParam,
			want: []string{
				"CodeObjTypeEnum.CodeParam",
				"CodeObjTypeEnum.TextParam",
				"CodeObjTypeEnum.DateParam",
				"CodeObjTypeEnum.TimeParam",
				"CodeObjTypeEnum.ButtonParam",
				"CodeObjTypeEnum.SliderParam",
				"CodeObjTypeEnum.RotaryParam",
				"CodeObjTypeEnum.SwitchParam",
				"CodeObjTypeEnum.ColorPickerParam",
				"CodeObjTypeEnum.DropdownParam",
				"CodeObjTypeEnum.PasswordParam",
				"CodeObjTypeEnum.TextAreaParam",
				"CodeObjTypeEnum.DropzoneParam",
				"CodeObjTypeEnum.NestedParam",
			},
		},
		{
			name:      "base parent",
			predicate: generatedCodeObjImplHasChildren,
			want: []string{
				"CodeObjTypeEnum.CodeCallable",
				"CodeObjTypeEnum.NestedParam",
			},
		},
		{
			name:      "control",
			predicate: generatedCodeObjImplIsControl,
			want: []string{
				"CodeObjTypeEnum.CodeParam",
				"CodeObjTypeEnum.TextParam",
				"CodeObjTypeEnum.DateParam",
				"CodeObjTypeEnum.TimeParam",
				"CodeObjTypeEnum.ButtonParam",
				"CodeObjTypeEnum.SliderParam",
				"CodeObjTypeEnum.RotaryParam",
				"CodeObjTypeEnum.SwitchParam",
				"CodeObjTypeEnum.ColorPickerParam",
				"CodeObjTypeEnum.DropdownParam",
				"CodeObjTypeEnum.PasswordParam",
				"CodeObjTypeEnum.TextAreaParam",
				"CodeObjTypeEnum.DropzoneParam",
			},
		},
		{
			name:      "section param",
			predicate: generatedCodeObjImplIsSectionParam,
			want: []string{
				"CodeObjTypeEnum.CodeParam",
				"CodeObjTypeEnum.TextParam",
				"CodeObjTypeEnum.DateParam",
				"CodeObjTypeEnum.TimeParam",
				"CodeObjTypeEnum.SliderParam",
				"CodeObjTypeEnum.RotaryParam",
				"CodeObjTypeEnum.SwitchParam",
				"CodeObjTypeEnum.ColorPickerParam",
				"CodeObjTypeEnum.DropdownParam",
				"CodeObjTypeEnum.PasswordParam",
				"CodeObjTypeEnum.TextAreaParam",
				"CodeObjTypeEnum.DropzoneParam",
				"CodeObjTypeEnum.NestedParam",
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := generatedCodeObjTypeSetMembers(tc.predicate)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("generatedCodeObjTypeSetMembers(%s) = %#v, want %#v", tc.name, got, tc.want)
			}
		})
	}
}

func TestGeneratedSectionTypeSetMembersFollowOwnerTraits(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		predicate func(reflect.Type) bool
		want      []string
	}{
		{
			name:      "base parent",
			predicate: generatedSectionImplHasChildren,
			want: []string{
				"SectionTypeEnum.ListRoot",
				"SectionTypeEnum.Group",
				"SectionTypeEnum.Code",
				"SectionTypeEnum.GenPythonCode",
				"SectionTypeEnum.GenPythonMetadata",
			},
		},
		{
			name:      "base dict",
			predicate: generatedSectionImplIsDictLike,
			want: []string{
				"SectionTypeEnum.Dict",
				"SectionTypeEnum.GlobalVariables",
			},
		},
		{
			name:      "with params",
			predicate: generatedSectionImplHasParams,
			want: []string{
				"SectionTypeEnum.Callable",
				"SectionTypeEnum.Dict",
				"SectionTypeEnum.GlobalVariables",
			},
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := generatedSectionTypeSetMembers(tc.predicate)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("generatedSectionTypeSetMembers(%s) = %#v, want %#v", tc.name, got, tc.want)
			}
		})
	}
}

func TestGeneratedUserDefaultSectionPropertiesFollowOwnerTags(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	properties, err := generatedUserDefaultSectionProperties(converter, "Callable")
	if err != nil {
		t.Fatalf("generatedUserDefaultSectionProperties(Callable) error = %v", err)
	}

	names := make(map[string]struct{}, len(properties))
	for _, property := range properties {
		names[property.Name] = struct{}{}
	}

	for _, name := range []string{
		"type",
		"id",
		"name",
		"isInOtherProjectConfigs",
		"aspectRatioExtraHeight",
		"aspectRatioExtraWidth",
		"isPreset",
		"codeObjVariantMap",
		"pinnedParams",
		"selectedParams",
		"ignoreTypeErrors",
		"callable",
	} {
		if _, ok := names[name]; ok {
			t.Fatalf("Callable user defaults unexpectedly included skipped property %q", name)
		}
	}

	for _, name := range []string{"configLanguage", "hideParams", "hideUnpinnedParams", "paramFilter"} {
		if _, ok := names[name]; !ok {
			t.Fatalf("Callable user defaults missing property %q", name)
		}
	}
}

func TestGeneratedUserDefaultCodeParamPropertiesFollowOwnerTags(t *testing.T) {
	t.Parallel()

	converter := newTypeConverter()
	properties, err := generatedUserDefaultCodeParamCodeObjProperties(converter)
	if err != nil {
		t.Fatalf("generatedUserDefaultCodeParamCodeObjProperties error = %v", err)
	}

	names := make(map[string]struct{}, len(properties))
	for _, property := range properties {
		names[property.Name] = struct{}{}
	}

	for _, name := range []string{"type", "id", "name", "description", "isPreset", "passingStyle"} {
		if _, ok := names[name]; ok {
			t.Fatalf("CodeParam user defaults unexpectedly included skipped property %q", name)
		}
	}

	for _, name := range []string{"coreNameType", "coreNameEditable", "typeAnnotation", "defaultVal", "value"} {
		if _, ok := names[name]; !ok {
			t.Fatalf("CodeParam user defaults missing property %q", name)
		}
	}
}
