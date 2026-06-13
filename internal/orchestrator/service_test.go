package orchestrator

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/workspace"
)

func TestServicePersistsVersionsExecutionsEventsAndRecoversRunningRuns(t *testing.T) {
	runner := newRecordingActionRunner()
	runner.recover = func(request ActionRecoverRequest) ActionRecoverResult {
		return ActionRecoverResult{
			Outcome:    RunnerRecoveryOutcomeRecoveredCompleted,
			Result:     &WorkflowActionResult{Status: ActionCompletionCompleted},
			RunnerRefs: request.RunnerRefs,
			Message:    "recovered completed action",
		}
	}
	store, resolver, service, workspaceID := newTestWorkflowServiceWithRunner(t, runner)
	definition, firstVersionID, running := createRunningFirstVersion(t, service, workspaceID)
	updated, second := updateDefinitionAndStartLatest(t, service, workspaceID, definition, firstVersionID)
	if updated.ID != definition.ID {
		t.Fatalf("updated definition id = %s, want %s", updated.ID, definition.ID)
	}
	assertLatestVersionCompleted(t, service, second, firstVersionID)
	assertExecutionEventsPersisted(t, service, workspaceID, running.ID)
	assertRunningExecutionRecovered(t, store, resolver, runner, workspaceID, running.ID)
}

func TestServiceStoresDefinitionsAsWorkspaceJSONAndSnapshotsOnStart(t *testing.T) {
	store, resolver, service, workspaceID := newTestWorkflowService(t)
	workspaceRoot := resolver.workspaces[workspaceID].RootPath

	definition, err := service.CreateDefinition(workspaceID, "Review Flow", "workspace file", startEndGraph())
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	definitionPath := workflowDefinitionPath(workspaceRoot, definition.Name, definition.ID)
	content, err := os.ReadFile(definitionPath)
	if err != nil {
		t.Fatalf("read definition file: %v", err)
	}
	raw := string(content)
	for _, forbidden := range []string{"workspaceId", "currentVersionId", "currentVersionNumber", "updatedAt"} {
		if strings.Contains(raw, forbidden) {
			t.Fatalf("definition file contains %s: %s", forbidden, raw)
		}
	}
	if !strings.Contains(raw, `"graph"`) {
		t.Fatalf("definition file missing graph: %s", raw)
	}
	latestVersionNumber, err := store.LatestDefinitionVersionNumber(workspaceID, definition.ID)
	if err != nil {
		t.Fatalf("read latest version number: %v", err)
	}
	if latestVersionNumber != 0 {
		t.Fatalf("latest version before run = %d, want 0", latestVersionNumber)
	}

	updated, err := service.UpdateDefinition(workspaceID, definition.ID, "Review Flow Updated", "workspace file", startEndGraph())
	if err != nil {
		t.Fatalf("update definition: %v", err)
	}
	if _, err := os.Stat(definitionPath); !os.IsNotExist(err) {
		t.Fatalf("old definition path still exists or stat failed unexpectedly: %v", err)
	}
	updatedPath := workflowDefinitionPath(workspaceRoot, updated.Name, updated.ID)
	if _, err := os.Stat(updatedPath); err != nil {
		t.Fatalf("updated definition path missing: %v", err)
	}
	latestVersionNumber, err = store.LatestDefinitionVersionNumber(workspaceID, definition.ID)
	if err != nil {
		t.Fatalf("read latest version number after update: %v", err)
	}
	if latestVersionNumber != 0 {
		t.Fatalf("latest version after update = %d, want 0", latestVersionNumber)
	}

	started, err := service.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	if started.DefinitionVersionID == "" {
		t.Fatal("started execution has empty definition version id")
	}
	version, err := store.LoadDefinitionVersion(workspaceID, definition.ID, started.DefinitionVersionID)
	if err != nil {
		t.Fatalf("load execution version: %v", err)
	}
	if version.VersionNumber != 1 || version.Name != updated.Name {
		t.Fatalf("version snapshot = %+v, want version 1 named %s", version, updated.Name)
	}
}

