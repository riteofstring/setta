package externalagents

import (
	"fmt"
	"strings"

	"setta/internal/externalagentconfigs"
	"setta/internal/projectstate"
)

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

func resolveExternalApprovalPolicyOverride(permissionMode ChatPermissionMode, toolType externalagentconfigs.ToolType) *string {
	if permissionMode == projectstate.ChatPermissionModeConfigTomlCustom {
		return nil
	}
	switch toolType {
	case externalagentconfigs.ToolTypeClaudeCode:
		if permissionMode == projectstate.ChatPermissionModeMinimal {
			return stringPtr("default")
		}
		if permissionMode == projectstate.ChatPermissionModeYOLO {
			return stringPtr("bypassPermissions")
		}
		return nil
	default:
		if permissionMode == projectstate.ChatPermissionModeMinimal {
			return stringPtr("on-request")
		}
		if permissionMode == projectstate.ChatPermissionModeYOLO {
			return stringPtr("never")
		}
		return nil
	}
}

func resolveExternalSandboxPolicyOverride(permissionMode ChatPermissionMode, toolType externalagentconfigs.ToolType) *string {
	if permissionMode == projectstate.ChatPermissionModeConfigTomlCustom {
		return nil
	}
	if toolType != externalagentconfigs.ToolTypeCodex {
		return nil
	}
	if permissionMode == projectstate.ChatPermissionModeMinimal {
		return stringPtr("workspace-write")
	}
	if permissionMode == projectstate.ChatPermissionModeYOLO {
		return stringPtr("danger-full-access")
	}
	return nil
}

func applyExternalReasoningDefaults(inputs map[string]any, toolType externalagentconfigs.ToolType, thinking bool) {
	if toolType != externalagentconfigs.ToolTypeCodex {
		return
	}
	if _, ok := inputs["effort"]; !ok {
		if thinking {
			inputs["effort"] = "high"
		} else {
			inputs["effort"] = "low"
		}
	}
	if _, ok := inputs["summary"]; !ok {
		if thinking {
			inputs["summary"] = "auto"
		} else {
			inputs["summary"] = "none"
		}
	}
}

func buildInputMessages(priorMessages []map[string]any, message map[string]any) []map[string]any {
	if hasMessageID(priorMessages, mustMessageID(message)) {
		return cloneMessageSlice(priorMessages)
	}
	return append(cloneMessageSlice(priorMessages), cloneMessageOrPanic(message))
}
