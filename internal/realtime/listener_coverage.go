package realtime

import (
	"fmt"
	"sort"
	"strings"
)

type ListenerCoverageDependency struct {
	Type      DependencyKeyType `json:"type"`
	SectionID string            `json:"sectionId"`
	CodeObjID string            `json:"codeObjId,omitempty"`
}

type ListenerCoverageSnapshot struct {
	ProjectID           string                       `json:"projectConfigId"`
	Dependencies        []ListenerCoverageDependency `json:"dependencies" ts_type:"Array<BaseDependencyKeyUnion>"`
	HasRealtimeWildcard bool                         `json:"hasRealtimeWildcard"`
}

func BuildListenerCoverageSnapshot(projectID string, registrations []ListenerRegistration) (ListenerCoverageSnapshot, error) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return ListenerCoverageSnapshot{}, ErrEmptyProjectID
	}

	dependencySet := make(map[string]struct{})
	hasRealtimeWildcard := false
	for _, registration := range registrations {
		for _, callback := range registration.Callbacks {
			if callback.DependencyMode == ListenerDependencyModeRefreshOnly {
				continue
			}
			if len(callback.Dependencies) == 0 {
				hasRealtimeWildcard = true
				continue
			}
			for _, dependency := range callback.Dependencies {
				trimmed := strings.TrimSpace(dependency)
				if trimmed == "" {
					continue
				}
				dependencySet[trimmed] = struct{}{}
			}
		}
	}

	canonicalKeys := make([]string, 0, len(dependencySet))
	for dependency := range dependencySet {
		canonicalKeys = append(canonicalKeys, dependency)
	}
	sort.Strings(canonicalKeys)

	dependencies := make([]ListenerCoverageDependency, 0, len(canonicalKeys))
	for _, dependency := range canonicalKeys {
		key, err := DecodeCanonicalDependencyKey(dependency)
		if err != nil {
			return ListenerCoverageSnapshot{}, fmt.Errorf("decode dependency key %q: %w", dependency, err)
		}
		dependencies = append(dependencies, ListenerCoverageDependency{
			Type:      key.Type,
			SectionID: key.SectionID,
			CodeObjID: key.CodeObjID,
		})
	}

	return ListenerCoverageSnapshot{
		ProjectID:           projectID,
		Dependencies:        dependencies,
		HasRealtimeWildcard: hasRealtimeWildcard,
	}, nil
}
