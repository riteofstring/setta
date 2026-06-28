package chat

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"setta/internal/semanticcontext"
	"setta/internal/workspace"
)

const (
	defaultPageLimit     = 40
	deltaPersistInterval = 250 * time.Millisecond
	maxConversationTitle = 80
	maxPromptSummary     = 120
)

type WorkspaceResolver interface {
	ResolveWorkspace(id string) (workspace.WorkspaceSummary, error)
}

type Service struct {
	store             *Store
	harness           Harness
	taskRunner        HarnessTaskRunner
	workspaceResolver WorkspaceResolver
	events            *EventHub
	semanticCompiler  semanticcontext.Compiler
	newID             func(prefix string) (string, error)
	now               func() time.Time

	mu     sync.Mutex
	active map[string]activeTurn
}

type Option func(*Service)

type activeTurn struct {
	assistantMessage            ChatMessage
	assistantTextByProviderItem map[string]assistantProviderTextState
	completedAssistantTexts     []string
	cancel                      context.CancelFunc
	lastPersistedAt             time.Time
	runID                       string
	threadID                    string
	turnID                      string
	workspaceID                 string
	transcript                  *transcriptIngest
}

type SendMessageResult struct {
	Conversation     Conversation `json:"conversation"`
	UserMessage      ChatMessage  `json:"userMessage"`
	AssistantMessage ChatMessage  `json:"assistantMessage"`
	Run              Run          `json:"run"`
	Page             MessagePage  `json:"page"`
}

func NewService(store *Store, workspaceResolver WorkspaceResolver, harness Harness, options ...Option) (*Service, error) {
	if store == nil {
		return nil, errors.New("chat store is required")
	}
	if workspaceResolver == nil {
		return nil, errors.New("workspace resolver is required")
	}
	if harness == nil {
		return nil, errors.New("chat harness is required")
	}
	service := &Service{
		store:             store,
		harness:           harness,
		taskRunner:        HarnessTaskRunnerFor(harness),
		workspaceResolver: workspaceResolver,
		newID:             randomID,
		now:               time.Now,
		active:            map[string]activeTurn{},
	}
	for _, option := range options {
		option(service)
	}
	if service.events == nil {
		streamID, err := service.newID("event_stream")
		if err != nil {
			return nil, fmt.Errorf("create event stream id: %w", err)
		}
		events, err := NewEventHub(streamID, WithEventClock(service.now))
		if err != nil {
			return nil, err
		}
		service.events = events
	}
	if err := service.recoverInterruptedRuns(); err != nil {
		service.recordCorruptStateDiagnostic(err, "", "", "")
		return nil, err
	}
	if err := service.recoverBackgroundTerminals(); err != nil {
		service.recordCorruptStateDiagnostic(err, "", "", "")
		return nil, err
	}
	// Harnesses that run background terminals on a long-lived provider connection
	// (Codex) receive the conversation-scoped sink that late unified-exec output
	// and completion update after the starting turn has finished.
	if attacher, ok := harness.(backgroundTerminalSinkAttacher); ok {
		attacher.SetBackgroundTerminalSink(service.backgroundTerminalSink())
	}
	return service, nil
}

func WithIDGenerator(newID func(prefix string) (string, error)) Option {
	return func(service *Service) {
		service.newID = newID
	}
}

func WithClock(now func() time.Time) Option {
	return func(service *Service) {
		service.now = now
	}
}

func WithEventHub(events *EventHub) Option {
	return func(service *Service) {
		service.events = events
	}
}

func WithSemanticContextCompiler(compiler semanticcontext.Compiler) Option {
	return func(service *Service) {
		service.semanticCompiler = compiler
	}
}

func (service *Service) SetSemanticContextCompiler(compiler semanticcontext.Compiler) {
	service.mu.Lock()
	defer service.mu.Unlock()

	service.semanticCompiler = compiler
}

func (service *Service) SubscribeEvents(cursor EventCursor) (*EventSubscription, error) {
	return service.events.Subscribe(cursor)
}

func (service *Service) CloseEvents() {
	service.events.Close()
}

func (service *Service) HarnessTaskRunner() HarnessTaskRunner {
	return service.taskRunner
}

func (service *Service) PublishCodexAccountChanged(reason string) {
	_, _ = service.events.Publish(NewCodexAccountChangedEvent(reason))
}

