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
	workspaceResolver WorkspaceResolver
	events            *EventHub
	externalHistory   ExternalHistoryProvider
	newID             func(prefix string) (string, error)
	now               func() time.Time

	mu     sync.Mutex
	active map[string]activeTurn
}

type Option func(*Service)

type activeTurn struct {
	assistantMessage ChatMessage
	cancel           context.CancelFunc
	lastPersistedAt  time.Time
	runID            string
	workspaceID      string
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
		workspaceResolver: workspaceResolver,
		externalHistory:   NewCodexHistoryProvider(CodexHistoryProviderConfig{}),
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
		return nil, err
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

func WithExternalHistoryProvider(provider ExternalHistoryProvider) Option {
	return func(service *Service) {
		service.externalHistory = provider
	}
}

func (service *Service) SubscribeEvents(cursor EventCursor) (*EventSubscription, error) {
	return service.events.Subscribe(cursor)
}

func (service *Service) CloseEvents() {
	service.events.Close()
}

func (service *Service) ListConversations(workspaceID string) ([]ConversationListItem, error) {
	workspaceSummary, err := service.workspaceResolver.ResolveWorkspace(workspaceID)
	if err != nil {
		return nil, err
	}
	conversations, err := service.store.ListConversations(workspaceID)
	if err != nil {
		return nil, err
	}
	items := make([]ConversationListItem, 0, len(conversations))
	for _, conversation := range conversations {
		count, err := service.store.MessageCount(workspaceID, conversation.ID)
		if err != nil {
			return nil, err
		}
		activeRunID := ""
		if run, ok, err := service.store.ActiveRun(workspaceID, conversation.ID); err != nil {
			return nil, err
		} else if ok {
			activeRunID = run.ID
		}
		items = append(items, ConversationListItem{
			Conversation: conversation,
			MessageCount: count,
			ActiveRunID:  activeRunID,
		})
	}
	external, err := service.externalConversationItems(workspaceSummary, conversations)
	if err != nil {
		return nil, err
	}
	return sortConversationListItems(append(items, external...)), nil
}

func (service *Service) CreateConversation(workspaceID string, title string) (Conversation, error) {
	if _, err := service.workspaceResolver.ResolveWorkspace(workspaceID); err != nil {
		return Conversation{}, err
	}
	now := timestamp(service.now())
	id, err := service.newID("conversation")
	if err != nil {
		return Conversation{}, fmt.Errorf("create conversation id: %w", err)
	}
	title = strings.TrimSpace(title)
	if title == "" {
		title = "New chat"
	}
	conversation := Conversation{
		SchemaVersion: SchemaVersion,
		ID:            id,
		WorkspaceID:   workspaceID,
		Title:         title,
		CreatedAt:     now,
		UpdatedAt:     now,
		ArchivedAt:    "",
		HarnessRefs:   []HarnessThreadRef{},
	}
	if err := service.store.SaveConversation(conversation); err != nil {
		return Conversation{}, err
	}
	if err := service.publishConversationUpdated(workspaceID, conversation.ID, ""); err != nil {
		return Conversation{}, err
	}
	return conversation, nil
}

func (service *Service) LoadMessagePage(workspaceID string, conversationID string, beforeOrdinal int, limit int) (MessagePage, error) {
	if limit == 0 {
		limit = defaultPageLimit
	}
	workspaceSummary, err := service.workspaceResolver.ResolveWorkspace(workspaceID)
	if err != nil {
		return MessagePage{}, err
	}
	if service.ownsExternalConversation(conversationID) {
		service.mu.Lock()
		err := service.materializeExternalConversationLocked(workspaceSummary, conversationID)
		service.mu.Unlock()
		if err != nil {
			return MessagePage{}, err
		}
	}
	page, err := service.store.LoadMessagePage(workspaceID, conversationID, beforeOrdinal, limit)
	if err != nil {
		return MessagePage{}, err
	}
	return service.overlayActiveAssistantMessage(workspaceID, conversationID, beforeOrdinal, page), nil
}

func (service *Service) SendUserMessage(workspaceID string, conversationID string, prompt string) (SendMessageResult, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return SendMessageResult{}, errors.New("prompt is required")
	}
	workspaceSummary, err := service.workspaceResolver.ResolveWorkspace(workspaceID)
	if err != nil {
		return SendMessageResult{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	if err := service.materializeExternalConversationLocked(workspaceSummary, conversationID); err != nil {
		return SendMessageResult{}, err
	}
	if err := service.ensureNoActiveTurnLocked(workspaceID, conversationID); err != nil {
		return SendMessageResult{}, err
	}

	now := timestamp(service.now())
	conversation, userMessage, assistantMessage, run, err := service.persistTurnStartLocked(workspaceID, conversationID, prompt, now)
	if err != nil {
		return SendMessageResult{}, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	key := activeKey(workspaceID, conversationID)
	service.active[key] = activeTurn{
		assistantMessage: assistantMessage,
		cancel:           cancel,
		runID:            run.ID,
		workspaceID:      workspaceID,
	}
	request := TurnRequest{
		Workspace:    workspaceSummary,
		Conversation: conversation,
		Run:          run,
		Prompt:       prompt,
		ThreadRef:    latestHarnessRef(conversation, HarnessCodex),
	}
	go service.runHarnessTurn(ctx, request)

	page, err := service.store.LoadMessagePage(workspaceID, conversationID, 0, defaultPageLimit)
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

func (service *Service) UpdateUserMessage(workspaceID string, conversationID string, messageID string, text string) (ChatMessage, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return ChatMessage{}, errors.New("message text is required")
	}
	if _, err := service.workspaceResolver.ResolveWorkspace(workspaceID); err != nil {
		return ChatMessage{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()

	if err := service.ensureNoActiveTurnLocked(workspaceID, conversationID); err != nil {
		return ChatMessage{}, err
	}

	message, err := service.store.LoadMessageByID(workspaceID, conversationID, messageID)
	if err != nil {
		return ChatMessage{}, err
	}
	if err := validateEditableUserMessage(message); err != nil {
		return ChatMessage{}, err
	}
	now := timestamp(service.now())
	message.Parts[0].Text = text
	message.Parts[0].Format = TextFormatPlain
	message.UpdatedAt = now
	if err := service.store.SaveMessage(workspaceID, message); err != nil {
		return ChatMessage{}, err
	}
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return ChatMessage{}, err
	}
	conversation.UpdatedAt = now
	if err := service.store.SaveConversation(conversation); err != nil {
		return ChatMessage{}, err
	}
	if _, err := service.events.Publish(NewMessageUpdatedEvent(workspaceID, conversationID, message.RunID, message)); err != nil {
		return ChatMessage{}, err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, message.RunID); err != nil {
		return ChatMessage{}, err
	}
	return message, nil
}

func (service *Service) ensureNoActiveTurnLocked(workspaceID string, conversationID string) error {
	key := activeKey(workspaceID, conversationID)
	if _, ok := service.active[key]; ok {
		return fmt.Errorf("conversation already has an active turn: %s", conversationID)
	}
	run, ok, err := service.store.ActiveRun(workspaceID, conversationID)
	if err != nil {
		return err
	}
	if ok {
		return fmt.Errorf("conversation already has an active run: %s", run.ID)
	}
	return nil
}

func validateEditableUserMessage(message ChatMessage) error {
	if message.Role != RoleUser {
		return fmt.Errorf("only user messages can be edited: %s", message.ID)
	}
	if len(message.Parts) != 1 {
		return fmt.Errorf("message %s has %d parts; expected one editable text part", message.ID, len(message.Parts))
	}
	return nil
}

func (service *Service) persistTurnStartLocked(workspaceID string, conversationID string, prompt string, now string) (Conversation, ChatMessage, ChatMessage, Run, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	userMessage, err := service.newUserMessage(workspaceID, conversationID, prompt, now)
	if err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	if err := service.store.SaveMessage(workspaceID, userMessage); err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	run, assistantMessage, err := service.newRunAndAssistantMessage(workspaceID, conversationID, userMessage, prompt, now)
	if err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	if err := service.store.SaveRun(run); err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	if err := service.store.SaveMessage(workspaceID, assistantMessage); err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	conversation = updateConversationAfterPrompt(conversation, prompt, now)
	if err := service.store.SaveConversation(conversation); err != nil {
		return Conversation{}, ChatMessage{}, ChatMessage{}, Run{}, err
	}
	if err := service.traceLocked(workspaceID, run.ID, "turn_started", "Assistant turn started"); err != nil {
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
	service.mu.Lock()
	key := activeKey(workspaceID, conversationID)
	active, ok := service.active[key]
	if !ok || active.workspaceID != workspaceID {
		run, exists, err := service.store.ActiveRun(workspaceID, conversationID)
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
	if err := service.store.SaveMessage(workspaceID, message); err != nil {
		return Run{}, err
	}
	run.Status = RunStatusCancelled
	run.CompletedAt = now
	run.Error = "turn cancelled"
	run.HasPendingApproval = false
	run.PendingApproval = ApprovalRequest{}
	if err := service.store.SaveRun(run); err != nil {
		return Run{}, err
	}
	if err := service.traceLocked(workspaceID, run.ID, "cancellation_requested", "Turn cancellation requested"); err != nil {
		return Run{}, err
	}
	delete(service.active, key)
	if _, err := service.events.Publish(NewMessageUpdatedEvent(workspaceID, conversationID, run.ID, message)); err != nil {
		return Run{}, err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
		return Run{}, err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
		return Run{}, err
	}
	return run, nil
}

func (service *Service) ActiveRun(workspaceID string, conversationID string) (Run, bool, error) {
	if _, err := service.workspaceResolver.ResolveWorkspace(workspaceID); err != nil {
		return Run{}, false, err
	}
	return service.store.ActiveRun(workspaceID, conversationID)
}

func (service *Service) SubmitApproval(workspaceID string, conversationID string, approvalID string, approved bool, response string, answers []ApprovalAnswer, cancelled bool) (Run, error) {
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

	run, ok, err := service.store.ActiveRun(workspaceID, conversationID)
	if err != nil {
		return Run{}, err
	}
	if !ok {
		return Run{}, fmt.Errorf("conversation has no active run: %s", conversationID)
	}
	if !run.HasPendingApproval || run.PendingApproval.ID != approvalID {
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
	if !run.HasPendingApproval || run.PendingApproval.ID != approvalID {
		return run, nil
	}
	approval := run.PendingApproval
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
	run.HasPendingApproval = false
	run.PendingApproval = ApprovalRequest{}
	if err := service.store.SaveRun(run); err != nil {
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

func (service *Service) newUserMessage(workspaceID string, conversationID string, prompt string, now string) (ChatMessage, error) {
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
		RunID:          "",
		Role:           RoleUser,
		Ordinal:        ordinal,
		CreatedAt:      now,
		UpdatedAt:      now,
		Status:         MessageStatusComplete,
		Parts: []MessagePart{{
			ID:     partID,
			Type:   MessagePartText,
			Text:   prompt,
			Format: TextFormatPlain,
		}},
	}, nil
}

func (service *Service) newRunAndAssistantMessage(workspaceID string, conversationID string, userMessage ChatMessage, prompt string, now string) (Run, ChatMessage, error) {
	runID, err := service.newID("run")
	if err != nil {
		return Run{}, ChatMessage{}, fmt.Errorf("create run id: %w", err)
	}
	messageID, err := service.newID("message")
	if err != nil {
		return Run{}, ChatMessage{}, fmt.Errorf("create assistant message id: %w", err)
	}
	partID, err := service.newID("part")
	if err != nil {
		return Run{}, ChatMessage{}, fmt.Errorf("create assistant message part id: %w", err)
	}
	ordinal, err := service.store.NextMessageOrdinal(workspaceID, conversationID)
	if err != nil {
		return Run{}, ChatMessage{}, err
	}
	run := Run{
		SchemaVersion:    SchemaVersion,
		ID:               runID,
		WorkspaceID:      workspaceID,
		ConversationID:   conversationID,
		TriggerMessageID: userMessage.ID,
		Harness:          HarnessCodex,
		Status:           RunStatusRunning,
		StartedAt:        now,
		CompletedAt:      "",
		PromptSummary:    summarize(prompt, maxPromptSummary),
		Error:            "",
	}
	message := ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             messageID,
		ConversationID: conversationID,
		RunID:          runID,
		Role:           RoleAssistant,
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
	}
	return run, message, nil
}

func (service *Service) runHarnessTurn(ctx context.Context, request TurnRequest) {
	sink := turnSink{service: service, workspaceID: request.Workspace.ID, conversationID: request.Conversation.ID, runID: request.Run.ID}
	err := service.harness.StartTurn(ctx, request, sink)
	if err != nil {
		if errors.Is(ctx.Err(), context.Canceled) {
			return
		}
		var refErr *HarnessRefUnavailableError
		if errors.As(err, &refErr) {
			_ = service.markHarnessRefUnavailable(request.Workspace.ID, request.Conversation.ID, request.Run.ID, refErr)
		}
		_ = service.failTurn(request.Workspace.ID, request.Conversation.ID, request.Run.ID, err.Error())
		return
	}
	_ = service.completeTurn(request.Workspace.ID, request.Conversation.ID, request.Run.ID)
}

func (service *Service) completeTurn(workspaceID string, conversationID string, runID string) error {
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
	message := active.assistantMessage
	message.Status = MessageStatusComplete
	message.UpdatedAt = now
	if err := service.store.SaveMessage(workspaceID, message); err != nil {
		return err
	}
	run.Status = RunStatusCompleted
	run.CompletedAt = now
	run.HasPendingApproval = false
	run.PendingApproval = ApprovalRequest{}
	if err := service.store.SaveRun(run); err != nil {
		return err
	}
	if err := service.traceLocked(workspaceID, run.ID, "turn_completed", "Turn completed"); err != nil {
		return err
	}
	delete(service.active, key)
	if _, err := service.events.Publish(NewMessageUpdatedEvent(workspaceID, conversationID, run.ID, message)); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
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
	if err := service.store.SaveMessage(workspaceID, assistant); err != nil {
		return err
	}
	run.Status = RunStatusFailed
	run.CompletedAt = now
	run.Error = message
	run.HasPendingApproval = false
	run.PendingApproval = ApprovalRequest{}
	if err := service.store.SaveRun(run); err != nil {
		return err
	}
	if err := service.traceLocked(workspaceID, run.ID, "error_received", message); err != nil {
		return err
	}
	delete(service.active, key)
	if _, err := service.events.Publish(NewMessageUpdatedEvent(workspaceID, conversationID, run.ID, assistant)); err != nil {
		return err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(run)); err != nil {
		return err
	}
	if err := service.publishConversationUpdatedLocked(workspaceID, conversationID, run.ID); err != nil {
		return err
	}
	return nil
}

func (service *Service) appendAssistantDelta(workspaceID string, conversationID string, runID string, delta string) error {
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
	message := active.assistantMessage
	message.Parts[0].Text += delta
	now := service.now()
	message.UpdatedAt = timestamp(now)
	partID := message.Parts[0].ID
	active.assistantMessage = message
	if _, err := service.events.Publish(NewAssistantTextDeltaEvent(workspaceID, conversationID, runID, message.ID, partID, delta, message.UpdatedAt)); err != nil {
		return err
	}
	if active.lastPersistedAt.IsZero() || now.Sub(active.lastPersistedAt) >= deltaPersistInterval {
		if err := service.store.SaveMessage(workspaceID, message); err != nil {
			return err
		}
		active.lastPersistedAt = now
		if err := service.traceLocked(workspaceID, run.ID, "assistant_text_delta_received", "Assistant text delta received"); err != nil {
			return err
		}
	}
	service.active[key] = active
	return nil
}

func (service *Service) overlayActiveAssistantMessage(workspaceID string, conversationID string, beforeOrdinal int, page MessagePage) MessagePage {
	service.mu.Lock()
	active, ok := service.active[activeKey(workspaceID, conversationID)]
	service.mu.Unlock()
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

	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return err
	}
	if run.Status != RunStatusRunning {
		return nil
	}
	if _, ok := service.active[activeKey(workspaceID, conversationID)]; !ok {
		return nil
	}
	if approval.ID == "" {
		approvalID, err := service.newID("approval")
		if err != nil {
			return fmt.Errorf("create approval id: %w", err)
		}
		approval.ID = approvalID
	}
	approval.RunID = runID
	if approval.Options == nil {
		approval.Options = []string{}
	}
	if approval.Questions == nil {
		approval.Questions = []ApprovalQuestion{}
	}
	approval.Status = ApprovalStatusPending
	approval.CreatedAt = timestamp(service.now())
	run.HasPendingApproval = true
	run.PendingApproval = approval
	if err := service.store.SaveRun(run); err != nil {
		return err
	}
	if err := service.traceLocked(workspaceID, run.ID, "approval_requested", "Approval requested"); err != nil {
		return err
	}
	_, err = service.events.Publish(NewRunUpdatedEvent(run))
	return err
}

func (service *Service) resolveApproval(workspaceID string, _ string, runID string, approvalID string, approved bool, response string) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		return err
	}
	if run.Status != RunStatusRunning || !run.HasPendingApproval || run.PendingApproval.ID != approvalID {
		return nil
	}
	run.HasPendingApproval = false
	run.PendingApproval = ApprovalRequest{}
	if err := service.store.SaveRun(run); err != nil {
		return err
	}
	message := "Approval denied"
	if approved {
		message = "Approval approved"
	}
	if response != "" {
		message = "Approval answered"
	}
	if err := service.traceLocked(workspaceID, run.ID, "approval_resolved", message); err != nil {
		return err
	}
	_, err = service.events.Publish(NewRunUpdatedEvent(run))
	return err
}

func (service *Service) linkThread(workspaceID string, conversationID string, runID string, threadID string, sessionID string, turnID string) error {
	service.mu.Lock()
	defer service.mu.Unlock()

	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return err
	}
	now := timestamp(service.now())
	upsertHarnessRef(&conversation.HarnessRefs, HarnessThreadRef{
		Harness:        HarnessCodex,
		ThreadID:       threadID,
		SessionID:      sessionID,
		LastTurnID:     turnID,
		Status:         HarnessRefLinked,
		CreatedAt:      now,
		LastResumedAt:  now,
		UnavailableMsg: "",
	})
	conversation.UpdatedAt = now
	if err := service.store.SaveConversation(conversation); err != nil {
		return err
	}
	if err := service.traceLocked(workspaceID, runID, "codex_thread_ref_linked", "Thread reference linked"); err != nil {
		return err
	}
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, runID)
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
			if err := service.traceLocked(workspaceID, runID, "codex_thread_resume_failed", refErr.Error()); err != nil {
				return err
			}
			return service.publishConversationUpdatedLocked(workspaceID, conversationID, runID)
		}
	}
	return nil
}

