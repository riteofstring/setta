package projectstate

const testWatchCodeProviderPluginID = "setta-watch-code-test-provider"

func mustLoadTestWatchCodePluginData(t testHelper, document *Document) {
	t.Helper()
	if err := document.LoadWatchCodePluginDataIntoProjects(testWatchCodeProviderPluginID); err != nil {
		t.Fatalf("load watch code plugin data: %v", err)
	}
}

func mustStoreTestWatchCodePluginData(t testHelper, document *Document) {
	t.Helper()
	if err := document.StoreWatchCodePluginDataFromProjects(testWatchCodeProviderPluginID); err != nil {
		t.Fatalf("store watch code plugin data: %v", err)
	}
}

type testHelper interface {
	Helper()
	Fatalf(string, ...any)
}
