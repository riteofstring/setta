package projectstate

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

var (
	ErrUpdateParamImplConfigUnsupported      = errors.New("code object type does not support update_param_impl_config")
	ErrUpdateParamImplConfigFieldUnsupported = errors.New("parameter implementation config field is unsupported")
	ErrUpdateParamImplConfigFieldInvalid     = errors.New("parameter implementation config field value is invalid")
)

var (
	textParamUITypeValues = map[string]struct{}{
		"plain": {},
		"time":  {},
		"date":  {},
	}
	dateDisplayFormatValues = map[string]struct{}{
		"iso":  {},
		"us":   {},
		"eu":   {},
		"long": {},
	}
	dateControlModeValues = map[string]struct{}{
		"input":    {},
		"calendar": {},
	}
	dateSelectionModeValues = map[string]struct{}{
		"single":   {},
		"multiple": {},
	}
	dateCalendarWeekStartValues = map[string]struct{}{
		"sunday": {},
		"monday": {},
	}
	timeControlModeValues = map[string]struct{}{
		"input":   {},
		"display": {},
	}
	timeDisplayFormatValues = map[string]struct{}{
		"twenty_four_hour": {},
		"twelve_hour":      {},
	}
	timeDisplayFontValues = map[string]struct{}{
		"clock":     {},
		"monospace": {},
		"system":    {},
	}
	buttonActionModeValues = map[string]struct{}{
		"WEBSOCKET_LISTENER": {},
		"HTTP_REQUEST":       {},
		"SETTA_API":          {},
	}
	httpRequestMethodValues = map[string]struct{}{
		"GET":     {},
		"POST":    {},
		"PUT":     {},
		"PATCH":   {},
		"DELETE":  {},
		"HEAD":    {},
		"OPTIONS": {},
	}
	dropzoneModeValues = map[string]struct{}{
		"STATEFUL":  {},
		"STATELESS": {},
	}
)

func (d *Document) UpdateParamImplConfig(projectID string, sectionID string, paramInfoID string, newConfig map[string]any) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.UpdateParamImplConfig(sectionID, paramInfoID, newConfig); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) UpdateParamImplConfig(ctx context.Context, projectID string, sectionID string, paramInfoID string, newConfig map[string]any) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.UpdateParamImplConfig(projectID, sectionID, paramInfoID, newConfig); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) UpdateParamImplConfig(sectionID string, paramInfoID string, newConfig map[string]any) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return ErrSectionIDRequired
	}
	trimmedParamID := strings.TrimSpace(paramInfoID)
	if trimmedParamID == "" {
		return ErrCodeObjIDRequired
	}

	payload, _, _, impl, err := p.ResolveSectionCodeObject(trimmedSectionID, trimmedParamID)
	if err != nil {
		return err
	}
	codeObjType := effectiveCodeObjType(payload, impl)
	if !isParamCodeObjectType(codeObjType) {
		return fmt.Errorf("%w: type=%q", ErrUpdateParamImplConfigUnsupported, codeObjType)
	}

	normalizedConfig, err := normalizeParamImplConfigPatch(codeObjType, payload, newConfig)
	if err != nil {
		return err
	}
	if len(normalizedConfig) == 0 {
		return nil
	}

	fieldNames := make([]string, 0, len(normalizedConfig))
	for fieldName := range normalizedConfig {
		fieldNames = append(fieldNames, fieldName)
	}
	sort.Strings(fieldNames)
	for _, fieldName := range fieldNames {
		if err := p.setSectionCodeObjectField(trimmedSectionID, trimmedParamID, fieldName, normalizedConfig[fieldName]); err != nil {
			return err
		}
	}

	return p.normalizeValueAfterParamImplConfigUpdate(trimmedSectionID, trimmedParamID)
}

