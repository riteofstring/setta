package coordinator

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"github.com/setta/bench/backend/internal/cases"
	"github.com/setta/bench/backend/internal/contracts"
	"github.com/setta/bench/backend/internal/evaluator"
	"github.com/setta/bench/backend/internal/executor"
	"github.com/setta/bench/backend/internal/project"
	"github.com/setta/bench/backend/internal/runstore"
)

var ErrClosed = errors.New("coordinator: application is closed")

type activeRun struct {
	mu             sync.Mutex
	run            contracts.RunV1
	launch         contracts.LaunchV1
	candidate      contracts.CandidateV1
	policy         contracts.ExecutionPolicyV1
	ctx            context.Context
	cancel         context.CancelFunc
	done           chan struct{}
	persistenceErr error
}

type admissionLimiter struct {
	mu      sync.Mutex
	inUse   int
	limit   int
	changed chan struct{}
}

type RunStore interface {
	Snapshot() ([]contracts.LaunchV1, []contracts.RunV1, []contracts.ReviewV1, []contracts.StructuredErrorV1, error)
	OpenArtifact(string) (contracts.ArtifactReferenceV1, io.ReadCloser, error)
	CreateLaunch(contracts.LaunchV1, []contracts.RunV1) error
	UpdateRun(contracts.RunV1) (contracts.RunV1, error)
	NewStagingDirectory() (string, error)
	AdoptArtifacts(string, string, string, string, []contracts.CandidateArtifactV1) ([]contracts.ArtifactReferenceV1, error)
	Run(string) (contracts.RunV1, error)
	LaunchForRun(string) (contracts.LaunchV1, contracts.RunV1, error)
	PutReview(contracts.PutReviewRequestV1, time.Time) (contracts.ReviewV1, error)
}

type Coordinator struct {
	projects *project.Store
	runs     RunStore
	root     string
	ctx      context.Context
	cancel   context.CancelFunc

	mu          sync.Mutex
	active      map[string]*activeRun
	subscribers map[chan contracts.ApplicationSnapshotV1]struct{}
	closed      bool
	wg          sync.WaitGroup
	limiter     *admissionLimiter
}

func New(projects *project.Store, runs RunStore) (*Coordinator, error) {
	if projects == nil || runs == nil {
		return nil, errors.New("coordinator: stores are required")
	}
	projectSnapshot, err := projects.Snapshot()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &Coordinator{
		projects: projects, runs: runs, root: projects.Root(), ctx: ctx, cancel: cancel,
		active: map[string]*activeRun{}, subscribers: map[chan contracts.ApplicationSnapshotV1]struct{}{}, limiter: newAdmissionLimiter(projectSnapshot.Execution.Concurrency),
	}, nil
}

func (coordinator *Coordinator) Snapshot() (contracts.ApplicationSnapshotV1, error) {
	if coordinator == nil {
		return contracts.ApplicationSnapshotV1{}, ErrClosed
	}
	projectSnapshot, err := coordinator.projects.Snapshot()
	if err != nil {
		return contracts.ApplicationSnapshotV1{}, err
	}
	launches, runs, reviews, diagnostics, err := coordinator.runs.Snapshot()
	if err != nil {
		return contracts.ApplicationSnapshotV1{}, err
	}
	validation, currentCases := coordinator.validation(projectSnapshot)
	return contracts.ApplicationSnapshotV1{
		Version: contracts.SnapshotVersion, Project: projectSnapshot, Cases: currentCases, Launches: launches,
		Validation: validation, Runs: runs, Reviews: reviews, Diagnostics: diagnostics,
	}, nil
}

func (coordinator *Coordinator) validation(projectSnapshot contracts.ProjectV1) (contracts.ProjectValidationV1, []contracts.CaseV1) {
	issues := []contracts.ValidationIssueV1{}
	caseValues := []contracts.CaseV1{}
	caseCount := 0
	loadedCases, err := cases.Load(coordinator.root, projectSnapshot.CaseSet)
	if err != nil {
		issues = append(issues, contracts.ValidationIssueV1{Code: "case_manifest_invalid", Message: boundedMessage(err.Error()), Path: "project.caseSet.manifest"})
	} else {
		caseValues = loadedCases
		caseCount = len(loadedCases)
	}
	for _, candidate := range projectSnapshot.Candidates {
		if err := executor.Preflight(coordinator.root, candidate); err != nil {
			issues = append(issues, contracts.ValidationIssueV1{Code: "candidate_command_unavailable", Message: boundedMessage(err.Error()), Path: "project.candidates." + candidate.ID + ".command"})
		}
	}
	executionCount := 0
	if caseCount > 0 {
		executionCount = caseCount * len(projectSnapshot.Candidates)
	}
	return contracts.ProjectValidationV1{Ready: len(issues) == 0, CaseCount: caseCount, ExecutionCount: executionCount, Issues: issues}, caseValues
}

