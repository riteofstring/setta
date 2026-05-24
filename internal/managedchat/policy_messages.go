package managedchat

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"setta/internal/agentruns"
	"setta/internal/projectstate"
)

func resolveRunInputString(run agentruns.Run, key string) string {
	if run.Inputs == nil {
		return ""
	}
	raw, ok := run.Inputs[key]
	if !ok {
		return ""
	}
	value, ok := raw.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func filterRunsByProjectConfigID(runs []agentruns.Run, projectConfigID string) []agentruns.Run {
	if strings.TrimSpace(projectConfigID) == "" {
		return append([]agentruns.Run(nil), runs...)
	}
	filtered := make([]agentruns.Run, 0, len(runs))
	for _, run := range runs {
		existingProjectConfigID := resolveRunInputString(run, "projectConfigId")
		if existingProjectConfigID == "" || existingProjectConfigID == projectConfigID {
			filtered = append(filtered, run)
		}
	}
	return filtered
}

func validatePermissionMode(mode ChatPermissionMode) (ChatPermissionMode, error) {
	switch ChatPermissionMode(strings.TrimSpace(string(mode))) {
	case projectstate.ChatPermissionModeMinimal:
		return projectstate.ChatPermissionModeMinimal, nil
	case projectstate.ChatPermissionModeYOLO:
		return projectstate.ChatPermissionModeYOLO, nil
	case projectstate.ChatPermissionModeConfigTomlCustom:
		return projectstate.ChatPermissionModeConfigTomlCustom, nil
	case "":
		return "", ErrPermissionModeRequired
	default:
		return "", ErrPermissionModeInvalid
	}
}

func normalizeFrontendAffinityToken(value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, ErrFrontendAffinityTokenInvalid
	}
	return &trimmed, nil
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func buildExecutionPolicyPrompt(permissionMode ChatPermissionMode, searchEnabled bool) string {
	lines := []string{
		"## Runtime execution settings",
		fmt.Sprintf("- permissionMode: %s", permissionMode),
		fmt.Sprintf("- searchEnabled: %t", searchEnabled),
	}
	if !searchEnabled {
		lines = append(lines, "- Search is disabled for this run. Do not rely on search tools; use existing context and local tools only.")
	}
	return strings.Join(lines, "\n")
}

func combinePromptSections(sections ...string) string {
	parts := make([]string, 0, len(sections))
	for _, section := range sections {
		trimmed := strings.TrimSpace(section)
		if trimmed == "" {
			continue
		}
		parts = append(parts, trimmed)
	}
	return strings.Join(parts, "\n\n")
}

func buildInputMessages(priorMessages []map[string]any, message map[string]any) []map[string]any {
	if hasMessageID(priorMessages, mustMessageID(message)) {
		return cloneMessageSlice(priorMessages)
	}
	return append(cloneMessageSlice(priorMessages), cloneAnyMap(message))
}

func buildBranchMessages(priorMessages []map[string]any, editedMessage map[string]any, branchFromMessageID string) ([]map[string]any, error) {
	for index, message := range priorMessages {
		messageID, err := messageID(message)
		if err != nil || messageID != branchFromMessageID {
			continue
		}
		updated := cloneAnyMap(editedMessage)
		updated["id"] = branchFromMessageID
		return append(cloneMessageSlice(priorMessages[:index]), updated), nil
	}
	return nil, &BranchMessageNotFoundError{MessageID: branchFromMessageID}
}

func hasMessageID(messages []map[string]any, target string) bool {
	for _, message := range messages {
		messageID, err := messageID(message)
		if err == nil && messageID == target {
			return true
		}
	}
	return false
}

func mustMessageID(message map[string]any) string {
	id, err := messageID(message)
	if err != nil {
		panic(err)
	}
	return id
}

func resolveBranchRootChatID(parentRun *agentruns.Run, parentChatID string) string {
	if parentRun != nil && parentRun.Inputs != nil {
		if rawRoot := resolveRunInputString(parentRun.Clone(), "branchRootChatId"); rawRoot != "" {
			return rawRoot
		}
		if rawParent := resolveRunInputString(parentRun.Clone(), "branchParentChatId"); rawParent != "" {
			return rawParent
		}
	}
	return parentChatID
}

func messageSliceToJSONList(messages []map[string]any) []any {
	result := make([]any, 0, len(messages))
	for _, message := range messages {
		result = append(result, cloneAnyMap(message))
	}
	return result
}

func derefOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func newChatID() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err == nil {
		return hex.EncodeToString(buffer)
	}
	return fmt.Sprintf("chat-%d", time.Now().UnixNano())
}

func cloneMessageSlice(input []map[string]any) []map[string]any {
	if input == nil {
		return nil
	}
	cloned := make([]map[string]any, 0, len(input))
	for _, entry := range input {
		cloned = append(cloned, cloneAnyMap(entry))
	}
	return cloned
}

func cloneStringMap(input map[string]string) map[string]string {
	if input == nil {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = cloneAnyValue(value)
	}
	return cloned
}

func cloneAnyValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case map[string]any:
		return cloneAnyMap(typed)
	case []any:
		cloned := make([]any, 0, len(typed))
		for _, entry := range typed {
			cloned = append(cloned, cloneAnyValue(entry))
		}
		return cloned
	default:
		return typed
	}
}

func stringPtr(value string) *string {
	return &value
}
