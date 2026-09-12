package runtime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"github.com/setta/realtime/backend/internal/contracts"
	"github.com/setta/realtime/backend/internal/scheduler"
)

func TestPipelineStartupClaimsJoinBeforeParentsCompleteAndRetriesUnreachedTarget(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	configureFanInPipeline(t, coordinator, false, "parallel")
	setPipelineMaterialization(t, coordinator, "combine", "always")
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	event := pipelineRuntimeEvent(snapshot.SessionID, "startup", json.RawMessage(`{"contentRef":"frame"}`))
	accepted, err := coordinator.HandleEvent(event)
	if err != nil || accepted != 2 {
		t.Fatalf("HandleEvent(first) = %d, %v", accepted, err)
	}
	first := receiveFanInRoots(t, worker)
	accepted, err = coordinator.HandleEvent(event)
	if err != nil || accepted != 0 {
		t.Fatalf("HandleEvent(concurrent) = %d, %v", accepted, err)
	}
	assertNoWorkerInvocation(t, worker.started)
	worker.replyError(first["stylize"].Identity.InvocationID, "render_failed")
	worker.finish(first["alternate"].Identity.InvocationID)
	waitForInvocationState(t, coordinator, first["alternate"].Identity.InvocationID, "completed")
	accepted, err = coordinator.HandleEvent(event)
	if err != nil || accepted != 2 {
		t.Fatalf("HandleEvent(retry) = %d, %v", accepted, err)
	}
	retry := receiveFanInRoots(t, worker)
	worker.reply(retry["stylize"].Identity.InvocationID, `"left"`)
	worker.reply(retry["alternate"].Identity.InvocationID, `"right"`)
	joined := receiveInvocation(t, worker.started)
	worker.reply(joined.Identity.InvocationID, `"combined"`)
	waitForInvocationState(t, coordinator, joined.Identity.InvocationID, "completed")
	accepted, err = coordinator.HandleEvent(event)
	if err != nil || accepted != 0 {
		t.Fatalf("HandleEvent(completed) = %d, %v", accepted, err)
	}
}

func TestPipelineStartupExcludesUnrelatedSiblingBranches(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	configureStartupSiblingPipeline(t, coordinator)
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	event := pipelineRuntimeEvent(snapshot.SessionID, "startup", json.RawMessage(`{"contentRef":"frame"}`))
	accepted, err := coordinator.HandleEvent(event)
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent(first) = %d, %v", accepted, err)
	}
	root := receiveInvocation(t, worker.started)
	worker.reply(root.Identity.InvocationID, `"root"`)
	firstChildren := receiveInvocations(t, worker.started, 2)
	for _, invocation := range firstChildren {
		if invocation.Identity.BindingID != "target" && invocation.Identity.BindingID != "already-attempted" {
			t.Fatalf("first startup child = %#v", invocation.Identity)
		}
		worker.reply(invocation.Identity.InvocationID, `"child"`)
	}
	assertNoWorkerInvocation(t, worker.started)
	for _, invocation := range firstChildren {
		waitForInvocationState(t, coordinator, invocation.Identity.InvocationID, "completed")
	}
	projectSnapshot, err := coordinator.ProjectSnapshot()
	if err != nil {
		t.Fatalf("ProjectSnapshot() error = %v", err)
	}
	target := bindingByID(t, projectSnapshot, "target")
	target.Handler = "target_v2"
	if _, err := coordinator.Apply(contracts.ApplyRequest{
		ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision,
		Operations: []json.RawMessage{setBindingOperation(t, target)},
	}); err != nil {
		t.Fatalf("Apply(target) error = %v", err)
	}
	accepted, err = coordinator.HandleEvent(event)
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent(second) = %d, %v", accepted, err)
	}
	root = receiveInvocation(t, worker.started)
	worker.reply(root.Identity.InvocationID, `"root-v2"`)
	child := receiveInvocation(t, worker.started)
	if child.Identity.BindingID != "target" {
		t.Fatalf("second startup child = %#v, want target", child.Identity)
	}
	worker.reply(child.Identity.InvocationID, `"target-v2"`)
	assertNoWorkerInvocation(t, worker.started)
}

