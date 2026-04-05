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
	projectRuntimeAdapter := openAPIProjectRuntimeAdapter{runtime: projectRuntime}
	return ProjectRouteDependencies{
		ModePolicy:                     modePolicy,
		WorkspaceRoot:                  workspaceRoot,
		ProjectState:                   projectRuntime,
		SettingsState:                  settingsRuntime,
		ChatSectionChatIDs:             staticChatSectionChatIDService{},
		EdgeExpressionBuilder:          projectstate.EdgeExpressionBuilderFunc(codegen.BuildPythonEdgeExpression),
		CodegenTargetValidator:         projectstate.CodegenTargetValidatorFunc(func(context.Context, projectstate.ProjectCodegenTarget) error { return nil }),
		PythonCodegenSectionReconciler: projectstate.PythonCodegenSectionReconcilerFunc(func(context.Context, *projectstate.Project) error { return nil }),
		CodeUpdates:                    projectRuntimeAdapter,
		RenameRefactors:                projectRuntimeAdapter,
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

type openAPIProjectRuntimeAdapter struct {
	runtime *projectstate.Runtime
}

func (a openAPIProjectRuntimeAdapter) SetCode(ctx context.Context, projectID string, sectionID string, code string) error {
	if a.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	_, err := a.runtime.SetCode(ctx, projectID, sectionID, code)
	return err
}

func (a openAPIProjectRuntimeAdapter) FormatCode(context.Context, string, string) error {
	return projectstate.NewFormatCodeError(errOpenAPIDocumentRouteDependencyUnavailable.Error())
}

func (a openAPIProjectRuntimeAdapter) SetSectionName(ctx context.Context, projectID string, sectionID string, name string) error {
	if a.runtime == nil {
		return projectstate.ErrRuntimeClosed
	}
	_, err := a.runtime.SetSectionName(ctx, projectID, sectionID, name)
	return err
}

func (openAPIProjectRuntimeAdapter) AcceptRenameRefactor(context.Context, string, string) error {
	return projectstate.ErrRenameRefactorPendingNotFound
}

func (openAPIProjectRuntimeAdapter) DeclineRenameRefactor(context.Context, string, string) error {
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