func normalizeParamImplConfigPatch(codeObjType string, currentPayload map[string]any, newConfig map[string]any) (map[string]any, error) {
	if len(newConfig) == 0 {
		return map[string]any{}, nil
	}
	normalizer, ok := paramImplConfigPatchNormalizers[codeObjType]
	if !ok {
		return nil, fmt.Errorf("%w: type=%q", ErrUpdateParamImplConfigUnsupported, codeObjType)
	}
	return normalizer(codeObjType, currentPayload, newConfig)
}

type paramImplConfigFieldHandler func(rawValue any) error

type paramImplConfigPatchNormalizer func(
	codeObjType string,
	currentPayload map[string]any,
	newConfig map[string]any,
) (map[string]any, error)

type paramImplConfigPatchNormalizerWithoutPayload func(
	codeObjType string,
	newConfig map[string]any,
) (map[string]any, error)

var paramImplConfigPatchNormalizers = map[string]paramImplConfigPatchNormalizer{
	"SliderParam":      normalizeSliderParamImplConfigPatch,
	"RotaryParam":      normalizeRotaryParamImplConfigPatch,
	"TextParam":        paramImplConfigPatchWithoutPayload(normalizeTextParamImplConfigPatch),
	"DateParam":        normalizeDateParamImplConfigPatch,
	"TimeParam":        paramImplConfigPatchWithoutPayload(normalizeTimeParamImplConfigPatch),
	"ButtonParam":      paramImplConfigPatchWithoutPayload(normalizeButtonParamImplConfigPatch),
	"ColorPickerParam": paramImplConfigPatchWithoutPayload(normalizeColorPickerParamImplConfigPatch),
	"DropdownParam":    paramImplConfigPatchWithoutPayload(normalizeDropdownParamImplConfigPatch),
	"DropzoneParam":    paramImplConfigPatchWithoutPayload(normalizeDropzoneParamImplConfigPatch),
	"NestedParam":      paramImplConfigPatchWithoutPayload(normalizeDescriptionOnlyParamImplConfigPatch),
	codeParamType:      paramImplConfigPatchWithoutPayload(normalizeDescriptionOnlyParamImplConfigPatch),
	"SwitchParam":      paramImplConfigPatchWithoutPayload(normalizeDescriptionOnlyParamImplConfigPatch),
	"PasswordParam":    paramImplConfigPatchWithoutPayload(normalizeDescriptionOnlyParamImplConfigPatch),
	"TextAreaParam":    paramImplConfigPatchWithoutPayload(normalizeDescriptionOnlyParamImplConfigPatch),
}

func paramImplConfigPatchWithoutPayload(
	normalizer paramImplConfigPatchNormalizerWithoutPayload,
) paramImplConfigPatchNormalizer {
	return func(codeObjType string, _ map[string]any, newConfig map[string]any) (map[string]any, error) {
		return normalizer(codeObjType, newConfig)
	}
}

func normalizeParamImplConfigFields(
	codeObjType string,
	newConfig map[string]any,
	handlers map[string]paramImplConfigFieldHandler,
) error {
	for fieldName, rawValue := range newConfig {
		handler, ok := handlers[fieldName]
		if !ok {
			return unsupportedParamImplConfigFieldError(codeObjType, fieldName)
		}
		if err := handler(rawValue); err != nil {
			return err
		}
	}
	return nil
}

func setParamImplRawStringField(
	normalized map[string]any,
	codeObjType string,
	fieldName string,
	rawValue any,
) (string, error) {
	value, err := readRawStringConfigValue(rawValue)
	if err != nil {
		return "", wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
	}
	normalized[fieldName] = value
	return value, nil
}

func setParamImplEnumField(
	normalized map[string]any,
	codeObjType string,
	fieldName string,
	rawValue any,
	allowed map[string]struct{},
) (string, error) {
	value, err := readEnumConfigValue(rawValue, allowed)
	if err != nil {
		return "", wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
	}
	normalized[fieldName] = value
	return value, nil
}

