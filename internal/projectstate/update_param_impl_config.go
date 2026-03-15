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
	normalized := map[string]any{}
	if len(newConfig) == 0 {
		return normalized, nil
	}

	nextDateIncludesTime := payloadBoolField(currentPayload, "dateIncludesTime")
	switch codeObjType {
	case "SliderParam":
		nextMin := int(numberFieldOrDefault(currentPayload, "min", 0))
		nextMax := int(numberFieldOrDefault(currentPayload, "max", 100))
		nextStep := int(numberFieldOrDefault(currentPayload, "step", 1))
		for fieldName, rawValue := range newConfig {
			switch fieldName {
			case "description":
				value, err := readRawStringConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "min":
				value, err := readIntConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				nextMin = value
				normalized[fieldName] = value
			case "max":
				value, err := readIntConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				nextMax = value
				normalized[fieldName] = value
			case "step":
				value, err := readIntConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				nextStep = value
				normalized[fieldName] = value
			default:
				return nil, unsupportedParamImplConfigFieldError(codeObjType, fieldName)
			}
		}
		if err := validateNumericRangeConfig(float64(nextMin), float64(nextMax), float64(nextStep)); err != nil {
			return nil, fmt.Errorf("%w: type=%q: %s", ErrUpdateParamImplConfigFieldInvalid, codeObjType, err.Error())
		}
		return normalized, nil
	case "RotaryParam":
		nextMin := numberFieldOrDefault(currentPayload, "min", 0)
		nextMax := numberFieldOrDefault(currentPayload, "max", 1)
		nextStep := numberFieldOrDefault(currentPayload, "step", 0.1)
		for fieldName, rawValue := range newConfig {
			switch fieldName {
			case "description":
				value, err := readRawStringConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "min":
				value, err := readFiniteNumberConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				nextMin = value
				normalized[fieldName] = value
			case "max":
				value, err := readFiniteNumberConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				nextMax = value
				normalized[fieldName] = value
			case "step":
				value, err := readFiniteNumberConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				nextStep = value
				normalized[fieldName] = value
			default:
				return nil, unsupportedParamImplConfigFieldError(codeObjType, fieldName)
			}
		}
		if err := validateNumericRangeConfig(nextMin, nextMax, nextStep); err != nil {
			return nil, fmt.Errorf("%w: type=%q: %s", ErrUpdateParamImplConfigFieldInvalid, codeObjType, err.Error())
		}
		return normalized, nil
	case "TextParam":
		for fieldName, rawValue := range newConfig {
			switch fieldName {
			case "description":
				value, err := readRawStringConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "uiType":
				value, err := readEnumConfigValue(rawValue, textParamUITypeValues)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			default:
				return nil, unsupportedParamImplConfigFieldError(codeObjType, fieldName)
			}
		}
		return normalized, nil
	case "DateParam":
		for fieldName, rawValue := range newConfig {
			switch fieldName {
			case "description":
				value, err := readRawStringConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "dateDisplayFormat":
				value, err := readEnumConfigValue(rawValue, dateDisplayFormatValues)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "dateControlMode":
				value, err := readEnumConfigValue(rawValue, dateControlModeValues)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "dateSelectionMode":
				value, err := readEnumConfigValue(rawValue, dateSelectionModeValues)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "dateCalendarWeekStart":
				value, err := readEnumConfigValue(rawValue, dateCalendarWeekStartValues)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "dateIncludesTime":
				value, err := readBoolConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				nextDateIncludesTime = value
				normalized[fieldName] = value
			default:
				return nil, unsupportedParamImplConfigFieldError(codeObjType, fieldName)
			}
		}
		if nextDateIncludesTime {
			normalized["dateSelectionMode"] = "single"
		}
		return normalized, nil
	case "TimeParam":
		for fieldName, rawValue := range newConfig {
			switch fieldName {
			case "description":
				value, err := readRawStringConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "timeControlMode":
				value, err := readEnumConfigValue(rawValue, timeControlModeValues)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "timeDisplayFormat":
				value, err := readEnumConfigValue(rawValue, timeDisplayFormatValues)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "timeDisplayTransparent":
				value, err := readBoolConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "timeDisplayScale":
				value, err := readFiniteNumberConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				if value < 0.5 || value > 3 {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, "must be between 0.5 and 3")
				}
				normalized[fieldName] = value
			case "timeDisplayFont":
				value, err := readEnumConfigValue(rawValue, timeDisplayFontValues)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			default:
				return nil, unsupportedParamImplConfigFieldError(codeObjType, fieldName)
			}
		}
		return normalized, nil
	case "ButtonParam":
		for fieldName, rawValue := range newConfig {
			switch fieldName {
			case "description", "label", "requestUrl", "requestHeaderKey", "requestHeaderValue", "requestBody":
				value, err := readRawStringConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "actionMode":
				value, err := readEnumConfigValue(rawValue, buttonActionModeValues)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "requestMethod":
				value, err := readEnumConfigValue(rawValue, httpRequestMethodValues)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			default:
				return nil, unsupportedParamImplConfigFieldError(codeObjType, fieldName)
			}
		}
		return normalized, nil
	case "ColorPickerParam":
		for fieldName, rawValue := range newConfig {
			switch fieldName {
			case "description":
				value, err := readRawStringConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "colorChoices":
				value, err := readColorChoicesConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			default:
				return nil, unsupportedParamImplConfigFieldError(codeObjType, fieldName)
			}
		}
		return normalized, nil
	case "DropdownParam":
		for fieldName, rawValue := range newConfig {
			switch fieldName {
			case "description":
				value, err := readRawStringConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "choices":
				value, err := readStringListConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			default:
				return nil, unsupportedParamImplConfigFieldError(codeObjType, fieldName)
			}
		}
		return normalized, nil
	case "DropzoneParam":
		for fieldName, rawValue := range newConfig {
			switch fieldName {
			case "description", "placeholder":
				value, err := readRawStringConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "mode":
				value, err := readEnumConfigValue(rawValue, dropzoneModeValues)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			case "maxAttachments":
				value, err := readNullablePositiveIntConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			default:
				return nil, unsupportedParamImplConfigFieldError(codeObjType, fieldName)
			}
		}
		return normalized, nil
	case "NestedParam", codeParamType, "SwitchParam", "PasswordParam", "TextAreaParam":
		for fieldName, rawValue := range newConfig {
			switch fieldName {
			case "description":
				value, err := readRawStringConfigValue(rawValue)
				if err != nil {
					return nil, wrapParamImplConfigFieldError(ErrUpdateParamImplConfigFieldInvalid, codeObjType, fieldName, err.Error())
				}
				normalized[fieldName] = value
			default:
				return nil, unsupportedParamImplConfigFieldError(codeObjType, fieldName)
			}
		}
		return normalized, nil
	default:
		return nil, fmt.Errorf("%w: type=%q", ErrUpdateParamImplConfigUnsupported, codeObjType)
	}
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
	var rawEntries []any
	switch typed := rawValue.(type) {
	case []any:
		rawEntries = typed
	case []map[string]any:
		rawEntries = make([]any, 0, len(typed))
		for _, entry := range typed {
			rawEntries = append(rawEntries, entry)
		}
	default:
		return nil, errors.New("must be an array of color choice objects")
	}

	choices := make([]map[string]any, 0, len(rawEntries))
	for _, rawEntry := range rawEntries {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			return nil, errors.New("must be an array of color choice objects")
		}
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

		description := ""
		if rawDescription, ok := entry["description"]; ok && rawDescription != nil {
			value, ok := rawDescription.(string)
			if !ok {
				return nil, errors.New("color choice description must be a string")
			}
			description = value
		}

		choices = append(choices, map[string]any{
			"color":       color,
			"description": description,
		})
	}
	return choices, nil
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
