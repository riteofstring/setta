package watchcode

import (
	"reflect"
	"testing"
)

func TestPlanScanUpdateMatchesRenamesAndBaselineSkips(t *testing.T) {
	t.Parallel()

	// A scan should treat same-signature/body replacements as renames, prune stale baseline entries,
	// and create sections only for non-baseline additions.
	sourcePath := "/tmp/workspace/pkg/watch_me.py"
	plan := PlanScanUpdate(
		sourcePath,
		[]CallableInfo{
			{Identity: "pkg.watch_me.delta:function", Kind: CallableKindFunction, SignatureHash: "sig-d", BodyHash: "body-d"},
			{Identity: "pkg.watch_me.alpha:function", Kind: CallableKindFunction, SignatureHash: "sig-b", BodyHash: "body-b"},
			{Identity: "pkg.watch_me.gamma:function", Kind: CallableKindFunction, SignatureHash: "sig-g", BodyHash: "body-g"},
		},
		map[string]RegistryEntry{
			"pkg.watch_me.zeta:function": {CallableName: "zeta", Kind: CallableKindFunction, SignatureHash: "sig-z", BodyHash: "body-z", SourcePath: sourcePath},
			"pkg.watch_me.beta:function": {CallableName: "beta", Kind: CallableKindFunction, SignatureHash: "sig-b", BodyHash: "body-b", SourcePath: sourcePath, SectionIDs: []string{"section-beta"}, SectionsCount: 1},
			"pkg.other.keep:function":    {CallableName: "keep", Kind: CallableKindFunction, SignatureHash: "sig-k", BodyHash: "body-k", SourcePath: "/tmp/workspace/pkg/other.py"},
		},
		map[string][]string{
			sourcePath: []string{"pkg.watch_me.stale:function", "pkg.watch_me.gamma:function"},
		},
	)

	if !reflect.DeepEqual(plan.PrunedBaseline, []string{"pkg.watch_me.gamma:function"}) {
		t.Fatalf("unexpected pruned baseline %#v", plan.PrunedBaseline)
	}
	if len(plan.Renames) != 1 {
		t.Fatalf("expected one rename, got %#v", plan.Renames)
	}
	if plan.Renames[0].OldIdentity != "pkg.watch_me.beta:function" {
		t.Fatalf("unexpected old rename identity %q", plan.Renames[0].OldIdentity)
	}
	if plan.Renames[0].NewCallable.Identity != "pkg.watch_me.alpha:function" {
		t.Fatalf("unexpected new rename callable %#v", plan.Renames[0].NewCallable)
	}
	if !reflect.DeepEqual(plan.RemovedIdentities, []string{"pkg.watch_me.zeta:function"}) {
		t.Fatalf("unexpected removed identities %#v", plan.RemovedIdentities)
	}
	if len(plan.BaselineSkipped) != 1 || plan.BaselineSkipped[0].Identity != "pkg.watch_me.gamma:function" {
		t.Fatalf("unexpected baseline-skipped callables %#v", plan.BaselineSkipped)
	}
	if len(plan.Additions) != 1 || plan.Additions[0].Identity != "pkg.watch_me.delta:function" {
		t.Fatalf("unexpected additions %#v", plan.Additions)
	}
	if len(plan.MetadataChanges) != 0 {
		t.Fatalf("expected no metadata changes, got %#v", plan.MetadataChanges)
	}
	if len(plan.SignatureChanges) != 0 {
		t.Fatalf("expected no signature changes, got %#v", plan.SignatureChanges)
	}
}

func TestPlanScanUpdateProducesMetadataAndSignatureChanges(t *testing.T) {
	t.Parallel()

	// Existing identities should separate metadata-only updates from signature refreshes.
	sourcePath := "/tmp/workspace/pkg/watch_me.py"
	plan := PlanScanUpdate(
		sourcePath,
		[]CallableInfo{
			{Identity: "pkg.watch_me.sig:function", Kind: CallableKindFunction, SignatureHash: "sig-new", BodyHash: "body-new"},
			{Identity: "pkg.watch_me.moved:function", Kind: CallableKindFunction, SignatureHash: "sig-moved", BodyHash: "body-moved"},
			{Identity: "pkg.watch_me.body:function", Kind: CallableKindFunction, SignatureHash: "sig-body", BodyHash: "body-new"},
		},
		map[string]RegistryEntry{
			"pkg.watch_me.body:function":  {CallableName: "body", Kind: CallableKindFunction, SignatureHash: "sig-body", BodyHash: "body-old", SourcePath: sourcePath},
			"pkg.watch_me.moved:function": {CallableName: "moved", Kind: CallableKindFunction, SignatureHash: "sig-moved", BodyHash: "body-moved", SourcePath: "/tmp/workspace/pkg/old.py"},
			"pkg.watch_me.sig:function":   {CallableName: "sig", Kind: CallableKindFunction, SignatureHash: "sig-old", BodyHash: "body-old", SourcePath: sourcePath},
		},
		nil,
	)

	if len(plan.MetadataChanges) != 2 {
		t.Fatalf("expected two metadata changes, got %#v", plan.MetadataChanges)
	}
	if got := []string{plan.MetadataChanges[0].Identity, plan.MetadataChanges[1].Identity}; !reflect.DeepEqual(got, []string{"pkg.watch_me.body:function", "pkg.watch_me.moved:function"}) {
		t.Fatalf("unexpected metadata change identities %#v", got)
	}
	if len(plan.SignatureChanges) != 1 {
		t.Fatalf("expected one signature change, got %#v", plan.SignatureChanges)
	}
	if plan.SignatureChanges[0].Identity != "pkg.watch_me.sig:function" {
		t.Fatalf("unexpected signature change %#v", plan.SignatureChanges[0])
	}
	if len(plan.RemovedIdentities) != 0 || len(plan.Renames) != 0 || len(plan.Additions) != 0 || len(plan.BaselineSkipped) != 0 {
		t.Fatalf("expected only metadata/signature changes, got %#v", plan)
	}
}

