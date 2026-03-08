package appspec

import (
	"fmt"
	"sort"
	"strings"
)

var (
	allowedResponsiveBreakpoints = map[string]struct{}{
		"base": {},
		"sm":   {},
		"md":   {},
		"lg":   {},
		"xl":   {},
		"2xl":  {},
	}
	allowedThemeModes = map[string]struct{}{
		"light": {},
		"dark":  {},
		"auto":  {},
	}
	allowedThemeMotionKeys = map[string]struct{}{
		"durationMs": {},
		"delayMs":    {},
		"staggerMs":  {},
		"easing":     {},
	}
)

type Definition struct {
	AppSpecVersion string
	CatalogID      string
	ActionMap      map[string]any
	DataBindings   map[string]any
	Theme          map[string]any
	Assets         []any
}

func (d Definition) Normalized() Definition {
	normalized := d
	normalized.CatalogID = strings.TrimSpace(normalized.CatalogID)
	if normalized.CatalogID == "" {
		normalized.CatalogID = DefaultCatalogID
	}
	return normalized
}

func ValidatePersistedWrite(appSpec any, definition Definition) error {
	normalizedDefinition := definition.Normalized()
	if err := ValidateTheme(normalizedDefinition.Theme); err != nil {
		return err
	}
	if err := ValidateActionDefinitions(normalizedDefinition.ActionMap); err != nil {
		return err
	}
	return ValidateSpec(appSpec, ValidationOptions{
		CatalogID:         normalizedDefinition.CatalogID,
		ActionDefinitions: normalizedDefinition.ActionMap,
		DataBindings:      normalizedDefinition.DataBindings,
	})
}

func ValidateTheme(theme map[string]any) error {
	if theme == nil {
		return nil
	}

	if mode, ok := theme["mode"]; ok {
		modeString, ok := mode.(string)
		if !ok {
			return fmt.Errorf("theme.mode must be a string")
		}
		if _, ok := allowedThemeModes[modeString]; !ok {
			return fmt.Errorf("theme.mode must be one of: light, dark, auto")
		}
	}

	if className, ok := theme["className"]; ok {
		if _, ok := className.(string); !ok {
			return fmt.Errorf("theme.className must be a string")
		}
	}

	if motion, ok := theme["motion"]; ok {
		motionObject, ok := motion.(map[string]any)
		if !ok {
			return fmt.Errorf("theme.motion must be an object")
		}
		for key, value := range motionObject {
			if _, ok := allowedThemeMotionKeys[key]; !ok {
				continue
			}
			switch key {
			case "easing":
				if _, ok := value.(string); !ok {
					return fmt.Errorf("theme.motion.easing must be a string")
				}
			default:
				if _, ok := asNumber(value); !ok {
					return fmt.Errorf("theme.motion.%s must be a number", key)
				}
			}
		}
	}

	return nil
}

func ValidateActionDefinitions(actionDefinitions map[string]any) error {
	if actionDefinitions == nil {
		return nil
	}

	catalog := DefaultCatalog()
	for name, definition := range actionDefinitions {
		definitionObject, ok := definition.(map[string]any)
		if !ok {
			return fmt.Errorf("App action %q must be an object", name)
		}
		actionType := name
		if rawActionType, ok := definitionObject["type"]; ok {
			actionTypeString, ok := rawActionType.(string)
			if !ok {
				return fmt.Errorf("App action %q type must be a string", name)
			}
			actionType = actionTypeString
		}
		if _, ok := catalog.Actions[actionType]; !ok {
			return fmt.Errorf("App action %q uses unknown type %q", name, actionType)
		}
	}

	return nil
}

type ValidationOptions struct {
	CatalogID         string
	ActionDefinitions map[string]any
	DataBindings      map[string]any
}

