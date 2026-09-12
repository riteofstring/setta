package runtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"sync"

	"github.com/setta/realtime/backend/internal/content"
	"github.com/setta/realtime/backend/internal/contracts"
	"github.com/setta/realtime/backend/internal/materialization"
	"github.com/setta/realtime/backend/internal/project"
	"github.com/setta/realtime/backend/internal/scheduler"
	"github.com/setta/realtime/backend/internal/source"
)

var (
	ErrClosed            = errors.New("runtime: coordinator is closed")
	ErrSessionConflict   = errors.New("runtime: session identity conflict")
	ErrNoBinding         = errors.New("runtime: event has no binding")
	ErrWorkerNotReady    = errors.New("runtime: worker is not ready")
	ErrInvocationUnknown = errors.New("runtime: invocation is unknown")
)

type Worker interface {
	Reload(context.Context, string, contracts.RuntimeDeclaration) (contracts.InitializeResult, error)
	Stop() error
	Invoke(context.Context, contracts.InvokeParams) (contracts.InvokeResult, error)
	Updates() <-chan contracts.RuntimeUpdate
	Close() error
}

type ArtifactSource interface {
	OpenArtifact(contracts.InvocationIdentity, string) (io.ReadCloser, error)
}

type LogSource interface {
	Logs() <-chan contracts.RuntimeLog
}

type Coordinator struct {
	mu                 sync.Mutex
	mutations          sync.Mutex
	projectRoot        string
	projects           *project.Store
	content            *content.Store
	materializations   *materialization.Store
	sources            *source.Store
	worker             Worker
	scheduler          *scheduler.Scheduler
	sessionID          string
	workerState        string
	values             map[string]json.RawMessage
	invocations        map[string]contracts.InvocationStatus
	bindings           map[string]contracts.Binding
	invocationBindings map[string]contracts.Binding
	sequences          map[string]uint64
	publishedByBinding map[string]contracts.InvocationIdentity
	retainedByBinding  map[string]bool
	materializedOutput map[string]map[string]json.RawMessage
	materializedRefs   map[string][]contracts.ContentReference
	materializedHashes map[string]string
	startupAttempts    map[string]string
	invocationOutputs  map[string]map[string]json.RawMessage
	invocationHashes   map[string]string
	invocationHolds    map[string]bool
	sourceVersion      string
	active             map[string]struct{}
	subscribers        map[chan contracts.RuntimeEnvelope]struct{}
	closed             bool
	updatesDone        chan struct{}
	logsDone           chan struct{}
	newSessionID       func() (string, error)
}

func New(projectRoot string, projects *project.Store, contentStore *content.Store, worker Worker) (*Coordinator, error) {
	if strings.TrimSpace(projectRoot) == "" || projects == nil || contentStore == nil || worker == nil {
		return nil, errors.New("runtime: project root, stores, and worker are required")
	}
	snapshot, err := projects.Snapshot()
	if err != nil {
		return nil, err
	}
	sessionID, err := randomID("session")
	if err != nil {
		return nil, err
	}
	configured, bindings, err := configuredScheduler(snapshot)
	if err != nil {
		return nil, err
	}
	sources, err := source.Open(projectRoot)
	if err != nil {
		configured.Close()
		return nil, err
	}
	materializations, err := materialization.Open(filepath.Join(projectRoot, ".local", "realtime", "materializations"))
	if err != nil {
		configured.Close()
		return nil, err
	}
	coordinator := &Coordinator{
		projectRoot: projectRoot, projects: projects, content: contentStore, materializations: materializations, sources: sources, worker: worker, scheduler: configured,
		sessionID: sessionID, workerState: "stopped", values: make(map[string]json.RawMessage),
		invocations: make(map[string]contracts.InvocationStatus), bindings: bindings,
		invocationBindings: make(map[string]contracts.Binding), sequences: make(map[string]uint64), active: make(map[string]struct{}),
		publishedByBinding: make(map[string]contracts.InvocationIdentity), retainedByBinding: make(map[string]bool),
		materializedOutput: make(map[string]map[string]json.RawMessage), materializedRefs: make(map[string][]contracts.ContentReference),
		materializedHashes: make(map[string]string), startupAttempts: make(map[string]string), invocationOutputs: make(map[string]map[string]json.RawMessage),
		invocationHashes: make(map[string]string), invocationHolds: make(map[string]bool),
		subscribers: make(map[chan contracts.RuntimeEnvelope]struct{}), updatesDone: make(chan struct{}), logsDone: make(chan struct{}),
		newSessionID: func() (string, error) { return randomID("session") },
	}
	go coordinator.consumeUpdates()
	if _, supported := worker.(LogSource); supported {
		go coordinator.consumeLogs()
	} else {
		close(coordinator.logsDone)
	}
	return coordinator, nil
}

func (coordinator *Coordinator) ProjectSnapshot() (contracts.Project, error) {
	if coordinator == nil {
		return contracts.Project{}, ErrClosed
	}
	return coordinator.projects.Snapshot()
}

