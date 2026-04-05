package frontendbindings

import (
	"reflect"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/stringenumvalues"
)

var frontendBindingSyntheticEnumProviders = map[reflect.Type]func() []EnumValue{
	reflect.TypeOf(projectstate.CodeLanguage("")): frontendBindingFixedEnumValues(
		"python",
		"bash",
		"javascript",
		"typescript",
		"json",
		"yaml",
		"toml",
		"markdown",
		"plaintext",
	),
}

func frontendBindingEnumValues(t reflect.Type) ([]EnumValue, bool, error) {
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return nil, false, nil
	}

	if provider, ok := frontendBindingSyntheticEnumProviders[t]; ok {
		return provider(), true, nil
	}

	discovered, ok, err := stringenumvalues.Default().Values(t)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, nil
	}

	return frontendBindingAdjustedDiscoveredEnumValues(t, discovered), true, nil
}

func frontendBindingAdjustedDiscoveredEnumValues(
	t reflect.Type,
	discovered []stringenumvalues.EnumValue,
) []EnumValue {
	values := frontendBindingEnumValuesFromDiscovered(discovered)
	switch t {
	case reflect.TypeOf(projectstate.FrontendSectionType("")):
		return frontendBindingMoveEnumValueBefore(values, "TextBlock", "Prompt")
	default:
		return values
	}
}

func frontendBindingFixedEnumValues(values ...string) func() []EnumValue {
	return func() []EnumValue {
		enumValues := make([]EnumValue, 0, len(values))
		for _, value := range values {
			enumValues = append(enumValues, EnumValue{
				Name:  value,
				Value: value,
			})
		}
		return enumValues
	}
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

func frontendBindingMoveEnumValueBefore(
	values []EnumValue,
	name string,
	before string,
) []EnumValue {
	fromIndex := -1
	toIndex := -1
	for index, value := range values {
		switch value.Name {
		case name:
			fromIndex = index
		case before:
			toIndex = index
		}
	}
	if fromIndex == -1 || toIndex == -1 || fromIndex < toIndex {
		return values
	}

	ordered := append([]EnumValue(nil), values...)
	value := ordered[fromIndex]
	copy(ordered[toIndex+1:fromIndex+1], ordered[toIndex:fromIndex])
	ordered[toIndex] = value
	return ordered
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
