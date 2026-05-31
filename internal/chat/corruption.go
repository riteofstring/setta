package chat

import (
	"errors"
	"sort"
)

const (
	corruptChatStateCode = "corrupt_chat_state"

	corruptConversationKind  = "conversation"
	corruptMessageKind       = "message"
	corruptRunKind           = "run"
	corruptRunItemKind       = "run_item"
	corruptRunItemOutputKind = "run_item_output"
	corruptTraceKind         = "trace"
	corruptDiagnosticKind    = "diagnostic"

	recoveryQuarantineOrReset = "quarantine_or_reset"
)

func corruptStateFinding(err error, workspaceID string, conversationID string, runID string, recordKind string) CorruptStateFinding {
	var corruptErr *CorruptStateError
	path := ""
	message := ""
	if errors.As(err, &corruptErr) {
		path = corruptErr.Path
		message = corruptErr.Err.Error()
	} else if err != nil {
		message = err.Error()
	}
	return CorruptStateFinding{
		Code:           corruptChatStateCode,
		Severity:       DiagnosticSeverityCritical,
		Path:           path,
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
		RunID:          runID,
		RecordKind:     recordKind,
		Error:          message,
		RecoveryAction: recoveryQuarantineOrReset,
	}
}

func corruptionSummary(findings []CorruptStateFinding) CorruptionSummary {
	byKind := map[string]int{}
	bySeverity := map[string]int{}
	for _, finding := range findings {
		byKind[finding.RecordKind]++
		bySeverity[string(finding.Severity)]++
	}
	return CorruptionSummary{
		HasCorruption: len(findings) > 0,
		Total:         len(findings),
		ByKind:        corruptionCounts(byKind),
		BySeverity:    corruptionCounts(bySeverity),
	}
}

func corruptionCounts(counts map[string]int) []CorruptionCount {
	keys := make([]string, 0, len(counts))
	for key := range counts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]CorruptionCount, 0, len(keys))
	for _, key := range keys {
		result = append(result, CorruptionCount{Key: key, Count: counts[key]})
	}
	return result
}

func corruptFindingContext(finding CorruptStateFinding) map[string]string {
	return map[string]string{
		"error":          finding.Error,
		"path":           finding.Path,
		"recordKind":     finding.RecordKind,
		"recoveryAction": finding.RecoveryAction,
	}
}

func corruptFindingError(finding CorruptStateFinding) error {
	return corruptStateError(finding.Path, errors.New(finding.Error))
}