func setParamImplBoolField(
	normalized map[string]any,
	codeObjType string,
	fieldName string,
	rawValue any,
) (bool, error) {
	value, err := readBoolConfigValue(rawValue)
	if err != nil {
		return false, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
	}
	normalized[fieldName] = value
	return value, nil
}

func setParamImplIntField(
	normalized map[string]any,
	codeObjType string,
	fieldName string,
	rawValue any,
) (int, error) {
	value, err := readIntConfigValue(rawValue)
	if err != nil {
		return 0, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
	}
	normalized[fieldName] = value
	return value, nil
}

func setParamImplFiniteNumberField(
	normalized map[string]any,
	codeObjType string,
	fieldName string,
	rawValue any,
) (float64, error) {
	value, err := readFiniteNumberConfigValue(rawValue)
	if err != nil {
		return 0, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
	}
	normalized[fieldName] = value
	return value, nil
}

func setParamImplNullablePositiveIntField(
	normalized map[string]any,
	codeObjType string,
	fieldName string,
	rawValue any,
) (any, error) {
	value, err := readNullablePositiveIntConfigValue(rawValue)
	if err != nil {
		return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
	}
	normalized[fieldName] = value
	return value, nil
}

func setParamImplStringListField(
	normalized map[string]any,
	codeObjType string,
	fieldName string,
	rawValue any,
) ([]string, error) {
	value, err := readStringListConfigValue(rawValue)
	if err != nil {
		return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
	}
	normalized[fieldName] = value
	return value, nil
}

func setParamImplColorChoicesField(
	normalized map[string]any,
	codeObjType string,
	fieldName string,
	rawValue any,
) ([]map[string]any, error) {
	value, err := readColorChoicesConfigValue(rawValue)
	if err != nil {
		return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
	}
	normalized[fieldName] = value
	return value, nil
}

func normalizeSliderParamImplConfigPatch(
	codeObjType string,
	currentPayload map[string]any,
	newConfig map[string]any,
) (map[string]any, error) {
	normalized := map[string]any{}
	nextMin := int(numberFieldOrDefault(currentPayload, "min", 0))
	nextMax := int(numberFieldOrDefault(currentPayload, "max", 100))
	nextStep := int(numberFieldOrDefault(currentPayload, "step", 1))
	if err := normalizeParamImplConfigFields(codeObjType, newConfig, map[string]paramImplConfigFieldHandler{
		"description": func(rawValue any) error {
			_, err := setParamImplRawStringField(normalized, codeObjType, "description", rawValue)
			return err
		},
		"min": func(rawValue any) error {
			value, err := setParamImplIntField(normalized, codeObjType, "min", rawValue)
			if err != nil {
				return err
			}
			nextMin = value
			return nil
		},
		"max": func(rawValue any) error {
			value, err := setParamImplIntField(normalized, codeObjType, "max", rawValue)
			if err != nil {
				return err
			}
			nextMax = value
			return nil
		},
		"step": func(rawValue any) error {
			value, err := setParamImplIntField(normalized, codeObjType, "step", rawValue)
			if err != nil {
				return err
			}
			nextStep = value
			return nil
		},
	}); err != nil {
		return nil, err
	}
	if err := validateNumericRangeConfig(float64(nextMin), float64(nextMax), float64(nextStep)); err != nil {
		return nil, fmt.Errorf("%w: type=%q: %s", ErrUpdateParamImplConfigFieldInvalid, codeObjType, err.Error())
	}
	return normalized, nil
}

