package narration

import (
	"fmt"
	"strings"

	"setta/internal/conversation"
)

type RequestKind string

const (
	RequestKindFocus      RequestKind = "focus"
	RequestKindProjection RequestKind = "projection"
	RequestKindStatus     RequestKind = "status"
	RequestKindCheckpoint RequestKind = "checkpoint"
)

// StatusOperation is the explicit user-addressed status request carried by a
// status mailbox item. It is deliberately separate from primary-agent input:
// the narrator worker may read it, but no agent turn or steering API accepts
// this shape.
type StatusOperation struct {
	WorkspaceID string
	Question    string
}

func (operation StatusOperation) Validate() error {
	if err := validateIdentifier("narrator status workspace id", operation.WorkspaceID); err != nil {
		return err
	}
	return ValidateStatusQuestion(operation.Question)
}

// ProjectionOperation freezes the durable trajectory cutoff and target turn
// selected by the conversation lifecycle. Provider work may evaluate that
// cutoff in multiple contiguous windows, but it may never silently move the
// target to newer trajectory.
type ProjectionOperation struct {
	WorkspaceID     string
	TurnID          string
	ThroughSequence int
	SemanticEvents  []conversation.NarratorSemanticEvent
}

func (operation ProjectionOperation) Validate() error {
	if err := validateIdentifier("narrator projection workspace id", operation.WorkspaceID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator projection turn id", operation.TurnID); err != nil {
		return err
	}
	if operation.ThroughSequence <= 0 {
		return fmt.Errorf("narrator projection through sequence must be positive")
	}
	if err := validateProjectionSemanticEvents(operation); err != nil {
		return err
	}
	return nil
}

// FocusOperation targets the exact accepted input or steering event that is
// allowed to revise the stable user-facing topic focus.
type FocusOperation struct {
	WorkspaceID    string
	TurnID         string
	SourceSequence int
}

func (operation FocusOperation) Validate() error {
	if err := validateIdentifier("narrator focus workspace id", operation.WorkspaceID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator focus turn id", operation.TurnID); err != nil {
		return err
	}
	if operation.SourceSequence <= 0 {
		return fmt.Errorf("narrator focus source sequence must be positive")
	}
	return nil
}

// CheckpointOperation carries the workspace and optional turn whose current
// authoritative state accompanies historical compaction. ResumeProjection is
// scheduler metadata: after the checkpoint commits, the exact frozen
// projection target is eligible to continue through a new mailbox request.
type CheckpointOperation struct {
	WorkspaceID      string
	TurnID           *string
	ResumeProjection *ProjectionOperation
	ResumeTrigger    conversation.NarrationTrigger
}

func (operation CheckpointOperation) Validate() error {
	if err := validateIdentifier("narrator checkpoint workspace id", operation.WorkspaceID); err != nil {
		return err
	}
	if operation.TurnID != nil {
		if err := validateIdentifier("narrator checkpoint turn id", *operation.TurnID); err != nil {
			return err
		}
	}
	if operation.ResumeProjection == nil {
		if operation.ResumeTrigger != "" {
			return fmt.Errorf("narrator checkpoint resume trigger requires a projection")
		}
		return nil
	}
	if operation.TurnID == nil {
		return fmt.Errorf("narrator checkpoint resume projection requires its target turn")
	}
	if err := operation.ResumeProjection.Validate(); err != nil {
		return fmt.Errorf("narrator checkpoint resume projection: %w", err)
	}
	if operation.ResumeProjection.WorkspaceID != operation.WorkspaceID {
		return fmt.Errorf("narrator checkpoint resume projection changed workspace")
	}
	if operation.ResumeProjection.TurnID != *operation.TurnID {
		return fmt.Errorf("narrator checkpoint resume projection changed target turn")
	}
	if !isProjectionTrigger(operation.ResumeTrigger) {
		return fmt.Errorf("narrator checkpoint has unsupported resume trigger %q", operation.ResumeTrigger)
	}
	return nil
}

