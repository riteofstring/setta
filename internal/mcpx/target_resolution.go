package mcpx

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/projectview"
	"setta/internal/tools"
)

type resolvedToolTargets struct {
	sectionIDs         []string
	unmappedCodeObjIDs []string
}

func resolveToolTargets(metadata tools.Metadata, arguments map[string]any, projectView *projectview.SingleConfig) (resolvedToolTargets, error) {
	if len(arguments) == 0 && strings.TrimSpace(metadata.DefaultTargetSingletonSection) == "" {
		return resolvedToolTargets{}, nil
	}

	targetSectionSet, extractedCodeObjIDs := extractExplicitTargetSets(metadata, arguments)
	unmappedCodeObjSet, err := resolveMappedCodeObjectTargets(targetSectionSet, extractedCodeObjIDs, projectView)
	if err != nil {
		return resolvedToolTargets{}, err
	}
	addDefaultTargetSingletonSection(targetSectionSet, metadata.DefaultTargetSingletonSection, projectView)

	return resolvedToolTargets{
		sectionIDs:         sortedStringSet(targetSectionSet),
		unmappedCodeObjIDs: sortedStringSet(unmappedCodeObjSet),
	}, nil
}

func extractExplicitTargetSets(metadata tools.Metadata, arguments map[string]any) (map[string]struct{}, map[string]struct{}) {
	targetSectionSet := map[string]struct{}{}
	extractedCodeObjIDs := map[string]struct{}{}
	if len(arguments) == 0 || len(metadata.IDPathsByType) == 0 {
		return targetSectionSet, extractedCodeObjIDs
	}
	idsByType := extractIDsByType(arguments, metadata.IDPathsByType, true)
	addStringSetEntries(targetSectionSet, idsByType[tools.IDTypeSection])
	addStringSetEntries(extractedCodeObjIDs, idsByType[tools.IDTypeCodeObject])
	return targetSectionSet, extractedCodeObjIDs
}

func resolveMappedCodeObjectTargets(targetSectionSet map[string]struct{}, codeObjIDs map[string]struct{}, projectView *projectview.SingleConfig) (map[string]struct{}, error) {
	if len(codeObjIDs) == 0 {
		return map[string]struct{}{}, nil
	}
	if projectView == nil {
		return nil, fmt.Errorf("mcpx: project view is required for code object target mapping")
	}
	mappedSections, unmappedCodeObjIDs, err := mapCodeObjIDsToSections(*projectView, codeObjIDs)
	if err != nil {
		return nil, err
	}
	addStringSetEntries(targetSectionSet, mappedSections)
	return unmappedCodeObjIDs, nil
}

func addDefaultTargetSingletonSection(targetSectionSet map[string]struct{}, singletonName string, projectView *projectview.SingleConfig) {
	if len(targetSectionSet) != 0 || projectView == nil || strings.TrimSpace(singletonName) == "" {
		return
	}
	if singletonSectionID := resolveDefaultTargetSingletonSection(*projectView, singletonName); singletonSectionID != "" {
		targetSectionSet[singletonSectionID] = struct{}{}
	}
}

func addStringSetEntries(target map[string]struct{}, values map[string]struct{}) {
	for value := range values {
		target[value] = struct{}{}
	}
}

func resolveDefaultTargetSingletonSection(view projectview.SingleConfig, singletonName string) string {
	switch strings.TrimSpace(singletonName) {
	case "GlobalVariables":
		return derefStringPointer(view.SingletonSections.GlobalVariables)
	case "GenPythonCode":
		return derefStringPointer(view.SingletonSections.GenPythonCode)
	case "GenPythonMetadata":
		return derefStringPointer(view.SingletonSections.GenPythonMetadata)
	default:
		return ""
	}
}

func mapCodeObjIDsToSections(view projectview.SingleConfig, codeObjIDs map[string]struct{}) (map[string]struct{}, map[string]struct{}, error) {
	if len(codeObjIDs) == 0 {
		return map[string]struct{}{}, map[string]struct{}{}, nil
	}

	index, err := buildCodeObjSectionIndex(view)
	if err != nil {
		return nil, nil, err
	}

	mappedSections := map[string]struct{}{}
	unmappedCodeObjIDs := map[string]struct{}{}
	for codeObjID := range codeObjIDs {
		sectionIDs, ok := index[codeObjID]
		if !ok {
			unmappedCodeObjIDs[codeObjID] = struct{}{}
			continue
		}
		for sectionID := range sectionIDs {
			mappedSections[sectionID] = struct{}{}
		}
	}
	return mappedSections, unmappedCodeObjIDs, nil
}

