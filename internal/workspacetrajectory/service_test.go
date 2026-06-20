package workspacetrajectory

import (
	"context"
	"errors"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/orchestrator"
)

func TestServiceWorkflowSnapshotLoadsBoundChatRunActivity(t *testing.T) {
	execution := testWorkflowExecution()
	source := &stubTrajectoryChatSource{
		pages: map[string]chat.RunActivityPage{
			testChatRunID: {
				RunID: testChatRunID,
				Items: []chat.RunItem{
					testRunItem("item_service_workflow_read", chat.RunItemTypeDynamicToolCall, chat.RunItemStatusCompleted, "2026-06-18T10:10:00Z", func(item *chat.RunItem) {
						item.Namespace = chat.SettaAgentToolNamespace
						item.ToolName = chat.SettaWorkspaceFileReadToolName
						item.FileOperations = []chat.RunItemFileOp{{
							Path:       "main.go",
							Operation:  chat.RunItemFileOperationRead,
							RangeStart: 1,
							RangeEnd:   3,
						}}
					}),
				},
			},
		},
	}
	service, err := NewService(Config{
		ChatSource:     source,
		WorkflowSource: &stubTrajectoryWorkflowSource{execution: execution},
		Now:            fixedClock("2026-06-18T10:10:01Z"),
	})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}

	snapshot, err := service.ReadRuntimeSnapshot(context.Background(), RuntimeFilter{
		WorkspaceID:         testWorkspaceID,
		WorkflowExecutionID: testWorkflowExecutionID,
		Limit:               20,
	})
	if err != nil {
		t.Fatalf("read runtime snapshot: %v", err)
	}
	if len(source.loadedRunIDs) != 1 || source.loadedRunIDs[0] != testChatRunID {
		t.Fatalf("loaded run ids = %+v, want %s", source.loadedRunIDs, testChatRunID)
	}
	sprite := spriteByID(t, snapshot.Sprites, "run-item:item_service_workflow_read")
	if sprite.Kind != SpriteKindFileRead ||
		sprite.WorkflowExecutionID != testWorkflowExecutionID ||
		sprite.WorkflowNodeID != testWorkflowNodeID ||
		len(sprite.FileRefs) != 1 ||
		sprite.FileRefs[0].Operation != FileOperationRead ||
		sprite.FileRefs[0].Path != "main.go" ||
		sprite.FileRefs[0].RangeStart != 1 ||
		sprite.FileRefs[0].RangeEnd != 3 {
		t.Fatalf("workflow-bound chat sprite = %+v", sprite)
	}
}

func TestServicePublishesRevisionedDeltasAndDeterministicSnapshotRequiredGap(t *testing.T) {
	now := fixedClock("2026-06-18T11:00:00Z")
	service, err := NewService(Config{Now: now})
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	firstEvent, ok, err := service.PublishChatEvent(chatEvent(t, chat.EventTypeRunItemUpdated, chat.RunItemUpdatedPayload{
		Item: testRunItem("item_service_first", chat.RunItemTypeReasoning, chat.RunItemStatusRunning, "2026-06-18T11:00:01Z", nil),
	}))
	if err != nil {
		t.Fatalf("publish first event: %v", err)
	}
	assertFirstRuntimeEvent(t, firstEvent, ok)
	publishGapEvents(t, service)

	gapSubscription, err := service.SubscribeRuntimeChanges(RuntimeEventCursor{StreamID: defaultRuntimeStreamID, Sequence: 1})
	if err != nil {
		t.Fatalf("subscribe gap cursor: %v", err)
	}
	defer gapSubscription.Unsubscribe()
	assertGapEvent(t, receiveRuntimeEvent(t, gapSubscription))

	replaySubscription, err := service.SubscribeRuntimeChanges(RuntimeEventCursor{StreamID: defaultRuntimeStreamID, Sequence: defaultRuntimeBufferSize + 2})
	if err != nil {
		t.Fatalf("subscribe replay cursor: %v", err)
	}
	defer replaySubscription.Unsubscribe()
	assertReplayEvent(t, receiveRuntimeEvent(t, replaySubscription))
}

