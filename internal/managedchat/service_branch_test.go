package managedchat

import (
	"errors"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/projectstate"
)

// Continuation should seed history from the latest available run even when the
// source chat was last written by an external-agent runtime.
func TestServiceStartChatContinueFromChatSeedsExternalSourceHistory(t *testing.T) {
	t.Parallel()

	starter := &stubManagedChatStarter{}
	fixture := newManagedChatFixture(t, nil, starter)
	sourceRun := agentruns.NewRun(nil, map[string]any{
		"runType":         "external_agent",
		"chatId":          "chat-source",
		"projectConfigId": "project-alpha",
		"messages": []any{
			userMessage("source-user", "Seed prompt"),
		},
	}, time.Date(2026, 3, 8, 17, 0, 0, 0, time.UTC))
	sourceRun.Status = agentruns.RunStatusCompleted
	finishedAt := time.Date(2026, 3, 8, 17, 0, 5, 0, time.UTC)
	sourceRun.FinishedAt = &finishedAt
	sourceRun.Outputs = map[string]any{
		"messages": []any{
			userMessage("source-user", "Seed prompt"),
			assistantMessage("source-assistant", "Seed reply"),
		},
	}
	saveManagedChatRun(t, fixture.runs, sourceRun)

	_, err := fixture.service.StartChat(StartChatRequest{
		ContinueFromChatID: stringPtr("chat-source"),
		Message:            userMessage("new-user", "Continue this chat."),
		EngineConfigID:     "engine-managed",
		ProjectConfigID:    "project-alpha",
		AllowUnscoped:      true,
		PermissionMode:     projectstate.ChatPermissionModeMinimal,
		SearchEnabled:      true,
	})
	if err != nil {
		t.Fatalf("start chat: %v", err)
	}
	rawMessages, ok := starter.lastInputs["messages"].([]any)
	if !ok {
		t.Fatalf("expected managed messages payload, got %#v", starter.lastInputs["messages"])
	}
	if len(rawMessages) != 3 {
		t.Fatalf("expected seeded history plus new message, got %#v", rawMessages)
	}
	if message, ok := rawMessages[0].(map[string]any); !ok || message["id"] != "source-user" {
		t.Fatalf("expected first seeded message, got %#v", rawMessages[0])
	}
	if message, ok := rawMessages[1].(map[string]any); !ok || message["id"] != "source-assistant" {
		t.Fatalf("expected second seeded message, got %#v", rawMessages[1])
	}
	if message, ok := rawMessages[2].(map[string]any); !ok || message["id"] != "new-user" {
		t.Fatalf("expected final new message, got %#v", rawMessages[2])
	}
}

// Managed continuation should fail closed when the source chat belongs to the
// scriptable-chat runtime instead of seeding incompatible history.
func TestServiceStartChatContinueFromChatRejectsScriptableSourceHistory(t *testing.T) {
	t.Parallel()

	starter := &stubManagedChatStarter{}
	fixture := newManagedChatFixture(t, nil, starter)
	sourceRun := agentruns.NewRun(nil, map[string]any{
		"runType":         "scriptable_chat",
		"chatId":          "chat-scriptable",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 17, 30, 0, 0, time.UTC))
	sourceRun.Status = agentruns.RunStatusCompleted
	finishedAt := time.Date(2026, 3, 8, 17, 30, 5, 0, time.UTC)
	sourceRun.FinishedAt = &finishedAt
	sourceRun.Outputs = map[string]any{
		"messages": []any{
			assistantMessage("scriptable-assistant", "Scriptable reply"),
		},
	}
	saveManagedChatRun(t, fixture.runs, sourceRun)

	_, err := fixture.service.StartChat(StartChatRequest{
		ContinueFromChatID: stringPtr("chat-scriptable"),
		Message:            userMessage("new-user", "Continue this chat."),
		EngineConfigID:     "engine-managed",
		ProjectConfigID:    "project-alpha",
		AllowUnscoped:      true,
		PermissionMode:     projectstate.ChatPermissionModeMinimal,
		SearchEnabled:      true,
	})
	if !errors.Is(err, ErrChatEngineMismatch) {
		t.Fatalf("expected ErrChatEngineMismatch, got %v", err)
	}
	if starter.lastInputs != nil {
		t.Fatalf("expected managed starter not to be invoked, got %#v", starter.lastInputs)
	}
}

