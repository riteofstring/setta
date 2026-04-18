package sharedtypes

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"

	"setta/internal/artifacts"
	"setta/internal/frontendbindingmeta"
	"setta/internal/projectstate"
	"setta/internal/stringenumvalues"
)

const (
	JSONSchemaDraft202012 = "https://json-schema.org/draft/2020-12/schema"
	SchemaDocumentID      = "https://setta.dev/schema/non-http-shared-types.json"
)

func BuildSchemaDocument() (*jsonschema.Schema, error) {
	defs := map[string]*jsonschema.Schema{}
	seenNames := map[string]reflect.Type{}

	for _, t := range DiscoveredTypes() {
		name := strings.TrimSpace(ContractNameForType(t))
		if name == "" {
			continue
		}
		if previous, ok := seenNames[name]; ok && previous != t {
			return nil, fmt.Errorf("shared schema contract name %q conflicts between %s and %s", name, previous, t)
		}

		schema, err := schemaForType(t)
		if err != nil {
			return nil, fmt.Errorf("shared schema %s: %w", name, err)
		}
		schema.Title = name
		defs[name] = schema
		seenNames[name] = t
	}
	if err := appendSyntheticDiscriminatedFamilyUnionDefs(defs); err != nil {
		return nil, err
	}
	if err := appendRouteInventorySchema(defs); err != nil {
		return nil, err
	}

	return &jsonschema.Schema{
		Schema: JSONSchemaDraft202012,
		ID:     SchemaDocumentID,
		Defs:   defs,
		Extra: map[string]any{
			"x-setta-schema-kind": "non-http-shared-types",
		},
	}, nil
}

func appendRouteInventorySchema(defs map[string]*jsonschema.Schema) error {
	routes, err := DiscoveredRouteEntries()
	if err != nil {
		return err
	}
	routeContract := routeInventoryContractEntry(routes)
	if strings.TrimSpace(routeContract.Name) == "" {
		return fmt.Errorf("shared schema route inventory contract is missing a name")
	}
	enumValues := make([]any, 0, len(routeContract.EnumValues))
	enumNames := make([]string, 0, len(routeContract.EnumValues))
	for _, value := range routeContract.EnumValues {
		enumValues = append(enumValues, value.Value)
		enumNames = append(enumNames, value.Name)
	}
	defs[routeContract.Name] = &jsonschema.Schema{
		Title: routeContract.Name,
		Type:  "string",
		Enum:  enumValues,
		Extra: map[string]any{
			"x-enum-varnames": enumNames,
			"x-enumNames":     enumNames,
		},
	}
	return nil
}

func schemaForType(t reflect.Type) (*jsonschema.Schema, error) {
	t = canonicalType(t)
	if t == nil {
		return &jsonschema.Schema{}, nil
	}

	if unionSchema, ok, err := unionSchemaForType(t); err != nil {
		return nil, err
	} else if ok {
		return unionSchema, nil
	}
	if specialSchema, ok, err := specialSchemaForType(t); err != nil {
		return nil, err
	} else if ok {
		return specialSchema, nil
	}

	schema, err := jsonschema.ForType(t, &jsonschema.ForOptions{
		IgnoreInvalidTypes: false,
	})
	if err != nil {
		return nil, err
	}

	if err := normalizeSchemaForType(t, schema); err != nil {
		return nil, err
	}

	return schema, nil
}

func normalizeSchemaForType(t reflect.Type, schema *jsonschema.Schema) error {
	t = canonicalType(t)
	if t == nil || schema == nil {
		return nil
	}

	if authoritativeSchema, ok, err := authoritativeSchemaForType(t); err != nil {
		return err
	} else if ok {
		*schema = *authoritativeSchema
		return nil
	}

	return normalizeSchemaByKind(t, schema)
}

func authoritativeSchemaForType(t reflect.Type) (*jsonschema.Schema, bool, error) {
	if enumSchema, ok, err := enumSchemaForType(t); err != nil || ok {
		return enumSchema, ok, err
	}
	return unionSchemaForType(t)
}

