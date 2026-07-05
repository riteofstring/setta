package chat

import "fmt"

var codexMCPServerStartupStatuses = map[string]struct{}{
	"cancelled": {},
	"failed":    {},
	"ready":     {},
	"starting":  {},
}

func codexMCPServerStartupStatusTrace(message jsonRPCMessage) (string, error) {
	params, err := objectValue(message.Params, "codex mcp server startup status params")
	if err != nil {
		return "", err
	}
	name, err := requireString(params, "name", "codex mcp server startup status")
	if err != nil {
		return "", err
	}
	status, err := requireString(params, "status", "codex mcp server startup status")
	if err != nil {
		return "", err
	}
	if _, ok := codexMCPServerStartupStatuses[status]; !ok {
		return "", fmt.Errorf("unsupported codex mcp server startup status: %s", status)
	}
	errorMessage, err := optionalString(params, "error", "codex mcp server startup status")
	if err != nil {
		return "", err
	}
	traceMessage := name + " " + status
	if errorMessage != "" {
		traceMessage += ": " + errorMessage
	}
	return traceMessage, nil
}

func handleCodexMCPServerStartupStatusUpdated(message jsonRPCMessage, _ string, _ string, sink TurnSink) (codexNotificationResult, error) {
	traceMessage, err := codexMCPServerStartupStatusTrace(message)
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_mcp_server_startup_status_changed", traceMessage)
}
