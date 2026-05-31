package chat

import (
	"slices"
	"testing"
)

func TestCodexHarnessProtocolCoverageRegistry(t *testing.T) {
	for _, method := range []string{
		"config/read",
		"initialize",
		"model/list",
		"thread/goal/clear",
		"thread/goal/get",
		"thread/goal/set",
		"thread/resume",
		"thread/settings/update",
		"thread/start",
		"turn/interrupt",
		"turn/start",
		"turn/steer",
	} {
		if _, ok := supportedCodexClientMethods[method]; !ok {
			t.Fatalf("client method %s missing support policy", method)
		}
	}
	for _, method := range codexAppServer0135ServerRequests {
		if !isSupportedCodexServerRequest(method) {
			t.Fatalf("server request %s missing support policy", method)
		}
	}
	for _, method := range codexAppServer0135Notifications {
		if _, ok := codexNotificationHandlers[method]; !ok {
			t.Fatalf("notification %s missing handler", method)
		}
		if _, ok := codexNotificationScopePolicies[method]; !ok {
			t.Fatalf("notification %s missing scope policy", method)
		}
	}
	for method := range supportedCodexServerRequests {
		if !slices.Contains(codexAppServer0135ServerRequests, method) {
			t.Fatalf("server request %s is not in the codex 0.135.0 baseline", method)
		}
	}
	for method := range codexNotificationHandlers {
		if !slices.Contains(codexAppServer0135Notifications, method) {
			t.Fatalf("notification handler %s is not in the codex 0.135.0 baseline", method)
		}
	}
}
