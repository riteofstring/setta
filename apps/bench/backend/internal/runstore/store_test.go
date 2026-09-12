package runstore

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/setta/bench/backend/internal/contracts"
)

func TestRunArtifactPersistsAndTerminalHistoryIsImmutable(t *testing.T) {
	t.Parallel()
	stateRoot := t.TempDir()
	store, err := Open(stateRoot)
	if err != nil {
		t.Fatalf("Open() = %v", err)
	}
	launch, run := queuedHistory()
	if err := store.CreateLaunch(launch, []contracts.RunV1{run}); err != nil {
		t.Fatalf("CreateLaunch() = %v", err)
	}
	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	run.Status = "running"
	run.StartedAt = &startedAt
	run.CaseResults[0].Status = "running"
	run.CaseResults[0].StartedAt = &startedAt
	if _, err := store.UpdateRun(run); err != nil {
		t.Fatalf("UpdateRun(running) = %v", err)
	}
	staging, err := store.NewStagingDirectory()
	if err != nil {
		t.Fatalf("NewStagingDirectory() = %v", err)
	}
	if err := os.WriteFile(filepath.Join(staging, "result.txt"), []byte("artifact evidence"), 0o600); err != nil {
		t.Fatalf("write artifact = %v", err)
	}
	assertArtifactSymlinkRejected(t, store, stateRoot, staging, launch, run)
	artifacts, err := store.AdoptArtifacts(launch.ID, run.ID, launch.Cases[0].ID, staging, []contracts.CandidateArtifactV1{{Name: "report", MediaType: "text/plain", Path: "result.txt"}})
	if err != nil {
		t.Fatalf("AdoptArtifacts() = %v", err)
	}
	completedAt := time.Now().UTC().Format(time.RFC3339Nano)
	duration := int64(12)
	run.Status = "completed"
	run.CompletedAt = &completedAt
	run.CaseResults[0].Status = "succeeded"
	run.CaseResults[0].Progress = 1
	run.CaseResults[0].Message = "Complete"
	run.CaseResults[0].CompletedAt = &completedAt
	run.CaseResults[0].DurationMilliseconds = &duration
	run.CaseResults[0].Output = json.RawMessage(`{"accepted":true}`)
	run.CaseResults[0].Artifacts = artifacts
	if _, err := store.UpdateRun(run); err != nil {
		t.Fatalf("UpdateRun(completed) = %v", err)
	}
	if _, err := store.UpdateRun(run); !errors.Is(err, ErrRunTerminal) {
		t.Fatalf("UpdateRun(terminal) error = %v", err)
	}
	reopened, err := Open(stateRoot)
	if err != nil {
		t.Fatalf("reopen = %v", err)
	}
	loaded, err := reopened.Run(run.ID)
	if err != nil || loaded.Status != "completed" || len(loaded.CaseResults[0].Artifacts) != 1 {
		t.Fatalf("reopened Run() = %#v, %v", loaded, err)
	}
	reference, reader, err := reopened.OpenArtifact(artifacts[0].ID)
	if err != nil {
		t.Fatalf("OpenArtifact() = %v", err)
	}
	defer reader.Close()
	content, err := io.ReadAll(reader)
	if err != nil || string(content) != "artifact evidence" || reference.SHA256 != artifacts[0].SHA256 {
		t.Fatalf("artifact = %q, %#v, %v", content, reference, err)
	}
}

func assertArtifactSymlinkRejected(t *testing.T, store *Store, stateRoot string, staging string, launch contracts.LaunchV1, run contracts.RunV1) {
	t.Helper()
	outside := filepath.Join(stateRoot, "outside.txt")
	if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
		t.Fatalf("write outside artifact = %v", err)
	}
	if err := os.Symlink(outside, filepath.Join(staging, "linked.txt")); err != nil {
		return
	}
	artifacts := []contracts.CandidateArtifactV1{{Name: "linked", MediaType: "text/plain", Path: "linked.txt"}}
	if _, err := store.AdoptArtifacts(launch.ID, run.ID, launch.Cases[0].ID, staging, artifacts); err == nil {
		t.Fatal("AdoptArtifacts() accepted a symbolic link")
	}
}

func TestOpenMarksAcceptedNonterminalHistoryInterrupted(t *testing.T) {
	t.Parallel()
	stateRoot := t.TempDir()
	store, err := Open(stateRoot)
	if err != nil {
		t.Fatalf("Open() = %v", err)
	}
	launch, run := queuedHistory()
	if err := store.CreateLaunch(launch, []contracts.RunV1{run}); err != nil {
		t.Fatalf("CreateLaunch() = %v", err)
	}
	reopened, err := Open(stateRoot)
	if err != nil {
		t.Fatalf("reopen = %v", err)
	}
	loaded, err := reopened.Run(run.ID)
	if err != nil {
		t.Fatalf("Run() = %v", err)
	}
	if loaded.Status != "interrupted" || loaded.CaseResults[0].Status != "interrupted" || loaded.Error == nil || loaded.Error.Code != "host_restarted" {
		t.Fatalf("recovered run = %#v", loaded)
	}
}

func TestOpenSurfacesCorruptReviewsWithoutHidingRunHistory(t *testing.T) {
	t.Parallel()
	stateRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(stateRoot, "reviews.json"), []byte("not json"), 0o600); err != nil {
		t.Fatalf("write corrupt reviews = %v", err)
	}
	store, err := Open(stateRoot)
	if err != nil {
		t.Fatalf("Open() = %v", err)
	}
	_, _, reviews, diagnostics, err := store.Snapshot()
	if err != nil || len(reviews) != 0 || len(diagnostics) != 1 || diagnostics[0].Code != "corrupt_reviews" {
		t.Fatalf("Snapshot() reviews=%#v diagnostics=%#v error=%v", reviews, diagnostics, err)
	}
}

func queuedHistory() (contracts.LaunchV1, contracts.RunV1) {
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	caseValue := contracts.CaseV1{ID: "case-one", Name: "Case one", Input: json.RawMessage(`{"value":1}`), Expected: json.RawMessage("null")}
	candidate := contracts.CandidateV1{ID: "candidate", Name: "Candidate", Command: contracts.CommandV1{Argv: []string{"candidate"}, WorkingDirectory: "."}}
	launch := contracts.LaunchV1{
		Version: contracts.RunRecordVersion, ID: "launch-one", ProjectID: "project-one", ProjectRevision: 1, CreatedAt: createdAt,
		CaseSet: contracts.CaseSetV1{ID: "cases", Name: "Cases", Manifest: "cases.jsonl"}, Cases: []contracts.CaseV1{caseValue}, Candidates: []contracts.CandidateV1{candidate},
		Evaluator: nil, Execution: contracts.ExecutionPolicyV1{Concurrency: 1, TimeoutMilliseconds: 1000}, RunIDs: []string{"run-one"}, RerunParentRunID: nil,
	}
	run := contracts.RunV1{
		Version: contracts.RunRecordVersion, ID: "run-one", LaunchID: launch.ID, CandidateID: candidate.ID, CandidateName: candidate.Name,
		Status: "queued", CreatedAt: createdAt, CaseResults: []contracts.CaseResultV1{{
			CaseID: caseValue.ID, CaseName: caseValue.Name, Status: "queued", Progress: 0, Message: "Queued", Output: json.RawMessage("null"),
			Observations: []contracts.ObservationV1{}, Findings: []contracts.FindingV1{}, Artifacts: []contracts.ArtifactReferenceV1{}, Stderr: "",
		}},
	}
	return launch, run
}
