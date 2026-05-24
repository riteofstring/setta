package managedllm

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"setta/internal/mcpx"
	"setta/internal/realtime"

	"github.com/openai/openai-go/v3/responses"
)

type openAIResponseStreamState struct {
	reasoningSeen    bool
	reasoningEmitted bool
	summary          string
	summaryParts     map[int]string
	bufferedText     strings.Builder
}

type openAIResponseEventContext struct {
	prepared           preparedExecution
	assistantMessage   map[string]any
	accumulator        *toolCallAccumulator
	previewAccumulator *toolPreviewAccumulator
	streamState        *openAIResponseStreamState
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
	eventContext := openAIResponseEventContext{
		prepared:           prepared,
		assistantMessage:   assistantMessage,
		accumulator:        accumulator,
		previewAccumulator: previewAccumulator,
		streamState:        streamState,
	}
	rawEvent := event.AsAny()
	if handled, err := e.processOpenAIResponseOutputItemEvent(ctx, rawEvent, eventContext); handled {
		return nil, err
	}
	if handled, err := e.processOpenAIResponseContentPartEvent(ctx, rawEvent, eventContext); handled {
		return nil, err
	}
	if handled, err := e.processOpenAIResponseReasoningEvent(ctx, rawEvent, eventContext); handled {
		return nil, err
	}
	if handled, err := e.processOpenAIResponseTextEvent(ctx, rawEvent, eventContext); handled {
		return nil, err
	}
	if handled, err := e.processOpenAIResponseToolCallEvent(ctx, rawEvent, eventContext); handled {
		return nil, err
	}
	if usage, handled, err := e.processOpenAIResponseTerminalEvent(ctx, rawEvent, eventContext); handled {
		return usage, err
	}
	return nil, nil
}

func (e *Executor) processOpenAIResponseOutputItemEvent(
	ctx context.Context,
	event any,
	eventContext openAIResponseEventContext,
) (bool, error) {
	switch typed := event.(type) {
	case responses.ResponseOutputItemAddedEvent:
		return true, e.applyOpenAIResponseOutputItemAdded(ctx, typed, eventContext)
	case responses.ResponseOutputItemDoneEvent:
		return true, e.applyOpenAIResponseOutputItemDone(ctx, typed, eventContext)
	default:
		return false, nil
	}
}

func (e *Executor) applyOpenAIResponseOutputItemAdded(
	ctx context.Context,
	event responses.ResponseOutputItemAddedEvent,
	eventContext openAIResponseEventContext,
) error {
	switch item := event.Item.AsAny().(type) {
	case responses.ResponseFunctionToolCall:
		return e.applyResolvedOpenAIResponseToolCall(
			ctx,
			eventContext,
			int(event.OutputIndex),
			item.CallID,
			item.ID,
			item.Name,
			item.Arguments,
		)
	default:
		return e.applyOpenAIResponseOutputItemFallback(
			ctx,
			eventContext.prepared,
			eventContext.assistantMessage,
			event.Item,
			int(event.OutputIndex),
			eventContext.streamState,
			eventContext.accumulator,
		)
	}
}

func (e *Executor) applyOpenAIResponseOutputItemDone(
	ctx context.Context,
	event responses.ResponseOutputItemDoneEvent,
	eventContext openAIResponseEventContext,
) error {
	switch item := event.Item.AsAny().(type) {
	case responses.ResponseFunctionToolCall:
		return e.applyResolvedOpenAIResponseToolCall(
			ctx,
			eventContext,
			int(event.OutputIndex),
			item.CallID,
			item.ID,
			item.Name,
			item.Arguments,
		)
	default:
		return e.applyOpenAIResponseOutputItemFallback(
			ctx,
			eventContext.prepared,
			eventContext.assistantMessage,
			event.Item,
			int(event.OutputIndex),
			eventContext.streamState,
			eventContext.accumulator,
		)
	}
}

