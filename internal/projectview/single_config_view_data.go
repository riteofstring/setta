package projectview

import (
	"fmt"
	"strings"

	"setta/internal/projectstate"
)

func populateSectionViewData(view *SingleConfig, project projectstate.Project) error {
	for sectionID, section := range project.Sections {
		view.Sections[sectionID] = coreFromSection(section)
	}
	for implID, impl := range project.SectionImpls {
		payload, err := sectionImplPayload(impl)
		if err != nil {
			return fmt.Errorf("project %q section impl %q: %w", project.ID, implID, err)
		}
		view.SectionImpls[implID] = payload
	}
	for variantID, variant := range project.SectionVariants {
		view.SectionVariants[variantID] = variantFromSectionVariant(variant)
	}
	return nil
}

func populateCodeObjectViewData(view *SingleConfig, project projectstate.Project) error {
	for codeObjID, codeObj := range project.CodeObjs {
		view.CodeObjs[codeObjID] = coreFromCodeObject(codeObj)
	}
	for implID, impl := range project.CodeObjImpls {
		payload, err := codeObjImplPayload(impl)
		if err != nil {
			return fmt.Errorf("project %q code object impl %q: %w", project.ID, implID, err)
		}
		view.CodeObjImpls[implID] = payload
	}
	for variantID, variant := range project.CodeObjVariants {
		view.CodeObjVariants[variantID] = variantFromCodeObjectVariant(variant)
	}
	return nil
}

func cloneTopLevelSectionLayouts(
	layouts map[string]projectstate.TopLevelSectionLayout,
	topLevelSectionIDs []string,
) map[string]projectstate.TopLevelSectionLayout {
	cloned := make(map[string]projectstate.TopLevelSectionLayout, len(layouts)+len(topLevelSectionIDs))
	for sectionID, layout := range layouts {
		cloned[sectionID] = layout.Clone()
	}
	for _, sectionID := range topLevelSectionIDs {
		if _, ok := cloned[sectionID]; ok {
			continue
		}
		cloned[sectionID] = projectstate.TopLevelSectionLayout{}
	}
	return cloned
}

func cloneProjectViewModes(
	viewModes map[string]projectstate.ViewMode,
	topLevelSectionIDs []string,
	topLevelSections map[string]projectstate.TopLevelSectionLayout,
) map[string]projectstate.ViewMode {
	cloned := make(map[string]projectstate.ViewMode, len(viewModes))
	for viewModeID, viewMode := range viewModes {
		clonedViewMode := viewMode.Clone()
		repairViewModeTopLevelState(&clonedViewMode, topLevelSectionIDs, topLevelSections)
		cloned[viewModeID] = clonedViewMode
	}
	return cloned
}

func repairViewModeTopLevelState(
	viewMode *projectstate.ViewMode,
	topLevelSectionIDs []string,
	topLevelSections map[string]projectstate.TopLevelSectionLayout,
) {
	if viewMode.VisibilityBySectionID == nil {
		viewMode.VisibilityBySectionID = map[string]bool{}
	}
	if viewMode.TopLevelSections == nil {
		viewMode.TopLevelSections = map[string]projectstate.TopLevelSectionLayout{}
	}
	for _, sectionID := range topLevelSectionIDs {
		if _, ok := viewMode.VisibilityBySectionID[sectionID]; !ok {
			viewMode.VisibilityBySectionID[sectionID] = true
		}
		if _, ok := viewMode.TopLevelSections[sectionID]; ok {
			continue
		}
		viewMode.TopLevelSections[sectionID] = topLevelSections[sectionID].Clone()
	}
}

func cloneProjectCodegenTargets(targets []projectstate.ProjectCodegenTarget) []ProjectCodegenTarget {
	cloned := make([]ProjectCodegenTarget, 0, len(targets))
	for _, target := range targets {
		cloned = append(cloned, ProjectCodegenTarget(codegenTargetPayload(target)))
	}
	return cloned
}

func cloneProjectEdges(project projectstate.Project) (
	[]projectstate.Edge,
	[]projectstate.AgenticEdge,
	[]projectstate.StateMachineEdge,
) {
	edges := make([]projectstate.Edge, len(project.Edges))
	for index, edge := range project.Edges {
		edges[index] = edge.Clone()
	}
	agenticEdges := make([]projectstate.AgenticEdge, len(project.AgenticEdges))
	for index, edge := range project.AgenticEdges {
		agenticEdges[index] = edge.Clone()
	}
	stateMachineEdges := make([]projectstate.StateMachineEdge, len(project.StateMachineEdges))
	for index, edge := range project.StateMachineEdges {
		stateMachineEdges[index] = edge.Clone()
	}
	return edges, agenticEdges, stateMachineEdges
}

func coreFromSection(section projectstate.Section) Core {
	return Core{
		ID:             section.ID,
		Name:           section.Name,
		DisplayName:    section.DisplayName,
		Variants:       cloneStringSlice(section.VariantIDs),
		DefaultVariant: stringPointerOrNil(section.DefaultVariantID),
		SharedModifier: cloneRawJSONObject(section.SharedModifier),
		UnsharedKeys:   cloneStringSlice(section.UnsharedKeys),
	}
}

