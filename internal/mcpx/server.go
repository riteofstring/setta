package mcpx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode/utf8"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/statefs"
	"setta/internal/tools"
)

const (
	toolMetaNamespace = "setta"
	serverName        = "setta"
	serverVersion     = "0.1.0"
)

type Server struct {
	logger               *slog.Logger
	registry             *tools.Registry
	projectState         projectStateProvider
	lspDiagnostics       lspDiagnosticsProvider
	temporaryIDs         *TemporaryIDStore
	server               *sdkmcp.Server
	handler              http.Handler
	agenticContextMu     sync.RWMutex
	agenticContextBySess map[string]AgenticContext
}

type ServerOptions struct {
	Logger             *slog.Logger
	Registry           *tools.Registry
	WorkspaceRoot      string
	ProjectState       projectStateProvider
	SettingsState      settingsStateProvider
	SectionNames       sectionNameProvider
	LSPDiagnostics     lspDiagnosticsProvider
	TemporaryIDMapPath string
}

type toolDefinition struct {
	Spec         tools.Spec
	InputSchema  map[string]any
	OutputSchema map[string]any
}

type projectStateProvider interface {
	Snapshot() projectstate.Snapshot
	CreateTopLevelSection(ctx context.Context, projectID string, input projectstate.CreateTopLevelSectionInput, settingsDocument projectstate.Document) (projectstate.Snapshot, projectstate.CreateTopLevelSectionResult, error)
	CreateChildSections(ctx context.Context, projectID string, input projectstate.CreateChildSectionsInput, settingsDocument projectstate.Document) (projectstate.Snapshot, projectstate.CreateChildSectionsResult, error)
	CreateChildSectionsViaIncrementer(ctx context.Context, projectID string, input projectstate.CreateChildSectionsViaIncrementerInput, settingsDocument projectstate.Document) (projectstate.Snapshot, projectstate.CreateChildSectionsResult, error)
	CreateNewSectionVariant(ctx context.Context, projectID string, input projectstate.CreateNewSectionVariantInput) (projectstate.Snapshot, projectstate.CreateNewSectionVariantResult, error)
	DeleteChildSectionsViaDecrementer(ctx context.Context, projectID string, input projectstate.DeleteChildSectionsViaDecrementerInput) (projectstate.Snapshot, projectstate.DeleteSectionsResult, error)
	DeleteSections(ctx context.Context, projectID string, input projectstate.DeleteSectionsInput) (projectstate.Snapshot, projectstate.DeleteSectionsResult, error)
	SetSectionCodeObjectValue(ctx context.Context, projectID string, sectionID string, codeObjID string, value string) (projectstate.Snapshot, error)
	SetParamNameAndValue(ctx context.Context, projectID string, sectionID string, codeObjID string, name string, value string) (projectstate.Snapshot, error)
	SetTypeErrorIgnore(ctx context.Context, projectID string, sectionID string, paramInfoID *string, ignoreTypeErrors bool) (projectstate.Snapshot, error)
	SetCodeObjectName(ctx context.Context, projectID string, codeObjID string, name string) (projectstate.Snapshot, error)
	SetCodeObjectDisplayName(ctx context.Context, projectID string, codeObjID string, displayName string) (projectstate.Snapshot, error)
	SetCodeSectionDiagnosticsMute(ctx context.Context, projectID string, sectionID string, mute bool) (projectstate.Snapshot, error)
	SetCodeSectionDiagnosticCodeSuppression(ctx context.Context, projectID string, sectionID string, code any, suppress bool) (projectstate.Snapshot, error)
}

type settingsStateProvider interface {
	Snapshot() projectstate.Snapshot
}

type sectionNameProvider interface {
	SetSectionName(ctx context.Context, projectID string, sectionID string, name string) error
}

type lspDiagnosticsProvider interface {
	Snapshot(projectID string) projectstate.LSPDiagnosticsPayload
	ReapplyCodeSectionIgnoreState(project projectstate.Project, sectionID string) error
}

type listMCPToolsResult struct {
	Tools []string `json:"tools"`
}

type statusResult struct {
	Status string `json:"status"`
}

type readFileRangeResult struct {
	Path         string `json:"path"`
	AbsolutePath string `json:"absolute_path"`
	StartLine    int    `json:"start_line"`
	EndLine      int    `json:"end_line"`
	Encoding     string `json:"encoding"`
	Content      string `json:"content"`
}

type toolErrorResult struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Data    map[string]any `json:"data,omitempty"`
}

type toolError struct {
	code    string
	message string
	data    map[string]any
}

var unscopedToolNames = map[string]struct{}{
	"list_mcp_tools":      {},
	"set_agentic_context": {},
}

func (e *toolError) Error() string {
	return e.message
}

func NewServer(opts ServerOptions) (*Server, error) {
	workspaceRoot := strings.TrimSpace(opts.WorkspaceRoot)
	if workspaceRoot == "" {
		return nil, fmt.Errorf("mcpx: workspace root is required")
	}
	registry := opts.Registry
	if registry == nil {
		registry = tools.NewRegistry()
	}

	server := sdkmcp.NewServer(&sdkmcp.Implementation{
		Name:    serverName,
		Version: serverVersion,
	}, &sdkmcp.ServerOptions{
		Logger: opts.Logger,
	})

	instance := &Server{
		logger:               opts.Logger,
		registry:             registry,
		projectState:         opts.ProjectState,
		lspDiagnostics:       opts.LSPDiagnostics,
		server:               server,
		agenticContextBySess: map[string]AgenticContext{},
	}
	if strings.TrimSpace(opts.TemporaryIDMapPath) != "" {
		temporaryIDs, err := NewTemporaryIDStore(opts.TemporaryIDMapPath)
		if err != nil {
			return nil, err
		}
		instance.temporaryIDs = temporaryIDs
	}

	for _, definition := range defaultToolDefinitions(instance, workspaceRoot, registry, opts.ProjectState, opts.SettingsState, opts.SectionNames, opts.LSPDiagnostics) {
		registered, err := registry.Register(definition.Spec)
		if err != nil {
			return nil, err
		}
		instance.addTool(registered, definition.InputSchema, definition.OutputSchema)
	}

	instance.handler = sdkmcp.NewSSEHandler(func(*http.Request) *sdkmcp.Server {
		return instance.server
	}, nil)
	return instance, nil
}

