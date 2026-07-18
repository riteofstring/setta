package orchestrator

import (
	"context"
	"errors"
	"fmt"
)

func persistStoreExecutionStart(store *Store, version WorkflowDefinitionVersion, transition WorkflowTransition) ([]WorkflowEventEnvelope, error) {
	versionGraphJSON, err := validateExecutionStartPersistence(version, transition)
	if err != nil {
		return nil, err
	}
	return store.persistExecutionStartTransaction(version, transition, versionGraphJSON)
}

func (store *Store) PersistExecutionStart(version WorkflowDefinitionVersion, transition WorkflowTransition) ([]WorkflowEventEnvelope, error) {
	return persistStoreExecutionStart(store, version, transition)
}

func validateExecutionStartPersistence(version WorkflowDefinitionVersion, transition WorkflowTransition) (string, error) {
	if err := validateDefinitionVersionSnapshot(version); err != nil {
		return "", err
	}
	if !executionStartVersionMatchesExecution(version, transition.Execution) {
		return "", fmt.Errorf("workflow version %s ownership does not match execution %s", version.ID, transition.Execution.ID)
	}
	versionGraphJSON, err := marshalJSONColumn(version.Graph)
	if err != nil {
		return "", fmt.Errorf("encode workflow definition version graph: %w", err)
	}
	if err := validateExecutionSnapshot(transition.Execution); err != nil {
		return "", err
	}
	if len(transition.Events) == 0 {
		return "", errors.New("workflow transition must include event records")
	}
	if err := validateTransitionEvents(transition); err != nil {
		return "", err
	}
	return versionGraphJSON, nil
}

func executionStartVersionMatchesExecution(version WorkflowDefinitionVersion, execution WorkflowExecution) bool {
	return version.WorkspaceID == execution.WorkspaceID &&
		version.DefinitionID == execution.DefinitionID &&
		version.ID == execution.DefinitionVersionID
}

func (store *Store) persistExecutionStartTransaction(version WorkflowDefinitionVersion, transition WorkflowTransition, versionGraphJSON string) ([]WorkflowEventEnvelope, error) {
	ctx := context.Background()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, store.persistenceError("begin workflow transition transaction", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if err := store.insertDefinitionVersion(ctx, tx, version, versionGraphJSON); err != nil {
		return nil, err
	}
	previousOrdinal, err := store.currentRunEventOrdinal(ctx, tx, transition.Execution.ID)
	if err != nil {
		return nil, err
	}
	if err := validateExecutionStartOrdinal(transition, previousOrdinal); err != nil {
		return nil, err
	}
	if err := store.replaceExecutionMaterializedState(ctx, tx, transition.Execution); err != nil {
		return nil, err
	}
	envelopes, err := store.insertWorkflowEvents(ctx, tx, transition.Events)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, store.persistenceError("commit workflow transition transaction", err)
	}
	committed = true
	return envelopes, nil
}

func validateExecutionStartOrdinal(transition WorkflowTransition, previousOrdinal int) error {
	if transition.Execution.LastEventOrdinal == previousOrdinal+len(transition.Events) {
		return nil
	}
	return fmt.Errorf("workflow execution %s last event ordinal %d does not follow stored ordinal %d and %d new events", transition.Execution.ID, transition.Execution.LastEventOrdinal, previousOrdinal, len(transition.Events))
}