// Request is the scheduling envelope for one narrator actor operation. The
// exact typed operation survives admission, priority ordering, degradation,
// and retry without being replaced by a looser context lookup.
type Request struct {
	ID             string
	ConversationID string
	Kind           RequestKind
	Trigger        conversation.NarrationTrigger
	Focus          *FocusOperation
	Projection     *ProjectionOperation
	Status         *StatusOperation
	Checkpoint     *CheckpointOperation
	// RecoverableRetry changes scheduling priority without erasing the
	// projection, status, or checkpoint operation that must be prepared.
	RecoverableRetry bool
	// RetryAttempt is zero for an externally submitted operation and advances
	// once for each actor-scheduled recovery attempt.
	RetryAttempt int
}

func (request Request) Validate() error {
	if err := request.validateEnvelope(); err != nil {
		return err
	}
	switch request.Kind {
	case RequestKindFocus:
		return request.validateFocus()
	case RequestKindProjection:
		return request.validateProjection()
	case RequestKindStatus:
		return request.validateStatus()
	case RequestKindCheckpoint:
		return request.validateCheckpoint()
	default:
		return fmt.Errorf("narrator request %s has unsupported kind %q", request.ID, request.Kind)
	}
}

func (request Request) validateEnvelope() error {
	if err := validateIdentifier("narrator request id", request.ID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator request conversation id", request.ConversationID); err != nil {
		return err
	}
	if request.RetryAttempt < 0 {
		return fmt.Errorf("narrator request %s retry attempt must be non-negative", request.ID)
	}
	if request.RecoverableRetry != (request.RetryAttempt > 0) {
		return fmt.Errorf(
			"narrator request %s recoverable retry flag does not match attempt %d",
			request.ID,
			request.RetryAttempt,
		)
	}
	return nil
}

func (request Request) validateFocus() error {
	if request.Focus == nil {
		return fmt.Errorf("narrator focus request %s requires a focus operation", request.ID)
	}
	if request.Projection != nil || request.Status != nil || request.Checkpoint != nil {
		return fmt.Errorf("narrator focus request %s contains a cross-kind operation", request.ID)
	}
	if err := request.Focus.Validate(); err != nil {
		return fmt.Errorf("narrator focus request %s: %w", request.ID, err)
	}
	if !isFocusTrigger(request.Trigger) {
		return fmt.Errorf(
			"narrator focus request %s has unsupported trigger %q",
			request.ID,
			request.Trigger,
		)
	}
	return nil
}

func (request Request) validateProjection() error {
	if request.Projection == nil {
		return fmt.Errorf("narrator projection request %s requires a projection operation", request.ID)
	}
	if request.Focus != nil || request.Status != nil || request.Checkpoint != nil {
		return fmt.Errorf("narrator projection request %s contains a cross-kind operation", request.ID)
	}
	if err := request.Projection.Validate(); err != nil {
		return fmt.Errorf("narrator projection request %s: %w", request.ID, err)
	}
	for index, event := range request.Projection.SemanticEvents {
		if event.ConversationID != request.ConversationID {
			return fmt.Errorf(
				"narrator projection request %s semantic event %d belongs to conversation %s, want %s",
				request.ID,
				index,
				event.ConversationID,
				request.ConversationID,
			)
		}
	}
	if !isProjectionTrigger(request.Trigger) {
		return fmt.Errorf(
			"narrator projection request %s has unsupported trigger %q",
			request.ID,
			request.Trigger,
		)
	}
	return nil
}

func (request Request) validateStatus() error {
	if request.Status == nil {
		return fmt.Errorf("narrator status request %s requires a status operation", request.ID)
	}
	if request.Focus != nil || request.Projection != nil || request.Checkpoint != nil {
		return fmt.Errorf("narrator status request %s contains a cross-kind operation", request.ID)
	}
	if err := request.Status.Validate(); err != nil {
		return fmt.Errorf("narrator status request %s: %w", request.ID, err)
	}
	if request.Trigger != conversation.NarrationTriggerExplicitStatusRequested {
		return fmt.Errorf(
			"narrator status request %s requires trigger %q",
			request.ID,
			conversation.NarrationTriggerExplicitStatusRequested,
		)
	}
	return nil
}