func (s *Server) Handler() http.Handler {
	if s == nil {
		return nil
	}
	return s.handler
}

func (s *Server) Registry() *tools.Registry {
	if s == nil {
		return nil
	}
	return s.registry
}

func (s *Server) addTool(registered tools.Registered, inputSchema map[string]any, outputSchema map[string]any) {
	s.server.AddTool(&sdkmcp.Tool{
		Name:         registered.Name,
		Description:  registered.Description,
		InputSchema:  inputSchema,
		OutputSchema: outputSchema,
		Annotations:  buildSDKToolAnnotations(registered.Metadata),
		Meta:         buildSDKToolMeta(registered.Metadata),
	}, func(ctx context.Context, req *sdkmcp.CallToolRequest) (*sdkmcp.CallToolResult, error) {
		arguments, err := decodeToolArguments(req)
		if err != nil {
			return s.buildToolErrorResult(err), nil
		}
		return s.invokeRegisteredTool(ctx, registered, arguments, requestContextFromSDK(req)), nil
	})
}

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

func (s *Server) invokeRegisteredTool(ctx context.Context, registered tools.Registered, arguments map[string]any, requestContext ToolRequestContext) *sdkmcp.CallToolResult {
	if arguments == nil {
		arguments = map[string]any{}
	}
	translatedArguments, err := translateArgumentsToCanonical(registered.Name, registered.Metadata, arguments, s.temporaryIDs)
	if err != nil {
		return s.buildToolErrorResult(err)
	}

	invocation := ToolInvocationContext{
		SessionKey: requestContext.SessionKey,
	}
	if !isUnscopedToolName(registered.Name) {
		resolvedAgenticContext, scope, projectView, err := s.resolveScopedInvocationContext(registered.Name, registered.Metadata, translatedArguments, requestContext)
		if err != nil {
			return s.buildToolErrorResult(err)
		}
		invocation.AgenticContext = resolvedAgenticContext
		invocation.Scope = scope
		invocation.ProjectView = projectView
	}

	result, err := registered.Handler(contextWithToolInvocation(ctx, invocation), translatedArguments)
	if err != nil {
		return s.buildToolErrorResult(err)
	}
	result, err = applyToolResultFilter(result, registered.Metadata, invocation)
	if err != nil {
		return s.buildToolErrorResult(err)
	}

	result, err = translateResultToTemporary(result, registered.Metadata, s.temporaryIDs)
	if err != nil {
		return s.buildToolErrorResult(err)
	}

	callResult, err := buildToolSuccessResult(result)
	if err != nil {
		return s.buildToolErrorResult(err)
	}
	return callResult
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
		return nil, nil, nil, buildScopeViolationError(toolName, "missing_context", nil, nil, nil)
	}
	resolvedAgenticContext, err = translateAgenticContextToCanonical(resolvedAgenticContext, s.temporaryIDs)
	if err != nil {
		return nil, nil, nil, err
	}
	if strings.TrimSpace(resolvedAgenticContext.SectionID) == "" && !resolvedAgenticContext.AllowUnscoped {
		return nil, nil, nil, buildScopeViolationError(toolName, "missing_section_id", nil, nil, nil)
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
		return nil, nil, nil, buildScopeViolationError(
			toolName,
			scopeCheck.Reason,
			scopeCheck.BlockedSectionIDs,
			scopeCheck.TargetSectionIDs,
			scopeCheck.UnmappedCodeObjIDs,
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

func (s *Server) newSetAgenticContextHandler() tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		chatID, err := readOptionalStringArgument(arguments, "chatId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readOptionalStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		frontendAffinityToken, err := readOptionalNonBlankStringArgument(arguments, "frontendAffinityToken")
		if err != nil {
			return nil, err
		}
		allowUnscoped, err := readOptionalBoolArgument(arguments, "allowUnscoped")
		if err != nil {
			return nil, err
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || strings.TrimSpace(invocation.SessionKey) == "" {
			return nil, newToolError("internal_error", "Unable to resolve MCP session for agentic context.")
		}
		if sectionID == "" && !allowUnscoped {
			return nil, buildScopeViolationError("set_agentic_context", "missing_section_id", nil, nil, nil)
		}

		s.setSessionAgenticContext(invocation.SessionKey, AgenticContext{
			ProjectConfigID:       projectConfigID,
			ChatID:                chatID,
			SectionID:             sectionID,
			FrontendAffinityToken: frontendAffinityToken,
			AllowUnscoped:         allowUnscoped,
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
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		implType, err := readRequiredStringArgument(arguments, "implType")
		if err != nil {
			return nil, err
		}
		controlCodeObjType, err := readOptionalStringArgument(arguments, "controlCodeObjType")
		if err != nil {
			return nil, err
		}
		position, err := readOptionalPositionArgument(arguments, "position")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural section-creation invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		input := projectstate.CreateTopLevelSectionInput{
			ImplType: implType,
			Position: position,
		}
		if strings.TrimSpace(controlCodeObjType) != "" {
			input.ControlCodeObjType = &controlCodeObjType
		}

		settingsDocument := projectstate.Document{}
		if settingsState != nil {
			settingsDocument = settingsState.Snapshot().Document
		}

		_, result, err := projectState.CreateTopLevelSection(ctx, projectConfigID, input, settingsDocument)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
	}
}

func newCreateChildSectionsHandler(projectState projectStateProvider, settingsState settingsStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		parentID, err := readRequiredStringArgument(arguments, "parentId")
		if err != nil {
			return nil, err
		}
		implType, err := readRequiredStringArgument(arguments, "implType")
		if err != nil {
			return nil, err
		}
		numChildren, err := readRequiredPositiveIntArgument(arguments, "numChildren")
		if err != nil {
			return nil, err
		}
		startIdx, err := readOptionalNonNegativeIntArgument(arguments, "startIdx")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural child-section invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		input := projectstate.CreateChildSectionsInput{
			ParentID:    parentID,
			ImplType:    implType,
			NumChildren: numChildren,
			StartIdx:    startIdx,
		}

		settingsDocument := projectstate.Document{}
		if settingsState != nil {
			settingsDocument = settingsState.Snapshot().Document
		}

		_, result, err := projectState.CreateChildSections(ctx, projectConfigID, input, settingsDocument)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
	}
}

func newCreateChildSectionsViaIncrementerHandler(projectState projectStateProvider, settingsState settingsStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		calledBy, err := readRequiredStringArgument(arguments, "calledBy")
		if err != nil {
			return nil, err
		}
		implType, err := readRequiredStringArgument(arguments, "implType")
		if err != nil {
			return nil, err
		}
		numChildren, err := readRequiredPositiveIntArgument(arguments, "numChildren")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural incrementer child-section invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		input := projectstate.CreateChildSectionsViaIncrementerInput{
			CalledBy:    calledBy,
			ImplType:    implType,
			NumChildren: numChildren,
		}

		settingsDocument := projectstate.Document{}
		if settingsState != nil {
			settingsDocument = settingsState.Snapshot().Document
		}

		_, result, err := projectState.CreateChildSectionsViaIncrementer(ctx, projectConfigID, input, settingsDocument)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
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
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		calledBy, err := readRequiredStringArgument(arguments, "calledBy")
		if err != nil {
			return nil, err
		}
		numChildren, err := readOptionalNonNegativeIntArgument(arguments, "numChildren")
		if err != nil {
			return nil, err
		}
		if numChildren == nil {
			return nil, newToolError("invalid_arguments", "numChildren is required")
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural decrementer child-deletion invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		_, result, err := projectState.DeleteChildSectionsViaDecrementer(ctx, projectConfigID, projectstate.DeleteChildSectionsViaDecrementerInput{
			CalledBy:    calledBy,
			NumChildren: *numChildren,
		})
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
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
		if projectState == nil || diagnostics == nil {
			return nil, newToolError("internal_error", "LSP diagnostics mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped diagnostics mute invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		snapshot, err := projectState.SetCodeSectionDiagnosticsMute(ctx, projectConfigID, sectionID, mute)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		project, err := snapshot.Document.ProjectByID(projectConfigID)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		if err := diagnostics.ReapplyCodeSectionIgnoreState(project, sectionID); err != nil {
			return nil, err
		}
		return statusResult{Status: "ok"}, nil
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
		if projectState == nil || diagnostics == nil {
			return nil, newToolError("internal_error", "LSP diagnostics mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped diagnostics suppression invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		snapshot, err := projectState.SetCodeSectionDiagnosticCodeSuppression(ctx, projectConfigID, sectionID, code, suppress)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		project, err := snapshot.Document.ProjectByID(projectConfigID)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		if err := diagnostics.ReapplyCodeSectionIgnoreState(project, sectionID); err != nil {
			return nil, err
		}
		return statusResult{Status: "ok"}, nil
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
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped parameter-value invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetSectionCodeObjectValue(ctx, projectConfigID, sectionID, paramInfoID, value); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
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
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped param name/value invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetParamNameAndValue(ctx, projectConfigID, sectionID, codeObjID, name, value); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
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
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped type-error ignore invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		var paramInfoIDPtr *string
		if strings.TrimSpace(paramInfoID) != "" {
			paramInfoIDPtr = &paramInfoID
		}
		if _, err := projectState.SetTypeErrorIgnore(ctx, projectConfigID, sectionID, paramInfoIDPtr, ignoreTypeErrors); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
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

func defaultToolDefinitions(
	server *Server,
	workspaceRoot string,
	registry *tools.Registry,
	projectState projectStateProvider,
	settingsState settingsStateProvider,
	sectionNames sectionNameProvider,
	lspDiagnostics lspDiagnosticsProvider,
) []toolDefinition {
	definitions := []toolDefinition{
		{
			Spec: tools.Spec{
				Name:        "set_agentic_context",
				Description: "Persist agentic context for the current MCP session.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: server.newSetAgenticContextHandler(),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Canonical project config id for the scoped tool session.",
					},
					"chatId": map[string]any{
						"type":        "string",
						"description": "Optional chat id associated with the scoped tool session.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Chat section id for scoped tool access.",
					},
					"frontendAffinityToken": map[string]any{
						"type":        "string",
						"description": "Optional frontend-affinity token for reveal-capable tools.",
					},
					"allowUnscoped": map[string]any{
						"type":        "boolean",
						"description": "Allow project-level unscoped access when true.",
					},
				},
				"required": []string{"projectConfigId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"status"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "list_mcp_tools",
				Description: "Return every registered MCP tool name without schemas or descriptions.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: func(context.Context, map[string]any) (any, error) {
					registered := registry.List()
					names := make([]string, 0, len(registered))
					for _, tool := range registered {
						names = append(names, tool.Name)
					}
					return listMCPToolsResult{Tools: names}, nil
				},
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"tools": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"tools"},
			},
		},
	}

	if projectState != nil {
		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "get_latest_project_state_summary",
				Description: "Return a filtered project-state summary for the requested project config.",
				Metadata: tools.Metadata{
					Kind:           tools.KindInit,
					AccessType:     tools.AccessTypeRead,
					ResultFilter:   tools.ResultFilterProjectStateSummary,
					SearchCategory: "project",
					SearchTags:     []string{"project", "summary", "state", "sections"},
				},
				Handler: newProjectStateSummaryHandler(),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Canonical project config id to summarize.",
					},
				},
				"required": []string{"projectConfigId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "create_top_level_section",
				Description: "Create a new top-level section in the requested project config.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection:    {"sectionId"},
						tools.IDTypeCodeObject: {"metaControlParamId"},
					},
					SearchCategory: "sections",
					SearchTags:     []string{"create", "section", "top", "level", "structural"},
				},
				Handler: newCreateTopLevelSectionHandler(projectState, settingsState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id where the new top-level section should be created.",
					},
					"implType": map[string]any{
						"type":        "string",
						"description": "Section implementation type to create.",
					},
					"controlCodeObjType": map[string]any{
						"type":        "string",
						"description": "Optional control code-object type for MetaControl sections.",
					},
					"position": map[string]any{
						"type":        "object",
						"description": "Optional explicit top-left position for the new section.",
						"properties": map[string]any{
							"x": map[string]any{
								"type": "number",
							},
							"y": map[string]any{
								"type": "number",
							},
						},
						"required": []string{"x", "y"},
					},
				},
				"required": []string{"projectConfigId", "implType"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sectionId": map[string]any{
						"type": "string",
					},
					"metaControlParamId": map[string]any{
						"type": "string",
					},
					"panTo": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"x": map[string]any{
								"type": "number",
							},
							"y": map[string]any{
								"type": "number",
							},
						},
						"required": []string{"x", "y"},
					},
				},
				"required": []string{"sectionId"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "create_child_sections",
				Description: "Create one or more child sections beneath the requested parent section.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"parentId"},
					},
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionIds"},
					},
					SearchCategory: "sections",
					SearchTags:     []string{"create", "child", "section", "structural", "parent"},
				},
				Handler: newCreateChildSectionsHandler(projectState, settingsState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id where child sections should be created.",
					},
					"parentId": map[string]any{
						"type":        "string",
						"description": "Parent section id that will receive the new children.",
					},
					"implType": map[string]any{
						"type":        "string",
						"description": "Section implementation type shared by every created child.",
					},
					"numChildren": map[string]any{
						"type":        "integer",
						"description": "Number of child sections to create.",
					},
					"startIdx": map[string]any{
						"type":        "integer",
						"description": "Optional insertion index for the created child block.",
					},
				},
				"required": []string{"projectConfigId", "parentId", "implType", "numChildren"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sectionIds": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"sectionIds"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "create_child_sections_via_incrementer",
				Description: "Create one or more child sections using incrementer-style caller placement.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"calledBy"},
					},
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionIds"},
					},
					SearchCategory: "sections",
					SearchTags:     []string{"create", "child", "section", "incrementer", "structural"},
				},
				Handler: newCreateChildSectionsViaIncrementerHandler(projectState, settingsState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id where incrementer children should be created.",
					},
					"calledBy": map[string]any{
						"type":        "string",
						"description": "Parent section or existing child section that determines the insertion point.",
					},
					"implType": map[string]any{
						"type":        "string",
						"description": "Section implementation type shared by every created child.",
					},
					"numChildren": map[string]any{
						"type":        "integer",
						"description": "Number of child sections to create.",
					},
				},
				"required": []string{"projectConfigId", "calledBy", "implType", "numChildren"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sectionIds": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"sectionIds"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "delete_sections",
				Description: "Delete one or more sections and any descendant sections referenced by them.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionIds"},
					},
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionIds"},
					},
					SearchCategory: "sections",
					SearchTags:     []string{"delete", "remove", "section", "structural"},
				},
				Handler: newDeleteSectionsHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id where sections should be deleted.",
					},
					"sectionIds": map[string]any{
						"type":        "array",
						"description": "Section ids to delete recursively.",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"projectConfigId", "sectionIds"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sectionIds": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"sectionIds"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "delete_child_sections_via_decrementer",
				Description: "Delete child sections using decrementer-style caller placement.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"calledBy"},
					},
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionIds"},
					},
					SearchCategory: "sections",
					SearchTags:     []string{"delete", "remove", "child", "section", "decrementer", "structural"},
				},
				Handler: newDeleteChildSectionsViaDecrementerHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id where decrementer children should be deleted.",
					},
					"calledBy": map[string]any{
						"type":        "string",
						"description": "Parent section or existing child section that determines the deletion window.",
					},
					"numChildren": map[string]any{
						"type":        "integer",
						"description": "Number of child sections to delete from the resolved window.",
					},
				},
				"required": []string{"projectConfigId", "calledBy", "numChildren"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sectionIds": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"sectionIds"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "create_new_section_variant",
				Description: "Duplicate the active variant of a section and switch the section to the new variant.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSectionVariant: {"variantId"},
					},
					SearchCategory: "sections",
					SearchTags:     []string{"create", "new", "section", "variant", "structural"},
				},
				Handler: newCreateNewSectionVariantHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id where the new section variant should be created.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id whose active variant should be duplicated.",
					},
				},
				"required": []string{"projectConfigId", "sectionId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"variantId": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"variantId"},
			},
		})
	}

	if projectState != nil && lspDiagnostics != nil {
		if sectionNames != nil {
			definitions = append(definitions, toolDefinition{
				Spec: tools.Spec{
					Name:        "set_section_name",
					Description: "Rename a section within the requested project config.",
					Metadata: tools.Metadata{
						Kind:       tools.KindDiscoverable,
						AccessType: tools.AccessTypeWrite,
						IDPathsByType: map[tools.IDType][]string{
							tools.IDTypeSection: {"sectionId"},
						},
						SearchCategory: "project",
						SearchTags:     []string{"section", "name", "rename", "title"},
					},
					Handler: newSetSectionNameHandler(sectionNames),
				},
				InputSchema: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"projectConfigId": map[string]any{
							"type":        "string",
							"description": "Project config id whose section name should be updated.",
						},
						"sectionId": map[string]any{
							"type":        "string",
							"description": "Section id whose name should be updated.",
						},
						"name": map[string]any{
							"type":        "string",
							"description": "Raw section name to validate and persist.",
						},
					},
					"required": []string{"projectConfigId", "sectionId", "name"},
				},
				OutputSchema: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"status": map[string]any{
							"type": "string",
						},
					},
					"required": []string{"status"},
				},
			})
		}

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "get_latest_lsp_diagnostics",
				Description: "Return the latest filtered LSP diagnostics payload for the requested project config.",
				Metadata: tools.Metadata{
					Kind:           tools.KindInit,
					AccessType:     tools.AccessTypeRead,
					ResultFilter:   tools.ResultFilterLSPDiagnostics,
					SearchCategory: "lsp",
					SearchTags:     []string{"lsp", "diagnostics", "errors", "python"},
				},
				Handler: newLSPDiagnosticsHandler(lspDiagnostics),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose latest diagnostics should be returned.",
					},
				},
				"required": []string{"projectConfigId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_param_entered_value",
				Description: "Write a new manual value for the targeted section parameter.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection:    {"sectionId"},
						tools.IDTypeCodeObject: {"paramInfoId"},
					},
					SearchCategory: "params",
					SearchTags:     []string{"param", "parameter", "value", "input", "write"},
				},
				Handler: newSetParamEnteredValueHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose parameter value should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id containing the targeted parameter.",
					},
					"paramInfoId": map[string]any{
						"type":        "string",
						"description": "Code-object id for the targeted parameter.",
					},
					"value": map[string]any{
						"type":        "string",
						"description": "Raw parameter value to persist.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "paramInfoId", "value"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"status"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_param_name_and_value",
				Description: "Rename the targeted parameter and persist its raw value in one mutation.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection:    {"sectionId"},
						tools.IDTypeCodeObject: {"codeObjId"},
					},
					SearchCategory: "params",
					SearchTags:     []string{"param", "parameter", "name", "rename", "value", "write"},
				},
				Handler: newSetParamNameAndValueHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose parameter should be renamed and updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id containing the targeted parameter.",
					},
					"codeObjId": map[string]any{
						"type":        "string",
						"description": "Code-object id for the targeted parameter.",
					},
					"name": map[string]any{
						"type":        "string",
						"description": "Parameter name to store on the referenced code object.",
					},
					"value": map[string]any{
						"type":        "string",
						"description": "Raw parameter value to persist.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "codeObjId", "name", "value"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"status"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_type_error_ignore",
				Description: "Toggle ignoring type errors for the targeted section entry.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection:    {"sectionId"},
						tools.IDTypeCodeObject: {"paramInfoId"},
					},
					SearchCategory: "params",
					SearchTags:     []string{"param", "parameter", "type", "error", "ignore"},
				},
				Handler: newSetTypeErrorIgnoreHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose type-error ignore state should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id whose type-error ignore state should be updated.",
					},
					"paramInfoId": map[string]any{
						"type":        "string",
						"description": "Optional parameter code-object id to target; omit to target callable-level errors.",
					},
					"ignoreTypeErrors": map[string]any{
						"type":        "boolean",
						"description": "When true, ignore type errors for the targeted entry.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "ignoreTypeErrors"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"status"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_code_obj_name",
				Description: "Rename a code object referenced by the active project state.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeCodeObject: {"codeObjId"},
					},
					SearchCategory: "params",
					SearchTags:     []string{"code", "object", "name", "param", "rename"},
				},
				Handler: newSetCodeObjectNameHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose code-object name should be updated.",
					},
					"codeObjId": map[string]any{
						"type":        "string",
						"description": "Code-object id whose name should be updated.",
					},
					"name": map[string]any{
						"type":        "string",
						"description": "Code-object name to store on the referenced code object.",
					},
				},
				"required": []string{"projectConfigId", "codeObjId", "name"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"status"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_code_obj_display_name",
				Description: "Update the user-facing display name for the requested code object.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeCodeObject: {"codeObjId"},
					},
					SearchCategory: "params",
					SearchTags:     []string{"code", "object", "display", "name", "param"},
				},
				Handler: newSetCodeObjectDisplayNameHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose code-object display name should be updated.",
					},
					"codeObjId": map[string]any{
						"type":        "string",
						"description": "Code-object id whose display name should be updated.",
					},
					"displayName": map[string]any{
						"type":        "string",
						"description": "User-facing display name to store for the code object.",
					},
				},
				"required": []string{"projectConfigId", "codeObjId", "displayName"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"status"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_code_section_diagnostics_mute",
				Description: "Mute or unmute diagnostics for a code section in the requested project config.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "lsp",
					SearchTags:     []string{"lsp", "diagnostics", "mute", "code", "section"},
				},
				Handler: newSetCodeSectionDiagnosticsMuteHandler(projectState, lspDiagnostics),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose code-section diagnostics should be mutated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Code section id whose diagnostics mute state should be updated.",
					},
					"mute": map[string]any{
						"type":        "boolean",
						"description": "When true, filter all diagnostics for the targeted code section.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "mute"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"status"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_code_section_diagnostic_code_suppression",
				Description: "Suppress or unsuppress a specific diagnostics code for a code section in the requested project config.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "lsp",
					SearchTags:     []string{"lsp", "diagnostics", "suppress", "code", "section"},
				},
				Handler: newSetCodeSectionDiagnosticCodeSuppressionHandler(projectState, lspDiagnostics),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose code-section diagnostics should be mutated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Code section id whose diagnostics suppression should be updated.",
					},
					"code": map[string]any{
						"description": "Diagnostic code to suppress or unsuppress.",
					},
					"suppress": map[string]any{
						"type":        "boolean",
						"description": "When true, hide diagnostics matching the targeted code.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "code", "suppress"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"status"},
			},
		})
	}

	definitions = append(definitions, toolDefinition{
		Spec: tools.Spec{
			Name:        "read_file_range",
			Description: "Return the requested line range from a UTF-8 text file.",
			Metadata: tools.Metadata{
				Kind:           tools.KindDiscoverable,
				AccessType:     tools.AccessTypeRead,
				SearchCategory: "files",
				SearchTags:     []string{"file", "read", "lines", "workspace"},
			},
			Handler: newReadFileRangeHandler(workspaceRoot),
		},
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path": map[string]any{
					"type":        "string",
					"description": "Workspace-relative file path to read.",
				},
				"start_line": map[string]any{
					"type":        "integer",
					"description": "First line number to include.",
				},
				"end_line": map[string]any{
					"type":        "integer",
					"description": "Last line number to include.",
				},
			},
			"required": []string{"path"},
		},
		OutputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"path": map[string]any{
					"type": "string",
				},
				"absolute_path": map[string]any{
					"type": "string",
				},
				"start_line": map[string]any{
					"type": "integer",
				},
				"end_line": map[string]any{
					"type": "integer",
				},
				"encoding": map[string]any{
					"type": "string",
				},
				"content": map[string]any{
					"type": "string",
				},
			},
			"required": []string{
				"path",
				"absolute_path",
				"start_line",
				"end_line",
				"encoding",
				"content",
			},
		},
	})

	return definitions
}

