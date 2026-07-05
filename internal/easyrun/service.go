package easyrun

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"setta/internal/chat"
)

var errEasyRunConversationNotFound = errors.New("easy-run conversation not found")

const easyRunInterruptedOnRestartReason = "run interrupted by backend restart"

type Service struct {
	chat          ChatService
	eventStreamID string
	events        *EventHub
	newID         func(string) (string, error)
	now           func() time.Time
	store         *Store

	mu             sync.Mutex
	observerCancel context.CancelFunc
	observerWG     sync.WaitGroup
}

type ChatService interface {
	CancelActiveRunByID(workspaceID string, conversationID string, runID string) (chat.Run, error)
	SendEasyRunTurn(workspaceID string, request chat.EasyRunTurnRequest) (chat.SendMessageResult, error)
	SteerActiveRunInputByID(workspaceID string, conversationID string, runID string, input chat.ChatInput) (chat.SteerMessageResult, error)
	SubscribeEvents(cursor chat.EventCursor) (*chat.EventSubscription, error)
}

type Option func(*Service)

func WithChatService(chatService ChatService) Option {
	return func(service *Service) {
		service.chat = chatService
	}
}

func WithClock(now func() time.Time) Option {
	return func(service *Service) {
		service.now = now
	}
}

func WithIDGenerator(newID func(string) (string, error)) Option {
	return func(service *Service) {
		service.newID = newID
	}
}

func withEventStreamID(streamID string) Option {
	return func(service *Service) {
		service.eventStreamID = streamID
	}
}

func NewService(store *Store, options ...Option) (*Service, error) {
	if store == nil {
		return nil, errors.New("easy-run store is required")
	}
	service := &Service{
		newID: randomStorageID,
		now:   time.Now,
		store: store,
	}
	for _, option := range options {
		option(service)
	}
	if service.eventStreamID == "" {
		streamID, err := newEasyRunEventStreamID()
		if err != nil {
			return nil, fmt.Errorf("create easy-run event stream id: %w", err)
		}
		service.eventStreamID = streamID
	}
	if service.newID == nil {
		return nil, errors.New("easy-run id generator is required")
	}
	if service.now == nil {
		return nil, errors.New("easy-run clock is required")
	}
	events, err := NewEventHub(service.eventStreamID)
	if err != nil {
		return nil, err
	}
	service.events = events
	if err := service.recoverInterruptedRuns(); err != nil {
		return nil, err
	}
	if err := service.startChatObserver(); err != nil {
		return nil, err
	}
	return service, nil
}

func (service *Service) Start(workspaceID string, requestText string) (EasyRun, error) {
	if service == nil {
		return EasyRun{}, errors.New("easy-run service is required")
	}
	trimmed := strings.TrimSpace(requestText)
	if err := validateWorkspaceID(workspaceID); err != nil {
		return EasyRun{}, err
	}
	if trimmed == "" {
		return EasyRun{}, errors.New("easy-run request text is required")
	}
	if service.chat == nil {
		return EasyRun{}, errors.New("easy-run chat service is required")
	}
	easyRunID, err := service.newID("easy_run")
	if err != nil {
		return EasyRun{}, fmt.Errorf("create easy-run id: %w", err)
	}

	service.mu.Lock()
	if active, ok, err := service.store.findWorkingRun(workspaceID); err != nil {
		service.mu.Unlock()
		return EasyRun{}, err
	} else if ok {
		service.mu.Unlock()
		return EasyRun{}, fmt.Errorf("easy-run %s is already working", active.Run.ID)
	}
	service.mu.Unlock()

	result, err := service.chat.SendEasyRunTurn(workspaceID, chat.EasyRunTurnRequest{
		EasyRunID: easyRunID,
		Prompt:    trimmed,
		OnConversationPrepared: func(conversation chat.Conversation) error {
			return service.prepareRunForConversation(workspaceID, easyRunID, trimmed, conversation)
		},
	})
	if err != nil {
		updated, updateErr := service.markStartFailure(workspaceID, easyRunID, err)
		if updateErr != nil {
			return EasyRun{}, errors.Join(err, updateErr)
		}
		if updated {
			return EasyRun{}, err
		}
		return EasyRun{}, err
	}
	return service.attachBackingRun(workspaceID, easyRunID, result.Run.ID)
}

