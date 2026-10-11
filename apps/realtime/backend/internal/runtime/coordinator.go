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

	"github.com/riteofstring/setta/apps/realtime/backend/internal/content"
	"github.com/riteofstring/setta/apps/realtime/backend/internal/contracts"
	"github.com/riteofstring/setta/apps/realtime/backend/internal/materialization"
	"github.com/riteofstring/setta/apps/realtime/backend/internal/project"
	"github.com/riteofstring/setta/apps/realtime/backend/internal/scheduler"
	"github.com/riteofstring/setta/apps/realtime/backend/internal/source"
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
	pipeline           contracts.CompiledPipeline
	sessionID          string
	workerState        string
	handlers           []string
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
	runs               map[string]*pipelineRun
	invocationRuns     map[string]string
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
	configured, bindings, pipeline, err := configuredScheduler(snapshot)
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
		_ = sources.Close()
		return nil, err
	}
	coordinator := &Coordinator{
		projectRoot: projectRoot, projects: projects, content: contentStore, materializations: materializations, sources: sources, worker: worker, scheduler: configured, pipeline: pipeline,
		sessionID: sessionID, workerState: "stopped", handlers: []string{}, values: make(map[string]json.RawMessage),
		invocations: make(map[string]contracts.InvocationStatus), bindings: bindings,
		invocationBindings: make(map[string]contracts.Binding), sequences: make(map[string]uint64), active: make(map[string]struct{}),
		publishedByBinding: make(map[string]contracts.InvocationIdentity), retainedByBinding: make(map[string]bool),
		materializedOutput: make(map[string]map[string]json.RawMessage), materializedRefs: make(map[string][]contracts.ContentReference),
		materializedHashes: make(map[string]string), startupAttempts: make(map[string]string), invocationOutputs: make(map[string]map[string]json.RawMessage),
		invocationHashes: make(map[string]string), invocationHolds: make(map[string]bool),
		runs: make(map[string]*pipelineRun), invocationRuns: make(map[string]string),
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
	replacement, bindings, pipeline, err := configuredScheduler(candidate)
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
	previousBindings := coordinator.bindings
	if !reuseScheduler {
		coordinator.invalidateAllRunsLocked(previous, "project_changed", "The project pipeline changed.")
		coordinator.scheduler = replacement
	}
	coordinator.bindings = bindings
	coordinator.pipeline = pipeline
	discarded := coordinator.reconcileBindingStateLocked(previousBindings, bindings)
	discarded = appendUniqueReferences(discarded, coordinator.dropUnretainedMaterializationsLocked(bindings))
	discarded = coordinator.unprotectedReferencesLocked(discarded)
	coordinator.publishSnapshotLocked()
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
	replacement, bindings, pipeline, err := configuredScheduler(projectSnapshot)
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
	coordinator.handlers = []string{}
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
		coordinator.handlers = []string{}
	} else {
		coordinator.workerState = "ready"
		coordinator.handlers = append([]string(nil), result.Handlers...)
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
	protected := coordinator.protectedReferencesLocked()
	cleanup := []contracts.ContentReference{}
	for _, reference := range discarded {
		if !protected[reference.ID] {
			cleanup = append(cleanup, reference)
		}
	}
	coordinator.sequences = make(map[string]uint64)
	coordinator.publishedByBinding = make(map[string]contracts.InvocationIdentity)
	coordinator.active = make(map[string]struct{})
	coordinator.publishSnapshotLocked()
	coordinator.mu.Unlock()
	stopErr := coordinator.worker.Stop()
	previous.Close()
	_ = coordinator.content.DeleteReferences(cleanup)
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
	runID, err := randomID("run")
	if err != nil {
		coordinator.mu.Unlock()
		return contracts.InvokeResult{}, err
	}
	identity, err := coordinator.identityLocked(runID, "direct", coordinator.sequences["direct"])
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
	coordinator.mutations.Lock()
	defer coordinator.mutations.Unlock()
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
	eventKey := contracts.PipelineEvent{SectionID: event.SectionID, Event: event.Event}
	if len(coordinator.pipeline.EventBindings[eventKey]) == 0 {
		coordinator.mu.Unlock()
		return 0, ErrNoBinding
	}
	accepted, consumed, err := coordinator.startPipelineRunLocked(projectSnapshot, event, eventKey)
	coordinator.mu.Unlock()
	_ = coordinator.content.DeleteReferences(consumed)
	return accepted, err
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
	if invocationTerminal(status.State) {
		return ErrInvocationUnknown
	}
	run := coordinator.runs[request.Identity.RunID]
	if run == nil || run.nodes[request.Identity.BindingID] == nil {
		return ErrInvocationUnknown
	}
	coordinator.invalidateNodeLocked(run, request.Identity.BindingID, "cancelled", "cancelled", "Invocation was cancelled.")
	coordinator.invalidateDescendantsLocked(run, request.Identity.BindingID, "upstream_cancelled", "An upstream invocation was cancelled.")
	coordinator.finishRunIfTerminalLocked(run)
	return nil
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
	target, accepted := coordinator.pipelineUpdateTargetLocked(update)
	if !accepted {
		coordinator.discardArtifactsLocked(update)
		return
	}
	coordinator.applyPipelineUpdateLocked(target, update)
}

