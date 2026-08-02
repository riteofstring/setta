package httpapi

import (
	"encoding/json"
	"testing"

	"setta/internal/projectstate"
)

func mustHTTPWatchCodeProjectData(
	t *testing.T,
	pluginData map[string]projectstate.RawJSON,
	providerPluginID string,
	projectID string,
) projectstate.WatchCodePluginProjectData {
	t.Helper()
	payload, ok := pluginData[providerPluginID]
	if !ok {
		t.Fatalf("expected project state to include %q plugin data, got %#v", providerPluginID, pluginData)
	}
	var projectData projectstate.WatchCodePluginProjectData
	if err := json.Unmarshal(payload, &projectData); err != nil {
		t.Fatalf("decode watch code project plugin data for %q: %v", projectID, err)
	}
	return projectData.Normalized()
}

func setHTTPWatchCodeProjectData(
	t *testing.T,
	document *projectstate.Document,
	providerPluginID string,
	projectID string,
	projectData projectstate.WatchCodePluginProjectData,
) {
	t.Helper()
	if document.PluginData == nil {
		document.PluginData = map[string]projectstate.RawJSON{}
	}
	data := projectstate.WatchCodePluginData{
		SchemaVersion: projectstate.WatchCodePluginDataSchemaVersion,
		Projects:      map[string]projectstate.WatchCodePluginProjectData{},
	}
	if raw := document.PluginData[providerPluginID]; len(raw) > 0 {
		if err := json.Unmarshal(raw, &data); err != nil {
			t.Fatalf("decode watch code plugin data: %v", err)
		}
		if data.Projects == nil {
			data.Projects = map[string]projectstate.WatchCodePluginProjectData{}
		}
	}
	data.Projects[projectID] = projectData.Normalized()
	raw, err := json.Marshal(data.Normalized())
	if err != nil {
		t.Fatalf("encode watch code plugin data: %v", err)
	}
	document.PluginData[providerPluginID] = projectstate.RawJSON(raw)
}

func readHTTPWatchCodeProjectData(
	t *testing.T,
	document projectstate.Document,
	providerPluginID string,
	projectID string,
) projectstate.WatchCodePluginProjectData {
	t.Helper()
	projectData, _, err := document.WatchCodePluginProjectData(providerPluginID, projectID)
	if err != nil {
		t.Fatalf("read watch code plugin data: %v", err)
	}
	return projectData
}