func (coordinator *Coordinator) Apply(request contracts.ApplyRequest) (contracts.Project, error) {
	if coordinator == nil {
		return contracts.Project{}, ErrClosed
	}
	coordinator.mutations.Lock()
	defer coordinator.mutations.Unlock()
	candidate, err := coordinator.projects.Apply(request)
	if err != nil {
		return contracts.Project{}, err
	}
	replacement, bindings, err := configuredScheduler(candidate)
	if err != nil {
		return contracts.Project{}, err
	}
	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		replacement.Close()
		return contracts.Project{}, ErrClosed
	}
	reuseScheduler := reflect.DeepEqual(coordinator.bindings, bindings)
	previous := coordinator.scheduler
	if !reuseScheduler {
		coordinator.invalidateAllRunsLocked(previous, "project_changed", "The project pipeline changed.")
		coordinator.scheduler = replacement
	}
	coordinator.bindings = bindings
	coordinator.pipeline = pipeline
	discarded := coordinator.dropUnretainedMaterializationsLocked(bindings)
	coordinator.mu.Unlock()
	if reuseScheduler {
		replacement.Close()
	} else {
		previous.Close()
	}
	_ = coordinator.content.DeleteReferences(discarded)
	coordinator.reconcileMaterializations(candidate)
	return candidate, nil
}

func (coordinator *Coordinator) RuntimeSource() (contracts.RuntimeSourceDocument, error) {
	if coordinator == nil {
		return contracts.RuntimeSourceDocument{}, ErrClosed
	}
	coordinator.mutations.Lock()
	defer coordinator.mutations.Unlock()
	coordinator.mu.Lock()
	closed := coordinator.closed
	coordinator.mu.Unlock()
	if closed {
		return contracts.RuntimeSourceDocument{}, ErrClosed
	}
	projectSnapshot, err := coordinator.projects.Snapshot()
	if err != nil {
		return contracts.RuntimeSourceDocument{}, err
	}
	return coordinator.sources.Read(projectSnapshot)
}

func (coordinator *Coordinator) ApplyRuntimeSource(ctx context.Context, request contracts.ApplyRuntimeSourceRequest) (contracts.ApplyRuntimeSourceResult, error) {
	if coordinator == nil {
		return contracts.ApplyRuntimeSourceResult{}, ErrClosed
	}
	coordinator.mutations.Lock()
	defer coordinator.mutations.Unlock()
	coordinator.mu.Lock()
	closed := coordinator.closed
	coordinator.mu.Unlock()
	if closed {
		return contracts.ApplyRuntimeSourceResult{}, ErrClosed
	}
	projectSnapshot, err := coordinator.projects.Snapshot()
	if err != nil {
		return contracts.ApplyRuntimeSourceResult{}, err
	}
	document, err := coordinator.sources.Apply(projectSnapshot, request)
	if err != nil {
		return contracts.ApplyRuntimeSourceResult{}, err
	}
	initialized, reloadErr := coordinator.reloadLocked(ctx, projectSnapshot, true)
	activation := contracts.RuntimeSourceActivation{State: "activated"}
	if reloadErr != nil {
		activation = contracts.RuntimeSourceActivation{State: "rejected", Error: &contracts.StructuredError{Code: "reload_error", Message: reloadErr.Error()}}
	} else if initialized.LoadError != nil {
		failure := *initialized.LoadError
		activation = contracts.RuntimeSourceActivation{State: "rejected", Error: &failure}
	}
	return contracts.ApplyRuntimeSourceResult{Source: document, Activation: activation}, nil
}

func (coordinator *Coordinator) Reload(ctx context.Context) (contracts.InitializeResult, error) {
	if coordinator == nil {
		return contracts.InitializeResult{}, ErrClosed
	}
	coordinator.mutations.Lock()
	defer coordinator.mutations.Unlock()
	projectSnapshot, err := coordinator.projects.Snapshot()
	if err != nil {
		return contracts.InitializeResult{}, err
	}
	return coordinator.reloadLocked(ctx, projectSnapshot, false)
}

func (coordinator *Coordinator) reloadLocked(ctx context.Context, projectSnapshot contracts.Project, failOnPreparationError bool) (contracts.InitializeResult, error) {
	sourceVersion := ""
	if document, sourceErr := coordinator.sources.Read(projectSnapshot); sourceErr == nil {
		sourceVersion = document.Version
	}
	replacement, bindings, err := configuredScheduler(projectSnapshot)
	if err != nil {
		if failOnPreparationError {
			err = errors.Join(err, coordinator.failSourceActivationLocked())
		}
		return contracts.InitializeResult{}, err
	}
	sessionID, err := coordinator.newSessionID()
	if err != nil {
		replacement.Close()
		if failOnPreparationError {
			err = errors.Join(err, coordinator.failSourceActivationLocked())
		}
		return contracts.InitializeResult{}, err
	}
	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		replacement.Close()
		return contracts.InitializeResult{}, ErrClosed
	}
	previous := coordinator.scheduler
	coordinator.invalidateAllRunsLocked(previous, "runtime_reloaded", "The runtime was reloaded.")
	coordinator.scheduler = replacement
	coordinator.bindings = bindings
	coordinator.pipeline = pipeline
	coordinator.sessionID = sessionID
	coordinator.workerState = "starting"
	discarded := coordinator.resetRuntimeLocked(projectSnapshot, sourceVersion)
	coordinator.publishSnapshotLocked()
	coordinator.mu.Unlock()
	previous.Close()
	_ = coordinator.content.DeleteReferences(discarded)
	coordinator.reconcileMaterializations(projectSnapshot)
	coordinator.restoreMaterializations(projectSnapshot, sessionID)
	result, reloadErr := coordinator.worker.Reload(ctx, coordinator.projectRoot, projectSnapshot.Runtime)
	coordinator.mu.Lock()
	if reloadErr != nil || result.LoadError != nil {
		coordinator.workerState = "failed"
	} else {
		coordinator.workerState = "ready"
	}
	coordinator.publishSnapshotLocked()
	coordinator.mu.Unlock()
	return result, reloadErr
}

