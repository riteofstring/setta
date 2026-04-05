package frontendbindings

import (
	"reflect"

	"setta/internal/deployments"
	"setta/internal/projectstate"
)

func projectStateTypeGuardDeclarations() []TypeDeclaration {
	return []TypeDeclaration{
		generatedCodeObjTypeSetDeclaration(
			"BaseChildlessCodeObjImplTypeSet",
			true,
			generatedCodeObjImplIsChildless,
		),
		generatedCodeObjTypeSetDeclaration(
			"BaseParamCodeObjImplTypeSet",
			true,
			generatedCodeObjImplIsParam,
		),
		generatedCodeObjTypeSetDeclaration(
			"BaseParentCodeObjImplTypeSet",
			false,
			generatedCodeObjImplHasChildren,
		),
		generatedCodeObjTypeSetDeclaration(
			"ControlCodeObjTypeSet",
			true,
			generatedCodeObjImplIsControl,
		),
		generatedCodeObjTypeSetDeclaration(
			"SectionParamCodeObjTypeSet",
			true,
			generatedCodeObjImplIsSectionParam,
		),
		generatedSectionTypeSetDeclaration(
			"BaseParentSectionImplTypeSet",
			false,
			generatedSectionImplHasChildren,
		),
		generatedSectionTypeSetDeclaration(
			"BaseDictSectionImplTypeSet",
			false,
			generatedSectionImplIsDictLike,
		),
		generatedSectionTypeSetDeclaration(
			"BaseSectionWithParamsImplTypeSet",
			false,
			generatedSectionImplHasParams,
		),
		typeGuardDeclaration(
			"isBaseChildlessCodeObjImpl",
			"BaseCodeObjImplUnion",
			"BaseChildlessCodeObjImplUnion",
			"BaseChildlessCodeObjImplTypeSet",
		),
		typeGuardDeclaration(
			"isBaseParamCodeObjImpl",
			"BaseCodeObjImplUnion",
			"BaseParamCodeObjImplUnion",
			"BaseParamCodeObjImplTypeSet",
		),
		typeGuardDeclaration(
			"isBaseParentCodeObjImpl",
			"BaseCodeObjImplUnion",
			"BaseParentCodeObjImplUnion",
			"BaseParentCodeObjImplTypeSet",
		),
		typeGuardDeclaration(
			"isBaseParentSectionImpl",
			"BaseSectionImplUnion",
			"BaseParentSectionImplUnion",
			"BaseParentSectionImplTypeSet",
		),
		typeGuardDeclaration(
			"isBaseDictSectionImpl",
			"BaseSectionImplUnion",
			"BaseDictSectionImplUnion",
			"BaseDictSectionImplTypeSet",
		),
		typeGuardDeclaration(
			"isBaseSectionWithParamsImpl",
			"BaseSectionImplUnion",
			"BaseSectionWithParamsImplUnion",
			"BaseSectionWithParamsImplTypeSet",
		),
	}
}

var frontendBaseValueParamCodeObjImplType = reflect.TypeOf(projectstate.FrontendBaseValueParamCodeObjImpl{})
var frontendParamCodeObjFieldsType = reflect.TypeOf(projectstate.FrontendParamCodeObjFields{})

// These section kinds intentionally reuse another concrete owner contract shape
// without a dedicated frontend struct root.
var generatedSectionTraitAliasTargets = map[string]string{
	"GenPythonCode":     "Code",
	"GenPythonMetadata": "Code",
	"GlobalVariables":   "Dict",
}

func generatedCodeObjTypeSetDeclaration(
	name string,
	exported bool,
	predicate func(reflect.Type) bool,
) TypeDeclaration {
	return setDeclaration(
		name,
		"CodeObjType",
		exported,
		generatedCodeObjTypeSetMembers(predicate)...,
	)
}

func generatedSectionTypeSetDeclaration(
	name string,
	exported bool,
	predicate func(reflect.Type) bool,
) TypeDeclaration {
	return setDeclaration(
		name,
		"SectionType",
		exported,
		generatedSectionTypeSetMembers(predicate)...,
	)
}

func generatedCodeObjTypeSetMembers(predicate func(reflect.Type) bool) []string {
	members := []string{}
	for _, codeObjName := range mustGeneratedEnumValues(
		reflect.TypeOf(projectstate.FrontendCodeObjType("")),
	) {
		t, ok := generatedCodeObjImplTypeForCodeObjName(codeObjName)
		if !ok || !predicate(t) {
			continue
		}
		members = append(members, "CodeObjTypeEnum."+codeObjName)
	}
	return members
}

func generatedSectionTypeSetMembers(predicate func(reflect.Type) bool) []string {
	members := []string{}
	for _, sectionName := range mustGeneratedEnumValues(
		reflect.TypeOf(projectstate.FrontendSectionType("")),
	) {
		t, ok := generatedSectionImplOrAliasTypeForSectionName(sectionName)
		if !ok || !predicate(t) {
			continue
		}
		members = append(members, generatedSectionImplTypeExpr(sectionName))
	}
	return members
}

func generatedSectionImplOrAliasTypeForSectionName(sectionName string) (reflect.Type, bool) {
	if t, ok := generatedSectionImplTypeForSectionName(sectionName); ok {
		return t, true
	}
	targetSectionName, ok := generatedSectionTraitAliasTargets[sectionName]
	if !ok {
		return nil, false
	}
	return generatedSectionImplTypeForSectionName(targetSectionName)
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

func buildDefaultSharePolicyCreateExprTS() string {
	return buildSharePolicyCreateExprTS(deployments.DefaultPolicy())
}

func buildSharePolicyCreateExprTS(policy deployments.Policy) string {
	return buildTSMergeGeneratedOptionsExprFromGoValueTS(
		"frontend share policy defaults",
		policy,
		goJSONFieldOrder(policy),
		"options",
		"SharePolicy",
	)
}

func defaultAppPolicyDeclaration() TypeDeclaration {
	return exportedFunctionDeclaration(
		"createDefaultAppPolicy",
		"SharePolicy",
		buildDefaultAppPolicyFunctionBodyTS(),
		TypeProperty{Name: "options", TypeExpr: "Partial<SharePolicy>", DefaultValue: "{}"},
	)
}

func buildDefaultAppPolicyFunctionBodyTS() string {
	return buildTSMergeGeneratedOptionsCreateBodyFromGoValueTS(
		"frontend default app policy",
		deployments.DefaultAppPolicy(),
		goJSONFieldOrder(deployments.Policy{}),
		"options",
		"SharePolicy",
	)
}

func projectStateSupportDeclarations() []TypeDeclaration {
	declarations := []TypeDeclaration{
		defaultAppPolicyDeclaration(),
	}
	declarations = append(declarations, projectStateTypeGuardDeclarations()...)
	return declarations
}
