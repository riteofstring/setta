package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/setta/realtime/backend/internal/content"
	"github.com/setta/realtime/backend/internal/contracts"
)

func TestPipelineFanInIsIndependentOfBranchCompletionOrder(t *testing.T) {
	for _, firstBindingID := range []string{"stylize", "alternate"} {
		t.Run(firstBindingID, func(t *testing.T) {
			coordinator, worker := testCoordinator(t)
			defer coordinator.Close()
			configureFanInPipeline(t, coordinator, false, "parallel")
			if _, err := coordinator.Reload(context.Background()); err != nil {
				t.Fatalf("Reload() error = %v", err)
			}
			roots := startFanInRun(t, coordinator, worker)
			runID := roots["stylize"].Identity.RunID
			if runID == "" || roots["alternate"].Identity.RunID != runID {
				t.Fatalf("root run identities = %#v and %#v", roots["stylize"].Identity, roots["alternate"].Identity)
			}
			values := map[string]string{"stylize": `"left"`, "alternate": `"right"`}
			worker.reply(roots[firstBindingID].Identity.InvocationID, values[firstBindingID])
			waitForInvocationState(t, coordinator, roots[firstBindingID].Identity.InvocationID, "completed")
			assertNoWorkerInvocation(t, worker.started)
			secondBindingID := "stylize"
			if firstBindingID == secondBindingID {
				secondBindingID = "alternate"
			}
			worker.reply(roots[secondBindingID].Identity.InvocationID, values[secondBindingID])
			joined := receiveInvocation(t, worker.started)
			assertJoinedArguments(t, joined, runID, `"left"`, `"right"`)
			worker.reply(joined.Identity.InvocationID, `"combined"`)
			waitForRuntimeValue(t, coordinator, `"combined"`)
		})
	}
}

func TestPipelineInterleavedRunsNeverCrossPairOutputs(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	configureFanInPipeline(t, coordinator, false, "parallel")
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	first := startFanInRun(t, coordinator, worker)
	second := startFanInRun(t, coordinator, worker)
	worker.reply(first["stylize"].Identity.InvocationID, `"left-first"`)
	worker.reply(second["alternate"].Identity.InvocationID, `"right-second"`)
	waitForInvocationState(t, coordinator, first["stylize"].Identity.InvocationID, "completed")
	waitForInvocationState(t, coordinator, second["alternate"].Identity.InvocationID, "completed")
	assertNoWorkerInvocation(t, worker.started)
	worker.reply(first["alternate"].Identity.InvocationID, `"right-first"`)
	worker.reply(second["stylize"].Identity.InvocationID, `"left-second"`)
	want := map[string][2]string{
		first["stylize"].Identity.RunID:  {`"left-first"`, `"right-first"`},
		second["stylize"].Identity.RunID: {`"left-second"`, `"right-second"`},
	}
	for range 2 {
		joined := receiveInvocation(t, worker.started)
		values, exists := want[joined.Identity.RunID]
		if !exists {
			t.Fatalf("join run id = %q, want one of %#v", joined.Identity.RunID, want)
		}
		assertJoinedArguments(t, joined, joined.Identity.RunID, values[0], values[1])
		worker.reply(joined.Identity.InvocationID, `"combined"`)
		delete(want, joined.Identity.RunID)
	}
	if len(want) != 0 {
		t.Fatalf("unjoined runs = %#v", want)
	}
}

func TestPipelineBufferedStreamDoesNotReleaseJoinBeforeCompletion(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	configureFanInPipeline(t, coordinator, false, "parallel")
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	roots := startFanInRun(t, coordinator, worker)
	worker.reply(roots["alternate"].Identity.InvocationID, `"right"`)
	waitForInvocationState(t, coordinator, roots["alternate"].Identity.InvocationID, "completed")
	worker.finishWithUpdateCount(roots["stylize"].Identity.InvocationID, 1)
	time.Sleep(10 * time.Millisecond)
	assertInvocationState(t, coordinator, roots["stylize"].Identity.InvocationID, "running")
	assertNoWorkerInvocation(t, worker.started)
	coordinator.acceptUpdate(contracts.RuntimeUpdate{
		Identity: roots["stylize"].Identity, UpdateSequence: 1,
		Outputs: map[string]json.RawMessage{"image": json.RawMessage(`"streamed-left"`)}, Artifacts: []contracts.WorkerArtifact{},
	})
	joined := receiveInvocation(t, worker.started)
	assertJoinedArguments(t, joined, roots["stylize"].Identity.RunID, `"streamed-left"`, `"right"`)
	worker.reply(joined.Identity.InvocationID, `"combined"`)
}

