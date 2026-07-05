package orchestrator

import (
	"testing"

	"setta/internal/chat"
)

func TestWorkflowAgentEffectiveRunSettingsKeepsProviderPermissionsDistinct(t *testing.T) {
	preset := chat.ChatPermissionPresetDefault
	effort := chat.ReasoningEffortHigh
	settings := chat.ChatCodexSettings{
		Permission: &chat.ChatCodexPermissionSettings{
			Preset:         preset,
			ApprovalPolicy: "on-request",
			Permissions:    "provider-permissions",
		},
	}
	effective := &chat.ChatCodexEffectiveSettings{
		Model:                      "gpt-test",
		ModelDisplayName:           "GPT Test",
		ReasoningEffort:            &effort,
		ReasoningEffortDisplayName: "High",
		Permission: &chat.ChatCodexEffectivePermissionSettings{
			ApprovalPolicy:            "on-request",
			ActivePermissionProfileID: "effective-profile",
			DisplayLabel:              "Effective profile",
			Preset:                    &preset,
		},
	}

	runSettings, err := workflowAgentEffectiveRunSettings(settings, effective, workflowAgentRunSettingSources{})
	if err != nil {
		t.Fatalf("workflowAgentEffectiveRunSettings returned error: %v", err)
	}
	if runSettings.PermissionProfileID != "effective-profile" {
		t.Fatalf("PermissionProfileID = %q, want effective profile id", runSettings.PermissionProfileID)
	}
	if runSettings.Permissions != "provider-permissions" {
		t.Fatalf("Permissions = %q, want provider permissions string", runSettings.Permissions)
	}
}