func (coordinator *Coordinator) Project() (contracts.ProjectV1, error) {
	return coordinator.projects.Snapshot()
}

func (coordinator *Coordinator) OpenArtifact(id string) (contracts.ArtifactReferenceV1, io.ReadCloser, error) {
	return coordinator.runs.OpenArtifact(id)
}

func (coordinator *Coordinator) ReplaceProject(request contracts.ReplaceProjectRequestV1) (contracts.ProjectV1, error) {
	if coordinator.isClosed() {
		return contracts.ProjectV1{}, ErrClosed
	}
	updated, err := coordinator.projects.Replace(request)
	if err != nil {
		return contracts.ProjectV1{}, err
	}
	coordinator.limiter.SetLimit(updated.Execution.Concurrency)
	coordinator.publish()
	return updated, nil
}

func (coordinator *Coordinator) ImportCandidate(request contracts.ImportCandidateRequestV1) (contracts.ProjectV1, error) {
	if coordinator.isClosed() {
		return contracts.ProjectV1{}, ErrClosed
	}
	updated, err := coordinator.projects.Import(request)
	if err != nil {
		return contracts.ProjectV1{}, err
	}
	coordinator.publish()
	return updated, nil
}

func (coordinator *Coordinator) Launch(request contracts.LaunchRequestV1) (contracts.LaunchResponseV1, error) {
	if err := request.Validate(); err != nil {
		return contracts.LaunchResponseV1{}, err
	}
	if coordinator.isClosed() {
		return contracts.LaunchResponseV1{}, ErrClosed
	}
	projectSnapshot, err := coordinator.projects.Snapshot()
	if err != nil {
		return contracts.LaunchResponseV1{}, err
	}
	if projectSnapshot.ID != request.ProjectID {
		return contracts.LaunchResponseV1{}, project.ErrIdentityConflict
	}
	if projectSnapshot.Revision != request.ExpectedRevision {
		return contracts.LaunchResponseV1{}, project.ErrRevisionConflict
	}
	selected, err := selectedCandidates(projectSnapshot.Candidates, request.CandidateIDs)
	if err != nil {
		return contracts.LaunchResponseV1{}, err
	}
	validation, caseValues := coordinator.validation(projectSnapshot)
	if !validation.Ready {
		return contracts.LaunchResponseV1{}, fmt.Errorf("coordinator: project is not ready: %s", validation.Issues[0].Message)
	}
	return coordinator.createLaunch(projectSnapshot.ID, projectSnapshot.Revision, projectSnapshot.CaseSet, projectSnapshot.Execution, selected, caseValues, projectSnapshot.Evaluator, nil, nil)
}

func (coordinator *Coordinator) Rerun(runID string) (contracts.LaunchResponseV1, error) {
	if coordinator.isClosed() {
		return contracts.LaunchResponseV1{}, ErrClosed
	}
	launch, run, err := coordinator.runs.LaunchForRun(runID)
	if err != nil {
		return contracts.LaunchResponseV1{}, err
	}
	if !contracts.RunTerminal(run.Status) {
		return contracts.LaunchResponseV1{}, errors.New("coordinator: only a terminal run can be run again")
	}
	var candidate contracts.CandidateV1
	found := false
	for _, value := range launch.Candidates {
		if value.ID == run.CandidateID {
			candidate = value
			found = true
			break
		}
	}
	if !found {
		return contracts.LaunchResponseV1{}, errors.New("coordinator: stored candidate is unavailable")
	}
	if err := executor.Preflight(coordinator.root, candidate); err != nil {
		return contracts.LaunchResponseV1{}, fmt.Errorf("coordinator: stored candidate is unavailable: %w", err)
	}
	return coordinator.createLaunch(launch.ProjectID, launch.ProjectRevision, launch.CaseSet, launch.Execution, []contracts.CandidateV1{candidate}, launch.Cases, launch.Evaluator, &runID, &run.ID)
}

