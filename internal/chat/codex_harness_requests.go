package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/codexapp"
)

const (
	codexJSONRPCErrorCapabilityUnavailable = -32001
	codexJSONRPCErrorToolUnavailable       = -32002
	codexJSONRPCErrorToolFailed            = -32003
)

func mcpElicitationApprovalFromCodex(params map[string]any, context codexApprovalContext) (ApprovalRequest, codexApprovalDetails, error) {
	input, err := structuredInputFromMCP(params, context.requestID)
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	title := "MCP input requested"
	if input.ServerName != "" {
		title = "MCP input requested: " + input.ServerName
	}
	approval := ApprovalRequest{
		ID:              "codex_" + context.requestID,
		RunID:           context.runID,
		ProviderItemID:  context.providerItemID,
		Kind:            ApprovalKindStructured,
		Title:           title,
		Body:            input.Message,
		Question:        input.Message,
		Options:         []string{},
		Questions:       []ApprovalQuestion{},
		StructuredInput: &input,
	}
	return approval, codexApprovalDetails{
		runItem: RunItem{
			ProviderItemID: context.providerItemID,
			Type:           RunItemTypeStructuredInput,
			Status:         RunItemStatusPending,
			Title:          title,
			Summary:        input.Message,
			ServerName:     input.ServerName,
			RequestID:      context.requestID,
			RawDetails:     input.Schema,
		},
	}, nil
}

func structuredInputFromMCP(params map[string]any, requestID string) (StructuredInputRequest, error) {
	input, mode, err := baseStructuredInputFromMCP(params, requestID)
	if err != nil {
		return StructuredInputRequest{}, err
	}
	return structuredInputWithMode(params, input, mode)
}

func baseStructuredInputFromMCP(params map[string]any, requestID string) (StructuredInputRequest, string, error) {
	serverName, err := requireString(params, "serverName", "codex mcp elicitation")
	if err != nil {
		return StructuredInputRequest{}, "", err
	}
	threadID, err := requireString(params, "threadId", "codex mcp elicitation")
	if err != nil {
		return StructuredInputRequest{}, "", err
	}
	turnID, err := optionalString(params, "turnId", "codex mcp elicitation")
	if err != nil {
		return StructuredInputRequest{}, "", err
	}
	mode, err := requireString(params, "mode", "codex mcp elicitation")
	if err != nil {
		return StructuredInputRequest{}, "", err
	}
	message, err := requireStringAllowEmpty(params, "message", "codex mcp elicitation")
	if err != nil {
		return StructuredInputRequest{}, "", err
	}
	meta, err := rawJSONField(params, "_meta", "codex mcp elicitation")
	if err != nil {
		return StructuredInputRequest{}, "", err
	}
	input := StructuredInputRequest{
		ProviderRequestID: requestID,
		ThreadID:          threadID,
		TurnID:            turnID,
		ServerName:        serverName,
		Message:           message,
		Meta:              meta,
	}
	return input, mode, nil
}

func structuredInputWithMode(params map[string]any, input StructuredInputRequest, mode string) (StructuredInputRequest, error) {
	switch mode {
	case string(StructuredInputModeForm):
		schema, err := rawJSONRequiredField(params, "requestedSchema", "codex mcp elicitation")
		if err != nil {
			return StructuredInputRequest{}, err
		}
		input.Mode = StructuredInputModeForm
		input.Schema = schema
	case string(StructuredInputModeURL):
		url, err := requireString(params, "url", "codex mcp elicitation")
		if err != nil {
			return StructuredInputRequest{}, err
		}
		elicitationID, err := requireString(params, "elicitationId", "codex mcp elicitation")
		if err != nil {
			return StructuredInputRequest{}, err
		}
		input.Mode = StructuredInputModeURL
		input.URL = url
		input.ElicitationID = elicitationID
	default:
		return StructuredInputRequest{}, fmt.Errorf("unsupported codex mcp elicitation mode: %s", mode)
	}
	return input, nil
}

func (harness *CodexHarness) handleImmediateCodexServerRequest(ctx context.Context, message jsonRPCMessage, runID string, threadID string, turnID string, sink TurnSink) error {
	switch message.Method {
	case codexapp.CodexServerRequestItemToolCall:
		return harness.handleCodexDynamicToolCall(ctx, message, runID, threadID, turnID, sink)
	case codexapp.CodexServerRequestAttestationGenerate:
		return harness.handleCodexAttestationGenerate(ctx, message, sink)
	default:
		return fmt.Errorf("codex request %s is not an immediate request", message.Method)
	}
}

