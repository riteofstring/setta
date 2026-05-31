package chat

import "fmt"

type codexNotificationScopePolicy string

const (
	codexNotificationScopeGlobal     codexNotificationScopePolicy = "global"
	codexNotificationScopeThread     codexNotificationScopePolicy = "thread"
	codexNotificationScopeTurnState  codexNotificationScopePolicy = "turn_state"
	codexNotificationScopeTurnIgnore codexNotificationScopePolicy = "turn_ignore"
)

var codexNotificationScopePolicies = map[string]codexNotificationScopePolicy{
	"account/rateLimits/updated":                codexNotificationScopeGlobal,
	"account/updated":                           codexNotificationScopeGlobal,
	"configWarning":                             codexNotificationScopeGlobal,
	"error":                                     codexNotificationScopeTurnState,
	"item/agentMessage/delta":                   codexNotificationScopeTurnState,
	"item/commandExecution/outputDelta":         codexNotificationScopeTurnState,
	"item/commandExecution/terminalInteraction": codexNotificationScopeTurnState,
	"item/completed":                            codexNotificationScopeTurnState,
	"item/fileChange/patchUpdated":              codexNotificationScopeTurnState,
	"item/mcpToolCall/progress":                 codexNotificationScopeTurnState,
	"item/plan/delta":                           codexNotificationScopeTurnState,
	"item/reasoning/summaryPartAdded":           codexNotificationScopeTurnState,
	"item/reasoning/summaryTextDelta":           codexNotificationScopeTurnState,
	"item/started":                              codexNotificationScopeTurnState,
	"mcpServer/startupStatus/updated":           codexNotificationScopeGlobal,
	"model/rerouted":                            codexNotificationScopeTurnState,
	"rawResponseItem/completed":                 codexNotificationScopeTurnIgnore,
	"remoteControl/status/changed":              codexNotificationScopeGlobal,
	"thread/archived":                           codexNotificationScopeThread,
	"thread/closed":                             codexNotificationScopeThread,
	"thread/compacted":                          codexNotificationScopeThread,
	"thread/goal/cleared":                       codexNotificationScopeThread,
	"thread/goal/updated":                       codexNotificationScopeThread,
	"thread/name/updated":                       codexNotificationScopeThread,
	"thread/settings/updated":                   codexNotificationScopeThread,
	"thread/started":                            codexNotificationScopeThread,
	"thread/status/changed":                     codexNotificationScopeThread,
	"thread/tokenUsage/updated":                 codexNotificationScopeThread,
	"thread/unarchived":                         codexNotificationScopeThread,
	"turn/completed":                            codexNotificationScopeTurnState,
	"turn/diff/updated":                         codexNotificationScopeTurnState,
	"turn/plan/updated":                         codexNotificationScopeTurnState,
	"turn/started":                              codexNotificationScopeThread,
	"warning":                                   codexNotificationScopeTurnState,
}

func handleCodexNotification(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	handler, ok := codexNotificationHandlers[message.Method]
	if !ok {
		return handleUnsupportedCodexNotification(message, sink)
	}
	if _, ok := codexNotificationScopePolicies[message.Method]; !ok {
		err := fmt.Errorf("codex notification scope policy is missing for %s", message.Method)
		if diagnosticErr := emitCodexProviderDrift(sink, "codex_notification_scope_policy_missing", err.Error(), message, true); diagnosticErr != nil {
			return codexNotificationResult{}, diagnosticErr
		}
		return codexNotificationResult{}, err
	}
	return handler(message, threadID, turnID, sink)
}

type codexNotificationMatchKind string

const (
	codexNotificationMatches    codexNotificationMatchKind = "matches"
	codexNotificationMissing    codexNotificationMatchKind = "missing_required_ids"
	codexNotificationMismatched codexNotificationMatchKind = "mismatched_ids"
)

type codexNotificationMatch struct {
	Kind             codexNotificationMatchKind
	ReceivedThreadID string
	ReceivedTurnID   string
}

func codexThreadMatch(params map[string]any, expectedThreadID string) codexNotificationMatch {
	receivedThreadID, ok := params["threadId"].(string)
	if !ok || receivedThreadID == "" {
		return codexNotificationMatch{Kind: codexNotificationMissing}
	}
	if receivedThreadID != expectedThreadID {
		return codexNotificationMatch{
			Kind:             codexNotificationMismatched,
			ReceivedThreadID: receivedThreadID,
		}
	}
	return codexNotificationMatch{Kind: codexNotificationMatches, ReceivedThreadID: receivedThreadID}
}

