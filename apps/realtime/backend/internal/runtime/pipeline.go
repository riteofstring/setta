package runtime

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/setta/realtime/backend/internal/contracts"
	"github.com/setta/realtime/backend/internal/scheduler"
)

type pipelineRun struct {
	id         string
	project    contracts.Project
	event      contracts.RuntimeEvent
	pipeline   contracts.CompiledPipeline
	nodes      map[string]*pipelineNode
	references []contracts.ContentReference
}

type pipelineNode struct {
	binding        contracts.Binding
	identity       contracts.InvocationIdentity
	arguments      map[string]json.RawMessage
	references     []contracts.ContentReference
	fingerprint    string
	startupTarget  bool
	pendingTask    bool
	updateSequence uint64
	changed        chan struct{}
}

type startupAction uint8

const (
	startupRun startupAction = iota
	startupAdopt
	startupSkip
)

func (coordinator *Coordinator) startPipelineRunLocked(projectSnapshot contracts.Project, event contracts.RuntimeEvent, eventKey contracts.PipelineEvent) (int, []contracts.ContentReference, error) {
	runID, err := randomID("run")
	if err != nil {
		return 0, nil, err
	}
	frozen, consumed, retained, err := coordinator.freezeEventLocked(event, runID)
	if err != nil {
		return 0, appendUniqueReferences(consumed, retained), err
	}
	run := &pipelineRun{
		id: runID, project: projectSnapshot, event: frozen, pipeline: coordinator.pipeline,
		nodes: make(map[string]*pipelineNode), references: retained,
	}
	selected, startupTargets := coordinator.selectedBindingsLocked(run, eventKey)
	if len(selected) == 0 {
		return 0, appendUniqueReferences(consumed, retained), nil
	}
	coordinator.runs[run.id] = run
	accepted := 0
	for _, bindingID := range run.pipeline.TopologicalOrder {
		if !selected[bindingID] {
			continue
		}
		binding := run.pipeline.Bindings[bindingID]
		if binding.Trigger.Kind == "event" {
			admitted, err := coordinator.reserveRootLocked(run, binding, startupTargets[bindingID])
			if err != nil {
				cleanup := coordinator.abortRunLocked(run)
				return accepted, appendUniqueReferences(consumed, cleanup), err
			}
			if admitted {
				accepted++
			}
			continue
		}
		if binding.Trigger.Kind == "join" && coordinator.parentsReservedLocked(run, bindingID) {
			if err := coordinator.reserveJoinLocked(run, binding, startupTargets[bindingID]); err != nil {
				if errors.Is(err, scheduler.ErrBusy) || errors.Is(err, scheduler.ErrQueueFull) {
					continue
				}
				cleanup := coordinator.abortRunLocked(run)
				return accepted, appendUniqueReferences(consumed, cleanup), err
			}
		}
	}
	if len(run.nodes) == 0 {
		delete(coordinator.runs, run.id)
		return 0, appendUniqueReferences(consumed, run.references), nil
	}
	for _, bindingID := range run.pipeline.TopologicalOrder {
		node := run.nodes[bindingID]
		if node == nil {
			continue
		}
		status := coordinator.invocations[node.identity.InvocationID]
		coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
		if status.State == "completed" {
			coordinator.publishAdoptedNodeLocked(node)
		}
	}
	coordinator.advanceReadyJoinsLocked(run)
	for _, bindingID := range run.pipeline.EventBindings[eventKey] {
		node := run.nodes[bindingID]
		if node == nil {
			continue
		}
		status := coordinator.invocations[node.identity.InvocationID]
		if status.State == "queued" && !coordinator.scheduler.Ready(node.identity.InvocationID) {
			coordinator.invalidateNodeLocked(run, bindingID, "superseded", "superseded", "Invocation was superseded before it became runnable.")
			coordinator.invalidateDescendantsLocked(run, bindingID, "upstream_superseded", "An upstream invocation was superseded.")
		}
	}
	coordinator.finishRunIfTerminalLocked(run)
	return accepted, consumed, nil
}

