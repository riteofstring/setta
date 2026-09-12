package runtime

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/setta/realtime/backend/internal/content"
	"github.com/setta/realtime/backend/internal/contracts"
	"github.com/setta/realtime/backend/internal/project"
)

type materializedRuntime struct {
	coordinator *Coordinator
	projects    *project.Store
	content     *content.Store
	worker      *fakeWorker
}

func TestLastSuccessfulOutputSurvivesRestartAndFailedRefresh(t *testing.T) {
	root := t.TempDir()
	first := openMaterializedRuntime(t, root, true, "always")
	if _, err := first.coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload(first) error = %v", err)
	}
	firstSnapshot, _ := first.coordinator.Snapshot()
	accepted, err := first.coordinator.HandleEvent(runtimeTestEvent(firstSnapshot.SessionID, "interaction", `{"contentRef":"same"}`))
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent(first) = %d, %v", accepted, err)
	}
	firstInvocation := receiveInvocation(t, first.worker.started)
	first.worker.reply(firstInvocation.Identity.InvocationID, `"saved"`)
	waitForRuntimeValue(t, first.coordinator, `"saved"`)
	closeMaterializedRuntime(t, first)

	second := openMaterializedRuntime(t, root, false, "always")
	if _, err := second.coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload(second) error = %v", err)
	}
	restored, _ := second.coordinator.Snapshot()
	if string(restored.Values["result.contentRef"]) != `"saved"` || !restored.RetainedByBinding["stylize"] {
		t.Fatalf("restored runtime = %#v", restored)
	}
	accepted, err = second.coordinator.HandleEvent(runtimeTestEvent(restored.SessionID, "startup", `{"contentRef":"same"}`))
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent(refresh) = %d, %v", accepted, err)
	}
	refresh := receiveInvocation(t, second.worker.started)
	second.worker.updates <- contracts.RuntimeUpdate{
		Identity: refresh.Identity,
		Outputs:  map[string]json.RawMessage{"image": json.RawMessage(`"preview"`)},
	}
	waitForInvocationState(t, second.coordinator, refresh.Identity.InvocationID, "streaming")
	duringRefresh, _ := second.coordinator.Snapshot()
	if string(duringRefresh.Values["result.contentRef"]) != `"saved"` {
		t.Fatalf("streaming refresh replaced retained output: %#v", duringRefresh.Values)
	}
	second.worker.replyError(refresh.Identity.InvocationID, "render_failed")
	waitForInvocationState(t, second.coordinator, refresh.Identity.InvocationID, "failed")
	afterFailure, _ := second.coordinator.Snapshot()
	if string(afterFailure.Values["result.contentRef"]) != `"saved"` || !afterFailure.RetainedByBinding["stylize"] {
		t.Fatalf("failed refresh runtime = %#v", afterFailure)
	}
	if _, err := second.coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload(success) error = %v", err)
	}
	refreshSnapshot, _ := second.coordinator.Snapshot()
	accepted, err = second.coordinator.HandleEvent(runtimeTestEvent(refreshSnapshot.SessionID, "startup", `{"contentRef":"same"}`))
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent(success) = %d, %v", accepted, err)
	}
	successfulRefresh := receiveInvocation(t, second.worker.started)
	second.worker.reply(successfulRefresh.Identity.InvocationID, `"fresh"`)
	waitForRuntimeValue(t, second.coordinator, `"fresh"`)
	afterSuccess, _ := second.coordinator.Snapshot()
	if afterSuccess.RetainedByBinding["stylize"] {
		t.Fatalf("successful refresh remained retained: %#v", afterSuccess.RetainedByBinding)
	}
	closeMaterializedRuntime(t, second)

	third := openMaterializedRuntime(t, root, false, "always")
	t.Cleanup(func() { closeMaterializedRuntime(t, third) })
	if _, err := third.coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload(third) error = %v", err)
	}
	latest, _ := third.coordinator.Snapshot()
	if string(latest.Values["result.contentRef"]) != `"fresh"` || !latest.RetainedByBinding["stylize"] {
		t.Fatalf("latest restored runtime = %#v", latest)
	}
}

