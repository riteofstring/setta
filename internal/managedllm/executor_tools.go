package managedllm

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/realtime"
)

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

func toolCallInputs(toolCall map[string]any) (string, string, map[string]any) {
	toolCallID := strings.TrimSpace(stringValue(toolCall["id"]))
	function, _ := toolCall["function"].(map[string]any)
	toolName := strings.TrimSpace(stringValue(function["name"]))
	arguments, _ := function["arguments"].(map[string]any)
	if arguments == nil {
		arguments = map[string]any{}
	}
	return toolCallID, toolName, arguments
}

func (e *Executor) resolveToolCallResult(
	ctx context.Context,
	prepared preparedExecution,
	request agentruns.ExecutionRequest,
	toolName string,
	arguments map[string]any,
) (mcpx.ToolDescriptor, mcpx.ToolCallResult, error) {
	if toolName == "" {
		return mcpx.ToolDescriptor{}, buildMissingToolResult(toolName), nil
	}
	if prepared.availableTools == nil {
		return mcpx.ToolDescriptor{}, buildDisallowedToolResult(toolName), nil
	}
	descriptor, ok := prepared.availableTools[mcpx.NormalizeToolName(toolName)]
	if !ok {
		return mcpx.ToolDescriptor{}, buildMissingToolResult(toolName), nil
	}
	if !isToolAllowed(toolName, prepared.toolAllowlist, request.CompletionGuardEnabled) {
		return descriptor, buildDisallowedToolResult(toolName), nil
	}
	if e.tools == nil {
		return mcpx.ToolDescriptor{}, mcpx.ToolCallResult{}, fmt.Errorf("%w: MCP tool client is unavailable", ErrToolsUnsupported)
	}
	result, err := e.tools.CallToolWithMeta(ctx, toolName, cloneAnyMap(arguments), buildToolRequestMeta(request, toolName))
	if err != nil {
		return mcpx.ToolDescriptor{}, mcpx.ToolCallResult{}, fmt.Errorf("execute managed MCP tool %q: %w", toolName, err)
	}
	return descriptor, result, nil
}

func (e *Executor) emitToolResultMessage(
	ctx context.Context,
	prepared preparedExecution,
	toolMessage map[string]any,
	descriptor mcpx.ToolDescriptor,
	result mcpx.ToolCallResult,
) error {
	if prepared.emitStream {
		if err := e.applyChunk(ctx, prepared, realtime.ToolResultEvent{
			Type:   realtime.StreamingEventTypeToolResult,
			Result: cloneMessage(toolMessage),
		}); err != nil {
			return err
		}
	}
	return e.emitToolResultFollow(ctx, prepared, descriptor, result)
}

func (e *Executor) executeToolCalls(ctx context.Context, prepared preparedExecution, request agentruns.ExecutionRequest, toolCalls []map[string]any) ([]map[string]any, []map[string]any, error) {
	toolMessages := make([]map[string]any, 0, len(toolCalls))
	providerMessages := make([]map[string]any, 0, len(toolCalls))
	for _, toolCall := range toolCalls {
		toolCallID, toolName, arguments := toolCallInputs(toolCall)
		descriptor, result, err := e.resolveToolCallResult(ctx, prepared, request, toolName, arguments)
		if err != nil {
			return nil, nil, err
		}

		toolMessage := buildToolResultMessage(toolCallID, toolName, arguments, result)
		toolMessages = append(toolMessages, toolMessage)
		if err := e.emitToolResultMessage(ctx, prepared, toolMessage, descriptor, result); err != nil {
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
