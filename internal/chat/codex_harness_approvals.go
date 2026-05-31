package chat

import (
	"encoding/json"
	"errors"
	"fmt"
)

type codexServerRequestPolicy string

const (
	codexServerRequestDeferredApproval codexServerRequestPolicy = "deferred_approval"
	codexServerRequestImmediate        codexServerRequestPolicy = "immediate"
)

var supportedCodexServerRequests = map[string]codexServerRequestPolicy{
	"account/chatgptAuthTokens/refresh":     codexServerRequestImmediate,
	"attestation/generate":                  codexServerRequestImmediate,
	"item/commandExecution/requestApproval": codexServerRequestDeferredApproval,
	"item/fileChange/requestApproval":       codexServerRequestDeferredApproval,
	"item/permissions/requestApproval":      codexServerRequestDeferredApproval,
	"item/tool/call":                        codexServerRequestImmediate,
	"item/tool/requestUserInput":            codexServerRequestDeferredApproval,
	"mcpServer/elicitation/request":         codexServerRequestDeferredApproval,
}

func isSupportedCodexServerRequest(method string) bool {
	_, ok := supportedCodexServerRequests[method]
	return ok
}

func isCodexDeferredApprovalRequest(method string) bool {
	return supportedCodexServerRequests[method] == codexServerRequestDeferredApproval
}

func handleUnsupportedCodexServerRequest(message jsonRPCMessage, sink TurnSink) error {
	err := fmt.Errorf("unsupported codex app-server request: %s", message.Method)
	if diagnosticErr := emitCodexProviderDrift(sink, "codex_request_unsupported", err.Error(), message, true); diagnosticErr != nil {
		return diagnosticErr
	}
	if traceErr := sink.Trace("codex_request_unsupported", message.Method); traceErr != nil {
		return traceErr
	}
	return err
}

type codexApprovalDetails struct {
	permissionProfile map[string]any
	questions         []ApprovalQuestion
	requestID         string
	runItem           RunItem
}

type codexApprovalContext struct {
	providerItemID string
	requestID      string
	runID          string
}

type codexApprovalFactory func(map[string]any, codexApprovalContext) (ApprovalRequest, codexApprovalDetails, error)

var codexItemApprovalFactories = map[string]codexApprovalFactory{
	"item/commandExecution/requestApproval": commandApprovalFromCodex,
	"item/fileChange/requestApproval":       fileChangeApprovalFromCodex,
	"item/permissions/requestApproval":      permissionApprovalFromCodex,
	"item/tool/requestUserInput":            userInputApprovalFromCodex,
}

var codexThreadApprovalFactories = map[string]codexApprovalFactory{
	"mcpServer/elicitation/request": mcpElicitationApprovalFromCodex,
}

var codexDecisionApprovalResponseMethods = map[string]struct{}{
	"item/commandExecution/requestApproval": {},
	"item/fileChange/requestApproval":       {},
}

func approvalRequestFromCodex(message jsonRPCMessage, runID string, threadID string, turnID string, sink TurnSink) (ApprovalRequest, codexApprovalDetails, error) {
	params, err := objectValue(message.Params, "codex approval request params")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	requestID, err := requestIDString(message.ID)
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	approval, details, err := codexApprovalFromMethod(message, params, requestID, runID, threadID, turnID, sink)
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	details.requestID = requestID
	details.runItem.RequestID = requestID
	return approval, details, nil
}

func codexApprovalFromMethod(message jsonRPCMessage, params map[string]any, requestID string, runID string, threadID string, turnID string, sink TurnSink) (ApprovalRequest, codexApprovalDetails, error) {
	if factory, ok := codexItemApprovalFactories[message.Method]; ok {
		approvalContext, err := codexItemApprovalContext(message, params, requestID, runID, threadID, turnID, sink)
		if err != nil {
			return ApprovalRequest{}, codexApprovalDetails{}, err
		}
		return factory(params, approvalContext)
	}
	if factory, ok := codexThreadApprovalFactories[message.Method]; ok {
		if err := validateCodexThreadRequestWithOptionalTurn(message, params, threadID, turnID, sink); err != nil {
			return ApprovalRequest{}, codexApprovalDetails{}, err
		}
		approvalContext := codexApprovalContext{providerItemID: "mcp_elicitation_" + requestID, requestID: requestID, runID: runID}
		return factory(params, approvalContext)
	}
	return ApprovalRequest{}, codexApprovalDetails{}, fmt.Errorf("unsupported codex app-server request: %s", message.Method)
}

