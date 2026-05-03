package mcpx

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/settadocs"
	"setta/internal/settingsstate"
	"setta/internal/tools"
	"setta/internal/uisettings"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	toolMetaNamespace = "setta"
	serverName        = "setta"
	serverVersion     = "0.1.0"
)

type Server struct {
	logger                       *slog.Logger
	registry                     *tools.Registry
	projectState                 projectStateProvider
	afterProjectMutation         func(context.Context, string) error
	pluginMutations              pluginMutationProvider
	pythonPackages               pythonPackageProvider
	lspDiagnostics               lspDiagnosticsProvider
	mcpStatuses                  mcpStatusProvider
	terminals                    terminalHistoryProvider
	docs                         *settadocs.Loader
	toolSearch                   *tools.SearchIndex
	searchEntries                []tools.SearchEntry
	temporaryIDs                 *TemporaryIDStore
	agentProfiles                agentProfileProvider
	promptTemplates              promptTemplateProvider
	externalAgentConfigs         externalAgentConfigProvider
	llmAPIKeys                   llmAPIKeyProvider
	agentRuns                    agentRunProvider
	uiSettingReveals             uisettings.RevealService
	contributedUISettingBuilders []uisettings.RuntimeEntryBuilder
	unavailableUISettings        []uisettings.UnavailableSettingProvider
	stateMachineRuns             stateMachineRunProvider
	toolInvocations              toolInvocationRecorder
	server                       *sdkmcp.Server
	handler                      http.Handler
	agenticContextMu             sync.RWMutex
	agenticContextBySess         map[string]AgenticContext
}

type ServerOptions struct {
	Logger                         *slog.Logger
	Registry                       *tools.Registry
	WorkspaceRoot                  string
	ProjectState                   projectStateProvider
	SkipDefaultAppSubsystemTools   bool
	ContributedToolRegistrations   []ToolRegistration
	ContributedUISettingBuilders   []uisettings.RuntimeEntryBuilder
	UnavailableUISettings          []uisettings.UnavailableSettingProvider
	AfterProjectStateMutation      func(context.Context, string) error
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
	PromptTemplates                promptTemplateProvider
	ExternalAgentConfigs           externalAgentConfigProvider
	LLMAPIKeys                     llmAPIKeyProvider
	AgentRuns                      agentRunProvider
	UISettingReveals               uisettings.RevealService
	StateMachineRuns               stateMachineRunProvider
	ToolInvocations                toolInvocationRecorder
}

type toolDefinition struct {
	Spec         tools.Spec
	InputSchema  map[string]any
	OutputSchema map[string]any
}

type ToolRegistration = tools.ToolRegistration

type InvokeToolSummary struct {
	Result                      *sdkmcp.CallToolResult
	ResolvedProjectConfigID     string
	ProjectStateRevisionChanged bool
}

type projectStateProvider interface {
	Snapshot() projectstate.Snapshot
	SetProjectName(ctx context.Context, projectID string, name string) (projectstate.Snapshot, error)
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
	CompareAndSetProjectName(ctx context.Context, projectID string, name string, expectedOldValue *string) (projectstate.Snapshot, projectstate.CompareAndSetResult[string], error)
	CompareAndSetShowParamDisplayNames(ctx context.Context, projectID string, show bool, expectedOldValue *bool) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error)
	CompareAndSetPythonCodegenEnabled(ctx context.Context, projectID string, enabled bool, expectedOldValue *bool, validator projectstate.CodegenTargetValidator, pythonReconciler projectstate.PythonCodegenSectionReconciler) (projectstate.Snapshot, projectstate.CompareAndSetResult[bool], error)
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

type promptTemplateProvider interface {
	List() ([]prompttemplates.Template, error)
}

type externalAgentConfigProvider interface {
	List() ([]externalagentconfigs.Config, error)
}

type llmAPIKeyProvider interface {
	ManagedAPIKeysSnapshot() llmconfig.ManagedAPIKeysSnapshot
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

type toolInvocationRecorder interface {
	RecordMCPToolInvocationStarted(runID string, toolName string)
	RecordMCPToolInvocationCompleted(runID string, toolName string)
}

type pluginMutationProvider interface {
	Runtime(options plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error)
	Rescan() (plugins.DiscoverySnapshot, error)
	Install(ctx context.Context, options plugins.InstallOptions) (plugins.PluginInstallResponse, error)
	Uninstall(ctx context.Context, options plugins.UninstallOptions) (plugins.PluginUninstallResponse, error)
	Update(ctx context.Context, options plugins.UpdateOptions) (plugins.PluginUpdateResponse, error)
	Rollback(ctx context.Context, options plugins.RollbackOptions) (plugins.PluginRollbackResponse, error)
	WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error)
	GetBackendUISettings(pluginID string) ([]plugins.PluginRegisteredUISetting, error)
	ReadBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingReadOptions) (any, error)
	WriteBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingWriteOptions) error
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
		logger:                       opts.Logger,
		registry:                     registry,
		projectState:                 opts.ProjectState,
		afterProjectMutation:         opts.AfterProjectStateMutation,
		pluginMutations:              opts.PluginMutations,
		pythonPackages:               opts.PythonPackages,
		lspDiagnostics:               opts.LSPDiagnostics,
		mcpStatuses:                  opts.MCPStatuses,
		terminals:                    opts.Terminals,
		agentProfiles:                opts.AgentProfiles,
		promptTemplates:              opts.PromptTemplates,
		externalAgentConfigs:         opts.ExternalAgentConfigs,
		llmAPIKeys:                   opts.LLMAPIKeys,
		agentRuns:                    opts.AgentRuns,
		uiSettingReveals:             opts.UISettingReveals,
		contributedUISettingBuilders: append([]uisettings.RuntimeEntryBuilder(nil), opts.ContributedUISettingBuilders...),
		unavailableUISettings:        append([]uisettings.UnavailableSettingProvider(nil), opts.UnavailableUISettings...),
		stateMachineRuns:             opts.StateMachineRuns,
		toolInvocations:              opts.ToolInvocations,
		server:                       server,
		agenticContextBySess:         map[string]AgenticContext{},
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
	if err := registerServerToolDefinitions(instance, workspaceRoot, registry, opts); err != nil {
		return nil, err
	}

	instance.handler = newHTTPHandler(instance.server)
	return instance, nil
}
