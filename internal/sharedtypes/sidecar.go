package sharedtypes

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"sort"
	"strings"
	"unicode"

	"setta/internal/frontendbindingmeta"
	"setta/internal/httpapi"
	"setta/internal/sharedvalueexports"
	"setta/internal/wsapi"
)

type SemanticSidecar struct {
	SchemaVersion         int                        `json:"schemaVersion"`
	Contracts             []ContractEntry            `json:"contracts"`
	Routes                []RouteInventoryEntry      `json:"routes"`
	Defaults              []DefaultEntry             `json:"defaults,omitempty"`
	ExportedValues        []ExportedValueEntry       `json:"exportedValues,omitempty"`
	DiscriminatedUnions   []DiscriminatedUnionEntry  `json:"discriminatedUnions,omitempty"`
	DiscriminatedFamilies []DiscriminatedFamilyEntry `json:"discriminatedFamilies,omitempty"`
}

type ContractEntry struct {
	Name       string           `json:"name"`
	Kind       string           `json:"kind"`
	SchemaRef  string           `json:"schemaRef,omitempty"`
	EnumValues []EnumValueEntry `json:"enumValues,omitempty"`
}

type EnumValueEntry struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type RouteInventoryEntry struct {
	Name           string `json:"name"`
	Path           string `json:"path"`
	SourceConstant string `json:"sourceConstant"`
}

type DefaultEntry struct {
	Profile string `json:"profile,omitempty"`
	Type    string `json:"type"`
	Value   any    `json:"value"`
}

type ExportedValueEntry struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Value any    `json:"value"`
}

type DiscriminatedUnionEntry struct {
	Name               string                          `json:"name"`
	EnumType           string                          `json:"enumType,omitempty"`
	DiscriminatorField string                          `json:"discriminatorField"`
	Members            []DiscriminatedUnionMemberEntry `json:"members"`
}

type DiscriminatedUnionMemberEntry struct {
	Name               string `json:"name"`
	DiscriminatorValue string `json:"discriminatorValue"`
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
	routes, err := DiscoveredRouteEntries()
	if err != nil {
		return SemanticSidecar{}, err
	}
	contracts, err := buildContractEntries(routes)
	if err != nil {
		return SemanticSidecar{}, err
	}
	families, err := buildDiscriminatedFamilyEntries()
	if err != nil {
		return SemanticSidecar{}, err
	}
	discriminatedUnions, err := buildDiscriminatedUnionEntries()
	if err != nil {
		return SemanticSidecar{}, err
	}

	return SemanticSidecar{
		SchemaVersion:         1,
		Contracts:             contracts,
		Routes:                routes,
		Defaults:              buildDefaultEntries(),
		ExportedValues:        buildExportedValueEntries(),
		DiscriminatedUnions:   discriminatedUnions,
		DiscriminatedFamilies: families,
	}, nil
}

func NormalizeSemanticSidecarForJSON(sidecar SemanticSidecar) (SemanticSidecar, error) {
	normalized := sidecar
	var err error
	if normalized.Defaults, err = normalizeSidecarEntries(
		sidecar.Defaults,
		normalizeSemanticSidecarDefaultEntry,
	); err != nil {
		return SemanticSidecar{}, err
	}
	if normalized.ExportedValues, err = normalizeSidecarEntries(
		sidecar.ExportedValues,
		normalizeSemanticSidecarExportedValueEntry,
	); err != nil {
		return SemanticSidecar{}, err
	}
	if normalized.DiscriminatedFamilies, err = normalizeSidecarEntries(
		sidecar.DiscriminatedFamilies,
		normalizeSemanticSidecarDiscriminatedFamilyEntry,
	); err != nil {
		return SemanticSidecar{}, err
	}

	return normalized, nil
}

func normalizeSemanticSidecarDefaultEntry(entry DefaultEntry) (DefaultEntry, error) {
	value, err := normalizeSemanticSidecarValue(entry.Value)
	if err != nil {
		return DefaultEntry{}, fmt.Errorf(
			"shared sidecar default %s profile %s: %w",
			entry.Type,
			entry.Profile,
			err,
		)
	}
	entry.Value = value
	return entry, nil
}

func normalizeSemanticSidecarExportedValueEntry(entry ExportedValueEntry) (ExportedValueEntry, error) {
	value, err := normalizeSemanticSidecarValue(entry.Value)
	if err != nil {
		return ExportedValueEntry{}, fmt.Errorf("shared sidecar export %s: %w", entry.Name, err)
	}
	entry.Value = value
	return entry, nil
}

