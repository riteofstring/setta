package workspacetrajectory

import (
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/chat"
	"setta/internal/orchestrator"
)

const (
	testWorkspaceID         = "workspace_trajectory_test"
	testChatRunID           = "run_trajectory_test"
	testConversationID      = "conversation_trajectory_test"
	testWorkflowExecutionID = "workflow_execution_trajectory_test"
	testWorkflowNodeID      = "workflow_node_trajectory_test"
	testWorkflowNodeRunID   = "workflow_node_run_trajectory_test"
)

func TestBuildSnapshotMapsTypedRunItemsToBoundedSprites(t *testing.T) {
	activity := chat.RunActivityPage{
		RunID: testChatRunID,
		Items: []chat.RunItem{
			testRunItem("item_command", chat.RunItemTypeCommandExecution, chat.RunItemStatusCompleted, "2026-06-18T10:00:01Z", func(item *chat.RunItem) {
				item.Command = "./scripts/go.sh test ./internal/chat"
				item.Cwd = "/workspace"
				item.ExitCode = 0
				item.DurationMs = 1234
			}),
			testRunItem("item_file", chat.RunItemTypeFileChange, chat.RunItemStatusCompleted, "2026-06-18T10:00:02Z", func(item *chat.RunItem) {
				item.FilePaths = []string{"internal/chat/service.go"}
				item.PatchStatus = "updated"
			}),
			testRunItem("item_diff", chat.RunItemTypeDiff, chat.RunItemStatusCompleted, "2026-06-18T10:00:03Z", func(item *chat.RunItem) {
				item.FilePaths = []string{"internal/chat/service.go", "internal/chat/types.go"}
				item.DiffSummary = "2 files changed"
				item.DiffStats = chat.RunItemDiffStats{
					Summary:      "typed diff summary",
					ChangedFiles: 2,
					Additions:    12,
					Deletions:    3,
					Structured:   true,
				}
			}),
			testRunItem("item_reasoning", chat.RunItemTypeReasoning, chat.RunItemStatusRunning, "2026-06-18T10:00:04Z", func(item *chat.RunItem) {
				item.Summary = "Reasoning summary updated"
				item.HiddenText = "private chain of thought must not render"
			}),
			testRunItem("item_read", chat.RunItemTypeMCPToolCall, chat.RunItemStatusCompleted, "2026-06-18T10:00:05Z", func(item *chat.RunItem) {
				item.ServerName = "filesystem"
				item.ToolName = "read_file"
				item.FileOperations = []chat.RunItemFileOp{{
					Path:       "internal/chat/types.go",
					Operation:  chat.RunItemFileOperationRead,
					RangeStart: 10,
					RangeEnd:   20,
				}}
			}),
		},
	}
	execution := testWorkflowExecution()
	snapshot := BuildSnapshot(SnapshotInput{
		Filter: RuntimeFilter{
			WorkspaceID:         testWorkspaceID,
			WorkflowExecutionID: testWorkflowExecutionID,
			ChatRunID:           testChatRunID,
			Limit:               10,
		},
		Revision:     7,
		GeneratedAt:  "2026-06-18T10:00:06Z",
		ChatActivity: activity,
		Workflow:     &execution,
	})

	assertSnapshotPayloadBudget(t, snapshot)
	if snapshot.Revision != 7 || snapshot.PayloadBudget.ByteSize <= 0 {
		t.Fatalf("snapshot revision/budget = %+v", snapshot)
	}
	assertCommandSprite(t, spriteByID(t, snapshot.Sprites, "run-item:item_command"))
	assertFileChangeSprite(t, spriteByID(t, snapshot.Sprites, "run-item:item_file"))
	assertDiffSprite(t, spriteByID(t, snapshot.Sprites, "run-item:item_diff"))
	assertReasoningSprite(t, spriteByID(t, snapshot.Sprites, "run-item:item_reasoning"))
	assertTypedFileReadSprite(t, spriteByID(t, snapshot.Sprites, "run-item:item_read"))
	if len(snapshot.AggregateByWorkflow) == 0 {
		t.Fatal("snapshot missing workflow aggregate")
	}
}