func (service *Service) publishConversationUpdated(workspaceID string, conversationID string, runID string) error {
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.publishConversationUpdatedLocked(workspaceID, conversationID, runID)
}

func (service *Service) publishConversationUpdatedLocked(workspaceID string, conversationID string, runID string) error {
	item, err := service.conversationListItemLocked(workspaceID, conversationID)
	if err != nil {
		return err
	}
	_, err = service.events.Publish(NewConversationUpdatedEvent(workspaceID, conversationID, runID, item))
	return err
}

func (service *Service) conversationListItemLocked(workspaceID string, conversationID string) (ConversationListItem, error) {
	conversation, err := service.store.LoadConversation(workspaceID, conversationID)
	if err != nil {
		return ConversationListItem{}, err
	}
	count, err := service.store.MessageCount(workspaceID, conversationID)
	if err != nil {
		return ConversationListItem{}, err
	}
	activeRunID := ""
	if run, ok, err := service.store.ActiveRun(workspaceID, conversationID); err != nil {
		return ConversationListItem{}, err
	} else if ok {
		activeRunID = run.ID
	}
	return ConversationListItem{
		ActiveRunID:  activeRunID,
		Conversation: conversation,
		MessageCount: count,
	}, nil
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

func (service *Service) recoverInterruptedRuns() error {
	workspaceIDs, err := service.store.WorkspaceIDs()
	if err != nil {
		return err
	}
	now := timestamp(service.now())
	for _, workspaceID := range workspaceIDs {
		runs, err := service.store.ListRuns(workspaceID)
		if err != nil {
			return err
		}
		for _, run := range runs {
			if run.Status != RunStatusRunning {
				continue
			}
			message, ok, err := service.store.FindMessageByRunID(workspaceID, run.ConversationID, run.ID)
			if err != nil {
				return err
			}
			if ok {
				message.Status = MessageStatusError
				message.UpdatedAt = now
				if err := service.store.SaveMessage(workspaceID, message); err != nil {
					return err
				}
			}
			run.Status = RunStatusFailed
			run.CompletedAt = now
			run.Error = "run interrupted by backend restart"
			run.HasPendingApproval = false
			run.PendingApproval = ApprovalRequest{}
			if err := service.store.SaveRun(run); err != nil {
				return err
			}
			if err := service.traceLocked(workspaceID, run.ID, "error_received", run.Error); err != nil {
				return err
			}
		}
	}
	return nil
}

type turnSink struct {
	service        *Service
	workspaceID    string
	conversationID string
	runID          string
}

func (sink turnSink) AssistantTextDelta(text string) error {
	return sink.service.appendAssistantDelta(sink.workspaceID, sink.conversationID, sink.runID, text)
}

func (sink turnSink) ApprovalRequested(approval ApprovalRequest) error {
	return sink.service.requestApproval(sink.workspaceID, sink.conversationID, sink.runID, approval)
}

func (sink turnSink) ApprovalResolved(approvalID string, approved bool, response string) error {
	return sink.service.resolveApproval(sink.workspaceID, sink.conversationID, sink.runID, approvalID, approved, response)
}

func (sink turnSink) ThreadLinked(threadID string, sessionID string, turnID string) error {
	return sink.service.linkThread(sink.workspaceID, sink.conversationID, sink.runID, threadID, sessionID, turnID)
}

func (sink turnSink) Trace(eventType string, message string) error {
	return sink.service.trace(sink.workspaceID, sink.runID, eventType, message)
}

func updateConversationAfterPrompt(conversation Conversation, prompt string, now string) Conversation {
	if conversation.Title == "New chat" {
		conversation.Title = summarize(prompt, maxConversationTitle)
	}
	conversation.UpdatedAt = now
	return conversation
}

func latestHarnessRef(conversation Conversation, harness string) HarnessThreadRef {
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
	value = strings.Join(strings.Fields(value), " ")
	if len(value) <= limit {
		return value
	}
	return strings.TrimSpace(value[:limit])
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