func (coordinator *Coordinator) failSourceActivationLocked() error {
	coordinator.mu.Lock()
	previous := coordinator.scheduler
	coordinator.invalidateAllRunsLocked(previous, "source_activation_failed", "Runtime source activation failed.")
	discarded := coordinator.runtimeReferencesLocked()
	coordinator.workerState = "failed"
	coordinator.handlers = []string{}
	coordinator.invocations = make(map[string]contracts.InvocationStatus)
	coordinator.invocationBindings = make(map[string]contracts.Binding)
	coordinator.invocationOutputs = make(map[string]map[string]json.RawMessage)
	coordinator.invocationHashes = make(map[string]string)
	coordinator.invocationHolds = make(map[string]bool)
	coordinator.runs = make(map[string]*pipelineRun)
	coordinator.invocationRuns = make(map[string]string)
	coordinator.sequences = make(map[string]uint64)
	coordinator.publishedByBinding = make(map[string]contracts.InvocationIdentity)
	coordinator.active = make(map[string]struct{})
	coordinator.publishSnapshotLocked()
	coordinator.mu.Unlock()
	stopErr := coordinator.worker.Stop()
	previous.Close()
	_ = coordinator.content.DeleteReferences(discarded)
	return stopErr
}

func (coordinator *Coordinator) Invoke(ctx context.Context, handler string, request contracts.DirectInvokeRequest) (contracts.InvokeResult, error) {
	if err := request.Validate(); err != nil {
		return contracts.InvokeResult{}, err
	}
	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		return contracts.InvokeResult{}, ErrClosed
	}
	if coordinator.workerState != "ready" {
		coordinator.mu.Unlock()
		return contracts.InvokeResult{}, ErrWorkerNotReady
	}
	coordinator.sequences["direct"]++
	identity, err := coordinator.identityLocked("direct", coordinator.sequences["direct"])
	coordinator.mu.Unlock()
	if err != nil {
		return contracts.InvokeResult{}, err
	}
	arguments, references, err := coordinator.prepareArguments(request.Arguments, request.Content, identity.InvocationID)
	if err != nil {
		return contracts.InvokeResult{}, err
	}
	defer coordinator.content.DeleteReferences(references)
	return coordinator.worker.Invoke(ctx, contracts.InvokeParams{Identity: identity, Handler: handler, Arguments: arguments, Content: references})
}

func (coordinator *Coordinator) HandleEvent(event contracts.RuntimeEvent) (int, error) {
	if err := event.Validate(); err != nil {
		return 0, err
	}
	projectSnapshot, err := coordinator.projects.Snapshot()
	if err != nil {
		return 0, err
	}
	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		return 0, ErrClosed
	}
	if event.SessionID != coordinator.sessionID {
		coordinator.mu.Unlock()
		return 0, ErrSessionConflict
	}
	if coordinator.workerState != "ready" {
		coordinator.mu.Unlock()
		return 0, ErrWorkerNotReady
	}
	matching := matchingBindings(projectSnapshot.Bindings, event)
	coordinator.mu.Unlock()
	if len(matching) == 0 {
		return 0, ErrNoBinding
	}
	return coordinator.scheduleBindings(projectSnapshot, event, matching)
}

func matchingBindings(bindings []contracts.Binding, event contracts.RuntimeEvent) []contracts.Binding {
	matching := make([]contracts.Binding, 0)
	for _, binding := range bindings {
		if binding.Trigger.SectionID == event.SectionID && binding.Trigger.Event == event.Event {
			matching = append(matching, binding)
		}
	}
	return matching
}

func (coordinator *Coordinator) scheduleBindings(projectSnapshot contracts.Project, event contracts.RuntimeEvent, bindings []contracts.Binding) (int, error) {
	accepted := 0
	references := []contracts.ContentReference{}
	for _, binding := range bindings {
		owned, scheduled, err := coordinator.scheduleBinding(projectSnapshot, event, binding)
		references = appendUniqueReferences(references, owned)
		if err != nil {
			if errors.Is(err, scheduler.ErrBusy) || errors.Is(err, scheduler.ErrQueueFull) {
				continue
			}
			_ = coordinator.content.DeleteReferences(references)
			return accepted, err
		}
		if scheduled {
			accepted++
		}
	}
	_ = coordinator.content.DeleteReferences(references)
	return accepted, nil
}

func (coordinator *Coordinator) Cancel(request contracts.RuntimeCancelRequest) error {
	if err := request.Validate(); err != nil {
		return err
	}
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if coordinator.closed {
		return ErrClosed
	}
	if request.Identity.SessionID != coordinator.sessionID {
		return ErrSessionConflict
	}
	status, exists := coordinator.invocations[request.Identity.InvocationID]
	if !exists || status.Identity != request.Identity {
		return ErrInvocationUnknown
	}
	if !coordinator.scheduler.Cancel(request.Identity.InvocationID) {
		return ErrInvocationUnknown
	}
	status.State = "cancelled"
	status.Error = &contracts.StructuredError{Code: "cancelled", Message: "Invocation was cancelled."}
	coordinator.invocations[request.Identity.InvocationID] = status
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
	return nil
}