func normalizeRotaryParamImplConfigPatch(
	codeObjType string,
	currentPayload map[string]any,
	newConfig map[string]any,
) (map[string]any, error) {
	normalized := map[string]any{}
	nextMin := numberFieldOrDefault(currentPayload, "min", 0)
	nextMax := numberFieldOrDefault(currentPayload, "max", 1)
	nextStep := numberFieldOrDefault(currentPayload, "step", 0.1)
	if err := normalizeParamImplConfigFields(codeObjType, newConfig, map[string]paramImplConfigFieldHandler{
		"description": func(rawValue any) error {
			_, err := setParamImplRawStringField(normalized, codeObjType, "description", rawValue)
			return err
		},
		"min": func(rawValue any) error {
			value, err := setParamImplFiniteNumberField(normalized, codeObjType, "min", rawValue)
			if err != nil {
				return err
			}
			nextMin = value
			return nil
		},
		"max": func(rawValue any) error {
			value, err := setParamImplFiniteNumberField(normalized, codeObjType, "max", rawValue)
			if err != nil {
				return err
			}
			nextMax = value
			return nil
		},
		"step": func(rawValue any) error {
			value, err := setParamImplFiniteNumberField(normalized, codeObjType, "step", rawValue)
			if err != nil {
				return err
			}
			nextStep = value
			return nil
		},
	}); err != nil {
		return nil, err
	}
	if err := validateNumericRangeConfig(nextMin, nextMax, nextStep); err != nil {
		return nil, fmt.Errorf("%w: type=%q: %s", ErrUpdateParamImplConfigFieldInvalid, codeObjType, err.Error())
	}
	return normalized, nil
}

func normalizeTextParamImplConfigPatch(codeObjType string, newConfig map[string]any) (map[string]any, error) {
	normalized := map[string]any{}
	if err := normalizeParamImplConfigFields(codeObjType, newConfig, map[string]paramImplConfigFieldHandler{
		"description": func(rawValue any) error {
			_, err := setParamImplRawStringField(normalized, codeObjType, "description", rawValue)
			return err
		},
		"uiType": func(rawValue any) error {
			_, err := setParamImplEnumField(normalized, codeObjType, "uiType", rawValue, textParamUITypeValues)
			return err
		},
	}); err != nil {
		return nil, err
	}
	return normalized, nil
}

func normalizeDateParamImplConfigPatch(
	codeObjType string,
	currentPayload map[string]any,
	newConfig map[string]any,
) (map[string]any, error) {
	normalized := map[string]any{}
	nextDateIncludesTime := payloadBoolField(currentPayload, "dateIncludesTime")
	if err := normalizeParamImplConfigFields(codeObjType, newConfig, map[string]paramImplConfigFieldHandler{
		"description": func(rawValue any) error {
			_, err := setParamImplRawStringField(normalized, codeObjType, "description", rawValue)
			return err
		},
		"dateDisplayFormat": func(rawValue any) error {
			_, err := setParamImplEnumField(normalized, codeObjType, "dateDisplayFormat", rawValue, dateDisplayFormatValues)
			return err
		},
		"dateControlMode": func(rawValue any) error {
			_, err := setParamImplEnumField(normalized, codeObjType, "dateControlMode", rawValue, dateControlModeValues)
			return err
		},
		"dateSelectionMode": func(rawValue any) error {
			_, err := setParamImplEnumField(normalized, codeObjType, "dateSelectionMode", rawValue, dateSelectionModeValues)
			return err
		},
		"dateCalendarWeekStart": func(rawValue any) error {
			_, err := setParamImplEnumField(normalized, codeObjType, "dateCalendarWeekStart", rawValue, dateCalendarWeekStartValues)
			return err
		},
		"dateIncludesTime": func(rawValue any) error {
			value, err := setParamImplBoolField(normalized, codeObjType, "dateIncludesTime", rawValue)
			if err != nil {
				return err
			}
			nextDateIncludesTime = value
			return nil
		},
	}); err != nil {
		return nil, err
	}
	if nextDateIncludesTime {
		normalized["dateSelectionMode"] = "single"
	}
	return normalized, nil
}

