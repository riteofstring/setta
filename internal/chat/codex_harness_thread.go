package chat

import (
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
	messageThreadID, err := codexThreadLifecycleThreadID(message)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, messageThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_lifecycle", message.Method)
}

func codexThreadLifecycleThreadID(message jsonRPCMessage) (string, error) {
	switch message.Method {
	case codexapp.CodexNotificationThreadArchived:
		params, err := codexapp.DecodeThreadArchivedNotification(message.Params)
		if err != nil {
			return "", err
		}
		return params.ThreadID, nil
	case codexapp.CodexNotificationThreadClosed:
		params, err := codexapp.DecodeThreadClosedNotification(message.Params)
		if err != nil {
			return "", err
		}
		return params.ThreadID, nil
	case codexapp.CodexNotificationThreadUnarchived:
		params, err := codexapp.DecodeThreadUnarchivedNotification(message.Params)
		if err != nil {
			return "", err
		}
		return params.ThreadID, nil
	default:
		return "", fmt.Errorf("unsupported codex thread lifecycle notification: %s", message.Method)
	}
}

func handleCodexThreadGoalCleared(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := codexapp.DecodeThreadGoalClearedNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, params.ThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	if err := sink.GoalUpdated(nil); err != nil {
		return codexNotificationResult{}, err
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_goal_cleared", params.ThreadID)
}

func handleCodexThreadGoalUpdated(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := codexapp.DecodeThreadGoalUpdatedNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
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
	params, err := codexapp.DecodeThreadNameUpdatedNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, params.ThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	name := ""
	if params.ThreadName != nil {
		name = *params.ThreadName
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_name_updated", name)
}

func handleCodexThreadSettingsUpdated(message jsonRPCMessage, threadID string, _ string, sink TurnSink) (codexNotificationResult, error) {
	params, err := codexapp.DecodeThreadSettingsUpdatedNotification(message.Params)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if err := requireCodexThreadIDMatch(message, threadID, params.ThreadID, sink); err != nil {
		return codexNotificationResult{}, err
	}
	settings, err := codexThreadSettingsFromNotification(params, threadID)
	if err != nil {
		return codexNotificationResult{}, err
	}
	effectiveSettings := chatCodexEffectiveSettingsFromCommandSettings(settings)
	if effectiveSettings != nil {
		if err := sink.CodexEffectiveSettingsUpdated(*effectiveSettings); err != nil {
			return codexNotificationResult{}, err
		}
	}
	return codexNotificationResult{}, sink.Trace("codex_thread_settings_updated", params.ThreadID)
}

func codexThreadSettingsFromNotification(params codexapp.ThreadSettingsUpdatedNotification, threadID string) (codexCommandThreadSettings, error) {
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