func newReadFileRangeHandler(workspaceRoot string) tools.Handler {
	return func(_ context.Context, arguments map[string]any) (any, error) {
		rawPath, err := readRequiredStringArgument(arguments, "path")
		if err != nil {
			return nil, err
		}
		startLine, err := readOptionalPositiveIntArgument(arguments, "start_line")
		if err != nil {
			return nil, err
		}
		endLine, err := readOptionalPositiveIntArgument(arguments, "end_line")
		if err != nil {
			return nil, err
		}

		resolvedStartLine := 1
		if startLine != nil {
			resolvedStartLine = *startLine
		}
		if endLine != nil && *endLine < resolvedStartLine {
			return nil, newToolError(
				"invalid_arguments",
				"end_line must be greater than or equal to start_line",
			)
		}

		resolvedPath, err := statefs.ResolveWithinRoot(workspaceRoot, rawPath, "path")
		if err != nil {
			return nil, newToolError("invalid_arguments", "%s", err.Error())
		}

		info, err := os.Stat(resolvedPath)
		if err != nil {
			if os.IsNotExist(err) {
				return nil, newToolError("file_not_found", "File not found: %s", resolvedPath)
			}
			return nil, fmt.Errorf("stat %s: %w", resolvedPath, err)
		}
		if !info.Mode().IsRegular() {
			return nil, newToolError("invalid_arguments", "Path is not a file: %s", resolvedPath)
		}

		data, err := os.ReadFile(resolvedPath)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", resolvedPath, err)
		}
		if !utf8.Valid(data) {
			return nil, newToolError("invalid_arguments", "File is not UTF-8 encoded: %s", resolvedPath)
		}

		lines := splitFileLines(string(data))
		selectedLines := make([]string, 0, len(lines))
		resolvedEndLine := resolvedStartLine - 1
		for lineNumber := resolvedStartLine; lineNumber <= len(lines); lineNumber++ {
			if endLine != nil && lineNumber > *endLine {
				break
			}
			selectedLines = append(selectedLines, lines[lineNumber-1])
			resolvedEndLine = lineNumber
		}

		relativePath, err := filepath.Rel(workspaceRoot, resolvedPath)
		if err != nil {
			return nil, fmt.Errorf("relative path for %s: %w", resolvedPath, err)
		}

		return readFileRangeResult{
			Path:         filepath.ToSlash(filepath.Clean(relativePath)),
			AbsolutePath: resolvedPath,
			StartLine:    resolvedStartLine,
			EndLine:      resolvedEndLine,
			Encoding:     "utf-8",
			Content:      strings.Join(selectedLines, "\n"),
		}, nil
	}
}