func ValidateSpec(appSpec any, options ValidationOptions) error {
	catalog := DefaultCatalog()

	catalogID := strings.TrimSpace(options.CatalogID)
	if catalogID == "" {
		catalogID = DefaultCatalogID
	}
	if catalogID != catalog.ID {
		return fmt.Errorf("Unknown app catalog id: %s", catalogID)
	}

	rootElement, elements, err := resolveAppSpec(appSpec)
	if err != nil {
		return err
	}

	allowedActions := cloneActionSet(catalog.Actions)
	for name := range options.ActionDefinitions {
		allowedActions[name] = struct{}{}
	}
	runActionNames := collectRunActionNames(options.ActionDefinitions)
	usedConfigIDs := map[string]struct{}{}
	unscopedKeys := []string{}
	visited := map[string]struct{}{}

	runActionCount, err := validateElementTree(rootElement, elements, nil, validationState{
		catalog:           catalog,
		allowedActions:    allowedActions,
		actionDefinitions: options.ActionDefinitions,
		dataBindings:      options.DataBindings,
		usedConfigIDs:     usedConfigIDs,
		unscopedKeys:      &unscopedKeys,
		visited:           visited,
	})
	if err != nil {
		return err
	}
	if runActionCount > 1 && len(runActionNames) <= 1 {
		return fmt.Errorf("App spec can only include one run action. Define an additional run action to allow multiple run buttons")
	}
	if len(usedConfigIDs) > 1 && len(unscopedKeys) > 0 {
		sort.Strings(unscopedKeys)
		return fmt.Errorf(
			"App spec uses multiple configs but some elements are not scoped. Wrap them in ConfigScope or set configId explicitly. Missing scope for: %s",
			strings.Join(unscopedKeys, ", "),
		)
	}
	return nil
}

type validationState struct {
	catalog           Catalog
	allowedActions    map[string]struct{}
	actionDefinitions map[string]any
	dataBindings      map[string]any
	usedConfigIDs     map[string]struct{}
	unscopedKeys      *[]string
	visited           map[string]struct{}
}

func validateElementTree(
	element map[string]any,
	elements map[string]map[string]any,
	scopeConfigID *string,
	state validationState,
) (int, error) {
	keyValue, ok := element["key"].(string)
	if !ok {
		return 0, fmt.Errorf("App spec elements require a string key")
	}
	if _, ok := state.visited[keyValue]; ok {
		return 0, nil
	}
	state.visited[keyValue] = struct{}{}

	componentType, ok := element["type"].(string)
	if !ok {
		return 0, fmt.Errorf("App spec element %q missing component type", keyValue)
	}

	componentSchema, ok := state.catalog.Components[componentType]
	if !ok {
		return 0, fmt.Errorf("App spec element %q uses unknown component %q", keyValue, componentType)
	}

	props, err := elementProps(element)
	if err != nil {
		return 0, fmt.Errorf("App spec element %q props must be an object", keyValue)
	}
	binding := resolveBindingRecord(state.dataBindings, getDataPath(props))

	if err := validateChildrenAgainstCatalog(keyValue, componentSchema, element); err != nil {
		return 0, err
	}
	if err := validatePropsAgainstCatalog(keyValue, componentType, componentSchema, props, binding); err != nil {
		return 0, err
	}

	currentScopeConfigID := scopeConfigID
	if componentType == "ConfigScope" {
		configID := getPropString(props, "configId")
		if configID != "" {
			state.usedConfigIDs[configID] = struct{}{}
			currentScopeConfigID = &configID
		}
	}

	runActionCount := 0
	if componentType == "ActionButton" {
		actionName := resolveActionName(props, binding)
		if actionName != "" {
			if _, ok := state.allowedActions[actionName]; !ok {
				return 0, fmt.Errorf("App spec action %q is not registered (element %q)", actionName, keyValue)
			}
			actionType := resolveActionType(actionName, state.actionDefinitions[actionName])
			if actionType == "run" {
				runActionCount++
			}
			applyConfigScopeGuardrail(
				keyValue,
				currentScopeConfigID,
				props,
				binding,
				state.usedConfigIDs,
				state.unscopedKeys,
				actionType,
			)
		}
	}
	if componentType == "ParamInput" || componentType == "TextOutput" || componentType == "ImageOutput" {
		applyConfigScopeGuardrail(
			keyValue,
			currentScopeConfigID,
			props,
			binding,
			state.usedConfigIDs,
			state.unscopedKeys,
			"",
		)
	}

	children, err := elementChildren(element)
	if err != nil {
		return runActionCount, fmt.Errorf("App spec element %q children must be a list", keyValue)
	}
	for _, child := range children {
		switch typed := child.(type) {
		case string:
			childElement, ok := elements[typed]
			if !ok {
				return runActionCount, fmt.Errorf("App spec element %q references missing child %q", keyValue, typed)
			}
			childRunCount, err := validateElementTree(childElement, elements, currentScopeConfigID, state)
			if err != nil {
				return runActionCount, err
			}
			runActionCount += childRunCount
		case map[string]any:
			if !isUIElement(typed) {
				return runActionCount, fmt.Errorf("App spec element %q children must be element keys or objects", keyValue)
			}
			childRunCount, err := validateElementTree(typed, elements, currentScopeConfigID, state)
			if err != nil {
				return runActionCount, err
			}
			runActionCount += childRunCount
		default:
			return runActionCount, fmt.Errorf("App spec element %q children must be element keys or objects", keyValue)
		}
	}

	return runActionCount, nil
}

