package mcpx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"strconv"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/tools"
)

func applyToolResultFilter(payload any, metadata tools.Metadata, invocation ToolInvocationContext) (any, error) {
	switch metadata.ResultFilter {
	case tools.ResultFilterLSPDiagnostics:
		if invocation.Scope == nil {
			return nil, newToolError("internal_error", "Scoped LSP diagnostics filtering requires a resolved scope.")
		}
		diagnostics, ok := payload.(projectstate.LSPDiagnosticsPayload)
		if !ok {
			typed, ok := payload.(*projectstate.LSPDiagnosticsPayload)
			if !ok || typed == nil {
				return nil, fmt.Errorf("mcpx: unsupported lsp diagnostics payload type %T", payload)
			}
			diagnostics = *typed
		}
		return filterLSPDiagnosticsPayload(diagnostics, invocation.Scope.effectiveReadSectionIDs(), invocation.Scope.StructuralAllowed), nil
	default:
		return payload, nil
	}
}

func readRequiredStringArgument(arguments map[string]any, key string) (string, error) {
	rawValue, ok := arguments[key]
	if !ok {
		return "", newToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", newToolError("invalid_arguments", "%s must be a string", key)
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return "", newToolError("invalid_arguments", "%s must not be empty", key)
	}
	return value, nil
}

func readRequiredRawStringArgument(arguments map[string]any, key string) (string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return "", newToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", newToolError("invalid_arguments", "%s must be a string", key)
	}
	return value, nil
}

func readOptionalStringArgument(arguments map[string]any, key string) (string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return "", nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", newToolError("invalid_arguments", "%s must be a string", key)
	}
	return strings.TrimSpace(value), nil
}

func readOptionalNullableStringPointerArgument(arguments map[string]any, key string) (*string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be a string or null", key)
	}
	trimmedValue := strings.TrimSpace(value)
	return &trimmedValue, nil
}

func readOptionalNonBlankStringArgument(arguments map[string]any, key string) (string, error) {
	value, err := readOptionalStringArgument(arguments, key)
	if err != nil {
		return "", err
	}
	if _, ok := arguments[key]; ok && strings.TrimSpace(value) == "" {
		return "", newToolError("invalid_arguments", "%s must be a non-empty string when provided", key)
	}
	return value, nil
}

func readOptionalBoolArgument(arguments map[string]any, key string) (bool, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return false, nil
	}
	value, ok := rawValue.(bool)
	if !ok {
		return false, newToolError("invalid_arguments", "%s must be a boolean", key)
	}
	return value, nil
}

func readOptionalBoolPointerArgument(arguments map[string]any, key string) (*bool, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.(bool)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be a boolean", key)
	}
	return &value, nil
}

func readRequiredBoolArgument(arguments map[string]any, key string) (bool, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return false, newToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(bool)
	if !ok {
		return false, newToolError("invalid_arguments", "%s must be a boolean", key)
	}
	return value, nil
}

func readRequiredArgument(arguments map[string]any, key string) (any, error) {
	value, ok := arguments[key]
	if !ok || value == nil {
		return nil, newToolError("invalid_arguments", "%s is required", key)
	}
	return value, nil
}

func readRequiredPresentArgument(arguments map[string]any, key string) (any, error) {
	value, ok := arguments[key]
	if !ok {
		return nil, newToolError("invalid_arguments", "%s is required", key)
	}
	return value, nil
}

func readRequiredObjectArgument(arguments map[string]any, key string) (map[string]any, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, newToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(map[string]any)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be an object", key)
	}
	return value, nil
}

func readOptionalObjectPointerArgument(arguments map[string]any, key string) (*map[string]any, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.(map[string]any)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be an object", key)
	}
	return &value, nil
}

func readOptionalPositionArgument(arguments map[string]any, key string) (*projectstate.Position, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}

	object, ok := rawValue.(map[string]any)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be an object", key)
	}
	x, err := readRequiredFiniteNumberField(object, key, "x")
	if err != nil {
		return nil, err
	}
	y, err := readRequiredFiniteNumberField(object, key, "y")
	if err != nil {
		return nil, err
	}
	return &projectstate.Position{X: x, Y: y}, nil
}

type createTopLevelSectionArgs struct {
	projectConfigID string
	input           projectstate.CreateTopLevelSectionInput
}

type createChildSectionsArgs struct {
	projectConfigID string
	input           projectstate.CreateChildSectionsInput
}