func TestPipelineInvalidationIsRecursiveAndLeavesNoWaitingDescendants(t *testing.T) {
	t.Run("failure", func(t *testing.T) {
		coordinator, worker := testCoordinator(t)
		defer coordinator.Close()
		configureFanInPipeline(t, coordinator, true, "latest")
		if _, err := coordinator.Reload(context.Background()); err != nil {
			t.Fatalf("Reload() error = %v", err)
		}
		roots := startFanInRun(t, coordinator, worker)
		worker.replyError(roots["stylize"].Identity.InvocationID, "render_failed")
		waitForInvocationState(t, coordinator, roots["stylize"].Identity.InvocationID, "failed")
		assertRunBindingState(t, coordinator, roots["stylize"].Identity.RunID, "combine", "blocked")
		assertRunBindingState(t, coordinator, roots["stylize"].Identity.RunID, "finalize", "blocked")
		assertNoWorkerInvocation(t, worker.started)
		worker.finish(roots["alternate"].Identity.InvocationID)
	})

	t.Run("cancellation", func(t *testing.T) {
		coordinator, worker := testCoordinator(t)
		defer coordinator.Close()
		configureFanInPipeline(t, coordinator, true, "latest")
		if _, err := coordinator.Reload(context.Background()); err != nil {
			t.Fatalf("Reload() error = %v", err)
		}
		roots := startFanInRun(t, coordinator, worker)
		identity := roots["stylize"].Identity
		if err := coordinator.Cancel(contracts.RuntimeCancelRequest{Type: "cancel", Identity: identity}); err != nil {
			t.Fatalf("Cancel() error = %v", err)
		}
		assertInvocationState(t, coordinator, identity.InvocationID, "cancelled")
		assertRunBindingState(t, coordinator, identity.RunID, "combine", "blocked")
		assertRunBindingState(t, coordinator, identity.RunID, "finalize", "blocked")
		assertNoWorkerInvocation(t, worker.started)
		worker.finish(roots["alternate"].Identity.InvocationID)
	})

	t.Run("latest supersession", func(t *testing.T) {
		coordinator, worker := testCoordinator(t)
		defer coordinator.Close()
		configureFanInPipeline(t, coordinator, true, "latest")
		if _, err := coordinator.Reload(context.Background()); err != nil {
			t.Fatalf("Reload() error = %v", err)
		}
		first := startFanInRun(t, coordinator, worker)
		firstRunID := first["stylize"].Identity.RunID
		firstJoin := invocationForRunBinding(t, coordinator, firstRunID, "combine")
		firstTail := invocationForRunBinding(t, coordinator, firstRunID, "finalize")
		second := startFanInRun(t, coordinator, worker)
		assertInvocationState(t, coordinator, firstJoin.InvocationID, "superseded")
		assertInvocationState(t, coordinator, firstTail.InvocationID, "blocked")
		worker.finish(first["stylize"].Identity.InvocationID)
		worker.finish(first["alternate"].Identity.InvocationID)
		waitForInvocationState(t, coordinator, first["stylize"].Identity.InvocationID, "completed")
		waitForInvocationState(t, coordinator, first["alternate"].Identity.InvocationID, "completed")
		assertNoWorkerInvocation(t, worker.started)
		worker.reply(second["stylize"].Identity.InvocationID, `"left-second"`)
		worker.reply(second["alternate"].Identity.InvocationID, `"right-second"`)
		joined := receiveInvocation(t, worker.started)
		if joined.Identity.RunID != second["stylize"].Identity.RunID || joined.Identity.BindingID != "combine" {
			t.Fatalf("joined invocation = %#v", joined.Identity)
		}
		worker.reply(joined.Identity.InvocationID, `"combined"`)
		finalized := receiveInvocation(t, worker.started)
		if finalized.Identity.RunID != joined.Identity.RunID || finalized.Identity.BindingID != "finalize" {
			t.Fatalf("final invocation = %#v", finalized.Identity)
		}
		worker.reply(finalized.Identity.InvocationID, `"final"`)
	})
}

