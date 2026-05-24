package managedllm

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/mcpx"
	"setta/internal/realtime"

	openai "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/responses"
)

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
		assistantTurnToolCalls, persisted := appendPersistedAssistantTurn(
			&transcript,
			&executionTranscript,
			assistantMessage,
		)
		if len(assistantTurnToolCalls) > 0 {
			toolCalls = append(toolCalls, cloneToolCallMaps(assistantTurnToolCalls)...)
		}
		if err != nil {
			result := e.buildResult(transcript, toolCalls, usage)
			if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
				return result, context.Canceled
			}
			return result, err
		}

		if persisted {
			if err := appendAssistantProviderPayload(&providerMessages, prepared.provider, assistantMessage); err != nil {
				return e.buildResult(transcript, toolCalls, usage), err
			}
		}

		if len(assistantTurnToolCalls) == 0 {
			return e.buildResult(transcript, toolCalls, usage), nil
		}

		toolMessages, providerToolMessages, toolErr := e.executeToolCalls(ctx, prepared, request, assistantTurnToolCalls)
		if toolErr != nil {
			return e.buildResult(transcript, toolCalls, usage), toolErr
		}
		appendConversationMessages(&transcript, &executionTranscript, toolMessages...)
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
	usage = e.finalizeUsagePayload(ctx, prepared, request, usage)
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
		if nextUsage != nil {
			usage = nextUsage
		}
		if err != nil {
			if flushErr := e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, !streamState.reasoningEmitted); flushErr != nil {
				finalizeAssistantToolCallsBestEffort(assistantMessage, accumulator)
				return usage, flushErr
			}
			finalizeAssistantToolCallsBestEffort(assistantMessage, accumulator)
			return usage, err
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
	usage := openAIChunkUsagePayload(chunk)
	for _, choice := range chunk.Choices {
		if err := e.applyOpenAIChunkChoiceText(
			ctx,
			prepared,
			assistantMessage,
			choice.Delta.Content,
		); err != nil {
			return usage, err
		}
		if err := e.applyOpenAIChunkChoiceToolCalls(
			ctx,
			prepared,
			assistantMessage,
			choice.Delta.ToolCalls,
			accumulator,
			previewAccumulator,
		); err != nil {
			return usage, err
		}
	}
	return usage, nil
}

func openAIChunkUsagePayload(chunk openai.ChatCompletionChunk) map[string]any {
	if !chunk.JSON.Usage.Valid() {
		return nil
	}
	return buildCompletionUsagePayload(chunk.Usage)
}

func (e *Executor) applyOpenAIChunkChoiceText(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	text string,
) error {
	if text == "" {
		return nil
	}
	appendAssistantText(assistantMessage, text)
	if !prepared.emitStream {
		return nil
	}
	return e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
		Type:      realtime.StreamingEventTypeDelta,
		MessageID: stringValue(assistantMessage["id"]),
		Content: []any{
			realtime.MessageTextDelta{
				Type:  realtime.MessageContentTypeTextDelta,
				Index: 0,
				Text:  text,
			},
		},
	})
}

func (e *Executor) applyOpenAIChunkChoiceToolCalls(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	toolCalls []openai.ChatCompletionChunkChoiceDeltaToolCall,
	accumulator *toolCallAccumulator,
	previewAccumulator *toolPreviewAccumulator,
) error {
	for _, toolCall := range toolCalls {
		if err := e.applyOpenAIChunkChoiceToolCall(
			ctx,
			prepared,
			assistantMessage,
			toolCall,
			accumulator,
			previewAccumulator,
		); err != nil {
			return err
		}
	}
	return nil
}

func (e *Executor) applyOpenAIChunkChoiceToolCall(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	toolCall openai.ChatCompletionChunkChoiceDeltaToolCall,
	accumulator *toolCallAccumulator,
	previewAccumulator *toolPreviewAccumulator,
) error {
	argumentsDelta := toolCall.Function.Arguments
	state := accumulator.apply(
		int(toolCall.Index),
		toolCall.ID,
		"",
		toolCall.Function.Name,
		argumentsDelta,
	)
	if !prepared.emitStream || state == nil {
		return nil
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
		return err
	}
	return e.emitOpenAIChunkToolPreview(
		ctx,
		prepared,
		assistantMessage,
		state,
		argumentsDelta,
		previewAccumulator,
	)
}

func (e *Executor) emitOpenAIChunkToolPreview(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	state *toolCallState,
	argumentsDelta string,
	previewAccumulator *toolPreviewAccumulator,
) error {
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