type createChildSectionsViaIncrementerArgs struct {
	projectConfigID string
	input           projectstate.CreateChildSectionsViaIncrementerInput
}

type setAgenticContextArgs struct {
	projectConfigID       string
	chatID                string
	runID                 string
	sectionID             string
	shareSessionID        string
	frontendAffinityToken string
	allowUnscoped         bool
}

type setCodeSectionAttachedTerminalArgs struct {
	projectConfigID   string
	sectionID         string
	terminalSectionID *string
}

type deleteChildSectionsViaDecrementerArgs struct {
	projectConfigID string
	input           projectstate.DeleteChildSectionsViaDecrementerInput
}

type setCallableArgs struct {
	projectConfigID string
	sectionID       string
	callableName    string
	refetchParams   bool
}

type autoLayoutTopLevelSectionsArgs struct {
	projectConfigID string
	margin          int
}

func readCreateTopLevelSectionArgs(arguments map[string]any) (createTopLevelSectionArgs, error) {
	projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
	if err != nil {
		return createTopLevelSectionArgs{}, err
	}
	implType, err := readRequiredStringArgument(arguments, "implType")
	if err != nil {
		return createTopLevelSectionArgs{}, err
	}
	controlCodeObjType, err := readOptionalStringArgument(arguments, "controlCodeObjType")
	if err != nil {
		return createTopLevelSectionArgs{}, err
	}
	position, err := readOptionalPositionArgument(arguments, "position")
	if err != nil {
		return createTopLevelSectionArgs{}, err
	}

	args := createTopLevelSectionArgs{
		projectConfigID: projectConfigID,
		input: projectstate.CreateTopLevelSectionInput{
			ImplType: implType,
			Position: position,
		},
	}
	if strings.TrimSpace(controlCodeObjType) != "" {
		args.input.ControlCodeObjType = &controlCodeObjType
	}
	return args, nil
}

func readCreateChildSectionsArgs(arguments map[string]any) (createChildSectionsArgs, error) {
	projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
	if err != nil {
		return createChildSectionsArgs{}, err
	}
	parentID, err := readRequiredStringArgument(arguments, "parentId")
	if err != nil {
		return createChildSectionsArgs{}, err
	}
	implType, err := readRequiredStringArgument(arguments, "implType")
	if err != nil {
		return createChildSectionsArgs{}, err
	}
	numChildren, err := readRequiredPositiveIntArgument(arguments, "numChildren")
	if err != nil {
		return createChildSectionsArgs{}, err
	}
	startIdx, err := readOptionalNonNegativeIntArgument(arguments, "startIdx")
	if err != nil {
		return createChildSectionsArgs{}, err
	}
	return createChildSectionsArgs{
		projectConfigID: projectConfigID,
		input: projectstate.CreateChildSectionsInput{
			ParentID:    parentID,
			ImplType:    implType,
			NumChildren: numChildren,
			StartIdx:    startIdx,
		},
	}, nil
}

func readCreateChildSectionsViaIncrementerArgs(arguments map[string]any) (createChildSectionsViaIncrementerArgs, error) {
	projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
	if err != nil {
		return createChildSectionsViaIncrementerArgs{}, err
	}
	calledBy, err := readRequiredStringArgument(arguments, "calledBy")
	if err != nil {
		return createChildSectionsViaIncrementerArgs{}, err
	}
	implType, err := readRequiredStringArgument(arguments, "implType")
	if err != nil {
		return createChildSectionsViaIncrementerArgs{}, err
	}
	numChildren, err := readRequiredPositiveIntArgument(arguments, "numChildren")
	if err != nil {
		return createChildSectionsViaIncrementerArgs{}, err
	}
	return createChildSectionsViaIncrementerArgs{
		projectConfigID: projectConfigID,
		input: projectstate.CreateChildSectionsViaIncrementerInput{
			CalledBy:    calledBy,
			ImplType:    implType,
			NumChildren: numChildren,
		},
	}, nil
}

