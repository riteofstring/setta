package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"setta/internal/codexapp"
)

func (runtime *Runtime) captureApproval(message codexapp.Message, base Event) (ApprovalRequest, error) {
	requestID, err := providerRequestID(message.ID)
	if err != nil {
		return ApprovalRequest{}, err
	}
	pending := pendingApproval{conversationID: base.ConversationID, method: message.Method, message: message}
	factory := approvalFactories[message.Method]
	if factory == nil {
		return ApprovalRequest{}, fmt.Errorf("unsupported provider request %s", message.Method)
	}
	approval, err := factory(message.Params, base, requestID, &pending)
	if err != nil {
		return ApprovalRequest{}, err
	}
	if approval.ProviderItemID == "" {
		return ApprovalRequest{}, errors.New("provider approval item id is required")
	}
	runtime.mu.Lock()
	if _, exists := runtime.pending[requestID]; exists {
		runtime.mu.Unlock()
		return ApprovalRequest{}, fmt.Errorf("provider approval request %s is already pending", requestID)
	}
	runtime.pending[requestID] = pending
	runtime.mu.Unlock()
	return approval, nil
}

type approvalFactory func(json.RawMessage, Event, string, *pendingApproval) (ApprovalRequest, error)

var approvalFactories = map[string]approvalFactory{
	codexapp.CodexServerRequestItemCommandExecutionRequestApproval: commandApproval,
	codexapp.CodexServerRequestItemFileChangeRequestApproval:       fileChangeApproval,
	codexapp.CodexServerRequestItemPermissionsRequestApproval:      permissionApproval,
	codexapp.CodexServerRequestItemToolRequestUserInput:            userInputApproval,
	codexapp.CodexServerRequestMcpServerElicitationRequest:         mcpElicitationApproval,
}

func commandApproval(raw json.RawMessage, base Event, requestID string, _ *pendingApproval) (ApprovalRequest, error) {
	params, err := codexapp.DecodeCommandExecutionRequestApprovalParams(raw)
	if err != nil {
		return ApprovalRequest{}, err
	}
	if err := requireProviderScope(base, params.ThreadID, params.TurnID); err != nil {
		return ApprovalRequest{}, err
	}
	return ApprovalRequest{
		ID: requestID, ProviderItemID: params.ItemId, Kind: ApprovalKindCommand,
		Title: "Command approval", Command: optionalString(params.Command),
		Path: optionalStringValue(params.CWD), Body: optionalString(params.Reason),
	}, nil
}

func fileChangeApproval(raw json.RawMessage, base Event, requestID string, _ *pendingApproval) (ApprovalRequest, error) {
	params, err := codexapp.DecodeFileChangeRequestApprovalParams(raw)
	if err != nil {
		return ApprovalRequest{}, err
	}
	if err := requireProviderScope(base, params.ThreadID, params.TurnID); err != nil {
		return ApprovalRequest{}, err
	}
	return ApprovalRequest{
		ID: requestID, ProviderItemID: params.ItemId, Kind: ApprovalKindFileChange,
		Title: "File change approval", Path: optionalString(params.GrantRoot), Body: optionalString(params.Reason),
	}, nil
}

func permissionApproval(raw json.RawMessage, base Event, requestID string, pending *pendingApproval) (ApprovalRequest, error) {
	params, err := codexapp.DecodePermissionsRequestApprovalParams(raw)
	if err != nil {
		return ApprovalRequest{}, err
	}
	if err := requireProviderScope(base, params.ThreadID, params.TurnID); err != nil {
		return ApprovalRequest{}, err
	}
	encoded, err := json.Marshal(params.Permissions)
	if err != nil {
		return ApprovalRequest{}, fmt.Errorf("encode requested permission profile: %w", err)
	}
	if err := json.Unmarshal(encoded, &pending.permissions); err != nil {
		return ApprovalRequest{}, fmt.Errorf("normalize requested permission profile: %w", err)
	}
	return ApprovalRequest{
		ID: requestID, ProviderItemID: params.ItemId, Kind: ApprovalKindPermission,
		Title: "Permission approval", Path: string(params.CWD), Body: optionalString(params.Reason),
		PermissionProfile: string(encoded),
	}, nil
}

func userInputApproval(raw json.RawMessage, base Event, requestID string, pending *pendingApproval) (ApprovalRequest, error) {
	params, err := codexapp.DecodeToolRequestUserInputParams(raw)
	if err != nil {
		return ApprovalRequest{}, err
	}
	if err := requireProviderScope(base, params.ThreadID, params.TurnID); err != nil {
		return ApprovalRequest{}, err
	}
	questions := make([]ApprovalQuestion, 0, len(params.Questions))
	for _, question := range params.Questions {
		questions = append(questions, providerApprovalQuestion(question))
	}
	pending.questions = append([]ApprovalQuestion{}, questions...)
	return ApprovalRequest{
		ID: requestID, ProviderItemID: params.ItemId, Kind: ApprovalKindUserInput,
		Title: "User input requested", Questions: questions,
	}, nil
}

func providerApprovalQuestion(question codexapp.ToolRequestUserInputQuestion) ApprovalQuestion {
	options := []string{}
	if question.Options != nil {
		for _, option := range *question.Options {
			options = append(options, option.Label)
		}
	}
	return ApprovalQuestion{
		ID: question.ID, Header: question.Header, Question: question.Question,
		Options: options, Secret: question.IsSecret != nil && *question.IsSecret,
	}
}

