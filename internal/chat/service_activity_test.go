package chat

import (
	"fmt"
	"testing"
)

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

func TestServiceEmbedsRunActivityOutputWithTotalPreviewLimit(t *testing.T) {
	events := []FakeHarnessEvent{
		{Type: FakeEventRunItem, ProviderItemID: "command_a", RunItem: RunItem{
			ProviderItemID: "command_a",
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Title:          "Command A",
			Details:        NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{Command: "printf a"}),
		}},
	}
	for index := 1; index <= 3; index++ {
		events = append(events, FakeHarnessEvent{
			Type:           FakeEventRunItemOutput,
			ProviderItemID: "command_a",
			Stream:         "stdout",
			Text:           "a\n",
		})
	}
	events = append(events, FakeHarnessEvent{Type: FakeEventRunItem, ProviderItemID: "command_b", RunItem: RunItem{
		ProviderItemID: "command_b",
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusRunning,
		Title:          "Command B",
		Details:        NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{Command: "printf b"}),
	}})
	for index := 1; index <= 3; index++ {
		events = append(events, FakeHarnessEvent{
			Type:           FakeEventRunItemOutput,
			ProviderItemID: "command_b",
			Stream:         "stdout",
			Text:           "b\n",
		})
	}
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(events))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("run with many outputs"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	activity, err := service.LoadRunActivityPage("workspace_api", result.Run.ID, "", 4)
	if err != nil {
		t.Fatalf("load activity page: %v", err)
	}
	if len(activity.Output) != 4 {
		t.Fatalf("activity output count = %d, want aggregate preview limit 4", len(activity.Output))
	}
	if !activityProjectionHasOutput(activity, "Command A") || !activityProjectionHasOutput(activity, "Command B") {
		t.Fatalf("activity projections = %+v, want hasOutput retained for both commands", activity.Activity)
	}
}

func TestServiceLoadRunActivityPageLimitsItemsAndOutputPreviews(t *testing.T) {
	service, runID := completedActivityLimitRun(t)

	activity, err := service.LoadRunActivityPage("workspace_api", runID, "", 3)
	if err != nil {
		t.Fatalf("load activity page: %v", err)
	}
	assertFirstLimitedRunActivityPage(t, activity)

	nextActivity, err := service.LoadRunActivityPage("workspace_api", runID, activity.NextItemID, 3)
	if err != nil {
		t.Fatalf("load next activity page: %v", err)
	}
	assertSecondLimitedRunActivityPage(t, nextActivity)

	items, err := service.LoadRunActivityItems("workspace_api", runID)
	if err != nil {
		t.Fatalf("load run activity items: %v", err)
	}
	if len(items) != 6 {
		t.Fatalf("full activity items = %d, want 6 for internal result scans", len(items))
	}
}

func completedActivityLimitRun(t *testing.T) (*Service, string) {
	t.Helper()
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(activityLimitEvents()))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("run with many items"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	return service, result.Run.ID
}

func activityLimitEvents() []FakeHarnessEvent {
	events := []FakeHarnessEvent{}
	for index := 1; index <= 6; index++ {
		providerItemID := fmt.Sprintf("command_%d", index)
		events = append(events,
			FakeHarnessEvent{Type: FakeEventRunItem, ProviderItemID: providerItemID, RunItem: RunItem{
				ProviderItemID: providerItemID,
				Type:           RunItemTypeCommandExecution,
				Status:         RunItemStatusRunning,
				Title:          fmt.Sprintf("Command %d", index),
				Details:        NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{Command: fmt.Sprintf("printf %d", index)}),
			}},
			FakeHarnessEvent{
				Type:           FakeEventRunItemOutput,
				ProviderItemID: providerItemID,
				Stream:         "stdout",
				Text:           fmt.Sprintf("output %d\n", index),
			},
		)
	}
	return events
}

func assertFirstLimitedRunActivityPage(t *testing.T, activity RunActivityPage) {
	t.Helper()
	if len(activity.Items) != 3 {
		t.Fatalf("activity items = %d, want page limit 3", len(activity.Items))
	}
	if len(activity.Activity) != 3 {
		t.Fatalf("activity projections = %+v, want page limit 3", activity.Activity)
	}
	if len(activity.Output) != 3 {
		t.Fatalf("activity output count = %d, want output preview limit 3", len(activity.Output))
	}
	if !activity.HasMoreItems || activity.NextItemID == "" {
		t.Fatalf("activity hasMore/next = %v/%q, want true/non-empty", activity.HasMoreItems, activity.NextItemID)
	}
	for index, output := range activity.Output {
		wantText := fmt.Sprintf("output %d\n", index+1)
		if output.Text != wantText {
			t.Fatalf("activity output[%d] = %q, want %q from paged item window", index, output.Text, wantText)
		}
	}
}

func assertSecondLimitedRunActivityPage(t *testing.T, activity RunActivityPage) {
	t.Helper()
	if len(activity.Items) != 3 || activity.HasMoreItems || activity.NextItemID != "" {
		t.Fatalf("next activity items/hasMore/next = %d/%v/%q, want 3/false/empty", len(activity.Items), activity.HasMoreItems, activity.NextItemID)
	}
	for index, item := range activity.Items {
		wantTitle := fmt.Sprintf("Command %d", index+4)
		if item.Title != wantTitle {
			t.Fatalf("next activity item[%d] title = %q, want %q", index, item.Title, wantTitle)
		}
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

	activity, err := service.LoadRunActivityPage("workspace_api", result.Run.ID, "", 20)
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

func activityProjectionHasOutput(page RunActivityPage, title string) bool {
	for _, activity := range page.Activity {
		if activity.Title == title {
			return activity.HasOutput
		}
	}
	return false
}
