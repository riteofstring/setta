package chat

import (
	"context"
	"encoding/json"
	"fmt"

	"setta/internal/codexapp"
)

const (
	codexJSONRPCErrorCapabilityUnavailable = -32001
)

func (harness *CodexHarness) registerConnectionRequestHandlers() {
	harness.manager.RegisterRequestHandler(codexapp.CodexServerRequestAttestationGenerate, harness.handleConnectionAttestationGenerate)
}

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
	return approval, codexApprovalDetails{runItem: approvalRequestRunItem(approval)}, nil
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

func (harness *CodexHarness) handleImmediateCodexServerRequest(ctx context.Context, message jsonRPCMessage, _ string, _ string, _ string, sink TurnSink) error {
	switch message.Method {
	case codexapp.CodexServerRequestAttestationGenerate:
		return harness.handleCodexAttestationGenerate(ctx, message, sink)
	default:
		return fmt.Errorf("codex request %s is not an immediate request", message.Method)
	}
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

func (harness *CodexHarness) handleConnectionAttestationGenerate(message jsonRPCMessage) {
	if _, err := objectValue(message.Params, "codex attestation generate params"); err != nil {
		_ = message.RespondError(codexJSONRPCErrorCapabilityUnavailable, err.Error())
		return
	}
	if harness.config.AttestationProvider == nil {
		_ = message.RespondError(codexJSONRPCErrorCapabilityUnavailable, "attestation is unavailable in Setta")
		return
	}
	token, err := harness.config.AttestationProvider.GenerateAttestation(context.Background())
	if err != nil {
		_ = message.RespondError(codexJSONRPCErrorCapabilityUnavailable, "attestation generation failed: "+err.Error())
		return
	}
	_ = message.RespondResult(map[string]any{"token": token})
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
