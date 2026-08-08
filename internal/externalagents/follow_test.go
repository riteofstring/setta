package externalagents

import (
	"context"
	"fmt"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/mcpx"
	"setta/internal/realtime"
	"setta/internal/tools"
)

type stubFollowToolProvider struct {
	descriptors map[string]mcpx.ToolDescriptor
}

func (s stubFollowToolProvider) ToolDescriptorsForServers(serverIDs map[string]struct{}) map[string]mcpx.ToolDescriptor {
	filtered := map[string]mcpx.ToolDescriptor{}
	for name, descriptor := range s.descriptors {
		if len(serverIDs) != 0 {
			if _, ok := serverIDs[descriptor.ServerID]; !ok {
				continue
			}
		}
		filtered[name] = descriptor
	}
	return filtered
}

type captureFollowBroadcaster struct {
	messages   []realtime.AIFollowToolArgumentsUpdateMessage
	selections []realtime.Selection
}

func (c *captureFollowBroadcaster) BroadcastJSON(_ context.Context, message any, selection realtime.Selection) (int, error) {
	typed, ok := message.(realtime.AIFollowToolArgumentsUpdateMessage)
	if !ok {
		return 0, fmt.Errorf("unexpected follow message type %T", message)
	}
	c.messages = append(c.messages, typed)
	c.selections = append(c.selections, selection)
	return 1, nil
}

