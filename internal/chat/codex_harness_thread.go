package chat

import (
	"encoding/json"
	"fmt"

	"setta/internal/codexapp"
)

var codexThreadGoalStatuses = map[string]struct{}{
	string(codexapp.ThreadGoalStatusActive):        {},
	string(codexapp.ThreadGoalStatusBlocked):       {},
	string(codexapp.ThreadGoalStatusBudgetLimited): {},
	string(codexapp.ThreadGoalStatusComplete):      {},
	string(codexapp.ThreadGoalStatusPaused):        {},
	string(codexapp.ThreadGoalStatusUsageLimited):  {},
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
	var params codexapp.ThreadGoalUpdatedNotification
	if err := json.Unmarshal(message.Params, &params); err != nil {
		return codexNotificationResult{}, fmt.Errorf("codex thread goal updated params must match protocol: %w", err)
	}
	if err := requireCodexThreadIDMatch(message, threadID, params.ThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	goal, err := goalStateFromCodex(params.Goal)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if goal.ThreadID != params.ThreadID {
		return codexNotificationResult{}, fmt.Errorf("codex thread goal updated goal thread mismatch: expected %s, got %s", params.ThreadID, goal.ThreadID)
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
	var params codexapp.ThreadSettingsUpdatedNotification
	if err := json.Unmarshal(message.Params, &params); err != nil {
		return codexCommandThreadSettings{}, fmt.Errorf("codex thread settings updated params must match protocol: %w", err)
	}
	if params.ThreadID != threadID {
		return codexCommandThreadSettings{}, fmt.Errorf("codex thread settings updated thread mismatch: expected %s, got %s", threadID, params.ThreadID)
	}
	if params.ThreadSettings.Model == "" {
		return codexCommandThreadSettings{}, fmt.Errorf("codex thread settings updated threadSettings.model is required")
	}
	effort := ReasoningEffort("")
	if params.ThreadSettings.Effort != nil {
		effort = ReasoningEffort(*params.ThreadSettings.Effort)
		if !validValue(effort, reasoningEffortValues) {
			return codexCommandThreadSettings{}, fmt.Errorf("codex thread settings updated threadSettings.effort has unsupported reasoning effort %s", effort)
		}
	}
	return codexCommandThreadSettings{
		Model:           params.ThreadSettings.Model,
		ReasoningEffort: effort,
	}, nil
}
