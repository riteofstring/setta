package appspec

import (
	"regexp"
	"sort"
	"strings"
)

var externalHrefRE = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9+.-]*:`)

var (
	themeAllowedKeys = map[string]struct{}{
		"mode":       {},
		"className":  {},
		"colors":     {},
		"fonts":      {},
		"typography": {},
		"spacing":    {},
		"vars":       {},
		"motion":     {},
		"shadows":    {},
		"components": {},
	}
	themeColorKeys = map[string]struct{}{
		"background":       {},
		"surface":          {},
		"surfaceAlt":       {},
		"headerBackground": {},
		"headerText":       {},
		"text":             {},
		"muted":            {},
		"border":           {},
		"cardBackground":   {},
		"cardBorder":       {},
		"accent":           {},
		"accentHover":      {},
		"accentText":       {},
	}
	themeFontKeys = map[string]struct{}{
		"body":    {},
		"heading": {},
		"mono":    {},
	}
	themeTypographyKeys = map[string]struct{}{
		"bodySize":          {},
		"bodyLineHeight":    {},
		"headingSizes":      {},
		"headingLineHeight": {},
		"scale":             {},
	}
	themeHeadingSizeKeys = map[string]struct{}{
		"h1": {},
		"h2": {},
		"h3": {},
		"h4": {},
	}
	themeTextScaleKeys = map[string]struct{}{
		"xs":   {},
		"sm":   {},
		"base": {},
		"lg":   {},
		"xl":   {},
		"2xl":  {},
		"3xl":  {},
		"4xl":  {},
	}
	themeSpacingKeys = map[string]struct{}{
		"pagePaddingX": {},
		"pagePaddingY": {},
		"contentWidth": {},
		"cardPadding":  {},
		"cardRadius":   {},
		"stackGap":     {},
	}
	themeMotionKeys = map[string]struct{}{
		"durationMs": {},
		"delayMs":    {},
		"staggerMs":  {},
		"easing":     {},
	}
	themeShadowKeys = map[string]struct{}{
		"sm": {},
		"md": {},
		"lg": {},
	}
	themeComponentKeys = map[string]struct{}{
		"button":   {},
		"input":    {},
		"dropdown": {},
		"card":     {},
		"page":     {},
	}
	themeButtonTokenKeys = map[string]struct{}{
		"bg":           {},
		"bgHover":      {},
		"text":         {},
		"ring":         {},
		"disabledBg":   {},
		"disabledText": {},
	}
	themeInputTokenKeys = map[string]struct{}{
		"bg":          {},
		"bgHover":     {},
		"border":      {},
		"text":        {},
		"placeholder": {},
		"focusBorder": {},
		"ring":        {},
	}
	themeDropdownTokenKeys = map[string]struct{}{
		"bg":     {},
		"border": {},
		"text":   {},
		"muted":  {},
		"shadow": {},
	}
	themeCardTokenKeys = map[string]struct{}{
		"shadow": {},
	}
	themePageTokenKeys = map[string]struct{}{
		"bgImage": {},
	}
)

type AppValidationIssue struct {
	Message     string `json:"message"`
	ElementKey  string `json:"elementKey,omitempty"`
	ElementType string `json:"elementType,omitempty"`
}

type AppCapabilities struct {
	CatalogID          string          `json:"catalogId"`
	CatalogVersion     string          `json:"catalogVersion"`
	AppSpecVersion     string          `json:"appSpecVersion"`
	ThemeSchemaVersion string          `json:"themeSchemaVersion"`
	Features           map[string]bool `json:"features"`
}

func BuildCapabilities(definition Definition) AppCapabilities {
	normalized := definition.Normalized()
	catalogVersion := ""
	if normalized.CatalogID == DefaultCatalogID {
		catalogVersion = DefaultCatalogVersion
	}
	return AppCapabilities{
		CatalogID:          normalized.CatalogID,
		CatalogVersion:     catalogVersion,
		AppSpecVersion:     strings.TrimSpace(definition.AppSpecVersion),
		ThemeSchemaVersion: "v1",
		Features: map[string]bool{
			"themeVars":               true,
			"assets":                  true,
			"dimensionStrings":        true,
			"dataBindingsJsonPointer": true,
			"responsive":              true,
			"motion":                  true,
			"typography":              true,
			"typographyScale":         true,
			"shadows":                 true,
			"componentTokens":         true,
			"customComponents":        false,
		},
	}
}

func ValidateDefinitionPayload(appSpec any, definition Definition) ([]AppValidationIssue, []AppValidationIssue) {
	normalized := definition.Normalized()

	errors := CollectActionDefinitionIssues(normalized.ActionMap)
	errors = append(errors, CollectSpecValidationIssues(appSpec, ValidationOptions{
		CatalogID:         normalized.CatalogID,
		ActionDefinitions: normalized.ActionMap,
		DataBindings:      normalized.DataBindings,
	})...)

	themeErrors, themeWarnings := CollectThemeValidationIssues(normalized.Theme)
	errors = append(errors, themeErrors...)

	warnings := append([]AppValidationIssue(nil), themeWarnings...)
	warnings = append(warnings, collectAssetWarnings(normalized.Assets)...)
	warnings = append(warnings, collectActionWarnings(appSpec, normalized)...)

	return errors, warnings
}

func CollectActionDefinitionIssues(actionDefinitions map[string]any) []AppValidationIssue {
	if actionDefinitions == nil {
		return nil
	}

	catalog := DefaultCatalog()
	issues := make([]AppValidationIssue, 0)
	for name, definition := range actionDefinitions {
		definitionObject, ok := definition.(map[string]any)
		if !ok {
			issues = append(issues, AppValidationIssue{
				Message: "App action " + quote(name) + " must be an object.",
			})
			continue
		}

		actionType := name
		if rawActionType, ok := definitionObject["type"]; ok {
			actionTypeString, ok := rawActionType.(string)
			if !ok {
				issues = append(issues, AppValidationIssue{
					Message: "App action " + quote(name) + " type must be a string.",
				})
				continue
			}
			actionType = actionTypeString
		}
		if _, ok := catalog.Actions[actionType]; !ok {
			issues = append(issues, AppValidationIssue{
				Message: "App action " + quote(name) + " uses unknown type " + quote(actionType) + ".",
			})
		}
	}
	return issues
}

func CollectSpecValidationIssues(appSpec any, options ValidationOptions) []AppValidationIssue {
	catalog := DefaultCatalog()
	catalogID := strings.TrimSpace(options.CatalogID)
	if catalogID == "" {
		catalogID = DefaultCatalogID
	}
	if catalogID != catalog.ID {
		return []AppValidationIssue{{
			Message: "Unknown app catalog id: " + catalogID,
		}}
	}

	rootElement, elements, err := resolveAppSpec(appSpec)
	if err != nil {
		return []AppValidationIssue{{Message: err.Error()}}
	}

	allowedActions := cloneActionSet(catalog.Actions)
	for name := range options.ActionDefinitions {
		allowedActions[name] = struct{}{}
	}

	issues := make([]AppValidationIssue, 0)
	runActionNames := collectRunActionNames(options.ActionDefinitions)
	runActionCount := 0
	usedConfigIDs := map[string]struct{}{}
	unscopedKeys := make([]string, 0)
	visited := map[string]struct{}{}
	stack := []validationStackEntry{{element: rootElement}}

	for len(stack) > 0 {
		current := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		keyValue, ok := current.element["key"].(string)
		if !ok {
			issues = append(issues, AppValidationIssue{Message: "App spec elements require a string key."})
			continue
		}
		if _, ok := visited[keyValue]; ok {
			continue
		}
		visited[keyValue] = struct{}{}

		componentType, ok := current.element["type"].(string)
		if !ok {
			issues = append(issues, collectValidationIssue(
				"App spec element "+quote(keyValue)+" missing component type.",
				keyValue,
				"",
			))
			collectPushChildren(keyValue, current.element, elements, current.scopeConfigID, "", &issues, &stack)
			continue
		}

		componentSchema, ok := catalog.Components[componentType]
		if !ok {
			issues = append(issues, collectValidationIssue(
				"App spec element "+quote(keyValue)+" uses unknown component "+quote(componentType)+".",
				keyValue,
				componentType,
			))
			collectPushChildren(keyValue, current.element, elements, current.scopeConfigID, componentType, &issues, &stack)
			continue
		}

		props := collectElementProps(keyValue, current.element, componentType, &issues)
		binding := resolveBindingRecord(options.DataBindings, getDataPath(props))

		collectValidateChildrenAgainstCatalog(keyValue, componentType, componentSchema, current.element, &issues)
		collectValidatePropsAgainstCatalog(keyValue, componentType, componentSchema, props, binding, &issues)

		scopeConfigID := current.scopeConfigID
		if componentType == "ConfigScope" {
			configID := getPropString(props, "configId")
			if configID != "" {
				usedConfigIDs[configID] = struct{}{}
				configIDCopy := configID
				scopeConfigID = &configIDCopy
			} else {
				scopeConfigID = nil
			}
		}

		if componentType == "ActionButton" {
			actionName := resolveActionName(props, binding)
			actionType := ""
			if actionName != "" {
				if _, ok := allowedActions[actionName]; !ok {
					issues = append(issues, collectValidationIssue(
						"App spec action "+quote(actionName)+" is not registered (element "+quote(keyValue)+").",
						keyValue,
						componentType,
					))
				} else {
					actionType = resolveActionType(actionName, options.ActionDefinitions[actionName])
					if actionType == "run" {
						runActionCount++
					}
				}
				collectApplyConfigScopeGuardrail(keyValue, scopeConfigID, props, binding, usedConfigIDs, &unscopedKeys, actionType)
			}
		}

		if componentType == "ParamInput" || componentType == "TextOutput" || componentType == "ImageOutput" {
			collectApplyConfigScopeGuardrail(keyValue, scopeConfigID, props, binding, usedConfigIDs, &unscopedKeys, "")
		}

		collectPushChildren(keyValue, current.element, elements, scopeConfigID, componentType, &issues, &stack)
	}

	if runActionCount > 1 && len(runActionNames) <= 1 {
		issues = append(issues, AppValidationIssue{
			Message: "App spec can only include one run action. Define an additional run action to allow multiple run buttons.",
		})
	}
	if len(usedConfigIDs) > 1 && len(unscopedKeys) > 0 {
		sort.Strings(unscopedKeys)
		issues = append(issues, AppValidationIssue{
			Message: "App spec uses multiple configs but some elements are not scoped. Wrap them in ConfigScope or set configId explicitly. Missing scope for: " + strings.Join(unscopedKeys, ", ") + ".",
		})
	}

	return issues
}

func CollectThemeValidationIssues(theme map[string]any) ([]AppValidationIssue, []AppValidationIssue) {
	if theme == nil {
		return nil, nil
	}

	errors := make([]AppValidationIssue, 0)
	warnings := make([]AppValidationIssue, 0)

	unknownKeys := unknownMapKeys(theme, themeAllowedKeys)
	if len(unknownKeys) > 0 {
		preview, suffix := previewSorted(unknownKeys, 6)
		warnings = append(warnings, AppValidationIssue{
			Message: "theme contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	if mode, ok := theme["mode"]; ok {
		modeString, ok := mode.(string)
		if !ok {
			errors = append(errors, AppValidationIssue{Message: "theme.mode must be a string."})
		} else if _, ok := allowedThemeModes[modeString]; !ok {
			errors = append(errors, AppValidationIssue{Message: "theme.mode must be one of: light, dark, auto."})
		}
	}

	if className, ok := theme["className"]; ok {
		if _, ok := className.(string); !ok {
			errors = append(errors, AppValidationIssue{Message: "theme.className must be a string."})
		}
	}

	errors = append(errors, collectThemeColorIssues(theme["colors"], &warnings)...)
	errors = append(errors, collectThemeFontIssues(theme["fonts"], &warnings)...)
	errors = append(errors, collectThemeTypographyIssues(theme["typography"], &warnings)...)
	errors = append(errors, collectThemeSpacingIssues(theme["spacing"], &warnings)...)
	errors = append(errors, collectThemeVarIssues(theme["vars"], &warnings)...)
	errors = append(errors, collectThemeMotionIssues(theme["motion"], &warnings)...)
	errors = append(errors, collectThemeShadowIssues(theme["shadows"], &warnings)...)
	errors = append(errors, collectThemeComponentIssues(theme["components"], &warnings)...)

	return errors, warnings
}

type validationStackEntry struct {
	element       map[string]any
	scopeConfigID *string
}

func collectValidationIssue(message string, elementKey string, elementType string) AppValidationIssue {
	issue := AppValidationIssue{Message: message}
	if strings.TrimSpace(elementKey) != "" {
		issue.ElementKey = elementKey
	}
	if strings.TrimSpace(elementType) != "" {
		issue.ElementType = elementType
	}
	return issue
}

func collectElementProps(elementKey string, element map[string]any, elementType string, issues *[]AppValidationIssue) map[string]any {
	rawProps, ok := element["props"]
	if !ok || rawProps == nil {
		return map[string]any{}
	}
	props, ok := rawProps.(map[string]any)
	if !ok {
		*issues = append(*issues, collectValidationIssue(
			"App spec element "+quote(elementKey)+" props must be an object.",
			elementKey,
			elementType,
		))
		return map[string]any{}
	}
	return props
}

func collectValidateChildrenAgainstCatalog(
	elementKey string,
	componentType string,
	componentSchema ComponentSchema,
	element map[string]any,
	issues *[]AppValidationIssue,
) {
	if componentSchema.Children {
		return
	}
	if _, ok := element["children"]; !ok {
		return
	}
	*issues = append(*issues, collectValidationIssue(
		"App spec element "+quote(elementKey)+" cannot have children (component "+quote(componentType)+" is childless).",
		elementKey,
		componentType,
	))
}

func collectValidatePropsAgainstCatalog(
	elementKey string,
	componentType string,
	componentSchema ComponentSchema,
	props map[string]any,
	binding map[string]any,
	issues *[]AppValidationIssue,
) {
	for propKey, propValue := range props {
		propSchema, ok := componentSchema.Props[propKey]
		if !ok {
			*issues = append(*issues, collectValidationIssue(
				"App spec element "+quote(elementKey)+" has unknown prop "+quote(propKey)+" for component "+quote(componentType)+".",
				elementKey,
				componentType,
			))
			continue
		}
		if err := validatePropValue(elementKey, componentType, propKey, propValue, propSchema); err != nil {
			*issues = append(*issues, collectValidationIssue(err.Error(), elementKey, componentType))
		}
	}

	for propKey, propSchema := range componentSchema.Props {
		if !propSchema.Required {
			continue
		}
		if value, ok := props[propKey]; ok {
			if isMissingRequiredValue(value) {
				*issues = append(*issues, collectValidationIssue(
					"App spec element "+quote(elementKey)+" missing required prop "+quote(propKey)+" for component "+quote(componentType)+".",
					elementKey,
					componentType,
				))
			}
			continue
		}
		if binding != nil {
			if value, ok := binding[propKey]; ok {
				if err := validatePropValue(elementKey, componentType, propKey, value, propSchema); err != nil {
					*issues = append(*issues, collectValidationIssue(err.Error(), elementKey, componentType))
				}
				if isMissingRequiredValue(value) {
					*issues = append(*issues, collectValidationIssue(
						"App spec element "+quote(elementKey)+" missing required prop "+quote(propKey)+" for component "+quote(componentType)+".",
						elementKey,
						componentType,
					))
				}
				continue
			}
		}
		*issues = append(*issues, collectValidationIssue(
			"App spec element "+quote(elementKey)+" missing required prop "+quote(propKey)+" for component "+quote(componentType)+".",
			elementKey,
			componentType,
		))
	}
}

func collectPushChildren(
	elementKey string,
	element map[string]any,
	elements map[string]map[string]any,
	scopeConfigID *string,
	elementType string,
	issues *[]AppValidationIssue,
	stack *[]validationStackEntry,
) {
	rawChildren, ok := element["children"]
	if !ok || rawChildren == nil {
		return
	}
	children, ok := rawChildren.([]any)
	if !ok {
		*issues = append(*issues, collectValidationIssue(
			"App spec element "+quote(elementKey)+" children must be a list.",
			elementKey,
			elementType,
		))
		return
	}

	for _, child := range children {
		switch typed := child.(type) {
		case string:
			childElement, ok := elements[typed]
			if !ok {
				*issues = append(*issues, collectValidationIssue(
					"App spec element "+quote(elementKey)+" references missing child "+quote(typed)+".",
					elementKey,
					elementType,
				))
				continue
			}
			*stack = append(*stack, validationStackEntry{element: childElement, scopeConfigID: scopeConfigID})
		case map[string]any:
			if !isUIElement(typed) {
				*issues = append(*issues, collectValidationIssue(
					"App spec element "+quote(elementKey)+" children must be element keys or objects.",
					elementKey,
					elementType,
				))
				continue
			}
			*stack = append(*stack, validationStackEntry{element: typed, scopeConfigID: scopeConfigID})
		default:
			*issues = append(*issues, collectValidationIssue(
				"App spec element "+quote(elementKey)+" children must be element keys or objects.",
				elementKey,
				elementType,
			))
		}
	}
}

func collectApplyConfigScopeGuardrail(
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

func previewSorted(values []string, limit int) (string, string) {
	if len(values) == 0 {
		return "", ""
	}
	sortedValues := append([]string(nil), values...)
	sort.Strings(sortedValues)
	if limit <= 0 || limit > len(sortedValues) {
		limit = len(sortedValues)
	}
	preview := strings.Join(sortedValues[:limit], ", ")
	suffix := ""
	if len(sortedValues) > limit {
		suffix = " ..."
	}
	return preview, suffix
}

func collectThemeColorIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	themeColors, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.colors must be an object."}}
	}

	errors := make([]AppValidationIssue, 0)
	if _, hasLight := themeColors["light"]; hasLight || hasMapKey(themeColors, "dark") {
		extraVariantKeys := make([]string, 0)
		for key := range themeColors {
			if key != "light" && key != "dark" {
				extraVariantKeys = append(extraVariantKeys, key)
			}
		}
		if len(extraVariantKeys) > 0 {
			preview, suffix := previewSorted(extraVariantKeys, 6)
			*warnings = append(*warnings, AppValidationIssue{
				Message: "theme.colors contains unknown keys and they will be ignored: " + preview + suffix,
			})
		}
		for _, variantName := range []string{"light", "dark"} {
			if !hasMapKey(themeColors, variantName) {
				continue
			}
			variant, ok := themeColors[variantName].(map[string]any)
			if !ok {
				errors = append(errors, AppValidationIssue{
					Message: "theme.colors." + variantName + " must be an object.",
				})
				continue
			}
			errors = append(errors, collectThemeColorMapIssues(variant, "theme.colors."+variantName, warnings)...)
		}
		return errors
	}

	return collectThemeColorMapIssues(themeColors, "theme.colors", warnings)
}

func collectThemeColorMapIssues(raw map[string]any, prefix string, warnings *[]AppValidationIssue) []AppValidationIssue {
	unknown := unknownMapKeys(raw, themeColorKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: prefix + " contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for key := range themeColorKeys {
		if !hasMapKey(raw, key) {
			continue
		}
		if _, ok := raw[key].(string); !ok {
			errors = append(errors, AppValidationIssue{
				Message: prefix + "." + key + " must be a string.",
			})
		}
	}
	return errors
}

func collectThemeFontIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	fonts, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.fonts must be an object."}}
	}

	unknown := unknownMapKeys(fonts, themeFontKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.fonts contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for key := range themeFontKeys {
		if !hasMapKey(fonts, key) {
			continue
		}
		if _, ok := fonts[key].(string); !ok {
			errors = append(errors, AppValidationIssue{
				Message: "theme.fonts." + key + " must be a string.",
			})
		}
	}
	return errors
}

func collectThemeTypographyIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	typography, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.typography must be an object."}}
	}

	unknown := unknownMapKeys(typography, themeTypographyKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.typography contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for _, key := range []string{"bodySize", "bodyLineHeight", "headingLineHeight"} {
		if !hasMapKey(typography, key) {
			continue
		}
		if !isStringOrNumber(typography[key]) {
			errors = append(errors, AppValidationIssue{
				Message: "theme.typography." + key + " must be a number or string.",
			})
		}
	}

	if hasMapKey(typography, "headingSizes") {
		headingSizes, ok := typography["headingSizes"].(map[string]any)
		if !ok {
			errors = append(errors, AppValidationIssue{
				Message: "theme.typography.headingSizes must be an object.",
			})
		} else {
			headingUnknown := unknownMapKeys(headingSizes, themeHeadingSizeKeys)
			if len(headingUnknown) > 0 {
				preview, suffix := previewSorted(headingUnknown, 6)
				*warnings = append(*warnings, AppValidationIssue{
					Message: "theme.typography.headingSizes contains unknown keys and they will be ignored: " + preview + suffix,
				})
			}
			for key := range themeHeadingSizeKeys {
				if !hasMapKey(headingSizes, key) {
					continue
				}
				if !isStringOrNumber(headingSizes[key]) {
					errors = append(errors, AppValidationIssue{
						Message: "theme.typography.headingSizes." + key + " must be a number or string.",
					})
				}
			}
		}
	}

	if hasMapKey(typography, "scale") {
		scale, ok := typography["scale"].(map[string]any)
		if !ok {
			errors = append(errors, AppValidationIssue{
				Message: "theme.typography.scale must be an object.",
			})
		} else {
			scaleUnknown := unknownMapKeys(scale, themeTextScaleKeys)
			if len(scaleUnknown) > 0 {
				preview, suffix := previewSorted(scaleUnknown, 6)
				*warnings = append(*warnings, AppValidationIssue{
					Message: "theme.typography.scale contains unknown keys and they will be ignored: " + preview + suffix,
				})
			}
			for key := range themeTextScaleKeys {
				if !hasMapKey(scale, key) {
					continue
				}
				if !isStringOrNumber(scale[key]) {
					errors = append(errors, AppValidationIssue{
						Message: "theme.typography.scale." + key + " must be a number or string.",
					})
				}
			}
		}
	}

	return errors
}

func collectThemeSpacingIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	spacing, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.spacing must be an object."}}
	}

	unknown := unknownMapKeys(spacing, themeSpacingKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.spacing contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for key := range themeSpacingKeys {
		if !hasMapKey(spacing, key) {
			continue
		}
		if !isStringOrNumber(spacing[key]) {
			errors = append(errors, AppValidationIssue{
				Message: "theme.spacing." + key + " must be a number or string.",
			})
		}
	}
	return errors
}

func collectThemeVarIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	vars, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.vars must be an object."}}
	}

	invalidNamespace := make([]string, 0)
	for key := range vars {
		if !strings.HasPrefix(key, "--app-") {
			invalidNamespace = append(invalidNamespace, key)
		}
	}
	if len(invalidNamespace) > 0 {
		preview, suffix := previewSorted(invalidNamespace, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.vars contains keys that do not start with '--app-' and will be ignored: " + preview + suffix,
		})
	}

	for key, value := range vars {
		if !strings.HasPrefix(key, "--app-") {
			continue
		}
		if _, ok := value.(string); ok {
			continue
		}
		if _, ok := asNumber(value); ok {
			continue
		}
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.vars " + key + " must be a string or number and will be ignored.",
		})
	}
	return nil
}

func collectThemeMotionIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	motion, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.motion must be an object."}}
	}

	unknown := unknownMapKeys(motion, themeMotionKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.motion contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for _, key := range []string{"durationMs", "delayMs", "staggerMs"} {
		if !hasMapKey(motion, key) {
			continue
		}
		if _, ok := asNumber(motion[key]); !ok {
			errors = append(errors, AppValidationIssue{
				Message: "theme.motion." + key + " must be a number.",
			})
		}
	}
	if easing, ok := motion["easing"]; ok {
		if _, ok := easing.(string); !ok {
			errors = append(errors, AppValidationIssue{Message: "theme.motion.easing must be a string."})
		}
	}
	return errors
}

func collectThemeShadowIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	shadows, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.shadows must be an object."}}
	}

	unknown := unknownMapKeys(shadows, themeShadowKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.shadows contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for key := range themeShadowKeys {
		if !hasMapKey(shadows, key) {
			continue
		}
		if _, ok := shadows[key].(string); !ok {
			errors = append(errors, AppValidationIssue{
				Message: "theme.shadows." + key + " must be a string.",
			})
		}
	}
	return errors
}

func collectThemeComponentIssues(raw any, warnings *[]AppValidationIssue) []AppValidationIssue {
	if raw == nil {
		return nil
	}
	components, ok := raw.(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: "theme.components must be an object."}}
	}

	unknown := unknownMapKeys(components, themeComponentKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: "theme.components contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	errors = append(errors, collectThemeComponentTokenBlock(components, "button", themeButtonTokenKeys, warnings)...)
	errors = append(errors, collectThemeComponentTokenBlock(components, "input", themeInputTokenKeys, warnings)...)
	errors = append(errors, collectThemeComponentTokenBlock(components, "dropdown", themeDropdownTokenKeys, warnings)...)
	errors = append(errors, collectThemeComponentTokenBlock(components, "card", themeCardTokenKeys, warnings)...)
	errors = append(errors, collectThemeComponentTokenBlock(components, "page", themePageTokenKeys, warnings)...)
	return errors
}

func collectThemeComponentTokenBlock(
	components map[string]any,
	component string,
	tokenKeys map[string]struct{},
	warnings *[]AppValidationIssue,
) []AppValidationIssue {
	if !hasMapKey(components, component) {
		return nil
	}

	prefix := "theme.components." + component
	value, ok := components[component].(map[string]any)
	if !ok {
		return []AppValidationIssue{{Message: prefix + " must be an object."}}
	}

	unknown := unknownMapKeys(value, tokenKeys)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: prefix + " contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for key := range tokenKeys {
		if !hasMapKey(value, key) {
			continue
		}
		if _, ok := value[key].(string); !ok {
			errors = append(errors, AppValidationIssue{
				Message: prefix + "." + key + " must be a string.",
			})
		}
	}
	return errors
}

func collectAssetWarnings(assets []any) []AppValidationIssue {
	if len(assets) == 0 {
		return nil
	}

	external := make([]string, 0)
	for _, asset := range assets {
		href := resolveAssetHref(asset)
		if href == "" {
			continue
		}
		if isExternalHref(href) {
			external = append(external, href)
		}
	}
	if len(external) == 0 {
		return nil
	}

	sort.Strings(external)
	previewLimit := 3
	if len(external) < previewLimit {
		previewLimit = len(external)
	}
	preview := strings.Join(external[:previewLimit], ", ")
	suffix := ""
	if len(external) > previewLimit {
		suffix = " ..."
	}
	return []AppValidationIssue{{
		Message: "assets includes external URLs which will be filtered when external links are disallowed: " + preview + suffix,
	}}
}

func collectActionWarnings(appSpec any, definition Definition) []AppValidationIssue {
	elements, ok := iterAppElements(appSpec)
	if !ok {
		return nil
	}

	warnings := make([]AppValidationIssue, 0)
	for _, element := range elements {
		elementType, _ := element["type"].(string)
		if elementType != "ActionButton" {
			continue
		}

		props, err := elementProps(element)
		if err != nil {
			continue
		}
		binding := resolveBindingRecord(definition.DataBindings, getDataPath(props))
		actionName := resolveActionName(props, binding)
		if actionName == "" {
			continue
		}
		actionType := resolveActionType(actionName, definition.ActionMap[actionName])
		if actionType != "run" {
			continue
		}

		sectionID := getPropString(props, "sectionId")
		if sectionID == "" {
			sectionID = resolveBindingString(binding, "sectionId")
		}
		if strings.TrimSpace(sectionID) != "" {
			continue
		}

		key, _ := element["key"].(string)
		warnings = append(warnings, AppValidationIssue{
			Message:     "Run ActionButton is missing sectionId.",
			ElementKey:  key,
			ElementType: "ActionButton",
		})
	}

	return warnings
}

func iterAppElements(appSpec any) ([]map[string]any, bool) {
	rootElement, elements, err := resolveAppSpec(appSpec)
	if err != nil {
		return nil, false
	}

	stack := []map[string]any{rootElement}
	visited := map[string]struct{}{}
	output := make([]map[string]any, 0)
	for len(stack) > 0 {
		element := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		keyValue, ok := element["key"].(string)
		if !ok {
			continue
		}
		if _, ok := visited[keyValue]; ok {
			continue
		}
		visited[keyValue] = struct{}{}
		output = append(output, element)

		rawChildren, ok := element["children"]
		if !ok || rawChildren == nil {
			continue
		}
		children, ok := rawChildren.([]any)
		if !ok {
			continue
		}
		for _, child := range children {
			if childKey, ok := child.(string); ok {
				if childElement, ok := elements[childKey]; ok {
					stack = append(stack, childElement)
				}
				continue
			}
			if childElement, ok := child.(map[string]any); ok && isUIElement(childElement) {
				stack = append(stack, childElement)
			}
		}
	}
	return output, true
}

func resolveAssetHref(asset any) string {
	assetObject, ok := asset.(map[string]any)
	if !ok {
		return ""
	}
	for _, key := range []string{"href", "url", "path"} {
		value, _ := assetObject[key].(string)
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func isExternalHref(href string) bool {
	trimmed := strings.TrimSpace(href)
	if strings.HasPrefix(trimmed, "//") {
		return true
	}
	return externalHrefRE.MatchString(trimmed)
}

func unknownMapKeys(values map[string]any, allowed map[string]struct{}) []string {
	keys := make([]string, 0)
	for key := range values {
		if _, ok := allowed[key]; !ok {
			keys = append(keys, key)
		}
	}
	return keys
}

func hasMapKey(values map[string]any, key string) bool {
	_, ok := values[key]
	return ok
}

func isStringOrNumber(value any) bool {
	if _, ok := value.(string); ok {
		return true
	}
	_, ok := asNumber(value)
	return ok
}

func quote(value string) string {
	return `"` + value + `"`
}
