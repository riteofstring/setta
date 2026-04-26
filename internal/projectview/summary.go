package projectview

import (
	"sort"

	"setta/internal/projectstate"
)

type ProjectStateSummary struct {
	ProjectConfig         ProjectConfig      `json:"projectConfig"`
	Sections              []ProjectStateItem `json:"sections"`
	SingletonSections     SingletonSections  `json:"singletonSections"`
	ParentSectionMap      map[string]*string `json:"parentSectionMap"`
	RequiredDecodedImages []string           `json:"requiredDecodedImages"`
	GenCodeBinding        *CodeFileBinding   `json:"genCodeBinding,omitempty"`
}

type ProjectStateItem struct {
	SectionID       string                              `json:"sectionId"`
	CoreName        string                              `json:"coreName"`
	VariantID       string                              `json:"variantId"`
	VariantName     string                              `json:"variantName"`
	ParentSectionID *string                             `json:"parentSectionId,omitempty"`
	ChildSectionIDs []string                            `json:"childSectionIds"`
	TopLevelLayout  *projectstate.TopLevelSectionLayout `json:"topLevelLayout,omitempty"`
}

func BuildProjectStateSummary(projectState SingleConfig, allowedSectionIDs map[string]struct{}) ProjectStateSummary {
	filteredProjectConfig := filterProjectConfigForSummary(projectState.ProjectConfig, allowedSectionIDs)
	filteredParentMap := filterParentSectionMap(projectState.ParentSectionMap, allowedSectionIDs)
	childSectionIDsByParent := buildChildSectionIDs(filteredParentMap)

	sectionIDs := sortedSummarySectionIDs(allowedSectionIDs, projectState.Sections)
	sections := make([]ProjectStateItem, 0, len(sectionIDs))
	for _, sectionID := range sectionIDs {
		core, ok := projectState.Sections[sectionID]
		if !ok {
			continue
		}
		variantID, ok := filteredProjectConfig.SectionVariantMap[sectionID]
		if !ok {
			continue
		}
		variant, ok := projectState.SectionVariants[variantID]
		if !ok {
			continue
		}

		var topLevelLayout *projectstate.TopLevelSectionLayout
		if layout, ok := filteredProjectConfig.TopLevelSections[sectionID]; ok {
			copied := layout.Clone()
			topLevelLayout = &copied
		}

		sections = append(sections, ProjectStateItem{
			SectionID:       sectionID,
			CoreName:        core.Name,
			VariantID:       variantID,
			VariantName:     variant.Name,
			ParentSectionID: cloneSummaryStringPointer(filteredParentMap[sectionID]),
			ChildSectionIDs: append([]string(nil), childSectionIDsByParent[sectionID]...),
			TopLevelLayout:  topLevelLayout,
		})
	}

	return ProjectStateSummary{
		ProjectConfig:         filteredProjectConfig,
		Sections:              sections,
		SingletonSections:     filterSingletonSections(projectState.SingletonSections, allowedSectionIDs),
		ParentSectionMap:      filteredParentMap,
		RequiredDecodedImages: filterRequiredDecodedImagesForSummary(projectState, allowedSectionIDs),
		GenCodeBinding:        cloneSummaryCodeFileBinding(projectState.GenCodeBinding),
	}
}

func sortedSummarySectionIDs(allowedSectionIDs map[string]struct{}, sections map[string]Core) []string {
	sectionIDs := make([]string, 0, len(allowedSectionIDs))
	for sectionID := range allowedSectionIDs {
		if _, ok := sections[sectionID]; !ok {
			continue
		}
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)
	return sectionIDs
}

func filterParentSectionMap(parentSectionMap map[string]*string, allowedSectionIDs map[string]struct{}) map[string]*string {
	filtered := make(map[string]*string, len(allowedSectionIDs))
	for sectionID := range allowedSectionIDs {
		parentID := parentSectionMap[sectionID]
		if parentID != nil {
			if _, ok := allowedSectionIDs[*parentID]; !ok {
				parentID = nil
			}
		}
		filtered[sectionID] = cloneSummaryStringPointer(parentID)
	}
	return filtered
}

