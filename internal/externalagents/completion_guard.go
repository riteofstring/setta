package externalagents

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

const (
	missingReportMessage = "I need to call `report_completion_status` before replying."
	missingChecksMessage = "I cannot mark this complete yet. I need explicit pass/fail results for required verification checks."
	failedChecksMessage  = "I cannot mark this complete because required error checks are failing. I need to report failing checks and fixes before completion."
)

type completionGuardVerificationStatus string

const (
	completionGuardVerificationPassed  completionGuardVerificationStatus = "passed"
	completionGuardVerificationFailed  completionGuardVerificationStatus = "failed"
	completionGuardVerificationMissing completionGuardVerificationStatus = "missing"
)

type completionGuardCheckResult struct {
	Required bool
	Status   string
}

type completionGuardReport struct {
	CompletionIntent     bool
	RequiresVerification bool
	CheckResults         []completionGuardCheckResult
	VerificationStatus   completionGuardVerificationStatus
}

func applyCompletionGuardToState(state *ChatState, completionGuardEnabled bool) string {
	if !completionGuardEnabled {
		return ""
	}
	assistantIndex, assistantMessage, ok := resolveCompletionGuardAssistant(state)
	if !ok {
		return ""
	}
	replacement := resolveCompletionGuardReplacement(resolveCompletionGuardReport(state.Messages, assistantIndex))
	if replacement == "" {
		return ""
	}
	replaceAssistantText(&assistantMessage, replacement)
	state.Messages[assistantIndex] = assistantMessage
	return replacement
}

func resolveCompletionGuardAssistant(state *ChatState) (int, map[string]any, bool) {
	if state == nil || len(state.Messages) == 0 {
		return -1, nil, false
	}
	assistantIndex := findGuardTargetAssistantIndex(state.Messages)
	if assistantIndex == -1 {
		return -1, nil, false
	}
	assistantMessage := cloneMessageOrPanic(state.Messages[assistantIndex])
	assistantText := strings.TrimSpace(extractMessageText(assistantMessage))
	if assistantText == "" || isBackendErrorText(assistantText) {
		return -1, nil, false
	}
	return assistantIndex, assistantMessage, true
}

func resolveCompletionGuardReport(messages []map[string]any, assistantIndex int) *completionGuardReport {
	scopedMessages := resolveCompletionGuardScopedMessages(messages, assistantIndex)
	if scopedMessages == nil {
		return nil
	}
	return resolveLatestCompletionReport(scopedMessages)
}

func resolveCompletionGuardScopedMessages(messages []map[string]any, assistantIndex int) []map[string]any {
	reportSearchMessages := make([]map[string]any, 0, len(messages)-1)
	reportSearchMessages = append(reportSearchMessages, cloneMessageSlice(messages[:assistantIndex])...)
	reportSearchMessages = append(reportSearchMessages, resolveSameTurnToolResultMessages(messages[assistantIndex+1:])...)
	return resolveActiveTaskMessages(reportSearchMessages)
}

func resolveCompletionGuardReplacement(report *completionGuardReport) string {
	if report == nil {
		return missingReportMessage
	}
	if !report.CompletionIntent || !report.RequiresVerification || report.VerificationStatus == completionGuardVerificationPassed {
		return ""
	}
	if report.VerificationStatus == completionGuardVerificationFailed {
		return failedChecksMessage
	}
	return missingChecksMessage
}

func loadCompletionGuardEnabled(ctx context.Context, settaFilesRoot string) (bool, error) {
	if strings.TrimSpace(settaFilesRoot) == "" {
		return settingsstate.DefaultCompletionGuardEnabled, nil
	}
	settingsStore, err := settingsstate.NewStore(
		filepath.Join(settaFilesRoot, settingsstate.DefaultFileName),
		settingsstate.StoreOptions{
			SettingsProjectPath: filepath.Join(settaFilesRoot, projectstate.SettingsFileName),
		},
	)
	if err != nil {
		return false, fmt.Errorf("open settings store: %w", err)
	}
	document, err := settingsStore.Load(ctx)
	if err != nil {
		return false, fmt.Errorf("load settings document: %w", err)
	}
	enabled, err := settingsstate.CompletionGuardEnabled(document)
	if err != nil {
		return false, fmt.Errorf("read completion guard setting: %w", err)
	}
	return enabled, nil
}

func findGuardTargetAssistantIndex(messages []map[string]any) int {
	for index := len(messages) - 1; index >= 0; index-- {
		role, err := messageRole(messages[index])
		if err != nil {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(role), "assistant") {
			return index
		}
	}
	return -1
}

func resolveSameTurnToolResultMessages(messages []map[string]any) []map[string]any {
	results := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		role, err := messageRole(message)
		if err != nil || !strings.EqualFold(strings.TrimSpace(role), "tool") {
			continue
		}
		results = append(results, cloneMessageOrPanic(message))
	}
	return results
}

func resolveActiveTaskMessages(messages []map[string]any) []map[string]any {
	for index := len(messages) - 1; index >= 0; index-- {
		role, err := messageRole(messages[index])
		if err != nil {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(role), "user") {
			return cloneMessageSlice(messages[index:])
		}
	}
	return nil
}