func TestPipelineReconnectSnapshotPreservesHandlersAndRunState(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	configureFanInPipeline(t, coordinator, false, "parallel")
	worker.reloadResult.Handlers = []string{"alternate", "combine", "stylize"}
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	roots := startFanInRun(t, coordinator, worker)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := coordinator.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	envelope := <-stream
	if envelope.Snapshot == nil {
		t.Fatal("subscription did not begin with a snapshot")
	}
	snapshot := envelope.Snapshot
	if len(snapshot.Handlers) != 3 || snapshot.Handlers[0] != "alternate" || snapshot.Handlers[1] != "combine" || snapshot.Handlers[2] != "stylize" {
		t.Fatalf("snapshot handlers = %#v", snapshot.Handlers)
	}
	runID := roots["stylize"].Identity.RunID
	for _, bindingID := range []string{"stylize", "alternate"} {
		identity := roots[bindingID].Identity
		if identity.RunID != runID || snapshot.Invocations[identity.InvocationID].State != "running" {
			t.Fatalf("root %q snapshot state = %#v", bindingID, snapshot.Invocations[identity.InvocationID])
		}
	}
	join := invocationForSnapshotRunBinding(t, *snapshot, runID, "combine")
	if join.State != "waiting" {
		t.Fatalf("join state = %q, want waiting", join.State)
	}
}

func TestPipelineReclaimsIntermediateContentAfterConsumersComplete(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	configureFanInPipeline(t, coordinator, false, "parallel")
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	source, err := coordinator.content.Put("browser-source", "image/png", bytes.NewBufferString("drawing"))
	if err != nil {
		t.Fatalf("content.Put() error = %v", err)
	}
	payload, err := json.Marshal(map[string]contracts.ContentReference{"contentRef": source})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	accepted, err := coordinator.HandleEvent(pipelineRuntimeEvent(snapshot.SessionID, "interaction", payload))
	if err != nil || accepted != 2 {
		t.Fatalf("HandleEvent() = %d, %v", accepted, err)
	}
	if reader, openErr := coordinator.content.Open(source); reader != nil || !errors.Is(openErr, content.ErrNotFound) {
		if reader != nil {
			_ = reader.Close()
		}
		t.Fatalf("original content open error = %v, want not found", openErr)
	}
	roots := receiveFanInRoots(t, worker)
	producerReference := roots["stylize"].Content[0]
	encoded, err := json.Marshal(producerReference)
	if err != nil {
		t.Fatalf("json.Marshal(reference) error = %v", err)
	}
	worker.reply(roots["stylize"].Identity.InvocationID, string(encoded))
	worker.reply(roots["alternate"].Identity.InvocationID, `"right"`)
	joined := receiveInvocation(t, worker.started)
	var consumerReference contracts.ContentReference
	if err := contracts.DecodeStrict(joined.Arguments["left"], &consumerReference); err != nil {
		t.Fatalf("DecodeStrict(join input) error = %v", err)
	}
	if consumerReference.InvocationID != joined.Identity.InvocationID || consumerReference.ID == producerReference.ID {
		t.Fatalf("consumer reference = %#v, producer = %#v", consumerReference, producerReference)
	}
	worker.reply(joined.Identity.InvocationID, `"combined"`)
	waitForInvocationState(t, coordinator, joined.Identity.InvocationID, "completed")
	for name, reference := range map[string]contracts.ContentReference{"producer": producerReference, "consumer": consumerReference} {
		reader, openErr := coordinator.content.Open(reference)
		if reader != nil {
			_ = reader.Close()
		}
		if !errors.Is(openErr, content.ErrNotFound) {
			t.Fatalf("%s content open error = %v, want not found", name, openErr)
		}
	}
}

