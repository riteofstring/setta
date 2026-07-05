package chat

import (
	"context"
	"testing"

	"setta/internal/workspace"
)

// orderedChronoSink records every TurnSink call in arrival order so a test can observe
// the interleaving of assistant text, run items, and output that the chronological
// transcript fixture emits. Unlike recordingSink it does not split text and items into
// separate buckets, because the interleaving is exactly what Phase 0 freezes.
type orderedChronoSink struct {
	events []chronoSinkEvent
}

type chronoSinkEvent struct {
	kind   string
	item   RunItem
	itemID string
	text   string
}

func (sink *orderedChronoSink) AssistantTextDelta(providerItemID string, text string) error {
	sink.events = append(sink.events, chronoSinkEvent{kind: "assistant_text", itemID: providerItemID, text: text})
	return nil
}

func (sink *orderedChronoSink) RunItemUpsert(item RunItem) error {
	sink.events = append(sink.events, chronoSinkEvent{kind: "run_item_upsert", item: item, itemID: item.ProviderItemID})
	return nil
}

func (sink *orderedChronoSink) RunItemOutputDelta(providerItemID string, _ string, text string) error {
	sink.events = append(sink.events, chronoSinkEvent{kind: "run_item_output", itemID: providerItemID, text: text})
	return nil
}

func (sink *orderedChronoSink) ApprovalRequested(ApprovalRequest) error     { return nil }
func (sink *orderedChronoSink) ApprovalResolved(string, bool, string) error { return nil }
func (sink *orderedChronoSink) CodexEffectiveSettingsUpdated(ChatCodexEffectiveSettings) error {
	return nil
}
func (sink *orderedChronoSink) ProviderDiagnostic(string, string, map[string]string, bool, DiagnosticSeverity) error {
	return nil
}
func (sink *orderedChronoSink) ProviderTurnError(ProviderTurnError) error { return nil }
func (sink *orderedChronoSink) GoalUpdated(*ChatGoalState) error          { return nil }
func (sink *orderedChronoSink) ThreadLinked(string, string, string, *ChatCodexEffectiveSettings) error {
	return nil
}
func (sink *orderedChronoSink) UserMessageCommitted(string) error { return nil }
func (sink *orderedChronoSink) Trace(string, string) error        { return nil }

// chronologicalFixtureEvents runs the Phase 0 fixture against an ordered recording sink and
// returns the emitted provider events so each focused test can freeze one chronology property.
func chronologicalFixtureEvents(t *testing.T) []chronoSinkEvent {
	t.Helper()
	sink := &orderedChronoSink{}
	request := TurnRequest{
		Run:       Run{ID: "run_chrono"},
		Workspace: workspace.WorkspaceSummary{RootPath: "/tmp/workspace"},
	}
	completion, err := scriptedChronologicalTranscriptTurn(NewScriptedWorkflowHarness(), context.Background(), request, sink)
	if err != nil {
		t.Fatalf("chronological fixture: %v", err)
	}
	if completion.Outcome != TurnOutcomeCompleted {
		t.Fatalf("completion outcome = %q, want %q", completion.Outcome, TurnOutcomeCompleted)
	}
	return sink.events
}

// TestChronologicalFixtureTextWrapsCommands freezes that assistant text is emitted both before
// and after the commands (text -> command -> text), which the current backend then flattens.
func TestChronologicalFixtureTextWrapsCommands(t *testing.T) {
	events := chronologicalFixtureEvents(t)
	firstCommand := indexOfRunItem(events, 0, isCommandItem)
	if firstCommand < 0 {
		t.Fatalf("fixture emitted no command run item: %+v", events)
	}
	if !hasAssistantText(events[:firstCommand], chronologicalAssistantTextOne) {
		t.Fatalf("missing assistant text before first command: %+v", events)
	}
	if !hasAssistantText(events[firstCommand:], chronologicalAssistantTextTwo) {
		t.Fatalf("missing assistant text after first command: %+v", events)
	}
}

// TestChronologicalFixtureAdjacentCommandsStreamOutput freezes two distinct adjacent commands
// and the streamed output chunks on command A.
func TestChronologicalFixtureAdjacentCommandsStreamOutput(t *testing.T) {
	events := chronologicalFixtureEvents(t)
	commandIDs := distinctRunItemIDs(events, isCommandItem)
	if len(commandIDs) != 2 {
		t.Fatalf("distinct command run items = %d, want 2: %+v", len(commandIDs), commandIDs)
	}
	outputChunks := countOutputChunks(events, "chrono-command-a-run_chrono")
	if outputChunks != chronologicalCommandAOutputChunks {
		t.Fatalf("command A output chunks = %d, want %d", outputChunks, chronologicalCommandAOutputChunks)
	}
}

