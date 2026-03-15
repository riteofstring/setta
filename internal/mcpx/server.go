package mcpx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settadocs"
	"setta/internal/settingsstate"
	"setta/internal/statefs"
	"setta/internal/tools"
	"setta/internal/uisettings"
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
	pluginMutations      pluginMutationProvider
	pythonPackages       pythonPackageProvider
	lspDiagnostics       lspDiagnosticsProvider
	mcpStatuses          mcpStatusProvider
	terminals            terminalHistoryProvider
	docs                 *settadocs.Loader
	toolSearch           *tools.SearchIndex
	searchEntries        []tools.SearchEntry
	temporaryIDs         *TemporaryIDStore
	agentProfiles        agentProfileProvider
	agentRuns            agentRunProvider
	uiSettingReveals     uisettings.RevealService
	stateMachineRuns     stateMachineRunProvider
	server               *sdkmcp.Server
	handler              http.Handler
	agenticContextMu     sync.RWMutex
	agenticContextBySess map[string]AgenticContext
}

type ServerOptions struct {
	Logger                         *slog.Logger
	Registry                       *tools.Registry
	WorkspaceRoot                  string
	ProjectState                   projectStateProvider
	CodegenTargetValidator         projectstate.CodegenTargetValidator
	PythonCodegenSectionReconciler projectstate.PythonCodegenSectionReconciler
	CodeUpdates                    codeUpdateProvider
	SettingsState                  settingsStateProvider
	SectionNames                   sectionNameProvider
	CallableSignatures             projectstate.CallableSignatureResolver
	PluginMutations                pluginMutationProvider
	PythonPackages                 pythonPackageProvider
	LSPDiagnostics                 lspDiagnosticsProvider
	MCPStatuses                    mcpStatusProvider
	Terminals                      terminalHistoryProvider
	DocsRoot                       string
	TemporaryIDMapPath             string
	AgentProfiles                  agentProfileProvider
	AgentRuns                      agentRunProvider
	UISettingReveals               uisettings.RevealService
	StateMachineRuns               stateMachineRunProvider
}

type toolDefinition struct {
	Spec         tools.Spec
	InputSchema  map[string]any
	OutputSchema map[string]any
}

type ToolRegistration struct {
	Spec         tools.Spec
	InputSchema  map[string]any
	OutputSchema map[string]any
}

type projectStateProvider interface {
	Snapshot() projectstate.Snapshot
	GetAppDefinition(ctx context.Context) (projectstate.AppDefinitionReadResult, error)
	ValidateAppDefinition(ctx context.Context, input projectstate.ValidateAppDefinitionInput) (projectstate.AppDefinitionValidationResult, error)
	SetAppDefinition(ctx context.Context, input projectstate.SetAppDefinitionInput) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error)
	StreamAppDefinition(ctx context.Context, input projectstate.StreamAppDefinitionInput) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error)
	UpdateAppDefinition(ctx context.Context, patch any) (projectstate.Snapshot, projectstate.AppDefinitionMutationResult, error)
	AddKwarg(ctx context.Context, projectID string, sectionID string) (projectstate.Snapshot, projectstate.AddKwargResult, error)
	AutoLayoutTopLevelSections(ctx context.Context, projectID string, settings projectstate.StructuralMutationSettings, margin int) (projectstate.Snapshot, error)
	ChangeParamImpl(ctx context.Context, projectID string, sectionID string, paramInfoID string, selectedID string) (projectstate.Snapshot, error)
	CreateTopLevelSection(ctx context.Context, projectID string, input projectstate.CreateTopLevelSectionInput, settings projectstate.StructuralMutationSettings) (projectstate.Snapshot, projectstate.CreateTopLevelSectionResult, error)
	CreateChildSections(ctx context.Context, projectID string, input projectstate.CreateChildSectionsInput, settings projectstate.StructuralMutationSettings) (projectstate.Snapshot, projectstate.CreateChildSectionsResult, error)
	SetCodeSectionAttachedTerminal(ctx context.Context, projectID string, sectionID string, terminalSectionID *string, settings projectstate.StructuralMutationSettings) (projectstate.Snapshot, error)
	CreateChildSectionsViaIncrementer(ctx context.Context, projectID string, input projectstate.CreateChildSectionsViaIncrementerInput, settings projectstate.StructuralMutationSettings) (projectstate.Snapshot, projectstate.CreateChildSectionsResult, error)
	CreateNewSectionVariant(ctx context.Context, projectID string, input projectstate.CreateNewSectionVariantInput) (projectstate.Snapshot, projectstate.CreateNewSectionVariantResult, error)
	DeleteKwarg(ctx context.Context, projectID string, sectionID string) (projectstate.Snapshot, projectstate.DeleteKwargResult, error)
	DeleteSelectedParams(ctx context.Context, projectID string, input projectstate.DeleteSelectedParamsInput) (projectstate.Snapshot, projectstate.DeleteSelectedParamsResult, error)
	DeleteChildSectionsViaDecrementer(ctx context.Context, projectID string, input projectstate.DeleteChildSectionsViaDecrementerInput) (projectstate.Snapshot, projectstate.DeleteSectionsResult, error)
	DeleteSections(ctx context.Context, projectID string, input projectstate.DeleteSectionsInput) (projectstate.Snapshot, projectstate.DeleteSectionsResult, error)
	SetCallable(ctx context.Context, projectID string, sectionID string, callableName string, refetchParams bool, resolver projectstate.CallableSignatureResolver) (projectstate.Snapshot, projectstate.SetCallableResponse, error)
	SetTopLevelSectionLayout(ctx context.Context, projectID string, topLevelSections map[string]projectstate.TopLevelSectionLayout) (projectstate.Snapshot, error)
	SetSectionSizes(ctx context.Context, projectID string, sectionSizes map[string]projectstate.SectionSize, settings projectstate.StructuralMutationSettings) (projectstate.Snapshot, error)
	UpdateParamImplConfig(ctx context.Context, projectID string, sectionID string, paramInfoID string, newConfig map[string]any) (projectstate.Snapshot, error)
	SetSectionCodeObjectValue(ctx context.Context, projectID string, sectionID string, codeObjID string, value string) (projectstate.Snapshot, error)
	SetParamNameAndValue(ctx context.Context, projectID string, sectionID string, codeObjID string, name string, value string) (projectstate.Snapshot, error)
	SetTypeErrorIgnore(ctx context.Context, projectID string, sectionID string, paramInfoID *string, ignoreTypeErrors bool) (projectstate.Snapshot, error)
	SetCodeObjectName(ctx context.Context, projectID string, codeObjID string, name string) (projectstate.Snapshot, error)
	SetCodeObjectDisplayName(ctx context.Context, projectID string, codeObjID string, displayName string) (projectstate.Snapshot, error)
	SetCodeSectionDiagnosticsMute(ctx context.Context, projectID string, sectionID string, mute bool) (projectstate.Snapshot, error)
	SetCodeSectionDiagnosticCodeSuppression(ctx context.Context, projectID string, sectionID string, code any, suppress bool) (projectstate.Snapshot, error)
	SetDefaultSectionVariant(ctx context.Context, projectID string, sectionID string, variantID string) (projectstate.Snapshot, error)
	SetGenCodePrefix(ctx context.Context, projectID string, genCodePrefix string) (projectstate.Snapshot, error)
	SetGenCodeSuffix(ctx context.Context, projectID string, genCodeSuffix string) (projectstate.Snapshot, error)
	SetProjectCodegenTargets(ctx context.Context, projectID string, targets []projectstate.ProjectCodegenTarget, validator projectstate.CodegenTargetValidator, pythonReconciler projectstate.PythonCodegenSectionReconciler) (projectstate.Snapshot, error)
	SetGroupOverflowMode(ctx context.Context, projectID string, sectionID string, overflowMode bool) (projectstate.Snapshot, error)
	SetSectionTagColor(ctx context.Context, projectID string, sectionID string, tagColor *string) (projectstate.Snapshot, error)
	SetSectionStyleColor(ctx context.Context, projectID string, sectionID string, styleColor *string) (projectstate.Snapshot, error)
	SetSectionParamFilter(ctx context.Context, projectID string, sectionID string, value string) (projectstate.Snapshot, error)
	SetMetaControlShowSectionTitle(ctx context.Context, projectID string, sectionID string, showSectionTitle bool) (projectstate.Snapshot, error)
	SetSectionVariant(ctx context.Context, projectID string, sectionID string, variantID string) (projectstate.Snapshot, error)
	SetSectionVariantSortOrder(ctx context.Context, projectID string, sectionID string, orderedVariantIDs []string) (projectstate.Snapshot, error)
	SetShowParamDisplayNames(ctx context.Context, projectID string, show bool) (projectstate.Snapshot, error)
	SetWatchCodeEnabled(ctx context.Context, projectID string, enabled bool, workspaceRoot string) (projectstate.Snapshot, error)
	SetWatchCodeInputs(ctx context.Context, projectID string, folders []projectstate.WatchCodeFolder, files []string, workspaceRoot string) (projectstate.Snapshot, error)
	CompareAndSetShowParamDisplayNames(ctx context.Context, projectID string, show bool, expectedOldValue *bool) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error)
	CompareAndSetWatchCodeEnabled(ctx context.Context, projectID string, enabled bool, workspaceRoot string, expectedOldValue *bool) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error)
	CompareAndSetWatchCodeFolders(ctx context.Context, projectID string, folders []projectstate.WatchCodeFolder, workspaceRoot string, expectedOldValue []projectstate.WatchCodeFolder) (projectstate.Snapshot, projectstate.CompareAndSetResult[[]projectstate.WatchCodeFolder], error)
	CompareAndSetWatchCodeFiles(ctx context.Context, projectID string, files []string, workspaceRoot string, expectedOldValue []string) (projectstate.Snapshot, projectstate.CompareAndSetResult[[]string], error)
	CompareAndSetAppDefinitionCatalogID(ctx context.Context, catalogID string, expectedOldValue *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error)
	CompareAndSetAppDefinitionSpecVersion(ctx context.Context, appSpecVersion string, expectedOldValue *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error)
	CompareAndSetAppDefinitionSpecPath(ctx context.Context, appSpecPath string, expectedOldValue *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error)
	CompareAndSetAppDefinitionThemeMode(ctx context.Context, themeMode string, expectedOldValue *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error)
	ToggleGroupOrientation(ctx context.Context, projectID string, sectionID string) (projectstate.Snapshot, error)
	TogglePositionLocks(ctx context.Context, projectID string, sectionIDs []string) (projectstate.Snapshot, error)
	ToggleMinimized(ctx context.Context, projectID string, sectionID string) (projectstate.Snapshot, error)
}

type codeUpdateProvider interface {
	SetCode(ctx context.Context, projectID string, sectionID string, code string) error
	FormatCode(ctx context.Context, projectID string, sectionID string) error
}

type settingsStateProvider interface {
	Snapshot() settingsstate.Snapshot
}

type sectionNameProvider interface {
	SetSectionName(ctx context.Context, projectID string, sectionID string, name string) error
}

type lspDiagnosticsProvider interface {
	Snapshot(projectID string) projectstate.LSPDiagnosticsPayload
	ReapplyCodeSectionIgnoreState(project projectstate.Project, sectionID string) error
}

type mcpStatusProvider interface {
	RuntimeStatuses() []ServerRuntimeStatus
}

type terminalHistoryProvider interface {
	History(sessionID string) (string, error)
}

type agentProfileProvider interface {
	List() ([]agentprofiles.Profile, error)
	Get(profileID string) (agentprofiles.Profile, error)
}

type agentRunProvider interface {
	Disabled() bool
	RunSubAgent(ctx context.Context, profile agentprofiles.Profile, inputs map[string]any) (agentruns.Run, error)
}

type stateMachineRunProvider interface {
	Disabled() bool
	ReportSignal(
		projectConfigID string,
		childRunID *string,
		machineRunID *string,
		sectionID *string,
		signalName string,
		payload map[string]any,
		shareSessionID *string,
	) (map[string]any, error)
}

