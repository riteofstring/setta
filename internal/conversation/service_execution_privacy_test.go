package conversation

import (
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"setta/internal/agent"
)

func TestRedactPrivateExecutionEventRemovesWorkingDirectoryFromDurableFields(t *testing.T) {
	privateRoot := filepath.Join(t.TempDir(), "Application Support", "unbound conversation")
	if err := os.MkdirAll(privateRoot, 0o700); err != nil {
		t.Fatalf("MkdirAll private root: %v", err)
	}
	canonicalRoot, err := filepath.EvalSymlinks(privateRoot)
	if err != nil {
		t.Fatalf("EvalSymlinks: %v", err)
	}
	privatePath := filepath.Join(privateRoot, "scratch", "result.md")
	canonicalPath := filepath.Join(canonicalRoot, "scratch", "result.md")
	privateFileURL := (&url.URL{Scheme: "file", Path: privatePath}).String()
	scope := conversationExecutionScope{workingDirectory: privateRoot}
	base := agent.Event{
		ConversationID:   "conversation-private-redaction",
		TurnID:           "turn-private-redaction",
		ProviderThreadID: "provider-thread-private-redaction",
		ProviderTurnID:   "provider-turn-private-redaction",
	}
	movePath := canonicalPath
	explanation := "Inspect " + privatePath
	command := "read " + privatePath
	tests := []struct {
		name  string
		event agent.Event
	}{
		{
			name: "text",
			event: privateExecutionEvent(base, agent.EventKindAgentTextCompleted, func(event *agent.Event) {
				event.Text = &agent.TextEvent{
					ProviderItemID: "provider-item-private-text",
					Text:           "Saved " + privatePath + ", " + canonicalPath + ", and " + privateFileURL,
				}
			}),
		},
		{
			name: "plan",
			event: privateExecutionEvent(base, agent.EventKindPlanChanged, func(event *agent.Event) {
				event.Plan = &agent.PlanEvent{
					Explanation: &explanation,
					Steps: []agent.PlanStep{{
						Step:   "Review " + canonicalPath,
						Status: "inProgress",
					}},
				}
			}),
		},
		{
			name: "activity",
			event: privateExecutionEvent(base, agent.EventKindActivityCompleted, func(event *agent.Event) {
				event.Activity = &agent.ActivityEvent{
					ProviderItemID: "provider-item-private-activity",
					Kind:           agent.ActivityKindImageGeneration,
					Status:         "completed",
					Title:          "Generated " + privatePath,
					Summary:        "Saved " + canonicalPath,
					Command:        &command,
					CWD:            &privatePath,
					Server:         &canonicalPath,
					Tool:           &privatePath,
					Namespace:      &canonicalPath,
					ProcessID:      &privatePath,
					SavedPath:      &canonicalPath,
				}
			}),
		},
		{
			name: "file change",
			event: privateExecutionEvent(base, agent.EventKindActivityCompleted, func(event *agent.Event) {
				event.Activity = &agent.ActivityEvent{
					ProviderItemID: "provider-item-private-file-change",
					Kind:           agent.ActivityKindFileChange,
					Status:         "completed",
					Title:          "Changed " + privatePath,
					FileChanges: []agent.FileChange{{
						Path:     privatePath,
						Kind:     agent.FileChangeKindUpdate,
						MovePath: &movePath,
						Diff:     "--- " + privatePath + "\n+++ " + canonicalPath,
					}},
				}
			}),
		},
		{
			name: "approval",
			event: privateExecutionEvent(base, agent.EventKindApprovalRequested, func(event *agent.Event) {
				event.Approval = &agent.ApprovalRequest{
					ID:                "approval-private-redaction",
					ProviderItemID:    "provider-item-private-approval",
					Kind:              agent.ApprovalKindCommand,
					Title:             "Run in " + privatePath,
					Body:              "Approve " + canonicalPath,
					Command:           "inspect " + privatePath,
					Path:              canonicalPath,
					PermissionProfile: "write " + privatePath,
					Questions: []agent.ApprovalQuestion{{
						ID:       "private-path-question",
						Header:   "Path " + privatePath,
						Question: "Use " + canonicalPath + "?",
						Options:  []string{privatePath, canonicalPath},
					}},
				}
			}),
		},
		{
			name: "validation",
			event: privateExecutionEvent(base, agent.EventKindValidationRecorded, func(event *agent.Event) {
				event.Validation = &agent.ValidationEvent{
					ID:      "validation-private-redaction",
					Kind:    agent.ValidationKindModelVerification,
					Status:  agent.ValidationStatusPassed,
					Subject: &privatePath,
					Summary: "Validated " + canonicalPath,
				}
			}),
		},
		{
			name: "terminal",
			event: privateExecutionEvent(base, agent.EventKindTurnTerminal, func(event *agent.Event) {
				message := "failed under " + privatePath + " and " + canonicalPath
				event.Terminal = &agent.TerminalEvent{
					Outcome: agent.TurnOutcomeFailed,
					Error:   &message,
				}
			}),
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			before, err := json.Marshal(test.event)
			if err != nil {
				t.Fatalf("marshal source event: %v", err)
			}
			if !strings.Contains(string(before), privateRoot) &&
				!strings.Contains(string(before), canonicalRoot) {
				t.Fatalf("source event did not exercise private path: %s", before)
			}

			redacted := redactPrivateExecutionEvent(scope, test.event)
			if err := redacted.Validate(); err != nil {
				t.Fatalf("redacted event is invalid: %v", err)
			}
			encoded, err := json.Marshal(redacted)
			if err != nil {
				t.Fatalf("marshal redacted event: %v", err)
			}
			for _, alias := range privateWorkingDirectoryAliases(scope) {
				if strings.Contains(string(encoded), alias) {
					t.Fatalf("redacted event leaked private alias %q: %s", alias, encoded)
				}
			}
			if !strings.Contains(string(encoded), privateWorkingDirectoryRedaction) {
				t.Fatalf("redacted event omitted public replacement: %s", encoded)
			}
			unchanged, err := json.Marshal(test.event)
			if err != nil {
				t.Fatalf("marshal source event after redaction: %v", err)
			}
			if string(unchanged) != string(before) {
				t.Fatalf("redaction mutated source event:\nbefore %s\nafter  %s", before, unchanged)
			}
		})
	}
}