func TestRuntimeSetLiveChatStateSyncsExternalAIFollowAndStopClearsIt(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	temporaryIDs, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(root))
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}
	temporaryID, err := temporaryIDs.EnsureTemporaryID("section-alpha")
	if err != nil {
		t.Fatalf("ensure temporary id: %v", err)
	}
	broadcaster := &captureFollowBroadcaster{}
	follow := newSectionFollowService(t, temporaryIDs, broadcaster)
	runtime, err := NewRuntime(RuntimeOptions{
		Runs:   store,
		Follow: follow,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	run := persistFollowTestRun(t, store, "run-follow-live")
	if err := runtime.ActivateRun(run.ID, &stubRunController{}); err != nil {
		t.Fatalf("activate run: %v", err)
	}

	if err := runtime.SetLiveChatState(run.ID, ChatState{
		Messages: []map[string]any{
			{
				"id":      "assistant-1",
				"role":    "assistant",
				"content": []any{},
				"tool_calls": []any{
					map[string]any{
						"id": "tool-call-1",
						"function": map[string]any{
							"name": sectionFollowToolName(),
							"arguments": map[string]any{
								"sectionId": temporaryID,
							},
						},
					},
				},
			},
		},
		ToolCallArguments: map[string]string{
			"tool-call-1": `{"sectionId":"` + temporaryID + `"}`,
		},
		WaitingForResponse: true,
	}); err != nil {
		t.Fatalf("set live chat state: %v", err)
	}

	snapshot := follow.Snapshot("project-alpha")
	if len(snapshot) != 1 {
		t.Fatalf("expected one follow snapshot entry, got %#v", snapshot)
	}
	if len(snapshot[0].IDsByType["section"]) != 1 || snapshot[0].IDsByType["section"][0] != "section-alpha" {
		t.Fatalf("unexpected follow snapshot ids %#v", snapshot[0].IDsByType)
	}
	if len(broadcaster.messages) != 1 {
		t.Fatalf("expected one follow broadcast, got %#v", broadcaster.messages)
	}
	if broadcaster.selections[0].Type != realtime.ConnectionTypeFrontend {
		t.Fatalf("unexpected follow selection %#v", broadcaster.selections[0])
	}

	if _, err := runtime.StopRun(run.ID); err != nil {
		t.Fatalf("stop run: %v", err)
	}

	if remaining := follow.Snapshot("project-alpha"); len(remaining) != 0 {
		t.Fatalf("expected follow snapshot clear after stop, got %#v", remaining)
	}
	if len(broadcaster.messages) != 2 {
		t.Fatalf("expected clear broadcast after stop, got %#v", broadcaster.messages)
	}
	if broadcaster.messages[1].Content.IDsByType == nil || len(broadcaster.messages[1].Content.IDsByType) != 0 {
		t.Fatalf("expected empty follow clear payload, got %#v", broadcaster.messages[1].Content.IDsByType)
	}
}

func TestRuntimeRespondToApprovalClearsExternalAIFollowState(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	broadcaster := &captureFollowBroadcaster{}
	follow := newSectionFollowService(t, nil, broadcaster)
	runtime, err := NewRuntime(RuntimeOptions{
		Runs:   store,
		Follow: follow,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	run := persistFollowTestRun(t, store, "run-follow-approval")
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := runtime.SetLiveChatState(run.ID, ChatState{
		Messages: []map[string]any{
			{
				"id":      "approval-1",
				"role":    "assistant",
				"content": []any{},
				"tool_calls": []any{
					map[string]any{
						"id": "approval-1",
						"function": map[string]any{
							"name": sectionFollowToolName(),
							"arguments": map[string]any{
								"sectionId": "section-alpha",
							},
						},
					},
				},
			},
		},
		ToolCallArguments: map[string]string{
			"approval-1": `{"sectionId":"section-alpha"}`,
		},
		WaitingForResponse: true,
	}); err != nil {
		t.Fatalf("set live approval state: %v", err)
	}
	if err := runtime.RegisterApproval(ApprovalState{
		ApprovalID:      "approval-1",
		RunID:           run.ID,
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
	}); err != nil {
		t.Fatalf("register approval: %v", err)
	}

	if err := runtime.RespondToApproval("approval-1", true); err != nil {
		t.Fatalf("respond to approval: %v", err)
	}

	if remaining := follow.Snapshot("project-alpha"); len(remaining) != 0 {
		t.Fatalf("expected follow snapshot clear after approval response, got %#v", remaining)
	}
	if len(broadcaster.messages) != 2 {
		t.Fatalf("expected follow update and clear broadcasts, got %#v", broadcaster.messages)
	}
	if broadcaster.messages[1].Content.IDsByType == nil || len(broadcaster.messages[1].Content.IDsByType) != 0 {
		t.Fatalf("expected empty approval clear payload, got %#v", broadcaster.messages[1].Content.IDsByType)
	}
}

func TestFollowServiceSkipsUnknownTemporaryIDs(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	temporaryIDs, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(root))
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}
	follow := newSectionFollowService(t, temporaryIDs, nil)
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-alpha",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.ID = "run-follow-unknown-temp"

	err = follow.SyncRun(context.Background(), run, ChatState{
		Messages: []map[string]any{
			{
				"id":      "assistant-1",
				"role":    "assistant",
				"content": []any{},
				"tool_calls": []any{
					map[string]any{
						"id": "tool-call-1",
						"function": map[string]any{
							"name": sectionFollowToolName(),
							"arguments": map[string]any{
								"sectionId": "999",
							},
						},
					},
				},
			},
		},
		ToolCallArguments: map[string]string{
			"tool-call-1": `{"sectionId":"999"}`,
		},
	})
	if err != nil {
		t.Fatalf("sync follow with unknown temporary id: %v", err)
	}
	if snapshot := follow.Snapshot("project-alpha"); len(snapshot) != 0 {
		t.Fatalf("expected unknown temporary id to be skipped, got %#v", snapshot)
	}
}

func newSectionFollowService(t *testing.T, temporaryIDs *mcpx.TemporaryIDStore, broadcaster FollowBroadcaster) *FollowService {
	t.Helper()

	toolName := sectionFollowToolName()
	follow, err := NewFollowService(FollowServiceOptions{
		Tools: stubFollowToolProvider{
			descriptors: map[string]mcpx.ToolDescriptor{
				toolName: {
					ServerID:       mcpx.DefaultServerID,
					NamespacedName: toolName,
					Metadata: &tools.Metadata{
						IDPathsByType: map[tools.IDType][]string{
							tools.IDTypeSection: {"sectionId"},
						},
					},
				},
			},
		},
		TemporaryIDs: temporaryIDs,
		Broadcaster:  broadcaster,
	})
	if err != nil {
		t.Fatalf("new follow service: %v", err)
	}
	return follow
}

func sectionFollowToolName() string {
	return mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "setSectionSize")
}

func persistFollowTestRun(t *testing.T, store *agentruns.RunStore, runID string) agentruns.Run {
	t.Helper()

	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-alpha",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-alpha",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.ID = runID
	run.Status = agentruns.RunStatusRunning
	if err := store.Save(run); err != nil {
		t.Fatalf("save follow test run: %v", err)
	}
	return run
}
