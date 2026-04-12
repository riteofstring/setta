package uisettings

import (
	"fmt"
	"reflect"
	"slices"
	"sort"
	"strings"

	"setta/internal/valueconvert"
)

func ValidateValue(schema ValueSchema, value any) error {
	return validateValue(schema, value, "")
}

func validateValue(schema ValueSchema, value any, path string) error {
	switch schema.Type {
	case ValueTypeBoolean:
		return validateBooleanValue(value, path)
	case ValueTypeString:
		return validateStringValue(schema, value, path)
	case ValueTypeNumber:
		return validateNumericValue(schema, value, path, false)
	case ValueTypeInteger:
		return validateNumericValue(schema, value, path, true)
	case ValueTypeArray:
		return validateArrayValue(schema, value, path)
	case ValueTypeObject:
		return validateObjectValue(schema, value, path)
	default:
		return fmt.Errorf("unsupported UI setting value schema type %q", schema.Type)
	}
}

func validateBooleanValue(value any, path string) error {
	if _, ok := value.(bool); !ok {
		return invalidType(path, "a boolean value")
	}
	return nil
}

func validateStringValue(schema ValueSchema, value any, path string) error {
	stringValue, ok := value.(string)
	if !ok {
		return invalidType(path, "a string value")
	}
	if schema.MinLength != nil && len(stringValue) < *schema.MinLength {
		if *schema.MinLength == 1 {
			return newSettingError(ErrorCodeInvalidValueType, "%sExpected a non-empty string value.", pathPrefix(path))
		}
		return newSettingError(ErrorCodeInvalidValueRangeOrEnum, "%sString must be at least %d characters.", pathPrefix(path), *schema.MinLength)
	}
	if schema.MaxLength != nil && len(stringValue) > *schema.MaxLength {
		return newSettingError(ErrorCodeInvalidValueRangeOrEnum, "%sString must be at most %d characters.", pathPrefix(path), *schema.MaxLength)
	}
	return validateEnumValue(schema.EnumValues, stringValue, path)
}

func validateNumericValue(schema ValueSchema, value any, path string, integerOnly bool) error {
	numberValue, ok := asFloat64(value)
	if !ok {
		if integerOnly {
			return invalidType(path, "an integer value")
		}
		return invalidType(path, "a number value")
	}
	if integerOnly && numberValue != float64(int64(numberValue)) {
		return invalidType(path, "an integer value")
	}
	return validateNumberRange(schema, numberValue, path)
}

func validateArrayValue(schema ValueSchema, value any, path string) error {
	items, ok := sliceValues(value)
	if !ok {
		return invalidType(path, "an array value")
	}
	if schema.Items == nil {
		return nil
	}
	for index, item := range items {
		if err := validateValue(*schema.Items, item, itemPath(path, index)); err != nil {
			return err
		}
	}
	return nil
}

func validateObjectValue(schema ValueSchema, value any, path string) error {
	objectValue, ok := objectValues(value)
	if !ok {
		return invalidType(path, "an object value")
	}
	if err := validateRequiredProperties(schema.RequiredProperties, objectValue, path); err != nil {
		return err
	}
	if err := validateUnsupportedProperties(schema, objectValue, path); err != nil {
		return err
	}
	for key, propertySchema := range schema.Properties {
		propertyValue, ok := objectValue[key]
		if !ok {
			continue
		}
		if err := validateValue(propertySchema, propertyValue, propertyPath(path, key)); err != nil {
			return err
		}
	}
	return nil
}

func validateRequiredProperties(required []string, objectValue map[string]any, path string) error {
	if len(required) == 0 {
		return nil
	}
	missing := make([]string, 0, len(required))
	for _, key := range required {
		if _, ok := objectValue[key]; !ok {
			missing = append(missing, key)
		}
	}
	if len(missing) == 0 {
		return nil
	}
	sort.Strings(missing)
	return newSettingError(
		ErrorCodeInvalidValueType,
		"%sObject is missing required properties: %s.",
		pathPrefix(path),
		strings.Join(missing, ", "),
	)
}

func validateUnsupportedProperties(schema ValueSchema, objectValue map[string]any, path string) error {
	allowAdditional := true
	if schema.AdditionalProperties != nil {
		allowAdditional = *schema.AdditionalProperties
	}
	if allowAdditional {
		return nil
	}

	unsupported := make([]string, 0)
	for key := range objectValue {
		if _, ok := schema.Properties[key]; !ok {
			unsupported = append(unsupported, key)
		}
	}
	if len(unsupported) == 0 {
		return nil
	}
	sort.Strings(unsupported)
	return newSettingError(
		ErrorCodeInvalidValueType,
		"%sObject contains unsupported properties: %s.",
		pathPrefix(path),
		strings.Join(unsupported, ", "),
	)
}

