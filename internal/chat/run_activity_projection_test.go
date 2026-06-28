package chat

import "testing"

// TestRunActivityItemProjectionsExcludesReasoning covers the non-transcript
// activity projection (RunActivityPage.Activity): it surfaces displayable
// activity items, derives hasOutput from the loaded output previews, and excludes
// reasoning (its own block kind) and agent messages (owned by assistant text) so
// the projection mirrors the chronological transcript's activity_item set.
func TestRunActivityItemProjectionsExcludesReasoning(t *testing.T) {
	items := []RunItem{
		{ID: "item_cmd", Type: RunItemTypeCommandExecution, Status: RunItemStatusCompleted, Title: "build", Command: "go build"},
		{ID: "item_reason", Type: RunItemTypeReasoning, Status: RunItemStatusCompleted, Title: "thinking about the build"},
		{ID: "item_agent", Type: RunItemTypeAgentMessage, Status: RunItemStatusCompleted, Summary: "all done"},
	}
	outputs := []RunItemOutput{{ID: "out_1", RunItemID: "item_cmd", Ordinal: 1, Text: "ok"}}

	projections := runActivityItemProjections(RunStatusCompleted, items, outputs)

	if len(projections) != 1 {
		t.Fatalf("expected only the command projection, got %d: %+v", len(projections), projections)
	}
	row := projections[0]
	if row.SourceRunItemID != "item_cmd" || row.Type != RunItemTypeCommandExecution {
		t.Fatalf("expected the command activity row, got %+v", row)
	}
	if !row.HasOutput {
		t.Fatalf("expected hasOutput derived from the loaded output, got %+v", row)
	}
	if row.Status != RunItemStatusCompleted {
		t.Fatalf("expected the completed status, got %q", row.Status)
	}
}

// TestRunActivityItemProjectionsInheritsTerminalRunStatus confirms a still-running
// item inherits a terminal run's outcome, matching the transcript's effective row
// status so a reloaded completed run never shows a perpetually-running row.
func TestRunActivityItemProjectionsInheritsTerminalRunStatus(t *testing.T) {
	items := []RunItem{
		{ID: "item_cmd", Type: RunItemTypeCommandExecution, Status: RunItemStatusRunning, Title: "build", Command: "go build"},
	}

	projections := runActivityItemProjections(RunStatusCompleted, items, nil)

	if len(projections) != 1 {
		t.Fatalf("expected one projection, got %d", len(projections))
	}
	if projections[0].Status != RunItemStatusCompleted {
		t.Fatalf("expected the running item to inherit the completed run status, got %q", projections[0].Status)
	}
}