type pluginMutationProvider interface {
	Runtime(options plugins.RuntimeOptions) (plugins.RuntimeResponse, error)
	Rescan() (plugins.DiscoverySnapshot, error)
	Install(ctx context.Context, options plugins.InstallOptions) (plugins.PluginInstallResult, error)
	Uninstall(ctx context.Context, options plugins.UninstallOptions) (plugins.PluginUninstallResult, error)
	Update(ctx context.Context, options plugins.UpdateOptions) (plugins.PluginUpdateResult, error)
	Rollback(ctx context.Context, options plugins.RollbackOptions) (plugins.PluginRollbackResult, error)
	WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResult, error)
}

type pythonPackageProvider interface {
	InstalledPackages(ctx context.Context) ([]string, error)
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
	"getInstalledPythonPackages":    {},
	"getProjectConfigNamesAndIds":   {},
	"get_app_catalog":               {},
	"get_mcp_server_runtime_status": {},
	"get_setta_docs":                {},
	"get_agent_profile":             {},
	"list_app_components":           {},
	"list_agent_profiles":           {},
	"list_mcp_tools":                {},
	"install_plugin":                {},
	"rollback_plugin":               {},
	"rescan_plugins":                {},
	"run_agent_profile":             {},
	"report_completion_status":      {},
	"search_mcp_tools":              {},
	"set_agentic_context":           {},
	"uninstall_plugin":              {},
	"update_plugin":                 {},
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
		pluginMutations:      opts.PluginMutations,
		pythonPackages:       opts.PythonPackages,
		lspDiagnostics:       opts.LSPDiagnostics,
		mcpStatuses:          opts.MCPStatuses,
		terminals:            opts.Terminals,
		agentProfiles:        opts.AgentProfiles,
		agentRuns:            opts.AgentRuns,
		uiSettingReveals:     opts.UISettingReveals,
		stateMachineRuns:     opts.StateMachineRuns,
		server:               server,
		agenticContextBySess: map[string]AgenticContext{},
	}
	if strings.TrimSpace(opts.DocsRoot) != "" {
		docsLoader, err := settadocs.NewLoader(opts.DocsRoot)
		if err != nil {
			return nil, err
		}
		instance.docs = docsLoader
	}
	if strings.TrimSpace(opts.TemporaryIDMapPath) != "" {
		temporaryIDs, err := NewTemporaryIDStore(opts.TemporaryIDMapPath)
		if err != nil {
			return nil, err
		}
		instance.temporaryIDs = temporaryIDs
	}

	searchEntries := []tools.SearchEntry{}
	for _, definition := range defaultToolDefinitions(
		instance,
		workspaceRoot,
		registry,
		opts.ProjectState,
		opts.CodegenTargetValidator,
		opts.PythonCodegenSectionReconciler,
		opts.CodeUpdates,
		opts.SettingsState,
		opts.SectionNames,
		opts.CallableSignatures,
		opts.LSPDiagnostics,
		opts.StateMachineRuns,
	) {
		registered, err := registry.Register(definition.Spec)
		if err != nil {
			return nil, err
		}
		instance.addTool(registered, definition.InputSchema, definition.OutputSchema)
		if registered.Metadata.Kind == tools.KindDiscoverable {
			searchEntries = append(searchEntries, tools.SearchEntry{
				Name:        registered.Name,
				Description: registered.Description,
				Metadata:    registered.Metadata,
				InputSchema: definition.InputSchema,
			})
		}
	}
	instance.searchEntries = append([]tools.SearchEntry(nil), searchEntries...)
	instance.toolSearch = tools.BuildSearchIndex(searchEntries)

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

func (s *Server) RegisterTool(registration ToolRegistration) (tools.Registered, error) {
	if s == nil {
		return tools.Registered{}, fmt.Errorf("mcpx: server is required")
	}

	registered, err := s.registry.Register(registration.Spec)
	if err != nil {
		return tools.Registered{}, err
	}

	s.addTool(registered, registration.InputSchema, registration.OutputSchema)
	if registered.Metadata.Kind == tools.KindDiscoverable {
		s.searchEntries = append(s.searchEntries, tools.SearchEntry{
			Name:        registered.Name,
			Description: registered.Description,
			Metadata:    registered.Metadata,
			InputSchema: registration.InputSchema,
		})
		s.toolSearch = tools.BuildSearchIndex(s.searchEntries)
	}
	return registered, nil
}

func (s *Server) RemoveTools(names ...string) {
	if s == nil || len(names) == 0 {
		return
	}

	normalizedNames := normalizeToolNames(names)
	if len(normalizedNames) == 0 {
		return
	}

	s.server.RemoveTools(normalizedNames...)
	s.registry.Remove(normalizedNames...)
	s.removeSearchEntries(normalizedNames)
}

func (s *Server) ReplaceTools(removeNames []string, registrations []ToolRegistration) error {
	if s == nil {
		return fmt.Errorf("mcpx: server is required")
	}

	normalizedRemoveNames := normalizeToolNames(removeNames)
	if err := s.validateToolReplacement(normalizedRemoveNames, registrations); err != nil {
		return err
	}

	s.RemoveTools(normalizedRemoveNames...)
	for _, registration := range registrations {
		if _, err := s.RegisterTool(registration); err != nil {
			return err
		}
	}
	return nil
}

func normalizeToolNames(names []string) []string {
	normalized := make([]string, 0, len(names))
	seen := map[string]struct{}{}
	for _, rawName := range names {
		name := strings.TrimSpace(rawName)
		if name == "" {
			continue
		}
		if _, exists := seen[name]; exists {
			continue
		}
		seen[name] = struct{}{}
		normalized = append(normalized, name)
	}
	return normalized
}

func (s *Server) validateToolReplacement(removeNames []string, registrations []ToolRegistration) error {
	if s == nil {
		return fmt.Errorf("mcpx: server is required")
	}

	removeNameSet := make(map[string]struct{}, len(removeNames))
	for _, name := range removeNames {
		removeNameSet[name] = struct{}{}
	}

	protectedNames := map[string]struct{}{}
	for _, registered := range s.registry.List() {
		if _, willRemove := removeNameSet[registered.Name]; willRemove {
			continue
		}
		protectedNames[registered.Name] = struct{}{}
	}

	newNames := map[string]struct{}{}
	for _, registration := range registrations {
		name := strings.TrimSpace(registration.Spec.Name)
		if name == "" {
			return tools.ErrToolNameRequired
		}
		if registration.Spec.Handler == nil {
			return tools.ErrToolHandlerNil
		}
		if _, err := registration.Spec.Metadata.Normalize(name); err != nil {
			return err
		}
		if _, exists := protectedNames[name]; exists {
			return fmt.Errorf("%w: %s", tools.ErrToolDuplicate, name)
		}
		if _, exists := newNames[name]; exists {
			return fmt.Errorf("%w: %s", tools.ErrToolDuplicate, name)
		}
		newNames[name] = struct{}{}
	}
	return nil
}

func (s *Server) removeSearchEntries(names []string) {
	if s == nil || len(names) == 0 {
		return
	}

	nameSet := make(map[string]struct{}, len(names))
	for _, name := range names {
		nameSet[name] = struct{}{}
	}

	filtered := make([]tools.SearchEntry, 0, len(s.searchEntries))
	for _, entry := range s.searchEntries {
		if _, exists := nameSet[entry.Name]; exists {
			continue
		}
		filtered = append(filtered, entry)
	}
	s.searchEntries = filtered
	s.toolSearch = tools.BuildSearchIndex(filtered)
}

func (s *Server) addTool(registered tools.Registered, inputSchema map[string]any, outputSchema map[string]any) {
	s.server.AddTool(&sdkmcp.Tool{
		Name:         registered.Name,
		Description:  registered.Description,
		InputSchema:  inputSchema,
		OutputSchema: normalizeSDKToolOutputSchema(outputSchema),
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

func normalizeSDKToolOutputSchema(outputSchema map[string]any) map[string]any {
	if schemaType, ok := outputSchema["type"].(string); ok && strings.TrimSpace(schemaType) == "object" {
		return outputSchema
	}
	return map[string]any{
		"type":                 "object",
		"additionalProperties": true,
	}
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
		runID, err := readOptionalStringArgument(arguments, "runId")
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
			RunID:                 runID,
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

		settings, err := resolveStructuralMutationSettings(settingsState)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}

		_, result, err := projectState.CreateTopLevelSection(ctx, projectConfigID, input, settings)
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

		settings, err := resolveStructuralMutationSettings(settingsState)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}

		_, result, err := projectState.CreateChildSections(ctx, projectConfigID, input, settings)
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

		settings, err := resolveStructuralMutationSettings(settingsState)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}

		_, result, err := projectState.CreateChildSectionsViaIncrementer(ctx, projectConfigID, input, settings)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
	}
}

func newSetCodeSectionAttachedTerminalHandler(projectState projectStateProvider, settingsState settingsStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		terminalSectionID, err := readOptionalNullableStringPointerArgument(arguments, "terminalSectionId")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural attached-terminal invocation context is unavailable.")
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

		if _, err := projectState.SetCodeSectionAttachedTerminal(ctx, projectConfigID, sectionID, terminalSectionID, settings); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
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

func newSetCallableHandler(projectState projectStateProvider, callableSignatures projectstate.CallableSignatureResolver) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		sectionID, err := readRequiredStringArgument(arguments, "sectionId")
		if err != nil {
			return nil, err
		}
		callableName, err := readRequiredRawStringArgument(arguments, "callableName")
		if err != nil {
			return nil, err
		}
		refetchParams, err := readRequiredBoolArgument(arguments, "refetchParams")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped callable invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		_, result, err := projectState.SetCallable(
			ctx,
			projectConfigID,
			sectionID,
			callableName,
			refetchParams,
			callableSignatures,
		)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
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
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		margin := 50
		if resolvedMargin, err := readOptionalIntArgument(arguments, "margin"); err != nil {
			return nil, err
		} else if resolvedMargin != nil {
			margin = *resolvedMargin
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural auto-layout invocation context is unavailable.")
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

		if _, err := projectState.AutoLayoutTopLevelSections(ctx, projectConfigID, settings, margin); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
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

func newSetWatchCodeEnabledHandler(projectState projectStateProvider, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		enabled, err := readRequiredBoolArgument(arguments, "enabled")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural watch-code invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetWatchCodeEnabled(ctx, projectConfigID, enabled, workspaceRoot); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newSetWatchCodeInputsHandler(projectState projectStateProvider, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		watchCodeFolders, err := readRequiredWatchCodeFoldersArgument(arguments, "watchCodeFolders")
		if err != nil {
			return nil, err
		}
		watchCodeFiles, err := readRequiredStringArrayArgument(arguments, "watchCodeFiles")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural watch-code inputs invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.SetWatchCodeInputs(ctx, projectConfigID, watchCodeFolders, watchCodeFiles, workspaceRoot); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newGetAppDefinitionHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state app-definition runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural app-definition invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		result, err := projectState.GetAppDefinition(ctx)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
	}
}

func newValidateAppDefinitionHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		appSpec, err := readRequiredObjectArgument(arguments, "appSpec")
		if err != nil {
			return nil, err
		}
		appSpecVersion, err := readOptionalNullableStringPointerArgument(arguments, "appSpecVersion")
		if err != nil {
			return nil, err
		}
		catalogID, err := readOptionalNullableStringPointerArgument(arguments, "catalogId")
		if err != nil {
			return nil, err
		}
		routes, err := readOptionalAppRoutesArgument(arguments, "routes")
		if err != nil {
			return nil, err
		}
		dataBindings, err := readOptionalObjectPointerArgument(arguments, "dataBindings")
		if err != nil {
			return nil, err
		}
		actions, err := readOptionalObjectPointerArgument(arguments, "actions")
		if err != nil {
			return nil, err
		}
		theme, err := readOptionalObjectPointerArgument(arguments, "theme")
		if err != nil {
			return nil, err
		}
		assets, err := readOptionalArrayPointerArgument(arguments, "assets")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state app-definition runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural app-definition invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		result, err := projectState.ValidateAppDefinition(ctx, projectstate.ValidateAppDefinitionInput{
			AppSpec:        appSpec,
			AppSpecVersion: appSpecVersion,
			CatalogID:      catalogID,
			Routes:         routes,
			DataBindings:   dataBindings,
			Actions:        actions,
			Theme:          theme,
			Assets:         assets,
		})
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
	}
}

func newSetAppDefinitionHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		appSpec, err := readRequiredObjectArgument(arguments, "appSpec")
		if err != nil {
			return nil, err
		}
		appSpecPath, err := readOptionalNullableStringPointerArgument(arguments, "appSpecPath")
		if err != nil {
			return nil, err
		}
		appSpecVersion, err := readOptionalNullableStringPointerArgument(arguments, "appSpecVersion")
		if err != nil {
			return nil, err
		}
		catalogID, err := readOptionalNullableStringPointerArgument(arguments, "catalogId")
		if err != nil {
			return nil, err
		}
		routes, err := readOptionalAppRoutesArgument(arguments, "routes")
		if err != nil {
			return nil, err
		}
		dataBindings, err := readOptionalObjectPointerArgument(arguments, "dataBindings")
		if err != nil {
			return nil, err
		}
		actions, err := readOptionalObjectPointerArgument(arguments, "actions")
		if err != nil {
			return nil, err
		}
		theme, err := readOptionalObjectPointerArgument(arguments, "theme")
		if err != nil {
			return nil, err
		}
		assets, err := readOptionalArrayPointerArgument(arguments, "assets")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural app-definition invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		_, result, err := projectState.SetAppDefinition(ctx, projectstate.SetAppDefinitionInput{
			AppSpec:        appSpec,
			AppSpecPath:    appSpecPath,
			AppSpecVersion: appSpecVersion,
			CatalogID:      catalogID,
			Routes:         routes,
			DataBindings:   dataBindings,
			Actions:        actions,
			Theme:          theme,
			Assets:         assets,
		})
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
	}
}

func newStreamAppDefinitionHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		patches, err := readRequiredRawStringArgument(arguments, "patches")
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(patches) == "" {
			return nil, newToolError("invalid_arguments", "patches must be non-empty.")
		}
		appSpecPath, err := readOptionalNullableStringPointerArgument(arguments, "appSpecPath")
		if err != nil {
			return nil, err
		}
		baseAppSpec, err := readOptionalObjectPointerArgument(arguments, "baseAppSpec")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural app-definition invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		_, result, err := projectState.StreamAppDefinition(ctx, projectstate.StreamAppDefinitionInput{
			Patches:     patches,
			AppSpecPath: appSpecPath,
			BaseAppSpec: baseAppSpec,
		})
		if err != nil {
			if errors.Is(err, projectstate.ErrAppSpecPatchInvalid) {
				return nil, newToolError("invalid_arguments", "Invalid patches payload: %s", err.Error())
			}
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
	}
}

func newUpdateAppDefinitionHandler(projectState projectStateProvider) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		patch, err := readRequiredPresentArgument(arguments, "patch")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural app-definition invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		_, result, err := projectState.UpdateAppDefinition(ctx, patch)
		if err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return result, nil
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

func newCompareAndSetWatchCodeEnabledHandler(projectState projectStateProvider, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		enabled, err := readRequiredBoolArgument(arguments, "enabled")
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
			return nil, newToolError("internal_error", "Structural compare-and-set watch-code invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, _, err := projectState.CompareAndSetWatchCodeEnabled(ctx, projectConfigID, enabled, workspaceRoot, expectedOldValue); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newCompareAndSetWatchCodeFoldersHandler(projectState projectStateProvider, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		watchCodeFolders, err := readRequiredWatchCodeFoldersArgument(arguments, "watchCodeFolders")
		if err != nil {
			return nil, err
		}
		expectedOldValue, err := readOptionalWatchCodeFoldersArgument(arguments, "expectedOldValue")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural compare-and-set watch-code folders invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, _, err := projectState.CompareAndSetWatchCodeFolders(ctx, projectConfigID, watchCodeFolders, workspaceRoot, expectedOldValue); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
	}
}

