package easyrun

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/chat"
)

// acceptedEasyRunSteering keeps the regular-chat result intact at the Easy Run
// boundary. The persisted user message is the authoritative accepted steering
// fact for later presentation projection; the renderer request is not.
type acceptedEasyRunSteering struct {
	run         EasyRun
	text        string
	userMessage chat.ChatMessage
}

// AcceptedSteeringFocusUpdateError reports that working-agent delivery
// succeeded but the derived Current focus could not be scheduled or published.
type AcceptedSteeringFocusUpdateError struct {
	Err error
}

func (err *AcceptedSteeringFocusUpdateError) Error() string {
	return fmt.Sprintf("steering accepted but focus update failed: %v", err.Err)
}

func (err *AcceptedSteeringFocusUpdateError) Unwrap() error {
	return err.Err
}

// IsAcceptedSteeringFocusUpdateError identifies the partial steering outcome.
func IsAcceptedSteeringFocusUpdateError(err error) bool {
	var target *AcceptedSteeringFocusUpdateError
	return errors.As(err, &target)
}

func (service *Service) Steer(workspaceID string, text string) (EasyRun, error) {
	if service == nil {
		return EasyRun{}, errors.New("easy-run service is required")
	}
	trimmed := strings.TrimSpace(text)
	if err := validateWorkspaceID(workspaceID); err != nil {
		return EasyRun{}, err
	}
	if trimmed == "" {
		return EasyRun{}, errors.New("easy-run steering text is required")
	}
	if service.chat == nil {
		return EasyRun{}, errors.New("easy-run chat service is required")
	}
	run, backingRunID, err := service.workingSteeringTarget(workspaceID)
	if err != nil {
		return EasyRun{}, err
	}
	result, err := service.chat.SteerActiveRunInputByID(
		workspaceID,
		run.ConversationID,
		backingRunID,
		chat.TextChatInput(trimmed),
	)
	if err != nil {
		return EasyRun{}, err
	}
	return service.finishAcceptedSteering(run, backingRunID, result)
}

func (service *Service) workingSteeringTarget(workspaceID string) (EasyRun, string, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	record, ok, err := service.store.findWorkingRun(workspaceID)
	if err != nil {
		return EasyRun{}, "", err
	}
	if !ok {
		return EasyRun{}, "", fmt.Errorf("workspace %s has no active easy-run", workspaceID)
	}
	if record.BackingRunID == "" {
		return EasyRun{}, "", fmt.Errorf("easy-run %s does not have an active backing run", record.Run.ID)
	}
	return record.Run, record.BackingRunID, nil
}

func (service *Service) finishAcceptedSteering(run EasyRun, backingRunID string, result chat.SteerMessageResult) (EasyRun, error) {
	accepted, err := acceptedEasyRunSteeringFromChatResult(run, backingRunID, result)
	if err != nil {
		return EasyRun{}, service.failAcceptedSteeringResult(run, fmt.Errorf("persisted chat result is invalid: %w", err))
	}
	updated, target, err := service.acceptSteeringForNarration(accepted, backingRunID)
	if err != nil {
		return EasyRun{}, &AcceptedSteeringFocusUpdateError{Err: err}
	}
	if target != nil {
		service.launchWorkingNarratorProjection(service.narratorContext(), *target)
	}
	return updated, nil
}

func (service *Service) failAcceptedSteeringResult(run EasyRun, cause error) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	record, err := service.store.loadRun(run.WorkspaceID, run.ID)
	if err != nil {
		return &AcceptedSteeringFocusUpdateError{Err: errors.Join(cause, err)}
	}
	state := service.narratorStateLocked(run.ID)
	_, err = service.markFocusProjectionStaleLocked(record, state, cause)
	return &AcceptedSteeringFocusUpdateError{Err: err}
}

func acceptedEasyRunSteeringFromChatResult(run EasyRun, backingRunID string, result chat.SteerMessageResult) (acceptedEasyRunSteering, error) {
	if err := validateAcceptedEasyRunSteeringConversation(run, result.Conversation); err != nil {
		return acceptedEasyRunSteering{}, err
	}
	if result.Run.ID != backingRunID || result.Run.ConversationID != run.ConversationID || result.Run.WorkspaceID != run.WorkspaceID {
		return acceptedEasyRunSteering{}, fmt.Errorf(
			"steering run = %s/%s/%s, want %s/%s/%s",
			result.Run.WorkspaceID,
			result.Run.ConversationID,
			result.Run.ID,
			run.WorkspaceID,
			run.ConversationID,
			backingRunID,
		)
	}
	message := result.UserMessage
	if message.ConversationID != run.ConversationID || message.RunID != backingRunID {
		return acceptedEasyRunSteering{}, fmt.Errorf(
			"steering message %s belongs to conversation/run %s/%s, want %s/%s",
			message.ID,
			message.ConversationID,
			message.RunID,
			run.ConversationID,
			backingRunID,
		)
	}
	if message.Role != chat.RoleUser || message.Delivery != chat.MessageDeliverySteering {
		return acceptedEasyRunSteering{}, fmt.Errorf(
			"steering message %s role/delivery = %s/%s, want %s/%s",
			message.ID,
			message.Role,
			message.Delivery,
			chat.RoleUser,
			chat.MessageDeliverySteering,
		)
	}
	text, err := acceptedEasyRunSteeringText(message)
	if err != nil {
		return acceptedEasyRunSteering{}, err
	}
	return acceptedEasyRunSteering{run: run, text: text, userMessage: message}, nil
}

