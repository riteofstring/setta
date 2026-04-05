package sharedtypes

import (
	"fmt"
	"reflect"
	"slices"
	"sort"
	"strings"
	"unicode"

	"setta/internal/frontendbindingmeta"
	"setta/internal/frontendbindings"
	"setta/internal/httpapi"
	"setta/internal/wsapi"
)

type SemanticSidecar struct {
	SchemaVersion         int                        `json:"schemaVersion"`
	Contracts             []ContractEntry            `json:"contracts"`
	Routes                []RouteInventoryEntry      `json:"routes"`
	Defaults              []DefaultEntry             `json:"defaults,omitempty"`
	ExportedValues        []ExportedValueEntry       `json:"exportedValues,omitempty"`
	DiscriminatedFamilies []DiscriminatedFamilyEntry `json:"discriminatedFamilies,omitempty"`
}

type ContractEntry struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`
	SchemaRef string `json:"schemaRef"`
}

type RouteInventoryEntry struct {
	Name           string `json:"name"`
	Path           string `json:"path"`
	SourceConstant string `json:"sourceConstant"`
}

type DefaultEntry struct {
	Type  string `json:"type"`
	Value any    `json:"value"`
}

type ExportedValueEntry struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Value any    `json:"value"`
}

type DiscriminatedFamilyEntry struct {
	BaseType                     string                           `json:"baseType"`
	EnumType                     string                           `json:"enumType"`
	DiscriminatorField           string                           `json:"discriminatorField"`
	Members                      []DiscriminatedFamilyMemberEntry `json:"members"`
	Traits                       []DiscriminatedTraitEntry        `json:"traits,omitempty"`
	DefaultValuesByDiscriminator map[string]any                   `json:"defaultValuesByDiscriminator,omitempty"`
}

type DiscriminatedFamilyMemberEntry struct {
	Name               string `json:"name"`
	DiscriminatorValue string `json:"discriminatorValue"`
}

type DiscriminatedTraitEntry struct {
	UnionName   string   `json:"unionName"`
	LocalUnion  bool     `json:"localUnion"`
	IncludeBase bool     `json:"includeBase"`
	MemberTypes []string `json:"memberTypes"`
}

func BuildSemanticSidecar() (SemanticSidecar, error) {
	contracts, err := buildContractEntries()
	if err != nil {
		return SemanticSidecar{}, err
	}
	routes, err := DiscoveredRouteEntries()
	if err != nil {
		return SemanticSidecar{}, err
	}
	families, err := buildDiscriminatedFamilyEntries()
	if err != nil {
		return SemanticSidecar{}, err
	}

	return SemanticSidecar{
		SchemaVersion:         1,
		Contracts:             contracts,
		Routes:                routes,
		Defaults:              buildDefaultEntries(),
		ExportedValues:        buildExportedValueEntries(),
		DiscriminatedFamilies: families,
	}, nil
}

func buildContractEntries() ([]ContractEntry, error) {
	entries := make([]ContractEntry, 0, len(DiscoveredTypes()))
	for _, t := range DiscoveredTypes() {
		name := strings.TrimSpace(ContractNameForType(t))
		if name == "" {
			continue
		}
		entries = append(entries, ContractEntry{
			Name:      name,
			Kind:      contractKindForType(t),
			SchemaRef: "#/$defs/" + name,
		})
	}
	sort.Slice(entries, func(i int, j int) bool {
		return entries[i].Name < entries[j].Name
	})
	return entries, nil
}

func buildDefaultEntries() []DefaultEntry {
	entries := []DefaultEntry{}
	for _, t := range DiscoveredTypes() {
		provider, ok := frontendbindings.DefaultValueProviderForType(t)
		if !ok || provider == nil {
			continue
		}
		name := strings.TrimSpace(ContractNameForType(t))
		if name == "" {
			continue
		}
		entries = append(entries, DefaultEntry{
			Type:  name,
			Value: provider(),
		})
	}
	sort.Slice(entries, func(i int, j int) bool {
		return entries[i].Type < entries[j].Type
	})
	return entries
}

func buildExportedValueEntries() []ExportedValueEntry {
	exports := frontendbindings.DiscoveredFrontendValueExports()
	entries := make([]ExportedValueEntry, 0, len(exports))
	for _, export := range exports {
		typeName := strings.TrimSpace(ContractNameForType(export.Type))
		if typeName == "" {
			typeName = export.Type.String()
		}
		entries = append(entries, ExportedValueEntry{
			Name:  export.Name,
			Type:  typeName,
			Value: export.Value(),
		})
	}
	sort.Slice(entries, func(i int, j int) bool {
		return entries[i].Name < entries[j].Name
	})
	return entries
}

func buildDiscriminatedFamilyEntries() ([]DiscriminatedFamilyEntry, error) {
	allTypes := DiscoveredTypes()
	entries := []DiscriminatedFamilyEntry{}
	seenBases := map[reflect.Type]struct{}{}

	for _, t := range allTypes {
		provider, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.DiscriminatedObjectFamilyProvider](t)
		if !ok {
			continue
		}
		family := provider.FrontendBindingDiscriminatedObjectFamily()
		baseType := canonicalType(family.BaseType)
		if baseType == nil {
			continue
		}
		if _, seen := seenBases[baseType]; seen {
			continue
		}
		seenBases[baseType] = struct{}{}

		members, err := discriminatedFamilyMembers(family, allTypes)
		if err != nil {
			return nil, err
		}
		entry := DiscriminatedFamilyEntry{
			BaseType:           ContractNameForType(baseType),
			EnumType:           ContractNameForType(family.EnumType),
			DiscriminatorField: strings.TrimSpace(family.DiscriminatorField),
			Members:            members,
		}
		entry.Traits = discriminatedFamilyTraits(family, members, allTypes)
		if family.DefaultValueForDiscriminator != nil {
			entry.DefaultValuesByDiscriminator = map[string]any{}
			for _, member := range members {
				value, ok, err := family.DefaultValueForDiscriminator(member.DiscriminatorValue)
				if err != nil {
					return nil, fmt.Errorf(
						"shared sidecar family %s discriminator %q: %w",
						entry.BaseType,
						member.DiscriminatorValue,
						err,
					)
				}
				if ok {
					entry.DefaultValuesByDiscriminator[member.DiscriminatorValue] = value
				}
			}
			if len(entry.DefaultValuesByDiscriminator) == 0 {
				entry.DefaultValuesByDiscriminator = nil
			}
		}
		entries = append(entries, entry)
	}

	sort.Slice(entries, func(i int, j int) bool {
		return entries[i].BaseType < entries[j].BaseType
	})
	return entries, nil
}

func DiscoveredRouteEntries() ([]RouteInventoryEntry, error) {
	entries := map[string]RouteInventoryEntry{}

	add := func(routeName string, path string) error {
		enumName := routeInventoryName(routeName)
		if enumName == "" {
			return fmt.Errorf("shared routes: %s resolves to an empty route inventory name", routeName)
		}
		next := RouteInventoryEntry{
			Name:           enumName,
			Path:           path,
			SourceConstant: routeName,
		}
		if existing, ok := entries[enumName]; ok {
			if existing.Path != next.Path || existing.SourceConstant != next.SourceConstant {
				return fmt.Errorf(
					"shared routes: duplicate route inventory name %q for %s and %s",
					enumName,
					existing.SourceConstant,
					next.SourceConstant,
				)
			}
			return nil
		}
		entries[enumName] = next
		return nil
	}

	for _, route := range httpapi.DiscoveredRouteConstants() {
		if err := add(route.Name, route.Path); err != nil {
			return nil, err
		}
	}
	for _, route := range wsapi.DiscoveredRouteConstants() {
		if err := add(route.Name, route.Path); err != nil {
			return nil, err
		}
	}

	routes := make([]RouteInventoryEntry, 0, len(entries))
	for _, entry := range entries {
		routes = append(routes, entry)
	}
	sort.Slice(routes, func(i int, j int) bool {
		return routes[i].Name < routes[j].Name
	})
	return routes, nil
}

func contractKindForType(t reflect.Type) string {
	t = canonicalType(t)
	if t == nil {
		return "unknown"
	}
	if values, ok, err := discoveredEnumValues(t); err == nil && ok && len(values) > 0 {
		return "enum"
	}
	switch t.Kind() {
	case reflect.Struct:
		return "model"
	default:
		return "alias"
	}
}

func discriminatedFamilyMembers(
	family frontendbindingmeta.DiscriminatedObjectFamily,
	allTypes []reflect.Type,
) ([]DiscriminatedFamilyMemberEntry, error) {
	baseType := canonicalType(family.BaseType)
	if baseType == nil {
		return nil, nil
	}
	suffix := strings.TrimSpace(family.ConcreteTypeSuffix)
	if suffix == "" {
		return nil, fmt.Errorf("shared sidecar family %s is missing discriminator metadata", ContractNameForType(baseType))
	}

	enumValues, ok, err := discoveredEnumValues(family.EnumType)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("shared sidecar family %s enum %s has no discovered values", ContractNameForType(baseType), family.EnumType)
	}

	byPackageAndName := map[string]reflect.Type{}
	for _, t := range allTypes {
		t = canonicalType(t)
		if t == nil {
			continue
		}
		byPackageAndName[t.PkgPath()+":"+t.Name()] = t
	}

	members := []DiscriminatedFamilyMemberEntry{}
	for _, enumValue := range enumValues {
		candidate, ok := byPackageAndName[baseType.PkgPath()+":"+"Frontend"+enumValue.Value+suffix]
		if !ok {
			continue
		}
		value, ok := family.DiscriminatorValue(candidate)
		if !ok || value != enumValue.Value {
			return nil, fmt.Errorf(
				"shared sidecar family %s member %s does not resolve discriminator %q",
				ContractNameForType(baseType),
				candidate,
				enumValue.Value,
			)
		}
		if !frontendbindingmeta.ContractTypeEmbedsAnonymousField(candidate, baseType) {
			return nil, fmt.Errorf(
				"shared sidecar family %s member %s does not embed %s",
				ContractNameForType(baseType),
				candidate,
				ContractNameForType(baseType),
			)
		}
		members = append(members, DiscriminatedFamilyMemberEntry{
			Name:               ContractNameForType(candidate),
			DiscriminatorValue: enumValue.Value,
		})
	}
	return members, nil
}

func discriminatedFamilyTraits(
	family frontendbindingmeta.DiscriminatedObjectFamily,
	members []DiscriminatedFamilyMemberEntry,
	allTypes []reflect.Type,
) []DiscriminatedTraitEntry {
	if len(members) == 0 || len(family.Traits) == 0 {
		return nil
	}

	typesByName := map[string]reflect.Type{}
	for _, t := range allTypes {
		name := strings.TrimSpace(ContractNameForType(t))
		if name == "" {
			continue
		}
		typesByName[name] = canonicalType(t)
	}

	entries := make([]DiscriminatedTraitEntry, 0, len(family.Traits))
	for _, trait := range family.Traits {
		unionName := strings.TrimSpace(trait.UnionName)
		if unionName == "" {
			continue
		}
		memberTypes := []string{}
		for _, member := range members {
			memberType := typesByName[member.Name]
			if memberType == nil {
				continue
			}
			if trait.EmbeddedFieldType != nil &&
				!frontendbindingmeta.ContractTypeEmbedsAnonymousField(memberType, trait.EmbeddedFieldType) {
				continue
			}
			memberTypes = append(memberTypes, member.Name)
		}
		if len(memberTypes) == 0 {
			continue
		}
		slices.Sort(memberTypes)
		entries = append(entries, DiscriminatedTraitEntry{
			UnionName:   unionName,
			LocalUnion:  trait.LocalUnion,
			IncludeBase: trait.IncludeBase,
			MemberTypes: memberTypes,
		})
	}
	sort.Slice(entries, func(i int, j int) bool {
		return entries[i].UnionName < entries[j].UnionName
	})
	return entries
}

func routeInventoryName(routeName string) string {
	trimmed := strings.TrimSpace(routeName)
	trimmed = strings.TrimPrefix(trimmed, "Route")
	if trimmed == "" {
		return ""
	}
	words := splitRouteWords(trimmed)
	if len(words) == 0 {
		return ""
	}
	for index, word := range words {
		words[index] = strings.ToUpper(word)
	}
	return strings.Join(words, "_")
}

func splitRouteWords(name string) []string {
	runes := []rune(strings.TrimSpace(name))
	if len(runes) == 0 {
		return nil
	}

	words := []string{}
	start := 0
	for index := 1; index < len(runes); index++ {
		prev := runes[index-1]
		curr := runes[index]
		next := rune(0)
		if index+1 < len(runes) {
			next = runes[index+1]
		}

		if unicode.IsUpper(curr) && unicode.IsLower(prev) {
			words = append(words, string(runes[start:index]))
			start = index
			continue
		}
		if unicode.IsUpper(curr) && unicode.IsUpper(prev) && next != 0 && unicode.IsLower(next) {
			words = append(words, string(runes[start:index]))
			start = index
			continue
		}
	}

	words = append(words, string(runes[start:]))
	return words
}