func normalizeSchemaByKind(t reflect.Type, schema *jsonschema.Schema) error {
	switch t.Kind() {
	case reflect.Slice, reflect.Array:
		return normalizeCollectionSchema(t.Elem(), schema)
	case reflect.Map:
		return normalizeMapSchema(t.Elem(), schema)
	case reflect.Struct:
		return normalizeStructSchema(t, schema)
	}

	return nil
}

func normalizeCollectionSchema(elemType reflect.Type, schema *jsonschema.Schema) error {
	if schema == nil || schema.Items == nil {
		return nil
	}
	itemSchema, err := normalizedNestedSchemaForType(elemType, schema.Items)
	if err != nil {
		return err
	}
	schema.Items = itemSchema
	return nil
}

func normalizeMapSchema(elemType reflect.Type, schema *jsonschema.Schema) error {
	if schema == nil || schema.AdditionalProperties == nil {
		return nil
	}
	valueSchema, err := normalizedNestedSchemaForType(elemType, schema.AdditionalProperties)
	if err != nil {
		return err
	}
	schema.AdditionalProperties = valueSchema
	return nil
}

func normalizeStructSchema(t reflect.Type, schema *jsonschema.Schema) error {
	if schema == nil {
		return nil
	}
	for index := 0; index < t.NumField(); index++ {
		field := t.Field(index)
		if !field.IsExported() {
			continue
		}
		if err := normalizeStructFieldSchema(t, field, schema); err != nil {
			return err
		}
	}
	return nil
}

func normalizeStructFieldSchema(
	ownerType reflect.Type,
	field reflect.StructField,
	schema *jsonschema.Schema,
) error {
	propertyName, ok := jsonFieldName(field)
	if !ok {
		return nil
	}
	propertySchema := schema.Properties[propertyName]
	if propertySchema == nil {
		return nil
	}
	normalizedSchema, err := normalizedSchemaForField(field, propertySchema)
	if err != nil {
		return fmt.Errorf("%s.%s: %w", ownerType, field.Name, err)
	}
	schema.Properties[propertyName] = normalizedSchema
	if err := applySchemaDefaultForField(ownerType, field, normalizedSchema); err != nil {
		return fmt.Errorf("%s.%s: %w", ownerType, field.Name, err)
	}
	if err := applySchemaNullabilityForField(ownerType, field, normalizedSchema); err != nil {
		return fmt.Errorf("%s.%s: %w", ownerType, field.Name, err)
	}
	return nil
}

func normalizedSchemaForField(
	field reflect.StructField,
	existing *jsonschema.Schema,
) (*jsonschema.Schema, error) {
	if overriddenSchema, overridden, err := sharedSchemaOverrideForField(field, existing); err != nil {
		return nil, err
	} else if overridden {
		return overriddenSchema, nil
	}
	return normalizedNestedSchemaForType(field.Type, existing)
}

func normalizedNestedSchemaForType(
	t reflect.Type,
	existing *jsonschema.Schema,
) (*jsonschema.Schema, error) {
	if existing == nil {
		return nil, nil
	}
	if refSchema, ok, err := nestedSharedSchemaForType(t, schemaAllowsNull(existing)); err != nil {
		return nil, err
	} else if ok {
		return refSchema, nil
	}
	if err := normalizeSchemaForType(t, existing); err != nil {
		return nil, err
	}
	return existing, nil
}

func applySchemaDefaultForField(
	ownerType reflect.Type,
	field reflect.StructField,
	propertySchema *jsonschema.Schema,
) error {
	if propertySchema == nil || len(propertySchema.Default) > 0 {
		return nil
	}
	defaultValue, ok, err := schemaDefaultValueForField(ownerType, field)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}
	payload, err := json.Marshal(defaultValue)
	if err != nil {
		return fmt.Errorf("marshal schema default: %w", err)
	}
	propertySchema.Default = json.RawMessage(payload)
	return nil
}

