package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/codexapp"
)

const structuredTurnCleanupTimeout = 5 * time.Second

// FreshStructuredCallRequest describes one isolated, schema-constrained model
// call. Each request receives a new ephemeral provider thread and may not use
// tools, mutate the workspace, or request approval.
type FreshStructuredCallRequest struct {
	ID                    string          `json:"id"`
	WorkspaceRoot         string          `json:"workspaceRoot"`
	Invocation            Invocation      `json:"invocation"`
	DeveloperInstructions string          `json:"developerInstructions"`
	Input                 json.RawMessage `json:"input"`
	OutputSchema          json.RawMessage `json:"outputSchema"`
}

type FreshStructuredCallResult struct {
	ProviderThreadID string          `json:"providerThreadId"`
	ProviderTurnID   string          `json:"providerTurnId"`
	Output           json.RawMessage `json:"output"`
}

type schemaConstrainedTurnRequest struct {
	ID            string
	WorkspaceRoot string
	Invocation    Invocation
	Input         json.RawMessage
	OutputSchema  json.RawMessage
}

func (request FreshStructuredCallRequest) Validate() error {
	if strings.TrimSpace(request.ID) == "" || strings.TrimSpace(request.ID) != request.ID {
		return errors.New("fresh structured call id must be non-empty without surrounding whitespace")
	}
	if err := validateWorkspaceRoot(request.WorkspaceRoot); err != nil {
		return err
	}
	if err := validateFreshStructuredInvocation(request.Invocation); err != nil {
		return err
	}
	if strings.TrimSpace(request.DeveloperInstructions) == "" ||
		strings.TrimSpace(request.DeveloperInstructions) != request.DeveloperInstructions {
		return errors.New("fresh structured call developer instructions must be non-empty without surrounding whitespace")
	}
	if _, err := strictJSONObject(request.Input, "fresh structured call input"); err != nil {
		return err
	}
	return validateStrictOutputSchema(request.OutputSchema)
}

func validateFreshStructuredInvocation(invocation Invocation) error {
	if err := invocation.Validate(); err != nil {
		return err
	}
	if invocation.ModelSelectionProviderDefault {
		return errors.New("fresh structured call requires a catalog-resolved exact model")
	}
	if err := validateFreshStructuredSelection("reasoning effort", invocation.ReasoningEffort); err != nil {
		return err
	}
	if invocation.ServiceTier != nil {
		if err := validateFreshStructuredSelection("service tier", *invocation.ServiceTier); err != nil {
			return err
		}
	}
	if invocation.PermissionMode != PermissionModeReadOnly || invocation.ApprovalMode != ApprovalModeNever {
		return errors.New("fresh structured call requires read-only permission and no approvals")
	}
	return nil
}

func validateFreshStructuredSelection(label string, value string) error {
	if strings.TrimSpace(value) == "" || strings.TrimSpace(value) != value {
		return fmt.Errorf("fresh structured call %s must be exact and non-empty without surrounding whitespace", label)
	}
	return nil
}

// RunFreshStructuredCall starts a new in-memory provider thread for every
// invocation. It deliberately bypasses the primary-turn reservation map so a
// narrator or other read-only projector can run while the topic agent is
// active. Any attempted tool/server request fails the call.
func (runtime *Runtime) RunFreshStructuredCall(
	ctx context.Context,
	request FreshStructuredCallRequest,
) (result FreshStructuredCallResult, returnErr error) {
	if err := validateFreshStructuredRuntime(runtime, ctx, request); err != nil {
		return FreshStructuredCallResult{}, err
	}
	session, err := runtime.manager.NewSession(ctx)
	if err != nil {
		return FreshStructuredCallResult{}, fmt.Errorf("create fresh structured call session: %w", err)
	}
	defer session.Close()

	threadID, err := runtime.startFreshStructuredThread(ctx, session, request)
	if err != nil {
		return FreshStructuredCallResult{}, err
	}
	turnID, err := runtime.startSchemaConstrainedTurn(ctx, session, threadID, schemaConstrainedTurnRequest{
		ID:            request.ID,
		WorkspaceRoot: request.WorkspaceRoot,
		Invocation:    request.Invocation,
		Input:         request.Input,
		OutputSchema:  request.OutputSchema,
	})
	if err != nil {
		return FreshStructuredCallResult{}, err
	}
	terminalReceived := false
	cleanup := structuredTurnCleanup{
		session:          session,
		threadID:         threadID,
		turnID:           turnID,
		requestID:        request.ID,
		terminalReceived: &terminalReceived,
	}
	defer cleanup.apply(&returnErr)

	output, err := runtime.waitForStructuredTurn(ctx, session, request.ID, threadID, turnID, &terminalReceived)
	if err != nil {
		return FreshStructuredCallResult{}, err
	}
	return FreshStructuredCallResult{
		ProviderThreadID: threadID,
		ProviderTurnID:   turnID,
		Output:           output,
	}, nil
}

