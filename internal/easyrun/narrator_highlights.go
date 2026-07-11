package easyrun

import (
	"errors"
	"fmt"
	"log"
	"strings"
)

const maxEasyHighlightsPerNarratorCall = 2

// RecordNarratorHighlights persists phase-level highlights returned by the easy-run narrator.
func (service *Service) RecordNarratorHighlights(workspaceID string, easyRunID string, texts []string) ([]EasyHighlight, error) {
	if err := validateNarratorHighlightRequest(service, workspaceID, easyRunID); err != nil {
		return nil, err
	}
	acceptedTexts, err := narratorHighlightTexts(texts)
	if err != nil {
		return nil, err
	}
	if len(acceptedTexts) == 0 {
		return []EasyHighlight{}, nil
	}

	service.mu.Lock()
	defer service.mu.Unlock()
	return service.recordNarratorHighlightsLocked(workspaceID, easyRunID, acceptedTexts)
}

func validateNarratorHighlightRequest(service *Service, workspaceID string, easyRunID string) error {
	if service == nil {
		return errors.New("easy-run service is required")
	}
	if err := validateWorkspaceID(workspaceID); err != nil {
		return err
	}
	return validateEasyRunID(easyRunID)
}

func (service *Service) recordNarratorHighlightsLocked(workspaceID string, easyRunID string, texts []string) ([]EasyHighlight, error) {
	record, err := service.store.loadRun(workspaceID, easyRunID)
	if err != nil {
		return nil, err
	}
	highlights, err := service.store.loadHighlights(workspaceID, easyRunID)
	if err != nil {
		return nil, err
	}
	texts = capNarratorHighlightTexts(easyRunID, texts, len(highlights))
	if len(texts) == 0 {
		return []EasyHighlight{}, nil
	}
	created, err := service.newNarratorHighlightsLocked(easyRunID, len(highlights)+1, texts)
	if err != nil {
		return nil, err
	}
	highlights = append(highlights, created...)
	record.Run.HighlightCount = len(highlights)
	return created, service.saveNarratorHighlightsLocked(workspaceID, easyRunID, record, highlights, created)
}

func capNarratorHighlightTexts(easyRunID string, texts []string, existingCount int) []string {
	remaining := maxEasyHighlightsPerRun - existingCount
	if remaining <= 0 {
		log.Printf("easy-run narrator dropped %d highlights for %s: run highlight cap reached", len(texts), easyRunID)
		return []string{}
	}
	if len(texts) > remaining {
		log.Printf("easy-run narrator dropped %d highlights for %s: run highlight cap remaining %d", len(texts)-remaining, easyRunID, remaining)
		return texts[:remaining]
	}
	return texts
}

func (service *Service) saveNarratorHighlightsLocked(workspaceID string, easyRunID string, record storedRunRecord, highlights []EasyHighlight, created []EasyHighlight) error {
	if err := service.store.saveHighlights(workspaceID, easyRunID, highlights); err != nil {
		return err
	}
	if err := service.store.saveRun(record); err != nil {
		return err
	}
	return service.publishNarratorHighlights(workspaceID, created)
}

func (service *Service) publishNarratorHighlights(workspaceID string, highlights []EasyHighlight) error {
	for _, highlight := range highlights {
		if _, err := service.events.Publish(NewHighlightCreatedEvent(workspaceID, highlight)); err != nil {
			return err
		}
	}
	return nil
}

func narratorHighlightTexts(texts []string) ([]string, error) {
	if len(texts) > maxEasyHighlightsPerNarratorCall {
		log.Printf("easy-run narrator returned %d highlights; accepting %d", len(texts), maxEasyHighlightsPerNarratorCall)
		texts = texts[:maxEasyHighlightsPerNarratorCall]
	}
	accepted := make([]string, 0, len(texts))
	for index, text := range texts {
		trimmed := strings.TrimSpace(text)
		if trimmed == "" {
			return nil, fmt.Errorf("narrator highlight[%d] text is required", index)
		}
		accepted = append(accepted, trimmed)
	}
	return accepted, nil
}

func (service *Service) newNarratorHighlightsLocked(easyRunID string, firstOrdinal int, texts []string) ([]EasyHighlight, error) {
	created := make([]EasyHighlight, 0, len(texts))
	for index, text := range texts {
		highlightID, err := service.newID("highlight")
		if err != nil {
			return nil, fmt.Errorf("create highlight id: %w", err)
		}
		highlight := EasyHighlight{
			At:        timestamp(service.now()),
			EasyRunID: easyRunID,
			ID:        highlightID,
			Ordinal:   firstOrdinal + index,
			Text:      text,
		}
		if err := validateEasyHighlight(highlight); err != nil {
			return nil, err
		}
		created = append(created, highlight)
	}
	return created, nil
}
