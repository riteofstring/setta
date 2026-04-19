package appspec

import (
	"fmt"
	"reflect"
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

	for _, validate := range []func(map[string]any) error{
		validateThemeMode,
		validateThemeClassName,
		validateThemeMotion,
	} {
		if err := validate(theme); err != nil {
			return err
		}
	}

	return nil
}

func validateThemeMode(theme map[string]any) error {
	mode, ok := theme["mode"]
	if !ok {
		return nil
	}
	modeString, ok := mode.(string)
	if !ok {
		return fmt.Errorf("theme.mode must be a string")
	}
	if _, ok := allowedThemeModes[modeString]; ok {
		return nil
	}
	return fmt.Errorf("theme.mode must be one of: light, dark, auto")
}

func validateThemeClassName(theme map[string]any) error {
	className, ok := theme["className"]
	if !ok {
		return nil
	}
	if _, ok := className.(string); ok {
		return nil
	}
	return fmt.Errorf("theme.className must be a string")
}

func validateThemeMotion(theme map[string]any) error {
	motion, ok := theme["motion"]
	if !ok {
		return nil
	}
	motionObject, ok := motion.(map[string]any)
	if !ok {
		return fmt.Errorf("theme.motion must be an object")
	}
	for key, value := range motionObject {
		if err := validateThemeMotionEntry(key, value); err != nil {
			return err
		}
	}
	return nil
}