func (coordinator *Coordinator) scheduleBinding(projectSnapshot contracts.Project, event contracts.RuntimeEvent, binding contracts.Binding) ([]contracts.ContentReference, bool, error) {
	coordinator.mu.Lock()
	identity, arguments, rawReferences, fingerprint, scheduled, err := coordinator.prepareBindingLocked(projectSnapshot, event, binding)
	coordinator.mu.Unlock()
	if err != nil {
		return nil, false, err
	}
	if !scheduled {
		return rawReferences, false, nil
	}
	prepared, references, err := coordinator.prepareArguments(arguments, rawReferences, identity.InvocationID)
	if err != nil {
		return rawReferences, false, err
	}
	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		_ = coordinator.content.DeleteReferences(references)
		return rawReferences, false, ErrClosed
	}
	err = coordinator.submitBindingLocked(binding, identity, prepared, references, fingerprint, event.Cause)
	coordinator.mu.Unlock()
	if err != nil {
		_ = coordinator.content.DeleteReferences(references)
		return rawReferences, false, err
	}
	return rawReferences, true, nil
}

func (coordinator *Coordinator) prepareBindingLocked(projectSnapshot contracts.Project, event contracts.RuntimeEvent, binding contracts.Binding) (contracts.InvocationIdentity, map[string]json.RawMessage, []contracts.ContentReference, string, bool, error) {
	if event.Cause == "startup" && !supportsAutomaticStartup(binding) {
		return contracts.InvocationIdentity{}, nil, nil, "", false, nil
	}
	arguments, references, err := resolveArguments(projectSnapshot, event.Payload, binding.Arguments)
	if err != nil {
		return contracts.InvocationIdentity{}, nil, nil, "", false, err
	}
	fingerprint, err := computeFingerprint(coordinator.sourceVersion, binding.Handler, arguments)
	if err != nil {
		return contracts.InvocationIdentity{}, nil, references, "", false, err
	}
	if event.Cause == "startup" && !coordinator.startupBindingEligibleLocked(binding, fingerprint) {
		return contracts.InvocationIdentity{}, nil, references, fingerprint, false, nil
	}
	coordinator.sequences[binding.ID]++
	identity, err := coordinator.identityLocked(binding.ID, coordinator.sequences[binding.ID])
	if err != nil {
		return contracts.InvocationIdentity{}, nil, references, "", false, err
	}
	return identity, arguments, references, fingerprint, true, nil
}

func (coordinator *Coordinator) submitBindingLocked(binding contracts.Binding, identity contracts.InvocationIdentity, arguments map[string]json.RawMessage, references []contracts.ContentReference, fingerprint string, cause string) error {
	status := contracts.InvocationStatus{Identity: identity, State: "queued"}
	coordinator.invocations[identity.InvocationID] = status
	coordinator.invocationBindings[identity.InvocationID] = binding
	coordinator.invocationOutputs[identity.InvocationID] = make(map[string]json.RawMessage)
	coordinator.invocationHashes[identity.InvocationID] = fingerprint
	coordinator.invocationHolds[identity.InvocationID] = cause == "startup" && coordinator.retainedByBinding[binding.ID]
	task := scheduler.Task{InvocationID: identity.InvocationID, BindingID: binding.ID, Run: func(ctx context.Context) {
		coordinator.runInvocation(ctx, binding, identity, arguments, references)
	}, Drop: func() {
		_ = coordinator.content.DeleteReferences(references)
	}}
	submission, err := coordinator.scheduler.Submit(task)
	if err != nil {
		coordinator.rollbackBindingLocked(identity.InvocationID)
		return err
	}
	for _, replacedInvocationID := range submission.ReplacedInvocationIDs {
		coordinator.supersedeReplacedLocked(replacedInvocationID)
	}
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
	coordinator.pruneInvocationsLocked(binding.ID)
	return nil
}

func (coordinator *Coordinator) supersedeReplacedLocked(invocationID string) {
	status, exists := coordinator.invocations[invocationID]
	if !exists || status.State != "queued" {
		return
	}
	status.State = "superseded"
	coordinator.invocations[invocationID] = status
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
}

func (coordinator *Coordinator) rollbackBindingLocked(invocationID string) {
	delete(coordinator.invocations, invocationID)
	delete(coordinator.invocationBindings, invocationID)
	delete(coordinator.invocationOutputs, invocationID)
	delete(coordinator.invocationHashes, invocationID)
	delete(coordinator.invocationHolds, invocationID)
}

func (coordinator *Coordinator) runInvocation(ctx context.Context, binding contracts.Binding, identity contracts.InvocationIdentity, arguments map[string]json.RawMessage, references []contracts.ContentReference) {
	defer coordinator.content.DeleteReferences(references)
	coordinator.mu.Lock()
	status, exists := coordinator.invocations[identity.InvocationID]
	if !exists || coordinator.closed {
		coordinator.mu.Unlock()
		return
	}
	coordinator.active[identity.InvocationID] = struct{}{}
	status.State = "running"
	status.Error = nil
	coordinator.invocations[identity.InvocationID] = status
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
	coordinator.mu.Unlock()
	result, err := coordinator.worker.Invoke(ctx, contracts.InvokeParams{Identity: identity, Handler: binding.Handler, Arguments: arguments, Content: references})
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	delete(coordinator.active, identity.InvocationID)
	status, exists = coordinator.invocations[identity.InvocationID]
	if !exists || coordinator.closed {
		return
	}
	if status.State == "cancelled" {
		coordinator.pruneInvocationsLocked(binding.ID)
		return
	}
	status, snapshotChanged := coordinator.finishInvocationLocked(binding, identity, status, result, err)
	coordinator.invocations[identity.InvocationID] = status
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
	if snapshotChanged {
		coordinator.publishSnapshotLocked()
	}
	coordinator.pruneInvocationsLocked(binding.ID)
}

