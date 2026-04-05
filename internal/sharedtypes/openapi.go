package sharedtypes

import (
	"encoding/json"
	"fmt"
	"strings"
)

const (
	OpenAPIProjectionVersion = "3.1.0"
	OpenAPIProjectionTitle   = "Setta Non-HTTP Shared Types"
)

func BuildOpenAPIProjectionDocument() (map[string]any, error) {
	schema, err := BuildSchemaDocument()
	if err != nil {
		return nil, err
	}

	payload, err := json.Marshal(schema)
	if err != nil {
		return nil, fmt.Errorf("marshal shared schema for OpenAPI projection: %w", err)
	}

	var schemaDocument map[string]any
	if err := json.Unmarshal(payload, &schemaDocument); err != nil {
		return nil, fmt.Errorf("decode shared schema for OpenAPI projection: %w", err)
	}

	defsValue, ok := schemaDocument["$defs"]
	if !ok {
		return nil, fmt.Errorf("shared schema document is missing $defs")
	}
	defs, ok := defsValue.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("shared schema $defs has unsupported shape %T", defsValue)
	}
	rewriteOpenAPIProjectionRefs(defs)

	return map[string]any{
		"openapi":             OpenAPIProjectionVersion,
		"jsonSchemaDialect":   JSONSchemaDraft202012,
		"info":                map[string]any{"title": OpenAPIProjectionTitle, "version": "1"},
		"paths":               map[string]any{},
		"components":          map[string]any{"schemas": defs},
		"x-setta-schema-kind": "non-http-shared-types-openapi-projection",
	}, nil
}

func rewriteOpenAPIProjectionRefs(value any) {
	switch typed := value.(type) {
	case map[string]any:
		for key, entry := range typed {
			if key == "$ref" {
				ref, ok := entry.(string)
				if ok && strings.HasPrefix(ref, "#/$defs/") {
					typed[key] = "#/components/schemas/" + strings.TrimPrefix(ref, "#/$defs/")
				}
				continue
			}
			rewriteOpenAPIProjectionRefs(entry)
		}
	case []any:
		for _, entry := range typed {
			rewriteOpenAPIProjectionRefs(entry)
		}
	}
}
