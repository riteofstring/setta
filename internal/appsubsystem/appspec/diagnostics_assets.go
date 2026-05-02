package appspec

import (
	"sort"
	"strings"
)

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