func TestPipelineRejectsUpdateSequenceGapsWithoutStrandingInvocation(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	invocation := startDrawingInvocation(t, coordinator, worker)
	coordinator.acceptUpdate(contracts.RuntimeUpdate{
		Identity: invocation.Identity, UpdateSequence: 2,
		Outputs: map[string]json.RawMessage{"image": json.RawMessage(`"invalid"`)}, Artifacts: []contracts.WorkerArtifact{},
	})
	waitForInvocationState(t, coordinator, invocation.Identity.InvocationID, "failed")
	snapshot, err := coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	status := snapshot.Invocations[invocation.Identity.InvocationID]
	if status.Error == nil || status.Error.Code != "worker_protocol" {
		t.Fatalf("protocol failure = %#v", status)
	}
}

func TestPipelineStartupAdoptsMatchingMaterializationIntoRunLineage(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	configureFanInPipeline(t, coordinator, false, "parallel")
	setPipelineMaterialization(t, coordinator, "stylize", "whenStale")
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload(first) error = %v", err)
	}
	first := startFanInRun(t, coordinator, worker)
	worker.reply(first["stylize"].Identity.InvocationID, `"saved-left"`)
	worker.reply(first["alternate"].Identity.InvocationID, `"first-right"`)
	firstJoin := receiveInvocation(t, worker.started)
	worker.reply(firstJoin.Identity.InvocationID, `"first-combined"`)
	waitForInvocationState(t, coordinator, firstJoin.Identity.InvocationID, "completed")
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload(second) error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := coordinator.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	<-stream
	snapshot, _ := coordinator.Snapshot()
	accepted, err := coordinator.HandleEvent(pipelineRuntimeEvent(snapshot.SessionID, "startup", json.RawMessage(`{"contentRef":"frame"}`)))
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent(startup) = %d, %v", accepted, err)
	}
	right := receiveInvocation(t, worker.started)
	if right.Identity.BindingID != "alternate" {
		t.Fatalf("startup worker invocation = %#v, want alternate", right.Identity)
	}
	adopted := invocationForRunBinding(t, coordinator, right.Identity.RunID, "stylize")
	assertInvocationState(t, coordinator, adopted.InvocationID, "completed")
	update := receiveRuntimeEnvelope(t, stream, func(envelope contracts.RuntimeEnvelope) bool {
		return envelope.Update != nil && envelope.Update.Identity == adopted
	})
	if update.Update.UpdateSequence != 1 || string(update.Update.Outputs["image"]) != `"saved-left"` {
		t.Fatalf("adopted update = %#v", update.Update)
	}
	worker.reply(right.Identity.InvocationID, `"startup-right"`)
	joined := receiveInvocation(t, worker.started)
	assertJoinedArguments(t, joined, right.Identity.RunID, `"saved-left"`, `"startup-right"`)
	worker.reply(joined.Identity.InvocationID, `"startup-combined"`)
}

func TestPipelineStaleIfMissingAncestorBlocksStartupDescendants(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	configureFanInPipeline(t, coordinator, true, "latest")
	setPipelineMaterialization(t, coordinator, "stylize", "ifMissing")
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload(first) error = %v", err)
	}
	firstSnapshot, _ := coordinator.Snapshot()
	accepted, err := coordinator.HandleEvent(pipelineRuntimeEvent(firstSnapshot.SessionID, "interaction", json.RawMessage(`{"contentRef":"old"}`)))
	if err != nil || accepted != 2 {
		t.Fatalf("HandleEvent(first) = %d, %v", accepted, err)
	}
	first := receiveFanInRoots(t, worker)
	worker.reply(first["stylize"].Identity.InvocationID, `"saved-left"`)
	worker.reply(first["alternate"].Identity.InvocationID, `"first-right"`)
	joined := receiveInvocation(t, worker.started)
	worker.reply(joined.Identity.InvocationID, `"combined"`)
	finalized := receiveInvocation(t, worker.started)
	worker.reply(finalized.Identity.InvocationID, `"final"`)
	waitForInvocationState(t, coordinator, finalized.Identity.InvocationID, "completed")
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload(second) error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	accepted, err = coordinator.HandleEvent(pipelineRuntimeEvent(snapshot.SessionID, "startup", json.RawMessage(`{"contentRef":"changed"}`)))
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent(stale) = %d, %v", accepted, err)
	}
	right := receiveInvocation(t, worker.started)
	if right.Identity.BindingID != "alternate" {
		t.Fatalf("stale startup invocation = %#v", right.Identity)
	}
	assertRunBindingState(t, coordinator, right.Identity.RunID, "stylize", "blocked")
	assertRunBindingState(t, coordinator, right.Identity.RunID, "combine", "blocked")
	assertRunBindingState(t, coordinator, right.Identity.RunID, "finalize", "blocked")
	assertNoWorkerInvocation(t, worker.started)
	worker.finish(right.Identity.InvocationID)
}

