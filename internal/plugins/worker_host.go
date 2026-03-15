package plugins

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/statefs"
	"setta/internal/tools"
)

const (
	CapabilityRegisterMCPTools             = "registerMcpTools"
	CapabilityReadProjectState             = "readProjectState"
	CapabilityRegisterLanguageServer       = "registerLanguageServer"
	CapabilityRegisterExternalAgentAdapter = "registerExternalAgentAdapter"
	CapabilityRegisterCodegenTarget        = "registerCodegenTarget"
)

const (
	HostMethodRegisterMCPTool        = "host.register_mcp_tool"
	HostMethodReadProjectState       = "host.read_project_state"
	HostMethodRegisterLanguageServer = "host.register_language_server"
	HostMethodRegisterExternalAgent  = "host.register_external_agent_adapter"
	HostMethodRegisterCodegenTarget  = "host.register_codegen_target"
)

var (
	ErrWorkerHostServiceRequired                         = errors.New("plugins: worker host requires at least one registered service")
	ErrWorkerHostProjectStateReaderRequired              = errors.New("plugins: project state reader is required")
	ErrWorkerHostMCPToolRegistrarRequired                = errors.New("plugins: mcp tool registrar is required")
	ErrWorkerHostLanguageServerRegistrarRequired         = errors.New("plugins: language server registrar is required")
	ErrWorkerHostExternalAgentRegistrarRequired          = errors.New("plugins: external agent adapter registrar is required")
	ErrWorkerHostCodegenTargetRegistrarNeeded            = errors.New("plugins: codegen target registrar is required")
	ErrWorkerHostPluginIDRequired                        = errors.New("plugins: worker host plugin id is required")
	ErrWorkerHostPluginRootRequired                      = errors.New("plugins: worker host plugin root is required")
	ErrWorkerHostCapabilityDenied                        = errors.New("plugins: worker host capability is required")
	ErrWorkerHostShareSessionRequired                    = errors.New("plugins: share session id is required in deployment mode")
	ErrWorkerHostProjectStateReadFailed                  = errors.New("plugins: project state read failed")
	ErrWorkerHostProjectStateProjectIDRequired           = errors.New("plugins: project config id is required")
	ErrWorkerHostProjectStateViewInvalid                 = errors.New("plugins: project state view is invalid")
	ErrWorkerHostLanguageServerRequired                  = errors.New("plugins: language server registration is required")
	ErrWorkerHostLanguageServerLanguageRequired          = errors.New("plugins: language server language is required")
	ErrWorkerHostLanguageServerLanguageInvalid           = errors.New("plugins: language server language is reserved")
	ErrWorkerHostLanguageServerCommandRequired           = errors.New("plugins: language server command is required")
	ErrWorkerHostLanguageServerCommandInvalid            = errors.New("plugins: language server command is invalid")
	ErrWorkerHostLanguageServerArgsInvalid               = errors.New("plugins: language server args are invalid")
	ErrWorkerHostLanguageServerSettingsKeyInvalid        = errors.New("plugins: language server settings key is invalid")
	ErrWorkerHostExternalAgentAdapterRequired            = errors.New("plugins: external agent adapter registration is required")
	ErrWorkerHostExternalAgentAdapterIDRequired          = errors.New("plugins: external agent adapter id is required")
	ErrWorkerHostExternalAgentAdapterNameRequired        = errors.New("plugins: external agent adapter name is required")
	ErrWorkerHostExternalAgentAdapterRunModesRequired    = errors.New("plugins: external agent adapter run modes are required")
	ErrWorkerHostExternalAgentAdapterRunModeInvalid      = errors.New("plugins: external agent adapter run mode is invalid")
	ErrWorkerHostExternalAgentAdapterCommandRequired     = errors.New("plugins: external agent adapter command is required")
	ErrWorkerHostExternalAgentAdapterCommandInvalid      = errors.New("plugins: external agent adapter command is invalid")
	ErrWorkerHostExternalAgentAdapterArgsInvalid         = errors.New("plugins: external agent adapter args are invalid")
	ErrWorkerHostExternalAgentEnvWhitelistInvalid        = errors.New("plugins: external agent adapter env var whitelist is invalid")
	ErrWorkerHostExternalAgentDefaultModelInvalid        = errors.New("plugins: external agent adapter default model is invalid")
	ErrWorkerHostCodegenTargetRequired                   = errors.New("plugins: codegen target registration is required")
	ErrWorkerHostCodegenTargetIDRequired                 = errors.New("plugins: codegen target id is required")
	ErrWorkerHostCodegenTargetIDInvalid                  = errors.New("plugins: codegen target id cannot contain ':'")
	ErrWorkerHostCodegenTargetNameRequired               = errors.New("plugins: codegen target name is required")
	ErrWorkerHostCodegenTargetLanguageNeeded             = errors.New("plugins: codegen target language is required")
	ErrWorkerHostCodegenTargetLanguageInvalid            = errors.New("plugins: codegen target language is reserved")
	ErrWorkerHostCodegenHandlerIDRequired                = errors.New("plugins: codegen target handler id is required")
	ErrWorkerHostMCPToolRequired                         = errors.New("plugins: mcp tool registration is required")
	ErrWorkerHostMCPToolNameRequired                     = errors.New("plugins: mcp tool name is required")
	ErrWorkerHostMCPToolInputSchemaRequired              = errors.New("plugins: mcp tool input schema is required")
	ErrWorkerHostMCPToolMetadataRequired                 = errors.New("plugins: mcp tool metadata is required")
	ErrWorkerHostMethodRequired                          = errors.New("plugins: worker host method is required")
	ErrWorkerHostUnsupportedMethod                       = errors.New("plugins: unsupported worker host method")
	ErrWorkerHostParamsInvalid                           = errors.New("plugins: worker host params are invalid")
	errWorkerHostExternalAgentAdapterCommandPathNotFound = errors.New("plugins: external agent adapter command path does not exist")
	errWorkerHostLanguageServerCommandPathNotFound       = errors.New("plugins: language server command path does not exist")
	errWorkerHostCommandPathNotFile                      = errors.New("plugins: command path is not a file")
	errWorkerHostCommandPathNotExecutable                = errors.New("plugins: command path is not executable")
)