type pipelineUpdateTarget struct {
	run     *pipelineRun
	node    *pipelineNode
	binding contracts.Binding
	status  contracts.InvocationStatus
}

func (coordinator *Coordinator) pipelineUpdateTargetLocked(update contracts.RuntimeUpdate) (pipelineUpdateTarget, bool) {
	run := coordinator.runs[update.Identity.RunID]
	node := pipelineRunNode(run, update.Identity.BindingID, update.Identity)
	if node == nil {
		return pipelineUpdateTarget{}, false
	}
	if update.UpdateSequence == 0 || update.UpdateSequence != node.updateSequence+1 {
		coordinator.rejectPipelineUpdateLocked(run, update.Identity.BindingID)
		return pipelineUpdateTarget{}, false
	}
	binding, exists := coordinator.invocationBindings[update.Identity.InvocationID]
	if !exists {
		return pipelineUpdateTarget{}, false
	}
	status, accepted := coordinator.updateStatusLocked(update.Identity)
	return pipelineUpdateTarget{run: run, node: node, binding: binding, status: status}, accepted
}

func (coordinator *Coordinator) rejectPipelineUpdateLocked(run *pipelineRun, bindingID string) {
	coordinator.invalidateNodeLocked(run, bindingID, "failed", "worker_protocol", "Worker update sequence was not contiguous.")
	coordinator.invalidateDescendantsLocked(run, bindingID, "upstream_failed", "An upstream invocation failed.")
	coordinator.finishRunIfTerminalLocked(run)
}

func (coordinator *Coordinator) applyPipelineUpdateLocked(target pipelineUpdateTarget, update contracts.RuntimeUpdate) {
	if target.status.State == "running" {
		target.status.State = "streaming"
		coordinator.invocations[update.Identity.InvocationID] = target.status
		coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &target.status})
	}
	outputs := cloneRawMap(update.Outputs)
	coordinator.adoptArtifactsLocked(update, outputs)
	if len(outputs) > 0 {
		coordinator.mergeInvocationOutputsLocked(update.Identity.InvocationID, outputs)
		coordinator.retainOutputReferencesLocked(target.run, outputs)
	}
	published := coordinator.publishStreamOutputsLocked(target.binding, update.Identity, outputs)
	target.node.updateSequence = update.UpdateSequence
	coordinator.signalNodeLocked(target.node)
	browserOutputs := map[string]json.RawMessage{}
	if published {
		browserOutputs = cloneRawMap(outputs)
	}
	browserUpdate := contracts.BrowserRuntimeUpdate{
		Identity: update.Identity, UpdateSequence: update.UpdateSequence, Progress: update.Progress, Message: update.Message, Outputs: browserOutputs,
	}
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "update", Update: &browserUpdate})
}

