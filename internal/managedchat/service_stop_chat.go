package managedchat

import (
	"fmt"
	"strings"

	"setta/internal/agentruns"
)

func (s *Service) stopChat(chatID string) (StopResult, error) {
	trimmedChatID, err := validateStopChatID(chatID)
	if err != nil {
		return StopResult{}, err
	}
	latestRun, ok, err := s.latestRunningManagedChatRun(trimmedChatID)
	if err != nil {
		return StopResult{}, err
	}
	if !ok {
		return StopResult{AlreadyStopped: true}, nil
	}
	stoppedRun, cancelled, err := s.stopManagedChatRun(latestRun)
	if err != nil {
		return StopResult{}, err
	}
	if !cancelled {
		return StopResult{AlreadyStopped: true}, nil
	}
	resolvedRun, stoppedMessageID, err := s.resolveStoppedChatMessageID(stoppedRun)
	if err != nil {
		return StopResult{}, err
	}
	stoppedRunID := resolvedRun.ID
	return StopResult{
		AlreadyStopped:   false,
		StoppedRunID:     &stoppedRunID,
		StoppedMessageID: stoppedMessageID,
	}, nil
}

func validateStopChatID(chatID string) (string, error) {
	trimmedChatID := strings.TrimSpace(chatID)
	if trimmedChatID == "" {
		return "", fmt.Errorf("chat id is required")
	}
	return trimmedChatID, nil
}

func (s *Service) latestRunningManagedChatRun(chatID string) (agentruns.Run, bool, error) {
	if s == nil || s.runs == nil {
		return agentruns.Run{}, false, ErrRunStoreRequired
	}
	runs, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(RunTypeManagedChat),
		ChatID:  &chatID,
	})
	if err != nil {
		return agentruns.Run{}, false, err
	}
	latestRun, ok := selectLatestRun(filterRunningRuns(runs))
	return latestRun, ok, nil
}

func filterRunningRuns(runs []agentruns.Run) []agentruns.Run {
	runningRuns := make([]agentruns.Run, 0, len(runs))
	for _, run := range runs {
		if run.Status == agentruns.RunStatusRunning {
			runningRuns = append(runningRuns, run)
		}
	}
	return runningRuns
}

func (s *Service) stopManagedChatRun(run agentruns.Run) (agentruns.Run, bool, error) {
	if s == nil || s.stopper == nil {
		return agentruns.Run{}, false, ErrStopperRequired
	}
	stoppedRun, err := s.stopper.StopRun(run.ID)
	if err != nil {
		return agentruns.Run{}, false, err
	}
	return stoppedRun, stoppedRun.Status == agentruns.RunStatusCancelled, nil
}

func (s *Service) resolveStoppedChatMessageID(stoppedRun agentruns.Run) (agentruns.Run, *string, error) {
	stoppedMessageID, err := resolveLatestAssistantMessageID(stoppedRun)
	if err != nil {
		return agentruns.Run{}, nil, err
	}
	if stoppedMessageID != nil {
		return stoppedRun, stoppedMessageID, nil
	}
	resolvedRun, stoppedMessageID, err := s.resolveStoppedChatMessageIDFromLiveState(stoppedRun)
	if err != nil {
		return agentruns.Run{}, nil, err
	}
	if stoppedMessageID != nil {
		return resolvedRun, stoppedMessageID, nil
	}
	return s.resolveStoppedChatMessageIDFromPersistence(resolvedRun)
}

func (s *Service) resolveStoppedChatMessageIDFromLiveState(stoppedRun agentruns.Run) (agentruns.Run, *string, error) {
	if s == nil || s.live == nil {
		return stoppedRun, nil, nil
	}
	liveState, err := s.live.GetLiveChatState(stoppedRun.ID)
	if err != nil {
		return agentruns.Run{}, nil, err
	}
	if liveState == nil {
		return stoppedRun, nil, nil
	}
	inputMessages, err := parseInputMessages(stoppedRun)
	if err != nil {
		return agentruns.Run{}, nil, err
	}
	stoppedMessageID := resolveLatestAssistantMessageIDFromMessages(inputMessages, liveState.Messages)
	persistedRun, err := s.persistLiveChatStateToRun(stoppedRun, liveState)
	if err != nil {
		return agentruns.Run{}, nil, err
	}
	return persistedRun, stoppedMessageID, nil
}

func (s *Service) resolveStoppedChatMessageIDFromPersistence(stoppedRun agentruns.Run) (agentruns.Run, *string, error) {
	waitedRun, err := s.waitForStoppedRunPersistence(stoppedRun)
	if err != nil {
		return agentruns.Run{}, nil, err
	}
	stoppedMessageID, err := resolveLatestAssistantMessageID(waitedRun)
	if err != nil {
		return agentruns.Run{}, nil, err
	}
	return waitedRun, stoppedMessageID, nil
}