func validateChildrenAgainstCatalog(elementKey string, componentSchema ComponentSchema, element map[string]any) error {
	if componentSchema.Children {
		return nil
	}
	if _, ok := element["children"]; ok {
		return fmt.Errorf("App spec element %q cannot have children (component %q is childless)", elementKey, componentSchema.Type)
	}
	return nil
}

func validatePropsAgainstCatalog(
	elementKey string,
	componentType string,
	componentSchema ComponentSchema,
	props map[string]any,
	binding map[string]any,
) error {
	for propKey, propValue := range props {
		propSchema, ok := componentSchema.Props[propKey]
		if !ok {
			return fmt.Errorf("App spec element %q has unknown prop %q for component %q", elementKey, propKey, componentType)
		}
		if err := validatePropValue(elementKey, componentType, propKey, propValue, propSchema); err != nil {
			return err
		}
	}

	for propKey, propSchema := range componentSchema.Props {
		if !propSchema.Required {
			continue
		}
		if value, ok := props[propKey]; ok {
			if isMissingRequiredValue(value) {
				return fmt.Errorf("App spec element %q missing required prop %q for component %q", elementKey, propKey, componentType)
			}
			continue
		}
		if binding != nil {
			if value, ok := binding[propKey]; ok {
				if err := validatePropValue(elementKey, componentType, propKey, value, propSchema); err != nil {
					return err
				}
				if isMissingRequiredValue(value) {
					return fmt.Errorf("App spec element %q missing required prop %q for component %q", elementKey, propKey, componentType)
				}
				continue
			}
		}
		return fmt.Errorf("App spec element %q missing required prop %q for component %q", elementKey, propKey, componentType)
	}

	return nil
}

func validatePropValue(
	elementKey string,
	componentType string,
	propKey string,
	value any,
	propSchema PropSchema,
) error {
	if propSchema.Responsive {
		if responsiveValue, ok := value.(map[string]any); ok {
			if len(responsiveValue) == 0 {
				return fmt.Errorf("App spec element %q prop %q must include at least one breakpoint value (component %q)", elementKey, propKey, componentType)
			}
			for breakpointKey, breakpointValue := range responsiveValue {
				if _, ok := allowedResponsiveBreakpoints[breakpointKey]; !ok {
					return fmt.Errorf("App spec element %q prop %q uses unknown breakpoint %q", elementKey, propKey, breakpointKey)
				}
				if err := validateScalarPropValue(elementKey, componentType, propKey, breakpointValue, propSchema); err != nil {
					return err
				}
			}
			return nil
		}
	}

	return validateScalarPropValue(elementKey, componentType, propKey, value, propSchema)
}

