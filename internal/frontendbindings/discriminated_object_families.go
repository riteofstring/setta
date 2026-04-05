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

func discriminatedObjectFamilyForType(t reflect.Type) (frontendbindingmeta.DiscriminatedObjectFamily, []discriminatedObjectFamilyMember, bool, error) {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return frontendbindingmeta.DiscriminatedObjectFamily{}, nil, false, nil
	}
	seenBaseTypes := map[reflect.Type]struct{}{}
	for _, discoveredType := range DiscoveredConvertibleTypes() {
		provider, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.DiscriminatedObjectFamilyProvider](canonicalFrontendBindingType(discoveredType))
		if !ok {
			continue
		}
		family := provider.FrontendBindingDiscriminatedObjectFamily()
		family.BaseType = canonicalFrontendBindingType(family.BaseType)
		if family.BaseType == nil {
			continue
		}
		if _, duplicate := seenBaseTypes[family.BaseType]; duplicate {
			continue
		}
		seenBaseTypes[family.BaseType] = struct{}{}

		memberTypes := make([]reflect.Type, 0, len(family.MemberTypes))
		seenMemberTypes := make(map[reflect.Type]struct{}, len(family.MemberTypes))
		for _, memberType := range family.MemberTypes {
			memberType = canonicalFrontendBindingType(memberType)
			if memberType == nil || memberType == family.BaseType {
				continue
			}
			if _, duplicate := seenMemberTypes[memberType]; duplicate {
				continue
			}
			seenMemberTypes[memberType] = struct{}{}
			memberTypes = append(memberTypes, memberType)
		}
		family.MemberTypes = memberTypes
		isMember := false
		for _, memberType := range family.MemberTypes {
			if memberType == t {
				isMember = true
				break
			}
		}
		if t != family.BaseType && !isMember {
			continue
		}
		members, err := discriminatedObjectFamilyMembers(family)
		if err != nil {
			return frontendbindingmeta.DiscriminatedObjectFamily{}, nil, false, err
		}
		return family, members, true, nil
	}
	return frontendbindingmeta.DiscriminatedObjectFamily{}, nil, false, nil
}

func discriminatedObjectFamilyDeclarations(converter *typeConverter, t reflect.Type) ([]TypeDeclaration, bool, error) {
	family, members, ok, err := discriminatedObjectFamilyForType(t)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, nil
	}
	t = canonicalFrontendBindingType(t)
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
		return nil, false, fmt.Errorf(
			"%s family is missing concrete properties for %s",
			frontendBindingTypeName(family.BaseType),
			t.String(),
		)
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
			if trait.Predicate != nil && !trait.Predicate(member.Type) {
				continue
			}
			memberTypeNames = append(memberTypeNames, frontendBindingTypeName(member.Type))
			memberEnumExprs = append(memberEnumExprs, member.EnumExpr)
		}
		if strings.TrimSpace(trait.UnionName) != "" {
			memberNames := memberTypeNames
			if trait.IncludeBase {
				memberNames = append([]string{baseTypeName}, memberNames...)
			}
			if trait.LocalUnion {
				declarations = append(declarations, localUnionDeclaration(trait.UnionName, memberNames...))
			} else {
				declarations = append(declarations, aliasUnionDeclaration(trait.UnionName, memberNames...))
			}
		}
		if strings.TrimSpace(trait.SetName) != "" {
			declarations = append(declarations, setDeclaration(
				trait.SetName,
				frontendBindingTypeName(family.EnumType),
				memberEnumExprs...,
			))
		}
		if strings.TrimSpace(trait.GuardName) != "" {
			inputType := trait.GuardInput
			if strings.TrimSpace(inputType) == "" {
				inputType = baseUnionName
			}
			returnType := trait.UnionName
			if strings.TrimSpace(returnType) == "" {
				returnType = baseUnionName
			}
			declarations = append(declarations, typeGuardDeclaration(
				trait.GuardName,
				inputType,
				returnType,
				trait.SetName,
			))
		}
	}
	return declarations, nil
}

func discriminatedObjectFamilyMembers(
	family frontendbindingmeta.DiscriminatedObjectFamily,
) ([]discriminatedObjectFamilyMember, error) {
	enumValues, ok, err := discoveredFrontendEnumValues(family.EnumType)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("%s does not expose frontend enum values", family.EnumType.String())
	}
	enumExprsByValue := make(map[string]string, len(enumValues))
	order := make([]string, 0, len(enumValues))
	enumTypeName := frontendBindingTypeName(family.EnumType)
	for _, enumValue := range enumValues {
		enumExprsByValue[enumValue.Value] = enumTypeName + "Enum." + enumValue.Name
		order = append(order, enumValue.Value)
	}

	membersByValue := make(map[string]reflect.Type, len(family.MemberTypes))
	for _, candidate := range family.MemberTypes {
		if family.DiscriminatorValue == nil {
			return nil, fmt.Errorf("%s family is missing discriminator metadata", frontendBindingTypeName(family.BaseType))
		}
		value, ok := family.DiscriminatorValue(candidate)
		if !ok {
			return nil, fmt.Errorf(
				"%s family member %s is missing a discriminator value",
				frontendBindingTypeName(family.BaseType),
				candidate.String(),
			)
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
	for _, value := range order {
		memberType, ok := membersByValue[value]
		if !ok {
			continue
		}
		enumExpr := enumExprsByValue[value]
		members = append(members, discriminatedObjectFamilyMember{
			Type:     memberType,
			EnumExpr: enumExpr,
		})
	}
	return members, nil
}
