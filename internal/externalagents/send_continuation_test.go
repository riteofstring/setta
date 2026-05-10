package externalagents

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/projectstate"
)

func TestSendServicePreservesProviderDefinedAppGenerationHistory(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":      "user-follow-up",
			"role":    "user",
			"content": []any{map[string]any{"type": "text", "text": "Continue the provider-defined app flow."}},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   false,
		AdditionalInputs: map[string]any{
			"appGenerationByMessageId": map[string]any{
				"user-seed": "vendor_mode",
			},
		},
	})
	if err != nil {
		t.Fatalf("start external provider-mode chat: %v", err)
	}
	if fixture.executor.last == nil {
		t.Fatal("expected executor request")
	}
	appGenerationByMessageID, ok := fixture.executor.last.Inputs["appGenerationByMessageId"].(map[string]string)
	if !ok {
		t.Fatalf("expected normalized app-generation provenance map, got %#v", fixture.executor.last.Inputs["appGenerationByMessageId"])
	}
	if appGenerationByMessageID["user-seed"] != "vendor_mode" {
		t.Fatalf("expected retained provider-defined provenance, got %#v", appGenerationByMessageID)
	}
	if appGenerationByMessageID["user-follow-up"] != string(agentruns.ChatAppGenerationMessageModePlainChat) {
		t.Fatalf("expected submitted message to default to plain chat, got %#v", appGenerationByMessageID)
	}
}

func TestSendServiceRejectsMissingContinuationSource(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		ContinueFromChatID: stringPtr("chat-source-missing"),
		Message: map[string]any{
			"id":   "new-message",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Should fail before run creation"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if !errors.Is(err, ErrContinueFromChatSourceNotFound) {
		t.Fatalf("expected continuation source not found, got %v", err)
	}
	var typedErr *ContinueFromChatSourceNotFoundError
	if !errors.As(err, &typedErr) {
		t.Fatalf("expected typed continuation error, got %v", err)
	}
	if typedErr.Error() != "Continuation source chat chat-source-missing not found." {
		t.Fatalf("unexpected continuation message %q", typedErr.Error())
	}
}

func TestSendServiceRejectsManagedContinuationSource(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeManagedChat,
		"chatId":          "chat-source-managed",
		"projectConfigId": "project-alpha",
		"messages": []any{
			map[string]any{
				"id":   "source-user",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Managed source prompt"},
				},
			},
		},
	}, fixture.now.Add(-time.Hour))
	run.Status = agentruns.RunStatusCompleted
	finishedAt := fixture.now.Add(-30 * time.Minute)
	run.FinishedAt = &finishedAt
	run.Outputs = map[string]any{
		"messages": []any{
			map[string]any{
				"id":   "source-user",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Managed source prompt"},
				},
			},
			map[string]any{
				"id":   "source-assistant",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Managed source reply"},
				},
			},
		},
	}
	if err := fixture.runs.Save(run); err != nil {
		t.Fatalf("save managed continuation source: %v", err)
	}

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		ContinueFromChatID: stringPtr("chat-source-managed"),
		Message: map[string]any{
			"id":   "new-message",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Should not seed managed history"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if !errors.Is(err, ErrContinueFromChatSourceNotFound) {
		t.Fatalf("expected managed continuation source to fail closed, got %v", err)
	}
	if fixture.executor.last != nil {
		t.Fatalf("expected continuation validation to fail before executor start, got %#v", fixture.executor.last)
	}
}

func TestSendServiceRejectsChatEngineMismatch(t *testing.T) {
	t.Parallel()

	fixture := newSendServiceFixture(t, sendFixtureOptions{})
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeManagedChat,
		"chatId":          "chat-conflict",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, fixture.now)
	if err := fixture.runs.Save(run); err != nil {
		t.Fatalf("save managed run: %v", err)
	}

	_, err := fixture.service.StartChat(context.Background(), StartChatRequest{
		ChatID: stringPtr("chat-conflict"),
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Hello"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if !errors.Is(err, ErrChatEngineMismatch) {
		t.Fatalf("expected chat engine mismatch, got %v", err)
	}
}

func TestSendServicePreservesExplicitResumeIDsOverLatestExternalRun(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name          string
		options       sendFixtureOptions
		inputKey      string
		priorValue    string
		explicitValue string
	}{
		{
			name:          "codex thread id",
			options:       sendFixtureOptions{},
			inputKey:      "threadId",
			priorValue:    "thread-codex-prior",
			explicitValue: "thread-codex-explicit",
		},
		{
			name: "claude session id",
			options: sendFixtureOptions{
				externalToolType: externalagentconfigs.ToolTypeClaudeCode,
				externalRunMode:  externalagentconfigs.RunModeSDK,
			},
			inputKey:      "sessionId",
			priorValue:    "session-claude-prior",
			explicitValue: "session-claude-explicit",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			fixture := newSendServiceFixture(t, testCase.options)
			chatID := strings.ReplaceAll(testCase.name, " ", "-")
			fixture.seedExternalRun(t, chatID, agentruns.RunStatusCompleted, []map[string]any{
				{
					"id":   "source-user",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Resume this chat"},
					},
				},
			}, []map[string]any{
				{
					"id":   "source-user",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Resume this chat"},
					},
				},
				{
					"id":   "source-assistant",
					"role": "assistant",
					"content": []any{
						map[string]any{"type": "text", "text": "Prior reply"},
					},
				},
			})

			runs, err := fixture.runs.ListByMetadata(agentruns.RunFilter{
				RunType:         stringPtr(RunTypeExternalAgent),
				ChatID:          stringPtr(chatID),
				ProjectConfigID: stringPtr("project-alpha"),
			})
			if err != nil {
				t.Fatalf("list prior external runs: %v", err)
			}
			latestRun, ok := selectLatestRun(runs)
			if !ok {
				t.Fatal("expected prior external run")
			}
			latestRun.Outputs = ensureAnyMap(latestRun.Outputs)
			latestRun.Outputs[testCase.inputKey] = testCase.priorValue
			if err := fixture.runs.Save(latestRun); err != nil {
				t.Fatalf("save prior resume id: %v", err)
			}

			_, err = fixture.service.StartChat(context.Background(), StartChatRequest{
				ChatID: stringPtr(chatID),
				Message: map[string]any{
					"id":   "new-message",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Continue on the explicit resume target"},
					},
				},
				EngineConfigID:  fixture.engineID,
				ProjectConfigID: "project-alpha",
				AllowUnscoped:   true,
				PermissionMode:  projectstate.ChatPermissionModeMinimal,
				SearchEnabled:   true,
				AdditionalInputs: map[string]any{
					testCase.inputKey: testCase.explicitValue,
				},
			})
			if err != nil {
				t.Fatalf("start external chat with explicit resume id: %v", err)
			}
			if fixture.executor.last == nil {
				t.Fatal("expected executor request")
			}
			if got := fixture.executor.last.Inputs[testCase.inputKey]; got != testCase.explicitValue {
				t.Fatalf("expected explicit %s %q, got %#v", testCase.inputKey, testCase.explicitValue, got)
			}
		})
	}
}