func (service *Service) SendUserMessage(workspaceID string, conversationID string, prompt string) (SendMessageResult, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return SendMessageResult{}, errors.New("prompt is required")
	}
	if err := rejectSlashPromptForMessageEndpoint(prompt); err != nil {
		return SendMessageResult{}, err
	}
	workspaceSummary, err := service.validateConversationRequest(workspaceID, conversationID)
	if err != nil {
		return SendMessageResult{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	key := activeKey(workspaceID, conversationID)
	if err := service.ensureCanStartTurnLocked(workspaceID, conversationID, key); err != nil {
		return SendMessageResult{}, err
	}

	now := timestamp(service.now())
	conversation, userMessage, assistantMessage, run, err := service.persistTurnStartLocked(workspaceID, conversationID, prompt, now)
	if err != nil {
		return SendMessageResult{}, err
	}
	ingest, err := service.newTranscriptIngestLocked(workspaceID, run)
	if err != nil {
		return SendMessageResult{}, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	service.active[key] = activeTurn{
		assistantMessage: assistantMessage,
		cancel:           cancel,
		runID:            run.ID,
		workspaceID:      workspaceID,
		transcript:       ingest,
	}
	request := TurnRequest{
		Workspace:    workspaceSummary,
		Conversation: conversation,
		Run:          run,
		Prompt:       prompt,
		ThreadRef:    latestHarnessRef(conversation, HarnessCodex),
	}
	go service.runHarnessTurn(ctx, request)

	page, err := service.loadMessagePageLocked(workspaceID, conversationID, 0, defaultPageLimit)
	if err != nil {
		return SendMessageResult{}, err
	}
	return SendMessageResult{
		Conversation:     conversation,
		UserMessage:      userMessage,
		AssistantMessage: assistantMessage,
		Run:              run,
		Page:             page,
	}, nil
}

func (service *Service) persistTurnStartLocked(workspaceID string, conversationID string, prompt string, now string) (Conversation, ChatMessage, ChatMessage, Run, error) {
	return service.persistTurnStartWithDeliveryLocked(workspaceID, conversationID, prompt, MessageDeliveryNormal, now)
}

func (service *Service) persistTurnStartWithDeliveryLocked(workspaceID string, conversationID string, prompt string, delivery MessageDelivery, now string) (Conversation, ChatMessage, ChatMessage, Run, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	return service.persistTurnStartForConversationLocked(conversation, prompt, delivery, now)
}

func (service *Service) persistTurnStartForConversationLocked(conversation Conversation, prompt string, delivery MessageDelivery, now string) (Conversation, ChatMessage, ChatMessage, Run, error) {
	workspaceID := conversation.WorkspaceID
	conversationID := conversation.ID
	userMessage, err := service.newUserMessage(workspaceID, conversationID, "", prompt, delivery, MessageStatusComplete, now)
	if err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	run, assistantMessage, err := service.newRunAndAssistantMessage(workspaceID, conversationID, userMessage, prompt, now)
	if err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	userMessage.RunID = run.ID
	conversation = updateConversationAfterPrompt(conversation, prompt, now)
	records, err := service.store.CreateRunningTurn(RunningTurnRecords{
		AssistantMessage: assistantMessage,
		Conversation:     conversation,
		Run:              run,
		UserMessage:      userMessage,
	})
	if err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	assistantMessage = records.AssistantMessage
	conversation = records.Conversation
	run = records.Run
	userMessage = records.UserMessage
	if err := service.traceLocked(workspaceID, run.ID, "turn_started", "Codex turn started"); err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	if err := service.publishTurnStartEventsLocked(workspaceID, conversationID, userMessage, assistantMessage, run); err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	return conversation, userMessage, assistantMessage, run, nil
}

func (service *Service) publishTurnStartEventsLocked(workspaceID string, conversationID string, userMessage ChatMessage, assistantMessage ChatMessage, run Run) error {
	if _, err := service.events.Publish(NewMessageCreatedEvent(workspaceID, conversationID, run.ID, userMessage)); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewMessageCreatedEvent(workspaceID, conversationID, run.ID, assistantMessage)); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID)
}