func schemaDefaultValueForField(
	ownerType reflect.Type,
	field reflect.StructField,
) (any, bool, error) {
	defaultTag := strings.TrimSpace(field.Tag.Get("py_default"))
	if defaultTag == "" {
		return nil, false, nil
	}

	if defaultValue, ok, err := schemaTaggedDefaultValue(ownerType, field, defaultTag); err != nil || ok {
		return defaultValue, ok, err
	}
	if scalarValue, ok := schemaParsedScalarDefaultValue(defaultTag); ok {
		return scalarValue, true, nil
	}
	if enumValue, ok, err := schemaEnumDefaultValue(field.Type, defaultTag); err != nil {
		return nil, false, err
	} else if ok {
		return enumValue, true, nil
	}

	return nil, false, nil
}

func applySchemaNullabilityForField(
	ownerType reflect.Type,
	field reflect.StructField,
	propertySchema *jsonschema.Schema,
) error {
	if propertySchema == nil {
		return nil
	}
	nonNull, ok, err := sharedSchemaNonNullForField(field)
	if err != nil {
		return err
	}
	if !ok || !nonNull {
		return nil
	}
	makeSchemaNonNull(propertySchema)
	return nil
}

func sharedSchemaNonNullForField(field reflect.StructField) (bool, bool, error) {
	rawValue := strings.TrimSpace(field.Tag.Get("shared_schema_non_null"))
	if rawValue == "" {
		return false, false, nil
	}
	parsed, err := strconv.ParseBool(rawValue)
	if err != nil {
		return false, false, fmt.Errorf("parse shared_schema_non_null: %w", err)
	}
	return parsed, true, nil
}

func makeSchemaNonNull(schema *jsonschema.Schema) {
	if schema == nil {
		return
	}
	if len(schema.Types) > 0 {
		filteredTypes := make([]string, 0, len(schema.Types))
		for _, schemaType := range schema.Types {
			if schemaType == "null" {
				continue
			}
			filteredTypes = append(filteredTypes, schemaType)
		}
		switch len(filteredTypes) {
		case 0:
			schema.Type = ""
			schema.Types = nil
		case 1:
			schema.Type = filteredTypes[0]
			schema.Types = nil
		default:
			schema.Type = ""
			schema.Types = filteredTypes
		}
	}
	if schema.Type == "null" {
		schema.Type = ""
	}
	if len(schema.AnyOf) > 0 {
		schema.AnyOf = filterNonNullSchemaMembers(schema.AnyOf)
	}
	if len(schema.OneOf) > 0 {
		schema.OneOf = filterNonNullSchemaMembers(schema.OneOf)
	}
}

func filterNonNullSchemaMembers(members []*jsonschema.Schema) []*jsonschema.Schema {
	filtered := make([]*jsonschema.Schema, 0, len(members))
	for _, member := range members {
		if schemaIsNullOnly(member) {
			continue
		}
		filtered = append(filtered, member)
	}
	return filtered
}

func schemaIsNullOnly(schema *jsonschema.Schema) bool {
	if schema == nil {
		return false
	}
	if schema.Type == "null" {
		return true
	}
	return len(schema.Types) == 1 && schema.Types[0] == "null"
}

func schemaTaggedDefaultValue(
	ownerType reflect.Type,
	field reflect.StructField,
	defaultTag string,
) (any, bool, error) {
	switch defaultTag {
	case "go_value":
		return schemaGoDefaultValueForField(ownerType, field)
	case "factory:list":
		return []any{}, true, nil
	case "factory:dict":
		return map[string]any{}, true, nil
	case "True":
		return true, true, nil
	case "False":
		return false, true, nil
	case "None":
		return nil, true, nil
	default:
		return nil, false, nil
	}
}

func schemaParsedScalarDefaultValue(defaultTag string) (any, bool) {
	if unquoted, err := strconv.Unquote(defaultTag); err == nil {
		return unquoted, true
	}
	if integerValue, err := strconv.ParseInt(defaultTag, 10, 64); err == nil {
		return integerValue, true
	}
	if floatValue, err := strconv.ParseFloat(defaultTag, 64); err == nil {
		return floatValue, true
	}
	return nil, false
}