func TestServiceStoresNullWorkflowDraftAndRejectsRun(t *testing.T) {
	_, resolver, service, workspaceID := newTestWorkflowService(t)
	workspaceRoot := resolver.workspaces[workspaceID].RootPath

	definition, err := service.CreateDefinition(workspaceID, "Untitled workflow", "", WorkflowGraph{})
	if err != nil {
		t.Fatalf("create null workflow definition: %v", err)
	}
	if len(definition.Graph.Nodes) != 0 || len(definition.Graph.Edges) != 0 {
		t.Fatalf("null workflow graph = %+v, want empty nodes and edges", definition.Graph)
	}
	definitionPath := workflowDefinitionPath(workspaceRoot, definition.Name, definition.ID)
	raw, err := os.ReadFile(definitionPath)
	if err != nil {
		t.Fatalf("read null workflow definition file: %v", err)
	}
	for _, expected := range []string{`"nodes": []`, `"edges": []`, `"layout": {`} {
		if !strings.Contains(string(raw), expected) {
			t.Fatalf("definition file missing %s: %s", expected, raw)
		}
	}

	_, err = service.StartExecution(workspaceID, definition.ID, "")
	if err == nil {
		t.Fatal("start null workflow succeeded, want validation error")
	}
	if !strings.Contains(err.Error(), "blank workflow cannot be run") {
		t.Fatalf("start null workflow error = %v, want null workflow validation", err)
	}
}

func TestServiceStoresValidationStateUntilExecutableGraphChanges(t *testing.T) {
	_, _, service, workspaceID := newTestWorkflowService(t)
	definition, err := service.CreateDefinition(workspaceID, "Validated", "", startEndGraph())
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}

	validated, err := service.ValidateDefinitionDraft(workspaceID, definition.ID)
	if err != nil {
		t.Fatalf("validate draft: %v", err)
	}
	if validated.Validation.Status != WorkflowValidationCurrent ||
		validated.Validation.Snapshot == nil ||
		!validated.Validation.Snapshot.Result.Valid {
		t.Fatalf("validated projection state = %+v, want current valid snapshot", validated.Validation)
	}
	graphFingerprint := validated.Validation.CurrentGraphFingerprint

	moved, err := service.UpdateDefinitionLayout(workspaceID, definition.ID, []WorkflowGraphNodeLayout{
		{NodeID: "start", X: -240, Y: 12},
		{NodeID: "end", X: 80, Y: 12},
	})
	if err != nil {
		t.Fatalf("update definition layout: %v", err)
	}
	if moved.Validation.Status != WorkflowValidationCurrent {
		t.Fatalf("layout-only validation status = %s, want current", moved.Validation.Status)
	}
	if moved.Validation.CurrentGraphFingerprint != graphFingerprint {
		t.Fatalf("layout-only fingerprint = %s, want %s", moved.Validation.CurrentGraphFingerprint, graphFingerprint)
	}
	if projectedLayoutNodeForTest(t, moved, "start").X != -240 {
		t.Fatalf("updated start layout = %+v, want x=-240", projectedLayoutNodeForTest(t, moved, "start"))
	}

	updatedGraph := startEndGraph()
	updatedGraph.Edges = []WorkflowEdge{}
	if _, err := service.UpdateDefinition(workspaceID, definition.ID, definition.Name, definition.Description, updatedGraph); err != nil {
		t.Fatalf("update definition graph: %v", err)
	}
	stale, ok, err := service.ReadGraphProjection(workspaceID, definition.ID, "", "")
	if err != nil {
		t.Fatalf("read projection: %v", err)
	}
	if !ok {
		t.Fatal("projection missing after graph update")
	}
	if stale.Validation.Status != WorkflowValidationStale {
		t.Fatalf("graph-change validation status = %s, want stale", stale.Validation.Status)
	}
	if stale.Validation.Snapshot == nil || !stale.Validation.Snapshot.Result.Valid {
		t.Fatalf("stale validation snapshot = %+v, want previous valid snapshot", stale.Validation.Snapshot)
	}
}

func TestServiceRejectsWorkflowLayoutForUnknownNode(t *testing.T) {
	_, _, service, workspaceID := newTestWorkflowService(t)
	definition, err := service.CreateDefinition(workspaceID, "Layout", "", startEndGraph())
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	_, err = service.UpdateDefinitionLayout(workspaceID, definition.ID, []WorkflowGraphNodeLayout{
		{NodeID: "missing", X: 0, Y: 0},
	})
	if err == nil {
		t.Fatal("update layout with missing node succeeded, want error")
	}
	if !strings.Contains(err.Error(), "unknown node missing") {
		t.Fatalf("layout error = %v, want unknown node", err)
	}
}