func TestWhenStaleSkipsFreshMaterializationAndRefreshesChangedArguments(t *testing.T) {
	root := t.TempDir()
	runtime := openMaterializedRuntime(t, root, true, "whenStale")
	t.Cleanup(func() { closeMaterializedRuntime(t, runtime) })
	if _, err := runtime.coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload(first) error = %v", err)
	}
	firstSnapshot, _ := runtime.coordinator.Snapshot()
	accepted, err := runtime.coordinator.HandleEvent(runtimeTestEvent(firstSnapshot.SessionID, "startup", `{"contentRef":"same"}`))
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent(first) = %d, %v", accepted, err)
	}
	firstInvocation := receiveInvocation(t, runtime.worker.started)
	runtime.worker.reply(firstInvocation.Identity.InvocationID, `"saved"`)
	waitForRuntimeValue(t, runtime.coordinator, `"saved"`)
	if _, err := runtime.coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload(fresh) error = %v", err)
	}
	freshSnapshot, _ := runtime.coordinator.Snapshot()
	accepted, err = runtime.coordinator.HandleEvent(runtimeTestEvent(freshSnapshot.SessionID, "startup", `{"contentRef":"same"}`))
	if err != nil || accepted != 0 {
		t.Fatalf("HandleEvent(fresh) = %d, %v", accepted, err)
	}
	if _, err := runtime.coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload(changed) error = %v", err)
	}
	changedSnapshot, _ := runtime.coordinator.Snapshot()
	accepted, err = runtime.coordinator.HandleEvent(runtimeTestEvent(changedSnapshot.SessionID, "startup", `{"contentRef":"changed"}`))
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent(changed) = %d, %v", accepted, err)
	}
	receiveInvocation(t, runtime.worker.started)
}

func TestStartupEventRunsAtMostOncePerBindingConfiguration(t *testing.T) {
	runtime := openMaterializedRuntime(t, t.TempDir(), true, "always")
	t.Cleanup(func() { closeMaterializedRuntime(t, runtime) })
	if _, err := runtime.coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	snapshot, _ := runtime.coordinator.Snapshot()
	event := runtimeTestEvent(snapshot.SessionID, "startup", `{"contentRef":"same"}`)
	first, firstErr := runtime.coordinator.HandleEvent(event)
	second, secondErr := runtime.coordinator.HandleEvent(event)
	if firstErr != nil || secondErr != nil || first != 1 || second != 0 {
		t.Fatalf("startup admissions = (%d, %v), (%d, %v)", first, firstErr, second, secondErr)
	}
}

func TestStartupEventIgnoresBindingsWithoutAutomaticStartup(t *testing.T) {
	runtime := openMaterializedRuntime(t, t.TempDir(), true, "always")
	t.Cleanup(func() { closeMaterializedRuntime(t, runtime) })
	if _, err := runtime.coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	projectSnapshot, err := runtime.projects.Snapshot()
	if err != nil {
		t.Fatalf("project.Snapshot() error = %v", err)
	}
	binding := projectSnapshot.Bindings[0]
	binding.ID = "interaction-only"
	binding.Arguments = map[string]json.RawMessage{"missing": json.RawMessage(`"$event.missing"`)}
	binding.Materialization = nil
	operation, err := json.Marshal(map[string]any{"op": "setBinding", "binding": binding})
	if err != nil {
		t.Fatalf("json.Marshal(operation) error = %v", err)
	}
	if _, err := runtime.coordinator.Apply(contracts.ApplyRequest{
		ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision, Operations: []json.RawMessage{operation},
	}); err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	snapshot, _ := runtime.coordinator.Snapshot()
	accepted, err := runtime.coordinator.HandleEvent(runtimeTestEvent(snapshot.SessionID, "startup", `{"contentRef":"same"}`))
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent() = %d, %v", accepted, err)
	}
	invocation := receiveInvocation(t, runtime.worker.started)
	if invocation.Identity.BindingID != "stylize" {
		t.Fatalf("invocation binding = %q, want stylize", invocation.Identity.BindingID)
	}
}