func validateScalarPropValue(
	elementKey string,
	componentType string,
	propKey string,
	value any,
	propSchema PropSchema,
) error {
	switch propSchema.Type {
	case PropTypeString:
		if _, ok := value.(string); !ok {
			return fmt.Errorf("App spec element %q prop %q must be a string (component %q)", elementKey, propKey, componentType)
		}
	case PropTypeNumber, PropTypeDimension:
		if propSchema.Type == PropTypeDimension {
			if stringValue, ok := value.(string); ok {
				if strings.TrimSpace(stringValue) == "" {
					return fmt.Errorf("App spec element %q prop %q must be a non-empty string (component %q)", elementKey, propKey, componentType)
				}
				return nil
			}
		}
		numericValue, ok := asNumber(value)
		if !ok {
			return fmt.Errorf("App spec element %q prop %q must be a number (component %q)", elementKey, propKey, componentType)
		}
		if propSchema.Min != nil && numericValue < *propSchema.Min {
			return fmt.Errorf("App spec element %q prop %q must be >= %v (component %q)", elementKey, propKey, *propSchema.Min, componentType)
		}
		if propSchema.Max != nil && numericValue > *propSchema.Max {
			return fmt.Errorf("App spec element %q prop %q must be <= %v (component %q)", elementKey, propKey, *propSchema.Max, componentType)
		}
	case PropTypeBoolean:
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("App spec element %q prop %q must be a boolean (component %q)", elementKey, propKey, componentType)
		}
	}

	if len(propSchema.Enum) > 0 && !enumContains(propSchema.Enum, value) {
		return fmt.Errorf("App spec element %q prop %q must be one of %v (component %q)", elementKey, propKey, propSchema.Enum, componentType)
	}

	return nil
}

func resolveAppSpec(appSpec any) (map[string]any, map[string]map[string]any, error) {
	appSpecObject, ok := appSpec.(map[string]any)
	if !ok {
		return nil, nil, fmt.Errorf("App spec must be an object")
	}

	elements := map[string]map[string]any{}
	if rawElements, ok := appSpecObject["elements"]; ok {
		elementsObject, ok := rawElements.(map[string]any)
		if !ok {
			return nil, nil, fmt.Errorf("App spec elements must be an object")
		}
		for key, value := range elementsObject {
			element, ok := value.(map[string]any)
			if !ok || !isUIElement(element) {
				return nil, nil, fmt.Errorf("Invalid app spec element for key %q: each element must be an object with top-level string fields 'key' and 'type' (example: {\"key\":\"root\",\"type\":\"Stack\",\"props\":{},\"children\":[]})", key)
			}
			elementKey, _ := element["key"].(string)
			if elementKey != key {
				return nil, nil, fmt.Errorf("App spec element map key %q does not match element.key %q", key, elementKey)
			}
			elements[key] = element
		}
	}

	if rootValue, ok := appSpecObject["root"]; ok {
		if rootElement, ok := rootValue.(map[string]any); ok && isUIElement(rootElement) {
			return rootElement, elements, nil
		}
		if rootKey, ok := rootValue.(string); ok {
			rootElement, ok := elements[rootKey]
			if !ok {
				return nil, nil, fmt.Errorf("App spec root %q not found in elements", rootKey)
			}
			return rootElement, elements, nil
		}
	}

	if isUIElement(appSpecObject) {
		return appSpecObject, elements, nil
	}

	return nil, nil, fmt.Errorf("App spec root must be a UI element or element key")
}

func isUIElement(value map[string]any) bool {
	if value == nil {
		return false
	}
	_, keyOK := value["key"].(string)
	_, typeOK := value["type"].(string)
	return keyOK && typeOK
}

func elementProps(element map[string]any) (map[string]any, error) {
	rawProps, ok := element["props"]
	if !ok {
		return map[string]any{}, nil
	}
	if rawProps == nil {
		return map[string]any{}, nil
	}
	props, ok := rawProps.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("props must be an object")
	}
	return props, nil
}

func elementChildren(element map[string]any) ([]any, error) {
	rawChildren, ok := element["children"]
	if !ok || rawChildren == nil {
		return nil, nil
	}
	children, ok := rawChildren.([]any)
	if !ok {
		return nil, fmt.Errorf("children must be a list")
	}
	return children, nil
}

func collectRunActionNames(actionDefinitions map[string]any) map[string]struct{} {
	runNames := map[string]struct{}{
		"run": {},
	}
	for name, definition := range actionDefinitions {
		if resolveActionType(name, definition) == "run" {
			runNames[name] = struct{}{}
		}
	}
	return runNames
}

func resolveActionType(actionName string, definition any) string {
	definitionObject, ok := definition.(map[string]any)
	if !ok {
		return actionName
	}
	if actionType, ok := definitionObject["type"].(string); ok {
		return actionType
	}
	return actionName
}