func validateAcceptedEasyRunSteeringConversation(run EasyRun, conversation chat.Conversation) error {
	if conversation.ID != run.ConversationID || conversation.WorkspaceID != run.WorkspaceID {
		return fmt.Errorf(
			"steering conversation = %s/%s, want %s/%s",
			conversation.WorkspaceID,
			conversation.ID,
			run.WorkspaceID,
			run.ConversationID,
		)
	}
	if !conversation.Internal ||
		conversation.Workflow != nil ||
		conversation.EasyRun == nil ||
		conversation.EasyRun.EasyRunID != run.ID {
		return fmt.Errorf("steering conversation %s is not owned by easy-run %s", conversation.ID, run.ID)
	}
	return nil
}

func acceptedEasyRunSteeringText(message chat.ChatMessage) (string, error) {
	if len(message.Parts) != 1 {
		return "", fmt.Errorf("steering message %s has %d parts, want one text part", message.ID, len(message.Parts))
	}
	part := message.Parts[0]
	if part.Type != chat.MessagePartText || part.Text == nil || part.Image != nil || part.Text.Format != chat.TextFormatPlain {
		return "", fmt.Errorf("steering message %s does not contain one plain-text part", message.ID)
	}
	text := part.Text.Text
	if strings.TrimSpace(text) == "" || text != strings.TrimSpace(text) {
		return "", fmt.Errorf("steering message %s text must be non-empty shared-normalized text", message.ID)
	}
	return text, nil
}

func (service *Service) acceptSteeringForNarration(accepted acceptedEasyRunSteering, backingRunID string) (EasyRun, *workingNarratorProjection, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	record, err := service.store.loadRun(accepted.run.WorkspaceID, accepted.run.ID)
	if err != nil {
		return EasyRun{}, nil, err
	}
	state := service.narratorStateLocked(record.Run.ID)
	if err := validateAcceptedSteeringFocusUpdate(record, state, accepted, backingRunID); err != nil {
		return service.failAcceptedSteeringFocusUpdateLocked(record, state, err)
	}
	through := state.digest.append(acceptedSteeringDigestEntry(accepted))
	if through == 0 {
		return service.failAcceptedSteeringFocusUpdateLocked(record, state, errors.New("accepted steering did not produce a narrator digest entry"))
	}
	state.markFocusDirty(through)
	record.Run.CurrentFocus.Status = EasyRunFocusStatusUpdating
	if err := service.store.saveRun(record); err != nil {
		return service.failAcceptedSteeringFocusUpdateLocked(record, state, err)
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(record.Run)); err != nil {
		return service.failAcceptedSteeringFocusUpdateLocked(record, state, err)
	}
	target, shouldProject := service.beginWorkingNarratorProjectionLocked(record.Run.WorkspaceID, record.Run.ID)
	if shouldProject {
		return record.Run, &target, nil
	}
	if state.inFlight {
		return record.Run, nil, nil
	}
	return service.failAcceptedSteeringFocusUpdateLocked(record, state, errors.New("accepted steering did not trigger narrator projection"))
}

func validateAcceptedSteeringFocusUpdate(record storedRunRecord, state *narratorRunState, accepted acceptedEasyRunSteering, backingRunID string) error {
	if record.Run.ConversationID != accepted.run.ConversationID || record.BackingRunID != backingRunID {
		return fmt.Errorf(
			"easy-run backing conversation/run changed to %s/%s, want %s/%s",
			record.Run.ConversationID,
			record.BackingRunID,
			accepted.run.ConversationID,
			backingRunID,
		)
	}
	if record.Run.Status != EasyRunStatusWorking {
		return fmt.Errorf("easy-run %s became %s before focus projection", record.Run.ID, record.Run.Status)
	}
	if record.Run.NarratorStatus == EasyRunNarratorStatusDegraded {
		return errors.New("easy-run narrator is already degraded")
	}
	if len(accepted.text) > state.digest.maxBytes {
		return fmt.Errorf("accepted steering text has %d bytes, narrator digest maximum is %d", len(accepted.text), state.digest.maxBytes)
	}
	return nil
}

func acceptedSteeringDigestEntry(accepted acceptedEasyRunSteering) narratorDigestEntry {
	return narratorDigestEntry{
		At:       accepted.userMessage.CreatedAt,
		EventID:  accepted.userMessage.ID,
		Sequence: accepted.userMessage.Ordinal,
		Source:   narratorDigestSourceUserSteer,
		Text:     accepted.text,
	}
}

func (service *Service) failAcceptedSteeringFocusUpdateLocked(record storedRunRecord, state *narratorRunState, cause error) (EasyRun, *workingNarratorProjection, error) {
	run, err := service.markFocusProjectionStaleLocked(record, state, cause)
	return run, nil, err
}

func (service *Service) markFocusProjectionStaleLocked(record storedRunRecord, state *narratorRunState, cause error) (EasyRun, error) {
	state.failFocusProjection()
	record.Run.CurrentFocus.Status = EasyRunFocusStatusStale
	record.Run.NarratorStatus = EasyRunNarratorStatusDegraded
	err := cause
	if saveErr := service.store.saveRun(record); saveErr != nil {
		err = errors.Join(err, saveErr)
	}
	if _, publishErr := service.events.Publish(NewRunUpdatedEvent(record.Run)); publishErr != nil {
		err = errors.Join(err, publishErr)
	}
	return record.Run, err
}

func (service *Service) narratorContext() context.Context {
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.observerContext == nil {
		return context.Background()
	}
	return service.observerContext
}
