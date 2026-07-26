package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/codexapp"
)

func (runtime *Runtime) StartThread(ctx context.Context, request StartThreadRequest) (Thread, error) {
	if runtime == nil || runtime.manager == nil {
		return Thread{}, errors.New("agent runtime is required")
	}
	if err := request.Validate(); err != nil {
		return Thread{}, err
	}
	params, err := startThreadParams(request)
	if err != nil {
		return Thread{}, err
	}
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadStart, params)
	if err != nil {
		return Thread{}, fmt.Errorf("start agent thread: %w", err)
	}
	response, err := codexapp.DecodeThreadStartResponse(raw)
	if err != nil {
		return Thread{}, fmt.Errorf("decode agent thread start: %w", err)
	}
	if err := validateThreadStartResponse(request, response); err != nil {
		return Thread{}, fmt.Errorf("validate agent thread start: %w", err)
	}
	thread, err := providerThread(response.Thread, response.Model)
	if err != nil {
		return Thread{}, err
	}
	return thread, nil
}

func (runtime *Runtime) ResumeThread(ctx context.Context, threadID string) (Thread, error) {
	if strings.TrimSpace(threadID) == "" {
		return Thread{}, errors.New("provider thread id is required")
	}
	excludeTurns := true
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadResume, codexapp.ThreadResumeParams{
		ExcludeTurns: &excludeTurns,
		ThreadID:     threadID,
	})
	if err != nil {
		return Thread{}, runtime.resumeThreadOperationError(ctx, threadID, err)
	}
	response, err := codexapp.DecodeThreadResumeResponse(raw)
	if err != nil {
		return Thread{}, fmt.Errorf("decode agent thread resume %s: %w", threadID, err)
	}
	return providerThread(response.Thread, response.Model)
}

func (runtime *Runtime) ReadThread(ctx context.Context, threadID string, includeTurns bool) (Thread, error) {
	if strings.TrimSpace(threadID) == "" {
		return Thread{}, errors.New("provider thread id is required")
	}
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadRead, codexapp.ThreadReadParams{
		ThreadID:     threadID,
		IncludeTurns: &includeTurns,
	})
	if err != nil {
		return Thread{}, fmt.Errorf("read agent thread %s: %w", threadID, err)
	}
	response, err := codexapp.DecodeThreadReadResponse(raw)
	if err != nil {
		return Thread{}, fmt.Errorf("decode agent thread read %s: %w", threadID, err)
	}
	return providerThread(response.Thread, "")
}

func (runtime *Runtime) ListThreads(ctx context.Context, request ListThreadsRequest) (ThreadPage, error) {
	if err := request.Validate(); err != nil {
		return ThreadPage{}, err
	}
	limit := request.Limit
	archived := request.Archived
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadList, codexapp.ThreadListParams{
		Archived:   &archived,
		Cursor:     request.Cursor,
		Limit:      &limit,
		SearchTerm: request.SearchTerm,
	})
	if err != nil {
		return ThreadPage{}, fmt.Errorf("list agent threads: %w", err)
	}
	response, err := codexapp.DecodeThreadListResponse(raw)
	if err != nil {
		return ThreadPage{}, fmt.Errorf("decode agent thread list: %w", err)
	}
	page := ThreadPage{
		Data:            make([]Thread, 0, len(response.Data)),
		NextCursor:      cloneString(response.NextCursor),
		BackwardsCursor: cloneString(response.BackwardsCursor),
	}
	for _, item := range response.Data {
		thread, err := providerThread(item, "")
		if err != nil {
			return ThreadPage{}, err
		}
		page.Data = append(page.Data, thread)
	}
	return page, nil
}

func (runtime *Runtime) SearchThreads(ctx context.Context, request SearchThreadsRequest) (ThreadSearchPage, error) {
	if err := request.Validate(); err != nil {
		return ThreadSearchPage{}, err
	}
	limit := request.Limit
	archived := request.Archived
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadSearch, codexapp.ThreadSearchParams{
		Archived:   &archived,
		Cursor:     request.Cursor,
		Limit:      &limit,
		SearchTerm: request.SearchTerm,
	})
	if err != nil {
		return ThreadSearchPage{}, fmt.Errorf("search agent threads: %w", err)
	}
	response, err := codexapp.DecodeThreadSearchResponse(raw)
	if err != nil {
		return ThreadSearchPage{}, fmt.Errorf("decode agent thread search: %w", err)
	}
	page := ThreadSearchPage{
		Data:            make([]ThreadSearchResult, 0, len(response.Data)),
		NextCursor:      cloneString(response.NextCursor),
		BackwardsCursor: cloneString(response.BackwardsCursor),
	}
	for _, item := range response.Data {
		thread, err := providerThread(item.Thread, "")
		if err != nil {
			return ThreadSearchPage{}, err
		}
		page.Data = append(page.Data, ThreadSearchResult{Thread: thread, Snippet: item.Snippet})
	}
	return page, nil
}

