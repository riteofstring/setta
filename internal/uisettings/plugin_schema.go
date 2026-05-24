package uisettings

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

func parsePluginUISettingDefinitions(pluginID string, schemaJSON map[string]any) (pluginUISettingParseResult, error) {
	result := pluginUISettingParseResult{
		Definitions:          nil,
		InvalidSettingErrors: map[string]SettingError{},
	}
	if len(schemaJSON) == 0 {
		return result, nil
	}
	rawDefinitions, ok := schemaJSON[pluginUISettingsSchemaKey]
	if !ok {
		return result, nil
	}
	items, ok := rawDefinitions.([]any)
	if !ok {
		return result, fmt.Errorf("plugin %s %s must be a list", pluginID, pluginUISettingsSchemaKey)
	}
	definitions := make([]pluginUISettingDefinition, 0, len(items))
	countBySettingID := make(map[string]int, len(items))
	for index, item := range items {
		definition, err := parsePluginUISettingDefinition(pluginID, schemaJSON, index, item)
		if err != nil {
			if localSettingID, ok := maybePluginLocalSettingID(item); ok {
				result.InvalidSettingErrors[localSettingID] = newSettingErrorValue(
					ErrorCodePluginUnavailable,
					"Plugin %s setting %s is unavailable for UI setting access (%s).",
					pluginID,
					localSettingID,
					err.Error(),
				)
				continue
			}
			return result, err
		}
		definitions = append(definitions, definition)
		countBySettingID[definition.LocalSettingID]++
	}
	filtered := make([]pluginUISettingDefinition, 0, len(definitions))
	for _, definition := range definitions {
		if countBySettingID[definition.LocalSettingID] > 1 {
			result.InvalidSettingErrors[definition.LocalSettingID] = newSettingErrorValue(
				ErrorCodePluginUnavailable,
				"Plugin %s setting %s is unavailable for UI setting access (duplicated ui settingId).",
				pluginID,
				definition.LocalSettingID,
			)
			continue
		}
		filtered = append(filtered, definition)
	}
	result.Definitions = filtered
	return result, nil
}

func maybePluginLocalSettingID(raw any) (string, bool) {
	definitionMap, ok := raw.(map[string]any)
	if !ok {
		return "", false
	}
	value, ok := definitionMap["settingId"]
	if !ok {
		return "", false
	}
	localSettingID, err := requireNonEmptyString(value)
	if err != nil {
		return "", false
	}
	if strings.Contains(localSettingID, "::") {
		return "", false
	}
	return localSettingID, true
}

func newSettingErrorValue(code ErrorCode, format string, args ...any) SettingError {
	return SettingError{
		Code:    code,
		Message: fmt.Sprintf(format, args...),
	}
}

func newPluginBackendInvalidValueError(pluginID string, settingID string, prefix string, causeCode ErrorCode, causeMessage string) *pluginBackendInvalidValueError {
	settingErr := newSettingErrorValue(
		causeCode,
		"Plugin %s setting %s %s: %s",
		pluginID,
		settingID,
		prefix,
		causeMessage,
	)
	return &pluginBackendInvalidValueError{
		pluginID:     pluginID,
		settingID:    settingID,
		prefix:       prefix,
		causeCode:    causeCode,
		causeMessage: causeMessage,
		settingErr:   &settingErr,
	}
}

func (e *pluginBackendInvalidValueError) Error() string {
	if e == nil || e.settingErr == nil {
		return ""
	}
	return e.settingErr.Message
}

func (e *pluginBackendInvalidValueError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.settingErr
}

func parsePluginUISettingDefinition(pluginID string, schemaJSON map[string]any, index int, raw any) (pluginUISettingDefinition, error) {
	definitionMap, ok := raw.(map[string]any)
	if !ok {
		return pluginUISettingDefinition{}, fmt.Errorf("plugin %s %s[%d] must be an object", pluginID, pluginUISettingsSchemaKey, index)
	}

	requiredFields, err := requirePluginUISettingFields(definitionMap, pluginID, index)
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	configPath, err := normalizePluginConfigPath(pluginID, index, definitionMap["configPath"])
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	synonyms, err := normalizePluginSynonyms(pluginID, index, definitionMap["synonyms"])
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	mutability, err := normalizePluginMutability(pluginID, index, definitionMap["mutability"])
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	valueSchema, err := resolvePluginValueSchema(pluginID, requiredFields.LocalSettingID, schemaJSON, definitionMap["valueSchema"], configPath)
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	defaultValue, err := resolvePluginUISettingDefaultValue(definitionMap, pluginID, requiredFields.LocalSettingID, valueSchema)
	if err != nil {
		return pluginUISettingDefinition{}, err
	}
	return pluginUISettingDefinition{
		LocalSettingID: requiredFields.LocalSettingID,
		Title:          requiredFields.Title,
		Description:    requiredFields.Description,
		Synonyms:       synonyms,
		PaneID:         requiredFields.PaneID,
		RevealKey:      requiredFields.RevealKey,
		ConfigPath:     configPath,
		Mutability:     mutability,
		ValueSchema:    valueSchema,
		DefaultValue:   cloneJSONValue(defaultValue),
	}, nil
}