func newCompareAndSetWatchCodeFilesHandler(projectState projectStateProvider, workspaceRoot string) tools.Handler {
	return func(ctx context.Context, arguments map[string]any) (any, error) {
		projectConfigID, err := readRequiredStringArgument(arguments, "projectConfigId")
		if err != nil {
			return nil, err
		}
		watchCodeFiles, err := readRequiredStringArrayArgument(arguments, "watchCodeFiles")
		if err != nil {
			return nil, err
		}
		expectedOldValue, err := readOptionalStringArrayArgument(arguments, "expectedOldValue")
		if err != nil {
			return nil, err
		}
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Structural compare-and-set watch-code files invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, _, err := projectState.CompareAndSetWatchCodeFiles(ctx, projectConfigID, watchCodeFiles, workspaceRoot, expectedOldValue); err != nil {
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
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped param impl invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.ChangeParamImpl(ctx, projectConfigID, sectionID, paramInfoID, selectedID); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
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
		if projectState == nil {
			return nil, newToolError("internal_error", "Project-state mutation runtime is unavailable.")
		}

		invocation, ok := ToolInvocationFromContext(ctx)
		if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
			return nil, newToolError("internal_error", "Scoped param impl config invocation context is unavailable.")
		}
		if projectConfigID != invocation.AgenticContext.ProjectConfigID {
			return nil, newToolError(
				"invalid_arguments",
				"projectConfigId argument %q does not match agentic context projectConfigId %q.",
				projectConfigID,
				invocation.AgenticContext.ProjectConfigID,
			)
		}

		if _, err := projectState.UpdateParamImplConfig(ctx, projectConfigID, sectionID, paramInfoID, newConfig); err != nil {
			return nil, normalizeProjectStateMutationError(err)
		}
		return statusResult{Status: "ok"}, nil
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
	codegenTargetValidator projectstate.CodegenTargetValidator,
	pythonCodegenSectionReconciler projectstate.PythonCodegenSectionReconciler,
	codeUpdates codeUpdateProvider,
	settingsState settingsStateProvider,
	sectionNames sectionNameProvider,
	callableSignatures projectstate.CallableSignatureResolver,
	lspDiagnostics lspDiagnosticsProvider,
	stateMachineRuns stateMachineRunProvider,
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
					"runId": map[string]any{
						"type":        "string",
						"description": "Optional active child run id associated with the scoped tool session.",
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
		{
			Spec: tools.Spec{
				Name:        "search_mcp_tools",
				Description: "Return the MCP tools that best match a natural-language query.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: newSearchMCPToolsHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query": map[string]any{
						"type":        "string",
						"description": "Search query describing the MCP capability to find.",
					},
					"limit": map[string]any{
						"type":        "integer",
						"description": "Maximum number of matches to return; values less than 1 use the default size.",
					},
					"serverIds": map[string]any{
						"type":        "array",
						"description": "Optional MCP server ids used to scope results.",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"query"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"results": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"name":        map[string]any{"type": "string"},
								"description": map[string]any{"type": "string"},
								"category":    map[string]any{"type": "string"},
							},
							"required": []string{"name", "description"},
						},
					},
				},
				"required": []string{"results"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "get_mcp_server_runtime_status",
				Description: "Return runtime MCP connection status for every configured MCP server.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: newGetMCPServerRuntimeStatusHandler(server),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"servers": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"serverId":      map[string]any{"type": "string"},
								"state":         map[string]any{"type": "string"},
								"toolCount":     map[string]any{"type": "integer"},
								"lastError":     map[string]any{"type": "string"},
								"missingEnvVar": map[string]any{"type": "string"},
							},
							"required": []string{"serverId", "state", "toolCount"},
						},
					},
				},
				"required": []string{"servers"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "getProjectConfigNamesAndIds",
				Description: "Return metadata for every known project config.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: newGetProjectConfigNamesAndIDsHandler(projectState),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigs": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"name": map[string]any{"type": "string"},
								"id":   map[string]any{"type": "string"},
							},
							"required": []string{"name", "id"},
						},
					},
				},
				"required": []string{"projectConfigs"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "getInstalledPythonPackages",
				Description: "Return installed packages for the IDE Python interpreter as name=version strings.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: newGetInstalledPythonPackagesHandler(server),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"packages": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"packages"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "getTerminalOutput",
				Description: "Returns the history of outputs of a terminal.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeRead,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "terminal",
					SearchTags:     []string{"terminal", "history", "output", "shell"},
				},
				Handler: newGetTerminalOutputHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Top-level terminal section id whose buffered output should be returned.",
					},
				},
				"required": []string{"sectionId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
			},
		},
		{
			Spec: tools.Spec{
				Name:        "get_app_catalog",
				Description: "Return the JSON render catalog used for app generation.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "project",
					SearchTags:     []string{"app", "catalog", "components", "generation"},
				},
				Handler: newGetAppCatalogHandler(),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"catalog": map[string]any{
						"type": "object",
					},
				},
				"required": []string{"catalog"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "list_app_components",
				Description: "List the allowed component types for app generation.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "project",
					SearchTags:     []string{"app", "components", "catalog", "generation"},
				},
				Handler: newListAppComponentsHandler(),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"components": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"components"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "get_setta_docs",
				Description: "Return docs from the Setta docs directory.",
				Metadata: tools.Metadata{
					Kind:       tools.KindInit,
					AccessType: tools.AccessTypeRead,
				},
				Handler: newGetSettaDocsHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"docIds": map[string]any{
						"type":        "array",
						"description": "Optional doc ids or doc-relative paths to include; omit for the default listener-focused set.",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"docs": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"doc_id":  map[string]any{"type": "string"},
								"path":    map[string]any{"type": "string"},
								"content": map[string]any{"type": "string"},
							},
							"required": []string{"doc_id", "path", "content"},
						},
					},
					"available_docs": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"docs", "available_docs"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "report_completion_status",
				Description: "Report structured completion intent and verification evidence for the active task.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "agentic",
					SearchTags:     []string{"completion", "verification", "status", "checks", "task"},
				},
				Handler: newReportCompletionStatusHandler(),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"taskId": map[string]any{
						"type":        "string",
						"description": "Optional task identifier for the completion report.",
					},
					"completionIntent": map[string]any{
						"type":        "boolean",
						"description": "Whether the active task is intended to be complete.",
					},
					"requiresVerification": map[string]any{
						"type":        "boolean",
						"description": "Whether the task requires verification evidence before completion.",
					},
					"checkResults": map[string]any{
						"type":        "array",
						"description": "Optional verification checks to include in the report.",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"checkName": map[string]any{"type": "string"},
								"required":  map[string]any{"type": "boolean"},
								"status":    map[string]any{"type": "string"},
								"details":   map[string]any{"type": "string"},
								"source":    map[string]any{"type": "string"},
							},
							"required": []string{"checkName", "status"},
						},
					},
				},
				"required": []string{"completionIntent", "requiresVerification"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"taskId": map[string]any{
						"type": "string",
					},
					"completionIntent": map[string]any{
						"type": "boolean",
					},
					"requiresVerification": map[string]any{
						"type": "boolean",
					},
					"checkResults": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"checkName": map[string]any{"type": "string"},
								"required":  map[string]any{"type": "boolean"},
								"status":    map[string]any{"type": "string"},
								"details":   map[string]any{"type": "string"},
								"source":    map[string]any{"type": "string"},
							},
							"required": []string{"checkName", "required", "status"},
						},
					},
					"verificationStatus": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"completionIntent", "requiresVerification", "checkResults", "verificationStatus"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "report_state_machine_signal",
				Description: "Report a structured signal from the active child workflow chat into its parent state machine.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "agentic",
					SearchTags:     []string{"workflow", "state", "machine", "signal", "chat"},
				},
				Handler: newReportStateMachineSignalHandler(stateMachineRuns),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"signalName": map[string]any{
						"type":        "string",
						"description": "Structured signal name reported from the active workflow child chat.",
					},
					"payload": map[string]any{
						"type":        "object",
						"description": "Optional structured signal payload used by workflow edge filters.",
					},
					"machineRunId": map[string]any{
						"type":        "string",
						"description": "Optional workflow parent run id to assert while reporting the signal.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Optional workflow chat section id when no active chat section is available in the agentic context.",
					},
				},
				"required": []string{"signalName"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"status": map[string]any{
						"type": "string",
					},
					"signalEventId": map[string]any{
						"type": "string",
					},
					"machineRunId": map[string]any{
						"type": "string",
					},
					"childRunId": map[string]any{
						"type": "string",
					},
					"sourceSectionId": map[string]any{
						"type": "string",
					},
					"signalName": map[string]any{
						"type": "string",
					},
					"sourceActivationCount": map[string]any{
						"type": "integer",
					},
				},
				"required": []string{"status", "signalEventId", "machineRunId", "childRunId", "sourceSectionId", "signalName", "sourceActivationCount"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "list_agent_profiles",
				Description: "List the stored agent profiles available in the workspace.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeRead,
					SearchCategory: "agentic",
					SearchTags:     []string{"agent", "profile", "profiles", "workspace"},
				},
				Handler: newListAgentProfilesHandler(server),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"profiles": map[string]any{
						"type":  "array",
						"items": agentProfileSchema(),
					},
				},
				"required": []string{"profiles"},
			},
		},
		{
			Spec: tools.Spec{
				Name:        "get_agent_profile",
				Description: "Return a stored agent profile by id.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeRead,
					SearchCategory: "agentic",
					SearchTags:     []string{"agent", "profile", "lookup", "workspace"},
				},
				Handler: newGetAgentProfileHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"profileId": map[string]any{
						"type":        "string",
						"description": "Stored agent profile id to fetch.",
					},
				},
				"required": []string{"profileId"},
			},
			OutputSchema: agentProfileSchema(),
		},
		{
			Spec: tools.Spec{
				Name:        "run_agent_profile",
				Description: "Start a managed agent run using the specified stored profile and return the final persisted run.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "agentic",
					SearchTags:     []string{"agent", "profile", "run", "managed", "execute"},
				},
				Handler: newRunAgentProfileHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"profileId": map[string]any{
						"type":        "string",
						"description": "Stored agent profile id to execute.",
					},
					"inputs": map[string]any{
						"type":        "object",
						"description": "Optional managed-run input payload passed through to the agent run service.",
					},
				},
				"required": []string{"profileId"},
			},
			OutputSchema: agentRunSchema(),
		},
		{
			Spec: tools.Spec{
				Name:        "install_plugin",
				Description: "Install a plugin from a GitHub or PyPI source spec.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "plugins",
					SearchTags:     []string{"plugin", "install", "github", "pypi", "structural"},
				},
				Handler: newInstallPluginHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sourceSpec": map[string]any{
						"type":        "string",
						"description": "Plugin source spec such as github:owner/repo#ref or pypi:package==version.",
					},
					"scope":     pluginScopeSchema(),
					"installer": pluginInstallerSchema(),
					"enable": map[string]any{
						"type":        "boolean",
						"description": "Whether the plugin should be enabled immediately after install. Defaults to true.",
					},
					"force": map[string]any{
						"type":        "boolean",
						"description": "Whether an existing managed install target may be overwritten. Defaults to false.",
					},
				},
				"required": []string{"sourceSpec"},
			},
			OutputSchema: pluginInstallResponseSchema(),
		},
		{
			Spec: tools.Spec{
				Name:        "uninstall_plugin",
				Description: "Uninstall a managed plugin by id.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "plugins",
					SearchTags:     []string{"plugin", "uninstall", "remove", "structural"},
				},
				Handler: newUninstallPluginHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"pluginId": map[string]any{
						"type":        "string",
						"description": "Installed plugin id to remove.",
					},
					"scope": pluginScopeSchema(),
				},
				"required": []string{"pluginId"},
			},
			OutputSchema: pluginUninstallResponseSchema(),
		},
		{
			Spec: tools.Spec{
				Name:        "rescan_plugins",
				Description: "Rescan the managed plugin directories and return aggregate installed and active counts.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "plugins",
					SearchTags:     []string{"plugin", "rescan", "refresh", "structural"},
				},
				Handler: newRescanPluginsHandler(server),
			},
			InputSchema: map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			OutputSchema: pluginsRescanResponseSchema(),
		},
		{
			Spec: tools.Spec{
				Name:        "update_plugin",
				Description: "Update a managed plugin to the latest source target or to an explicit requested version/ref.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "plugins",
					SearchTags:     []string{"plugin", "update", "upgrade", "structural"},
				},
				Handler: newUpdatePluginHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"pluginId": map[string]any{
						"type":        "string",
						"description": "Installed plugin id to update.",
					},
					"scope": pluginScopeSchema(),
					"to": map[string]any{
						"type":        "string",
						"description": "Optional explicit version, ref, or fully qualified source target.",
					},
				},
				"required": []string{"pluginId"},
			},
			OutputSchema: pluginUpdateResponseSchema(),
		},
		{
			Spec: tools.Spec{
				Name:        "rollback_plugin",
				Description: "Restore a managed plugin from its most recent saved rollback snapshot.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "plugins",
					SearchTags:     []string{"plugin", "rollback", "restore", "structural"},
				},
				Handler: newRollbackPluginHandler(server),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"pluginId": map[string]any{
						"type":        "string",
						"description": "Installed plugin id to restore.",
					},
					"scope": pluginScopeSchema(),
				},
				"required": []string{"pluginId"},
			},
			OutputSchema: pluginRollbackResponseSchema(),
		},
	}

	if projectState != nil {
		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "search_ui_settings",
				Description: "Search canonical UI settings, including schema-backed plugin settings, by natural-language query.",
				Metadata: tools.Metadata{
					Kind:                          tools.KindDiscoverable,
					AccessType:                    tools.AccessTypeRead,
					DefaultTargetSingletonSection: "GlobalVariables",
					SearchCategory:                "project",
					SearchTags:                    []string{"ui", "settings", "discover"},
				},
				Handler: newSearchUISettingsHandler(projectState, server.pluginMutations, workspaceRoot),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Canonical project config id whose UI settings should be searched.",
					},
					"query": map[string]any{
						"type":        "string",
						"description": "Natural-language query used to rank UI settings.",
					},
					"limit": map[string]any{
						"type":        "integer",
						"description": "Optional maximum number of results to return.",
					},
					"sourceFilter": map[string]any{
						"type":        "string",
						"description": "Optional source filter: core, plugin, or all.",
					},
				},
				"required": []string{"projectConfigId", "query"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"results": map[string]any{
						"type":  "array",
						"items": uiSettingSummarySchema(),
					},
				},
				"required": []string{"results"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "get_ui_setting_value",
				Description: "Read the current value for a canonical UI setting id.",
				Metadata: tools.Metadata{
					Kind:                          tools.KindDiscoverable,
					AccessType:                    tools.AccessTypeRead,
					DefaultTargetSingletonSection: "GlobalVariables",
					SearchCategory:                "project",
					SearchTags:                    []string{"ui", "settings", "read"},
				},
				Handler: newGetUISettingValueHandler(projectState, server.pluginMutations, workspaceRoot),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Canonical project config id whose UI setting should be read.",
					},
					"settingId": map[string]any{
						"type":        "string",
						"description": "Canonical UI setting id to read.",
					},
				},
				"required": []string{"projectConfigId", "settingId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"setting": uiSettingSummarySchema(),
					"value":   map[string]any{},
					"error":   uiSettingErrorSchema(),
				},
				"required": []string{"value"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "reveal_ui_setting",
				Description: "Open the UI pane/tab for a canonical UI setting and highlight its control.",
				Metadata: tools.Metadata{
					Kind:                          tools.KindDiscoverable,
					AccessType:                    tools.AccessTypeRead,
					DefaultTargetSingletonSection: "GlobalVariables",
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionIdToActivate"},
					},
					SearchCategory: "project",
					SearchTags:     []string{"ui", "settings", "reveal", "highlight"},
				},
				Handler: newRevealUISettingHandler(server, workspaceRoot),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Canonical project config id whose UI setting should be revealed.",
					},
					"settingId": map[string]any{
						"type":        "string",
						"description": "Canonical UI setting id to reveal.",
					},
					"sectionIdToActivate": map[string]any{
						"type":        "string",
						"description": "Optional section id to activate before revealing right-pane settings.",
					},
					"durationMs": map[string]any{
						"type":        "integer",
						"description": "Optional highlight duration in milliseconds.",
					},
				},
				"required": []string{"projectConfigId", "settingId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"requestId": map[string]any{
						"type": "string",
					},
					"projectConfigId": map[string]any{
						"type": "string",
					},
					"durationMs": map[string]any{
						"type": "integer",
					},
					"emittedRevealCount": map[string]any{
						"type": "integer",
					},
					"statuses": map[string]any{
						"type":  "array",
						"items": uiSettingRevealStatusSchema(),
					},
				},
				"required": []string{"requestId", "projectConfigId", "durationMs", "emittedRevealCount", "statuses"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_ui_setting_value",
				Description: "Set a canonical UI setting value using compare-and-set style write protection.",
				Metadata: tools.Metadata{
					Kind:                          tools.KindDiscoverable,
					AccessType:                    tools.AccessTypeWrite,
					DefaultTargetSingletonSection: "GlobalVariables",
					SearchCategory:                "project",
					SearchTags:                    []string{"ui", "settings", "write", "mutate"},
				},
				Handler: newSetUISettingValueHandler(projectState, server.pluginMutations, workspaceRoot),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Canonical project config id whose UI setting should be written.",
					},
					"settingId": map[string]any{
						"type":        "string",
						"description": "Canonical UI setting id to write.",
					},
					"value": map[string]any{
						"description": "New JSON value to persist for the setting.",
					},
				},
				"required": []string{"projectConfigId", "settingId", "value"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"setting":         uiSettingSummarySchema(),
					"oldValue":        map[string]any{},
					"newValue":        map[string]any{},
					"normalizedValue": map[string]any{},
					"changed": map[string]any{
						"type": "boolean",
					},
					"error": uiSettingErrorSchema(),
				},
				"required": []string{"oldValue", "newValue", "normalizedValue", "changed"},
			},
		})

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
				Name:        "set_code_section_attached_terminal",
				Description: "Attach a top-level terminal to a code section, or detach the current attached terminal by passing null.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId", "terminalSectionId"},
					},
					SearchCategory: "layout",
					SearchTags:     []string{"terminal", "attached", "code", "section", "structural"},
				},
				Handler: newSetCodeSectionAttachedTerminalHandler(projectState, settingsState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose code section attachment should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Code section id whose attached terminal should be updated.",
					},
					"terminalSectionId": map[string]any{
						"type":        []string{"string", "null"},
						"description": "Terminal section id to attach, or null to detach the current attached terminal.",
					},
				},
				"required": []string{"projectConfigId", "sectionId"},
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

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_section_variant",
				Description: "Switch a section to a specific existing variant.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection:        {"sectionId"},
						tools.IDTypeSectionVariant: {"variantId"},
					},
					SearchCategory: "sections",
					SearchTags:     []string{"section", "variant", "active", "select", "write"},
				},
				Handler: newSetSectionVariantHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose section variant should be switched.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id whose active variant should be updated.",
					},
					"variantId": map[string]any{
						"type":        "string",
						"description": "Existing variant id that should become active for the section.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "variantId"},
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
				Name:        "set_default_section_variant",
				Description: "Change which existing variant is treated as the default for a section.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection:        {"sectionId"},
						tools.IDTypeSectionVariant: {"variantId"},
					},
					SearchCategory: "sections",
					SearchTags:     []string{"section", "variant", "default", "select", "write"},
				},
				Handler: newSetDefaultSectionVariantHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose section default variant should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id whose default variant should be updated.",
					},
					"variantId": map[string]any{
						"type":        "string",
						"description": "Existing variant id that should become the default for the section.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "variantId"},
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
				Name:        "set_section_variant_sort_order",
				Description: "Persist the complete ordered list of variants for a section.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection:        {"sectionId"},
						tools.IDTypeSectionVariant: {"orderedVariantIds"},
					},
					SearchCategory: "sections",
					SearchTags:     []string{"section", "variant", "sort", "order", "write"},
				},
				Handler: newSetSectionVariantSortOrderHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose section variant order should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id whose complete variant ordering should be updated.",
					},
					"orderedVariantIds": map[string]any{
						"type":        "array",
						"description": "Complete list of existing variant ids in the desired order.",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"projectConfigId", "sectionId", "orderedVariantIds"},
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
				Name:        "set_top_level_section_layout",
				Description: "Persist layout coordinates for top-level sections in the active view mode.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"topLevelSections"},
					},
					SearchCategory: "layout",
					SearchTags:     []string{"layout", "top-level", "sections", "position", "structural"},
				},
				Handler: newSetTopLevelSectionLayoutHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose active view-mode top-level layout should be updated.",
					},
					"topLevelSections": map[string]any{
						"type":        "object",
						"description": "Section-id keyed top-level layout map to persist for the active view mode.",
						"additionalProperties": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"x": map[string]any{
									"type": "number",
								},
								"y": map[string]any{
									"type": "number",
								},
								"zIndex": map[string]any{
									"type": "integer",
								},
								"w": map[string]any{
									"type": "number",
								},
								"h": map[string]any{
									"type": "number",
								},
							},
							"required": []string{"x", "y"},
						},
					},
				},
				"required": []string{"projectConfigId", "topLevelSections"},
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
				Name:        "set_section_sizes",
				Description: "Persist normalized width and height settings for one or more sections.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionSizes"},
					},
					SearchCategory: "layout",
					SearchTags:     []string{"layout", "resize", "size", "section", "structural"},
				},
				Handler: newSetSectionSizesHandler(projectState, settingsState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose section sizes should be updated.",
					},
					"sectionSizes": map[string]any{
						"type":        "object",
						"description": "Section-id keyed size map to normalize and persist.",
						"additionalProperties": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"width": map[string]any{
									"type":        []string{"number", "string"},
									"description": "Numeric width in pixels or the literal string 'auto'.",
								},
								"height": map[string]any{
									"type":        []string{"number", "string"},
									"description": "Numeric height in pixels or the literal string 'auto'.",
								},
							},
							"required": []string{"width", "height"},
						},
					},
				},
				"required": []string{"projectConfigId", "sectionSizes"},
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
				Name:        "set_group_overflow_mode",
				Description: "Enable or disable overflow mode for a Group section without changing its size.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "layout",
					SearchTags:     []string{"layout", "group", "overflow", "section", "structural"},
				},
				Handler: newSetGroupOverflowModeHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose Group overflow mode should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Group section id whose overflow mode should be updated.",
					},
					"overflowMode": map[string]any{
						"type":        "boolean",
						"description": "Boolean overflow-mode value to persist for the targeted Group section.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "overflowMode"},
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
				Name:        "auto_layout_top_level_sections",
				Description: "Automatically repack top-level sections in the active view mode using the Go auto-layout runtime.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "layout",
					SearchTags:     []string{"layout", "auto", "pack", "top-level", "sections", "structural"},
				},
				Handler: newAutoLayoutTopLevelSectionsHandler(projectState, settingsState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose active view-mode top-level sections should be auto laid out.",
					},
					"margin": map[string]any{
						"type":        "integer",
						"description": "Optional packing margin applied around each section; defaults to 50 when omitted.",
						"default":     50,
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
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_show_param_display_names",
				Description: "Toggle whether parameter display names are shown across the active project view.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "layout",
					SearchTags:     []string{"layout", "presentation", "params", "display", "structural"},
				},
				Handler: newSetShowParamDisplayNamesHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose parameter display-name visibility should be updated.",
					},
					"showParamDisplayNames": map[string]any{
						"type":        "boolean",
						"description": "True to show parameter display names, false to show canonical parameter names.",
					},
				},
				"required": []string{"projectConfigId", "showParamDisplayNames"},
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
				Name:        "set_watch_code_enabled",
				Description: "Enable or disable Watch Code for the active project and baseline existing watched inputs when enabling.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "project",
					SearchTags:     []string{"watch", "code", "project", "structural"},
				},
				Handler: newSetWatchCodeEnabledHandler(projectState, workspaceRoot),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose Watch Code setting should be updated.",
					},
					"enabled": map[string]any{
						"type":        "boolean",
						"description": "True to enable Watch Code and baseline existing watched inputs; false to disable it.",
					},
				},
				"required": []string{"projectConfigId", "enabled"},
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
				Name:        "set_watch_code_inputs",
				Description: "Update Watch Code folders/files for the active project and baseline only new inputs when Watch Code is already enabled.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "project",
					SearchTags:     []string{"watch", "code", "inputs", "files", "folders", "project", "structural"},
				},
				Handler: newSetWatchCodeInputsHandler(projectState, workspaceRoot),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose Watch Code folders and files should be updated.",
					},
					"watchCodeFolders": map[string]any{
						"type":        "array",
						"description": "Folder inputs for Watch Code, each with a repo-relative path and recursive flag.",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"path": map[string]any{
									"type":        "string",
									"description": "Repo-relative folder path to watch.",
								},
								"recursive": map[string]any{
									"type":        "boolean",
									"description": "Whether Watch Code should scan this folder recursively.",
								},
							},
							"required": []string{"path", "recursive"},
						},
					},
					"watchCodeFiles": map[string]any{
						"type":        "array",
						"description": "Repo-relative file paths Watch Code should track explicitly.",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"projectConfigId", "watchCodeFolders", "watchCodeFiles"},
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
				Name:        "get_app_definition",
				Description: "Fetch the stored app UI spec and document-level app-definition metadata for the active project.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "ui", "read", "structural"},
				},
				Handler: newGetAppDefinitionHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose document-level app definition should be read.",
					},
				},
				"required": []string{"projectConfigId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"appSpec": map[string]any{
						"description": "Stored JSON Render app spec, or null when no spec is configured or stored.",
					},
					"appDefinition": map[string]any{
						"type":        "object",
						"description": "Current document-level app-definition metadata, or null when none is configured.",
					},
				},
				"required": []string{"appSpec"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "validate_app_definition",
				Description: "Validate an app spec and optional app-definition metadata overrides without persisting them.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "validate", "diagnostics", "structural"},
				},
				Handler: newValidateAppDefinitionHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose app definition should be validated.",
					},
					"appSpec": map[string]any{
						"type":        "object",
						"description": "Full JSON Render app spec to validate.",
					},
					"appSpecVersion": map[string]any{
						"type":        "string",
						"description": "Optional app-spec version override used only for validation and capabilities.",
					},
					"catalogId": map[string]any{
						"type":        "string",
						"description": "Optional app catalog id override used only for validation and capabilities.",
					},
					"routes": map[string]any{
						"type":        "array",
						"description": "Optional app routes metadata to validate alongside the app definition.",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"path": map[string]any{
									"type": "string",
								},
								"name": map[string]any{
									"type": "string",
								},
								"rootKey": map[string]any{
									"type": "string",
								},
							},
							"required": []string{"path"},
						},
					},
					"dataBindings": map[string]any{
						"type":        "object",
						"description": "Optional app data-binding overrides to validate.",
					},
					"actions": map[string]any{
						"type":        "object",
						"description": "Optional app action-definition overrides to validate.",
					},
					"theme": map[string]any{
						"type":        "object",
						"description": "Optional app theme overrides to validate.",
					},
					"assets": map[string]any{
						"type":        "array",
						"description": "Optional asset list overrides to validate.",
					},
				},
				"required": []string{"projectConfigId", "appSpec"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"errors": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
						},
					},
					"warnings": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
						},
					},
					"capabilities": map[string]any{
						"type": "object",
					},
				},
				"required": []string{"errors", "warnings", "capabilities"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "set_app_definition",
				Description: "Replace the stored app UI spec and optionally update persisted app-definition metadata.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "ui", "structural"},
				},
				Handler: newSetAppDefinitionHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose document-level app definition should be replaced.",
					},
					"appSpec": map[string]any{
						"type":        "object",
						"description": "Full JSON Render app spec to persist.",
					},
					"appSpecPath": map[string]any{
						"type":        "string",
						"description": "Optional app-spec file path. Defaults to the existing configured path or app_specs/app.json.",
					},
					"appSpecVersion": map[string]any{
						"type":        "string",
						"description": "Optional app-spec version metadata to persist alongside the spec.",
					},
					"catalogId": map[string]any{
						"type":        "string",
						"description": "Optional app catalog id to persist alongside the spec.",
					},
					"routes": map[string]any{
						"type":        "array",
						"description": "Optional app routes metadata to persist with the definition.",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"path": map[string]any{
									"type": "string",
								},
								"name": map[string]any{
									"type": "string",
								},
								"rootKey": map[string]any{
									"type": "string",
								},
							},
							"required": []string{"path"},
						},
					},
					"dataBindings": map[string]any{
						"type":        "object",
						"description": "Optional app data-binding metadata to persist.",
					},
					"actions": map[string]any{
						"type":        "object",
						"description": "Optional app action-definition metadata to persist.",
					},
					"theme": map[string]any{
						"type":        "object",
						"description": "Optional app theme metadata to persist.",
					},
					"assets": map[string]any{
						"type":        "array",
						"description": "Optional app asset metadata to persist.",
					},
				},
				"required": []string{"projectConfigId", "appSpec"},
			},
			OutputSchema: map[string]any{
				"type": "object",
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "stream_app_definition",
				Description: "Persist an app spec by applying newline-delimited JSON Pointer patch operations to a base or stored app definition.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
						TargetIDPathsByType: map[tools.IDType][]string{},
						PreviewValuePath:    "patches",
						PreviewKind:         tools.PreviewKindAppSpecPatch,
					},
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "stream", "patch", "structural"},
				},
				Handler: newStreamAppDefinitionHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose app definition should be streamed and persisted.",
					},
					"patches": map[string]any{
						"type":        "string",
						"description": "Newline-delimited JSON patch operations using the bounded /root and /elements/... pointer format.",
					},
					"appSpecPath": map[string]any{
						"type":        "string",
						"description": "Optional app-spec file path override. Defaults to the existing configured path or app_specs/app.json.",
					},
					"baseAppSpec": map[string]any{
						"type":        "object",
						"description": "Optional base app spec object to patch instead of the currently stored spec.",
					},
				},
				"required": []string{"projectConfigId", "patches"},
			},
			OutputSchema: map[string]any{
				"type": "object",
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "update_app_definition",
				Description: "Apply a JSON merge patch to the stored app UI spec for the active project.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "app",
					SearchTags:     []string{"app", "definition", "spec", "patch", "structural"},
				},
				Handler: newUpdateAppDefinitionHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose stored app spec should be patched.",
					},
					"patch": map[string]any{
						"description": "JSON merge patch to apply to the stored app spec. May be any JSON value.",
					},
				},
				"required": []string{"projectConfigId", "patch"},
			},
			OutputSchema: map[string]any{
				"type": "object",
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "compare_and_set_show_param_display_names",
				Description: "Update parameter display-name visibility only if the caller's optional expectedOldValue still matches the current project setting.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "layout",
					SearchTags:     []string{"layout", "presentation", "params", "display", "structural", "compare-and-set"},
				},
				Handler: newCompareAndSetShowParamDisplayNamesHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose parameter display-name visibility should be compare-and-set updated.",
					},
					"showParamDisplayNames": map[string]any{
						"type":        "boolean",
						"description": "True to show parameter display names, false to show canonical parameter names.",
					},
					"expectedOldValue": map[string]any{
						"type":        "boolean",
						"description": "Optional precondition. When provided, the mutation fails with mutation_failed unless the current stored value still matches this boolean.",
					},
				},
				"required": []string{"projectConfigId", "showParamDisplayNames"},
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
				Name:        "compare_and_set_watch_code_enabled",
				Description: "Enable or disable Watch Code only if the caller's optional expectedOldValue still matches the current project setting.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "project",
					SearchTags:     []string{"watch", "code", "project", "structural", "compare-and-set"},
				},
				Handler: newCompareAndSetWatchCodeEnabledHandler(projectState, workspaceRoot),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose Watch Code enabled setting should be compare-and-set updated.",
					},
					"enabled": map[string]any{
						"type":        "boolean",
						"description": "True to enable Watch Code and baseline existing watched inputs; false to disable it.",
					},
					"expectedOldValue": map[string]any{
						"type":        "boolean",
						"description": "Optional precondition. When provided, the mutation fails with mutation_failed unless the current stored value still matches this boolean.",
					},
				},
				"required": []string{"projectConfigId", "enabled"},
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
				Name:        "compare_and_set_watch_code_folders",
				Description: "Update Watch Code folders only if the caller's optional expectedOldValue still matches the current stored folder list.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "project",
					SearchTags:     []string{"watch", "code", "folders", "project", "structural", "compare-and-set"},
				},
				Handler: newCompareAndSetWatchCodeFoldersHandler(projectState, workspaceRoot),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose Watch Code folder inputs should be compare-and-set updated.",
					},
					"watchCodeFolders": map[string]any{
						"type":        "array",
						"description": "Folder inputs for Watch Code, each with a repo-relative path and recursive flag.",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"path": map[string]any{
									"type":        "string",
									"description": "Repo-relative folder path to watch.",
								},
								"recursive": map[string]any{
									"type":        "boolean",
									"description": "Whether Watch Code should scan this folder recursively.",
								},
							},
							"required": []string{"path", "recursive"},
						},
					},
					"expectedOldValue": map[string]any{
						"type":        "array",
						"description": "Optional precondition. When provided, the mutation fails with mutation_failed unless the current stored folder list still matches this array exactly.",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"path": map[string]any{
									"type": "string",
								},
								"recursive": map[string]any{
									"type": "boolean",
								},
							},
							"required": []string{"path", "recursive"},
						},
					},
				},
				"required": []string{"projectConfigId", "watchCodeFolders"},
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
				Name:        "compare_and_set_watch_code_files",
				Description: "Update Watch Code files only if the caller's optional expectedOldValue still matches the current stored file list.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "project",
					SearchTags:     []string{"watch", "code", "files", "project", "structural", "compare-and-set"},
				},
				Handler: newCompareAndSetWatchCodeFilesHandler(projectState, workspaceRoot),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose Watch Code file inputs should be compare-and-set updated.",
					},
					"watchCodeFiles": map[string]any{
						"type":        "array",
						"description": "Repo-relative file paths for Watch Code inputs.",
						"items": map[string]any{
							"type": "string",
						},
					},
					"expectedOldValue": map[string]any{
						"type":        "array",
						"description": "Optional precondition. When provided, the mutation fails with mutation_failed unless the current stored file list still matches this array exactly.",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"projectConfigId", "watchCodeFiles"},
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
				Name:        "set_project_config_codegen_targets",
				Description: "Update the ordered codegen target list for the active project config using the existing Go validator and generated-section reconciler.",
				Metadata: tools.Metadata{
					Kind:           tools.KindDiscoverable,
					AccessType:     tools.AccessTypeStructural,
					SearchCategory: "project",
					SearchTags:     []string{"codegen", "targets", "project", "python", "plugin", "structural"},
				},
				Handler: newSetProjectConfigCodegenTargetsHandler(projectState, codegenTargetValidator, pythonCodegenSectionReconciler),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose ordered codegen target list should be updated.",
					},
					"codegenTargets": map[string]any{
						"type":        "array",
						"description": "Ordered codegen target objects to persist on the project config.",
						"items": map[string]any{
							"type":                 "object",
							"additionalProperties": true,
							"properties": map[string]any{
								"language": map[string]any{
									"type":        "string",
									"description": "Codegen target language id, such as python or a registered plugin target id.",
								},
							},
							"required": []string{"language"},
						},
					},
				},
				"required": []string{"projectConfigId", "codegenTargets"},
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
				Name:        "set_gen_code_prefix",
				Description: "Update the text prepended to generated Python code for the active project config.",
				Metadata: tools.Metadata{
					Kind:                          tools.KindDiscoverable,
					AccessType:                    tools.AccessTypeWrite,
					DefaultTargetSingletonSection: "GenPythonCode",
					SearchCategory:                "codegen",
					SearchTags:                    []string{"codegen", "python", "generated", "prefix", "write"},
				},
				Handler: newSetGenCodePrefixHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose generated Python prefix should be updated.",
					},
					"genCodePrefix": map[string]any{
						"type":        "string",
						"description": "Arbitrary text inserted before the generated Python body.",
					},
				},
				"required": []string{"projectConfigId", "genCodePrefix"},
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
				Name:        "set_gen_code_suffix",
				Description: "Update the text appended after generated Python code for the active project config.",
				Metadata: tools.Metadata{
					Kind:                          tools.KindDiscoverable,
					AccessType:                    tools.AccessTypeWrite,
					DefaultTargetSingletonSection: "GenPythonCode",
					SearchCategory:                "codegen",
					SearchTags:                    []string{"codegen", "python", "generated", "suffix", "write"},
				},
				Handler: newSetGenCodeSuffixHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose generated Python suffix should be updated.",
					},
					"genCodeSuffix": map[string]any{
						"type":        "string",
						"description": "Arbitrary text inserted after the generated Python body.",
					},
				},
				"required": []string{"projectConfigId", "genCodeSuffix"},
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
				Name:        "toggle_position_locks",
				Description: "Flip whether one or more sections have locked positions and sizes.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionIds"},
					},
					SearchCategory: "layout",
					SearchTags:     []string{"layout", "presentation", "lock", "position", "sections", "structural"},
				},
				Handler: newTogglePositionLocksHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose section layout locks should be toggled.",
					},
					"sectionIds": map[string]any{
						"type":        "array",
						"description": "Section ids whose position-and-size lock flag should be flipped.",
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
					"status": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"status"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "toggle_minimized",
				Description: "Expand or collapse a section panel within the project workspace.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "layout",
					SearchTags:     []string{"layout", "presentation", "minimize", "collapse", "section", "structural"},
				},
				Handler: newToggleMinimizedHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose section minimized state should be toggled.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id whose minimized state should be flipped.",
					},
				},
				"required": []string{"projectConfigId", "sectionId"},
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
				Name:        "toggle_group_orientation",
				Description: "Flip a Group section between vertical and horizontal child orientation.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeStructural,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "layout",
					SearchTags:     []string{"layout", "group", "orientation", "section", "structural"},
				},
				Handler: newToggleGroupOrientationHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose Group orientation should be toggled.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Group section id whose orientation should be flipped.",
					},
				},
				"required": []string{"projectConfigId", "sectionId"},
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
				Name:        "set_callable",
				Description: "Select the active callable for a callable section and optionally refetch its params.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
						TargetIDPathsByType: map[tools.IDType][]string{
							tools.IDTypeSection: {"sectionId"},
						},
						PreviewValuePath: "callableName",
						PreviewKind:      tools.PreviewKindCallableName,
					},
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeCodeObject: {"callableId", "childCodeObjs.codeObjId"},
					},
					SearchCategory: "code",
					SearchTags:     []string{"callable", "function", "signature", "params", "bind"},
				},
				Handler: newSetCallableHandler(projectState, callableSignatures),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose callable section should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Callable section id whose active callable should be updated.",
					},
					"callableName": map[string]any{
						"type":        "string",
						"description": "Callable name to select; pass an empty string to clear the current callable.",
					},
					"refetchParams": map[string]any{
						"type":        "boolean",
						"description": "When true, refetch callable params from the configured signature-help resolver.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "callableName", "refetchParams"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"callableId": map[string]any{
						"type": []string{"string", "null"},
					},
					"childCodeObjs": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"codeObjId": map[string]any{
									"type": "string",
								},
								"name": map[string]any{
									"type": "string",
								},
							},
							"required": []string{"codeObjId", "name"},
						},
					},
					"lspStatus": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"callableId", "childCodeObjs", "lspStatus"},
			},
		})

		if codeUpdates != nil {
			definitions = append(definitions, toolDefinition{
				Spec: tools.Spec{
					Name:        "set_code",
					Description: "Replace the inline code for the targeted code section.",
					Metadata: tools.Metadata{
						Kind:       tools.KindDiscoverable,
						AccessType: tools.AccessTypeWrite,
						IDPathsByType: map[tools.IDType][]string{
							tools.IDTypeSection: {"sectionId"},
						},
						ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
							TargetIDPathsByType: map[tools.IDType][]string{
								tools.IDTypeSection: {"sectionId"},
							},
							PreviewValuePath: "code",
							PreviewKind:      tools.PreviewKindCode,
						},
						SearchCategory: "code",
						SearchTags:     []string{"code", "edit", "write", "section", "python"},
					},
					Handler: newSetCodeHandler(codeUpdates),
				},
				InputSchema: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"projectConfigId": map[string]any{
							"type":        "string",
							"description": "Project config id whose code section should be updated.",
						},
						"sectionId": map[string]any{
							"type":        "string",
							"description": "Code section id whose inline code should be replaced.",
						},
						"code": map[string]any{
							"type":        "string",
							"description": "Complete replacement source for the targeted inline code section.",
						},
					},
					"required": []string{"projectConfigId", "sectionId", "code"},
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
					Name:        "format_code",
					Description: "Format the targeted Python code section or generated Python code target using Ruff.",
					Metadata: tools.Metadata{
						Kind:       tools.KindDiscoverable,
						AccessType: tools.AccessTypeWrite,
						IDPathsByType: map[tools.IDType][]string{
							tools.IDTypeSection: {"sectionId"},
						},
						SearchCategory: "code",
						SearchTags:     []string{"code", "format", "python", "generated", "write"},
					},
					Handler: newFormatCodeHandler(codeUpdates),
				},
				InputSchema: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"projectConfigId": map[string]any{
							"type":        "string",
							"description": "Project config id whose Python code section should be formatted.",
						},
						"sectionId": map[string]any{
							"type":        "string",
							"description": "Python code section id or generated Python singleton section id to format.",
						},
					},
					"required": []string{"projectConfigId", "sectionId"},
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
	}

	if projectState != nil && lspDiagnostics != nil {
		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "add_kwarg",
				Description: "Create a new editable parameter entry in the targeted callable or dict section.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeCodeObject: {"codeObjId"},
					},
					SearchCategory: "params",
					SearchTags:     []string{"param", "parameter", "kwarg", "create", "write"},
				},
				Handler: newAddKwargHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose section should receive the new parameter.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Callable or dict section id that should receive the new parameter.",
					},
				},
				"required": []string{"projectConfigId", "sectionId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"codeObjId": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"codeObjId"},
			},
		})

		definitions = append(definitions, toolDefinition{
			Spec: tools.Spec{
				Name:        "delete_kwarg",
				Description: "Remove the last editable parameter entry from the targeted callable or dict section.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeCodeObject: {"codeObjId"},
					},
					SearchCategory: "params",
					SearchTags:     []string{"param", "parameter", "kwarg", "delete", "remove", "write"},
				},
				Handler: newDeleteKwargHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose section should delete its last editable parameter.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Callable or dict section id whose last editable parameter should be removed.",
					},
				},
				"required": []string{"projectConfigId", "sectionId"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"codeObjId": map[string]any{
						"type": "string",
					},
				},
				"required": []string{"codeObjId"},
			},
		})

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
				Name:        "set_section_tag_color",
				Description: "Set or clear the tag color decoration for a section within the requested project config.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "layout",
					SearchTags:     []string{"layout", "presentation", "section", "tag", "color", "write"},
				},
				Handler: newSetSectionTagColorHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose section tag color should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id whose tag color should be updated.",
					},
					"tagColor": map[string]any{
						"type":        []string{"string", "null"},
						"description": "Hex color string to persist for the section tag, or null to clear it.",
					},
				},
				"required": []string{"projectConfigId", "sectionId"},
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
				Name:        "set_section_style_color",
				Description: "Set or clear the style chrome color for a section within the requested project config.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "layout",
					SearchTags:     []string{"layout", "presentation", "section", "style", "color", "write"},
				},
				Handler: newSetSectionStyleColorHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose section style color should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id whose style color should be updated.",
					},
					"styleColor": map[string]any{
						"type":        []string{"string", "null"},
						"description": "Hex color string to persist for the section style chrome, or null to clear it.",
					},
				},
				"required": []string{"projectConfigId", "sectionId"},
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
				Name:        "set_section_param_filter",
				Description: "Set the raw parameter-filter string for a section that supports parameter lists within the requested project config.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "params",
					SearchTags:     []string{"params", "filter", "section", "write"},
				},
				Handler: newSetSectionParamFilterHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose section param filter should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id whose param filter should be updated.",
					},
					"paramFilter": map[string]any{
						"type":        "string",
						"description": "Raw filter string to persist exactly as written.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "paramFilter"},
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
				Name:        "set_meta_control_show_section_title",
				Description: "Set whether a MetaControl section should show its section title within the requested project config.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection: {"sectionId"},
					},
					SearchCategory: "layout",
					SearchTags:     []string{"layout", "meta-control", "title", "section", "write"},
				},
				Handler: newSetMetaControlShowSectionTitleHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose MetaControl title visibility should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "MetaControl section id whose title visibility should be updated.",
					},
					"showSectionTitle": map[string]any{
						"type":        "boolean",
						"description": "Whether the MetaControl section should render its section title.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "showSectionTitle"},
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
				Name:        "change_param_impl",
				Description: "Switch the targeted parameter or meta-control to a different implementation type.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection:    {"sectionId"},
						tools.IDTypeCodeObject: {"paramInfoId"},
					},
					SearchCategory: "params",
					SearchTags:     []string{"param", "parameter", "type", "impl", "control", "write"},
				},
				Handler: newChangeParamImplHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose parameter implementation should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id containing the targeted parameter.",
					},
					"paramInfoId": map[string]any{
						"type":        "string",
						"description": "Code-object id for the targeted parameter.",
					},
					"selectedId": map[string]any{
						"type":        "string",
						"description": "Target impl id or code-object type name to activate.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "paramInfoId", "selectedId"},
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
				Name:        "update_param_impl_config",
				Description: "Update the active implementation config for the targeted parameter or meta-control.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection:    {"sectionId"},
						tools.IDTypeCodeObject: {"paramInfoId"},
					},
					SearchCategory: "params",
					SearchTags:     []string{"param", "parameter", "config", "impl", "control", "write"},
				},
				Handler: newUpdateParamImplConfigHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose parameter implementation config should be updated.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Section id containing the targeted parameter.",
					},
					"paramInfoId": map[string]any{
						"type":        "string",
						"description": "Code-object id for the targeted parameter.",
					},
					"newConfig": map[string]any{
						"type":                 "object",
						"additionalProperties": true,
						"description":          "Implementation-specific config fields to persist on the targeted parameter.",
					},
				},
				"required": []string{"projectConfigId", "sectionId", "paramInfoId", "newConfig"},
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
				Name:        "delete_selected_params",
				Description: "Delete the selected editable params from the targeted callable or dict section.",
				Metadata: tools.Metadata{
					Kind:       tools.KindDiscoverable,
					AccessType: tools.AccessTypeWrite,
					IDPathsByType: map[tools.IDType][]string{
						tools.IDTypeSection:    {"sectionId"},
						tools.IDTypeCodeObject: {"paramInfoIds"},
					},
					ResultIDPathsByType: map[tools.IDType][]string{
						tools.IDTypeCodeObject: {"paramInfoIds"},
					},
					SearchCategory: "params",
					SearchTags:     []string{"param", "parameter", "delete", "remove", "selection", "write"},
				},
				Handler: newDeleteSelectedParamsHandler(projectState),
			},
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"projectConfigId": map[string]any{
						"type":        "string",
						"description": "Project config id whose selected params should be deleted.",
					},
					"sectionId": map[string]any{
						"type":        "string",
						"description": "Callable or dict section id containing the targeted params.",
					},
					"paramInfoIds": map[string]any{
						"type":        "array",
						"description": "Ordered list of selected param code-object ids to delete.",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"projectConfigId", "sectionId", "paramInfoIds"},
			},
			OutputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"paramInfoIds": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type": "string",
						},
					},
				},
				"required": []string{"paramInfoIds"},
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
					ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
						TargetIDPathsByType: map[tools.IDType][]string{
							tools.IDTypeSection:    {"sectionId"},
							tools.IDTypeCodeObject: {"paramInfoId"},
						},
						PreviewValuePath: "value",
						PreviewKind:      tools.PreviewKindParamValue,
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
					ToolArgumentPreview: &tools.ToolArgumentPreviewMetadata{
						TargetIDPathsByType: map[tools.IDType][]string{
							tools.IDTypeSection:    {"sectionId"},
							tools.IDTypeCodeObject: {"codeObjId"},
						},
						PreviewValuePath: "value",
						PreviewKind:      tools.PreviewKindParamValue,
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

func readOptionalNullableStringPointerArgument(arguments map[string]any, key string) (*string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be a string or null", key)
	}
	trimmedValue := strings.TrimSpace(value)
	return &trimmedValue, nil
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

func readOptionalBoolPointerArgument(arguments map[string]any, key string) (*bool, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.(bool)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be a boolean", key)
	}
	return &value, nil
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

func readRequiredPresentArgument(arguments map[string]any, key string) (any, error) {
	value, ok := arguments[key]
	if !ok {
		return nil, newToolError("invalid_arguments", "%s is required", key)
	}
	return value, nil
}

func readRequiredObjectArgument(arguments map[string]any, key string) (map[string]any, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, newToolError("invalid_arguments", "%s is required", key)
	}
	value, ok := rawValue.(map[string]any)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be an object", key)
	}
	return value, nil
}