func (coordinator *Coordinator) publishStreamOutputsLocked(binding contracts.Binding, identity contracts.InvocationIdentity, outputs map[string]json.RawMessage) bool {
	if coordinator.invocationHolds[identity.InvocationID] {
		return false
	}
	return coordinator.applyPublishedOutputsLocked(binding, identity, outputs)
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
	return state == "running" || state == "streaming"
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

func (coordinator *Coordinator) reconcileBindingStateLocked(previous map[string]contracts.Binding, current map[string]contracts.Binding) []contracts.ContentReference {
	changedIDs := changedBindingIDs(previous, current)
	changed := make(map[string]bool, len(changedIDs))
	ownership := coordinator.bindingTargetOwnershipLocked(previous)
	targets := make(map[string]bool)
	for _, bindingID := range changedIDs {
		changed[bindingID] = true
		delete(coordinator.publishedByBinding, bindingID)
		for _, target := range bindingOutputTargets(previous[bindingID]) {
			targets[target] = true
		}
	}
	targetNames := make([]string, 0, len(targets))
	for target := range targets {
		targetNames = append(targetNames, target)
	}
	sort.Strings(targetNames)
	discarded := []contracts.ContentReference{}
	for _, target := range targetNames {
		if targetHasStableOwner(ownership[target], changed) {
			continue
		}
		discarded = appendUniqueReferences(discarded, coordinator.removeRuntimeValueLocked(target))
	}
	return discarded
}

func changedBindingIDs(previous map[string]contracts.Binding, current map[string]contracts.Binding) []string {
	changed := []string{}
	for bindingID, previousBinding := range previous {
		currentBinding, exists := current[bindingID]
		if !exists || !reflect.DeepEqual(previousBinding, currentBinding) {
			changed = append(changed, bindingID)
		}
	}
	sort.Strings(changed)
	return changed
}

func (coordinator *Coordinator) bindingTargetOwnershipLocked(bindings map[string]contracts.Binding) map[string]map[string]bool {
	ownership := make(map[string]map[string]bool)
	for bindingID, binding := range bindings {
		_, published := coordinator.publishedByBinding[bindingID]
		if !published && !coordinator.retainedByBinding[bindingID] {
			continue
		}
		for _, target := range bindingOutputTargets(binding) {
			owners := ownership[target]
			if owners == nil {
				owners = make(map[string]bool)
				ownership[target] = owners
			}
			owners[bindingID] = true
		}
	}
	return ownership
}

func targetHasStableOwner(owners map[string]bool, changed map[string]bool) bool {
	for bindingID := range owners {
		if !changed[bindingID] {
			return true
		}
	}
	return false
}

func bindingOutputTargets(binding contracts.Binding) map[string]string {
	targets := make(map[string]string)
	for outputName, output := range binding.Outputs {
		if output.Target != nil {
			targets[outputName] = output.Target.SectionID + "." + output.Target.Field
		}
	}
	return targets
}

func (coordinator *Coordinator) removeRuntimeValueLocked(target string) []contracts.ContentReference {
	value, exists := coordinator.values[target]
	if !exists {
		return nil
	}
	delete(coordinator.values, target)
	references, err := contentReferencesInRawMap(map[string]json.RawMessage{target: value})
	if err != nil {
		return nil
	}
	return references
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
	scheduled := coordinator.scheduler
	coordinator.invalidateAllRunsLocked(scheduled, "runtime_closed", "The runtime was closed.")
	coordinator.closed = true
	for channel := range coordinator.subscribers {
		close(channel)
	}
	coordinator.subscribers = nil
	coordinator.mu.Unlock()
	scheduled.Close()
	workerErr := coordinator.worker.Close()
	<-coordinator.updatesDone
	<-coordinator.logsDone
	return errors.Join(workerErr, coordinator.sources.Close())
}

func (coordinator *Coordinator) identityLocked(runID string, bindingID string, sequence uint64) (contracts.InvocationIdentity, error) {
	invocationID, err := randomID("invocation")
	if err != nil {
		return contracts.InvocationIdentity{}, err
	}
	return contracts.InvocationIdentity{SessionID: coordinator.sessionID, RunID: runID, BindingID: bindingID, InvocationID: invocationID, Sequence: sequence}, nil
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
		SessionID: coordinator.sessionID, WorkerState: coordinator.workerState, Handlers: append([]string{}, coordinator.handlers...), Values: values,
		Invocations: invocations, PublishedByBinding: publishedByBinding, RetainedByBinding: retainedByBinding,
	}
}