func readSetAgenticContextArgs(arguments map[string]any) (setAgenticContextArgs, error) {
	projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
	if err != nil {
		return setAgenticContextArgs{}, err
	}
	chatID, err := readOptionalStringArgument(arguments, "chatId")
	if err != nil {
		return setAgenticContextArgs{}, err
	}
	runID, err := readOptionalStringArgument(arguments, "runId")
	if err != nil {
		return setAgenticContextArgs{}, err
	}
	sectionID, err := readOptionalStringArgument(arguments, "sectionId")
	if err != nil {
		return setAgenticContextArgs{}, err
	}
	shareSessionID, err := readOptionalStringArgument(arguments, "shareSessionId")
	if err != nil {
		return setAgenticContextArgs{}, err
	}
	frontendAffinityToken, err := readOptionalNonBlankStringArgument(arguments, "frontendAffinityToken")
	if err != nil {
		return setAgenticContextArgs{}, err
	}
	allowUnscoped, err := readOptionalBoolArgument(arguments, "allowUnscoped")
	if err != nil {
		return setAgenticContextArgs{}, err
	}
	return setAgenticContextArgs{
		projectConfigID:       projectConfigID,
		chatID:                chatID,
		runID:                 runID,
		sectionID:             sectionID,
		shareSessionID:        shareSessionID,
		frontendAffinityToken: frontendAffinityToken,
		allowUnscoped:         allowUnscoped,
	}, nil
}

func readSetCodeSectionAttachedTerminalArgs(arguments map[string]any) (setCodeSectionAttachedTerminalArgs, error) {
	projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
	if err != nil {
		return setCodeSectionAttachedTerminalArgs{}, err
	}
	sectionID, err := readRequiredStringArgument(arguments, "sectionId")
	if err != nil {
		return setCodeSectionAttachedTerminalArgs{}, err
	}
	terminalSectionID, err := readOptionalNullableStringPointerArgument(arguments, "terminalSectionId")
	if err != nil {
		return setCodeSectionAttachedTerminalArgs{}, err
	}
	return setCodeSectionAttachedTerminalArgs{
		projectConfigID:   projectConfigID,
		sectionID:         sectionID,
		terminalSectionID: terminalSectionID,
	}, nil
}

func readDeleteChildSectionsViaDecrementerArgs(arguments map[string]any) (deleteChildSectionsViaDecrementerArgs, error) {
	projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
	if err != nil {
		return deleteChildSectionsViaDecrementerArgs{}, err
	}
	calledBy, err := readRequiredStringArgument(arguments, "calledBy")
	if err != nil {
		return deleteChildSectionsViaDecrementerArgs{}, err
	}
	numChildren, err := readOptionalNonNegativeIntArgument(arguments, "numChildren")
	if err != nil {
		return deleteChildSectionsViaDecrementerArgs{}, err
	}
	if numChildren == nil {
		return deleteChildSectionsViaDecrementerArgs{}, newToolError("invalid_arguments", "numChildren is required")
	}
	return deleteChildSectionsViaDecrementerArgs{
		projectConfigID: projectConfigID,
		input: projectstate.DeleteChildSectionsViaDecrementerInput{
			CalledBy:    calledBy,
			NumChildren: *numChildren,
		},
	}, nil
}

func readSetCallableArgs(arguments map[string]any) (setCallableArgs, error) {
	projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
	if err != nil {
		return setCallableArgs{}, err
	}
	sectionID, err := readRequiredStringArgument(arguments, "sectionId")
	if err != nil {
		return setCallableArgs{}, err
	}
	callableName, err := readRequiredRawStringArgument(arguments, "callableName")
	if err != nil {
		return setCallableArgs{}, err
	}
	refetchParams, err := readRequiredBoolArgument(arguments, "refetchParams")
	if err != nil {
		return setCallableArgs{}, err
	}
	return setCallableArgs{
		projectConfigID: projectConfigID,
		sectionID:       sectionID,
		callableName:    callableName,
		refetchParams:   refetchParams,
	}, nil
}

func readAutoLayoutTopLevelSectionsArgs(arguments map[string]any) (autoLayoutTopLevelSectionsArgs, error) {
	projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
	if err != nil {
		return autoLayoutTopLevelSectionsArgs{}, err
	}
	margin := 50
	resolvedMargin, err := readOptionalIntArgument(arguments, "margin")
	if err != nil {
		return autoLayoutTopLevelSectionsArgs{}, err
	}
	if resolvedMargin != nil {
		margin = *resolvedMargin
	}
	return autoLayoutTopLevelSectionsArgs{
		projectConfigID: projectConfigID,
		margin:          margin,
	}, nil
}

