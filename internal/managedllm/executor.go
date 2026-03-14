package managedllm

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	anthropicoption "github.com/anthropics/anthropic-sdk-go/option"
	openai "github.com/openai/openai-go/v3"
	openaioption "github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/responses"
	"google.golang.org/genai"
	"setta/internal/agentruns"
	"setta/internal/chatattachments"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/realtime"
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
	live         *managedchat.LiveRuntime
	tools        ToolClient
	httpClient   *http.Client
	attachments  *chatattachments.Service
	resultFollow *ToolResultFollowEmitter
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
		live:         options.Live,
		tools:        options.Tools,
		httpClient:   httpClient,
		attachments:  options.Attachments,
		resultFollow: options.ResultFollow,
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
	provider, err := resolveManagedProvider(request)
	if err != nil {
		return preparedExecution{}, err
	}
	if strings.TrimSpace(request.LLMConfig.Model) == "" {
		return preparedExecution{}, ErrModelRequired
	}
	if err := validateProviderConfig(request); err != nil {
		return preparedExecution{}, err
	}
	if err := validateReasoningRequest(request); err != nil {
		return preparedExecution{}, err
	}

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

	prepared := preparedExecution{
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
	}
	switch provider {
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
		return preparedExecution{}, fmt.Errorf("%w: %q", ErrProviderUnsupported, provider)
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

func (e *Executor) executeConversation(ctx context.Context, prepared preparedExecution, request agentruns.ExecutionRequest) (agentruns.ExecutionResult, error) {
	transcript := cloneMessageSlice(prepared.transcript)
	executionTranscript := cloneMessageSlice(prepared.executionTranscript)
	providerMessages := cloneMessageSlice(prepared.providerMessages)
	toolCalls := []map[string]any{}
	var usage map[string]any

	for round := 0; round < maxToolCallRounds; round++ {
		assistantMessage := newAssistantMessage()
		turnUsage, err := e.executeTurn(ctx, prepared, assistantMessage, executionTranscript, providerMessages, request)
		if turnUsage != nil {
			usage = turnUsage
		}
		if err != nil {
			if shouldPersistMessage(assistantMessage) {
				transcript = append(transcript, cloneMessage(assistantMessage))
				executionTranscript = append(executionTranscript, cloneMessage(assistantMessage))
				assistantTurnToolCalls := assistantToolCalls(assistantMessage)
				if len(assistantTurnToolCalls) > 0 {
					toolCalls = append(toolCalls, cloneToolCallMaps(assistantTurnToolCalls)...)
				}
			}
			result := e.buildResult(transcript, toolCalls, usage)
			if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
				return result, context.Canceled
			}
			return result, err
		}

		if shouldPersistMessage(assistantMessage) {
			transcript = append(transcript, cloneMessage(assistantMessage))
			executionTranscript = append(executionTranscript, cloneMessage(assistantMessage))
			providerPayload, include, payloadErr := providerPayloadForMessage(prepared.provider, assistantMessage)
			if payloadErr != nil {
				return e.buildResult(transcript, toolCalls, usage), payloadErr
			}
			if include {
				providerMessages = append(providerMessages, providerPayload)
			}
		}

		assistantTurnToolCalls := assistantToolCalls(assistantMessage)
		if len(assistantTurnToolCalls) == 0 {
			return e.buildResult(transcript, toolCalls, usage), nil
		}
		toolCalls = append(toolCalls, cloneToolCallMaps(assistantTurnToolCalls)...)

		toolMessages, providerToolMessages, toolErr := e.executeToolCalls(ctx, prepared, request, assistantTurnToolCalls)
		if toolErr != nil {
			return e.buildResult(transcript, toolCalls, usage), toolErr
		}
		for _, toolMessage := range toolMessages {
			transcript = append(transcript, cloneMessage(toolMessage))
			executionTranscript = append(executionTranscript, cloneMessage(toolMessage))
		}
		providerMessages = append(providerMessages, providerToolMessages...)
	}

	return e.buildResult(transcript, toolCalls, usage), ErrToolLoopLimitExceeded
}

func (e *Executor) executeTurn(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	executionTranscript []map[string]any,
	providerMessages []map[string]any,
	request agentruns.ExecutionRequest,
) (map[string]any, error) {
	if prepared.emitStream {
		if err := e.applyChunk(ctx, prepared, realtime.MessageStartEvent{
			Type:    realtime.StreamingEventTypeMessageStart,
			Message: cloneMessage(assistantMessage),
		}); err != nil {
			return nil, err
		}
	}

	usage, err := e.consumeProviderStream(ctx, prepared, assistantMessage, executionTranscript, providerMessages, request)
	compactAssistantContent(assistantMessage)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
			if finishErr := e.finishStream(ctx, prepared, assistantMessage, true); finishErr != nil {
				return usage, finishErr
			}
			return usage, context.Canceled
		}
		if finishErr := e.finishStream(ctx, prepared, assistantMessage, true); finishErr != nil {
			return usage, finishErr
		}
		return usage, err
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		if err := e.finishStream(ctx, prepared, assistantMessage, true); err != nil {
			return usage, err
		}
		return usage, context.Canceled
	}
	if err := e.finishStream(ctx, prepared, assistantMessage, false); err != nil {
		return usage, err
	}
	return usage, nil
}

func (e *Executor) consumeProviderStream(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	executionTranscript []map[string]any,
	providerMessages []map[string]any,
	request agentruns.ExecutionRequest,
) (map[string]any, error) {
	switch prepared.provider {
	case openAIProvider:
		if request.Thinking {
			requestBody, err := buildOpenAIResponsesParams(
				request,
				prepared.model,
				prepared.systemPrompt,
				executionTranscript,
				prepared.toolDefinitions,
			)
			if err != nil {
				return nil, err
			}
			return e.consumeOpenAIResponsesStream(ctx, prepared, assistantMessage, requestBody)
		}
		requestBody, err := buildOpenAIChatCompletionParams(prepared.model, providerMessages, prepared.toolDefinitions)
		if err != nil {
			return nil, err
		}
		return e.consumeOpenAIStream(ctx, prepared, assistantMessage, requestBody)
	case anthropicProvider:
		requestBody, err := buildAnthropicMessageParams(request, prepared.systemPrompt, providerMessages, prepared.toolDefinitions)
		if err != nil {
			return nil, err
		}
		return e.consumeAnthropicStream(ctx, prepared, assistantMessage, requestBody)
	case geminiProvider:
		return e.consumeGeminiStream(
			ctx,
			prepared,
			assistantMessage,
			prepared.systemPrompt,
			providerMessages,
			request,
		)
	default:
		return nil, fmt.Errorf("%w: %q", ErrProviderUnsupported, prepared.provider)
	}
}

func (e *Executor) consumeOpenAIStream(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	requestBody openai.ChatCompletionNewParams,
) (map[string]any, error) {
	var usage map[string]any
	accumulator := newToolCallAccumulator()
	previewAccumulator := newToolPreviewAccumulator()

	stream := prepared.openAIClient.Chat.Completions.NewStreaming(ctx, requestBody, prepared.openAIChatRequestOpts...)
	for stream.Next() {
		if ctx.Err() != nil {
			finalizeAssistantToolCallsBestEffort(assistantMessage, accumulator)
			return usage, context.Canceled
		}
		nextUsage, err := e.processOpenAIChunk(
			ctx,
			stream.Current(),
			prepared,
			assistantMessage,
			accumulator,
			previewAccumulator,
		)
		if err != nil {
			finalizeAssistantToolCallsBestEffort(assistantMessage, accumulator)
			return usage, err
		}
		if nextUsage != nil {
			usage = nextUsage
		}
	}
	if err := stream.Err(); err != nil {
		finalizeAssistantToolCallsBestEffort(assistantMessage, accumulator)
		return usage, wrapOpenAIProviderError(err)
	}
	if finalizeErr := finalizeAssistantToolCalls(assistantMessage, accumulator); finalizeErr != nil {
		return usage, finalizeErr
	}
	return usage, nil
}

