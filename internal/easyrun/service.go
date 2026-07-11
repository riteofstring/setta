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
	"setta/internal/workspace"
)

var errEasyRunConversationNotFound = errors.New("easy-run conversation not found")

const easyRunInterruptedOnRestartReason = "run interrupted by backend restart"

type Service struct {
	chat          ChatService
	eventStreamID string
	events        *EventHub
	newID         func(string) (string, error)
	narratorKind  chat.HarnessKind
	narrator      chat.HarnessTaskRunner
	now           func() time.Time
	store         *Store
	workspaces    WorkspaceResolver

	mu                     sync.Mutex
	narratorByConversation map[string]string
	narrators              map[string]*narratorRunState
	observerCancel         context.CancelFunc
	observerWG             sync.WaitGroup
}

type ChatService interface {
	CancelActiveRunByID(workspaceID string, conversationID string, runID string) (chat.Run, error)
	HarnessTaskRunner() chat.HarnessTaskRunner
	ResolveEasyRunCodexSettings(workspaceID string, overrides chat.ChatCodexSettings) (chat.ChatCodexSettings, *chat.ChatCodexEffectiveSettings, error)
	SendEasyRunTurn(workspaceID string, request chat.EasyRunTurnRequest) (chat.SendMessageResult, error)
	SteerActiveRunInputByID(workspaceID string, conversationID string, runID string, input chat.ChatInput) (chat.SteerMessageResult, error)
	SubscribeEvents(cursor chat.EventCursor) (*chat.EventSubscription, error)
}

type WorkspaceResolver interface {
	ResolveWorkspace(id string) (workspace.WorkspaceSummary, error)
}

type Option func(*Service)

func WithChatService(chatService ChatService) Option {
	return func(service *Service) {
		service.chat = chatService
	}
}

func WithWorkspaceResolver(resolver WorkspaceResolver) Option {
	return func(service *Service) {
		service.workspaces = resolver
	}
}

