package chat

import (
	"strings"
	"testing"
)

func testBackgroundTerminalProcess(id string) BackgroundTerminalProcess {
	return BackgroundTerminalProcess{
		SchemaVersion:  SchemaVersion,
		ID:             id,
		WorkspaceID:    "workspace_api",
		ConversationID: "conversation_chat",
		ThreadID:       "thread_main",
		StartedRunID:   "run_alpha",
		ProviderItemID: "item_" + id,
		ProcessID:      "proc-" + id,
		Source:         RunItemCommandSourceUnifiedExecStartup,
		Status:         BackgroundTerminalRunning,
		Command:        "npm run dev",
		Cwd:            "/tmp/workspace",
		StartedAt:      "2026-06-28T10:00:00Z",
		UpdatedAt:      "2026-06-28T10:00:00Z",
		RecentOutput:   []string{"dev server booting"},
	}
}

func testBackgroundTerminalOutput(id string, processID string, ordinal int, text string) BackgroundTerminalOutput {
	return BackgroundTerminalOutput{
		SchemaVersion: SchemaVersion,
		ID:            id,
		ProcessID:     processID,
		Stream:        "stdout",
		Ordinal:       ordinal,
		Text:          text,
		CreatedAt:     "2026-06-28T10:00:01Z",
	}
}

func TestStoreBackgroundTerminalProcessRoundTrip(t *testing.T) {
	store := mustStore(t, t.TempDir())
	process := testBackgroundTerminalProcess("bgproc_alpha")
	if err := store.SaveBackgroundTerminalProcess(process); err != nil {
		t.Fatalf("save process: %v", err)
	}
	loaded, err := store.LoadBackgroundTerminalProcess(process.WorkspaceID, process.ConversationID, process.ID)
	if err != nil {
		t.Fatalf("load process: %v", err)
	}
	if loaded.ProcessID != process.ProcessID || loaded.Source != RunItemCommandSourceUnifiedExecStartup || loaded.Status != BackgroundTerminalRunning {
		t.Fatalf("loaded process mismatch: %+v", loaded)
	}
	if len(loaded.RecentOutput) != 1 || loaded.RecentOutput[0] != "dev server booting" {
		t.Fatalf("recent output not preserved: %+v", loaded.RecentOutput)
	}
}

func TestStoreBackgroundTerminalProcessListSortedByStart(t *testing.T) {
	store := mustStore(t, t.TempDir())
	beta := testBackgroundTerminalProcess("bgproc_beta")
	beta.StartedAt = "2026-06-28T10:05:00Z"
	alpha := testBackgroundTerminalProcess("bgproc_alpha")
	alpha.StartedAt = "2026-06-28T10:00:00Z"
	if err := store.SaveBackgroundTerminalProcess(beta); err != nil {
		t.Fatalf("save beta: %v", err)
	}
	if err := store.SaveBackgroundTerminalProcess(alpha); err != nil {
		t.Fatalf("save alpha: %v", err)
	}
	processes, err := store.ListBackgroundTerminalProcesses("workspace_api", "conversation_chat")
	if err != nil {
		t.Fatalf("list processes: %v", err)
	}
	if len(processes) != 2 || processes[0].ID != "bgproc_alpha" || processes[1].ID != "bgproc_beta" {
		t.Fatalf("processes not sorted by startedAt then id: %+v", processes)
	}
}

func TestStoreBackgroundTerminalListEmptyWhenAbsent(t *testing.T) {
	store := mustStore(t, t.TempDir())
	processes, err := store.ListBackgroundTerminalProcesses("workspace_api", "conversation_chat")
	if err != nil {
		t.Fatalf("list processes: %v", err)
	}
	if len(processes) != 0 {
		t.Fatalf("expected no processes, got %+v", processes)
	}
}