func TestServiceStartupRecoveryRequiresManualStateForUncertainSideEffects(t *testing.T) {
	runner := newRecordingActionRunner()
	runner.recover = func(request ActionRecoverRequest) ActionRecoverResult {
		return ActionRecoverResult{
			Outcome:    RunnerRecoveryOutcomeManualRecoveryRequired,
			RunnerRefs: request.RunnerRefs,
			Message:    "side effects are uncertain",
		}
	}
	store, resolver, service, workspaceID := newTestWorkflowServiceWithRunner(t, runner)
	definition, err := service.CreateDefinition(workspaceID, "Manual recovery", "", actionGraph("work"))
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	started, err := service.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	work := latestNodeExecutionForTest(t, started, "work")
	if work.Status != NodeExecutionStatusRunning {
		t.Fatalf("work status = %s, want running", work.Status)
	}

	restarted, err := NewService(store, resolver, WithIDGenerator(deterministicIDGenerator()), WithClock(fixedTestClock(t)), WithRunnerRegistry(DefaultRunnerRegistry().WithRunner(runner)))
	if err != nil {
		t.Fatalf("restart service: %v", err)
	}
	defer restarted.CloseEvents()
	recovered, err := restarted.ReadExecution(workspaceID, started.ID)
	if err != nil {
		t.Fatalf("read recovered execution: %v", err)
	}
	if recovered.Status != ExecutionStatusRunning {
		t.Fatalf("execution status = %s, want running manual recovery state", recovered.Status)
	}
	recoveredWork := latestNodeExecutionForTest(t, recovered, "work")
	if recoveredWork.Status != NodeExecutionStatusRecoveryRequired {
		t.Fatalf("work status = %s, want recovery_required", recoveredWork.Status)
	}
	if recoveredWork.RecoveryOutcome == nil || *recoveredWork.RecoveryOutcome != RunnerRecoveryOutcomeManualRecoveryRequired {
		t.Fatalf("recovery outcome = %v, want manual_recovery_required", recoveredWork.RecoveryOutcome)
	}
	if recoveredWork.RecoveryMessage != "side effects are uncertain" {
		t.Fatalf("recovery message = %q, want side effects are uncertain", recoveredWork.RecoveryMessage)
	}
	if recoveredWork.RunnerState == nil || recoveredWork.RunnerState.Status != RunnerStateStatusRecoveryRequired {
		t.Fatalf("runner state = %+v, want recovery_required", recoveredWork.RunnerState)
	}
	assertWorkflowEventsInclude(t, restarted, workspaceID, started.ID, []WorkflowEventType{EventActionRecoveryRequired})
}

func TestServiceCancelsSiblingRunnerWhenActionFails(t *testing.T) {
	runner := newRecordingActionRunner()
	_, _, service, workspaceID := newTestWorkflowServiceWithRunner(t, runner)
	definition, err := service.CreateDefinition(workspaceID, "Parallel", "", parallelActionGraph())
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	started, err := service.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	branchA := latestNodeExecutionForTest(t, started, "branch_a")
	branchB := latestNodeExecutionForTest(t, started, "branch_b")
	if branchA.Status != NodeExecutionStatusRunning || branchB.Status != NodeExecutionStatusRunning {
		t.Fatalf("branch statuses = %s/%s, want running/running", branchA.Status, branchB.Status)
	}

	failed, err := service.CompleteAction(workspaceID, started.ID, branchA.ID, WorkflowActionResult{Status: ActionCompletionFailed, Error: "boom"})
	if err != nil {
		t.Fatalf("complete failed branch: %v", err)
	}
	if failed.Status != ExecutionStatusFailed {
		t.Fatalf("execution status = %s, want failed", failed.Status)
	}
	cancelled := runner.cancelRequestForNodeExecution(branchB.ID)
	if cancelled.NodeExecution.ID != branchB.ID {
		t.Fatalf("cancelled node execution = %+v, want %s", cancelled.NodeExecution, branchB.ID)
	}
	if runnerRefValue(cancelled.RunnerRefs, "test.runner") != branchB.ID {
		t.Fatalf("cancel refs = %+v, want test runner ref %s", cancelled.RunnerRefs, branchB.ID)
	}
}