func readOptionalObjectPointerArgument(arguments map[string]any, key string) (*map[string]any, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.(map[string]any)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be an object", key)
	}
	return &value, nil
}

func readOptionalArrayPointerArgument(arguments map[string]any, key string) (*[]any, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	value, ok := rawValue.([]any)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be an array", key)
	}
	copied := append([]any(nil), value...)
	return &copied, nil
}

func readOptionalAppRoutesArgument(arguments map[string]any, key string) (*[]projectstate.AppRoute, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}
	rawRoutes, ok := rawValue.([]any)
	if !ok {
		return nil, newToolError("invalid_arguments", "%s must be an array of route objects", key)
	}
	encoded, err := json.Marshal(rawRoutes)
	if err != nil {
		return nil, newToolError("invalid_arguments", "%s must be an array of route objects", key)
	}
	var routes []projectstate.AppRoute
	if err := json.Unmarshal(encoded, &routes); err != nil {
		return nil, newToolError("invalid_arguments", "%s must be an array of route objects", key)
	}
	return &routes, nil
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

func readRequiredTopLevelSectionLayoutsArgument(arguments map[string]any, key string) (map[string]projectstate.TopLevelSectionLayout, error) {
	rawLayouts, err := readRequiredObjectArgument(arguments, key)
	if err != nil {
		return nil, err
	}

	layouts := make(map[string]projectstate.TopLevelSectionLayout, len(rawLayouts))
	for rawSectionID, rawLayout := range rawLayouts {
		sectionID := strings.TrimSpace(rawSectionID)
		if sectionID == "" {
			return nil, newToolError("invalid_arguments", "%s contains an empty section id key", key)
		}

		layoutObject, ok := rawLayout.(map[string]any)
		if !ok {
			return nil, newToolError("invalid_arguments", "%s.%s must be an object", key, rawSectionID)
		}

		x, err := readRequiredFiniteNumberField(layoutObject, fmt.Sprintf("%s.%s", key, rawSectionID), "x")
		if err != nil {
			return nil, err
		}
		y, err := readRequiredFiniteNumberField(layoutObject, fmt.Sprintf("%s.%s", key, rawSectionID), "y")
		if err != nil {
			return nil, err
		}
		zIndex, err := readOptionalIntField(layoutObject, fmt.Sprintf("%s.%s", key, rawSectionID), "zIndex")
		if err != nil {
			return nil, err
		}
		width, err := readOptionalFiniteNumberField(layoutObject, fmt.Sprintf("%s.%s", key, rawSectionID), "w")
		if err != nil {
			return nil, err
		}
		height, err := readOptionalFiniteNumberField(layoutObject, fmt.Sprintf("%s.%s", key, rawSectionID), "h")
		if err != nil {
			return nil, err
		}

		layout := projectstate.TopLevelSectionLayout{
			X: x,
			Y: y,
		}
		if zIndex != nil {
			layout.ZIndex = *zIndex
		}
		if width != nil {
			layout.W = width
		}
		if height != nil {
			layout.H = height
		}
		layouts[sectionID] = layout
	}

	return layouts, nil
}