func validateNumberRange(schema ValueSchema, value float64, path string) error {
	if schema.Minimum != nil && value < *schema.Minimum {
		return newSettingError(ErrorCodeInvalidValueRangeOrEnum, "%sValue must be at least %v.", pathPrefix(path), *schema.Minimum)
	}
	if schema.Maximum != nil && value > *schema.Maximum {
		return newSettingError(ErrorCodeInvalidValueRangeOrEnum, "%sValue must be at most %v.", pathPrefix(path), *schema.Maximum)
	}
	return validateEnumValue(schema.EnumValues, value, path)
}

func validateEnumValue(enumValues []any, value any, path string) error {
	if len(enumValues) == 0 {
		return nil
	}
	for _, candidate := range enumValues {
		if reflect.DeepEqual(candidate, value) {
			return nil
		}
	}
	return newSettingError(ErrorCodeInvalidValueRangeOrEnum, "%sValue must be one of: %s.", pathPrefix(path), joinEnumValues(enumValues))
}

func invalidType(path string, expected string) error {
	return newSettingError(ErrorCodeInvalidValueType, "%sExpected %s.", pathPrefix(path), expected)
}

func pathPrefix(path string) string {
	if path == "" {
		return ""
	}
	return path + ": "
}

func itemPath(path string, index int) string {
	if path == "" {
		return fmt.Sprintf("item %d", index)
	}
	return fmt.Sprintf("%s item %d", path, index)
}

func propertyPath(path string, key string) string {
	if path == "" {
		return "property " + key
	}
	return path + " property " + key
}

func joinEnumValues(values []any) string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, fmt.Sprintf("%v", value))
	}
	return strings.Join(parts, ", ")
}

func asFloat64(value any) (float64, bool) {
	return valueconvert.Float64(value)
}

func sliceValues(value any) ([]any, bool) {
	switch typed := value.(type) {
	case []any:
		return append([]any(nil), typed...), true
	case []string:
		items := make([]any, len(typed))
		for index, item := range typed {
			items[index] = item
		}
		return items, true
	}

	raw := reflect.ValueOf(value)
	if !raw.IsValid() || (raw.Kind() != reflect.Slice && raw.Kind() != reflect.Array) {
		return nil, false
	}
	items := make([]any, raw.Len())
	for index := 0; index < raw.Len(); index++ {
		items[index] = raw.Index(index).Interface()
	}
	return items, true
}

func objectValues(value any) (map[string]any, bool) {
	if typed, ok := value.(map[string]any); ok {
		cloned := make(map[string]any, len(typed))
		for key, item := range typed {
			cloned[key] = item
		}
		return cloned, true
	}

	raw := reflect.ValueOf(value)
	if !raw.IsValid() || raw.Kind() != reflect.Map || raw.Type().Key().Kind() != reflect.String {
		return nil, false
	}
	keys := raw.MapKeys()
	values := make(map[string]any, len(keys))
	for _, key := range keys {
		values[key.String()] = raw.MapIndex(key).Interface()
	}
	return values, true
}

func normalizeSourceFilter(filter SourceFilter) SourceFilter {
	switch filter {
	case SourceFilterCore, SourceFilterPlugin, SourceFilterAll:
		return filter
	default:
		return SourceFilterAll
	}
}

func cloneEntry(entry Entry) Entry {
	cloned := entry
	cloned.Synonyms = append([]string(nil), entry.Synonyms...)
	cloned.RevealActivationSteps = append([]RevealActivationStep(nil), entry.RevealActivationSteps...)
	cloned.ValueSchema = cloneValueSchema(entry.ValueSchema)
	return cloned
}

func cloneValueSchema(schema ValueSchema) ValueSchema {
	cloned := schema
	if len(schema.EnumValues) > 0 {
		cloned.EnumValues = slices.Clone(schema.EnumValues)
	}
	if schema.Items != nil {
		item := cloneValueSchema(*schema.Items)
		cloned.Items = &item
	}
	if len(schema.Properties) > 0 {
		cloned.Properties = make(map[string]ValueSchema, len(schema.Properties))
		for key, value := range schema.Properties {
			cloned.Properties[key] = cloneValueSchema(value)
		}
	}
	cloned.RequiredProperties = append([]string(nil), schema.RequiredProperties...)
	return cloned
}
