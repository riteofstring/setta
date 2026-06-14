package semanticgraph

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
)

func TestProcessCartographerWindowRunsStructuredHarnessAndMarksProcessed(t *testing.T) {
	fake := chat.NewFakeHarness(nil)
	service, store := newCartographerRunnerTestService(t, chat.HarnessTaskRunnerFor(fake))
	ctx := context.Background()
	seedCartographerPatchEvidence(t, store)
	window := buildRunnerCartographerWindow(t, service)

	result, err := service.ProcessCartographerWindow(ctx, testWorkspaceID, window.ID)
	if err != nil {
		t.Fatalf("process cartographer window: %v", err)
	}
	assertCartographerProcessApplied(t, result)
	assertCartographerProcessContractArrays(t, result)
	assertProcessedCartographerWindowReadback(t, service, ctx, window.ID)
	assertProcessedCartographerNodeReadback(t, service, ctx, result)
	assertStructuredCartographerTask(t, fake)
}

func assertCartographerProcessApplied(t *testing.T, result CartographerWindowProcessResult) {
	t.Helper()
	if result.Window.Status != CartographerWindowProcessed {
		t.Fatalf("processed window status = %s, want processed", result.Window.Status)
	}
	if result.Run.Status != CartographerRunApplied || len(result.Patches) < 1 || len(result.Events) == 0 {
		t.Fatalf("process result = %+v, want applied run with patch events", result)
	}
	if result.Run.HarnessKind != string(chat.HarnessCodex) ||
		result.Run.RequestID != "scripted-cartographer-request" ||
		result.Run.ResponseID != "scripted-cartographer-response" ||
		result.Run.RawHarnessResponseHash == "" {
		t.Fatalf("run audit = %+v, want persisted structured harness metadata", result.Run)
	}
}

func assertCartographerProcessContractArrays(t *testing.T, result CartographerWindowProcessResult) {
	t.Helper()
	if result.Run.CreatedSemanticEventIDs == nil || result.Run.Diagnostics == nil {
		t.Fatalf("process result contains nil run contract arrays: %+v", result)
	}
	for _, patch := range result.Patches {
		if patch.CreatedSemanticEventIDs == nil ||
			patch.ValidationResult.Diagnostics == nil ||
			patch.ApplicationResult.CreatedSemanticEventIDs == nil ||
			patch.ApplicationResult.Diagnostics == nil {
			t.Fatalf("process result contains nil patch contract arrays: %+v", result)
		}
	}
}

func assertProcessedCartographerWindowReadback(t *testing.T, service *Service, ctx context.Context, windowID string) {
	t.Helper()
	readWindow, ok, err := service.ReadCartographerWindow(ctx, testWorkspaceID, windowID)
	if err != nil || !ok || readWindow.Status != CartographerWindowProcessed {
		t.Fatalf("read processed window = %+v ok=%v err=%v, want processed", readWindow, ok, err)
	}
}

func assertProcessedCartographerNodeReadback(t *testing.T, service *Service, ctx context.Context, result CartographerWindowProcessResult) {
	t.Helper()
	nodePatch := cartographerResultFindingPatch(t, result)
	nodeID := nodePatch.Patch.Payload.NewNode.SemanticNodeID
	detail, ok, err := service.ReadNodeDetail(ctx, testWorkspaceID, nodeID)
	if err != nil || !ok || len(detail.Evidence) == 0 {
		t.Fatalf("cartographer-created node detail = %+v ok=%v err=%v, want evidence-backed node", detail, ok, err)
	}
}

func cartographerResultFindingPatch(t *testing.T, result CartographerWindowProcessResult) CartographerPatchRecord {
	t.Helper()
	for _, patch := range result.Patches {
		if patch.Patch.Operation == CartographerPatchRecordFinding && patch.Patch.Payload.NewNode != nil {
			return patch
		}
	}
	t.Fatalf("process result patches = %+v, want applied finding patch with new node", result.Patches)
	return CartographerPatchRecord{}
}

func assertStructuredCartographerTask(t *testing.T, fake *chat.FakeHarness) {
	t.Helper()
	tasks := fake.StructuredTaskRequests()
	if len(tasks) != 1 {
		t.Fatalf("structured tasks = %+v, want one cartographer task", tasks)
	}
	task := tasks[0]
	if task.Surface != chat.HarnessSurfaceSemanticCartographer ||
		task.TurnMode != chat.HarnessTurnStructuredTask ||
		task.OutputContract.Kind != chat.HarnessOutputStrictJSON ||
		len(task.OutputContract.JSONSchema) == 0 ||
		task.CapabilityPolicy.WorkspaceMutation ||
		task.CapabilityPolicy.Approvals ||
		task.CapabilityPolicy.Streaming ||
		len(task.CapabilityPolicy.AllowedTools) != 0 {
		t.Fatalf("structured task request = %+v, want strict no-tool cartographer task", task)
	}
	if !strings.Contains(task.StructuredTask.Prompt, "Return only a strict JSON semantic graph patch envelope") {
		t.Fatalf("structured task prompt = %q, want production cartographer prompt", task.StructuredTask.Prompt)
	}
}