func resolveActionName(props map[string]any, binding map[string]any) string {
	if actionName := getPropString(props, "action"); actionName != "" {
		return actionName
	}
	return resolveBindingString(binding, "action")
}

func applyConfigScopeGuardrail(
	elementKey string,
	scopeConfigID *string,
	props map[string]any,
	binding map[string]any,
	usedConfigIDs map[string]struct{},
	unscopedKeys *[]string,
	actionType string,
) {
	explicitConfigID := getPropString(props, "configId")
	if explicitConfigID == "" {
		explicitConfigID = resolveBindingString(binding, "configId")
	}
	effectiveConfigID := explicitConfigID
	if effectiveConfigID == "" && scopeConfigID != nil {
		effectiveConfigID = *scopeConfigID
	}

	if effectiveConfigID != "" {
		usedConfigIDs[effectiveConfigID] = struct{}{}
		return
	}
	if actionType != "" && actionType != "run" && actionType != "downloadArtifact" {
		return
	}
	*unscopedKeys = append(*unscopedKeys, elementKey)
}

func getDataPath(props map[string]any) string {
	dataPath, _ := props["dataPath"].(string)
	return dataPath
}

func resolveBindingRecord(dataBindings map[string]any, dataPath string) map[string]any {
	if len(dataBindings) == 0 || dataPath == "" {
		return nil
	}
	var resolved any
	if strings.HasPrefix(dataPath, "/") {
		resolved = resolvePointer(dataBindings, dataPath)
	} else {
		resolved = dataBindings[dataPath]
	}
	binding, _ := resolved.(map[string]any)
	return binding
}

func resolvePointer(value any, pointer string) any {
	if pointer == "" {
		return value
	}
	if !strings.HasPrefix(pointer, "/") {
		return nil
	}
	current := value
	segments := strings.Split(pointer, "/")[1:]
	for _, segment := range segments {
		decoded := decodePointerSegment(segment)
		switch typed := current.(type) {
		case []any:
			index, ok := parseIndex(decoded, len(typed))
			if !ok {
				return nil
			}
			current = typed[index]
		case map[string]any:
			next, ok := typed[decoded]
			if !ok {
				return nil
			}
			current = next
		default:
			return nil
		}
	}
	return current
}

func decodePointerSegment(segment string) string {
	return strings.ReplaceAll(strings.ReplaceAll(segment, "~1", "/"), "~0", "~")
}

func parseIndex(raw string, max int) (int, bool) {
	if raw == "" {
		return 0, false
	}
	value := 0
	for _, r := range raw {
		if r < '0' || r > '9' {
			return 0, false
		}
		value = (value * 10) + int(r-'0')
	}
	if value < 0 || value >= max {
		return 0, false
	}
	return value, true
}

func resolveBindingString(binding map[string]any, key string) string {
	if binding == nil {
		return ""
	}
	value, _ := binding[key].(string)
	return value
}

func getPropString(props map[string]any, key string) string {
	value, _ := props[key].(string)
	return value
}

func isMissingRequiredValue(value any) bool {
	switch typed := value.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(typed) == ""
	case map[string]any:
		if len(typed) == 0 {
			return true
		}
		for _, nested := range typed {
			if !isMissingRequiredValue(nested) {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func enumContains(values []any, candidate any) bool {
	candidateNumber, candidateIsNumber := asNumber(candidate)
	for _, value := range values {
		if candidateIsNumber {
			if expectedNumber, ok := asNumber(value); ok && expectedNumber == candidateNumber {
				return true
			}
		}
		if value == candidate {
			return true
		}
	}
	return false
}

func asNumber(value any) (float64, bool) {
	switch typed := value.(type) {
	case int:
		return float64(typed), true
	case int8:
		return float64(typed), true
	case int16:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case uint:
		return float64(typed), true
	case uint8:
		return float64(typed), true
	case uint16:
		return float64(typed), true
	case uint32:
		return float64(typed), true
	case uint64:
		return float64(typed), true
	case float32:
		return float64(typed), true
	case float64:
		return typed, true
	default:
		return 0, false
	}
}

func cloneActionSet(values map[string]struct{}) map[string]struct{} {
	cloned := make(map[string]struct{}, len(values))
	for key := range values {
		cloned[key] = struct{}{}
	}
	return cloned
}