func (coordinator *Coordinator) createLaunch(projectID string, projectRevision int, caseSet contracts.CaseSetV1, policy contracts.ExecutionPolicyV1, candidates []contracts.CandidateV1, caseValues []contracts.CaseV1, evaluation *contracts.EvaluatorV1, rerunParent *string, runParent *string) (contracts.LaunchResponseV1, error) {
	launchID, err := randomID("launch")
	if err != nil {
		return contracts.LaunchResponseV1{}, err
	}
	createdAt := time.Now().UTC().Format(time.RFC3339Nano)
	runIDs := make([]string, len(candidates))
	runs := make([]contracts.RunV1, len(candidates))
	for index, candidate := range candidates {
		runID, err := randomID("run")
		if err != nil {
			return contracts.LaunchResponseV1{}, err
		}
		runIDs[index] = runID
		results := make([]contracts.CaseResultV1, len(caseValues))
		for caseIndex, item := range caseValues {
			results[caseIndex] = contracts.CaseResultV1{
				CaseID: item.ID, CaseName: item.Name, Status: "queued", Progress: 0, Message: "Queued",
				Output: json.RawMessage("null"), Observations: []contracts.ObservationV1{}, Findings: []contracts.FindingV1{}, Artifacts: []contracts.ArtifactReferenceV1{}, Stderr: "",
			}
		}
		runs[index] = contracts.RunV1{
			Version: contracts.RunRecordVersion, ID: runID, LaunchID: launchID, CandidateID: candidate.ID,
			CandidateName: candidate.Name, Status: "queued", CreatedAt: createdAt, CaseResults: results, RerunParentID: runParent,
		}
	}
	launch := contracts.LaunchV1{
		Version: contracts.RunRecordVersion, ID: launchID, ProjectID: projectID, ProjectRevision: projectRevision,
		CreatedAt: createdAt, CaseSet: caseSet, Cases: caseValues, Candidates: candidates,
		Evaluator: evaluation, Execution: policy, RunIDs: runIDs, RerunParentRunID: rerunParent,
	}
	if err := launch.Validate(); err != nil {
		return contracts.LaunchResponseV1{}, err
	}
	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		return contracts.LaunchResponseV1{}, ErrClosed
	}
	if err := coordinator.runs.CreateLaunch(launch, runs); err != nil {
		coordinator.mu.Unlock()
		return contracts.LaunchResponseV1{}, err
	}
	activeRuns := make([]*activeRun, len(runs))
	for index := range runs {
		ctx, cancel := context.WithCancel(coordinator.ctx)
		active := &activeRun{
			run: runs[index], launch: launch, candidate: candidates[index], policy: policy,
			ctx: ctx, cancel: cancel, done: make(chan struct{}),
		}
		coordinator.active[active.run.ID] = active
		coordinator.wg.Add(1)
		activeRuns[index] = active
	}
	coordinator.mu.Unlock()
	for _, active := range activeRuns {
		go coordinator.executeRun(active)
	}
	coordinator.publish()
	return contracts.LaunchResponseV1{LaunchID: launchID, RunIDs: runIDs}, nil
}

