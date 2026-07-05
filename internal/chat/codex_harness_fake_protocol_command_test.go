package chat

func writeFakeProtocolCoverageCommandExecution() {
	writeFakeNotification("item/started", map[string]any{
		"startedAtMs": 1,
		"threadId":    "thread_fake",
		"turnId":      "turn_fake",
		"item": map[string]any{
			"command":        "printf protocol command",
			"commandActions": []any{},
			"cwd":            "/tmp/workspace",
			"id":             "command_item_fake",
			"processId":      "scoped_process_fake",
			"status":         "inProgress",
			"type":           "commandExecution",
		},
	})
	writeFakeNotification("item/commandExecution/outputDelta", map[string]any{
		"delta":    "scoped command output\n",
		"itemId":   "command_item_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/completed", map[string]any{
		"completedAtMs": 2,
		"threadId":      "thread_fake",
		"turnId":        "turn_fake",
		"item": map[string]any{
			"command":        "printf protocol command",
			"commandActions": []any{},
			"cwd":            "/tmp/workspace",
			"durationMs":     1,
			"exitCode":       0,
			"id":             "command_item_fake",
			"processId":      "scoped_process_fake",
			"status":         "completed",
			"type":           "commandExecution",
		},
	})
}