func (runtime *Runtime) ForkThread(ctx context.Context, request ForkThreadRequest) (Thread, error) {
	if err := request.Validate(); err != nil {
		return Thread{}, err
	}
	params, err := forkThreadParams(request)
	if err != nil {
		return Thread{}, err
	}
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadFork, params)
	if err != nil {
		return Thread{}, providerThreadOperationError("fork agent thread", request.ParentThreadID, err)
	}
	response, err := codexapp.DecodeThreadForkResponse(raw)
	if err != nil {
		return Thread{}, fmt.Errorf("decode agent thread fork %s: %w", request.ParentThreadID, err)
	}
	thread, err := providerThread(response.Thread, response.Model)
	if err != nil {
		return Thread{}, runtime.rejectForkedThread(
			response.Thread.ID,
			request.ParentThreadID,
			fmt.Errorf("map agent thread fork %s: %w", request.ParentThreadID, err),
		)
	}
	if err := validateForkThreadResponse(request, response); err != nil {
		return Thread{}, runtime.rejectForkedThread(
			thread.ID,
			request.ParentThreadID,
			fmt.Errorf("validate agent thread fork %s: %w", request.ParentThreadID, err),
		)
	}
	return thread, nil
}

func (runtime *Runtime) InjectItems(ctx context.Context, threadID string, items []InjectedTextItem) error {
	if strings.TrimSpace(threadID) == "" {
		return errors.New("provider thread id is required")
	}
	encoded, err := injectedItems(items)
	if err != nil {
		return err
	}
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadInjectItems, codexapp.ThreadInjectItemsParams{
		ThreadID: threadID,
		Items:    encoded,
	})
	if err != nil {
		return providerThreadOperationError("inject agent thread items", threadID, err)
	}
	if _, err := codexapp.DecodeThreadInjectItemsResponse(raw); err != nil {
		return fmt.Errorf("decode agent thread item injection %s: %w", threadID, err)
	}
	return nil
}

func (runtime *Runtime) UnsubscribeThread(ctx context.Context, threadID string) error {
	_, err := runtime.UnsubscribeThreadWithStatus(ctx, threadID)
	return err
}

func (runtime *Runtime) UnsubscribeThreadWithStatus(
	ctx context.Context,
	threadID string,
) (ThreadUnsubscribeStatus, error) {
	if strings.TrimSpace(threadID) == "" {
		return "", errors.New("provider thread id is required")
	}
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadUnsubscribe, codexapp.ThreadUnsubscribeParams{ThreadID: threadID})
	if err != nil {
		return "", fmt.Errorf("unsubscribe agent thread %s: %w", threadID, err)
	}
	response, err := codexapp.DecodeThreadUnsubscribeResponse(raw)
	if err != nil {
		return "", fmt.Errorf("decode agent thread unsubscribe %s: %w", threadID, err)
	}
	switch response.Status {
	case codexapp.ThreadUnsubscribeStatusNotLoaded:
		return ThreadUnsubscribeStatusNotLoaded, nil
	case codexapp.ThreadUnsubscribeStatusNotSubscribed:
		return ThreadUnsubscribeStatusNotSubscribed, nil
	case codexapp.ThreadUnsubscribeStatusUnsubscribed:
		return ThreadUnsubscribeStatusUnsubscribed, nil
	default:
		return "", fmt.Errorf("unsubscribe agent thread %s returned unsupported status %q", threadID, response.Status)
	}
}