var supportedExternalAgentRunModes = map[string]struct{}{
	"mcp":        {},
	"server":     {},
	"sdk":        {},
	"app_server": {},
}

type WorkerHostOptions struct {
	ProjectStateReader            ProjectStateReader
	MCPToolRegistrar              BackendMCPToolRegistrar
	LanguageServerRegistrar       BackendLanguageServerRegistrar
	ExternalAgentAdapterRegistrar BackendExternalAgentAdapterRegistrar
	CodegenTargetRegistrar        BackendCodegenTargetRegistrar
}

type WorkerContext struct {
	PluginID              string
	PluginRoot            string
	EffectiveCapabilities []string
}

type RegisterMCPToolRequest struct {
	Tool *workerMCPToolRegistrationPayload `json:"tool"`
}

type ReadProjectStateRequest struct {
	ProjectID      string `json:"projectConfigId"`
	ShareSessionID string `json:"shareSessionId,omitempty"`
	View           string `json:"view"`
}

type workerMCPToolRegistrationPayload struct {
	Name         string                           `json:"name"`
	Description  string                           `json:"description,omitempty"`
	InputSchema  map[string]any                   `json:"inputSchema"`
	OutputSchema map[string]any                   `json:"outputSchema,omitempty"`
	Metadata     *workerMCPToolMetadataDescriptor `json:"metadata"`
}

type workerMCPToolMetadataDescriptor struct {
	Kind                          string              `json:"kind"`
	AccessType                    string              `json:"accessType,omitempty"`
	IDPathsByType                 map[string][]string `json:"idPathsByType,omitempty"`
	ResultIDPathsByType           map[string][]string `json:"resultIdPathsByType,omitempty"`
	DefaultTargetSingletonSection string              `json:"defaultTargetSingletonSection,omitempty"`
	ResultFilter                  string              `json:"resultFilter,omitempty"`
	SearchTags                    []string            `json:"searchTags,omitempty"`
	SearchCategory                string              `json:"searchCategory,omitempty"`
}