func (e *Executor) processOpenAIResponseContentPartEvent(
	ctx context.Context,
	event any,
	eventContext openAIResponseEventContext,
) (bool, error) {
	switch typed := event.(type) {
	case responses.ResponseContentPartAddedEvent:
		return true, e.applyOpenAIResponseContentPartAdded(
			ctx,
			eventContext.prepared,
			eventContext.assistantMessage,
			eventContext.streamState,
			typed.ItemID,
			typed.Part,
		)
	case responses.ResponseContentPartDoneEvent:
		return true, e.applyOpenAIResponseContentPartDone(
			ctx,
			eventContext.prepared,
			eventContext.assistantMessage,
			eventContext.streamState,
			typed.ItemID,
			typed.Part,
		)
	default:
		return false, nil
	}
}

func (e *Executor) processOpenAIResponseReasoningEvent(
	ctx context.Context,
	event any,
	eventContext openAIResponseEventContext,
) (bool, error) {
	switch typed := event.(type) {
	case responses.ResponseReasoningSummaryPartAddedEvent:
		return true, e.applyOpenAIResponseSummaryPartUpdate(
			ctx,
			eventContext.prepared,
			eventContext.assistantMessage,
			eventContext.streamState,
			int(typed.SummaryIndex),
			typed.Part.Text,
		)
	case responses.ResponseReasoningSummaryPartDoneEvent:
		return true, e.applyOpenAIResponseSummaryPartUpdate(
			ctx,
			eventContext.prepared,
			eventContext.assistantMessage,
			eventContext.streamState,
			int(typed.SummaryIndex),
			typed.Part.Text,
		)
	case responses.ResponseReasoningSummaryTextDeltaEvent:
		return true, e.applyOpenAIResponseSummaryTextUpdate(
			ctx,
			eventContext,
			int(typed.SummaryIndex),
			typed.Delta,
			true,
		)
	case responses.ResponseReasoningSummaryTextDoneEvent:
		return true, e.applyOpenAIResponseSummaryTextUpdate(
			ctx,
			eventContext,
			int(typed.SummaryIndex),
			typed.Text,
			false,
		)
	case responses.ResponseReasoningTextDeltaEvent:
		return true, e.applyOpenAIResponseReasoningTextDelta(ctx, eventContext, typed.Delta)
	case responses.ResponseReasoningTextDoneEvent:
		return true, e.applyOpenAIResponseReasoningTextDone(ctx, eventContext, typed.Text)
	default:
		return false, nil
	}
}

func (e *Executor) applyOpenAIResponseSummaryTextUpdate(
	ctx context.Context,
	eventContext openAIResponseEventContext,
	summaryIndex int,
	text string,
	appendText bool,
) error {
	if !appendText && strings.TrimSpace(text) == "" {
		return nil
	}
	prepareAssistantForOpenAIResponseReasoning(eventContext.assistantMessage)
	eventContext.streamState.reasoningSeen = true
	eventContext.streamState.reasoningEmitted = true
	previousSummary := eventContext.streamState.summary
	if appendText {
		eventContext.streamState.summary = appendOpenAIResponseSummaryPartText(
			eventContext.streamState,
			summaryIndex,
			text,
		)
	} else {
		eventContext.streamState.summary = setOpenAIResponseSummaryPartText(
			eventContext.streamState,
			summaryIndex,
			text,
		)
	}
	setAssistantThinkingSummaryAtIndex(eventContext.assistantMessage, 0, eventContext.streamState.summary)
	if strings.TrimSpace(previousSummary) != strings.TrimSpace(eventContext.streamState.summary) {
		if err := e.emitOpenAIResponseThinkingDelta(
			ctx,
			eventContext.prepared,
			eventContext.assistantMessage,
			0,
			"",
			optionalStringPointer(eventContext.streamState.summary),
			nil,
		); err != nil {
			return err
		}
	}
	return e.flushBufferedOpenAIResponseText(
		ctx,
		eventContext.prepared,
		eventContext.assistantMessage,
		eventContext.streamState,
		false,
	)
}

