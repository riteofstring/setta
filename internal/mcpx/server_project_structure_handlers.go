package mcpx

import (
	"context"

	"setta/internal/projectstate"
	"setta/internal/tools"
)

func (s *Server) newSetAgenticContextHandler() tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		args, err := readSetAgenticContextArgs(arguments)
		if err != nil {
			return nil, err
		}
		sessionKey, err := resolveToolInvocationSessionKey(ctx)
		if err != nil {
			return nil, err
		}
		if args.sectionID == "" && !args.allowUnscoped {
			return nil, buildScopeViolationError("set_agentic_context", "missing_section_id", nil, nil, nil, nil)
		}

		s.setSessionAgenticContext(sessionKey, AgenticContext{
			ProjectConfigID:       args.projectConfigID,
			ShareSessionID:        args.shareSessionID,
			ChatID:                args.chatID,
			RunID:                 args.runID,
			SectionID:             args.sectionID,
			FrontendAffinityToken: args.frontendAffinityToken,
			AllowUnscoped:         args.allowUnscoped,
		})
		return statusResult{Status: "ok"}, nil
	}
}

func newProjectStateSummaryHandler() tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped project summary invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}
		return buildProjectStateSummary(*invocation.ProjectView, invocation.Scope.effectiveReadSectionIDs()), nil
	}
}

func newLSPDiagnosticsHandler(diagnostics lspDiagnosticsProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		if diagnostics == nil {
			return nil, newToolError("internal_error", "LSP diagnostics runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped diagnostics invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		return diagnostics.Snapshot(projectConfigID), nil
	}
}

func newCreateTopLevelSectionHandler(projectState projectStateProvider, settingsState settingsStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		args, err := readCreateTopLevelSectionArgs(arguments)
		if err != nil {
			return nil, err
		}
		if err := requireProjectStateRuntime(projectState, "Project-state mutation runtime is unavailable."); err != nil {
			return nil, err
		}
		return executeScopedStructuralMutation(
			ctx,
			args.projectConfigID,
			"Structural section-creation invocation context is unavailable.",
			settingsState,
			func(settings projectstate.StructuralMutationSettings) (any, error) {
				_, result, err := projectState.CreateTopLevelSection(ctx, args.projectConfigID, args.input, settings)
				return result, err
			},
		)
	}
}

func newCreateChildSectionsHandler(projectState projectStateProvider, settingsState settingsStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		args, err := readCreateChildSectionsArgs(arguments)
		if err != nil {
			return nil, err
		}
		if err := requireProjectStateRuntime(projectState, "Project-state mutation runtime is unavailable."); err != nil {
			return nil, err
		}
		return executeScopedStructuralMutation(
			ctx,
			args.projectConfigID,
			"Structural child-section invocation context is unavailable.",
			settingsState,
			func(settings projectstate.StructuralMutationSettings) (any, error) {
				_, result, err := projectState.CreateChildSections(ctx, args.projectConfigID, args.input, settings)
				return result, err
			},
		)
	}
}

func newCreateChildSectionsViaIncrementerHandler(projectState projectStateProvider, settingsState settingsStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		args, err := readCreateChildSectionsViaIncrementerArgs(arguments)
		if err != nil {
			return nil, err
		}
		if err := requireProjectStateRuntime(projectState, "Project-state mutation runtime is unavailable."); err != nil {
			return nil, err
		}
		return executeScopedStructuralMutation(
			ctx,
			args.projectConfigID,
			"Structural incrementer child-section invocation context is unavailable.",
			settingsState,
			func(settings projectstate.StructuralMutationSettings) (any, error) {
				_, result, err := projectState.CreateChildSectionsViaIncrementer(ctx, args.projectConfigID, args.input, settings)
				return result, err
			},
		)
	}
}

func newSetCodeSectionAttachedTerminalHandler(projectState projectStateProvider, settingsState settingsStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		args, err := readSetCodeSectionAttachedTerminalArgs(arguments)
		if err != nil {
			return nil, err
		}
		if err := requireProjectStateRuntime(projectState, "Project-state mutation runtime is unavailable."); err != nil {
			return nil, err
		}
		return executeScopedStructuralMutation(
			ctx,
			args.projectConfigID,
			"Structural attached-terminal invocation context is unavailable.",
			settingsState,
			func(settings projectstate.StructuralMutationSettings) (any, error) {
				if _, err := projectState.SetCodeSectionAttachedTerminal(ctx, args.projectConfigID, args.sectionID, args.terminalSectionID, settings); err != nil {
					return nil, err
				}
				return statusResult{Status: "ok"}, nil
			},
		)
	}
}

func newDeleteSectionsHandler(projectState projectStateProvider) tools.Handler {
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
			return nil, newToolError("internal_error", "Structural section-deletion invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		_, result, err := projectState.DeleteSections(ctx, projectConfigID, projectstate.DeleteSectionsInput{
			SectionIDs: sectionIDs,
		})
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
	}
}

func newDeleteChildSectionsViaDecrementerHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		args, err := readDeleteChildSectionsViaDecrementerArgs(arguments)
		if err != nil {
			return nil, err
		}
		if err := requireProjectStateRuntime(projectState, "Project-state mutation runtime is unavailable."); err != nil {
			return nil, err
		}
		return executeScopedProjectStateOperation(
			ctx,
			args.projectConfigID,
			"Structural decrementer child-deletion invocation context is unavailable.",
			func() (any, error) {
				_, result, err := projectState.DeleteChildSectionsViaDecrementer(ctx, args.projectConfigID, args.input)
				return result, err
			},
		)
	}
}

func newCreateNewSectionVariantHandler(projectState projectStateProvider) tools.Handler {
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
			return nil, newToolError("internal_error", "Structural section-variant creation invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		_, result, err := projectState.CreateNewSectionVariant(ctx, projectConfigID, projectstate.CreateNewSectionVariantInput{
			SectionID: sectionID,
		})
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
	}
}

func newSetSectionVariantHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		variantID, err := readRequiredStringArgument(arguments, "variantId")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped section-variant selection invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetSectionVariant(ctx, projectConfigID, sectionID, variantID); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetDefaultSectionVariantHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		variantID, err := readRequiredStringArgument(arguments, "variantId")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped default section-variant invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetDefaultSectionVariant(ctx, projectConfigID, sectionID, variantID); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetSectionVariantSortOrderHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		orderedVariantIDs, err := readRequiredStringArrayArgument(arguments, "orderedVariantIds")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped section-variant reorder invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetSectionVariantSortOrder(ctx, projectConfigID, sectionID, orderedVariantIDs); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}
