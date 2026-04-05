package frontendbindings

import (
	"fmt"
	"reflect"
	"sort"
	"strings"
	"sync"

	"setta/internal/frontendbindingmeta"
)

type discriminatedObjectFamilyMember struct {
	Type     reflect.Type
	TypeExpr string
}

var frontendBindingDiscriminatedFamiliesOnce sync.Once
var frontendBindingDiscriminatedFamiliesCached []frontendbindingmeta.DiscriminatedObjectFamily

func frontendBindingDiscriminatedFamilies() []frontendbindingmeta.DiscriminatedObjectFamily {
	frontendBindingDiscriminatedFamiliesOnce.Do(func() {
		familiesByBase := map[reflect.Type]frontendbindingmeta.DiscriminatedObjectFamily{}
		for _, t := range DiscoveredConvertibleTypes() {
			provider, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.DiscriminatedObjectFamilyProvider](canonicalFrontendBindingType(t))
			if !ok {
				continue
			}
			family := provider.FrontendBindingDiscriminatedObjectFamily()
			family.BaseType = canonicalFrontendBindingType(family.BaseType)
			if family.BaseType == nil {
				continue
			}
			familiesByBase[family.BaseType] = family
		}

		families := make([]frontendbindingmeta.DiscriminatedObjectFamily, 0, len(familiesByBase))
		for _, family := range familiesByBase {
			families = append(families, family)
		}
		sort.Slice(families, func(i, j int) bool {
			left := frontendBindingTypeName(families[i].BaseType)
			right := frontendBindingTypeName(families[j].BaseType)
			if left == right {
				return families[i].BaseType.String() < families[j].BaseType.String()
			}
			return left < right
		})
		frontendBindingDiscriminatedFamiliesCached = families
	})
	return frontendBindingDiscriminatedFamiliesCached
}

func discriminatedObjectFamilyForType(t reflect.Type) (frontendbindingmeta.DiscriminatedObjectFamily, bool) {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return frontendbindingmeta.DiscriminatedObjectFamily{}, false
	}
	for _, family := range frontendBindingDiscriminatedFamilies() {
		if t == family.BaseType {
			return family, true
		}
		if family.DiscriminatorValue == nil {
			continue
		}
		if _, ok := family.DiscriminatorValue(t); ok {
			return family, true
		}
	}
	return frontendbindingmeta.DiscriminatedObjectFamily{}, false
}

func discriminatedObjectFamilyTypeDeclaration(
	converter *typeConverter,
	t reflect.Type,
) (TypeDeclaration, bool, error) {
	family, ok := discriminatedObjectFamilyForType(t)
	if !ok {
		return TypeDeclaration{}, false, nil
	}
	t = canonicalFrontendBindingType(t)
	members, err := discriminatedObjectFamilyMembers(family)
	if err != nil {
		return TypeDeclaration{}, false, err
	}
	baseProperties, concreteByType, err := discriminatedObjectFamilyDeclarationPropertiesForMembers(converter, family, members)
	if err != nil {
		return TypeDeclaration{}, false, err
	}
	if t == family.BaseType {
		return aliasObjectDeclarationFromProperties(
			frontendBindingTypeName(family.BaseType),
			baseProperties,
			family.BaseExtraLines...,
		), true, nil
	}
	memberProperties, ok := concreteByType[t]
	if !ok {
		return TypeDeclaration{}, false, fmt.Errorf(
			"%s family is missing concrete properties for %s",
			frontendBindingTypeName(family.BaseType),
			t.String(),
		)
	}
	return aliasIntersectionDeclarationFromProperties(
		frontendBindingTypeName(t),
		frontendBindingTypeName(family.BaseType),
		discriminatedObjectFamilyAliasProperties(baseProperties, memberProperties),
	), true, nil
}

func discriminatedObjectFamilyAdditionalDeclarations(
	converter *typeConverter,
	t reflect.Type,
) ([]TypeDeclaration, bool, error) {
	family, ok := discriminatedObjectFamilyForType(t)
	if !ok {
		return nil, false, nil
	}
	t = canonicalFrontendBindingType(t)
	if t == family.BaseType {
		declarations, err := discriminatedObjectFamilyTraitDeclarations(family)
		return declarations, err == nil && len(declarations) > 0, err
	}
	if family.DefaultValueForDiscriminator == nil {
		return nil, false, nil
	}
	value, ok := family.DiscriminatorValue(t)
	if !ok {
		return nil, false, nil
	}
	defaultValue, ok, err := family.DefaultValueForDiscriminator(value)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, nil
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
	return []TypeDeclaration{
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
	}, true, nil
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
	concreteByType := make(map[reflect.Type][]TypeProperty, len(members))
	for _, member := range members {
		concreteProperties, err := converter.structProperties(
			member.Type,
			map[string]string{
				family.DiscriminatorField: member.TypeExpr,
			},
			nil,
			nil,
		)
		if err != nil {
			return nil, nil, err
		}
		concreteByType[member.Type] = concreteProperties
	}
	baseProperties := append(coreProperties, discriminatedObjectFamilyMergedOptionalProperties(
		coreProperties,
		members,
		concreteByType,
	)...)
	return baseProperties, concreteByType, nil
}

