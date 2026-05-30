package chat

import "fmt"

var codexThreadGoalStatuses = map[string]struct{}{
	"active":        {},
	"blocked":       {},
	"budgetLimited": {},
	"complete":      {},
	"paused":        {},
	"usageLimited":  {},
}

func handleCodexThreadLifecycle(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex thread lifecycle params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	messageThreadID, err := requireString(params, "threadId", "codex thread lifecycle")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, messageThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_lifecycle", message.Method)
}

func handleCodexThreadGoalCleared(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex thread goal cleared params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	messageThreadID, err := requireString(params, "threadId", "codex thread goal cleared")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, messageThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_goal_cleared", messageThreadID)
}

func handleCodexThreadGoalUpdated(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex thread goal updated params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	messageThreadID, err := requireString(params, "threadId", "codex thread goal updated")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, messageThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	goal, err := requireObject(params, "goal", "codex thread goal updated")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if _, err := requireString(goal, "threadId", "codex thread goal updated goal"); err != nil {
		return codexNotificationResult{}, err
	}
	if _, err := requireStringAllowEmpty(goal, "objective", "codex thread goal updated goal"); err != nil {
		return codexNotificationResult{}, err
	}
	status, err := requireString(goal, "status", "codex thread goal updated goal")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if _, ok := codexThreadGoalStatuses[status]; !ok {
		return codexNotificationResult{}, fmt.Errorf("unsupported codex thread goal status: %s", status)
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_goal_updated", status)
}

func handleCodexThreadNameUpdated(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex thread name updated params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	messageThreadID, err := requireString(params, "threadId", "codex thread name updated")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, messageThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	name, err := optionalString(params, "threadName", "codex thread name updated")
	if err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_name_updated", name)
}

func handleCodexThreadSettingsUpdated(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := objectValue(message.Params, "codex thread settings updated params")
	if err != nil {
		return codexNotificationResult{}, err
	}
	messageThreadID, err := requireString(params, "threadId", "codex thread settings updated")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, messageThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	if _, err := requireObject(params, "threadSettings", "codex thread settings updated"); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_settings_updated", messageThreadID)
}