func normalizeTimeParamImplConfigPatch(codeObjType string, newConfig map[string]any) (map[string]any, error) {
	normalized := map[string]any{}
	if err := normalizeParamImplConfigFields(codeObjType, newConfig, map[string]paramImplConfigFieldHandler{
		"description": func(rawValue any) error {
			_, err := setParamImplRawStringField(normalized, codeObjType, "description", rawValue)
			return err
		},
		"timeControlMode": func(rawValue any) error {
			_, err := setParamImplEnumField(normalized, codeObjType, "timeControlMode", rawValue, timeControlModeValues)
			return err
		},
		"timeDisplayFormat": func(rawValue any) error {
			_, err := setParamImplEnumField(normalized, codeObjType, "timeDisplayFormat", rawValue, timeDisplayFormatValues)
			return err
		},
		"timeDisplayTransparent": func(rawValue any) error {
			_, err := setParamImplBoolField(normalized, codeObjType, "timeDisplayTransparent", rawValue)
			return err
		},
		"timeDisplayScale": func(rawValue any) error {
			value, err := setParamImplFiniteNumberField(normalized, codeObjType, "timeDisplayScale", rawValue)
			if err != nil {
				return err
			}
			if value < 0.5 || value > 3 {
				return wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, "timeDisplayScale", "must be between 0.5 and 3")
			}
			return nil
		},
		"timeDisplayFont": func(rawValue any) error {
			_, err := setParamImplEnumField(normalized, codeObjType, "timeDisplayFont", rawValue, timeDisplayFontValues)
			return err
		},
	}); err != nil {
		return nil, err
	}
	return normalized, nil
}

func normalizeButtonParamImplConfigPatch(codeObjType string, newConfig map[string]any) (map[string]any, error) {
	normalized := map[string]any{}
	rawStringHandler := func(fieldName string) paramImplConfigFieldHandler {
		return func(rawValue any) error {
			_, err := setParamImplRawStringField(normalized, codeObjType, fieldName, rawValue)
			return err
		}
	}
	if err := normalizeParamImplConfigFields(codeObjType, newConfig, map[string]paramImplConfigFieldHandler{
		"description":        rawStringHandler("description"),
		"label":              rawStringHandler("label"),
		"requestUrl":         rawStringHandler("requestUrl"),
		"requestHeaderKey":   rawStringHandler("requestHeaderKey"),
		"requestHeaderValue": rawStringHandler("requestHeaderValue"),
		"requestBody":        rawStringHandler("requestBody"),
		"actionMode": func(rawValue any) error {
			_, err := setParamImplEnumField(normalized, codeObjType, "actionMode", rawValue, buttonActionModeValues)
			return err
		},
		"requestMethod": func(rawValue any) error {
			_, err := setParamImplEnumField(normalized, codeObjType, "requestMethod", rawValue, httpRequestMethodValues)
			return err
		},
	}); err != nil {
		return nil, err
	}
	return normalized, nil
}

func normalizeColorPickerParamImplConfigPatch(codeObjType string, newConfig map[string]any) (map[string]any, error) {
	normalized := map[string]any{}
	if err := normalizeParamImplConfigFields(codeObjType, newConfig, map[string]paramImplConfigFieldHandler{
		"description": func(rawValue any) error {
			_, err := setParamImplRawStringField(normalized, codeObjType, "description", rawValue)
			return err
		},
		"colorChoices": func(rawValue any) error {
			_, err := setParamImplColorChoicesField(normalized, codeObjType, "colorChoices", rawValue)
			return err
		},
	}); err != nil {
		return nil, err
	}
	return normalized, nil
}

func normalizeDropdownParamImplConfigPatch(codeObjType string, newConfig map[string]any) (map[string]any, error) {
	normalized := map[string]any{}
	if err := normalizeParamImplConfigFields(codeObjType, newConfig, map[string]paramImplConfigFieldHandler{
		"description": func(rawValue any) error {
			_, err := setParamImplRawStringField(normalized, codeObjType, "description", rawValue)
			return err
		},
		"choices": func(rawValue any) error {
			_, err := setParamImplStringListField(normalized, codeObjType, "choices", rawValue)
			return err
		},
	}); err != nil {
		return nil, err
	}
	return normalized, nil
}