func (service *Service) Stop(workspaceID string, easyRunID string) (EasyRun, error) {
	if service == nil {
		return EasyRun{}, errors.New("easy-run service is required")
	}
	if err := validateWorkspaceID(workspaceID); err != nil {
		return EasyRun{}, err
	}
	if err := validateEasyRunID(easyRunID); err != nil {
		return EasyRun{}, err
	}
	if service.chat == nil {
		return EasyRun{}, errors.New("easy-run chat service is required")
	}

	service.mu.Lock()
	record, err := service.store.loadRun(workspaceID, easyRunID)
	if err != nil {
		service.mu.Unlock()
		return EasyRun{}, err
	}
	if record.Run.Status != EasyRunStatusWorking {
		service.mu.Unlock()
		return EasyRun{}, fmt.Errorf("easy-run %s is not working", easyRunID)
	}
	if record.BackingRunID == "" {
		service.mu.Unlock()
		return EasyRun{}, fmt.Errorf("easy-run %s does not have an active backing run", easyRunID)
	}
	conversationID := record.Run.ConversationID
	backingRunID := record.BackingRunID
	service.mu.Unlock()

	run, err := service.chat.CancelActiveRunByID(workspaceID, conversationID, backingRunID)
	if err != nil {
		return EasyRun{}, err
	}
	return service.applyTerminalChatRun(run)
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

	service.mu.Lock()
	record, ok, err := service.store.findWorkingRun(workspaceID)
	if err != nil {
		service.mu.Unlock()
		return EasyRun{}, err
	}
	if !ok {
		service.mu.Unlock()
		return EasyRun{}, fmt.Errorf("workspace %s has no active easy-run", workspaceID)
	}
	if record.BackingRunID == "" {
		service.mu.Unlock()
		return EasyRun{}, fmt.Errorf("easy-run %s does not have an active backing run", record.Run.ID)
	}
	run := record.Run
	backingRunID := record.BackingRunID
	service.mu.Unlock()

	if _, err := service.chat.SteerActiveRunInputByID(workspaceID, run.ConversationID, backingRunID, chat.TextChatInput(trimmed)); err != nil {
		return EasyRun{}, err
	}
	return run, nil
}

func (service *Service) ReadSnapshot(workspaceID string) (EasyRunSnapshot, error) {
	if service == nil {
		return EasyRunSnapshot{}, errors.New("easy-run service is required")
	}
	return service.store.LoadLatestSnapshot(workspaceID, service.events.Cursor())
}

func (service *Service) SubscribeEvents(cursor EasyRunEventCursor) (*EventSubscription, error) {
	if service == nil {
		return nil, errors.New("easy-run service is required")
	}
	return service.events.Subscribe(cursor)
}

func (service *Service) CloseEvents() {
	if service == nil {
		return
	}
	if service.observerCancel != nil {
		service.observerCancel()
		service.observerWG.Wait()
	}
	service.events.Close()
}

func (service *Service) prepareRunForConversation(workspaceID string, easyRunID string, requestText string, conversation chat.Conversation) error {
	if conversation.WorkspaceID != workspaceID {
		return fmt.Errorf("easy-run conversation workspace %s does not match %s", conversation.WorkspaceID, workspaceID)
	}
	if !conversation.Internal || conversation.EasyRun == nil || conversation.EasyRun.EasyRunID != easyRunID {
		return fmt.Errorf("conversation %s is not prepared for easy-run %s", conversation.ID, easyRunID)
	}
	service.mu.Lock()
	defer service.mu.Unlock()

	if active, ok, err := service.store.findWorkingRun(workspaceID); err != nil {
		return err
	} else if ok {
		return fmt.Errorf("easy-run %s is already working", active.Run.ID)
	}
	run := EasyRun{
		ActiveAgentCount: 1,
		ArtifactCount:    0,
		ConversationID:   conversation.ID,
		HighlightCount:   0,
		ID:               easyRunID,
		NarratorStatus:   EasyRunNarratorStatusOK,
		RequestText:      requestText,
		StartedAt:        timestamp(service.now()),
		Status:           EasyRunStatusWorking,
		WorkspaceID:      workspaceID,
	}
	if err := service.store.saveNewRun(storedRunRecord{
		SchemaVersion: SchemaVersion,
		Run:           run,
	}); err != nil {
		return err
	}
	_, err := service.events.Publish(NewRunUpdatedEvent(run))
	return err
}

func (service *Service) attachBackingRun(workspaceID string, easyRunID string, backingRunID string) (EasyRun, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	record, err := service.store.loadRun(workspaceID, easyRunID)
	if err != nil {
		return EasyRun{}, err
	}
	if record.BackingRunID == "" {
		record.BackingRunID = backingRunID
		if err := service.store.saveRun(record); err != nil {
			return EasyRun{}, err
		}
	}
	return record.Run, nil
}

