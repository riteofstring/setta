package projectstate

import (
	"encoding/json"
	"fmt"
	"strings"
)

func (d *Document) copyProjectScopedPluginData(sourceProjectID string, targetProjectID string) error {
	if d == nil || len(d.PluginData) == 0 {
		return nil
	}
	sourceID := strings.TrimSpace(sourceProjectID)
	targetID := strings.TrimSpace(targetProjectID)
	if sourceID == "" || targetID == "" {
		return ErrProjectIDRequired
	}

	updatedPluginData := cloneDocumentPluginData(d.PluginData)
	for pluginID, payload := range d.PluginData {
		updatedPayload, changed, err := copyProjectScopedPluginPayload(pluginID, payload, sourceID, targetID)
		if err != nil {
			return err
		}
		if changed {
			updatedPluginData[pluginID] = updatedPayload
		}
	}
	d.PluginData = updatedPluginData
	return nil
}

func (d *Document) deleteProjectScopedPluginData(projectIDs []string) error {
	if d == nil || len(d.PluginData) == 0 || len(projectIDs) == 0 {
		return nil
	}
	removed := make(map[string]struct{}, len(projectIDs))
	for _, projectID := range projectIDs {
		trimmedProjectID := strings.TrimSpace(projectID)
		if trimmedProjectID == "" {
			return ErrProjectIDRequired
		}
		removed[trimmedProjectID] = struct{}{}
	}

	updatedPluginData := cloneDocumentPluginData(d.PluginData)
	for pluginID, payload := range d.PluginData {
		updatedPayload, changed, err := deleteProjectScopedPluginPayload(pluginID, payload, removed)
		if err != nil {
			return err
		}
		if changed {
			updatedPluginData[pluginID] = updatedPayload
		}
	}
	d.PluginData = updatedPluginData
	return nil
}

func cloneDocumentPluginData(pluginData map[string]RawJSON) map[string]RawJSON {
	cloned := make(map[string]RawJSON, len(pluginData))
	for pluginID, payload := range pluginData {
		cloned[pluginID] = cloneRawJSON(payload)
	}
	return cloned
}

func copyProjectScopedPluginPayload(pluginID string, payload RawJSON, sourceProjectID string, targetProjectID string) (RawJSON, bool, error) {
	return rewriteProjectScopedPluginPayload(pluginID, payload, func(projects map[string]RawJSON) bool {
		sourcePayload, ok := projects[sourceProjectID]
		if !ok {
			return false
		}
		projects[targetProjectID] = cloneRawJSON(sourcePayload)
		return true
	})
}

func deleteProjectScopedPluginPayload(pluginID string, payload RawJSON, removedProjectIDs map[string]struct{}) (RawJSON, bool, error) {
	return rewriteProjectScopedPluginPayload(pluginID, payload, func(projects map[string]RawJSON) bool {
		changed := false
		for projectID := range removedProjectIDs {
			if _, exists := projects[projectID]; exists {
				delete(projects, projectID)
				changed = true
			}
		}
		return changed
	})
}

func rewriteProjectScopedPluginPayload(
	pluginID string,
	payload RawJSON,
	update func(projects map[string]RawJSON) bool,
) (RawJSON, bool, error) {
	fields, ok, err := decodeProjectScopedPluginPayload(pluginID, payload)
	if err != nil || !ok {
		return nil, false, err
	}
	projects, ok, err := decodeProjectScopedPluginPayloadProjects(pluginID, fields)
	if err != nil || !ok {
		return nil, false, err
	}
	if update == nil || !update(projects) {
		return nil, false, nil
	}
	fields["projects"], err = marshalProjectScopedPluginRawObject(
		projects,
		fmt.Sprintf("pluginData.%s.projects", pluginID),
	)
	if err != nil {
		return nil, false, err
	}
	updatedPayload, err := marshalProjectScopedPluginRawObject(fields, "pluginData."+pluginID)
	return updatedPayload, true, err
}

func decodeProjectScopedPluginPayload(pluginID string, payload RawJSON) (map[string]RawJSON, bool, error) {
	normalized, err := normalizeRawJSONObject(payload, "pluginData."+pluginID)
	if err != nil {
		return nil, false, err
	}
	if len(normalized) == 0 {
		return nil, false, nil
	}
	var fields map[string]RawJSON
	if err := json.Unmarshal(normalized, &fields); err != nil {
		return nil, false, fmt.Errorf("decode pluginData.%s: %w", pluginID, err)
	}
	return fields, true, nil
}

func decodeProjectScopedPluginPayloadProjects(pluginID string, fields map[string]RawJSON) (map[string]RawJSON, bool, error) {
	projectsPayload, ok := fields["projects"]
	if !ok || len(projectsPayload) == 0 {
		return nil, false, nil
	}
	normalized, err := normalizeRawJSONObject(projectsPayload, "pluginData."+pluginID+".projects")
	if err != nil {
		return nil, false, err
	}
	var projects map[string]RawJSON
	if err := json.Unmarshal(normalized, &projects); err != nil {
		return nil, false, fmt.Errorf("decode pluginData.%s.projects: %w", pluginID, err)
	}
	return projects, true, nil
}

func marshalProjectScopedPluginRawObject(fields map[string]RawJSON, field string) (RawJSON, error) {
	encoded, err := json.Marshal(fields)
	if err != nil {
		return nil, fmt.Errorf("encode %s: %w", field, err)
	}
	return normalizeRawJSONObject(encoded, field)
}
