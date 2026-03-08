package projectshell

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/projectview"
)

var ErrProjectStateRequired = errors.New("project shell service requires a project runtime")

type ServiceOptions struct {
	ProjectState *projectstate.Runtime
}

type AllProjectMetadata struct {
	DefaultProjectConfigID *string                              `json:"defaultProjectConfigId"`
	ProjectMetadata        []projectstate.ProjectConfigMetadata `json:"projectMetadata"`
}

type Service struct {
	projectState *projectstate.Runtime
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.ProjectState == nil {
		return nil, ErrProjectStateRequired
	}
	return &Service{projectState: options.ProjectState}, nil
}

func (s *Service) LoadAllProjectMetadata(_ context.Context) (AllProjectMetadata, error) {
	if s == nil || s.projectState == nil {
		return AllProjectMetadata{}, ErrProjectStateRequired
	}

	snapshot := s.projectState.Snapshot()
	var defaultProjectID *string
	if trimmedDefaultProjectID := strings.TrimSpace(snapshot.Document.DefaultProjectID); trimmedDefaultProjectID != "" {
		defaultProjectID = &trimmedDefaultProjectID
	}

	return AllProjectMetadata{
		DefaultProjectConfigID: defaultProjectID,
		ProjectMetadata:        snapshot.Document.ProjectConfigMetadata(),
	}, nil
}

func (s *Service) LoadProjectConfig(_ context.Context, projectConfigName string) (projectview.SingleConfig, error) {
	if s == nil || s.projectState == nil {
		return projectview.SingleConfig{}, ErrProjectStateRequired
	}

	snapshot := s.projectState.Snapshot()
	projectID, err := snapshot.Document.ProjectIDByName(projectConfigName)
	if err != nil {
		return projectview.SingleConfig{}, err
	}

	projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
	if err != nil {
		return projectview.SingleConfig{}, fmt.Errorf("load project config %q: %w", projectID, err)
	}
	return projectStateView, nil
}
