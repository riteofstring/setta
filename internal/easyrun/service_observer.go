package easyrun

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"

	"setta/internal/chat"
)

func (service *Service) startChatObserver() error {
	if service.chat == nil {
		return nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	service.observerCancel = cancel
	service.observerWG.Add(1)
	go func() {
		defer service.observerWG.Done()
		service.observeChatEvents(ctx)
	}()
	return nil
}

func (service *Service) observeChatEvents(ctx context.Context) {
	cursor := chat.EventCursor{}
	for ctx.Err() == nil {
		subscription, err := service.chat.SubscribeEvents(cursor)
		if err != nil {
			if ctx.Err() == nil {
				log.Printf("easy-run chat observer subscription failed: %v", err)
			}
			return
		}
		if subscription.SourceClosed() {
			subscription.Unsubscribe()
			return
		}
		nextCursor, resubscribe := service.drainChatEvents(ctx, subscription, cursor)
		subscription.Unsubscribe()
		cursor = nextCursor
		if !resubscribe {
			return
		}
	}
}

func (service *Service) drainChatEvents(ctx context.Context, subscription *chat.EventSubscription, cursor chat.EventCursor) (chat.EventCursor, bool) {
	for {
		select {
		case <-ctx.Done():
			return cursor, false
		case event, ok := <-subscription.Events:
			if !ok {
				return cursor, true
			}
			cursor = service.handleObservedChatEvent(ctx, cursor, event)
		}
	}
}

func (service *Service) handleObservedChatEvent(ctx context.Context, cursor chat.EventCursor, event chat.Event) chat.EventCursor {
	if event.StreamID != "" && event.StreamID == cursor.StreamID && event.Sequence <= cursor.Sequence {
		return cursor
	}
	nextCursor := chat.EventCursor{StreamID: event.StreamID, Sequence: event.Sequence}
	if event.Type == chat.EventTypeResyncRequired {
		service.handleChatResyncRequired(ctx, event)
		return nextCursor
	}
	service.handleChatEvent(ctx, event)
	return nextCursor
}

func (service *Service) handleChatResyncRequired(ctx context.Context, event chat.Event) {
	var payload chat.ResyncRequiredPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		log.Printf("easy-run chat resync event decode failed: %v", err)
		return
	}
	if err := service.resyncTerminalChatRuns(ctx); err != nil {
		log.Printf("easy-run chat resync failed: %v", err)
	}
}

func (service *Service) resyncTerminalChatRuns(ctx context.Context) error {
	terminalRuns, err := service.terminalChatRunsForWorkingEasyRuns()
	if err != nil {
		return err
	}
	for _, run := range terminalRuns {
		service.launchTerminalChatRunProjection(ctx, run)
	}
	return nil
}

func (service *Service) terminalChatRunsForWorkingEasyRuns() ([]chat.Run, error) {
	if service.chat == nil {
		return []chat.Run{}, nil
	}
	records, err := service.workingRunRecords()
	if err != nil {
		return nil, err
	}
	terminalRuns := []chat.Run{}
	for _, record := range records {
		runs, err := service.chat.ListRuns(record.Run.WorkspaceID, record.Run.ConversationID)
		if err != nil {
			return nil, fmt.Errorf("list chat runs for easy-run %s: %w", record.Run.ID, err)
		}
		for _, run := range runs {
			if run.ConversationID != record.Run.ConversationID {
				continue
			}
			if record.BackingRunID != "" && run.ID != record.BackingRunID {
				continue
			}
			if isTerminalChatRunStatus(run.Status) {
				terminalRuns = append(terminalRuns, run)
			}
		}
	}
	return terminalRuns, nil
}

func (service *Service) workingRunRecords() ([]storedRunRecord, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	workspaceIDs, err := service.store.workspaceIDs()
	if err != nil {
		return nil, err
	}
	records := []storedRunRecord{}
	for _, workspaceID := range workspaceIDs {
		workspaceRecords, err := service.store.loadRunRecords(workspaceID)
		if err != nil {
			return nil, err
		}
		for _, record := range workspaceRecords {
			if record.Run.Status == EasyRunStatusWorking {
				records = append(records, record)
			}
		}
	}
	return records, nil
}

func (service *Service) handleChatEvent(ctx context.Context, event chat.Event) {
	if target, ok := service.appendNarratorDigestFromChatEvent(event); ok {
		service.launchWorkingNarratorProjection(ctx, target)
	}
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

func (service *Service) launchWorkingNarratorProjection(ctx context.Context, target workingNarratorProjection) {
	service.observerWG.Add(1)
	go func() {
		defer service.observerWG.Done()
		narration := service.runWorkingNarrator(ctx, target)
		if _, err := service.saveWorkingNarratorProjection(target, narration); err != nil {
			log.Printf("easy-run working narrator projection failed: %v", err)
		}
	}()
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

func (service *Service) appendNarratorDigestFromChatEvent(event chat.Event) (workingNarratorProjection, bool) {
	entries, err := narratorDigestEntriesFromChatEvent(event)
	if err != nil {
		log.Printf("easy-run narrator digest chat event decode failed: %v", err)
		return workingNarratorProjection{}, false
	}
	if len(entries) == 0 {
		return workingNarratorProjection{}, false
	}
	service.mu.Lock()
	defer service.mu.Unlock()

	easyRunID := service.narratorByConversation[activeKey(event.WorkspaceID, event.ConversationID)]
	if easyRunID == "" {
		record, ok, err := service.store.findRunByConversationID(event.WorkspaceID, event.ConversationID)
		if err != nil {
			log.Printf("easy-run narrator digest ownership lookup failed: %v", err)
			return workingNarratorProjection{}, false
		}
		if !ok || record.Run.Status != EasyRunStatusWorking {
			return workingNarratorProjection{}, false
		}
		easyRunID = record.Run.ID
		service.narratorByConversation[activeKey(event.WorkspaceID, event.ConversationID)] = easyRunID
	}
	service.narratorStateLocked(easyRunID).digest.append(entries...)
	return service.beginWorkingNarratorProjectionLocked(event.WorkspaceID, easyRunID)
}

func (service *Service) appendNarratorDigestFromEasyRunEventLocked(event EasyRunEvent) (workingNarratorProjection, bool) {
	entries := narratorDigestEntriesFromEasyRunEvent(event)
	if len(entries) == 0 {
		return workingNarratorProjection{}, false
	}
	service.narratorStateLocked(event.EasyRunID).digest.append(entries...)
	return service.beginWorkingNarratorProjectionLocked(event.WorkspaceID, event.EasyRunID)
}
