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
	"sync"
	"testing"
	"time"

	"github.com/setta/realtime/backend/internal/content"
	"github.com/setta/realtime/backend/internal/contracts"
	"github.com/setta/realtime/backend/internal/project"
	"github.com/setta/realtime/backend/internal/worker"
)

type fakeWorker struct {
	mu                      sync.Mutex
	updates                 chan contracts.RuntimeUpdate
	started                 chan contracts.InvokeParams
	replies                 map[string]chan contracts.InvokeResult
	cooperativeCancellation bool
	closed                  bool
}

func newFakeWorker() *fakeWorker {
	return &fakeWorker{updates: make(chan contracts.RuntimeUpdate, 16), started: make(chan contracts.InvokeParams, 128), replies: make(map[string]chan contracts.InvokeResult)}
}

func (worker *fakeWorker) Reload(context.Context, string, contracts.RuntimeDeclaration) (contracts.InitializeResult, error) {
	return contracts.InitializeResult{ProtocolVersion: 1, RuntimeKind: "python", Handlers: []string{"stylize"}}, nil
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
	worker.mu.Lock()
	channel := worker.replies[invocationID]
	worker.mu.Unlock()
	channel <- contracts.InvokeResult{Outputs: map[string]json.RawMessage{"image": json.RawMessage(value)}}
}

func (worker *fakeWorker) replyError(invocationID string, code string) {
	worker.mu.Lock()
	channel := worker.replies[invocationID]
	worker.mu.Unlock()
	channel <- contracts.InvokeResult{Outputs: map[string]json.RawMessage{}, Error: &contracts.StructuredError{Code: code, Message: code}}
}

func TestLatestBindingRejectsOlderResultAndStaysBounded(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	for index := 0; index < 100; index++ {
		payload := json.RawMessage(`{"contentRef":"frame-` + string(rune('a'+index%26)) + `"}`)
		_, err := coordinator.HandleEvent(contracts.RuntimeEvent{Type: "event", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: payload})
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
	worker.reply(newest.Identity.InvocationID, `"new"`)
	deadline := time.Now().Add(time.Second)
	for {
		current, err := coordinator.Snapshot()
		if err != nil {
			t.Fatalf("Snapshot() error = %v", err)
		}
		if string(current.Values["result.contentRef"]) == `"new"` {
			if string(current.Values["result.contentRef"]) == `"old"` {
				t.Fatal("older result replaced the newest result")
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
	if envelope.Type != "snapshot" || envelope.Snapshot == nil || envelope.Snapshot.WorkerState != "ready" || envelope.Snapshot.SessionID == "" {
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
	event := contracts.RuntimeEvent{Type: "event", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: json.RawMessage(`{"contentRef":"frame"}`)}
	if _, err := coordinator.HandleEvent(event); err != nil {
		t.Fatalf("HandleEvent() error = %v", err)
	}
	invocation := receiveInvocation(t, worker.started)
	worker.reply(invocation.Identity.InvocationID, `"final"`)
	envelope := receiveRuntimeEnvelope(t, stream, func(envelope contracts.RuntimeEnvelope) bool {
		return envelope.Type == "update"
	})
	if envelope.Update == nil || envelope.Update.Identity != invocation.Identity || string(envelope.Update.Outputs["image"]) != `"final"` {
		t.Fatalf("final update = %#v", envelope.Update)
	}
	receiveRuntimeEnvelope(t, stream, func(envelope contracts.RuntimeEnvelope) bool {
		return envelope.Invocation != nil && envelope.Invocation.Identity == invocation.Identity && envelope.Invocation.State == "completed"
	})
}

func TestDirectInvokeRequiresExplicitReload(t *testing.T) {
	coordinator, _ := testCoordinator(t)
	defer coordinator.Close()
	_, err := coordinator.Invoke(context.Background(), "stylize", contracts.DirectInvokeRequest{Arguments: map[string]json.RawMessage{}, Content: []contracts.ContentReference{}})
	if err != ErrWorkerNotReady {
		t.Fatalf("Invoke() error = %v, want worker not ready", err)
	}
}

func TestCancellationRemovesActiveInvocation(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	if _, err := coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := coordinator.Snapshot()
	if _, err := coordinator.HandleEvent(contracts.RuntimeEvent{Type: "event", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: json.RawMessage(`{"contentRef":"frame"}`)}); err != nil {
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
		Identity:  invocation.Identity,
		Outputs:   map[string]json.RawMessage{"image": json.RawMessage(`"late"`)},
		Artifacts: []contracts.WorkerArtifact{},
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

func TestCompletedInvocationAcceptsBufferedStreamUpdate(t *testing.T) {
	coordinator, worker := testCoordinator(t)
	defer coordinator.Close()
	invocation := startDrawingInvocation(t, coordinator, worker)
	worker.reply(invocation.Identity.InvocationID, `"ordinary"`)
	waitForInvocationInactive(t, coordinator, invocation.Identity.InvocationID)
	assertInvocationState(t, coordinator, invocation.Identity.InvocationID, "completed")
	coordinator.acceptUpdate(contracts.RuntimeUpdate{
		Identity:  invocation.Identity,
		Outputs:   map[string]json.RawMessage{"image": json.RawMessage(`"streamed"`)},
		Artifacts: []contracts.WorkerArtifact{},
	})
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
	event := contracts.RuntimeEvent{Type: "event", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: json.RawMessage(`{"contentRef":"frame"}`)}
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
	if _, err := coordinator.HandleEvent(contracts.RuntimeEvent{Type: "event", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: payload}); err != nil {
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
		_, err = coordinator.HandleEvent(contracts.RuntimeEvent{Type: "event", SessionID: snapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: payload})
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
	if _, err := coordinator.HandleEvent(contracts.RuntimeEvent{Type: "event", SessionID: runtimeSnapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: firstPayload}); err != nil {
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
	accepted, err := coordinator.HandleEvent(contracts.RuntimeEvent{Type: "event", SessionID: runtimeSnapshot.SessionID, SectionID: "drawing", Event: "snapshot", Payload: secondPayload})
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
		json.RawMessage(`{"op":"setBinding","binding":{"id":"stylize","trigger":{"sectionId":"drawing","event":"snapshot"},"handler":"stylize","arguments":{"drawing":"$event.contentRef"},"scheduling":{"mode":"latest","debounceMilliseconds":0,"concurrencyGroup":"image","concurrencyLimit":1},"outputs":{"image":{"sectionId":"result","field":"contentRef"}}}}`),
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
