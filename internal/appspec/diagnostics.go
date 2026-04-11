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
			Message: "unknown catalog id: " + catalogID,
		}}
	}

	rootElement, elements, err := resolveAppSpec(appSpec)
	if err != nil {
		return []AppValidationIssue{{Message: err.Error()}}
	}

	collector := newSpecValidationCollector(catalog, options, rootElement, elements)
	return collector.collect()
}

type specValidationCollector struct {
	catalog        Catalog
	options        ValidationOptions
	allowedActions map[string]struct{}
	elements       map[string]map[string]any
	issues         []AppValidationIssue
	runActionNames map[string]struct{}
	runActionCount int
	usedConfigIDs  map[string]struct{}
	unscopedKeys   []string
	visited        map[string]struct{}
	stack          []validationStackEntry
}

func newSpecValidationCollector(
	catalog Catalog,
	options ValidationOptions,
	rootElement map[string]any,
	elements map[string]map[string]any,
) specValidationCollector {
	allowedActions := cloneActionSet(catalog.Actions)
	for name := range options.ActionDefinitions {
		allowedActions[name] = struct{}{}
	}
	return specValidationCollector{
		catalog:        catalog,
		options:        options,
		allowedActions: allowedActions,
		elements:       elements,
		runActionNames: collectRunActionNames(options.ActionDefinitions),
		usedConfigIDs:  map[string]struct{}{},
		unscopedKeys:   make([]string, 0),
		visited:        map[string]struct{}{},
		stack:          []validationStackEntry{{element: rootElement}},
	}
}

func (c *specValidationCollector) collect() []AppValidationIssue {
	for len(c.stack) > 0 {
		current := c.stack[len(c.stack)-1]
		c.stack = c.stack[:len(c.stack)-1]
		c.visit(current)
	}
	c.appendSummaryIssues()
	return c.issues
}

func (c *specValidationCollector) visit(current validationStackEntry) {
	keyValue, ok := c.resolveElementKey(current.element)
	if !ok {
		return
	}
	if _, seen := c.visited[keyValue]; seen {
		return
	}
	c.visited[keyValue] = struct{}{}

	componentType, componentSchema, ok := c.resolveComponentSchema(current, keyValue)
	if !ok {
		return
	}

	props := collectElementProps(keyValue, current.element, componentType, &c.issues)
	binding := resolveBindingRecord(c.options.DataBindings, getDataPath(props))

	collectValidateChildrenAgainstCatalog(keyValue, componentType, componentSchema, current.element, &c.issues)
	collectValidatePropsAgainstCatalog(keyValue, componentType, componentSchema, props, binding, &c.issues)

	scopeConfigID := c.resolveScopeConfigID(componentType, props, current.scopeConfigID)
	c.collectUsageIssues(keyValue, componentType, props, binding, scopeConfigID)
	c.pushChildren(keyValue, current.element, scopeConfigID, componentType)
}

func (c *specValidationCollector) resolveElementKey(element map[string]any) (string, bool) {
	keyValue, ok := element["key"].(string)
	if !ok {
		c.issues = append(c.issues, AppValidationIssue{Message: "App spec elements require a string key."})
		return "", false
	}
	return keyValue, true
}

func (c *specValidationCollector) resolveComponentSchema(
	current validationStackEntry,
	keyValue string,
) (string, ComponentSchema, bool) {
	componentType, ok := current.element["type"].(string)
	if !ok {
		c.issues = append(c.issues, collectValidationIssue(
			"App spec element "+quote(keyValue)+" missing component type.",
			keyValue,
			"",
		))
		c.pushChildren(keyValue, current.element, current.scopeConfigID, "")
		return "", ComponentSchema{}, false
	}

	componentSchema, ok := c.catalog.Components[componentType]
	if !ok {
		c.issues = append(c.issues, collectValidationIssue(
			"App spec element "+quote(keyValue)+" uses unknown component "+quote(componentType)+".",
			keyValue,
			componentType,
		))
		c.pushChildren(keyValue, current.element, current.scopeConfigID, componentType)
		return componentType, ComponentSchema{}, false
	}
	return componentType, componentSchema, true
}

func (c *specValidationCollector) resolveScopeConfigID(
	componentType string,
	props map[string]any,
	scopeConfigID *string,
) *string {
	if componentType != "ConfigScope" {
		return scopeConfigID
	}
	configID := getPropString(props, "configId")
	if configID == "" {
		return nil
	}
	c.usedConfigIDs[configID] = struct{}{}
	configIDCopy := configID
	return &configIDCopy
}

func (c *specValidationCollector) collectUsageIssues(
	keyValue string,
	componentType string,
	props map[string]any,
	binding map[string]any,
	scopeConfigID *string,
) {
	if componentType == "ActionButton" {
		c.collectActionUsageIssues(keyValue, componentType, props, binding, scopeConfigID)
		return
	}
	if requiresConfigScopeGuardrail(componentType) {
		applyConfigScopeGuardrail(keyValue, scopeConfigID, props, binding, c.usedConfigIDs, &c.unscopedKeys, "")
	}
}