func requirePluginUISettingFields(definitionMap map[string]any, pluginID string, index int) (pluginUISettingRequiredFields, error) {
	requiredFields := pluginUISettingRequiredFields{}

	localSettingID, err := requirePluginUISettingID(definitionMap, pluginID, index)
	if err != nil {
		return pluginUISettingRequiredFields{}, err
	}
	requiredFields.LocalSettingID = localSettingID

	stringFields := []struct {
		name   string
		target *string
	}{
		{name: "title", target: &requiredFields.Title},
		{name: "description", target: &requiredFields.Description},
		{name: "paneId", target: &requiredFields.PaneID},
		{name: "revealKey", target: &requiredFields.RevealKey},
	}
	for _, field := range stringFields {
		value, err := requirePluginUISettingStringField(definitionMap, pluginID, index, field.name)
		if err != nil {
			return pluginUISettingRequiredFields{}, err
		}
		*field.target = value
	}
	return requiredFields, nil
}

func requirePluginUISettingID(definitionMap map[string]any, pluginID string, index int) (string, error) {
	localSettingID, err := requirePluginUISettingStringField(definitionMap, pluginID, index, "settingId")
	if err != nil {
		return "", err
	}
	if strings.Contains(localSettingID, "::") {
		return "", fmt.Errorf("plugin %s settingId %s must not contain '::'", pluginID, localSettingID)
	}
	return localSettingID, nil
}

func requirePluginUISettingStringField(definitionMap map[string]any, pluginID string, index int, field string) (string, error) {
	value, err := requireNonEmptyString(definitionMap[field])
	if err != nil {
		return "", fmt.Errorf("plugin %s %s[%d] %s must be a non-empty string", pluginID, pluginUISettingsSchemaKey, index, field)
	}
	return value, nil
}

func resolvePluginUISettingDefaultValue(
	definitionMap map[string]any,
	pluginID string,
	localSettingID string,
	valueSchema ValueSchema,
) (any, error) {
	defaultValue, ok := definitionMap["defaultValue"]
	if !ok {
		return nil, fmt.Errorf("plugin %s setting %s must define defaultValue", pluginID, localSettingID)
	}
	if err := ValidateValue(valueSchema, defaultValue); err != nil {
		return nil, fmt.Errorf("plugin %s setting %s defaultValue is invalid: %w", pluginID, localSettingID, err)
	}
	return defaultValue, nil
}

func normalizePluginConfigPath(pluginID string, index int, raw any) ([]string, error) {
	items, ok := raw.([]any)
	if !ok || len(items) == 0 {
		return nil, fmt.Errorf(
			"plugin %s %s[%d] configPath must be a non-empty string array",
			pluginID,
			pluginUISettingsSchemaKey,
			index,
		)
	}
	configPath := make([]string, 0, len(items))
	for _, item := range items {
		segment, err := requireNonEmptyString(item)
		if err != nil {
			return nil, fmt.Errorf(
				"plugin %s %s[%d] configPath must be a non-empty string array",
				pluginID,
				pluginUISettingsSchemaKey,
				index,
			)
		}
		configPath = append(configPath, segment)
	}
	return configPath, nil
}

func normalizePluginSynonyms(pluginID string, index int, raw any) ([]string, error) {
	if raw == nil {
		return nil, nil
	}
	items, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("plugin %s %s[%d] synonyms must be a string array", pluginID, pluginUISettingsSchemaKey, index)
	}
	synonyms := make([]string, 0, len(items))
	for _, item := range items {
		synonym, err := requireNonEmptyString(item)
		if err != nil {
			return nil, fmt.Errorf("plugin %s %s[%d] synonyms must contain non-empty strings", pluginID, pluginUISettingsSchemaKey, index)
		}
		synonyms = append(synonyms, synonym)
	}
	return synonyms, nil
}

