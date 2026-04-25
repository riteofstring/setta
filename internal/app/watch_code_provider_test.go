package app

import (
	"encoding/json"

	"setta/internal/projectstate"
)

const testAppWatchCodeProviderPluginID = "setta-fixture-backend"

func setAppWatchCodePluginProjectData(
	t appTestHelper,
	document *projectstate.Document,
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
	if raw := document.PluginData[testAppWatchCodeProviderPluginID]; len(raw) > 0 {
		if err := json.Unmarshal(raw, &data); err != nil {
			t.Fatalf("decode app watch code plugin data: %v", err)
		}
		if data.Projects == nil {
			data.Projects = map[string]projectstate.WatchCodePluginProjectData{}
		}
	}
	data.Projects[projectID] = projectData.Normalized()
	raw, err := json.Marshal(data.Normalized())
	if err != nil {
		t.Fatalf("marshal app watch code plugin data: %v", err)
	}
	document.PluginData[testAppWatchCodeProviderPluginID] = projectstate.RawJSON(raw)
}

func readAppWatchCodePluginProjectData(
	t appTestHelper,
	document projectstate.Document,
	projectID string,
) projectstate.WatchCodePluginProjectData {
	t.Helper()
	projectData, _, err := document.WatchCodePluginProjectData(testAppWatchCodeProviderPluginID, projectID)
	if err != nil {
		t.Fatalf("read app watch code plugin data: %v", err)
	}
	return projectData
}

type appTestHelper interface {
	Helper()
	Fatalf(string, ...any)
}
