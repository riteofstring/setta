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
