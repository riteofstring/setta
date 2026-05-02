package projectstate

const testWatchCodeProviderPluginID = "setta-watch-code-test-provider"

func mustLoadTestWatchCodePluginData(t testHelper, document *Document) {
	t.Helper()
	if _, _, err := document.WatchCodePluginProjectData(testWatchCodeProviderPluginID, ""); err != nil {
		t.Fatalf("load watch code plugin data: %v", err)
	}
}

func mustSetTestWatchCodePluginProjectData(
	t testHelper,
	document *Document,
	projectID string,
	projectData WatchCodePluginProjectData,
) {
	t.Helper()
	data, existed, err := document.decodeWatchCodePluginData(testWatchCodeProviderPluginID)
	if err != nil {
		t.Fatalf("decode watch code plugin data: %v", err)
	}
	data = data.withProjectData(projectID, projectData, true)
	if err := document.setWatchCodePluginData(testWatchCodeProviderPluginID, data, existed); err != nil {
		t.Fatalf("store watch code plugin data: %v", err)
	}
}

func mustReadTestWatchCodePluginProjectData(
	t testHelper,
	document Document,
	projectID string,
) WatchCodePluginProjectData {
	t.Helper()
	projectData, _, err := document.WatchCodePluginProjectData(testWatchCodeProviderPluginID, projectID)
	if err != nil {
		t.Fatalf("read watch code plugin data: %v", err)
	}
	return projectData
}

func mustStoreTestWatchCodePluginData(t testHelper, document *Document) {
	t.Helper()
	if err := document.setWatchCodePluginData(testWatchCodeProviderPluginID, WatchCodePluginData{
		SchemaVersion: WatchCodePluginDataSchemaVersion,
		Projects:      map[string]WatchCodePluginProjectData{},
	}, true); err != nil {
		t.Fatalf("store watch code plugin data: %v", err)
	}
}

type testHelper interface {
	Helper()
	Fatalf(string, ...any)
}
