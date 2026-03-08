package plugins

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/statefs"
)

const (
	CapabilityEmitListenerEvents           = "emitListenerEvents"
	CapabilityRegisterRouter               = "registerRouter"
	CapabilityRegisterLanguageServer       = "registerLanguageServer"
	CapabilityRegisterExternalAgentAdapter = "registerExternalAgentAdapter"
	CapabilityRegisterCodegenTarget        = "registerCodegenTarget"
)

const (
	HostMethodEmitListenerDependencyEvent = "host.emit_listener_dependency_event"
	HostMethodRegisterRouter              = "host.register_router"
	HostMethodRegisterLanguageServer      = "host.register_language_server"
	HostMethodRegisterExternalAgent       = "host.register_external_agent_adapter"
	HostMethodRegisterCodegenTarget       = "host.register_codegen_target"
)

var (
	ErrWorkerHostServiceRequired                         = errors.New("plugins: worker host requires at least one registered service")
	ErrWorkerHostListenerProducerRequired                = errors.New("plugins: listener producer is required")
	ErrWorkerHostRouterRegistrarRequired                 = errors.New("plugins: router registrar is required")
	ErrWorkerHostLanguageServerRegistrarRequired         = errors.New("plugins: language server registrar is required")
	ErrWorkerHostExternalAgentRegistrarRequired          = errors.New("plugins: external agent adapter registrar is required")
	ErrWorkerHostCodegenTargetRegistrarNeeded            = errors.New("plugins: codegen target registrar is required")
	ErrWorkerHostPluginIDRequired                        = errors.New("plugins: worker host plugin id is required")
	ErrWorkerHostPluginRootRequired                      = errors.New("plugins: worker host plugin root is required")
	ErrWorkerHostCapabilityDenied                        = errors.New("plugins: worker host capability is required")
	ErrWorkerHostDependencyEventsRequired                = errors.New("plugins: dependency events must contain at least one entry")
	ErrWorkerHostShareSessionRequired                    = errors.New("plugins: share session id is required in deployment mode")
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
	ListenerProducer              *realtime.ListenerProducer
	Deployment                    *deployments.Runtime
	RouterRegistrar               BackendRouterRegistrar
	LanguageServerRegistrar       BackendLanguageServerRegistrar
	ExternalAgentAdapterRegistrar BackendExternalAgentAdapterRegistrar
	CodegenTargetRegistrar        BackendCodegenTargetRegistrar
}

type WorkerContext struct {
	PluginID              string
	PluginRoot            string
	EffectiveCapabilities []string
}

type ListenerDependencyEvent struct {
	DependencyKey json.RawMessage `json:"dependencyKey"`
	Payload       json.RawMessage `json:"payload,omitempty"`
	TimestampMS   int64           `json:"timestampMs"`
}

type EmitListenerDependencyEventsRequest struct {
	ProjectID        string                    `json:"projectConfigId"`
	DependencyEvents []ListenerDependencyEvent `json:"dependencyEvents"`
	ShareSessionID   string                    `json:"shareSessionId,omitempty"`
}

type RegisterRouterRequest struct {
	Prefix *string                        `json:"prefix"`
	Routes []workerBackendRouteDescriptor `json:"routes"`
}

type workerBackendRouteDescriptor struct {
	RouteID      string   `json:"routeId"`
	Path         string   `json:"path"`
	Methods      []string `json:"methods"`
	NeedsRawBody *bool    `json:"needsRawBody"`
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
	listener                  *realtime.ListenerProducer
	deployment                *deployments.Runtime
	routerStore               BackendRouterRegistrar
	languageServerStore       BackendLanguageServerRegistrar
	externalAgentAdapterStore BackendExternalAgentAdapterRegistrar
	codegenTargetStore        BackendCodegenTargetRegistrar
}

func NewWorkerHost(options WorkerHostOptions) (*WorkerHost, error) {
	if options.ListenerProducer == nil &&
		options.RouterRegistrar == nil &&
		options.LanguageServerRegistrar == nil &&
		options.ExternalAgentAdapterRegistrar == nil &&
		options.CodegenTargetRegistrar == nil {
		return nil, ErrWorkerHostServiceRequired
	}

	return &WorkerHost{
		listener:                  options.ListenerProducer,
		deployment:                options.Deployment,
		routerStore:               options.RouterRegistrar,
		languageServerStore:       options.LanguageServerRegistrar,
		externalAgentAdapterStore: options.ExternalAgentAdapterRegistrar,
		codegenTargetStore:        options.CodegenTargetRegistrar,
	}, nil
}