func schemaGoDefaultValueForField(
	ownerType reflect.Type,
	field reflect.StructField,
) (any, bool, error) {
	provider, ok := DefaultValueProviderForProfile(DefaultProfileFrontend, ownerType)
	if !ok || provider == nil {
		return reflect.Zero(field.Type).Interface(), true, nil
	}
	defaultValue, ok := schemaStructFieldValue(reflect.ValueOf(provider()), field.Index)
	if !ok {
		return reflect.Zero(field.Type).Interface(), true, nil
	}
	return defaultValue.Interface(), true, nil
}

func schemaStructFieldValue(value reflect.Value, fieldIndex []int) (reflect.Value, bool) {
	for _, index := range fieldIndex {
		for value.IsValid() && value.Kind() == reflect.Pointer {
			if value.IsNil() {
				return reflect.Value{}, false
			}
			value = value.Elem()
		}
		if !value.IsValid() || value.Kind() != reflect.Struct || index >= value.NumField() {
			return reflect.Value{}, false
		}
		value = value.Field(index)
	}
	if !value.IsValid() {
		return reflect.Value{}, false
	}
	return value, true
}

func schemaEnumDefaultValue(
	fieldType reflect.Type,
	defaultExpr string,
) (string, bool, error) {
	fieldType = canonicalType(fieldType)
	if !schemaSupportsEnumDefault(fieldType) {
		return "", false, nil
	}

	memberName, ok := schemaEnumDefaultMemberName(fieldType, defaultExpr)
	if !ok {
		return "", false, nil
	}

	values, ok, err := stringenumvalues.Default().Values(fieldType)
	if err != nil || !ok {
		return "", false, err
	}
	enumValue, ok := schemaEnumValueByMember(values, memberName)
	return enumValue, ok, nil
}

func schemaSupportsEnumDefault(fieldType reflect.Type) bool {
	return fieldType != nil && fieldType.Kind() == reflect.String && fieldType.Name() != ""
}

func schemaEnumDefaultMemberName(fieldType reflect.Type, defaultExpr string) (string, bool) {
	typeName, memberName, ok := strings.Cut(defaultExpr, ".")
	if !ok || strings.TrimSpace(typeName) != fieldType.Name() {
		return "", false
	}
	memberName = strings.TrimSpace(memberName)
	return memberName, memberName != ""
}

func schemaEnumValueByMember(
	values []stringenumvalues.EnumValue,
	memberName string,
) (string, bool) {
	for _, value := range values {
		if value.Name == memberName {
			return value.Value, true
		}
	}
	return "", false
}

func enumSchemaForType(t reflect.Type) (*jsonschema.Schema, bool, error) {
	enumValues, ok, err := discoveredEnumValues(t)
	if err != nil || !ok {
		return nil, ok, err
	}
	schema := &jsonschema.Schema{
		Type: "string",
		Enum: make([]any, 0, len(enumValues)),
	}
	for _, value := range enumValues {
		schema.Enum = append(schema.Enum, value.Value)
	}
	return schema, true, nil
}

func unionSchemaForType(t reflect.Type) (*jsonschema.Schema, bool, error) {
	provider, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.UnionTypesProvider](t)
	if !ok {
		return nil, false, nil
	}
	memberTypes := provider.FrontendBindingUnionTypes()
	if len(memberTypes) == 0 {
		return nil, false, fmt.Errorf("%s returned no shared schema union members", t)
	}
	seenRefs := map[string]struct{}{}
	refs := make([]*jsonschema.Schema, 0, len(memberTypes))
	for _, memberType := range memberTypes {
		memberName := strings.TrimSpace(ContractNameForType(memberType))
		if memberName == "" {
			return nil, false, fmt.Errorf("%s returned a union member with no contract name: %v", t, memberType)
		}
		ref := "#/$defs/" + memberName
		if _, duplicate := seenRefs[ref]; duplicate {
			continue
		}
		seenRefs[ref] = struct{}{}
		refs = append(refs, &jsonschema.Schema{Ref: ref})
	}
	if len(refs) == 0 {
		return nil, false, fmt.Errorf("%s returned no renderable shared schema union members", t)
	}
	return &jsonschema.Schema{AnyOf: refs}, true, nil
}

