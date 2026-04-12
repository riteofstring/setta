package chatsections

import (
	"context"
	"errors"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/projectstate"
	"setta/internal/scriptablechat"
)

var (
	ErrProjectStateRequired = errors.New("chat sections project state is required")
	ErrRunStoreRequired     = errors.New("chat sections run store is required")
)

type ServiceOptions struct {
	ProjectState *projectstate.Runtime
	Runs         *agentruns.RunStore
}

type Service struct {
	projectState *projectstate.Runtime
	runs         *agentruns.RunStore
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.ProjectState == nil {
		return nil, ErrProjectStateRequired
	}
	if options.Runs == nil {
		return nil, ErrRunStoreRequired
	}
	return &Service{
		projectState: options.ProjectState,
		runs:         options.Runs,
	}, nil
}

func (s *Service) GetChatID(ctx context.Context, projectID string, sectionID string) (*string, error) {
	if s == nil || s.projectState == nil {
		return nil, ErrProjectStateRequired
	}
	if s.runs == nil {
		return nil, ErrRunStoreRequired
	}

	chatID, err := s.projectState.ChatSectionChatID(projectID, sectionID)
	if err != nil {
		return nil, err
	}
	if chatID == nil {
		return nil, nil
	}

	exists, err := s.chatRunExists(strings.TrimSpace(projectID), *chatID)
	if err != nil {
		return nil, err
	}
	if exists {
		return chatID, nil
	}

	if _, err := s.projectState.SetChatSectionChatID(ctx, projectID, sectionID, nil); err != nil {
		return nil, err
	}
	return nil, nil
}

func (s *Service) chatRunExists(projectID string, chatID string) (bool, error) {
	trimmedChatID := strings.TrimSpace(chatID)
	if trimmedChatID == "" {
		return false, nil
	}
	filter := agentruns.RunFilter{
		ChatID: &trimmedChatID,
	}
	if projectID != "" {
		trimmedProjectID := strings.TrimSpace(projectID)
		filter.ProjectConfigID = &trimmedProjectID
	}
	runs, err := s.runs.ListByMetadata(filter)
	if err != nil {
		return false, err
	}
	for _, run := range runs {
		switch strings.TrimSpace(runTypeFromRun(run)) {
		case managedchat.RunTypeManagedChat, externalagents.RunTypeExternalAgent, scriptablechat.RunTypeScriptableChat:
			return true, nil
		}
	}
	return false, nil
}

func runTypeFromRun(run agentruns.Run) string {
	if run.Inputs == nil {
		return ""
	}
	rawRunType, ok := run.Inputs["runType"]
	if !ok {
		return ""
	}
	runType, ok := rawRunType.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(runType)
}
