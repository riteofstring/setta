package frontendbindings

import (
	"fmt"
	"reflect"
	"strings"

	"setta/internal/frontendbindingmeta"
)

type discriminatedObjectFamilyMember struct {
	Type     reflect.Type
	EnumExpr string
}

func discriminatedObjectFamilyDeclarations(converter *typeConverter, t reflect.Type) ([]TypeDeclaration, bool, error) {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return nil, false, nil
	}
	provider, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.DiscriminatedObjectFamilyProvider](t)
	if !ok {
		return nil, false, nil
	}
	family := provider.FrontendBindingDiscriminatedObjectFamily()
	family.BaseType = canonicalFrontendBindingType(family.BaseType)
	if family.BaseType == nil {
		return nil, false, nil
	}
	members, err := discriminatedObjectFamilyMembers(family)
	if err != nil {
		return nil, false, err
	}
	baseProperties, concreteByType, err := discriminatedObjectFamilyDeclarationPropertiesForMembers(converter, family, members)
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
		return append(declarations, discriminatedObjectFamilyTraitDeclarations(family, members)...), true, nil
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
	if family.DefaultValueForDiscriminator == nil {
		return declarations, true, nil
	}
	value, ok := family.DiscriminatorValue(t)
	if !ok {
		return declarations, true, nil
	}
	defaultValue, ok, err := family.DefaultValueForDiscriminator(value)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return declarations, true, nil
	}
	createDeclaration, err := converter.goBackedCreateFunctionDeclaration(t, defaultValue)
	if err != nil {
		return nil, false, err
	}
	return append(declarations,
		createDeclaration,
	), true, nil
}

func discriminatedObjectFamilyDeclarationPropertiesForMembers(
	converter *typeConverter,
	family frontendbindingmeta.DiscriminatedObjectFamily,
	members []discriminatedObjectFamilyMember,
) ([]TypeProperty, map[reflect.Type][]TypeProperty, error) {
	coreProperties, err := converter.structProperties(family.BaseType, nil, nil, nil)
	if err != nil {
		return nil, nil, err
	}
	memberTypes := make([]reflect.Type, 0, len(members))
	concreteByType := make(map[reflect.Type][]TypeProperty, len(members))
	for _, member := range members {
		concreteProperties, err := converter.structProperties(
			member.Type,
			map[string]string{
				family.DiscriminatorField: "typeof " + member.EnumExpr,
			},
			nil,
			nil,
		)
		if err != nil {
			return nil, nil, err
		}
		memberTypes = append(memberTypes, member.Type)
		concreteByType[member.Type] = concreteProperties
	}
	baseProperties, concreteByType := mergeBaseAndConcreteObjectProperties(coreProperties, memberTypes, concreteByType)
	return baseProperties, concreteByType, nil
}

func discriminatedObjectFamilyTraitDeclarations(
	family frontendbindingmeta.DiscriminatedObjectFamily,
	members []discriminatedObjectFamilyMember,
) []TypeDeclaration {
	baseUnionName := frontendBindingTypeName(family.BaseType) + "Union"
	baseTypeName := frontendBindingTypeName(family.BaseType)
	baseMemberTypeNames := make([]string, 0, len(members))
	for _, member := range members {
		baseMemberTypeNames = append(baseMemberTypeNames, frontendBindingTypeName(member.Type))
	}
	declarations := []TypeDeclaration{
		aliasUnionDeclaration(
			baseUnionName,
			append([]string{baseTypeName}, baseMemberTypeNames...)...,
		),
	}
	for _, trait := range family.Traits {
		memberTypeNames := []string{}
		memberEnumExprs := []string{}
		for _, member := range members {
			if trait.EmbeddedFieldType != nil &&
				!frontendbindingmeta.ContractTypeEmbedsAnonymousField(member.Type, trait.EmbeddedFieldType) {
				continue
			}
			memberTypeNames = append(memberTypeNames, frontendBindingTypeName(member.Type))
			memberEnumExprs = append(memberEnumExprs, member.EnumExpr)
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
				memberEnumExprs...,
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
) ([]discriminatedObjectFamilyMember, error) {
	suffix := strings.TrimSpace(family.ConcreteTypeSuffix)
	if suffix == "" {
		return nil, fmt.Errorf("%s family is missing discriminator metadata", frontendBindingTypeName(family.BaseType))
	}
	enumValues, ok, err := discoveredFrontendEnumValues(family.EnumType)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("%s does not expose frontend enum values", family.EnumType.String())
	}
	enumExprsByValue := make(map[string]string, len(enumValues))
	enumTypeName := frontendBindingTypeName(family.EnumType)
	for _, enumValue := range enumValues {
		enumExprsByValue[enumValue.Value] = enumTypeName + "Enum." + enumValue.Name
	}

	members := make([]discriminatedObjectFamilyMember, 0, len(enumValues))
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
			return nil, fmt.Errorf(
				"%s family member %s does not resolve discriminator %q",
				frontendBindingTypeName(family.BaseType),
				candidate.String(),
				enumValue.Value,
			)
		}
		if !frontendbindingmeta.ContractTypeEmbedsAnonymousField(candidate, family.BaseType) {
			return nil, fmt.Errorf(
				"%s family member %s does not embed %s",
				frontendBindingTypeName(family.BaseType),
				candidate.String(),
				frontendBindingTypeName(family.BaseType),
			)
		}
		members = append(members, discriminatedObjectFamilyMember{
			Type:     candidate,
			EnumExpr: enumExprsByValue[enumValue.Value],
		})
	}
	return members, nil
}