func readRequiredTopLevelSectionLayoutsArgument(arguments map[string]any, key string) (map[string]projectstate.TopLevelSectionLayout, error) {
	rawLayouts, err := readRequiredObjectArgument(arguments, key)
	if err != nil {
		return nil, err
	}

	layouts := make(map[string]projectstate.TopLevelSectionLayout, len(rawLayouts))
	for rawSectionID, rawLayout := range rawLayouts {
		sectionID := strings.TrimSpace(rawSectionID)
		if sectionID == "" {
			return nil, newToolError("invalid_arguments", "%s contains an empty section id key", key)
		}
		layout, err := readTopLevelSectionLayout(rawLayout, fmt.Sprintf("%s.%s", key, rawSectionID))
		if err != nil {
			return nil, err
		}
		layouts[sectionID] = layout
	}

	return layouts, nil
}

func readTopLevelSectionLayout(rawLayout any, parentKey string) (projectstate.TopLevelSectionLayout, error) {
	layoutObject, ok := rawLayout.(map[string]any)
	if !ok {
		return projectstate.TopLevelSectionLayout{}, newToolError("invalid_arguments", "%s must be an object", parentKey)
	}

	x, err := readRequiredFiniteNumberField(layoutObject, parentKey, "x")
	if err != nil {
		return projectstate.TopLevelSectionLayout{}, err
	}
	y, err := readRequiredFiniteNumberField(layoutObject, parentKey, "y")
	if err != nil {
		return projectstate.TopLevelSectionLayout{}, err
	}
	zIndex, err := readOptionalIntField(layoutObject, parentKey, "zIndex")
	if err != nil {
		return projectstate.TopLevelSectionLayout{}, err
	}
	width, err := readOptionalFiniteNumberField(layoutObject, parentKey, "w")
	if err != nil {
		return projectstate.TopLevelSectionLayout{}, err
	}
	height, err := readOptionalFiniteNumberField(layoutObject, parentKey, "h")
	if err != nil {
		return projectstate.TopLevelSectionLayout{}, err
	}

	layout := projectstate.TopLevelSectionLayout{X: x, Y: y}
	if zIndex != nil {
		layout.ZIndex = *zIndex
	}
	if width != nil {
		layout.W = width
	}
	if height != nil {
		layout.H = height
	}
	return layout, nil
}

func readRequiredSectionSizesArgument(arguments map[string]any, key string) (map[string]projectstate.SectionSize, error) {
	rawSectionSizes, err := readRequiredObjectArgument(arguments, key)
	if err != nil {
		return nil, err
	}

	sectionSizes := make(map[string]projectstate.SectionSize, len(rawSectionSizes))
	for rawSectionID, rawSize := range rawSectionSizes {
		sectionID := strings.TrimSpace(rawSectionID)
		if sectionID == "" {
			return nil, newToolError("invalid_arguments", "%s contains an empty section id key", key)
		}

		sizeObject, ok := rawSize.(map[string]any)
		if !ok {
			return nil, newToolError("invalid_arguments", "%s.%s must be an object", key, rawSectionID)
		}
		width, err := readRequiredSectionSizeValueField(sizeObject, fmt.Sprintf("%s.%s", key, rawSectionID), "width")
		if err != nil {
			return nil, err
		}
		height, err := readRequiredSectionSizeValueField(sizeObject, fmt.Sprintf("%s.%s", key, rawSectionID), "height")
		if err != nil {
			return nil, err
		}
		sectionSizes[sectionID] = projectstate.SectionSize{
			Width:  width,
			Height: height,
		}
	}
	return sectionSizes, nil
}

func readRequiredSectionSizeValueField(
	object map[string]any,
	parentKey string,
	field string,
) (projectstate.SectionSizeValue, error) {
	rawValue, ok := object[field]
	if !ok || rawValue == nil {
		return projectstate.SectionSizeValue{}, newToolError("invalid_arguments", "%s.%s is required", parentKey, field)
	}
	return readSectionSizeValue(rawValue, fmt.Sprintf("%s.%s", parentKey, field))
}

func readSectionSizeValue(rawValue any, fieldKey string) (projectstate.SectionSizeValue, error) {
	switch typed := rawValue.(type) {
	case string:
		return parseSectionSizeValueString(typed, fieldKey)
	case float64:
		return readFixedSectionSizeValue(typed, fieldKey)
	case float32:
		return readFixedSectionSizeValue(float64(typed), fieldKey)
	case int:
		return projectstate.FixedSectionSizeValue(float64(typed)), nil
	case int8:
		return projectstate.FixedSectionSizeValue(float64(typed)), nil
	case int16:
		return projectstate.FixedSectionSizeValue(float64(typed)), nil
	case int32:
		return projectstate.FixedSectionSizeValue(float64(typed)), nil
	case int64:
		return projectstate.FixedSectionSizeValue(float64(typed)), nil
	default:
		return projectstate.SectionSizeValue{}, newToolError("invalid_arguments", "%s must be a number or 'auto'", fieldKey)
	}
}