func TestPipelineStartupRetriesAutomaticDescendantWhenAncestorChanges(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	configureFanInPipeline(t, coordinator, false, "parallel")
	setPipelineMaterialization(t, coordinator, "combine", "always")
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	accepted, err := coordinator.HandleEvent(pipelineRuntimeEvent(snapshot.SessionID, "startup", json.RawMessage(`{"contentRef":"first"}`)))
	if err != nil || accepted != 2 {
		t.Fatalf("HandleEvent(first startup) = %d, %v", accepted, err)
	}
	first := receiveFanInRoots(t, worker)
	worker.reply(first["stylize"].Identity.InvocationID, `"first-left"`)
	worker.reply(first["alternate"].Identity.InvocationID, `"first-right"`)
	firstJoin := receiveInvocation(t, worker.started)
	worker.reply(firstJoin.Identity.InvocationID, `"first-combined"`)
	waitForInvocationState(t, coordinator, firstJoin.Identity.InvocationID, "completed")
	projectSnapshot, err := coordinator.ProjectSnapshot()
	if err != nil {
		t.Fatalf("ProjectSnapshot() error = %v", err)
	}
	ancestor := bindingByID(t, projectSnapshot, "stylize")
	ancestor.Handler = "stylize_v2"
	if _, err := coordinator.Apply(contracts.ApplyRequest{
		ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision,
		Operations: []json.RawMessage{setBindingOperation(t, ancestor)},
	}); err != nil {
		t.Fatalf("Apply(ancestor) error = %v", err)
	}
	accepted, err = coordinator.HandleEvent(pipelineRuntimeEvent(snapshot.SessionID, "startup", json.RawMessage(`{"contentRef":"second"}`)))
	if err != nil || accepted != 2 {
		t.Fatalf("HandleEvent(second startup) = %d, %v", accepted, err)
	}
	second := receiveFanInRoots(t, worker)
	worker.reply(second["stylize"].Identity.InvocationID, `"second-left"`)
	worker.reply(second["alternate"].Identity.InvocationID, `"second-right"`)
	secondJoin := receiveInvocation(t, worker.started)
	worker.reply(secondJoin.Identity.InvocationID, `"second-combined"`)
}

func TestPipelineApplyClearsRemovedTargetPublicationAndContent(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	invocation := startDrawingInvocation(t, coordinator, worker)
	reference, err := coordinator.content.Put(invocation.Identity.InvocationID, "image/png", bytes.NewBufferString("published"))
	if err != nil {
		t.Fatalf("content.Put() error = %v", err)
	}
	encoded, err := json.Marshal(reference)
	if err != nil {
		t.Fatalf("json.Marshal(reference) error = %v", err)
	}
	worker.reply(invocation.Identity.InvocationID, string(encoded))
	waitForInvocationState(t, coordinator, invocation.Identity.InvocationID, "completed")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := coordinator.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	<-stream
	projectSnapshot, err := coordinator.ProjectSnapshot()
	if err != nil {
		t.Fatalf("ProjectSnapshot() error = %v", err)
	}
	binding := bindingByID(t, projectSnapshot, "stylize")
	binding.Outputs["image"] = contracts.BindingOutput{}
	if _, err := coordinator.Apply(contracts.ApplyRequest{
		ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision,
		Operations: []json.RawMessage{setBindingOperation(t, binding)},
	}); err != nil {
		t.Fatalf("Apply(target removal) error = %v", err)
	}
	envelope := receiveRuntimeEnvelope(t, stream, func(envelope contracts.RuntimeEnvelope) bool {
		return envelope.Snapshot != nil
	})
	if _, exists := envelope.Snapshot.Values["result.contentRef"]; exists {
		t.Fatalf("runtime values = %#v", envelope.Snapshot.Values)
	}
	if _, exists := envelope.Snapshot.PublishedByBinding["stylize"]; exists {
		t.Fatalf("published identities = %#v", envelope.Snapshot.PublishedByBinding)
	}
	reader, openErr := coordinator.content.Open(reference)
	if reader != nil {
		_ = reader.Close()
	}
	if !errors.Is(openErr, content.ErrNotFound) {
		t.Fatalf("removed target content open error = %v, want not found", openErr)
	}
}