func buildChildSectionIDs(parentSectionMap map[string]*string) map[string][]string {
	children := map[string][]string{}
	for sectionID, parentID := range parentSectionMap {
		if parentID == nil {
			continue
		}
		children[*parentID] = append(children[*parentID], sectionID)
	}
	for parentID := range children {
		sort.Strings(children[parentID])
	}
	return children
}

func filterProjectConfigForSummary(config ProjectConfig, allowedSectionIDs map[string]struct{}) ProjectConfig {
	filtered := cloneProjectConfig(config)
	filtered.SectionVariantMap = filterStringMapByAllowedKeys(filtered.SectionVariantMap, allowedSectionIDs)
	filtered.SectionPathSlugsByID = filterStringMapByAllowedKeys(filtered.SectionPathSlugsByID, allowedSectionIDs)
	filtered.SectionIDsByPathSlug = filterStringSliceMapByAllowedSet(filtered.SectionIDsByPathSlug, allowedSectionIDs)
	filtered.TopLevelSections = filterTopLevelSectionLayouts(filtered.TopLevelSections, allowedSectionIDs)
	filtered.WindowSpaces = filterWindowSpacesForSummary(filtered.WindowSpaces, allowedSectionIDs)
	allowedWindowSpaceIDs := stringSetFromWindowSpaceIDs(filtered.WindowSpaces)
	filtered.WindowSpaceSlugsByID = filterStringMapByAllowedKeys(filtered.WindowSpaceSlugsByID, allowedWindowSpaceIDs)
	filtered.WindowSpaceIDsBySlug = filterStringSliceMapByAllowedSet(filtered.WindowSpaceIDsBySlug, allowedWindowSpaceIDs)
	filtered.ActiveIDs = filterStringSliceByAllowedSet(filtered.ActiveIDs, allowedSectionIDs)
	filtered.Edges = filterEdges(filtered.Edges, allowedSectionIDs)
	filtered.AgenticEdges = filterAgenticEdges(filtered.AgenticEdges, allowedSectionIDs)
	if filtered.EntryCodeBlockID != nil {
		if _, ok := allowedSectionIDs[*filtered.EntryCodeBlockID]; !ok {
			filtered.EntryCodeBlockID = nil
		}
	}
	filtered.RunCapabilities = filterProjectRunCapabilitiesForSummary(filtered.RunCapabilities, allowedSectionIDs)
	for viewModeID, viewMode := range filtered.ViewModes {
		viewMode.TopLevelSections = filterTopLevelSectionLayouts(viewMode.TopLevelSections, allowedSectionIDs)
		viewMode.VisibilityBySectionID = filterBoolMapByAllowedKeys(viewMode.VisibilityBySectionID, allowedSectionIDs)
		filtered.ViewModes[viewModeID] = viewMode
	}
	return filtered
}

func filterSingletonSections(singleton SingletonSections, allowedSectionIDs map[string]struct{}) SingletonSections {
	return SingletonSections{
		GlobalVariables:   filterSingletonPointer(singleton.GlobalVariables, allowedSectionIDs),
		GenPythonCode:     filterSingletonPointer(singleton.GenPythonCode, allowedSectionIDs),
		GenPythonMetadata: filterSingletonPointer(singleton.GenPythonMetadata, allowedSectionIDs),
	}
}

func filterSingletonPointer(value *string, allowedSectionIDs map[string]struct{}) *string {
	if value == nil {
		return nil
	}
	if _, ok := allowedSectionIDs[*value]; !ok {
		return nil
	}
	return cloneSummaryStringPointer(value)
}