// Reusing an explicit managed chat id must also fail closed when that chat id
// already belongs to the scriptable runtime.
func TestServiceStartChatRejectsScriptableHistoryOnReusedChatID(t *testing.T) {
	t.Parallel()

	starter := &stubManagedChatStarter{}
	fixture := newManagedChatFixture(t, nil, starter)
	sourceRun := agentruns.NewRun(nil, map[string]any{
		"runType":         "scriptable_chat",
		"chatId":          "chat-scriptable",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 17, 45, 0, 0, time.UTC))
	sourceRun.Status = agentruns.RunStatusCompleted
	finishedAt := time.Date(2026, 3, 8, 17, 45, 5, 0, time.UTC)
	sourceRun.FinishedAt = &finishedAt
	sourceRun.Outputs = map[string]any{
		"messages": []any{
			assistantMessage("scriptable-assistant", "Scriptable reply"),
		},
	}
	saveManagedChatRun(t, fixture.runs, sourceRun)

	_, err := fixture.service.StartChat(StartChatRequest{
		ChatID:          stringPtr("chat-scriptable"),
		Message:         userMessage("new-user", "Reuse this chat."),
		EngineConfigID:  "engine-managed",
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if !errors.Is(err, ErrChatEngineMismatch) {
		t.Fatalf("expected ErrChatEngineMismatch, got %v", err)
	}
	if starter.lastInputs != nil {
		t.Fatalf("expected managed starter not to be invoked, got %#v", starter.lastInputs)
	}
}

// Branch-edit validation should fail before runtime start if the branch source
// message cannot be found in the parent managed chat history.
func TestServiceStartChatBranchEditMissingMessageReturnsNotFound(t *testing.T) {
	t.Parallel()

	starter := &stubManagedChatStarter{}
	fixture := newManagedChatFixture(t, nil, starter)
	run := newManagedChatRun(
		t,
		managedChatRunOptions{
			chatID:          "chat-parent",
			projectConfigID: "project-alpha",
			engineConfigID:  "engine-managed",
			startedAt:       time.Date(2026, 3, 8, 18, 0, 0, 0, time.UTC),
			status:          agentruns.RunStatusCompleted,
			inputMessages:   []map[string]any{userMessage("msg-1", "Original prompt")},
			outputMessages:  []map[string]any{userMessage("msg-1", "Original prompt")},
		},
	)
	saveManagedChatRun(t, fixture.runs, run)

	_, err := fixture.service.StartChat(StartChatRequest{
		Message:             userMessage("edited", "Edited prompt"),
		EngineConfigID:      "engine-managed",
		ProjectConfigID:     "project-alpha",
		AllowUnscoped:       true,
		BranchParentChatID:  stringPtr("chat-parent"),
		BranchFromMessageID: stringPtr("missing"),
		PermissionMode:      projectstate.ChatPermissionModeMinimal,
		SearchEnabled:       true,
	})
	var branchErr *BranchMessageNotFoundError
	if !errors.As(err, &branchErr) {
		t.Fatalf("expected branch message not found error, got %v", err)
	}
	if starter.lastInputs != nil {
		t.Fatalf("expected branch validation failure before start, got %#v", starter.lastInputs)
	}
}

func TestNormalizeStartChatRequestRejectsContinueFromWithBranchEdits(t *testing.T) {
	t.Parallel()

	_, err := normalizeStartChatRequest(StartChatRequest{
		Message:             userMessage("user-1", "Edit this branch"),
		ProjectConfigID:     "project-alpha",
		AllowUnscoped:       true,
		ContinueFromChatID:  stringPtr("chat-seed"),
		BranchParentChatID:  stringPtr("chat-parent"),
		BranchFromMessageID: stringPtr("msg-1"),
		PermissionMode:      projectstate.ChatPermissionModeMinimal,
	}, testAppGenerationModes(t))
	if !errors.Is(err, ErrContinueFromChatWithBranchEdits) {
		t.Fatalf("expected ErrContinueFromChatWithBranchEdits, got %v", err)
	}
}

func TestServiceBuildStartChatInputsAddsBranchMetadata(t *testing.T) {
	t.Parallel()

	service := &Service{
		timeNow: func() time.Time {
			return time.Date(2026, 3, 9, 12, 0, 0, 0, time.UTC)
		},
	}
	normalizedRequest := normalizedStartChatRequest{
		Message:               userMessage("edited", "Edited prompt"),
		Thinking:              true,
		ProjectConfigID:       "project-alpha",
		SectionID:             stringPtr("section-1"),
		FrontendAffinityToken: stringPtr("frontend-token"),
		AllowUnscoped:         false,
		BranchParentChatID:    stringPtr("chat-parent"),
		BranchFromMessageID:   stringPtr("msg-1"),
		IsBranchRequest:       true,
		PermissionMode:        projectstate.ChatPermissionModeYOLO,
		SearchEnabled:         true,
	}
	parentRun := agentruns.NewRun(nil, map[string]any{
		"branchRootChatId": "root-chat",
	}, time.Date(2026, 3, 9, 11, 0, 0, 0, time.UTC))
	inputs := service.buildStartChatInputs(
		normalizedRequest,
		"engine-managed",
		startChatConversation{
			ChatID:        "chat-branch",
			PriorMessages: []map[string]any{userMessage("msg-1", "Original prompt")},
			ParentRun:     &parentRun,
		},
		map[string]string{"msg-1": string(agentruns.AppGenerationModeJSONRender)},
	)

	if got := inputs["chatId"]; got != "chat-branch" {
		t.Fatalf("expected chat id, got %#v", got)
	}
	if got := inputs["branchParentChatId"]; got != "chat-parent" {
		t.Fatalf("expected branch parent chat id, got %#v", got)
	}
	if got := inputs["branchFromMessageId"]; got != "msg-1" {
		t.Fatalf("expected branch source message id, got %#v", got)
	}
	if got := inputs["branchRootChatId"]; got != "root-chat" {
		t.Fatalf("expected branch root chat id, got %#v", got)
	}
	if got := inputs["frontendAffinityToken"]; got != "frontend-token" {
		t.Fatalf("expected frontend affinity token, got %#v", got)
	}
	if got := inputs["sectionId"]; got != "section-1" {
		t.Fatalf("expected section id, got %#v", got)
	}
	branchCreatedAt, ok := inputs["branchCreatedAt"].(int64)
	if !ok {
		t.Fatalf("expected int64 branchCreatedAt, got %#v", inputs["branchCreatedAt"])
	}
	expectedCreatedAt := time.Date(2026, 3, 9, 12, 0, 0, 0, time.UTC).UnixMilli()
	if branchCreatedAt != expectedCreatedAt {
		t.Fatalf("expected branchCreatedAt %d, got %d", expectedCreatedAt, branchCreatedAt)
	}
}

func TestBuildBranchMessagesReplacesTargetAndTruncatesDescendants(t *testing.T) {
	t.Parallel()

	result, err := buildBranchMessages(
		[]map[string]any{
			userMessage("msg-1", "Original"),
			assistantMessage("msg-2", "Reply"),
			userMessage("msg-3", "Later"),
		},
		userMessage("edited", "Edited"),
		"msg-1",
	)
	if err != nil {
		t.Fatalf("build branch messages: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected one branched message, got %#v", result)
	}
	if got := result[0]["id"]; got != "msg-1" {
		t.Fatalf("expected edited message to reuse target id, got %#v", got)
	}
	content, ok := result[0]["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("expected edited content payload, got %#v", result[0]["content"])
	}
	firstPart, ok := content[0].(map[string]any)
	if !ok || firstPart["text"] != "Edited" {
		t.Fatalf("expected edited content text, got %#v", result[0]["content"])
	}
}

func TestBuildBranchMessagesMissingTargetReturnsTypedNotFound(t *testing.T) {
	t.Parallel()

	_, err := buildBranchMessages(
		[]map[string]any{
			userMessage("msg-1", "Original"),
		},
		userMessage("edited", "Edited"),
		"missing",
	)
	var branchErr *BranchMessageNotFoundError
	if !errors.As(err, &branchErr) {
		t.Fatalf("expected typed branch message error, got %v", err)
	}
	if branchErr.MessageID != "missing" {
		t.Fatalf("expected missing message id to round-trip, got %#v", branchErr)
	}
}

// Managed sends should fail explicitly when the runtime boundary exists but the
// underlying executor is still unavailable in the real app wiring.
func TestServiceStartChatReturnsExecutorUnavailableWhenStarterDisabled(t *testing.T) {
	t.Parallel()

	fixture := newManagedChatFixture(t, nil, &stubManagedChatStarter{disabled: true})

	_, err := fixture.service.StartChat(StartChatRequest{
		Message:         userMessage("user-1", "Hello"),
		EngineConfigID:  "engine-managed",
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  projectstate.ChatPermissionModeMinimal,
		SearchEnabled:   true,
	})
	if !errors.Is(err, agentruns.ErrManagedExecutorUnavailable) {
		t.Fatalf("expected managed executor unavailable, got %v", err)
	}
}