func TestPipelineCloseCancelsRunsAndReclaimsContent(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	configureFanInPipeline(t, coordinator, false, "parallel")
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	source, err := coordinator.content.Put("browser-close", "image/png", bytes.NewBufferString("drawing"))
	if err != nil {
		t.Fatalf("content.Put() error = %v", err)
	}
	payload, err := json.Marshal(map[string]contracts.ContentReference{"contentRef": source})
	if err != nil {
		t.Fatalf("json.Marshal(payload) error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	if _, err := coordinator.HandleEvent(pipelineRuntimeEvent(snapshot.SessionID, "interaction", payload)); err != nil {
		t.Fatalf("HandleEvent() error = %v", err)
	}
	roots := receiveFanInRoots(t, worker)
	runID := roots["stylize"].Identity.RunID
	references := []contracts.ContentReference{roots["stylize"].Content[0], roots["alternate"].Content[0]}
	if err := coordinator.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	coordinator.mu.Lock()
	remainingRuns := len(coordinator.runs)
	states := map[string]string{}
	for _, status := range coordinator.invocations {
		if status.Identity.RunID == runID {
			states[status.Identity.BindingID] = status.State
		}
	}
	coordinator.mu.Unlock()
	if remainingRuns != 0 {
		t.Fatalf("remaining runs = %d", remainingRuns)
	}
	for _, bindingID := range []string{"stylize", "alternate", "combine"} {
		if states[bindingID] != "cancelled" {
			t.Fatalf("binding %q state = %q, want cancelled", bindingID, states[bindingID])
		}
	}
	for _, reference := range references {
		reader, openErr := coordinator.content.Open(reference)
		if reader != nil {
			_ = reader.Close()
		}
		if !errors.Is(openErr, content.ErrNotFound) {
			t.Fatalf("runtime content open error = %v, want not found", openErr)
		}
	}
}

func TestPipelineBindingApplyInvalidatesExistingRun(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	configureFanInPipeline(t, coordinator, true, "latest")
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	roots := startFanInRun(t, coordinator, worker)
	runID := roots["stylize"].Identity.RunID
	projectSnapshot, err := coordinator.ProjectSnapshot()
	if err != nil {
		t.Fatalf("ProjectSnapshot() error = %v", err)
	}
	var combine contracts.Binding
	for _, binding := range projectSnapshot.Bindings {
		if binding.ID == "combine" {
			combine = binding
		}
	}
	combine.Handler = "combine_v2"
	if _, err := coordinator.Apply(contracts.ApplyRequest{
		ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision,
		Operations: []json.RawMessage{setBindingOperation(t, combine)},
	}); err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	for _, bindingID := range []string{"stylize", "alternate", "combine", "finalize"} {
		assertRunBindingState(t, coordinator, runID, bindingID, "cancelled")
	}
}

func bindingByID(t *testing.T, projectSnapshot contracts.Project, bindingID string) contracts.Binding {
	t.Helper()
	for _, binding := range projectSnapshot.Bindings {
		if binding.ID == bindingID {
			return binding
		}
	}
	t.Fatalf("binding %q was not found", bindingID)
	return contracts.Binding{}
}

func configureFanInPipeline(t *testing.T, coordinator *Coordinator, withTail bool, combineMode string) {
	t.Helper()
	projectSnapshot, err := coordinator.ProjectSnapshot()
	if err != nil {
		t.Fatalf("ProjectSnapshot() error = %v", err)
	}
	left := projectSnapshot.Bindings[0]
	left.Scheduling = contracts.SchedulingPolicy{Mode: "parallel", ConcurrencyGroup: "left", ConcurrencyLimit: 2}
	left.Outputs = map[string]contracts.BindingOutput{"image": {}}
	right := contracts.Binding{
		ID: "alternate", Trigger: contracts.BindingTrigger{Kind: "event", SectionID: "drawing", Event: "snapshot"}, Handler: "alternate",
		Arguments:  map[string]json.RawMessage{"drawing": json.RawMessage(`"$event.contentRef"`)},
		Scheduling: contracts.SchedulingPolicy{Mode: "parallel", ConcurrencyGroup: "right", ConcurrencyLimit: 2},
		Outputs:    map[string]contracts.BindingOutput{"image": {}},
	}
	combineLimit := 2
	if combineMode == "latest" {
		combineLimit = 1
	}
	combine := contracts.Binding{
		ID: "combine", Trigger: contracts.BindingTrigger{Kind: "join", Mode: "all", Inputs: map[string]contracts.BindingInput{
			"left": {BindingID: "stylize", Output: "image"}, "right": {BindingID: "alternate", Output: "image"},
		}}, Handler: "combine", Arguments: map[string]json.RawMessage{},
		Scheduling: contracts.SchedulingPolicy{Mode: combineMode, ConcurrencyGroup: "combine", ConcurrencyLimit: combineLimit},
		Outputs:    map[string]contracts.BindingOutput{"image": {Target: &contracts.BindingOutputTarget{SectionID: "result", Field: "contentRef"}}},
	}
	operations := []json.RawMessage{
		handlerSectionOperation(t, "alternate-handler", "Alternate", "alternate", 860, 4),
		handlerSectionOperation(t, "combine-handler", "Combine", "combine", 1220, 5),
		setBindingOperation(t, left), setBindingOperation(t, right), setBindingOperation(t, combine),
	}
	if withTail {
		finalize := contracts.Binding{
			ID: "finalize", Trigger: contracts.BindingTrigger{Kind: "join", Mode: "all", Inputs: map[string]contracts.BindingInput{
				"combined": {BindingID: "combine", Output: "image"},
			}}, Handler: "finalize", Arguments: map[string]json.RawMessage{},
			Scheduling: contracts.SchedulingPolicy{Mode: "latest", ConcurrencyGroup: "finalize", ConcurrencyLimit: 1},
			Outputs:    map[string]contracts.BindingOutput{"image": {Target: &contracts.BindingOutputTarget{SectionID: "result", Field: "contentRef"}}},
		}
		operations = append(operations, handlerSectionOperation(t, "finalize-handler", "Finalize", "finalize", 1580, 6), setBindingOperation(t, finalize))
	}
	if _, err := coordinator.Apply(contracts.ApplyRequest{
		ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision, Operations: operations,
	}); err != nil {
		t.Fatalf("Apply(pipeline) error = %v", err)
	}
}

func setPipelineMaterialization(t *testing.T, coordinator *Coordinator, bindingID string, startup string) {
	t.Helper()
	projectSnapshot, err := coordinator.ProjectSnapshot()
	if err != nil {
		t.Fatalf("ProjectSnapshot() error = %v", err)
	}
	for _, binding := range projectSnapshot.Bindings {
		if binding.ID != bindingID {
			continue
		}
		binding.Materialization = &contracts.MaterializationPolicy{Retention: "lastSuccessful", Startup: startup}
		if _, err := coordinator.Apply(contracts.ApplyRequest{
			ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision,
			Operations: []json.RawMessage{setBindingOperation(t, binding)},
		}); err != nil {
			t.Fatalf("Apply(materialization) error = %v", err)
		}
		return
	}
	t.Fatalf("binding %q was not found", bindingID)
}

func handlerSectionOperation(t *testing.T, sectionID string, name string, bindingID string, x float64, zIndex int) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(contracts.HandlerSectionData{BindingID: bindingID})
	if err != nil {
		t.Fatalf("json.Marshal(handler data) error = %v", err)
	}
	width := 320.0
	height := 180.0
	operation := contracts.UpsertSectionOperation{
		Operation: "upsertSection",
		Section: contracts.Section{
			ID: sectionID, Kind: "handler", Name: name, Width: contracts.SizeValue{Value: width}, Height: contracts.SizeValue{Value: height}, Children: []string{}, Data: data,
		},
		Layout: &contracts.TopLevelSectionLayout{X: x, Y: 360, Width: &width, Height: &height, ZIndex: zIndex},
	}
	encoded, err := json.Marshal(operation)
	if err != nil {
		t.Fatalf("json.Marshal(handler operation) error = %v", err)
	}
	return encoded
}