func (e *Executor) applyOpenAIResponseReasoningTextDelta(
	ctx context.Context,
	eventContext openAIResponseEventContext,
	delta string,
) error {
	prepareAssistantForOpenAIResponseReasoning(eventContext.assistantMessage)
	eventContext.streamState.reasoningSeen = true
	eventContext.streamState.reasoningEmitted = true
	appendAssistantThinkingAtIndex(eventContext.assistantMessage, 0, delta)
	if err := e.emitOpenAIResponseThinkingDelta(
		ctx,
		eventContext.prepared,
		eventContext.assistantMessage,
		0,
		delta,
		nil,
		nil,
	); err != nil {
		return err
	}
	return e.flushBufferedOpenAIResponseText(
		ctx,
		eventContext.prepared,
		eventContext.assistantMessage,
		eventContext.streamState,
		false,
	)
}

func (e *Executor) applyOpenAIResponseReasoningTextDone(
	ctx context.Context,
	eventContext openAIResponseEventContext,
	text string,
) error {
	if strings.TrimSpace(text) == "" {
		return nil
	}
	prepareAssistantForOpenAIResponseReasoning(eventContext.assistantMessage)
	eventContext.streamState.reasoningSeen = true
	eventContext.streamState.reasoningEmitted = true
	thinkingDelta := authoritativeResponseReplacementSuffix(
		currentAssistantThinkingTextAtIndex(eventContext.assistantMessage, 0),
		text,
	)
	setAssistantThinkingTextAtIndex(eventContext.assistantMessage, 0, text)
	if thinkingDelta != "" {
		if err := e.emitOpenAIResponseThinkingDelta(
			ctx,
			eventContext.prepared,
			eventContext.assistantMessage,
			0,
			thinkingDelta,
			nil,
			nil,
		); err != nil {
			return err
		}
	}
	return e.flushBufferedOpenAIResponseText(
		ctx,
		eventContext.prepared,
		eventContext.assistantMessage,
		eventContext.streamState,
		false,
	)
}

func (e *Executor) processOpenAIResponseTextEvent(
	ctx context.Context,
	event any,
	eventContext openAIResponseEventContext,
) (bool, error) {
	switch typed := event.(type) {
	case responses.ResponseTextDeltaEvent:
		return true, e.applyOpenAIResponseTextDelta(
			ctx,
			eventContext.prepared,
			eventContext.assistantMessage,
			eventContext.streamState,
			typed.ItemID,
			"output_text",
			typed.Delta,
		)
	case responses.ResponseTextDoneEvent:
		return true, e.applyOpenAIResponseCompletedTextEvent(
			ctx,
			eventContext,
			typed.ItemID,
			"output_text",
			typed.Text,
		)
	case responses.ResponseRefusalDeltaEvent:
		return true, e.applyOpenAIResponseTextDelta(
			ctx,
			eventContext.prepared,
			eventContext.assistantMessage,
			eventContext.streamState,
			typed.ItemID,
			"refusal",
			typed.Delta,
		)
	case responses.ResponseRefusalDoneEvent:
		return true, e.applyOpenAIResponseCompletedTextEvent(
			ctx,
			eventContext,
			typed.ItemID,
			"refusal",
			typed.Refusal,
		)
	default:
		return false, nil
	}
}

func (e *Executor) applyOpenAIResponseCompletedTextEvent(
	ctx context.Context,
	eventContext openAIResponseEventContext,
	itemID string,
	contentType string,
	text string,
) error {
	setAssistantProviderMessageID(eventContext.assistantMessage, itemID)
	setAssistantProviderMessageContentType(eventContext.assistantMessage, contentType)
	if strings.TrimSpace(text) == "" {
		return nil
	}
	textIndex := openAIResponseTextIndex(eventContext.assistantMessage, eventContext.streamState)
	textDelta := authoritativeResponseReplacementSuffix(
		currentAssistantTextAtIndex(eventContext.assistantMessage, textIndex),
		text,
	)
	setAssistantTextAtIndex(eventContext.assistantMessage, textIndex, text)
	if textDelta == "" {
		return nil
	}
	return e.emitOpenAIResponseTextDelta(
		ctx,
		eventContext.prepared,
		eventContext.assistantMessage,
		textIndex,
		textDelta,
	)
}