type RegisterLanguageServerRequest struct {
	Provider *workerLanguageServerRegistrationPayload `json:"provider"`
}

type workerLanguageServerRegistrationPayload struct {
	Language    string   `json:"language"`
	Command     string   `json:"command"`
	Args        []string `json:"args,omitempty"`
	SettingsKey *string  `json:"settingsKey"`
}

type RegisterExternalAgentAdapterRequest struct {
	Adapter *workerExternalAgentAdapterRegistrationPayload `json:"adapter"`
}

type workerExternalAgentAdapterRegistrationPayload struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	RunModes        []string `json:"runModes"`
	Command         string   `json:"command"`
	Args            []string `json:"args,omitempty"`
	EnvVarWhitelist []string `json:"envVarWhitelist,omitempty"`
	DefaultModel    *string  `json:"defaultModel"`
}

type RegisterCodegenTargetRequest struct {
	Target *workerCodegenTargetRegistrationPayload `json:"target"`
}

type workerCodegenTargetRegistrationPayload struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Language        string `json:"language"`
	HandlerID       string `json:"handlerId"`
	DefaultFileName string `json:"defaultFileName,omitempty"`
}

type WorkerHost struct {
	projectStateReader        ProjectStateReader
	mcpToolStore              BackendMCPToolRegistrar
	languageServerStore       BackendLanguageServerRegistrar
	externalAgentAdapterStore BackendExternalAgentAdapterRegistrar
	codegenTargetStore        BackendCodegenTargetRegistrar
}

func NewWorkerHost(options WorkerHostOptions) (*WorkerHost, error) {
	if options.ProjectStateReader == nil &&
		options.MCPToolRegistrar == nil &&
		options.LanguageServerRegistrar == nil &&
		options.ExternalAgentAdapterRegistrar == nil &&
		options.CodegenTargetRegistrar == nil {
		return nil, ErrWorkerHostServiceRequired
	}

	return &WorkerHost{
		projectStateReader:        options.ProjectStateReader,
		mcpToolStore:              options.MCPToolRegistrar,
		languageServerStore:       options.LanguageServerRegistrar,
		externalAgentAdapterStore: options.ExternalAgentAdapterRegistrar,
		codegenTargetStore:        options.CodegenTargetRegistrar,
	}, nil
}

func (h *WorkerHost) ReadProjectState(
	ctx context.Context,
	worker WorkerContext,
	request ReadProjectStateRequest,
) (ProjectStateReadResult, error) {
	if h == nil || h.projectStateReader == nil {
		return ProjectStateReadResult{}, ErrWorkerHostProjectStateReaderRequired
	}
	if !worker.hasCapability(CapabilityReadProjectState) {
		return ProjectStateReadResult{}, fmt.Errorf("%w: %s", ErrWorkerHostCapabilityDenied, CapabilityReadProjectState)
	}

	projectID := strings.TrimSpace(request.ProjectID)
	if projectID == "" {
		return ProjectStateReadResult{}, ErrWorkerHostProjectStateProjectIDRequired
	}

	view := strings.TrimSpace(request.View)
	if view == "" {
		view = ProjectStateViewSummary
	}
	if view != ProjectStateViewSummary && view != ProjectStateViewFull {
		return ProjectStateReadResult{}, fmt.Errorf("%w: %s", ErrWorkerHostProjectStateViewInvalid, view)
	}

	result, err := h.projectStateReader.ReadProjectState(ctx, ProjectStateReadRequest{
		ProjectID:      projectID,
		ShareSessionID: strings.TrimSpace(request.ShareSessionID),
		View:           view,
	})
	if err != nil {
		return ProjectStateReadResult{}, fmt.Errorf("%w: %v", ErrWorkerHostProjectStateReadFailed, err)
	}
	return result, nil
}

