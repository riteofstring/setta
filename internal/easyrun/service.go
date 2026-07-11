package easyrun

import (
	"context"
	"crypto/rand"
	"encoding/hex"
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
	observerContext        context.Context
	observerWG             sync.WaitGroup
}

type ChatService interface {
	CancelActiveRunByID(workspaceID string, conversationID string, runID string) (chat.Run, error)
	HarnessTaskRunner() chat.HarnessTaskRunner
	ListRuns(workspaceID string, conversationID string) ([]chat.Run, error)
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
	startedAt := timestamp(service.now())
	run := EasyRun{
		ActiveAgentCount: 1,
		ArtifactCount:    0,
		ConversationID:   conversation.ID,
		CurrentFocus: EasyCurrentFocus{
			Revision:  0,
			Status:    EasyRunFocusStatusCurrent,
			Text:      requestText,
			UpdatedAt: startedAt,
		},
		HighlightCount: 0,
		ID:             easyRunID,
		NarratorStatus: EasyRunNarratorStatusOK,
		RequestText:    requestText,
		StartedAt:      startedAt,
		Status:         EasyRunStatusWorking,
		WorkspaceID:    workspaceID,
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
	for {
		target, err := service.beginTerminalChatRunProjection(run)
		if err != nil {
			return EasyRun{}, err
		}
		if target.waitForNarrator != nil {
			select {
			case <-ctx.Done():
				return EasyRun{}, ctx.Err()
			case <-target.waitForNarrator:
				continue
			}
		}
		if !target.shouldProject {
			return target.record.Run, nil
		}
		narration := service.runTerminalNarrator(ctx, target)
		updated, retry, err := service.saveTerminalChatRunProjection(target, run, narration)
		if err != nil {
			return EasyRun{}, err
		}
		if retry {
			continue
		}
		return updated, nil
	}
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
	digest               []narratorDigestEntry
	digestThrough        int
	mechanicalSummary    string
	previousCurrentFocus string
	previousHighlights   []EasyHighlight
	record               storedRunRecord
	shouldProject        bool
	status               chat.RunStatus
	waitForNarrator      <-chan struct{}
}

type workingNarratorProjection struct {
	digest               []narratorDigestEntry
	digestThrough        int
	previousCurrentFocus string
	previousHighlights   []EasyHighlight
	record               storedRunRecord
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
		return terminalChatRunProjection{record: record, waitForNarrator: state.inFlightDone}, nil
	}
	state.beginCall(service.now())
	digest, digestThrough := state.digest.consumePendingThrough()
	return terminalChatRunProjection{
		digest:               digest,
		digestThrough:        digestThrough,
		mechanicalSummary:    mechanicalSummary,
		previousCurrentFocus: state.previousCurrentFocusText(record.Run.CurrentFocus.Text),
		previousHighlights:   highlights,
		record:               record,
		shouldProject:        true,
		status:               run.Status,
	}, nil
}

func (service *Service) beginWorkingNarratorProjectionLocked(workspaceID string, easyRunID string) (workingNarratorProjection, bool) {
	state := service.narratorStateLocked(easyRunID)
	if !shouldTriggerNarrator(narratorTriggerInput{
		FocusDirty:          state.focusDirty,
		InFlight:            state.inFlight,
		LastCallAt:          state.lastCallAt,
		NewDigestEntryCount: state.digest.pendingCount(),
		Now:                 service.now(),
		Terminal:            false,
	}) {
		return workingNarratorProjection{}, false
	}
	record, err := service.store.loadRun(workspaceID, easyRunID)
	if err != nil {
		log.Printf("easy-run working narrator run lookup failed: %v", err)
		return workingNarratorProjection{}, false
	}
	if record.Run.Status != EasyRunStatusWorking {
		return workingNarratorProjection{}, false
	}
	if record.Run.NarratorStatus == EasyRunNarratorStatusDegraded {
		return workingNarratorProjection{}, false
	}
	highlights, err := service.store.loadHighlights(workspaceID, easyRunID)
	if err != nil {
		log.Printf("easy-run working narrator highlight lookup failed: %v", err)
		return workingNarratorProjection{}, false
	}
	state.beginCall(service.now())
	digest, digestThrough := state.digest.consumePendingThrough()
	return workingNarratorProjection{
		digest:               digest,
		digestThrough:        digestThrough,
		previousCurrentFocus: state.previousCurrentFocusText(record.Run.CurrentFocus.Text),
		previousHighlights:   highlights,
		record:               record,
	}, true
}