func TestStoreBackgroundTerminalOutputPaging(t *testing.T) {
	store := mustStore(t, t.TempDir())
	process := testBackgroundTerminalProcess("bgproc_alpha")
	if err := store.SaveBackgroundTerminalProcess(process); err != nil {
		t.Fatalf("save process: %v", err)
	}
	for ordinal := 1; ordinal <= 3; ordinal++ {
		output := testBackgroundTerminalOutput("out_"+strings.Repeat("x", ordinal), process.ID, ordinal, "chunk")
		if err := store.SaveBackgroundTerminalOutput(process.WorkspaceID, process.ConversationID, output); err != nil {
			t.Fatalf("save output %d: %v", ordinal, err)
		}
	}
	next, err := store.NextBackgroundTerminalOutputOrdinal(process.WorkspaceID, process.ConversationID, process.ID)
	if err != nil {
		t.Fatalf("next ordinal: %v", err)
	}
	if next != 4 {
		t.Fatalf("next ordinal = %d, want 4", next)
	}
	page, err := store.LoadBackgroundTerminalOutputPage(process.WorkspaceID, process.ConversationID, process.ID, 0, 2)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if len(page.Output) != 2 || !page.HasMore || page.NextOrdinal != 2 {
		t.Fatalf("first page unexpected: %+v", page)
	}
	rest, err := store.LoadBackgroundTerminalOutputPage(process.WorkspaceID, process.ConversationID, process.ID, page.NextOrdinal, 2)
	if err != nil {
		t.Fatalf("load rest: %v", err)
	}
	if len(rest.Output) != 1 || rest.HasMore || rest.Output[0].Ordinal != 3 {
		t.Fatalf("second page unexpected: %+v", rest)
	}
}

func TestStoreBackgroundTerminalDeleteRemovesOutput(t *testing.T) {
	store := mustStore(t, t.TempDir())
	process := testBackgroundTerminalProcess("bgproc_alpha")
	if err := store.SaveBackgroundTerminalProcess(process); err != nil {
		t.Fatalf("save process: %v", err)
	}
	output := testBackgroundTerminalOutput("out_one", process.ID, 1, "chunk")
	if err := store.SaveBackgroundTerminalOutput(process.WorkspaceID, process.ConversationID, output); err != nil {
		t.Fatalf("save output: %v", err)
	}
	if err := store.DeleteBackgroundTerminalProcess(process.WorkspaceID, process.ConversationID, process.ID); err != nil {
		t.Fatalf("delete process: %v", err)
	}
	if _, err := store.LoadBackgroundTerminalProcess(process.WorkspaceID, process.ConversationID, process.ID); err == nil {
		t.Fatal("expected load to fail after delete")
	}
	next, err := store.NextBackgroundTerminalOutputOrdinal(process.WorkspaceID, process.ConversationID, process.ID)
	if err != nil {
		t.Fatalf("next ordinal after delete: %v", err)
	}
	if next != 1 {
		t.Fatalf("output ordinal after delete = %d, want 1 (output removed)", next)
	}
}

func TestStoreBackgroundTerminalSaveFailsLoud(t *testing.T) {
	store := mustStore(t, t.TempDir())
	cases := []struct {
		name    string
		mutate  func(*BackgroundTerminalProcess)
		wantSub string
	}{
		{"active with completedAt", func(p *BackgroundTerminalProcess) { p.CompletedAt = "2026-06-28T10:01:00Z" }, "completedAt must be empty"},
		{"terminal without completedAt", func(p *BackgroundTerminalProcess) { p.Status = BackgroundTerminalExited }, "completedAt is required"},
		{"empty processId", func(p *BackgroundTerminalProcess) { p.ProcessID = "" }, "processId is required"},
		{"unknown source", func(p *BackgroundTerminalProcess) { p.Source = "mystery" }, "unsupported source"},
		{"missing command", func(p *BackgroundTerminalProcess) { p.Command = "" }, "command is required"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			process := testBackgroundTerminalProcess("bgproc_alpha")
			testCase.mutate(&process)
			err := store.SaveBackgroundTerminalProcess(process)
			if err == nil {
				t.Fatalf("expected save to fail for %s", testCase.name)
			}
			if !strings.Contains(err.Error(), testCase.wantSub) {
				t.Fatalf("error = %v, want substring %q", err, testCase.wantSub)
			}
		})
	}
}

func TestStoreBackgroundTerminalOutputPageRequiresProcess(t *testing.T) {
	store := mustStore(t, t.TempDir())
	if _, err := store.LoadBackgroundTerminalOutputPage("workspace_api", "conversation_chat", "bgproc_missing", 0, 10); err == nil {
		t.Fatal("expected output page to fail when the process does not exist")
	}
}
