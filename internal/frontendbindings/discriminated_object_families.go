package frontendbindings

import (
	"fmt"
	"reflect"
	"strings"

	"setta/internal/frontendbindingmeta"
)

func discriminatedObjectFamilyDeclarations(converter *typeConverter, t reflect.Type) ([]TypeDeclaration, bool, error) {
	t = canonicalFrontendBindingType(t)
	provider, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.DiscriminatedObjectFamilyProvider](t)
	if t == nil || !ok {
		return nil, false, nil
	}
	family := provider.FrontendBindingDiscriminatedObjectFamily()
	family.BaseType = canonicalFrontendBindingType(family.BaseType)
	if family.BaseType == nil {
		return nil, false, nil
	}
	memberTypes, typeExprOverridesByType, err := discriminatedObjectFamilyMembers(family)
	if err != nil {
		return nil, false, err
	}
	baseProperties, concreteByType, err := converter.mergedConcreteStructProperties(
		family.BaseType,
		memberTypes,
		typeExprOverridesByType,
	)
	if err != nil {
		return nil, false, err
	}
	if t == family.BaseType {
		declarations := []TypeDeclaration{
			aliasObjectDeclarationFromProperties(
				frontendBindingTypeName(family.BaseType),
				baseProperties,
				family.BaseExtraLines...,
			),
		}
		return append(declarations, discriminatedObjectFamilyTraitDeclarations(family, memberTypes)...), true, nil
	}
	memberProperties, ok := concreteByType[t]
	if !ok {
		return nil, false, nil
	}
	declarations := []TypeDeclaration{
		aliasIntersectionDeclarationFromProperties(
			frontendBindingTypeName(t),
			frontendBindingTypeName(family.BaseType),
			memberProperties,
		),
	}
	if family.DefaultValueForDiscriminator != nil {
		if value, ok := family.DiscriminatorValue(t); ok {
			defaultValue, ok, err := family.DefaultValueForDiscriminator(value)
			if err != nil {
				return nil, false, err
			}
			if ok {
				createDeclaration, err := converter.goBackedCreateFunctionDeclaration(t, defaultValue)
				if err != nil {
					return nil, false, err
				}
				declarations = append(declarations, createDeclaration)
			}
		}
	}
	return declarations, true, nil
}

func discriminatedObjectFamilyTraitDeclarations(
	family frontendbindingmeta.DiscriminatedObjectFamily,
	memberTypes []reflect.Type,
) []TypeDeclaration {
	baseUnionName := frontendBindingTypeName(family.BaseType) + "Union"
	baseTypeName := frontendBindingTypeName(family.BaseType)
	baseMemberTypeNames := make([]string, 0, len(memberTypes))
	for _, memberType := range memberTypes {
		baseMemberTypeNames = append(baseMemberTypeNames, frontendBindingTypeName(memberType))
	}
	declarations := []TypeDeclaration{
		aliasUnionDeclaration(
			baseUnionName,
			append([]string{baseTypeName}, baseMemberTypeNames...)...,
		),
	}
	for _, trait := range family.Traits {
		memberTypeNames := []string{}
		memberValues := []string{}
		for _, memberType := range memberTypes {
			if trait.EmbeddedFieldType != nil &&
				!frontendbindingmeta.ContractTypeEmbedsAnonymousField(memberType, trait.EmbeddedFieldType) {
				continue
			}
			value, _ := family.DiscriminatorValue(memberType)
			memberTypeNames = append(memberTypeNames, frontendBindingTypeName(memberType))
			memberValues = append(memberValues, fmt.Sprintf("%q", value))
		}
		unionName := strings.TrimSpace(trait.UnionName)
		if unionName == "" {
			continue
		}
		memberNames := memberTypeNames
		if trait.IncludeBase {
			memberNames = append([]string{baseTypeName}, memberNames...)
		}
		returnType := unionAliasExpr(memberNames...)
		if !trait.LocalUnion {
			declarations = append(declarations, aliasUnionDeclaration(unionName, memberNames...))
			returnType = unionName
		}
		traitTypeName := strings.TrimSuffix(unionName, "Union")
		traitSetName := traitTypeName + "TypeSet"
		declarations = append(declarations,
			setDeclaration(
				traitSetName,
				frontendBindingTypeName(family.EnumType),
				memberValues...,
			),
			typeGuardDeclaration(
				"is"+traitTypeName,
				baseUnionName,
				returnType,
				traitSetName,
			),
		)
	}
	return declarations
}

func discriminatedObjectFamilyMembers(
	family frontendbindingmeta.DiscriminatedObjectFamily,
) ([]reflect.Type, map[reflect.Type]map[string]string, error) {
	suffix := strings.TrimSpace(family.ConcreteTypeSuffix)
	if suffix == "" {
		return nil, nil, fmt.Errorf("%s family is missing discriminator metadata", frontendBindingTypeName(family.BaseType))
	}
	enumValues, ok, err := discoveredFrontendEnumValues(family.EnumType)
	if err != nil {
		return nil, nil, err
	}
	if !ok {
		return nil, nil, fmt.Errorf("%s does not expose frontend enum values", family.EnumType.String())
	}
	memberTypes := make([]reflect.Type, 0, len(enumValues))
	typeExprOverridesByType := make(map[reflect.Type]map[string]string, len(enumValues))
	for _, enumValue := range enumValues {
		candidate, ok := frontendBindingNamedTypeByPackageAndName(
			family.BaseType.PkgPath(),
			"Frontend"+enumValue.Value+suffix,
		)
		if !ok {
			continue
		}
		value, ok := family.DiscriminatorValue(candidate)
		if !ok || value != enumValue.Value {
			return nil, nil, fmt.Errorf(
				"%s family member %s does not resolve discriminator %q",
				frontendBindingTypeName(family.BaseType),
				candidate.String(),
				enumValue.Value,
			)
		}
		if !frontendbindingmeta.ContractTypeEmbedsAnonymousField(candidate, family.BaseType) {
			return nil, nil, fmt.Errorf(
				"%s family member %s does not embed %s",
				frontendBindingTypeName(family.BaseType),
				candidate.String(),
				frontendBindingTypeName(family.BaseType),
			)
		}
		memberTypes = append(memberTypes, candidate)
		typeExprOverridesByType[candidate] = map[string]string{
			family.DiscriminatorField: fmt.Sprintf("%q", enumValue.Value),
		}
	}
	return memberTypes, typeExprOverridesByType, nil
}