func (c *specValidationCollector) collectActionUsageIssues(
	keyValue string,
	componentType string,
	props map[string]any,
	binding map[string]any,
	scopeConfigID *string,
) {
	actionName := resolveActionName(props, binding)
	if actionName == "" {
		return
	}

	actionType := ""
	if _, ok := c.allowedActions[actionName]; !ok {
		c.issues = append(c.issues, collectValidationIssue(
			"App spec action "+quote(actionName)+" is not registered (element "+quote(keyValue)+").",
			keyValue,
			componentType,
		))
	} else {
		actionType = resolveActionType(actionName, c.options.ActionDefinitions[actionName])
		if actionType == "run" {
			c.runActionCount++
		}
	}

	applyConfigScopeGuardrail(keyValue, scopeConfigID, props, binding, c.usedConfigIDs, &c.unscopedKeys, actionType)
}

func (c *specValidationCollector) pushChildren(
	keyValue string,
	element map[string]any,
	scopeConfigID *string,
	componentType string,
) {
	collectPushChildren(keyValue, element, c.elements, scopeConfigID, componentType, &c.issues, &c.stack)
}

func (c *specValidationCollector) appendSummaryIssues() {
	if c.runActionCount > 1 && len(c.runActionNames) <= 1 {
		c.issues = append(c.issues, AppValidationIssue{
			Message: "App spec can only include one run action. Define an additional run action to allow multiple run buttons.",
		})
	}
	if len(c.usedConfigIDs) > 1 && len(c.unscopedKeys) > 0 {
		sort.Strings(c.unscopedKeys)
		c.issues = append(c.issues, AppValidationIssue{
			Message: "App spec uses multiple configs but some elements are not scoped. Wrap them in ConfigScope or set configId explicitly. Missing scope for: " + strings.Join(c.unscopedKeys, ", ") + ".",
		})
	}
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

	for _, propKey := range orderedComponentPropKeys(componentSchema) {
		propSchema := componentSchema.Props[propKey]
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

	errors := collectThemeStringOrNumberIssues(
		typography,
		[]string{"bodySize", "bodyLineHeight", "headingLineHeight"},
		"theme.typography",
	)
	errors = append(errors, collectThemeOptionalStringOrNumberMapIssues(
		typography,
		"headingSizes",
		themeHeadingSizeKeys,
		"theme.typography.headingSizes",
		warnings,
	)...)
	errors = append(errors, collectThemeOptionalStringOrNumberMapIssues(
		typography,
		"scale",
		themeTextScaleKeys,
		"theme.typography.scale",
		warnings,
	)...)
	return errors
}

func collectThemeStringOrNumberIssues(values map[string]any, keys []string, prefix string) []AppValidationIssue {
	errors := make([]AppValidationIssue, 0)
	for _, key := range keys {
		if !hasMapKey(values, key) {
			continue
		}
		if !isStringOrNumber(values[key]) {
			errors = append(errors, AppValidationIssue{
				Message: prefix + "." + key + " must be a number or string.",
			})
		}
	}
	return errors
}

func collectThemeOptionalStringOrNumberMapIssues(
	values map[string]any,
	key string,
	allowed map[string]struct{},
	prefix string,
	warnings *[]AppValidationIssue,
) []AppValidationIssue {
	if !hasMapKey(values, key) {
		return nil
	}
	entries, ok := values[key].(map[string]any)
	if !ok {
		return []AppValidationIssue{{
			Message: prefix + " must be an object.",
		}}
	}

	unknown := unknownMapKeys(entries, allowed)
	if len(unknown) > 0 {
		preview, suffix := previewSorted(unknown, 6)
		*warnings = append(*warnings, AppValidationIssue{
			Message: prefix + " contains unknown keys and they will be ignored: " + preview + suffix,
		})
	}

	errors := make([]AppValidationIssue, 0)
	for allowedKey := range allowed {
		if !hasMapKey(entries, allowedKey) {
			continue
		}
		if !isStringOrNumber(entries[allowedKey]) {
			errors = append(errors, AppValidationIssue{
				Message: prefix + "." + allowedKey + " must be a number or string.",
			})
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

	iterator := appElementIterator{
		elements: elements,
		stack:    []map[string]any{rootElement},
		visited:  map[string]struct{}{},
		output:   make([]map[string]any, 0),
	}
	return iterator.collect(), true
}

type appElementIterator struct {
	elements map[string]map[string]any
	stack    []map[string]any
	visited  map[string]struct{}
	output   []map[string]any
}

func (i *appElementIterator) collect() []map[string]any {
	for len(i.stack) > 0 {
		element := i.stack[len(i.stack)-1]
		i.stack = i.stack[:len(i.stack)-1]
		if !i.record(element) {
			continue
		}
		i.pushChildren(element)
	}
	return i.output
}

func (i *appElementIterator) record(element map[string]any) bool {
	keyValue, ok := element["key"].(string)
	if !ok {
		return false
	}
	if _, ok := i.visited[keyValue]; ok {
		return false
	}
	i.visited[keyValue] = struct{}{}
	i.output = append(i.output, element)
	return true
}

func (i *appElementIterator) pushChildren(element map[string]any) {
	children, err := elementChildren(element)
	if err != nil {
		return
	}
	for _, child := range children {
		childElement := i.resolveChild(child)
		if childElement != nil {
			i.stack = append(i.stack, childElement)
		}
	}
}

func (i *appElementIterator) resolveChild(child any) map[string]any {
	if childKey, ok := child.(string); ok {
		return i.elements[childKey]
	}
	childElement, ok := child.(map[string]any)
	if ok && isUIElement(childElement) {
		return childElement
	}
	return nil
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
