package externalagents

import "testing"

func TestApplyCompletionGuardToStateRewritesMissingRequiredChecks(t *testing.T) {
	t.Parallel()

	state := ChatState{
		Messages: []map[string]any{
			{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Implement task A."},
				},
			},
			{
				"id":   "assistant-1",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Task A is done."},
				},
			},
			{
				"id":           "tool-result-1",
				"role":         "tool",
				"tool_call_id": "tool-report-1",
				"tool_name":    "setta__report_completion_status",
				"result": map[string]any{
					"structuredContent": map[string]any{
						"completionIntent":     true,
						"requiresVerification": true,
					},
				},
				"content": []any{},
			},
		},
	}

	if got := applyCompletionGuardToState(&state, true); got != missingChecksMessage {
		t.Fatalf("expected missing-checks rewrite %q, got %q", missingChecksMessage, got)
	}
	if got := extractMessageText(state.Messages[1]); got != missingChecksMessage {
		t.Fatalf("expected rewritten assistant text %q, got %q", missingChecksMessage, got)
	}
}

func TestApplyCompletionGuardToStateRewritesFailingChecks(t *testing.T) {
	t.Parallel()

	state := ChatState{
		Messages: []map[string]any{
			{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Implement task A."},
				},
			},
			{
				"id":   "assistant-1",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Task A is done."},
				},
			},
			{
				"id":           "tool-result-1",
				"role":         "tool",
				"tool_call_id": "tool-report-1",
				"tool_name":    "setta__report_completion_status",
				"result": map[string]any{
					"structuredContent": map[string]any{
						"completionIntent":     true,
						"requiresVerification": true,
						"checkResults": []any{
							map[string]any{
								"checkName": "pytest",
								"required":  true,
								"status":    "failed",
							},
						},
					},
				},
				"content": []any{},
			},
		},
	}

	if got := applyCompletionGuardToState(&state, true); got != failedChecksMessage {
		t.Fatalf("expected failed-checks rewrite %q, got %q", failedChecksMessage, got)
	}
	if got := extractMessageText(state.Messages[1]); got != failedChecksMessage {
		t.Fatalf("expected rewritten assistant text %q, got %q", failedChecksMessage, got)
	}
}

func TestApplyCompletionGuardToStateSkipsRewriteWhenDisabled(t *testing.T) {
	t.Parallel()

	state := ChatState{
		Messages: []map[string]any{
			{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Implement task A."},
				},
			},
			{
				"id":   "assistant-1",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Task A is done."},
				},
			},
		},
	}

	if got := applyCompletionGuardToState(&state, false); got != "" {
		t.Fatalf("expected disabled guard to skip rewrite, got %q", got)
	}
	if got := extractMessageText(state.Messages[1]); got != "Task A is done." {
		t.Fatalf("expected assistant text to stay unchanged, got %q", got)
	}
}