func (e *Executor) consumeOpenAIResponsesStream(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	requestBody responses.ResponseNewParams,
) (map[string]any, error) {
	var usage map[string]any
	accumulator := newToolCallAccumulator()
	previewAccumulator := newToolPreviewAccumulator()
	streamState := &openAIResponseStreamState{}

	stream := prepared.openAIClient.Responses.NewStreaming(ctx, requestBody, prepared.openAIResponseRequestOpts...)
	for stream.Next() {
		if ctx.Err() != nil {
			if err := e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, !streamState.reasoningEmitted); err != nil {
				finalizeAssistantToolCallsBestEffort(assistantMessage, accumulator)
				return usage, err
			}
			finalizeAssistantToolCallsBestEffort(assistantMessage, accumulator)
			return usage, context.Canceled
		}
		nextUsage, err := e.processOpenAIResponseEvent(
			ctx,
			stream.Current(),
			prepared,
			assistantMessage,
			accumulator,
			previewAccumulator,
			streamState,
		)
		if err != nil {
			if flushErr := e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, !streamState.reasoningEmitted); flushErr != nil {
				finalizeAssistantToolCallsBestEffort(assistantMessage, accumulator)
				return usage, flushErr
			}
			finalizeAssistantToolCallsBestEffort(assistantMessage, accumulator)
			return usage, err
		}
		if nextUsage != nil {
			usage = nextUsage
		}
	}
	if err := stream.Err(); err != nil {
		if flushErr := e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, !streamState.reasoningEmitted); flushErr != nil {
			finalizeAssistantToolCallsBestEffort(assistantMessage, accumulator)
			return usage, flushErr
		}
		finalizeAssistantToolCallsBestEffort(assistantMessage, accumulator)
		return usage, wrapOpenAIProviderError(err)
	}
	if err := e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, !streamState.reasoningEmitted); err != nil {
		return usage, err
	}
	if finalizeErr := finalizeAssistantToolCalls(assistantMessage, accumulator); finalizeErr != nil {
		return usage, finalizeErr
	}
	return usage, nil
}

func (e *Executor) processOpenAIChunk(
	ctx context.Context,
	chunk openai.ChatCompletionChunk,
	prepared preparedExecution,
	assistantMessage map[string]any,
	accumulator *toolCallAccumulator,
	previewAccumulator *toolPreviewAccumulator,
) (map[string]any, error) {
	var usage map[string]any
	if chunk.JSON.Usage.Valid() {
		usage = buildCompletionUsagePayload(chunk.Usage)
	}
	for _, choice := range chunk.Choices {
		text := choice.Delta.Content
		if text != "" {
			appendAssistantText(assistantMessage, text)
		}
		if prepared.emitStream && text != "" {
			if err := e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
				Type:      realtime.StreamingEventTypeDelta,
				MessageID: stringValue(assistantMessage["id"]),
				Content: []any{
					realtime.MessageTextDelta{
						Type:  realtime.MessageContentTypeTextDelta,
						Index: 0,
						Text:  text,
					},
				},
			}); err != nil {
				return usage, err
			}
		}
		for _, toolCall := range choice.Delta.ToolCalls {
			argumentsDelta := toolCall.Function.Arguments
			state := accumulator.apply(int(toolCall.Index), toolCall.ID, toolCall.Function.Name, argumentsDelta)
			if !prepared.emitStream || state == nil {
				continue
			}
			var toolName *string
			if strings.TrimSpace(state.name) != "" {
				toolName = optionalStringPointer(state.name)
			}
			if err := e.applyChunk(ctx, prepared, realtime.ToolCallDeltaEvent{
				Type:           realtime.StreamingEventTypeToolCallDelta,
				MessageID:      stringValue(assistantMessage["id"]),
				ToolCallID:     strings.TrimSpace(state.id),
				ArgumentsDelta: argumentsDelta,
				ToolName:       toolName,
			}); err != nil {
				return usage, err
			}
			descriptor, ok := prepared.availableTools[mcpx.NormalizeToolName(state.name)]
			if !ok || descriptor.Metadata == nil || descriptor.Metadata.ToolArgumentPreview == nil {
				continue
			}
			previewEvent, err := previewAccumulator.buildEvent(
				stringValue(assistantMessage["id"]),
				state,
				descriptor.Metadata.ToolArgumentPreview,
				argumentsDelta,
				prepared.temporaryToCanonical,
			)
			if err != nil {
				return usage, err
			}
			if previewEvent == nil {
				continue
			}
			if err := e.applyChunk(ctx, prepared, *previewEvent); err != nil {
				return usage, err
			}
		}
	}
	return usage, nil
}

type openAIResponseStreamState struct {
	reasoningSeen    bool
	reasoningEmitted bool
	summary          string
	summaryParts     map[int]string
	bufferedText     strings.Builder
}