func splitFileLines(content string) []string {
	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")
	lines := strings.Split(normalized, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

func applyToolResultFilter(payload any, metadata tools.Metadata, invocation ToolInvocationContext) (any, error) {
	switch metadata.ResultFilter {
	case tools.ResultFilterLSPDiagnostics:
		if invocation.Scope == nil {
			return nil, newToolError("internal_error", "Scoped LSP diagnostics filtering requires a resolved scope.")
		}
		diagnostics, ok := payload.(projectstate.LSPDiagnosticsPayload)
		if !ok {
			typed, ok := payload.(*projectstate.LSPDiagnosticsPayload)
			if !ok || typed == nil {
				return nil, fmt.Errorf("mcpx: unsupported lsp diagnostics payload type %T", payload)
			}
			diagnostics = *typed
		}
		return filterLSPDiagnosticsPayload(diagnostics, invocation.Scope.effectiveReadSectionIDs(), invocation.Scope.StructuralAllowed), nil
	default:
		return payload, nil
	}
}

func readRequiredStringArgument(arguments map[string]any, key string) (string, error) {
	rawValue, ok := arguments[key]
	if !ok {
		return "", newToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", newToolError("invalid_arguments", "%s must be a string", key)
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return "", newToolError("invalid_arguments", "%s must not be empty", key)
	}
	return value, nil
}

func readRequiredRawStringArgument(arguments map[string]any, key string) (string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return "", newToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", newToolError("invalid_arguments", "%s must be a string", key)
	}
	return value, nil
}

func readOptionalStringArgument(arguments map[string]any, key string) (string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return "", nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", newToolError("invalid_arguments", "%s must be a string", key)
	}
	return strings.TrimSpace(value), nil
}