func discriminatedObjectFamilyTraitDeclarations(
	family frontendbindingmeta.DiscriminatedObjectFamily,
) ([]TypeDeclaration, error) {
	members, err := discriminatedObjectFamilyMembers(family)
	if err != nil {
		return nil, err
	}
	baseUnionName := frontendBindingTypeName(family.BaseType) + "Union"
	baseTypeName := frontendBindingTypeName(family.BaseType)
	declarations := []TypeDeclaration{
		aliasUnionDeclaration(
			baseUnionName,
			append([]string{baseTypeName}, discriminatedObjectFamilyMemberStrings(members, nil, func(member discriminatedObjectFamilyMember) string {
				return frontendBindingTypeName(member.Type)
			})...)...,
		),
	}
	for _, trait := range family.Traits {
		if strings.TrimSpace(trait.UnionName) != "" {
			memberNames := discriminatedObjectFamilyMemberStrings(members, trait.Predicate, func(member discriminatedObjectFamilyMember) string {
				return frontendBindingTypeName(member.Type)
			})
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
				discriminatedObjectFamilyMemberStrings(members, trait.Predicate, func(member discriminatedObjectFamilyMember) string {
					return strings.TrimPrefix(member.TypeExpr, "typeof ")
				})...,
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

	baseType := canonicalFrontendBindingType(family.BaseType)
	membersByValue := map[string]reflect.Type{}
	for _, candidate := range DiscoveredConvertibleTypes() {
		candidate = canonicalFrontendBindingType(candidate)
		if candidate == nil || candidate == baseType || family.DiscriminatorValue == nil {
			continue
		}
		value, ok := family.DiscriminatorValue(candidate)
		if !ok {
			continue
		}
		if _, ok := enumExprsByValue[value]; !ok {
			return nil, fmt.Errorf(
				"%s family includes %s with unknown discriminator %q",
				frontendBindingTypeName(baseType),
				candidate.String(),
				value,
			)
		}
		if existing, duplicate := membersByValue[value]; duplicate {
			return nil, fmt.Errorf(
				"%s family maps discriminator %q to both %s and %s",
				frontendBindingTypeName(baseType),
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
		members = append(members, discriminatedObjectFamilyMember{
			Type:     memberType,
			TypeExpr: "typeof " + enumExprsByValue[value],
		})
	}
	return members, nil
}

func discriminatedObjectFamilyMemberStrings(
	members []discriminatedObjectFamilyMember,
	predicate func(reflect.Type) bool,
	project func(discriminatedObjectFamilyMember) string,
) []string {
	values := []string{}
	for _, member := range members {
		if predicate != nil && !predicate(member.Type) {
			continue
		}
		values = append(values, project(member))
	}
	return values
}

func discriminatedObjectFamilyPropertyMap(properties []TypeProperty) map[string]TypeProperty {
	names := make(map[string]TypeProperty, len(properties))
	for _, property := range properties {
		names[property.Name] = property
	}
	return names
}

func discriminatedObjectFamilyAliasProperties(
	baseProperties []TypeProperty,
	properties []TypeProperty,
) []TypeProperty {
	baseByName := discriminatedObjectFamilyPropertyMap(baseProperties)
	filtered := make([]TypeProperty, 0, len(properties))
	for _, property := range properties {
		baseProperty, ok := baseByName[property.Name]
		if !ok ||
			baseProperty.TypeExpr != property.TypeExpr ||
			baseProperty.Optional != property.Optional {
			filtered = append(filtered, property)
		}
	}
	return filtered
}

func discriminatedObjectFamilyMergedOptionalProperties(
	coreProperties []TypeProperty,
	members []discriminatedObjectFamilyMember,
	concreteByType map[reflect.Type][]TypeProperty,
) []TypeProperty {
	coreByName := discriminatedObjectFamilyPropertyMap(coreProperties)
	order := []string{}
	merged := map[string]*TypeProperty{}
	typeExprsByName := map[string][]string{}
	seenTypeExprsByName := map[string]map[string]struct{}{}

	for _, member := range members {
		properties, ok := concreteByType[member.Type]
		if !ok {
			panic(fmt.Sprintf(
				"%s family is missing concrete properties for %s",
				frontendBindingTypeName(member.Type),
				member.Type.String(),
			))
		}
		for _, property := range properties {
			if _, ok := coreByName[property.Name]; ok {
				continue
			}
			spec, ok := merged[property.Name]
			if !ok {
				property.Optional = true
				copyProperty := property
				merged[property.Name] = &copyProperty
				typeExprsByName[property.Name] = []string{}
				seenTypeExprsByName[property.Name] = map[string]struct{}{}
				order = append(order, property.Name)
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

	properties := make([]TypeProperty, 0, len(order))
	for _, name := range order {
		property := *merged[name]
		property.TypeExpr = strings.Join(typeExprsByName[name], " | ")
		properties = append(properties, property)
	}
	return properties
}