func (coordinator *Coordinator) finishInvocationLocked(binding contracts.Binding, identity contracts.InvocationIdentity, status contracts.InvocationStatus, result contracts.InvokeResult, err error) (contracts.InvocationStatus, bool) {
	if err != nil {
		status.State, status.Error = invocationFailure(err)
		return status, false
	}
	if result.Error != nil {
		status.State = resultErrorState(result.Error)
		status.Error = result.Error
		return status, false
	}
	status.State = "completed"
	return status, coordinator.completeSuccessfulInvocationLocked(binding, identity, result.Outputs)
}

func (coordinator *Coordinator) completeSuccessfulInvocationLocked(binding contracts.Binding, identity contracts.InvocationIdentity, finalOutputs map[string]json.RawMessage) bool {
	outputs := cloneRawMap(finalOutputs)
	published := false
	if coordinator.invocationHolds[identity.InvocationID] {
		if len(outputs) > 0 && coordinator.outputApplicableLocked(identity) {
			coordinator.mergeInvocationOutputsLocked(identity.InvocationID, outputs)
		}
		outputs = cloneRawMap(coordinator.invocationOutputs[identity.InvocationID])
		published = coordinator.applyPublishedOutputsLocked(binding, identity, outputs)
	} else {
		published = coordinator.applyPublishedOutputsLocked(binding, identity, outputs)
		if published {
			coordinator.mergeInvocationOutputsLocked(identity.InvocationID, outputs)
		}
	}
	if published {
		update := contracts.BrowserRuntimeUpdate{Identity: identity, Outputs: cloneRawMap(outputs)}
		coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "update", Update: &update})
	}
	if coordinator.publishedByBinding[binding.ID] != identity || len(coordinator.invocationOutputs[identity.InvocationID]) == 0 {
		return false
	}
	coordinator.persistInvocationLocked(binding, identity)
	if !coordinator.retainedByBinding[binding.ID] {
		return false
	}
	delete(coordinator.retainedByBinding, binding.ID)
	return true
}

func invocationFailure(err error) (string, *contracts.StructuredError) {
	failure := &contracts.StructuredError{Code: "worker_failure", Message: err.Error()}
	if errors.Is(err, context.Canceled) {
		failure.Code = "cancelled"
		return "cancelled", failure
	}
	if errors.Is(err, context.DeadlineExceeded) {
		failure.Code = "timed_out"
		return "timedOut", failure
	}
	return "crashed", failure
}

func resultErrorState(failure *contracts.StructuredError) string {
	if failure.Code == "cancelled" {
		return "cancelled"
	}
	return "failed"
}

func (coordinator *Coordinator) consumeUpdates() {
	defer close(coordinator.updatesDone)
	for update := range coordinator.worker.Updates() {
		coordinator.acceptUpdate(update)
	}
}

func (coordinator *Coordinator) acceptUpdate(update contracts.RuntimeUpdate) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if coordinator.closed || update.Identity.SessionID != coordinator.sessionID {
		return
	}
	run := coordinator.runs[update.Identity.RunID]
	node := pipelineRunNode(run, update.Identity.BindingID, update.Identity)
	if node == nil || update.UpdateSequence == 0 || update.UpdateSequence != node.updateSequence+1 {
		coordinator.discardArtifactsLocked(update)
		return
	}
	binding, exists := coordinator.invocationBindings[update.Identity.InvocationID]
	if !exists {
		coordinator.discardArtifactsLocked(update)
		return
	}
	status, accepted := coordinator.updateStatusLocked(update.Identity)
	if !accepted {
		coordinator.discardArtifactsLocked(update)
		return
	}
	if status.State == "running" {
		status.State = "streaming"
		coordinator.invocations[update.Identity.InvocationID] = status
		coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
	}
	outputs := cloneRawMap(update.Outputs)
	coordinator.adoptArtifactsLocked(update, outputs)
	if len(outputs) > 0 {
		coordinator.mergeInvocationOutputsLocked(update.Identity.InvocationID, outputs)
		coordinator.retainOutputReferencesLocked(run, outputs)
	}
	published := false
	if !coordinator.invocationHolds[update.Identity.InvocationID] {
		published = coordinator.applyPublishedOutputsLocked(binding, update.Identity, outputs)
	}
	node.updateSequence = update.UpdateSequence
	coordinator.signalNodeLocked(node)
	browserOutputs := map[string]json.RawMessage{}
	if published {
		browserOutputs = cloneRawMap(outputs)
	}
	browserUpdate := contracts.BrowserRuntimeUpdate{
		Identity: update.Identity, UpdateSequence: update.UpdateSequence, Progress: update.Progress, Message: update.Message, Outputs: browserOutputs,
	}
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "update", Update: &browserUpdate})
}

func (coordinator *Coordinator) updateStatusLocked(identity contracts.InvocationIdentity) (contracts.InvocationStatus, bool) {
	status, exists := coordinator.invocations[identity.InvocationID]
	if !exists || status.Identity != identity {
		return contracts.InvocationStatus{}, false
	}
	if !updateAcceptingState(status.State) {
		return contracts.InvocationStatus{}, false
	}
	return status, true
}

func (coordinator *Coordinator) adoptArtifactsLocked(update contracts.RuntimeUpdate, outputs map[string]json.RawMessage) {
	source, supported := coordinator.worker.(ArtifactSource)
	if !supported {
		return
	}
	for _, artifact := range update.Artifacts {
		reader, err := source.OpenArtifact(update.Identity, artifact.Path)
		if err != nil {
			continue
		}
		reference, err := coordinator.content.Put(update.Identity.InvocationID, artifact.MediaType, reader)
		_ = reader.Close()
		if err != nil {
			continue
		}
		encoded, err := json.Marshal(reference)
		if err == nil {
			outputs[artifact.Name] = encoded
		}
	}
}

