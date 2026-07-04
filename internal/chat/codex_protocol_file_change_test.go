package chat

import (
	"encoding/json"
	"strings"
	"testing"

	"setta/internal/codexapp"
)

func TestFileChangeRunItemUsesTypedDetails(t *testing.T) {
	item, err := fileChangeRunItem(codexapp.FileChangeThreadItem{
		ID:     "file_change_1",
		Status: codexapp.PatchApplyStatusCompleted,
		Type:   codexapp.ThreadItemTypeFileChange,
		Changes: []codexapp.FileUpdateChange{
			{
				Diff: "--- a/main.go\n+++ b/main.go\n@@\n-old\n+new\n",
				Kind: json.RawMessage(`{"type":"update","move_path":"old.go"}`),
				Path: "main.go",
			},
		},
	}, RunItemStatusRunning)
	if err != nil {
		t.Fatalf("project file change item: %v", err)
	}
	if item.FilePaths != nil || item.PatchStatus != "" || item.DiffSummary != "" {
		t.Fatalf("legacy file fields were populated: %+v", item)
	}
	details, ok := item.FileChangeDetails()
	if !ok {
		t.Fatalf("file change details missing: %+v", item.Details)
	}
	if details.PatchStatus != "completed" || details.Additions != 1 || details.Deletions != 1 {
		t.Fatalf("details summary = %+v", *details)
	}
	if len(details.Paths) != 1 {
		t.Fatalf("paths = %+v, want one path", details.Paths)
	}
	path := details.Paths[0]
	if path.Operation == nil || *path.Operation != RunItemFileChangeOperationUpdate {
		t.Fatalf("operation = %v, want update", path.Operation)
	}
	if path.Path != "main.go" || path.MovePath != "old.go" || !strings.Contains(path.Patch, "+new") {
		t.Fatalf("path details = %+v", path)
	}
}
