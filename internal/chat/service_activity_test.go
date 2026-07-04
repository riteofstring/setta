package chat

import "testing"

// TestMergeRunItemPreservesSource proves a later upsert that omits the command source does not
// clear a previously projected one. The Codex schema makes commandExecution.source optional, so an
// update notification can arrive without it; a background terminal startup's unified_exec_startup
// discriminator must survive the merge so the lifecycle keys off the source, not command text.
func TestMergeRunItemPreservesSource(t *testing.T) {
	startup := RunItemCommandSourceUnifiedExecStartup
	existing := RunItem{
		ID:             "run_item_1",
		ProviderItemID: "provider_1",
		Type:           RunItemTypeCommandExecution,
		Details: NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{
			Command:   "npm run dev",
			ProcessID: "proc_1",
			Source:    &startup,
		}),
	}

	// A later upsert that omits source must preserve the existing discriminator.
	merged := mergeRunItem(existing, RunItem{
		ProviderItemID: "provider_1",
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusCompleted,
	})
	mergedDetails, ok := merged.CommandExecutionDetails()
	if !ok {
		t.Fatal("merged command details missing")
	}
	if mergedDetails.Source == nil || *mergedDetails.Source != RunItemCommandSourceUnifiedExecStartup {
		t.Fatalf("merged source = %v, want preserved unified_exec_startup", mergedDetails.Source)
	}
	if mergedDetails.ProcessID != "proc_1" {
		t.Fatalf("merged processId = %q, want preserved proc_1", mergedDetails.ProcessID)
	}

	// A later upsert that sets a source still overrides it.
	interaction := RunItemCommandSourceUnifiedExecInteraction
	overridden := mergeRunItem(existing, RunItem{
		ProviderItemID: "provider_1",
		Type:           RunItemTypeCommandExecution,
		Details: NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{
			Source: &interaction,
		}),
	})
	overriddenDetails, ok := overridden.CommandExecutionDetails()
	if !ok {
		t.Fatal("overridden command details missing")
	}
	if overriddenDetails.Source == nil || *overriddenDetails.Source != RunItemCommandSourceUnifiedExecInteraction {
		t.Fatalf("merged source = %v, want overriding unified_exec_interaction", overriddenDetails.Source)
	}
}

func TestMergeRunItemPreservesFileChangePaths(t *testing.T) {
	existing := RunItem{
		ID:             "run_item_1",
		ProviderItemID: "provider_1",
		Type:           RunItemTypeFileChange,
		Details: newRunItemFileChangeDetails("updated", []RunItemFileChangePath{
			{Path: "main.go", Operation: runItemFileChangeOperationPtr(RunItemFileChangeOperationUpdate), Additions: 2},
		}),
	}

	merged := mergeRunItem(existing, RunItem{
		ProviderItemID: "provider_1",
		Type:           RunItemTypeFileChange,
		Status:         RunItemStatusCompleted,
		Details:        newRunItemFileChangeDetails("completed", nil),
	})

	details, ok := merged.FileChangeDetails()
	if !ok {
		t.Fatal("merged file change details missing")
	}
	if details.PatchStatus != "completed" {
		t.Fatalf("patch status = %q, want completed", details.PatchStatus)
	}
	if len(details.Paths) != 1 || details.Paths[0].Path != "main.go" {
		t.Fatalf("paths = %+v, want preserved main.go path", details.Paths)
	}
	if details.Additions != 2 {
		t.Fatalf("additions = %d, want preserved 2", details.Additions)
	}
}