func (h *WorkerHost) RegisterLanguageServer(
	ctx context.Context,
	worker WorkerContext,
	request RegisterLanguageServerRequest,
) error {
	if h == nil || h.languageServerStore == nil {
		return ErrWorkerHostLanguageServerRegistrarRequired
	}
	if !worker.hasCapability(CapabilityRegisterLanguageServer) {
		return fmt.Errorf("%w: %s", ErrWorkerHostCapabilityDenied, CapabilityRegisterLanguageServer)
	}

	registration, err := normalizeWorkerLanguageServerRegistration(worker, request)
	if err != nil {
		return err
	}
	if err := h.languageServerStore.RegisterLanguageServer(ctx, registration); err != nil {
		return err
	}
	return nil
}

func (h *WorkerHost) RegisterMCPTool(
	ctx context.Context,
	worker WorkerContext,
	request RegisterMCPToolRequest,
) error {
	if h == nil || h.mcpToolStore == nil {
		return ErrWorkerHostMCPToolRegistrarRequired
	}
	if !worker.hasCapability(CapabilityRegisterMCPTools) {
		return fmt.Errorf("%w: %s", ErrWorkerHostCapabilityDenied, CapabilityRegisterMCPTools)
	}

	registration, err := normalizeWorkerMCPToolRegistration(worker, request)
	if err != nil {
		return err
	}
	if err := h.mcpToolStore.RegisterMCPTool(ctx, registration); err != nil {
		return err
	}
	return nil
}

func (h *WorkerHost) RegisterExternalAgentAdapter(
	ctx context.Context,
	worker WorkerContext,
	request RegisterExternalAgentAdapterRequest,
) error {
	if h == nil || h.externalAgentAdapterStore == nil {
		return ErrWorkerHostExternalAgentRegistrarRequired
	}
	if !worker.hasCapability(CapabilityRegisterExternalAgentAdapter) {
		return fmt.Errorf("%w: %s", ErrWorkerHostCapabilityDenied, CapabilityRegisterExternalAgentAdapter)
	}

	registration, err := normalizeWorkerExternalAgentAdapterRegistration(worker, request)
	if err != nil {
		return err
	}
	if err := h.externalAgentAdapterStore.RegisterExternalAgentAdapter(ctx, registration); err != nil {
		return err
	}
	return nil
}

func (h *WorkerHost) RegisterCodegenTarget(
	ctx context.Context,
	worker WorkerContext,
	request RegisterCodegenTargetRequest,
) error {
	if h == nil || h.codegenTargetStore == nil {
		return ErrWorkerHostCodegenTargetRegistrarNeeded
	}
	if !worker.hasCapability(CapabilityRegisterCodegenTarget) {
		return fmt.Errorf("%w: %s", ErrWorkerHostCapabilityDenied, CapabilityRegisterCodegenTarget)
	}

	registration, err := normalizeWorkerCodegenTargetRegistration(worker, request)
	if err != nil {
		return err
	}
	if err := h.codegenTargetStore.RegisterCodegenTarget(ctx, registration); err != nil {
		return err
	}
	return nil
}

