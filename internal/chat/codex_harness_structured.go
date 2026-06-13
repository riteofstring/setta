package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"setta/internal/codexapp"
)

func (harness *CodexHarness) runStructuredTask(ctx context.Context, request HarnessTaskRequest) (HarnessTaskResult, error) {
	if err := validateCodexStructuredTaskRequest(request); err != nil {
		return HarnessTaskResult{}, err
	}
	if err := ctx.Err(); err != nil {
		return HarnessTaskResult{}, err
	}

	session, err := harness.manager.NewSession(ctx)
	if err != nil {
		return HarnessTaskResult{}, err
	}
	session.AcceptUnscopedNotifications()
	session.AcceptUnscopedRequests()
	defer session.Close()

	thread, err := harness.startCodexStructuredTaskThread(ctx, session, request)
	if err != nil {
		return HarnessTaskResult{}, err
	}
	if err := session.OwnThread(thread.id); err != nil {
		return HarnessTaskResult{}, err
	}
	turnID, err := startCodexStructuredTaskTurn(ctx, session, thread.id, request)
	if err != nil {
		return HarnessTaskResult{}, err
	}
	if err := session.OwnTurn(thread.id, turnID); err != nil {
		return HarnessTaskResult{}, err
	}
	sink := newCodexStructuredTaskSink()
	wait, err := harness.waitForStructuredTask(ctx, session, thread.id, turnID, sink)
	if err != nil {
		return HarnessTaskResult{}, err
	}
	return HarnessTaskResult{
		Completion:       wait.completion,
		StructuredOutput: wait.output,
		Audit: HarnessAuditMetadata{
			HarnessKind: request.HarnessKind,
			Model:       firstNonEmptyString(request.StructuredTask.Model, thread.model),
			RequestID:   request.StructuredTask.ID,
			ResponseID:  turnID,
			ThreadRef: HarnessThreadRef{
				Harness:    request.HarnessKind,
				ThreadID:   thread.id,
				LastTurnID: turnID,
				Status:     HarnessRefLinked,
			},
			Diagnostics: sink.Diagnostics(),
		},
	}, nil
}

func validateCodexStructuredTaskRequest(request HarnessTaskRequest) error {
	if err := validateCodexStructuredTaskShape(request); err != nil {
		return err
	}
	if err := validateCodexStructuredTaskCapabilityPolicy(request.CapabilityPolicy); err != nil {
		return err
	}
	return validateCodexStructuredTaskPayload(request.StructuredTask, request.OutputContract.JSONSchema)
}

func validateCodexStructuredTaskShape(request HarnessTaskRequest) error {
	if request.ConversationTurn != nil {
		return fmt.Errorf("%w: conversation turn cannot be run as codex structured task", ErrUnsupportedHarnessTask)
	}
	if request.StructuredTask == nil {
		return fmt.Errorf("%w: structured task is required", ErrUnsupportedHarnessTask)
	}
	if request.Surface != HarnessSurfaceSemanticCartographer {
		return fmt.Errorf("%w: codex structured surface %s", ErrUnsupportedHarnessTask, request.Surface)
	}
	if request.TurnMode != HarnessTurnStructuredTask {
		return fmt.Errorf("%w: codex structured turn mode %s", ErrUnsupportedHarnessTask, request.TurnMode)
	}
	if request.OutputContract.Kind != HarnessOutputStrictJSON {
		return fmt.Errorf("%w: codex structured output contract %s", ErrUnsupportedHarnessTask, request.OutputContract.Kind)
	}
	if len(request.OutputContract.JSONSchema) == 0 {
		return fmt.Errorf("%w: codex structured output schema is required", ErrUnsupportedHarnessTask)
	}
	return nil
}

func validateCodexStructuredTaskCapabilityPolicy(policy HarnessCapabilityPolicy) error {
	if len(policy.AllowedTools) != 0 || policy.WorkspaceMutation || policy.Approvals || policy.Streaming {
		return fmt.Errorf("%w: codex semantic cartographer capability policy must disable tools, mutation, approvals, and streaming", ErrUnsupportedHarnessTask)
	}
	return nil
}

