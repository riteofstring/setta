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
	var data projectstate.WatchCodePluginData
	if err := json.Unmarshal(payload, &data); err != nil {
		t.Fatalf("decode watch code plugin data: %v", err)
	}
	projectData, ok := data.Projects[projectID]
	if !ok {
		t.Fatalf("expected watch code data for project %q, got %#v", projectID, data.Projects)
	}
	return projectData.Normalized()
}