func (service *Service) CancelActiveRun(workspaceID string, conversationID string) (Run, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return Run{}, err
	}
	service.mu.Lock()
	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	if !ok || active.workspaceID != workspaceID {
		runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
		if err != nil {
			service.mu.Unlock()
			return Run{}, err
		}
		run, exists, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs)
		service.mu.Unlock()
		if err != nil {
			return Run{}, err
		}
		if !exists {
			return Run{}, fmt.Errorf("conversation has no active run: %s", conversationID)
		}
		return Run{}, fmt.Errorf("active run %s is not attached to this backend process", run.ID)
	}

	run, err := service.store.LoadRun(workspaceID, active.runID)
	if err != nil {
		service.mu.Unlock()
		return Run{}, err
	}
	service.mu.Unlock()

	err = service.harness.CancelTurn(context.Background(), CancelRequest{
		RunID:          run.ID,
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
	})
	if err != nil && !errors.Is(err, ErrTurnNotStarted) {
		return Run{}, err
	}
	active.cancel()
	return service.markTurnCancelled(workspaceID, conversationID, active.runID)
}

func (service *Service) markTurnCancelled(workspaceID string, conversationID string, runID string) (Run, error) {
	return service.markTurnCancelledWithReason(workspaceID, conversationID, runID, "turn cancelled", "cancellation_requested", "Turn cancellation requested")
}

func (service *Service) markTurnCancelledWithReason(workspaceID string, conversationID string, runID string, runError string, traceType string, traceMessage string) (Run, error) {
	return service.markTurnCancelledWithOptions(workspaceID, conversationID, runID, runError, traceType, traceMessage, true)
}

func (service *Service) markTurnCancelledWithOptions(workspaceID string, conversationID string, runID string, runError string, traceType string, traceMessage string, reconcilePendingSteering bool) (Run, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	if !ok || active.runID != runID {
		run, err := service.store.LoadRun(workspaceID, runID)
		return run, err
	}
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return Run{}, err
	}
	if run.Status != RunStatusRunning {
		delete(service.active, key)
		return run, nil
	}
	now := timestamp(service.now())
	message := active.assistantMessage
	message.Status = MessageStatusCancelled
	message.UpdatedAt = now
	run.Status = RunStatusCancelled
	run.CompletedAt = now
	run.Error = runError
	run.PendingApproval = nil
	// Finalize transcript blocks before the terminal store record (see completeTurn).
	if err := service.finalizeTranscriptBlocksLocked(workspaceID, active.transcript, TranscriptBlockStatusCancelled, runError); err != nil {
		return Run{}, err
	}
	records, err := service.store.CancelTurn(TerminalTurnRecords{AssistantMessage: message, Run: run})
	if err != nil {
		return Run{}, err
	}
	message = records.AssistantMessage
	run = records.Run
	pendingSteering, err := service.markTerminalPendingSteeringLocked(workspaceID, conversationID, run.ID, MessageStatusCancelled, reconcilePendingSteering)
	if err != nil {
		return Run{}, err
	}
	if err := service.traceLocked(workspaceID, run.ID, traceType, traceMessage); err != nil {
		return Run{}, err
	}
	delete(service.active, key)
	if err := service.publishTerminalTurnLocked(workspaceID, conversationID, message, run, pendingSteering); err != nil {
		return Run{}, err
	}
	return run, nil
}

func (service *Service) ActiveRun(workspaceID string, conversationID string) (Run, bool, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return Run{}, false, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return Run{}, false, err
	}
	return service.activeRunFromRunsLocked(workspaceID, conversationID, runs)
}

func (service *Service) SubmitApproval(workspaceID string, conversationID string, approvalID string, approved bool, response string, answers []ApprovalAnswer, cancelled bool) (Run, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return Run{}, err
	}
	if err := validateStorageID("approval id", approvalID); err != nil {
		return Run{}, err
	}
	run, err := service.pendingApprovalRun(workspaceID, conversationID, approvalID)
	if err != nil {
		return Run{}, err
	}
	if err := service.harness.SubmitApproval(context.Background(), ApprovalResponse{
		RunID:      run.ID,
		ApprovalID: approvalID,
		Approved:   approved,
		Answers:    answers,
		Response:   response,
		Cancelled:  cancelled,
	}); err != nil {
		return Run{}, err
	}
	return service.clearSubmittedApproval(workspaceID, run.ID, approvalID, approved, response, answers, cancelled)
}

func (service *Service) pendingApprovalRun(workspaceID string, conversationID string, approvalID string) (Run, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return Run{}, err
	}
	run, ok, err := service.activeRunFromRunsLocked(workspaceID, conversationID, runs)
	if err != nil {
		return Run{}, err
	}
	if !ok {
		return Run{}, fmt.Errorf("conversation has no active run: %s", conversationID)
	}
	if run.PendingApproval == nil || run.PendingApproval.ID != approvalID {
		return Run{}, fmt.Errorf("approval is not pending for active run: %s", approvalID)
	}
	return run, nil
}