func (coordinator *Coordinator) discardArtifactsLocked(update contracts.RuntimeUpdate) {
	source, supported := coordinator.worker.(ArtifactSource)
	if !supported {
		return
	}
	for _, artifact := range update.Artifacts {
		reader, err := source.OpenArtifact(update.Identity, artifact.Path)
		if err == nil {
			_ = reader.Close()
		}
	}
}

func updateAcceptingState(state string) bool {
	return state == "running" || state == "streaming" || state == "completed"
}

func (coordinator *Coordinator) outputApplicableLocked(identity contracts.InvocationIdentity) bool {
	published, exists := coordinator.publishedByBinding[identity.BindingID]
	if !exists {
		return true
	}
	if identity.Sequence != published.Sequence {
		return identity.Sequence > published.Sequence
	}
	return identity == published
}

func (coordinator *Coordinator) applyPublishedOutputsLocked(binding contracts.Binding, identity contracts.InvocationIdentity, outputs map[string]json.RawMessage) bool {
	if len(outputs) == 0 || !coordinator.outputApplicableLocked(identity) {
		return false
	}
	coordinator.applyOutputsLocked(binding, outputs)
	coordinator.publishedByBinding[binding.ID] = identity
	return true
}

func (coordinator *Coordinator) consumeLogs() {
	defer close(coordinator.logsDone)
	source := coordinator.worker.(LogSource)
	for log := range source.Logs() {
		coordinator.mu.Lock()
		if !coordinator.closed {
			value := log
			coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "log", Log: &value})
		}
		coordinator.mu.Unlock()
	}
}

func (coordinator *Coordinator) applyOutputsLocked(binding contracts.Binding, outputs map[string]json.RawMessage) {
	displaced := []contracts.ContentReference{}
	for name, value := range outputs {
		output, exists := binding.Outputs[name]
		if !exists || output.Target == nil {
			continue
		}
		key := output.Target.SectionID + "." + output.Target.Field
		if previous, exists := coordinator.values[key]; exists {
			references, err := contentReferencesInRawMap(map[string]json.RawMessage{key: previous})
			if err == nil {
				displaced = appendUniqueReferences(displaced, references)
			}
		}
		coordinator.values[key] = append(json.RawMessage(nil), value...)
	}
	protected := coordinator.protectedReferencesLocked()
	cleanup := []contracts.ContentReference{}
	for _, reference := range displaced {
		if !protected[reference.ID] {
			cleanup = append(cleanup, reference)
		}
	}
	_ = coordinator.content.DeleteReferences(cleanup)
}

func (coordinator *Coordinator) Snapshot() (contracts.RuntimeSnapshot, error) {
	if coordinator == nil {
		return contracts.RuntimeSnapshot{}, ErrClosed
	}
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if coordinator.closed {
		return contracts.RuntimeSnapshot{}, ErrClosed
	}
	return coordinator.snapshotLocked(), nil
}

func (coordinator *Coordinator) Subscribe(ctx context.Context) (<-chan contracts.RuntimeEnvelope, error) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if coordinator.closed {
		return nil, ErrClosed
	}
	channel := make(chan contracts.RuntimeEnvelope, 64)
	snapshot := coordinator.snapshotLocked()
	channel <- contracts.RuntimeEnvelope{Type: "snapshot", Snapshot: &snapshot}
	coordinator.subscribers[channel] = struct{}{}
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

func (coordinator *Coordinator) Close() error {
	if coordinator == nil {
		return nil
	}
	coordinator.mutations.Lock()
	defer coordinator.mutations.Unlock()
	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		return nil
	}
	coordinator.closed = true
	scheduled := coordinator.scheduler
	for channel := range coordinator.subscribers {
		close(channel)
	}
	coordinator.subscribers = nil
	coordinator.mu.Unlock()
	scheduled.Close()
	workerErr := coordinator.worker.Close()
	<-coordinator.updatesDone
	<-coordinator.logsDone
	return workerErr
}

func (coordinator *Coordinator) identityLocked(bindingID string, sequence uint64) (contracts.InvocationIdentity, error) {
	invocationID, err := randomID("invocation")
	if err != nil {
		return contracts.InvocationIdentity{}, err
	}
	return contracts.InvocationIdentity{SessionID: coordinator.sessionID, BindingID: bindingID, InvocationID: invocationID, Sequence: sequence}, nil
}

func (coordinator *Coordinator) snapshotLocked() contracts.RuntimeSnapshot {
	values := cloneRawMap(coordinator.values)
	invocations := make(map[string]contracts.InvocationStatus, len(coordinator.invocations))
	for id, status := range coordinator.invocations {
		invocations[id] = status
	}
	publishedByBinding := make(map[string]contracts.InvocationIdentity, len(coordinator.publishedByBinding))
	for bindingID, identity := range coordinator.publishedByBinding {
		publishedByBinding[bindingID] = identity
	}
	retainedByBinding := make(map[string]bool, len(coordinator.retainedByBinding))
	for bindingID, retained := range coordinator.retainedByBinding {
		retainedByBinding[bindingID] = retained
	}
	return contracts.RuntimeSnapshot{
		SessionID: coordinator.sessionID, WorkerState: coordinator.workerState, Handlers: append([]string(nil), coordinator.handlers...), Values: values,
		Invocations: invocations, PublishedByBinding: publishedByBinding, RetainedByBinding: retainedByBinding,
	}
}