func (runtime *Runtime) TerminateBackgroundProcess(ctx context.Context, threadID string, processID string) (bool, error) {
	if strings.TrimSpace(threadID) == "" || strings.TrimSpace(processID) == "" {
		return false, errors.New("background-process termination requires provider thread and process ids")
	}
	raw, err := runtime.manager.Call(
		ctx,
		codexapp.CodexMethodThreadBackgroundTerminalsTerminate,
		codexapp.ThreadBackgroundTerminalsTerminateParams{ThreadID: threadID, ProcessId: processID},
	)
	if err != nil {
		return false, fmt.Errorf("terminate agent background process %s: %w", processID, err)
	}
	response, err := codexapp.DecodeThreadBackgroundTerminalsTerminateResponse(raw)
	if err != nil {
		return false, fmt.Errorf("decode agent background-process termination %s: %w", processID, err)
	}
	return response.Terminated, nil
}

func startThreadParams(request StartThreadRequest) (codexapp.ThreadStartParams, error) {
	approvalPolicy, sandbox, err := providerThreadPolicies(request.Invocation)
	if err != nil {
		return codexapp.ThreadStartParams{}, err
	}
	config, err := modelThreadConfig(request.Invocation)
	if err != nil {
		return codexapp.ThreadStartParams{}, err
	}
	dynamicTools, err := dynamicToolSpecs(request.DynamicTools)
	if err != nil {
		return codexapp.ThreadStartParams{}, err
	}
	params := codexapp.ThreadStartParams{
		ApprovalPolicy:        approvalPolicy,
		CWD:                   &request.WorkspaceRoot,
		DeveloperInstructions: optionalStringPointer(request.DeveloperInstructions),
		Ephemeral:             &request.Ephemeral,
		Sandbox:               &sandbox,
		ServiceTier:           nullableServiceTier(request.Invocation.ServiceTier),
	}
	if config != nil {
		params.Config = config
	}
	if len(dynamicTools) > 0 {
		params.DynamicTools = &dynamicTools
	}
	if !request.Invocation.ModelSelectionProviderDefault {
		params.Model = &request.Invocation.Model
	}
	return params, nil
}

func modelThreadConfig(invocation Invocation) (*map[string]json.RawMessage, error) {
	if invocation.ReasoningEffort == "" {
		return nil, nil
	}
	effort, err := json.Marshal(invocation.ReasoningEffort)
	if err != nil {
		return nil, fmt.Errorf("encode thread reasoning effort: %w", err)
	}
	config := map[string]json.RawMessage{"model_reasoning_effort": effort}
	return &config, nil
}

func validateThreadStartResponse(
	request StartThreadRequest,
	response codexapp.ThreadStartResponse,
) error {
	return validateThreadOperationResponse(
		"provider thread",
		request,
		response.Thread,
		response.Model,
		response.ReasoningEffort,
		response.ServiceTier,
		response.ApprovalPolicy,
		response.Sandbox,
		response.CWD,
	)
}

func validateThreadOperationResponse(
	label string,
	request StartThreadRequest,
	thread codexapp.Thread,
	model string,
	reasoningEffort *codexapp.ReasoningEffort,
	serviceTier *string,
	approvalPolicy json.RawMessage,
	sandbox json.RawMessage,
	cwd codexapp.AbsolutePathBuf,
) error {
	if strings.TrimSpace(thread.ID) == "" {
		return fmt.Errorf("%s response omitted thread id", label)
	}
	if thread.Ephemeral != request.Ephemeral {
		if request.Ephemeral {
			return fmt.Errorf("%s must be ephemeral", label)
		}
		return fmt.Errorf("%s must be durable", label)
	}
	if err := validateThreadOperationModel(label, request.Invocation, model, reasoningEffort, serviceTier); err != nil {
		return err
	}
	if err := validateThreadOperationPolicy(label, request.Invocation, approvalPolicy, sandbox); err != nil {
		return err
	}
	return validateThreadOperationWorkspace(label, request.WorkspaceRoot, thread, cwd)
}

func validateThreadOperationModel(
	label string,
	invocation Invocation,
	model string,
	reasoningEffort *codexapp.ReasoningEffort,
	serviceTier *string,
) error {
	if strings.TrimSpace(model) == "" {
		return fmt.Errorf("%s response omitted model", label)
	}
	if !invocation.ModelSelectionProviderDefault && model != invocation.Model {
		return fmt.Errorf("%s model is %s, want %s", label, model, invocation.Model)
	}
	if invocation.ReasoningEffort != "" {
		if reasoningEffort == nil {
			return fmt.Errorf("%s response omitted reasoning effort", label)
		}
		if actual := string(*reasoningEffort); actual != invocation.ReasoningEffort {
			return fmt.Errorf("%s reasoning effort is %s, want %s", label, actual, invocation.ReasoningEffort)
		}
	}
	if !forkServiceTierMatches(serviceTier, invocation.ServiceTier) {
		return fmt.Errorf(
			"%s service tier is %s, want %s",
			label,
			optionalAgentString(serviceTier),
			optionalAgentString(invocation.ServiceTier),
		)
	}
	return nil
}

