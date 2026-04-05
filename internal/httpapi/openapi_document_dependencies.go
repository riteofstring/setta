package httpapi

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/codegen"
	"setta/internal/launcher"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

var errOpenAPIDocumentRouteDependencyUnavailable = errors.New("openapi document route dependency is unavailable for runtime requests")

func newOpenAPIProjectRouteDependencies(
	modePolicy modes.Policy,
	workspaceRoot string,
) (ProjectRouteDependencies, error) {
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		return ProjectRouteDependencies{}, fmt.Errorf("openapi project overlay runtime: %w", err)
	}
	settingsDocument, err := settingsstate.NewDocument()
	if err != nil {
		return ProjectRouteDependencies{}, fmt.Errorf("openapi settings document: %w", err)
	}
	settingsRuntime, err := settingsstate.OpenOverlayRuntime(settingsDocument)
	if err != nil {
		return ProjectRouteDependencies{}, fmt.Errorf("openapi settings overlay runtime: %w", err)
	}
	return ProjectRouteDependencies{
		ModePolicy:                     modePolicy,
		WorkspaceRoot:                  workspaceRoot,
		ProjectState:                   projectRuntime,
		SettingsState:                  settingsRuntime,
		ChatSectionChatIDs:             staticChatSectionChatIDService{},
		EdgeExpressionBuilder:          projectstate.EdgeExpressionBuilderFunc(codegen.BuildPythonEdgeExpression),
		CodegenTargetValidator:         projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error { return nil }),
		PythonCodegenSectionReconciler: projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error { return nil }),
		CodeUpdates:                    projectRuntimeCodeUpdateAdapter{runtime: projectRuntime},
		RenameRefactors:                projectRuntimeRenameRefactorAdapter{runtime: projectRuntime},
	}, nil
}

func newOpenAPILauncherManagementRouteDependencies(
	modePolicy modes.Policy,
	defaultSettaHome string,
) LauncherManagementRouteDependencies {
	return LauncherManagementRouteDependencies{
		ModePolicy:       modePolicy,
		DefaultSettaHome: defaultSettaHome,
		Manager:          openAPILauncherManagementStub{},
	}
}

type projectRuntimeCodeUpdateAdapter struct {
	runtime *projectstate.Runtime
}

func (a projectRuntimeCodeUpdateAdapter) SetCode(ctx context.Context, projectID string, sectionID string, code string) error {
	if a.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	_, err := a.runtime.SetCode(ctx, projectID, sectionID, code)
	return err
}

func (a projectRuntimeCodeUpdateAdapter) FormatCode(context.Context, string, string) error {
	return projectstate.NewFormatCodeError(errOpenAPIDocumentRouteDependencyUnavailable.Error())
}

type projectRuntimeRenameRefactorAdapter struct {
	runtime *projectstate.Runtime
}

func (a projectRuntimeRenameRefactorAdapter) SetSectionName(ctx context.Context, projectID string, sectionID string, name string) error {
	if a.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	_, err := a.runtime.SetSectionName(ctx, projectID, sectionID, name)
	return err
}

func (projectRuntimeRenameRefactorAdapter) AcceptRenameRefactor(context.Context, string, string) error {
	return projectstate.ErrRenameRefactorPendingNotFound
}

func (projectRuntimeRenameRefactorAdapter) DeclineRenameRefactor(context.Context, string, string) error {
	return projectstate.ErrRenameRefactorPendingNotFound
}

type staticChatSectionChatIDService struct{}

func (staticChatSectionChatIDService) GetChatID(context.Context, string, string) (*string, error) {
	return nil, nil
}

type openAPILauncherManagementStub struct{}

func (openAPILauncherManagementStub) CollectStatus(string) (launcher.LauncherStatusSnapshot, error) {
	return launcher.LauncherStatusSnapshot{}, errOpenAPIDocumentRouteDependencyUnavailable
}

func (openAPILauncherManagementStub) Setup(string, launcher.LauncherSetupInput) (launcher.LauncherSetupResult, error) {
	return launcher.LauncherSetupResult{}, errOpenAPIDocumentRouteDependencyUnavailable
}

func (openAPILauncherManagementStub) Repair(string) (launcher.LauncherStatusSnapshot, error) {
	return launcher.LauncherStatusSnapshot{}, errOpenAPIDocumentRouteDependencyUnavailable
}

func (openAPILauncherManagementStub) Remove(string) (launcher.LauncherRemoveResult, error) {
	return launcher.LauncherRemoveResult{}, errOpenAPIDocumentRouteDependencyUnavailable
}

func (openAPILauncherManagementStub) Update(string, string) (launcher.LauncherUpdateResult, error) {
	return launcher.LauncherUpdateResult{}, errOpenAPIDocumentRouteDependencyUnavailable
}
