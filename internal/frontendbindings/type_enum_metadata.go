package frontendbindings

import (
	"reflect"

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
