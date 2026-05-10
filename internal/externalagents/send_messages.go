package externalagents

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
)

func buildBranchMessages(priorMessages []map[string]any, editedMessage map[string]any, branchFromMessageID string) ([]map[string]any, error) {
	for index, message := range priorMessages {
		messageID, err := messageID(message)
		if err != nil || messageID != branchFromMessageID {
			continue
		}
		updated := cloneMessageOrPanic(editedMessage)
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

func resolveRunOutputString(run agentruns.Run, key string) string {
	if run.Outputs == nil {
		return ""
	}
	raw, ok := run.Outputs[key]
	if !ok {
		return ""
	}
	value, ok := raw.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func messageSliceToJSONList(messages []map[string]any) []any {
	result := make([]any, 0, len(messages))
	for _, message := range messages {
		result = append(result, cloneMessageOrPanic(message))
	}
	return result
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

func cloneProfilePtr(profile *agentprofiles.Profile) *agentprofiles.Profile {
	if profile == nil {
		return nil
	}
	cloned := *profile
	if profile.EngineConfigID != nil {
		engineConfigID := *profile.EngineConfigID
		cloned.EngineConfigID = &engineConfigID
	}
	if profile.MemoryScope != nil {
		memoryScope := *profile.MemoryScope
		cloned.MemoryScope = &memoryScope
	}
	if profile.ToolAllowlist != nil {
		cloned.ToolAllowlist = append([]string(nil), profile.ToolAllowlist...)
	}
	return &cloned
}

func cloneOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = deepCloneJSONValue(value)
	}
	return cloned
}

func deepCloneJSONValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case map[string]any:
		cloned := make(map[string]any, len(typed))
		for key, child := range typed {
			cloned[key] = deepCloneJSONValue(child)
		}
		return cloned
	case []any:
		cloned := make([]any, 0, len(typed))
		for _, child := range typed {
			cloned = append(cloned, deepCloneJSONValue(child))
		}
		return cloned
	default:
		return typed
	}
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
