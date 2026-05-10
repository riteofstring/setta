package managedllm

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/chatattachments"
	"setta/internal/managedchat"
	"setta/internal/mcpx"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	anthropicoption "github.com/anthropics/anthropic-sdk-go/option"
	openai "github.com/openai/openai-go/v3"
	openaioption "github.com/openai/openai-go/v3/option"
	"google.golang.org/genai"
)

const (
	openAIProvider       = "openai"
	anthropicProvider    = "anthropic"
	geminiProvider       = "gemini"
	defaultOpenAIBaseURL = "https://api.openai.com/v1"
	defaultAnthropicBase = "https://api.anthropic.com/"
	managedChatRunType   = "llm_chat"
)

var (
	ErrProviderUnsupported    = errors.New("managed llm provider is not supported")
	ErrProviderConfigInvalid  = errors.New("managed llm provider config is invalid")
	ErrReasoningUnsupported   = errors.New("managed llm reasoning is not supported without explicit provider-native config")
	ErrToolsUnsupported       = errors.New("managed llm tools are not supported")
	ErrAttachmentsUnsupported = errors.New("managed llm attachments are not supported")
	ErrHistoryUnsupported     = errors.New("managed llm chat history is not supported")
	ErrAPIKeyRequired         = errors.New("managed llm api key is required")
	ErrModelRequired          = errors.New("managed llm model is required")
)

type ExecutorOptions struct {
	Live         *managedchat.LiveRuntime
	Tools        ToolClient
	HTTPClient   *http.Client
	Attachments  *chatattachments.Service
	ResultFollow *ToolResultFollowEmitter
}

type Executor struct {
	live           *managedchat.LiveRuntime
	tools          ToolClient
	httpClient     *http.Client
	attachments    *chatattachments.Service
	resultFollow   *ToolResultFollowEmitter
	contextWindows *contextWindowCache
}

type preparedExecution struct {
	provider                  string
	openAIClient              openai.Client
	anthropicClient           anthropic.Client
	geminiClient              *genai.Client
	projectConfigID           *string
	sectionID                 *string
	chatID                    string
	runID                     string
	emitStream                bool
	systemPrompt              string
	openAIChatRequestOpts     []openaioption.RequestOption
	openAIResponseRequestOpts []openaioption.RequestOption
	anthropicRequestOpts      []anthropicoption.RequestOption
	model                     string
	transcript                []map[string]any
	executionTranscript       []map[string]any
	providerMessages          []map[string]any
	toolDefinitions           []map[string]any
	availableTools            map[string]mcpx.ToolDescriptor
	toolAllowlist             *toolAllowlist
	temporaryToCanonical      map[string]string
}

func NewExecutor(options ExecutorOptions) *Executor {
	httpClient := options.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Executor{
		live:           options.Live,
		tools:          options.Tools,
		httpClient:     httpClient,
		attachments:    options.Attachments,
		resultFollow:   options.ResultFollow,
		contextWindows: newContextWindowCache(),
	}
}

func (e *Executor) Execute(ctx context.Context, request agentruns.ExecutionRequest) (agentruns.ExecutionResult, error) {
	prepared, err := e.prepareExecution(request)
	if err != nil {
		return agentruns.ExecutionResult{}, err
	}
	return e.executeConversation(ctx, prepared, request)
}

func (e *Executor) Validate(request agentruns.ExecutionRequest) error {
	if _, err := resolveManagedProvider(request); err != nil {
		return err
	}
	if err := validateProviderConfig(request); err != nil {
		return err
	}
	return validateReasoningRequest(request)
}

func (e *Executor) prepareExecution(request agentruns.ExecutionRequest) (preparedExecution, error) {
	provider, err := validatePreparedExecutionRequest(request)
	if err != nil {
		return preparedExecution{}, err
	}
	prepared, err := e.prepareExecutionBase(provider, request)
	if err != nil {
		return preparedExecution{}, err
	}
	return e.attachPreparedExecutionProvider(prepared, request)
}

func validatePreparedExecutionRequest(request agentruns.ExecutionRequest) (string, error) {
	provider, err := resolveManagedProvider(request)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(request.LLMConfig.Model) == "" {
		return "", ErrModelRequired
	}
	if err := validateProviderConfig(request); err != nil {
		return "", err
	}
	if err := validateReasoningRequest(request); err != nil {
		return "", err
	}
	return provider, nil
}