func (e *Executor) processOpenAIResponseToolCallEvent(
	ctx context.Context,
	event any,
	eventContext openAIResponseEventContext,
) (bool, error) {
	switch typed := event.(type) {
	case responses.ResponseFunctionCallArgumentsDeltaEvent:
		argumentsDelta := typed.Delta
		state := eventContext.accumulator.apply(int(typed.OutputIndex), "", typed.ItemID, "", argumentsDelta)
		return true, e.emitOpenAIResponseToolArgumentUpdate(
			ctx,
			eventContext.prepared,
			eventContext.assistantMessage,
			eventContext.previewAccumulator,
			state,
			argumentsDelta,
		)
	case responses.ResponseFunctionCallArgumentsDoneEvent:
		return true, e.applyResolvedOpenAIResponseToolCall(
			ctx,
			eventContext,
			int(typed.OutputIndex),
			"",
			typed.ItemID,
			typed.Name,
			typed.Arguments,
		)
	default:
		return false, nil
	}
}

func (e *Executor) applyResolvedOpenAIResponseToolCall(
	ctx context.Context,
	eventContext openAIResponseEventContext,
	outputIndex int,
	callID string,
	itemID string,
	name string,
	arguments string,
) error {
	previousArguments := eventContext.accumulator.currentArguments(outputIndex)
	state := eventContext.accumulator.applyResolved(outputIndex, callID, itemID, name, arguments)
	argumentsDelta := authoritativeResponseReplacementSuffix(previousArguments, arguments)
	return e.emitOpenAIResponseToolArgumentUpdate(
		ctx,
		eventContext.prepared,
		eventContext.assistantMessage,
		eventContext.previewAccumulator,
		state,
		argumentsDelta,
	)
}

func (e *Executor) processOpenAIResponseTerminalEvent(
	ctx context.Context,
	event any,
	eventContext openAIResponseEventContext,
) (map[string]any, bool, error) {
	switch typed := event.(type) {
	case responses.ResponseCompletedEvent:
		usage, err := e.applyOpenAIResponseTerminalFallback(ctx, eventContext, typed.Response)
		return usage, true, err
	case responses.ResponseErrorEvent:
		detail := strings.TrimSpace(typed.Message)
		if detail == "" {
			detail = "OpenAI request failed."
		}
		return nil, true, fmt.Errorf("managed llm provider request failed: %s", detail)
	case responses.ResponseFailedEvent:
		usage, err := e.applyOpenAIResponseTerminalFallback(ctx, eventContext, typed.Response)
		if err != nil {
			return nil, true, err
		}
		detail := strings.TrimSpace(typed.Response.Error.Message)
		if detail == "" {
			return usage, true, fmt.Errorf("managed llm provider request failed: response failed")
		}
		return usage, true, fmt.Errorf("managed llm provider request failed: %s", detail)
	case responses.ResponseIncompleteEvent:
		usage, err := e.applyOpenAIResponseTerminalFallback(ctx, eventContext, typed.Response)
		if err != nil {
			return nil, true, err
		}
		reason := strings.TrimSpace(typed.Response.IncompleteDetails.Reason)
		if reason == "" {
			return usage, true, fmt.Errorf("managed llm provider request failed: response incomplete")
		}
		return usage, true, fmt.Errorf("managed llm provider request failed: response incomplete (%s)", reason)
	default:
		return nil, false, nil
	}
}