func (coordinator *Coordinator) freezeEventLocked(event contracts.RuntimeEvent, runID string) (contracts.RuntimeEvent, []contracts.ContentReference, []contracts.ContentReference, error) {
	var payload any
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return contracts.RuntimeEvent{}, nil, nil, err
	}
	consumed, err := contentReferencesInValue(payload)
	if err != nil {
		return contracts.RuntimeEvent{}, nil, nil, err
	}
	updated, retained, err := coordinator.rescopeValue(payload, runID, make(map[string]contracts.ContentReference))
	if err != nil {
		_ = coordinator.content.DeleteInvocation(runID)
		return contracts.RuntimeEvent{}, consumed, nil, err
	}
	encoded, err := json.Marshal(updated)
	if err != nil {
		_ = coordinator.content.DeleteInvocation(runID)
		return contracts.RuntimeEvent{}, consumed, nil, err
	}
	event.Payload = encoded
	return event, consumed, retained, nil
}

func (coordinator *Coordinator) selectedBindingsLocked(run *pipelineRun, eventKey contracts.PipelineEvent) (map[string]bool, map[string]bool) {
	selected := make(map[string]bool)
	targets := make(map[string]bool)
	if run.event.Cause != "startup" {
		for _, bindingID := range run.pipeline.ReachableByEvent[eventKey] {
			selected[bindingID] = true
		}
		return selected, targets
	}
	for _, bindingID := range run.pipeline.ReachableByEvent[eventKey] {
		binding := run.pipeline.Bindings[bindingID]
		if supportsAutomaticStartup(binding) && !coordinator.startupAttemptedLocked(binding) {
			targets[bindingID] = true
			coordinator.selectAncestorsLocked(run.pipeline, bindingID, selected)
		}
	}
	for _, rootID := range run.pipeline.EventBindings[eventKey] {
		if !selected[rootID] {
			continue
		}
		selected[rootID] = true
		for _, descendantID := range run.pipeline.DescendantsByBinding[rootID] {
			selected[descendantID] = true
		}
	}
	for bindingID := range selected {
		for _, input := range run.pipeline.InputsByBinding[bindingID] {
			coordinator.selectAncestorsLocked(run.pipeline, input.BindingID, selected)
		}
	}
	return selected, targets
}

func (coordinator *Coordinator) selectAncestorsLocked(pipeline contracts.CompiledPipeline, bindingID string, selected map[string]bool) {
	if selected[bindingID] {
		return
	}
	selected[bindingID] = true
	for _, input := range pipeline.InputsByBinding[bindingID] {
		coordinator.selectAncestorsLocked(pipeline, input.BindingID, selected)
	}
}