func specialSchemaForType(t reflect.Type) (*jsonschema.Schema, bool, error) {
	t = canonicalType(t)
	switch t {
	case sharedSchemaTimeType:
		return &jsonschema.Schema{
			Type:   "string",
			Format: "date-time",
		}, true, nil
	case sharedSchemaRawJSONType:
		return rawJSONSchema(), true, nil
	case reflect.TypeOf(projectstate.SectionSizeValue{}):
		modeName := strings.TrimSpace(ContractNameForType(reflect.TypeOf(projectstate.SectionSizeMode(""))))
		if modeName == "" {
			return nil, false, fmt.Errorf("SectionSizeValue is missing SectionSizeMode contract")
		}
		return &jsonschema.Schema{
			AnyOf: []*jsonschema.Schema{
				{Type: "number"},
				{Ref: "#/$defs/" + modeName},
			},
		}, true, nil
	case reflect.TypeOf(artifacts.ChartDataValue{}):
		return &jsonschema.Schema{
			Type: "object",
			AdditionalProperties: &jsonschema.Schema{
				Type: "array",
				Items: &jsonschema.Schema{
					AnyOf: []*jsonschema.Schema{
						{Type: "string"},
						{Type: "number"},
					},
				},
			},
		}, true, nil
	default:
		return nil, false, nil
	}
}

func nestedSharedSchemaForType(t reflect.Type, nullable bool) (*jsonschema.Schema, bool, error) {
	baseType, isNullable := dereferenceSchemaType(t)
	if baseType == nil {
		return nil, false, nil
	}

	allowNull := nullable || isNullable
	if specialSchema, ok, err := nestedSpecialSchemaForType(baseType); err != nil {
		return nil, false, err
	} else if ok {
		return maybeNullableSchema(specialSchema, allowNull), true, nil
	}

	contractName := strings.TrimSpace(ContractNameForType(baseType))
	if contractName == "" {
		return nil, false, nil
	}
	if _, ok := TypeByContractName(contractName); !ok {
		return nil, false, nil
	}

	refSchema, err := sharedSchemaRefOrFamilyUnionSchema(contractName)
	if err != nil {
		return nil, false, err
	}
	return maybeNullableSchema(refSchema, allowNull), true, nil
}

func nestedSpecialSchemaForType(baseType reflect.Type) (*jsonschema.Schema, bool, error) {
	if baseType == sharedSchemaTimeType {
		return specialSchemaForType(baseType)
	}
	specialSchema, ok, err := specialSchemaForType(baseType)
	if err != nil || !ok {
		return nil, ok, err
	}
	if strings.TrimSpace(ContractNameForType(baseType)) != "" {
		return nil, false, nil
	}
	return specialSchema, true, nil
}

func maybeNullableSchema(schema *jsonschema.Schema, nullable bool) *jsonschema.Schema {
	if !nullable {
		return schema
	}
	return &jsonschema.Schema{
		AnyOf: []*jsonschema.Schema{
			schema,
			{Type: "null"},
		},
	}
}

func rawJSONSchema() *jsonschema.Schema {
	contractName := strings.TrimSpace(ContractNameForType(sharedSchemaRawJSONType))
	ref := "#/$defs/" + contractName
	return &jsonschema.Schema{
		AnyOf: []*jsonschema.Schema{
			{Type: "null"},
			{Type: "boolean"},
			{Type: "number"},
			{Type: "string"},
			{
				Type:  "array",
				Items: &jsonschema.Schema{Ref: ref},
			},
			{
				Type:                 "object",
				AdditionalProperties: &jsonschema.Schema{Ref: ref},
			},
		},
	}
}