func validateFreshStructuredRuntime(
	runtime *Runtime,
	ctx context.Context,
	request FreshStructuredCallRequest,
) error {
	if runtime == nil || runtime.manager == nil {
		return errors.New("agent runtime is required")
	}
	if ctx == nil {
		return errors.New("fresh structured call context is required")
	}
	if err := request.Validate(); err != nil {
		return err
	}
	return ctx.Err()
}

type structuredTurnCleanup struct {
	session          *codexapp.Session
	threadID         string
	turnID           string
	requestID        string
	terminalReceived *bool
}

func (cleanup structuredTurnCleanup) apply(returnErr *error) {
	if *cleanup.terminalReceived {
		return
	}
	cleanupErr := interruptStructuredTurn(cleanup.session, cleanup.threadID, cleanup.turnID)
	if cleanupErr == nil {
		return
	}
	cleanupErr = fmt.Errorf("interrupt unfinished schema-constrained turn %s: %w", cleanup.requestID, cleanupErr)
	if *returnErr == nil {
		*returnErr = cleanupErr
		return
	}
	*returnErr = errors.Join(*returnErr, cleanupErr)
}

func (runtime *Runtime) startFreshStructuredThread(
	ctx context.Context,
	session *codexapp.Session,
	request FreshStructuredCallRequest,
) (string, error) {
	approvalPolicy, sandbox, err := providerThreadPolicies(request.Invocation)
	if err != nil {
		return "", err
	}
	config, err := readRestrictedModelThreadConfig(
		ctx,
		session,
		request.WorkspaceRoot,
		request.Invocation,
	)
	if err != nil {
		return "", err
	}
	allowFallback := false
	baseInstructions := restrictedThreadBaseInstructions
	ephemeral := true
	dynamicTools := []codexapp.DynamicToolSpec{}
	environments := []codexapp.TurnEnvironmentParams{}
	capabilityRoots := []codexapp.SelectedCapabilityRoot{}
	runtimeWorkspaceRoots := []codexapp.AbsolutePathBuf{}
	developerInstructions := freshStructuredDeveloperInstructions(request.DeveloperInstructions)
	params := codexapp.ThreadStartParams{
		AllowProviderModelFallback: &allowFallback,
		ApprovalPolicy:             approvalPolicy,
		BaseInstructions:           &baseInstructions,
		Config:                     &config,
		CWD:                        &request.WorkspaceRoot,
		DeveloperInstructions:      &developerInstructions,
		DynamicTools:               &dynamicTools,
		Environments:               &environments,
		Ephemeral:                  &ephemeral,
		RuntimeWorkspaceRoots:      &runtimeWorkspaceRoots,
		Sandbox:                    &sandbox,
		SelectedCapabilityRoots:    &capabilityRoots,
		ServiceTier:                nullableServiceTier(request.Invocation.ServiceTier),
	}
	params.Model = &request.Invocation.Model
	raw, err := session.Call(ctx, codexapp.CodexMethodThreadStart, params)
	if err != nil {
		return "", fmt.Errorf("start fresh structured call thread: %w", err)
	}
	response, err := codexapp.DecodeThreadStartResponse(raw)
	if err != nil {
		return "", fmt.Errorf("decode fresh structured call thread: %w", err)
	}
	thread, err := providerThread(response.Thread, response.Model)
	if err != nil {
		return "", runtime.rejectRestrictedThread(
			response.Thread.ID,
			fmt.Errorf("map fresh structured call thread: %w", err),
		)
	}
	if err := validateRestrictedModelThreadResponse(
		request.WorkspaceRoot,
		request.Invocation,
		true,
		restrictedThreadResponse{
			ApprovalPolicy:        response.ApprovalPolicy,
			CWD:                   response.CWD,
			InstructionSources:    response.InstructionSources,
			Model:                 response.Model,
			ReasoningEffort:       response.ReasoningEffort,
			RuntimeWorkspaceRoots: response.RuntimeWorkspaceRoots,
			Sandbox:               response.Sandbox,
			ServiceTier:           response.ServiceTier,
			Thread:                response.Thread,
		},
	); err != nil {
		return "", runtime.rejectRestrictedThread(
			thread.ID,
			fmt.Errorf("validate fresh structured call thread: %w", err),
		)
	}
	if err := session.OwnThread(thread.ID); err != nil {
		return "", runtime.rejectRestrictedThread(thread.ID, err)
	}
	return thread.ID, nil
}

