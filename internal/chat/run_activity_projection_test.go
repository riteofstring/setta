package chat

import (
	"strings"
	"testing"
)

// TestRunActivityItemProjectionsExcludesReasoning covers the non-transcript
// activity projection (RunActivityPage.Activity): it surfaces displayable
// activity items, receives hasOutput from the output preview state, and excludes
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

	projections := runActivityItemProjections(RunStatusCompleted, items, map[string]bool{"item_cmd": true})

	if len(projections) != 1 {
		t.Fatalf("expected only the command projection, got %d: %+v", len(projections), projections)
	}
	row := projections[0]
	if row.SourceRunItemID != "item_cmd" || row.Type != RunItemTypeCommandExecution {
		t.Fatalf("expected the command activity row, got %+v", row)
	}
	if !row.HasOutput {
		t.Fatalf("expected hasOutput from the output preview state, got %+v", row)
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

func TestRunActivityProjectionUsesTypedCommandStartFailureDetails(t *testing.T) {
	source := RunItemCommandSourceAgent
	item := RunItem{
		ID:      "item_command_start_failure",
		Type:    RunItemTypeCommandStartFailure,
		Status:  RunItemStatusFailed,
		Command: "legacy command",
		Cwd:     "/legacy",
		Error:   "legacy error",
		Details: NewRunItemCommandStartFailureDetails(RunItemCommandStartFailureDetails{
			Command:         "printf scripted-start-failure",
			Cwd:             "/workspace",
			Source:          &source,
			FailureClass:    "resource_exhaustion",
			Message:         "Too many open files (os error 24)",
			OSError:         "os error 24",
			ProviderErrorID: "error_1",
			Sandbox:         "workspace-write",
			ApprovalPolicy:  "on-request",
		}),
	}

	projection, ok := activityItemBlockProjection(item, RunStatusCompleted, false, false)
	if !ok {
		t.Fatal("expected a projection for the command start failure item")
	}
	if projection.Title != "Shell command failed to start" || projection.Status != RunItemStatusFailed {
		t.Fatalf("projection = %+v, want failed command-start title/status", projection)
	}
	details := projection.Details
	if details.CommandStartFailure == nil {
		t.Fatalf("commandStartFailure details missing: %+v", details)
	}
	if details.Command != "" || details.Cwd != "" || details.Error != "" {
		t.Fatalf("legacy command-start flat fields leaked into projection: %+v", details)
	}
	if details.CommandStartFailure.Command != "printf scripted-start-failure" ||
		details.CommandStartFailure.Message != "Too many open files (os error 24)" ||
		details.CommandStartFailure.ProviderErrorID != "error_1" {
		t.Fatalf("typed command-start failure details not projected: %+v", details.CommandStartFailure)
	}
}

func TestValidateRunItemCommandStartFailureRejectsLegacyFlatFields(t *testing.T) {
	item := RunItem{
		ID:      "item_command_start_failure",
		Type:    RunItemTypeCommandStartFailure,
		Status:  RunItemStatusFailed,
		Command: "legacy command",
		Details: NewRunItemCommandStartFailureDetails(RunItemCommandStartFailureDetails{
			Command: "printf scripted-start-failure",
			Message: "Too many open files (os error 24)",
		}),
	}

	err := validateRunItemDetails(item)
	if err == nil {
		t.Fatal("validateRunItemDetails succeeded, want legacy flat-field error")
	}
	if !strings.Contains(err.Error(), "commandStartFailure flat command must be empty") {
		t.Fatalf("error = %q, want flat command error", err)
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

func TestRunActivityProjectionUsesTypedApprovalDetails(t *testing.T) {
	item := RunItem{
		ID:        "item_approval",
		Type:      RunItemTypeApprovalRequest,
		Status:    RunItemStatusPending,
		RequestID: "legacy-request",
		ReviewID:  "legacy-review",
		Details: NewRunItemApprovalDetails(RunItemApprovalDetails{
			ApprovalID:        "approval_1",
			ApprovalKind:      approvalKindPtr(ApprovalKindCommand),
			ApprovalStatus:    approvalStatusPtr(ApprovalStatusPending),
			ProviderRequestID: "request_1",
			Title:             "Command approval",
			Body:              "Approve command.",
			Command:           "go test ./...",
			Cwd:               "/workspace",
		}),
	}

	projection, ok := activityItemBlockProjection(item, RunStatusRunning, false, false)
	if !ok {
		t.Fatal("expected a projection for the approval item")
	}
	if projection.Title != "Command approval" {
		t.Fatalf("title = %q, want typed approval title", projection.Title)
	}
	details := projection.Details
	if details.Approval == nil {
		t.Fatalf("approval details missing: %+v", details)
	}
	if details.Approval.ProviderRequestID != "request_1" || details.Approval.Command != "go test ./..." {
		t.Fatalf("typed approval details not projected: %+v", details.Approval)
	}
	if details.RequestID != "" || details.ReviewID != "" {
		t.Fatalf("legacy approval request/review fields leaked into projection: %+v", details)
	}
}