func TestServiceCancelsRunnerRefsThatAttachAfterExecutionCancellation(t *testing.T) {
	runner := newBlockingActionRunner()
	_, _, service, workspaceID := newTestWorkflowServiceWithRunner(t, runner)
	definition, err := service.CreateDefinition(workspaceID, "In-flight", "", actionGraph("work"))
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	type startResult struct {
		execution WorkflowExecution
		err       error
	}
	started := make(chan startResult, 1)
	go func() {
		execution, err := service.StartExecution(workspaceID, definition.ID, "")
		started <- startResult{execution: execution, err: err}
	}()

	request := runner.waitForStart(t)
	cancelled, err := service.CancelExecution(workspaceID, request.Execution.ID)
	if err != nil {
		t.Fatalf("cancel execution while runner start is blocked: %v", err)
	}
	if cancelled.Status != ExecutionStatusCancelled {
		t.Fatalf("cancelled status = %s, want cancelled", cancelled.Status)
	}

	runner.releaseStart()
	result := <-started
	if result.err != nil {
		t.Fatalf("start execution returned error: %v", result.err)
	}
	if result.execution.Status != ExecutionStatusCancelled {
		t.Fatalf("start execution result status = %s, want cancelled", result.execution.Status)
	}
	cancelledWithRefs := runner.cancelRequestWithRef(request.NodeExecution.ID, "test.runner")
	if cancelledWithRefs.NodeExecution.ID != request.NodeExecution.ID {
		t.Fatalf("late cancel request = %+v, want node execution %s", cancelledWithRefs.NodeExecution, request.NodeExecution.ID)
	}
}

func newTestWorkflowService(t *testing.T) (*Store, testWorkspaceResolver, *Service, string) {
	t.Helper()
	return newTestWorkflowServiceWithOptions(t)
}

func newTestWorkflowServiceWithRunner(t *testing.T, runner ActionRunner) (*Store, testWorkspaceResolver, *Service, string) {
	t.Helper()
	return newTestWorkflowServiceWithOptions(t, WithRunnerRegistry(DefaultRunnerRegistry().WithRunner(runner)))
}

func newTestWorkflowServiceWithOptions(t *testing.T, options ...Option) (*Store, testWorkspaceResolver, *Service, string) {
	t.Helper()
	appDataDir := t.TempDir()
	workspaceID := "workspace_test"
	resolver := testWorkspaceResolver{
		workspaces: map[string]workspace.WorkspaceSummary{
			workspaceID: {
				ID:          workspaceID,
				RootPath:    t.TempDir(),
				DisplayName: "Workspace",
			},
		},
	}
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Fatalf("close workflow store: %v", err)
		}
	})
	serviceOptions := append([]Option{WithIDGenerator(deterministicIDGenerator()), WithClock(fixedTestClock(t))}, options...)
	service, err := NewService(store, resolver, serviceOptions...)
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	t.Cleanup(service.CloseEvents)
	return store, resolver, service, workspaceID
}

func createRunningFirstVersion(t *testing.T, service *Service, workspaceID string) (WorkflowDefinition, string, WorkflowExecution) {
	t.Helper()
	definition, err := service.CreateDefinition(workspaceID, "Review", "first graph", actionGraph("work"))
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	running, err := service.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start first execution: %v", err)
	}
	firstVersionID := running.DefinitionVersionID
	if running.Status != ExecutionStatusRunning {
		t.Fatalf("first execution status = %s, want running", running.Status)
	}
	if firstVersionID == "" {
		t.Fatal("first execution version id is empty")
	}
	if running.DefinitionVersionID != firstVersionID {
		t.Fatalf("first execution version = %s, want %s", running.DefinitionVersionID, firstVersionID)
	}
	return definition, firstVersionID, running
}

func updateDefinitionAndStartLatest(t *testing.T, service *Service, workspaceID string, definition WorkflowDefinition, firstVersionID string) (WorkflowDefinition, WorkflowExecution) {
	t.Helper()
	updated, err := service.UpdateDefinition(workspaceID, definition.ID, "Review", "second graph", startEndGraph())
	if err != nil {
		t.Fatalf("update definition: %v", err)
	}
	second, err := service.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start second execution: %v", err)
	}
	if second.DefinitionVersionID == firstVersionID {
		t.Fatalf("second execution reused version id %s", firstVersionID)
	}
	return updated, second
}