func (coordinator *Coordinator) pruneInvocationsLocked(bindingID string) {
	type candidate struct {
		id       string
		sequence uint64
	}
	candidates := make([]candidate, 0)
	for invocationID, status := range coordinator.invocations {
		if status.Identity.BindingID != bindingID || status.State == "queued" || status.State == "running" || status.State == "streaming" {
			continue
		}
		if _, active := coordinator.active[invocationID]; active {
			continue
		}
		candidates = append(candidates, candidate{id: invocationID, sequence: status.Identity.Sequence})
	}
	keep := 4
	if binding, exists := coordinator.bindings[bindingID]; exists {
		keep += binding.Scheduling.ConcurrencyLimit
	}
	if len(candidates) <= keep {
		return
	}
	sort.Slice(candidates, func(left int, right int) bool { return candidates[left].sequence > candidates[right].sequence })
	for _, expired := range candidates[keep:] {
		delete(coordinator.invocations, expired.id)
		delete(coordinator.invocationBindings, expired.id)
		delete(coordinator.invocationOutputs, expired.id)
		delete(coordinator.invocationHashes, expired.id)
		delete(coordinator.invocationHolds, expired.id)
	}
}

func (coordinator *Coordinator) publishSnapshotLocked() {
	snapshot := coordinator.snapshotLocked()
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "snapshot", Snapshot: &snapshot})
}

func (coordinator *Coordinator) publishLocked(envelope contracts.RuntimeEnvelope) {
	for channel := range coordinator.subscribers {
		cloned := cloneEnvelope(envelope)
		select {
		case channel <- cloned:
		default:
			for len(channel) > 0 {
				<-channel
			}
			snapshot := coordinator.snapshotLocked()
			channel <- contracts.RuntimeEnvelope{Type: "snapshot", Snapshot: &snapshot}
		}
	}
}

func (coordinator *Coordinator) prepareArguments(arguments map[string]json.RawMessage, references []contracts.ContentReference, invocationID string) (map[string]json.RawMessage, []contracts.ContentReference, error) {
	complete := false
	defer func() {
		if !complete {
			_ = coordinator.content.DeleteInvocation(invocationID)
		}
	}()
	prepared := make(map[string]json.RawMessage, len(arguments))
	preparedReferences := make([]contracts.ContentReference, 0, len(references))
	byOldID := make(map[string]contracts.ContentReference)
	for _, reference := range references {
		cloned, err := coordinator.content.CloneForInvocation(reference, invocationID)
		if err != nil {
			return nil, nil, err
		}
		preparedReferences = append(preparedReferences, cloned)
		byOldID[reference.ID] = cloned
	}
	for name, raw := range arguments {
		var value any
		if err := json.Unmarshal(raw, &value); err != nil {
			return nil, nil, err
		}
		updated, discovered, err := coordinator.rescopeValue(value, invocationID, byOldID)
		if err != nil {
			return nil, nil, err
		}
		preparedReferences = appendUniqueReferences(preparedReferences, discovered)
		encoded, err := json.Marshal(updated)
		if err != nil {
			return nil, nil, err
		}
		prepared[name] = encoded
	}
	complete = true
	return prepared, preparedReferences, nil
}

func (coordinator *Coordinator) rescopeValue(value any, invocationID string, known map[string]contracts.ContentReference) (any, []contracts.ContentReference, error) {
	switch typed := value.(type) {
	case []any:
		return coordinator.rescopeList(typed, invocationID, known)
	case map[string]any:
		return coordinator.rescopeMap(typed, invocationID, known)
	default:
		return value, nil, nil
	}
}

func (coordinator *Coordinator) rescopeList(values []any, invocationID string, known map[string]contracts.ContentReference) ([]any, []contracts.ContentReference, error) {
	references := []contracts.ContentReference{}
	for index, item := range values {
		updated, discovered, err := coordinator.rescopeValue(item, invocationID, known)
		if err != nil {
			return nil, nil, err
		}
		values[index] = updated
		references = appendUniqueReferences(references, discovered)
	}
	return values, references, nil
}

func (coordinator *Coordinator) rescopeMap(value map[string]any, invocationID string, known map[string]contracts.ContentReference) (any, []contracts.ContentReference, error) {
	if looksLikeContentReference(value) {
		return coordinator.rescopeContentReference(value, invocationID, known)
	}
	references := []contracts.ContentReference{}
	for key, item := range value {
		updated, discovered, err := coordinator.rescopeValue(item, invocationID, known)
		if err != nil {
			return nil, nil, err
		}
		value[key] = updated
		references = appendUniqueReferences(references, discovered)
	}
	return value, references, nil
}

func (coordinator *Coordinator) rescopeContentReference(value map[string]any, invocationID string, known map[string]contracts.ContentReference) (any, []contracts.ContentReference, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, nil, err
	}
	var reference contracts.ContentReference
	if err := contracts.DecodeStrict(encoded, &reference); err != nil {
		return nil, nil, err
	}
	cloned, exists := known[reference.ID]
	if !exists {
		cloned, err = coordinator.content.CloneForInvocation(reference, invocationID)
		if err != nil {
			return nil, nil, err
		}
		known[reference.ID] = cloned
	}
	var updated any
	encoded, _ = json.Marshal(cloned)
	_ = json.Unmarshal(encoded, &updated)
	return updated, []contracts.ContentReference{cloned}, nil
}

func resolveArguments(project contracts.Project, eventPayload json.RawMessage, arguments map[string]json.RawMessage) (map[string]json.RawMessage, []contracts.ContentReference, error) {
	var eventValue any
	if err := json.Unmarshal(eventPayload, &eventValue); err != nil {
		return nil, nil, err
	}
	resolved := make(map[string]json.RawMessage, len(arguments))
	references := []contracts.ContentReference{}
	for name, argument := range arguments {
		encoded, discovered, err := resolveArgument(project, eventValue, argument)
		if err != nil {
			return nil, nil, err
		}
		resolved[name] = encoded
		references = appendUniqueReferences(references, discovered)
	}
	return resolved, references, nil
}