func normalizePluginMutability(pluginID string, index int, raw any) (Mutability, error) {
	if raw == nil {
		return MutabilityWritable, nil
	}
	value, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("plugin %s %s[%d] mutability must be readOnly or writable", pluginID, pluginUISettingsSchemaKey, index)
	}
	switch strings.TrimSpace(value) {
	case string(MutabilityReadOnly):
		return MutabilityReadOnly, nil
	case string(MutabilityWritable):
		return MutabilityWritable, nil
	default:
		return "", fmt.Errorf("plugin %s %s[%d] mutability must be readOnly or writable", pluginID, pluginUISettingsSchemaKey, index)
	}
}

func resolvePluginValueSchema(
	pluginID string,
	localSettingID string,
	schemaJSON map[string]any,
	rawValueSchema any,
	configPath []string,
) (ValueSchema, error) {
	if rawValueSchema != nil {
		schemaMap, ok := rawValueSchema.(map[string]any)
		if !ok {
			return ValueSchema{}, fmt.Errorf("plugin %s setting %s valueSchema must be an object", pluginID, localSettingID)
		}
		return parseExplicitPluginValueSchema(pluginID, localSettingID, schemaMap)
	}
	inferredSchema, ok := inferPluginValueSchema(schemaJSON, configPath)
	if !ok {
		return ValueSchema{}, fmt.Errorf("plugin %s setting %s must define valueSchema", pluginID, localSettingID)
	}
	return inferredSchema, nil
}

func parseExplicitPluginValueSchema(pluginID string, localSettingID string, schemaMap map[string]any) (ValueSchema, error) {
	encoded, err := json.Marshal(schemaMap)
	if err != nil {
		return ValueSchema{}, fmt.Errorf("plugin %s setting %s valueSchema is invalid: %w", pluginID, localSettingID, err)
	}
	var schema ValueSchema
	if err := json.Unmarshal(encoded, &schema); err != nil {
		return ValueSchema{}, fmt.Errorf("plugin %s setting %s valueSchema is invalid: %w", pluginID, localSettingID, err)
	}
	if !validValueType(schema.Type) {
		return ValueSchema{}, fmt.Errorf("plugin %s setting %s valueSchema type is invalid: %q", pluginID, localSettingID, schema.Type)
	}
	return schema, nil
}

func inferPluginValueSchema(schemaJSON map[string]any, configPath []string) (ValueSchema, bool) {
	schemaNode, ok := resolveSchemaNodeForConfigPath(schemaJSON, configPath)
	if !ok {
		return ValueSchema{}, false
	}
	return inferValueSchemaFromSchemaNode(schemaNode)
}

func resolveSchemaNodeForConfigPath(schemaJSON map[string]any, configPath []string) (map[string]any, bool) {
	current := schemaJSON
	for _, segment := range configPath {
		rawProperties, ok := current["properties"]
		if !ok {
			return nil, false
		}
		properties, ok := rawProperties.(map[string]any)
		if !ok {
			return nil, false
		}
		nextNode, ok := properties[segment]
		if !ok {
			return nil, false
		}
		nextMap, ok := nextNode.(map[string]any)
		if !ok {
			return nil, false
		}
		current = nextMap
	}
	return current, true
}

func inferValueSchemaFromSchemaNode(schemaNode map[string]any) (ValueSchema, bool) {
	rawType, ok := resolveSchemaNodeType(schemaNode)
	if !ok {
		return ValueSchema{}, false
	}

	schema := ValueSchema{Type: ValueType(rawType)}
	applySchemaNodeScalarConstraints(&schema, schemaNode)
	applySchemaNodeShapeConstraints(&schema, schemaNode)
	return schema, true
}

func applySchemaNodeScalarConstraints(schema *ValueSchema, schemaNode map[string]any) {
	if enumValues, ok := schemaNode["enum"].([]any); ok {
		schema.EnumValues = slices.Clone(enumValues)
	}
	if minimum, ok := asSchemaFloat(schemaNode["minimum"]); ok {
		schema.Minimum = &minimum
	}
	if maximum, ok := asSchemaFloat(schemaNode["maximum"]); ok {
		schema.Maximum = &maximum
	}
	if minLength, ok := asSchemaInt(schemaNode["minLength"]); ok {
		schema.MinLength = &minLength
	}
	if maxLength, ok := asSchemaInt(schemaNode["maxLength"]); ok {
		schema.MaxLength = &maxLength
	}
}