func (service *Service) saveTerminalChatRunProjection(target terminalChatRunProjection, run chat.Run, narration terminalNarrationResult) (EasyRun, bool, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	state := service.narratorStateLocked(target.record.Run.ID)
	defer state.finishCall()
	record, err := service.store.loadRun(target.record.Run.WorkspaceID, target.record.Run.ID)
	if err != nil {
		return EasyRun{}, false, err
	}
	if record.Run.Status != EasyRunStatusWorking {
		return record.Run, false, nil
	}
	if record.BackingRunID == "" {
		record.BackingRunID = run.ID
	}
	record, narratorSummary, err := service.applyTerminalNarrationLocked(record, state, target, narration)
	if err != nil {
		return EasyRun{}, false, err
	}
	if record.Run.CurrentFocus.Status == EasyRunFocusStatusUpdating {
		if err := service.saveRunAndPublishLocked(record); err != nil {
			return EasyRun{}, false, err
		}
		return record.Run, true, nil
	}
	updated, err := terminalEasyRun(record.Run, run, narratorSummary)
	if err != nil {
		return EasyRun{}, false, err
	}
	record.Run = updated
	if err := service.saveRunAndPublishLocked(record); err != nil {
		return EasyRun{}, false, err
	}
	delete(service.narratorByConversation, activeKey(record.Run.WorkspaceID, record.Run.ConversationID))
	return record.Run, false, nil
}

func (service *Service) applyTerminalNarrationLocked(record storedRunRecord, state *narratorRunState, target terminalChatRunProjection, narration terminalNarrationResult) (storedRunRecord, string, error) {
	if record.Run.NarratorStatus == EasyRunNarratorStatusDegraded {
		state.failFocusProjection()
		return record, "", nil
	}
	if narration.err != nil {
		degradeNarratorProjection(&record, state, narration.err)
		return record, "", nil
	}
	if _, err := service.recordNarratorHighlightsLocked(record.Run.WorkspaceID, record.Run.ID, narration.highlights); err != nil {
		degradeNarratorProjection(&record, state, err)
		return record, "", nil
	}
	record, err := service.store.loadRun(record.Run.WorkspaceID, record.Run.ID)
	if err != nil {
		return storedRunRecord{}, "", err
	}
	if err := applyNarratorCurrentFocusProjection(&record.Run, state, narration.currentFocus, target.digestThrough, service.now()); err != nil {
		degradeNarratorProjection(&record, state, err)
		return record, "", nil
	}
	record.Run.NarratorStatus = EasyRunNarratorStatusOK
	return record, narration.summary, nil
}

func (service *Service) saveWorkingNarratorProjection(target workingNarratorProjection, narration workingNarrationResult) (EasyRun, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	state := service.narratorStateLocked(target.record.Run.ID)
	defer state.finishCall()
	record, err := service.store.loadRun(target.record.Run.WorkspaceID, target.record.Run.ID)
	if err != nil {
		return EasyRun{}, err
	}
	if record.Run.Status != EasyRunStatusWorking {
		return record.Run, nil
	}
	if record.Run.NarratorStatus == EasyRunNarratorStatusDegraded {
		state.failFocusProjection()
		return record.Run, nil
	}
	if narration.err != nil {
		return service.saveDegradedWorkingNarratorLocked(record, state, narration.err)
	}
	if _, err := service.recordNarratorHighlightsLocked(record.Run.WorkspaceID, record.Run.ID, narration.highlights); err != nil {
		return service.saveDegradedWorkingNarratorLocked(record, state, err)
	}
	record, err = service.store.loadRun(record.Run.WorkspaceID, record.Run.ID)
	if err != nil {
		return EasyRun{}, err
	}
	return service.saveWorkingCurrentFocusLocked(record, state, target, narration.currentFocus)
}