func readRequiredSectionSizesArgument(arguments map[string]any, key string) (map[string]projectstate.SectionSize, error) {
	rawSectionSizes, err := readRequiredObjectArgument(arguments, key)
	if err != nil {
		return nil, err
	}

	sectionSizes := make(map[string]projectstate.SectionSize, len(rawSectionSizes))
	for rawSectionID, rawSize := range rawSectionSizes {
		sectionID := strings.TrimSpace(rawSectionID)
		if sectionID == "" {
			return nil, newToolError("invalid_arguments", "%s contains an empty section id key", key)
		}

		sizeObject, ok := rawSize.(map[string]any)
		if !ok {
			return nil, newToolError("invalid_arguments", "%s.%s must be an object", key, rawSectionID)
		}
		width, err := readRequiredSectionSizeValueField(sizeObject, fmt.Sprintf("%s.%s", key, rawSectionID), "width")
		if err != nil {
			return nil, err
		}
		height, err := readRequiredSectionSizeValueField(sizeObject, fmt.Sprintf("%s.%s", key, rawSectionID), "height")
		if err != nil {
			return nil, err
		}
		sectionSizes[sectionID] = projectstate.SectionSize{
			Width:  width,
			Height: height,
		}
	}
	return sectionSizes, nil
}

func readRequiredSectionSizeValueField(
	object map[string]any,
	parentKey string,
	field string,
) (projectstate.SectionSizeValue, error) {
	rawValue, ok := object[field]
	if !ok || rawValue == nil {
		return projectstate.SectionSizeValue{}, newToolError("invalid_arguments", "%s.%s is required", parentKey, field)
	}

	switch typed := rawValue.(type) {
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return projectstate.SectionSizeValue{}, newToolError("invalid_arguments", "%s.%s must be a number or 'auto'", parentKey, field)
		}
		if strings.EqualFold(trimmed, "auto") {
			return projectstate.AutoSectionSizeValue(), nil
		}
		value, err := strconv.ParseFloat(trimmed, 64)
		if err != nil {
			return projectstate.SectionSizeValue{}, newToolError("invalid_arguments", "%s.%s must be a number or 'auto'", parentKey, field)
		}
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return projectstate.SectionSizeValue{}, newToolError("invalid_arguments", "%s.%s must be a finite number", parentKey, field)
		}
		return projectstate.FixedSectionSizeValue(value), nil
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return projectstate.SectionSizeValue{}, newToolError("invalid_arguments", "%s.%s must be a finite number", parentKey, field)
		}
		return projectstate.FixedSectionSizeValue(typed), nil
	case float32:
		value := float64(typed)
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return projectstate.SectionSizeValue{}, newToolError("invalid_arguments", "%s.%s must be a finite number", parentKey, field)
		}
		return projectstate.FixedSectionSizeValue(value), nil
	case int:
		return projectstate.FixedSectionSizeValue(float64(typed)), nil
	case int8:
		return projectstate.FixedSectionSizeValue(float64(typed)), nil
	case int16:
		return projectstate.FixedSectionSizeValue(float64(typed)), nil
	case int32:
		return projectstate.FixedSectionSizeValue(float64(typed)), nil
	case int64:
		return projectstate.FixedSectionSizeValue(float64(typed)), nil
	default:
		return projectstate.SectionSizeValue{}, newToolError("invalid_arguments", "%s.%s must be a number or 'auto'", parentKey, field)
	}
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

