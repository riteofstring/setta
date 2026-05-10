package mcpx

import (
	"context"

	"setta/internal/projectstate"
	"setta/internal/tools"
)

func newSetTopLevelSectionLayoutHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		topLevelSections, err := readRequiredTopLevelSectionLayoutsArgument(arguments, "topLevelSections")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped top-level layout invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetTopLevelSectionLayout(ctx, projectConfigID, topLevelSections); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetSectionSizesHandler(projectState projectStateProvider, settingsState settingsStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionSizes, err := readRequiredSectionSizesArgument(arguments, "sectionSizes")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural section-size invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		settings, err := resolveStructuralMutationSettings(settingsState)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}

		if _, err := projectState.SetSectionSizes(ctx, projectConfigID, sectionSizes, settings); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetGroupOverflowModeHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		overflowMode, err := readRequiredBoolArgument(arguments, "overflowMode")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural group-overflow invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetGroupOverflowMode(ctx, projectConfigID, sectionID, overflowMode); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newAutoLayoutTopLevelSectionsHandler(projectState projectStateProvider, settingsState settingsStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		args, err := readAutoLayoutTopLevelSectionsArgs(arguments)
		if err != nil {
			return nil, err
		}
		if err := requireProjectStateRuntime(projectState, "Project-state mutation runtime is unavailable."); err != nil {
			return nil, err
		}
		return executeScopedStructuralMutation(
			ctx,
			args.projectConfigID,
			"Structural auto-layout invocation context is unavailable.",
			settingsState,
			func(settings projectstate.StructuralMutationSettings) (any, error) {
				if _, err := projectState.AutoLayoutTopLevelSections(ctx, args.projectConfigID, settings, args.margin); err != nil {
					return nil, err
				}
				return statusResult{Status: "ok"}, nil
			},
		)
	}
}

func newSetShowParamDisplayNamesHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		showParamDisplayNames, err := readRequiredBoolArgument(arguments, "showParamDisplayNames")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural show-param-display-names invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetShowParamDisplayNames(ctx, projectConfigID, showParamDisplayNames); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newCompareAndSetShowParamDisplayNamesHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		showParamDisplayNames, err := readRequiredBoolArgument(arguments, "showParamDisplayNames")
		if err != nil {
			return nil, err
		}
		expectedOldValue, err := readOptionalBoolPointerArgument(arguments, "expectedOldValue")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural compare-and-set show-param-display-names invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, _, err := projectState.CompareAndSetShowParamDisplayNames(ctx, projectConfigID, showParamDisplayNames, expectedOldValue); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetProjectConfigCodegenTargetsHandler(
	projectState projectStateProvider,
	validator projectstate.CodegenTargetValidator,
	pythonReconciler projectstate.PythonCodegenSectionReconciler,
) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		codegenTargets, err := readRequiredProjectCodegenTargetsArgument(arguments, "codegenTargets")
		if err != nil {
			return nil, err
		}
		if projectState == nil || pythonReconciler == nil {
			return nil, newToolError("internal_error", "Project codegen-target mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural codegen-target invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetProjectCodegenTargets(ctx, projectConfigID, codegenTargets, validator, pythonReconciler); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetGenCodePrefixHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		genCodePrefix, err := readRequiredRawStringArgument(arguments, "genCodePrefix")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped gen-code-prefix invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetGenCodePrefix(ctx, projectConfigID, genCodePrefix); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetGenCodeSuffixHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		genCodeSuffix, err := readRequiredRawStringArgument(arguments, "genCodeSuffix")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped gen-code-suffix invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetGenCodeSuffix(ctx, projectConfigID, genCodeSuffix); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newTogglePositionLocksHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionIDs, err := readRequiredStringArrayArgument(arguments, "sectionIds")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural toggle-position-locks invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.TogglePositionLocks(ctx, projectConfigID, sectionIDs); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newToggleMinimizedHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural toggle-minimized invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.ToggleMinimized(ctx, projectConfigID, sectionID); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newToggleGroupOrientationHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural group-orientation invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.ToggleGroupOrientation(ctx, projectConfigID, sectionID); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}