func validateThreadOperationPolicy(
	label string,
	invocation Invocation,
	approvalPolicy json.RawMessage,
	sandbox json.RawMessage,
) error {
	approvalMode, err := forkResponseApprovalMode(approvalPolicy)
	if err != nil {
		return err
	}
	if approvalMode != invocation.ApprovalMode {
		return fmt.Errorf("%s approval mode is %s, want %s", label, approvalMode, invocation.ApprovalMode)
	}
	permissionMode, err := forkResponsePermissionMode(sandbox)
	if err != nil {
		return err
	}
	if permissionMode != invocation.PermissionMode {
		return fmt.Errorf("%s permission mode is %s, want %s", label, permissionMode, invocation.PermissionMode)
	}
	return nil
}

func validateThreadOperationWorkspace(
	label string,
	workspaceRoot string,
	thread codexapp.Thread,
	cwd codexapp.AbsolutePathBuf,
) error {
	if !sameWorkspaceRoot(workspaceRoot, string(cwd)) {
		return fmt.Errorf("%s cwd is %s, want %s", label, cwd, workspaceRoot)
	}
	if !sameWorkspaceRoot(workspaceRoot, string(thread.CWD)) {
		return fmt.Errorf("%s thread cwd is %s, want %s", label, thread.CWD, workspaceRoot)
	}
	return nil
}

func forkThreadParams(request ForkThreadRequest) (codexapp.ThreadForkParams, error) {
	approvalPolicy, sandbox, err := providerThreadPolicies(request.Invocation)
	if err != nil {
		return codexapp.ThreadForkParams{}, err
	}
	config, err := forkThreadConfig(request.Invocation)
	if err != nil {
		return codexapp.ThreadForkParams{}, err
	}
	params := codexapp.ThreadForkParams{
		ApprovalPolicy:        approvalPolicy,
		Config:                config,
		CWD:                   &request.WorkspaceRoot,
		DeveloperInstructions: optionalStringPointer(request.DeveloperInstructions),
		Ephemeral:             &request.Ephemeral,
		LastTurnId:            cloneString(request.LastTurnID),
		Sandbox:               &sandbox,
		ServiceTier:           forkThreadServiceTier(request.Invocation.ServiceTier),
		ThreadID:              request.ParentThreadID,
	}
	if !request.Invocation.ModelSelectionProviderDefault {
		params.Model = &request.Invocation.Model
	}
	return params, nil
}

func forkThreadConfig(invocation Invocation) (*map[string]json.RawMessage, error) {
	if invocation.ReasoningEffort == "" {
		return nil, nil
	}
	effort, err := json.Marshal(invocation.ReasoningEffort)
	if err != nil {
		return nil, fmt.Errorf("encode fork reasoning effort: %w", err)
	}
	config := map[string]json.RawMessage{"model_reasoning_effort": effort}
	return &config, nil
}

func forkThreadServiceTier(serviceTier *string) *codexapp.CodexNullableString {
	return nullableServiceTier(serviceTier)
}

func nullableServiceTier(serviceTier *string) *codexapp.CodexNullableString {
	if serviceTier == nil {
		return codexapp.CodexNullString()
	}
	return codexapp.CodexString(*serviceTier)
}

func validateForkThreadResponse(
	request ForkThreadRequest,
	response codexapp.ThreadForkResponse,
) error {
	if err := validateForkModelSettings(request.Invocation, response); err != nil {
		return err
	}
	if err := validateForkPolicySettings(request.Invocation, response); err != nil {
		return err
	}
	return validateForkWorkspaceRoot(request.WorkspaceRoot, response)
}

