package mcpx

import (
	"setta/internal/projectstate"
	"setta/internal/projectview"
)

type projectStateSummary = projectview.ProjectStateSummary
type projectStateSummarySection = projectview.ProjectStateItem

func buildProjectStateSummary(projectState projectview.SingleConfig, allowedSectionIDs map[string]struct{}) projectStateSummary {
	return projectview.BuildProjectStateSummary(projectState, allowedSectionIDs)
}

func cloneCodeFileBinding(value *projectview.CodeFileBinding) *projectview.CodeFileBinding {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneViewport(value *projectstate.Viewport) *projectstate.Viewport {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneProjectCodegenTargets(values []projectview.ProjectCodegenTarget) []projectview.ProjectCodegenTarget {
	if values == nil {
		return nil
	}
	cloned := make([]projectview.ProjectCodegenTarget, len(values))
	for index, value := range values {
		cloned[index] = append(projectview.ProjectCodegenTarget(nil), value...)
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