func TestRedactPrivateWorkingDirectoryTextRemovesURLPathRepresentations(t *testing.T) {
	privateRoot := filepath.Join(t.TempDir(), "Application Support", "unbound conversation")
	aliases := resolvePrivateWorkingDirectoryAliases(privateRoot)
	slashRoot := filepath.ToSlash(privateRoot)
	values := []string{
		"file://" + (&url.URL{Path: slashRoot}).EscapedPath() + "/result.md",
		"artifact?path=" + url.QueryEscape(slashRoot) + "%2Fresult.md",
		"opaque:" + url.PathEscape(slashRoot) + "%2Fresult.md",
	}
	for _, value := range values {
		redacted := redactPrivateWorkingDirectoryText(aliases, value)
		if strings.Contains(redacted, "Application") ||
			!strings.Contains(redacted, privateWorkingDirectoryRedaction) {
			t.Fatalf("redacted URL path = %q from %q", redacted, value)
		}
	}
}

func TestRedactPrivateExecutionEventLeavesAuthorizedWorkspacePathsIntact(t *testing.T) {
	workspaceID := "workspace-visible-path"
	workspaceRoot := t.TempDir()
	event := agent.Event{
		Kind:             agent.EventKindAgentTextCompleted,
		ConversationID:   "conversation-visible-path",
		TurnID:           "turn-visible-path",
		ProviderThreadID: "provider-thread-visible-path",
		ProviderTurnID:   "provider-turn-visible-path",
		Text: &agent.TextEvent{
			ProviderItemID: "provider-item-visible-path",
			Text:           "Saved " + filepath.Join(workspaceRoot, "result.md"),
		},
	}
	scope := conversationExecutionScope{
		workspaceID:      &workspaceID,
		authorizedRoot:   workspaceRoot,
		workingDirectory: workspaceRoot,
	}
	redacted := redactPrivateExecutionEvent(scope, event)
	if redacted.Text == nil || redacted.Text.Text != event.Text.Text {
		t.Fatalf("authorized workspace path was redacted: before=%+v after=%+v", event, redacted)
	}
}