func (e *Executor) applyOpenAIResponseTerminalFallback(
	ctx context.Context,
	eventContext openAIResponseEventContext,
	response responses.Response,
) (map[string]any, error) {
	if err := e.applyOpenAICompletedResponseFallback(
		ctx,
		eventContext.prepared,
		eventContext.assistantMessage,
		response,
		eventContext.streamState,
		eventContext.accumulator,
		eventContext.previewAccumulator,
	); err != nil {
		return nil, err
	}
	return buildResponseUsagePayload(response.Usage), nil
}

func (e *Executor) applyOpenAIResponseReasoningSignature(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	streamState *openAIResponseStreamState,
	index int,
	signature string,
) error {
	trimmed := strings.TrimSpace(signature)
	if trimmed == "" {
		return nil
	}
	prepareAssistantForOpenAIResponseReasoning(assistantMessage)
	if streamState != nil {
		streamState.reasoningSeen = true
		streamState.reasoningEmitted = true
	}
	previousSignature := currentAssistantThinkingSignatureAtIndex(assistantMessage, index)
	setAssistantThinkingSignatureAtIndex(assistantMessage, index, trimmed)
	if previousSignature == trimmed {
		return nil
	}
	return e.emitOpenAIResponseThinkingDelta(ctx, prepared, assistantMessage, index, "", nil, optionalStringPointer(trimmed))
}

func (e *Executor) applyOpenAIResponseReasoningItemFallback(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	item responses.ResponseReasoningItem,
	streamState *openAIResponseStreamState,
) error {
	prepareAssistantForOpenAIResponseReasoning(assistantMessage)
	if streamState != nil {
		streamState.reasoningSeen = true
	}
	setAssistantThinkingProviderItemIDAtIndex(assistantMessage, 0, item.ID)
	summary := joinOpenAIResponseReasoningSummary(item.Summary)
	if strings.TrimSpace(summary) != "" {
		previousSummary := currentOpenAIResponseSummary(streamState)
		if streamState != nil {
			streamState.summary = summary
			streamState.summaryParts = openAIResponseReasoningSummaryParts(item.Summary)
			streamState.reasoningEmitted = true
		}
		setAssistantThinkingSummaryAtIndex(assistantMessage, 0, summary)
		if strings.TrimSpace(previousSummary) != strings.TrimSpace(summary) {
			if err := e.emitOpenAIResponseThinkingDelta(
				ctx,
				prepared,
				assistantMessage,
				0,
				"",
				optionalStringPointer(summary),
				nil,
			); err != nil {
				return err
			}
		}
	}
	reasoning := joinOpenAIResponseReasoningContent(item.Content)
	if strings.TrimSpace(reasoning) != "" {
		previousThinking := currentAssistantThinkingTextAtIndex(assistantMessage, 0)
		if streamState != nil {
			streamState.reasoningEmitted = true
		}
		setAssistantThinkingTextAtIndex(assistantMessage, 0, reasoning)
		thinkingDelta := authoritativeResponseReplacementSuffix(previousThinking, reasoning)
		if thinkingDelta != "" {
			if err := e.emitOpenAIResponseThinkingDelta(ctx, prepared, assistantMessage, 0, thinkingDelta, nil, nil); err != nil {
				return err
			}
		}
	}
	if err := e.applyOpenAIResponseReasoningSignature(
		ctx,
		prepared,
		assistantMessage,
		streamState,
		0,
		item.EncryptedContent,
	); err != nil {
		return err
	}
	return e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, false)
}

func (e *Executor) applyOpenAIResponseContentPartDone(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	streamState *openAIResponseStreamState,
	itemID string,
	part responses.ResponseContentPartDoneEventPartUnion,
) error {
	return e.applyOpenAIResponseContentPart(ctx, prepared, assistantMessage, streamState, itemID, part.AsAny())
}

