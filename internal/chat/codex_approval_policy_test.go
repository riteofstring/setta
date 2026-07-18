package chat

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"setta/internal/codexapp"
)

func TestSettaApprovalPolicyValidatorRejectsUnsupportedValues(t *testing.T) {
	for _, policy := range []string{codexApprovalPolicyOnRequest, codexApprovalPolicyNever} {
		if err := validateSettaCodexApprovalPolicy(policy, "test source"); err != nil {
			t.Fatalf("policy %q rejected: %v", policy, err)
		}
	}

	err := validateSettaCodexApprovalPolicy(codexApprovalPolicyOnFailure, "test source")
	if err == nil {
		t.Fatal("on-failure policy was accepted")
	}
	var policyErr unsupportedCodexApprovalPolicyError
	if !errors.As(err, &policyErr) {
		t.Fatalf("error = %T %v, want unsupportedCodexApprovalPolicyError", err, err)
	}
	if policyErr.Policy != codexApprovalPolicyOnFailure || policyErr.Source != "test source" {
		t.Fatalf("unsupported policy error = %+v, want on-failure source", policyErr)
	}
	if !strings.Contains(err.Error(), "deprecated unsupported approval policy") {
		t.Fatalf("error = %q, want deprecated unsupported message", err)
	}
}

func TestCodexThreadResponsesRejectOnFailureApprovalPolicy(t *testing.T) {
	for _, test := range []struct {
		name string
		read func(json.RawMessage) (codexCommandThread, error)
		want string
	}{
		{
			name: "start",
			read: commandThreadFromStartResponse,
			want: `codex thread start response.approvalPolicy has deprecated unsupported approval policy "on-failure"`,
		},
		{
			name: "resume",
			read: commandThreadFromResumeResponse,
			want: `codex thread resume response.approvalPolicy has deprecated unsupported approval policy "on-failure"`,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := fakeCodexThreadResponseWithThread("gpt-test", ReasoningEffortHigh, fakeCodexThreadWithID("thread_fake"))
			response["approvalPolicy"] = codexApprovalPolicyOnFailure
			raw, err := json.Marshal(response)
			if err != nil {
				t.Fatalf("marshal response: %v", err)
			}

			_, err = test.read(raw)
			if err == nil {
				t.Fatal("thread response succeeded, want unsupported approval policy error")
			}
			if !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error = %q, want %q", err, test.want)
			}
		})
	}
}

func TestCodexThreadSettingsNotificationRejectsOnFailureApprovalPolicy(t *testing.T) {
	_, err := codexThreadSettingsFromNotification(codexapp.ThreadSettingsUpdatedNotification{
		ThreadID: "thread_fake",
		ThreadSettings: codexapp.ThreadSettings{
			ApprovalPolicy: codexApprovalPolicyRaw(codexApprovalPolicyOnFailure),
			Model:          "gpt-test",
		},
	}, "thread_fake")
	if err == nil {
		t.Fatal("thread settings notification succeeded, want unsupported approval policy error")
	}
	if !strings.Contains(err.Error(), `codex thread settings updated threadSettings.approvalPolicy has deprecated unsupported approval policy "on-failure"`) {
		t.Fatalf("error = %q, want unsupported notification approval policy", err)
	}
}

func TestConversationSettingsRejectOnFailureApprovalPolicy(t *testing.T) {
	permission, ok := chatPermissionSettingsForPreset(ChatPermissionPresetDefault)
	if !ok {
		t.Fatal("default permission preset is missing")
	}
	permission.ApprovalPolicy = codexApprovalPolicyOnFailure
	conversation := validApprovalPolicyTestConversation()
	conversation.CodexSettings = &ChatCodexSettings{Permission: &permission}

	err := validateConversation(conversation)
	if err == nil {
		t.Fatal("conversation validation succeeded, want unsupported codexSettings approval policy")
	}
	if !strings.Contains(err.Error(), `conversation conversation_api codexSettings permission approvalPolicy has deprecated unsupported approval policy "on-failure"`) {
		t.Fatalf("error = %q, want unsupported codexSettings approval policy", err)
	}
}

func TestConversationEffectiveSettingsRejectOnFailureApprovalPolicy(t *testing.T) {
	conversation := validApprovalPolicyTestConversation()
	conversation.CodexEffectiveSettings = &ChatCodexEffectiveSettings{
		Model:                      "gpt-test",
		ModelDisplayName:           "GPT Test",
		ReasoningEffortDisplayName: "High",
		Permission: &ChatCodexEffectivePermissionSettings{
			ApprovalPolicy:            codexApprovalPolicyOnFailure,
			ActivePermissionProfileID: codexPermissionProfileWorkspace,
			DisplayLabel:              "Custom",
		},
	}

	err := validateConversation(conversation)
	if err == nil {
		t.Fatal("conversation validation succeeded, want unsupported effective approval policy")
	}
	if !strings.Contains(err.Error(), `conversation conversation_api codexEffectiveSettings permission approvalPolicy has deprecated unsupported approval policy "on-failure"`) {
		t.Fatalf("error = %q, want unsupported effective approval policy", err)
	}
}

func TestThreadRequestsRejectUnsupportedApprovalPolicyBeforeSend(t *testing.T) {
	params := map[string]any{}
	err := applyCodexThreadStartSettings(params, codexCommandThreadSettings{
		ApprovalPolicy: codexApprovalPolicyOnFailure,
	})
	if err == nil {
		t.Fatal("thread/start settings succeeded, want unsupported approval policy error")
	}
	if len(params) != 0 {
		t.Fatalf("thread/start params = %+v, want no settings after rejection", params)
	}

	permission, ok := chatPermissionSettingsForPreset(ChatPermissionPresetDefault)
	if !ok {
		t.Fatal("default permission preset is missing")
	}
	permission.ApprovalPolicy = codexApprovalPolicyOnFailure
	conversation := validApprovalPolicyTestConversation()
	conversation.CodexSettings = &ChatCodexSettings{Permission: &permission}
	_, err = codexThreadResumeParams("/tmp/workspace", "thread_fake", conversation)
	if err == nil {
		t.Fatal("thread/resume params succeeded, want unsupported approval policy error")
	}
}

func validApprovalPolicyTestConversation() Conversation {
	return Conversation{
		SchemaVersion: SchemaVersion,
		ID:            "conversation_api",
		WorkspaceID:   "workspace_api",
		Title:         "Conversation",
		CreatedAt:     "2026-05-29T20:00:00Z",
		UpdatedAt:     "2026-05-29T20:00:00Z",
		HarnessRefs:   []HarnessThreadRef{},
	}
}
