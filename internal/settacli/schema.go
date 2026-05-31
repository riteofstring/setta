package settacli

import (
	"encoding/json"
	"fmt"
	"reflect"
	"strings"

	"setta/internal/chat"
	"setta/internal/codexaccount"
	"setta/internal/httpapi"
)

var rawMessageType = reflect.TypeFor[json.RawMessage]()

type schemaBuilder struct {
	defs  map[string]any
	enums map[string][]string
}

func schemaByName(name string) (map[string]any, bool, error) {
	for schemaName, schemaType := range schemaTypes() {
		if schemaName != name {
			continue
		}
		document, err := schemaForType(schemaName, schemaType)
		return document, true, err
	}
	return nil, false, nil
}

func schemaForType(title string, schemaType reflect.Type) (map[string]any, error) {
	builder := schemaBuilder{defs: map[string]any{}, enums: enumValuesByTypeName()}
	root, err := builder.schema(schemaType)
	if err != nil {
		return nil, err
	}
	document := map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"title":   title,
	}
	for key, value := range root {
		document[key] = value
	}
	if len(builder.defs) > 0 {
		document["$defs"] = builder.defs
	}
	return document, nil
}

func (builder *schemaBuilder) schema(schemaType reflect.Type) (map[string]any, error) {
	if schemaType == nil {
		return map[string]any{"type": "null"}, nil
	}
	if schemaType.Kind() == reflect.Pointer {
		return builder.pointerSchema(schemaType)
	}
	if schemaType == rawMessageType {
		return map[string]any{}, nil
	}
	if schemaType.Name() != "" && schemaType.Kind() == reflect.Struct {
		return builder.namedStructSchema(schemaType)
	}
	return builder.kindSchema(schemaType)
}

func (builder *schemaBuilder) pointerSchema(schemaType reflect.Type) (map[string]any, error) {
	inner, err := builder.schema(schemaType.Elem())
	if err != nil {
		return nil, err
	}
	return map[string]any{"anyOf": []any{inner, map[string]any{"type": "null"}}}, nil
}

func (builder *schemaBuilder) namedStructSchema(schemaType reflect.Type) (map[string]any, error) {
	name := schemaType.Name()
	if _, exists := builder.defs[name]; exists {
		return map[string]any{"$ref": "#/$defs/" + name}, nil
	}
	builder.defs[name] = map[string]any{}
	schema, err := builder.structSchema(schemaType)
	if err != nil {
		return nil, err
	}
	builder.defs[name] = schema
	return map[string]any{"$ref": "#/$defs/" + name}, nil
}

func (builder *schemaBuilder) kindSchema(schemaType reflect.Type) (map[string]any, error) {
	if schema, ok := builder.scalarSchema(schemaType); ok {
		return schema, nil
	}
	switch schemaType.Kind() {
	case reflect.Slice, reflect.Array:
		items, err := builder.schema(schemaType.Elem())
		if err != nil {
			return nil, err
		}
		return map[string]any{"type": "array", "items": items}, nil
	case reflect.Map:
		values, err := builder.schema(schemaType.Elem())
		if err != nil {
			return nil, err
		}
		return map[string]any{"type": "object", "additionalProperties": values}, nil
	case reflect.Struct:
		return builder.structSchema(schemaType)
	case reflect.Interface:
		return map[string]any{}, nil
	default:
		return nil, fmt.Errorf("unsupported schema type %s", schemaType)
	}
}

func (builder *schemaBuilder) scalarSchema(schemaType reflect.Type) (map[string]any, bool) {
	switch schemaType.Kind() {
	case reflect.Bool:
		return map[string]any{"type": "boolean"}, true
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64, reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return map[string]any{"type": "integer"}, true
	case reflect.Float32, reflect.Float64:
		return map[string]any{"type": "number"}, true
	case reflect.String:
		schema := map[string]any{"type": "string"}
		if values, ok := builder.enums[schemaType.Name()]; ok {
			schema["enum"] = values
		}
		return schema, true
	default:
		return nil, false
	}
}

func (builder *schemaBuilder) structSchema(schemaType reflect.Type) (map[string]any, error) {
	properties := map[string]any{}
	required := []string{}
	for index := 0; index < schemaType.NumField(); index++ {
		field := schemaType.Field(index)
		if !field.IsExported() {
			continue
		}
		name, omitempty, skip := jsonField(field)
		if skip {
			continue
		}
		fieldSchema, err := builder.schema(field.Type)
		if err != nil {
			return nil, fmt.Errorf("%s.%s: %w", schemaType.Name(), field.Name, err)
		}
		properties[name] = fieldSchema
		if !omitempty {
			required = append(required, name)
		}
	}
	schema := map[string]any{
		"type":                 "object",
		"properties":           properties,
		"additionalProperties": false,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema, nil
}

func jsonField(field reflect.StructField) (string, bool, bool) {
	tag := field.Tag.Get("json")
	if tag == "-" {
		return "", false, true
	}
	name := field.Name
	omitempty := false
	if tag != "" {
		parts := strings.Split(tag, ",")
		if parts[0] != "" {
			name = parts[0]
		}
		for _, part := range parts[1:] {
			if part == "omitempty" {
				omitempty = true
			}
		}
	}
	return name, omitempty, false
}

func schemaTypes() map[string]reflect.Type {
	types := map[string]reflect.Type{
		"AgentGuide":       reflect.TypeFor[agentGuideOutput](),
		"AgentSkillExport": reflect.TypeFor[agentSkillExportOutput](),
		"APIEndpoints":     reflect.TypeFor[apiEndpointsOutput](),
		"APISchema":        reflect.TypeFor[apiSchemaOutput](),
		"BackendStart":     reflect.TypeFor[backendStartOutput](),
		"ChatEvent":        reflect.TypeFor[chat.Event](),
		"CLICommandList":   reflect.TypeFor[commandsOutput](),
		"CLIErrorEnvelope": reflect.TypeFor[errorEnvelope](),
		"CLIErrors":        reflect.TypeFor[errorsOutput](),
		"CLIHelp":          reflect.TypeFor[helpOutput](),
		"CLISchema":        reflect.TypeFor[schemaOutput](),
		"CLISuccess":       reflect.TypeFor[successEnvelope](),
		"Version":          reflect.TypeFor[versionOutput](),
	}
	for _, endpoint := range httpapi.Contracts().Endpoints {
		if endpoint.Request != nil {
			types[endpoint.Request.Name()] = endpoint.Request
		}
		if endpoint.Response != nil {
			types[endpoint.Response.Name()] = endpoint.Response
		}
	}
	for _, response := range httpapi.Contracts().ErrorResponses {
		types[response.Name()] = response
	}
	for _, event := range chat.EventContracts().Events {
		types[event.Name] = event.Payload
	}
	return types
}

func enumValuesByTypeName() map[string][]string {
	values := map[string][]string{}
	for _, set := range chat.ContractValueSets() {
		values[set.Name] = set.Values
	}
	for _, set := range codexaccount.ContractValueSets() {
		values[set.Name] = set.Values
	}
	return values
}