func normalizeSemanticSidecarDiscriminatedFamilyEntry(
	family DiscriminatedFamilyEntry,
) (DiscriminatedFamilyEntry, error) {
	if len(family.DefaultValuesByDiscriminator) == 0 {
		return family, nil
	}
	defaults := make(map[string]any, len(family.DefaultValuesByDiscriminator))
	for discriminatorValue, value := range family.DefaultValuesByDiscriminator {
		normalizedValue, err := normalizeSemanticSidecarValue(value)
		if err != nil {
			return DiscriminatedFamilyEntry{}, fmt.Errorf(
				"shared sidecar family %s discriminator %q default: %w",
				family.BaseType,
				discriminatorValue,
				err,
			)
		}
		defaults[discriminatorValue] = normalizedValue
	}
	family.DefaultValuesByDiscriminator = defaults
	return family, nil
}

func normalizeSidecarEntries[T any](entries []T, normalize func(T) (T, error)) ([]T, error) {
	if len(entries) == 0 {
		return entries, nil
	}
	normalized := make([]T, len(entries))
	for index, entry := range entries {
		next, err := normalize(entry)
		if err != nil {
			return nil, err
		}
		normalized[index] = next
	}
	return normalized, nil
}

func buildContractEntries(routes []RouteInventoryEntry) ([]ContractEntry, error) {
	entries := make([]ContractEntry, 0, len(DiscoveredTypes())+1)
	for _, t := range DiscoveredTypes() {
		name := strings.TrimSpace(ContractNameForType(t))
		if name == "" {
			continue
		}
		kind := contractKindForType(t)
		entry := ContractEntry{
			Name:      name,
			Kind:      kind,
			SchemaRef: "#/$defs/" + name,
		}
		if kind == "enum" {
			enumValues, ok, err := discoveredEnumValues(t)
			if err != nil {
				return nil, err
			}
			if !ok || len(enumValues) == 0 {
				return nil, fmt.Errorf("shared sidecar enum %s has no discovered values", name)
			}
			entry.EnumValues = make([]EnumValueEntry, 0, len(enumValues))
			for _, enumValue := range enumValues {
				entry.EnumValues = append(entry.EnumValues, EnumValueEntry{
					Name:  enumValue.Name,
					Value: enumValue.Value,
				})
			}
		}
		entries = append(entries, entry)
	}
	if len(routes) > 0 {
		entries = append(entries, routeInventoryContractEntry(routes))
	}
	sort.Slice(entries, func(i int, j int) bool {
		return entries[i].Name < entries[j].Name
	})
	return entries, nil
}

func routeInventoryContractEntry(routes []RouteInventoryEntry) ContractEntry {
	entry := ContractEntry{
		Name:       "Route",
		Kind:       "enum",
		SchemaRef:  "#/$defs/Route",
		EnumValues: make([]EnumValueEntry, 0, len(routes)),
	}
	for _, route := range routes {
		entry.EnumValues = append(entry.EnumValues, EnumValueEntry{
			Name:  route.Name,
			Value: route.Path,
		})
	}
	return entry
}

func buildDefaultEntries() []DefaultEntry {
	entries := []DefaultEntry{}
	for profile, providersByType := range DefaultValueProvidersByProfile() {
		for _, t := range DiscoveredTypes() {
			provider, ok := providersByType[t]
			if !ok || provider == nil {
				continue
			}
			name := strings.TrimSpace(ContractNameForType(t))
			if name == "" {
				continue
			}
			entries = append(entries, DefaultEntry{
				Profile: profile,
				Type:    name,
				Value:   provider(),
			})
		}
	}
	sort.Slice(entries, func(i int, j int) bool {
		if entries[i].Type == entries[j].Type {
			return entries[i].Profile < entries[j].Profile
		}
		return entries[i].Type < entries[j].Type
	})
	return entries
}