func (runtime *Runtime) startSchemaConstrainedTurn(
	ctx context.Context,
	session *codexapp.Session,
	threadID string,
	request schemaConstrainedTurnRequest,
) (string, error) {
	input, err := textUserInput(string(request.Input))
	if err != nil {
		return "", err
	}
	approvalPolicy, _, err := providerThreadPolicies(request.Invocation)
	if err != nil {
		return "", err
	}
	sandboxPolicyJSON, err := json.Marshal(map[string]string{"type": "readOnly"})
	if err != nil {
		return "", fmt.Errorf("encode fresh structured call sandbox policy: %w", err)
	}
	sandboxPolicy := codexapp.SandboxPolicy(sandboxPolicyJSON)
	params := codexapp.TurnStartParams{
		ApprovalPolicy:      approvalPolicy,
		ClientUserMessageId: &request.ID,
		CWD:                 &request.WorkspaceRoot,
		Input:               []codexapp.UserInput{input},
		OutputSchema:        append(json.RawMessage{}, request.OutputSchema...),
		SandboxPolicy:       &sandboxPolicy,
		ServiceTier:         cloneString(request.Invocation.ServiceTier),
		ThreadID:            threadID,
	}
	params.Model = &request.Invocation.Model
	effort := codexapp.ReasoningEffort(request.Invocation.ReasoningEffort)
	params.Effort = &effort
	raw, err := session.Call(ctx, codexapp.CodexMethodTurnStart, params)
	if err != nil {
		return "", fmt.Errorf("start fresh structured call turn: %w", err)
	}
	response, err := codexapp.DecodeTurnStartResponse(raw)
	if err != nil {
		return "", fmt.Errorf("decode fresh structured call turn: %w", err)
	}
	if response.Turn.ID == "" {
		return "", errors.New("fresh structured call turn response has no provider turn id")
	}
	if err := session.OwnTurn(threadID, response.Turn.ID); err != nil {
		return "", err
	}
	return response.Turn.ID, nil
}

func (runtime *Runtime) waitForStructuredTurn(
	ctx context.Context,
	session *codexapp.Session,
	requestID string,
	threadID string,
	turnID string,
	terminalReceived *bool,
) (json.RawMessage, error) {
	base := Event{
		ConversationID:   "fresh-structured-" + requestID,
		TurnID:           requestID,
		ProviderThreadID: threadID,
		ProviderTurnID:   turnID,
	}
	completedMessages := []string{}
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case providerEvent, ok := <-session.Events():
			if !ok {
				return nil, errors.New("fresh structured call provider session closed before completion")
			}
			terminal, err := handleFreshStructuredProviderEvent(providerEvent, base, &completedMessages)
			if err != nil {
				return nil, err
			}
			if terminal == nil {
				continue
			}
			*terminalReceived = true
			if terminal.Outcome != TurnOutcomeCompleted {
				message := string(terminal.Outcome)
				if terminal.Error != nil {
					message += ": " + *terminal.Error
				}
				return nil, fmt.Errorf("fresh structured call provider turn ended %s", message)
			}
			if len(completedMessages) != 1 {
				return nil, fmt.Errorf(
					"fresh structured call produced %d completed assistant messages, want exactly one",
					len(completedMessages),
				)
			}
			return strictJSONObject([]byte(completedMessages[0]), "fresh structured call output")
		}
	}
}

