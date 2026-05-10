package projectview

import (
	"fmt"
	"slices"

	"setta/internal/projectstate"
)

func topLevelParamIDs(project projectstate.Project, codeObjVariantMap map[string]string, sectionPayload map[string]any) ([]string, bool, error) {
	callableID := stringField(sectionPayload, "callable")
	if callableID != "" {
		children, err := effectiveCodeObjChildren(project, codeObjVariantMap, callableID)
		return children, true, err
	}
	topLevelParamID := stringField(sectionPayload, "topLevelParamId")
	if topLevelParamID != "" {
		children, err := effectiveCodeObjChildren(project, codeObjVariantMap, topLevelParamID)
		return children, true, err
	}
	return nil, false, nil
}

func traverseParamHierarchy(project projectstate.Project, codeObjVariantMap map[string]string, rootIDs []string) ([]string, map[string][]string, map[string][]string, error) {
	paramIDs := []string{}
	idToPath := map[string][]string{}
	childrenMap := map[string][]string{}
	visited := map[string]struct{}{}

	var walk func(string, []string) error
	walk = func(codeObjID string, path []string) error {
		if _, ok := visited[codeObjID]; ok {
			return nil
		}
		visited[codeObjID] = struct{}{}

		payload, err := effectiveCodeObjObject(project, codeObjVariantMap, codeObjID)
		if err != nil {
			return err
		}
		currentPath := append(cloneStringSlice(path), codeObjID)
		codeObjType := codeObjType(project, codeObjID, payload)
		if isParamType(codeObjType) {
			paramIDs = append(paramIDs, codeObjID)
			idToPath[codeObjID] = cloneStringSlice(currentPath)
		}

		children := arrayStringField(payload, "children")
		if len(children) > 0 {
			childrenMap[codeObjID] = cloneStringSlice(children)
		}
		for _, childID := range children {
			if err := walk(childID, currentPath); err != nil {
				return err
			}
		}
		return nil
	}

	for _, rootID := range rootIDs {
		if err := walk(rootID, nil); err != nil {
			return nil, nil, nil, err
		}
	}

	return paramIDs, idToPath, childrenMap, nil
}

func filterForUIDisplay(paramIDs []string, idToPath map[string][]string, childrenMap map[string][]string, pinnedParams map[string]struct{}) ShownParamIDs {
	paramsForPinnedArea := map[string]struct{}{}
	paramsForUnpinnedArea := map[string]struct{}{}

	for _, paramID := range paramIDs {
		if _, ok := pinnedParams[paramID]; !ok {
			continue
		}
		for _, pathID := range idToPath[paramID] {
			paramsForPinnedArea[pathID] = struct{}{}
		}
		addDescendants(paramID, childrenMap, paramsForPinnedArea)
	}

	for _, paramID := range paramIDs {
		if _, ok := pinnedParams[paramID]; ok {
			continue
		}
		for _, pathID := range idToPath[paramID] {
			paramsForUnpinnedArea[pathID] = struct{}{}
		}
	}

	return ShownParamIDs{
		Pinned:   buildShownParamArea(paramIDs, paramsForPinnedArea, idToPath, childrenMap),
		Unpinned: buildShownParamArea(paramIDs, paramsForUnpinnedArea, idToPath, childrenMap),
	}
}

func buildShownParamArea(paramIDs []string, candidates map[string]struct{}, idToPath map[string][]string, childrenMap map[string][]string) ShownParamIDDetails {
	result := ShownParamIDDetails{
		RequiredParamIDsToPaths: map[string][]string{},
		TopLevelParamIDs:        []string{},
	}
	included := map[string]struct{}{}

	for _, paramID := range paramIDs {
		if !shouldIncludeParam(paramID, candidates, childrenMap) {
			continue
		}
		path := idToPath[paramID]
		for _, pathID := range path {
			result.RequiredParamIDsToPaths[pathID] = cloneStringSlice(
				idToPath[pathID],
			)
		}
		included[paramID] = struct{}{}
	}

	for _, paramID := range paramIDs {
		if _, ok := included[paramID]; !ok {
			continue
		}
		hasParent := false
		for parentID := range included {
			if slices.Contains(childrenMap[parentID], paramID) {
				hasParent = true
				break
			}
		}
		if !hasParent {
			result.TopLevelParamIDs = append(result.TopLevelParamIDs, paramID)
		}
	}

	return result
}