func buildCodeObjSectionIndex(view projectview.SingleConfig) (map[string]map[string]struct{}, error) {
	index := map[string]map[string]struct{}{}
	for sectionID := range view.Sections {
		effectiveSection, err := effectiveSectionObject(view, sectionID)
		if err != nil {
			return nil, err
		}

		for codeObjID := range stringMapFieldFromObject(effectiveSection, "codeObjVariantMap") {
			indexSectionTarget(index, codeObjID, sectionID)
		}
		if callableID := stringFieldFromObject(effectiveSection, "callable"); callableID != "" {
			indexSectionTarget(index, callableID, sectionID)
		}
	}
	return index, nil
}

func indexSectionTarget(index map[string]map[string]struct{}, codeObjID string, sectionID string) {
	trimmedCodeObjID := strings.TrimSpace(codeObjID)
	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedCodeObjID == "" || trimmedSectionID == "" {
		return
	}
	sectionIDs := index[trimmedCodeObjID]
	if sectionIDs == nil {
		sectionIDs = map[string]struct{}{}
		index[trimmedCodeObjID] = sectionIDs
	}
	sectionIDs[trimmedSectionID] = struct{}{}
}

func effectiveSectionObject(view projectview.SingleConfig, sectionID string) (map[string]any, error) {
	section, ok := view.Sections[strings.TrimSpace(sectionID)]
	if !ok {
		return nil, fmt.Errorf("mcpx: section %q not found in project view", sectionID)
	}
	variantID := resolveCurrentSectionVariantID(view, section)
	if variantID == "" {
		return nil, fmt.Errorf("mcpx: section %q has no active variant", sectionID)
	}
	variant, ok := view.SectionVariants[variantID]
	if !ok {
		return nil, fmt.Errorf("mcpx: section variant %q not found in project view", variantID)
	}

	base, err := rawObjectFromViewJSON(view.SectionImpls[variant.Impl])
	if err != nil {
		return nil, fmt.Errorf("mcpx: decode section impl %q: %w", variant.Impl, err)
	}
	sharedModifier, err := rawObjectFromViewJSON(section.SharedModifier)
	if err != nil {
		return nil, fmt.Errorf("mcpx: decode section %q shared modifier: %w", sectionID, err)
	}
	variantModifier, err := rawObjectFromViewJSON(variant.Modifier)
	if err != nil {
		return nil, fmt.Errorf("mcpx: decode section variant %q modifier: %w", variantID, err)
	}
	return mergeViewObjects(mergeViewObjects(base, sharedModifier), variantModifier), nil
}

func resolveCurrentSectionVariantID(view projectview.SingleConfig, section projectview.Core) string {
	if variantID, ok := view.ProjectConfig.SectionVariantMap[section.ID]; ok && strings.TrimSpace(variantID) != "" {
		return strings.TrimSpace(variantID)
	}
	if section.DefaultVariant != nil && strings.TrimSpace(*section.DefaultVariant) != "" {
		return strings.TrimSpace(*section.DefaultVariant)
	}
	for _, variantID := range section.Variants {
		if strings.TrimSpace(variantID) != "" {
			return strings.TrimSpace(variantID)
		}
	}
	return ""
}

func rawObjectFromViewJSON(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("expected JSON object")
	}
	return object, nil
}

func mergeViewObjects(base map[string]any, modifier map[string]any) map[string]any {
	merged := cloneViewObject(base)
	for key, value := range modifier {
		baseObject, baseIsObject := merged[key].(map[string]any)
		modifierObject, modifierIsObject := value.(map[string]any)
		if baseIsObject && modifierIsObject {
			merged[key] = mergeViewObjects(baseObject, modifierObject)
			continue
		}
		merged[key] = cloneViewValue(value)
	}
	return merged
}

func cloneViewObject(source map[string]any) map[string]any {
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = cloneViewValue(value)
	}
	return cloned
}

func cloneViewValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return cloneViewObject(typed)
	case []any:
		cloned := make([]any, len(typed))
		for index, entry := range typed {
			cloned[index] = cloneViewValue(entry)
		}
		return cloned
	default:
		return typed
	}
}

func stringFieldFromObject(object map[string]any, key string) string {
	value, ok := object[key]
	if !ok {
		return ""
	}
	typed, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(typed)
}

func stringMapFieldFromObject(object map[string]any, key string) map[string]string {
	value, ok := object[key]
	if !ok {
		return nil
	}
	rawMap, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	output := make(map[string]string, len(rawMap))
	for mapKey, rawValue := range rawMap {
		typed, ok := rawValue.(string)
		if ok && strings.TrimSpace(typed) != "" {
			output[mapKey] = strings.TrimSpace(typed)
		}
	}
	return output
}

func derefStringPointer(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