func handleFreshStructuredProviderEvent(
	providerEvent codexapp.Event,
	base Event,
	completedMessages *[]string,
) (*TerminalEvent, error) {
	switch providerEvent.Kind {
	case codexapp.EventRequest:
		err := fmt.Errorf("fresh structured call attempted disallowed provider request %s", providerEvent.Message.Method)
		_ = providerEvent.Message.RespondError(-32001, err.Error())
		return nil, err
	case codexapp.EventLifecycle:
		message := "provider lifecycle changed"
		if providerEvent.Err != nil {
			message = providerEvent.Err.Error()
		}
		return nil, fmt.Errorf("fresh structured call provider lifecycle failed: %s", message)
	case codexapp.EventLag:
		return nil, errors.New("fresh structured call provider event stream lagged")
	case codexapp.EventNotification:
		events, terminal, err := normalizedProviderNotification(providerEvent.Message, base)
		if err != nil {
			return nil, err
		}
		for _, event := range events {
			switch event.Kind {
			case EventKindAgentTextDelta, EventKindReasoningSummary, EventKindTurnStarted, EventKindTurnTerminal:
			case EventKindAgentTextCompleted:
				if event.Text == nil {
					return nil, errors.New("fresh structured call completed assistant message has no text")
				}
				*completedMessages = append(*completedMessages, event.Text.Text)
			default:
				return nil, fmt.Errorf("fresh structured call attempted disallowed provider activity %s", event.Kind)
			}
		}
		return terminal, nil
	default:
		return nil, fmt.Errorf("unsupported fresh structured call provider event %q", providerEvent.Kind)
	}
}

func interruptStructuredTurn(session *codexapp.Session, threadID string, turnID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), structuredTurnCleanupTimeout)
	defer cancel()
	raw, err := session.Call(ctx, codexapp.CodexMethodTurnInterrupt, codexapp.TurnInterruptParams{
		ThreadID: threadID,
		TurnID:   turnID,
	})
	if err != nil {
		return err
	}
	if _, err := codexapp.DecodeTurnInterruptResponse(raw); err != nil {
		return err
	}
	return waitForFreshStructuredTerminal(ctx, session, threadID, turnID)
}

func waitForFreshStructuredTerminal(
	ctx context.Context,
	session *codexapp.Session,
	threadID string,
	turnID string,
) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case event, ok := <-session.Events():
			if !ok {
				return errors.New("fresh structured call session closed before interrupted turn became terminal")
			}
			matched, err := freshStructuredTerminalNotification(event, threadID, turnID)
			if err != nil {
				return err
			}
			if matched {
				return nil
			}
		}
	}
}

func freshStructuredTerminalNotification(
	event codexapp.Event,
	threadID string,
	turnID string,
) (bool, error) {
	switch event.Kind {
	case codexapp.EventRequest:
		err := fmt.Errorf("interrupted fresh structured call received provider request %s", event.Message.Method)
		if respondErr := event.Message.RespondError(-32001, err.Error()); respondErr != nil {
			return false, errors.Join(err, fmt.Errorf("reject provider request during interruption: %w", respondErr))
		}
		// Rejecting a request is part of draining an interrupted turn. Keep the
		// session attached until the provider confirms the matching terminal
		// notification instead of abandoning the turn after the request.
		return false, nil
	case codexapp.EventLifecycle:
		return false, errors.New("fresh structured call provider stopped during interruption")
	case codexapp.EventLag:
		return false, errors.New("fresh structured call provider event stream lagged during interruption")
	case codexapp.EventNotification:
		if event.Message.Method != codexapp.CodexNotificationTurnCompleted {
			return false, nil
		}
		notification, err := codexapp.DecodeTurnCompletedNotification(event.Message.Params)
		if err != nil {
			return false, err
		}
		if notification.ThreadID != threadID || notification.Turn.ID != turnID {
			return false, fmt.Errorf(
				"interrupted fresh structured call terminal scope %s/%s does not match %s/%s",
				notification.ThreadID,
				notification.Turn.ID,
				threadID,
				turnID,
			)
		}
		return true, nil
	default:
		return false, fmt.Errorf("unsupported fresh structured cleanup event %q", event.Kind)
	}
}