func validateForkModelSettings(invocation Invocation, response codexapp.ThreadForkResponse) error {
	if strings.TrimSpace(response.Model) == "" {
		return errors.New("provider omitted the fork model")
	}
	if !invocation.ModelSelectionProviderDefault && response.Model != invocation.Model {
		return fmt.Errorf("provider fork model is %s, want %s", response.Model, invocation.Model)
	}
	if invocation.ReasoningEffort != "" {
		if response.ReasoningEffort == nil {
			return errors.New("provider omitted the fork reasoning effort")
		}
		if actual := string(*response.ReasoningEffort); actual != invocation.ReasoningEffort {
			return fmt.Errorf(
				"provider fork reasoning effort is %s, want %s",
				actual,
				invocation.ReasoningEffort,
			)
		}
	}
	if !forkServiceTierMatches(response.ServiceTier, invocation.ServiceTier) {
		return fmt.Errorf(
			"provider fork service tier is %s, want %s",
			optionalAgentString(response.ServiceTier),
			optionalAgentString(invocation.ServiceTier),
		)
	}
	return nil
}

func validateForkPolicySettings(invocation Invocation, response codexapp.ThreadForkResponse) error {
	approvalMode, err := forkResponseApprovalMode(response.ApprovalPolicy)
	if err != nil {
		return err
	}
	if approvalMode != invocation.ApprovalMode {
		return fmt.Errorf(
			"provider fork approval mode is %s, want %s",
			approvalMode,
			invocation.ApprovalMode,
		)
	}
	permissionMode, err := forkResponsePermissionMode(response.Sandbox)
	if err != nil {
		return err
	}
	if permissionMode != invocation.PermissionMode {
		return fmt.Errorf(
			"provider fork permission mode is %s, want %s",
			permissionMode,
			invocation.PermissionMode,
		)
	}
	return nil
}

func validateForkWorkspaceRoot(workspaceRoot string, response codexapp.ThreadForkResponse) error {
	if !sameWorkspaceRoot(workspaceRoot, string(response.CWD)) {
		return fmt.Errorf("provider fork cwd is %s, want %s", response.CWD, workspaceRoot)
	}
	if !sameWorkspaceRoot(workspaceRoot, string(response.Thread.CWD)) {
		return fmt.Errorf("provider fork thread cwd is %s, want %s", response.Thread.CWD, workspaceRoot)
	}
	return nil
}

func forkResponseApprovalMode(raw json.RawMessage) (ApprovalMode, error) {
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", fmt.Errorf("decode provider fork approval policy: %w", err)
	}
	switch value {
	case "never":
		return ApprovalModeNever, nil
	case "on-request":
		return ApprovalModeOnRequest, nil
	case "untrusted":
		return ApprovalModeUntrusted, nil
	default:
		return "", fmt.Errorf("provider returned unsupported fork approval policy %q", value)
	}
}

func forkResponsePermissionMode(raw json.RawMessage) (PermissionMode, error) {
	var policy struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &policy); err != nil {
		return "", fmt.Errorf("decode provider fork sandbox policy: %w", err)
	}
	switch policy.Type {
	case "readOnly":
		return PermissionModeReadOnly, nil
	case "workspaceWrite":
		return PermissionModeWorkspaceWrite, nil
	case "dangerFullAccess":
		return PermissionModeFullAccess, nil
	default:
		return "", fmt.Errorf("provider returned unsupported fork sandbox policy %q", policy.Type)
	}
}

func forkServiceTierMatches(actual *string, requested *string) bool {
	if requested == nil {
		return actual == nil || *actual == "default"
	}
	return actual != nil && *actual == *requested
}

func optionalAgentString(value *string) string {
	if value == nil {
		return "<unset>"
	}
	return fmt.Sprintf("%q", *value)
}

func sameWorkspaceRoot(left string, right string) bool {
	leftInfo, leftErr := os.Stat(left)
	rightInfo, rightErr := os.Stat(right)
	if leftErr == nil && rightErr == nil {
		return os.SameFile(leftInfo, rightInfo)
	}
	return filepath.Clean(left) == filepath.Clean(right)
}

func (runtime *Runtime) rejectForkedThread(threadID string, parentThreadID string, cause error) error {
	if threadID == "" || threadID == parentThreadID {
		return cause
	}
	if err := runtime.UnsubscribeThread(context.Background(), threadID); err != nil {
		return errors.Join(cause, fmt.Errorf("unsubscribe rejected agent thread fork %s: %w", threadID, err))
	}
	return cause
}

