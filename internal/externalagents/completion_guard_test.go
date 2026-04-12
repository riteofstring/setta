package externalagents

import (
	"context"
	"path/filepath"
	"testing"

	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

func testUserMessage(text string) map[string]any {
	return map[string]any{
		"id":   "user-1",
		"role": "user",
		"content": []any{
			map[string]any{"type": "text", "text": text},
		},
	}
}

func testAssistantMessage(text string) map[string]any {
	return map[string]any{
		"id":   "assistant-1",
		"role": "assistant",
		"content": []any{
			map[string]any{"type": "text", "text": text},
		},
	}
}

func testAssistantMessageWithToolCall(text string) map[string]any {
	message := testAssistantMessage(text)
	message["tool_calls"] = []any{
		map[string]any{
			"id": "tool-call-1",
			"function": map[string]any{
				"name":      "setta__report_completion_status",
				"arguments": map[string]any{},
			},
		},
	}
	return message
}

func testCompletionReport(toolName string, wrapStructuredContent bool, payload map[string]any) map[string]any {
	result := map[string]any{}
	if wrapStructuredContent {
		result["structuredContent"] = payload
	} else {
		for key, value := range payload {
			result[key] = value
		}
	}
	return map[string]any{
		"id":           "tool-result-1",
		"role":         "tool",
		"tool_call_id": "tool-report-1",
		"tool_name":    toolName,
		"result":       result,
		"content":      []any{},
	}
}

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

func TestApplyCompletionGuardToStateRewritesMissingReportForUserVisibleText(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name      string
		assistant map[string]any
	}{
		{
			name:      "completion claim",
			assistant: testAssistantMessage("Task A is done."),
		},
		{
			name:      "clarification text",
			assistant: testAssistantMessage("I need one clarification before I continue."),
		},
		{
			name:      "tool call response",
			assistant: testAssistantMessageWithToolCall("Task A is done."),
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			state := ChatState{
				Messages: []map[string]any{
					testUserMessage("Implement task A."),
					testCase.assistant,
				},
			}

			if got := applyCompletionGuardToState(&state, true); got != missingReportMessage {
				t.Fatalf("expected missing-report rewrite %q, got %q", missingReportMessage, got)
			}
			if got := extractMessageText(state.Messages[1]); got != missingReportMessage {
				t.Fatalf("expected rewritten assistant text %q, got %q", missingReportMessage, got)
			}
		})
	}
}

func TestApplyCompletionGuardToStatePreservesBackendErrorsWithoutReport(t *testing.T) {
	t.Parallel()

	state := ChatState{
		Messages: []map[string]any{
			testUserMessage("Implement task A."),
			testAssistantMessage("[Error] AI request failed. See Backend Logs for details."),
		},
	}

	if got := applyCompletionGuardToState(&state, true); got != "" {
		t.Fatalf("expected backend error text to bypass rewrite, got %q", got)
	}
	if got := extractMessageText(state.Messages[1]); got != "[Error] AI request failed. See Backend Logs for details." {
		t.Fatalf("expected backend error text to stay unchanged, got %q", got)
	}
}

func TestApplyCompletionGuardToStateAllowsValidReports(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name    string
		report  map[string]any
		message string
	}{
		{
			name: "passing required checks",
			report: testCompletionReport("setta__report_completion_status", true, map[string]any{
				"completionIntent":     true,
				"requiresVerification": true,
				"checkResults": []any{
					map[string]any{"checkName": "pytest", "required": true, "status": "passed"},
					map[string]any{"checkName": "ruff", "required": true, "status": "passed"},
				},
			}),
			message: "Task A is done.",
		},
		{
			name: "report says not completion intent",
			report: testCompletionReport("setta__report_completion_status", true, map[string]any{
				"completionIntent":     false,
				"requiresVerification": false,
				"checkResults":         []any{},
			}),
			message: "I need one clarification.",
		},
		{
			name: "verification not required",
			report: testCompletionReport("setta__report_completion_status", true, map[string]any{
				"completionIntent":     true,
				"requiresVerification": false,
				"checkResults":         []any{},
			}),
			message: "Summary complete.",
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			state := ChatState{
				Messages: []map[string]any{
					testUserMessage("Implement task A."),
					testAssistantMessage(testCase.message),
					testCase.report,
				},
			}

			if got := applyCompletionGuardToState(&state, true); got != "" {
				t.Fatalf("expected valid report to avoid rewrite, got %q", got)
			}
			if got := extractMessageText(state.Messages[1]); got != testCase.message {
				t.Fatalf("expected assistant text %q, got %q", testCase.message, got)
			}
		})
	}
}