func (h *WorkerHost) Dispatch(
	ctx context.Context,
	worker WorkerContext,
	method string,
	params json.RawMessage,
) (json.RawMessage, error) {
	method = strings.TrimSpace(method)
	if method == "" {
		return nil, ErrWorkerHostMethodRequired
	}

	switch method {
	case HostMethodReadProjectState:
		var request ReadProjectStateRequest
		if err := decodeWorkerHostParamsStrict(params, &request); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrWorkerHostParamsInvalid, err)
		}
		result, err := h.ReadProjectState(ctx, worker, request)
		if err != nil {
			return nil, err
		}
		encoded, err := json.Marshal(result)
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrWorkerHostParamsInvalid, err)
		}
		return encoded, nil
	case HostMethodRegisterMCPTool:
		var request RegisterMCPToolRequest
		if err := decodeWorkerHostParamsStrict(params, &request); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrWorkerHostParamsInvalid, err)
		}
		if err := h.RegisterMCPTool(ctx, worker, request); err != nil {
			return nil, err
		}
		return json.RawMessage(`{"ok":true}`), nil
	case HostMethodRegisterLanguageServer:
		var request RegisterLanguageServerRequest
		if err := decodeWorkerHostParamsStrict(params, &request); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrWorkerHostParamsInvalid, err)
		}
		if err := h.RegisterLanguageServer(ctx, worker, request); err != nil {
			return nil, err
		}
		return json.RawMessage(`{"ok":true}`), nil
	case HostMethodRegisterExternalAgent:
		var request RegisterExternalAgentAdapterRequest
		if err := decodeWorkerHostParamsStrict(params, &request); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrWorkerHostParamsInvalid, err)
		}
		if err := h.RegisterExternalAgentAdapter(ctx, worker, request); err != nil {
			return nil, err
		}
		return json.RawMessage(`{"ok":true}`), nil
	case HostMethodRegisterCodegenTarget:
		var request RegisterCodegenTargetRequest
		if err := decodeWorkerHostParamsStrict(params, &request); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrWorkerHostParamsInvalid, err)
		}
		if err := h.RegisterCodegenTarget(ctx, worker, request); err != nil {
			return nil, err
		}
		return json.RawMessage(`{"ok":true}`), nil
	default:
		return nil, fmt.Errorf("%w: %s", ErrWorkerHostUnsupportedMethod, method)
	}
}

func (c WorkerContext) hasCapability(capability string) bool {
	capability = strings.TrimSpace(capability)
	if capability == "" {
		return false
	}
	for _, existing := range c.EffectiveCapabilities {
		if strings.TrimSpace(existing) == capability {
			return true
		}
	}
	return false
}

func normalizeWorkerMCPToolRegistration(
	worker WorkerContext,
	request RegisterMCPToolRequest,
) (RegisteredMCPTool, error) {
	pluginID := strings.TrimSpace(worker.PluginID)
	if pluginID == "" {
		return RegisteredMCPTool{}, ErrWorkerHostPluginIDRequired
	}
	if request.Tool == nil {
		return RegisteredMCPTool{}, ErrWorkerHostMCPToolRequired
	}

	name := strings.TrimSpace(request.Tool.Name)
	if name == "" {
		return RegisteredMCPTool{}, ErrWorkerHostMCPToolNameRequired
	}
	if request.Tool.InputSchema == nil {
		return RegisteredMCPTool{}, ErrWorkerHostMCPToolInputSchemaRequired
	}
	if request.Tool.Metadata == nil {
		return RegisteredMCPTool{}, ErrWorkerHostMCPToolMetadataRequired
	}

	metadata, err := normalizeWorkerMCPToolMetadata(name, request.Tool.Metadata)
	if err != nil {
		return RegisteredMCPTool{}, err
	}

	return RegisteredMCPTool{
		PluginID:     pluginID,
		Name:         name,
		Description:  strings.TrimSpace(request.Tool.Description),
		InputSchema:  cloneStringAnyMap(request.Tool.InputSchema),
		OutputSchema: cloneStringAnyMap(request.Tool.OutputSchema),
		Metadata:     metadata,
	}, nil
}