func (coordinator *Coordinator) reserveRootLocked(run *pipelineRun, binding contracts.Binding, startupTarget bool) (bool, error) {
	rawArguments, references, err := resolveArguments(run.project, run.event.Payload, binding.Arguments)
	if err != nil {
		return false, err
	}
	fingerprint, err := computeFingerprint(coordinator.sourceVersion, binding.Handler, rawArguments)
	if err != nil {
		return false, err
	}
	action := startupRun
	if run.event.Cause == "startup" {
		action = coordinator.startupActionLocked(binding, fingerprint, startupTarget)
	}
	if action == startupSkip {
		return false, nil
	}
	node, err := coordinator.newPipelineNodeLocked(run, binding, startupTarget)
	if err != nil {
		return false, err
	}
	node.fingerprint = fingerprint
	if action == startupAdopt {
		if err := coordinator.adoptMaterializationLocked(run, node); err != nil {
			coordinator.rollbackNodeLocked(run, node)
			return false, err
		}
		return false, nil
	}
	prepared, owned, err := coordinator.prepareArguments(rawArguments, references, node.identity.InvocationID)
	if err != nil {
		coordinator.rollbackNodeLocked(run, node)
		return false, err
	}
	node.arguments = prepared
	node.references = owned
	run.references = appendUniqueReferences(run.references, owned)
	coordinator.registerNodeLocked(run, node, "queued")
	coordinator.invocationHolds[node.identity.InvocationID] = run.event.Cause == "startup" && coordinator.retainedByBinding[binding.ID]
	if err := coordinator.submitNodeLocked(run, node); err != nil {
		coordinator.rollbackNodeLocked(run, node)
		if errors.Is(err, scheduler.ErrBusy) || errors.Is(err, scheduler.ErrQueueFull) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (coordinator *Coordinator) reserveJoinLocked(run *pipelineRun, binding contracts.Binding, startupTarget bool) error {
	node, err := coordinator.newPipelineNodeLocked(run, binding, startupTarget)
	if err != nil {
		return err
	}
	coordinator.registerNodeLocked(run, node, "waiting")
	if err := coordinator.submitNodeLocked(run, node); err != nil {
		coordinator.rollbackNodeLocked(run, node)
		return err
	}
	return nil
}

func (coordinator *Coordinator) newPipelineNodeLocked(run *pipelineRun, binding contracts.Binding, startupTarget bool) (*pipelineNode, error) {
	coordinator.sequences[binding.ID]++
	identity, err := coordinator.identityLocked(run.id, binding.ID, coordinator.sequences[binding.ID])
	if err != nil {
		return nil, err
	}
	node := &pipelineNode{binding: binding, identity: identity, startupTarget: startupTarget, changed: make(chan struct{})}
	run.nodes[binding.ID] = node
	return node, nil
}

func (coordinator *Coordinator) registerNodeLocked(run *pipelineRun, node *pipelineNode, state string) {
	status := contracts.InvocationStatus{Identity: node.identity, State: state}
	coordinator.invocations[node.identity.InvocationID] = status
	coordinator.invocationBindings[node.identity.InvocationID] = node.binding
	coordinator.invocationOutputs[node.identity.InvocationID] = make(map[string]json.RawMessage)
	coordinator.invocationHashes[node.identity.InvocationID] = node.fingerprint
	coordinator.invocationRuns[node.identity.InvocationID] = run.id
}

func (coordinator *Coordinator) submitNodeLocked(run *pipelineRun, node *pipelineNode) error {
	task := scheduler.Task{
		InvocationID: node.identity.InvocationID,
		BindingID:    node.binding.ID,
		Ready:        false,
		Run: func(ctx context.Context) {
			coordinator.runPipelineInvocation(ctx, run.id, node.binding.ID, node.identity)
		},
		Drop: func() {
			go coordinator.pipelineTaskDropped(run.id, node.binding.ID, node.identity)
		},
	}
	submission, err := coordinator.scheduler.Submit(task)
	if err != nil {
		return err
	}
	node.pendingTask = true
	for _, invocationID := range submission.ReplacedInvocationIDs {
		coordinator.supersedeInvocationLocked(invocationID)
	}
	return nil
}

func (coordinator *Coordinator) parentsReservedLocked(run *pipelineRun, bindingID string) bool {
	parents := make(map[string]bool)
	for _, input := range run.pipeline.InputsByBinding[bindingID] {
		parents[input.BindingID] = true
	}
	for parentID := range parents {
		if run.nodes[parentID] == nil {
			return false
		}
	}
	return len(parents) > 0
}

func (coordinator *Coordinator) resolveJoinLocked(run *pipelineRun, node *pipelineNode) (map[string]json.RawMessage, []contracts.ContentReference, string, error) {
	arguments, references, err := resolveArguments(run.project, run.event.Payload, node.binding.Arguments)
	if err != nil {
		return nil, nil, "", err
	}
	for name, input := range run.pipeline.InputsByBinding[node.binding.ID] {
		parent := run.nodes[input.BindingID]
		if parent == nil {
			return nil, nil, "", errors.New("runtime: join parent is unavailable")
		}
		value, exists := coordinator.invocationOutputs[parent.identity.InvocationID][input.Output]
		if !exists {
			return nil, nil, "", errors.New("runtime: join input output is missing")
		}
		arguments[name] = append(json.RawMessage(nil), value...)
		discovered, err := contentReferencesInRawMap(map[string]json.RawMessage{name: value})
		if err != nil {
			return nil, nil, "", err
		}
		references = appendUniqueReferences(references, discovered)
	}
	fingerprint, err := computeFingerprint(coordinator.sourceVersion, node.binding.Handler, arguments)
	return arguments, references, fingerprint, err
}

func (coordinator *Coordinator) advanceReadyJoinsLocked(run *pipelineRun) {
	for {
		advanced := false
		for _, bindingID := range run.pipeline.TopologicalOrder {
			node := run.nodes[bindingID]
			if node == nil || node.binding.Trigger.Kind != "join" {
				continue
			}
			status := coordinator.invocations[node.identity.InvocationID]
			if status.State != "waiting" || !coordinator.parentsCompletedLocked(run, bindingID) {
				continue
			}
			arguments, references, fingerprint, err := coordinator.resolveJoinLocked(run, node)
			if err != nil {
				coordinator.invalidateNodeLocked(run, bindingID, "blocked", "missing_input", err.Error())
				coordinator.invalidateDescendantsLocked(run, bindingID, "upstream_blocked", "An upstream join could not be satisfied.")
				advanced = true
				continue
			}
			node.fingerprint = fingerprint
			coordinator.invocationHashes[node.identity.InvocationID] = fingerprint
			action := startupRun
			if run.event.Cause == "startup" {
				action = coordinator.startupActionLocked(node.binding, fingerprint, node.startupTarget)
			}
			if action == startupSkip {
				coordinator.invalidateNodeLocked(run, bindingID, "blocked", "startup_skipped", "Startup policy did not admit this invocation.")
				coordinator.invalidateDescendantsLocked(run, bindingID, "upstream_blocked", "An upstream startup invocation was skipped.")
				advanced = true
				continue
			}
			if action == startupAdopt {
				coordinator.scheduler.Cancel(node.identity.InvocationID)
				if err := coordinator.adoptMaterializationLocked(run, node); err != nil {
					coordinator.invalidateNodeLocked(run, bindingID, "blocked", "materialization_error", err.Error())
					coordinator.invalidateDescendantsLocked(run, bindingID, "upstream_blocked", "An upstream materialization could not be adopted.")
				} else {
					status = coordinator.invocations[node.identity.InvocationID]
					coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
					coordinator.publishAdoptedNodeLocked(node)
				}
				advanced = true
				continue
			}
			prepared, owned, err := coordinator.prepareArguments(arguments, references, node.identity.InvocationID)
			if err != nil {
				coordinator.invalidateNodeLocked(run, bindingID, "blocked", "input_error", err.Error())
				coordinator.invalidateDescendantsLocked(run, bindingID, "upstream_blocked", "An upstream join could not prepare its inputs.")
				advanced = true
				continue
			}
			node.arguments = prepared
			node.references = owned
			run.references = appendUniqueReferences(run.references, owned)
			coordinator.invocationHolds[node.identity.InvocationID] = run.event.Cause == "startup" && coordinator.retainedByBinding[node.binding.ID]
			status.State = "queued"
			status.Error = nil
			coordinator.invocations[node.identity.InvocationID] = status
			coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
			if !coordinator.scheduler.Ready(node.identity.InvocationID) {
				coordinator.invalidateNodeLocked(run, bindingID, "superseded", "superseded", "Invocation was superseded before it became runnable.")
				coordinator.invalidateDescendantsLocked(run, bindingID, "upstream_superseded", "An upstream invocation was superseded.")
			}
			advanced = true
		}
		if !advanced {
			return
		}
	}
}

func (coordinator *Coordinator) parentsCompletedLocked(run *pipelineRun, bindingID string) bool {
	parents := make(map[string]bool)
	for _, input := range run.pipeline.InputsByBinding[bindingID] {
		parents[input.BindingID] = true
	}
	for parentID := range parents {
		parent := run.nodes[parentID]
		if parent == nil || coordinator.invocations[parent.identity.InvocationID].State != "completed" {
			return false
		}
	}
	return len(parents) > 0
}

func (coordinator *Coordinator) runPipelineInvocation(ctx context.Context, runID string, bindingID string, identity contracts.InvocationIdentity) {
	coordinator.mu.Lock()
	run := coordinator.runs[runID]
	node := pipelineRunNode(run, bindingID, identity)
	if node == nil || coordinator.closed {
		if node != nil {
			node.pendingTask = false
			coordinator.finishRunIfTerminalLocked(run)
		}
		coordinator.mu.Unlock()
		return
	}
	status := coordinator.invocations[identity.InvocationID]
	if status.State != "queued" {
		node.pendingTask = false
		coordinator.finishRunIfTerminalLocked(run)
		coordinator.mu.Unlock()
		return
	}
	coordinator.active[identity.InvocationID] = struct{}{}
	status.State = "running"
	status.Error = nil
	coordinator.invocations[identity.InvocationID] = status
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
	params := contracts.InvokeParams{
		Identity: identity, Handler: node.binding.Handler, Arguments: cloneRawMap(node.arguments),
		Content: append([]contracts.ContentReference(nil), node.references...),
	}
	coordinator.mu.Unlock()
	result, invokeErr := coordinator.worker.Invoke(ctx, params)
	updatesComplete := coordinator.waitForPipelineUpdates(ctx, identity, result.UpdateCount)
	coordinator.mu.Lock()
	run = coordinator.runs[runID]
	node = pipelineRunNode(run, bindingID, identity)
	delete(coordinator.active, identity.InvocationID)
	if node == nil {
		coordinator.mu.Unlock()
		return
	}
	node.pendingTask = false
	status, exists := coordinator.invocations[identity.InvocationID]
	if !exists || invocationTerminal(status.State) || coordinator.closed {
		coordinator.finishRunIfTerminalLocked(run)
		coordinator.mu.Unlock()
		return
	}
	if !updatesComplete && invokeErr == nil {
		invokeErr = ctx.Err()
	}
	if invokeErr != nil {
		status.State, status.Error = invocationFailure(invokeErr)
		coordinator.invocations[identity.InvocationID] = status
		coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
		coordinator.invalidateDescendantsLocked(run, bindingID, "upstream_failed", "An upstream invocation failed.")
	} else if result.Error != nil {
		status.State = resultErrorState(result.Error)
		status.Error = result.Error
		coordinator.invocations[identity.InvocationID] = status
		coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
		coordinator.invalidateDescendantsLocked(run, bindingID, "upstream_failed", "An upstream invocation failed.")
	} else {
		coordinator.completePipelineNodeLocked(run, node, result.Outputs)
		coordinator.advanceReadyJoinsLocked(run)
	}
	coordinator.finishRunIfTerminalLocked(run)
	coordinator.pruneInvocationsLocked(bindingID)
	coordinator.mu.Unlock()
}

func (coordinator *Coordinator) waitForPipelineUpdates(ctx context.Context, identity contracts.InvocationIdentity, count uint64) bool {
	for {
		coordinator.mu.Lock()
		run := coordinator.runs[identity.RunID]
		node := pipelineRunNode(run, identity.BindingID, identity)
		if node == nil {
			coordinator.mu.Unlock()
			return false
		}
		if node.updateSequence >= count {
			coordinator.mu.Unlock()
			return true
		}
		status := coordinator.invocations[identity.InvocationID]
		if invocationTerminal(status.State) {
			coordinator.mu.Unlock()
			return false
		}
		changed := node.changed
		coordinator.mu.Unlock()
		select {
		case <-ctx.Done():
			return false
		case <-changed:
		}
	}
}

func (coordinator *Coordinator) completePipelineNodeLocked(run *pipelineRun, node *pipelineNode, finalOutputs map[string]json.RawMessage) {
	if len(finalOutputs) > 0 {
		coordinator.mergeInvocationOutputsLocked(node.identity.InvocationID, finalOutputs)
		coordinator.retainOutputReferencesLocked(run, finalOutputs)
	}
	publishOutputs := cloneRawMap(finalOutputs)
	if coordinator.invocationHolds[node.identity.InvocationID] {
		publishOutputs = cloneRawMap(coordinator.invocationOutputs[node.identity.InvocationID])
	}
	published := coordinator.applyPublishedOutputsLocked(node.binding, node.identity, publishOutputs)
	if published && len(publishOutputs) > 0 {
		update := contracts.BrowserRuntimeUpdate{Identity: node.identity, UpdateSequence: node.updateSequence + 1, Outputs: cloneRawMap(publishOutputs)}
		coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "update", Update: &update})
	}
	status := coordinator.invocations[node.identity.InvocationID]
	status.State = "completed"
	status.Error = nil
	coordinator.invocations[node.identity.InvocationID] = status
	coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
	if coordinator.publishedByBinding[node.binding.ID] == node.identity && len(coordinator.invocationOutputs[node.identity.InvocationID]) > 0 {
		coordinator.persistInvocationLocked(node.binding, node.identity)
		if coordinator.retainedByBinding[node.binding.ID] {
			delete(coordinator.retainedByBinding, node.binding.ID)
			coordinator.publishSnapshotLocked()
		}
	}
}