func resolveLatestCompletionReport(messages []map[string]any) *completionGuardReport {
	candidates := messagesAfterLatestAssistant(messages)
	for index := len(candidates) - 1; index >= 0; index-- {
		role, err := messageRole(candidates[index])
		if err != nil || !strings.EqualFold(strings.TrimSpace(role), "tool") {
			continue
		}
		if !isReportCompletionStatusTool(stringValue(candidates[index]["tool_name"])) {
			continue
		}
		for _, candidate := range extractCompletionReportCandidates(candidates[index]) {
			report, ok := coerceCompletionGuardReport(candidate)
			if ok {
				return report
			}
		}
	}
	return nil
}

func extractCompletionReportCandidates(message map[string]any) []any {
	result, ok := mapValue(message["result"])
	if !ok {
		return nil
	}
	candidates := make([]any, 0, 2)
	if structuredContent, ok := mapValue(result["structuredContent"]); ok {
		candidates = append(candidates, structuredContent)
	}
	candidates = append(candidates, result)
	return candidates
}

func messagesAfterLatestAssistant(messages []map[string]any) []map[string]any {
	for index := len(messages) - 1; index >= 0; index-- {
		role, err := messageRole(messages[index])
		if err != nil {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(role), "assistant") {
			return cloneMessageSlice(messages[index+1:])
		}
	}
	return cloneMessageSlice(messages)
}

func isReportCompletionStatusTool(toolName string) bool {
	normalized := mcpx.NormalizeToolName(toolName)
	if normalized == "" {
		return false
	}
	serverID, baseName, ok := mcpx.SplitNamespacedToolName(normalized)
	if !ok || baseName != "report_completion_status" {
		return false
	}
	return serverID == mcpx.DefaultServerID
}

func coerceCompletionGuardReport(payload any) (*completionGuardReport, bool) {
	object, ok := mapValue(payload)
	if !ok {
		return nil, false
	}
	completionIntentValue, ok := object["completionIntent"]
	if !ok {
		return nil, false
	}
	requiresVerificationValue, ok := object["requiresVerification"]
	if !ok {
		return nil, false
	}
	completionIntent, ok := completionIntentValue.(bool)
	if !ok {
		return nil, false
	}
	requiresVerification, ok := requiresVerificationValue.(bool)
	if !ok {
		return nil, false
	}
	checkResults, ok := coerceCompletionGuardCheckResults(object["checkResults"])
	if !ok {
		return nil, false
	}
	report := &completionGuardReport{
		CompletionIntent:     completionIntent,
		RequiresVerification: requiresVerification,
		CheckResults:         checkResults,
		VerificationStatus:   resolveCompletionGuardVerificationStatus(requiresVerification, checkResults),
	}
	if verificationStatus, ok := object["verificationStatus"].(string); ok {
		switch completionGuardVerificationStatus(strings.TrimSpace(verificationStatus)) {
		case completionGuardVerificationPassed, completionGuardVerificationFailed, completionGuardVerificationMissing:
			report.VerificationStatus = completionGuardVerificationStatus(strings.TrimSpace(verificationStatus))
		}
	}
	return report, true
}

func coerceCompletionGuardCheckResults(raw any) ([]completionGuardCheckResult, bool) {
	if raw == nil {
		return []completionGuardCheckResult{}, true
	}
	entries, ok := raw.([]any)
	if !ok {
		return nil, false
	}
	results := make([]completionGuardCheckResult, 0, len(entries))
	for _, rawEntry := range entries {
		entry, ok := mapValue(rawEntry)
		if !ok {
			return nil, false
		}
		checkName := strings.TrimSpace(stringValue(entry["checkName"]))
		if checkName == "" {
			return nil, false
		}
		status := strings.TrimSpace(stringValue(entry["status"]))
		switch status {
		case "passed", "failed", "not_run":
		default:
			return nil, false
		}
		required := true
		if rawRequired, exists := entry["required"]; exists && rawRequired != nil {
			requiredValue, ok := rawRequired.(bool)
			if !ok {
				return nil, false
			}
			required = requiredValue
		}
		results = append(results, completionGuardCheckResult{
			Required: required,
			Status:   status,
		})
	}
	return results, true
}

func resolveCompletionGuardVerificationStatus(requiresVerification bool, checkResults []completionGuardCheckResult) completionGuardVerificationStatus {
	if !requiresVerification {
		return completionGuardVerificationPassed
	}
	requiredChecks := make([]completionGuardCheckResult, 0, len(checkResults))
	for _, check := range checkResults {
		if check.Required {
			requiredChecks = append(requiredChecks, check)
		}
	}
	if len(requiredChecks) == 0 {
		return completionGuardVerificationMissing
	}
	for _, check := range requiredChecks {
		if check.Status == "failed" {
			return completionGuardVerificationFailed
		}
	}
	for _, check := range requiredChecks {
		if check.Status != "passed" {
			return completionGuardVerificationMissing
		}
	}
	return completionGuardVerificationPassed
}

func isBackendErrorText(text string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(text)), "[error]")
}

func replaceAssistantText(message *map[string]any, nextText string) {
	if message == nil {
		return
	}
	content, _ := (*message)["content"].([]any)
	for index, rawEntry := range content {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		entryType := strings.TrimSpace(stringValue(entry["type"]))
		if entryType != "" && entryType != "text" {
			continue
		}
		nextEntry := cloneAnyMap(entry)
		nextEntry["type"] = "text"
		nextEntry["text"] = nextText
		content[index] = nextEntry
		(*message)["content"] = content
		return
	}
	content = append([]any{map[string]any{"type": "text", "text": nextText}}, content...)
	(*message)["content"] = content
}
