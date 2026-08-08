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

func ProjectScopedPluginDataForProject(pluginData map[string]RawJSON, projectID string) (map[string]RawJSON, error) {
	trimmedProjectID := strings.TrimSpace(projectID)
	if trimmedProjectID == "" {
		return nil, ErrProjectIDRequired
	}

	result := map[string]RawJSON{}
	for pluginID, payload := range pluginData {
		fields, ok, err := decodeProjectScopedPluginPayload(pluginID, payload)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		projects, ok, err := decodeProjectScopedPluginPayloadProjects(pluginID, fields)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		projectPayload, ok := projects[trimmedProjectID]
		if !ok {
			continue
		}
		result[pluginID] = cloneRawJSON(projectPayload)
	}
	return result, nil
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
	normalized, err := normalizeRawJSON(payload, "pluginData."+pluginID)
	if err != nil {
		return nil, false, err
	}
	if len(normalized) == 0 {
		return nil, false, nil
	}
	if !rawJSONIsObject(normalized) {
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
	if !ok {
		return nil, false, nil
	}
	field := "pluginData." + pluginID + ".projects"
	normalized, err := normalizeRawJSON(projectsPayload, field)
	if err != nil {
		return nil, false, err
	}
	if len(normalized) == 0 || !rawJSONIsObject(normalized) {
		return nil, false, fmt.Errorf("%s must be a JSON object", field)
	}
	var projects map[string]RawJSON
	if err := json.Unmarshal(normalized, &projects); err != nil {
		return nil, false, fmt.Errorf("decode pluginData.%s.projects: %w", pluginID, err)
	}
	if projects == nil {
		return nil, false, fmt.Errorf("%s must be a JSON object", field)
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

func rawJSONIsObject(raw RawJSON) bool {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return false
	}
	if _, ok := value.(map[string]any); !ok {
		return false
	}
	return true
}