func readOptionalNonBlankStringArgument(arguments map[string]any, key string) (string, error) {
	value, err := readOptionalStringArgument(arguments, key)
	if err != nil {
		return "", err
	}
	if _, ok := arguments[key]; ok && strings.TrimSpace(value) == "" {
		return "", newToolError("invalid_arguments", "%s must be a non-empty string when provided", key)
	}
	return value, nil
}

func readOptionalBoolArgument(arguments map[string]any, key string) (bool, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return false, nil
	}
	value, ok := rawValue.(bool)
	if !ok {
		return false, newToolError("invalid_arguments", "%s must be a boolean", key)
	}
	return value, nil
}

func readRequiredBoolArgument(arguments map[string]any, key string) (bool, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return false, newToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(bool)
	if !ok {
		return false, newToolError("invalid_arguments", "%s must be a boolean", key)
	}
	return value, nil
}

func readRequiredArgument(arguments map[string]any, key string) (any, error) {
	value, ok := arguments[key]
	if !ok || value == nil {
		return nil, newToolError("invalid_arguments", "%s is required", key)
	}
	return value, nil
}

func readOptionalPositionArgument(arguments map[string]any, key string) (*projectstate.Position, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}

	object, ok := rawValue.(map[string]any)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be an object", key)
	}
	x, err := readRequiredFiniteNumberField(object, key, "x")
	if err != nil {
		return nil, err
	}
	y, err := readRequiredFiniteNumberField(object, key, "y")
	if err != nil {
		return nil, err
	}
	return &projectstate.Position{X: x, Y: y}, nil
}