func (coordinator *Coordinator) executeRun(active *activeRun) {
	defer coordinator.wg.Done()
	defer func() {
		coordinator.mu.Lock()
		delete(coordinator.active, active.run.ID)
		coordinator.mu.Unlock()
		coordinator.publish()
		close(active.done)
	}()
	stamp := time.Now().UTC().Format(time.RFC3339Nano)
	active.mu.Lock()
	active.run.Status = "running"
	active.run.StartedAt = &stamp
	_, startErr := coordinator.runs.UpdateRun(active.run)
	active.mu.Unlock()
	if startErr != nil {
		coordinator.failRunStart(active, startErr)
		return
	}
	coordinator.publish()
	var casesWG sync.WaitGroup
	for index := range active.launch.Cases {
		casesWG.Add(1)
		go func(caseIndex int) {
			defer casesWG.Done()
			if !coordinator.limiter.Acquire(active.ctx) {
				coordinator.finishUnstartedCase(active, caseIndex)
				return
			}
			defer coordinator.limiter.Release()
			coordinator.executeCase(active, caseIndex)
		}(index)
	}
	casesWG.Wait()
	completedAt := time.Now().UTC().Format(time.RFC3339Nano)
	active.mu.Lock()
	if active.persistenceErr != nil {
		active.run.Status = "failed"
		active.run.Error = &contracts.StructuredErrorV1{Code: "run_persistence_failed", Message: boundedMessage(active.persistenceErr.Error())}
		for index := range active.run.CaseResults {
			result := &active.run.CaseResults[index]
			if !caseResultTerminal(result.Status) {
				result.Status = "failed"
				result.Progress = 1
				result.Message = "Failed"
				result.CompletedAt = &completedAt
				result.Error = &contracts.StructuredErrorV1{Code: "run_persistence_failed", Message: "Execution stopped because run state was not durable."}
			}
		}
	} else if active.ctx.Err() != nil {
		active.run.Status = "canceled"
	} else {
		active.run.Status = "completed"
	}
	active.run.CompletedAt = &completedAt
	updated, err := coordinator.runs.UpdateRun(active.run)
	if err == nil {
		active.run = updated
	} else {
		coordinator.markPersistenceFailureLocked(active, err)
		active.run.Status = "failed"
		active.run.Error = &contracts.StructuredErrorV1{Code: "run_persistence_failed", Message: boundedMessage(active.persistenceErr.Error())}
		if retried, retryErr := coordinator.runs.UpdateRun(active.run); retryErr == nil {
			active.run = retried
		} else {
			coordinator.markPersistenceFailureLocked(active, retryErr)
		}
	}
	active.mu.Unlock()
}

func (coordinator *Coordinator) failRunStart(active *activeRun, cause error) {
	completedAt := time.Now().UTC().Format(time.RFC3339Nano)
	active.mu.Lock()
	active.run.Status = "failed"
	active.run.CompletedAt = &completedAt
	active.run.Error = &contracts.StructuredErrorV1{Code: "run_persistence_failed", Message: boundedMessage(cause.Error())}
	for index := range active.run.CaseResults {
		result := &active.run.CaseResults[index]
		result.Status = "failed"
		result.Progress = 1
		result.Message = "Failed"
		result.CompletedAt = &completedAt
		result.Error = &contracts.StructuredErrorV1{Code: "run_persistence_failed", Message: "The run could not start because its running state was not durable."}
	}
	updated, err := coordinator.runs.UpdateRun(active.run)
	if err == nil {
		active.run = updated
	} else {
		coordinator.markPersistenceFailureLocked(active, err)
	}
	active.mu.Unlock()
}

func (coordinator *Coordinator) markPersistenceFailureLocked(active *activeRun, cause error) {
	if cause == nil {
		return
	}
	active.persistenceErr = errors.Join(active.persistenceErr, cause)
	active.cancel()
}