func (coordinator *Coordinator) adoptMaterializationLocked(run *pipelineRun, node *pipelineNode) error {
	outputs, owned, err := coordinator.prepareArguments(
		coordinator.materializedOutput[node.binding.ID], coordinator.materializedRefs[node.binding.ID], node.identity.InvocationID,
	)
	if err != nil {
		return err
	}
	node.references = owned
	run.references = appendUniqueReferences(run.references, owned)
	coordinator.registerNodeLocked(run, node, "completed")
	coordinator.invocationOutputs[node.identity.InvocationID] = cloneRawMap(outputs)
	coordinator.invocationHashes[node.identity.InvocationID] = node.fingerprint
	return nil
}

func (coordinator *Coordinator) publishAdoptedNodeLocked(node *pipelineNode) {
	outputs := cloneRawMap(coordinator.invocationOutputs[node.identity.InvocationID])
	if coordinator.applyPublishedOutputsLocked(node.binding, node.identity, outputs) {
		update := contracts.BrowserRuntimeUpdate{Identity: node.identity, UpdateSequence: 1, Outputs: outputs}
		coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "update", Update: &update})
	}
}

func (coordinator *Coordinator) retainOutputReferencesLocked(run *pipelineRun, outputs map[string]json.RawMessage) {
	references, err := contentReferencesInRawMap(outputs)
	if err == nil {
		run.references = appendUniqueReferences(run.references, references)
	}
}