func validateCodexStructuredTaskPayload(task *HarnessStructuredTask, schemaJSON json.RawMessage) error {
	if task.ID == "" {
		return fmt.Errorf("%w: codex structured task id is required", ErrUnsupportedHarnessTask)
	}
	if task.Workspace.RootPath == "" {
		return fmt.Errorf("%w: codex structured task workspace root is required", ErrUnsupportedHarnessTask)
	}
	if strings.TrimSpace(task.Prompt) == "" {
		return fmt.Errorf("%w: codex structured task prompt is required", ErrUnsupportedHarnessTask)
	}
	if len(task.Input) == 0 {
		return fmt.Errorf("%w: codex structured task input is required", ErrUnsupportedHarnessTask)
	}
	var schema any
	if err := json.Unmarshal(schemaJSON, &schema); err != nil {
		return fmt.Errorf("%w: codex structured output schema must be valid JSON: %v", ErrUnsupportedHarnessTask, err)
	}
	return nil
}

type codexStructuredTaskThread struct {
	id    string
	model string
}

func (harness *CodexHarness) startCodexStructuredTaskThread(ctx context.Context, session *codexapp.Session, request HarnessTaskRequest) (codexStructuredTaskThread, error) {
	params := map[string]any{
		"approvalPolicy":        "never",
		"cwd":                   request.StructuredTask.Workspace.RootPath,
		"developerInstructions": request.StructuredTask.Prompt,
		"ephemeral":             true,
		"sandbox":               "read-only",
	}
	if request.StructuredTask.Model != "" {
		params["model"] = request.StructuredTask.Model
	}
	result, err := session.Call(ctx, codexapp.CodexMethodThreadStart, params)
	if err != nil {
		return codexStructuredTaskThread{}, fmt.Errorf("start codex structured task thread: %w", err)
	}
	response, err := codexapp.DecodeThreadStartResponse(result)
	if err != nil {
		return codexStructuredTaskThread{}, err
	}
	threadID, err := threadIDFromCodexThread(response.Thread, "codex structured task thread start response")
	if err != nil {
		return codexStructuredTaskThread{}, err
	}
	return codexStructuredTaskThread{id: threadID, model: response.Model}, nil
}

func startCodexStructuredTaskTurn(ctx context.Context, session *codexapp.Session, threadID string, request HarnessTaskRequest) (string, error) {
	params := map[string]any{
		"approvalPolicy": "never",
		"cwd":            request.StructuredTask.Workspace.RootPath,
		"input": []map[string]any{{
			"text": codexStructuredTaskInputText(*request.StructuredTask),
			"type": "text",
		}},
		"outputSchema":  request.OutputContract.JSONSchema,
		"sandboxPolicy": "read-only",
		"threadId":      threadID,
	}
	if request.StructuredTask.Model != "" {
		params["model"] = request.StructuredTask.Model
	}
	if request.StructuredTask.ReasoningEffort != nil {
		params["effort"] = string(*request.StructuredTask.ReasoningEffort)
	}
	result, err := session.Call(ctx, codexapp.CodexMethodTurnStart, params)
	if err != nil {
		return "", fmt.Errorf("start codex structured task turn: %w", err)
	}
	return turnIDFromStartResponse(result)
}

func codexStructuredTaskInputText(task HarnessStructuredTask) string {
	return task.Prompt + "\n\nCartographer input bundle JSON:\n" + string(task.Input)
}

type codexStructuredTaskWaitResult struct {
	completion TurnCompletion
	output     json.RawMessage
}

func (harness *CodexHarness) waitForStructuredTask(ctx context.Context, session *codexapp.Session, threadID string, turnID string, sink *codexStructuredTaskSink) (codexStructuredTaskWaitResult, error) {
	for {
		select {
		case <-ctx.Done():
			return codexStructuredTaskWaitResult{}, ctx.Err()
		case event, ok := <-session.Events():
			if !ok {
				return codexStructuredTaskWaitResult{}, fmt.Errorf("codex app-server session closed before structured task completed")
			}
			result, done, err := harness.applyCodexStructuredTaskEvent(ctx, event, threadID, turnID, sink)
			if err != nil {
				return codexStructuredTaskWaitResult{}, err
			}
			if done {
				return result, nil
			}
		}
	}
}