func (service *Service) markStartFailure(workspaceID string, easyRunID string, startErr error) (bool, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	record, err := service.store.loadRun(workspaceID, easyRunID)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	if record.Run.Status != EasyRunStatusWorking {
		return true, nil
	}
	endedAt := timestamp(service.now())
	errorMessage := startErr.Error()
	record.Run.Status = EasyRunStatusFailed
	record.Run.EndedAt = &endedAt
	record.Run.Error = &errorMessage
	record.Run.Summary = stringPointer("Failed before starting - no artifacts")
	record.Run.ActiveAgentCount = 0
	if err := service.store.saveRun(record); err != nil {
		return false, err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(record.Run)); err != nil {
		return false, err
	}
	return true, nil
}

func (service *Service) applyTerminalChatRun(run chat.Run) (EasyRun, error) {
	if err := validateTerminalChatRunForEasyRun(run); err != nil {
		return EasyRun{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()

	record, err := service.easyRunRecordForTerminalChatRun(run)
	if err != nil {
		return EasyRun{}, err
	}
	if record.Run.Status != EasyRunStatusWorking {
		return record.Run, nil
	}
	return service.saveTerminalChatRunProjection(record, run)
}

func validateTerminalChatRunForEasyRun(run chat.Run) error {
	if isTerminalChatRunStatus(run.Status) {
		return nil
	}
	return fmt.Errorf("chat run %s is not terminal: %s", run.ID, run.Status)
}

func isTerminalChatRunStatus(status chat.RunStatus) bool {
	switch status {
	case chat.RunStatusCompleted, chat.RunStatusCancelled, chat.RunStatusFailed:
		return true
	default:
		return false
	}
}

func (service *Service) easyRunRecordForTerminalChatRun(run chat.Run) (storedRunRecord, error) {
	record, ok, err := service.store.findRunByConversationID(run.WorkspaceID, run.ConversationID)
	if err != nil {
		return storedRunRecord{}, err
	}
	if !ok {
		return storedRunRecord{}, fmt.Errorf("%w: %s", errEasyRunConversationNotFound, run.ConversationID)
	}
	if record.BackingRunID != "" && record.BackingRunID != run.ID {
		return storedRunRecord{}, fmt.Errorf("easy-run %s backs chat run %s, not %s", record.Run.ID, record.BackingRunID, run.ID)
	}
	return record, nil
}

func (service *Service) saveTerminalChatRunProjection(record storedRunRecord, run chat.Run) (EasyRun, error) {
	if record.BackingRunID == "" {
		record.BackingRunID = run.ID
	}
	updated, err := terminalEasyRun(record.Run, run)
	if err != nil {
		return EasyRun{}, err
	}
	record.Run = updated
	if err := service.store.saveRun(record); err != nil {
		return EasyRun{}, err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(record.Run)); err != nil {
		return EasyRun{}, err
	}
	return record.Run, nil
}

func terminalEasyRun(run EasyRun, chatRun chat.Run) (EasyRun, error) {
	endedAt := chatRun.CompletedAt
	if endedAt == "" {
		return EasyRun{}, fmt.Errorf("terminal chat run %s completedAt is required", chatRun.ID)
	}
	if err := validateTimestamp("chat run completedAt", endedAt); err != nil {
		return EasyRun{}, err
	}
	duration, err := easyRunDuration(run.StartedAt, endedAt)
	if err != nil {
		return EasyRun{}, err
	}
	run.EndedAt = &endedAt
	run.ActiveAgentCount = 0
	switch chatRun.Status {
	case chat.RunStatusCompleted:
		run.Status = EasyRunStatusCompleted
		run.Error = nil
		run.Summary = stringPointer(fmt.Sprintf("Done in %s - %s", duration, easyRunArtifactCountSummary(run.ArtifactCount)))
	case chat.RunStatusCancelled:
		run.Status = EasyRunStatusStopped
		run.Error = nil
		run.Summary = stringPointer(fmt.Sprintf("Stopped after %s - %s", duration, easyRunArtifactCountSummary(run.ArtifactCount)))
	case chat.RunStatusFailed:
		run.Status = EasyRunStatusFailed
		errorMessage := strings.TrimSpace(chatRun.Error)
		if errorMessage == "" {
			return EasyRun{}, fmt.Errorf("failed chat run %s has empty error", chatRun.ID)
		}
		run.Error = &errorMessage
		run.Summary = stringPointer(fmt.Sprintf("Failed after %s - %s", duration, easyRunArtifactCountSummary(run.ArtifactCount)))
	default:
		return EasyRun{}, fmt.Errorf("unsupported terminal chat run status %s", chatRun.Status)
	}
	return run, nil
}

func easyRunDuration(startedAt string, endedAt string) (string, error) {
	started, err := time.Parse(time.RFC3339Nano, startedAt)
	if err != nil {
		return "", fmt.Errorf("parse easy-run startedAt: %w", err)
	}
	ended, err := time.Parse(time.RFC3339Nano, endedAt)
	if err != nil {
		return "", fmt.Errorf("parse easy-run endedAt: %w", err)
	}
	duration := ended.Sub(started)
	if duration < 0 {
		return "", fmt.Errorf("easy-run ended before it started: %s before %s", endedAt, startedAt)
	}
	duration = duration.Round(time.Second)
	if duration < time.Second {
		return "<1s", nil
	}
	return duration.String(), nil
}

func easyRunArtifactCountSummary(count int) string {
	switch count {
	case 0:
		return "no artifacts"
	case 1:
		return "1 artifact"
	default:
		return fmt.Sprintf("%d artifacts", count)
	}
}

func (service *Service) recoverInterruptedRuns() error {
	workspaceIDs, err := service.store.workspaceIDs()
	if err != nil {
		return err
	}
	endedAt := timestamp(service.now())
	for _, workspaceID := range workspaceIDs {
		records, err := service.store.loadRunRecords(workspaceID)
		if err != nil {
			return err
		}
		for _, record := range records {
			if record.Run.Status != EasyRunStatusWorking {
				continue
			}
			if _, err := service.recoverInterruptedRun(record, endedAt); err != nil {
				return err
			}
		}
	}
	return nil
}

func (service *Service) recoverInterruptedRun(record storedRunRecord, endedAt string) (EasyRun, error) {
	duration, err := easyRunDuration(record.Run.StartedAt, endedAt)
	if err != nil {
		return EasyRun{}, err
	}
	record.Run.Status = EasyRunStatusFailed
	record.Run.EndedAt = &endedAt
	record.Run.Error = stringPointer(easyRunInterruptedOnRestartReason)
	record.Run.Summary = stringPointer(fmt.Sprintf(
		"Failed after %s - %s - %s",
		duration,
		easyRunInterruptedOnRestartReason,
		easyRunArtifactCountSummary(record.Run.ArtifactCount),
	))
	record.Run.ActiveAgentCount = 0
	if err := service.store.saveRun(record); err != nil {
		return EasyRun{}, err
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(record.Run)); err != nil {
		return EasyRun{}, err
	}
	return record.Run, nil
}

func (service *Service) startChatObserver() error {
	if service.chat == nil {
		return nil
	}
	subscription, err := service.chat.SubscribeEvents(chat.EventCursor{})
	if err != nil {
		return fmt.Errorf("subscribe easy-run chat observer: %w", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	service.observerCancel = cancel
	service.observerWG.Add(1)
	go func() {
		defer service.observerWG.Done()
		service.observeChatEvents(ctx, subscription)
	}()
	return nil
}

func (service *Service) observeChatEvents(ctx context.Context, subscription *chat.EventSubscription) {
	defer subscription.Unsubscribe()

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-subscription.Events:
			if !ok {
				return
			}
			service.handleChatEvent(event)
		}
	}
}

func (service *Service) handleChatEvent(event chat.Event) {
	if event.Type != chat.EventTypeRunUpdated {
		return
	}
	var payload chat.RunUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		log.Printf("easy-run chat run event decode failed: %v", err)
		return
	}
	if payload.Run.Status != chat.RunStatusCompleted && payload.Run.Status != chat.RunStatusCancelled && payload.Run.Status != chat.RunStatusFailed {
		return
	}
	if _, err := service.applyTerminalChatRun(payload.Run); err != nil {
		if errors.Is(err, errEasyRunConversationNotFound) {
			return
		}
		log.Printf("easy-run terminal chat run projection failed: %v", err)
	}
}

func stringPointer(value string) *string {
	return &value
}

func randomStorageID(prefix string) (string, error) {
	var buffer [16]byte
	if _, err := rand.Read(buffer[:]); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(buffer[:]), nil
}

func newEasyRunEventStreamID() (string, error) {
	var buffer [8]byte
	if _, err := rand.Read(buffer[:]); err != nil {
		return "", err
	}
	return EasyRunEventStreamID + "_" + hex.EncodeToString(buffer[:]), nil
}
