package frontendbindings

import (
	"reflect"

	"setta/internal/projectstate"
)

type generatedContractCategorySpec struct {
	BaseType               reflect.Type
	EnumType               reflect.Type
	DeclarationNameForEnum func(string) (string, bool)
	ResolvedTypeForEnum    func(string) (reflect.Type, bool)
	EnumValueExpr          func(string) string
}

type generatedContractTraitSpec struct {
	UnionName   string
	LocalUnion  bool
	IncludeBase bool
	Predicate   func(reflect.Type) bool
	SetName     string
	SetExported bool
	GuardName   string
	GuardInput  string
}

var frontendBaseValueParamCodeObjImplType = reflect.TypeOf(projectstate.FrontendBaseValueParamCodeObjImpl{})
var frontendParamCodeObjFieldsType = reflect.TypeOf(projectstate.FrontendParamCodeObjFields{})

var generatedSectionContractCategory = generatedContractCategorySpec{
	BaseType:               reflect.TypeOf(projectstate.FrontendBaseSectionImpl{}),
	EnumType:               reflect.TypeOf(projectstate.FrontendSectionType("")),
	DeclarationNameForEnum: generatedSectionImplDeclarationNameForSectionName,
	ResolvedTypeForEnum:    generatedSectionResolvedImplTypeForSectionName,
	EnumValueExpr:          generatedSectionImplTypeExpr,
}

var generatedCodeObjContractCategory = generatedContractCategorySpec{
	BaseType:               reflect.TypeOf(projectstate.FrontendBaseCodeObjImpl{}),
	EnumType:               reflect.TypeOf(projectstate.FrontendCodeObjType("")),
	DeclarationNameForEnum: generatedCodeObjImplDeclarationNameForCodeObjName,
	ResolvedTypeForEnum:    generatedCodeObjImplTypeForCodeObjName,
	EnumValueExpr: func(codeObjName string) string {
		return "CodeObjTypeEnum." + codeObjName
	},
}

func generatedContractDeclarations() []TypeDeclaration {
	declarations := generatedSectionContractDeclarations()
	declarations = append(declarations, generatedCodeObjContractDeclarations()...)
	return declarations
}

func generatedSectionContractDeclarations() []TypeDeclaration {
	declarations := generatedContractCategoryDeclarations(
		generatedSectionContractCategory,
		generatedSectionContractTraitSpecs(),
	)
	return declarations
}

func generatedCodeObjContractDeclarations() []TypeDeclaration {
	declarations := generatedContractCategoryDeclarations(
		generatedCodeObjContractCategory,
		generatedCodeObjContractTraitSpecs(),
	)
	return declarations
}

func generatedSectionContractTraitSpecs() []generatedContractTraitSpec {
	return []generatedContractTraitSpec{
		{
			UnionName:   "BaseParentSectionImplUnion",
			LocalUnion:  true,
			IncludeBase: false,
			Predicate:   generatedSectionImplHasChildren,
			SetName:     "BaseParentSectionImplTypeSet",
			GuardName:   "isBaseParentSectionImpl",
			GuardInput:  "BaseSectionImplUnion",
		},
		{
			UnionName:   "BaseDictSectionImplUnion",
			IncludeBase: false,
			Predicate:   generatedSectionImplIsDictLike,
			SetName:     "BaseDictSectionImplTypeSet",
			GuardName:   "isBaseDictSectionImpl",
			GuardInput:  "BaseSectionImplUnion",
		},
		{
			UnionName:   "BaseSectionWithParamsImplUnion",
			LocalUnion:  true,
			IncludeBase: false,
			Predicate:   generatedSectionImplHasParams,
			SetName:     "BaseSectionWithParamsImplTypeSet",
			GuardName:   "isBaseSectionWithParamsImpl",
			GuardInput:  "BaseSectionImplUnion",
		},
	}
}

func generatedCodeObjContractTraitSpecs() []generatedContractTraitSpec {
	return []generatedContractTraitSpec{
		{
			UnionName:   "BaseChildlessCodeObjImplUnion",
			IncludeBase: true,
			Predicate:   generatedCodeObjImplIsChildless,
			SetName:     "BaseChildlessCodeObjImplTypeSet",
			GuardName:   "isBaseChildlessCodeObjImpl",
			GuardInput:  "BaseCodeObjImplUnion",
		},
		{
			UnionName:   "BaseParamCodeObjImplUnion",
			LocalUnion:  true,
			IncludeBase: true,
			Predicate:   generatedCodeObjImplIsParam,
			SetName:     "BaseParamCodeObjImplTypeSet",
			SetExported: true,
			GuardName:   "isBaseParamCodeObjImpl",
			GuardInput:  "BaseCodeObjImplUnion",
		},
		{
			UnionName:   "BaseParentCodeObjImplUnion",
			LocalUnion:  true,
			IncludeBase: false,
			Predicate:   generatedCodeObjImplHasChildren,
			SetName:     "BaseParentCodeObjImplTypeSet",
			GuardName:   "isBaseParentCodeObjImpl",
			GuardInput:  "BaseCodeObjImplUnion",
		},
		{
			SetName:     "ControlCodeObjTypeSet",
			SetExported: true,
			Predicate:   generatedCodeObjImplIsControl,
		},
		{
			SetName:     "SectionParamCodeObjTypeSet",
			SetExported: true,
			Predicate:   generatedCodeObjImplIsSectionParam,
		},
	}
}