func normalizeDropzoneParamImplConfigPatch(codeObjType string, newConfig map[string]any) (map[string]any, error) {
	normalized := map[string]any{}
	if err := normalizeParamImplConfigFields(codeObjType, newConfig, map[string]paramImplConfigFieldHandler{
		"description": func(rawValue any) error {
			_, err := setParamImplRawStringField(normalized, codeObjType, "description", rawValue)
			return err
		},
		"placeholder": func(rawValue any) error {
			_, err := setParamImplRawStringField(normalized, codeObjType, "placeholder", rawValue)
			return err
		},
		"mode": func(rawValue any) error {
			_, err := setParamImplEnumField(normalized, codeObjType, "mode", rawValue, dropzoneModeValues)
			return err
		},
		"maxAttachments": func(rawValue any) error {
			_, err := setParamImplNullablePositiveIntField(normalized, codeObjType, "maxAttachments", rawValue)
			return err
		},
	}); err != nil {
		return nil, err
	}
	return normalized, nil
}

func normalizeDescriptionOnlyParamImplConfigPatch(codeObjType string, newConfig map[string]any) (map[string]any, error) {
	normalized := map[string]any{}
	if err := normalizeParamImplConfigFields(codeObjType, newConfig, map[string]paramImplConfigFieldHandler{
		"description": func(rawValue any) error {
			_, err := setParamImplRawStringField(normalized, codeObjType, "description", rawValue)
			return err
		},
	}); err != nil {
		return nil, err
	}
	return normalized, nil
}

func (p *Project) normalizeValueAfterParamImplConfigUpdate(sectionID string, paramInfoID string) error {
	payload, _, _, impl, err := p.ResolveSectionCodeObject(sectionID, paramInfoID)
	if err != nil {
		return err
	}
	codeObjType := effectiveCodeObjType(payload, impl)
	if _, ok := childlessParamCodeObjectTypes[codeObjType]; !ok {
		return nil
	}

	currentValue, hasValue := payloadRawStringFieldWithPresence(payload, "value")
	if !hasValue {
		return nil
	}
	if codeObjType == "PasswordParam" {
		return nil
	}

	normalizedValue, err := convertCodeObjectValueForType(payload, currentValue)
	if err != nil {
		return err
	}
	if normalizedValue == currentValue {
		return nil
	}
	return p.setSectionCodeObjectField(sectionID, paramInfoID, "value", normalizedValue)
}

func unsupportedParamImplConfigFieldError(codeObjType string, fieldName string) error {
	return fmt.Errorf("%w: type=%q field=%q", ErrUpdateParamImplConfigFieldUnsupported, codeObjType, fieldName)
}

func wrapParamImplConfigFieldError(base error, codeObjType string, fieldName string, detail string) error {
	detail = strings.TrimSpace(detail)
	if detail == "" {
		return fmt.Errorf("%w: type=%q field=%q", base, codeObjType, fieldName)
	}
	return fmt.Errorf("%w: type=%q field=%q: %s", base, codeObjType, fieldName, detail)
}

func readRawStringConfigValue(rawValue any) (string, error) {
	value, ok := rawValue.(string)
	if !ok {
		return "", errors.New("must be a string")
	}
	return value, nil
}

func readEnumConfigValue(rawValue any, allowed map[string]struct{}) (string, error) {
	value, ok := rawValue.(string)
	if !ok {
		return "", errors.New("must be a string")
	}
	if _, ok := allowed[value]; !ok {
		return "", fmt.Errorf("unsupported value %q", value)
	}
	return value, nil
}

func readBoolConfigValue(rawValue any) (bool, error) {
	value, ok := rawValue.(bool)
	if !ok {
		return false, errors.New("must be a boolean")
	}
	return value, nil
}

