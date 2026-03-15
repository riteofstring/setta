package plugins

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/projectstate"
)

const (
	CapabilityRegisterCodegenTarget = "registerCodegenTarget"
)

const (
	HostMethodRegisterCodegenTarget = "host.register_codegen_target"
)

var (
	ErrWorkerHostServiceRequired              = errors.New("plugins: worker host requires at least one registered service")
	ErrWorkerHostCodegenTargetRegistrarNeeded = errors.New("plugins: codegen target registrar is required")
	ErrWorkerHostPluginIDRequired             = errors.New("plugins: worker host plugin id is required")
	ErrWorkerHostCapabilityDenied             = errors.New("plugins: worker host capability is required")
	ErrWorkerHostCodegenTargetRequired        = errors.New("plugins: codegen target registration is required")
	ErrWorkerHostCodegenTargetIDRequired      = errors.New("plugins: codegen target id is required")
	ErrWorkerHostCodegenTargetIDInvalid       = errors.New("plugins: codegen target id cannot contain ':'")
	ErrWorkerHostCodegenTargetNameRequired    = errors.New("plugins: codegen target name is required")
	ErrWorkerHostCodegenTargetLanguageNeeded  = errors.New("plugins: codegen target language is required")
	ErrWorkerHostCodegenTargetLanguageInvalid = errors.New("plugins: codegen target language is reserved")
	ErrWorkerHostCodegenHandlerIDRequired     = errors.New("plugins: codegen target handler id is required")
	ErrWorkerHostMethodRequired               = errors.New("plugins: worker host method is required")
	ErrWorkerHostUnsupportedMethod            = errors.New("plugins: unsupported worker host method")
	ErrWorkerHostParamsInvalid                = errors.New("plugins: worker host params are invalid")
)

type WorkerHostOptions struct {
	CodegenTargetRegistrar BackendCodegenTargetRegistrar
}

type WorkerContext struct {
	PluginID              string
	PluginRoot            string
	EffectiveCapabilities []string
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
	codegenTargetStore BackendCodegenTargetRegistrar
}

func NewWorkerHost(options WorkerHostOptions) (*WorkerHost, error) {
	if options.CodegenTargetRegistrar == nil {
		return nil, ErrWorkerHostServiceRequired
	}

	return &WorkerHost{
		codegenTargetStore: options.CodegenTargetRegistrar,
	}, nil
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
