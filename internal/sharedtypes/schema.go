package sharedtypes

import (
	"fmt"
	"reflect"
	"strings"

	"github.com/google/jsonschema-go/jsonschema"

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

	schema, err := jsonschema.ForType(t, &jsonschema.ForOptions{
		IgnoreInvalidTypes: false,
	})
	if err != nil {
		return nil, err
	}

	enumValues, ok, err := discoveredEnumValues(t)
	if err != nil {
		return nil, err
	}
	if ok {
		schema.Type = "string"
		schema.Types = nil
		schema.Enum = make([]any, 0, len(enumValues))
		for _, value := range enumValues {
			schema.Enum = append(schema.Enum, value.Value)
		}
	}

	return schema, nil
}

func discoveredEnumValues(t reflect.Type) ([]stringenumvalues.EnumValue, bool, error) {
	values, ok, err := stringenumvalues.Default().Values(canonicalType(t))
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