func buildExportedValueEntries() []ExportedValueEntry {
	exports := sharedvalueexports.DiscoveredValueExports()
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
	typeIndex := newDiscriminatedFamilyTypeIndex(allTypes)
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

		resolvedMembers, err := resolveDiscriminatedFamilyMembers(family, typeIndex)
		if err != nil {
			return nil, err
		}
		members := resolvedDiscriminatedFamilyMemberEntries(resolvedMembers)
		entry := DiscriminatedFamilyEntry{
			BaseType:           ContractNameForType(baseType),
			EnumType:           ContractNameForType(family.EnumType),
			DiscriminatorField: strings.TrimSpace(family.DiscriminatorField),
			Members:            members,
		}
		entry.Traits = buildDiscriminatedFamilyTraits(family, resolvedMembers)
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

type discriminatedFamilyTypeIndex struct {
	byPackageAndKey map[string]reflect.Type
}

type resolvedDiscriminatedFamilyMember struct {
	entry DiscriminatedFamilyMemberEntry
	typ   reflect.Type
}

func newDiscriminatedFamilyTypeIndex(allTypes []reflect.Type) discriminatedFamilyTypeIndex {
	index := discriminatedFamilyTypeIndex{
		byPackageAndKey: make(map[string]reflect.Type, len(allTypes)),
	}
	for _, candidate := range allTypes {
		t := canonicalType(candidate)
		if t == nil {
			continue
		}
		index.byPackageAndKey[discriminatedFamilyPackageKey(t.PkgPath(), t.Name())] = t
	}
	return index
}

func discriminatedFamilyPackageKey(pkgPath string, typeName string) string {
	return pkgPath + ":" + typeName
}

func (index discriminatedFamilyTypeIndex) candidateType(
	baseType reflect.Type,
	discriminatorValue string,
	suffix string,
) reflect.Type {
	if baseType == nil {
		return nil
	}
	return index.byPackageAndKey[discriminatedFamilyPackageKey(baseType.PkgPath(), "Frontend"+discriminatorValue+suffix)]
}

func resolvedDiscriminatedFamilyMemberEntries(
	members []resolvedDiscriminatedFamilyMember,
) []DiscriminatedFamilyMemberEntry {
	entries := make([]DiscriminatedFamilyMemberEntry, len(members))
	for index, member := range members {
		entries[index] = member.entry
	}
	return entries
}

func discriminatedFamilyMembers(
	family frontendbindingmeta.DiscriminatedObjectFamily,
	allTypes []reflect.Type,
) ([]DiscriminatedFamilyMemberEntry, error) {
	resolvedMembers, err := resolveDiscriminatedFamilyMembers(family, newDiscriminatedFamilyTypeIndex(allTypes))
	if err != nil {
		return nil, err
	}
	return resolvedDiscriminatedFamilyMemberEntries(resolvedMembers), nil
}

func resolveDiscriminatedFamilyMembers(
	family frontendbindingmeta.DiscriminatedObjectFamily,
	typeIndex discriminatedFamilyTypeIndex,
) ([]resolvedDiscriminatedFamilyMember, error) {
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

	members := make([]resolvedDiscriminatedFamilyMember, 0, len(enumValues))
	for _, enumValue := range enumValues {
		candidate := typeIndex.candidateType(baseType, enumValue.Value, suffix)
		if candidate == nil {
			continue
		}
		if err := validateDiscriminatedFamilyMember(baseType, family, candidate, enumValue.Value); err != nil {
			return nil, err
		}
		members = append(members, resolvedDiscriminatedFamilyMember{
			entry: DiscriminatedFamilyMemberEntry{
				Name:               ContractNameForType(candidate),
				DiscriminatorValue: enumValue.Value,
			},
			typ: candidate,
		})
	}
	return members, nil
}

func validateDiscriminatedFamilyMember(
	baseType reflect.Type,
	family frontendbindingmeta.DiscriminatedObjectFamily,
	candidate reflect.Type,
	discriminatorValue string,
) error {
	value, ok := family.DiscriminatorValue(candidate)
	if !ok || value != discriminatorValue {
		return fmt.Errorf(
			"shared sidecar family %s member %s does not resolve discriminator %q",
			ContractNameForType(baseType),
			candidate,
			discriminatorValue,
		)
	}
	if frontendbindingmeta.ContractTypeEmbedsAnonymousField(candidate, baseType) {
		return nil
	}
	return fmt.Errorf(
		"shared sidecar family %s member %s does not embed %s",
		ContractNameForType(baseType),
		candidate,
		ContractNameForType(baseType),
	)
}

func buildDiscriminatedFamilyTraits(
	family frontendbindingmeta.DiscriminatedObjectFamily,
	members []resolvedDiscriminatedFamilyMember,
) []DiscriminatedTraitEntry {
	if len(members) == 0 || len(family.Traits) == 0 {
		return nil
	}

	entries := make([]DiscriminatedTraitEntry, 0, len(family.Traits))
	for _, trait := range family.Traits {
		entry, ok := buildDiscriminatedTraitEntry(trait, members)
		if !ok {
			continue
		}
		entries = append(entries, entry)
	}
	sort.Slice(entries, func(i int, j int) bool {
		return entries[i].UnionName < entries[j].UnionName
	})
	return entries
}

func buildDiscriminatedTraitEntry(
	trait frontendbindingmeta.DiscriminatedObjectTraitSpec,
	members []resolvedDiscriminatedFamilyMember,
) (DiscriminatedTraitEntry, bool) {
	unionName := strings.TrimSpace(trait.UnionName)
	if unionName == "" {
		return DiscriminatedTraitEntry{}, false
	}
	memberTypes := discriminatedTraitMemberTypes(trait, members)
	if len(memberTypes) == 0 {
		return DiscriminatedTraitEntry{}, false
	}
	return DiscriminatedTraitEntry{
		UnionName:   unionName,
		LocalUnion:  trait.LocalUnion,
		IncludeBase: trait.IncludeBase,
		MemberTypes: memberTypes,
	}, true
}

func discriminatedTraitMemberTypes(
	trait frontendbindingmeta.DiscriminatedObjectTraitSpec,
	members []resolvedDiscriminatedFamilyMember,
) []string {
	memberTypes := make([]string, 0, len(members))
	for _, member := range members {
		if trait.EmbeddedFieldType != nil &&
			!frontendbindingmeta.ContractTypeEmbedsAnonymousField(member.typ, trait.EmbeddedFieldType) {
			continue
		}
		memberTypes = append(memberTypes, member.entry.Name)
	}
	slices.Sort(memberTypes)
	return memberTypes
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

func normalizeSemanticSidecarValue(value any) (any, error) {
	payload, err := marshalSemanticSidecarJSON(value)
	if err != nil {
		return nil, err
	}
	var normalized any
	if err := json.Unmarshal(payload, &normalized); err != nil {
		return nil, err
	}
	return mergeSemanticSidecarStructFields(reflect.ValueOf(value), normalized)
}

func marshalSemanticSidecarJSON(value any) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimSuffix(buffer.Bytes(), []byte("\n")), nil
}

func mergeSemanticSidecarStructFields(value reflect.Value, normalized any) (any, error) {
	value, terminal, done := semanticSidecarTerminalMergeValue(value, normalized)
	if done {
		return terminal, nil
	}

	object, ok := terminal.(map[string]any)
	if !ok {
		return terminal, nil
	}

	return mergeSemanticSidecarObjectFields(value, object)
}

func semanticSidecarTerminalMergeValue(value reflect.Value, normalized any) (reflect.Value, any, bool) {
	if !value.IsValid() {
		return reflect.Value{}, normalized, true
	}
	for value.Kind() == reflect.Interface || value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return reflect.Value{}, nil, true
		}
		value = value.Elem()
	}
	if value.Kind() != reflect.Struct {
		return reflect.Value{}, normalized, true
	}
	return value, normalized, false
}