func resolveArgument(project contracts.Project, eventValue any, argument json.RawMessage) (json.RawMessage, []contracts.ContentReference, error) {
	var reference string
	if err := json.Unmarshal(argument, &reference); err != nil || !strings.HasPrefix(reference, "$") {
		return append(json.RawMessage(nil), argument...), nil, nil
	}
	value, err := resolveReference(project, eventValue, reference)
	if err != nil {
		return nil, nil, err
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, nil, err
	}
	if !strings.HasPrefix(reference, "$event.") {
		return encoded, nil, nil
	}
	references, err := contentReferencesInValue(value)
	return encoded, references, err
}

func contentReferencesInValue(value any) ([]contracts.ContentReference, error) {
	switch typed := value.(type) {
	case []any:
		result := []contracts.ContentReference{}
		for _, item := range typed {
			references, err := contentReferencesInValue(item)
			if err != nil {
				return nil, err
			}
			result = appendUniqueReferences(result, references)
		}
		return result, nil
	case map[string]any:
		if looksLikeContentReference(typed) {
			encoded, err := json.Marshal(typed)
			if err != nil {
				return nil, err
			}
			var reference contracts.ContentReference
			if err := contracts.DecodeStrict(encoded, &reference); err != nil {
				return nil, err
			}
			if err := reference.Validate(); err != nil {
				return nil, err
			}
			return []contracts.ContentReference{reference}, nil
		}
		result := []contracts.ContentReference{}
		for _, item := range typed {
			references, err := contentReferencesInValue(item)
			if err != nil {
				return nil, err
			}
			result = appendUniqueReferences(result, references)
		}
		return result, nil
	default:
		return nil, nil
	}
}

func resolveReference(project contracts.Project, eventValue any, reference string) (any, error) {
	if strings.HasPrefix(reference, "$event.") {
		return traverse(eventValue, strings.Split(strings.TrimPrefix(reference, "$event."), "."))
	}
	if !strings.HasPrefix(reference, "$sections.") {
		return nil, fmt.Errorf("runtime: unsupported reference %q", reference)
	}
	parts := strings.Split(strings.TrimPrefix(reference, "$sections."), ".")
	if len(parts) < 2 {
		return nil, fmt.Errorf("runtime: invalid section reference %q", reference)
	}
	section, exists := project.Sections[parts[0]]
	if !exists {
		return nil, fmt.Errorf("runtime: missing section reference %q", reference)
	}
	var sectionData any
	if err := json.Unmarshal(section.Data, &sectionData); err != nil {
		return nil, err
	}
	return traverse(sectionData, parts[1:])
}

func traverse(value any, path []string) (any, error) {
	current := value
	for _, part := range path {
		object, ok := current.(map[string]any)
		if !ok {
			return nil, errors.New("runtime: reference crosses a non-object value")
		}
		next, exists := object[part]
		if !exists {
			return nil, fmt.Errorf("runtime: reference field %q is missing", part)
		}
		current = next
	}
	return current, nil
}

func configuredScheduler(project contracts.Project) (*scheduler.Scheduler, map[string]contracts.Binding, error) {
	configurations := make(map[string]scheduler.Config, len(project.Bindings))
	bindings := make(map[string]contracts.Binding, len(project.Bindings))
	for _, binding := range project.Bindings {
		configurations[binding.ID] = scheduler.Config{
			Mode: binding.Scheduling.Mode, DebounceMilliseconds: binding.Scheduling.DebounceMilliseconds,
			ConcurrencyGroup: binding.Scheduling.ConcurrencyGroup, ConcurrencyLimit: binding.Scheduling.ConcurrencyLimit,
		}
		bindings[binding.ID] = binding
	}
	configured, err := scheduler.New(configurations)
	return configured, bindings, err
}

func looksLikeContentReference(value map[string]any) bool {
	if len(value) != 5 {
		return false
	}
	for _, key := range []string{"id", "mediaType", "byteLength", "sha256", "invocationId"} {
		if _, exists := value[key]; !exists {
			return false
		}
	}
	return true
}

func appendUniqueReferences(target []contracts.ContentReference, candidates []contracts.ContentReference) []contracts.ContentReference {
	seen := make(map[string]struct{}, len(target)+len(candidates))
	for _, reference := range target {
		seen[reference.ID] = struct{}{}
	}
	for _, reference := range candidates {
		if _, exists := seen[reference.ID]; exists {
			continue
		}
		seen[reference.ID] = struct{}{}
		target = append(target, reference)
	}
	return target
}

func cloneRawMap(values map[string]json.RawMessage) map[string]json.RawMessage {
	cloned := make(map[string]json.RawMessage, len(values))
	for key, value := range values {
		cloned[key] = append(json.RawMessage(nil), value...)
	}
	return cloned
}

func cloneEnvelope(envelope contracts.RuntimeEnvelope) contracts.RuntimeEnvelope {
	encoded, err := json.Marshal(envelope)
	if err != nil {
		return envelope
	}
	var cloned contracts.RuntimeEnvelope
	if err := json.Unmarshal(encoded, &cloned); err != nil {
		return envelope
	}
	return cloned
}

func randomID(prefix string) (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", fmt.Errorf("runtime: generate identity: %w", err)
	}
	return prefix + "-" + hex.EncodeToString(value), nil
}
