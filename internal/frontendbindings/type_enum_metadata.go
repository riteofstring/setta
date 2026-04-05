package frontendbindings

import (
	"reflect"
	"strings"

	"setta/internal/stringenumvalues"
)

func frontendBindingEnumValues(t reflect.Type) ([]EnumValue, bool, error) {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return nil, false, nil
	}

	discovered, ok, err := stringenumvalues.Default().Values(t)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, nil
	}

	return frontendBindingEnumValuesFromDiscovered(discovered), true, nil
}

func frontendBindingEnumValuesFromDiscovered(
	discovered []stringenumvalues.EnumValue,
) []EnumValue {
	values := make([]EnumValue, 0, len(discovered))
	seen := make(map[string]struct{}, len(discovered))
	for _, discoveredValue := range discovered {
		name := discoveredValue.Name
		key := name + "\x00" + discoveredValue.Value
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		values = append(values, EnumValue{
			Name:  name,
			Value: discoveredValue.Value,
		})
	}
	return values
}

func frontendBindingStructFieldEnumValues(structType reflect.Type) []EnumValue {
	values := make([]EnumValue, 0, structType.NumField())
	for index := 0; index < structType.NumField(); index++ {
		field := structType.Field(index)
		if !field.IsExported() {
			continue
		}
		name := frontendBindingStructFieldEnumName(field)
		if name == "" {
			continue
		}
		values = append(values, EnumValue{
			Name:  name,
			Value: name,
		})
	}
	return values
}

func frontendBindingStructFieldEnumName(field reflect.StructField) string {
	jsonName := strings.TrimSpace(field.Tag.Get("json"))
	if jsonName == "" {
		return field.Name
	}
	name, _, _ := strings.Cut(jsonName, ",")
	name = strings.TrimSpace(name)
	if name == "" {
		return field.Name
	}
	if name == "-" {
		return ""
	}
	return name
}
