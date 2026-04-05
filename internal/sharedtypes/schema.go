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