func normalizeWorkerMCPToolMetadata(
	toolName string,
	payload *workerMCPToolMetadataDescriptor,
) (tools.Metadata, error) {
	if payload == nil {
		return tools.Metadata{}, ErrWorkerHostMCPToolMetadataRequired
	}

	metadata := tools.Metadata{
		Kind:                          tools.Kind(strings.TrimSpace(payload.Kind)),
		AccessType:                    tools.AccessType(strings.TrimSpace(payload.AccessType)),
		DefaultTargetSingletonSection: strings.TrimSpace(payload.DefaultTargetSingletonSection),
		ResultFilter:                  tools.ResultFilter(strings.TrimSpace(payload.ResultFilter)),
		SearchTags:                    append([]string(nil), payload.SearchTags...),
		SearchCategory:                strings.TrimSpace(payload.SearchCategory),
	}
	if len(payload.IDPathsByType) != 0 {
		metadata.IDPathsByType = make(map[tools.IDType][]string, len(payload.IDPathsByType))
		for rawIDType, paths := range payload.IDPathsByType {
			metadata.IDPathsByType[tools.IDType(strings.TrimSpace(rawIDType))] = append([]string(nil), paths...)
		}
	}
	if len(payload.ResultIDPathsByType) != 0 {
		metadata.ResultIDPathsByType = make(map[tools.IDType][]string, len(payload.ResultIDPathsByType))
		for rawIDType, paths := range payload.ResultIDPathsByType {
			metadata.ResultIDPathsByType[tools.IDType(strings.TrimSpace(rawIDType))] = append([]string(nil), paths...)
		}
	}

	normalized, err := metadata.Normalize(toolName)
	if err != nil {
		return tools.Metadata{}, err
	}
	return normalized, nil
}

func normalizeWorkerLanguageServerRegistration(
	worker WorkerContext,
	request RegisterLanguageServerRequest,
) (RegisteredLanguageServer, error) {
	pluginID := strings.TrimSpace(worker.PluginID)
	if pluginID == "" {
		return RegisteredLanguageServer{}, ErrWorkerHostPluginIDRequired
	}
	if request.Provider == nil {
		return RegisteredLanguageServer{}, ErrWorkerHostLanguageServerRequired
	}

	language := strings.TrimSpace(request.Provider.Language)
	if language == "" {
		return RegisteredLanguageServer{}, ErrWorkerHostLanguageServerLanguageRequired
	}
	if language == string(projectstate.CodeLanguagePython) {
		return RegisteredLanguageServer{}, ErrWorkerHostLanguageServerLanguageInvalid
	}

	command := strings.TrimSpace(request.Provider.Command)
	if command == "" {
		return RegisteredLanguageServer{}, ErrWorkerHostLanguageServerCommandRequired
	}
	normalizedCommand, err := normalizeWorkerLaunchCommand(
		worker,
		command,
		"language server",
		ErrWorkerHostLanguageServerCommandInvalid,
		errWorkerHostLanguageServerCommandPathNotFound,
	)
	if err != nil {
		return RegisteredLanguageServer{}, err
	}

	args, err := normalizeWorkerStringList(request.Provider.Args, false, ErrWorkerHostLanguageServerArgsInvalid)
	if err != nil {
		return RegisteredLanguageServer{}, err
	}

	settingsKey, err := normalizeOptionalWorkerString(request.Provider.SettingsKey, ErrWorkerHostLanguageServerSettingsKeyInvalid)
	if err != nil {
		return RegisteredLanguageServer{}, err
	}

	return RegisteredLanguageServer{
		PluginID:    pluginID,
		Name:        pluginID + ":" + language,
		Language:    language,
		Command:     normalizedCommand,
		Args:        args,
		SettingsKey: settingsKey,
	}, nil
}

