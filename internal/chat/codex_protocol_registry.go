package chat

import "setta/internal/codexapp"

var supportedCodexClientMethods = protocolValueSet(codexapp.CodexSupportedMethodValues)
var unsupportedCodexAppServerNotifications = protocolValueSet(codexapp.CodexUnsupportedNotificationValues)

var codexAppServerNotifications = codexapp.CodexSupportedNotificationValues
var codexAppServerRequests = codexapp.CodexSupportedServerRequestValues

func protocolValueSet(values []string) map[string]struct{} {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		set[value] = struct{}{}
	}
	return set
}
