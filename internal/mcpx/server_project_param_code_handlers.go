package mcpx

import (
	"context"

	"setta/internal/projectstate"
	"setta/internal/tools"
)

func newSetCallableHandler(projectState projectStateProvider, callableSignatures projectstate.CallableSignatureResolver) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		args, err := readSetCallableArgs(arguments)
		if err != nil {
			return nil, err
		}
		if err := requireProjectStateRuntime(projectState, "Project-state mutation runtime is unavailable."); err != nil {
			return nil, err
		}
		return executeScopedProjectStateOperation(
			ctx,
			args.projectConfigID,
			"Scoped callable invocation context is unavailable.",
			func() (any, error) {
				_, result, err := projectState.SetCallable(
					ctx,
					args.projectConfigID,
					args.sectionID,
					args.callableName,
					args.refetchParams,
					callableSignatures,
				)
				return result, err
			},
		)
	}
}

func newAddKwargHandler(projectState projectStateProvider) tools.Handler {
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
			return nil, newToolError("internal_error", "Scoped add_kwarg invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		_, result, err := projectState.AddKwarg(ctx, projectConfigID, sectionID)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
	}
}

func newDeleteKwargHandler(projectState projectStateProvider) tools.Handler {
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
			return nil, newToolError("internal_error", "Scoped delete_kwarg invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		_, result, err := projectState.DeleteKwarg(ctx, projectConfigID, sectionID)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
	}
}

func newSetCodeHandler(codeUpdates codeUpdateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		code, err := readRequiredRawStringArgument(arguments, "code")
		if err != nil {
			return nil, err
		}
		if codeUpdates == nil {
			return nil, newToolError("internal_error", "Code-update runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped code-edit invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if err := codeUpdates.SetCode(ctx, projectConfigID, sectionID, code); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newFormatCodeHandler(codeUpdates codeUpdateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		if codeUpdates == nil {
			return nil, newToolError("internal_error", "Code-format runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped code-format invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if err := codeUpdates.FormatCode(ctx, projectConfigID, sectionID); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}