func mergeSemanticSidecarObjectFields(value reflect.Value, object map[string]any) (map[string]any, error) {
	valueType := value.Type()
	for fieldIndex := 0; fieldIndex < valueType.NumField(); fieldIndex++ {
		field := valueType.Field(fieldIndex)
		if !field.IsExported() {
			continue
		}

		updatedObject, err := mergeSemanticSidecarObjectField(
			valueType,
			field,
			value.Field(fieldIndex),
			object,
		)
		if err != nil {
			return nil, err
		}
		object = updatedObject
	}
	return object, nil
}

func mergeSemanticSidecarObjectField(
	valueType reflect.Type,
	field reflect.StructField,
	fieldValue reflect.Value,
	object map[string]any,
) (map[string]any, error) {
	if field.Anonymous {
		return mergeSemanticSidecarEmbeddedObjectField(fieldValue, object)
	}

	name, skip := semanticSidecarJSONFieldName(field)
	if skip {
		return object, nil
	}

	existing, exists := object[name]
	mergedField, err := mergeSemanticSidecarNamedField(valueType, field, fieldValue, existing, exists)
	if err != nil {
		return nil, err
	}
	object[name] = mergedField
	return object, nil
}

func mergeSemanticSidecarEmbeddedObjectField(fieldValue reflect.Value, object map[string]any) (map[string]any, error) {
	merged, err := mergeSemanticSidecarStructFields(fieldValue, object)
	if err != nil {
		return nil, err
	}
	mergedObject, ok := merged.(map[string]any)
	if !ok {
		return object, nil
	}
	return mergedObject, nil
}

func mergeSemanticSidecarNamedField(
	valueType reflect.Type,
	field reflect.StructField,
	fieldValue reflect.Value,
	existing any,
	exists bool,
) (any, error) {
	if !exists {
		normalizedField, err := normalizeSemanticSidecarValue(fieldValue.Interface())
		if err != nil {
			return nil, fmt.Errorf("%s.%s: %w", valueType, field.Name, err)
		}
		return normalizedField, nil
	}

	mergedField, err := mergeSemanticSidecarStructFields(fieldValue, existing)
	if err != nil {
		return nil, fmt.Errorf("%s.%s: %w", valueType, field.Name, err)
	}
	return mergedField, nil
}

func semanticSidecarJSONFieldName(field reflect.StructField) (string, bool) {
	tag := field.Tag.Get("json")
	if tag == "-" {
		return "", true
	}
	if tag == "" {
		return field.Name, false
	}
	parts := strings.Split(tag, ",")
	name := strings.TrimSpace(parts[0])
	if name == "" {
		return field.Name, false
	}
	return name, false
}