func parseSectionSizeValueString(rawValue string, fieldKey string) (projectstate.SectionSizeValue, error) {
	trimmed := strings.TrimSpace(rawValue)
	if trimmed == "" {
		return projectstate.SectionSizeValue{}, newToolError("invalid_arguments", "%s must be a number or 'auto'", fieldKey)
	}
	if strings.EqualFold(trimmed, "auto") {
		return projectstate.AutoSectionSizeValue(), nil
	}
	value, err := strconv.ParseFloat(trimmed, 64)
	if err != nil {
		return projectstate.SectionSizeValue{}, newToolError("invalid_arguments", "%s must be a number or 'auto'", fieldKey)
	}
	return readFixedSectionSizeValue(value, fieldKey)
}

func readFixedSectionSizeValue(value float64, fieldKey string) (projectstate.SectionSizeValue, error) {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return projectstate.SectionSizeValue{}, newToolError("invalid_arguments", "%s must be a finite number", fieldKey)
	}
	return projectstate.FixedSectionSizeValue(value), nil
}

func readRequiredFiniteNumberField(object map[string]any, parentKey string, field string) (float64, error) {
	rawValue, ok := object[field]
	if !ok || rawValue == nil {
		return 0, newToolError("invalid_arguments", "%s.%s is required", parentKey, field)
	}

	value, ok := readSupportedNumberValue(rawValue)
	if !ok {
		return 0, newToolError("invalid_arguments", "%s.%s must be a number", parentKey, field)
	}
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, newToolError("invalid_arguments", "%s.%s must be a finite number", parentKey, field)
	}
	return value, nil
}

func readSupportedNumberValue(rawValue any) (float64, bool) {
	switch typed := rawValue.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	}
	switch value := reflect.ValueOf(rawValue); value.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return float64(value.Int()), true
	default:
		return 0, false
	}
}

func readOptionalFiniteNumberField(object map[string]any, parentKey string, field string) (*float64, error) {
	rawValue, ok := object[field]
	if !ok || rawValue == nil {
		return nil, nil
	}

	value, err := readRequiredFiniteNumberField(object, parentKey, field)
	if err != nil {
		return nil, err
	}
	return &value, nil
}

func readOptionalIntArgument(arguments map[string]any, key string) (*int, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}

	var value int
	switch typed := rawValue.(type) {
	case int:
		value = typed
	case int8:
		value = int(typed)
	case int16:
		value = int(typed)
	case int32:
		value = int(typed)
	case int64:
		value = int(typed)
	case float64:
		if math.Trunc(typed) != typed {
			return nil, newToolError("invalid_arguments", "%s must be an integer", key)
		}
		value = int(typed)
	default:
		return nil, newToolError("invalid_arguments", "%s must be an integer", key)
	}
	return &value, nil
}

func readOptionalIntField(object map[string]any, parentKey string, field string) (*int, error) {
	rawValue, ok := object[field]
	if !ok || rawValue == nil {
		return nil, nil
	}

	var value int
	switch typed := rawValue.(type) {
	case int:
		value = typed
	case int8:
		value = int(typed)
	case int16:
		value = int(typed)
	case int32:
		value = int(typed)
	case int64:
		value = int(typed)
	case float64:
		if math.Trunc(typed) != typed {
			return nil, newToolError("invalid_arguments", "%s.%s must be an integer", parentKey, field)
		}
		value = int(typed)
	default:
		return nil, newToolError("invalid_arguments", "%s.%s must be an integer", parentKey, field)
	}
	return &value, nil
}

func readOptionalPositiveIntArgument(arguments map[string]any, key string) (*int, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}

	var value int
	switch typed := rawValue.(type) {
	case int:
		value = typed
	case int8:
		value = int(typed)
	case int16:
		value = int(typed)
	case int32:
		value = int(typed)
	case int64:
		value = int(typed)
	case float64:
		if math.Trunc(typed) != typed {
			return nil, newToolError("invalid_arguments", "%s must be an integer", key)
		}
		value = int(typed)
	default:
		return nil, newToolError("invalid_arguments", "%s must be an integer", key)
	}
	if value < 1 {
		return nil, newToolError("invalid_arguments", "%s must be at least 1", key)
	}
	return &value, nil
}

