package mcpx

import (
	"context"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/tools"
)

func newSetCodeSectionDiagnosticsMuteHandler(projectState projectStateProvider, diagnostics lspDiagnosticsProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		mute, err := readRequiredBoolArgument(arguments, "mute")
		if err != nil {
			return nil, err
		}
		if err := requireCodeSectionDiagnosticsRuntime(projectState, diagnostics); err != nil {
			return nil, err
		}
		return executeScopedProjectStateOperation(
			ctx,
			projectConfigID,
			"Scoped diagnostics mute invocation context is unavailable.",
			func() (any, error) {
				snapshot, err := projectState.SetCodeSectionDiagnosticsMute(ctx, projectConfigID, sectionID, mute)
				if err != nil {
					return nil, err
				}
				if err := reapplyCodeSectionIgnoreState(snapshot, projectConfigID, sectionID, diagnostics); err != nil {
					return nil, err
				}
				return statusResult{Status: "ok"}, nil
			},
		)
	}
}

func newSetCodeSectionDiagnosticCodeSuppressionHandler(projectState projectStateProvider, diagnostics lspDiagnosticsProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		code, err := readRequiredArgument(arguments, "code")
		if err != nil {
			return nil, err
		}
		suppress, err := readRequiredBoolArgument(arguments, "suppress")
		if err != nil {
			return nil, err
		}
		if err := requireCodeSectionDiagnosticsRuntime(projectState, diagnostics); err != nil {
			return nil, err
		}
		return executeScopedProjectStateOperation(
			ctx,
			projectConfigID,
			"Scoped diagnostics suppression invocation context is unavailable.",
			func() (any, error) {
				snapshot, err := projectState.SetCodeSectionDiagnosticCodeSuppression(ctx, projectConfigID, sectionID, code, suppress)
				if err != nil {
					return nil, err
				}
				if err := reapplyCodeSectionIgnoreState(snapshot, projectConfigID, sectionID, diagnostics); err != nil {
					return nil, err
				}
				return statusResult{Status: "ok"}, nil
			},
		)
	}
}

func newSetSectionNameHandler(sectionNames sectionNameProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		name, err := readRequiredRawStringArgument(arguments, "name")
		if err != nil {
			return nil, err
		}
		if sectionNames == nil {
			return nil, newToolError("internal_error", "Section-name mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped section-name invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if err := sectionNames.SetSectionName(ctx, projectConfigID, sectionID, name); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetSectionTagColorHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		tagColor, err := readOptionalNullableStringPointerArgument(arguments, "tagColor")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped section-tag-color invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetSectionTagColor(ctx, projectConfigID, sectionID, tagColor); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetSectionStyleColorHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		styleColor, err := readOptionalNullableStringPointerArgument(arguments, "styleColor")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped section-style-color invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetSectionStyleColor(ctx, projectConfigID, sectionID, styleColor); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetSectionParamFilterHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		paramFilter, err := readRequiredRawStringArgument(arguments, "paramFilter")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped section-param-filter invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetSectionParamFilter(ctx, projectConfigID, sectionID, paramFilter); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetMetaControlShowSectionTitleHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		showSectionTitle, err := readRequiredBoolArgument(arguments, "showSectionTitle")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped meta-control title invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetMetaControlShowSectionTitle(ctx, projectConfigID, sectionID, showSectionTitle); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newChangeParamImplHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		paramInfoID, err := readRequiredStringArgument(arguments, "paramInfoId")
		if err != nil {
			return nil, err
		}
		selectedID, err := readRequiredStringArgument(arguments, "selectedId")
		if err != nil {
			return nil, err
		}
		if err := requireProjectStateRuntime(projectState, "Project-state mutation runtime is unavailable."); err != nil {
			return nil, err
		}
		return executeScopedProjectStateOperation(
			ctx,
			projectConfigID,
			"Scoped param impl invocation context is unavailable.",
			func() (any, error) {
				if _, err := projectState.ChangeParamImpl(ctx, projectConfigID, sectionID, paramInfoID, selectedID); err != nil {
					return nil, err
				}
				return statusResult{Status: "ok"}, nil
			},
		)
	}
}

func newUpdateParamImplConfigHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		paramInfoID, err := readRequiredStringArgument(arguments, "paramInfoId")
		if err != nil {
			return nil, err
		}
		newConfig, err := readRequiredObjectArgument(arguments, "newConfig")
		if err != nil {
			return nil, err
		}
		if err := requireProjectStateRuntime(projectState, "Project-state mutation runtime is unavailable."); err != nil {
			return nil, err
		}
		return executeScopedProjectStateOperation(
			ctx,
			projectConfigID,
			"Scoped param impl config invocation context is unavailable.",
			func() (any, error) {
				if _, err := projectState.UpdateParamImplConfig(ctx, projectConfigID, sectionID, paramInfoID, newConfig); err != nil {
					return nil, err
				}
				return statusResult{Status: "ok"}, nil
			},
		)
	}
}

func newDeleteSelectedParamsHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		paramInfoIDs, err := readRequiredStringArrayArgument(arguments, "paramInfoIds")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped delete_selected_params invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		_, result, err := projectState.DeleteSelectedParams(ctx, projectConfigID, projectstate.DeleteSelectedParamsInput{
			SectionID:    sectionID,
			ParamInfoIDs: paramInfoIDs,
		})
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
	}
}

func newSetParamEnteredValueHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		paramInfoID, err := readRequiredStringArgument(arguments, "paramInfoId")
		if err != nil {
			return nil, err
		}
		value, err := readRequiredRawStringArgument(arguments, "value")
		if err != nil {
			return nil, err
		}
		if err := requireProjectStateRuntime(projectState, "Project-state mutation runtime is unavailable."); err != nil {
			return nil, err
		}
		return executeScopedProjectStateOperation(
			ctx,
			projectConfigID,
			"Scoped parameter-value invocation context is unavailable.",
			func() (any, error) {
				if _, err := projectState.SetSectionCodeObjectValue(ctx, projectConfigID, sectionID, paramInfoID, value); err != nil {
					return nil, err
				}
				return statusResult{Status: "ok"}, nil
			},
		)
	}
}

func newSetParamNameAndValueHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		codeObjID, err := readRequiredStringArgument(arguments, "codeObjId")
		if err != nil {
			return nil, err
		}
		name, err := readRequiredRawStringArgument(arguments, "name")
		if err != nil {
			return nil, err
		}
		value, err := readRequiredRawStringArgument(arguments, "value")
		if err != nil {
			return nil, err
		}
		if err := requireProjectStateRuntime(projectState, "Project-state mutation runtime is unavailable."); err != nil {
			return nil, err
		}
		return executeScopedProjectStateOperation(
			ctx,
			projectConfigID,
			"Scoped param name/value invocation context is unavailable.",
			func() (any, error) {
				if _, err := projectState.SetParamNameAndValue(ctx, projectConfigID, sectionID, codeObjID, name, value); err != nil {
					return nil, err
				}
				return statusResult{Status: "ok"}, nil
			},
		)
	}
}

func newSetTypeErrorIgnoreHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		paramInfoID, err := readOptionalStringArgument(arguments, "paramInfoId")
		if err != nil {
			return nil, err
		}
		ignoreTypeErrors, err := readRequiredBoolArgument(arguments, "ignoreTypeErrors")
		if err != nil {
			return nil, err
		}
		if err := requireProjectStateRuntime(projectState, "Project-state mutation runtime is unavailable."); err != nil {
			return nil, err
		}
		var paramInfoIDPtr *string
		if strings.TrimSpace(paramInfoID) != "" {
			paramInfoIDPtr = &paramInfoID
		}
		return executeScopedProjectStateOperation(
			ctx,
			projectConfigID,
			"Scoped type-error ignore invocation context is unavailable.",
			func() (any, error) {
				if _, err := projectState.SetTypeErrorIgnore(ctx, projectConfigID, sectionID, paramInfoIDPtr, ignoreTypeErrors); err != nil {
					return nil, err
				}
				return statusResult{Status: "ok"}, nil
			},
		)
	}
}

func newSetCodeObjectDisplayNameHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		codeObjID, err := readRequiredStringArgument(arguments, "codeObjId")
		if err != nil {
			return nil, err
		}
		displayName, err := readRequiredRawStringArgument(arguments, "displayName")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped code-object display-name invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetCodeObjectDisplayName(ctx, projectConfigID, codeObjID, displayName); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetCodeObjectNameHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		codeObjID, err := readRequiredStringArgument(arguments, "codeObjId")
		if err != nil {
			return nil, err
		}
		name, err := readRequiredRawStringArgument(arguments, "name")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped code-object name invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetCodeObjectName(ctx, projectConfigID, codeObjID, name); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func (s *Server) sessionAgenticContext(sessionKey string) *AgenticContext {
	if s == nil || strings.TrimSpace(sessionKey) == "" {
		return nil
	}
	s.agenticContextMu.RLock()
	defer s.agenticContextMu.RUnlock()
	value, ok := s.agenticContextBySess[sessionKey]
	if !ok {
		return nil
	}
	cloned := value
	return &cloned
}

func (s *Server) setSessionAgenticContext(sessionKey string, value AgenticContext) {
	if s == nil || strings.TrimSpace(sessionKey) == "" {
		return
	}
	s.agenticContextMu.Lock()
	defer s.agenticContextMu.Unlock()
	s.agenticContextBySess[sessionKey] = value
}