func freshStructuredDeveloperInstructions(callInstructions string) string {
	return strings.Join([]string{
		"This is an isolated schema-constrained read-only call.",
		"Use only the supplied JSON input. Do not inspect the workspace, invoke tools, request approval, or return Markdown.",
		callInstructions,
	}, "\n\n")
}

func strictJSONObject(raw []byte, label string) (json.RawMessage, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, fmt.Errorf("%s is required", label)
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(trimmed, &object); err != nil {
		return nil, fmt.Errorf("%s must be one JSON object: %w", label, err)
	}
	if object == nil {
		return nil, fmt.Errorf("%s must be a JSON object", label)
	}
	compact := bytes.Buffer{}
	if err := json.Compact(&compact, trimmed); err != nil {
		return nil, fmt.Errorf("compact %s: %w", label, err)
	}
	return json.RawMessage(compact.Bytes()), nil
}

func validateStrictOutputSchema(raw json.RawMessage) error {
	compacted, err := strictJSONObject(raw, "fresh structured call output schema")
	if err != nil {
		return err
	}
	var schema map[string]any
	if err := json.Unmarshal(compacted, &schema); err != nil {
		return fmt.Errorf("decode fresh structured call output schema: %w", err)
	}
	if schema["type"] != "object" {
		return errors.New("fresh structured call output schema root type must be object")
	}
	return validateStrictSchemaNode(schema, "output schema")
}

func validateStrictSchemaNode(schema map[string]any, path string) error {
	if variants, ok := schema["anyOf"]; ok {
		items, ok := variants.([]any)
		if !ok || len(items) == 0 {
			return fmt.Errorf("%s anyOf must be a non-empty array", path)
		}
		for index, item := range items {
			child, ok := item.(map[string]any)
			if !ok {
				return fmt.Errorf("%s anyOf[%d] must be an object", path, index)
			}
			if err := validateStrictSchemaNode(child, fmt.Sprintf("%s.anyOf[%d]", path, index)); err != nil {
				return err
			}
		}
	}
	typeName, _ := schema["type"].(string)
	switch typeName {
	case "object":
		return validateStrictObjectSchema(schema, path)
	case "array":
		items, ok := schema["items"].(map[string]any)
		if !ok {
			return fmt.Errorf("%s array schema requires object items", path)
		}
		return validateStrictSchemaNode(items, path+".items")
	default:
		return nil
	}
}

func validateStrictObjectSchema(schema map[string]any, path string) error {
	additional, ok := schema["additionalProperties"].(bool)
	if !ok || additional {
		return fmt.Errorf("%s object schema must set additionalProperties to false", path)
	}
	properties, ok := schema["properties"].(map[string]any)
	if !ok {
		return fmt.Errorf("%s object schema requires properties", path)
	}
	required, err := strictSchemaRequiredFields(schema, path)
	if err != nil {
		return err
	}
	if err := validateStrictSchemaRequiredProperties(properties, required, path); err != nil {
		return err
	}
	return validateStrictSchemaProperties(properties, path)
}

func strictSchemaRequiredFields(schema map[string]any, path string) (map[string]bool, error) {
	requiredValues, ok := schema["required"].([]any)
	if !ok {
		return nil, fmt.Errorf("%s object schema requires a required array", path)
	}
	required := make(map[string]bool, len(requiredValues))
	for _, value := range requiredValues {
		name, ok := value.(string)
		if !ok || required[name] {
			return nil, fmt.Errorf("%s required fields must be unique strings", path)
		}
		required[name] = true
	}
	return required, nil
}

func validateStrictSchemaRequiredProperties(
	properties map[string]any,
	required map[string]bool,
	path string,
) error {
	if len(required) != len(properties) {
		return fmt.Errorf("%s strict object schema must require every property", path)
	}
	for name := range properties {
		if !required[name] {
			return fmt.Errorf("%s property %s is not required", path, name)
		}
	}
	return nil
}

func validateStrictSchemaProperties(properties map[string]any, path string) error {
	for name, rawChild := range properties {
		child, ok := rawChild.(map[string]any)
		if !ok {
			return fmt.Errorf("%s property %s schema must be an object", path, name)
		}
		if err := validateStrictSchemaNode(child, path+"."+name); err != nil {
			return err
		}
	}
	return nil
}