func mcpElicitationApproval(raw json.RawMessage, base Event, requestID string, _ *pendingApproval) (ApprovalRequest, error) {
	params, err := objectParams(raw)
	if err != nil {
		return ApprovalRequest{}, err
	}
	threadID, err := requiredString(params, "threadId")
	if err != nil {
		return ApprovalRequest{}, err
	}
	turnID, _ := params["turnId"].(string)
	if turnID == "" {
		turnID = base.ProviderTurnID
	}
	if err := requireProviderScope(base, threadID, turnID); err != nil {
		return ApprovalRequest{}, err
	}
	serverName, err := requiredString(params, "serverName")
	if err != nil {
		return ApprovalRequest{}, err
	}
	body, _ := params["message"].(string)
	return ApprovalRequest{
		ID: requestID, ProviderItemID: "mcp_elicitation_" + requestID,
		Kind: ApprovalKindMCPElicitation, Title: "MCP input requested: " + serverName, Body: body,
	}, nil
}

func (runtime *Runtime) SubmitApproval(response ApprovalResponse) error {
	if response.RequestID == "" {
		return errors.New("approval response request id is required")
	}
	switch response.Decision {
	case ApprovalDecisionAccept, ApprovalDecisionDecline, ApprovalDecisionCancel:
	default:
		return fmt.Errorf("unsupported approval decision %q", response.Decision)
	}
	runtime.mu.Lock()
	pending, ok := runtime.pending[response.RequestID]
	if ok {
		delete(runtime.pending, response.RequestID)
	}
	runtime.mu.Unlock()
	if !ok {
		return fmt.Errorf("approval request %s is not pending", response.RequestID)
	}
	result, errorMessage, err := providerApprovalResult(pending, response)
	if err != nil {
		return err
	}
	if errorMessage != "" {
		return pending.message.RespondError(-32001, errorMessage)
	}
	return pending.message.RespondResult(result)
}

func providerApprovalResult(pending pendingApproval, response ApprovalResponse) (any, string, error) {
	switch pending.method {
	case codexapp.CodexServerRequestItemCommandExecutionRequestApproval,
		codexapp.CodexServerRequestItemFileChangeRequestApproval:
		return map[string]any{"decision": string(response.Decision)}, "", nil
	case codexapp.CodexServerRequestItemPermissionsRequestApproval:
		if response.Decision != ApprovalDecisionAccept {
			return nil, "permission request denied", nil
		}
		return map[string]any{"permissions": pending.permissions, "scope": "turn"}, "", nil
	case codexapp.CodexServerRequestItemToolRequestUserInput:
		return providerUserInputResult(pending, response)
	case codexapp.CodexServerRequestMcpServerElicitationRequest:
		return providerMCPResult(response), "", nil
	default:
		return nil, "", fmt.Errorf("unsupported approval response method %s", pending.method)
	}
}

func providerUserInputResult(pending pendingApproval, response ApprovalResponse) (any, string, error) {
	if response.Decision == ApprovalDecisionCancel {
		return nil, "user input cancelled", nil
	}
	answers := answersByQuestion(response.Answers)
	providerAnswers := map[string]any{}
	for _, question := range pending.questions {
		values := answers[question.ID]
		if len(values) == 0 {
			return nil, "", fmt.Errorf("answer is required for question %s", question.ID)
		}
		providerAnswers[question.ID] = map[string]any{"answers": values}
	}
	return map[string]any{"answers": providerAnswers}, "", nil
}

func providerMCPResult(response ApprovalResponse) any {
	content := map[string]any{}
	for _, answer := range response.Answers {
		switch len(answer.Answers) {
		case 1:
			content[answer.QuestionID] = answer.Answers[0]
		case 0:
		default:
			content[answer.QuestionID] = append([]string{}, answer.Answers...)
		}
	}
	var providerContent any
	if response.Decision == ApprovalDecisionAccept && len(content) > 0 {
		providerContent = content
	}
	return map[string]any{"action": string(response.Decision), "content": providerContent, "_meta": nil}
}

func providerRequestID(value any) (string, error) {
	switch id := value.(type) {
	case string:
		if id == "" {
			return "", errors.New("provider request id is required")
		}
		return id, nil
	case float64:
		if id != float64(int64(id)) {
			return "", fmt.Errorf("provider request id must be an integer: %v", id)
		}
		return strconv.FormatInt(int64(id), 10), nil
	case int:
		return strconv.Itoa(id), nil
	default:
		return "", fmt.Errorf("unsupported provider request id type %T", value)
	}
}

func objectParams(raw json.RawMessage) (map[string]any, error) {
	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("provider request params must be an object: %w", err)
	}
	if value == nil {
		return nil, errors.New("provider request params must be an object")
	}
	return value, nil
}

func requiredString(value map[string]any, field string) (string, error) {
	text, ok := value[field].(string)
	if !ok || strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("provider request field %s is required", field)
	}
	return text, nil
}

func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func optionalStringValue(value *string) string {
	return optionalString(value)
}

func answersByQuestion(answers []ApprovalAnswer) map[string][]string {
	result := map[string][]string{}
	for _, answer := range answers {
		if answer.QuestionID != "" {
			result[answer.QuestionID] = append([]string{}, answer.Answers...)
		}
	}
	return result
}
