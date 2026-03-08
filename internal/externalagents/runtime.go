package externalagents

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"setta/internal/agentruns"
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
	Runs    *agentruns.RunStore
	Follow  *FollowService
	TimeNow func() time.Time
}

type Runtime struct {
	runs    *agentruns.RunStore
	timeNow func() time.Time

	mu          sync.RWMutex
	activeRuns  map[string]runState
	approvals   map[string]ApprovalState
	questions   map[string]QuestionState
	mcpStatuses map[string]map[string]mcpx.ServerRuntimeStatus
	follow      *FollowService
}

type runState struct {
	controller RunController
	liveChat   *ChatState
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

	r.mu.RLock()
	approvalState, ok := r.approvals[trimmedApprovalID]
	if !ok {
		r.mu.RUnlock()
		return ErrApprovalNotFound
	}
	runState, active := r.activeRuns[approvalState.RunID]
	r.mu.RUnlock()
	if !active || runState.controller == nil {
		return ErrRunNotActive
	}

	run, err := r.runs.Load(approvalState.RunID)
	if err != nil {
		return err
	}
	if err := runState.controller.SendApprovalResponse(trimmedApprovalID, approved); err != nil {
		return err
	}
	liveState := runState.liveChat
	if liveState == nil {
		built, err := buildChatStateFromRun(run.Clone())
		if err != nil {
			return err
		}
		liveState = built
	}
	if liveState != nil {
		nextState := liveState.Clone()
		appendApprovalResultMessage(nextState, trimmedApprovalID, approved)
		run.Outputs = ensureAnyMap(run.Outputs)
		run.Outputs["messages"] = messageSliceToJSONList(nextState.Messages)
		runState.liveChat = nextState.Clone()
		r.mu.Lock()
		r.activeRuns[approvalState.RunID] = runState
		r.mu.Unlock()
		if err := r.syncFollowState(run, nextState); err != nil {
			return err
		}
	}
	appendRunEvent(&run, "tool_result", map[string]any{
		"toolCallId": trimmedApprovalID,
		"toolName":   codexApprovalToolName,
		"isError":    !approved,
	}, r.timeNow())
	appendRunEvent(&run, "approval_response", map[string]any{
		"approvalId": trimmedApprovalID,
		"approved":   approved,
	}, r.timeNow())
	if err := r.runs.Save(run); err != nil {
		return err
	}

	r.mu.Lock()
	delete(r.approvals, trimmedApprovalID)
	r.mu.Unlock()
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

	r.mu.RLock()
	questionState, ok := r.questions[trimmedToolCallID]
	if !ok {
		r.mu.RUnlock()
		return ErrQuestionNotFound
	}
	runState, active := r.activeRuns[questionState.RunID]
	r.mu.RUnlock()
	if !active || runState.controller == nil {
		return ErrRunNotActive
	}

	run, err := r.runs.Load(questionState.RunID)
	if err != nil {
		return err
	}
	responseID := trimmedToolCallID
	if questionState.ResponseID != nil && strings.TrimSpace(*questionState.ResponseID) != "" {
		responseID = strings.TrimSpace(*questionState.ResponseID)
	}
	answerPayload := map[string]any{
		"answers": stringMapToAnyMap(answers),
	}
	if err := runState.controller.SendToolResponse(responseID, answerPayload); err != nil {
		return err
	}
	liveState := runState.liveChat
	if liveState == nil {
		built, err := buildChatStateFromRun(run.Clone())
		if err != nil {
			return err
		}
		liveState = built
	}
	if liveState != nil {
		nextState := liveState.Clone()
		appendQuestionResultMessage(nextState, trimmedToolCallID, answers)
		run.Outputs = ensureAnyMap(run.Outputs)
		run.Outputs["messages"] = messageSliceToJSONList(nextState.Messages)
		runState.liveChat = nextState.Clone()
		r.mu.Lock()
		r.activeRuns[questionState.RunID] = runState
		r.mu.Unlock()
		if err := r.syncFollowState(run, nextState); err != nil {
			return err
		}
	}
	appendRunEvent(&run, "tool_result", map[string]any{
		"toolCallId": trimmedToolCallID,
		"toolName":   askUserQuestionToolName,
		"isError":    false,
	}, r.timeNow())
	appendRunEvent(&run, "question_response", map[string]any{
		"toolCallId": trimmedToolCallID,
		"answers":    stringMapToAnyMap(answers),
	}, r.timeNow())
	if err := r.runs.Save(run); err != nil {
		return err
	}

	r.mu.Lock()
	delete(r.questions, trimmedToolCallID)
	r.mu.Unlock()
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
	if run.Status == agentruns.RunStatusCompleted || run.Status == agentruns.RunStatusFailed || run.Status == agentruns.RunStatusCancelled {
		return run, nil
	}

	r.mu.RLock()
	runState, active := r.activeRuns[trimmedRunID]
	r.mu.RUnlock()
	if active && runState.controller != nil {
		if err := runState.controller.Cancel(); err != nil {
			return agentruns.Run{}, err
		}
	}

	finishedAt := r.timeNow().UTC()
	r.attachMCPStatusSnapshot(&run)
	run.Status = agentruns.RunStatusCancelled
	run.FinishedAt = &finishedAt
	appendRunEvent(&run, "run_cancelled", map[string]any{}, finishedAt)
	if err := r.runs.Save(run); err != nil {
		return agentruns.Run{}, err
	}

	r.mu.Lock()
	delete(r.activeRuns, trimmedRunID)
	r.clearApprovalsLocked(trimmedRunID)
	r.clearQuestionsLocked(trimmedRunID)
	delete(r.mcpStatuses, trimmedRunID)
	follow := r.follow
	r.mu.Unlock()
	if follow != nil {
		if err := follow.ClearRun(context.Background(), trimmedRunID); err != nil {
			return agentruns.Run{}, err
		}
	}
	return run, nil
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

func (r *Runtime) clearApprovalsLocked(runID string) {
	for approvalID, state := range r.approvals {
		if state.RunID == runID {
			delete(r.approvals, approvalID)
		}
	}
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