func (harness *CodexHarness) handleCodexDynamicToolCall(ctx context.Context, message jsonRPCMessage, runID string, threadID string, turnID string, sink TurnSink) error {
	params, err := objectValue(message.Params, "codex dynamic tool call params")
	if err != nil {
		return err
	}
	if err := validateCodexRequestTurn(message, params, threadID, turnID, sink); err != nil {
		return err
	}
	call, err := codexDynamicToolCall(params)
	if err != nil {
		return err
	}
	tool, ok := harness.config.Tools.Lookup(call.Namespace, call.Tool)
	item := codexDynamicToolRunItem(call, tool, ok)
	if err := sink.RunItemUpsert(item); err != nil {
		return err
	}
	if !ok {
		return finishCodexDynamicToolCallError(message, sink, item, codexJSONRPCErrorToolUnavailable, "unsupported dynamic tool: "+agentToolKey(call.Namespace, call.Tool))
	}
	result, err := tool.Handler(harness.agentToolRuntimeContext(ctx, runID, threadID, turnID), call)
	if err != nil {
		return finishCodexDynamicToolCallError(message, sink, item, codexJSONRPCErrorToolFailed, "dynamic tool failed: "+err.Error())
	}
	return finishCodexDynamicToolCallSuccess(message, sink, item, result)
}

func finishCodexDynamicToolCallError(message jsonRPCMessage, sink TurnSink, item RunItem, code int, messageText string) error {
	item.Status = RunItemStatusFailed
	if err := setDynamicToolRunItemError(&item, messageText); err != nil {
		return err
	}
	if err := sink.RunItemUpsert(item); err != nil {
		return err
	}
	return message.RespondError(code, messageText)
}

func finishCodexDynamicToolCallSuccess(message jsonRPCMessage, sink TurnSink, item RunItem, result AgentToolResult) error {
	item.Status = RunItemStatusCompleted
	if err := setDynamicToolRunItemResult(&item, result); err != nil {
		return err
	}
	if err := sink.RunItemUpsert(item); err != nil {
		return err
	}
	return message.RespondResult(map[string]any{
		"contentItems": codexDynamicToolContentItems(result.ContentItems),
		"success":      result.Success,
	})
}

func (harness *CodexHarness) agentToolRuntimeContext(ctx context.Context, runID string, threadID string, turnID string) context.Context {
	harness.mu.Lock()
	active := harness.active[runID]
	var request TurnRequest
	if active != nil {
		request = active.request
	}
	harness.mu.Unlock()
	if request.Run.ID == "" {
		return ctx
	}
	return ContextWithAgentToolRuntime(ctx, AgentToolRuntimeContext{
		Workspace:    request.Workspace,
		Conversation: request.Conversation,
		Run:          request.Run,
		ThreadID:     threadID,
		TurnID:       turnID,
	})
}

func codexDynamicToolRunItem(call AgentToolCall, tool AgentTool, registered bool) RunItem {
	details := RunItemDynamicToolCallDetails{
		Namespace: call.Namespace,
		ToolName:  call.Tool,
		Arguments: call.Arguments,
	}
	item := RunItem{
		ProviderItemID: call.CallID,
		Type:           RunItemTypeDynamicToolCall,
		Status:         RunItemStatusRunning,
		Title:          "Dynamic tool call",
		Details:        NewRunItemDynamicToolCallDetails(details),
	}
	if registered {
		details.DisplayTitle = tool.AuditMetadata.DisplayName
		details.Description = tool.AuditMetadata.Description
		details.Category = tool.AuditMetadata.Category
		item.Title = tool.AuditMetadata.DisplayName
		item.Summary = tool.AuditMetadata.Description
		item.Details = NewRunItemDynamicToolCallDetails(details)
	}
	return item
}

func setDynamicToolRunItemError(item *RunItem, message string) error {
	details, ok := item.DynamicToolCallDetails()
	if !ok {
		return fmt.Errorf("dynamic tool run item %s is missing typed details", item.ProviderItemID)
	}
	updated := cloneDynamicToolCallDetails(*details)
	updated.Error = message
	item.Details = NewRunItemDynamicToolCallDetails(updated)
	return nil
}

func setDynamicToolRunItemResult(item *RunItem, result AgentToolResult) error {
	details, ok := item.DynamicToolCallDetails()
	if !ok {
		return fmt.Errorf("dynamic tool run item %s is missing typed details", item.ProviderItemID)
	}
	updated := cloneDynamicToolCallDetails(*details)
	updated.ResultSummary = codexDynamicToolResultSummary(result)
	success := result.Success
	updated.Result = &RunItemDynamicToolResult{
		ContentItems: dynamicToolResultContentItems(result.ContentItems),
		Success:      &success,
	}
	item.Details = NewRunItemDynamicToolCallDetails(updated)
	return nil
}

func codexDynamicToolCall(params map[string]any) (AgentToolCall, error) {
	callID, err := requireString(params, "callId", "codex dynamic tool call")
	if err != nil {
		return AgentToolCall{}, err
	}
	namespace, err := optionalString(params, "namespace", "codex dynamic tool call")
	if err != nil {
		return AgentToolCall{}, err
	}
	tool, err := requireString(params, "tool", "codex dynamic tool call")
	if err != nil {
		return AgentToolCall{}, err
	}
	arguments, err := rawJSONRequiredField(params, "arguments", "codex dynamic tool call")
	if err != nil {
		return AgentToolCall{}, err
	}
	return AgentToolCall{CallID: callID, Namespace: namespace, Tool: tool, Arguments: arguments}, nil
}