func codexItemApprovalContext(message jsonRPCMessage, params map[string]any, requestID string, runID string, threadID string, turnID string, sink TurnSink) (codexApprovalContext, error) {
	if err := validateCodexRequestTurn(message, params, threadID, turnID, sink); err != nil {
		return codexApprovalContext{}, err
	}
	itemID, err := requireString(params, "itemId", "codex approval request")
	if err != nil {
		return codexApprovalContext{}, err
	}
	return codexApprovalContext{providerItemID: itemID, requestID: requestID, runID: runID}, nil
}

func validateCodexRequestTurn(message jsonRPCMessage, params map[string]any, threadID string, turnID string, sink TurnSink) error {
	messageThreadID, err := requireString(params, "threadId", "codex approval request")
	if err != nil {
		return err
	}
	messageTurnID, err := requireString(params, "turnId", "codex approval request")
	if err != nil {
		return err
	}
	return requireCodexTurnIDMatch(message, threadID, turnID, messageThreadID, messageTurnID, sink)
}

func validateCodexThreadRequestWithOptionalTurn(message jsonRPCMessage, params map[string]any, threadID string, turnID string, sink TurnSink) error {
	messageThreadID, err := requireString(params, "threadId", "codex request")
	if err != nil {
		return err
	}
	messageTurnID, err := optionalString(params, "turnId", "codex request")
	if err != nil {
		return err
	}
	if messageTurnID == "" {
		return requireCodexThreadIDMatch(message, threadID, messageThreadID, sink)
	}
	return requireCodexTurnIDMatch(message, threadID, turnID, messageThreadID, messageTurnID, sink)
}

