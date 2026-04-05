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
		traits, err := discriminatedObjectFamilyTraitDeclarations(family, members)
		if err != nil {
			return nil, false, err
		}
		return append(declarations, traits...), true, nil
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
	typeName := frontendBindingTypeName(t)
	propertySpecs, err := converter.structPropertySpecs(t, nil, nil, nil)
	if err != nil {
		return nil, false, err
	}
	createBody, err := buildGoBackedCreateBodyTS(
		"frontend generated impl defaults "+typeName,
		typeName,
		defaultValue,
		propertySpecs,
	)
	if err != nil {
		return nil, false, err
	}
	return append(declarations,
		exportedFunctionDeclaration(
			"create"+typeName,
			typeName,
			createBody,
			TypeProperty{
				Name:         "options",
				TypeExpr:     "Partial<" + typeName + ">",
				DefaultValue: "{}",
			},
		),
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
	coreByName := make(map[string]struct{}, len(coreProperties))
	for _, property := range coreProperties {
		coreByName[property.Name] = struct{}{}
	}
	concreteByType := make(map[reflect.Type][]TypeProperty, len(members))
	mergedOrder := []string{}
	mergedByName := map[string]*TypeProperty{}
	typeExprsByName := map[string][]string{}
	seenTypeExprsByName := map[string]map[string]struct{}{}
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
		concreteByType[member.Type] = concreteProperties
		for _, property := range concreteProperties {
			if _, ok := coreByName[property.Name]; ok {
				continue
			}
			spec, ok := mergedByName[property.Name]
			if !ok {
				property.Optional = true
				copyProperty := property
				mergedByName[property.Name] = &copyProperty
				typeExprsByName[property.Name] = []string{}
				seenTypeExprsByName[property.Name] = map[string]struct{}{}
				mergedOrder = append(mergedOrder, property.Name)
				spec = &copyProperty
			}
			spec.Optional = true
			if _, seen := seenTypeExprsByName[property.Name][property.TypeExpr]; seen {
				continue
			}
			seenTypeExprsByName[property.Name][property.TypeExpr] = struct{}{}
			typeExprsByName[property.Name] = append(typeExprsByName[property.Name], property.TypeExpr)
		}
	}
	baseProperties := make([]TypeProperty, 0, len(coreProperties)+len(mergedOrder))
	baseProperties = append(baseProperties, coreProperties...)
	for _, name := range mergedOrder {
		property := *mergedByName[name]
		property.TypeExpr = strings.Join(typeExprsByName[name], " | ")
		baseProperties = append(baseProperties, property)
	}
	baseByName := make(map[string]TypeProperty, len(baseProperties))
	for _, property := range baseProperties {
		baseByName[property.Name] = property
	}
	for memberType, properties := range concreteByType {
		filtered := properties[:0]
		for _, property := range properties {
			baseProperty, ok := baseByName[property.Name]
			if !ok ||
				baseProperty.TypeExpr != property.TypeExpr ||
				baseProperty.Optional != property.Optional {
				filtered = append(filtered, property)
			}
		}
		concreteByType[memberType] = filtered
	}
	return baseProperties, concreteByType, nil
}

func discriminatedObjectFamilyTraitDeclarations(
	family frontendbindingmeta.DiscriminatedObjectFamily,
	members []discriminatedObjectFamilyMember,
) ([]TypeDeclaration, error) {
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
			if !trait.Matches(member.Type) {
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
	return declarations, nil
}

func discriminatedObjectFamilyMembers(
	family frontendbindingmeta.DiscriminatedObjectFamily,
) ([]discriminatedObjectFamilyMember, error) {
	if strings.TrimSpace(family.ConcreteTypeSuffix) == "" {
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

	membersByValue := make(map[string]reflect.Type, len(enumValues))
	for _, candidate := range DiscoveredConvertibleTypes() {
		candidate = canonicalFrontendBindingType(candidate)
		if candidate == nil || candidate == family.BaseType {
			continue
		}
		candidateProvider, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.DiscriminatedObjectFamilyProvider](candidate)
		if !ok {
			continue
		}
		candidateFamily := candidateProvider.FrontendBindingDiscriminatedObjectFamily()
		if canonicalFrontendBindingType(candidateFamily.BaseType) != family.BaseType {
			continue
		}
		value, ok := family.DiscriminatorValue(candidate)
		if !ok {
			continue
		}
		if _, ok := enumExprsByValue[value]; !ok {
			return nil, fmt.Errorf(
				"%s family includes %s with unknown discriminator %q",
				frontendBindingTypeName(family.BaseType),
				candidate.String(),
				value,
			)
		}
		if existing, duplicate := membersByValue[value]; duplicate {
			if existing == candidate {
				continue
			}
			return nil, fmt.Errorf(
				"%s family maps discriminator %q to both %s and %s",
				frontendBindingTypeName(family.BaseType),
				value,
				existing.String(),
				candidate.String(),
			)
		}
		membersByValue[value] = candidate
	}

	members := make([]discriminatedObjectFamilyMember, 0, len(membersByValue))
	for _, enumValue := range enumValues {
		memberType, ok := membersByValue[enumValue.Value]
		if !ok {
			continue
		}
		members = append(members, discriminatedObjectFamilyMember{
			Type:     memberType,
			EnumExpr: enumExprsByValue[enumValue.Value],
		})
	}
	return members, nil
}