type invocationCandidate struct {
	id       string
	sequence uint64
}

func (coordinator *Coordinator) pruneInvocationsLocked(bindingID string) {
	candidates := coordinator.prunableInvocationsLocked(bindingID)
	keep := coordinator.invocationHistoryLimitLocked(bindingID)
	if len(candidates) <= keep {
		return
	}
	sort.Slice(candidates, func(left int, right int) bool { return candidates[left].sequence > candidates[right].sequence })
	for _, expired := range candidates[keep:] {
		coordinator.deleteInvocationLocked(expired.id)
	}
}

func (coordinator *Coordinator) prunableInvocationsLocked(bindingID string) []invocationCandidate {
	candidates := make([]invocationCandidate, 0)
	for invocationID, status := range coordinator.invocations {
		if !coordinator.invocationPrunableLocked(bindingID, invocationID, status) {
			continue
		}
		candidates = append(candidates, invocationCandidate{id: invocationID, sequence: status.Identity.Sequence})
	}
	return candidates
}

func (coordinator *Coordinator) invocationPrunableLocked(bindingID string, invocationID string, status contracts.InvocationStatus) bool {
	if status.Identity.BindingID != bindingID || !invocationTerminal(status.State) {
		return false
	}
	if _, inRun := coordinator.invocationRuns[invocationID]; inRun {
		return false
	}
	_, active := coordinator.active[invocationID]
	return !active
}

func (coordinator *Coordinator) invocationHistoryLimitLocked(bindingID string) int {
	keep := 4
	if binding, exists := coordinator.bindings[bindingID]; exists {
		keep += binding.Scheduling.ConcurrencyLimit
	}
	return keep
}

func (coordinator *Coordinator) deleteInvocationLocked(invocationID string) {
	delete(coordinator.invocations, invocationID)
	delete(coordinator.invocationBindings, invocationID)
	delete(coordinator.invocationOutputs, invocationID)
	delete(coordinator.invocationHashes, invocationID)
	delete(coordinator.invocationHolds, invocationID)
	delete(coordinator.invocationRuns, invocationID)
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

func configuredScheduler(project contracts.Project) (*scheduler.Scheduler, map[string]contracts.Binding, contracts.CompiledPipeline, error) {
	compiled, err := contracts.CompilePipeline(project)
	if err != nil {
		return nil, nil, contracts.CompiledPipeline{}, err
	}
	configurations := make(map[string]scheduler.Config, len(compiled.Bindings))
	bindings := make(map[string]contracts.Binding, len(compiled.Bindings))
	for _, binding := range compiled.Bindings {
		configurations[binding.ID] = scheduler.Config{
			Mode: binding.Scheduling.Mode, DebounceMilliseconds: binding.Scheduling.DebounceMilliseconds,
			ConcurrencyGroup: binding.Scheduling.ConcurrencyGroup, ConcurrencyLimit: binding.Scheduling.ConcurrencyLimit,
		}
		bindings[binding.ID] = binding
	}
	configured, err := scheduler.New(configurations)
	return configured, bindings, compiled, err
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