func (e *Executor) processOpenAIResponseEvent(
	ctx context.Context,
	event responses.ResponseStreamEventUnion,
	prepared preparedExecution,
	assistantMessage map[string]any,
	accumulator *toolCallAccumulator,
	previewAccumulator *toolPreviewAccumulator,
	streamState *openAIResponseStreamState,
) (map[string]any, error) {
	switch typed := event.AsAny().(type) {
	case responses.ResponseOutputItemAddedEvent:
		switch item := typed.Item.AsAny().(type) {
		case responses.ResponseReasoningItem:
			prepareAssistantForOpenAIResponseReasoning(assistantMessage)
			streamState.reasoningSeen = true
			summary := joinOpenAIResponseReasoningSummary(item.Summary)
			if strings.TrimSpace(summary) != "" && strings.TrimSpace(streamState.summary) == "" {
				streamState.summary = summary
				streamState.summaryParts = openAIResponseReasoningSummaryParts(item.Summary)
				streamState.reasoningEmitted = true
				setAssistantThinkingSummaryAtIndex(assistantMessage, 0, summary)
			}
			reasoning := joinOpenAIResponseReasoningContent(item.Content)
			if strings.TrimSpace(reasoning) != "" {
				streamState.reasoningEmitted = true
				appendAssistantThinkingAtIndex(assistantMessage, 0, reasoning)
			}
		case responses.ResponseFunctionToolCall:
			previousArguments := accumulator.currentArguments(int(typed.OutputIndex))
			state := accumulator.applyResolved(int(typed.OutputIndex), item.CallID, item.Name, item.Arguments)
			argumentsDelta := authoritativeResponseReplacementSuffix(previousArguments, item.Arguments)
			if err := e.emitOpenAIResponseToolArgumentUpdate(
				ctx,
				prepared,
				assistantMessage,
				previewAccumulator,
				state,
				argumentsDelta,
			); err != nil {
				return nil, err
			}
		}
	case responses.ResponseOutputItemDoneEvent:
		switch item := typed.Item.AsAny().(type) {
		case responses.ResponseFunctionToolCall:
			previousArguments := accumulator.currentArguments(int(typed.OutputIndex))
			state := accumulator.applyResolved(int(typed.OutputIndex), item.CallID, item.Name, item.Arguments)
			argumentsDelta := authoritativeResponseReplacementSuffix(previousArguments, item.Arguments)
			if err := e.emitOpenAIResponseToolArgumentUpdate(
				ctx,
				prepared,
				assistantMessage,
				previewAccumulator,
				state,
				argumentsDelta,
			); err != nil {
				return nil, err
			}
		default:
			e.applyOpenAIResponseOutputItemFallback(
				assistantMessage,
				typed.Item,
				int(typed.OutputIndex),
				streamState,
				accumulator,
			)
		}
	case responses.ResponseContentPartAddedEvent:
		if err := e.applyOpenAIResponseContentPartAdded(ctx, prepared, assistantMessage, streamState, typed.Part); err != nil {
			return nil, err
		}
	case responses.ResponseContentPartDoneEvent:
		if err := e.applyOpenAIResponseContentPartDone(ctx, prepared, assistantMessage, streamState, typed.Part); err != nil {
			return nil, err
		}
	case responses.ResponseReasoningSummaryPartAddedEvent:
		if err := e.applyOpenAIResponseSummaryPartUpdate(
			ctx,
			prepared,
			assistantMessage,
			streamState,
			int(typed.SummaryIndex),
			typed.Part.Text,
		); err != nil {
			return nil, err
		}
	case responses.ResponseReasoningSummaryPartDoneEvent:
		if err := e.applyOpenAIResponseSummaryPartUpdate(
			ctx,
			prepared,
			assistantMessage,
			streamState,
			int(typed.SummaryIndex),
			typed.Part.Text,
		); err != nil {
			return nil, err
		}
	case responses.ResponseReasoningSummaryTextDeltaEvent:
		prepareAssistantForOpenAIResponseReasoning(assistantMessage)
		streamState.reasoningSeen = true
		streamState.reasoningEmitted = true
		previousSummary := streamState.summary
		streamState.summary = appendOpenAIResponseSummaryPartText(streamState, int(typed.SummaryIndex), typed.Delta)
		setAssistantThinkingSummaryAtIndex(assistantMessage, 0, streamState.summary)
		if strings.TrimSpace(previousSummary) != strings.TrimSpace(streamState.summary) {
			if err := e.emitOpenAIResponseThinkingDelta(ctx, prepared, assistantMessage, 0, "", optionalStringPointer(streamState.summary)); err != nil {
				return nil, err
			}
		}
		if err := e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, false); err != nil {
			return nil, err
		}
	case responses.ResponseReasoningSummaryTextDoneEvent:
		if strings.TrimSpace(typed.Text) == "" {
			return nil, nil
		}
		prepareAssistantForOpenAIResponseReasoning(assistantMessage)
		streamState.reasoningSeen = true
		streamState.reasoningEmitted = true
		previousSummary := streamState.summary
		streamState.summary = setOpenAIResponseSummaryPartText(streamState, int(typed.SummaryIndex), typed.Text)
		setAssistantThinkingSummaryAtIndex(assistantMessage, 0, streamState.summary)
		if strings.TrimSpace(previousSummary) != strings.TrimSpace(streamState.summary) {
			if err := e.emitOpenAIResponseThinkingDelta(ctx, prepared, assistantMessage, 0, "", optionalStringPointer(streamState.summary)); err != nil {
				return nil, err
			}
		}
		if err := e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, false); err != nil {
			return nil, err
		}
	case responses.ResponseReasoningTextDeltaEvent:
		prepareAssistantForOpenAIResponseReasoning(assistantMessage)
		streamState.reasoningSeen = true
		streamState.reasoningEmitted = true
		appendAssistantThinkingAtIndex(assistantMessage, 0, typed.Delta)
		if err := e.emitOpenAIResponseThinkingDelta(ctx, prepared, assistantMessage, 0, typed.Delta, nil); err != nil {
			return nil, err
		}
		if err := e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, false); err != nil {
			return nil, err
		}
	case responses.ResponseReasoningTextDoneEvent:
		if strings.TrimSpace(typed.Text) == "" {
			return nil, nil
		}
		prepareAssistantForOpenAIResponseReasoning(assistantMessage)
		streamState.reasoningSeen = true
		streamState.reasoningEmitted = true
		thinkingDelta := authoritativeResponseReplacementSuffix(currentAssistantThinkingTextAtIndex(assistantMessage, 0), typed.Text)
		setAssistantThinkingTextAtIndex(assistantMessage, 0, typed.Text)
		if thinkingDelta != "" {
			if err := e.emitOpenAIResponseThinkingDelta(ctx, prepared, assistantMessage, 0, thinkingDelta, nil); err != nil {
				return nil, err
			}
		}
		if err := e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, false); err != nil {
			return nil, err
		}
	case responses.ResponseTextDeltaEvent:
		if err := e.applyOpenAIResponseTextDelta(ctx, prepared, assistantMessage, streamState, typed.Delta); err != nil {
			return nil, err
		}
	case responses.ResponseTextDoneEvent:
		if strings.TrimSpace(typed.Text) != "" {
			textIndex := openAIResponseTextIndex(assistantMessage, streamState)
			textDelta := authoritativeResponseReplacementSuffix(currentAssistantTextAtIndex(assistantMessage, textIndex), typed.Text)
			setAssistantTextAtIndex(assistantMessage, textIndex, typed.Text)
			if textDelta != "" {
				if err := e.emitOpenAIResponseTextDelta(ctx, prepared, assistantMessage, textIndex, textDelta); err != nil {
					return nil, err
				}
			}
		}
	case responses.ResponseRefusalDeltaEvent:
		if err := e.applyOpenAIResponseTextDelta(ctx, prepared, assistantMessage, streamState, typed.Delta); err != nil {
			return nil, err
		}
	case responses.ResponseRefusalDoneEvent:
		if strings.TrimSpace(typed.Refusal) != "" {
			textIndex := openAIResponseTextIndex(assistantMessage, streamState)
			textDelta := authoritativeResponseReplacementSuffix(currentAssistantTextAtIndex(assistantMessage, textIndex), typed.Refusal)
			setAssistantTextAtIndex(assistantMessage, textIndex, typed.Refusal)
			if textDelta != "" {
				if err := e.emitOpenAIResponseTextDelta(ctx, prepared, assistantMessage, textIndex, textDelta); err != nil {
					return nil, err
				}
			}
		}
	case responses.ResponseFunctionCallArgumentsDeltaEvent:
		argumentsDelta := typed.Delta
		state := accumulator.apply(int(typed.OutputIndex), "", "", argumentsDelta)
		if err := e.emitOpenAIResponseToolArgumentUpdate(
			ctx,
			prepared,
			assistantMessage,
			previewAccumulator,
			state,
			argumentsDelta,
		); err != nil {
			return nil, err
		}
	case responses.ResponseFunctionCallArgumentsDoneEvent:
		previousArguments := accumulator.currentArguments(int(typed.OutputIndex))
		state := accumulator.applyResolved(int(typed.OutputIndex), "", typed.Name, typed.Arguments)
		argumentsDelta := authoritativeResponseReplacementSuffix(previousArguments, typed.Arguments)
		if err := e.emitOpenAIResponseToolArgumentUpdate(
			ctx,
			prepared,
			assistantMessage,
			previewAccumulator,
			state,
			argumentsDelta,
		); err != nil {
			return nil, err
		}
	case responses.ResponseCompletedEvent:
		e.applyOpenAICompletedResponseFallback(assistantMessage, typed.Response, streamState, accumulator)
		return buildResponseUsagePayload(typed.Response.Usage), nil
	case responses.ResponseErrorEvent:
		detail := strings.TrimSpace(typed.Message)
		if detail == "" {
			detail = "OpenAI request failed."
		}
		return nil, fmt.Errorf("managed llm provider request failed: %s", detail)
	case responses.ResponseFailedEvent:
		if strings.TrimSpace(typed.Response.Error.Message) == "" {
			return nil, fmt.Errorf("managed llm provider request failed: response failed")
		}
		return nil, fmt.Errorf("managed llm provider request failed: %s", strings.TrimSpace(typed.Response.Error.Message))
	case responses.ResponseIncompleteEvent:
		reason := strings.TrimSpace(typed.Response.IncompleteDetails.Reason)
		if reason == "" {
			return nil, fmt.Errorf("managed llm provider request failed: response incomplete")
		}
		return nil, fmt.Errorf("managed llm provider request failed: response incomplete (%s)", reason)
	}
	return nil, nil
}

