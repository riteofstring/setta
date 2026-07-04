package chat

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestConfigResponseRejectsOnFailureApprovalPolicy(t *testing.T) {
	_, err := decodeTestCodexConfigSettingsResult(map[string]any{
		"approval_policy":        "on-failure",
		"model":                  "gpt-test",
		"model_reasoning_effort": "high",
	})
	if err == nil {
		t.Fatal("decode config response succeeded, want unsupported approval policy error")
	}
	if !strings.Contains(err.Error(), `codex config response config.approval_policy has deprecated unsupported approval policy "on-failure"`) {
		t.Fatalf("error = %q, want unsupported on-failure approval policy", err)
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
	settings, err := decodeTestCodexConfigSettingsResult(config)
	if err != nil {
		t.Fatalf("decode config response: %v", err)
	}
	settings.ModelDisplayName = "GPT Test"
	settings.ReasoningEffortDisplayName = "High"
	return settings
}

func decodeTestCodexConfigSettingsResult(config map[string]any) (codexCommandThreadSettings, error) {
	raw, err := json.Marshal(map[string]any{
		"config":  config,
		"layers":  []any{},
		"origins": map[string]any{},
	})
	if err != nil {
		return codexCommandThreadSettings{}, err
	}
	return codexCommandSettingsFromConfigResponse(raw)
}