func TestDeltaFromRunItemUpdateDoesNotWaitForCartographer(t *testing.T) {
	item := testRunItem("item_delta_command", chat.RunItemTypeCommandExecution, chat.RunItemStatusRunning, "2026-06-18T10:01:00Z", func(item *chat.RunItem) {
		item.Command = "./scripts/go.sh test ./internal/workspacetrajectory"
	})
	event := chatEvent(t, chat.EventTypeRunItemUpdated, chat.RunItemUpdatedPayload{Item: item})

	delta, ok, err := DeltaFromChatEvent(event, 4, 5, "2026-06-18T10:01:01Z")
	if err != nil {
		t.Fatalf("delta from chat event: %v", err)
	}
	if !ok {
		t.Fatal("run item update did not produce trajectory delta")
	}
	if delta.FromRevision != 4 ||
		delta.ToRevision != 5 ||
		len(delta.SpriteUpdates) != 1 ||
		delta.SpriteUpdates[0].Kind != SpriteKindCommand ||
		len(delta.ChangedAreas) != 1 ||
		delta.ChangedAreas[0] != ChangeAreaRunItems {
		t.Fatalf("delta = %+v", delta)
	}
	assertDeltaPayloadBudget(t, delta)
}

func TestCommandTextDoesNotSynthesizeFileRead(t *testing.T) {
	item := testRunItem("item_sed_command", chat.RunItemTypeCommandExecution, chat.RunItemStatusCompleted, "2026-06-18T10:02:00Z", func(item *chat.RunItem) {
		item.Command = "sed -n '1,120p' internal/chat/types.go"
	})
	sprite, ok := SpriteFromRunItem(item, workflowBinding{})
	if !ok {
		t.Fatal("command run item did not produce sprite")
	}
	if sprite.Kind != SpriteKindCommand || len(sprite.FileRefs) != 0 {
		t.Fatalf("command was inferred as file read: %+v", sprite)
	}
}

func TestSnapshotLimitBoundsSpritesAndTimeline(t *testing.T) {
	items := []chat.RunItem{}
	longText := strings.Repeat("long trajectory text ", 80)
	for index := 0; index < 12; index++ {
		id := "item_bound_" + string(rune('a'+index))
		items = append(items, testRunItem(id, chat.RunItemTypeCommandExecution, chat.RunItemStatusCompleted, "2026-06-18T10:03:00Z", func(item *chat.RunItem) {
			item.Command = longText
			item.Summary = longText
			item.Result = longText
		}))
	}
	snapshot := BuildSnapshot(SnapshotInput{
		Filter: RuntimeFilter{
			WorkspaceID: testWorkspaceID,
			ChatRunID:   testChatRunID,
			Limit:       3,
		},
		Revision:     1,
		GeneratedAt:  "2026-06-18T10:03:01Z",
		ChatActivity: chat.RunActivityPage{RunID: testChatRunID, Items: items},
	})
	if len(snapshot.Sprites) > snapshot.Limits.MaxSprites ||
		len(snapshot.Timeline) > snapshot.Limits.MaxTimelineItems ||
		len(snapshot.DetailRefs) > snapshot.Limits.MaxDetailRefs ||
		snapshot.PayloadBudget.OmittedSpriteCount == 0 ||
		snapshot.PayloadBudget.TruncatedStringCount == 0 {
		t.Fatalf("snapshot bounds not enforced: %+v", snapshot)
	}
	assertSnapshotRefsAlignWithSprites(t, snapshot)
	assertSnapshotPayloadBudget(t, snapshot)
}