func (harness *CodexHarness) applyCodexStructuredTaskEvent(ctx context.Context, event codexapp.Event, threadID string, turnID string, sink *codexStructuredTaskSink) (codexStructuredTaskWaitResult, bool, error) {
	switch event.Kind {
	case codexapp.EventRequest:
		err := fmt.Errorf("codex structured cartographer task attempted disallowed server request %s", event.Message.Method)
		_ = event.Message.RespondError(codexJSONRPCErrorCapabilityUnavailable, err.Error())
		return codexStructuredTaskWaitResult{}, false, err
	case codexapp.EventNotification:
		return handleCodexStructuredTaskNotification(event.Message, threadID, turnID, sink)
	case codexapp.EventLifecycle:
		return codexStructuredTaskWaitResult{}, false, fmt.Errorf("codex app-server exited before structured task completed: %w", event.Err)
	default:
		return codexStructuredTaskWaitResult{}, false, fmt.Errorf("unsupported codex app-server session event: %s", event.Kind)
	}
}

func handleCodexStructuredTaskNotification(message jsonRPCMessage, threadID string, turnID string, sink *codexStructuredTaskSink) (codexStructuredTaskWaitResult, bool, error) {
	if message.Method != codexapp.CodexNotificationTurnCompleted {
		_, err := handleCodexNotification(message, threadID, turnID, sink)
		return codexStructuredTaskWaitResult{}, false, err
	}
	status, turn, err := codexCompletedTurnStatus(message, threadID, turnID, sink)
	if err != nil {
		return codexStructuredTaskWaitResult{}, false, err
	}
	completion, err := codexTurnCompletionForStatus(status, turn, message, sink)
	if err != nil {
		return codexStructuredTaskWaitResult{}, false, err
	}
	if completion.Completion.Outcome != TurnOutcomeCompleted {
		return codexStructuredTaskWaitResult{completion: completion.Completion}, true, nil
	}
	output, err := codexStructuredOutputFromCompletedTurn(turn)
	if err != nil {
		return codexStructuredTaskWaitResult{}, false, err
	}
	return codexStructuredTaskWaitResult{completion: completion.Completion, output: output}, true, nil
}

func codexStructuredOutputFromCompletedTurn(turn map[string]any) (json.RawMessage, error) {
	items, err := requireArray(turn, "items", "codex structured completed turn")
	if err != nil {
		return nil, err
	}
	candidates := []json.RawMessage{}
	for index, rawItem := range items {
		itemCandidates, err := codexStructuredOutputCandidatesFromTurnItem(rawItem, index)
		if err != nil {
			return nil, err
		}
		candidates = append(candidates, itemCandidates...)
	}
	if len(candidates) != 1 {
		return nil, fmt.Errorf("codex structured task produced %d structured output candidates, want exactly one", len(candidates))
	}
	return strictJSONObject(candidates[0], "codex structured task output")
}

func codexStructuredOutputCandidatesFromTurnItem(rawItem any, index int) ([]json.RawMessage, error) {
	item, ok := rawItem.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("codex structured completed turn.items[%d] must be an object", index)
	}
	itemType, err := requireString(item, "type", "codex structured completed turn item")
	if err != nil || itemType != "agentMessage" {
		return nil, err
	}
	return codexStructuredOutputCandidatesFromAgentItem(item)
}

func codexStructuredOutputCandidatesFromAgentItem(item map[string]any) ([]json.RawMessage, error) {
	candidates := []json.RawMessage{}
	for _, field := range []string{"structuredContent", "structuredOutput", "output"} {
		candidate, err := codexStructuredOutputCandidateFromField(item, field)
		if err != nil {
			return nil, err
		}
		if len(candidate) > 0 {
			candidates = append(candidates, candidate)
		}
	}
	text, err := optionalString(item, "text", "codex structured completed turn item")
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(text) != "" {
		candidates = append(candidates, json.RawMessage(text))
	}
	return candidates, nil
}