func readRequiredPositiveIntArgument(arguments map[string]any, key string) (int, error) {
	value, err := readOptionalPositiveIntArgument(arguments, key)
	if err != nil {
		return 0, err
	}
	if value == nil {
		return 0, newToolError("invalid_arguments", "%s is required", key)
	}
	return *value, nil
}

func readRequiredStringArrayArgument(arguments map[string]any, key string) ([]string, error) {
	rawValue, ok := arguments[key]
	if !ok {
		return nil, newToolError("invalid_arguments", "%s is required", key)
	}

	switch typed := rawValue.(type) {
	case []string:
		output := make([]string, len(typed))
		copy(output, typed)
		return output, nil
	case []any:
		output := make([]string, 0, len(typed))
		for _, entry := range typed {
			rawString, ok := entry.(string)
			if !ok {
				return nil, newToolError("invalid_arguments", "%s must be an array of strings", key)
			}
			output = append(output, strings.TrimSpace(rawString))
		}
		return output, nil
	default:
		return nil, newToolError("invalid_arguments", "%s must be an array of strings", key)
	}
}

func readOptionalStringArrayArgument(arguments map[string]any, key string) ([]string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}

	switch typed := rawValue.(type) {
	case []string:
		output := make([]string, len(typed))
		copy(output, typed)
		return output, nil
	case []any:
		output := make([]string, 0, len(typed))
		for _, entry := range typed {
			rawString, ok := entry.(string)
			if !ok {
				return nil, newToolError("invalid_arguments", "%s must be an array of strings", key)
			}
			output = append(output, strings.TrimSpace(rawString))
		}
		return output, nil
	default:
		return nil, newToolError("invalid_arguments", "%s must be an array of strings", key)
	}
}

func readRequiredProjectCodegenTargetsArgument(arguments map[string]any, key string) ([]projectstate.ProjectCodegenTarget, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, newToolError("invalid_arguments", "%s is required", key)
	}

	switch typed := rawValue.(type) {
	case []projectstate.ProjectCodegenTarget:
		output := make([]projectstate.ProjectCodegenTarget, len(typed))
		copy(output, typed)
		return output, nil
	case []any:
		output := make([]projectstate.ProjectCodegenTarget, 0, len(typed))
		for index, entry := range typed {
			target, err := readProjectCodegenTargetValue(entry, key, index)
			if err != nil {
				return nil, err
			}
			output = append(output, target)
		}
		return output, nil
	default:
		return nil, newToolError("invalid_arguments", "%s must be an array of objects", key)
	}
}

func readProjectCodegenTargetValue(rawValue any, key string, index int) (projectstate.ProjectCodegenTarget, error) {
	if target, ok := rawValue.(projectstate.ProjectCodegenTarget); ok {
		return target, nil
	}

	encoded, err := json.Marshal(rawValue)
	if err != nil {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d] must be a valid JSON object", key, index)
	}
	trimmed := bytes.TrimSpace(encoded)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d] must be an object", key, index)
	}

	var object map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &object); err != nil {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d] must be an object", key, index)
	}
	if object == nil {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d] must be an object", key, index)
	}

	languagePayload, ok := object["language"]
	if !ok {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d].language is required", key, index)
	}

	var language string
	if err := json.Unmarshal(languagePayload, &language); err != nil {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d].language must be a string", key, index)
	}
	language = strings.TrimSpace(language)
	if language == "" {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d].language is required", key, index)
	}

	return projectstate.ProjectCodegenTarget{
		Language: language,
		Payload:  append(projectstate.RawJSON(nil), trimmed...),
	}, nil
}

func readOptionalNonNegativeIntArgument(arguments map[string]any, key string) (*int, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}

	var value int
	switch typed := rawValue.(type) {
	case int:
		value = typed
	case int8:
		value = int(typed)
	case int16:
		value = int(typed)
	case int32:
		value = int(typed)
	case int64:
		value = int(typed)
	case float64:
		if math.Trunc(typed) != typed {
			return nil, newToolError("invalid_arguments", "%s must be an integer", key)
		}
		value = int(typed)
	default:
		return nil, newToolError("invalid_arguments", "%s must be an integer", key)
	}
	if value < 0 {
		return nil, newToolError("invalid_arguments", "%s must be at least 0", key)
	}
	return &value, nil
}