func (coordinator *Coordinator) executeCase(active *activeRun, index int) {
	startedAt := time.Now().UTC().Format(time.RFC3339Nano)
	active.mu.Lock()
	active.run.CaseResults[index].Status = "running"
	active.run.CaseResults[index].StartedAt = &startedAt
	active.run.CaseResults[index].Message = "Running"
	_, transitionErr := coordinator.runs.UpdateRun(active.run)
	if transitionErr != nil {
		coordinator.markPersistenceFailureLocked(active, transitionErr)
	}
	active.mu.Unlock()
	if transitionErr != nil {
		return
	}
	coordinator.publish()
	staging, err := coordinator.runs.NewStagingDirectory()
	if err != nil {
		coordinator.finishCaseFailure(active, index, "staging_failed", err)
		return
	}
	defer os.RemoveAll(staging)
	result := executor.Execute(active.ctx, executor.Request{
		ProjectRoot: coordinator.root, RunID: active.run.ID, Case: active.launch.Cases[index], Candidate: active.candidate,
		OutputDirectory: staging, Timeout: time.Duration(active.policy.TimeoutMilliseconds) * time.Millisecond,
		Progress: func(progress float64, message string) { coordinator.updateProgress(active, index, progress, message) },
	})
	completedAt := time.Now().UTC().Format(time.RFC3339Nano)
	duration := result.Duration.Milliseconds()
	artifacts := []contracts.ArtifactReferenceV1{}
	findings := []contracts.FindingV1{}
	status := result.Status
	failure := result.Error
	if status == "succeeded" {
		artifacts, err = coordinator.runs.AdoptArtifacts(active.launch.ID, active.run.ID, active.launch.Cases[index].ID, staging, result.Artifacts)
		if err != nil {
			status = "failed"
			failure = &contracts.StructuredErrorV1{Code: "artifact_admission_failed", Message: boundedMessage(err.Error())}
		} else {
			findings = evaluator.Apply(active.launch.Evaluator, artifacts, coordinator.runs)
		}
	}
	durationValue := float64(duration)
	observations := append([]contracts.ObservationV1(nil), result.Observations...)
	observations = append(observations, contracts.ObservationV1{ID: "duration-ms", Name: "Duration", Kind: "number", NumberValue: &durationValue})
	active.mu.Lock()
	caseResult := &active.run.CaseResults[index]
	caseResult.Status = status
	caseResult.Progress = 1
	caseResult.Message = terminalMessage(status)
	caseResult.CompletedAt = &completedAt
	caseResult.DurationMilliseconds = &duration
	caseResult.Output = result.Output
	caseResult.Observations = observations
	caseResult.Findings = findings
	caseResult.Artifacts = artifacts
	caseResult.Stderr = result.Stderr
	caseResult.StderrTruncated = result.StderrTruncated
	caseResult.Error = failure
	if _, err := coordinator.runs.UpdateRun(active.run); err != nil {
		coordinator.markPersistenceFailureLocked(active, err)
	}
	active.mu.Unlock()
	coordinator.publish()
}

func (coordinator *Coordinator) updateProgress(active *activeRun, index int, progress float64, message string) {
	active.mu.Lock()
	if active.run.CaseResults[index].Status == "running" {
		active.run.CaseResults[index].Progress = progress
		active.run.CaseResults[index].Message = message
		if _, err := coordinator.runs.UpdateRun(active.run); err != nil {
			coordinator.markPersistenceFailureLocked(active, err)
		}
	}
	active.mu.Unlock()
	coordinator.publish()
}

func (coordinator *Coordinator) finishUnstartedCase(active *activeRun, index int) {
	completedAt := time.Now().UTC().Format(time.RFC3339Nano)
	active.mu.Lock()
	result := &active.run.CaseResults[index]
	result.Status = "canceled"
	result.Progress = 1
	result.Message = "Canceled"
	result.CompletedAt = &completedAt
	result.Error = &contracts.StructuredErrorV1{Code: "execution_canceled", Message: "The run was canceled before this case started."}
	if _, err := coordinator.runs.UpdateRun(active.run); err != nil {
		coordinator.markPersistenceFailureLocked(active, err)
	}
	active.mu.Unlock()
	coordinator.publish()
}

func (coordinator *Coordinator) finishCaseFailure(active *activeRun, index int, code string, err error) {
	completedAt := time.Now().UTC().Format(time.RFC3339Nano)
	zero := int64(0)
	active.mu.Lock()
	result := &active.run.CaseResults[index]
	result.Status = "failed"
	result.Progress = 1
	result.Message = "Failed"
	result.CompletedAt = &completedAt
	result.DurationMilliseconds = &zero
	result.Error = &contracts.StructuredErrorV1{Code: code, Message: boundedMessage(err.Error())}
	if _, err := coordinator.runs.UpdateRun(active.run); err != nil {
		coordinator.markPersistenceFailureLocked(active, err)
	}
	active.mu.Unlock()
	coordinator.publish()
}

func (coordinator *Coordinator) Cancel(runID string) (contracts.RunV1, error) {
	if !contracts.ValidID(runID) {
		return contracts.RunV1{}, runstore.ErrRunNotFound
	}
	coordinator.mu.Lock()
	active := coordinator.active[runID]
	coordinator.mu.Unlock()
	if active == nil {
		run, err := coordinator.runs.Run(runID)
		if err != nil {
			return contracts.RunV1{}, err
		}
		if !contracts.RunTerminal(run.Status) {
			return contracts.RunV1{}, errors.New("coordinator: run is not active")
		}
		return run, nil
	}
	active.cancel()
	<-active.done
	return coordinator.runs.Run(runID)
}

