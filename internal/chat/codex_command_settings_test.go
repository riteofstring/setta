package chat

import (
	"encoding/json"
	"testing"
)

func TestConfigResponseLeavesOnFailureApprovalAsCustomPermission(t *testing.T) {
	settings := decodeTestCodexConfigSettings(t, map[string]any{
		"approval_policy":        "on-failure",
		"model":                  "gpt-test",
		"model_reasoning_effort": "high",
	})
	if settings.ApprovalPolicy != "on-failure" {
		t.Fatalf("approval policy = %q, want on-failure", settings.ApprovalPolicy)
	}
	if settings.ActivePermissionProfileID != "" {
		t.Fatalf("active permission profile = %q, want empty profile", settings.ActivePermissionProfileID)
	}
	effective := chatCodexEffectiveSettingsFromCommandSettings(settings)
	if effective == nil || effective.Permission == nil || effective.Permission.DisplayLabel != "Custom" || effective.Permission.BuiltIn {
		t.Fatalf("effective settings = %+v, want custom permission", effective)
	}
}

func TestConfigResponseDoesNotInferPermissionFromSandboxMode(t *testing.T) {
	settings := decodeTestCodexConfigSettings(t, map[string]any{
		"approval_policy":        "on-request",
		"model":                  "gpt-test",
		"model_reasoning_effort": "high",
		"sandbox_mode":           "read-only",
	})
	if settings.ActivePermissionProfileID != "" {
		t.Fatalf("active permission profile = %q, want empty profile", settings.ActivePermissionProfileID)
	}
}

func decodeTestCodexConfigSettings(t *testing.T, config map[string]any) codexCommandThreadSettings {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"config":  config,
		"layers":  []any{},
		"origins": map[string]any{},
	})
	if err != nil {
		t.Fatalf("marshal config response: %v", err)
	}
	settings, err := codexCommandSettingsFromConfigResponse(raw)
	if err != nil {
		t.Fatalf("decode config response: %v", err)
	}
	settings.ModelDisplayName = "GPT Test"
	settings.ReasoningEffortDisplayName = "High"
	return settings
}
