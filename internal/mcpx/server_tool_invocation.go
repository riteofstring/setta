package mcpx

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/tools"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func (s *Server) InvokeTool(ctx context.Context, toolName string, arguments map[string]any, requestContext ToolRequestContext) (*sdkmcp.CallToolResult, error) {
	if s == nil {
		return nil, fmt.Errorf("mcpx: server is required")
	}
	registered, ok := s.registry.Lookup(toolName)
	if !ok {
		return nil, fmt.Errorf("mcpx: unknown tool %q", toolName)
	}
	return s.invokeRegisteredTool(ctx, registered, arguments, requestContext), nil
}

func (s *Server) InvokeToolWithSummary(ctx context.Context, toolName string, arguments map[string]any, requestContext ToolRequestContext) (InvokeToolSummary, error) {
	if s == nil {
		return InvokeToolSummary{}, fmt.Errorf("mcpx: server is required")
	}
	registered, ok := s.registry.Lookup(toolName)
	if !ok {
		return InvokeToolSummary{}, fmt.Errorf("mcpx: unknown tool %q", toolName)
	}

	beforeRevision := uint64(0)
	hasProjectState := s.projectState != nil
	if hasProjectState {
		beforeRevision = s.projectState.Snapshot().Revision
	}

	result, invocation := s.invokeRegisteredToolDetailed(ctx, registered, arguments, requestContext)

	afterRevision := beforeRevision
	if hasProjectState {
		afterRevision = s.projectState.Snapshot().Revision
	}

	resolvedProjectConfigID := ""
	if invocation.AgenticContext != nil {
		resolvedProjectConfigID = strings.TrimSpace(invocation.AgenticContext.ProjectConfigID)
	}

	return InvokeToolSummary{
		Result:                      result,
		ResolvedProjectConfigID:     resolvedProjectConfigID,
		ProjectStateRevisionChanged: hasProjectState && afterRevision != beforeRevision,
	}, nil
}

func (s *Server) invokeRegisteredTool(ctx context.Context, registered tools.Registered, arguments map[string]any, requestContext ToolRequestContext) *sdkmcp.CallToolResult {
	result, _ := s.invokeRegisteredToolDetailed(ctx, registered, arguments, requestContext)
	return result
}

func (s *Server) invokeRegisteredToolDetailed(ctx context.Context, registered tools.Registered, arguments map[string]any, requestContext ToolRequestContext) (*sdkmcp.CallToolResult, ToolInvocationContext) {
	translatedArguments, errorResult := s.translateRegisteredToolArguments(registered, arguments)
	if errorResult != nil {
		return errorResult, ToolInvocationContext{}
	}

	trackProjectMutation, beforeRevision := s.projectMutationTrackingState()
	invocation, errorResult := s.resolveRegisteredToolInvocation(ctx, registered, translatedArguments, requestContext)
	if errorResult != nil {
		return errorResult, invocation
	}

	callResult := s.executeRegisteredToolCall(ctx, registered, translatedArguments, invocation)
	if trackProjectMutation {
		s.notifyAfterProjectMutation(ctx, registered.Name, invocation, beforeRevision)
	}
	return callResult, invocation
}

func (s *Server) translateRegisteredToolArguments(registered tools.Registered, arguments map[string]any) (map[string]any, *sdkmcp.CallToolResult) {
	if arguments == nil {
		arguments = map[string]any{}
	}
	translatedArguments, err := translateArgumentsToCanonical(registered.Name, registered.Metadata, arguments, s.temporaryIDs)
	if err != nil {
		return nil, s.buildToolErrorResult(err)
	}
	return translatedArguments, nil
}

func (s *Server) projectMutationTrackingState() (bool, uint64) {
	if s.projectState == nil || s.afterProjectMutation == nil {
		return false, 0
	}
	return true, s.projectState.Snapshot().Revision
}

func (s *Server) resolveRegisteredToolInvocation(
	ctx context.Context,
	registered tools.Registered,
	translatedArguments map[string]any,
	requestContext ToolRequestContext,
) (ToolInvocationContext, *sdkmcp.CallToolResult) {
	invocation := ToolInvocationContext{SessionKey: requestContext.SessionKey}
	if isUnscopedToolName(registered.Name) {
		return invocation, nil
	}

	resolvedAgenticContext, scope, projectView, err := s.resolveScopedInvocationContext(
		registered.Name,
		registered.Metadata,
		translatedArguments,
		requestContext,
	)
	if err != nil {
		return invocation, s.buildToolErrorResult(err)
	}
	invocation.AgenticContext = resolvedAgenticContext
	invocation.Scope = scope
	invocation.ProjectView = projectView
	return invocation, nil
}

