package chat

import (
	"strings"
	"testing"
)

func TestRunItemDiffDetailsParseUnifiedDiff(t *testing.T) {
	details, ok := RunItem{
		Type: RunItemTypeDiff,
		Details: newRunItemDiffDetails(`--- a/main.go
+++ b/main.go
@@
-old
+new
--- /dev/null
+++ b/created.go
@@
+created
`),
	}.DiffDetails()
	if !ok {
		t.Fatal("diff details missing")
	}
	if details.Summary != "2 files, +2 -1" || details.Additions != 2 || details.Deletions != 1 {
		t.Fatalf("summary = %+v, want 2 files with +2 -1", *details)
	}
	if len(details.Paths) != 2 {
		t.Fatalf("paths = %+v, want two paths", details.Paths)
	}
	first := details.Paths[0]
	if first.Path != "main.go" || first.Operation == nil || *first.Operation != RunItemFileChangeOperationUpdate || first.Additions != 1 || first.Deletions != 1 {
		t.Fatalf("first path = %+v, want update main.go +1 -1", first)
	}
	second := details.Paths[1]
	if second.Path != "created.go" || second.Operation == nil || *second.Operation != RunItemFileChangeOperationAdd || second.Additions != 1 || second.Deletions != 0 {
		t.Fatalf("second path = %+v, want add created.go +1", second)
	}
}

func TestRunItemDiffValidationRejectsFlatFields(t *testing.T) {
	item := RunItem{
		ID:          "run_item_diff",
		Type:        RunItemTypeDiff,
		Status:      RunItemStatusCompleted,
		DiffSummary: "legacy summary",
		Details:     newRunItemDiffDetails(""),
	}

	err := validateRunItemDetails(item)
	if err == nil {
		t.Fatal("validation succeeded, want flat field error")
	}
	if !strings.Contains(err.Error(), "flat diffSummary must be empty") {
		t.Fatalf("error = %q, want flat diffSummary error", err)
	}
}