func (coordinator *Coordinator) pipelineTaskDropped(runID string, bindingID string, identity contracts.InvocationIdentity) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	run := coordinator.runs[runID]
	node := pipelineRunNode(run, bindingID, identity)
	if node == nil {
		return
	}
	node.pendingTask = false
	status := coordinator.invocations[identity.InvocationID]
	if !invocationTerminal(status.State) {
		status.State = "superseded"
		status.Error = &contracts.StructuredError{Code: "superseded", Message: "Invocation was dropped before it ran."}
		coordinator.invocations[identity.InvocationID] = status
		if !coordinator.closed {
			coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
		}
		coordinator.invalidateDescendantsLocked(run, bindingID, "upstream_superseded", "An upstream invocation was superseded.")
	}
	coordinator.finishRunIfTerminalLocked(run)
}

func (coordinator *Coordinator) supersedeInvocationLocked(invocationID string) {
	runID := coordinator.invocationRuns[invocationID]
	run := coordinator.runs[runID]
	status, exists := coordinator.invocations[invocationID]
	if run == nil || !exists || invocationTerminal(status.State) {
		return
	}
	coordinator.invalidateNodeWithoutCancelLocked(run, status.Identity.BindingID, "superseded", "superseded", "Invocation was superseded by a newer lineage.")
	coordinator.invalidateDescendantsLocked(run, status.Identity.BindingID, "upstream_superseded", "An upstream invocation was superseded.")
	coordinator.finishRunIfTerminalLocked(run)
}

