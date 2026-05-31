package chat

import "setta/internal/codexapp"

var supportedCodexClientMethods = map[string]struct{}{
	codexapp.CodexMethodConfigRead:           {},
	codexapp.CodexMethodInitialize:           {},
	codexapp.CodexMethodModelList:            {},
	codexapp.CodexMethodThreadGoalClear:      {},
	codexapp.CodexMethodThreadGoalGet:        {},
	codexapp.CodexMethodThreadGoalSet:        {},
	codexapp.CodexMethodThreadResume:         {},
	codexapp.CodexMethodThreadSettingsUpdate: {},
	codexapp.CodexMethodThreadStart:          {},
	codexapp.CodexMethodTurnInterrupt:        {},
	codexapp.CodexMethodTurnStart:            {},
	codexapp.CodexMethodTurnSteer:            {},
}

var codexAppServerNotifications = codexapp.CodexNotificationValues
var codexAppServerRequests = codexapp.CodexServerRequestValues