func (e *Executor) applyOpenAIResponseContentPartDone(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	streamState *openAIResponseStreamState,
	part responses.ResponseContentPartDoneEventPartUnion,
) error {
	switch typed := part.AsAny().(type) {
	case responses.ResponseOutputText:
		if strings.TrimSpace(typed.Text) == "" {
			return nil
		}
		if streamState != nil {
			streamState.bufferedText.Reset()
		}
		textIndex := openAIResponseTextIndex(assistantMessage, streamState)
		textDelta := authoritativeResponseReplacementSuffix(currentAssistantTextAtIndex(assistantMessage, textIndex), typed.Text)
		setAssistantTextAtIndex(assistantMessage, textIndex, typed.Text)
		if textDelta == "" {
			return nil
		}
		return e.emitOpenAIResponseTextDelta(ctx, prepared, assistantMessage, textIndex, textDelta)
	case responses.ResponseOutputRefusal:
		if strings.TrimSpace(typed.Refusal) == "" {
			return nil
		}
		if streamState != nil {
			streamState.bufferedText.Reset()
		}
		textIndex := openAIResponseTextIndex(assistantMessage, streamState)
		textDelta := authoritativeResponseReplacementSuffix(currentAssistantTextAtIndex(assistantMessage, textIndex), typed.Refusal)
		setAssistantTextAtIndex(assistantMessage, textIndex, typed.Refusal)
		if textDelta == "" {
			return nil
		}
		return e.emitOpenAIResponseTextDelta(ctx, prepared, assistantMessage, textIndex, textDelta)
	case responses.ResponseContentPartDoneEventPartReasoningText:
		if strings.TrimSpace(typed.Text) == "" {
			return nil
		}
		prepareAssistantForOpenAIResponseReasoning(assistantMessage)
		if streamState != nil {
			streamState.reasoningSeen = true
			streamState.reasoningEmitted = true
		}
		thinkingDelta := authoritativeResponseReplacementSuffix(currentAssistantThinkingTextAtIndex(assistantMessage, 0), typed.Text)
		setAssistantThinkingTextAtIndex(assistantMessage, 0, typed.Text)
		if thinkingDelta != "" {
			if err := e.emitOpenAIResponseThinkingDelta(ctx, prepared, assistantMessage, 0, thinkingDelta, nil); err != nil {
				return err
			}
		}
		return e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, false)
	default:
		return nil
	}
}

func (e *Executor) applyOpenAIResponseContentPartAdded(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	streamState *openAIResponseStreamState,
	part responses.ResponseContentPartAddedEventPartUnion,
) error {
	switch typed := part.AsAny().(type) {
	case responses.ResponseOutputText:
		if strings.TrimSpace(typed.Text) == "" {
			return nil
		}
		if streamState != nil {
			streamState.bufferedText.Reset()
		}
		textIndex := openAIResponseTextIndex(assistantMessage, streamState)
		textDelta := authoritativeResponseReplacementSuffix(currentAssistantTextAtIndex(assistantMessage, textIndex), typed.Text)
		setAssistantTextAtIndex(assistantMessage, textIndex, typed.Text)
		if textDelta == "" {
			return nil
		}
		return e.emitOpenAIResponseTextDelta(ctx, prepared, assistantMessage, textIndex, textDelta)
	case responses.ResponseOutputRefusal:
		if strings.TrimSpace(typed.Refusal) == "" {
			return nil
		}
		if streamState != nil {
			streamState.bufferedText.Reset()
		}
		textIndex := openAIResponseTextIndex(assistantMessage, streamState)
		textDelta := authoritativeResponseReplacementSuffix(currentAssistantTextAtIndex(assistantMessage, textIndex), typed.Refusal)
		setAssistantTextAtIndex(assistantMessage, textIndex, typed.Refusal)
		if textDelta == "" {
			return nil
		}
		return e.emitOpenAIResponseTextDelta(ctx, prepared, assistantMessage, textIndex, textDelta)
	case responses.ResponseContentPartAddedEventPartReasoningText:
		if strings.TrimSpace(typed.Text) == "" {
			return nil
		}
		prepareAssistantForOpenAIResponseReasoning(assistantMessage)
		if streamState != nil {
			streamState.reasoningSeen = true
			streamState.reasoningEmitted = true
		}
		thinkingDelta := authoritativeResponseReplacementSuffix(currentAssistantThinkingTextAtIndex(assistantMessage, 0), typed.Text)
		setAssistantThinkingTextAtIndex(assistantMessage, 0, typed.Text)
		if thinkingDelta != "" {
			if err := e.emitOpenAIResponseThinkingDelta(ctx, prepared, assistantMessage, 0, thinkingDelta, nil); err != nil {
				return err
			}
		}
		return e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, false)
	default:
		return nil
	}
}

func (e *Executor) applyOpenAIResponseSummaryPartUpdate(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	streamState *openAIResponseStreamState,
	summaryIndex int,
	text string,
) error {
	if strings.TrimSpace(text) == "" {
		return nil
	}
	prepareAssistantForOpenAIResponseReasoning(assistantMessage)
	if streamState != nil {
		streamState.reasoningSeen = true
		streamState.reasoningEmitted = true
	}
	previousSummary := currentOpenAIResponseSummary(streamState)
	summary := setOpenAIResponseSummaryPartText(streamState, summaryIndex, text)
	setAssistantThinkingSummaryAtIndex(assistantMessage, 0, summary)
	if strings.TrimSpace(previousSummary) != strings.TrimSpace(summary) {
		if err := e.emitOpenAIResponseThinkingDelta(ctx, prepared, assistantMessage, 0, "", optionalStringPointer(summary)); err != nil {
			return err
		}
	}
	return e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, false)
}

func (e *Executor) applyOpenAIResponseTextDelta(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	streamState *openAIResponseStreamState,
	delta string,
) error {
	if strings.TrimSpace(delta) == "" && delta == "" {
		return nil
	}
	if streamState.reasoningSeen && !streamState.reasoningEmitted {
		streamState.bufferedText.WriteString(delta)
		return nil
	}
	textIndex := 0
	if streamState.reasoningSeen {
		textIndex = 1
	}
	appendAssistantTextAtIndex(assistantMessage, textIndex, delta)
	return e.emitOpenAIResponseTextDelta(ctx, prepared, assistantMessage, textIndex, delta)
}

func (e *Executor) flushBufferedOpenAIResponseText(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	streamState *openAIResponseStreamState,
	preferIndexZero bool,
) error {
	if streamState == nil {
		return nil
	}
	buffered := streamState.bufferedText.String()
	if buffered == "" {
		return nil
	}
	streamState.bufferedText.Reset()
	textIndex := 1
	if !streamState.reasoningSeen || !streamState.reasoningEmitted {
		textIndex = openAIResponseTextIndex(assistantMessage, streamState)
	}
	if preferIndexZero && !hasThinkingBlock(assistantMessage) {
		textIndex = 0
	}
	appendAssistantTextAtIndex(assistantMessage, textIndex, buffered)
	return e.emitOpenAIResponseTextDelta(ctx, prepared, assistantMessage, textIndex, buffered)
}

func (e *Executor) emitOpenAIResponseTextDelta(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	index int,
	text string,
) error {
	if !prepared.emitStream || text == "" {
		return nil
	}
	return e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
		Type:      realtime.StreamingEventTypeDelta,
		MessageID: stringValue(assistantMessage["id"]),
		Content: []any{
			realtime.MessageTextDelta{
				Type:  realtime.MessageContentTypeTextDelta,
				Index: index,
				Text:  text,
			},
		},
	})
}

func (e *Executor) emitOpenAIResponseThinkingDelta(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	index int,
	thinking string,
	summary *string,
) error {
	if !prepared.emitStream {
		return nil
	}
	if thinking == "" && (summary == nil || strings.TrimSpace(*summary) == "") {
		return nil
	}
	return e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
		Type:      realtime.StreamingEventTypeDelta,
		MessageID: stringValue(assistantMessage["id"]),
		Content: []any{
			realtime.MessageThinkingDelta{
				Type:     realtime.MessageContentTypeThinkingDelta,
				Index:    index,
				Thinking: thinking,
				Summary:  summary,
			},
		},
	})
}

func (e *Executor) emitOpenAIResponseToolArgumentUpdate(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	previewAccumulator *toolPreviewAccumulator,
	state *toolCallState,
	argumentsDelta string,
) error {
	if state == nil || strings.TrimSpace(state.id) == "" {
		return nil
	}
	var toolName *string
	if strings.TrimSpace(state.name) != "" {
		toolName = optionalStringPointer(state.name)
	}
	if argumentsDelta != "" {
		if err := e.applyChunk(ctx, prepared, realtime.ToolCallDeltaEvent{
			Type:           realtime.StreamingEventTypeToolCallDelta,
			MessageID:      stringValue(assistantMessage["id"]),
			ToolCallID:     strings.TrimSpace(state.id),
			ArgumentsDelta: argumentsDelta,
			ToolName:       toolName,
		}); err != nil {
			return err
		}
	}
	descriptor, ok := prepared.availableTools[mcpx.NormalizeToolName(state.name)]
	if !ok || descriptor.Metadata == nil || descriptor.Metadata.ToolArgumentPreview == nil {
		return nil
	}
	previewEvent, err := previewAccumulator.buildEvent(
		stringValue(assistantMessage["id"]),
		state,
		descriptor.Metadata.ToolArgumentPreview,
		argumentsDelta,
		prepared.temporaryToCanonical,
	)
	if err != nil {
		return err
	}
	if previewEvent == nil {
		return nil
	}
	return e.applyChunk(ctx, prepared, *previewEvent)
}

