package externalagents

import (
	"strings"

	"setta/internal/agentruns"
)

func (s *SendService) markRunFailed(run agentruns.Run, runErr error) (agentruns.Run, error) {
	return persistExternalAgentRunFailure(
		s.runs,
		s.runtime,
		s.timeNow,
		run.ID,
		runErr,
		nil,
	)
}

func (s *SendService) ensureExternalChatIDCompatible(chatID string, engineConfigID string, projectConfigID string) ([]agentruns.Run, error) {
	trimmedChatID := strings.TrimSpace(chatID)
	if trimmedChatID == "" {
		return []agentruns.Run{}, nil
	}
	llmRuns, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(RunTypeManagedChat),
		ChatID:  &trimmedChatID,
	})
	if err != nil {
		return nil, err
	}
	if len(llmRuns) > 0 {
		return nil, ErrChatEngineMismatch
	}
	externalRuns, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType: stringPtr(RunTypeExternalAgent),
		ChatID:  &trimmedChatID,
	})
	if err != nil {
		return nil, err
	}
	for _, run := range externalRuns {
		if resolveRunInputString(run, "engineConfigId") != engineConfigID {
			return nil, ErrChatEngineMismatch
		}
		if resolveRunInputString(run, "projectConfigId") != projectConfigID {
			return nil, ErrChatProjectConfigMismatch
		}
	}
	return externalRuns, nil
}

func (s *SendService) getPriorMessagesForExternalChat(chatID string, projectConfigID string, prefetched []agentruns.Run) ([]map[string]any, error) {
	runs := prefetched
	if runs == nil {
		filter := agentruns.RunFilter{
			RunType:         stringPtr(RunTypeExternalAgent),
			ChatID:          stringPtr(chatID),
			ProjectConfigID: stringPtr(projectConfigID),
		}
		var err error
		runs, err = s.runs.ListByMetadata(filter)
		if err != nil {
			return nil, err
		}
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		return []map[string]any{}, nil
	}
	state, err := buildChatStateFromRun(latestRun)
	if err != nil {
		return nil, err
	}
	return state.Messages, nil
}

func (s *SendService) getPriorMessagesForSeedChat(chatID string, projectConfigID string) ([]map[string]any, error) {
	runs, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType:         stringPtr(RunTypeExternalAgent),
		ChatID:          stringPtr(chatID),
		ProjectConfigID: stringPtr(projectConfigID),
	})
	if err != nil {
		return nil, err
	}
	latestRun, ok := selectLatestRun(runs)
	if !ok {
		return nil, &ContinueFromChatSourceNotFoundError{ChatID: chatID}
	}
	state, err := buildChatStateFromRun(latestRun)
	if err != nil {
		return nil, err
	}
	return state.Messages, nil
}

func (s *SendService) getLatestRunForExternalChat(chatID string, projectConfigID string) (*agentruns.Run, error) {
	runs, err := s.runs.ListByMetadata(agentruns.RunFilter{
		RunType:         stringPtr(RunTypeExternalAgent),
		ChatID:          stringPtr(chatID),
		ProjectConfigID: stringPtr(projectConfigID),
	})
	if err != nil {
		return nil, err
	}
	run, ok := selectLatestRun(runs)
	if !ok {
		return nil, nil
	}
	return &run, nil
}