func (service *Service) clearSubmittedApproval(workspaceID string, runID string, approvalID string, approved bool, response string, answers []ApprovalAnswer, cancelled bool) (Run, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return Run{}, err
	}
	if run.PendingApproval == nil || run.PendingApproval.ID != approvalID {
		return run, nil
	}
	approval := *run.PendingApproval
	approval.ResolvedAt = timestamp(service.now())
	approval.Response = approvalResponseSummary(response, answers)
	approval.Approved = approved
	switch {
	case cancelled:
		approval.Status = ApprovalStatusCancelled
	case approval.Kind == ApprovalKindUserInput:
		approval.Status = ApprovalStatusAnswered
	case approved:
		approval.Status = ApprovalStatusApproved
	default:
		approval.Status = ApprovalStatusDenied
	}
	run.PendingApproval = nil
	run, err = service.store.SubmitApproval(run)
	if err != nil {
		return Run{}, err
	}
	if err := service.traceLocked(workspaceID, run.ID, "approval_resolved", "Approval request resolved"); err != nil {
		return Run{}, err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
		return Run{}, err
	}
	return run, nil
}

func (service *Service) newUserMessage(workspaceID string, conversationID string, runID string, prompt string, delivery MessageDelivery, status MessageStatus, now string) (ChatMessage, error) {
	messageID, err := service.newID("message")
	if err != nil {
		return ChatMessage{}, fmt.Errorf("create user message id: %w", err)
	}
	partID, err := service.newID("part")
	if err != nil {
		return ChatMessage{}, fmt.Errorf("create user message part id: %w", err)
	}
	ordinal, err := service.store.NextMessageOrdinal(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, err
	}
	return ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             messageID,
		ConversationID: conversationID,
		RunID:          runID,
		Role:           RoleUser,
		Delivery:       delivery,
		Ordinal:        ordinal,
		CreatedAt:      now,
		UpdatedAt:      now,
		Status:         status,
		Parts: []MessagePart{{
			ID:     partID,
			Type:   MessagePartText,
			Text:   prompt,
			Format: TextFormatPlain,
		}},
	}, nil
}

func (service *Service) newQueuedRun(workspaceID string, conversationID string, userMessage ChatMessage, prompt string) (Run, error) {
	runID, err := service.newID("run")
	if err != nil {
		return Run{}, fmt.Errorf("create queued run id: %w", err)
	}
	return Run{
		SchemaVersion:    SchemaVersion,
		ID:               runID,
		WorkspaceID:      workspaceID,
		ConversationID:   conversationID,
		TriggerMessageID: userMessage.ID,
		Harness:          HarnessCodex,
		Status:           RunStatusQueued,
		StartedAt:        "",
		CompletedAt:      "",
		PromptSummary:    summarize(prompt, maxPromptSummary),
		Error:            "",
	}, nil
}

func (service *Service) newRunAndAssistantMessage(workspaceID string, conversationID string, userMessage ChatMessage, prompt string, now string) (Run, ChatMessage, error) {
	runID, err := service.newID("run")
	if err != nil {
		return Run{}, ChatMessage{}, fmt.Errorf("create run id: %w", err)
	}
	message, err := service.newAssistantMessageWithOrdinal(conversationID, runID, userMessage.Ordinal+1, now)
	if err != nil {
		return Run{}, ChatMessage{}, err
	}
	run := Run{
		SchemaVersion:      SchemaVersion,
		ID:                 runID,
		WorkspaceID:        workspaceID,
		ConversationID:     conversationID,
		TriggerMessageID:   userMessage.ID,
		AssistantMessageID: message.ID,
		Harness:            HarnessCodex,
		Status:             RunStatusRunning,
		StartedAt:          now,
		CompletedAt:        "",
		PromptSummary:      summarize(prompt, maxPromptSummary),
		Error:              "",
	}
	return run, message, nil
}

func (service *Service) newAssistantMessage(workspaceID string, conversationID string, runID string, now string) (ChatMessage, error) {
	ordinal, err := service.store.NextMessageOrdinal(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, err
	}
	return service.newAssistantMessageWithOrdinal(conversationID, runID, ordinal, now)
}