func readRequiredFiniteNumberField(object map[string]any, parentKey string, field string) (float64, error) {
	rawValue, ok := object[field]
	if !ok || rawValue == nil {
		return 0, newToolError("invalid_arguments", "%s.%s is required", parentKey, field)
	}

	var value float64
	switch typed := rawValue.(type) {
	case float64:
		value = typed
	case float32:
		value = float64(typed)
	case int:
		value = float64(typed)
	case int8:
		value = float64(typed)
	case int16:
		value = float64(typed)
	case int32:
		value = float64(typed)
	case int64:
		value = float64(typed)
	default:
		return 0, newToolError("invalid_arguments", "%s.%s must be a number", parentKey, field)
	}
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, newToolError("invalid_arguments", "%s.%s must be a finite number", parentKey, field)
	}
	return value, nil
}

func readOptionalPositiveIntArgument(arguments map[string]any, key string) (*int, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}

	var value int
	switch typed := rawValue.(type) {
	case int:
		value = typed
	case int8:
		value = int(typed)
	case int16:
		value = int(typed)
	case int32:
		value = int(typed)
	case int64:
		value = int(typed)
	case float64:
		if math.Trunc(typed) != typed {
			return nil, newToolError("invalid_arguments", "%s must be an integer", key)
		}
		value = int(typed)
	default:
		return nil, newToolError("invalid_arguments", "%s must be an integer", key)
	}
	if value < 1 {
		return nil, newToolError("invalid_arguments", "%s must be at least 1", key)
	}
	return &value, nil
}