func publishGapEvents(t *testing.T, service *Service) {
	t.Helper()
	for index := 0; index < defaultRuntimeBufferSize+2; index++ {
		itemID := "item_service_gap_" + time.Unix(int64(index), 0).UTC().Format("150405")
		_, ok, err := service.PublishChatEvent(chatEvent(t, chat.EventTypeRunItemUpdated, chat.RunItemUpdatedPayload{
			Item: testRunItem(itemID, chat.RunItemTypeCommandExecution, chat.RunItemStatusRunning, "2026-06-18T11:00:02Z", func(item *chat.RunItem) {
				item.Command = "./scripts/go.sh test ./internal/workspacetrajectory"
			}),
		}))
		if err != nil {
			t.Fatalf("publish gap event %d: %v", index, err)
		}
		if !ok {
			t.Fatalf("gap event %d was not published", index)
		}
	}
}

func assertFirstRuntimeEvent(t *testing.T, event WorkspaceTrajectoryRuntimeEvent, ok bool) {
	t.Helper()
	if !ok || event.Revision != 1 || event.Delta == nil || event.Delta.FromRevision != 0 || event.Delta.ToRevision != 1 {
		t.Fatalf("first runtime event = %+v", event)
	}
}

func assertGapEvent(t *testing.T, event WorkspaceTrajectoryRuntimeEvent) {
	t.Helper()
	if !event.SnapshotRequired || event.Delta != nil || event.Revision != defaultRuntimeBufferSize+3 {
		t.Fatalf("gap event = %+v", event)
	}
}

func assertReplayEvent(t *testing.T, event WorkspaceTrajectoryRuntimeEvent) {
	t.Helper()
	if event.SnapshotRequired ||
		event.Delta == nil ||
		event.Delta.FromRevision != defaultRuntimeBufferSize+2 ||
		event.Delta.ToRevision != defaultRuntimeBufferSize+3 {
		t.Fatalf("replay event = %+v", event)
	}
}

func receiveRuntimeEvent(t *testing.T, subscription *RuntimeEventSubscription) WorkspaceTrajectoryRuntimeEvent {
	t.Helper()
	select {
	case event, ok := <-subscription.Events:
		if !ok {
			t.Fatal("runtime subscription closed")
		}
		return event
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for runtime event")
	}
	return WorkspaceTrajectoryRuntimeEvent{}
}

func fixedClock(value string) func() time.Time {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		panic(err)
	}
	return func() time.Time {
		return parsed
	}
}

type stubTrajectoryChatSource struct {
	loadedRunIDs []string
	pages        map[string]chat.RunActivityPage
}

func (source *stubTrajectoryChatSource) LoadRunActivityPage(workspaceID string, runID string, _ int) (chat.RunActivityPage, error) {
	if workspaceID != testWorkspaceID {
		return chat.RunActivityPage{}, errors.New("unexpected workspace id")
	}
	source.loadedRunIDs = append(source.loadedRunIDs, runID)
	page, ok := source.pages[runID]
	if !ok {
		return chat.RunActivityPage{}, errors.New("missing run activity page")
	}
	return page, nil
}

func (source *stubTrajectoryChatSource) SubscribeEvents(chat.EventCursor) (*chat.EventSubscription, error) {
	return nil, errors.New("chat subscription is not used by this test")
}

type stubTrajectoryWorkflowSource struct {
	execution orchestrator.WorkflowExecution
}

func (source *stubTrajectoryWorkflowSource) ReadExecution(workspaceID string, executionID string) (orchestrator.WorkflowExecution, error) {
	if workspaceID != testWorkspaceID || executionID != source.execution.ID {
		return orchestrator.WorkflowExecution{}, errors.New("unexpected workflow execution request")
	}
	return source.execution, nil
}

func (source *stubTrajectoryWorkflowSource) ReadExecutionEventPage(string, string, int, int) (orchestrator.WorkflowExecutionEventPage, error) {
	return orchestrator.WorkflowExecutionEventPage{}, errors.New("workflow event page is not used by this test")
}

func (source *stubTrajectoryWorkflowSource) SubscribeEvents(orchestrator.WorkflowEventCursor) (*orchestrator.EventSubscription, error) {
	return nil, errors.New("workflow subscription is not used by this test")
}
