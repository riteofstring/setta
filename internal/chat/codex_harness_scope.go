package chat

import (
	"fmt"

	"setta/internal/codexapp"
)

type codexNotificationScopePolicy string

const (
	codexNotificationScopeGlobal     codexNotificationScopePolicy = "global_state"
	codexNotificationScopeThread     codexNotificationScopePolicy = "thread_state"
	codexNotificationScopeTurnState  codexNotificationScopePolicy = "turn_state"
	codexNotificationScopeTraceOnly  codexNotificationScopePolicy = "trace_only"
	codexNotificationScopeCapability codexNotificationScopePolicy = "capability_ignored"
)

var codexNotificationScopePolicies = map[string]codexNotificationScopePolicy{
	codexapp.CodexNotificationAccountRateLimitsUpdated:                codexNotificationScopeGlobal,
	codexapp.CodexNotificationAccountLoginCompleted:                   codexNotificationScopeGlobal,
	codexapp.CodexNotificationAccountUpdated:                          codexNotificationScopeGlobal,
	codexapp.CodexNotificationAppListUpdated:                          codexNotificationScopeGlobal,
	codexapp.CodexNotificationCommandExecOutputDelta:                  codexNotificationScopeTraceOnly,
	codexapp.CodexNotificationConfigWarning:                           codexNotificationScopeGlobal,
	codexapp.CodexNotificationDeprecationNotice:                       codexNotificationScopeGlobal,
	codexapp.CodexNotificationError:                                   codexNotificationScopeTurnState,
	codexapp.CodexNotificationExternalAgentConfigImportCompleted:      codexNotificationScopeGlobal,
	codexapp.CodexNotificationFsChanged:                               codexNotificationScopeGlobal,
	codexapp.CodexNotificationFuzzyFileSearchSessionCompleted:         codexNotificationScopeGlobal,
	codexapp.CodexNotificationFuzzyFileSearchSessionUpdated:           codexNotificationScopeGlobal,
	codexapp.CodexNotificationGuardianWarning:                         codexNotificationScopeGlobal,
	codexapp.CodexNotificationHookCompleted:                           codexNotificationScopeTraceOnly,
	codexapp.CodexNotificationHookStarted:                             codexNotificationScopeTraceOnly,
	codexapp.CodexNotificationItemAgentMessageDelta:                   codexNotificationScopeTurnState,
	codexapp.CodexNotificationItemAutoApprovalReviewCompleted:         codexNotificationScopeTraceOnly,
	codexapp.CodexNotificationItemAutoApprovalReviewStarted:           codexNotificationScopeTraceOnly,
	codexapp.CodexNotificationItemCommandExecutionOutputDelta:         codexNotificationScopeTurnState,
	codexapp.CodexNotificationItemCommandExecutionTerminalInteraction: codexNotificationScopeTurnState,
	codexapp.CodexNotificationItemCompleted:                           codexNotificationScopeTurnState,
	codexapp.CodexNotificationItemFileChangePatchUpdated:              codexNotificationScopeTurnState,
	codexapp.CodexNotificationItemMcpToolCallProgress:                 codexNotificationScopeTurnState,
	codexapp.CodexNotificationItemPlanDelta:                           codexNotificationScopeTurnState,
	codexapp.CodexNotificationItemReasoningSummaryPartAdded:           codexNotificationScopeTurnState,
	codexapp.CodexNotificationItemReasoningSummaryTextDelta:           codexNotificationScopeTurnState,
	codexapp.CodexNotificationItemReasoningTextDelta:                  codexNotificationScopeTurnState,
	codexapp.CodexNotificationItemStarted:                             codexNotificationScopeTurnState,
	codexapp.CodexNotificationMcpServerOauthLoginCompleted:            codexNotificationScopeGlobal,
	codexapp.CodexNotificationMcpServerStartupStatusUpdated:           codexNotificationScopeGlobal,
	codexapp.CodexNotificationModelRerouted:                           codexNotificationScopeTurnState,
	codexapp.CodexNotificationModelVerification:                       codexNotificationScopeTurnState,
	codexapp.CodexNotificationProcessExited:                           codexNotificationScopeTraceOnly,
	codexapp.CodexNotificationProcessOutputDelta:                      codexNotificationScopeTraceOnly,
	codexapp.CodexNotificationRemoteControlStatusChanged:              codexNotificationScopeGlobal,
	codexapp.CodexNotificationServerRequestResolved:                   codexNotificationScopeThread,
	codexapp.CodexNotificationSkillsChanged:                           codexNotificationScopeGlobal,
	codexapp.CodexNotificationThreadArchived:                          codexNotificationScopeThread,
	codexapp.CodexNotificationThreadClosed:                            codexNotificationScopeThread,
	codexapp.CodexNotificationThreadGoalCleared:                       codexNotificationScopeThread,
	codexapp.CodexNotificationThreadGoalUpdated:                       codexNotificationScopeThread,
	codexapp.CodexNotificationThreadNameUpdated:                       codexNotificationScopeThread,
	codexapp.CodexNotificationThreadRealtimeClosed:                    codexNotificationScopeCapability,
	codexapp.CodexNotificationThreadRealtimeError:                     codexNotificationScopeCapability,
	codexapp.CodexNotificationThreadRealtimeItemAdded:                 codexNotificationScopeCapability,
	codexapp.CodexNotificationThreadRealtimeOutputAudioDelta:          codexNotificationScopeCapability,
	codexapp.CodexNotificationThreadRealtimeSdp:                       codexNotificationScopeCapability,
	codexapp.CodexNotificationThreadRealtimeStarted:                   codexNotificationScopeCapability,
	codexapp.CodexNotificationThreadRealtimeTranscriptDelta:           codexNotificationScopeCapability,
	codexapp.CodexNotificationThreadRealtimeTranscriptDone:            codexNotificationScopeCapability,
	codexapp.CodexNotificationThreadSettingsUpdated:                   codexNotificationScopeThread,
	codexapp.CodexNotificationThreadStarted:                           codexNotificationScopeThread,
	codexapp.CodexNotificationThreadStatusChanged:                     codexNotificationScopeThread,
	codexapp.CodexNotificationThreadTokenUsageUpdated:                 codexNotificationScopeThread,
	codexapp.CodexNotificationThreadUnarchived:                        codexNotificationScopeThread,
	codexapp.CodexNotificationTurnCompleted:                           codexNotificationScopeTurnState,
	codexapp.CodexNotificationTurnDiffUpdated:                         codexNotificationScopeTurnState,
	codexapp.CodexNotificationTurnPlanUpdated:                         codexNotificationScopeTurnState,
	codexapp.CodexNotificationTurnStarted:                             codexNotificationScopeThread,
	codexapp.CodexNotificationWarning:                                 codexNotificationScopeTurnState,
	codexapp.CodexNotificationWindowsWorldWritableWarning:             codexNotificationScopeGlobal,
	codexapp.CodexNotificationWindowsSandboxSetupCompleted:            codexNotificationScopeCapability,
}

func (harness *CodexHarness) handleCodexNotification(message jsonRPCMessage, runID string, threadID string, turnID string, sink TurnSink) (codexNotificationResult, error) {
	result, err := handleCodexNotification(message, threadID, turnID, sink)
	if err != nil {
		return codexNotificationResult{}, err
	}
	if message.Method == codexapp.CodexNotificationServerRequestResolved {
		return result, harness.applyCodexServerRequestResolved(message, runID, threadID, sink)
	}
	return result, nil
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
