package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/setta/realtime/backend/internal/content"
	"github.com/setta/realtime/backend/internal/contracts"
	"github.com/setta/realtime/backend/internal/project"
	"github.com/setta/realtime/backend/internal/source"
	"github.com/setta/realtime/backend/internal/worker"
)

type fakeWorker struct {
	mu                      sync.Mutex
	updates                 chan contracts.RuntimeUpdate
	started                 chan contracts.InvokeParams
	replies                 map[string]chan contracts.InvokeResult
	reloadResult            contracts.InitializeResult
	reloadErr               error
	reloads                 []contracts.RuntimeDeclaration
	stops                   int
	cooperativeCancellation bool
	closed                  bool
}

func newFakeWorker() *fakeWorker {
	return &fakeWorker{
		updates: make(chan contracts.RuntimeUpdate, 16), started: make(chan contracts.InvokeParams, 128), replies: make(map[string]chan contracts.InvokeResult),
		reloadResult: contracts.InitializeResult{ProtocolVersion: contracts.WorkerProtocolVersion, RuntimeKind: "python", Handlers: []string{"stylize"}},
	}
}

func (worker *fakeWorker) Reload(_ context.Context, _ string, declaration contracts.RuntimeDeclaration) (contracts.InitializeResult, error) {
	worker.mu.Lock()
	defer worker.mu.Unlock()
	worker.reloads = append(worker.reloads, declaration)
	return worker.reloadResult, worker.reloadErr
}

func (worker *fakeWorker) Stop() error {
	worker.mu.Lock()
	defer worker.mu.Unlock()
	worker.stops++
	return nil
}

func (worker *fakeWorker) Invoke(ctx context.Context, params contracts.InvokeParams) (contracts.InvokeResult, error) {
	reply := make(chan contracts.InvokeResult, 1)
	worker.mu.Lock()
	worker.replies[params.Identity.InvocationID] = reply
	cooperativeCancellation := worker.cooperativeCancellation
	worker.mu.Unlock()
	worker.started <- params
	if cooperativeCancellation {
		return <-reply, nil
	}
	select {
	case <-ctx.Done():
		return contracts.InvokeResult{}, ctx.Err()
	case result := <-reply:
		return result, nil
	}
}

func (worker *fakeWorker) Updates() <-chan contracts.RuntimeUpdate { return worker.updates }

func (worker *fakeWorker) Close() error {
	worker.mu.Lock()
	defer worker.mu.Unlock()
	if !worker.closed {
		worker.closed = true
		close(worker.updates)
	}
	return nil
}

func (worker *fakeWorker) reply(invocationID string, value string) {
	worker.replyOutputs(invocationID, map[string]json.RawMessage{"image": json.RawMessage(value)}, 0)
}

func (worker *fakeWorker) replyOutputs(invocationID string, outputs map[string]json.RawMessage, updateCount uint64) {
	worker.mu.Lock()
	channel := worker.replies[invocationID]
	worker.mu.Unlock()
	channel <- contracts.InvokeResult{Outputs: outputs, UpdateCount: updateCount}
}

func (worker *fakeWorker) finishWithUpdateCount(invocationID string, updateCount uint64) {
	worker.mu.Lock()
	channel := worker.replies[invocationID]
	worker.mu.Unlock()
	channel <- contracts.InvokeResult{Outputs: map[string]json.RawMessage{}, UpdateCount: updateCount}
}

func (worker *fakeWorker) replyError(invocationID string, code string) {
	worker.mu.Lock()
	channel := worker.replies[invocationID]
	worker.mu.Unlock()
	channel <- contracts.InvokeResult{Outputs: map[string]json.RawMessage{}, Error: &contracts.StructuredError{Code: code, Message: code}}
}

func (worker *fakeWorker) finish(invocationID string) {
	worker.mu.Lock()
	channel := worker.replies[invocationID]
	worker.mu.Unlock()
	channel <- contracts.InvokeResult{Outputs: map[string]json.RawMessage{}}
}

