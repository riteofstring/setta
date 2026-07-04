package chat

import (
	"strings"
	"testing"
)

// TestRunActivityItemProjectionsExcludesReasoning covers the non-transcript
// activity projection (RunActivityPage.Activity): it surfaces displayable
// activity items, derives hasOutput from the loaded output previews, and excludes
// reasoning (its own block kind) and agent messages (owned by assistant text) so
// the projection mirrors the chronological transcript's activity_item set.
func TestRunActivityItemProjectionsExcludesReasoning(t *testing.T) {
	items := []RunItem{
		{
			ID:      "item_cmd",
			Type:    RunItemTypeCommandExecution,
			Status:  RunItemStatusCompleted,
			Title:   "build",
			Details: NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{Command: "go build"}),
		},
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
		{
			ID:      "item_cmd",
			Type:    RunItemTypeCommandExecution,
			Status:  RunItemStatusRunning,
			Title:   "build",
			Details: NewRunItemCommandExecutionDetails(RunItemCommandExecutionDetails{Command: "go build"}),
		},
	}

	projections := runActivityItemProjections(RunStatusCompleted, items, nil)

	if len(projections) != 1 {
		t.Fatalf("expected one projection, got %d", len(projections))
	}
	if projections[0].Status != RunItemStatusCompleted {
		t.Fatalf("expected the running item to inherit the completed run status, got %q", projections[0].Status)
	}
}

func TestRunActivityProjectionDoesNotReadLegacyCommandExecutionFields(t *testing.T) {
	item := RunItem{
		ID:         "item_cmd",
		Type:       RunItemTypeCommandExecution,
		Status:     RunItemStatusCompleted,
		Command:    "legacy command",
		Cwd:        "/legacy",
		ExitCode:   7,
		DurationMs: 42,
		ProcessID:  "legacy-process",
		Result:     "legacy result",
		Error:      "legacy error",
	}

	projection, ok := activityItemBlockProjection(item, RunStatusCompleted, false, false)
	if !ok {
		t.Fatal("expected a projection for the command item")
	}
	if projection.Title != "command execution" {
		t.Fatalf("title = %q, want typed-details fallback title", projection.Title)
	}
	details := projection.Details
	if details.Command != "" ||
		details.Cwd != "" ||
		details.ExitCode != 0 ||
		details.DurationMs != 0 ||
		details.ProcessID != "" ||
		details.Result != "" ||
		details.Error != "" {
		t.Fatalf("legacy command fields leaked into projection: %+v", details)
	}
	if details.CommandExecution != nil {
		t.Fatalf("unexpected typed command details synthesized from legacy fields: %+v", details.CommandExecution)
	}
}

func TestRunActivityProjectionUsesTypedFileChangeDetails(t *testing.T) {
	item := RunItem{
		ID:          "item_file",
		Type:        RunItemTypeFileChange,
		Status:      RunItemStatusCompleted,
		FilePaths:   []string{"legacy.go"},
		PatchStatus: "legacy_status",
		DiffSummary: "legacy diff",
		Details: newRunItemFileChangeDetails("updated", []RunItemFileChangePath{
			{Path: "main.go", Operation: runItemFileChangeOperationPtr(RunItemFileChangeOperationUpdate), Additions: 1},
		}),
	}

	projection, ok := activityItemBlockProjection(item, RunStatusCompleted, false, false)
	if !ok {
		t.Fatal("expected a projection for the file change item")
	}
	if projection.Title != "Updated main.go" {
		t.Fatalf("title = %q, want typed file-change title", projection.Title)
	}
	details := projection.Details
	if details.FileChange == nil {
		t.Fatalf("fileChange details missing: %+v", details)
	}
	if len(details.FilePaths) != 1 || details.FilePaths[0] != "main.go" || details.PatchStatus != "updated" {
		t.Fatalf("typed file fields not projected: %+v", details)
	}
	if details.Diff != nil {
		t.Fatalf("unexpected diff details projected from file-change item: %+v", details.Diff)
	}
}

func TestRunActivityProjectionUsesTypedDiffDetails(t *testing.T) {
	item := RunItem{
		ID:          "item_diff",
		Type:        RunItemTypeDiff,
		Status:      RunItemStatusCompleted,
		FilePaths:   []string{"legacy.go"},
		DiffSummary: "legacy diff",
		Details: newRunItemDiffDetails(`--- a/main.go
+++ b/main.go
@@
+updated
`),
	}

	projection, ok := activityItemBlockProjection(item, RunStatusCompleted, false, false)
	if !ok {
		t.Fatal("expected a projection for the diff item")
	}
	if projection.Title != "Diff updated: 1 file, +1 -0" {
		t.Fatalf("title = %q, want typed diff title", projection.Title)
	}
	details := projection.Details
	if details.Diff == nil {
		t.Fatalf("diff details missing: %+v", details)
	}
	if len(details.FilePaths) != 1 || details.FilePaths[0] != "main.go" {
		t.Fatalf("typed diff paths not projected: %+v", details)
	}
	if details.Diff.Summary != "1 file, +1 -0" || !strings.Contains(details.Diff.Patch, "+updated") {
		t.Fatalf("typed diff details not projected: %+v", details.Diff)
	}
}