func (e *Executor) prepareExecutionBase(provider string, request agentruns.ExecutionRequest) (preparedExecution, error) {
	transcript, executionTranscript, providerMessages, err := e.buildMessages(provider, request)
	if err != nil {
		return preparedExecution{}, err
	}
	toolDefinitions, availableTools, allowlist, err := buildToolDefinitions(request, e.tools)
	if err != nil {
		return preparedExecution{}, err
	}
	temporaryToCanonical, err := resolveTemporaryToCanonical(request)
	if err != nil {
		return preparedExecution{}, err
	}
	return preparedExecution{
		provider:             provider,
		projectConfigID:      optionalStringPointer(request.ProjectConfigID),
		sectionID:            cloneStringPointer(request.SectionID),
		chatID:               strings.TrimSpace(request.ChatID),
		runID:                strings.TrimSpace(request.Run.ID),
		emitStream:           shouldEmitManagedChatStream(request),
		systemPrompt:         strings.TrimSpace(request.SystemPrompt),
		model:                request.LLMConfig.Model,
		transcript:           transcript,
		executionTranscript:  executionTranscript,
		providerMessages:     providerMessages,
		toolDefinitions:      toolDefinitions,
		availableTools:       availableTools,
		toolAllowlist:        allowlist,
		temporaryToCanonical: temporaryToCanonical,
	}, nil
}

func (e *Executor) attachPreparedExecutionProvider(
	prepared preparedExecution,
	request agentruns.ExecutionRequest,
) (preparedExecution, error) {
	switch prepared.provider {
	case openAIProvider:
		client, clientErr := buildOpenAIClient(request, e.httpClient)
		if clientErr != nil {
			return preparedExecution{}, clientErr
		}
		chatRequestOpts, optsErr := buildOpenAIChatRequestOverrides(request)
		if optsErr != nil {
			return preparedExecution{}, optsErr
		}
		prepared.openAIClient = client
		prepared.openAIChatRequestOpts = chatRequestOpts
		prepared.openAIResponseRequestOpts = buildOpenAIResponseRequestOverrides(request)
	case anthropicProvider:
		client, clientErr := buildAnthropicClient(request, e.httpClient)
		if clientErr != nil {
			return preparedExecution{}, clientErr
		}
		requestOpts, optsErr := buildAnthropicRequestOverrides(request)
		if optsErr != nil {
			return preparedExecution{}, optsErr
		}
		prepared.anthropicClient = client
		prepared.anthropicRequestOpts = requestOpts
	case geminiProvider:
		client, clientErr := buildGeminiClient(request, e.httpClient)
		if clientErr != nil {
			return preparedExecution{}, clientErr
		}
		prepared.geminiClient = client
	default:
		return preparedExecution{}, fmt.Errorf("%w: %q", ErrProviderUnsupported, prepared.provider)
	}
	return prepared, nil
}

func resolveManagedProvider(request agentruns.ExecutionRequest) (string, error) {
	provider := strings.ToLower(strings.TrimSpace(resolveProviderHint(request)))
	switch provider {
	case openAIProvider, anthropicProvider, geminiProvider:
		return provider, nil
	default:
		if isAzureOpenAIProvider(provider) {
			return openAIProvider, nil
		}
		return "", fmt.Errorf("%w: %q", ErrProviderUnsupported, provider)
	}
}

func validateProviderConfig(request agentruns.ExecutionRequest) error {
	if !isAzureOpenAIProvider(resolveProviderHint(request)) {
		return nil
	}
	return validateAzureOpenAIConfig(request)
}

func validateAzureOpenAIConfig(request agentruns.ExecutionRequest) error {
	if strings.TrimSpace(request.LLMConfig.APIKeyEnv) == "" {
		return fmt.Errorf("%w: azure provider requires explicit api_key_env", ErrProviderConfigInvalid)
	}
	if _, err := resolveAzureEndpoint(request); err != nil {
		return err
	}
	if _, err := resolveAzureAPIVersion(request); err != nil {
		return err
	}
	return nil
}

func validateReasoningRequest(request agentruns.ExecutionRequest) error {
	if !request.Thinking {
		return nil
	}
	provider, err := resolveManagedProvider(request)
	if err != nil {
		return err
	}
	switch provider {
	case openAIProvider:
		_, _, err = resolveThinkingReasoningEffort(request)
		return err
	case anthropicProvider:
		_, _, err = resolveAnthropicThinkingConfig(request)
		return err
	case geminiProvider:
		_, _, err = resolveGeminiThinkingConfig(request)
		return err
	default:
		return fmt.Errorf("%w: %q", ErrProviderUnsupported, provider)
	}
}

func appendConversationMessages(
	transcript *[]map[string]any,
	executionTranscript *[]map[string]any,
	messages ...map[string]any,
) {
	for _, message := range messages {
		*transcript = append(*transcript, cloneMessage(message))
		*executionTranscript = append(*executionTranscript, cloneMessage(message))
	}
}

func appendPersistedAssistantTurn(
	transcript *[]map[string]any,
	executionTranscript *[]map[string]any,
	assistantMessage map[string]any,
) ([]map[string]any, bool) {
	if !shouldPersistMessage(assistantMessage) {
		return nil, false
	}
	appendConversationMessages(transcript, executionTranscript, assistantMessage)
	return assistantToolCalls(assistantMessage), true
}

func appendAssistantProviderPayload(
	providerMessages *[]map[string]any,
	provider string,
	assistantMessage map[string]any,
) error {
	providerPayload, include, err := providerPayloadForMessage(provider, assistantMessage)
	if err != nil {
		return err
	}
	if include {
		*providerMessages = append(*providerMessages, providerPayload)
	}
	return nil
}