func validateThemeMotionEntry(key string, value any) error {
	if _, ok := allowedThemeMotionKeys[key]; !ok {
		return nil
	}
	if key == "easing" {
		if _, ok := value.(string); ok {
			return nil
		}
		return fmt.Errorf("theme.motion.easing must be a string")
	}
	if _, ok := asNumber(value); ok {
		return nil
	}
	return fmt.Errorf("theme.motion.%s must be a number", key)
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
		return fmt.Errorf("unknown catalog id: %s", catalogID)
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

type validatedElementContext struct {
	key           string
	componentType string
	props         map[string]any
	binding       map[string]any
}

func validateElementTree(
	element map[string]any,
	elements map[string]map[string]any,
	scopeConfigID *string,
	state validationState,
) (int, error) {
	context, alreadyVisited, err := validateElementContext(element, state)
	if err != nil || alreadyVisited {
		return 0, err
	}

	currentScopeConfigID := applyConfigScopeToElement(scopeConfigID, context, state.usedConfigIDs)
	runActionCount, err := validateElementUsage(context, currentScopeConfigID, state)
	if err != nil {
		return 0, err
	}

	childRunCount, err := validateElementChildren(context.key, element, elements, currentScopeConfigID, state)
	if err != nil {
		return runActionCount, err
	}

	return runActionCount + childRunCount, nil
}

func validateElementContext(
	element map[string]any,
	state validationState,
) (validatedElementContext, bool, error) {
	keyValue, ok := element["key"].(string)
	if !ok {
		return validatedElementContext{}, false, fmt.Errorf("App spec elements require a string key")
	}
	if _, ok := state.visited[keyValue]; ok {
		return validatedElementContext{}, true, nil
	}
	state.visited[keyValue] = struct{}{}

	componentType, ok := element["type"].(string)
	if !ok {
		return validatedElementContext{}, false, fmt.Errorf("App spec element %q missing component type", keyValue)
	}

	componentSchema, ok := state.catalog.Components[componentType]
	if !ok {
		return validatedElementContext{}, false, fmt.Errorf("App spec element %q uses unknown component %q", keyValue, componentType)
	}

	props, err := elementProps(element)
	if err != nil {
		return validatedElementContext{}, false, fmt.Errorf("App spec element %q props must be an object", keyValue)
	}
	binding := resolveBindingRecord(state.dataBindings, getDataPath(props))

	if err := validateChildrenAgainstCatalog(keyValue, componentSchema, element); err != nil {
		return validatedElementContext{}, false, err
	}
	if err := validatePropsAgainstCatalog(keyValue, componentType, componentSchema, props, binding); err != nil {
		return validatedElementContext{}, false, err
	}

	return validatedElementContext{
		key:           keyValue,
		componentType: componentType,
		props:         props,
		binding:       binding,
	}, false, nil
}

func applyConfigScopeToElement(
	scopeConfigID *string,
	context validatedElementContext,
	usedConfigIDs map[string]struct{},
) *string {
	if context.componentType != "ConfigScope" {
		return scopeConfigID
	}

	configID := getPropString(context.props, "configId")
	if configID == "" {
		return scopeConfigID
	}

	usedConfigIDs[configID] = struct{}{}
	return &configID
}

func validateElementUsage(
	context validatedElementContext,
	scopeConfigID *string,
	state validationState,
) (int, error) {
	if context.componentType == "ActionButton" {
		return validateActionButtonUsage(context, scopeConfigID, state)
	}
	if requiresConfigScopeGuardrail(context.componentType) {
		applyConfigScopeGuardrail(
			context.key,
			scopeConfigID,
			context.props,
			context.binding,
			state.usedConfigIDs,
			state.unscopedKeys,
			"",
		)
	}

	return 0, nil
}

func validateActionButtonUsage(
	context validatedElementContext,
	scopeConfigID *string,
	state validationState,
) (int, error) {
	actionName := resolveActionName(context.props, context.binding)
	if actionName == "" {
		return 0, nil
	}
	if _, ok := state.allowedActions[actionName]; !ok {
		return 0, fmt.Errorf("App spec action %q is not registered (element %q)", actionName, context.key)
	}

	actionType := resolveActionType(actionName, state.actionDefinitions[actionName])
	applyConfigScopeGuardrail(
		context.key,
		scopeConfigID,
		context.props,
		context.binding,
		state.usedConfigIDs,
		state.unscopedKeys,
		actionType,
	)
	if actionType == "run" {
		return 1, nil
	}

	return 0, nil
}

func requiresConfigScopeGuardrail(componentType string) bool {
	switch componentType {
	case "ParamInput", "TextOutput", "ImageOutput":
		return true
	default:
		return false
	}
}

func validateElementChildren(
	elementKey string,
	element map[string]any,
	elements map[string]map[string]any,
	scopeConfigID *string,
	state validationState,
) (int, error) {
	children, err := elementChildren(element)
	if err != nil {
		return 0, fmt.Errorf("App spec element %q children must be a list", elementKey)
	}

	runActionCount := 0
	for _, child := range children {
		childElement, err := resolveChildElement(elementKey, child, elements)
		if err != nil {
			return runActionCount, err
		}
		childRunCount, err := validateElementTree(childElement, elements, scopeConfigID, state)
		if err != nil {
			return runActionCount, err
		}
		runActionCount += childRunCount
	}

	return runActionCount, nil
}

func resolveChildElement(
	elementKey string,
	child any,
	elements map[string]map[string]any,
) (map[string]any, error) {
	switch typed := child.(type) {
	case string:
		childElement, ok := elements[typed]
		if !ok {
			return nil, fmt.Errorf("App spec element %q references missing child %q", elementKey, typed)
		}
		return childElement, nil
	case map[string]any:
		if isUIElement(typed) {
			return typed, nil
		}
	}

	return nil, fmt.Errorf("App spec element %q children must be element keys or objects", elementKey)
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
	if err := validateProvidedPropsAgainstCatalog(elementKey, componentType, componentSchema, props); err != nil {
		return err
	}
	return validateRequiredPropsAgainstCatalog(elementKey, componentType, componentSchema, props, binding)
}

func validateProvidedPropsAgainstCatalog(
	elementKey string,
	componentType string,
	componentSchema ComponentSchema,
	props map[string]any,
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
	return nil
}

func validateRequiredPropsAgainstCatalog(
	elementKey string,
	componentType string,
	componentSchema ComponentSchema,
	props map[string]any,
	binding map[string]any,
) error {
	for _, propKey := range orderedComponentPropKeys(componentSchema) {
		propSchema := componentSchema.Props[propKey]
		if !propSchema.Required {
			continue
		}
		if err := validateRequiredPropAgainstCatalog(
			elementKey,
			componentType,
			propKey,
			propSchema,
			props,
			binding,
		); err != nil {
			return err
		}
	}
	return nil
}

type requiredCatalogPropValue struct {
	value       any
	present     bool
	fromBinding bool
}

func resolveRequiredCatalogPropValue(
	props map[string]any,
	binding map[string]any,
	propKey string,
) requiredCatalogPropValue {
	if value, ok := props[propKey]; ok {
		return requiredCatalogPropValue{value: value, present: true}
	}
	if value, ok := binding[propKey]; ok {
		return requiredCatalogPropValue{value: value, present: true, fromBinding: true}
	}
	return requiredCatalogPropValue{}
}

func validateRequiredPropAgainstCatalog(
	elementKey string,
	componentType string,
	propKey string,
	propSchema PropSchema,
	props map[string]any,
	binding map[string]any,
) error {
	valueState := resolveRequiredCatalogPropValue(props, binding, propKey)
	if !valueState.present {
		return missingRequiredPropError(elementKey, componentType, propKey)
	}
	if valueState.fromBinding {
		if err := validatePropValue(elementKey, componentType, propKey, valueState.value, propSchema); err != nil {
			return err
		}
	}
	if isMissingRequiredValue(valueState.value) {
		return missingRequiredPropError(elementKey, componentType, propKey)
	}
	return nil
}

func missingRequiredPropError(elementKey string, componentType string, propKey string) error {
	return fmt.Errorf("App spec element %q missing required prop %q for component %q", elementKey, propKey, componentType)
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
	if err := validateScalarPropType(elementKey, componentType, propKey, value, propSchema); err != nil {
		return err
	}
	if len(propSchema.Enum) > 0 && !enumContains(propSchema.Enum, value) {
		return fmt.Errorf("App spec element %q prop %q must be one of %v (component %q)", elementKey, propKey, propSchema.Enum, componentType)
	}

	return nil
}

func validateScalarPropType(
	elementKey string,
	componentType string,
	propKey string,
	value any,
	propSchema PropSchema,
) error {
	switch propSchema.Type {
	case PropTypeString:
		return requireStringPropValue(elementKey, componentType, propKey, value)
	case PropTypeNumber:
		return validateNumericPropValue(elementKey, componentType, propKey, value, propSchema)
	case PropTypeDimension:
		return validateDimensionPropValue(elementKey, componentType, propKey, value, propSchema)
	case PropTypeBoolean:
		return requireBooleanPropValue(elementKey, componentType, propKey, value)
	default:
		return nil
	}
}

func requireStringPropValue(elementKey string, componentType string, propKey string, value any) error {
	if _, ok := value.(string); ok {
		return nil
	}
	return fmt.Errorf("App spec element %q prop %q must be a string (component %q)", elementKey, propKey, componentType)
}

func requireBooleanPropValue(elementKey string, componentType string, propKey string, value any) error {
	if _, ok := value.(bool); ok {
		return nil
	}
	return fmt.Errorf("App spec element %q prop %q must be a boolean (component %q)", elementKey, propKey, componentType)
}

func validateDimensionPropValue(
	elementKey string,
	componentType string,
	propKey string,
	value any,
	propSchema PropSchema,
) error {
	if stringValue, ok := value.(string); ok {
		if strings.TrimSpace(stringValue) == "" {
			return fmt.Errorf("App spec element %q prop %q must be a non-empty string (component %q)", elementKey, propKey, componentType)
		}
		return nil
	}
	return validateNumericPropValue(elementKey, componentType, propKey, value, propSchema)
}

func validateNumericPropValue(
	elementKey string,
	componentType string,
	propKey string,
	value any,
	propSchema PropSchema,
) error {
	numericValue, ok := asNumber(value)
	if !ok {
		return fmt.Errorf("App spec element %q prop %q must be a number (component %q)", elementKey, propKey, componentType)
	}
	return validateNumericPropBounds(elementKey, componentType, propKey, numericValue, propSchema)
}

func validateNumericPropBounds(
	elementKey string,
	componentType string,
	propKey string,
	numericValue float64,
	propSchema PropSchema,
) error {
	if propSchema.Min != nil && numericValue < *propSchema.Min {
		return fmt.Errorf("App spec element %q prop %q must be >= %v (component %q)", elementKey, propKey, *propSchema.Min, componentType)
	}
	if propSchema.Max != nil && numericValue > *propSchema.Max {
		return fmt.Errorf("App spec element %q prop %q must be <= %v (component %q)", elementKey, propKey, *propSchema.Max, componentType)
	}
	return nil
}

func resolveAppSpec(appSpec any) (map[string]any, map[string]map[string]any, error) {
	appSpecObject, ok := appSpec.(map[string]any)
	if !ok {
		return nil, nil, fmt.Errorf("App spec must be an object")
	}

	elements, err := resolveAppSpecElements(appSpecObject)
	if err != nil {
		return nil, nil, err
	}
	rootElement, err := resolveAppSpecRoot(appSpecObject, elements)
	if err != nil {
		return nil, nil, err
	}
	return rootElement, elements, nil
}

func resolveAppSpecElements(appSpecObject map[string]any) (map[string]map[string]any, error) {
	elements := map[string]map[string]any{}
	rawElements, ok := appSpecObject["elements"]
	if !ok {
		return elements, nil
	}
	elementsObject, ok := rawElements.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("App spec elements must be an object")
	}
	for key, value := range elementsObject {
		element, err := resolveNamedAppSpecElement(key, value)
		if err != nil {
			return nil, err
		}
		elements[key] = element
	}
	return elements, nil
}

