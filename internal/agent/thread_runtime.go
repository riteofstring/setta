package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	return providerThread(response.Thread, response.Model)
}

func (runtime *Runtime) ResumeThread(ctx context.Context, threadID string) (Thread, error) {
	if strings.TrimSpace(threadID) == "" {
		return Thread{}, errors.New("provider thread id is required")
	}
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadResume, codexapp.ThreadResumeParams{ThreadID: threadID})
	if err != nil {
		return Thread{}, fmt.Errorf("resume agent thread %s: %w", threadID, err)
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
		return Thread{}, fmt.Errorf("fork agent thread %s: %w", request.ParentThreadID, err)
	}
	response, err := codexapp.DecodeThreadForkResponse(raw)
	if err != nil {
		return Thread{}, fmt.Errorf("decode agent thread fork %s: %w", request.ParentThreadID, err)
	}
	return providerThread(response.Thread, response.Model)
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
		return fmt.Errorf("inject agent thread items %s: %w", threadID, err)
	}
	if _, err := codexapp.DecodeThreadInjectItemsResponse(raw); err != nil {
		return fmt.Errorf("decode agent thread item injection %s: %w", threadID, err)
	}
	return nil
}

func (runtime *Runtime) UnsubscribeThread(ctx context.Context, threadID string) error {
	if strings.TrimSpace(threadID) == "" {
		return errors.New("provider thread id is required")
	}
	raw, err := runtime.manager.Call(ctx, codexapp.CodexMethodThreadUnsubscribe, codexapp.ThreadUnsubscribeParams{ThreadID: threadID})
	if err != nil {
		return fmt.Errorf("unsubscribe agent thread %s: %w", threadID, err)
	}
	if _, err := codexapp.DecodeThreadUnsubscribeResponse(raw); err != nil {
		return fmt.Errorf("decode agent thread unsubscribe %s: %w", threadID, err)
	}
	return nil
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
	params := codexapp.ThreadStartParams{
		ApprovalPolicy:        approvalPolicy,
		CWD:                   &request.WorkspaceRoot,
		DeveloperInstructions: optionalStringPointer(request.DeveloperInstructions),
		Ephemeral:             &request.Ephemeral,
		Sandbox:               &sandbox,
		ServiceTier:           cloneString(request.Invocation.ServiceTier),
	}
	if !request.Invocation.ModelSelectionProviderDefault {
		params.Model = &request.Invocation.Model
	}
	return params, nil
}

func forkThreadParams(request ForkThreadRequest) (codexapp.ThreadForkParams, error) {
	approvalPolicy, sandbox, err := providerThreadPolicies(request.Invocation)
	if err != nil {
		return codexapp.ThreadForkParams{}, err
	}
	params := codexapp.ThreadForkParams{
		ApprovalPolicy:        approvalPolicy,
		CWD:                   &request.WorkspaceRoot,
		DeveloperInstructions: optionalStringPointer(request.DeveloperInstructions),
		Ephemeral:             &request.Ephemeral,
		LastTurnId:            cloneString(request.LastTurnID),
		Sandbox:               &sandbox,
		ServiceTier:           cloneString(request.Invocation.ServiceTier),
		ThreadID:              request.ParentThreadID,
	}
	if !request.Invocation.ModelSelectionProviderDefault {
		params.Model = &request.Invocation.Model
	}
	return params, nil
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
		if item.Role != "user" && item.Role != "developer" {
			return nil, fmt.Errorf("injected item %d has unsupported role %q", index, item.Role)
		}
		if strings.TrimSpace(item.Text) == "" {
			return nil, fmt.Errorf("injected item %d text is required", index)
		}
		raw, err := json.Marshal(map[string]any{
			"type":    "message",
			"role":    item.Role,
			"content": []map[string]string{{"type": "input_text", "text": item.Text}},
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

func providerThreadStatus(raw codexapp.ThreadStatus) string {
	data := bytes.TrimSpace(raw)
	var text string
	if json.Unmarshal(data, &text) == nil {
		return text
	}
	return string(data)
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