func normalizeWorkerExternalAgentAdapterRegistration(
	worker WorkerContext,
	request RegisterExternalAgentAdapterRequest,
) (RegisteredExternalAgentAdapter, error) {
	pluginID := strings.TrimSpace(worker.PluginID)
	if pluginID == "" {
		return RegisteredExternalAgentAdapter{}, ErrWorkerHostPluginIDRequired
	}
	if request.Adapter == nil {
		return RegisteredExternalAgentAdapter{}, ErrWorkerHostExternalAgentAdapterRequired
	}

	localID := strings.TrimSpace(request.Adapter.ID)
	if localID == "" {
		return RegisteredExternalAgentAdapter{}, ErrWorkerHostExternalAgentAdapterIDRequired
	}

	name := strings.TrimSpace(request.Adapter.Name)
	if name == "" {
		return RegisteredExternalAgentAdapter{}, ErrWorkerHostExternalAgentAdapterNameRequired
	}

	runModes, err := normalizeExternalAgentRunModes(request.Adapter.RunModes)
	if err != nil {
		return RegisteredExternalAgentAdapter{}, err
	}

	command := strings.TrimSpace(request.Adapter.Command)
	if command == "" {
		return RegisteredExternalAgentAdapter{}, ErrWorkerHostExternalAgentAdapterCommandRequired
	}
	normalizedCommand, err := normalizeWorkerLaunchCommand(
		worker,
		command,
		"external agent adapter",
		ErrWorkerHostExternalAgentAdapterCommandInvalid,
		errWorkerHostExternalAgentAdapterCommandPathNotFound,
	)
	if err != nil {
		return RegisteredExternalAgentAdapter{}, err
	}

	args, err := normalizeWorkerStringList(request.Adapter.Args, false, ErrWorkerHostExternalAgentAdapterArgsInvalid)
	if err != nil {
		return RegisteredExternalAgentAdapter{}, err
	}
	envVarWhitelist, err := normalizeWorkerStringList(request.Adapter.EnvVarWhitelist, true, ErrWorkerHostExternalAgentEnvWhitelistInvalid)
	if err != nil {
		return RegisteredExternalAgentAdapter{}, err
	}
	defaultModel, err := normalizeOptionalWorkerString(request.Adapter.DefaultModel, ErrWorkerHostExternalAgentDefaultModelInvalid)
	if err != nil {
		return RegisteredExternalAgentAdapter{}, err
	}

	return RegisteredExternalAgentAdapter{
		AdapterID:       pluginID + ":" + localID,
		PluginID:        pluginID,
		Name:            name,
		RunModes:        runModes,
		Command:         normalizedCommand,
		Args:            args,
		EnvVarWhitelist: envVarWhitelist,
		DefaultModel:    defaultModel,
	}, nil
}

func normalizeWorkerCodegenTargetRegistration(
	worker WorkerContext,
	request RegisterCodegenTargetRequest,
) (RegisteredCodegenTarget, error) {
	pluginID := strings.TrimSpace(worker.PluginID)
	if pluginID == "" {
		return RegisteredCodegenTarget{}, ErrWorkerHostPluginIDRequired
	}
	if request.Target == nil {
		return RegisteredCodegenTarget{}, ErrWorkerHostCodegenTargetRequired
	}

	localID := strings.TrimSpace(request.Target.ID)
	if localID == "" {
		return RegisteredCodegenTarget{}, ErrWorkerHostCodegenTargetIDRequired
	}
	if strings.Contains(localID, ":") {
		return RegisteredCodegenTarget{}, ErrWorkerHostCodegenTargetIDInvalid
	}

	name := strings.TrimSpace(request.Target.Name)
	if name == "" {
		return RegisteredCodegenTarget{}, ErrWorkerHostCodegenTargetNameRequired
	}

	language := strings.TrimSpace(request.Target.Language)
	if language == "" {
		return RegisteredCodegenTarget{}, ErrWorkerHostCodegenTargetLanguageNeeded
	}
	if language == string(projectstate.CodeLanguagePython) {
		return RegisteredCodegenTarget{}, ErrWorkerHostCodegenTargetLanguageInvalid
	}

	handlerID := strings.TrimSpace(request.Target.HandlerID)
	if handlerID == "" {
		return RegisteredCodegenTarget{}, ErrWorkerHostCodegenHandlerIDRequired
	}

	defaultFileName := defaultCodegenTargetFileName
	if strings.TrimSpace(request.Target.DefaultFileName) != "" {
		defaultFileName = strings.TrimSpace(request.Target.DefaultFileName)
	}

	return RegisteredCodegenTarget{
		TargetID:        pluginID + ":" + localID,
		PluginID:        pluginID,
		Language:        language,
		Name:            name,
		DefaultFileName: defaultFileName,
		HandlerID:       handlerID,
	}, nil
}