func TestLatestBindingPublishesRunningResultAndStaysBounded(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	for index := 0; index < 100; index++ {
		payload := json.RawMessage(`{"contentRef":"frame-` + string(rune('a'+index%26)) + `"}`)
		_, err := coordinator.HandleEvent(contracts.RuntimeEvent{Type: "event", Cause: "interaction", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: payload})
		if err != nil {
			t.Fatalf("HandleEvent(%d) error = %v", index, err)
		}
	}
	if pending := coordinator.scheduler.Pending(); pending > 2 {
		t.Fatalf("scheduler pending = %d, want at most active plus latest", pending)
	}
	if current, err := coordinator.Snapshot(); err != nil || len(current.Invocations) > 7 {
		t.Fatalf("runtime invocation history = %d, error = %v", len(current.Invocations), err)
	}
	first := receiveInvocation(t, worker.started)
	worker.reply(first.Identity.InvocationID, `"old"`)
	newest := receiveInvocation(t, worker.started)
	current, err := coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if value := string(current.Values["result.contentRef"]); value != `"old"` {
		t.Fatalf("running invocation result = %s, want old", value)
	}
	if published := current.PublishedByBinding["stylize"]; published != first.Identity {
		t.Fatalf("published identity = %#v, want %#v", published, first.Identity)
	}
	worker.reply(newest.Identity.InvocationID, `"new"`)
	deadline := time.Now().Add(time.Second)
	for {
		current, err = coordinator.Snapshot()
		if err != nil {
			t.Fatalf("Snapshot() error = %v", err)
		}
		if string(current.Values["result.contentRef"]) == `"new"` {
			if published := current.PublishedByBinding["stylize"]; published != newest.Identity {
				t.Fatalf("published identity = %#v, want %#v", published, newest.Identity)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("runtime values = %#v", current.Values)
		}
		time.Sleep(time.Millisecond)
	}
}

func TestSubscriptionBeginsWithCompleteCurrentRuntimeSnapshot(t *testing.T) {
	coordinator, _ := testCoordinator(t)
	defer coordinator.Close()
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := coordinator.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	envelope := <-stream
	if envelope.Type != "snapshot" || envelope.Snapshot == nil || envelope.Snapshot.WorkerState != "ready" || envelope.Snapshot.SessionID == "" || envelope.Snapshot.PublishedByBinding == nil {
		t.Fatalf("initial envelope = %#v", envelope)
	}
}

func TestSuccessfulReturnPublishesFinalBrowserUpdate(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := coordinator.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	<-stream
	snapshot, _ := coordinator.Snapshot()
	event := contracts.RuntimeEvent{Type: "event", Cause: "interaction", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: json.RawMessage(`{"contentRef":"frame"}`)}
	if _, err := coordinator.HandleEvent(event); err != nil {
		t.Fatalf("HandleEvent() error = %v", err)
	}
	invocation := receiveInvocation(t, worker.started)
	if invocation.Content == nil {
		t.Fatal("invocation content is nil")
	}
	worker.reply(invocation.Identity.InvocationID, `"final"`)
	envelope := receiveRuntimeEnvelope(t, stream, func(envelope contracts.RuntimeEnvelope) bool {
		return envelope.Type == "update"
	})
	if envelope.Update == nil || envelope.Update.Identity != invocation.Identity || envelope.Update.UpdateSequence != 1 || string(envelope.Update.Outputs["image"]) != `"final"` {
		t.Fatalf("final update = %#v", envelope.Update)
	}
	current, err := coordinator.Snapshot()
	if err != nil || current.PublishedByBinding["stylize"] != invocation.Identity {
		t.Fatalf("published identity = %#v, error = %v", current.PublishedByBinding["stylize"], err)
	}
	receiveRuntimeEnvelope(t, stream, func(envelope contracts.RuntimeEnvelope) bool {
		return envelope.Invocation != nil && envelope.Invocation.Identity == invocation.Identity && envelope.Invocation.State == "completed"
	})
}

func TestLatestBindingStreamsWhileNewerInvocationIsPending(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	event := contracts.RuntimeEvent{Type: "event", Cause: "interaction", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: json.RawMessage(`{"contentRef":"frame"}`)}
	if _, err := coordinator.HandleEvent(event); err != nil {
		t.Fatalf("HandleEvent(first) error = %v", err)
	}
	first := receiveInvocation(t, worker.started)
	if _, err := coordinator.HandleEvent(event); err != nil {
		t.Fatalf("HandleEvent(second) error = %v", err)
	}
	progress := 0.5
	coordinator.acceptUpdate(contracts.RuntimeUpdate{
		Identity: first.Identity, UpdateSequence: 1, Progress: &progress, Message: "Preview",
		Outputs: map[string]json.RawMessage{"image": json.RawMessage(`"streamed"`)}, Artifacts: []contracts.WorkerArtifact{},
	})
	current, err := coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if value := string(current.Values["result.contentRef"]); value != `"streamed"` {
		t.Fatalf("streamed value = %s", value)
	}
	if published := current.PublishedByBinding["stylize"]; published != first.Identity {
		t.Fatalf("published identity = %#v, want %#v", published, first.Identity)
	}
	worker.finish(first.Identity.InvocationID)
	second := receiveInvocation(t, worker.started)
	worker.finish(second.Identity.InvocationID)
}

func TestProgressOnlyUpdateDoesNotAdvancePublishedOutput(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	invocation := startDrawingInvocation(t, coordinator, worker)
	progress := 0.5
	coordinator.acceptUpdate(contracts.RuntimeUpdate{
		Identity: invocation.Identity, UpdateSequence: 1, Progress: &progress, Message: "Working",
		Outputs: map[string]json.RawMessage{}, Artifacts: []contracts.WorkerArtifact{},
	})
	snapshot, err := coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if len(snapshot.PublishedByBinding) != 0 {
		t.Fatalf("published identities = %#v, want empty", snapshot.PublishedByBinding)
	}
	worker.finish(invocation.Identity.InvocationID)
}

func TestOlderParallelOutputCannotReplaceNewerPublishedOutput(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	configureBindingScheduling(t, coordinator, "parallel", 2)
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	event := contracts.RuntimeEvent{Type: "event", Cause: "interaction", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: json.RawMessage(`{"contentRef":"frame"}`)}
	for index := 0; index < 2; index++ {
		if _, err := coordinator.HandleEvent(event); err != nil {
			t.Fatalf("HandleEvent(%d) error = %v", index, err)
		}
	}
	left := receiveInvocation(t, worker.started)
	right := receiveInvocation(t, worker.started)
	older, newer := left, right
	if older.Identity.Sequence > newer.Identity.Sequence {
		older, newer = newer, older
	}
	coordinator.acceptUpdate(contracts.RuntimeUpdate{
		Identity: newer.Identity, UpdateSequence: 1, Outputs: map[string]json.RawMessage{"image": json.RawMessage(`"new"`)}, Artifacts: []contracts.WorkerArtifact{},
	})
	coordinator.acceptUpdate(contracts.RuntimeUpdate{
		Identity: older.Identity, UpdateSequence: 1, Outputs: map[string]json.RawMessage{"image": json.RawMessage(`"old"`)}, Artifacts: []contracts.WorkerArtifact{},
	})
	current, err := coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if value := string(current.Values["result.contentRef"]); value != `"new"` {
		t.Fatalf("runtime value = %s, want new", value)
	}
	if published := current.PublishedByBinding["stylize"]; published != newer.Identity {
		t.Fatalf("published identity = %#v, want %#v", published, newer.Identity)
	}
	worker.finish(older.Identity.InvocationID)
	worker.finish(newer.Identity.InvocationID)
}

func TestSubscriptionSnapshotRecoversPublishedOutputIdentity(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	invocation := startDrawingInvocation(t, coordinator, worker)
	coordinator.acceptUpdate(contracts.RuntimeUpdate{
		Identity: invocation.Identity, UpdateSequence: 1, Outputs: map[string]json.RawMessage{"image": json.RawMessage(`"preview"`)}, Artifacts: []contracts.WorkerArtifact{},
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := coordinator.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	envelope := <-stream
	if envelope.Snapshot == nil || envelope.Snapshot.PublishedByBinding["stylize"] != invocation.Identity {
		t.Fatalf("subscription snapshot = %#v", envelope.Snapshot)
	}
	if value := string(envelope.Snapshot.Values["result.contentRef"]); value != `"preview"` {
		t.Fatalf("subscription value = %s", value)
	}
	worker.finish(invocation.Identity.InvocationID)
}

func TestDirectInvokeRequiresExplicitReload(t *testing.T) {
	coordinator, _ := testCoordinator(t)
	defer coordinator.Close()
	_, err := coordinator.Invoke(context.Background(), "stylize", contracts.DirectInvokeRequest{Arguments: map[string]json.RawMessage{}, Content: []contracts.ContentReference{}})
	if err != ErrWorkerNotReady {
		t.Fatalf("Invoke() error = %v, want worker not ready", err)
	}
}

func TestRuntimeSourceApplySavesThenReloadsAndPublishesLifecycle(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	if err := os.WriteFile(filepath.Join(coordinator.projectRoot, "app.py"), []byte("handlers = {}\n"), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	document, err := coordinator.RuntimeSource()
	if err != nil {
		t.Fatalf("RuntimeSource() error = %v", err)
	}
	projectBefore, err := coordinator.ProjectSnapshot()
	if err != nil {
		t.Fatalf("ProjectSnapshot(before) error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stream, err := coordinator.Subscribe(ctx)
	if err != nil {
		t.Fatalf("Subscribe() error = %v", err)
	}
	initial := <-stream
	result, err := coordinator.ApplyRuntimeSource(context.Background(), contracts.ApplyRuntimeSourceRequest{
		ProjectID: document.ProjectID, Entrypoint: document.Entrypoint, ExpectedVersion: document.Version, Source: "handlers = {\"stylize\": lambda: None}\n",
	})
	if err != nil {
		t.Fatalf("ApplyRuntimeSource() error = %v", err)
	}
	assertActivatedSource(t, result, document.Version)
	starting := receiveRuntimeEnvelope(t, stream, func(envelope contracts.RuntimeEnvelope) bool {
		return envelope.Snapshot != nil && envelope.Snapshot.WorkerState == "starting"
	})
	ready := receiveRuntimeEnvelope(t, stream, func(envelope contracts.RuntimeEnvelope) bool {
		return envelope.Snapshot != nil && envelope.Snapshot.WorkerState == "ready"
	})
	assertSourceReloadSessions(t, initial, starting, ready)
	assertSavedRuntimeSource(t, filepath.Join(coordinator.projectRoot, "app.py"), result.Source.Source)
	assertWorkerReloads(t, worker, 1)
	assertProjectRevision(t, coordinator, projectBefore.Revision)
}

func assertActivatedSource(t *testing.T, result contracts.ApplyRuntimeSourceResult, previousVersion string) {
	t.Helper()
	if err := result.Validate(); err != nil || result.Activation.State != "activated" || result.Source.Version == previousVersion {
		t.Fatalf("source result = %#v, validation error = %v", result, err)
	}
}

func assertSourceReloadSessions(t *testing.T, initial contracts.RuntimeEnvelope, starting contracts.RuntimeEnvelope, ready contracts.RuntimeEnvelope) {
	t.Helper()
	if initial.Snapshot == nil || starting.Snapshot.SessionID == initial.Snapshot.SessionID || ready.Snapshot.SessionID != starting.Snapshot.SessionID {
		t.Fatalf("source reload sessions = initial %#v, starting %#v, ready %#v", initial.Snapshot, starting.Snapshot, ready.Snapshot)
	}
	if starting.Snapshot.Handlers == nil {
		t.Fatalf("starting snapshot handlers = %#v", starting.Snapshot.Handlers)
	}
}

func assertSavedRuntimeSource(t *testing.T, path string, expected string) {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil || string(content) != expected {
		t.Fatalf("saved source = %q, error = %v", content, err)
	}
}

func assertWorkerReloads(t *testing.T, worker *fakeWorker, expected int) {
	t.Helper()
	worker.mu.Lock()
	reloads := append([]contracts.RuntimeDeclaration(nil), worker.reloads...)
	worker.mu.Unlock()
	if len(reloads) != expected {
		t.Fatalf("worker reloads = %#v", reloads)
	}
	if expected > 0 && reloads[len(reloads)-1].Entrypoint != "app.py" {
		t.Fatalf("worker reloads = %#v", reloads)
	}
}

func assertProjectRevision(t *testing.T, coordinator *Coordinator, expected uint64) {
	t.Helper()
	projectSnapshot, err := coordinator.ProjectSnapshot()
	if err != nil || projectSnapshot.Revision != expected {
		t.Fatalf("project snapshot = %#v, error = %v", projectSnapshot, err)
	}
}

func TestRuntimeSourceConflictDoesNotWriteOrReload(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	path := filepath.Join(coordinator.projectRoot, "app.py")
	if err := os.WriteFile(path, []byte("handlers = {}\n"), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	document, err := coordinator.RuntimeSource()
	if err != nil {
		t.Fatalf("RuntimeSource() error = %v", err)
	}
	before, err := coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	_, err = coordinator.ApplyRuntimeSource(context.Background(), contracts.ApplyRuntimeSourceRequest{
		ProjectID: document.ProjectID, Entrypoint: document.Entrypoint, ExpectedVersion: strings.Repeat("0", 64), Source: "changed\n",
	})
	if !errors.Is(err, source.ErrConflict) {
		t.Fatalf("ApplyRuntimeSource() error = %v", err)
	}
	after, snapshotErr := coordinator.Snapshot()
	content, readErr := os.ReadFile(path)
	worker.mu.Lock()
	reloadCount := len(worker.reloads)
	worker.mu.Unlock()
	if snapshotErr != nil || after.SessionID != before.SessionID || string(content) != document.Source || readErr != nil || reloadCount != 0 {
		t.Fatalf("conflict state = snapshot %#v, source %q, reloads %d, errors %v %v", after, content, reloadCount, snapshotErr, readErr)
	}
}

func TestRuntimeSourceApplyReturnsSavedDocumentWhenActivationFails(t *testing.T) {
	for name, configure := range map[string]func(*fakeWorker){
		"load": func(worker *fakeWorker) {
			worker.reloadResult = contracts.InitializeResult{ProtocolVersion: contracts.WorkerProtocolVersion, RuntimeKind: "python", Handlers: []string{}, LoadError: &contracts.StructuredError{Code: "load_error", Message: "invalid syntax"}}
		},
		"reload": func(worker *fakeWorker) {
			worker.reloadErr = errors.New("worker launch failed")
		},
	} {
		t.Run(name, func(t *testing.T) {
			coordinator, worker := testCoordinator(t)
			defer coordinator.Close()
			configure(worker)
			path := filepath.Join(coordinator.projectRoot, "app.py")
			if err := os.WriteFile(path, []byte("handlers = {}\n"), 0o600); err != nil {
				t.Fatalf("WriteFile() error = %v", err)
			}
			document, err := coordinator.RuntimeSource()
			if err != nil {
				t.Fatalf("RuntimeSource() error = %v", err)
			}
			result, err := coordinator.ApplyRuntimeSource(context.Background(), contracts.ApplyRuntimeSourceRequest{
				ProjectID: document.ProjectID, Entrypoint: document.Entrypoint, ExpectedVersion: document.Version, Source: "broken source\n",
			})
			if err != nil {
				t.Fatalf("ApplyRuntimeSource() error = %v", err)
			}
			if err := result.Validate(); err != nil || result.Activation.State != "rejected" || result.Activation.Error == nil || result.Source.Source != "broken source\n" {
				t.Fatalf("ApplyRuntimeSource() = %#v, validation error = %v", result, err)
			}
			content, readErr := os.ReadFile(path)
			snapshot, snapshotErr := coordinator.Snapshot()
			if readErr != nil || string(content) != result.Source.Source || snapshotErr != nil || snapshot.WorkerState != "failed" {
				t.Fatalf("failure state = source %q, snapshot %#v, errors %v %v", content, snapshot, readErr, snapshotErr)
			}
			worker.mu.Lock()
			worker.reloadErr = nil
			worker.reloadResult = contracts.InitializeResult{ProtocolVersion: contracts.WorkerProtocolVersion, RuntimeKind: "python", Handlers: []string{"stylize"}}
			worker.mu.Unlock()
			current, err := coordinator.RuntimeSource()
			if err != nil {
				t.Fatalf("RuntimeSource(recovery) error = %v", err)
			}
			recovered, err := coordinator.ApplyRuntimeSource(context.Background(), contracts.ApplyRuntimeSourceRequest{
				ProjectID: current.ProjectID, Entrypoint: current.Entrypoint, ExpectedVersion: current.Version, Source: "handlers = {}\n",
			})
			if err != nil || recovered.Activation.State != "activated" {
				t.Fatalf("ApplyRuntimeSource(recovery) = %#v, error = %v", recovered, err)
			}
			snapshot, snapshotErr = coordinator.Snapshot()
			if snapshotErr != nil || snapshot.WorkerState != "ready" {
				t.Fatalf("recovered snapshot = %#v, error = %v", snapshot, snapshotErr)
			}
		})
	}
}

func TestRuntimeSourceApplyStopsCurrentWorkerWhenReloadPreparationFails(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	path := filepath.Join(coordinator.projectRoot, "app.py")
	if err := os.WriteFile(path, []byte("handlers = {}\n"), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	document, err := coordinator.RuntimeSource()
	if err != nil {
		t.Fatalf("RuntimeSource() error = %v", err)
	}
	coordinator.newSessionID = func() (string, error) { return "", errors.New("session identity unavailable") }
	result, err := coordinator.ApplyRuntimeSource(context.Background(), contracts.ApplyRuntimeSourceRequest{
		ProjectID: document.ProjectID, Entrypoint: document.Entrypoint, ExpectedVersion: document.Version, Source: "replacement\n",
	})
	if err != nil {
		t.Fatalf("ApplyRuntimeSource() error = %v", err)
	}
	if err := result.Validate(); err != nil || result.Activation.State != "rejected" || result.Source.Source != "replacement\n" {
		t.Fatalf("ApplyRuntimeSource() = %#v, validation error = %v", result, err)
	}
	content, readErr := os.ReadFile(path)
	snapshot, snapshotErr := coordinator.Snapshot()
	worker.mu.Lock()
	stops := worker.stops
	reloads := len(worker.reloads)
	worker.mu.Unlock()
	if readErr != nil || string(content) != result.Source.Source || snapshotErr != nil || snapshot.WorkerState != "failed" || len(snapshot.Values) != 0 || stops != 1 || reloads != 1 {
		t.Fatalf("preparation failure = source %q, snapshot %#v, stops %d, reloads %d, errors %v %v", content, snapshot, stops, reloads, readErr, snapshotErr)
	}
}

func TestCancellationRemovesActiveInvocation(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	if _, err := coordinator.HandleEvent(contracts.RuntimeEvent{Type: "event", Cause: "interaction", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: json.RawMessage(`{"contentRef":"frame"}`)}); err != nil {
		t.Fatalf("HandleEvent() error = %v", err)
	}
	invocation := receiveInvocation(t, worker.started)
	if err := coordinator.Cancel(contracts.RuntimeCancelRequest{Type: "cancel", Identity: invocation.Identity}); err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}
	deadline := time.Now().Add(time.Second)
	for {
		current, err := coordinator.Snapshot()
		if err != nil {
			t.Fatalf("Snapshot() error = %v", err)
		}
		if status := current.Invocations[invocation.Identity.InvocationID]; status.State == "cancelled" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("invocation did not cancel: %#v", current.Invocations)
		}
		time.Sleep(time.Millisecond)
	}
}

func TestCancellationDispatchesLatestPendingInvocation(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	event := contracts.RuntimeEvent{Type: "event", Cause: "interaction", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: json.RawMessage(`{"contentRef":"frame"}`)}
	if _, err := coordinator.HandleEvent(event); err != nil {
		t.Fatalf("HandleEvent(first) error = %v", err)
	}
	first := receiveInvocation(t, worker.started)
	if _, err := coordinator.HandleEvent(event); err != nil {
		t.Fatalf("HandleEvent(second) error = %v", err)
	}
	if err := coordinator.Cancel(contracts.RuntimeCancelRequest{Type: "cancel", Identity: first.Identity}); err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}
	second := receiveInvocation(t, worker.started)
	if second.Identity.Sequence != first.Identity.Sequence+1 {
		t.Fatalf("second sequence = %d, want %d", second.Identity.Sequence, first.Identity.Sequence+1)
	}
	worker.finish(second.Identity.InvocationID)
}

func TestCancellationRemainsTerminalAfterCooperativeWorkerResult(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	worker.cooperativeCancellation = true
	invocation := startDrawingInvocation(t, coordinator, worker)
	if err := coordinator.Cancel(contracts.RuntimeCancelRequest{Type: "cancel", Identity: invocation.Identity}); err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}
	worker.replyError(invocation.Identity.InvocationID, "cancelled")
	waitForInvocationInactive(t, coordinator, invocation.Identity.InvocationID)
	assertInvocationState(t, coordinator, invocation.Identity.InvocationID, "cancelled")
}

func TestCancellationRejectsLateWorkerUpdates(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	worker.cooperativeCancellation = true
	invocation := startDrawingInvocation(t, coordinator, worker)
	if err := coordinator.Cancel(contracts.RuntimeCancelRequest{Type: "cancel", Identity: invocation.Identity}); err != nil {
		t.Fatalf("Cancel() error = %v", err)
	}
	coordinator.acceptUpdate(contracts.RuntimeUpdate{
		Identity:       invocation.Identity,
		UpdateSequence: 1,
		Outputs:        map[string]json.RawMessage{"image": json.RawMessage(`"late"`)},
		Artifacts:      []contracts.WorkerArtifact{},
	})
	worker.replyError(invocation.Identity.InvocationID, "cancelled")
	waitForInvocationInactive(t, coordinator, invocation.Identity.InvocationID)
	snapshot, err := coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if _, exists := snapshot.Values["result.contentRef"]; exists {
		t.Fatalf("cancelled update changed values = %#v", snapshot.Values)
	}
	assertInvocationState(t, coordinator, invocation.Identity.InvocationID, "cancelled")
}

func TestInvocationCompletionWaitsForBufferedStreamUpdate(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	invocation := startDrawingInvocation(t, coordinator, worker)
	worker.finishWithUpdateCount(invocation.Identity.InvocationID, 1)
	time.Sleep(10 * time.Millisecond)
	assertInvocationState(t, coordinator, invocation.Identity.InvocationID, "running")
	coordinator.acceptUpdate(contracts.RuntimeUpdate{
		Identity:       invocation.Identity,
		UpdateSequence: 1,
		Outputs:        map[string]json.RawMessage{"image": json.RawMessage(`"streamed"`)},
		Artifacts:      []contracts.WorkerArtifact{},
	})
	waitForInvocationInactive(t, coordinator, invocation.Identity.InvocationID)
	assertInvocationState(t, coordinator, invocation.Identity.InvocationID, "completed")
	snapshot, err := coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if value := string(snapshot.Values["result.contentRef"]); value != `"streamed"` {
		t.Fatalf("buffered update value = %s", value)
	}
}

func TestWorkerCancellationResultIsClassifiedAsCancelled(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	invocation := startDrawingInvocation(t, coordinator, worker)
	worker.replyError(invocation.Identity.InvocationID, "cancelled")
	waitForInvocationInactive(t, coordinator, invocation.Identity.InvocationID)
	assertInvocationState(t, coordinator, invocation.Identity.InvocationID, "cancelled")
}

func startDrawingInvocation(t *testing.T, coordinator *Coordinator, worker *fakeWorker) contracts.InvokeParams {
	t.Helper()
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	event := contracts.RuntimeEvent{Type: "event", Cause: "interaction", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: json.RawMessage(`{"contentRef":"frame"}`)}
	if _, err := coordinator.HandleEvent(event); err != nil {
		t.Fatalf("HandleEvent() error = %v", err)
	}
	return receiveInvocation(t, worker.started)
}

func waitForInvocationInactive(t *testing.T, coordinator *Coordinator, invocationID string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for {
		coordinator.mu.Lock()
		_, active := coordinator.active[invocationID]
		coordinator.mu.Unlock()
		if !active {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("invocation remained active")
		}
		time.Sleep(time.Millisecond)
	}
}

func assertInvocationState(t *testing.T, coordinator *Coordinator, invocationID string, expected string) {
	t.Helper()
	snapshot, err := coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if state := snapshot.Invocations[invocationID].State; state != expected {
		t.Fatalf("invocation state = %q, want %q", state, expected)
	}
}

func configureBindingScheduling(t *testing.T, coordinator *Coordinator, mode string, concurrencyLimit int) {
	t.Helper()
	projectSnapshot, err := coordinator.ProjectSnapshot()
	if err != nil {
		t.Fatalf("ProjectSnapshot() error = %v", err)
	}
	binding := projectSnapshot.Bindings[0]
	binding.Scheduling.Mode = mode
	binding.Scheduling.ConcurrencyLimit = concurrencyLimit
	operation, err := json.Marshal(contracts.SetBindingOperation{Operation: "setBinding", Binding: binding})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	if _, err := coordinator.Apply(contracts.ApplyRequest{
		ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision, Operations: []json.RawMessage{operation},
	}); err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
}

func TestDrawingSnapshotRunsPythonAndAdoptsStreamedArtifact(t *testing.T) {
	coordinator, contentStore := pythonDrawingCoordinator(t)
	input, err := contentStore.Put("browser", "image/png", bytes.NewBufferString("drawing"))
	if err != nil {
		t.Fatalf("content.Put() error = %v", err)
	}
	payload, err := json.Marshal(map[string]contracts.ContentReference{"contentRef": input})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	if _, err := coordinator.HandleEvent(contracts.RuntimeEvent{Type: "event", Cause: "interaction", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: payload}); err != nil {
		t.Fatalf("HandleEvent() error = %v", err)
	}
	assertStyledArtifact(t, coordinator, contentStore)
}

func TestDirectInvokeDeletesPreparedContentAndPreservesSource(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	source, err := coordinator.content.Put("browser", "text/plain", bytes.NewBufferString("source"))
	if err != nil {
		t.Fatalf("content.Put() error = %v", err)
	}
	done := make(chan error, 1)
	go func() {
		_, invokeErr := coordinator.Invoke(context.Background(), "stylize", contracts.DirectInvokeRequest{
			Arguments: map[string]json.RawMessage{}, Content: []contracts.ContentReference{source},
		})
		done <- invokeErr
	}()
	invocation := receiveInvocation(t, worker.started)
	worker.reply(invocation.Identity.InvocationID, `"done"`)
	if err := <-done; err != nil {
		t.Fatalf("Invoke() error = %v", err)
	}
	if _, err := coordinator.content.Open(invocation.Content[0]); !errors.Is(err, content.ErrNotFound) {
		t.Fatalf("Open(prepared) error = %v, want not found", err)
	}
	reader, err := coordinator.content.Open(source)
	if err != nil {
		t.Fatalf("Open(source) error = %v", err)
	}
	reader.Close()
}

func TestLatestBindingReclaimsReplacedContent(t *testing.T) {
	coordinator, _ := testCoordinator(t)
	defer coordinator.Close()
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	for index := 0; index < content.MaximumRecords+8; index++ {
		scope := "browser-" + strconv.Itoa(index)
		source, err := coordinator.content.Put(scope, "image/png", bytes.NewBufferString("frame"))
		if err != nil {
			t.Fatalf("content.Put(%d) error = %v", index, err)
		}
		payload, err := json.Marshal(map[string]contracts.ContentReference{"contentRef": source})
		if err != nil {
			t.Fatalf("json.Marshal() error = %v", err)
		}
		_, err = coordinator.HandleEvent(contracts.RuntimeEvent{Type: "event", Cause: "interaction", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: payload})
		if err != nil {
			t.Fatalf("HandleEvent(%d) error = %v", index, err)
		}
		if _, err := coordinator.content.Open(source); !errors.Is(err, content.ErrNotFound) {
			t.Fatalf("Open(event source %d) error = %v, want not found", index, err)
		}
	}
}

func TestBusyBindingReclaimsRejectedEventContent(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	projectSnapshot, err := coordinator.ProjectSnapshot()
	if err != nil {
		t.Fatalf("ProjectSnapshot() error = %v", err)
	}
	binding := projectSnapshot.Bindings[0]
	binding.Scheduling.Mode = "once"
	operation, err := json.Marshal(contracts.SetBindingOperation{Operation: "setBinding", Binding: binding})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	if _, err := coordinator.Apply(contracts.ApplyRequest{ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision, Operations: []json.RawMessage{operation}}); err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	runtimeSnapshot, _ := coordinator.Snapshot()
	firstSource, err := coordinator.content.Put("browser-first", "image/png", bytes.NewBufferString("first"))
	if err != nil {
		t.Fatalf("Put(first) error = %v", err)
	}
	firstPayload, err := json.Marshal(map[string]contracts.ContentReference{"contentRef": firstSource})
	if err != nil {
		t.Fatalf("Marshal(first) error = %v", err)
	}
	if _, err := coordinator.HandleEvent(contracts.RuntimeEvent{Type: "event", Cause: "interaction", SessionID: runtimeSnapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: firstPayload}); err != nil {
		t.Fatalf("HandleEvent(first) error = %v", err)
	}
	invocation := receiveInvocation(t, worker.started)
	secondSource, err := coordinator.content.Put("browser-second", "image/png", bytes.NewBufferString("second"))
	if err != nil {
		t.Fatalf("Put(second) error = %v", err)
	}
	secondPayload, err := json.Marshal(map[string]contracts.ContentReference{"contentRef": secondSource})
	if err != nil {
		t.Fatalf("Marshal(second) error = %v", err)
	}
	accepted, err := coordinator.HandleEvent(contracts.RuntimeEvent{Type: "event", Cause: "interaction", SessionID: runtimeSnapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: secondPayload})
	if err != nil || accepted != 0 {
		t.Fatalf("HandleEvent(second) = %d, %v", accepted, err)
	}
	if _, err := coordinator.content.Open(secondSource); !errors.Is(err, content.ErrNotFound) {
		t.Fatalf("Open(rejected source) error = %v, want not found", err)
	}
	worker.reply(invocation.Identity.InvocationID, `"done"`)
}

func pythonDrawingCoordinator(t *testing.T) (*Coordinator, *content.Store) {
	t.Helper()
	python, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 is unavailable")
	}
	root := t.TempDir()
	source := `
def stylize(drawing):
    target = drawing["path"] + ".styled"
    with open(drawing["path"], "rb") as source:
        value = source.read().upper()
    with open(target, "wb") as output:
        output.write(value)
    yield {
        "outputs": {},
        "progress": 1,
        "message": "Styled",
        "artifacts": [{"name": "image", "mediaType": "image/png", "path": target}],
    }

handlers = {"stylize": stylize}
`
	if err := os.WriteFile(filepath.Join(root, "app.py"), []byte(source), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	projects, err := project.Open(filepath.Join(root, ".local", "realtime", "project.json"), true)
	if err != nil {
		t.Fatalf("project.Open() error = %v", err)
	}
	t.Cleanup(func() { _ = projects.Close() })
	configureDrawingProject(t, projects)
	contentStore, err := content.Open(filepath.Join(root, ".local", "realtime"))
	if err != nil {
		t.Fatalf("content.Open() error = %v", err)
	}
	t.Cleanup(func() { _ = contentStore.Close() })
	manager, err := worker.NewManager(worker.Options{LauncherPython: python, StagingRoot: filepath.Join(root, "worker"), ContentOpener: contentStore})
	if err != nil {
		t.Fatalf("worker.NewManager() error = %v", err)
	}
	coordinator, err := New(root, projects, contentStore, manager)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	t.Cleanup(func() { _ = coordinator.Close() })
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	return coordinator, contentStore
}

func assertStyledArtifact(t *testing.T, coordinator *Coordinator, contentStore *content.Store) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		current, err := coordinator.Snapshot()
		if err != nil {
			t.Fatalf("Snapshot() error = %v", err)
		}
		if raw, exists := current.Values["result.contentRef"]; exists {
			var reference contracts.ContentReference
			if err := contracts.DecodeStrict(raw, &reference); err != nil {
				t.Fatalf("DecodeStrict() error = %v", err)
			}
			reader, err := contentStore.Open(reference)
			if err != nil {
				t.Fatalf("content.Open() error = %v", err)
			}
			value, readErr := io.ReadAll(reader)
			closeErr := reader.Close()
			if readErr != nil || closeErr != nil {
				t.Fatalf("artifact read errors = %v, %v", readErr, closeErr)
			}
			if string(value) != "DRAWING" {
				t.Fatalf("artifact = %q, want DRAWING", value)
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("runtime values = %#v", current.Values)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func testCoordinator(t *testing.T) (*Coordinator, *fakeWorker) {
	t.Helper()
	root := t.TempDir()
	projectPath := filepath.Join(root, ".local", "realtime", "project.json")
	projects, err := project.Open(projectPath, true)
	if err != nil {
		t.Fatalf("project.Open() error = %v", err)
	}
	updated := configureDrawingProject(t, projects)
	contentStore, err := content.Open(filepath.Join(root, ".local", "realtime"))
	if err != nil {
		t.Fatalf("content.Open() error = %v", err)
	}
	worker := newFakeWorker()
	coordinator, err := New(root, projects, contentStore, worker)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	t.Cleanup(func() {
		_ = projects.Close()
		_ = contentStore.Close()
	})
	if updated.Revision != 1 {
		t.Fatalf("project revision = %d", updated.Revision)
	}
	return coordinator, worker
}

func configureDrawingProject(t *testing.T, projects *project.Store) contracts.Project {
	t.Helper()
	snapshot, err := projects.Snapshot()
	if err != nil {
		t.Fatalf("project.Snapshot() error = %v", err)
	}
	updated, err := projects.Apply(contracts.ApplyRequest{ProjectID: snapshot.ID, ExpectedRevision: snapshot.Revision, Operations: []json.RawMessage{
		json.RawMessage(`{"op":"upsertSection","section":{"id":"drawing","kind":"drawing","name":"Drawing","width":480,"height":320,"overflowMode":false,"positionAndSizeLocked":false,"isHorizontalOrientation":false,"styleColor":null,"tagColor":null,"children":[],"data":{"scene":{},"width":480,"height":320,"background":"#ffffff"}},"layout":{"x":0,"y":0,"width":480,"height":320,"zIndex":1}}`),
		json.RawMessage(`{"op":"upsertSection","section":{"id":"result","kind":"output","name":"Result","width":480,"height":320,"overflowMode":false,"positionAndSizeLocked":false,"isHorizontalOrientation":false,"styleColor":null,"tagColor":null,"children":[],"data":{"value":null}},"layout":{"x":520,"y":0,"width":480,"height":320,"zIndex":2}}`),
		json.RawMessage(`{"op":"upsertSection","section":{"id":"stylize-handler","kind":"handler","name":"Stylize","width":320,"height":180,"overflowMode":false,"positionAndSizeLocked":false,"isHorizontalOrientation":false,"styleColor":null,"tagColor":null,"children":[],"data":{"bindingId":"stylize"}},"layout":{"x":500,"y":360,"width":320,"height":180,"zIndex":3}}`),
		json.RawMessage(`{"op":"setBinding","binding":{"id":"stylize","trigger":{"kind":"event","sectionId":"drawing","event":"snapshot"},"handler":"stylize","arguments":{"drawing":"$event.contentRef"},"scheduling":{"mode":"latest","debounceMilliseconds":0,"concurrencyGroup":"image","concurrencyLimit":1},"outputs":{"image":{"target":{"sectionId":"result","field":"contentRef"}}}}}`),
	}})
	if err != nil {
		t.Fatalf("project.Apply() error = %v", err)
	}
	return updated
}

func receiveInvocation(t *testing.T, channel <-chan contracts.InvokeParams) contracts.InvokeParams {
	t.Helper()
	select {
	case invocation := <-channel:
		return invocation
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for invocation")
		return contracts.InvokeParams{}
	}
}

func receiveRuntimeEnvelope(t *testing.T, stream <-chan contracts.RuntimeEnvelope, accept func(contracts.RuntimeEnvelope) bool) contracts.RuntimeEnvelope {
	t.Helper()
	deadline := time.After(time.Second)
	for {
		select {
		case envelope := <-stream:
			if accept(envelope) {
				return envelope
			}
		case <-deadline:
			t.Fatal("timed out waiting for runtime envelope")
			return contracts.RuntimeEnvelope{}
		}
	}
}