func WithNarratorHarnessTaskRunner(runner chat.HarnessTaskRunner, harnessKind chat.HarnessKind) Option {
	return func(service *Service) {
		service.narrator = runner
		service.narratorKind = harnessKind
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
	service := newServiceDefaults(store)
	for _, option := range options {
		option(service)
	}
	if err := service.configureAfterOptions(); err != nil {
		return nil, err
	}
	if err := service.recoverInterruptedRuns(); err != nil {
		return nil, err
	}
	if err := service.startChatObserver(); err != nil {
		return nil, err
	}
	return service, nil
}

func newServiceDefaults(store *Store) *Service {
	return &Service{
		narratorByConversation: map[string]string{},
		narratorKind:           chat.HarnessCodex,
		narrators:              map[string]*narratorRunState{},
		newID:                  randomStorageID,
		now:                    time.Now,
		store:                  store,
	}
}

func (service *Service) configureAfterOptions() error {
	if service.narrator == nil && service.chat != nil {
		service.narrator = service.chat.HarnessTaskRunner()
	}
	if err := service.ensureEventStreamID(); err != nil {
		return err
	}
	if service.newID == nil {
		return errors.New("easy-run id generator is required")
	}
	if service.now == nil {
		return errors.New("easy-run clock is required")
	}
	events, err := NewEventHub(service.eventStreamID)
	if err != nil {
		return err
	}
	service.events = events
	return nil
}

func (service *Service) ensureEventStreamID() error {
	if service.eventStreamID != "" {
		return nil
	}
	streamID, err := newEasyRunEventStreamID()
	if err != nil {
		return fmt.Errorf("create easy-run event stream id: %w", err)
	}
	service.eventStreamID = streamID
	return nil
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
	service.narratorByConversation[activeKey(workspaceID, conversation.ID)] = easyRunID
	service.narrators[easyRunID] = newNarratorRunState()
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
	return service.applyTerminalChatRunWithNarrator(context.Background(), run)
}

func (service *Service) applyTerminalChatRunWithNarrator(ctx context.Context, run chat.Run) (EasyRun, error) {
	if err := validateTerminalChatRunForEasyRun(run); err != nil {
		return EasyRun{}, err
	}
	target, err := service.beginTerminalChatRunProjection(run)
	if err != nil {
		return EasyRun{}, err
	}
	if !target.shouldProject {
		return target.record.Run, nil
	}
	narration := service.runTerminalNarrator(ctx, target)
	return service.saveTerminalChatRunProjection(target.record, run, narration)
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

type terminalChatRunProjection struct {
	digest             []narratorDigestEntry
	mechanicalSummary  string
	previousHighlights []EasyHighlight
	record             storedRunRecord
	shouldProject      bool
	status             chat.RunStatus
}

func (service *Service) beginTerminalChatRunProjection(run chat.Run) (terminalChatRunProjection, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	record, err := service.easyRunRecordForTerminalChatRun(run)
	if err != nil {
		return terminalChatRunProjection{}, err
	}
	if record.Run.Status != EasyRunStatusWorking {
		return terminalChatRunProjection{record: record}, nil
	}
	mechanicalSummary, err := mechanicalTerminalEasyRunSummary(record.Run, run)
	if err != nil {
		return terminalChatRunProjection{}, err
	}
	highlights, err := service.store.loadHighlights(record.Run.WorkspaceID, record.Run.ID)
	if err != nil {
		return terminalChatRunProjection{}, err
	}
	state := service.narratorStateLocked(record.Run.ID)
	if state.inFlight {
		return terminalChatRunProjection{record: record}, nil
	}
	state.inFlight = true
	state.lastCallAt = service.now()
	return terminalChatRunProjection{
		digest:             state.digest.consumePending(),
		mechanicalSummary:  mechanicalSummary,
		previousHighlights: highlights,
		record:             record,
		shouldProject:      true,
		status:             run.Status,
	}, nil
}

func (service *Service) saveTerminalChatRunProjection(record storedRunRecord, run chat.Run, narration terminalNarrationResult) (EasyRun, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	state := service.narratorStateLocked(record.Run.ID)
	defer func() {
		state.inFlight = false
		delete(service.narratorByConversation, activeKey(record.Run.WorkspaceID, record.Run.ConversationID))
	}()

	latest, err := service.store.loadRun(record.Run.WorkspaceID, record.Run.ID)
	if err != nil {
		return EasyRun{}, err
	}
	if latest.Run.Status != EasyRunStatusWorking {
		return latest.Run, nil
	}
	record = latest
	if record.BackingRunID == "" {
		record.BackingRunID = run.ID
	}
	if narration.err != nil {
		log.Printf("easy-run narrator degraded for %s: %v", record.Run.ID, narration.err)
		record.Run.NarratorStatus = EasyRunNarratorStatusDegraded
	} else {
		if _, err := service.recordNarratorHighlightsLocked(record.Run.WorkspaceID, record.Run.ID, narration.highlights); err != nil {
			log.Printf("easy-run narrator highlight persistence degraded for %s: %v", record.Run.ID, err)
			record.Run.NarratorStatus = EasyRunNarratorStatusDegraded
			narration.summary = ""
		} else {
			record, err = service.store.loadRun(record.Run.WorkspaceID, record.Run.ID)
			if err != nil {
				return EasyRun{}, err
			}
			record.Run.NarratorStatus = EasyRunNarratorStatusOK
		}
	}
	updated, err := terminalEasyRun(record.Run, run, narration.summary)
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

func terminalEasyRun(run EasyRun, chatRun chat.Run, narratorSummary string) (EasyRun, error) {
	mechanicalSummary, err := mechanicalTerminalEasyRunSummary(run, chatRun)
	if err != nil {
		return EasyRun{}, err
	}
	endedAt := chatRun.CompletedAt
	run.EndedAt = &endedAt
	run.ActiveAgentCount = 0
	switch chatRun.Status {
	case chat.RunStatusCompleted:
		run.Status = EasyRunStatusCompleted
		run.Error = nil
	case chat.RunStatusCancelled:
		run.Status = EasyRunStatusStopped
		run.Error = nil
	case chat.RunStatusFailed:
		run.Status = EasyRunStatusFailed
		errorMessage := strings.TrimSpace(chatRun.Error)
		if errorMessage == "" {
			return EasyRun{}, fmt.Errorf("failed chat run %s has empty error", chatRun.ID)
		}
		run.Error = &errorMessage
	default:
		return EasyRun{}, fmt.Errorf("unsupported terminal chat run status %s", chatRun.Status)
	}
	run.Summary = stringPointer(terminalSummaryWithNarration(narratorSummary, mechanicalSummary))
	return run, nil
}

func mechanicalTerminalEasyRunSummary(run EasyRun, chatRun chat.Run) (string, error) {
	endedAt := chatRun.CompletedAt
	if endedAt == "" {
		return "", fmt.Errorf("terminal chat run %s completedAt is required", chatRun.ID)
	}
	if err := validateTimestamp("chat run completedAt", endedAt); err != nil {
		return "", err
	}
	duration, err := easyRunDuration(run.StartedAt, endedAt)
	if err != nil {
		return "", err
	}
	switch chatRun.Status {
	case chat.RunStatusCompleted:
		return fmt.Sprintf("Done in %s - %s", duration, easyRunArtifactCountSummary(run.ArtifactCount)), nil
	case chat.RunStatusCancelled:
		return fmt.Sprintf("Stopped after %s - %s", duration, easyRunArtifactCountSummary(run.ArtifactCount)), nil
	case chat.RunStatusFailed:
		return fmt.Sprintf("Failed after %s - %s", duration, easyRunArtifactCountSummary(run.ArtifactCount)), nil
	default:
		return "", fmt.Errorf("unsupported terminal chat run status %s", chatRun.Status)
	}
}

func terminalSummaryWithNarration(narratorSummary string, mechanicalSummary string) string {
	narratorSummary = strings.TrimSpace(narratorSummary)
	if narratorSummary == "" {
		return mechanicalSummary
	}
	if strings.HasSuffix(narratorSummary, ".") || strings.HasSuffix(narratorSummary, "!") || strings.HasSuffix(narratorSummary, "?") {
		return narratorSummary + " " + mechanicalSummary
	}
	return narratorSummary + ". " + mechanicalSummary
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
			service.handleChatEvent(ctx, event)
		}
	}
}

func (service *Service) handleChatEvent(ctx context.Context, event chat.Event) {
	service.appendNarratorDigestFromChatEvent(event)
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
	service.launchTerminalChatRunProjection(ctx, payload.Run)
}

func (service *Service) launchTerminalChatRunProjection(ctx context.Context, run chat.Run) {
	service.observerWG.Add(1)
	go func() {
		defer service.observerWG.Done()
		if _, err := service.applyTerminalChatRunWithNarrator(ctx, run); err != nil {
			if errors.Is(err, errEasyRunConversationNotFound) {
				return
			}
			log.Printf("easy-run terminal chat run projection failed: %v", err)
		}
	}()
}

func (service *Service) appendNarratorDigestFromChatEvent(event chat.Event) {
	entries, err := narratorDigestEntriesFromChatEvent(event)
	if err != nil {
		log.Printf("easy-run narrator digest chat event decode failed: %v", err)
		return
	}
	if len(entries) == 0 {
		return
	}
	service.mu.Lock()
	defer service.mu.Unlock()

	easyRunID := service.narratorByConversation[activeKey(event.WorkspaceID, event.ConversationID)]
	if easyRunID == "" {
		record, ok, err := service.store.findRunByConversationID(event.WorkspaceID, event.ConversationID)
		if err != nil {
			log.Printf("easy-run narrator digest ownership lookup failed: %v", err)
			return
		}
		if !ok || record.Run.Status != EasyRunStatusWorking {
			return
		}
		easyRunID = record.Run.ID
		service.narratorByConversation[activeKey(event.WorkspaceID, event.ConversationID)] = easyRunID
	}
	service.narratorStateLocked(easyRunID).digest.append(entries...)
}

func (service *Service) appendNarratorDigestFromEasyRunEventLocked(event EasyRunEvent) {
	entries := narratorDigestEntriesFromEasyRunEvent(event)
	if len(entries) == 0 {
		return
	}
	service.narratorStateLocked(event.EasyRunID).digest.append(entries...)
}

func stringPointer(value string) *string {
	return &value
}

func activeKey(workspaceID string, conversationID string) string {
	return workspaceID + "\x00" + conversationID
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