func (coordinator *Coordinator) invalidateNodeLocked(run *pipelineRun, bindingID string, state string, code string, message string) {
	coordinator.invalidateNodeWithSchedulerLocked(run, bindingID, state, code, message, coordinator.scheduler, true)
}

func (coordinator *Coordinator) invalidateNodeWithoutCancelLocked(run *pipelineRun, bindingID string, state string, code string, message string) {
	coordinator.invalidateNodeWithSchedulerLocked(run, bindingID, state, code, message, coordinator.scheduler, false)
}

func (coordinator *Coordinator) invalidateNodeWithSchedulerLocked(run *pipelineRun, bindingID string, state string, code string, message string, scheduled *scheduler.Scheduler, cancel bool) {
	node := run.nodes[bindingID]
	if node == nil {
		return
	}
	status, exists := coordinator.invocations[node.identity.InvocationID]
	if !exists || invocationTerminal(status.State) {
		return
	}
	if cancel && scheduled != nil {
		scheduled.Cancel(node.identity.InvocationID)
	}
	status.State = state
	status.Error = &contracts.StructuredError{Code: code, Message: message}
	coordinator.invocations[node.identity.InvocationID] = status
	coordinator.signalNodeLocked(node)
	if !coordinator.closed {
		coordinator.publishLocked(contracts.RuntimeEnvelope{Type: "invocation", Invocation: &status})
	}
}

