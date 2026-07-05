package chat

func handleFakeAppServerStatusMode(mode string) (bool, bool) {
	switch mode {
	case "remote-control-status":
		writeFakeRemoteControlStatus("disabled")
		writeFakeStreamTurn()
		return true, true
	case "malformed-remote-control-status":
		writeFakeNotification("remoteControl/status/changed", map[string]any{
			"environmentId":  nil,
			"installationId": "installation_fake",
			"serverName":     "fake.local",
			"status":         7,
		})
		return true, true
	case "mcp-server-startup-status":
		writeFakeMCPServerStartupStatus("codex_apps", "starting", nil)
		writeFakeStreamTurn()
		return true, true
	case "unknown-mcp-server-startup-status":
		writeFakeMCPServerStartupStatus("codex_apps", "waking", nil)
		return true, true
	case "reasoning-summary-array":
		writeFakeReasoningSummaryArrayItem()
		writeFakeStreamTurn()
		return true, true
	case "empty-agent-message-item-text":
		writeFakeEmptyAgentMessageItem()
		writeFakeStreamTurn()
		return true, true
	case "account-rate-limits":
		writeFakeAccountRateLimits()
		writeFakeStreamTurn()
		return true, true
	case "thread-goal-cleared":
		writeFakeThreadGoalCleared()
		writeFakeStreamTurn()
		return true, true
	default:
		return false, false
	}
}
