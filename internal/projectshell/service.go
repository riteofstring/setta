package projectshell

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
)

var ErrProjectStateRequired = errors.New("project shell service requires a project runtime")

type AfterProjectRenameHook func(context.Context, projectstate.Snapshot, string) error
type AfterProjectSaveHook func(context.Context, projectstate.Snapshot, string) error
type AfterProjectMetadataMutationHook func(context.Context, projectstate.Snapshot) error
type AfterProjectsDeleteHook func(context.Context, projectstate.Snapshot, []string) error

type ServiceOptions struct {
	ProjectState                 *projectstate.Runtime
	SettingsProjectState         *projectstate.Runtime
	AfterProjectRename           AfterProjectRenameHook
	AfterProjectSave             AfterProjectSaveHook
	AfterProjectMetadataMutation AfterProjectMetadataMutationHook
	AfterProjectsDelete          AfterProjectsDeleteHook
}

type AllProjectMetadata struct {
	DefaultProjectConfigID *string                              `json:"defaultProjectConfigId"`
	ProjectMetadata        []projectstate.ProjectConfigMetadata `json:"projectMetadata"`
}

type Service struct {
	projectState                 *projectstate.Runtime
	settingsProjectState         *projectstate.Runtime
	afterProjectRename           AfterProjectRenameHook
	afterProjectSave             AfterProjectSaveHook
	afterProjectMetadataMutation AfterProjectMetadataMutationHook
	afterProjectsDelete          AfterProjectsDeleteHook
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.ProjectState == nil {
		return nil, ErrProjectStateRequired
	}
	return &Service{
		projectState:                 options.ProjectState,
		settingsProjectState:         options.SettingsProjectState,
		afterProjectRename:           options.AfterProjectRename,
		afterProjectSave:             options.AfterProjectSave,
		afterProjectMetadataMutation: options.AfterProjectMetadataMutation,
		afterProjectsDelete:          options.AfterProjectsDelete,
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

	runtime := s.projectState
	if settingsstate.IsSettingsProjectName(projectConfigName) && s.settingsProjectState != nil {
		runtime = s.settingsProjectState
	}

	snapshot := runtime.Snapshot()
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

func (s *Service) SetDefaultProjectConfig(ctx context.Context, projectConfigID string) error {
	if s == nil || s.projectState == nil {
		return ErrProjectStateRequired
	}

	currentSnapshot := s.projectState.Snapshot()
	if _, err := currentSnapshot.Document.ProjectByID(projectConfigID); err != nil {
		return err
	}
	if currentSnapshot.Document.DefaultProjectID == strings.TrimSpace(projectConfigID) {
		return nil
	}

	snapshot, err := s.projectState.SetDefaultProjectID(ctx, projectConfigID)
	if err != nil {
		return err
	}
	if s.afterProjectMetadataMutation != nil {
		return s.afterProjectMetadataMutation(ctx, snapshot)
	}
	return nil
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

func (s *Service) SaveProject(ctx context.Context, projectConfigID string) error {
	if s == nil || s.projectState == nil {
		return ErrProjectStateRequired
	}

	runtime := s.projectState
	if settingsstate.IsSettingsProjectID(projectConfigID) && s.settingsProjectState != nil {
		runtime = s.settingsProjectState
	}

	if _, err := runtime.Snapshot().Document.ProjectByID(projectConfigID); err != nil {
		return err
	}

	snapshot, err := runtime.Save(ctx)
	if err != nil {
		return err
	}
	if s.afterProjectSave != nil {
		return s.afterProjectSave(ctx, snapshot, projectConfigID)
	}
	return nil
}

func (s *Service) CreateProjectConfig(ctx context.Context, previewImgColor string) (string, error) {
	if s == nil || s.projectState == nil {
		return "", ErrProjectStateRequired
	}

	snapshot, _, createdName, err := s.projectState.CreateProject(ctx, previewImgColor)
	if err != nil {
		return "", err
	}
	if s.afterProjectMetadataMutation != nil {
		if err := s.afterProjectMetadataMutation(ctx, snapshot); err != nil {
			return "", err
		}
	}
	return createdName, nil
}

func (s *Service) SaveAsNewProjectConfig(ctx context.Context, projectConfigID string, newConfigName string, withRefs bool) error {
	if s == nil || s.projectState == nil {
		return ErrProjectStateRequired
	}

	snapshot, _, _, err := s.projectState.SaveAsNewProjectConfig(
		ctx,
		projectConfigID,
		newConfigName,
		withRefs,
	)
	if err != nil {
		return err
	}
	if s.afterProjectMetadataMutation != nil {
		return s.afterProjectMetadataMutation(ctx, snapshot)
	}
	return nil
}

func (s *Service) DeleteProjectConfigs(ctx context.Context, projectConfigIDs []string) error {
	if s == nil || s.projectState == nil {
		return ErrProjectStateRequired
	}

	snapshot, deletedIDs, err := s.projectState.DeleteProjects(ctx, projectConfigIDs)
	if err != nil {
		return err
	}
	if len(deletedIDs) == 0 {
		return nil
	}
	if s.afterProjectsDelete != nil {
		if err := s.afterProjectsDelete(ctx, snapshot, deletedIDs); err != nil {
			return err
		}
	}
	if s.afterProjectMetadataMutation != nil {
		return s.afterProjectMetadataMutation(ctx, snapshot)
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
