package httpapi

import (
	"context"
	"fmt"

	"setta/internal/codegen"
	"setta/internal/launcher"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

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
		ChatSectionChatIDs:             projectRuntimeAdapter,
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
		Manager:          &launcher.ManagementService{},
	}
}

type openAPIProjectRuntimeAdapter struct {
	runtime *projectstate.Runtime
}

func (a openAPIProjectRuntimeAdapter) SetCode(ctx context.Context, projectID string, sectionID string, code string) error {
	_, err := a.runtime.SetCode(ctx, projectID, sectionID, code)
	return err
}

func (a openAPIProjectRuntimeAdapter) FormatCode(context.Context, string, string) error {
	return projectstate.NewFormatCodeError("openapi document route dependency is unavailable for runtime requests")
}

func (a openAPIProjectRuntimeAdapter) SetSectionName(ctx context.Context, projectID string, sectionID string, name string) error {
	_, err := a.runtime.SetSectionName(ctx, projectID, sectionID, name)
	return err
}

func (openAPIProjectRuntimeAdapter) AcceptRenameRefactor(context.Context, string, string) error {
	return projectstate.ErrRenameRefactorPendingNotFound
}

func (openAPIProjectRuntimeAdapter) DeclineRenameRefactor(context.Context, string, string) error {
	return projectstate.ErrRenameRefactorPendingNotFound
}

func (openAPIProjectRuntimeAdapter) GetChatID(context.Context, string, string) (*string, error) {
	return nil, nil
}