func (coordinator *Coordinator) invalidateDescendantsLocked(run *pipelineRun, bindingID string, code string, message string) {
	for _, descendantID := range run.pipeline.DescendantsByBinding[bindingID] {
		coordinator.invalidateNodeLocked(run, descendantID, "blocked", code, message)
	}
}

func (coordinator *Coordinator) invalidateAllRunsLocked(scheduled *scheduler.Scheduler, code string, message string) {
	for _, run := range coordinator.runs {
		for _, bindingID := range run.pipeline.TopologicalOrder {
			coordinator.invalidateNodeWithSchedulerLocked(run, bindingID, "cancelled", code, message, scheduled, true)
		}
		coordinator.finishRunIfTerminalLocked(run)
	}
}

func (coordinator *Coordinator) signalNodeLocked(node *pipelineNode) {
	close(node.changed)
	node.changed = make(chan struct{})
}

func (coordinator *Coordinator) finishRunIfTerminalLocked(run *pipelineRun) {
	if run == nil || coordinator.runs[run.id] != run {
		return
	}
	for _, node := range run.nodes {
		status, exists := coordinator.invocations[node.identity.InvocationID]
		if !exists || !invocationTerminal(status.State) || node.pendingTask {
			return
		}
		if _, active := coordinator.active[node.identity.InvocationID]; active {
			return
		}
	}
	delete(coordinator.runs, run.id)
	for _, node := range run.nodes {
		delete(coordinator.invocationRuns, node.identity.InvocationID)
	}
	protected := coordinator.protectedReferencesLocked()
	cleanup := make([]contracts.ContentReference, 0, len(run.references))
	for _, reference := range run.references {
		if !protected[reference.ID] {
			cleanup = append(cleanup, reference)
		}
	}
	_ = coordinator.content.DeleteReferences(cleanup)
}

func (coordinator *Coordinator) protectedReferencesLocked() map[string]bool {
	protected := make(map[string]bool)
	for _, references := range coordinator.materializedRefs {
		for _, reference := range references {
			protected[reference.ID] = true
		}
	}
	if references, err := contentReferencesInRawMap(coordinator.values); err == nil {
		for _, reference := range references {
			protected[reference.ID] = true
		}
	}
	for _, run := range coordinator.runs {
		for _, reference := range run.references {
			protected[reference.ID] = true
		}
	}
	return protected
}

func (coordinator *Coordinator) runtimeReferencesLocked() []contracts.ContentReference {
	references := []contracts.ContentReference{}
	for _, run := range coordinator.runs {
		references = appendUniqueReferences(references, run.references)
	}
	return references
}

func (coordinator *Coordinator) abortRunLocked(run *pipelineRun) []contracts.ContentReference {
	for _, node := range run.nodes {
		coordinator.scheduler.Cancel(node.identity.InvocationID)
		coordinator.rollbackNodeLocked(run, node)
	}
	delete(coordinator.runs, run.id)
	return append([]contracts.ContentReference(nil), run.references...)
}

func (coordinator *Coordinator) rollbackNodeLocked(run *pipelineRun, node *pipelineNode) {
	delete(run.nodes, node.binding.ID)
	delete(coordinator.invocations, node.identity.InvocationID)
	delete(coordinator.invocationBindings, node.identity.InvocationID)
	delete(coordinator.invocationOutputs, node.identity.InvocationID)
	delete(coordinator.invocationHashes, node.identity.InvocationID)
	delete(coordinator.invocationHolds, node.identity.InvocationID)
	delete(coordinator.invocationRuns, node.identity.InvocationID)
}

func pipelineRunNode(run *pipelineRun, bindingID string, identity contracts.InvocationIdentity) *pipelineNode {
	if run == nil {
		return nil
	}
	node := run.nodes[bindingID]
	if node == nil || node.identity != identity {
		return nil
	}
	return node
}

func invocationTerminal(state string) bool {
	switch state {
	case "completed", "failed", "crashed", "timedOut", "cancelled", "superseded", "blocked":
		return true
	default:
		return false
	}
}
