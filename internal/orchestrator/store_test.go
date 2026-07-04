package orchestrator

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestStorePersistsWorkflowStateInSQLiteWithoutWorkflowJSONFiles(t *testing.T) {
	appDataDir := t.TempDir()
	store := newSQLiteWorkflowStoreForTest(t, appDataDir)
	definition, version := storeTestDefinition(startEndGraph())
	if err := store.SaveDefinitionVersion(version); err != nil {
		t.Fatalf("save definition version: %v", err)
	}
	transition, err := StartExecution(version, testTransitionContext())
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	envelopes, err := store.PersistTransition(transition)
	if err != nil {
		t.Fatalf("persist transition: %v", err)
	}
	if len(envelopes) != len(transition.Events) {
		t.Fatalf("envelope count = %d, want %d", len(envelopes), len(transition.Events))
	}
	loaded, err := store.LoadExecution(definition.WorkspaceID, transition.Execution.ID)
	if err != nil {
		t.Fatalf("load execution: %v", err)
	}
	if loaded.Status != transition.Execution.Status || loaded.LastEventOrdinal != transition.Execution.LastEventOrdinal {
		t.Fatalf("loaded execution status/ordinal = %s/%d, want %s/%d", loaded.Status, loaded.LastEventOrdinal, transition.Execution.Status, transition.Execution.LastEventOrdinal)
	}
	assertPathMissing(t, filepath.Join(appDataDir, "workspaces", definition.WorkspaceID, "workflows"))
	assertPathMissing(t, filepath.Join(appDataDir, "workflow-events"))
	assertPathExists(t, filepath.Join(appDataDir, workflowDatabaseName))
}

func TestStoreReplaysWorkflowEventsAfterReopen(t *testing.T) {
	appDataDir := t.TempDir()
	store := newSQLiteWorkflowStoreForTest(t, appDataDir)
	_, version := storeTestDefinition(startEndGraph())
	if err := store.SaveDefinitionVersion(version); err != nil {
		t.Fatalf("save definition version: %v", err)
	}
	transition, err := StartExecution(version, testTransitionContext())
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	envelopes, err := store.PersistTransition(transition)
	if err != nil {
		t.Fatalf("persist transition: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close workflow store: %v", err)
	}

	reopened := newSQLiteWorkflowStoreForTest(t, appDataDir)
	replayed, err := reopened.LoadWorkflowEventStreamAfter(WorkflowEventCursor{StreamID: WorkflowEventStreamID, Sequence: envelopes[0].Sequence})
	if err != nil {
		t.Fatalf("load workflow event stream after reopen: %v", err)
	}
	if len(replayed) != len(envelopes)-1 {
		t.Fatalf("replayed events = %d, want %d", len(replayed), len(envelopes)-1)
	}
	if replayed[0].Sequence != envelopes[1].Sequence || replayed[0].Event.ID != envelopes[1].Event.ID {
		t.Fatalf("first replayed event = %+v, want %+v", replayed[0], envelopes[1])
	}
}

func TestStoreRollsBackMaterializedStateWhenEventInsertFails(t *testing.T) {
	appDataDir := t.TempDir()
	store := newSQLiteWorkflowStoreForTest(t, appDataDir)
	definition, version := storeTestDefinition(actionGraph("work"))
	if err := store.SaveDefinitionVersion(version); err != nil {
		t.Fatalf("save definition version: %v", err)
	}
	transition, err := StartExecution(version, testTransitionContext())
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	if _, err := store.PersistTransition(transition); err != nil {
		t.Fatalf("persist initial transition: %v", err)
	}
	page, err := store.LoadExecutionEventPage(definition.WorkspaceID, transition.Execution.ID, 0, 10)
	if err != nil {
		t.Fatalf("load event page: %v", err)
	}
	if len(page.Events) == 0 {
		t.Fatal("event page is empty")
	}
	badExecution := transition.Execution
	badExecution.Status = ExecutionStatusCancelled
	reason := TerminalReasonExecutionCancelled
	badExecution.TerminalReason = &reason
	badExecution.CompletedAt = testNow
	badExecution.LastEventOrdinal++
	badEvent := WorkflowEvent{
		SchemaVersion:       SchemaVersion,
		ID:                  page.Events[0].ID,
		WorkspaceID:         badExecution.WorkspaceID,
		DefinitionID:        badExecution.DefinitionID,
		DefinitionVersionID: badExecution.DefinitionVersionID,
		ExecutionID:         badExecution.ID,
		Ordinal:             badExecution.LastEventOrdinal,
		Type:                EventExecutionCancelled,
		CreatedAt:           testNow,
		Message:             "duplicate event id should roll back materialized state",
	}
	if _, err := store.PersistTransition(WorkflowTransition{Execution: badExecution, Events: []WorkflowEvent{badEvent}}); err == nil {
		t.Fatal("persist duplicate event succeeded, want error")
	}
	loaded, err := store.LoadExecution(definition.WorkspaceID, transition.Execution.ID)
	if err != nil {
		t.Fatalf("load execution after failed transition: %v", err)
	}
	if loaded.Status != transition.Execution.Status || loaded.LastEventOrdinal != transition.Execution.LastEventOrdinal || loaded.TerminalReason != nil {
		t.Fatalf("loaded execution after rollback = status %s ordinal %d terminal %v, want status %s ordinal %d no terminal", loaded.Status, loaded.LastEventOrdinal, loaded.TerminalReason, transition.Execution.Status, transition.Execution.LastEventOrdinal)
	}
}