func cloneProjectConfig(config ProjectConfig) ProjectConfig {
	cloned := config
	cloned.RunCapabilities = cloneSummaryProjectRunCapabilities(config.RunCapabilities)
	cloned.Viewport = cloneSummaryViewport(config.Viewport)
	cloned.ViewModes = cloneSummaryViewModes(config.ViewModes)
	cloned.CodegenTargets = cloneSummaryProjectCodegenTargets(config.CodegenTargets)
	cloned.WatchCodeFolders = cloneSummaryWatchCodeFolders(config.WatchCodeFolders)
	cloned.WatchCodeFiles = append([]string(nil), config.WatchCodeFiles...)
	cloned.WatchCodeRegistry = cloneSummaryWatchCodeRegistry(config.WatchCodeRegistry)
	cloned.WatchCodeBaselineByPath = cloneSummaryStringSliceMap(config.WatchCodeBaselineByPath)
	cloned.EntryCodeBlockID = cloneSummaryStringPointer(config.EntryCodeBlockID)
	cloned.SectionPathSlugsByID = cloneSummaryStringMap(config.SectionPathSlugsByID)
	cloned.SectionIDsByPathSlug = cloneSummaryStringSliceMap(config.SectionIDsByPathSlug)
	cloned.TopLevelSections = cloneSummaryTopLevelSectionLayouts(config.TopLevelSections)
	cloned.WindowSpaceSlugsByID = cloneSummaryStringMap(config.WindowSpaceSlugsByID)
	cloned.WindowSpaceIDsBySlug = cloneSummaryStringSliceMap(config.WindowSpaceIDsBySlug)
	cloned.WindowSpaces = cloneSummaryWindowSpaces(config.WindowSpaces)
	cloned.SectionVariantMap = cloneSummaryStringMap(config.SectionVariantMap)
	cloned.ActiveIDs = append([]string(nil), config.ActiveIDs...)
	cloned.Edges = cloneSummaryEdges(config.Edges)
	cloned.AgenticEdges = cloneSummaryAgenticEdges(config.AgenticEdges)
	return cloned
}