func providerThreadPolicies(invocation Invocation) (*codexapp.AskForApproval, codexapp.SandboxMode, error) {
	if err := invocation.Validate(); err != nil {
		return nil, "", err
	}
	approval := mapApprovalMode(invocation.ApprovalMode)
	raw := codexapp.AskForApproval(json.RawMessage(fmt.Sprintf("%q", approval)))
	var sandbox codexapp.SandboxMode
	switch invocation.PermissionMode {
	case PermissionModeReadOnly:
		sandbox = codexapp.SandboxModeReadOnly
	case PermissionModeWorkspaceWrite:
		sandbox = codexapp.SandboxModeWorkspaceWrite
	case PermissionModeFullAccess:
		sandbox = codexapp.SandboxModeDangerFullAccess
	default:
		return nil, "", fmt.Errorf("unsupported permission mode %q", invocation.PermissionMode)
	}
	return &raw, sandbox, nil
}

func mapApprovalMode(mode ApprovalMode) string {
	switch mode {
	case ApprovalModeNever:
		return "never"
	case ApprovalModeOnRequest:
		return "on-request"
	case ApprovalModeUntrusted:
		return "untrusted"
	default:
		panic("validated approval mode became unsupported")
	}
}

func injectedItems(items []InjectedTextItem) ([]json.RawMessage, error) {
	if len(items) == 0 {
		return nil, errors.New("at least one injected thread item is required")
	}
	encoded := make([]json.RawMessage, 0, len(items))
	for index, item := range items {
		if item.Role != "user" && item.Role != "developer" && item.Role != "assistant" {
			return nil, fmt.Errorf("injected item %d has unsupported role %q", index, item.Role)
		}
		if strings.TrimSpace(item.Text) == "" {
			return nil, fmt.Errorf("injected item %d text is required", index)
		}
		contentType := "input_text"
		if item.Role == "assistant" {
			contentType = "output_text"
		}
		raw, err := json.Marshal(map[string]any{
			"type":    "message",
			"role":    item.Role,
			"content": []map[string]string{{"type": contentType, "text": item.Text}},
		})
		if err != nil {
			return nil, fmt.Errorf("encode injected item %d: %w", index, err)
		}
		encoded = append(encoded, raw)
	}
	return encoded, nil
}

func providerThread(value codexapp.Thread, model string) (Thread, error) {
	thread := Thread{
		ID:             value.ID,
		SessionID:      value.SessionId,
		CWD:            string(value.CWD),
		Model:          model,
		ModelProvider:  value.ModelProvider,
		Status:         providerThreadStatus(value.Status),
		Ephemeral:      value.Ephemeral,
		ForkedFromID:   cloneString(value.ForkedFromId),
		ParentThreadID: cloneString(value.ParentThreadId),
		TurnCount:      len(value.Turns),
		Turns:          providerThreadTurns(value.Turns),
		CreatedAt:      value.CreatedAt,
		UpdatedAt:      value.UpdatedAt,
	}
	if err := thread.Validate(); err != nil {
		return Thread{}, err
	}
	return thread, nil
}

func providerThreadTurns(turns []codexapp.Turn) []ThreadTurn {
	result := make([]ThreadTurn, 0, len(turns))
	for _, turn := range turns {
		mapped := ThreadTurn{ID: turn.ID, Status: string(turn.Status), Items: make([]ThreadItemSummary, 0, len(turn.Items))}
		for _, item := range turn.Items {
			mapped.Items = append(mapped.Items, providerThreadItemSummary(item))
		}
		result = append(result, mapped)
	}
	return result
}

func providerThreadItemSummary(item codexapp.ThreadItem) ThreadItemSummary {
	summary := ThreadItemSummary{Type: string(item.Type)}
	if handler := providerThreadItemSummaryHandlers[item.Type]; handler != nil {
		handler(item, &summary)
	}
	return summary
}

type threadItemSummaryHandler func(codexapp.ThreadItem, *ThreadItemSummary)