func (e *Executor) applyOpenAICompletedResponseFallback(
	assistantMessage map[string]any,
	response responses.Response,
	streamState *openAIResponseStreamState,
	accumulator *toolCallAccumulator,
) {
	for index, itemUnion := range response.Output {
		e.applyOpenAIResponseOutputItemFallback(
			assistantMessage,
			itemUnion,
			index,
			streamState,
			accumulator,
		)
	}
}

func (e *Executor) applyOpenAIResponseOutputItemFallback(
	assistantMessage map[string]any,
	itemUnion responses.ResponseOutputItemUnion,
	outputIndex int,
	streamState *openAIResponseStreamState,
	accumulator *toolCallAccumulator,
) {
	switch item := itemUnion.AsAny().(type) {
	case responses.ResponseReasoningItem:
		prepareAssistantForOpenAIResponseReasoning(assistantMessage)
		if streamState != nil {
			streamState.reasoningSeen = true
		}
		summary := joinOpenAIResponseReasoningSummary(item.Summary)
		if strings.TrimSpace(summary) != "" {
			if streamState != nil {
				streamState.summary = summary
				streamState.summaryParts = openAIResponseReasoningSummaryParts(item.Summary)
				streamState.reasoningEmitted = true
			}
			setAssistantThinkingSummaryAtIndex(assistantMessage, 0, summary)
		}
		reasoning := joinOpenAIResponseReasoningContent(item.Content)
		if strings.TrimSpace(reasoning) != "" {
			if streamState != nil {
				streamState.reasoningEmitted = true
			}
			setAssistantThinkingTextAtIndex(assistantMessage, 0, reasoning)
		}
	case responses.ResponseOutputMessage:
		text := joinOpenAIResponseOutputMessageText(item.Content)
		if strings.TrimSpace(text) == "" {
			return
		}
		if streamState != nil {
			streamState.bufferedText.Reset()
		}
		setAssistantTextAtIndex(assistantMessage, openAIResponseTextIndex(assistantMessage, streamState), text)
	case responses.ResponseFunctionToolCall:
		if accumulator == nil {
			return
		}
		accumulator.applyResolved(outputIndex, item.CallID, item.Name, item.Arguments)
	}
}

func openAIResponseTextIndex(assistantMessage map[string]any, streamState *openAIResponseStreamState) int {
	if streamState != nil && streamState.reasoningSeen {
		return 1
	}
	if hasMessageThinking(assistantMessage) {
		return 1
	}
	return 0
}

func prepareAssistantForOpenAIResponseReasoning(assistantMessage map[string]any) {
	if assistantMessage == nil || hasThinkingBlock(assistantMessage) {
		return
	}
	content, _ := assistantMessage["content"].([]any)
	if len(content) == 0 {
		return
	}
	firstBlock, _ := content[0].(map[string]any)
	if firstBlock == nil ||
		strings.TrimSpace(stringValue(firstBlock["type"])) != "text" ||
		strings.TrimSpace(stringValue(firstBlock["text"])) == "" {
		return
	}
	shifted := make([]any, 0, len(content)+1)
	shifted = append(shifted, map[string]any{
		"type":     "thinking",
		"thinking": "",
	})
	shifted = append(shifted, content...)
	assistantMessage["content"] = shifted
}

func joinOpenAIResponseReasoningSummary(summary []responses.ResponseReasoningItemSummary) string {
	return joinOpenAIResponseSummaryParts(openAIResponseReasoningSummaryParts(summary))
}

func openAIResponseReasoningSummaryParts(summary []responses.ResponseReasoningItemSummary) map[int]string {
	if len(summary) == 0 {
		return nil
	}
	parts := make(map[int]string, len(summary))
	for index, entry := range summary {
		if strings.TrimSpace(entry.Text) == "" {
			continue
		}
		parts[index] = entry.Text
	}
	if len(parts) == 0 {
		return nil
	}
	return parts
}

func joinOpenAIResponseSummaryParts(parts map[int]string) string {
	if len(parts) == 0 {
		return ""
	}
	indexes := make([]int, 0, len(parts))
	for index := range parts {
		indexes = append(indexes, index)
	}
	sort.Ints(indexes)
	summaryParts := make([]string, 0, len(parts))
	for _, index := range indexes {
		text := strings.TrimSpace(parts[index])
		if text != "" {
			summaryParts = append(summaryParts, text)
		}
	}
	return strings.Join(summaryParts, "\n")
}

func currentOpenAIResponseSummary(streamState *openAIResponseStreamState) string {
	if streamState == nil {
		return ""
	}
	return streamState.summary
}

func setOpenAIResponseSummaryPartText(streamState *openAIResponseStreamState, summaryIndex int, text string) string {
	if streamState == nil {
		return text
	}
	if streamState.summaryParts == nil {
		streamState.summaryParts = map[int]string{}
	}
	streamState.summaryParts[summaryIndex] = text
	streamState.summary = joinOpenAIResponseSummaryParts(streamState.summaryParts)
	return streamState.summary
}

func appendOpenAIResponseSummaryPartText(streamState *openAIResponseStreamState, summaryIndex int, delta string) string {
	if delta == "" {
		return currentOpenAIResponseSummary(streamState)
	}
	currentPart := ""
	if streamState != nil && streamState.summaryParts != nil {
		currentPart = streamState.summaryParts[summaryIndex]
	}
	return setOpenAIResponseSummaryPartText(streamState, summaryIndex, currentPart+delta)
}

func joinOpenAIResponseReasoningContent(content []responses.ResponseReasoningItemContent) string {
	parts := make([]string, 0, len(content))
	for _, entry := range content {
		text := strings.TrimSpace(entry.Text)
		if text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "")
}

func joinOpenAIResponseOutputMessageText(content []responses.ResponseOutputMessageContentUnion) string {
	parts := make([]string, 0, len(content))
	for _, entry := range content {
		switch variant := entry.AsAny().(type) {
		case responses.ResponseOutputText:
			text := strings.TrimSpace(variant.Text)
			if text != "" {
				parts = append(parts, text)
			}
		case responses.ResponseOutputRefusal:
			text := strings.TrimSpace(variant.Refusal)
			if text != "" {
				parts = append(parts, text)
			}
		}
	}
	return strings.Join(parts, "\n\n")
}

func (e *Executor) applyChunk(ctx context.Context, prepared preparedExecution, chunk any) error {
	if e.live == nil || !prepared.emitStream {
		return nil
	}
	return e.live.ApplyChunk(ctx, managedchat.StreamChunkParams{
		RunID:           prepared.runID,
		ChatID:          prepared.chatID,
		ProjectConfigID: cloneStringPointer(prepared.projectConfigID),
		SectionID:       cloneStringPointer(prepared.sectionID),
		Chunk:           chunk,
	})
}

func (e *Executor) buildResult(transcript []map[string]any, toolCalls []map[string]any, usage map[string]any) agentruns.ExecutionResult {
	outputs := map[string]any{
		"messages": messagesToAnyList(transcript),
	}
	if usage != nil {
		outputs["usage"] = cloneAnyMap(usage)
	}
	return agentruns.ExecutionResult{
		Outputs:   outputs,
		ToolCalls: cloneToolCallMaps(toolCalls),
	}
}

func (e *Executor) finishStream(ctx context.Context, prepared preparedExecution, assistantMessage map[string]any, cancelled bool) error {
	if !prepared.emitStream {
		return nil
	}
	if err := e.applyChunk(ctx, prepared, realtime.MessageStopEvent{
		Type:      realtime.StreamingEventTypeMessageStop,
		MessageID: stringValue(assistantMessage["id"]),
	}); err != nil {
		return err
	}
	if cancelled && !shouldPersistMessage(assistantMessage) {
		return nil
	}
	return e.applyChunk(ctx, prepared, realtime.MessageFinalizedEvent{
		Type:    realtime.StreamingEventTypeMessageFinalized,
		Message: cloneMessage(assistantMessage),
	})
}