func (e *Executor) applyOpenAIResponseContentPartAdded(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	streamState *openAIResponseStreamState,
	itemID string,
	part responses.ResponseContentPartAddedEventPartUnion,
) error {
	return e.applyOpenAIResponseContentPart(ctx, prepared, assistantMessage, streamState, itemID, part.AsAny())
}

func resetOpenAIResponseBufferedText(streamState *openAIResponseStreamState) {
	if streamState == nil {
		return
	}
	streamState.bufferedText.Reset()
}

func (e *Executor) applyOpenAIResponseAuthoritativeTextPart(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	streamState *openAIResponseStreamState,
	itemID string,
	contentType string,
	text string,
) error {
	if strings.TrimSpace(text) == "" {
		return nil
	}
	setAssistantProviderMessageID(assistantMessage, itemID)
	setAssistantProviderMessageContentType(assistantMessage, contentType)
	resetOpenAIResponseBufferedText(streamState)
	textIndex := openAIResponseTextIndex(assistantMessage, streamState)
	textDelta := authoritativeResponseReplacementSuffix(currentAssistantTextAtIndex(assistantMessage, textIndex), text)
	setAssistantTextAtIndex(assistantMessage, textIndex, text)
	if textDelta == "" {
		return nil
	}
	return e.emitOpenAIResponseTextDelta(ctx, prepared, assistantMessage, textIndex, textDelta)
}

func (e *Executor) applyOpenAIResponseAuthoritativeReasoningPart(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	streamState *openAIResponseStreamState,
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
	thinkingDelta := authoritativeResponseReplacementSuffix(currentAssistantThinkingTextAtIndex(assistantMessage, 0), text)
	setAssistantThinkingTextAtIndex(assistantMessage, 0, text)
	if thinkingDelta != "" {
		if err := e.emitOpenAIResponseThinkingDelta(ctx, prepared, assistantMessage, 0, thinkingDelta, nil, nil); err != nil {
			return err
		}
	}
	return e.flushBufferedOpenAIResponseText(ctx, prepared, assistantMessage, streamState, false)
}