func (s *Server) executeRegisteredToolCall(
	ctx context.Context,
	registered tools.Registered,
	translatedArguments map[string]any,
	invocation ToolInvocationContext,
) *sdkmcp.CallToolResult {
	runCall := func() (*sdkmcp.CallToolResult, error) {
		result, err := registered.Handler(contextWithToolInvocation(ctx, invocation), translatedArguments)
		if err != nil {
			return nil, err
		}
		result, err = applyToolResultFilter(result, registered.Metadata, invocation)
		if err != nil {
			return nil, err
		}
		result, err = translateResultToTemporary(result, registered.Metadata, s.temporaryIDs)
		if err != nil {
			return nil, err
		}
		return buildToolSuccessResult(result)
	}

	if runID := strings.TrimSpace(invocationRunID(invocation)); runID != "" && s.toolInvocations != nil {
		s.toolInvocations.RecordMCPToolInvocationStarted(runID, registered.Name)
		defer s.toolInvocations.RecordMCPToolInvocationCompleted(runID, registered.Name)
	}
	callResult, err := runCall()
	if err != nil {
		return s.buildToolErrorResult(err)
	}
	return callResult
}

func (s *Server) notifyAfterProjectMutation(
	ctx context.Context,
	toolName string,
	invocation ToolInvocationContext,
	beforeRevision uint64,
) {
	afterRevision := s.projectState.Snapshot().Revision
	if afterRevision == beforeRevision {
		return
	}
	projectConfigID := ""
	if invocation.AgenticContext != nil {
		projectConfigID = strings.TrimSpace(invocation.AgenticContext.ProjectConfigID)
	}
	if projectConfigID == "" {
		return
	}
	if err := s.afterProjectMutation(ctx, projectConfigID); err != nil && s.logger != nil {
		s.logger.Error(
			"broadcast MCP project state update failed",
			"tool", toolName,
			"projectConfigId", projectConfigID,
			"error", err,
		)
	}
}

func invocationRunID(invocation ToolInvocationContext) string {
	if invocation.AgenticContext == nil {
		return ""
	}
	return strings.TrimSpace(invocation.AgenticContext.RunID)
}

func (s *Server) resolveScopedInvocationContext(
	toolName string,
	metadata tools.Metadata,
	arguments map[string]any,
	requestContext ToolRequestContext,
) (*AgenticContext, *AgenticScope, *projectview.SingleConfig, error) {
	sessionAgenticContext := s.sessionAgenticContext(requestContext.SessionKey)
	resolvedAgenticContext, err := resolveAgenticContext(requestContext, sessionAgenticContext)
	if err != nil {
		return nil, nil, nil, err
	}
	if resolvedAgenticContext == nil || strings.TrimSpace(resolvedAgenticContext.ProjectConfigID) == "" {
		return nil, nil, nil, buildScopeViolationError(toolName, "missing_context", nil, nil, nil, nil)
	}
	resolvedAgenticContext, err = translateAgenticContextToCanonical(resolvedAgenticContext, s.temporaryIDs)
	if err != nil {
		return nil, nil, nil, err
	}
	if strings.TrimSpace(resolvedAgenticContext.SectionID) == "" && !resolvedAgenticContext.AllowUnscoped {
		return nil, nil, nil, buildScopeViolationError(toolName, "missing_section_id", nil, nil, nil, nil)
	}

	projectView, err := s.loadProjectView(resolvedAgenticContext.ProjectConfigID)
	if err != nil {
		return nil, nil, nil, err
	}
	scope, err := resolveAgenticScope(projectView, resolvedAgenticContext.SectionID, resolvedAgenticContext.AllowUnscoped)
	if err != nil {
		return nil, nil, nil, err
	}
	scopeCheck, err := checkAgenticScope(metadata, scope, arguments, &projectView)
	if err != nil {
		return nil, nil, nil, err
	}
	if !scopeCheck.Allowed {
		missingEdgesCanonical := buildMissingEdgeHints(
			resolvedAgenticContext.SectionID,
			scopeCheck.BlockedSectionIDs,
			string(metadata.AccessType),
			&projectView,
		)
		return nil, nil, nil, buildScopeViolationError(
			toolName,
			scopeCheck.Reason,
			scopeCheck.BlockedSectionIDs,
			scopeCheck.TargetSectionIDs,
			scopeCheck.UnmappedCodeObjIDs,
			missingEdgesCanonical,
		)
	}
	return resolvedAgenticContext, &scope, &projectView, nil
}

func (s *Server) loadProjectView(projectConfigID string) (projectview.SingleConfig, error) {
	if s == nil || s.projectState == nil {
		return projectview.SingleConfig{}, newToolError("internal_error", "Project state runtime is unavailable.")
	}
	snapshot := s.projectState.Snapshot()
	projectView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectConfigID)
	if err != nil {
		if errors.Is(err, projectstate.ErrProjectNotFound) {
			return projectview.SingleConfig{}, newToolError(projectNotFoundErrorCode, "Project config %q was not found.", projectConfigID)
		}
		return projectview.SingleConfig{}, err
	}
	return projectView, nil
}