func coreFromCodeObject(codeObj projectstate.CodeObject) Core {
	return Core{
		ID:             codeObj.ID,
		Name:           codeObj.Name,
		DisplayName:    codeObj.DisplayName,
		Variants:       cloneStringSlice(codeObj.VariantIDs),
		DefaultVariant: stringPointerOrNil(codeObj.DefaultVariantID),
		SharedModifier: cloneRawJSONObject(codeObj.SharedModifier),
		UnsharedKeys:   cloneStringSlice(codeObj.UnsharedKeys),
	}
}

func variantFromSectionVariant(variant projectstate.SectionVariant) Variant {
	return Variant{
		ID:             variant.ID,
		Name:           variant.Name,
		Impl:           variant.ImplID,
		NonPresetImpls: cloneStringSlice(variant.NonPresetImplIDs),
		Modifier:       cloneRawJSONObject(variant.Modifier),
		IsFrozen:       variant.IsFrozen,
	}
}

func variantFromCodeObjectVariant(variant projectstate.CodeObjectVariant) Variant {
	return Variant{
		ID:             variant.ID,
		Name:           variant.Name,
		Impl:           variant.ImplID,
		NonPresetImpls: cloneStringSlice(variant.NonPresetImplIDs),
		Modifier:       cloneRawJSONObject(variant.Modifier),
		IsFrozen:       variant.IsFrozen,
	}
}

func deriveSingletonSections(project projectstate.Project) SingletonSections {
	var singletons SingletonSections
	for _, sectionID := range sortedSectionIDs(project.Sections) {
		variantID, ok := project.SectionVariantMap[sectionID]
		if !ok {
			continue
		}
		sectionType, err := effectiveSectionType(project, sectionID, variantID)
		if err != nil {
			continue
		}
		switch sectionType {
		case "GlobalVariables":
			if singletons.GlobalVariables == nil {
				singletons.GlobalVariables = stringPointer(sectionID)
			}
		case "GenPythonCode":
			if singletons.GenPythonCode == nil {
				singletons.GenPythonCode = stringPointer(sectionID)
			}
		case "GenPythonMetadata":
			if singletons.GenPythonMetadata == nil {
				singletons.GenPythonMetadata = stringPointer(sectionID)
			}
		}
	}
	return singletons
}

func deriveSectionCapabilities(project projectstate.Project) map[string]SectionCapabilities {
	output := make(map[string]SectionCapabilities, len(project.Sections))
	for _, sectionID := range sortedSectionIDs(project.Sections) {
		output[sectionID] = deriveSectionCapability(project, sectionID)
	}
	return output
}

func deriveSectionCapability(project projectstate.Project, sectionID string) SectionCapabilities {
	_, _, impl, err := project.ResolveSection(sectionID)
	if err != nil {
		return SectionCapabilities{
			RunDisabledReason: stringPointer(runDisabledReasonManualSectionRequired),
		}
	}

	capabilities := SectionCapabilities{}
	switch {
	case impl.IsGeneratedEntrySection():
		capabilities.CanSelectAsEntryCodeBlock = true
		if impl.UsesPluginCodegen() {
			capabilities.RunDisabledReason = stringPointer(runDisabledReasonPluginCodegen)
			return capabilities
		}
		capabilities.CanRun = true
		return capabilities
	case impl.IsCode():
		capabilities.CanSelectAsEntryCodeBlock = true
		capabilities.EntryCodeBlockValue = stringPointer(sectionID)
		if impl.IsRunnableCode() {
			capabilities.CanRun = true
			capabilities.RunRequestSectionID = stringPointer(sectionID)
			return capabilities
		}
		capabilities.RunDisabledReason = stringPointer(runDisabledReasonNotRunnable)
		return capabilities
	default:
		capabilities.RunDisabledReason = stringPointer(runDisabledReasonManualSectionRequired)
		return capabilities
	}
}

func deriveProjectRunCapabilities(
	project projectstate.Project,
	singletons SingletonSections,
	sectionCapabilities map[string]SectionCapabilities,
) ProjectRunCapabilities {
	effectiveEntrySectionID := deriveEffectiveEntrySectionID(project, singletons)
	if effectiveEntrySectionID == nil {
		return ProjectRunCapabilities{
			CanRunFromMain:          false,
			MainRunDisabledReason:   stringPointer(runDisabledReasonManualEntryRequired),
			EffectiveEntrySectionID: nil,
		}
	}

	capabilities, ok := sectionCapabilities[*effectiveEntrySectionID]
	if ok && capabilities.CanRun {
		return ProjectRunCapabilities{
			CanRunFromMain:          true,
			MainRunDisabledReason:   nil,
			EffectiveEntrySectionID: stringPointer(*effectiveEntrySectionID),
		}
	}

	reason := stringPointer(runDisabledReasonManualEntryRequired)
	if ok && capabilities.RunDisabledReason != nil {
		reason = stringPointer(*capabilities.RunDisabledReason)
	}
	return ProjectRunCapabilities{
		CanRunFromMain:          false,
		MainRunDisabledReason:   reason,
		EffectiveEntrySectionID: stringPointer(*effectiveEntrySectionID),
	}
}