func (service *Service) saveWorkingCurrentFocusLocked(record storedRunRecord, state *narratorRunState, target workingNarratorProjection, currentFocus string) (EasyRun, error) {
	lastGoodRecord := record
	if err := applyNarratorCurrentFocusProjection(&record.Run, state, currentFocus, target.digestThrough, service.now()); err != nil {
		return service.saveDegradedWorkingNarratorLocked(record, state, err)
	}
	record.Run.NarratorStatus = EasyRunNarratorStatusOK
	if err := service.store.saveRun(record); err != nil {
		failed, failureErr := service.markFocusProjectionStaleLocked(lastGoodRecord, state, err)
		return failed, failureErr
	}
	if _, err := service.events.Publish(NewRunUpdatedEvent(record.Run)); err != nil {
		failed, failureErr := service.markFocusProjectionStaleLocked(lastGoodRecord, state, err)
		return failed, failureErr
	}
	return record.Run, nil
}

func (service *Service) saveDegradedWorkingNarratorLocked(record storedRunRecord, state *narratorRunState, cause error) (EasyRun, error) {
	degradeNarratorProjection(&record, state, cause)
	if err := service.saveRunAndPublishLocked(record); err != nil {
		return EasyRun{}, err
	}
	return record.Run, nil
}

func degradeNarratorProjection(record *storedRunRecord, state *narratorRunState, cause error) {
	log.Printf("easy-run narrator degraded for %s: %v", record.Run.ID, cause)
	state.failFocusProjection()
	record.Run.CurrentFocus.Status = EasyRunFocusStatusStale
	record.Run.NarratorStatus = EasyRunNarratorStatusDegraded
}

func (service *Service) saveRunAndPublishLocked(record storedRunRecord) error {
	if err := service.store.saveRun(record); err != nil {
		return err
	}
	_, err := service.events.Publish(NewRunUpdatedEvent(record.Run))
	return err
}

func applyNarratorCurrentFocus(run *EasyRun, text string, status EasyRunFocusStatus, now time.Time) error {
	if run == nil {
		return errors.New("easy-run is required for current focus projection")
	}
	validated, err := narratorCurrentFocusText(text)
	if err != nil {
		return err
	}
	if validated != run.CurrentFocus.Text {
		run.CurrentFocus.Revision++
		run.CurrentFocus.Text = validated
		run.CurrentFocus.UpdatedAt = timestamp(now)
	}
	run.CurrentFocus.Status = status
	return nil
}

func applyNarratorCurrentFocusProjection(run *EasyRun, state *narratorRunState, text string, through int, now time.Time) error {
	if state == nil {
		return errors.New("easy-run narrator state is required for current focus projection")
	}
	validated, err := narratorCurrentFocusText(text)
	if err != nil {
		return err
	}
	status := state.finishFocusProjection(through)
	if status == EasyRunFocusStatusUpdating {
		state.pendingCurrentFocusText = validated
		run.CurrentFocus.Status = status
		return nil
	}
	state.pendingCurrentFocusText = ""
	return applyNarratorCurrentFocus(run, validated, status, now)
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
		errorMessage := strings.TrimSpace(chatRun.Error)
		if errorMessage == "" {
			return "", fmt.Errorf("failed chat run %s has empty error", chatRun.ID)
		}
		return fmt.Sprintf("Failed after %s - %s - %s", duration, errorMessage, easyRunArtifactCountSummary(run.ArtifactCount)), nil
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