func (coordinator *Coordinator) PutReview(request contracts.PutReviewRequestV1) (contracts.ReviewV1, error) {
	if coordinator.isClosed() {
		return contracts.ReviewV1{}, ErrClosed
	}
	review, err := coordinator.runs.PutReview(request, time.Now())
	if err != nil {
		return contracts.ReviewV1{}, err
	}
	coordinator.publish()
	return review, nil
}

func (coordinator *Coordinator) Subscribe(ctx context.Context) (<-chan contracts.ApplicationSnapshotV1, error) {
	if ctx == nil {
		return nil, errors.New("coordinator: subscription context is required")
	}
	channel := make(chan contracts.ApplicationSnapshotV1, 1)
	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		return nil, ErrClosed
	}
	snapshot, err := coordinator.Snapshot()
	if err != nil {
		coordinator.mu.Unlock()
		return nil, err
	}
	channel <- snapshot
	coordinator.subscribers[channel] = struct{}{}
	coordinator.mu.Unlock()
	go func() {
		<-ctx.Done()
		coordinator.mu.Lock()
		if _, exists := coordinator.subscribers[channel]; exists {
			delete(coordinator.subscribers, channel)
			close(channel)
		}
		coordinator.mu.Unlock()
	}()
	return channel, nil
}

func (coordinator *Coordinator) publish() {
	snapshot, err := coordinator.Snapshot()
	if err != nil {
		return
	}
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	for channel := range coordinator.subscribers {
		select {
		case channel <- snapshot:
		default:
			select {
			case <-channel:
			default:
			}
			channel <- snapshot
		}
	}
}

func (coordinator *Coordinator) Close() error {
	if coordinator == nil {
		return nil
	}
	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		return nil
	}
	coordinator.closed = true
	coordinator.cancel()
	for _, active := range coordinator.active {
		active.cancel()
	}
	coordinator.mu.Unlock()
	coordinator.wg.Wait()
	coordinator.mu.Lock()
	for subscriber := range coordinator.subscribers {
		close(subscriber)
	}
	coordinator.subscribers = nil
	coordinator.mu.Unlock()
	return nil
}

func (coordinator *Coordinator) isClosed() bool {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	return coordinator.closed
}

func selectedCandidates(candidates []contracts.CandidateV1, ids []string) ([]contracts.CandidateV1, error) {
	byID := make(map[string]contracts.CandidateV1, len(candidates))
	for _, candidate := range candidates {
		byID[candidate.ID] = candidate
	}
	selected := make([]contracts.CandidateV1, len(ids))
	for index, id := range ids {
		candidate, exists := byID[id]
		if !exists {
			return nil, fmt.Errorf("coordinator: candidate %q was not found", id)
		}
		selected[index] = candidate
	}
	return selected, nil
}

func terminalMessage(status string) string {
	switch status {
	case "succeeded":
		return "Complete"
	case "timed_out":
		return "Timed out"
	case "canceled":
		return "Canceled"
	default:
		return "Failed"
	}
}

func caseResultTerminal(status string) bool {
	switch status {
	case "succeeded", "failed", "canceled", "timed_out", "interrupted":
		return true
	default:
		return false
	}
}

func newAdmissionLimiter(limit int) *admissionLimiter {
	return &admissionLimiter{limit: limit, changed: make(chan struct{})}
}

func (limiter *admissionLimiter) SetLimit(limit int) {
	limiter.mu.Lock()
	limiter.limit = limit
	close(limiter.changed)
	limiter.changed = make(chan struct{})
	limiter.mu.Unlock()
}

func (limiter *admissionLimiter) Acquire(ctx context.Context) bool {
	for {
		limiter.mu.Lock()
		if limiter.inUse < limiter.limit {
			limiter.inUse++
			limiter.mu.Unlock()
			return true
		}
		changed := limiter.changed
		limiter.mu.Unlock()
		select {
		case <-ctx.Done():
			return false
		case <-changed:
		}
	}
}

func (limiter *admissionLimiter) Release() {
	limiter.mu.Lock()
	if limiter.inUse > 0 {
		limiter.inUse--
	}
	close(limiter.changed)
	limiter.changed = make(chan struct{})
	limiter.mu.Unlock()
}

func boundedMessage(message string) string {
	if len(message) > 4096 {
		return message[:4096]
	}
	return message
}

func randomID(prefix string) (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return prefix + "-" + hex.EncodeToString(value), nil
}