func (service *Service) newAssistantMessageWithOrdinal(conversationID string, runID string, ordinal int, now string) (ChatMessage, error) {
	messageID, err := service.newID("message")
	if err != nil {
		return ChatMessage{}, fmt.Errorf("create assistant message id: %w", err)
	}
	partID, err := service.newID("part")
	if err != nil {
		return ChatMessage{}, fmt.Errorf("create assistant message part id: %w", err)
	}
	return ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             messageID,
		ConversationID: conversationID,
		RunID:          runID,
		Role:           RoleAssistant,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        ordinal,
		CreatedAt:      now,
		UpdatedAt:      now,
		Status:         MessageStatusStreaming,
		Parts: []MessagePart{{
			ID:     partID,
			Type:   MessagePartText,
			Text:   "",
			Format: TextFormatMarkdown,
		}},
	}, nil
}

func (service *Service) completeTurn(workspaceID string, conversationID string, runID string) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	run, active, ok, err := service.runningActiveTurnLocked(workspaceID, conversationID, runID)
	if err != nil || !ok {
		return err
	}
	now := timestamp(service.now())
	// Finalize transcript blocks before the run reaches a terminal store record so a
	// crash cannot leave a terminal run with perpetually streaming blocks (recovery
	// only re-finalizes still-running runs).
	if err := service.finalizeTranscriptBlocksLocked(workspaceID, active.transcript, TranscriptBlockStatusComplete, ""); err != nil {
		return err
	}
	message, run, err := service.saveCompletedTurnLocked(workspaceID, run, active.assistantMessage, now)
	if err != nil {
		return err
	}
	pendingSteering, err := service.markPendingSteeringMessagesLocked(workspaceID, conversationID, run.ID, MessageStatusComplete)
	if err != nil {
		return err
	}
	delete(service.active, activeKey(workspaceID, conversationID))
	if err := service.publishCompletedTurnLocked(workspaceID, conversationID, message, pendingSteering, run); err != nil {
		return err
	}
	workspaceSummary, err := service.resolveWorkspaceForRequest(workspaceID)
	if err != nil {
		return err
	}
	runs, err := service.runsForConversationWithDiagnosticsLocked(workspaceID, conversationID)
	if err != nil {
		return err
	}
	return service.promoteNextQueuedRunLocked(workspaceSummary, conversationID, runs)
}

func (service *Service) saveCompletedTurnLocked(workspaceID string, run Run, message ChatMessage, now string) (ChatMessage, Run, error) {
	message.Status = MessageStatusComplete
	message.UpdatedAt = now
	run.Status = RunStatusCompleted
	run.CompletedAt = now
	run.PendingApproval = nil
	records, err := service.store.CompleteTurn(TerminalTurnRecords{AssistantMessage: message, Run: run})
	if err != nil {
		return ChatMessage{}, Run{}, err
	}
	message = records.AssistantMessage
	run = records.Run
	if err := service.traceLocked(workspaceID, run.ID, "turn_completed", "Turn completed"); err != nil {
		return ChatMessage{}, Run{}, err
	}
	return message, run, nil
}

func (service *Service) publishCompletedTurnLocked(workspaceID string, conversationID string, message ChatMessage, pendingSteering []ChatMessage, run Run) error {
	if _, err := service.events.Publish(NewMessageUpdatedEvent(workspaceID, conversationID, run.ID, message)); err != nil {
		return err
	}
	if err := service.publishMessageUpdatesLocked(workspaceID, conversationID, run.ID, pendingSteering); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
		return err
	}
	if err := service.advanceReadRelevantMarkerLocked(workspaceID, conversationID, run.CompletedAt); err != nil {
		return err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
		return err
	}
	return nil
}

