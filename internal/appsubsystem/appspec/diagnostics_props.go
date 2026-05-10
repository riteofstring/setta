package appspec

import (
	"sort"
	"strings"
)

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
	collectProvidedPropIssues(elementKey, componentType, componentSchema, props, issues)
	collectRequiredPropIssues(elementKey, componentType, componentSchema, props, binding, issues)
}

func collectProvidedPropIssues(
	elementKey string,
	componentType string,
	componentSchema ComponentSchema,
	props map[string]any,
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
}

func collectRequiredPropIssues(
	elementKey string,
	componentType string,
	componentSchema ComponentSchema,
	props map[string]any,
	binding map[string]any,
	issues *[]AppValidationIssue,
) {
	for _, propKey := range orderedComponentPropKeys(componentSchema) {
		propSchema := componentSchema.Props[propKey]
		if !propSchema.Required {
			continue
		}
		collectRequiredPropIssue(elementKey, componentType, propKey, propSchema, props, binding, issues)
	}
}

func collectRequiredPropIssue(
	elementKey string,
	componentType string,
	propKey string,
	propSchema PropSchema,
	props map[string]any,
	binding map[string]any,
	issues *[]AppValidationIssue,
) {
	valueState := resolveRequiredCatalogPropValue(props, binding, propKey)
	if !valueState.present {
		appendMissingRequiredPropIssue(elementKey, componentType, propKey, issues)
		return
	}
	if valueState.fromBinding {
		if err := validatePropValue(elementKey, componentType, propKey, valueState.value, propSchema); err != nil {
			*issues = append(*issues, collectValidationIssue(err.Error(), elementKey, componentType))
		}
	}
	if isMissingRequiredValue(valueState.value) {
		appendMissingRequiredPropIssue(elementKey, componentType, propKey, issues)
	}
}

func appendMissingRequiredPropIssue(
	elementKey string,
	componentType string,
	propKey string,
	issues *[]AppValidationIssue,
) {
	*issues = append(*issues, collectValidationIssue(
		missingRequiredPropError(elementKey, componentType, propKey).Error(),
		elementKey,
		componentType,
	))
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