func assertLatestVersionCompleted(t *testing.T, service *Service, execution WorkflowExecution, firstVersionID string) {
	t.Helper()
	if execution.Status != ExecutionStatusCompleted {
		t.Fatalf("second execution status = %s, want completed", execution.Status)
	}
	if execution.DefinitionVersionID == "" || execution.DefinitionVersionID == firstVersionID {
		t.Fatalf("second execution version = %s, want new version after %s", execution.DefinitionVersionID, firstVersionID)
	}
	version, err := service.store.LoadDefinitionVersion(execution.WorkspaceID, execution.DefinitionID, execution.DefinitionVersionID)
	if err != nil {
		t.Fatalf("load second execution version: %v", err)
	}
	if version.VersionNumber != 2 {
		t.Fatalf("second version number = %d, want 2", version.VersionNumber)
	}
}

func assertExecutionEventsPersisted(t *testing.T, service *Service, workspaceID string, executionID string) {
	t.Helper()
	page, err := service.ReadExecutionEventPage(workspaceID, executionID, 0, 10)
	if err != nil {
		t.Fatalf("read execution events: %v", err)
	}
	if len(page.Events) == 0 {
		t.Fatalf("event page is empty")
	}
}

func assertRunningExecutionRecovered(t *testing.T, store *Store, resolver testWorkspaceResolver, runner *recordingActionRunner, workspaceID string, executionID string) {
	t.Helper()
	restarted, err := NewService(store, resolver, WithIDGenerator(deterministicIDGenerator()), WithClock(fixedTestClock(t)), WithRunnerRegistry(DefaultRunnerRegistry().WithRunner(runner)))
	if err != nil {
		t.Fatalf("restart service: %v", err)
	}
	defer restarted.CloseEvents()
	recovered, err := restarted.ReadExecution(workspaceID, executionID)
	if err != nil {
		t.Fatalf("read recovered execution: %v", err)
	}
	if recovered.Status != ExecutionStatusCompleted {
		t.Fatalf("recovered execution status = %s, want completed", recovered.Status)
	}
	if len(runner.recoverRequests()) == 0 {
		t.Fatal("runner recover was not called")
	}
	work := latestNodeExecutionForTest(t, recovered, "work")
	if work.Status != NodeExecutionStatusSucceeded {
		t.Fatalf("recovered work status = %s, want succeeded", work.Status)
	}
	if work.RecoveryOutcome == nil || *work.RecoveryOutcome != RunnerRecoveryOutcomeRecoveredCompleted {
		t.Fatalf("work recovery outcome = %v, want recovered_completed", work.RecoveryOutcome)
	}
	assertWorkflowEventsInclude(t, restarted, workspaceID, executionID, []WorkflowEventType{EventActionRecovered, EventActionCompleted})
}

type testWorkspaceResolver struct {
	workspaces map[string]workspace.WorkspaceSummary
}

func (resolver testWorkspaceResolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	summary, ok := resolver.workspaces[id]
	if !ok {
		return workspace.WorkspaceSummary{}, fmt.Errorf("workspace %s was not found", id)
	}
	return summary, nil
}