func TestComputeFingerprintUsesContentIdentityInsteadOfSessionIdentity(t *testing.T) {
	first := contracts.ContentReference{
		ID: "content-first", MediaType: "image/png", ByteLength: 12,
		SHA256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", InvocationID: "invocation-first",
	}
	second := first
	second.ID = "content-second"
	second.InvocationID = "invocation-second"
	firstRaw, err := json.Marshal(first)
	if err != nil {
		t.Fatalf("json.Marshal(first) error = %v", err)
	}
	secondRaw, err := json.Marshal(second)
	if err != nil {
		t.Fatalf("json.Marshal(second) error = %v", err)
	}
	firstFingerprint, err := computeFingerprint("source-version", "render", map[string]json.RawMessage{"drawing": firstRaw})
	if err != nil {
		t.Fatalf("computeFingerprint(first) error = %v", err)
	}
	secondFingerprint, err := computeFingerprint("source-version", "render", map[string]json.RawMessage{"drawing": secondRaw})
	if err != nil {
		t.Fatalf("computeFingerprint(second) error = %v", err)
	}
	if firstFingerprint != secondFingerprint {
		t.Fatalf("fingerprints = %q and %q, want equal", firstFingerprint, secondFingerprint)
	}
}

func TestComputeFingerprintPreservesLargeJSONNumberIdentity(t *testing.T) {
	first, err := computeFingerprint("source-version", "render", map[string]json.RawMessage{"value": json.RawMessage(`9007199254740992`)})
	if err != nil {
		t.Fatalf("computeFingerprint(first) error = %v", err)
	}
	second, err := computeFingerprint("source-version", "render", map[string]json.RawMessage{"value": json.RawMessage(`9007199254740993`)})
	if err != nil {
		t.Fatalf("computeFingerprint(second) error = %v", err)
	}
	if first == second {
		t.Fatalf("fingerprints = %q, want distinct values", first)
	}
}

func TestRemovingDurableRetentionReleasesMaterializedContent(t *testing.T) {
	runtime := openMaterializedRuntime(t, t.TempDir(), true, "manual")
	t.Cleanup(func() { closeMaterializedRuntime(t, runtime) })
	if _, err := runtime.coordinator.Reload(context.Background()); err != nil {
		t.Fatalf("Reload() error = %v", err)
	}
	reference, err := runtime.content.Put("output", "image/png", strings.NewReader("saved image"))
	if err != nil {
		t.Fatalf("content.Put() error = %v", err)
	}
	encoded, err := json.Marshal(reference)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	snapshot, _ := runtime.coordinator.Snapshot()
	accepted, err := runtime.coordinator.HandleEvent(runtimeTestEvent(snapshot.SessionID, "interaction", `{"contentRef":"same"}`))
	if err != nil || accepted != 1 {
		t.Fatalf("HandleEvent() = %d, %v", accepted, err)
	}
	invocation := receiveInvocation(t, runtime.worker.started)
	runtime.worker.reply(invocation.Identity.InvocationID, string(encoded))
	waitForRuntimeValue(t, runtime.coordinator, string(encoded))

	projectSnapshot, err := runtime.projects.Snapshot()
	if err != nil {
		t.Fatalf("project.Snapshot() error = %v", err)
	}
	binding := projectSnapshot.Bindings[0]
	binding.Materialization = &contracts.MaterializationPolicy{Retention: "session", Startup: "manual"}
	operation, err := json.Marshal(map[string]any{"op": "setBinding", "binding": binding})
	if err != nil {
		t.Fatalf("json.Marshal(operation) error = %v", err)
	}
	if _, err := runtime.coordinator.Apply(contracts.ApplyRequest{
		ProjectID: projectSnapshot.ID, ExpectedRevision: projectSnapshot.Revision, Operations: []json.RawMessage{operation},
	}); err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	reader, err := runtime.content.Open(reference)
	if reader != nil {
		_ = reader.Close()
	}
	if !errors.Is(err, content.ErrNotFound) {
		t.Fatalf("content.Open() error = %v, want ErrNotFound", err)
	}
}

