package main

import (
	"bytes"
	"encoding/json"
	"fmt"
)

type jsonSchema struct {
	Title                string                `json:"title"`
	Description          string                `json:"description"`
	Type                 any                   `json:"type"`
	Enum                 []string              `json:"enum"`
	OneOf                []jsonSchema          `json:"oneOf"`
	AnyOf                []jsonSchema          `json:"anyOf"`
	AllOf                []jsonSchema          `json:"allOf"`
	Properties           map[string]jsonSchema `json:"properties"`
	Required             []string              `json:"required"`
	Items                *jsonSchema           `json:"items"`
	AdditionalProperties any                   `json:"additionalProperties"`
	Ref                  string                `json:"$ref"`
	Definitions          map[string]jsonSchema `json:"definitions"`
	Default              any                   `json:"default"`
	raw                  []byte
}

type jsonSchemaWire struct {
	Title                string                     `json:"title"`
	Description          string                     `json:"description"`
	Type                 any                        `json:"type"`
	Enum                 []string                   `json:"enum"`
	OneOf                []json.RawMessage          `json:"oneOf"`
	AnyOf                []json.RawMessage          `json:"anyOf"`
	AllOf                []json.RawMessage          `json:"allOf"`
	Properties           map[string]json.RawMessage `json:"properties"`
	Required             []string                   `json:"required"`
	Items                *json.RawMessage           `json:"items"`
	AdditionalProperties any                        `json:"additionalProperties"`
	Ref                  string                     `json:"$ref"`
	Definitions          map[string]json.RawMessage `json:"definitions"`
	Default              any                        `json:"default"`
}

func (schema *jsonSchema) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if bytes.Equal(trimmed, []byte("true")) || bytes.Equal(trimmed, []byte("false")) {
		schema.raw = canonicalJSON(data)
		return nil
	}
	var wire jsonSchemaWire
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	*schema = schemaFromWire(wire, data)
	if err := schema.decodeWireCompositions(wire); err != nil {
		return err
	}
	if err := schema.decodeWireMaps(wire); err != nil {
		return err
	}
	return schema.decodeWireItems(wire.Items)
}

func schemaFromWire(wire jsonSchemaWire, data []byte) jsonSchema {
	return jsonSchema{
		Title:                wire.Title,
		Description:          wire.Description,
		Type:                 wire.Type,
		Enum:                 wire.Enum,
		Properties:           map[string]jsonSchema{},
		Required:             wire.Required,
		AdditionalProperties: wire.AdditionalProperties,
		Ref:                  wire.Ref,
		Definitions:          map[string]jsonSchema{},
		Default:              wire.Default,
		raw:                  canonicalJSON(data),
	}
}

func (schema *jsonSchema) decodeWireCompositions(wire jsonSchemaWire) error {
	oneOf, err := decodeChildSchemas(wire.OneOf, "oneOf")
	if err != nil {
		return err
	}
	anyOf, err := decodeChildSchemas(wire.AnyOf, "anyOf")
	if err != nil {
		return err
	}
	allOf, err := decodeChildSchemas(wire.AllOf, "allOf")
	if err != nil {
		return err
	}
	schema.OneOf = oneOf
	schema.AnyOf = anyOf
	schema.AllOf = allOf
	return nil
}

func (schema *jsonSchema) decodeWireMaps(wire jsonSchemaWire) error {
	properties, err := decodeNamedChildSchemas(wire.Properties, "property")
	if err != nil {
		return err
	}
	definitions, err := decodeNamedChildSchemas(wire.Definitions, "definition")
	if err != nil {
		return err
	}
	schema.Properties = properties
	schema.Definitions = definitions
	return nil
}

func (schema *jsonSchema) decodeWireItems(raw *json.RawMessage) error {
	if raw == nil {
		return nil
	}
	child, err := decodeChildSchema(*raw)
	if err != nil {
		return fmt.Errorf("items: %w", err)
	}
	schema.Items = &child
	return nil
}

func decodeChildSchemas(values []json.RawMessage, label string) ([]jsonSchema, error) {
	schemas := make([]jsonSchema, 0, len(values))
	for index, raw := range values {
		child, err := decodeChildSchema(raw)
		if err != nil {
			return nil, fmt.Errorf("%s[%d]: %w", label, index, err)
		}
		schemas = append(schemas, child)
	}
	return schemas, nil
}

func decodeNamedChildSchemas(values map[string]json.RawMessage, label string) (map[string]jsonSchema, error) {
	schemas := map[string]jsonSchema{}
	for name, raw := range values {
		child, err := decodeChildSchema(raw)
		if err != nil {
			return nil, fmt.Errorf("%s %s: %w", label, name, err)
		}
		schemas[name] = child
	}
	return schemas, nil
}

func decodeChildSchema(raw json.RawMessage) (jsonSchema, error) {
	var schema jsonSchema
	if err := json.Unmarshal(raw, &schema); err != nil {
		return jsonSchema{}, err
	}
	return schema, nil
}