func cloneSummaryViewport(value *projectstate.Viewport) *projectstate.Viewport {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneSummaryViewModes(values map[string]projectstate.ViewMode) map[string]projectstate.ViewMode {
	if values == nil {
		return map[string]projectstate.ViewMode{}
	}
	cloned := make(map[string]projectstate.ViewMode, len(values))
	for key, value := range values {
		cloned[key] = value.Clone()
	}
	return cloned
}

func cloneSummaryProjectCodegenTargets(values []ProjectCodegenTarget) []ProjectCodegenTarget {
	if values == nil {
		return nil
	}
	cloned := make([]ProjectCodegenTarget, len(values))
	for index, value := range values {
		cloned[index] = append(ProjectCodegenTarget(nil), value...)
	}
	return cloned
}

func cloneSummaryWatchCodeFolders(values []projectstate.WatchCodeFolder) []projectstate.WatchCodeFolder {
	if values == nil {
		return nil
	}
	cloned := make([]projectstate.WatchCodeFolder, len(values))
	copy(cloned, values)
	return cloned
}

func cloneSummaryWatchCodeRegistry(values map[string]projectstate.WatchCodeRegistryEntry) map[string]projectstate.WatchCodeRegistryEntry {
	if values == nil {
		return map[string]projectstate.WatchCodeRegistryEntry{}
	}
	cloned := make(map[string]projectstate.WatchCodeRegistryEntry, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func cloneSummaryStringSliceMap(values map[string][]string) map[string][]string {
	if values == nil {
		return map[string][]string{}
	}
	cloned := make(map[string][]string, len(values))
	for key, value := range values {
		cloned[key] = append([]string(nil), value...)
	}
	return cloned
}

func cloneSummaryStringMap(values map[string]string) map[string]string {
	if values == nil {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func cloneSummaryTopLevelSectionLayouts(values map[string]projectstate.TopLevelSectionLayout) map[string]projectstate.TopLevelSectionLayout {
	if values == nil {
		return map[string]projectstate.TopLevelSectionLayout{}
	}
	cloned := make(map[string]projectstate.TopLevelSectionLayout, len(values))
	for key, value := range values {
		cloned[key] = value.Clone()
	}
	return cloned
}

func cloneSummaryWindowSpaces(values map[string]projectstate.WindowSpaceConfig) map[string]projectstate.WindowSpaceConfig {
	if values == nil {
		return map[string]projectstate.WindowSpaceConfig{}
	}
	cloned := make(map[string]projectstate.WindowSpaceConfig, len(values))
	for key, value := range values {
		cloned[key] = value.Clone()
	}
	return cloned
}

func cloneSummaryEdges(values []projectstate.Edge) []projectstate.Edge {
	if values == nil {
		return nil
	}
	cloned := make([]projectstate.Edge, len(values))
	for index, value := range values {
		cloned[index] = value.Clone()
	}
	return cloned
}

func cloneSummaryAgenticEdges(values []projectstate.AgenticEdge) []projectstate.AgenticEdge {
	if values == nil {
		return nil
	}
	cloned := make([]projectstate.AgenticEdge, len(values))
	for index, value := range values {
		cloned[index] = value.Clone()
	}
	return cloned
}

func cloneSummaryStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneSummaryCodeFileBinding(value *CodeFileBinding) *CodeFileBinding {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneSummaryProjectRunCapabilities(value ProjectRunCapabilities) ProjectRunCapabilities {
	return ProjectRunCapabilities{
		CanRunFromMain:          value.CanRunFromMain,
		MainRunDisabledReason:   cloneSummaryStringPointer(value.MainRunDisabledReason),
		EffectiveEntrySectionID: cloneSummaryStringPointer(value.EffectiveEntrySectionID),
	}
}

func filterStringMapByAllowedKeys(values map[string]string, allowedSectionIDs map[string]struct{}) map[string]string {
	filtered := map[string]string{}
	for key, value := range values {
		if _, ok := allowedSectionIDs[key]; !ok {
			continue
		}
		filtered[key] = value
	}
	return filtered
}

func filterStringSliceMapByAllowedSet(values map[string][]string, allowedIDs map[string]struct{}) map[string][]string {
	filtered := map[string][]string{}
	for key, entries := range values {
		nextEntries := filterStringSliceByAllowedSet(entries, allowedIDs)
		if len(nextEntries) == 0 {
			continue
		}
		filtered[key] = nextEntries
	}
	return filtered
}

func filterTopLevelSectionLayouts(values map[string]projectstate.TopLevelSectionLayout, allowedSectionIDs map[string]struct{}) map[string]projectstate.TopLevelSectionLayout {
	filtered := map[string]projectstate.TopLevelSectionLayout{}
	for key, value := range values {
		if _, ok := allowedSectionIDs[key]; !ok {
			continue
		}
		filtered[key] = value.Clone()
	}
	return filtered
}

func filterWindowSpacesForSummary(values map[string]projectstate.WindowSpaceConfig, allowedSectionIDs map[string]struct{}) map[string]projectstate.WindowSpaceConfig {
	filtered := map[string]projectstate.WindowSpaceConfig{}
	for key, value := range values {
		cloned := value.Clone()
		nextWindows := make(map[string]projectstate.WindowSpaceWindow, len(cloned.WindowsByID))
		for windowID, window := range cloned.WindowsByID {
			if window.SurfaceKind == projectstate.WindowSpaceSurfaceKindSection {
				if window.SectionIDOrNull == nil {
					continue
				}
				if _, ok := allowedSectionIDs[*window.SectionIDOrNull]; !ok {
					continue
				}
			}
			nextWindows[windowID] = window
		}
		if len(nextWindows) == 0 {
			continue
		}
		cloned.WindowsByID = nextWindows
		cloned.Order = filterWindowOrderForSummary(cloned.Order, nextWindows)
		filtered[key] = cloned
	}
	return filtered
}

func stringSetFromWindowSpaceIDs(values map[string]projectstate.WindowSpaceConfig) map[string]struct{} {
	output := make(map[string]struct{}, len(values))
	for windowSpaceID := range values {
		output[windowSpaceID] = struct{}{}
	}
	return output
}

func filterWindowOrderForSummary(order []string, windowsByID map[string]projectstate.WindowSpaceWindow) []string {
	filtered := make([]string, 0, len(windowsByID))
	seen := make(map[string]struct{}, len(windowsByID))
	for _, windowID := range order {
		if _, ok := windowsByID[windowID]; !ok {
			continue
		}
		if _, ok := seen[windowID]; ok {
			continue
		}
		seen[windowID] = struct{}{}
		filtered = append(filtered, windowID)
	}
	extraWindowIDs := make([]string, 0, len(windowsByID)-len(filtered))
	for windowID := range windowsByID {
		if _, ok := seen[windowID]; ok {
			continue
		}
		extraWindowIDs = append(extraWindowIDs, windowID)
	}
	sort.Strings(extraWindowIDs)
	filtered = append(filtered, extraWindowIDs...)
	return filtered
}

func filterProjectRunCapabilitiesForSummary(value ProjectRunCapabilities, allowedSectionIDs map[string]struct{}) ProjectRunCapabilities {
	filtered := cloneSummaryProjectRunCapabilities(value)
	if filtered.EffectiveEntrySectionID == nil {
		return filtered
	}
	if _, ok := allowedSectionIDs[*filtered.EffectiveEntrySectionID]; ok {
		return filtered
	}
	filtered.CanRunFromMain = false
	filtered.MainRunDisabledReason = stringPointer(runDisabledReasonManualEntryRequired)
	filtered.EffectiveEntrySectionID = nil
	return filtered
}

func filterBoolMapByAllowedKeys(values map[string]bool, allowedSectionIDs map[string]struct{}) map[string]bool {
	filtered := map[string]bool{}
	for key, value := range values {
		if _, ok := allowedSectionIDs[key]; !ok {
			continue
		}
		filtered[key] = value
	}
	return filtered
}

func filterStringSliceByAllowedSet(values []string, allowedSectionIDs map[string]struct{}) []string {
	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := allowedSectionIDs[value]; !ok {
			continue
		}
		filtered = append(filtered, value)
	}
	return filtered
}

func filterEdges(values []projectstate.Edge, allowedSectionIDs map[string]struct{}) []projectstate.Edge {
	filtered := make([]projectstate.Edge, 0, len(values))
	for _, value := range values {
		if _, ok := allowedSectionIDs[value.SourceSectionID]; !ok {
			continue
		}
		if _, ok := allowedSectionIDs[value.TargetSectionID]; !ok {
			continue
		}
		filtered = append(filtered, value.Clone())
	}
	return filtered
}

func filterAgenticEdges(values []projectstate.AgenticEdge, allowedSectionIDs map[string]struct{}) []projectstate.AgenticEdge {
	filtered := make([]projectstate.AgenticEdge, 0, len(values))
	for _, value := range values {
		if _, ok := allowedSectionIDs[value.SourceSectionID]; !ok {
			continue
		}
		if _, ok := allowedSectionIDs[value.TargetSectionID]; !ok {
			continue
		}
		filtered = append(filtered, value.Clone())
	}
	return filtered
}

func filterRequiredDecodedImagesForSummary(projectState SingleConfig, allowedSectionIDs map[string]struct{}) []string {
	if len(projectState.RequiredDecodedImages) == 0 {
		return nil
	}
	return filterStringSliceByAllowedSet(
		projectState.RequiredDecodedImages,
		allowedDecodedImagePathsForSummary(projectState, allowedSectionIDs),
	)
}

func allowedDecodedImagePathsForSummary(projectState SingleConfig, allowedSectionIDs map[string]struct{}) map[string]struct{} {
	allowedPaths := map[string]struct{}{}
	for sectionID := range allowedSectionIDs {
		for _, path := range summarySectionDrawImagePaths(projectState, sectionID) {
			allowedPaths[path] = struct{}{}
		}
	}
	return allowedPaths
}

func summarySectionDrawImagePaths(projectState SingleConfig, sectionID string) []string {
	effectiveSection, ok := summaryEffectiveSectionObject(projectState, sectionID)
	if !ok || stringField(effectiveSection, "type") != "Draw" {
		return nil
	}
	return collectDrawImagePaths(effectiveSection)
}

func summaryEffectiveSectionObject(projectState SingleConfig, sectionID string) (map[string]any, bool) {
	section, variant, ok := summarySectionAndVariant(projectState, sectionID)
	if !ok {
		return nil, false
	}
	basePayload, ok := projectState.SectionImpls[variant.Impl]
	if !ok {
		return nil, false
	}
	base, err := rawObjectFromPayload(basePayload)
	if err != nil {
		return nil, false
	}
	sharedModifier, err := rawObjectFromModifier(section.SharedModifier)
	if err != nil {
		return nil, false
	}
	modifier, err := rawObjectFromModifier(variant.Modifier)
	if err != nil {
		return nil, false
	}
	return mergeObjects(mergeObjects(base, sharedModifier), modifier), true
}

func summarySectionAndVariant(projectState SingleConfig, sectionID string) (Core, Variant, bool) {
	variantID, ok := projectState.ProjectConfig.SectionVariantMap[sectionID]
	if !ok {
		return Core{}, Variant{}, false
	}
	section, ok := projectState.Sections[sectionID]
	if !ok {
		return Core{}, Variant{}, false
	}
	variant, ok := projectState.SectionVariants[variantID]
	if !ok {
		return Core{}, Variant{}, false
	}
	return section, variant, true
}
