package externalagents

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"setta/internal/agentruns"
	"setta/internal/backendlogs"
	"setta/internal/mcpx"
)

var (
	ErrRuntimeRunStoreRequired = errors.New("external agent runtime run store is required")
	ErrRunIDRequired           = errors.New("external agent run id is required")
	ErrApprovalIDRequired      = errors.New("external agent approval id is required")
	ErrToolCallIDRequired      = errors.New("external agent tool call id is required")
	ErrRunControllerRequired   = errors.New("external agent run controller is required")
	ErrRunNotActive            = errors.New("external agent run is not active")
	ErrApprovalNotFound        = errors.New("external agent approval not found")
	ErrQuestionNotFound        = errors.New("external agent question not found")
)

type RunController interface {
	Cancel() error
	SendApprovalResponse(approvalID string, approved bool) error
	SendToolResponse(toolCallID string, payload map[string]any) error
}

type RuntimeOptions struct {
	Runs        *agentruns.RunStore
	Follow      *FollowService
	BackendLogs *backendlogs.Service
	Logger      *slog.Logger
	TimeNow     func() time.Time
}

type Runtime struct {
	runs        *agentruns.RunStore
	logger      *slog.Logger
	backendLogs *backendlogs.Service
	timeNow     func() time.Time

	mu          sync.RWMutex
	activeRuns  map[string]runState
	approvals   map[string]ApprovalState
	questions   map[string]QuestionState
	mcpStatuses map[string]map[string]mcpx.ServerRuntimeStatus
	follow      *FollowService
}

type runState struct {
	controller         RunController
	liveChat           *ChatState
	done               chan struct{}
	doneClosed         bool
	mcpToolInvocations map[string]MCPToolInvocationSnapshot
}

type MCPToolInvocationSnapshot struct {
	StartedCount    int        `json:"startedCount"`
	CompletedCount  int        `json:"completedCount"`
	LastStartedAt   *time.Time `json:"lastStartedAt,omitempty"`
	LastCompletedAt *time.Time `json:"lastCompletedAt,omitempty"`
}

type ApprovalState struct {
	ApprovalID      string  `json:"approvalId"`
	RunID           string  `json:"runId"`
	ProjectConfigID string  `json:"projectConfigId"`
	ChatID          string  `json:"chatId"`
	SectionID       *string `json:"sectionId,omitempty"`
}

type QuestionState struct {
	ToolCallID      string  `json:"toolCallId"`
	ResponseID      *string `json:"responseId,omitempty"`
	RunID           string  `json:"runId"`
	ProjectConfigID string  `json:"projectConfigId"`
	ChatID          string  `json:"chatId"`
	SectionID       *string `json:"sectionId,omitempty"`
}