func appendSyntheticDiscriminatedFamilyUnionDefs(defs map[string]*jsonschema.Schema) error {
	families, err := buildDiscriminatedFamilyEntries()
	if err != nil {
		return err
	}
	for _, family := range families {
		baseUnionName := strings.TrimSpace(family.BaseType) + "Union"
		if strings.TrimSpace(baseUnionName) == "Union" {
			continue
		}
		if _, exists := defs[baseUnionName]; !exists {
			defs[baseUnionName] = unionSchemaFromContractNames(
				append([]string{family.BaseType}, discriminatedFamilyMemberNames(family.Members)...)...,
			)
		}
		for _, trait := range family.Traits {
			if trait.LocalUnion {
				continue
			}
			unionName := strings.TrimSpace(trait.UnionName)
			if unionName == "" {
				continue
			}
			if _, exists := defs[unionName]; exists {
				continue
			}
			memberNames := append([]string(nil), trait.MemberTypes...)
			if trait.IncludeBase {
				memberNames = append([]string{family.BaseType}, memberNames...)
			}
			defs[unionName] = unionSchemaFromContractNames(memberNames...)
		}
	}
	return nil
}

func discriminatedFamilyMemberNames(members []DiscriminatedFamilyMemberEntry) []string {
	names := make([]string, 0, len(members))
	for _, member := range members {
		name := strings.TrimSpace(member.Name)
		if name == "" {
			continue
		}
		names = append(names, name)
	}
	return names
}

func unionSchemaFromContractNames(names ...string) *jsonschema.Schema {
	refs := make([]*jsonschema.Schema, 0, len(names))
	seenRefs := map[string]struct{}{}
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		ref := "#/$defs/" + name
		if _, exists := seenRefs[ref]; exists {
			continue
		}
		seenRefs[ref] = struct{}{}
		refs = append(refs, &jsonschema.Schema{Ref: ref})
	}
	return &jsonschema.Schema{AnyOf: refs}
}

func dereferenceSchemaType(t reflect.Type) (reflect.Type, bool) {
	nullable := false
	for t != nil && t.Kind() == reflect.Pointer {
		nullable = true
		t = t.Elem()
	}
	return canonicalType(t), nullable
}

func jsonFieldName(field reflect.StructField) (string, bool) {
	tag := strings.TrimSpace(field.Tag.Get("json"))
	if tag == "" {
		return field.Name, true
	}
	name := strings.TrimSpace(strings.Split(tag, ",")[0])
	if name == "" {
		return field.Name, true
	}
	if name == "-" {
		return "", false
	}
	return name, true
}

func discoveredEnumValues(t reflect.Type) ([]stringenumvalues.EnumValue, bool, error) {
	t = canonicalType(t)
	if t == nil || t.Kind() != reflect.String {
		return nil, false, nil
	}

	values, ok, err := stringenumvalues.Default().Values(t)
	if err != nil || !ok || len(values) == 0 {
		return values, ok, err
	}

	deduped := make([]stringenumvalues.EnumValue, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		key := value.Name + "\x00" + value.Value
		if _, duplicate := seen[key]; duplicate {
			continue
		}
		seen[key] = struct{}{}
		deduped = append(deduped, value)
	}
	return deduped, true, nil
}

type sharedSchemaFieldOverride struct {
	Ref         string
	ItemsRef    string
	MapValueRef string
}

func sharedSchemaOverrideForField(
	field reflect.StructField,
	existing *jsonschema.Schema,
) (*jsonschema.Schema, bool, error) {
	override, ok, err := parseSharedSchemaFieldOverride(field)
	if err != nil || !ok {
		return nil, ok, err
	}

	switch {
	case override.Ref != "":
		schema, err := sharedSchemaRefSchema(override.Ref, schemaAllowsNull(existing))
		return schema, err == nil, err
	case override.ItemsRef != "":
		refSchema, err := sharedSchemaRefSchema(override.ItemsRef, false)
		if err != nil {
			return nil, false, err
		}
		schema := &jsonschema.Schema{}
		if existing != nil {
			schema.Type = existing.Type
			schema.Types = append([]string(nil), existing.Types...)
		}
		schema.Items = refSchema
		return schema, true, nil
	case override.MapValueRef != "":
		refSchema, err := sharedSchemaRefSchema(override.MapValueRef, false)
		if err != nil {
			return nil, false, err
		}
		schema := &jsonschema.Schema{}
		if existing != nil {
			schema.Type = existing.Type
			schema.Types = append([]string(nil), existing.Types...)
		}
		schema.AdditionalProperties = refSchema
		return schema, true, nil
	default:
		return nil, false, nil
	}
}

