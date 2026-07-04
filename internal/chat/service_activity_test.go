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
