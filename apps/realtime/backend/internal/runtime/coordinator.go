package runtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"

	"github.com/setta/realtime/backend/internal/content"
	"github.com/setta/realtime/backend/internal/contracts"
	"github.com/setta/realtime/backend/internal/project"
	"github.com/setta/realtime/backend/internal/scheduler"
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
	worker             Worker
	scheduler          *scheduler.Scheduler
	sessionID          string
	workerState        string
	values             map[string]json.RawMessage
	invocations        map[string]contracts.InvocationStatus
	bindings           map[string]contracts.Binding
	invocationBindings map[string]contracts.Binding
	sequences          map[string]uint64
	latest             map[string]uint64
	active             map[string]struct{}
	subscribers        map[chan contracts.RuntimeEnvelope]struct{}
	closed             bool
	updatesDone        chan struct{}
	logsDone           chan struct{}
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
	coordinator := &Coordinator{
		projectRoot: projectRoot, projects: projects, content: contentStore, worker: worker, scheduler: configured,
		sessionID: sessionID, workerState: "stopped", values: make(map[string]json.RawMessage),
		invocations: make(map[string]contracts.InvocationStatus), bindings: bindings,
		invocationBindings: make(map[string]contracts.Binding), sequences: make(map[string]uint64), active: make(map[string]struct{}),
		latest: make(map[string]uint64), subscribers: make(map[chan contracts.RuntimeEnvelope]struct{}), updatesDone: make(chan struct{}), logsDone: make(chan struct{}),
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
	previous := coordinator.scheduler
	coordinator.scheduler = replacement
	coordinator.bindings = bindings
	coordinator.mu.Unlock()
	previous.Close()
	return candidate, nil
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
	replacement, bindings, err := configuredScheduler(projectSnapshot)
	if err != nil {
		return contracts.InitializeResult{}, err
	}
	sessionID, err := randomID("session")
	if err != nil {
		replacement.Close()
		return contracts.InitializeResult{}, err
	}
	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		replacement.Close()
		return contracts.InitializeResult{}, ErrClosed
	}
	previous := coordinator.scheduler
	coordinator.scheduler = replacement
	coordinator.bindings = bindings
	coordinator.sessionID = sessionID
	coordinator.workerState = "starting"
	coordinator.values = make(map[string]json.RawMessage)
	coordinator.invocations = make(map[string]contracts.InvocationStatus)
	coordinator.invocationBindings = make(map[string]contracts.Binding)
	coordinator.sequences = make(map[string]uint64)
	coordinator.latest = make(map[string]uint64)
	coordinator.active = make(map[string]struct{})
	coordinator.publishSnapshotLocked()
	coordinator.mu.Unlock()
	previous.Close()
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
		owned, err := coordinator.scheduleBinding(projectSnapshot, event, binding)
		references = appendUniqueReferences(references, owned)
		if err != nil {
			if errors.Is(err, scheduler.ErrBusy) || errors.Is(err, scheduler.ErrQueueFull) {
				continue
			}
			_ = coordinator.content.DeleteReferences(references)
			return accepted, err
		}
		accepted++
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

func (coordinator *Coordinator) scheduleBinding(projectSnapshot contracts.Project, event contracts.RuntimeEvent, binding contracts.Binding) ([]contracts.ContentReference, error) {
	coordinator.mu.Lock()
	identity, arguments, rawReferences, err := coordinator.prepareBindingLocked(projectSnapshot, event, binding)
	coordinator.mu.Unlock()
	if err != nil {
		return nil, err
	}
	prepared, references, err := coordinator.prepareArguments(arguments, rawReferences, identity.InvocationID)
	if err != nil {
		return rawReferences, err
	}
	coordinator.mu.Lock()
	if coordinator.closed {
		coordinator.mu.Unlock()
		_ = coordinator.content.DeleteReferences(references)
		return rawReferences, ErrClosed
	}
	err = coordinator.submitBindingLocked(binding, identity, prepared, references)
	coordinator.mu.Unlock()
	if err != nil {
		_ = coordinator.content.DeleteReferences(references)
		return rawReferences, err
	}
	return rawReferences, nil
}

func (coordinator *Coordinator) prepareBindingLocked(projectSnapshot contracts.Project, event contracts.RuntimeEvent, binding contracts.Binding) (contracts.InvocationIdentity, map[string]json.RawMessage, []contracts.ContentReference, error) {
	coordinator.sequences[binding.ID]++
	sequence := coordinator.sequences[binding.ID]
	identity, err := coordinator.identityLocked(binding.ID, sequence)
	if err != nil {
		return contracts.InvocationIdentity{}, nil, nil, err
	}
	arguments, references, err := resolveArguments(projectSnapshot, event.Payload, binding.Arguments)
	return identity, arguments, references, err
}