func TestPlanDeleteUpdateRemovesTrackedSourceState(t *testing.T) {
	t.Parallel()

	// Deleting a tracked file should remove registry entries for that file and drop its baseline key.
	sourcePath := "/tmp/workspace/pkg/watch_me.py"
	plan := PlanDeleteUpdate(
		sourcePath,
		map[string]RegistryEntry{
			"pkg.watch_me.beta:function":  {SourcePath: sourcePath},
			"pkg.watch_me.alpha:function": {SourcePath: sourcePath},
			"pkg.other.keep:function":     {SourcePath: "/tmp/workspace/pkg/other.py"},
		},
		map[string][]string{
			sourcePath: []string{"pkg.watch_me.alpha:function"},
		},
	)

	if !plan.RemoveBaselinePath {
		t.Fatal("expected delete plan to remove baseline path")
	}
	if !reflect.DeepEqual(plan.RemovedIdentities, []string{"pkg.watch_me.alpha:function", "pkg.watch_me.beta:function"}) {
		t.Fatalf("unexpected removed identities %#v", plan.RemovedIdentities)
	}
}

func TestPlanMoveUpdateUsesParsedDestinationState(t *testing.T) {
	t.Parallel()

	// Parsed move destinations should replace the baseline with parsed identities and move only tracked source entries.
	sourcePath := "/tmp/workspace/pkg/source.py"
	destinationPath := "/tmp/workspace/pkg/dest.py"
	plan := PlanMoveUpdate(
		sourcePath,
		destinationPath,
		[]CallableInfo{
			{Identity: "pkg.dest.beta:function"},
			{Identity: "pkg.dest.alpha:function"},
		},
		true,
		map[string]RegistryEntry{
			"pkg.source.beta:function":  {SourcePath: sourcePath},
			"pkg.source.alpha:function": {SourcePath: sourcePath},
			"pkg.other.keep:function":   {SourcePath: "/tmp/workspace/pkg/other.py"},
		},
		map[string][]string{
			sourcePath: []string{"pkg.source.alpha:function"},
		},
	)

	if !plan.Tracked {
		t.Fatal("expected move plan to be tracked")
	}
	if !plan.RemoveSourceBaseline {
		t.Fatal("expected move plan to remove source baseline")
	}
	if !reflect.DeepEqual(plan.DestinationBaseline, []string{"pkg.dest.alpha:function", "pkg.dest.beta:function"}) {
		t.Fatalf("unexpected destination baseline %#v", plan.DestinationBaseline)
	}
	if !reflect.DeepEqual(plan.MovedRegistryIdentities, []string{"pkg.source.alpha:function", "pkg.source.beta:function"}) {
		t.Fatalf("unexpected moved registry identities %#v", plan.MovedRegistryIdentities)
	}
}

func TestPlanMoveUpdateFallsBackToSourceBaselineWhenDestinationDoesNotParse(t *testing.T) {
	t.Parallel()

	// Failed destination parsing should preserve the prior baseline instead of inventing new identities.
	sourcePath := "/tmp/workspace/pkg/source.py"
	plan := PlanMoveUpdate(
		sourcePath,
		"/tmp/workspace/pkg/dest.py",
		nil,
		false,
		nil,
		map[string][]string{
			sourcePath: []string{"pkg.source.beta:function", "pkg.source.alpha:function"},
		},
	)

	if !plan.Tracked {
		t.Fatal("expected move plan to stay tracked")
	}
	if !reflect.DeepEqual(plan.DestinationBaseline, []string{"pkg.source.alpha:function", "pkg.source.beta:function"}) {
		t.Fatalf("unexpected fallback destination baseline %#v", plan.DestinationBaseline)
	}
}

func TestPlanMoveUpdateReturnsUntrackedForUnknownSource(t *testing.T) {
	t.Parallel()

	// Moves for files with no baseline or registry state should be ignored by the runtime layer.
	plan := PlanMoveUpdate(
		"/tmp/workspace/pkg/source.py",
		"/tmp/workspace/pkg/dest.py",
		nil,
		false,
		nil,
		nil,
	)

	if plan.Tracked {
		t.Fatalf("expected untracked move plan, got %#v", plan)
	}
	if len(plan.DestinationBaseline) != 0 || len(plan.MovedRegistryIdentities) != 0 {
		t.Fatalf("expected empty untracked move plan, got %#v", plan)
	}
}
