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

type AfterProjectRenameHook func(context.Context, projectstate.Snapshot, string) error

type ServiceOptions struct {
	ProjectState       *projectstate.Runtime
	AfterProjectRename AfterProjectRenameHook
}

type AllProjectMetadata struct {
	DefaultProjectConfigID *string                              `json:"defaultProjectConfigId"`
	ProjectMetadata        []projectstate.ProjectConfigMetadata `json:"projectMetadata"`
}

type Service struct {
	projectState       *projectstate.Runtime
	afterProjectRename AfterProjectRenameHook
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.ProjectState == nil {
		return nil, ErrProjectStateRequired
	}
	return &Service{
		projectState:       options.ProjectState,
		afterProjectRename: options.AfterProjectRename,
	}, nil
}

func (s *Service) LoadAllProjectMetadata(_ context.Context) (AllProjectMetadata, error) {
	if s == nil || s.projectState == nil {
		return AllProjectMetadata{}, ErrProjectStateRequired
	}

	snapshot := s.projectState.Snapshot()
	return allProjectMetadataFromDocument(snapshot.Document), nil
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

func (s *Service) SetProjectConfigName(ctx context.Context, projectConfigID string, newName string) error {
	if s == nil || s.projectState == nil {
		return ErrProjectStateRequired
	}

	currentSnapshot := s.projectState.Snapshot()
	nextDocument := currentSnapshot.Document.Clone()
	if err := nextDocument.SetProjectName(projectConfigID, newName); err != nil {
		return err
	}

	currentProject, err := currentSnapshot.Document.ProjectByID(projectConfigID)
	if err != nil {
		return err
	}
	nextProject, err := nextDocument.ProjectByID(projectConfigID)
	if err != nil {
		return err
	}
	if currentProject.Name == nextProject.Name {
		return nil
	}

	snapshot, err := s.projectState.SetProjectName(ctx, projectConfigID, newName)
	if err != nil {
		return err
	}
	if s.afterProjectRename != nil {
		return s.afterProjectRename(ctx, snapshot, projectConfigID)
	}
	return nil
}

func allProjectMetadataFromDocument(document projectstate.Document) AllProjectMetadata {
	var defaultProjectID *string
	if trimmedDefaultProjectID := strings.TrimSpace(document.DefaultProjectID); trimmedDefaultProjectID != "" {
		defaultProjectID = &trimmedDefaultProjectID
	}
	return AllProjectMetadata{
		DefaultProjectConfigID: defaultProjectID,
		ProjectMetadata:        document.ProjectConfigMetadata(),
	}
}