func readRequiredPositiveIntArgument(arguments map[string]any, key string) (int, error) {
	value, err := readOptionalPositiveIntArgument(arguments, key)
	if err != nil {
		return 0, err
	}
	if value == nil {
		return 0, newToolError("invalid_arguments", "%s is required", key)
	}
	return *value, nil
}

func readRequiredStringArrayArgument(arguments map[string]any, key string) ([]string, error) {
	rawValue, ok := arguments[key]
	if !ok {
		return nil, newToolError("invalid_arguments", "%s is required", key)
	}

	switch typed := rawValue.(type) {
	case []string:
		output := make([]string, len(typed))
		copy(output, typed)
		return output, nil
	case []any:
		output := make([]string, 0, len(typed))
		for _, entry := range typed {
			rawString, ok := entry.(string)
			if !ok {
				return nil, newToolError("invalid_arguments", "%s must be an array of strings", key)
			}
			output = append(output, strings.TrimSpace(rawString))
		}
		return output, nil
	default:
		return nil, newToolError("invalid_arguments", "%s must be an array of strings", key)
	}
}

func readOptionalNonNegativeIntArgument(arguments map[string]any, key string) (*int, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}

	var value int
	switch typed := rawValue.(type) {
	case int:
		value = typed
	case int8:
		value = int(typed)
	case int16:
		value = int(typed)
	case int32:
		value = int(typed)
	case int64:
		value = int(typed)
	case float64:
		if math.Trunc(typed) != typed {
			return nil, newToolError("invalid_arguments", "%s must be an integer", key)
		}
		value = int(typed)
	default:
		return nil, newToolError("invalid_arguments", "%s must be an integer", key)
	}
	if value < 0 {
		return nil, newToolError("invalid_arguments", "%s must be at least 0", key)
	}
	return &value, nil
}

func decodeToolArguments(req *sdkmcp.CallToolRequest) (map[string]any, error) {
	if req == nil || req.Params == nil || len(req.Params.Arguments) == 0 {
		return map[string]any{}, nil
	}
	var decoded any
	if err := json.Unmarshal(req.Params.Arguments, &decoded); err != nil {
		return nil, newToolError("invalid_arguments", "Tool arguments must be valid JSON.")
	}
	arguments, ok := decoded.(map[string]any)
	if !ok {
		return nil, newToolError("invalid_arguments", "Tool arguments must be a JSON object.")
	}
	return arguments, nil
}

func buildToolSuccessResult(payload any) (*sdkmcp.CallToolResult, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal tool result: %w", err)
	}

	var structured map[string]any
	if err := json.Unmarshal(encoded, &structured); err != nil {
		return nil, fmt.Errorf("decode tool result: %w", err)
	}

	return &sdkmcp.CallToolResult{
		Content:           []sdkmcp.Content{&sdkmcp.TextContent{Text: string(encoded)}},
		StructuredContent: structured,
	}, nil
}

func buildToolErrorResult(err error) *sdkmcp.CallToolResult {
	result := toolErrorResult{
		Code:    "internal_error",
		Message: "Internal server error.",
	}
	var typed *toolError
	if ok := asToolError(err, &typed); ok {
		result.Code = typed.code
		result.Message = typed.message
		result.Data = copyMetaMap(typed.data)
	} else if err != nil {
		result.Message = err.Error()
	}

	structuredContent := map[string]any{
		"code":    result.Code,
		"message": result.Message,
	}
	for key, value := range result.Data {
		structuredContent[key] = value
	}

	return &sdkmcp.CallToolResult{
		IsError: true,
		Content: []sdkmcp.Content{
			&sdkmcp.TextContent{Text: result.Message},
		},
		StructuredContent: structuredContent,
	}
}

