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
		Command:        "npm run dev",
		ProcessID:      "proc_1",
		Source:         &startup,
	}

	// A later upsert that omits source must preserve the existing discriminator.
	merged := mergeRunItem(existing, RunItem{ProviderItemID: "provider_1", Status: RunItemStatusCompleted})
	if merged.Source == nil || *merged.Source != RunItemCommandSourceUnifiedExecStartup {
		t.Fatalf("merged source = %v, want preserved unified_exec_startup", merged.Source)
	}
	if merged.ProcessID != "proc_1" {
		t.Fatalf("merged processId = %q, want preserved proc_1", merged.ProcessID)
	}

	// A later upsert that sets a source still overrides it.
	interaction := RunItemCommandSourceUnifiedExecInteraction
	overridden := mergeRunItem(existing, RunItem{ProviderItemID: "provider_1", Source: &interaction})
	if overridden.Source == nil || *overridden.Source != RunItemCommandSourceUnifiedExecInteraction {
		t.Fatalf("merged source = %v, want overriding unified_exec_interaction", overridden.Source)
	}
}
