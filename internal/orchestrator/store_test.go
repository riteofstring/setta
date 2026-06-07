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
	if err := store.SaveDefinitionRevision(definition, version); err != nil {
		t.Fatalf("save definition revision: %v", err)
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
	definition, version := storeTestDefinition(startEndGraph())
	if err := store.SaveDefinitionRevision(definition, version); err != nil {
		t.Fatalf("save definition revision: %v", err)
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
	if err := store.SaveDefinitionRevision(definition, version); err != nil {
		t.Fatalf("save definition revision: %v", err)
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
		SchemaVersion:        SchemaVersion,
		ID:                   version.DefinitionID,
		WorkspaceID:          version.WorkspaceID,
		Name:                 version.Name,
		Description:          version.Description,
		CurrentVersionID:     version.ID,
		CurrentVersionNumber: version.VersionNumber,
		Graph:                graph,
		CreatedAt:            testNow,
		UpdatedAt:            testNow,
	}
	return definition, version
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