func codexTurnMatch(params map[string]any, expectedThreadID string, expectedTurnID string) codexNotificationMatch {
	match := codexThreadMatch(params, expectedThreadID)
	if match.Kind != codexNotificationMatches {
		receivedTurnID, _ := params["turnId"].(string)
		match.ReceivedTurnID = receivedTurnID
		return match
	}
	receivedTurnID, ok := params["turnId"].(string)
	if !ok || receivedTurnID == "" {
		match.Kind = codexNotificationMissing
		return match
	}
	match.ReceivedTurnID = receivedTurnID
	if receivedTurnID != expectedTurnID {
		match.Kind = codexNotificationMismatched
	}
	return match
}

func requireCodexThreadMatch(message jsonRPCMessage, params map[string]any, expectedThreadID string, sink TurnSink) error {
	match := codexThreadMatch(params, expectedThreadID)
	if match.Kind == codexNotificationMatches {
		return nil
	}
	return failCodexNotificationScopeDrift(message, match, expectedThreadID, "", sink)
}

func requireCodexThreadIDMatch(message jsonRPCMessage, expectedThreadID string, receivedThreadID string, sink TurnSink) error {
	match := codexNotificationMatch{
		Kind:             codexNotificationMatches,
		ReceivedThreadID: receivedThreadID,
	}
	if receivedThreadID == "" {
		match.Kind = codexNotificationMissing
	} else if receivedThreadID != expectedThreadID {
		match.Kind = codexNotificationMismatched
	}
	if match.Kind == codexNotificationMatches {
		return nil
	}
	return failCodexNotificationScopeDrift(message, match, expectedThreadID, "", sink)
}

func requireCodexTurnIDMatch(message jsonRPCMessage, expectedThreadID string, expectedTurnID string, receivedThreadID string, receivedTurnID string, sink TurnSink) error {
	match := codexNotificationMatch{
		Kind:             codexNotificationMatches,
		ReceivedThreadID: receivedThreadID,
		ReceivedTurnID:   receivedTurnID,
	}
	if receivedThreadID == "" || receivedTurnID == "" {
		match.Kind = codexNotificationMissing
	} else if receivedThreadID != expectedThreadID || receivedTurnID != expectedTurnID {
		match.Kind = codexNotificationMismatched
	}
	if match.Kind == codexNotificationMatches {
		return nil
	}
	return failCodexNotificationScopeDrift(message, match, expectedThreadID, expectedTurnID, sink)
}

func requireCodexTurnMatch(message jsonRPCMessage, params map[string]any, expectedThreadID string, expectedTurnID string, sink TurnSink) error {
	match := codexTurnMatch(params, expectedThreadID, expectedTurnID)
	if match.Kind == codexNotificationMatches {
		return nil
	}
	return failCodexNotificationScopeDrift(message, match, expectedThreadID, expectedTurnID, sink)
}

func turnStartedID(params map[string]any) (string, error) {
	turnID, err := optionalString(params, "turnId", "codex turn started")
	if err != nil {
		return "", err
	}
	if turnID != "" {
		return turnID, nil
	}
	turn, err := requireObject(params, "turn", "codex turn started")
	if err != nil {
		return "", err
	}
	return requireString(turn, "id", "codex turn started turn")
}

func failCodexNotificationScopeDrift(message jsonRPCMessage, match codexNotificationMatch, expectedThreadID string, expectedTurnID string, sink TurnSink) error {
	err := fmt.Errorf("codex notification %s scope %s: expected thread %s turn %s, got thread %s turn %s", message.Method, match.Kind, expectedThreadID, expectedTurnID, match.ReceivedThreadID, match.ReceivedTurnID)
	context := map[string]string{
		"expectedThreadId": expectedThreadID,
		"expectedTurnId":   expectedTurnID,
		"receivedThreadId": match.ReceivedThreadID,
		"receivedTurnId":   match.ReceivedTurnID,
		"scopeResult":      string(match.Kind),
	}
	if diagnosticErr := emitCodexProviderDriftWithContext(sink, "codex_notification_scope_drift", err.Error(), message, true, context); diagnosticErr != nil {
		return diagnosticErr
	}
	return err
}
