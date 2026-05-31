package chat

import (
	"slices"
	"testing"

	"setta/internal/codexapp"
)

func TestCodexHarnessProtocolCoverageRegistry(t *testing.T) {
	for _, method := range []string{
		codexapp.CodexMethodConfigRead,
		codexapp.CodexMethodInitialize,
		codexapp.CodexMethodMcpServerStatusList,
		codexapp.CodexMethodModelList,
		codexapp.CodexMethodSkillsList,
		codexapp.CodexMethodThreadGoalClear,
		codexapp.CodexMethodThreadGoalGet,
		codexapp.CodexMethodThreadGoalSet,
		codexapp.CodexMethodThreadResume,
		codexapp.CodexMethodThreadSettingsUpdate,
		codexapp.CodexMethodThreadStart,
		codexapp.CodexMethodTurnInterrupt,
		codexapp.CodexMethodTurnStart,
		codexapp.CodexMethodTurnSteer,
	} {
		if _, ok := supportedCodexClientMethods[method]; !ok {
			t.Fatalf("client method %s missing support policy", method)
		}
	}
	for _, method := range codexAppServerNotifications {
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
}