func resolveNamedAppSpecElement(key string, value any) (map[string]any, error) {
	element, ok := value.(map[string]any)
	if !ok || !isUIElement(element) {
		return nil, fmt.Errorf("Invalid app spec element for key %q: each element must be an object with top-level string fields 'key' and 'type' (example: {\"key\":\"root\",\"type\":\"Stack\",\"props\":{},\"children\":[]})", key)
	}
	elementKey, _ := element["key"].(string)
	if elementKey != key {
		return nil, fmt.Errorf("App spec element map key %q does not match element.key %q", key, elementKey)
	}
	return element, nil
}

func resolveAppSpecRoot(
	appSpecObject map[string]any,
	elements map[string]map[string]any,
) (map[string]any, error) {
	if rootValue, ok := appSpecObject["root"]; ok {
		if rootElement, ok := rootValue.(map[string]any); ok && isUIElement(rootElement) {
			return rootElement, nil
		}
		if rootKey, ok := rootValue.(string); ok {
			rootElement, ok := elements[rootKey]
			if !ok {
				return nil, fmt.Errorf("App spec root %q not found in elements", rootKey)
			}
			return rootElement, nil
		}
	}
	if isUIElement(appSpecObject) {
		return appSpecObject, nil
	}
	return nil, fmt.Errorf("App spec root must be a UI element or element key")
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
	if value == nil {
		return 0, false
	}
	typedValue := reflect.ValueOf(value)
	switch typedValue.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return float64(typedValue.Int()), true
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return float64(typedValue.Uint()), true
	case reflect.Float32, reflect.Float64:
		return typedValue.Convert(reflect.TypeOf(float64(0))).Float(), true
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