func parseSharedSchemaFieldOverride(
	field reflect.StructField,
) (sharedSchemaFieldOverride, bool, error) {
	override := sharedSchemaFieldOverride{
		Ref:         strings.TrimSpace(field.Tag.Get("shared_schema_ref")),
		ItemsRef:    strings.TrimSpace(field.Tag.Get("shared_schema_items_ref")),
		MapValueRef: strings.TrimSpace(field.Tag.Get("shared_schema_map_value_ref")),
	}
	count := 0
	if override.Ref != "" {
		count++
	}
	if override.ItemsRef != "" {
		count++
	}
	if override.MapValueRef != "" {
		count++
	}
	if count == 0 {
		return sharedSchemaFieldOverride{}, false, nil
	}
	if count > 1 {
		return sharedSchemaFieldOverride{}, false, fmt.Errorf(
			"at most one of shared_schema_ref, shared_schema_items_ref, or shared_schema_map_value_ref may be set",
		)
	}
	return override, true, nil
}

func sharedSchemaRefSchema(contractName string, nullable bool) (*jsonschema.Schema, error) {
	name := strings.TrimSpace(contractName)
	if name == "" {
		return nil, fmt.Errorf("shared schema contract name is required")
	}
	if _, ok := TypeByContractName(name); !ok {
		return nil, fmt.Errorf("unknown shared schema contract %q", name)
	}
	refSchema, err := sharedSchemaRefOrFamilyUnionSchema(name)
	if err != nil {
		return nil, err
	}
	if !nullable {
		return refSchema, nil
	}
	return &jsonschema.Schema{
		AnyOf: []*jsonschema.Schema{
			refSchema,
			{Type: "null"},
		},
	}, nil
}

func sharedSchemaRefOrFamilyUnionSchema(contractName string) (*jsonschema.Schema, error) {
	if familySchema, ok, err := sharedSchemaDiscriminatedFamilyUnionSchema(contractName); err != nil {
		return nil, err
	} else if ok {
		return familySchema, nil
	}
	return &jsonschema.Schema{Ref: "#/$defs/" + contractName}, nil
}

func sharedSchemaDiscriminatedFamilyUnionSchema(contractName string) (*jsonschema.Schema, bool, error) {
	typ, ok := TypeByContractName(contractName)
	if !ok {
		return nil, false, nil
	}
	provider, ok := frontendbindingmeta.LookupProvider[frontendbindingmeta.DiscriminatedObjectFamilyProvider](typ)
	if !ok {
		return nil, false, nil
	}
	family := provider.FrontendBindingDiscriminatedObjectFamily()
	baseType := canonicalType(family.BaseType)
	if baseType == nil || ContractNameForType(baseType) != contractName {
		return nil, false, nil
	}
	members, err := discriminatedFamilyMembers(family, DiscoveredTypes())
	if err != nil {
		return nil, false, err
	}
	refs := []*jsonschema.Schema{{Ref: "#/$defs/" + contractName}}
	seenRefs := map[string]struct{}{refs[0].Ref: {}}
	for _, member := range members {
		ref := "#/$defs/" + strings.TrimSpace(member.Name)
		if ref == "#/$defs/" {
			continue
		}
		if _, duplicate := seenRefs[ref]; duplicate {
			continue
		}
		seenRefs[ref] = struct{}{}
		refs = append(refs, &jsonschema.Schema{Ref: ref})
	}
	return &jsonschema.Schema{AnyOf: refs}, true, nil
}

func schemaAllowsNull(schema *jsonschema.Schema) bool {
	if schema == nil {
		return false
	}
	if schema.Type == "null" {
		return true
	}
	for _, schemaType := range schema.Types {
		if schemaType == "null" {
			return true
		}
	}
	for _, member := range schema.AnyOf {
		if schemaAllowsNull(member) {
			return true
		}
	}
	for _, member := range schema.OneOf {
		if schemaAllowsNull(member) {
			return true
		}
	}
	return false
}
