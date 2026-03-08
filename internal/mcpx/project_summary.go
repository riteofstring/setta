package mcpx

import (
	"sort"

	"setta/internal/projectstate"
	"setta/internal/projectview"
)

type projectStateSummary struct {
	ProjectConfig     projectview.ProjectConfig     `json:"projectConfig"`
	Sections          []projectStateSummarySection  `json:"sections"`
	SingletonSections projectview.SingletonSections `json:"singletonSections"`
	ParentSectionMap  map[string]*string            `json:"parentSectionMap"`
	GenCodeBinding    *projectview.CodeFileBinding  `json:"genCodeBinding,omitempty"`
}

type projectStateSummarySection struct {
	SectionID       string                              `json:"sectionId"`
	CoreName        string                              `json:"coreName"`
	VariantID       string                              `json:"variantId"`
	VariantName     string                              `json:"variantName"`
	ParentSectionID *string                             `json:"parentSectionId,omitempty"`
	ChildSectionIDs []string                            `json:"childSectionIds"`
	TopLevelLayout  *projectstate.TopLevelSectionLayout `json:"topLevelLayout,omitempty"`
}

func buildProjectStateSummary(projectState projectview.SingleConfig, allowedSectionIDs map[string]struct{}) projectStateSummary {
	filteredProjectConfig := filterProjectConfigForSummary(projectState.ProjectConfig, allowedSectionIDs)
	filteredParentMap := filterParentSectionMap(projectState.ParentSectionMap, allowedSectionIDs)
	childSectionIDsByParent := buildChildSectionIDs(filteredParentMap)

	sectionIDs := sortedSectionIDs(allowedSectionIDs, projectState.Sections)
	sections := make([]projectStateSummarySection, 0, len(sectionIDs))
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

		sections = append(sections, projectStateSummarySection{
			SectionID:       sectionID,
			CoreName:        core.Name,
			VariantID:       variantID,
			VariantName:     variant.Name,
			ParentSectionID: cloneStringPointer(filteredParentMap[sectionID]),
			ChildSectionIDs: append([]string(nil), childSectionIDsByParent[sectionID]...),
			TopLevelLayout:  topLevelLayout,
		})
	}

	return projectStateSummary{
		ProjectConfig:     filteredProjectConfig,
		Sections:          sections,
		SingletonSections: filterSingletonSections(projectState.SingletonSections, allowedSectionIDs),
		ParentSectionMap:  filteredParentMap,
		GenCodeBinding:    cloneCodeFileBinding(projectState.GenCodeBinding),
	}
}