func NewRuntime(options RuntimeOptions) (*Runtime, error) {
	if options.Runs == nil {
		return nil, ErrRuntimeRunStoreRequired
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &Runtime{
		runs:        options.Runs,
		logger:      options.Logger,
		backendLogs: options.BackendLogs,
		timeNow:     timeNow,
		activeRuns:  map[string]runState{},
		approvals:   map[string]ApprovalState{},
		questions:   map[string]QuestionState{},
		mcpStatuses: map[string]map[string]mcpx.ServerRuntimeStatus{},
		follow:      options.Follow,
	}, nil
}

func (r *Runtime) ActivateRun(runID string, controller RunController) error {
	if r == nil || r.runs == nil {
		return ErrRuntimeRunStoreRequired
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return ErrRunIDRequired
	}
	if controller == nil {
		return ErrRunControllerRequired
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	state := r.activeRuns[trimmedRunID]
	state.controller = controller
	if state.done == nil || state.doneClosed {
		state.done = make(chan struct{})
		state.doneClosed = false
	}
	if state.mcpToolInvocations == nil {
		state.mcpToolInvocations = map[string]MCPToolInvocationSnapshot{}
	}
	r.activeRuns[trimmedRunID] = state
	return nil
}

func (r *Runtime) DeactivateRun(runID string) {
	if r == nil {
		return
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return
	}
	r.mu.Lock()
	if state, ok := r.activeRuns[trimmedRunID]; ok {
		closeRunDone(&state)
	}
	delete(r.activeRuns, trimmedRunID)
	r.clearApprovalsLocked(trimmedRunID)
	r.clearQuestionsLocked(trimmedRunID)
	delete(r.mcpStatuses, trimmedRunID)
	follow := r.follow
	r.mu.Unlock()
	if follow != nil {
		_ = follow.ClearRun(context.Background(), trimmedRunID)
	}
}

func (r *Runtime) syncFollowState(run agentruns.Run, state *ChatState) error {
	if r == nil || r.follow == nil || state == nil {
		return nil
	}
	return r.follow.SyncRun(context.Background(), run, *state)
}

func (r *Runtime) SetLiveChatState(runID string, state ChatState) error {
	if r == nil || r.runs == nil {
		return ErrRuntimeRunStoreRequired
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return ErrRunIDRequired
	}
	r.mu.Lock()
	current, ok := r.activeRuns[trimmedRunID]
	if !ok {
		r.mu.Unlock()
		return ErrRunNotActive
	}
	current.liveChat = state.Clone()
	r.activeRuns[trimmedRunID] = current
	follow := r.follow
	r.mu.Unlock()

	if follow == nil {
		return nil
	}
	run, err := r.runs.Load(trimmedRunID)
	if err != nil {
		return err
	}
	return follow.SyncRun(context.Background(), run, state)
}

func (r *Runtime) GetLiveChatState(runID string) (*ChatState, error) {
	if r == nil || r.runs == nil {
		return nil, ErrRuntimeRunStoreRequired
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return nil, ErrRunIDRequired
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	state, ok := r.activeRuns[trimmedRunID]
	if !ok || state.liveChat == nil {
		return nil, nil
	}
	return state.liveChat.Clone(), nil
}

func (r *Runtime) RecordMCPToolInvocationStarted(runID string, toolName string) {
	if r == nil {
		return
	}
	trimmedRunID := strings.TrimSpace(runID)
	trimmedToolName := strings.TrimSpace(toolName)
	if trimmedRunID == "" || trimmedToolName == "" {
		return
	}
	now := time.Now().UTC()
	r.mu.Lock()
	defer r.mu.Unlock()
	state, ok := r.activeRuns[trimmedRunID]
	if !ok {
		return
	}
	if state.mcpToolInvocations == nil {
		state.mcpToolInvocations = map[string]MCPToolInvocationSnapshot{}
	}
	snapshot := state.mcpToolInvocations[trimmedToolName]
	snapshot.StartedCount++
	snapshot.LastStartedAt = &now
	state.mcpToolInvocations[trimmedToolName] = snapshot
	r.activeRuns[trimmedRunID] = state
}

func (r *Runtime) RecordMCPToolInvocationCompleted(runID string, toolName string) {
	if r == nil {
		return
	}
	trimmedRunID := strings.TrimSpace(runID)
	trimmedToolName := strings.TrimSpace(toolName)
	if trimmedRunID == "" || trimmedToolName == "" {
		return
	}
	now := time.Now().UTC()
	r.mu.Lock()
	defer r.mu.Unlock()
	state, ok := r.activeRuns[trimmedRunID]
	if !ok {
		return
	}
	if state.mcpToolInvocations == nil {
		state.mcpToolInvocations = map[string]MCPToolInvocationSnapshot{}
	}
	snapshot := state.mcpToolInvocations[trimmedToolName]
	snapshot.CompletedCount++
	snapshot.LastCompletedAt = &now
	state.mcpToolInvocations[trimmedToolName] = snapshot
	r.activeRuns[trimmedRunID] = state
}

func (r *Runtime) MCPToolInvocationSnapshot(runID string, toolName string) MCPToolInvocationSnapshot {
	if r == nil {
		return MCPToolInvocationSnapshot{}
	}
	trimmedRunID := strings.TrimSpace(runID)
	trimmedToolName := strings.TrimSpace(toolName)
	if trimmedRunID == "" || trimmedToolName == "" {
		return MCPToolInvocationSnapshot{}
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	state, ok := r.activeRuns[trimmedRunID]
	if !ok || state.mcpToolInvocations == nil {
		return MCPToolInvocationSnapshot{}
	}
	snapshot, ok := state.mcpToolInvocations[trimmedToolName]
	if !ok {
		return MCPToolInvocationSnapshot{}
	}
	return cloneMCPToolInvocationSnapshot(snapshot)
}

func (r *Runtime) RegisterApproval(state ApprovalState) error {
	if r == nil || r.runs == nil {
		return ErrRuntimeRunStoreRequired
	}
	normalized, err := state.normalized()
	if err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.activeRuns[normalized.RunID]; !ok {
		return ErrRunNotActive
	}
	r.approvals[normalized.ApprovalID] = normalized
	return nil
}

func (r *Runtime) RespondToApproval(approvalID string, approved bool) error {
	if r == nil || r.runs == nil {
		return ErrRuntimeRunStoreRequired
	}
	trimmedApprovalID := strings.TrimSpace(approvalID)
	if trimmedApprovalID == "" {
		return ErrApprovalIDRequired
	}

	approvalState, activeRun, err := r.lookupApprovalResponse(trimmedApprovalID)
	if err != nil {
		return err
	}
	run, err := r.runs.Load(approvalState.RunID)
	if err != nil {
		return err
	}
	if err := activeRun.controller.SendApprovalResponse(trimmedApprovalID, approved); err != nil {
		return err
	}
	if err := r.applyLiveChatResponse(approvalState.RunID, &run, activeRun, func(nextState *ChatState) {
		appendApprovalResultMessage(nextState, trimmedApprovalID, approved)
	}); err != nil {
		return err
	}
	r.appendApprovalResponseEvents(&run, trimmedApprovalID, approved)
	if err := r.runs.Save(run); err != nil {
		return err
	}
	r.deleteApproval(trimmedApprovalID)
	return nil
}

func (r *Runtime) RegisterQuestion(state QuestionState) error {
	if r == nil || r.runs == nil {
		return ErrRuntimeRunStoreRequired
	}
	normalized, err := state.normalized()
	if err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.activeRuns[normalized.RunID]; !ok {
		return ErrRunNotActive
	}
	r.questions[normalized.ToolCallID] = normalized
	return nil
}

func (r *Runtime) RespondToQuestion(toolCallID string, answers map[string]string) error {
	if r == nil || r.runs == nil {
		return ErrRuntimeRunStoreRequired
	}
	trimmedToolCallID := strings.TrimSpace(toolCallID)
	if trimmedToolCallID == "" {
		return ErrToolCallIDRequired
	}

	questionState, activeRun, err := r.lookupQuestionResponse(trimmedToolCallID)
	if err != nil {
		return err
	}
	run, err := r.runs.Load(questionState.RunID)
	if err != nil {
		return err
	}
	answerPayload := map[string]any{
		"answers": stringMapToAnyMap(answers),
	}
	if err := activeRun.controller.SendToolResponse(questionResponseID(questionState, trimmedToolCallID), answerPayload); err != nil {
		return err
	}
	if err := r.applyLiveChatResponse(questionState.RunID, &run, activeRun, func(nextState *ChatState) {
		appendQuestionResultMessage(nextState, trimmedToolCallID, answers)
	}); err != nil {
		return err
	}
	r.appendQuestionResponseEvents(&run, trimmedToolCallID, answers)
	if err := r.runs.Save(run); err != nil {
		return err
	}
	r.deleteQuestion(trimmedToolCallID)
	return nil
}

func (r *Runtime) StopRun(runID string) (agentruns.Run, error) {
	if r == nil || r.runs == nil {
		return agentruns.Run{}, ErrRuntimeRunStoreRequired
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return agentruns.Run{}, ErrRunIDRequired
	}

	run, err := r.runs.Load(trimmedRunID)
	if err != nil {
		return agentruns.Run{}, err
	}
	if isTerminalRunStatus(run.Status) {
		return run, nil
	}
	if err := r.cancelActiveRunController(trimmedRunID); err != nil {
		return agentruns.Run{}, err
	}
	if err := r.persistCancelledRun(&run); err != nil {
		return agentruns.Run{}, err
	}
	if err := r.clearRunState(trimmedRunID); err != nil {
		return agentruns.Run{}, err
	}
	return run, nil
}

func (r *Runtime) WaitForRun(ctx context.Context, runID string) (agentruns.Run, error) {
	if r == nil || r.runs == nil {
		return agentruns.Run{}, ErrRuntimeRunStoreRequired
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return agentruns.Run{}, ErrRunIDRequired
	}

	r.mu.RLock()
	state, ok := r.activeRuns[trimmedRunID]
	r.mu.RUnlock()
	if ok && state.done != nil {
		select {
		case <-state.done:
		case <-ctx.Done():
			return agentruns.Run{}, ctx.Err()
		}
	}
	return r.runs.Load(trimmedRunID)
}

func (s ApprovalState) normalized() (ApprovalState, error) {
	normalized := ApprovalState{
		ApprovalID:      strings.TrimSpace(s.ApprovalID),
		RunID:           strings.TrimSpace(s.RunID),
		ProjectConfigID: strings.TrimSpace(s.ProjectConfigID),
		ChatID:          strings.TrimSpace(s.ChatID),
	}
	if normalized.ApprovalID == "" {
		return ApprovalState{}, ErrApprovalIDRequired
	}
	if normalized.RunID == "" {
		return ApprovalState{}, ErrRunIDRequired
	}
	if normalized.ProjectConfigID == "" {
		return ApprovalState{}, fmt.Errorf("external agent approval project config id is required")
	}
	if normalized.ChatID == "" {
		return ApprovalState{}, fmt.Errorf("external agent approval chat id is required")
	}
	if s.SectionID != nil {
		trimmedSectionID := strings.TrimSpace(*s.SectionID)
		if trimmedSectionID != "" {
			normalized.SectionID = &trimmedSectionID
		}
	}
	return normalized, nil
}

func (s QuestionState) normalized() (QuestionState, error) {
	normalized := QuestionState{
		ToolCallID:      strings.TrimSpace(s.ToolCallID),
		RunID:           strings.TrimSpace(s.RunID),
		ProjectConfigID: strings.TrimSpace(s.ProjectConfigID),
		ChatID:          strings.TrimSpace(s.ChatID),
	}
	if normalized.ToolCallID == "" {
		return QuestionState{}, ErrToolCallIDRequired
	}
	if normalized.RunID == "" {
		return QuestionState{}, ErrRunIDRequired
	}
	if normalized.ProjectConfigID == "" {
		return QuestionState{}, fmt.Errorf("external agent question project config id is required")
	}
	if normalized.ChatID == "" {
		return QuestionState{}, fmt.Errorf("external agent question chat id is required")
	}
	if s.ResponseID != nil {
		trimmedResponseID := strings.TrimSpace(*s.ResponseID)
		if trimmedResponseID != "" {
			normalized.ResponseID = &trimmedResponseID
		}
	}
	if s.SectionID != nil {
		trimmedSectionID := strings.TrimSpace(*s.SectionID)
		if trimmedSectionID != "" {
			normalized.SectionID = &trimmedSectionID
		}
	}
	return normalized, nil
}

func (r *Runtime) lookupApprovalResponse(approvalID string) (ApprovalState, runState, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	approvalState, ok := r.approvals[approvalID]
	if !ok {
		return ApprovalState{}, runState{}, ErrApprovalNotFound
	}
	activeRun, ok := r.activeRuns[approvalState.RunID]
	if !ok || activeRun.controller == nil {
		return ApprovalState{}, runState{}, ErrRunNotActive
	}
	return approvalState, activeRun, nil
}

func (r *Runtime) lookupQuestionResponse(toolCallID string) (QuestionState, runState, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	questionState, ok := r.questions[toolCallID]
	if !ok {
		return QuestionState{}, runState{}, ErrQuestionNotFound
	}
	activeRun, ok := r.activeRuns[questionState.RunID]
	if !ok || activeRun.controller == nil {
		return QuestionState{}, runState{}, ErrRunNotActive
	}
	return questionState, activeRun, nil
}

func (r *Runtime) applyLiveChatResponse(runID string, run *agentruns.Run, state runState, mutate func(*ChatState)) error {
	nextState, err := responseLiveChatState(*run, state.liveChat)
	if err != nil || nextState == nil {
		return err
	}
	mutate(nextState)
	run.Outputs = ensureAnyMap(run.Outputs)
	run.Outputs["messages"] = messageSliceToJSONList(nextState.Messages)
	state.liveChat = nextState.Clone()
	r.storeActiveRunState(runID, state)
	return r.syncFollowState(*run, nextState)
}

func responseLiveChatState(run agentruns.Run, liveState *ChatState) (*ChatState, error) {
	if liveState != nil {
		return liveState.Clone(), nil
	}
	return buildChatStateFromRun(run.Clone())
}

func questionResponseID(state QuestionState, fallback string) string {
	if state.ResponseID == nil {
		return fallback
	}
	trimmedResponseID := strings.TrimSpace(*state.ResponseID)
	if trimmedResponseID == "" {
		return fallback
	}
	return trimmedResponseID
}

func (r *Runtime) appendApprovalResponseEvents(run *agentruns.Run, approvalID string, approved bool) {
	appendRunEvent(run, "tool_result", map[string]any{
		"toolCallId": approvalID,
		"toolName":   ApprovalToolName,
		"isError":    !approved,
	}, r.timeNow())
	appendRunEvent(run, "approval_response", map[string]any{
		"approvalId": approvalID,
		"approved":   approved,
	}, r.timeNow())
}

func (r *Runtime) appendQuestionResponseEvents(run *agentruns.Run, toolCallID string, answers map[string]string) {
	appendRunEvent(run, "tool_result", map[string]any{
		"toolCallId": toolCallID,
		"toolName":   askUserQuestionToolName,
		"isError":    false,
	}, r.timeNow())
	appendRunEvent(run, "question_response", map[string]any{
		"toolCallId": toolCallID,
		"answers":    stringMapToAnyMap(answers),
	}, r.timeNow())
}

func (r *Runtime) storeActiveRunState(runID string, state runState) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.activeRuns[runID] = state
}

func (r *Runtime) deleteApproval(approvalID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.approvals, approvalID)
}

func (r *Runtime) deleteQuestion(toolCallID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.questions, toolCallID)
}

func isTerminalRunStatus(status agentruns.RunStatus) bool {
	switch status {
	case agentruns.RunStatusCompleted, agentruns.RunStatusFailed, agentruns.RunStatusCancelled:
		return true
	default:
		return false
	}
}

func (r *Runtime) cancelActiveRunController(runID string) error {
	r.mu.RLock()
	runState, active := r.activeRuns[runID]
	r.mu.RUnlock()
	if !active || runState.controller == nil {
		return nil
	}
	return runState.controller.Cancel()
}

func (r *Runtime) persistCancelledRun(run *agentruns.Run) error {
	finishedAt := r.timeNow().UTC()
	r.attachMCPStatusSnapshot(run)
	run.Status = agentruns.RunStatusCancelled
	run.FinishedAt = &finishedAt
	appendRunEvent(run, "run_cancelled", map[string]any{}, finishedAt)
	return r.runs.Save(*run)
}

func (r *Runtime) clearRunState(runID string) error {
	r.mu.Lock()
	if state, ok := r.activeRuns[runID]; ok {
		closeRunDone(&state)
	}
	delete(r.activeRuns, runID)
	r.clearApprovalsLocked(runID)
	r.clearQuestionsLocked(runID)
	delete(r.mcpStatuses, runID)
	follow := r.follow
	r.mu.Unlock()
	if follow == nil {
		return nil
	}
	return follow.ClearRun(context.Background(), runID)
}

func (r *Runtime) clearApprovalsLocked(runID string) {
	for approvalID, state := range r.approvals {
		if state.RunID == runID {
			delete(r.approvals, approvalID)
		}
	}
}

func cloneMCPToolInvocationSnapshot(snapshot MCPToolInvocationSnapshot) MCPToolInvocationSnapshot {
	cloned := MCPToolInvocationSnapshot{
		StartedCount:   snapshot.StartedCount,
		CompletedCount: snapshot.CompletedCount,
	}
	if snapshot.LastStartedAt != nil {
		startedAt := snapshot.LastStartedAt.UTC()
		cloned.LastStartedAt = &startedAt
	}
	if snapshot.LastCompletedAt != nil {
		completedAt := snapshot.LastCompletedAt.UTC()
		cloned.LastCompletedAt = &completedAt
	}
	return cloned
}

func (r *Runtime) clearQuestionsLocked(runID string) {
	for toolCallID, state := range r.questions {
		if state.RunID == runID {
			delete(r.questions, toolCallID)
		}
	}
}

func stringMapToAnyMap(input map[string]string) map[string]any {
	if len(input) == 0 {
		return map[string]any{}
	}
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}

func appendRunEvent(run *agentruns.Run, eventType string, payload map[string]any, now time.Time) {
	if run == nil {
		return
	}
	run.Events = append(run.Events, agentruns.NewRunEvent(eventType, payload, now))
}

func closeRunDone(state *runState) {
	if state == nil || state.done == nil || state.doneClosed {
		return
	}
	close(state.done)
	state.doneClosed = true
}