func (coordinator *Coordinator) submitBindingLocked(binding contracts.Binding, identity contracts.InvocationIdentity, arguments map[string]json.RawMessage, references []contracts.ContentReference) error {
	previousLatest, hadLatest := coordinator.latest[binding.ID]
	coordinator.latest[binding.ID] = identity.Sequence
	changed := coordinator.supersedeOlderLocked(binding, identity.Sequence)
	status := contracts.InvocationStatus{Identity: identity, State: "queued"}
	coordinator.invocations[identity.InvocationID] = status
	coordinator.invocationBindings[identity.InvocationID] = binding
	task := scheduler.Task{InvocationID: identity.InvocationID, BindingID: binding.ID, Run: func(ctx context.Context) {
		coordinator.runInvocation(ctx, binding, identity, arguments, references)
	}, Drop: func() {
		_ = coordinator.content.DeleteReferences(references)
	}}
	err := coordinator.scheduler.Submit(task)
	if err != nil {
		coordinator.rollbackBindingLocked(binding.ID, identity.InvocationID, previousLatest, hadLatest, changed)
		return err
	}
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
	coordinator.pruneInvocationsLocked(binding.ID)
	return nil
}

func (coordinator *Coordinator) supersedeOlderLocked(binding contracts.Binding, sequence uint64) map[string]contracts.InvocationStatus {
	changed := make(map[string]contracts.InvocationStatus)
	if binding.Scheduling.Mode != "latest" {
		return changed
	}
	for invocationID, status := range coordinator.invocations {
		if status.Identity.BindingID == binding.ID && status.Identity.Sequence < sequence && !terminalState(status.State) {
			changed[invocationID] = status
			status.State = "superseded"
			coordinator.invocations[invocationID] = status
		}
	}
	return changed
}

func (coordinator *Coordinator) rollbackBindingLocked(bindingID string, invocationID string, previousLatest uint64, hadLatest bool, changed map[string]contracts.InvocationStatus) {
	if hadLatest {
		coordinator.latest[bindingID] = previousLatest
	} else {
		delete(coordinator.latest, bindingID)
	}
	for changedID, previousStatus := range changed {
		coordinator.invocations[changedID] = previousStatus
	}
	delete(coordinator.invocations, invocationID)
	delete(coordinator.invocationBindings, invocationID)
}

func terminalState(state string) bool {
	return state == "completed" || state == "cancelled" || state == "timedOut" || state == "failed" || state == "crashed" || state == "superseded"
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
	if coordinator.latest[binding.ID] != identity.Sequence {
		status.State = "superseded"
		coordinator.invocations[identity.InvocationID] = status
		coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
		coordinator.pruneInvocationsLocked(binding.ID)
		return
	}
	status = coordinator.finishInvocationLocked(binding, identity, status, result, err)
	coordinator.invocations[identity.InvocationID] = status
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
	coordinator.pruneInvocationsLocked(binding.ID)
}

func (coordinator *Coordinator) finishInvocationLocked(binding contracts.Binding, identity contracts.InvocationIdentity, status contracts.InvocationStatus, result contracts.InvokeResult, err error) contracts.InvocationStatus {
	if err != nil {
		status.State, status.Error = invocationFailure(err)
	} else if result.Error != nil {
		status.State = resultErrorState(result.Error)
		status.Error = result.Error
	} else {
		coordinator.applyOutputsLocked(binding, result.Outputs)
		if len(result.Outputs) > 0 {
			update := contracts.BrowserRuntimeUpdate{Identity: identity, Outputs: cloneRawMap(result.Outputs)}
			coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "update", Update: &update})
		}
		status.State = "completed"
	}
	return status
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
	binding, exists := coordinator.invocationBindings[update.Identity.InvocationID]
	if !exists {
		return
	}
	status, accepted := coordinator.updateStatusLocked(binding, update.Identity)
	if !accepted {
		return
	}
	if status.State == "running" {
		status.State = "streaming"
		coordinator.invocations[update.Identity.InvocationID] = status
		coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
	}
	outputs := cloneRawMap(update.Outputs)
	coordinator.adoptArtifactsLocked(update, outputs)
	coordinator.applyOutputsLocked(binding, outputs)
	update.Outputs = outputs
	browserUpdate := contracts.BrowserRuntimeUpdate{
		Identity: update.Identity, Progress: update.Progress, Message: update.Message, Outputs: update.Outputs,
	}
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "update", Update: &browserUpdate})
}

func (coordinator *Coordinator) updateStatusLocked(binding contracts.Binding, identity contracts.InvocationIdentity) (contracts.InvocationStatus, bool) {
	status, exists := coordinator.invocations[identity.InvocationID]
	if !exists || status.Identity != identity {
		return contracts.InvocationStatus{}, false
	}
	if coordinator.latest[binding.ID] != identity.Sequence || !updateAcceptingState(status.State) {
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

func updateAcceptingState(state string) bool {
	return state == "running" || state == "streaming" || state == "completed"
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
	for name, value := range outputs {
		target, exists := binding.Outputs[name]
		if !exists {
			continue
		}
		coordinator.values[target.SectionID+"."+target.Field] = append(json.RawMessage(nil), value...)
	}
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
	return contracts.RuntimeSnapshot{SessionID: coordinator.sessionID, WorkerState: coordinator.workerState, Values: values, Invocations: invocations}
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
