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
)

const (
	CapabilityRegisterLanguageServer = "registerLanguageServer"
	CapabilityRegisterCodegenTarget  = "registerCodegenTarget"
)

const (
	HostMethodRegisterLanguageServer = "host.register_language_server"
	HostMethodRegisterCodegenTarget  = "host.register_codegen_target"
)

var (
	ErrWorkerHostServiceRequired                   = errors.New("plugins: worker host requires at least one registered service")
	ErrWorkerHostLanguageServerRegistrarRequired   = errors.New("plugins: language server registrar is required")
	ErrWorkerHostCodegenTargetRegistrarNeeded      = errors.New("plugins: codegen target registrar is required")
	ErrWorkerHostPluginIDRequired                  = errors.New("plugins: worker host plugin id is required")
	ErrWorkerHostPluginRootRequired                = errors.New("plugins: worker host plugin root is required")
	ErrWorkerHostCapabilityDenied                  = errors.New("plugins: worker host capability is required")
	ErrWorkerHostLanguageServerRequired            = errors.New("plugins: language server registration is required")
	ErrWorkerHostLanguageServerLanguageRequired    = errors.New("plugins: language server language is required")
	ErrWorkerHostLanguageServerLanguageInvalid     = errors.New("plugins: language server language is reserved")
	ErrWorkerHostLanguageServerCommandRequired     = errors.New("plugins: language server command is required")
	ErrWorkerHostLanguageServerCommandInvalid      = errors.New("plugins: language server command is invalid")
	ErrWorkerHostLanguageServerArgsInvalid         = errors.New("plugins: language server args are invalid")
	ErrWorkerHostLanguageServerSettingsKeyInvalid  = errors.New("plugins: language server settings key is invalid")
	ErrWorkerHostCodegenTargetRequired             = errors.New("plugins: codegen target registration is required")
	ErrWorkerHostCodegenTargetIDRequired           = errors.New("plugins: codegen target id is required")
	ErrWorkerHostCodegenTargetIDInvalid            = errors.New("plugins: codegen target id cannot contain ':'")
	ErrWorkerHostCodegenTargetNameRequired         = errors.New("plugins: codegen target name is required")
	ErrWorkerHostCodegenTargetLanguageNeeded       = errors.New("plugins: codegen target language is required")
	ErrWorkerHostCodegenTargetLanguageInvalid      = errors.New("plugins: codegen target language is reserved")
	ErrWorkerHostCodegenHandlerIDRequired          = errors.New("plugins: codegen target handler id is required")
	ErrWorkerHostMethodRequired                    = errors.New("plugins: worker host method is required")
	ErrWorkerHostUnsupportedMethod                 = errors.New("plugins: unsupported worker host method")
	ErrWorkerHostParamsInvalid                     = errors.New("plugins: worker host params are invalid")
	errWorkerHostLanguageServerCommandPathNotFound = errors.New("plugins: language server command path does not exist")
	errWorkerHostCommandPathNotFile                = errors.New("plugins: command path is not a file")
	errWorkerHostCommandPathNotExecutable          = errors.New("plugins: command path is not executable")
)

type WorkerHostOptions struct {
	LanguageServerRegistrar BackendLanguageServerRegistrar
	CodegenTargetRegistrar  BackendCodegenTargetRegistrar
}

type WorkerContext struct {
	PluginID              string
	PluginRoot            string
	EffectiveCapabilities []string
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
	languageServerStore BackendLanguageServerRegistrar
	codegenTargetStore  BackendCodegenTargetRegistrar
}

func NewWorkerHost(options WorkerHostOptions) (*WorkerHost, error) {
	if options.LanguageServerRegistrar == nil &&
		options.CodegenTargetRegistrar == nil {
		return nil, ErrWorkerHostServiceRequired
	}

	return &WorkerHost{
		languageServerStore: options.LanguageServerRegistrar,
		codegenTargetStore:  options.CodegenTargetRegistrar,
	}, nil
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
	case HostMethodRegisterLanguageServer:
		var request RegisterLanguageServerRequest
		if err := decodeWorkerHostParamsStrict(params, &request); err != nil {
			return nil, fmt.Errorf("%w: %v", ErrWorkerHostParamsInvalid, err)
		}
		if err := h.RegisterLanguageServer(ctx, worker, request); err != nil {
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
