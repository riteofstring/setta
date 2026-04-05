package sharedtypes

import (
	"fmt"
	"reflect"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"

	"setta/internal/frontendbindingmeta"
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

	return &jsonschema.Schema{
		Schema: JSONSchemaDraft202012,
		ID:     SchemaDocumentID,
		Defs:   defs,
		Extra: map[string]any{
			"x-setta-schema-kind": "non-http-shared-types",
		},
	}, nil
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
	for t != nil && t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || schema == nil {
		return nil
	}

	if enumSchema, ok, err := enumSchemaForType(t); err != nil {
		return err
	} else if ok {
		*schema = *enumSchema
		return nil
	}
	if unionSchema, ok, err := unionSchemaForType(t); err != nil {
		return err
	} else if ok {
		*schema = *unionSchema
		return nil
	}

	switch t.Kind() {
	case reflect.Slice, reflect.Array:
		if schema.Items != nil {
			return normalizeSchemaForType(t.Elem(), schema.Items)
		}
	case reflect.Map:
		if schema.AdditionalProperties != nil {
			return normalizeSchemaForType(t.Elem(), schema.AdditionalProperties)
		}
	case reflect.Struct:
		for index := 0; index < t.NumField(); index++ {
			field := t.Field(index)
			if !field.IsExported() || field.Tag.Get("json") == "-" {
				continue
			}
			propertyName, ok := jsonFieldName(field)
			if !ok {
				continue
			}
			propertySchema := schema.Properties[propertyName]
			if propertySchema == nil {
				continue
			}
			if overriddenSchema, overridden, err := sharedSchemaOverrideForField(field, propertySchema); err != nil {
				return fmt.Errorf("%s.%s: %w", t, field.Name, err)
			} else if overridden {
				schema.Properties[propertyName] = overriddenSchema
				continue
			}
			if err := normalizeSchemaForType(field.Type, propertySchema); err != nil {
				return fmt.Errorf("%s.%s: %w", t, field.Name, err)
			}
		}
	}

	return nil
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
