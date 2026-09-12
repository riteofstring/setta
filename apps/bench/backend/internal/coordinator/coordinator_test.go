package coordinator

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/setta/bench/backend/internal/contracts"
	"github.com/setta/bench/backend/internal/project"
	"github.com/setta/bench/backend/internal/runstore"
)

type failingCaseTransitionStore struct {
	*runstore.Store
}

func (store *failingCaseTransitionStore) UpdateRun(run contracts.RunV1) (contracts.RunV1, error) {
	if run.Status == "running" {
		for _, result := range run.CaseResults {
			if result.Status == "running" {
				return contracts.RunV1{}, errors.New("injected case transition failure")
			}
		}
	}
	return store.Store.UpdateRun(run)
}

func TestConcurrentLaunchesShareGlobalAdmissionAndRerunKeepsFrozenSpecification(t *testing.T) {
	root, script := writeConcurrencyFixture(t)
	projects, configured, draft := configureConcurrencyProject(t, root, script)
	runs, control := openTestCoordinator(t, projects)
	assertReadySnapshot(t, control)
	request := contracts.LaunchRequestV1{ProjectID: configured.ID, ExpectedRevision: configured.Revision, CandidateIDs: []string{"baseline", "challenger"}}
	first, err := control.Launch(request)
	if err != nil {
		t.Fatalf("first Launch() = %v", err)
	}
	second, err := control.Launch(request)
	if err != nil {
		t.Fatalf("second Launch() = %v", err)
	}
	waitForRuns(t, control, append(append([]string{}, first.RunIDs...), second.RunIDs...))
	if _, err := os.Stat(filepath.Join(root, ".bench-test-overlap")); !os.IsNotExist(err) {
		t.Fatalf("candidate executions overlapped: %v", err)
	}
	updatedDraft := draft
	updatedDraft.Name = "Changed project"
	updatedDraft.Execution = contracts.ExecutionPolicyV1{Concurrency: 2, TimeoutMilliseconds: 9000}
	updated, err := control.ReplaceProject(contracts.ReplaceProjectRequestV1{ProjectID: configured.ID, ExpectedRevision: configured.Revision, Project: updatedDraft})
	if err != nil {
		t.Fatalf("ReplaceProject() = %v", err)
	}
	if updated.Revision == configured.Revision {
		t.Fatal("project revision did not advance")
	}
	rerun, err := control.Rerun(first.RunIDs[0])
	if err != nil {
		t.Fatalf("Rerun() = %v", err)
	}
	waitForRuns(t, control, rerun.RunIDs)
	assertFrozenRerun(t, runs, rerun.LaunchID, configured.Revision, draft.Execution, first.RunIDs[0])
}

func writeConcurrencyFixture(t *testing.T) (string, string) {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "cases.jsonl"), []byte("{\"id\":\"one\",\"name\":\"One\",\"input\":{},\"expected\":null}\n"), 0o600); err != nil {
		t.Fatalf("write cases = %v", err)
	}
	script := filepath.Join(root, "candidate.sh")
	source := `#!/bin/sh
IFS= read -r request
owned=0
if mkdir .bench-test-active 2>/dev/null; then
  owned=1
else
  : > .bench-test-overlap
fi
sleep 0.15
if [ "$owned" = 1 ]; then rmdir .bench-test-active; fi
printf '%s\n' '{"type":"result","output":{"ok":true},"observations":[],"artifacts":[]}'
`
	if err := os.WriteFile(script, []byte(source), 0o700); err != nil {
		t.Fatalf("write candidate = %v", err)
	}
	return root, script
}

func configureConcurrencyProject(t *testing.T, root string, script string) (*project.Store, contracts.ProjectV1, contracts.ProjectDraftV1) {
	t.Helper()
	projects, err := project.Open(root, true)
	if err != nil {
		t.Fatalf("project.Open() = %v", err)
	}
	initial, _ := projects.Snapshot()
	draft := contracts.ProjectDraftV1{
		Name:    "Concurrency comparison",
		CaseSet: initial.CaseSet,
		Candidates: []contracts.CandidateV1{
			{ID: "baseline", Name: "Baseline", Command: contracts.CommandV1{Argv: []string{script}, WorkingDirectory: "."}},
			{ID: "challenger", Name: "Challenger", Command: contracts.CommandV1{Argv: []string{script}, WorkingDirectory: "."}},
		},
		Evaluator: nil,
		Execution: contracts.ExecutionPolicyV1{Concurrency: 1, TimeoutMilliseconds: 5000},
		Presentation: contracts.PresentationV1{
			Sections: map[string]contracts.SectionLayoutV1{
				"cases": {X: 0, Y: 0, Width: 200, Height: 120, ZIndex: 0}, "baseline": {X: 300, Y: 0, Width: 200, Height: 120, ZIndex: 1}, "challenger": {X: 300, Y: 200, Width: 200, Height: 120, ZIndex: 2},
			},
			Viewport: contracts.ViewportV1{X: 0, Y: 0, Zoom: 1},
		},
	}
	configured, err := projects.Replace(contracts.ReplaceProjectRequestV1{ProjectID: initial.ID, ExpectedRevision: initial.Revision, Project: draft})
	if err != nil {
		t.Fatalf("Replace() = %v", err)
	}
	return projects, configured, draft
}

func openTestCoordinator(t *testing.T, projects *project.Store) (*runstore.Store, *Coordinator) {
	t.Helper()
	runs, err := runstore.Open(projects.StateRoot())
	if err != nil {
		t.Fatalf("runstore.Open() = %v", err)
	}
	control, err := New(projects, runs)
	if err != nil {
		t.Fatalf("New() = %v", err)
	}
	t.Cleanup(func() { control.Close() })
	return runs, control
}