var providerThreadItemSummaryHandlers = map[codexapp.ThreadItemType]threadItemSummaryHandler{
	codexapp.ThreadItemTypeUserMessage:         summarizeUserMessage,
	codexapp.ThreadItemTypeAgentMessage:        summarizeAgentMessage,
	codexapp.ThreadItemTypePlan:                summarizePlan,
	codexapp.ThreadItemTypeReasoning:           summarizeReasoning,
	codexapp.ThreadItemTypeCommandExecution:    summarizeCommand,
	codexapp.ThreadItemTypeFileChange:          summarizeFileChange,
	codexapp.ThreadItemTypeMcpToolCall:         summarizeMCPTool,
	codexapp.ThreadItemTypeDynamicToolCall:     summarizeDynamicTool,
	codexapp.ThreadItemTypeCollabAgentToolCall: summarizeCollabAgent,
	codexapp.ThreadItemTypeSubAgentActivity:    summarizeSubagent,
	codexapp.ThreadItemTypeWebSearch:           summarizeWebSearch,
	codexapp.ThreadItemTypeImageView:           summarizeImageView,
	codexapp.ThreadItemTypeImageGeneration:     summarizeImageGeneration,
	codexapp.ThreadItemTypeSleep:               summarizeSleep,
	codexapp.ThreadItemTypeContextCompaction:   summarizeCompaction,
}

func summarizeUserMessage(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.UserMessage == nil {
		return
	}
	summary.ID = item.UserMessage.ID
	parts := make([]string, 0, len(item.UserMessage.Content))
	for _, content := range item.UserMessage.Content {
		var textItem struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if json.Unmarshal(content, &textItem) == nil && textItem.Type == "text" {
			parts = append(parts, textItem.Text)
		}
	}
	summary.Text = strings.Join(parts, "\n")
}

func summarizeAgentMessage(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.AgentMessage != nil {
		summary.ID, summary.Text = item.AgentMessage.ID, item.AgentMessage.Text
	}
}

func summarizePlan(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.Plan != nil {
		summary.ID, summary.Text = item.Plan.ID, item.Plan.Text
	}
}

func summarizeReasoning(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.Reasoning != nil {
		summary.ID, summary.Text = item.Reasoning.ID, strings.Join(item.Reasoning.Summary, "\n")
	}
}

func summarizeCommand(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.CommandExecution != nil {
		summary.ID, summary.Text, summary.Status = item.CommandExecution.ID, item.CommandExecution.Command, string(item.CommandExecution.Status)
	}
}

func summarizeFileChange(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.FileChange != nil {
		summary.ID, summary.Status = item.FileChange.ID, string(item.FileChange.Status)
	}
}

func summarizeMCPTool(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.McpToolCall != nil {
		summary.ID, summary.Text, summary.Status = item.McpToolCall.ID, item.McpToolCall.Server+"/"+item.McpToolCall.Tool, string(item.McpToolCall.Status)
	}
}

func summarizeDynamicTool(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.DynamicToolCall != nil {
		summary.ID, summary.Text, summary.Status = item.DynamicToolCall.ID, item.DynamicToolCall.Tool, string(item.DynamicToolCall.Status)
	}
}

func summarizeCollabAgent(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.CollabAgentToolCall != nil {
		summary.ID, summary.Text, summary.Status = item.CollabAgentToolCall.ID, string(item.CollabAgentToolCall.Tool), string(item.CollabAgentToolCall.Status)
	}
}

func summarizeSubagent(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.SubAgentActivity != nil {
		summary.ID, summary.Text, summary.Status = item.SubAgentActivity.ID, item.SubAgentActivity.AgentPath, string(item.SubAgentActivity.Kind)
	}
}

func summarizeWebSearch(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.WebSearch != nil {
		summary.ID, summary.Text = item.WebSearch.ID, item.WebSearch.Query
	}
}

func summarizeImageView(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.ImageView != nil {
		summary.ID, summary.Text = item.ImageView.ID, item.ImageView.Path
	}
}

func summarizeImageGeneration(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.ImageGeneration != nil {
		summary.ID, summary.Text, summary.Status = item.ImageGeneration.ID, item.ImageGeneration.Result, item.ImageGeneration.Status
	}
}

func summarizeSleep(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.Sleep != nil {
		summary.ID, summary.Status = item.Sleep.ID, "completed"
	}
}

func summarizeCompaction(item codexapp.ThreadItem, summary *ThreadItemSummary) {
	if item.ContextCompaction != nil {
		summary.ID, summary.Status = item.ContextCompaction.ID, "completed"
	}
}

// providerThreadStatus reads the status union's discriminator. Before the
// protocol snapshot decoded this union, the status was raw JSON, so a thread
// read reported `{"type":"idle"}` as its status text.
func providerThreadStatus(status codexapp.ThreadStatus) string {
	return string(status.Type)
}

func optionalStringPointer(value string) *string {
	if value == "" {
		return nil
	}
	copy := value
	return &copy
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
