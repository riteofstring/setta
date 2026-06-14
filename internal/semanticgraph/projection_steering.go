package semanticgraph

import (
	"context"
	"database/sql"
	"fmt"
)

func projectSteeringCreated(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[steeringCreatedPayload](event)
	if err != nil {
		return err
	}
	if err := validateSteeringCreatedPayload(event, payload); err != nil {
		return err
	}
	if err := requireSemanticEntity(ctx, tx, event.WorkspaceID, payload.TargetEntityID); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO semantic_steering_directives (
  workspace_id, id, target_entity_id, kind, instruction, status, scope,
  workflow_definition_id, workflow_execution_id, workflow_node_id,
  workflow_node_execution_id, chat_conversation_id, chat_run_id,
  chat_message_id, run_item_id, supersedes_directive_id,
  reassigned_from_directive_id, created_by_event_id, updated_by_event_id,
  created_at, updated_at, completed_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		event.WorkspaceID,
		payload.DirectiveID,
		payload.TargetEntityID,
		payload.Kind,
		payload.Instruction,
		payload.Status,
		payload.Scope,
		payload.WorkflowDefinitionID,
		payload.WorkflowExecutionID,
		payload.WorkflowNodeID,
		payload.WorkflowNodeExecutionID,
		payload.ChatConversationID,
		payload.ChatRunID,
		payload.ChatMessageID,
		payload.RunItemID,
		payload.SupersedesDirectiveID,
		payload.ReassignedFromDirectiveID,
		event.EventID,
		event.EventID,
		event.ObservedAt,
		event.ObservedAt,
		completedAtForSteeringStatus(payload.Status, event.ObservedAt),
	)
	if err != nil {
		return fmt.Errorf("create semantic steering directive: %w", err)
	}
	return nil
}

func projectSteeringUpdated(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := validatedSteeringUpdatedPayload(event)
	if err != nil {
		return err
	}
	directive, err := steeringDirectiveForUpdate(ctx, tx, event.WorkspaceID, payload.DirectiveID)
	if err != nil {
		return err
	}
	directive, err = applySteeringUpdatedPayload(directive, payload, event.ObservedAt)
	if err != nil {
		return err
	}
	directive.UpdatedByEventID = event.EventID
	directive.UpdatedAt = event.ObservedAt
	return replaceSemanticSteeringDirective(ctx, tx, directive)
}

func validatedSteeringUpdatedPayload(event SemanticEvent) (steeringUpdatedPayload, error) {
	payload, err := decodeStrictPayload[steeringUpdatedPayload](event)
	if err != nil {
		return steeringUpdatedPayload{}, err
	}
	if err := validateStoreIDs("steering directive id", payload.DirectiveID); err != nil {
		return steeringUpdatedPayload{}, err
	}
	if payload.Instruction == nil && payload.Status == nil && payload.SupersedesDirectiveID == "" {
		return steeringUpdatedPayload{}, fmt.Errorf("steering.updated payload must include instruction, status, or supersedesDirectiveId")
	}
	return payload, nil
}

func steeringDirectiveForUpdate(ctx context.Context, tx *sql.Tx, workspaceID string, directiveID string) (SemanticSteeringDirective, error) {
	directive, ok, err := loadSemanticSteeringDirectiveForProjection(ctx, tx, workspaceID, directiveID)
	if err != nil {
		return SemanticSteeringDirective{}, err
	}
	if !ok {
		return SemanticSteeringDirective{}, fmt.Errorf("semantic steering directive %s does not exist", directiveID)
	}
	return directive, nil
}

func applySteeringUpdatedPayload(directive SemanticSteeringDirective, payload steeringUpdatedPayload, observedAt string) (SemanticSteeringDirective, error) {
	var err error
	directive, err = applySteeringInstructionUpdate(directive, payload.Instruction)
	if err != nil {
		return SemanticSteeringDirective{}, err
	}
	directive, err = applySteeringStatusUpdate(directive, payload.Status, observedAt)
	if err != nil {
		return SemanticSteeringDirective{}, err
	}
	return applySteeringSupersedesUpdate(directive, payload.SupersedesDirectiveID)
}

func applySteeringInstructionUpdate(directive SemanticSteeringDirective, instruction *string) (SemanticSteeringDirective, error) {
	if instruction == nil {
		return directive, nil
	}
	if err := requireNonEmpty(*instruction, "steering instruction"); err != nil {
		return SemanticSteeringDirective{}, err
	}
	directive.Instruction = *instruction
	return directive, nil
}

func applySteeringStatusUpdate(directive SemanticSteeringDirective, status *SemanticSteeringStatus, observedAt string) (SemanticSteeringDirective, error) {
	if status == nil {
		return directive, nil
	}
	if !isSemanticSteeringStatus(*status) {
		return SemanticSteeringDirective{}, fmt.Errorf("steering status is unsupported: %s", *status)
	}
	directive.Status = *status
	if isTerminalSteeringStatus(*status) && directive.CompletedAt == "" {
		directive.CompletedAt = observedAt
	}
	return directive, nil
}

func applySteeringSupersedesUpdate(directive SemanticSteeringDirective, supersedesDirectiveID string) (SemanticSteeringDirective, error) {
	if supersedesDirectiveID == "" {
		return directive, nil
	}
	if err := validateStoreIDs("superseded steering directive id", supersedesDirectiveID); err != nil {
		return SemanticSteeringDirective{}, err
	}
	directive.SupersedesDirectiveID = supersedesDirectiveID
	return directive, nil
}