func (h *WorkerHost) EmitListenerDependencyEvents(
	ctx context.Context,
	worker WorkerContext,
	request EmitListenerDependencyEventsRequest,
) error {
	if h == nil || h.listener == nil {
		return ErrWorkerHostListenerProducerRequired
	}
	if !worker.hasCapability(CapabilityEmitListenerEvents) {
		return fmt.Errorf("%w: %s", ErrWorkerHostCapabilityDenied, CapabilityEmitListenerEvents)
	}

	projectID := strings.TrimSpace(request.ProjectID)
	if projectID == "" {
		return projectstate.ErrProjectIDRequired
	}
	if len(request.DependencyEvents) == 0 {
		return ErrWorkerHostDependencyEventsRequired
	}

	shareSessionID := strings.TrimSpace(request.ShareSessionID)
	if h.deployment != nil {
		if shareSessionID == "" {
			return ErrWorkerHostShareSessionRequired
		}
		if err := h.deployment.TouchSession(shareSessionID); err != nil {
			return err
		}
	}

	events := make([]realtime.DependencyEventInput, 0, len(request.DependencyEvents))
	for _, event := range request.DependencyEvents {
		events = append(events, realtime.DependencyEventInput{
			DependencyKey: append(json.RawMessage(nil), event.DependencyKey...),
			Payload:       append(json.RawMessage(nil), event.Payload...),
			TimestampMS:   event.TimestampMS,
		})
	}

	if _, _, err := h.listener.EmitDependencyEvents(ctx, realtime.ProduceDependencyEventsParams{
		ProjectID:        projectID,
		ShareSessionID:   shareSessionID,
		DependencyEvents: events,
	}); err != nil {
		return fmt.Errorf("emit plugin listener dependency events: %w", err)
	}
	return nil
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

func (h *WorkerHost) RegisterRouter(
	ctx context.Context,
	worker WorkerContext,
	request RegisterRouterRequest,
) error {
	if h == nil || h.routerStore == nil {
		return ErrWorkerHostRouterRegistrarRequired
	}
	if !worker.hasCapability(CapabilityRegisterRouter) {
		return fmt.Errorf("%w: %s", ErrWorkerHostCapabilityDenied, CapabilityRegisterRouter)
	}

	registration, err := normalizeWorkerRouterRegistration(worker, request)
	if err != nil {
		return err
	}
	if err := h.routerStore.RegisterRouter(ctx, registration); err != nil {
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
	case HostMethodEmitListenerDependencyEvent:
		decodedParams := json.RawMessage(`{}`)
		if len(strings.TrimSpace(string(params))) > 0 {
			decodedParams = append(json.RawMessage(nil), params...)
		}

		var request EmitListenerDependencyEventsRequest
		if err := json.Unmarshal(decodedParams, &request); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrWorkerHostParamsInvalid, err)
		}
		if err := h.EmitListenerDependencyEvents(ctx, worker, request); err != nil {
			return nil, err
		}
		return json.RawMessage(`{"ok":true}`), nil
	case HostMethodRegisterRouter:
		var request RegisterRouterRequest
		if err := decodeWorkerHostParamsStrict(params, &request); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrWorkerHostParamsInvalid, err)
		}
		if err := h.RegisterRouter(ctx, worker, request); err != nil {
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

func normalizeWorkerRouterRegistration(
	worker WorkerContext,
	request RegisterRouterRequest,
) (RegisteredBackendRouter, error) {
	pluginID := strings.TrimSpace(worker.PluginID)
	if pluginID == "" {
		return RegisteredBackendRouter{}, ErrWorkerHostPluginIDRequired
	}

	prefix, err := normalizeOptionalWorkerRoutePrefix(request.Prefix)
	if err != nil {
		return RegisteredBackendRouter{}, err
	}

	routes := make([]RegisteredBackendRoute, 0, len(request.Routes))
	for _, rawRoute := range request.Routes {
		routeID := strings.TrimSpace(rawRoute.RouteID)
		if routeID == "" {
			return RegisteredBackendRouter{}, ErrWorkerHostRouteIDRequired
		}
		routePath := strings.TrimSpace(rawRoute.Path)
		if routePath == "" {
			return RegisteredBackendRouter{}, ErrWorkerHostRoutePathRequired
		}
		if !strings.HasPrefix(routePath, "/") {
			routePath = "/" + routePath
		}

		routeMethods, err := normalizeWorkerRouteMethods(rawRoute.Methods)
		if err != nil {
			return RegisteredBackendRouter{}, err
		}

		needsRawBody := true
		if rawRoute.NeedsRawBody != nil {
			needsRawBody = *rawRoute.NeedsRawBody
		}

		routes = append(routes, RegisteredBackendRoute{
			RouteID:      routeID,
			Path:         routePath,
			Methods:      routeMethods,
			NeedsRawBody: needsRawBody,
		})
	}

	return RegisteredBackendRouter{
		PluginID: pluginID,
		Prefix:   prefix,
		Routes:   routes,
	}, nil
}

func normalizeWorkerRouteMethods(rawMethods []string) ([]string, error) {
	if rawMethods == nil {
		return nil, ErrWorkerHostRouteMethodsInvalid
	}

	allowedMethods := map[string]struct{}{
		http.MethodGet:    {},
		http.MethodPost:   {},
		http.MethodPut:    {},
		http.MethodPatch:  {},
		http.MethodDelete: {},
	}

	normalized := make([]string, 0, len(rawMethods))
	seen := make(map[string]struct{}, len(rawMethods))
	for _, rawMethod := range rawMethods {
		method := strings.ToUpper(strings.TrimSpace(rawMethod))
		if method == "" {
			return nil, ErrWorkerHostRouteMethodsInvalid
		}
		if _, ok := allowedMethods[method]; !ok {
			return nil, fmt.Errorf("%w: %s", ErrWorkerHostRouteMethodUnsupported, method)
		}
		if _, ok := seen[method]; ok {
			continue
		}
		seen[method] = struct{}{}
		normalized = append(normalized, method)
	}
	if len(normalized) == 0 {
		return nil, ErrWorkerHostRouteMethodsInvalid
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