// TestChronologicalFixtureReasoningThenTextNoTool freezes that meaningful active reasoning is
// followed by more assistant text with no tool run item between them.
func TestChronologicalFixtureReasoningThenTextNoTool(t *testing.T) {
	events := chronologicalFixtureEvents(t)
	thinking := indexOfRunItem(events, 0, isThinkingReasoningItem)
	if thinking < 0 {
		t.Fatalf("missing active (thinking) reasoning item: %+v", events)
	}
	if !hasAssistantText(events[thinking:], chronologicalAssistantTextThree) {
		t.Fatalf("missing assistant text after reasoning headline: %+v", events)
	}
	if toolItemPrecedesText(events, thinking, chronologicalAssistantTextThree) {
		t.Fatalf("a tool run item appeared between reasoning and its following text: %+v", events)
	}
}

// TestChronologicalFixtureThinkingBecomesSummary freezes that the public summary arrives on the
// same provider item as the active thinking headline (mode change in place).
func TestChronologicalFixtureThinkingBecomesSummary(t *testing.T) {
	events := chronologicalFixtureEvents(t)
	thinking := indexOfRunItem(events, 0, isThinkingReasoningItem)
	summary := indexOfRunItem(events, 0, func(item RunItem) bool {
		return item.Type == RunItemTypeReasoning && item.Summary == chronologicalReasoningSummary
	})
	if thinking < 0 || summary < 0 {
		t.Fatalf("missing thinking (%d) or summary (%d) reasoning item: %+v", thinking, summary, events)
	}
	if events[summary].itemID != events[thinking].itemID {
		t.Fatalf("summary item id %q != thinking item id %q; mode change must keep the same provider item",
			events[summary].itemID, events[thinking].itemID)
	}
}

// TestChronologicalFixturePrivateReasoningAndFinalText freezes that private/generic reasoning
// (hidden text only) is emitted and that the stream ends with the final assistant text.
func TestChronologicalFixturePrivateReasoningAndFinalText(t *testing.T) {
	events := chronologicalFixtureEvents(t)
	private := indexOfRunItem(events, 0, func(item RunItem) bool {
		return item.Type == RunItemTypeReasoning && item.HiddenText != "" && item.Title == "" && item.Summary == ""
	})
	if private < 0 {
		t.Fatalf("missing private/generic reasoning item: %+v", events)
	}
	last := events[len(events)-1]
	if last.kind != "assistant_text" || last.text != chronologicalAssistantTextFour {
		t.Fatalf("last event = %+v, want final assistant text", last)
	}
}

func isCommandItem(item RunItem) bool {
	return item.Type == RunItemTypeCommandExecution
}

func isThinkingReasoningItem(item RunItem) bool {
	return item.Type == RunItemTypeReasoning && item.Title != "" && item.Summary == "" && item.HiddenText == ""
}

func indexOfRunItem(events []chronoSinkEvent, from int, match func(RunItem) bool) int {
	for index := from; index < len(events); index++ {
		if events[index].kind == "run_item_upsert" && match(events[index].item) {
			return index
		}
	}
	return -1
}

func hasAssistantText(events []chronoSinkEvent, text string) bool {
	for _, event := range events {
		if event.kind == "assistant_text" && event.text == text {
			return true
		}
	}
	return false
}

func distinctRunItemIDs(events []chronoSinkEvent, match func(RunItem) bool) []string {
	seen := map[string]struct{}{}
	ids := []string{}
	for _, event := range events {
		if event.kind == "run_item_upsert" && match(event.item) {
			if _, ok := seen[event.itemID]; !ok {
				seen[event.itemID] = struct{}{}
				ids = append(ids, event.itemID)
			}
		}
	}
	return ids
}

func countOutputChunks(events []chronoSinkEvent, itemID string) int {
	count := 0
	for _, event := range events {
		if event.kind == "run_item_output" && event.itemID == itemID {
			count++
		}
	}
	return count
}

// toolItemPrecedesText reports whether a non-reasoning run item was emitted between the
// reasoning item at thinkingIndex and the next assistant_text matching followingText.
func toolItemPrecedesText(events []chronoSinkEvent, thinkingIndex int, followingText string) bool {
	for index := thinkingIndex + 1; index < len(events); index++ {
		event := events[index]
		if event.kind == "assistant_text" && event.text == followingText {
			return false
		}
		if event.kind == "run_item_upsert" && event.item.Type != RunItemTypeReasoning {
			return true
		}
	}
	return false
}