func finalizeAssistantToolCalls(message map[string]any, accumulator *toolCallAccumulator) error {
	if message == nil || accumulator == nil {
		return nil
	}
	toolCalls, err := accumulator.finalize()
	if err != nil {
		return err
	}
	if len(toolCalls) == 0 {
		return nil
	}
	message["tool_calls"] = messagesToAnyList(toolCalls)
	return nil
}

func finalizeAssistantToolCallsBestEffort(message map[string]any, accumulator *toolCallAccumulator) {
	_ = finalizeAssistantToolCalls(message, accumulator)
}

func (e *Executor) executeToolCalls(ctx context.Context, prepared preparedExecution, request agentruns.ExecutionRequest, toolCalls []map[string]any) ([]map[string]any, []map[string]any, error) {
	toolMessages := make([]map[string]any, 0, len(toolCalls))
	providerMessages := make([]map[string]any, 0, len(toolCalls))
	for _, toolCall := range toolCalls {
		toolCallID := strings.TrimSpace(stringValue(toolCall["id"]))
		function, _ := toolCall["function"].(map[string]any)
		toolName := strings.TrimSpace(stringValue(function["name"]))
		arguments, _ := function["arguments"].(map[string]any)
		if arguments == nil {
			arguments = map[string]any{}
		}

		var descriptor mcpx.ToolDescriptor
		var result mcpx.ToolCallResult
		if toolName == "" {
			result = buildMissingToolResult(toolName)
		} else if prepared.availableTools != nil {
			normalizedToolName := mcpx.NormalizeToolName(toolName)
			nextDescriptor, ok := prepared.availableTools[normalizedToolName]
			if !ok {
				result = buildMissingToolResult(toolName)
			} else if !isToolAllowed(toolName, prepared.toolAllowlist, request.CompletionGuardEnabled) {
				descriptor = nextDescriptor
				result = buildDisallowedToolResult(toolName)
			} else {
				descriptor = nextDescriptor
				if e.tools == nil {
					return nil, nil, fmt.Errorf("%w: MCP tool client is unavailable", ErrToolsUnsupported)
				}
				resultValue, err := e.tools.CallToolWithMeta(ctx, toolName, cloneAnyMap(arguments), buildToolRequestMeta(request, toolName))
				if err != nil {
					return nil, nil, fmt.Errorf("execute managed MCP tool %q: %w", toolName, err)
				}
				result = resultValue
			}
		} else {
			result = buildDisallowedToolResult(toolName)
		}

		toolMessage := buildToolResultMessage(toolCallID, toolName, arguments, result)
		toolMessages = append(toolMessages, toolMessage)
		if prepared.emitStream {
			if err := e.applyChunk(ctx, prepared, realtime.ToolResultEvent{
				Type:   realtime.StreamingEventTypeToolResult,
				Result: cloneMessage(toolMessage),
			}); err != nil {
				return nil, nil, err
			}
		}
		if err := e.emitToolResultFollow(ctx, prepared, descriptor, result); err != nil {
			return nil, nil, err
		}

		payload, include, err := providerPayloadForMessage(prepared.provider, toolMessage)
		if err != nil {
			return nil, nil, err
		}
		if include {
			providerMessages = append(providerMessages, payload)
		}
	}
	return toolMessages, providerMessages, nil
}

func (e *Executor) emitToolResultFollow(
	ctx context.Context,
	prepared preparedExecution,
	descriptor mcpx.ToolDescriptor,
	result mcpx.ToolCallResult,
) error {
	if e == nil || e.resultFollow == nil || !prepared.emitStream || prepared.projectConfigID == nil {
		return nil
	}
	return e.resultFollow.Emit(
		ctx,
		*prepared.projectConfigID,
		prepared.chatID,
		descriptor,
		result,
	)
}

func shouldPersistMessage(message map[string]any) bool {
	if message == nil {
		return false
	}
	if hasMessageText(message) {
		return true
	}
	if hasMessageThinking(message) {
		return true
	}
	if hasNonEmptyToolCalls(message["tool_calls"]) {
		return true
	}
	return strings.TrimSpace(stringValue(message["role"])) == "tool"
}

func providerPayloadForMessage(provider string, message map[string]any) (map[string]any, bool, error) {
	normalized, err := normalizeTranscriptMessage(message)
	if err != nil {
		return nil, false, err
	}
	switch provider {
	case openAIProvider:
		return buildOpenAIProviderMessage(normalized)
	case anthropicProvider:
		return buildAnthropicProviderMessage(normalized)
	case geminiProvider:
		return cloneAnyMap(normalized), true, nil
	default:
		return nil, false, fmt.Errorf("%w: %q", ErrProviderUnsupported, provider)
	}
}

func (e *Executor) buildMessages(provider string, request agentruns.ExecutionRequest) ([]map[string]any, []map[string]any, []map[string]any, error) {
	transcript := []map[string]any{}
	executionTranscript := []map[string]any{}

	if rawMessages, ok := request.Inputs["messages"]; ok {
		messages, executionMessages, err := e.parseTranscriptMessages(rawMessages, strings.TrimSpace(request.ProjectConfigID))
		if err != nil {
			return nil, nil, nil, err
		}
		transcript = append(transcript, messages...)
		executionTranscript = append(executionTranscript, executionMessages...)
	}
	if rawPrompt, ok := request.Inputs["prompt"]; ok {
		prompt, ok := rawPrompt.(string)
		if !ok {
			return nil, nil, nil, fmt.Errorf("%w: prompt must be a string", agentruns.ErrInvalidRunInput)
		}
		trimmed := strings.TrimSpace(prompt)
		if trimmed != "" {
			userMessage := map[string]any{
				"id":   newMessageID("user"),
				"role": "user",
				"content": []any{
					map[string]any{
						"type": "text",
						"text": trimmed,
					},
				},
				"attachments": []any{},
			}
			transcript = append(transcript, cloneMessage(userMessage))
			executionTranscript = append(executionTranscript, cloneMessage(userMessage))
		}
	}
	providerMessages, err := buildProviderMessages(provider, strings.TrimSpace(request.SystemPrompt), executionTranscript)
	if err != nil {
		return nil, nil, nil, err
	}
	return transcript, executionTranscript, providerMessages, nil
}

func (e *Executor) parseTranscriptMessages(raw any, projectConfigID string) ([]map[string]any, []map[string]any, error) {
	rawList, ok := raw.([]any)
	if !ok {
		return nil, nil, fmt.Errorf("%w: messages must be a list", agentruns.ErrInvalidRunInput)
	}
	transcript := make([]map[string]any, 0, len(rawList))
	executionTranscript := make([]map[string]any, 0, len(rawList))
	for index, entry := range rawList {
		message, ok := entry.(map[string]any)
		if !ok {
			return nil, nil, fmt.Errorf("%w: message %d must be an object", ErrHistoryUnsupported, index)
		}
		persisted, err := normalizePersistedTranscriptMessage(message)
		if err != nil {
			return nil, nil, err
		}
		resolved, err := e.resolveMessageAttachments(persisted, projectConfigID)
		if err != nil {
			return nil, nil, err
		}
		normalized, err := normalizeTranscriptMessage(resolved)
		if err != nil {
			return nil, nil, err
		}
		transcript = append(transcript, persisted)
		executionTranscript = append(executionTranscript, normalized)
	}
	return transcript, executionTranscript, nil
}

