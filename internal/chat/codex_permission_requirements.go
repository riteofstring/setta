package chat

import (
	"context"
	"encoding/json"
	"fmt"

	"setta/internal/codexapp"
)

const codexMethodConfigRequirementsRead = "configRequirements/read"

type codexConfigRequirementsReadResponse struct {
	Requirements *codexConfigRequirements `json:"requirements"`
}

type codexConfigRequirements struct {
	AllowedApprovalPolicies   []string        `json:"allowedApprovalPolicies"`
	AllowedPermissionProfiles map[string]bool `json:"allowedPermissionProfiles"`
}

func codexPermissionPresetsForSession(ctx context.Context, session *codexapp.Session) ([]ChatPermissionPreset, error) {
	requirements, err := readCodexConfigRequirements(ctx, session)
	if err != nil {
		return nil, err
	}
	return chatPermissionPresetsForRequirements(requirements), nil
}

func readCodexConfigRequirements(ctx context.Context, session *codexapp.Session) (*codexConfigRequirements, error) {
	raw, err := session.Call(ctx, codexMethodConfigRequirementsRead, nil)
	if err != nil {
		return nil, commandError(ChatCommandErrorCodexRPC, "configRequirements/read: "+err.Error(), err)
	}
	var response codexConfigRequirementsReadResponse
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, commandError(ChatCommandErrorCodexProviderDrift, "configRequirements/read response: "+err.Error(), err)
	}
	return response.Requirements, nil
}

func chatPermissionPresetsForRequirements(requirements *codexConfigRequirements) []ChatPermissionPreset {
	presets := BuiltinChatPermissionPresets()
	for index := range presets {
		if reason := chatPermissionPresetDisabledReason(presets[index], requirements); reason != "" {
			presets[index].Disabled = true
			presets[index].DisabledReason = reason
		}
	}
	return presets
}

func enabledChatPermissionPresetForSession(ctx context.Context, session *codexapp.Session, id ChatPermissionPresetID) (ChatPermissionPreset, error) {
	presets, err := codexPermissionPresetsForSession(ctx, session)
	if err != nil {
		return ChatPermissionPreset{}, err
	}
	for _, preset := range presets {
		if preset.ID != id {
			continue
		}
		if preset.Disabled {
			return ChatPermissionPreset{}, commandError(
				ChatCommandErrorMalformedCommand,
				fmt.Sprintf("permission preset %s is disabled: %s", preset.ID, preset.DisabledReason),
				nil,
			)
		}
		return preset, nil
	}
	return ChatPermissionPreset{}, commandError(ChatCommandErrorMalformedCommand, "unsupported permission preset: "+string(id), nil)
}

func chatPermissionPresetDisabledReason(preset ChatPermissionPreset, requirements *codexConfigRequirements) string {
	if requirements == nil {
		return ""
	}
	if requirements.AllowedApprovalPolicies != nil && !stringSliceContains(requirements.AllowedApprovalPolicies, preset.ApprovalPolicy) {
		return "Disabled by Codex configuration requirements."
	}
	if requirements.AllowedPermissionProfiles != nil {
		allowed, ok := requirements.AllowedPermissionProfiles[preset.ActivePermissionProfileID]
		if !ok || !allowed {
			return "Disabled by Codex configuration requirements."
		}
	}
	return ""
}

func stringSliceContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