func normalizeProjectStateMutationError(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, projectstate.ErrProjectNotFound):
		return newToolError(projectNotFoundErrorCode, "%s", err.Error())
	case projectstate.IsInvalidSectionNameError(err):
		return newToolError("invalid_arguments", "%s", err.Error())
	case projectstate.IsInvalidCodeObjectNameError(err):
		return newToolError("invalid_arguments", "%s", err.Error())
	case projectstate.IsInvalidAutoLayoutError(err):
		return newToolError("invalid_arguments", "%s", err.Error())
	case errors.Is(err, projectstate.ErrSectionNotFound),
		errors.Is(err, projectstate.ErrCodeObjNotFound),
		errors.Is(err, projectstate.ErrCodeObjRenameUnsupported),
		errors.Is(err, projectstate.ErrCodeObjActiveReferenceNotFound),
		errors.Is(err, projectstate.ErrCodeSectionRequired),
		errors.Is(err, projectstate.ErrChildSectionParentIDRequired),
		errors.Is(err, projectstate.ErrChildSectionImplTypeRequired),
		errors.Is(err, projectstate.ErrChildSectionImplTypeUnsupported),
		errors.Is(err, projectstate.ErrChildSectionCountInvalid),
		errors.Is(err, projectstate.ErrChildSectionStartIdxInvalid),
		errors.Is(err, projectstate.ErrChildSectionParentUnsupported),
		errors.Is(err, projectstate.ErrCodeSectionChildTypeInvalid),
		errors.Is(err, projectstate.ErrCodeSectionChildCountInvalid),
		errors.Is(err, projectstate.ErrCodeSectionAlreadyHasChild),
		errors.Is(err, projectstate.ErrChildSectionIncrementerCalledByRequired),
		errors.Is(err, projectstate.ErrChildSectionIncrementerCalledByUnsupported),
		errors.Is(err, projectstate.ErrChildSectionIncrementerCalledByNotInParent),
		errors.Is(err, projectstate.ErrChildSectionDecrementerCalledByRequired),
		errors.Is(err, projectstate.ErrChildSectionDecrementerCalledByUnsupported),
		errors.Is(err, projectstate.ErrChildSectionDecrementerCalledByNotInParent),
		errors.Is(err, projectstate.ErrChildSectionDecrementerCountInvalid),
		errors.Is(err, projectstate.ErrDeleteSectionsSectionIDsRequired),
		errors.Is(err, projectstate.ErrDeleteSectionsSectionIDBlank),
		errors.Is(err, projectstate.ErrTopLevelSectionImplTypeRequired),
		errors.Is(err, projectstate.ErrTopLevelSectionImplTypeUnsupported),
		errors.Is(err, projectstate.ErrTopLevelMetaControlCodeObjTypeUnsupported),
		errors.Is(err, projectstate.ErrTopLevelMetaControlCodeObjTypeNotAllowed),
		errors.Is(err, projectstate.ErrTopLevelSectionPositionInvalid),
		errors.Is(err, projectstate.ErrInvalidCodeSectionDiagnosticCode),
		errors.Is(err, projectstate.ErrCodeObjectValueMutationUnsupported),
		errors.Is(err, projectstate.ErrPasswordParamMutationUnsupported),
		errors.Is(err, projectstate.ErrDropzoneParamMutationUnsupported),
		errors.Is(err, projectstate.ErrInvalidTypeErrorIgnoreState),
		errors.Is(err, projectstate.ErrTypeErrorIgnoreUnsupported):
		return newToolError("invalid_arguments", "%s", err.Error())
	default:
		return err
	}
}

func (s *Server) buildToolErrorResult(err error) *sdkmcp.CallToolResult {
	return buildToolErrorResult(translateToolErrorToTemporary(err, s.temporaryIDs))
}

func buildSDKToolAnnotations(metadata tools.Metadata) *sdkmcp.ToolAnnotations {
	if metadata.AccessType != tools.AccessTypeRead {
		return nil
	}
	openWorld := false
	return &sdkmcp.ToolAnnotations{
		ReadOnlyHint:   true,
		IdempotentHint: true,
		OpenWorldHint:  &openWorld,
	}
}

func buildSDKToolMeta(metadata tools.Metadata) sdkmcp.Meta {
	idPathsByType := make(map[string]any, len(metadata.IDPathsByType))
	for idType, paths := range metadata.IDPathsByType {
		copied := append([]string(nil), paths...)
		idPathsByType[string(idType)] = copied
	}
	resultIDPathsByType := make(map[string]any, len(metadata.ResultIDPathsByType))
	for idType, paths := range metadata.ResultIDPathsByType {
		copied := append([]string(nil), paths...)
		resultIDPathsByType[string(idType)] = copied
	}

	payload := map[string]any{
		"toolKind":       string(metadata.Kind),
		"accessType":     string(metadata.AccessType),
		"idPathsByType":  idPathsByType,
		"searchTags":     append([]string(nil), metadata.SearchTags...),
		"searchCategory": metadata.SearchCategory,
	}
	if metadata.DefaultTargetSingletonSection != "" {
		payload["defaultTargetSingletonSection"] = metadata.DefaultTargetSingletonSection
	}
	if metadata.ResultFilter != "" {
		payload["resultFilter"] = string(metadata.ResultFilter)
	}
	if len(resultIDPathsByType) != 0 {
		payload["resultIdPathsByType"] = resultIDPathsByType
	}

	return sdkmcp.Meta{
		toolMetaNamespace: payload,
	}
}

func newToolError(code string, format string, args ...any) error {
	return newToolErrorWithData(code, format, nil, args...)
}

func newToolErrorWithData(code string, format string, data map[string]any, args ...any) error {
	return &toolError{
		code:    code,
		message: fmt.Sprintf(format, args...),
		data:    data,
	}
}

func asToolError(err error, target **toolError) bool {
	if err == nil {
		return false
	}
	typed, ok := err.(*toolError)
	if !ok {
		return false
	}
	*target = typed
	return true
}

func isUnscopedToolName(toolName string) bool {
	_, ok := unscopedToolNames[toolName]
	return ok
}