func TestStorePersistExecutionStartRollsBackVersionWhenEventInsertFails(t *testing.T) {
	store := newSQLiteWorkflowStoreForTest(t, t.TempDir())
	definition, firstVersion := storeTestDefinition(startEndGraph())
	if err := store.SaveDefinitionVersion(firstVersion); err != nil {
		t.Fatalf("save first definition version: %v", err)
	}
	firstTransition, err := StartExecution(firstVersion, testTransitionContext())
	if err != nil {
		t.Fatalf("start first execution: %v", err)
	}
	if _, err := store.PersistTransition(firstTransition); err != nil {
		t.Fatalf("persist first execution: %v", err)
	}
	page, err := store.LoadExecutionEventPage(definition.WorkspaceID, firstTransition.Execution.ID, 0, 10)
	if err != nil {
		t.Fatalf("load first execution event page: %v", err)
	}
	if len(page.Events) == 0 {
		t.Fatal("first execution event page is empty")
	}

	secondVersion := storeTestVersion(definition.WorkspaceID, definition.ID, "workflow_version_start_rollback", 2, startEndGraph(), "2026-06-05T12:01:00Z")
	secondTransition, err := StartExecution(secondVersion, TransitionContext{
		Now:   "2026-06-05T12:01:00Z",
		NewID: deterministicIDGenerator(),
	})
	if err != nil {
		t.Fatalf("start second execution transition: %v", err)
	}
	secondTransition.Events[0].ID = page.Events[0].ID

	if _, err := store.PersistExecutionStart(secondVersion, secondTransition); err == nil {
		t.Fatal("persist execution start with duplicate event succeeded, want error")
	}
	latest, err := store.LatestDefinitionVersionNumber(definition.WorkspaceID, definition.ID)
	if err != nil {
		t.Fatalf("read latest version after rollback: %v", err)
	}
	if latest != 1 {
		t.Fatalf("latest version after failed start = %d, want 1", latest)
	}
	if _, err := store.LoadDefinitionVersion(definition.WorkspaceID, definition.ID, secondVersion.ID); err == nil {
		t.Fatal("load rolled-back version succeeded, want missing version")
	}
	executions, err := store.ListExecutions(definition.WorkspaceID)
	if err != nil {
		t.Fatalf("list executions after failed start: %v", err)
	}
	for _, execution := range executions {
		if execution.ID == secondTransition.Execution.ID {
			t.Fatalf("failed start left execution behind: %+v", execution)
		}
	}
}