func assertReadySnapshot(t *testing.T, control *Coordinator) {
	t.Helper()
	snapshot, err := control.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() = %v", err)
	}
	if !snapshot.Validation.Ready || snapshot.Validation.CaseCount != 1 || snapshot.Validation.ExecutionCount != 2 {
		t.Fatalf("validation = %#v", snapshot.Validation)
	}
}

func assertFrozenRerun(t *testing.T, runs *runstore.Store, launchID string, revision int, execution contracts.ExecutionPolicyV1, parentRunID string) {
	t.Helper()
	frozen, err := runs.Launch(launchID)
	if err != nil {
		t.Fatalf("stored rerun launch = %v", err)
	}
	if frozen.ProjectRevision != revision || frozen.Execution != execution || frozen.Candidates[0].ID != "baseline" || frozen.RerunParentRunID == nil || *frozen.RerunParentRunID != parentRunID {
		encoded, _ := json.Marshal(frozen)
		t.Fatalf("rerun did not preserve frozen specification: %s", encoded)
	}
}

func TestSnapshotSurfacesManifestFailureWithoutFailing(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	projects, err := project.Open(root, true)
	if err != nil {
		t.Fatalf("project.Open() = %v", err)
	}
	runs, err := runstore.Open(projects.StateRoot())
	if err != nil {
		t.Fatalf("runstore.Open() = %v", err)
	}
	control, err := New(projects, runs)
	if err != nil {
		t.Fatalf("New() = %v", err)
	}
	defer control.Close()
	snapshot, err := control.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() = %v", err)
	}
	if snapshot.Validation.Ready || snapshot.Validation.CaseCount != 0 || len(snapshot.Validation.Issues) == 0 || snapshot.Validation.Issues[0].Path != "project.caseSet.manifest" {
		t.Fatalf("validation = %#v", snapshot.Validation)
	}
}

func TestCaseExecutionDoesNotStartAfterRunningTransitionPersistenceFailure(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "cases.jsonl"), []byte("{\"id\":\"one\",\"input\":{},\"expected\":null}\n"), 0o600); err != nil {
		t.Fatalf("write cases = %v", err)
	}
	marker := filepath.Join(root, "candidate-started")
	script := filepath.Join(root, "candidate.sh")
	if err := os.WriteFile(script, []byte("#!/bin/sh\n: > \"$1\"\nprintf '%s\\n' '{\"type\":\"result\",\"output\":{},\"observations\":[],\"artifacts\":[]}'\n"), 0o700); err != nil {
		t.Fatalf("write candidate = %v", err)
	}
	projects, err := project.Open(root, true)
	if err != nil {
		t.Fatalf("project.Open() = %v", err)
	}
	initial, _ := projects.Snapshot()
	draft := contracts.ProjectDraftV1{
		Name: "Persistence boundary", CaseSet: initial.CaseSet,
		Candidates: []contracts.CandidateV1{
			{ID: "baseline", Name: "Baseline", Command: contracts.CommandV1{Argv: []string{script, marker}, WorkingDirectory: "."}},
			{ID: "challenger", Name: "Challenger", Command: contracts.CommandV1{Argv: []string{script, marker}, WorkingDirectory: "."}},
		},
		Execution: contracts.ExecutionPolicyV1{Concurrency: 1, TimeoutMilliseconds: 1000},
		Presentation: contracts.PresentationV1{Sections: map[string]contracts.SectionLayoutV1{
			"cases": {X: 0, Y: 0, Width: 200, Height: 120}, "baseline": {X: 300, Y: 0, Width: 200, Height: 120}, "challenger": {X: 300, Y: 200, Width: 200, Height: 120},
		}, Viewport: contracts.ViewportV1{Zoom: 1}},
	}
	configured, err := projects.Replace(contracts.ReplaceProjectRequestV1{ProjectID: initial.ID, ExpectedRevision: initial.Revision, Project: draft})
	if err != nil {
		t.Fatalf("Replace() = %v", err)
	}
	base, err := runstore.Open(projects.StateRoot())
	if err != nil {
		t.Fatalf("runstore.Open() = %v", err)
	}
	control, err := New(projects, &failingCaseTransitionStore{Store: base})
	if err != nil {
		t.Fatalf("New() = %v", err)
	}
	defer control.Close()
	launch, err := control.Launch(contracts.LaunchRequestV1{ProjectID: configured.ID, ExpectedRevision: configured.Revision, CandidateIDs: []string{"baseline", "challenger"}})
	if err != nil {
		t.Fatalf("Launch() = %v", err)
	}
	waitForRuns(t, control, launch.RunIDs)
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("candidate started after rejected transition: %v", err)
	}
	for _, runID := range launch.RunIDs {
		run, err := base.Run(runID)
		if err != nil || run.Status != "failed" || run.Error == nil || run.Error.Code != "run_persistence_failed" {
			t.Fatalf("run %s = %#v, %v", runID, run, err)
		}
	}
}

func waitForRuns(t *testing.T, control *Coordinator, ids []string) {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for {
		snapshot, err := control.Snapshot()
		if err != nil {
			t.Fatalf("Snapshot() = %v", err)
		}
		terminal := map[string]bool{}
		for _, run := range snapshot.Runs {
			if contracts.RunTerminal(run.Status) {
				terminal[run.ID] = true
			}
		}
		complete := true
		for _, id := range ids {
			complete = complete && terminal[id]
		}
		if complete {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("runs did not finish: %v", ids)
		}
		time.Sleep(20 * time.Millisecond)
	}
}