func (request Request) validateCheckpoint() error {
	if request.Checkpoint == nil {
		return fmt.Errorf("narrator checkpoint request %s requires a checkpoint operation", request.ID)
	}
	if request.Focus != nil || request.Projection != nil || request.Status != nil {
		return fmt.Errorf("narrator checkpoint request %s contains a cross-kind operation", request.ID)
	}
	if err := request.Checkpoint.Validate(); err != nil {
		return fmt.Errorf("narrator checkpoint request %s: %w", request.ID, err)
	}
	if request.Trigger != conversation.NarrationTriggerCheckpointWindowExceeded {
		return fmt.Errorf(
			"narrator checkpoint request %s requires trigger %q",
			request.ID,
			conversation.NarrationTriggerCheckpointWindowExceeded,
		)
	}
	return nil
}

func cloneRequest(request Request) Request {
	cloned := request
	if request.Focus != nil {
		focus := *request.Focus
		cloned.Focus = &focus
	}
	if request.Projection != nil {
		projection := *request.Projection
		projection.SemanticEvents = append(
			[]conversation.NarratorSemanticEvent{},
			request.Projection.SemanticEvents...,
		)
		cloned.Projection = &projection
	}
	if request.Status != nil {
		status := *request.Status
		cloned.Status = &status
	}
	if request.Checkpoint != nil {
		checkpoint := *request.Checkpoint
		if request.Checkpoint.TurnID != nil {
			turnID := *request.Checkpoint.TurnID
			checkpoint.TurnID = &turnID
		}
		if request.Checkpoint.ResumeProjection != nil {
			projection := *request.Checkpoint.ResumeProjection
			checkpoint.ResumeProjection = &projection
		}
		cloned.Checkpoint = &checkpoint
	}
	return cloned
}

func validateProjectionSemanticEvents(operation ProjectionOperation) error {
	previous := 0
	for index, event := range operation.SemanticEvents {
		if err := event.Validate(); err != nil {
			return fmt.Errorf("narrator projection semantic event %d: %w", index, err)
		}
		if event.ConversationID == "" || event.TurnID == "" {
			return fmt.Errorf("narrator projection semantic event %d is missing target identity", index)
		}
		if event.TurnID != operation.TurnID {
			return fmt.Errorf(
				"narrator projection semantic event %d belongs to turn %s, want %s",
				index,
				event.TurnID,
				operation.TurnID,
			)
		}
		if event.SourceTrajectoryRange.End > operation.ThroughSequence {
			return fmt.Errorf(
				"narrator projection semantic event %d source %d exceeds projection cutoff %d",
				index,
				event.SourceTrajectoryRange.End,
				operation.ThroughSequence,
			)
		}
		if event.SemanticSequence <= previous {
			return fmt.Errorf("narrator projection semantic events must be strictly ordered")
		}
		previous = event.SemanticSequence
	}
	return nil
}

func validateIdentifier(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must not have surrounding whitespace", label)
	}
	return nil
}

func isFocusTrigger(trigger conversation.NarrationTrigger) bool {
	switch trigger {
	case conversation.NarrationTriggerInputAccepted,
		conversation.NarrationTriggerUserSteered:
		return true
	default:
		return false
	}
}

func isProjectionTrigger(trigger conversation.NarrationTrigger) bool {
	switch trigger {
	case conversation.NarrationTriggerProgressWindowElapsed,
		conversation.NarrationTriggerPlanChanged,
		conversation.NarrationTriggerPhaseActivityCompleted,
		conversation.NarrationTriggerApprovalRequired,
		conversation.NarrationTriggerUserSteered,
		conversation.NarrationTriggerTurnTerminal:
		return true
	default:
		return false
	}
}