func (service *Service) failTurn(workspaceID string, conversationID string, runID string, message string) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return err
	}
	if run.Status != RunStatusRunning {
		return nil
	}
	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	if !ok || active.runID != runID {
		return nil
	}
	now := timestamp(service.now())
	assistant := active.assistantMessage
	assistant.Status = MessageStatusError
	assistant.UpdatedAt = now
	run.Status = RunStatusFailed
	run.CompletedAt = now
	run.Error = message
	run.PendingApproval = nil
	// Finalize transcript blocks before the terminal store record (see completeTurn).
	if err := service.finalizeTranscriptBlocksLocked(workspaceID, active.transcript, TranscriptBlockStatusFailed, message); err != nil {
		return err
	}
	records, err := service.store.FailTurn(TerminalTurnRecords{AssistantMessage: assistant, Run: run})
	if err != nil {
		return err
	}
	assistant = records.AssistantMessage
	run = records.Run
	if err := service.traceLocked(workspaceID, run.ID, "error_received", message); err != nil {
		return err
	}
	pendingSteering, err := service.markTerminalPendingSteeringLocked(workspaceID, conversationID, run.ID, MessageStatusError, true)
	if err != nil {
		return err
	}
	delete(service.active, key)
	return service.publishTerminalTurnLocked(workspaceID, conversationID, assistant, run, pendingSteering)
}

func (service *Service) overlayActiveAssistantMessageLocked(workspaceID string, conversationID string, beforeOrdinal int, page MessagePage) MessagePage {
	active, ok := service.active[activeKey(workspaceID, conversationID)]
	if !ok {
		return page
	}
	message := cloneMessage(active.assistantMessage)
	for index, pageMessage := range page.Messages {
		if pageMessage.ID == message.ID {
			page.Messages[index] = message
			return page
		}
	}
	if beforeOrdinal == 0 {
		page.Messages = append(page.Messages, message)
	}
	return page
}

func cloneMessage(message ChatMessage) ChatMessage {
	message.Parts = append([]MessagePart{}, message.Parts...)
	return message
}

func (service *Service) requestApproval(workspaceID string, conversationID string, runID string, approval ApprovalRequest) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	run, ok, err := service.runningRunForApprovalLocked(workspaceID, conversationID, runID)
	if err != nil || !ok {
		return err
	}
	approval, err = service.prepareApprovalRequestLocked(workspaceID, runID, approval)
	if err != nil {
		return err
	}
	return service.saveApprovalRequestLocked(workspaceID, run, approval)
}

func (service *Service) runningRunForApprovalLocked(workspaceID string, conversationID string, runID string) (Run, bool, error) {
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil || run.Status != RunStatusRunning {
		return run, false, err
	}
	if _, ok := service.active[activeKey(workspaceID, conversationID)]; !ok {
		return run, false, nil
	}
	return run, true, nil
}

func (service *Service) prepareApprovalRequestLocked(workspaceID string, runID string, approval ApprovalRequest) (ApprovalRequest, error) {
	var err error
	approval.ID, err = service.approvalIDLocked(approval.ID)
	if err != nil {
		return ApprovalRequest{}, err
	}
	approval.RunID = runID
	runItemID, err := service.runItemIDForProviderIDLocked(workspaceID, runID, approval.ProviderItemID)
	if err != nil {
		return ApprovalRequest{}, err
	}
	approval.RunItemID = runItemID
	approval.Options = stringSliceOrEmpty(approval.Options)
	approval.Questions = approvalQuestionsOrEmpty(approval.Questions)
	approval.Status = ApprovalStatusPending
	approval.CreatedAt = timestamp(service.now())
	return approval, nil
}

func (service *Service) approvalIDLocked(existing string) (string, error) {
	if existing != "" {
		return existing, nil
	}
	approvalID, err := service.newID("approval")
	if err != nil {
		return "", fmt.Errorf("create approval id: %w", err)
	}
	return approvalID, nil
}

func (service *Service) runItemIDForProviderIDLocked(workspaceID string, runID string, providerItemID string) (string, error) {
	if providerItemID == "" {
		return "", nil
	}
	item, ok, err := service.store.FindRunItemByProviderID(workspaceID, runID, providerItemID)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", fmt.Errorf("run item was not found for provider item id: %s", providerItemID)
	}
	return item.ID, nil
}

func stringSliceOrEmpty(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func approvalQuestionsOrEmpty(values []ApprovalQuestion) []ApprovalQuestion {
	if values == nil {
		return []ApprovalQuestion{}
	}
	return values
}

func (service *Service) saveApprovalRequestLocked(workspaceID string, run Run, approval ApprovalRequest) error {
	run.PendingApproval = &approval
	if err := service.store.SaveRun(run); err != nil {
		return err
	}
	if err := service.traceLocked(workspaceID, run.ID, "approval_requested", "Approval requested"); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
		return err
	}
	if err := service.advanceReadRelevantMarkerLocked(workspaceID, run.ConversationID, approval.CreatedAt); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, run.ConversationID, run.ID)
}