func TestRedactPrivateExecutionEventBuffersPathsSplitAcrossTextDeltas(t *testing.T) {
	privateRoot := t.TempDir()
	active := &activeConversationTurn{
		scope:              conversationExecutionScope{workingDirectory: privateRoot},
		privateStreamTails: map[string]string{},
	}
	split := len(privateRoot) / 2
	chunks := []string{
		"Saved ",
		privateRoot[:split],
		privateRoot[split:] + "/result.md",
	}
	var streamed strings.Builder
	for _, chunk := range chunks {
		event := agent.Event{
			Kind:             agent.EventKindAgentTextDelta,
			ConversationID:   "conversation-private-stream",
			TurnID:           "turn-private-stream",
			ProviderThreadID: "provider-thread-private-stream",
			ProviderTurnID:   "provider-turn-private-stream",
			Text: &agent.TextEvent{
				ProviderItemID: "provider-item-private-stream",
				Text:           chunk,
			},
		}
		redacted, persist := redactPrivateExecutionEventForTurn(active, event)
		if !persist {
			continue
		}
		if err := redacted.Validate(); err != nil {
			t.Fatalf("redacted text delta is invalid: %v", err)
		}
		streamed.WriteString(redacted.Text.Text)
	}
	want := "Saved " + privateWorkingDirectoryRedaction + "/result.md"
	if streamed.String() != want || strings.Contains(streamed.String(), privateRoot) {
		t.Fatalf("redacted streamed text = %q, want %q", streamed.String(), want)
	}

	completed := agent.Event{
		Kind:             agent.EventKindAgentTextCompleted,
		ConversationID:   "conversation-private-stream",
		TurnID:           "turn-private-stream",
		ProviderThreadID: "provider-thread-private-stream",
		ProviderTurnID:   "provider-turn-private-stream",
		Text: &agent.TextEvent{
			ProviderItemID: "provider-item-private-stream",
			Text:           "Saved " + filepath.Join(privateRoot, "result.md"),
		},
	}
	redacted, persist := redactPrivateExecutionEventForTurn(active, completed)
	if !persist || redacted.Text == nil || redacted.Text.Text != want {
		t.Fatalf("redacted completed text = persist:%t event:%+v, want %q", persist, redacted, want)
	}
	if tail := active.privateStreamTails[privateAnswerStreamKey(completed.Text)]; tail != "" {
		t.Fatalf("completed text left private stream tail %q", tail)
	}
}

func TestRedactPrivateExecutionEventBuffersReasoningAndProgressStreams(t *testing.T) {
	privateRoot := t.TempDir()
	active := &activeConversationTurn{
		scope:              conversationExecutionScope{workingDirectory: privateRoot},
		privateStreamTails: map[string]string{},
	}
	split := len(privateRoot) / 2
	reasoningID := "provider-item-private-reasoning"
	var reasoning strings.Builder
	for _, chunk := range []string{privateRoot[:split], privateRoot[split:] + "/notes.md"} {
		event := privateExecutionEvent(agent.Event{
			ConversationID:   "conversation-private-streams",
			TurnID:           "turn-private-streams",
			ProviderThreadID: "provider-thread-private-streams",
			ProviderTurnID:   "provider-turn-private-streams",
		}, agent.EventKindReasoningSummary, func(event *agent.Event) {
			event.Text = &agent.TextEvent{ProviderItemID: reasoningID, Text: chunk}
		})
		redacted, persist := redactPrivateExecutionEventForTurn(active, event)
		if persist {
			reasoning.WriteString(redacted.Text.Text)
		}
	}
	want := privateWorkingDirectoryRedaction + "/notes.md"
	if reasoning.String() != want {
		t.Fatalf("redacted reasoning stream = %q, want %q", reasoning.String(), want)
	}
	finalReasoning := privateExecutionEvent(agent.Event{
		ConversationID:   "conversation-private-streams",
		TurnID:           "turn-private-streams",
		ProviderThreadID: "provider-thread-private-streams",
		ProviderTurnID:   "provider-turn-private-streams",
	}, agent.EventKindReasoningSummary, func(event *agent.Event) {
		event.Text = &agent.TextEvent{
			ProviderItemID: reasoningID,
			Text:           privateRoot + "/notes.md",
			Final:          true,
		}
	})
	redacted, persist := redactPrivateExecutionEventForTurn(active, finalReasoning)
	if !persist || redacted.Text == nil || redacted.Text.Text != want {
		t.Fatalf("redacted final reasoning = persist:%t event:%+v, want %q", persist, redacted, want)
	}
	if tail := active.privateStreamTails[privateReasoningStreamKey(finalReasoning.Text)]; tail != "" {
		t.Fatalf("final reasoning left private stream tail %q", tail)
	}

	activityID := "provider-item-private-progress"
	var progress strings.Builder
	for _, chunk := range []string{privateRoot[:split], privateRoot[split:] + "/output.log"} {
		event := privateExecutionEvent(agent.Event{
			ConversationID:   "conversation-private-streams",
			TurnID:           "turn-private-streams",
			ProviderThreadID: "provider-thread-private-streams",
			ProviderTurnID:   "provider-turn-private-streams",
		}, agent.EventKindActivityUpdated, func(event *agent.Event) {
			event.Activity = &agent.ActivityEvent{
				ProviderItemID: activityID,
				Kind:           agent.ActivityKindMCPTool,
				Status:         "in_progress",
				Title:          "Tool progress",
				Summary:        chunk,
			}
		})
		redacted, persist := redactPrivateExecutionEventForTurn(active, event)
		if persist {
			progress.WriteString(redacted.Activity.Summary)
		}
	}
	if progress.String() != privateWorkingDirectoryRedaction+"/output.log" {
		t.Fatalf("redacted progress stream = %q", progress.String())
	}
	completedActivity := &agent.ActivityEvent{
		ProviderItemID: activityID,
		Kind:           agent.ActivityKindMCPTool,
		Status:         "completed",
		Title:          "Completed " + privateRoot,
	}
	completed := privateExecutionEvent(agent.Event{
		ConversationID:   "conversation-private-streams",
		TurnID:           "turn-private-streams",
		ProviderThreadID: "provider-thread-private-streams",
		ProviderTurnID:   "provider-turn-private-streams",
	}, agent.EventKindActivityCompleted, func(event *agent.Event) {
		event.Activity = completedActivity
	})
	redacted, persist = redactPrivateExecutionEventForTurn(active, completed)
	if !persist || redacted.Activity == nil ||
		redacted.Activity.Title != "Completed "+privateWorkingDirectoryRedaction {
		t.Fatalf("redacted completed activity = persist:%t event:%+v", persist, redacted)
	}
	if tail := active.privateStreamTails[privateActivityStreamKey(completedActivity)]; tail != "" {
		t.Fatalf("completed activity left private stream tail %q", tail)
	}
}