func applySchemaNodeShapeConstraints(schema *ValueSchema, schemaNode map[string]any) {
	switch schema.Type {
	case ValueTypeArray:
		applyArraySchemaNodeConstraints(schema, schemaNode)
	case ValueTypeObject:
		applyObjectSchemaNodeConstraints(schema, schemaNode)
	}
}

func applyArraySchemaNodeConstraints(schema *ValueSchema, schemaNode map[string]any) {
	rawItems, ok := schemaNode["items"].(map[string]any)
	if !ok {
		return
	}
	itemsSchema, ok := inferValueSchemaFromSchemaNode(rawItems)
	if !ok {
		return
	}
	schema.Items = valueSchemaPointer(itemsSchema)
}

func applyObjectSchemaNodeConstraints(schema *ValueSchema, schemaNode map[string]any) {
	if properties := inferObjectSchemaProperties(schemaNode); len(properties) > 0 {
		schema.Properties = properties
	}
	if requiredProperties := inferRequiredSchemaProperties(schemaNode); len(requiredProperties) > 0 {
		schema.RequiredProperties = requiredProperties
	}
	if additionalProperties, ok := schemaNode["additionalProperties"].(bool); ok {
		schema.AdditionalProperties = boolPointer(additionalProperties)
	}
}

func inferObjectSchemaProperties(schemaNode map[string]any) map[string]ValueSchema {
	rawProperties, ok := schemaNode["properties"].(map[string]any)
	if !ok {
		return nil
	}
	properties := make(map[string]ValueSchema, len(rawProperties))
	for propertyName, rawPropertySchema := range rawProperties {
		propertySchemaNode, ok := rawPropertySchema.(map[string]any)
		if !ok {
			continue
		}
		propertySchema, ok := inferValueSchemaFromSchemaNode(propertySchemaNode)
		if !ok {
			continue
		}
		properties[propertyName] = propertySchema
	}
	if len(properties) == 0 {
		return nil
	}
	return properties
}

func inferRequiredSchemaProperties(schemaNode map[string]any) []string {
	required, ok := schemaNode["required"].([]any)
	if !ok {
		return nil
	}
	requiredProperties := make([]string, 0, len(required))
	for _, item := range required {
		value, ok := item.(string)
		if !ok || strings.TrimSpace(value) == "" {
			continue
		}
		requiredProperties = append(requiredProperties, value)
	}
	if len(requiredProperties) == 0 {
		return nil
	}
	return requiredProperties
}

func resolveSchemaNodeType(schemaNode map[string]any) (string, bool) {
	switch typed := schemaNode["type"].(type) {
	case string:
		if validValueType(ValueType(typed)) {
			return typed, true
		}
		return "", false
	case []any:
		nonNullTypes := make([]string, 0, len(typed))
		for _, item := range typed {
			value, ok := item.(string)
			if !ok || value == "null" {
				continue
			}
			nonNullTypes = append(nonNullTypes, value)
		}
		nonNullTypes = slices.Compact(nonNullTypes)
		if len(nonNullTypes) != 1 || !validValueType(ValueType(nonNullTypes[0])) {
			return "", false
		}
		return nonNullTypes[0], true
	default:
		return "", false
	}
}

func validValueType(valueType ValueType) bool {
	switch valueType {
	case ValueTypeBoolean, ValueTypeString, ValueTypeNumber, ValueTypeInteger, ValueTypeArray, ValueTypeObject:
		return true
	default:
		return false
	}
}

func asSchemaFloat(raw any) (float64, bool) {
	value, ok := asFloat64(raw)
	if !ok {
		return 0, false
	}
	return value, true
}

func asSchemaInt(raw any) (int, bool) {
	switch typed := raw.(type) {
	case int:
		return typed, true
	case int8:
		return int(typed), true
	case int16:
		return int(typed), true
	case int32:
		return int(typed), true
	case int64:
		return int(typed), true
	case float64:
		if typed == float64(int(typed)) {
			return int(typed), true
		}
	case float32:
		if typed == float32(int(typed)) {
			return int(typed), true
		}
	}
	return 0, false
}