func sortedSectionIDs(allowedSectionIDs map[string]struct{}, sections map[string]projectview.Core) []string {
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
		filtered[sectionID] = cloneStringPointer(parentID)
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

func filterProjectConfigForSummary(config projectview.ProjectConfig, allowedSectionIDs map[string]struct{}) projectview.ProjectConfig {
	filtered := cloneProjectConfig(config)
	filtered.SectionVariantMap = filterStringMapByAllowedKeys(filtered.SectionVariantMap, allowedSectionIDs)
	filtered.TopLevelSections = filterTopLevelSectionLayouts(filtered.TopLevelSections, allowedSectionIDs)
	filtered.ActiveIDs = filterStringSliceByAllowedSet(filtered.ActiveIDs, allowedSectionIDs)
	filtered.Edges = filterEdges(filtered.Edges, allowedSectionIDs)
	filtered.AgenticEdges = filterAgenticEdges(filtered.AgenticEdges, allowedSectionIDs)
	if filtered.EntryCodeBlockID != nil {
		if _, ok := allowedSectionIDs[*filtered.EntryCodeBlockID]; !ok {
			filtered.EntryCodeBlockID = nil
		}
	}
	for viewModeID, viewMode := range filtered.ViewModes {
		viewMode.TopLevelSections = filterTopLevelSectionLayouts(viewMode.TopLevelSections, allowedSectionIDs)
		viewMode.VisibilityBySectionID = filterBoolMapByAllowedKeys(viewMode.VisibilityBySectionID, allowedSectionIDs)
		filtered.ViewModes[viewModeID] = viewMode
	}
	return filtered
}

func filterSingletonSections(singleton projectview.SingletonSections, allowedSectionIDs map[string]struct{}) projectview.SingletonSections {
	return projectview.SingletonSections{
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
	return cloneStringPointer(value)
}

func cloneProjectConfig(config projectview.ProjectConfig) projectview.ProjectConfig {
	cloned := config
	cloned.Viewport = cloneViewport(config.Viewport)
	cloned.ViewModes = cloneViewModes(config.ViewModes)
	cloned.CodegenTargets = cloneRawJSONList(config.CodegenTargets)
	cloned.WatchCodeFolders = cloneWatchCodeFolders(config.WatchCodeFolders)
	cloned.WatchCodeFiles = append([]string(nil), config.WatchCodeFiles...)
	cloned.WatchCodeRegistry = cloneWatchCodeRegistry(config.WatchCodeRegistry)
	cloned.WatchCodeBaselineByPath = cloneStringSliceMap(config.WatchCodeBaselineByPath)
	cloned.EntryCodeBlockID = cloneStringPointer(config.EntryCodeBlockID)
	cloned.TopLevelSections = cloneTopLevelSectionLayouts(config.TopLevelSections)
	cloned.SectionVariantMap = cloneSummaryStringMap(config.SectionVariantMap)
	cloned.ActiveIDs = append([]string(nil), config.ActiveIDs...)
	cloned.Edges = cloneEdges(config.Edges)
	cloned.AgenticEdges = cloneAgenticEdges(config.AgenticEdges)
	return cloned
}

func cloneViewport(value *projectstate.Viewport) *projectstate.Viewport {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneViewModes(values map[string]projectstate.ViewMode) map[string]projectstate.ViewMode {
	if values == nil {
		return map[string]projectstate.ViewMode{}
	}
	cloned := make(map[string]projectstate.ViewMode, len(values))
	for key, value := range values {
		cloned[key] = value.Clone()
	}
	return cloned
}

func cloneRawJSONList(values []projectstate.RawJSON) []projectstate.RawJSON {
	if values == nil {
		return nil
	}
	cloned := make([]projectstate.RawJSON, len(values))
	for index, value := range values {
		cloned[index] = append(projectstate.RawJSON(nil), value...)
	}
	return cloned
}

func cloneWatchCodeFolders(values []projectstate.WatchCodeFolder) []projectstate.WatchCodeFolder {
	if values == nil {
		return nil
	}
	cloned := make([]projectstate.WatchCodeFolder, len(values))
	copy(cloned, values)
	return cloned
}

func cloneWatchCodeRegistry(values map[string]projectstate.WatchCodeRegistryEntry) map[string]projectstate.WatchCodeRegistryEntry {
	if values == nil {
		return map[string]projectstate.WatchCodeRegistryEntry{}
	}
	cloned := make(map[string]projectstate.WatchCodeRegistryEntry, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func cloneStringSliceMap(values map[string][]string) map[string][]string {
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

func cloneTopLevelSectionLayouts(values map[string]projectstate.TopLevelSectionLayout) map[string]projectstate.TopLevelSectionLayout {
	if values == nil {
		return map[string]projectstate.TopLevelSectionLayout{}
	}
	cloned := make(map[string]projectstate.TopLevelSectionLayout, len(values))
	for key, value := range values {
		cloned[key] = value.Clone()
	}
	return cloned
}

func cloneEdges(values []projectstate.Edge) []projectstate.Edge {
	if values == nil {
		return nil
	}
	cloned := make([]projectstate.Edge, len(values))
	for index, value := range values {
		cloned[index] = value.Clone()
	}
	return cloned
}

func cloneAgenticEdges(values []projectstate.AgenticEdge) []projectstate.AgenticEdge {
	if values == nil {
		return nil
	}
	cloned := make([]projectstate.AgenticEdge, len(values))
	for index, value := range values {
		cloned[index] = value.Clone()
	}
	return cloned
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneCodeFileBinding(value *projectview.CodeFileBinding) *projectview.CodeFileBinding {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
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
