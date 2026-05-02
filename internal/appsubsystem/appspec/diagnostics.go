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