func readIntConfigValue(rawValue any) (int, error) {
	value, err := readFiniteNumberConfigValue(rawValue)
	if err != nil {
		return 0, err
	}
	if math.Trunc(value) != value {
		return 0, errors.New("must be an integer")
	}
	return int(value), nil
}

func readFiniteNumberConfigValue(rawValue any) (float64, error) {
	var value float64
	switch typed := rawValue.(type) {
	case float64:
		value = typed
	case float32:
		value = float64(typed)
	case int:
		value = float64(typed)
	case int8:
		value = float64(typed)
	case int16:
		value = float64(typed)
	case int32:
		value = float64(typed)
	case int64:
		value = float64(typed)
	default:
		return 0, errors.New("must be a number")
	}
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, errors.New("must be a finite number")
	}
	return value, nil
}

func readNullablePositiveIntConfigValue(rawValue any) (any, error) {
	if rawValue == nil {
		return nil, nil
	}
	value, err := readIntConfigValue(rawValue)
	if err != nil {
		return nil, err
	}
	if value < 1 {
		return nil, errors.New("must be null or at least 1")
	}
	return value, nil
}

func readStringListConfigValue(rawValue any) ([]string, error) {
	switch typed := rawValue.(type) {
	case []string:
		values := make([]string, len(typed))
		copy(values, typed)
		return values, nil
	case []any:
		values := make([]string, 0, len(typed))
		for _, entry := range typed {
			value, ok := entry.(string)
			if !ok {
				return nil, errors.New("must be an array of strings")
			}
			values = append(values, value)
		}
		return values, nil
	default:
		return nil, errors.New("must be an array of strings")
	}
}

func readColorChoicesConfigValue(rawValue any) ([]map[string]any, error) {
	rawEntries, err := readColorChoiceEntries(rawValue)
	if err != nil {
		return nil, err
	}

	choices := make([]map[string]any, 0, len(rawEntries))
	for _, entry := range rawEntries {
		choice, err := readColorChoiceEntry(entry)
		if err != nil {
			return nil, err
		}
		choices = append(choices, choice)
	}
	return choices, nil
}

func readColorChoiceEntries(rawValue any) ([]map[string]any, error) {
	switch typed := rawValue.(type) {
	case []map[string]any:
		entries := make([]map[string]any, len(typed))
		copy(entries, typed)
		return entries, nil
	case []any:
		entries := make([]map[string]any, 0, len(typed))
		for _, rawEntry := range typed {
			entry, ok := rawEntry.(map[string]any)
			if !ok {
				return nil, errors.New("must be an array of color choice objects")
			}
			entries = append(entries, entry)
		}
		return entries, nil
	default:
		return nil, errors.New("must be an array of color choice objects")
	}
}

func readColorChoiceEntry(entry map[string]any) (map[string]any, error) {
	colorRaw, ok := entry["color"]
	if !ok {
		return nil, errors.New("each color choice must include color")
	}
	color, ok := colorRaw.(string)
	if !ok {
		return nil, errors.New("color choice color must be a string")
	}
	if !isColorHex(color) {
		return nil, fmt.Errorf("color choice color %q must be a hex color", color)
	}

	description, err := readOptionalStringMapField(entry, "description", "color choice description must be a string")
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"color":       color,
		"description": description,
	}, nil
}

func readOptionalStringMapField(entry map[string]any, fieldName string, invalidTypeMessage string) (string, error) {
	rawValue, ok := entry[fieldName]
	if !ok || rawValue == nil {
		return "", nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", errors.New(invalidTypeMessage)
	}
	return value, nil
}

func validateNumericRangeConfig(minimum float64, maximum float64, step float64) error {
	if minimum >= maximum {
		return errors.New("min must be less than max")
	}
	if step <= 0 {
		return errors.New("step must be greater than 0")
	}
	if step > maximum-minimum {
		return errors.New("step must be less than or equal to max - min")
	}
	return nil
}