func normalizeWorkerLaunchCommand(
	worker WorkerContext,
	command string,
	registrationKind string,
	invalidError error,
	notFoundError error,
) (string, error) {
	command = strings.TrimSpace(command)
	if command == "" {
		return "", invalidError
	}

	if isPathLikeCommand(command) || filepath.IsAbs(command) {
		resolvedPath, err := resolveWorkerCommandPath(worker, command)
		if err != nil {
			switch {
			case errors.Is(err, os.ErrNotExist):
				return "", fmt.Errorf("%w: plugin %s command path does not exist: %s", notFoundError, registrationKind, strings.TrimSpace(command))
			case errors.Is(err, errWorkerHostCommandPathNotFile):
				return "", fmt.Errorf("%w: plugin %s command path is not a file: %s", invalidError, registrationKind, command)
			case errors.Is(err, errWorkerHostCommandPathNotExecutable):
				return "", fmt.Errorf("%w: plugin %s command path is not executable: %s", invalidError, registrationKind, command)
			default:
				return "", fmt.Errorf("%w: plugin %s command is invalid: %v", invalidError, registrationKind, err)
			}
		}
		return resolvedPath, nil
	}

	resolved, err := exec.LookPath(command)
	if err != nil {
		return "", fmt.Errorf("%w: plugin %s command is not available on PATH: %s", invalidError, registrationKind, command)
	}
	return resolved, nil
}

func resolveWorkerCommandPath(worker WorkerContext, command string) (string, error) {
	if filepath.IsAbs(command) {
		return validateWorkerCommandPath(filepath.Clean(command))
	}

	pluginRoot := strings.TrimSpace(worker.PluginRoot)
	if pluginRoot == "" {
		return "", ErrWorkerHostPluginRootRequired
	}

	resolvedPath, err := statefs.ResolveWithinRoot(pluginRoot, command, "plugin worker launch command")
	if err != nil {
		return "", err
	}
	return validateWorkerCommandPath(resolvedPath)
}

func validateWorkerCommandPath(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", errWorkerHostCommandPathNotFile
	}
	if !workerCommandPathIsExecutable(info) {
		return "", errWorkerHostCommandPathNotExecutable
	}
	return path, nil
}

func workerCommandPathIsExecutable(info os.FileInfo) bool {
	if info == nil {
		return false
	}
	if runtime.GOOS == "windows" {
		return info.Mode().IsRegular()
	}
	return info.Mode().Perm()&0o111 != 0
}

func isPathLikeCommand(command string) bool {
	return strings.Contains(command, "/") || strings.Contains(command, "\\") || strings.HasPrefix(command, ".")
}

func normalizeExternalAgentRunModes(values []string) ([]string, error) {
	if len(values) == 0 {
		return nil, ErrWorkerHostExternalAgentAdapterRunModesRequired
	}

	normalized := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return nil, ErrWorkerHostExternalAgentAdapterRunModeInvalid
		}
		if _, ok := supportedExternalAgentRunModes[trimmed]; !ok {
			return nil, fmt.Errorf("%w: %s", ErrWorkerHostExternalAgentAdapterRunModeInvalid, trimmed)
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	sort.Strings(normalized)
	return normalized, nil
}

func normalizeWorkerStringList(values []string, dedupeAndSort bool, baseErr error) ([]string, error) {
	if len(values) == 0 {
		return []string{}, nil
	}

	normalized := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) == "" && dedupeAndSort {
			continue
		}
		normalized = append(normalized, value)
	}

	if !dedupeAndSort {
		return normalized, nil
	}

	seen := map[string]struct{}{}
	deduped := make([]string, 0, len(normalized))
	for _, value := range normalized {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		deduped = append(deduped, trimmed)
	}
	sort.Strings(deduped)
	if deduped == nil {
		return []string{}, nil
	}
	return deduped, nil
}

func normalizeOptionalWorkerString(value *string, baseErr error) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, baseErr
	}
	return &trimmed, nil
}

func decodeWorkerHostParamsStrict(payload json.RawMessage, destination any) error {
	normalizedPayload := json.RawMessage(`{}`)
	if len(strings.TrimSpace(string(payload))) > 0 {
		normalizedPayload = append(json.RawMessage(nil), payload...)
	}

	decoder := json.NewDecoder(bytes.NewReader(normalizedPayload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	return nil
}