func TestArtifactPrivateExecutionValidationChecksCompiledStrings(t *testing.T) {
	privateRoot := t.TempDir()
	encodedPath := strings.ReplaceAll(strconv.Quote(privateRoot), "/", `\u002f`)
	source := "root = Document([Text(" + encodedPath + ")])"
	document, err := compileEmitArtifactSource(source)
	if err != nil {
		t.Fatalf("compile encoded private path: %v", err)
	}
	scope := conversationExecutionScope{workingDirectory: privateRoot}
	err = validateEmitArtifactPrivateExecutionDetails(
		emitArtifactInput{
			Title:    "Encoded path",
			Source:   source,
			document: document,
		},
		scope,
	)
	var failure *artifactToolFailureError
	if !errors.As(err, &failure) {
		t.Fatalf("encoded private path error = %v, want artifact tool failure", err)
	}
	if failure.code != artifactToolFailureInvalidField ||
		len(failure.fieldErrors) != 1 ||
		failure.fieldErrors[0].Field != "source" {
		t.Fatalf("encoded private path failure = %+v", failure)
	}
}

func TestArtifactPrivateExecutionValidationRejectsURLPathRepresentations(t *testing.T) {
	privateRoot := filepath.Join(t.TempDir(), "Application Support", "unbound conversation")
	privateFileURL := (&url.URL{
		Scheme: "file",
		Path:   filepath.Join(privateRoot, "result.md"),
	}).String()
	source := "root = Document([Text(" + strconv.Quote(privateFileURL) + ")])"
	document, err := compileEmitArtifactSource(source)
	if err != nil {
		t.Fatalf("compile private file URL: %v", err)
	}
	err = validateEmitArtifactPrivateExecutionDetails(
		emitArtifactInput{
			Title:    "Private file URL",
			Source:   source,
			document: document,
		},
		conversationExecutionScope{workingDirectory: privateRoot},
	)
	var failure *artifactToolFailureError
	if !errors.As(err, &failure) {
		t.Fatalf("private file URL error = %v, want artifact tool failure", err)
	}
	if failure.code != artifactToolFailureInvalidField ||
		len(failure.fieldErrors) != 1 ||
		failure.fieldErrors[0].Field != "source" {
		t.Fatalf("private file URL failure = %+v", failure)
	}
}

func privateExecutionEvent(
	base agent.Event,
	kind agent.EventKind,
	populate func(*agent.Event),
) agent.Event {
	event := base
	event.Kind = kind
	populate(&event)
	return event
}
