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
	if err := sink.GoalUpdated(nil); err != nil {
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
	rawGoal, err := requireObject(params, "goal", "codex thread goal updated")
	if err != nil {
		return codexNotificationResult{}, err
	}
	goal, err := goalStateFromObject(rawGoal, "codex thread goal updated goal")
	if err != nil {
		return codexNotificationResult{}, err
	}
	if goal.ThreadID != messageThreadID {
		return codexNotificationResult{}, fmt.Errorf("codex thread goal updated goal thread mismatch: expected %s, got %s", messageThreadID, goal.ThreadID)
	}
	if err := sink.GoalUpdated(goal); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_goal_updated", goal.Status)
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
	if _, err := codexThreadSettingsFromNotification(message, threadID); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_settings_updated", messageThreadID)
}

func codexThreadSettingsFromNotification(message jsonRPCMessage, threadID string) (codexCommandThreadSettings, error) {
	params, err := objectValue(message.Params, "codex thread settings updated params")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	messageThreadID, err := requireString(params, "threadId", "codex thread settings updated")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	if messageThreadID != threadID {
		return codexCommandThreadSettings{}, fmt.Errorf("codex thread settings updated thread mismatch: expected %s, got %s", threadID, messageThreadID)
	}
	settings, err := requireObject(params, "threadSettings", "codex thread settings updated")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	model, err := requireString(settings, "model", "codex thread settings updated threadSettings")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	effort, err := optionalReasoningEffort(settings, "effort", "codex thread settings updated threadSettings")
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	return codexCommandThreadSettings{
		Model:           model,
		ReasoningEffort: effort,
	}, nil
}