func (service *Service) resolveApproval(workspaceID string, _ string, runID string, approvalID string, approved bool, response string) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return err
	}
	if run.Status != RunStatusRunning || run.PendingApproval == nil || run.PendingApproval.ID != approvalID {
		return nil
	}
	run.PendingApproval = nil
	run, err = service.store.ResolveApproval(run)
	if err != nil {
		return err
	}
	if err := service.traceLocked(workspaceID, run.ID, "approval_resolved", approvalResolutionMessage(approved, response)); err != nil {
		return err
	}
	if _, err = service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
		return err
	}
	if err := service.advanceReadRelevantMarkerLocked(workspaceID, run.ConversationID, timestamp(service.now())); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, run.ConversationID, run.ID)
}

func approvalResolutionMessage(approved bool, response string) string {
	if response != "" {
		return "Approval answered"
	}
	if approved {
		return "Approval approved"
	}
	return "Approval denied"
}

func (service *Service) markHarnessRefUnavailable(workspaceID string, conversationID string, runID string, refErr *HarnessRefUnavailableError) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return err
	}
	now := timestamp(service.now())
	for index, ref := range conversation.HarnessRefs {
		if ref.Harness == refErr.Harness && ref.ThreadID == refErr.ThreadID {
			conversation.HarnessRefs[index].Status = HarnessRefMissing
			conversation.HarnessRefs[index].UnavailableMsg = refErr.Error()
			conversation.HarnessRefs[index].LastResumedAt = now
			conversation.UpdatedAt = now
			if err := service.store.SaveConversation(conversation); err != nil {
				return err
			}
			if runID != "" {
				if err := service.traceLocked(workspaceID, runID, "codex_thread_resume_failed", refErr.Error()); err != nil {
					return err
				}
			}
			return service.publishConversationUpdatedLocked(workspaceID, conversationID, runID)
		}
	}
	return nil
}

func (service *Service) trace(workspaceID string, runID string, eventType string, message string) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.traceLocked(workspaceID, runID, eventType, message)
}

func (service *Service) traceLocked(workspaceID string, runID string, eventType string, message string) error {
	id, err := service.newID("trace")
	if err != nil {
		return fmt.Errorf("create trace id: %w", err)
	}
	return service.store.SaveTraceEvent(workspaceID, TraceEvent{
		SchemaVersion: SchemaVersion,
		ID:            id,
		RunID:         runID,
		Type:          eventType,
		CreatedAt:     timestamp(service.now()),
		Message:       message,
	})
}

func updateConversationAfterPrompt(conversation Conversation, prompt string, now string) Conversation {
	if conversation.Title == "New chat" {
		conversation.Title = summarize(prompt, maxConversationTitle)
	}
	conversation.UpdatedAt = now
	return conversation
}

func latestHarnessRef(conversation Conversation, harness HarnessKind) HarnessThreadRef {
	for index := len(conversation.HarnessRefs) - 1; index >= 0; index-- {
		if conversation.HarnessRefs[index].Harness == harness {
			return conversation.HarnessRefs[index]
		}
	}
	return HarnessThreadRef{}
}

func upsertHarnessRef(refs *[]HarnessThreadRef, next HarnessThreadRef) {
	for index, existing := range *refs {
		if existing.Harness == next.Harness && existing.ThreadID == next.ThreadID {
			if existing.CreatedAt != "" {
				next.CreatedAt = existing.CreatedAt
			}
			(*refs)[index] = next
			return
		}
	}
	*refs = append(*refs, next)
}

func approvalResponseSummary(response string, answers []ApprovalAnswer) string {
	if strings.TrimSpace(response) != "" {
		return response
	}
	parts := make([]string, 0, len(answers))
	for _, answer := range answers {
		if len(answer.Answers) == 0 {
			continue
		}
		parts = append(parts, answer.QuestionID+": "+strings.Join(answer.Answers, ", "))
	}
	return strings.Join(parts, "\n")
}

func activeKey(workspaceID string, conversationID string) string {
	return workspaceID + "\x00" + conversationID
}

func summarize(value string, limit int) string {
	return normalizedTextPreview(value, limit)
}

func promptFromMessage(message ChatMessage) string {
	parts := make([]string, 0, len(message.Parts))
	for _, part := range message.Parts {
		parts = append(parts, part.Text)
	}
	return strings.Join(parts, "")
}

func timestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func randomID(prefix string) (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(bytes[:]), nil
}
