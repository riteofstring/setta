package app

import "setta/internal/projectstate"

const testAppWatchCodeProviderPluginID = "setta-fixture-backend"

func storeAppWatchCodePluginData(t appTestHelper, document *projectstate.Document) {
	t.Helper()
	if err := document.StoreWatchCodePluginDataFromProjects(testAppWatchCodeProviderPluginID); err != nil {
		t.Fatalf("store app watch code plugin data: %v", err)
	}
}

type appTestHelper interface {
	Helper()
	Fatalf(string, ...any)
}