func TestTypedFileRefsAreBounded(t *testing.T) {
	fileRefs := []chat.RunItemFileOp{}
	for index := 0; index < 12; index++ {
		fileRefs = append(fileRefs, chat.RunItemFileOp{
			Path:      "internal/workspacetrajectory/file_ref_" + string(rune('a'+index)) + ".go",
			Operation: chat.RunItemFileOperationRead,
		})
	}
	item := testRunItem("item_many_refs", chat.RunItemTypeMCPToolCall, chat.RunItemStatusCompleted, "2026-06-18T10:04:00Z", func(item *chat.RunItem) {
		item.FileOperations = fileRefs
	})
	sprite, ok := SpriteFromRunItem(item, workflowBinding{})
	if !ok {
		t.Fatal("typed file refs did not produce sprite")
	}
	delta := EmptyRuntimeDelta(testWorkspaceID, 1, 2, "2026-06-18T10:04:01Z")
	appendSpriteDelta(&delta, sprite)
	limits := runtimeLimits(DefaultRuntimeLimit)
	finalizeDelta(&delta, limits)
	if len(delta.SpriteUpdates) != 1 || len(delta.SpriteUpdates[0].FileRefs) != limits.MaxFileRefsPerSprite {
		t.Fatalf("unexpected delta after finalize: %+v", delta)
	}
	assertDeltaPayloadBudget(t, delta)
}

func testRunItem(id string, itemType chat.RunItemType, status chat.RunItemStatus, updatedAt string, mutate func(*chat.RunItem)) chat.RunItem {
	item := chat.RunItem{
		SchemaVersion:  chat.SchemaVersion,
		ID:             id,
		WorkspaceID:    testWorkspaceID,
		ConversationID: testConversationID,
		RunID:          testChatRunID,
		ProviderItemID: "provider_" + id,
		Type:           itemType,
		Status:         status,
		CreatedAt:      updatedAt,
		StartedAt:      updatedAt,
		CompletedAt:    updatedAt,
		Title:          "",
		Summary:        "",
		FilePaths:      []string{},
	}
	if mutate != nil {
		mutate(&item)
	}
	return item
}

func testWorkflowExecution() orchestrator.WorkflowExecution {
	return orchestrator.WorkflowExecution{
		SchemaVersion:          orchestrator.SchemaVersion,
		ID:                     testWorkflowExecutionID,
		WorkspaceID:            testWorkspaceID,
		Status:                 orchestrator.ExecutionStatusRunning,
		UpdatedAt:              "2026-06-18T10:00:06Z",
		ActiveNodeExecutionIDs: []string{testWorkflowNodeRunID},
		NodeExecutions: []orchestrator.WorkflowNodeExecution{{
			SchemaVersion: orchestrator.SchemaVersion,
			ID:            testWorkflowNodeRunID,
			ExecutionID:   testWorkflowExecutionID,
			NodeID:        testWorkflowNodeID,
			Status:        orchestrator.NodeExecutionStatusRunning,
			StartedAt:     "2026-06-18T10:00:00Z",
			RunnerRefs: []orchestrator.WorkflowActionRunnerRef{
				{Kind: orchestrator.RunnerRefChatRun, ID: testChatRunID},
			},
		}},
	}
}

func chatEvent(t *testing.T, eventType string, payload any) chat.Event {
	t.Helper()
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return chat.Event{
		SchemaVersion:  chat.EventSchemaVersion,
		StreamID:       "chat_stream_test",
		Sequence:       1,
		EventID:        "chat_stream_test:1",
		Type:           eventType,
		EmittedAt:      "2026-06-18T10:01:01Z",
		WorkspaceID:    testWorkspaceID,
		ConversationID: testConversationID,
		RunID:          testChatRunID,
		Payload:        encoded,
	}
}

func spriteByID(t *testing.T, sprites []WorkspaceTrajectorySprite, id string) WorkspaceTrajectorySprite {
	t.Helper()
	for _, sprite := range sprites {
		if sprite.ID == id {
			return sprite
		}
	}
	t.Fatalf("sprite %s not found in %+v", id, sprites)
	return WorkspaceTrajectorySprite{}
}