func actionGraph(actionID string) WorkflowGraph {
	return WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode(actionID),
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_" + actionID, FromNodeID: "start", ToNodeID: actionID, Kind: EdgeKindNormal},
			{ID: actionID + "_end", FromNodeID: actionID, ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
}

func parallelActionGraph() WorkflowGraph {
	return WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("branch_a"),
			testActionNode("branch_b"),
			{ID: "join", Kind: NodeKindGatewayAND, Gateway: &WorkflowGatewayConfig{}},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_a", FromNodeID: "start", ToNodeID: "branch_a", Kind: EdgeKindNormal},
			{ID: "start_b", FromNodeID: "start", ToNodeID: "branch_b", Kind: EdgeKindNormal},
			{ID: "a_join", FromNodeID: "branch_a", ToNodeID: "join", Kind: EdgeKindNormal},
			{ID: "b_join", FromNodeID: "branch_b", ToNodeID: "join", Kind: EdgeKindNormal},
			{ID: "join_end", FromNodeID: "join", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
}

func startEndGraph() WorkflowGraph {
	return WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_end", FromNodeID: "start", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
}

type recordingActionRunner struct {
	mu       sync.Mutex
	cancels  []ActionCancelRequest
	recovers []ActionRecoverRequest
	recover  func(ActionRecoverRequest) ActionRecoverResult
}

func newRecordingActionRunner() *recordingActionRunner {
	return &recordingActionRunner{}
}

func (runner *recordingActionRunner) Kind() WorkflowActionKind {
	return ActionKindAgentCodex
}

func (runner *recordingActionRunner) Capabilities(config WorkflowActionConfig) (RunnerCapabilities, error) {
	return CodexActionRunnerDescriptor{}.Capabilities(config)
}

func (runner *recordingActionRunner) ValidateConfig(config WorkflowActionConfig) []RunnerConfigDiagnostic {
	return CodexActionRunnerDescriptor{}.ValidateConfig(config)
}

func (runner *recordingActionRunner) Start(_ context.Context, request ActionStartRequest, _ RunnerEventSink) (ActionStartResult, error) {
	return ActionStartResult{RunnerRefs: []WorkflowActionRunnerRef{{Kind: "test.runner", ID: request.NodeExecution.ID}}}, nil
}

func (runner *recordingActionRunner) Cancel(_ context.Context, request ActionCancelRequest) error {
	runner.mu.Lock()
	defer runner.mu.Unlock()
	runner.cancels = append(runner.cancels, request)
	return nil
}

func (runner *recordingActionRunner) Signal(_ context.Context, _ ActionSignalRequest) (ActionSignalResult, error) {
	return ActionSignalResult{}, nil
}

func (runner *recordingActionRunner) Recover(_ context.Context, request ActionRecoverRequest, _ RunnerEventSink) (ActionRecoverResult, error) {
	runner.mu.Lock()
	defer runner.mu.Unlock()
	runner.recovers = append(runner.recovers, request)
	if runner.recover != nil {
		return runner.recover(request), nil
	}
	return ActionRecoverResult{Outcome: RunnerRecoveryOutcomeFailedInterrupted}, nil
}

func (runner *recordingActionRunner) recoverRequests() []ActionRecoverRequest {
	runner.mu.Lock()
	defer runner.mu.Unlock()
	return append([]ActionRecoverRequest{}, runner.recovers...)
}

func (runner *recordingActionRunner) cancelRequestForNodeExecution(nodeExecutionID string) ActionCancelRequest {
	runner.mu.Lock()
	defer runner.mu.Unlock()
	for _, request := range runner.cancels {
		if request.NodeExecution.ID == nodeExecutionID {
			return request
		}
	}
	return ActionCancelRequest{}
}

type blockingActionRunner struct {
	recordingActionRunner
	release chan struct{}
	started chan ActionStartRequest
}

func newBlockingActionRunner() *blockingActionRunner {
	return &blockingActionRunner{
		release: make(chan struct{}),
		started: make(chan ActionStartRequest, 1),
	}
}

func (runner *blockingActionRunner) Start(_ context.Context, request ActionStartRequest, _ RunnerEventSink) (ActionStartResult, error) {
	runner.started <- request
	<-runner.release
	return ActionStartResult{RunnerRefs: []WorkflowActionRunnerRef{{Kind: "test.runner", ID: request.NodeExecution.ID}}}, nil
}

func (runner *blockingActionRunner) waitForStart(t *testing.T) ActionStartRequest {
	t.Helper()
	select {
	case request := <-runner.started:
		return request
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for runner start")
		return ActionStartRequest{}
	}
}

func (runner *blockingActionRunner) releaseStart() {
	close(runner.release)
}

func (runner *blockingActionRunner) cancelRequestWithRef(nodeExecutionID string, refKind string) ActionCancelRequest {
	runner.mu.Lock()
	defer runner.mu.Unlock()
	for _, request := range runner.cancels {
		if request.NodeExecution.ID == nodeExecutionID && runnerRefValue(request.RunnerRefs, refKind) != "" {
			return request
		}
	}
	return ActionCancelRequest{}
}

func fixedTestClock(t *testing.T) func() time.Time {
	t.Helper()
	value, err := time.Parse(time.RFC3339, testNow)
	if err != nil {
		t.Fatalf("parse test time: %v", err)
	}
	return func() time.Time {
		return value
	}
}

func latestNodeExecutionForTest(t *testing.T, execution WorkflowExecution, nodeID string) WorkflowNodeExecution {
	t.Helper()
	for index := len(execution.NodeExecutions) - 1; index >= 0; index-- {
		if execution.NodeExecutions[index].NodeID == nodeID {
			return execution.NodeExecutions[index]
		}
	}
	t.Fatalf("node execution for %s was not found in %+v", nodeID, execution.NodeExecutions)
	return WorkflowNodeExecution{}
}