func TestServiceUpsertsStructuredPlanUpdatesInPlace(t *testing.T) {
	const providerItemID = "plan_turn_fake"
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventRunItem, ProviderItemID: providerItemID, RunItem: RunItem{
			ProviderItemID: providerItemID,
			Type:           RunItemTypePlan,
			Status:         RunItemStatusRunning,
			Summary:        "",
			Details: NewRunItemPlanDetails(RunItemPlanDetails{
				Explanation: "Preparing the implementation.",
				Steps: []RunItemPlanStep{
					{Status: RunItemPlanStepStatusInProgress, Step: "Read the plan"},
					{Status: RunItemPlanStepStatusPending, Step: "Implement the typed contract"},
				},
			}),
		}},
		{Type: FakeEventRunItem, ProviderItemID: providerItemID, RunItem: RunItem{
			ProviderItemID: providerItemID,
			Type:           RunItemTypePlan,
			Status:         RunItemStatusRunning,
			Summary:        "",
			Details: NewRunItemPlanDetails(RunItemPlanDetails{
				Explanation: "Updating the implementation plan.",
				Steps: []RunItemPlanStep{
					{Status: RunItemPlanStepStatusCompleted, Step: "Read the plan"},
					{Status: RunItemPlanStepStatusInProgress, Step: "Implement the typed contract"},
					{Status: RunItemPlanStepStatusPending, Step: "Render the active surface"},
				},
			}),
		}},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("plan updates"))
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	item, exists, err := service.store.FindRunItemByProviderID("workspace_api", result.Run.ID, providerItemID)
	if err != nil {
		t.Fatalf("find plan item: %v", err)
	}
	if !exists {
		t.Fatal("plan item missing")
	}
	if item.Summary != "" || item.Progress != "" {
		t.Fatalf("plan item text fallbacks = summary %q progress %q, want empty typed-only item", item.Summary, item.Progress)
	}
	details, ok := item.PlanDetails()
	if !ok {
		t.Fatalf("plan item details = %+v, want typed plan details", item.Details)
	}
	assertPlanDetails(t, *details, RunItemPlanDetails{
		Explanation: "Updating the implementation plan.",
		Steps: []RunItemPlanStep{
			{Status: RunItemPlanStepStatusCompleted, Step: "Read the plan"},
			{Status: RunItemPlanStepStatusInProgress, Step: "Implement the typed contract"},
			{Status: RunItemPlanStepStatusPending, Step: "Render the active surface"},
		},
	})

	activity, err := service.LoadRunActivityPage("workspace_api", result.Run.ID, 20)
	if err != nil {
		t.Fatalf("load activity page: %v", err)
	}
	if len(activity.Items) != 1 {
		t.Fatalf("activity items = %+v, want one in-place plan item", activity.Items)
	}
	if len(activity.Activity) != 1 {
		t.Fatalf("activity projections = %+v, want one in-place plan projection", activity.Activity)
	}
	if activity.Activity[0].SourceRunItemID != item.ID {
		t.Fatalf("activity source run item = %q, want %q", activity.Activity[0].SourceRunItemID, item.ID)
	}
	if activity.Activity[0].Details.Plan == nil {
		t.Fatalf("activity details = %+v, want plan projection", activity.Activity[0].Details)
	}
	assertPlanDetails(t, *activity.Activity[0].Details.Plan, *details)

	blocks := loadPersistedBlocks(t, service, "workspace_api", result.Run.ID)
	planBlocks := activityBlocks(blocks)
	if len(planBlocks) != 1 {
		t.Fatalf("activity blocks = %+v, want one in-place transcript plan block", planBlocks)
	}
	if planBlocks[0].Activity.SourceRunItemID != item.ID {
		t.Fatalf("transcript source run item = %q, want %q", planBlocks[0].Activity.SourceRunItemID, item.ID)
	}
	if planBlocks[0].Activity.Details.Plan == nil {
		t.Fatalf("transcript activity details = %+v, want plan projection", planBlocks[0].Activity.Details)
	}
	assertPlanDetails(t, *planBlocks[0].Activity.Details.Plan, *details)
}

func assertPlanDetails(t *testing.T, got RunItemPlanDetails, want RunItemPlanDetails) {
	t.Helper()
	if got.Explanation != want.Explanation {
		t.Fatalf("plan explanation = %q, want %q", got.Explanation, want.Explanation)
	}
	if len(got.Steps) != len(want.Steps) {
		t.Fatalf("plan steps = %+v, want %+v", got.Steps, want.Steps)
	}
	for index, wantStep := range want.Steps {
		if got.Steps[index] != wantStep {
			t.Fatalf("plan step %d = %+v, want %+v", index, got.Steps[index], wantStep)
		}
	}
}