func TestApplyCompletionGuardToStateScopesReportsToActiveTaskAndLatestAssistant(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name     string
		messages []map[string]any
	}{
		{
			name: "active task boundary ignores prior task report",
			messages: []map[string]any{
				testUserMessage("Implement task A."),
				testCompletionReport("setta__report_completion_status", true, map[string]any{
					"completionIntent":     true,
					"requiresVerification": true,
					"checkResults": []any{
						map[string]any{"checkName": "pytest", "required": true, "status": "passed"},
					},
				}),
				testUserMessage("Implement task B."),
				testAssistantMessage("Task B is done."),
			},
		},
		{
			name: "latest assistant boundary ignores stale report",
			messages: []map[string]any{
				testUserMessage("Implement task A."),
				testCompletionReport("setta__report_completion_status", true, map[string]any{
					"completionIntent":     true,
					"requiresVerification": true,
					"checkResults": []any{
						map[string]any{"checkName": "pytest", "required": true, "status": "passed"},
					},
				}),
				testAssistantMessage("I still need one detail from you."),
				testAssistantMessage("Task A is complete."),
			},
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			state := ChatState{Messages: cloneMessageSlice(testCase.messages)}
			targetIndex := len(state.Messages) - 1

			if got := applyCompletionGuardToState(&state, true); got != missingReportMessage {
				t.Fatalf("expected stale or out-of-scope report to rewrite to %q, got %q", missingReportMessage, got)
			}
			if got := extractMessageText(state.Messages[targetIndex]); got != missingReportMessage {
				t.Fatalf("expected assistant text %q, got %q", missingReportMessage, got)
			}
		})
	}
}

func TestApplyCompletionGuardToStateAcceptsReportToolAliasesAndSameTurnResults(t *testing.T) {
	t.Parallel()

	t.Run("namespaced aliases", func(t *testing.T) {
		t.Parallel()

		for _, testCase := range []struct {
			name     string
			toolName string
		}{
			{name: "mcp prefix direct payload", toolName: "mcp__setta__report_completion_status"},
		} {
			testCase := testCase
			t.Run(testCase.name, func(t *testing.T) {
				t.Parallel()

				state := ChatState{
					Messages: []map[string]any{
						testUserMessage("Implement task A."),
						testAssistantMessage("Task A is done."),
						testCompletionReport(testCase.toolName, false, map[string]any{
							"completionIntent":     true,
							"requiresVerification": true,
							"checkResults": []any{
								map[string]any{"checkName": "pytest", "required": true, "status": "passed"},
							},
						}),
					},
				}

				if got := applyCompletionGuardToState(&state, true); got != "" {
					t.Fatalf("expected aliased tool report to avoid rewrite, got %q", got)
				}
				if got := extractMessageText(state.Messages[1]); got != "Task A is done." {
					t.Fatalf("expected assistant text to stay unchanged, got %q", got)
				}
			})
		}
	})

	t.Run("same turn tool results", func(t *testing.T) {
		t.Parallel()

		for _, testCase := range []struct {
			name          string
			status        string
			expectedGuard string
		}{
			{name: "passing results allow completion", status: "passed", expectedGuard: ""},
			{name: "failing results rewrite completion", status: "failed", expectedGuard: failedChecksMessage},
		} {
			testCase := testCase
			t.Run(testCase.name, func(t *testing.T) {
				t.Parallel()

				state := ChatState{
					Messages: []map[string]any{
						testUserMessage("Implement task A."),
						testAssistantMessageWithToolCall("Task A is done."),
						testCompletionReport("setta__report_completion_status", true, map[string]any{
							"completionIntent":     true,
							"requiresVerification": true,
							"checkResults": []any{
								map[string]any{"checkName": "pytest", "required": true, "status": testCase.status},
							},
						}),
					},
				}

				if got := applyCompletionGuardToState(&state, true); got != testCase.expectedGuard {
					t.Fatalf("expected same-turn report rewrite %q, got %q", testCase.expectedGuard, got)
				}
				expectedText := "Task A is done."
				if testCase.expectedGuard != "" {
					expectedText = testCase.expectedGuard
				}
				if got := extractMessageText(state.Messages[1]); got != expectedText {
					t.Fatalf("expected assistant text %q, got %q", expectedText, got)
				}
			})
		}
	})
}