func (e *Executor) applyOpenAIResponseContentPart(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	streamState *openAIResponseStreamState,
	itemID string,
	part any,
) error {
	switch typed := part.(type) {
	case responses.ResponseOutputText:
		return e.applyOpenAIResponseAuthoritativeTextPart(
			ctx,
			prepared,
			assistantMessage,
			streamState,
			itemID,
			"output_text",
			typed.Text,
		)
	case responses.ResponseOutputRefusal:
		return e.applyOpenAIResponseAuthoritativeTextPart(
			ctx,
			prepared,
			assistantMessage,
			streamState,
			itemID,
			"refusal",
			typed.Refusal,
		)
	case responses.ResponseContentPartDoneEventPartReasoningText:
		return e.applyOpenAIResponseAuthoritativeReasoningPart(ctx, prepared, assistantMessage, streamState, typed.Text)
	case responses.ResponseContentPartAddedEventPartReasoningText:
		return e.applyOpenAIResponseAuthoritativeReasoningPart(ctx, prepared, assistantMessage, streamState, typed.Text)
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
		if err := e.emitOpenAIResponseThinkingDelta(ctx, prepared, assistantMessage, 0, "", optionalStringPointer(summary), nil); err != nil {
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
	itemID string,
	contentType string,
	delta string,
) error {
	if strings.TrimSpace(delta) == "" && delta == "" {
		return nil
	}
	setAssistantProviderMessageID(assistantMessage, itemID)
	setAssistantProviderMessageContentType(assistantMessage, contentType)
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
	signature *string,
) error {
	if !prepared.emitStream {
		return nil
	}
	if thinking == "" &&
		(summary == nil || strings.TrimSpace(*summary) == "") &&
		(signature == nil || strings.TrimSpace(*signature) == "") {
		return nil
	}
	return e.applyChunk(ctx, prepared, realtime.MessageDeltaEvent{
		Type:      realtime.StreamingEventTypeDelta,
		MessageID: stringValue(assistantMessage["id"]),
		Content: []any{
			realtime.MessageThinkingDelta{
				Type:      realtime.MessageContentTypeThinkingDelta,
				Index:     index,
				Thinking:  thinking,
				Summary:   summary,
				Signature: signature,
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
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	response responses.Response,
	streamState *openAIResponseStreamState,
	accumulator *toolCallAccumulator,
	previewAccumulator *toolPreviewAccumulator,
) error {
	for index, itemUnion := range response.Output {
		switch item := itemUnion.AsAny().(type) {
		case responses.ResponseFunctionToolCall:
			previousArguments := accumulator.currentArguments(index)
			state := accumulator.applyResolved(index, item.CallID, item.ID, item.Name, item.Arguments)
			argumentsDelta := authoritativeResponseReplacementSuffix(previousArguments, item.Arguments)
			if err := e.emitOpenAIResponseToolArgumentUpdate(
				ctx,
				prepared,
				assistantMessage,
				previewAccumulator,
				state,
				argumentsDelta,
			); err != nil {
				return err
			}
		default:
			if err := e.applyOpenAIResponseOutputItemFallback(
				ctx,
				prepared,
				assistantMessage,
				itemUnion,
				index,
				streamState,
				accumulator,
			); err != nil {
				return err
			}
		}
	}
	return nil
}

func (e *Executor) applyOpenAIResponseOutputItemFallback(
	ctx context.Context,
	prepared preparedExecution,
	assistantMessage map[string]any,
	itemUnion responses.ResponseOutputItemUnion,
	outputIndex int,
	streamState *openAIResponseStreamState,
	accumulator *toolCallAccumulator,
) error {
	switch item := itemUnion.AsAny().(type) {
	case responses.ResponseReasoningItem:
		return e.applyOpenAIResponseReasoningItemFallback(
			ctx,
			prepared,
			assistantMessage,
			item,
			streamState,
		)
	case responses.ResponseOutputMessage:
		setAssistantProviderMessageID(assistantMessage, item.ID)
		setAssistantProviderMessagePhase(assistantMessage, string(item.Phase))
		setAssistantProviderMessageContentType(assistantMessage, openAIResponseOutputMessageContentType(item.Content))
		text := joinOpenAIResponseOutputMessageText(item.Content)
		if strings.TrimSpace(text) == "" {
			return nil
		}
		if streamState != nil {
			streamState.bufferedText.Reset()
		}
		textIndex := openAIResponseTextIndex(assistantMessage, streamState)
		textDelta := authoritativeResponseReplacementSuffix(currentAssistantTextAtIndex(assistantMessage, textIndex), text)
		setAssistantTextAtIndex(assistantMessage, textIndex, text)
		if textDelta != "" {
			return e.emitOpenAIResponseTextDelta(ctx, prepared, assistantMessage, textIndex, textDelta)
		}
		return nil
	case responses.ResponseFunctionToolCall:
		if accumulator == nil {
			return nil
		}
		accumulator.applyResolved(outputIndex, item.CallID, item.ID, item.Name, item.Arguments)
	}
	return nil
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

func openAIResponseOutputMessageContentType(content []responses.ResponseOutputMessageContentUnion) string {
	if len(content) == 0 {
		return ""
	}
	contentType := ""
	for _, entry := range content {
		switch variant := entry.AsAny().(type) {
		case responses.ResponseOutputText:
			if strings.TrimSpace(variant.Text) == "" {
				continue
			}
			if contentType == "" {
				contentType = "output_text"
				continue
			}
			if contentType != "output_text" {
				return ""
			}
		case responses.ResponseOutputRefusal:
			if strings.TrimSpace(variant.Refusal) == "" {
				continue
			}
			if contentType == "" {
				contentType = "refusal"
				continue
			}
			if contentType != "refusal" {
				return ""
			}
		}
	}
	return contentType
}