func codexStructuredOutputCandidateFromField(item map[string]any, field string) (json.RawMessage, error) {
	raw, ok := item[field]
	if !ok || raw == nil {
		return nil, nil
	}
	return rawJSON(raw, "codex structured output "+field)
}

func strictJSONObject(raw json.RawMessage, label string) (json.RawMessage, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, fmt.Errorf("%s is required", label)
	}
	var value any
	decoder := json.NewDecoder(bytes.NewReader(trimmed))
	if err := decoder.Decode(&value); err != nil {
		return nil, fmt.Errorf("%s must be strict JSON: %w", label, err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, fmt.Errorf("%s must contain exactly one JSON value", label)
		}
		return nil, fmt.Errorf("%s trailing JSON is invalid: %w", label, err)
	}
	if _, ok := value.(map[string]any); !ok {
		return nil, fmt.Errorf("%s must be a JSON object", label)
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, trimmed); err != nil {
		return nil, fmt.Errorf("%s must be compactable JSON: %w", label, err)
	}
	return json.RawMessage(compact.Bytes()), nil
}

type codexStructuredTaskSink struct {
	diagnostics []HarnessTaskDiagnostic
}

func newCodexStructuredTaskSink() *codexStructuredTaskSink {
	return &codexStructuredTaskSink{diagnostics: []HarnessTaskDiagnostic{}}
}

func (sink *codexStructuredTaskSink) Diagnostics() []HarnessTaskDiagnostic {
	return append([]HarnessTaskDiagnostic{}, sink.diagnostics...)
}

func (sink *codexStructuredTaskSink) AssistantTextDelta(string, string) error {
	return errors.New("codex structured cartographer task attempted streaming assistant text")
}

func (sink *codexStructuredTaskSink) ApprovalRequested(ApprovalRequest) error {
	return errors.New("codex structured cartographer task attempted approval request")
}

func (sink *codexStructuredTaskSink) ApprovalResolved(string, bool, string) error {
	return errors.New("codex structured cartographer task attempted approval resolution")
}

func (sink *codexStructuredTaskSink) ProviderDiagnostic(code string, message string, context map[string]string, _ bool, severity DiagnosticSeverity) error {
	sink.diagnostics = append(sink.diagnostics, HarnessTaskDiagnostic{
		Code:     code,
		Message:  message,
		Severity: severity,
		Context:  cloneStringMap(context),
	})
	return nil
}

func (sink *codexStructuredTaskSink) GoalUpdated(*ChatGoalState) error {
	return errors.New("codex structured cartographer task attempted goal update")
}

func (sink *codexStructuredTaskSink) RunItemOutputDelta(string, string, string) error {
	return errors.New("codex structured cartographer task attempted run item output stream")
}

func (sink *codexStructuredTaskSink) RunItemUpsert(item RunItem) error {
	switch item.Type {
	case RunItemTypeAgentMessage, RunItemTypeReasoning, RunItemTypePlan, RunItemTypeNotice, RunItemTypeContextCompaction:
		return nil
	default:
		return fmt.Errorf("codex structured cartographer task attempted disallowed run item type %s", item.Type)
	}
}

func (sink *codexStructuredTaskSink) ThreadLinked(string, string, string) error {
	return nil
}

func (sink *codexStructuredTaskSink) UserMessageCommitted(string) error {
	return nil
}

func (sink *codexStructuredTaskSink) Trace(eventType string, message string) error {
	sink.diagnostics = append(sink.diagnostics, HarnessTaskDiagnostic{
		Code:     eventType,
		Message:  message,
		Severity: DiagnosticSeverityInfo,
		Context:  map[string]string{},
	})
	return nil
}

func cloneStringMap(values map[string]string) map[string]string {
	if values == nil {
		return map[string]string{}
	}
	clone := make(map[string]string, len(values))
	for key, value := range values {
		clone[key] = value
	}
	return clone
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