func setBindingOperation(t *testing.T, binding contracts.Binding) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(contracts.SetBindingOperation{Operation: "setBinding", Binding: binding})
	if err != nil {
		t.Fatalf("json.Marshal(binding operation) error = %v", err)
	}
	return encoded
}

func startFanInRun(t *testing.T, coordinator *Coordinator, worker *fakeWorker) map[string]contracts.InvokeParams {
	t.Helper()
	snapshot, err := coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	accepted, err := coordinator.HandleEvent(pipelineRuntimeEvent(snapshot.SessionID, "interaction", json.RawMessage(`{"contentRef":"frame"}`)))
	if err != nil || accepted != 2 {
		t.Fatalf("HandleEvent() = %d, %v", accepted, err)
	}
	return receiveFanInRoots(t, worker)
}

func pipelineRuntimeEvent(sessionID string, cause string, payload json.RawMessage) contracts.RuntimeEvent {
	return contracts.RuntimeEvent{Type: "event", Cause: cause, SessionID: sessionID, SectionID: "drawing", Event: "snapshot", Payload: payload}
}

func receiveFanInRoots(t *testing.T, worker *fakeWorker) map[string]contracts.InvokeParams {
	t.Helper()
	roots := make(map[string]contracts.InvokeParams)
	for range 2 {
		invocation := receiveInvocation(t, worker.started)
		if invocation.Identity.BindingID != "stylize" && invocation.Identity.BindingID != "alternate" {
			t.Fatalf("root invocation = %#v", invocation.Identity)
		}
		roots[invocation.Identity.BindingID] = invocation
	}
	if len(roots) != 2 {
		t.Fatalf("root invocations = %#v", roots)
	}
	return roots
}

