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

func TestGeneratedSectionUnionMembersIncludeSyntheticAliasSections(t *testing.T) {
	t.Parallel()

	got := generatedContractUnionMembers(
		generatedSectionContractCategory,
		generatedSectionImplHasChildren,
	)
	want := []string{
		"ListRootSectionImpl",
		"GroupSectionImpl",
		"CodeSectionImpl",
		"GenPythonCodeSectionImpl",
		"GenPythonMetadataSectionImpl",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("generatedContractUnionMembers(section parent) = %#v, want %#v", got, want)
	}
}