func TestPipelineQueueCapacityFailureIsAtomicAndRetryable(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	configureLargeStartupPipeline(t, coordinator, 66)
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	event := pipelineRuntimeEvent(snapshot.SessionID, "startup", json.RawMessage(`{"contentRef":"frame"}`))
	for attempt := 1; attempt <= 2; attempt++ {
		accepted, err := coordinator.HandleEvent(event)
		if accepted != 0 || !errors.Is(err, scheduler.ErrQueueFull) {
			t.Fatalf("HandleEvent(attempt %d) = %d, %v", attempt, accepted, err)
		}
		current, snapshotErr := coordinator.Snapshot()
		if snapshotErr != nil {
			t.Fatalf("Snapshot(attempt %d) error = %v", attempt, snapshotErr)
		}
		if len(current.Invocations) != 0 || coordinator.scheduler.Pending() != 0 {
			t.Fatalf("attempt %d left invocations = %d, pending = %d", attempt, len(current.Invocations), coordinator.scheduler.Pending())
		}
		coordinator.mu.Lock()
		remainingRuns := len(coordinator.runs)
		coordinator.mu.Unlock()
		if remainingRuns != 0 {
			t.Fatalf("attempt %d left %d runs", attempt, remainingRuns)
		}
		assertNoWorkerInvocation(t, worker.started)
	}
}

func TestPipelineBusyStartupNoOpDoesNotConsumeClaim(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	projectSnapshot, err := coordinator.ProjectSnapshot()
	if err != nil {
		t.Fatalf("ProjectSnapshot() error = %v", err)
	}
	binding := bindingByID(t, projectSnapshot, "stylize")
	binding.Scheduling.Mode = "once"
	binding.Materialization = &contracts.MaterializationPolicy{Retention: "lastSuccessful", Startup: "always"}
	if _, err := coordinator.Apply(contracts.ApplyRequest{
		ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision,
		Operations: []json.RawMessage{setBindingOperation(t, binding)},
	}); err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	interaction := pipelineRuntimeEvent(snapshot.SessionID, "interaction", json.RawMessage(`{"contentRef":"interaction"}`))
	if accepted, err := coordinator.HandleEvent(interaction); err != nil || accepted != 1 {
		t.Fatalf("HandleEvent(interaction) = %d, %v", accepted, err)
	}
	active := receiveInvocation(t, worker.started)
	startup := pipelineRuntimeEvent(snapshot.SessionID, "startup", json.RawMessage(`{"contentRef":"startup"}`))
	if accepted, err := coordinator.HandleEvent(startup); err != nil || accepted != 0 {
		t.Fatalf("HandleEvent(busy startup) = %d, %v", accepted, err)
	}
	worker.reply(active.Identity.InvocationID, `"interaction"`)
	waitForInvocationState(t, coordinator, active.Identity.InvocationID, "completed")
	if accepted, err := coordinator.HandleEvent(startup); err != nil || accepted != 1 {
		t.Fatalf("HandleEvent(retry startup) = %d, %v", accepted, err)
	}
	retry := receiveInvocation(t, worker.started)
	worker.reply(retry.Identity.InvocationID, `"startup"`)
}