func assertJoinedArguments(t *testing.T, invocation contracts.InvokeParams, runID string, left string, right string) {
	t.Helper()
	if invocation.Identity.BindingID != "combine" || invocation.Identity.RunID != runID {
		t.Fatalf("join identity = %#v", invocation.Identity)
	}
	if string(invocation.Arguments["left"]) != left || string(invocation.Arguments["right"]) != right {
		t.Fatalf("join arguments = %#v, want left %s and right %s", invocation.Arguments, left, right)
	}
}

func assertNoWorkerInvocation(t *testing.T, started <-chan contracts.InvokeParams) {
	t.Helper()
	select {
	case invocation := <-started:
		t.Fatalf("unexpected invocation = %#v", invocation.Identity)
	case <-time.After(25 * time.Millisecond):
	}
}

func invocationForRunBinding(t *testing.T, coordinator *Coordinator, runID string, bindingID string) contracts.InvocationIdentity {
	t.Helper()
	snapshot, err := coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	return invocationForSnapshotRunBinding(t, snapshot, runID, bindingID).Identity
}

func invocationForSnapshotRunBinding(t *testing.T, snapshot contracts.RuntimeSnapshot, runID string, bindingID string) contracts.InvocationStatus {
	t.Helper()
	for _, status := range snapshot.Invocations {
		if status.Identity.RunID == runID && status.Identity.BindingID == bindingID {
			return status
		}
	}
	t.Fatalf("invocation for run %q and binding %q was not found", runID, bindingID)
	return contracts.InvocationStatus{}
}

func assertRunBindingState(t *testing.T, coordinator *Coordinator, runID string, bindingID string, state string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		snapshot, err := coordinator.Snapshot()
		if err == nil {
			status := invocationForSnapshotRunBinding(t, snapshot, runID, bindingID)
			if status.State == state {
				return
			}
		}
		time.Sleep(time.Millisecond)
	}
	snapshot, _ := coordinator.Snapshot()
	status := invocationForSnapshotRunBinding(t, snapshot, runID, bindingID)
	t.Fatalf("binding %q state = %q, want %q", bindingID, status.State, state)
}