func readOptionalFiniteNumberField(object map[string]any, parentKey string, field string) (*float64, error) {
	rawValue, ok := object[field]
	if !ok || rawValue == nil {
		return nil, nil
	}

	value, err := readRequiredFiniteNumberField(object, parentKey, field)
	if err != nil {
		return nil, err
	}
	return &value, nil
}

func readOptionalIntArgument(arguments map[string]any, key string) (*int, error) {
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
	return &value, nil
}

func readOptionalIntField(object map[string]any, parentKey string, field string) (*int, error) {
	rawValue, ok := object[field]
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
			return nil, newToolError("invalid_arguments", "%s.%s must be an integer", parentKey, field)
		}
		value = int(typed)
	default:
		return nil, newToolError("invalid_arguments", "%s.%s must be an integer", parentKey, field)
	}
	return &value, nil
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

func readOptionalStringArrayArgument(arguments map[string]any, key string) ([]string, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
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

func readRequiredWatchCodeFoldersArgument(arguments map[string]any, key string) ([]projectstate.WatchCodeFolder, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, newToolError("invalid_arguments", "%s is required", key)
	}

	switch typed := rawValue.(type) {
	case []projectstate.WatchCodeFolder:
		output := make([]projectstate.WatchCodeFolder, len(typed))
		copy(output, typed)
		return output, nil
	case []map[string]any:
		output := make([]projectstate.WatchCodeFolder, 0, len(typed))
		for index, entry := range typed {
			folder, err := readWatchCodeFolderValue(entry, key, index)
			if err != nil {
				return nil, err
			}
			output = append(output, folder)
		}
		return output, nil
	case []any:
		output := make([]projectstate.WatchCodeFolder, 0, len(typed))
		for index, entry := range typed {
			folder, err := readWatchCodeFolderValue(entry, key, index)
			if err != nil {
				return nil, err
			}
			output = append(output, folder)
		}
		return output, nil
	default:
		return nil, newToolError("invalid_arguments", "%s must be an array of objects", key)
	}
}