func configureStartupSiblingPipeline(t *testing.T, coordinator *Coordinator) {
	t.Helper()
	projectSnapshot, err := coordinator.ProjectSnapshot()
	if err != nil {
		t.Fatalf("ProjectSnapshot() error = %v", err)
	}
	root := bindingByID(t, projectSnapshot, "stylize")
	root.Outputs = map[string]contracts.BindingOutput{"image": {}}
	root.Scheduling = contracts.SchedulingPolicy{Mode: "parallel", ConcurrencyGroup: "startup-root", ConcurrencyLimit: 2}
	operations := []json.RawMessage{setBindingOperation(t, root)}
	for index, bindingID := range []string{"target", "already-attempted", "manual-sibling"} {
		handler := map[string]string{"target": "target", "already-attempted": "already_attempted", "manual-sibling": "manual_sibling"}[bindingID]
		binding := contracts.Binding{
			ID: bindingID, Trigger: contracts.BindingTrigger{Kind: "join", Mode: "all", Inputs: map[string]contracts.BindingInput{
				"source": {BindingID: root.ID, Output: "image"},
			}}, Handler: handler, Arguments: map[string]json.RawMessage{},
			Scheduling: contracts.SchedulingPolicy{Mode: "parallel", ConcurrencyGroup: bindingID, ConcurrencyLimit: 2},
			Outputs:    map[string]contracts.BindingOutput{"image": {}},
		}
		if bindingID != "manual-sibling" {
			binding.Materialization = &contracts.MaterializationPolicy{Retention: "lastSuccessful", Startup: "always"}
		}
		operations = append(operations,
			handlerSectionOperation(t, bindingID+"-handler", bindingID, bindingID, 860+float64(index*360), 4+index),
			setBindingOperation(t, binding),
		)
	}
	if _, err := coordinator.Apply(contracts.ApplyRequest{
		ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision, Operations: operations,
	}); err != nil {
		t.Fatalf("Apply(startup siblings) error = %v", err)
	}
}

func configureLargeStartupPipeline(t *testing.T, coordinator *Coordinator, nodeCount int) {
	t.Helper()
	projectSnapshot, err := coordinator.ProjectSnapshot()
	if err != nil {
		t.Fatalf("ProjectSnapshot() error = %v", err)
	}
	root := bindingByID(t, projectSnapshot, "stylize")
	root.Outputs = map[string]contracts.BindingOutput{"image": {}}
	root.Scheduling = contracts.SchedulingPolicy{Mode: "parallel", ConcurrencyGroup: "large-pipeline", ConcurrencyLimit: 1}
	operations := []json.RawMessage{setBindingOperation(t, root)}
	parentID := root.ID
	for index := 1; index < nodeCount; index++ {
		bindingID := fmt.Sprintf("large-step-%03d", index)
		binding := contracts.Binding{
			ID: bindingID, Trigger: contracts.BindingTrigger{Kind: "join", Mode: "all", Inputs: map[string]contracts.BindingInput{
				"source": {BindingID: parentID, Output: "image"},
			}}, Handler: fmt.Sprintf("large_step_%03d", index), Arguments: map[string]json.RawMessage{},
			Scheduling: contracts.SchedulingPolicy{Mode: "parallel", ConcurrencyGroup: "large-pipeline", ConcurrencyLimit: 1},
			Outputs:    map[string]contracts.BindingOutput{"image": {}},
		}
		if index == nodeCount-1 {
			binding.Materialization = &contracts.MaterializationPolicy{Retention: "lastSuccessful", Startup: "always"}
		}
		operations = append(operations,
			handlerSectionOperation(t, bindingID+"-handler", bindingID, bindingID, 860+float64(index*8), 4+index),
			setBindingOperation(t, binding),
		)
		parentID = bindingID
		if len(operations) >= 121 {
			projectSnapshot = applyPipelineOperations(t, coordinator, projectSnapshot, operations)
			operations = nil
		}
	}
	if len(operations) > 0 {
		applyPipelineOperations(t, coordinator, projectSnapshot, operations)
	}
}

func applyPipelineOperations(t *testing.T, coordinator *Coordinator, projectSnapshot contracts.Project, operations []json.RawMessage) contracts.Project {
	t.Helper()
	updated, err := coordinator.Apply(contracts.ApplyRequest{
		ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision, Operations: operations,
	})
	if err != nil {
		t.Fatalf("Apply(pipeline operations) error = %v", err)
	}
	return updated
}

func receiveInvocations(t *testing.T, started <-chan contracts.InvokeParams, count int) []contracts.InvokeParams {
	t.Helper()
	invocations := make([]contracts.InvokeParams, 0, count)
	for range count {
		invocations = append(invocations, receiveInvocation(t, started))
	}
	return invocations
}