func (e *Executor) resolveMessageAttachments(message map[string]any, projectConfigID string) (map[string]any, error) {
	resolved := cloneMessage(message)
	if !hasNonEmptyAttachments(resolved["attachments"]) {
		return resolved, nil
	}
	if e == nil || e.attachments == nil {
		return nil, ErrAttachmentsUnsupported
	}
	attachmentPayload, err := e.attachments.BuildPayload(chatattachments.BuildPayloadRequest{
		Messages:        []map[string]any{resolved},
		ProjectConfigID: projectConfigID,
		IncludeText:     true,
	})
	if err != nil {
		return nil, err
	}
	if attachmentText := strings.TrimSpace(attachmentPayload.AttachmentText); attachmentText != "" {
		content, _ := resolved["content"].([]any)
		nextContent := make([]any, 0, len(content)+1)
		nextContent = append(nextContent, content...)
		nextContent = append(nextContent, map[string]any{
			"type": "text",
			"text": attachmentText,
		})
		resolved["content"] = nextContent
	}
	resolved["attachments"] = []any{}
	return resolved, nil
}

func buildProviderMessages(provider string, systemPrompt string, transcript []map[string]any) ([]map[string]any, error) {
	switch provider {
	case openAIProvider:
		messages := []map[string]any{
			{
				"role":    "system",
				"content": systemPrompt,
			},
		}
		for _, message := range transcript {
			payload, include, err := buildOpenAIProviderMessage(message)
			if err != nil {
				return nil, err
			}
			if include {
				messages = append(messages, payload)
			}
		}
		return messages, nil
	case anthropicProvider:
		messages := make([]map[string]any, 0, len(transcript))
		for _, message := range transcript {
			payload, include, err := buildAnthropicProviderMessage(message)
			if err != nil {
				return nil, err
			}
			if include {
				messages = append(messages, payload)
			}
		}
		return messages, nil
	case geminiProvider:
		messages := make([]map[string]any, 0, len(transcript))
		for _, message := range transcript {
			messages = append(messages, cloneAnyMap(message))
		}
		return messages, nil
	default:
		return nil, fmt.Errorf("%w: %q", ErrProviderUnsupported, provider)
	}
}

func normalizeTranscriptMessage(message map[string]any) (map[string]any, error) {
	normalized := cloneMessage(message)
	messageID := strings.TrimSpace(stringValue(normalized["id"]))
	if messageID == "" {
		return nil, fmt.Errorf("%w: message id is required", ErrHistoryUnsupported)
	}
	role := strings.TrimSpace(stringValue(normalized["role"]))
	switch role {
	case "system", "user", "assistant", "tool":
	default:
		return nil, fmt.Errorf("%w: role %q", ErrHistoryUnsupported, role)
	}
	if hasNonEmptyAttachments(normalized["attachments"]) {
		return nil, ErrAttachmentsUnsupported
	}
	if _, _, err := normalizeProviderToolCalls(normalized["tool_calls"], role); err != nil {
		return nil, err
	}
	toolCallID := strings.TrimSpace(stringValue(normalized["tool_call_id"]))
	if role == "tool" && toolCallID == "" {
		return nil, fmt.Errorf("%w: tool messages require tool_call_id", ErrToolsUnsupported)
	}
	if role != "tool" && toolCallID != "" {
		return nil, ErrToolsUnsupported
	}
	if _, _, err := normalizeProviderMessageContent(normalized["content"]); err != nil {
		return nil, err
	}
	if _, ok := normalized["attachments"]; !ok {
		normalized["attachments"] = []any{}
	}
	return normalized, nil
}

func normalizePersistedTranscriptMessage(message map[string]any) (map[string]any, error) {
	normalized := cloneMessage(message)
	messageID := strings.TrimSpace(stringValue(normalized["id"]))
	if messageID == "" {
		return nil, fmt.Errorf("%w: message id is required", ErrHistoryUnsupported)
	}
	role := strings.TrimSpace(stringValue(normalized["role"]))
	switch role {
	case "system", "user", "assistant", "tool":
	default:
		return nil, fmt.Errorf("%w: role %q", ErrHistoryUnsupported, role)
	}
	if _, _, err := normalizeProviderToolCalls(normalized["tool_calls"], role); err != nil {
		return nil, err
	}
	toolCallID := strings.TrimSpace(stringValue(normalized["tool_call_id"]))
	if role == "tool" && toolCallID == "" {
		return nil, fmt.Errorf("%w: tool messages require tool_call_id", ErrToolsUnsupported)
	}
	if role != "tool" && toolCallID != "" {
		return nil, ErrToolsUnsupported
	}
	if _, _, err := normalizeProviderMessageContent(normalized["content"]); err != nil {
		return nil, err
	}
	if _, ok := normalized["attachments"]; !ok {
		normalized["attachments"] = []any{}
	}
	return normalized, nil
}

func normalizeProviderMessageContent(raw any) (string, bool, error) {
	if raw == nil {
		return "", false, nil
	}
	list, ok := raw.([]any)
	if !ok {
		return "", false, fmt.Errorf("%w: message content must be a list", ErrHistoryUnsupported)
	}
	parts := make([]string, 0, len(list))
	for index, entry := range list {
		block, ok := entry.(map[string]any)
		if !ok {
			return "", false, fmt.Errorf("%w: content block %d must be an object", ErrHistoryUnsupported, index)
		}
		switch strings.TrimSpace(stringValue(block["type"])) {
		case "", "text":
			text := strings.TrimSpace(stringValue(block["text"]))
			if text != "" {
				parts = append(parts, text)
			}
		case "thinking":
			continue
		default:
			return "", false, fmt.Errorf("%w: content block type %q", ErrHistoryUnsupported, stringValue(block["type"]))
		}
	}
	if len(parts) == 0 {
		return "", false, nil
	}
	return strings.Join(parts, "\n\n"), true, nil
}

func normalizeProviderToolCalls(raw any, role string) ([]map[string]any, bool, error) {
	if !hasNonEmptyToolCalls(raw) {
		return nil, false, nil
	}
	if role != "assistant" {
		return nil, false, ErrToolsUnsupported
	}
	list, _ := raw.([]any)
	toolCalls := make([]map[string]any, 0, len(list))
	for index, entry := range list {
		toolCall, ok := entry.(map[string]any)
		if !ok {
			return nil, false, fmt.Errorf("%w: tool call %d must be an object", ErrToolsUnsupported, index)
		}
		toolCallID := strings.TrimSpace(stringValue(toolCall["id"]))
		if toolCallID == "" {
			return nil, false, fmt.Errorf("%w: tool call id is required", ErrToolsUnsupported)
		}
		function, _ := toolCall["function"].(map[string]any)
		toolName := strings.TrimSpace(stringValue(function["name"]))
		if toolName == "" {
			return nil, false, fmt.Errorf("%w: tool call name is required", ErrToolsUnsupported)
		}
		arguments, _ := function["arguments"].(map[string]any)
		if arguments == nil {
			arguments = map[string]any{}
		}
		encodedArguments, err := json.Marshal(arguments)
		if err != nil {
			return nil, false, fmt.Errorf("%w: encode tool call arguments: %v", ErrToolsUnsupported, err)
		}
		toolCalls = append(toolCalls, map[string]any{
			"id":   toolCallID,
			"type": "function",
			"function": map[string]any{
				"name":      toolName,
				"arguments": string(encodedArguments),
			},
		})
	}
	return toolCalls, true, nil
}

func normalizeProviderToolResultContent(raw any) (string, error) {
	if raw == nil {
		return "", nil
	}
	switch value := raw.(type) {
	case map[string]any:
		if text := strings.TrimSpace(stringValue(value["text"])); text != "" {
			return text, nil
		}
	case string:
		if strings.TrimSpace(value) != "" {
			return value, nil
		}
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return "", fmt.Errorf("%w: encode tool result content: %v", ErrHistoryUnsupported, err)
	}
	return string(encoded), nil
}

func providerContentValue(content string) any {
	if strings.TrimSpace(content) == "" {
		return nil
	}
	return content
}

func resolveAPIKey(request agentruns.ExecutionRequest) (string, error) {
	keyName := strings.TrimSpace(request.LLMConfig.APIKeyEnv)
	if keyName == "" {
		return "", nil
	}
	value := strings.TrimSpace(request.APIKeys[keyName])
	if value == "" {
		return "", fmt.Errorf("%w: %s", ErrAPIKeyRequired, keyName)
	}
	return value, nil
}

func hasExplicitReasoningConfig(params map[string]any) bool {
	_, ok, err := extractExplicitReasoningEffort(params)
	return err == nil && ok
}