func commandApprovalFromCodex(params map[string]any, context codexApprovalContext) (ApprovalRequest, codexApprovalDetails, error) {
	command, err := requireString(params, "command", "codex command approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	reason, err := optionalString(params, "reason", "codex command approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	cwd, err := optionalString(params, "cwd", "codex command approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	approval := ApprovalRequest{
		ID:             "codex_" + context.requestID,
		RunID:          context.runID,
		ProviderItemID: context.providerItemID,
		Kind:           ApprovalKindCommand,
		Title:          "Command approval",
		Body:           reason,
		Command:        command,
		FilePath:       cwd,
		Options:        []string{},
	}
	return approval, codexApprovalDetails{runItem: commandApprovalRunItem(context.providerItemID, command, cwd, reason)}, nil
}

func commandApprovalRunItem(providerItemID string, command string, cwd string, reason string) RunItem {
	return RunItem{
		ProviderItemID: providerItemID,
		Type:           RunItemTypeCommandExecution,
		Status:         RunItemStatusPending,
		Title:          "Command approval",
		Summary:        reason,
		Command:        command,
		Cwd:            cwd,
	}
}

func fileChangeApprovalFromCodex(params map[string]any, context codexApprovalContext) (ApprovalRequest, codexApprovalDetails, error) {
	reason, err := optionalString(params, "reason", "codex file change approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	grantRoot, err := requireString(params, "grantRoot", "codex file change approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	approval := ApprovalRequest{
		ID:             "codex_" + context.requestID,
		RunID:          context.runID,
		ProviderItemID: context.providerItemID,
		Kind:           ApprovalKindFileChange,
		Title:          "File change approval",
		Body:           reason,
		FilePath:       grantRoot,
		Options:        []string{},
	}
	return approval, codexApprovalDetails{runItem: fileChangeApprovalRunItem(context.providerItemID, grantRoot, reason)}, nil
}

func fileChangeApprovalRunItem(providerItemID string, grantRoot string, reason string) RunItem {
	return RunItem{
		ProviderItemID: providerItemID,
		Type:           RunItemTypeFileChange,
		Status:         RunItemStatusPending,
		Title:          "File change approval",
		Summary:        reason,
		FilePaths:      []string{grantRoot},
		PatchStatus:    "approval_requested",
	}
}

func permissionApprovalFromCodex(params map[string]any, context codexApprovalContext) (ApprovalRequest, codexApprovalDetails, error) {
	permissions, err := requireObject(params, "permissions", "codex permission approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	permissionSummary, err := jsonSummary(permissions)
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	reason, err := optionalString(params, "reason", "codex permission approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	cwd, err := optionalString(params, "cwd", "codex permission approval")
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	approval := ApprovalRequest{
		ID:             "codex_" + context.requestID,
		RunID:          context.runID,
		ProviderItemID: context.providerItemID,
		Kind:           ApprovalKindPermission,
		Title:          "Permission approval",
		Body:           reason,
		FilePath:       cwd,
		Permission:     permissionSummary,
		Options:        []string{},
	}
	return approval, codexApprovalDetails{
		permissionProfile: permissions,
		runItem:           permissionApprovalRunItem(context.providerItemID, cwd, reason, permissionSummary),
	}, nil
}

func permissionApprovalRunItem(providerItemID string, cwd string, reason string, permissionSummary string) RunItem {
	return RunItem{
		ProviderItemID: providerItemID,
		Type:           RunItemTypeDynamicToolCall,
		Status:         RunItemStatusPending,
		Title:          "Permission approval",
		Summary:        reason,
		Cwd:            cwd,
		Result:         permissionSummary,
	}
}

func userInputApprovalFromCodex(params map[string]any, context codexApprovalContext) (ApprovalRequest, codexApprovalDetails, error) {
	questions, title, body, options, err := userInputQuestions(params)
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	approval := ApprovalRequest{
		ID:             "codex_" + context.requestID,
		RunID:          context.runID,
		ProviderItemID: context.providerItemID,
		Kind:           ApprovalKindUserInput,
		Title:          title,
		Body:           body,
		Question:       body,
		Options:        options,
		Questions:      questions,
	}
	return approval, codexApprovalDetails{
		questions: questions,
		runItem:   userInputApprovalRunItem(context.providerItemID, title, body),
	}, nil
}

func userInputApprovalRunItem(providerItemID string, title string, body string) RunItem {
	return RunItem{
		ProviderItemID: providerItemID,
		Type:           RunItemTypeDynamicToolCall,
		Status:         RunItemStatusPending,
		Title:          title,
		Summary:        body,
	}
}

func codexApprovalResult(pending codexPendingApproval, response ApprovalResponse) (codexApprovalReply, error) {
	if _, ok := codexDecisionApprovalResponseMethods[pending.method]; ok {
		return codexApprovalReply{result: map[string]any{"decision": approvalDecision(response)}}, nil
	}
	switch pending.method {
	case "item/permissions/requestApproval":
		if !response.Approved || response.Cancelled {
			return codexApprovalReply{errorMessage: "permission request denied"}, nil
		}
		return codexApprovalReply{result: map[string]any{"permissions": pending.permissionProfile, "scope": "turn"}}, nil
	case "item/tool/requestUserInput":
		if response.Cancelled {
			return codexApprovalReply{errorMessage: "user input cancelled"}, nil
		}
		answers := map[string]any{}
		submitted := answersByQuestionID(response.Answers)
		for _, question := range pending.questions {
			values := submitted[question.ID]
			if len(values) == 0 {
				return codexApprovalReply{}, fmt.Errorf("answer is required for question %s", question.ID)
			}
			answers[question.ID] = map[string]any{"answers": values}
		}
		return codexApprovalReply{result: map[string]any{"answers": answers}}, nil
	case "mcpServer/elicitation/request":
		return mcpElicitationApprovalResult(pending, response)
	default:
		return codexApprovalReply{}, fmt.Errorf("unsupported codex approval response method: %s", pending.method)
	}
}

func mcpElicitationApprovalResult(pending codexPendingApproval, response ApprovalResponse) (codexApprovalReply, error) {
	action := approvalDecision(response)
	if pending.structuredInput == nil {
		return codexApprovalReply{}, errors.New("mcp elicitation response is missing structured input metadata")
	}
	var content any
	if action == "accept" && pending.structuredInput.Mode == StructuredInputModeForm {
		content = structuredAnswerValues(response.Answers)
	}
	return codexApprovalReply{result: map[string]any{
		"action":  action,
		"content": content,
		"_meta":   nullableRawJSON(pending.structuredInput.Meta),
	}}, nil
}

func structuredAnswerValues(answers []ApprovalAnswer) map[string]json.RawMessage {
	values := map[string]json.RawMessage{}
	for _, answer := range answers {
		if answer.QuestionID == "" || answer.Value == nil {
			continue
		}
		values[answer.QuestionID] = append(json.RawMessage{}, (*answer.Value)...)
	}
	return values
}

func nullableRawJSON(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	return raw
}

func approvalDecision(response ApprovalResponse) string {
	switch {
	case response.Cancelled:
		return "cancel"
	case response.Approved:
		return "accept"
	default:
		return "decline"
	}
}

func answersByQuestionID(answers []ApprovalAnswer) map[string][]string {
	byQuestion := map[string][]string{}
	for _, answer := range answers {
		if answer.QuestionID == "" {
			continue
		}
		byQuestion[answer.QuestionID] = append([]string{}, answer.Answers...)
	}
	return byQuestion
}