func generatedContractCategoryDeclarations(
	category generatedContractCategorySpec,
	traits []generatedContractTraitSpec,
) []TypeDeclaration {
	declarations := []TypeDeclaration{
		generatedContractUnionDeclaration(
			category,
			generatedContractBaseUnionName(category),
			false,
			true,
			nil,
		),
	}
	for _, trait := range traits {
		if trait.UnionName != "" {
			declarations = append(
				declarations,
				generatedContractUnionDeclaration(
					category,
					trait.UnionName,
					trait.LocalUnion,
					trait.IncludeBase,
					trait.Predicate,
				),
			)
		}
		if trait.SetName != "" {
			declarations = append(
				declarations,
				generatedContractTypeSetDeclaration(
					category,
					trait.SetName,
					trait.SetExported,
					trait.Predicate,
				),
			)
		}
		if trait.GuardName != "" {
			declarations = append(
				declarations,
				typeGuardDeclaration(
					trait.GuardName,
					trait.GuardInput,
					trait.UnionName,
					trait.SetName,
				),
			)
		}
	}
	return declarations
}

func generatedContractBaseUnionName(category generatedContractCategorySpec) string {
	return frontendBindingTypeName(category.BaseType) + "Union"
}

func generatedContractUnionDeclaration(
	category generatedContractCategorySpec,
	name string,
	local bool,
	includeBase bool,
	predicate func(reflect.Type) bool,
) TypeDeclaration {
	members := []string{}
	if includeBase {
		members = append(members, frontendBindingTypeName(category.BaseType))
	}
	members = append(members, generatedContractUnionMembers(category, predicate)...)
	if local {
		return localUnionDeclaration(name, members...)
	}
	return aliasUnionDeclaration(name, members...)
}

func generatedContractUnionMembers(
	category generatedContractCategorySpec,
	predicate func(reflect.Type) bool,
) []string {
	members := []string{}
	for _, enumName := range mustGeneratedEnumValues(category.EnumType) {
		t, ok := category.ResolvedTypeForEnum(enumName)
		if !ok {
			continue
		}
		if predicate != nil && !predicate(t) {
			continue
		}
		memberName, ok := category.DeclarationNameForEnum(enumName)
		if !ok {
			continue
		}
		members = append(members, memberName)
	}
	return members
}

func generatedContractTypeSetDeclaration(
	category generatedContractCategorySpec,
	name string,
	exported bool,
	predicate func(reflect.Type) bool,
) TypeDeclaration {
	return setDeclaration(
		name,
		frontendBindingTypeName(category.EnumType),
		exported,
		generatedContractTypeSetMembers(category, predicate)...,
	)
}

func generatedContractTypeSetMembers(
	category generatedContractCategorySpec,
	predicate func(reflect.Type) bool,
) []string {
	members := []string{}
	for _, enumName := range mustGeneratedEnumValues(category.EnumType) {
		t, ok := category.ResolvedTypeForEnum(enumName)
		if !ok || !predicate(t) {
			continue
		}
		members = append(members, category.EnumValueExpr(enumName))
	}
	return members
}

func generatedCodeObjTypeSetMembers(predicate func(reflect.Type) bool) []string {
	return generatedContractTypeSetMembers(generatedCodeObjContractCategory, predicate)
}

func generatedSectionTypeSetMembers(predicate func(reflect.Type) bool) []string {
	return generatedContractTypeSetMembers(generatedSectionContractCategory, predicate)
}

func generatedSectionImplDeclarationNameForSectionName(sectionName string) (string, bool) {
	t, ok := generatedSectionImplTypeForSectionName(sectionName)
	if !ok {
		return "", false
	}
	return frontendBindingTypeName(t), true
}

func generatedSectionResolvedImplTypeForSectionName(sectionName string) (reflect.Type, bool) {
	return generatedSectionImplTypeForSectionName(sectionName)
}

func generatedCodeObjImplDeclarationNameForCodeObjName(codeObjName string) (string, bool) {
	t, ok := generatedCodeObjImplTypeForCodeObjName(codeObjName)
	if !ok {
		return "", false
	}
	return frontendBindingTypeName(t), true
}

func generatedSectionImplHasChildren(t reflect.Type) bool {
	return generatedContractTypeHasJSONField(t, "children")
}

func generatedSectionImplHasParams(t reflect.Type) bool {
	return generatedContractTypeHasJSONField(t, "codeObjVariantMap")
}

func generatedSectionImplIsDictLike(t reflect.Type) bool {
	return generatedContractTypeHasJSONField(t, "topLevelParamId")
}

func generatedCodeObjImplHasChildren(t reflect.Type) bool {
	return generatedContractTypeHasJSONField(t, "children")
}

func generatedCodeObjImplIsChildless(t reflect.Type) bool {
	return generatedContractTypeEmbedsAnonymousField(t, frontendBaseValueParamCodeObjImplType)
}

func generatedCodeObjImplIsParam(t reflect.Type) bool {
	return generatedContractTypeEmbedsAnonymousField(t, frontendParamCodeObjFieldsType)
}

func generatedCodeObjImplIsControl(t reflect.Type) bool {
	return generatedCodeObjImplIsParam(t) && !generatedCodeObjImplHasChildren(t)
}

func generatedCodeObjImplIsSectionParam(t reflect.Type) bool {
	return generatedCodeObjImplIsParam(t) &&
		(generatedCodeObjImplIsChildless(t) || generatedCodeObjImplHasChildren(t))
}

func generatedContractTypeHasJSONField(t reflect.Type, fieldName string) bool {
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.Kind() != reflect.Struct {
		return false
	}
	for index := range t.NumField() {
		field := t.Field(index)
		if !field.IsExported() {
			continue
		}
		if field.Anonymous && generatedContractTypeHasJSONField(field.Type, fieldName) {
			return true
		}
		name, _, skip := jsonFieldName(field)
		if !skip && name == fieldName {
			return true
		}
	}
	return false
}