func openMaterializedRuntime(t *testing.T, root string, create bool, startup string) materializedRuntime {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, "app.py"), []byte("handlers = {}\n"), 0o600); err != nil {
		t.Fatalf("WriteFile(app.py) error = %v", err)
	}
	projects, err := project.Open(filepath.Join(root, ".local", "realtime", "project.json"), create)
	if err != nil {
		t.Fatalf("project.Open() error = %v", err)
	}
	if create {
		configureDrawingProject(t, projects)
		configureMaterializationPolicy(t, projects, startup)
	}
	contentStore, err := content.Open(filepath.Join(root, ".local", "realtime"))
	if err != nil {
		_ = projects.Close()
		t.Fatalf("content.Open() error = %v", err)
	}
	worker := newFakeWorker()
	coordinator, err := New(root, projects, contentStore, worker)
	if err != nil {
		_ = contentStore.Close()
		_ = projects.Close()
		t.Fatalf("New() error = %v", err)
	}
	return materializedRuntime{coordinator: coordinator, projects: projects, content: contentStore, worker: worker}
}

func closeMaterializedRuntime(t *testing.T, runtime materializedRuntime) {
	t.Helper()
	if err := runtime.coordinator.Close(); err != nil {
		t.Fatalf("Coordinator.Close() error = %v", err)
	}
	if err := runtime.content.Close(); err != nil {
		t.Fatalf("content.Close() error = %v", err)
	}
	if err := runtime.projects.Close(); err != nil {
		t.Fatalf("project.Close() error = %v", err)
	}
}

func configureMaterializationPolicy(t *testing.T, projects *project.Store, startup string) {
	t.Helper()
	snapshot, err := projects.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	binding := snapshot.Bindings[0]
	binding.Materialization = &contracts.MaterializationPolicy{Retention: "lastSuccessful", Startup: startup}
	operation, err := json.Marshal(map[string]any{"op": "setBinding", "binding": binding})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	if _, err := projects.Apply(contracts.ApplyRequest{
		ProjectID: snapshot.ID, ExpectedRevision: snapshot.Revision, Operations: []json.RawMessage{operation},
	}); err != nil {
		t.Fatalf("project.Apply() error = %v", err)
	}
}

func runtimeTestEvent(sessionID string, cause string, payload string) contracts.RuntimeEvent {
	return contracts.RuntimeEvent{
		Type: "event", Cause: cause, SessionID: sessionID, SectionID: "drawing", Event: "snapshot", Payload: json.RawMessage(payload),
	}
}

func waitForRuntimeValue(t *testing.T, coordinator *Coordinator, expected string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		snapshot, err := coordinator.Snapshot()
		if err == nil && string(snapshot.Values["result.contentRef"]) == expected {
			return
		}
		time.Sleep(time.Millisecond)
	}
	snapshot, err := coordinator.Snapshot()
	t.Fatalf("runtime value = %s, error = %v", snapshot.Values["result.contentRef"], err)
}

func waitForInvocationState(t *testing.T, coordinator *Coordinator, invocationID string, expected string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		snapshot, err := coordinator.Snapshot()
		if err == nil && snapshot.Invocations[invocationID].State == expected {
			return
		}
		time.Sleep(time.Millisecond)
	}
	snapshot, err := coordinator.Snapshot()
	t.Fatalf("invocation = %#v, error = %v", snapshot.Invocations[invocationID], err)
}
