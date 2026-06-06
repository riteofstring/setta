package chat

import (
	"slices"
	"testing"

	"setta/internal/codexapp"
)

func TestCodexHarnessProtocolCoverageRegistry(t *testing.T) {
	for _, method := range codexapp.CodexSupportedMethodValues {
		if _, ok := supportedCodexClientMethods[method]; !ok {
			t.Fatalf("client method %s missing support policy", method)
		}
	}
	for _, method := range codexAppServerNotifications {
		if _, unsupported := unsupportedCodexAppServerNotifications[method]; unsupported {
			continue
		}
		if _, ok := codexNotificationHandlers[method]; !ok {
			t.Fatalf("notification %s missing handler", method)
		}
		if _, ok := codexNotificationScopePolicies[method]; !ok {
			t.Fatalf("notification %s missing scope policy", method)
		}
	}
	for method := range supportedCodexServerRequests {
		if !slices.Contains(codexAppServerRequests, method) {
			t.Fatalf("server request %s is not generated from the codex protocol", method)
		}
	}
	for method := range codexNotificationHandlers {
		if !slices.Contains(codexAppServerNotifications, method) {
			t.Fatalf("notification handler %s is not generated from the codex protocol", method)
		}
	}
	for method := range unsupportedCodexAppServerNotifications {
		if !slices.Contains(codexapp.CodexUnsupportedNotificationValues, method) {
			t.Fatalf("unsupported notification %s is not registered as unsupported", method)
		}
		if slices.Contains(codexAppServerNotifications, method) {
			t.Fatalf("unsupported notification %s is registered as supported", method)
		}
		if _, ok := codexNotificationHandlers[method]; ok {
			t.Fatalf("unsupported notification %s has a handler", method)
		}
		if _, ok := codexNotificationScopePolicies[method]; ok {
			t.Fatalf("unsupported notification %s has a scope policy", method)
		}
	}
}