func deriveEffectiveEntrySectionID(
	project projectstate.Project,
	singletons SingletonSections,
) *string {
	entryCodeBlockID := strings.TrimSpace(project.EntryCodeBlockID)
	if entryCodeBlockID != "" {
		return stringPointer(entryCodeBlockID)
	}
	if !project.HasPythonCodegenTarget() || singletons.GenPythonCode == nil {
		return nil
	}
	return stringPointer(*singletons.GenPythonCode)
}

func deriveParentSectionMap(project projectstate.Project) map[string]*string {
	parentSectionMap := make(map[string]*string, len(project.Sections))
	for _, sectionID := range sortedSectionIDs(project.Sections) {
		parentID := strings.TrimSpace(project.Sections[sectionID].ParentSectionID)
		parentSectionMap[sectionID] = stringPointerOrNil(parentID)
	}
	return parentSectionMap
}

func deriveShownParamIDs(project projectstate.Project) (map[string]ShownParamIDs, error) {
	output := make(map[string]ShownParamIDs)
	for _, sectionID := range sortedSectionIDs(project.Sections) {
		section := project.Sections[sectionID]
		for _, variantID := range section.VariantIDs {
			effectiveSection, err := effectiveSectionObject(project, sectionID, variantID)
			if err != nil {
				return nil, fmt.Errorf("project %q section %q variant %q: %w", project.ID, sectionID, variantID, err)
			}
			sectionType := stringField(effectiveSection, "type")
			if !isSectionWithParamsType(sectionType) {
				continue
			}
			shownParamIDs := emptyShownParamIDs()
			codeObjVariantMap := stringMapField(effectiveSection, "codeObjVariantMap")
			if len(codeObjVariantMap) == 0 {
				output[variantID] = shownParamIDs
				continue
			}
			topLevelParamIDs, ok, err := topLevelParamIDs(project, codeObjVariantMap, effectiveSection)
			if err != nil {
				return nil, fmt.Errorf("project %q section %q variant %q top-level params: %w", project.ID, sectionID, variantID, err)
			}
			if !ok || len(topLevelParamIDs) == 0 {
				output[variantID] = shownParamIDs
				continue
			}
			paramIDs, idToPath, childrenMap, err := traverseParamHierarchy(project, codeObjVariantMap, topLevelParamIDs)
			if err != nil {
				return nil, fmt.Errorf("project %q section %q variant %q param traversal: %w", project.ID, sectionID, variantID, err)
			}
			pinnedParams := stringSet(arrayStringField(effectiveSection, "pinnedParams"))
			output[variantID] = filterForUIDisplay(paramIDs, idToPath, childrenMap, pinnedParams)
		}
	}
	return output, nil
}

func emptyShownParamIDs() ShownParamIDs {
	return ShownParamIDs{
		Pinned: ShownParamIDDetails{
			RequiredParamIDsToPaths: map[string][]string{},
			TopLevelParamIDs:        []string{},
		},
		Unpinned: ShownParamIDDetails{
			RequiredParamIDsToPaths: map[string][]string{},
			TopLevelParamIDs:        []string{},
		},
	}
}

func isSectionWithParamsType(sectionType string) bool {
	switch sectionType {
	case "Callable", "Dict", "GlobalVariables":
		return true
	default:
		return false
	}
}

func deriveRequiredDecodedImages(project projectstate.Project) []string {
	output := map[string]struct{}{}
	for _, sectionID := range sortedSectionIDs(project.Sections) {
		section := project.Sections[sectionID]
		for _, variantID := range section.VariantIDs {
			effectiveSection, err := effectiveSectionObject(project, sectionID, variantID)
			if err != nil {
				continue
			}
			if stringField(effectiveSection, "type") != "Draw" {
				continue
			}
			for _, path := range collectDrawImagePaths(effectiveSection) {
				output[path] = struct{}{}
			}
		}
	}
	return sortedKeys(output)
}

func deriveGenCodeBinding(project projectstate.Project) *CodeFileBinding {
	if !project.HasPythonCodegenTarget() {
		return nil
	}
	if project.GeneratedCodeBinding != nil {
		return codeFileBindingFromProjectState(project.GeneratedCodeBinding)
	}
	singletons := deriveSingletonSections(project)
	if singletons.GenPythonCode == nil {
		return nil
	}
	sectionID := *singletons.GenPythonCode
	variantID, ok := project.SectionVariantMap[sectionID]
	if !ok {
		return nil
	}
	effectiveSection, err := effectiveSectionObject(project, sectionID, variantID)
	if err != nil {
		return nil
	}
	bindingObject, ok := objectField(effectiveSection, "codeFileBinding")
	if !ok {
		return nil
	}
	binding, err := decodeFrontendBinding(bindingObject)
	if err != nil {
		return nil
	}
	return binding
}