func assertCommandSprite(t *testing.T, sprite WorkspaceTrajectorySprite) {
	t.Helper()
	if sprite.Kind != SpriteKindCommand ||
		sprite.Command.Command != "./scripts/go.sh test ./internal/chat" ||
		sprite.WorkflowNodeID != testWorkflowNodeID ||
		sprite.WorkflowNodeExecutionID != testWorkflowNodeRunID {
		t.Fatalf("command sprite = %+v", sprite)
	}
}

func assertFileChangeSprite(t *testing.T, sprite WorkspaceTrajectorySprite) {
	t.Helper()
	if sprite.Kind != SpriteKindFileWrite ||
		len(sprite.FileRefs) != 1 ||
		sprite.FileRefs[0].Operation != FileOperationWrite {
		t.Fatalf("file change sprite = %+v", sprite)
	}
}

func assertDiffSprite(t *testing.T, sprite WorkspaceTrajectorySprite) {
	t.Helper()
	if sprite.Kind != SpriteKindDiff ||
		!sprite.DiffStats.Structured ||
		sprite.DiffStats.Additions != 12 ||
		sprite.DiffStats.Deletions != 3 {
		t.Fatalf("diff sprite = %+v", sprite)
	}
}

func assertReasoningSprite(t *testing.T, sprite WorkspaceTrajectorySprite) {
	t.Helper()
	if sprite.Kind != SpriteKindReasoningSummary ||
		strings.Contains(sprite.ResultSummary+sprite.Subtitle, "private chain of thought") {
		t.Fatalf("reasoning sprite leaked hidden text: %+v", sprite)
	}
}

func assertTypedFileReadSprite(t *testing.T, sprite WorkspaceTrajectorySprite) {
	t.Helper()
	if sprite.Kind != SpriteKindFileRead ||
		len(sprite.FileRefs) != 1 ||
		sprite.FileRefs[0].RangeStart != 10 {
		t.Fatalf("typed file read sprite = %+v", sprite)
	}
}

func assertSnapshotPayloadBudget(t *testing.T, snapshot WorkspaceTrajectoryRuntimeSnapshot) {
	t.Helper()
	if snapshot.PayloadBudget.ByteSize > snapshot.PayloadBudget.MaxByteSize {
		t.Fatalf("snapshot payload budget exceeded: %+v", snapshot.PayloadBudget)
	}
	if snapshot.PayloadBudget.MaxByteSize != MaxSnapshotPayloadBytes {
		t.Fatalf("snapshot max byte budget = %d", snapshot.PayloadBudget.MaxByteSize)
	}
}

func assertDeltaPayloadBudget(t *testing.T, delta WorkspaceTrajectoryRuntimeDelta) {
	t.Helper()
	if delta.PayloadBudget.ByteSize > delta.PayloadBudget.MaxByteSize {
		t.Fatalf("delta payload budget exceeded: %+v", delta.PayloadBudget)
	}
	if delta.PayloadBudget.MaxByteSize != MaxDeltaPayloadBytes {
		t.Fatalf("delta max byte budget = %d", delta.PayloadBudget.MaxByteSize)
	}
}

func assertSnapshotRefsAlignWithSprites(t *testing.T, snapshot WorkspaceTrajectoryRuntimeSnapshot) {
	t.Helper()
	retained := map[string]bool{}
	for _, sprite := range snapshot.Sprites {
		retained[sprite.ID] = true
	}
	for _, item := range snapshot.Timeline {
		if !retained[item.SpriteID] {
			t.Fatalf("timeline item references omitted sprite: %+v", item)
		}
	}
	for _, ref := range snapshot.DetailRefs {
		if !retained[ref.SpriteID] {
			t.Fatalf("detail ref references omitted sprite: %+v", ref)
		}
	}
}
