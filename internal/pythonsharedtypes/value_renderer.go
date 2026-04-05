package pythonsharedtypes

import (
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

func mustPythonValueExprFromGoValue(context string, value any) string {
	expr, err := pythonValueExprFromGoValue(value)
	if err != nil {
		panic(fmt.Sprintf("render %s python value: %v", context, err))
	}
	return expr
}

func pythonValueExprFromGoValue(value any) (string, error) {
	return pythonValueExpr(reflect.ValueOf(value))
}

func pythonValueExpr(value reflect.Value) (string, error) {
	if !value.IsValid() {
		return "None", nil
	}

	for value.Kind() == reflect.Interface || value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return "None", nil
		}
		value = value.Elem()
	}

	valueType := value.Type()
	if valueType.Kind() == reflect.String && valueType.Name() != "" {
		enumExpr, ok, err := pythonEnumValueExpr(valueType, value.String())
		if err != nil {
			return "", err
		}
		if ok {
			return enumExpr, nil
		}
	}

	switch value.Kind() {
	case reflect.String:
		return strconv.Quote(value.String()), nil
	case reflect.Bool:
		if value.Bool() {
			return "True", nil
		}
		return "False", nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return strconv.FormatInt(value.Int(), 10), nil
	case reflect.Uint, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return strconv.FormatUint(value.Uint(), 10), nil
	case reflect.Uint8:
		return strconv.FormatUint(value.Uint(), 10), nil
	case reflect.Float32:
		return pythonFloatLiteral(value.Float(), 32), nil
	case reflect.Float64:
		return pythonFloatLiteral(value.Float(), 64), nil
	case reflect.Slice, reflect.Array:
		if value.Kind() == reflect.Slice && value.Type().Elem().Kind() == reflect.Uint8 {
			return "", fmt.Errorf("unsupported []byte value for python literal rendering")
		}
		parts := make([]string, 0, value.Len())
		for index := 0; index < value.Len(); index++ {
			itemExpr, err := pythonValueExpr(value.Index(index))
			if err != nil {
				return "", err
			}
			parts = append(parts, itemExpr)
		}
		return "[" + strings.Join(parts, ", ") + "]", nil
	case reflect.Map:
		if value.IsNil() || value.Len() == 0 {
			return "{}", nil
		}
		type entry struct {
			KeyExpr   string
			ValueExpr string
		}
		entries := make([]entry, 0, value.Len())
		iter := value.MapRange()
		for iter.Next() {
			keyExpr, err := pythonValueExpr(iter.Key())
			if err != nil {
				return "", err
			}
			valueExpr, err := pythonValueExpr(iter.Value())
			if err != nil {
				return "", err
			}
			entries = append(entries, entry{KeyExpr: keyExpr, ValueExpr: valueExpr})
		}
		sort.Slice(entries, func(i int, j int) bool {
			return entries[i].KeyExpr < entries[j].KeyExpr
		})
		parts := make([]string, 0, len(entries))
		for _, entry := range entries {
			parts = append(parts, entry.KeyExpr+": "+entry.ValueExpr)
		}
		return "{" + strings.Join(parts, ", ") + "}", nil
	case reflect.Struct:
		if valueType.Name() == "" {
			return "", fmt.Errorf("unsupported anonymous struct value %s", valueType)
		}
		publicTypeName := pythonSharedContractNameForType(valueType)
		parts := make([]string, 0, value.NumField())
		for _, field := range visibleFields(valueType) {
			jsonName, err := fieldJSONName(field)
			if err != nil {
				return "", err
			}
			fieldExpr, err := pythonValueExpr(value.FieldByIndex(field.Index))
			if err != nil {
				return "", fmt.Errorf("%s.%s: %w", publicTypeName, field.Name, err)
			}
			parts = append(parts, jsonName+"="+fieldExpr)
		}
		return publicTypeName + "(" + strings.Join(parts, ", ") + ")", nil
	default:
		return "", fmt.Errorf("unsupported value %s for python literal rendering", valueType)
	}
}

func pythonEnumValueExpr(enumType reflect.Type, rawValue string) (string, bool, error) {
	spec, ok, err := enumContractSpecIfConvertible(enumType)
	if err != nil || !ok {
		return "", ok, err
	}
	if len(spec.EnumValues) == 0 {
		enumValues, enumOK, enumErr := resolveEnumValues(spec)
		if enumErr != nil {
			return "", false, enumErr
		}
		if !enumOK {
			return "", false, nil
		}
		spec.EnumValues = enumValues
	}
	for _, enumValue := range spec.EnumValues {
		if enumValue.Value != rawValue {
			continue
		}
		return spec.Name + "." + pythonEnumMemberName(enumValue.Name), true, nil
	}
	return "", false, fmt.Errorf(
		"python shared types: enum %s missing value %q",
		pythonSharedContractNameForType(enumType),
		rawValue,
	)
}

func pythonFloatLiteral(value float64, bitSize int) string {
	literal := strconv.FormatFloat(value, 'f', -1, bitSize)
	if strings.ContainsRune(literal, '.') {
		return literal
	}
	return literal + ".0"
}