func shouldIncludeParam(paramID string, candidates map[string]struct{}, childrenMap map[string][]string) bool {
	if _, ok := candidates[paramID]; !ok {
		return false
	}
	children := childrenMap[paramID]
	if len(children) == 0 {
		return true
	}
	for _, childID := range children {
		if shouldIncludeParam(childID, candidates, childrenMap) {
			return true
		}
	}
	return false
}

func addDescendants(paramID string, childrenMap map[string][]string, target map[string]struct{}) {
	for _, childID := range childrenMap[paramID] {
		target[childID] = struct{}{}
		addDescendants(childID, childrenMap, target)
	}
}

func effectiveSectionType(project projectstate.Project, sectionID string, variantID string) (string, error) {
	payload, err := effectiveSectionObject(project, sectionID, variantID)
	if err != nil {
		return "", err
	}
	if sectionType := stringField(payload, "type"); sectionType != "" {
		return sectionType, nil
	}
	_, _, impl, err := project.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return "", err
	}
	return fallbackSectionType(impl), nil
}

func effectiveSectionObject(project projectstate.Project, sectionID string, variantID string) (map[string]any, error) {
	section, ok := project.Sections[sectionID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", projectstate.ErrSectionNotFound, sectionID)
	}
	variant, ok := project.SectionVariants[variantID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", projectstate.ErrSectionVariantNotFound, variantID)
	}
	impl, ok := project.SectionImpls[variant.ImplID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", projectstate.ErrSectionImplNotFound, variant.ImplID)
	}
	base, err := rawObjectFromPayload(sectionImplPayloadUnchecked(impl))
	if err != nil {
		return nil, err
	}
	sharedModifier, err := rawObjectFromModifier(section.SharedModifier)
	if err != nil {
		return nil, err
	}
	modifier, err := rawObjectFromModifier(variant.Modifier)
	if err != nil {
		return nil, err
	}
	return mergeObjects(mergeObjects(base, sharedModifier), modifier), nil
}

func effectiveCodeObjChildren(project projectstate.Project, codeObjVariantMap map[string]string, codeObjID string) ([]string, error) {
	payload, err := effectiveCodeObjObject(project, codeObjVariantMap, codeObjID)
	if err != nil {
		return nil, err
	}
	return arrayStringField(payload, "children"), nil
}

func effectiveCodeObjObject(project projectstate.Project, codeObjVariantMap map[string]string, codeObjID string) (map[string]any, error) {
	payload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, codeObjID)
	if err != nil {
		return nil, err
	}
	return payload, nil
}

func codeObjType(project projectstate.Project, codeObjID string, payload map[string]any) string {
	if objectType := stringField(payload, "type"); objectType != "" {
		return objectType
	}
	variantIDs := project.CodeObjs[codeObjID].VariantIDs
	if len(variantIDs) == 0 {
		return ""
	}
	if variant, ok := project.CodeObjVariants[variantIDs[0]]; ok {
		if impl, ok := project.CodeObjImpls[variant.ImplID]; ok {
			return impl.Type
		}
	}
	return ""
}

func isParamType(codeObjType string) bool {
	switch codeObjType {
	case "CodeCallable", "":
		return false
	default:
		return true
	}
}

func collectDrawImagePaths(sectionPayload map[string]any) []string {
	output := []string{}
	layers, ok := sectionPayload["layers"].([]any)
	if !ok {
		return output
	}
	for _, rawLayer := range layers {
		layer, ok := rawLayer.(map[string]any)
		if !ok {
			continue
		}
		elements, ok := layer["elements"].([]any)
		if !ok {
			continue
		}
		for _, rawElement := range elements {
			element, ok := rawElement.(map[string]any)
			if !ok {
				continue
			}
			if stringField(element, "type") != "Image" {
				continue
			}
			dataPath := stringField(element, "dataPath")
			if dataPath != "" {
				output = append(output, dataPath)
			}
		}
	}
	return output
}
