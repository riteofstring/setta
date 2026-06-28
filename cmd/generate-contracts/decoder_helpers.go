package main

import (
	"bytes"
	"fmt"
	"reflect"
)

type decoderHelpers struct {
	Array      bool
	Boolean    bool
	Integer    bool
	IntegerMap bool
	Map        bool
	Nullable   bool
	Number     bool
	String     bool
	Unknown    bool
}

type runtimeImportRule struct {
	enabled bool
	name    string
}

func renderRuntimeImports(buffer *bytes.Buffer, specs contractSpec) {
	helpers := decoderHelperUsage(specs.Interfaces, specs.Events)
	imports := []string{"assertKnownFields", "assertRecord"}
	for _, rule := range runtimeImportRules(helpers, len(specs.Events) > 0) {
		if rule.enabled {
			imports = append(imports, rule.name)
		}
	}
	imports = append(imports, "requestBackend", "requireField")

	buffer.WriteString("import {\n")
	for _, name := range imports {
		fmt.Fprintf(buffer, "  %s,\n", name)
	}
	buffer.WriteString("  type BackendFetch,\n")
	buffer.WriteString("} from \"@shared/backend-runtime\";\n\n")
}

func runtimeImportRules(helpers decoderHelpers, hasEvents bool) []runtimeImportRule {
	return []runtimeImportRule{
		{enabled: helpers.Array, name: "decodeArray"},
		{enabled: helpers.Boolean, name: "decodeBoolean"},
		{enabled: hasEvents, name: "decodeBackendEventBase"},
		{enabled: helpers.Integer, name: "decodeInteger"},
		{enabled: helpers.IntegerMap, name: "decodeIntegerRecord"},
		{enabled: helpers.Map, name: "decodeStringRecord"},
		{enabled: helpers.Nullable, name: "decodeNullable"},
		{enabled: helpers.Number, name: "decodeNumber"},
		{enabled: helpers.String, name: "decodeString"},
		{enabled: helpers.Unknown, name: "decodeUnknown"},
	}
}

func decoderHelperUsage(specs []interfaceSpec, events []eventSpec) decoderHelpers {
	var helpers decoderHelpers
	for _, spec := range specs {
		for index := range spec.Type.NumField() {
			field := spec.Type.Field(index)
			if field.PkgPath != "" || jsonName(field) == "-" {
				continue
			}
			markDecoderHelperUsage(field.Type, &helpers)
		}
	}
	if len(events) > 0 {
		helpers.String = true
	}
	return helpers
}

func markDecoderHelperUsage(goType reflect.Type, helpers *decoderHelpers) {
	if isJSONRawMessage(goType) {
		helpers.Unknown = true
		return
	}
	switch goType.Kind() {
	case reflect.Bool:
		helpers.Boolean = true
	case reflect.Float32, reflect.Float64:
		helpers.Number = true
	case reflect.Int:
		helpers.Integer = true
	case reflect.String:
		helpers.String = true
	case reflect.Slice:
		helpers.Array = true
		markDecoderHelperUsage(goType.Elem(), helpers)
	case reflect.Map:
		if goType.Key().Kind() == reflect.String && goType.Elem().Kind() == reflect.Int {
			helpers.IntegerMap = true
			return
		}
		helpers.Map = true
	case reflect.Pointer:
		helpers.Nullable = true
		markDecoderHelperUsage(goType.Elem(), helpers)
	}
}