func TestProcessCartographerWindowPersistsFailedAuditForHarnessError(t *testing.T) {
	service, store := newCartographerRunnerTestService(t, failingCartographerTaskRunner{})
	ctx := context.Background()
	seedCartographerPatchEvidence(t, store)
	window := buildRunnerCartographerWindow(t, service)
	before := semanticEventCount(t, store)

	result, err := service.ProcessCartographerWindow(ctx, testWorkspaceID, window.ID)
	if err != nil {
		t.Fatalf("process cartographer window with harness failure: %v", err)
	}
	if result.Window.Status != CartographerWindowProcessed {
		t.Fatalf("processed failed window status = %s, want processed", result.Window.Status)
	}
	if result.Run.Status != CartographerRunFailed ||
		!cartographerDiagnosticsContain(result.Run.Diagnostics, result.Patches, "harness_failed") ||
		!strings.Contains(result.Run.Error, "structured transport unavailable") {
		t.Fatalf("failed run audit = %+v, want visible harness failure", result.Run)
	}
	if result.Patches == nil || result.Events == nil || result.Run.CreatedSemanticEventIDs == nil || result.Run.Diagnostics == nil {
		t.Fatalf("failed result contains nil contract arrays: %+v", result)
	}
	if after := semanticEventCount(t, store); after != before {
		t.Fatalf("semantic event count after harness failure = %d, want %d", after, before)
	}
}

func TestCartographerPatchEnvelopeAcceptsEmptyPatchListAsNoMutationAudit(t *testing.T) {
	service, store := newCartographerPatchApplicationTestService(t)
	ctx := context.Background()
	seedCartographerPatchEvidence(t, store)
	before := semanticEventCount(t, store)
	input := cartographerPatchApplicationInput(t, "cartographer_run_empty_envelope", nil)
	input.RawHarnessResponse = []byte(`{"patches":[]}`)

	result, err := service.ApplyCartographerPatchEnvelope(ctx, input)
	if err != nil {
		t.Fatalf("apply empty cartographer envelope: %v", err)
	}
	if result.Run.Status != CartographerRunCompletedNoop ||
		!cartographerDiagnosticsContain(result.Run.Diagnostics, result.Patches, "empty_envelope") ||
		len(result.Patches) != 0 ||
		len(result.Events) != 0 {
		t.Fatalf("empty envelope result = %+v, want completed no-op audit", result)
	}
	if result.Patches == nil || result.Events == nil || result.Run.CreatedSemanticEventIDs == nil || result.Run.Diagnostics == nil {
		t.Fatalf("empty envelope result contains nil contract arrays: %+v", result)
	}
	if after := semanticEventCount(t, store); after != before {
		t.Fatalf("semantic event count after empty envelope = %d, want %d", after, before)
	}
}

func newCartographerRunnerTestService(t *testing.T, runner chat.HarnessTaskRunner) (*Service, *Store) {
	t.Helper()
	store := newTestStore(t)
	now, err := time.Parse(time.RFC3339Nano, testTimestamp(50))
	if err != nil {
		t.Fatalf("parse fixed time: %v", err)
	}
	service, err := NewService(
		store,
		associationWorkspaceResolver{root: t.TempDir()},
		WithIDGenerator(countingIDGenerator()),
		WithClock(func() time.Time { return now }),
		WithCartographerHarnessTaskRunner(runner, chat.HarnessCodex),
	)
	if err != nil {
		t.Fatalf("new cartographer runner service: %v", err)
	}
	return service, store
}

func buildRunnerCartographerWindow(t *testing.T, service *Service) CartographerWindow {
	t.Helper()
	window, err := service.BuildManualCartographerWindow(context.Background(), CartographerManualWindowRequest{
		WorkspaceID:    testWorkspaceID,
		TriggerKind:    CartographerTriggerManual,
		TargetEntityID: "node_cartographer_source",
		SourceRefs: SemanticContextSourceRefs{
			ChatRunID: "chat_run_cartographer",
			RunItemID: "run_item_cartographer",
		},
		Summary: "Process the current cartographer test window.",
	})
	if err != nil {
		t.Fatalf("build runner cartographer window: %v", err)
	}
	return window
}

type failingCartographerTaskRunner struct{}

func (failingCartographerTaskRunner) RunTask(context.Context, chat.HarnessTaskRequest) (chat.HarnessTaskResult, error) {
	return chat.HarnessTaskResult{}, errors.New("structured transport unavailable")
}