func TestStoreListExecutionSummariesForDefinitionScopesByWorkspaceAndDefinition(t *testing.T) {
	store := newSQLiteWorkflowStoreForTest(t, t.TempDir())
	targetV1 := storeTestVersion("workspace_a", "workflow_definition_shared", "workflow_version_target_1", 1, actionGraph("target_work"), "2026-06-05T12:00:00Z")
	targetV2 := storeTestVersion("workspace_a", "workflow_definition_shared", "workflow_version_target_2", 2, actionGraph("target_work"), "2026-06-05T12:10:00Z")
	otherWorkspace := storeTestVersion("workspace_b", "workflow_definition_shared", "workflow_version_other_workspace", 3, actionGraph("other_workspace_work"), "2026-06-05T12:20:00Z")
	otherDefinition := storeTestVersion("workspace_a", "workflow_definition_other", "workflow_version_other_definition", 1, actionGraph("other_definition_work"), "2026-06-05T12:30:00Z")
	for _, version := range []WorkflowDefinitionVersion{targetV1, targetV2, otherWorkspace, otherDefinition} {
		if err := store.SaveDefinitionVersion(version); err != nil {
			t.Fatalf("save version %s: %v", version.ID, err)
		}
	}
	first := persistStoreTestExecution(t, store, targetV1, "2026-06-05T12:01:00Z")
	cancelledTransition, err := CancelExecution(first, TransitionContext{
		Now:   "2026-06-05T12:02:00Z",
		NewID: deterministicIDGenerator(),
	})
	if err != nil {
		t.Fatalf("cancel first execution: %v", err)
	}
	if _, err := store.PersistTransition(cancelledTransition); err != nil {
		t.Fatalf("persist cancelled execution: %v", err)
	}
	active := persistStoreTestExecution(t, store, targetV2, "2026-06-05T12:11:00Z")
	otherWorkspaceExecution := persistStoreTestExecution(t, store, otherWorkspace, "2026-06-05T12:21:00Z")
	otherDefinitionExecution := persistStoreTestExecution(t, store, otherDefinition, "2026-06-05T12:31:00Z")

	summaries, err := store.ListExecutionSummariesForDefinition("workspace_a", "workflow_definition_shared", 0)
	if err != nil {
		t.Fatalf("list summaries: %v", err)
	}
	if len(summaries) != 2 {
		t.Fatalf("summaries = %+v, want active and cancelled target executions", summaries)
	}
	if summaries[0].ID != active.ID || summaries[0].DefinitionVersionNumber != 2 {
		t.Fatalf("newest summary = %+v, want active version 2 execution %s", summaries[0], active.ID)
	}
	if summaries[1].ID != cancelledTransition.Execution.ID || summaries[1].Status != ExecutionStatusCancelled {
		t.Fatalf("older summary = %+v, want cancelled execution %s", summaries[1], cancelledTransition.Execution.ID)
	}
	for _, summary := range summaries {
		if summary.ID == otherWorkspaceExecution.ID || summary.ID == otherDefinitionExecution.ID {
			t.Fatalf("summary query included out-of-scope execution: %+v", summary)
		}
	}

	limited, err := store.ListExecutionSummariesForDefinition("workspace_a", "workflow_definition_shared", 1)
	if err != nil {
		t.Fatalf("list limited summaries: %v", err)
	}
	if len(limited) != 1 || limited[0].ID != active.ID {
		t.Fatalf("limited summaries = %+v, want only active execution %s", limited, active.ID)
	}
}

func newSQLiteWorkflowStoreForTest(t *testing.T, appDataDir string) *Store {
	t.Helper()
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new workflow store: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Fatalf("close workflow store: %v", err)
		}
	})
	return store
}

func storeTestDefinition(graph WorkflowGraph) (WorkflowDefinition, WorkflowDefinitionVersion) {
	version := WorkflowDefinitionVersion{
		SchemaVersion: SchemaVersion,
		ID:            "workflow_version_store_test",
		WorkspaceID:   "workspace_store_test",
		DefinitionID:  "workflow_definition_store_test",
		VersionNumber: 1,
		Name:          "Store Test",
		Description:   "store test workflow",
		Graph:         graph,
		CreatedAt:     testNow,
	}
	definition := WorkflowDefinition{
		SchemaVersion: SchemaVersion,
		ID:            version.DefinitionID,
		WorkspaceID:   version.WorkspaceID,
		Name:          version.Name,
		Description:   version.Description,
		Graph:         graph,
		CreatedAt:     testNow,
		UpdatedAt:     testNow,
	}
	return definition, version
}

func storeTestVersion(workspaceID string, definitionID string, versionID string, versionNumber int, graph WorkflowGraph, createdAt string) WorkflowDefinitionVersion {
	return WorkflowDefinitionVersion{
		SchemaVersion: SchemaVersion,
		ID:            versionID,
		WorkspaceID:   workspaceID,
		DefinitionID:  definitionID,
		VersionNumber: versionNumber,
		Name:          "Store Test",
		Description:   "store test workflow",
		Graph:         graph,
		CreatedAt:     createdAt,
	}
}

func persistStoreTestExecution(t *testing.T, store *Store, version WorkflowDefinitionVersion, startedAt string) WorkflowExecution {
	t.Helper()
	transition, err := StartExecution(version, TransitionContext{
		Now:   startedAt,
		NewID: deterministicIDGenerator(),
	})
	if err != nil {
		t.Fatalf("start execution for version %s: %v", version.ID, err)
	}
	if _, err := store.PersistTransition(transition); err != nil {
		t.Fatalf("persist execution for version %s: %v", version.ID, err)
	}
	return transition.Execution
}

func assertPathMissing(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("path %s exists or failed unexpectedly: %v", path, err)
	}
}

func assertPathExists(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("path %s missing: %v", path, err)
	}
}