func readOptionalWatchCodeFoldersArgument(arguments map[string]any, key string) ([]projectstate.WatchCodeFolder, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, nil
	}

	switch typed := rawValue.(type) {
	case []projectstate.WatchCodeFolder:
		output := make([]projectstate.WatchCodeFolder, len(typed))
		copy(output, typed)
		return output, nil
	case []map[string]any:
		output := make([]projectstate.WatchCodeFolder, 0, len(typed))
		for index, entry := range typed {
			folder, err := readWatchCodeFolderValue(entry, key, index)
			if err != nil {
				return nil, err
			}
			output = append(output, folder)
		}
		return output, nil
	case []any:
		output := make([]projectstate.WatchCodeFolder, 0, len(typed))
		for index, entry := range typed {
			folder, err := readWatchCodeFolderValue(entry, key, index)
			if err != nil {
				return nil, err
			}
			output = append(output, folder)
		}
		return output, nil
	default:
		return nil, newToolError("invalid_arguments", "%s must be an array of objects", key)
	}
}

func readWatchCodeFolderValue(rawValue any, key string, index int) (projectstate.WatchCodeFolder, error) {
	if folder, ok := rawValue.(projectstate.WatchCodeFolder); ok {
		return folder, nil
	}

	object, ok := rawValue.(map[string]any)
	if !ok {
		return projectstate.WatchCodeFolder{}, newToolError("invalid_arguments", "%s[%d] must be an object", key, index)
	}

	pathValue, ok := object["path"]
	if !ok || pathValue == nil {
		return projectstate.WatchCodeFolder{}, newToolError("invalid_arguments", "%s[%d].path is required", key, index)
	}
	path, ok := pathValue.(string)
	if !ok {
		return projectstate.WatchCodeFolder{}, newToolError("invalid_arguments", "%s[%d].path must be a string", key, index)
	}

	recursiveValue, ok := object["recursive"]
	if !ok || recursiveValue == nil {
		return projectstate.WatchCodeFolder{}, newToolError("invalid_arguments", "%s[%d].recursive is required", key, index)
	}
	recursive, ok := recursiveValue.(bool)
	if !ok {
		return projectstate.WatchCodeFolder{}, newToolError("invalid_arguments", "%s[%d].recursive must be a boolean", key, index)
	}

	return projectstate.WatchCodeFolder{
		Path:      strings.TrimSpace(path),
		Recursive: recursive,
	}, nil
}

func readRequiredProjectCodegenTargetsArgument(arguments map[string]any, key string) ([]projectstate.ProjectCodegenTarget, error) {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil, newToolError("invalid_arguments", "%s is required", key)
	}

	switch typed := rawValue.(type) {
	case []projectstate.ProjectCodegenTarget:
		output := make([]projectstate.ProjectCodegenTarget, len(typed))
		copy(output, typed)
		return output, nil
	case []any:
		output := make([]projectstate.ProjectCodegenTarget, 0, len(typed))
		for index, entry := range typed {
			target, err := readProjectCodegenTargetValue(entry, key, index)
			if err != nil {
				return nil, err
			}
			output = append(output, target)
		}
		return output, nil
	default:
		return nil, newToolError("invalid_arguments", "%s must be an array of objects", key)
	}
}

func readProjectCodegenTargetValue(rawValue any, key string, index int) (projectstate.ProjectCodegenTarget, error) {
	if target, ok := rawValue.(projectstate.ProjectCodegenTarget); ok {
		return target, nil
	}

	encoded, err := json.Marshal(rawValue)
	if err != nil {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d] must be a valid JSON object", key, index)
	}
	trimmed := bytes.TrimSpace(encoded)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d] must be an object", key, index)
	}

	var object map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &object); err != nil {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d] must be an object", key, index)
	}
	if object == nil {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d] must be an object", key, index)
	}

	languagePayload, ok := object["language"]
	if !ok {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d].language is required", key, index)
	}

	var language string
	if err := json.Unmarshal(languagePayload, &language); err != nil {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d].language must be a string", key, index)
	}
	language = strings.TrimSpace(language)
	if language == "" {
		return projectstate.ProjectCodegenTarget{}, newToolError("invalid_arguments", "%s[%d].language is required", key, index)
	}

	return projectstate.ProjectCodegenTarget{
		Language: language,
		Payload:  append(projectstate.RawJSON(nil), trimmed...),
	}, nil
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

	var structured any
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
	case projectstate.IsInvalidSectionVariantSortOrderError(err):
		return newToolError("invalid_arguments", "%s", err.Error())
	case projectstate.IsFormatCodeError(err):
		return newToolError("invalid_arguments", "%s", err.Error())
	case projectstate.IsInvalidCodeObjectNameError(err):
		return newToolError("invalid_arguments", "%s", err.Error())
	case projectstate.IsInvalidAutoLayoutError(err):
		return newToolError("invalid_arguments", "%s", err.Error())
	case errors.Is(err, projectstate.ErrSettingsValueInvalid),
		errors.Is(err, settingsstate.ErrSettingsValueInvalid):
		return newToolError("invalid_arguments", "%s", err.Error())
	case projectstate.IsExpectedOldValueMismatchError(err):
		return newToolError("mutation_failed", "%s", err.Error())
	case errors.Is(err, projectstate.ErrWatchCodeWorkspaceRootRequired),
		errors.Is(err, projectstate.ErrWatchCodeInputPathInvalid):
		return newToolError("invalid_arguments", "%s", err.Error())
	case errors.Is(err, projectstate.ErrAppSpecPathUnconfigured):
		return newToolError("invalid_arguments", "%s", err.Error())
	case errors.Is(err, projectstate.ErrAppSpecNotFound):
		return newToolError("file_not_found", "%s", err.Error())
	case errors.Is(err, projectstate.ErrAppSpecStoreUnsupported):
		return newToolError("internal_error", "%s", err.Error())
	case errors.Is(err, projectstate.ErrProjectCodegenTargetLanguage),
		errors.Is(err, projectstate.ErrProjectCodegenTargetDuplicateLanguage),
		errors.Is(err, projectstate.ErrProjectCodegenTargetValidatorRequired),
		errors.Is(err, projectstate.ErrProjectCodegenPythonReconcilerRequired),
		errors.Is(err, plugins.ErrRegisteredCodegenTargetNotFound),
		errors.Is(err, plugins.ErrRegisteredCodegenTargetConflict),
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetPayloadInvalid),
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetObjectRequired),
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetFieldUnknown),
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetFieldInvalid),
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetMissing),
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetLanguageMismatch):
		return newToolError("invalid_arguments", "%s", err.Error())
	case errors.Is(err, projectstate.ErrSectionNotFound),
		errors.Is(err, projectstate.ErrSectionVariantNotFound),
		errors.Is(err, projectstate.ErrSectionVariantMembership),
		errors.Is(err, projectstate.ErrCodeObjNotFound),
		errors.Is(err, projectstate.ErrCallableSectionRequired),
		errors.Is(err, projectstate.ErrGroupSectionRequired),
		errors.Is(err, projectstate.ErrAddKwargUnsupported),
		errors.Is(err, projectstate.ErrAddKwargCallableUnset),
		errors.Is(err, projectstate.ErrAddKwargParentTypeUnsupported),
		errors.Is(err, projectstate.ErrDeleteKwargUnsupported),
		errors.Is(err, projectstate.ErrDeleteKwargCallableUnset),
		errors.Is(err, projectstate.ErrDeleteKwargNoParams),
		errors.Is(err, projectstate.ErrDeleteKwargRootMissing),
		errors.Is(err, projectstate.ErrDeleteKwargParentUnsupported),
		errors.Is(err, projectstate.ErrChangeParamImplUnsupported),
		errors.Is(err, projectstate.ErrChangeParamImplSelectedRequired),
		errors.Is(err, projectstate.ErrChangeParamImplCodeObjTypeUnknown),
		errors.Is(err, projectstate.ErrChangeParamImplCodeObjTypeNotAllowed),
		errors.Is(err, projectstate.ErrUpdateParamImplConfigUnsupported),
		errors.Is(err, projectstate.ErrUpdateParamImplConfigFieldUnsupported),
		errors.Is(err, projectstate.ErrUpdateParamImplConfigFieldInvalid),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsUnsupported),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParamIDBlank),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsRootMissing),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParamUnsupported),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParentMissing),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParentUnsupported),
		errors.Is(err, projectstate.ErrCodeObjRenameUnsupported),
		errors.Is(err, projectstate.ErrCodeObjActiveReferenceNotFound),
		errors.Is(err, projectstate.ErrSectionParamFilterUnsupported),
		errors.Is(err, projectstate.ErrMetaControlSectionRequired),
		errors.Is(err, projectstate.ErrCodeSectionRequired),
		errors.Is(err, projectstate.ErrCodeSectionReadOnly),
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
		errors.Is(err, projectstate.ErrInvalidTypeErrorIgnoreState),
		errors.Is(err, projectstate.ErrTypeErrorIgnoreUnsupported):
		return newToolError("invalid_arguments", "%s", err.Error())
	default:
		return err
	}
}

func resolveStructuralMutationSettings(
	settingsState settingsStateProvider,
) (projectstate.StructuralMutationSettings, error) {
	if settingsState == nil {
		return projectstate.DefaultStructuralMutationSettings(), nil
	}
	return settingsstate.StructuralMutationSettingsForDocument(settingsState.Snapshot().Document)
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
	var toolArgumentPreview map[string]any
	if metadata.ToolArgumentPreview != nil {
		targetIDPathsByType := make(map[string]any, len(metadata.ToolArgumentPreview.TargetIDPathsByType))
		for idType, paths := range metadata.ToolArgumentPreview.TargetIDPathsByType {
			copied := append([]string(nil), paths...)
			targetIDPathsByType[string(idType)] = copied
		}
		toolArgumentPreview = map[string]any{
			"targetIdPathsByType": targetIDPathsByType,
			"previewValuePath":    metadata.ToolArgumentPreview.PreviewValuePath,
			"previewKind":         string(metadata.ToolArgumentPreview.PreviewKind),
		}
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
	if toolArgumentPreview != nil {
		payload["toolArgumentPreview"] = toolArgumentPreview
	}

	return sdkmcp.Meta{
		toolMetaNamespace: payload,
	}
}

func NewToolError(code string, format string, args ...any) error {
	return newToolError(code, format, args...)
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