func TestApplyCompletionGuardToStateTreatsMalformedReportAsMissing(t *testing.T) {
	t.Parallel()

	state := ChatState{
		Messages: []map[string]any{
			testUserMessage("Implement task A."),
			testAssistantMessage("Task A is done."),
			testCompletionReport("setta__report_completion_status", true, map[string]any{
				"completionIntent":     true,
				"requiresVerification": true,
				"checkResults":         "invalid",
			}),
		},
	}

	if got := applyCompletionGuardToState(&state, true); got != missingReportMessage {
		t.Fatalf("expected malformed report to rewrite as missing report %q, got %q", missingReportMessage, got)
	}
	if got := extractMessageText(state.Messages[1]); got != missingReportMessage {
		t.Fatalf("expected assistant text %q, got %q", missingReportMessage, got)
	}
}

func TestLoadCompletionGuardEnabledReadsDirectBackendSetting(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeCodexCompletionGuardSetting(t, root, true)

	enabled, err := loadCompletionGuardEnabled(context.Background(), root)
	if err != nil {
		t.Fatalf("loadCompletionGuardEnabled returned error: %v", err)
	}
	if !enabled {
		t.Fatal("expected completion guard setting to load from the shared settings file")
	}
}

func TestLoadCompletionGuardEnabledDefaultsToDisabled(t *testing.T) {
	t.Parallel()

	enabled, err := loadCompletionGuardEnabled(context.Background(), t.TempDir())
	if err != nil {
		t.Fatalf("loadCompletionGuardEnabled returned error: %v", err)
	}
	if enabled {
		t.Fatal("expected missing settings documents to default completion guard to disabled")
	}
}

func TestLoadCompletionGuardEnabledUsesRemappedBackendSlice(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeCodexCompletionGuardSetting(t, root, true)

	defaultDocument, err := settingsstate.DefaultDocument()
	if err != nil {
		t.Fatalf("default settings document: %v", err)
	}
	settingsRuntime, err := settingsstate.OpenOverlayRuntime(defaultDocument)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})
	settingsProjectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open settings project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := settingsProjectRuntime.Close(); err != nil {
			t.Fatalf("close settings project runtime: %v", err)
		}
	})
	if err := settingsstate.EnsureProjectRuntimeBootstrapped(context.Background(), settingsRuntime, settingsProjectRuntime); err != nil {
		t.Fatalf("bootstrap settings project runtime: %v", err)
	}
	settingsProjectDocument := settingsProjectRuntime.Snapshot().Document
	settingsProject, err := settingsProjectDocument.ProjectByID(settingsstate.SettingsProjectID)
	if err != nil {
		t.Fatalf("settings project by id: %v", err)
	}
	backendSectionID := ""
	for sectionID, section := range settingsProject.Sections {
		if section.Name == "backend" {
			backendSectionID = sectionID
			break
		}
	}
	if backendSectionID == "" {
		t.Fatal("expected settings project to contain the backend section")
	}
	backendVariantID := settingsProject.SectionVariantMap[backendSectionID]
	backendVariant := settingsProject.SectionVariants[backendVariantID]
	backendVariant.Name = "backend-settings.json"
	settingsProject.SectionVariants[backendVariantID] = backendVariant
	settingsProjectDocument.Projects[settingsstate.SettingsProjectID] = settingsProject

	settingsProjectStore, err := projectstate.NewStore(filepath.Join(root, projectstate.SettingsFileName), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new settings project store: %v", err)
	}
	if err := settingsProjectStore.Save(context.Background(), settingsProjectDocument); err != nil {
		t.Fatalf("save settings project document: %v", err)
	}

	remappedStore, err := settingsstate.NewStore(filepath.Join(root, "backend-settings.json"), settingsstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open remapped backend settings store: %v", err)
	}
	remappedDocument, err := settingsstate.DefaultDocument()
	if err != nil {
		t.Fatalf("default remapped settings document: %v", err)
	}
	remappedDocument["backend"].(map[string]any)["completionGuardEnabled"] = false
	if err := remappedStore.Save(context.Background(), remappedDocument); err != nil {
		t.Fatalf("save remapped backend settings document: %v", err)
	}

	enabled, err := loadCompletionGuardEnabled(context.Background(), root)
	if err != nil {
		t.Fatalf("loadCompletionGuardEnabled returned error: %v", err)
	}
	if enabled {
		t.Fatal("expected remapped backend settings slice to override the shared settings file")
	}
}