func shouldEmitManagedChatStream(request agentruns.ExecutionRequest) bool {
	if strings.TrimSpace(request.ChatID) == "" || strings.TrimSpace(request.Run.ID) == "" {
		return false
	}
	return strings.TrimSpace(stringValue(request.Inputs["runType"])) == managedChatRunType
}

func resolveTemporaryToCanonical(request agentruns.ExecutionRequest) (map[string]string, error) {
	if request.TemporaryIDs == nil {
		return nil, nil
	}
	canonicalToTemporary, err := request.TemporaryIDs.Snapshot()
	if err != nil {
		return nil, fmt.Errorf("snapshot temporary ids: %w", err)
	}
	temporaryToCanonical := make(map[string]string, len(canonicalToTemporary)*2)
	for canonicalID, temporaryID := range canonicalToTemporary {
		trimmedCanonicalID := strings.TrimSpace(canonicalID)
		if trimmedCanonicalID != "" {
			temporaryToCanonical[trimmedCanonicalID] = trimmedCanonicalID
		}
		trimmedTemporaryID := strings.TrimSpace(temporaryID)
		if trimmedTemporaryID == "" {
			continue
		}
		temporaryToCanonical[trimmedTemporaryID] = trimmedCanonicalID
	}
	return temporaryToCanonical, nil
}

func newAssistantMessage() map[string]any {
	return map[string]any{
		"id":          newMessageID("assistant"),
		"role":        "assistant",
		"content":     []any{},
		"attachments": []any{},
		"tool_calls":  nil,
	}
}

func appendAssistantText(message map[string]any, delta string) {
	appendAssistantTextAtIndex(message, 0, delta)
}

func setAssistantTextAtIndex(message map[string]any, index int, text string) {
	if strings.TrimSpace(text) == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "text")
	block["text"] = text
	message["content"] = content
}

func appendAssistantTextAtIndex(message map[string]any, index int, delta string) {
	if strings.TrimSpace(delta) == "" && delta == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "text")
	block["text"] = stringValue(block["text"]) + delta
	message["content"] = content
}

func appendAssistantThinkingAtIndex(message map[string]any, index int, delta string) {
	if strings.TrimSpace(delta) == "" && delta == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "thinking")
	block["thinking"] = stringValue(block["thinking"]) + delta
	message["content"] = content
}

func setAssistantThinkingTextAtIndex(message map[string]any, index int, thinking string) {
	if strings.TrimSpace(thinking) == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "thinking")
	block["thinking"] = thinking
	message["content"] = content
}

func setAssistantThinkingSummaryAtIndex(message map[string]any, index int, summary string) {
	if strings.TrimSpace(summary) == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "thinking")
	block["summary"] = summary
	message["content"] = content
}

func setAssistantThinkingSignatureAtIndex(message map[string]any, index int, signature string) {
	if strings.TrimSpace(signature) == "" {
		return
	}
	content, block := ensureAssistantContentBlock(message, index, "thinking")
	block["signature"] = signature
	message["content"] = content
}

func ensureAssistantContentBlock(message map[string]any, index int, blockType string) ([]any, map[string]any) {
	content, _ := message["content"].([]any)
	if index < 0 {
		index = len(content)
	}
	for len(content) <= index {
		content = append(content, map[string]any{})
	}
	block, _ := content[index].(map[string]any)
	block = cloneAnyMap(block)
	if block == nil || strings.TrimSpace(stringValue(block["type"])) != blockType {
		block = map[string]any{
			"type": blockType,
		}
		switch blockType {
		case "text":
			block["text"] = ""
		case "thinking":
			block["thinking"] = ""
		}
	}
	content[index] = block
	return content, block
}

func currentAssistantTextAtIndex(message map[string]any, index int) string {
	return currentAssistantBlockStringAtIndex(message, index, "text", "text")
}

func currentAssistantThinkingTextAtIndex(message map[string]any, index int) string {
	return currentAssistantBlockStringAtIndex(message, index, "thinking", "thinking")
}

func currentAssistantBlockStringAtIndex(message map[string]any, index int, blockType string, field string) string {
	content, _ := message["content"].([]any)
	if index < 0 || index >= len(content) {
		return ""
	}
	block, _ := content[index].(map[string]any)
	if block == nil || strings.TrimSpace(stringValue(block["type"])) != blockType {
		return ""
	}
	return stringValue(block[field])
}

func authoritativeResponseReplacementSuffix(current string, final string) string {
	if final == "" || current == final {
		return ""
	}
	if current == "" {
		return final
	}
	if strings.HasPrefix(final, current) {
		return strings.TrimPrefix(final, current)
	}
	return ""
}

func compactAssistantContent(message map[string]any) {
	if message == nil {
		return
	}
	content, _ := message["content"].([]any)
	if len(content) == 0 {
		return
	}
	compacted := make([]any, 0, len(content))
	for _, entry := range content {
		block, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		switch strings.TrimSpace(stringValue(block["type"])) {
		case "text":
			if strings.TrimSpace(stringValue(block["text"])) == "" {
				continue
			}
		case "thinking":
			if strings.TrimSpace(stringValue(block["thinking"])) == "" &&
				strings.TrimSpace(stringValue(block["summary"])) == "" &&
				strings.TrimSpace(stringValue(block["signature"])) == "" {
				continue
			}
		default:
			continue
		}
		compacted = append(compacted, cloneAnyMap(block))
	}
	message["content"] = compacted
}

func hasMessageText(message map[string]any) bool {
	content, ok := message["content"].([]any)
	if !ok {
		return false
	}
	for _, entry := range content {
		block, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(stringValue(block["type"])) != "text" {
			continue
		}
		if strings.TrimSpace(stringValue(block["text"])) != "" {
			return true
		}
	}
	return false
}

func hasMessageThinking(message map[string]any) bool {
	content, ok := message["content"].([]any)
	if !ok {
		return false
	}
	for _, entry := range content {
		block, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(stringValue(block["type"])) != "thinking" {
			continue
		}
		if strings.TrimSpace(stringValue(block["thinking"])) != "" ||
			strings.TrimSpace(stringValue(block["summary"])) != "" ||
			strings.TrimSpace(stringValue(block["signature"])) != "" {
			return true
		}
	}
	return false
}

func hasThinkingBlock(message map[string]any) bool {
	content, ok := message["content"].([]any)
	if !ok {
		return false
	}
	for _, entry := range content {
		block, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(stringValue(block["type"])) == "thinking" {
			return true
		}
	}
	return false
}

func hasMessageThinkingText(message map[string]any) bool {
	content, ok := message["content"].([]any)
	if !ok {
		return false
	}
	for _, entry := range content {
		block, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(stringValue(block["type"])) != "thinking" {
			continue
		}
		if strings.TrimSpace(stringValue(block["thinking"])) != "" {
			return true
		}
	}
	return false
}

func hasNonEmptyAttachments(raw any) bool {
	list, ok := raw.([]any)
	return ok && len(list) > 0
}

func hasNonEmptyToolCalls(raw any) bool {
	list, ok := raw.([]any)
	return ok && len(list) > 0
}

func newMessageID(prefix string) string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return prefix + "_fallback"
	}
	return prefix + "_" + hex.EncodeToString(bytes)
}

func optionalStringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func stringValue(raw any) string {
	value, _ := raw.(string)
	return value
}

func cloneMessage(message map[string]any) map[string]any {
	return cloneAnyMap(message)
}

func cloneMessageSlice(messages []map[string]any) []map[string]any {
	if messages == nil {
		return nil
	}
	cloned := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		cloned = append(cloned, cloneMessage(message))
	}
	return cloned
}

func messagesToAnyList(messages []map[string]any) []any {
	list := make([]any, 0, len(messages))
	for _, message := range messages {
		list = append(list, cloneMessage(message))
	}
	return list
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = cloneJSONValue(value)
	}
	return cloned
}

func cloneJSONValue(value any) any {
	if value == nil {
		return nil
	}
	content, err := json.Marshal(value)
	if err != nil {
		return value
	}
	var cloned any
	if err := json.Unmarshal(content, &cloned); err != nil {
		return value
	}
	return cloned
}