func codexDynamicToolContentItems(items []AgentToolContentItem) []map[string]any {
	if items == nil {
		return []map[string]any{}
	}
	content := make([]map[string]any, 0, len(items))
	for _, item := range items {
		switch item.Type {
		case "inputImage":
			content = append(content, map[string]any{"type": "inputImage", "imageUrl": item.ImageURL})
		default:
			content = append(content, map[string]any{"type": "inputText", "text": item.Text})
		}
	}
	return content
}

func dynamicToolResultContentItems(items []AgentToolContentItem) []RunItemDynamicToolContentItem {
	if items == nil {
		return []RunItemDynamicToolContentItem{}
	}
	content := make([]RunItemDynamicToolContentItem, 0, len(items))
	for _, item := range items {
		content = append(content, RunItemDynamicToolContentItem{
			Type:     item.Type,
			Text:     item.Text,
			ImageURL: item.ImageURL,
		})
	}
	return content
}

func codexDynamicToolResultSummary(result AgentToolResult) string {
	if len(result.ContentItems) == 0 {
		if result.Success {
			return "Tool completed"
		}
		return "Tool failed"
	}
	parts := make([]string, 0, len(result.ContentItems))
	for _, item := range result.ContentItems {
		if item.Text != "" {
			parts = append(parts, item.Text)
		}
	}
	return strings.Join(parts, "\n")
}

func (harness *CodexHarness) handleCodexAttestationGenerate(ctx context.Context, message jsonRPCMessage, sink TurnSink) error {
	if _, err := objectValue(message.Params, "codex attestation generate params"); err != nil {
		return err
	}
	if harness.config.AttestationProvider == nil {
		messageText := "attestation is unavailable in Setta"
		if diagnosticErr := sink.ProviderDiagnostic("codex_attestation_unavailable", messageText, nil, false, DiagnosticSeverityError); diagnosticErr != nil {
			return diagnosticErr
		}
		return message.RespondError(codexJSONRPCErrorCapabilityUnavailable, messageText)
	}
	token, err := harness.config.AttestationProvider.GenerateAttestation(ctx)
	if err != nil {
		messageText := "attestation generation failed: " + err.Error()
		if diagnosticErr := sink.ProviderDiagnostic("codex_attestation_failed", messageText, nil, false, DiagnosticSeverityError); diagnosticErr != nil {
			return diagnosticErr
		}
		return message.RespondError(codexJSONRPCErrorCapabilityUnavailable, messageText)
	}
	return message.RespondResult(map[string]any{"token": token})
}

func (harness *CodexHarness) applyCodexServerRequestResolved(message jsonRPCMessage, _ string, threadID string, sink TurnSink) error {
	params, err := objectValue(message.Params, "codex server request resolved params")
	if err != nil {
		return err
	}
	messageThreadID, err := requireString(params, "threadId", "codex server request resolved")
	if err != nil {
		return err
	}
	if err := requireCodexThreadIDMatch(message, threadID, messageThreadID, sink); err != nil {
		return err
	}
	requestID, err := requestIDString(params["requestId"])
	if err != nil {
		return err
	}
	harness.mu.Lock()
	approvalID := harness.approvalsByRequestID[requestID]
	if approvalID != "" {
		delete(harness.approvalsByRequestID, requestID)
		delete(harness.approvals, approvalID)
	}
	harness.mu.Unlock()
	if approvalID == "" {
		return sink.ProviderDiagnostic("codex_server_request_resolved_unknown", "Codex resolved an unknown server request", map[string]string{"requestId": requestID}, false, DiagnosticSeverityWarning)
	}
	if err := sink.ApprovalResolved(approvalID, false, "server request resolved"); err != nil {
		return err
	}
	return sink.Trace("codex_server_request_resolved", requestID)
}

func rawJSONRequiredField(value map[string]any, name string, label string) (json.RawMessage, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return nil, fmt.Errorf("%s.%s is required", label, name)
	}
	return rawJSON(raw, label+"."+name)
}

func rawJSONField(value map[string]any, name string, label string) (json.RawMessage, error) {
	raw, ok := value[name]
	if !ok {
		return nil, nil
	}
	return rawJSON(raw, label+"."+name)
}

func rawJSON(value any, label string) (json.RawMessage, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("%s must be JSON serializable: %w", label, err)
	}
	return json.RawMessage(data), nil
}

func requireStringArray(value map[string]any, name string, label string) ([]string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return nil, fmt.Errorf("%s.%s is required", label, name)
	}
	values, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("%s.%s must be an array", label, name)
	}
	result := make([]string, 0, len(values))
	for index, rawValue := range values {
		text, ok := rawValue.(string)
		if !ok {
			return nil, fmt.Errorf("%s.%s[%d] must be a string", label, name, index)
		}
		result = append(result, text)
	}
	return result, nil
}
