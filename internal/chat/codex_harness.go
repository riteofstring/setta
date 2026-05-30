package chat

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"sync"
)

type CodexHarnessConfig struct {
	Command string
	Args    []string
	Env     []string
}

type CodexHarness struct {
	config CodexHarnessConfig

	mu        sync.Mutex
	active    map[string]*codexActiveTurn
	approvals map[string]codexPendingApproval
}

type codexActiveTurn struct {
	client   *jsonRPCClient
	threadID string
	turnID   string
}

type codexPendingApproval struct {
	client            *jsonRPCClient
	method            string
	permissionProfile map[string]any
	requestID         any
	runID             string
	questions         []ApprovalQuestion
}

type codexApprovalReply struct {
	errorMessage string
	result       any
}

func NewCodexHarness(config CodexHarnessConfig) *CodexHarness {
	if config.Command == "" {
		config.Command = "codex"
	}
	if len(config.Args) == 0 {
		config.Args = []string{"app-server", "--listen", "stdio://"}
	}
	return &CodexHarness{
		config:    config,
		active:    map[string]*codexActiveTurn{},
		approvals: map[string]codexPendingApproval{},
	}
}

func (harness *CodexHarness) StartTurn(ctx context.Context, request TurnRequest, sink TurnSink) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	client, err := startJSONRPCClient(harness.config)
	if err != nil {
		return err
	}
	defer client.close()
	harness.registerActive(request.Run.ID, client)
	defer harness.unregisterActive(request.Run.ID)

	if err := initializeCodex(ctx, client); err != nil {
		return err
	}
	threadID, err := harness.startOrResumeThread(ctx, client, request)
	if err != nil {
		return err
	}
	turnID, err := startCodexTurn(ctx, client, threadID, request)
	if err != nil {
		return err
	}
	harness.updateActiveTurn(request.Run.ID, threadID, turnID)
	if err := sink.ThreadLinked(threadID, "", turnID); err != nil {
		return err
	}
	return harness.waitForTurn(ctx, client, request.Run.ID, threadID, turnID, sink)
}

func (harness *CodexHarness) waitForTurn(ctx context.Context, client *jsonRPCClient, runID string, threadID string, turnID string, sink TurnSink) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case err := <-client.done:
			if err == nil {
				return errors.New("codex app-server exited before turn completed")
			}
			return fmt.Errorf("codex app-server exited before turn completed: %w", err)
		case message := <-client.notifications:
			done, err := handleCodexNotification(message, threadID, turnID, sink)
			if err != nil {
				return err
			}
			if done {
				return nil
			}
		case message := <-client.requests:
			if err := harness.handleCodexServerRequest(message, runID, sink); err != nil {
				_ = client.respondError(message.ID, -32601, err.Error())
				return err
			}
		}
	}
}

func (harness *CodexHarness) CancelTurn(ctx context.Context, request CancelRequest) error {
	harness.mu.Lock()
	active := harness.active[request.RunID]
	harness.mu.Unlock()
	if active == nil {
		return fmt.Errorf("%w: codex turn is not active for run %s", ErrTurnNotStarted, request.RunID)
	}
	if active.threadID == "" || active.turnID == "" {
		return ErrTurnNotStarted
	}
	_, err := active.client.call(ctx, "turn/interrupt", map[string]any{
		"threadId": active.threadID,
		"turnId":   active.turnID,
	})
	return err
}

func (harness *CodexHarness) SubmitApproval(_ context.Context, response ApprovalResponse) error {
	harness.mu.Lock()
	pending, ok := harness.approvals[response.ApprovalID]
	harness.mu.Unlock()
	if !ok {
		return fmt.Errorf("codex approval is not pending: %s", response.ApprovalID)
	}
	reply, err := codexApprovalResult(pending, response)
	if err != nil {
		_ = pending.client.respondError(pending.requestID, -32000, err.Error())
		return err
	}
	if reply.errorMessage != "" {
		err = pending.client.respondError(pending.requestID, -32000, reply.errorMessage)
	} else {
		err = pending.client.respondResult(pending.requestID, reply.result)
	}
	if err != nil {
		return err
	}
	harness.mu.Lock()
	delete(harness.approvals, response.ApprovalID)
	harness.mu.Unlock()
	return nil
}

func initializeCodex(ctx context.Context, client *jsonRPCClient) error {
	_, err := client.call(ctx, "initialize", map[string]any{
		"clientInfo": map[string]any{
			"name":    "setta",
			"title":   "Setta",
			"version": "dev",
		},
		"capabilities": map[string]any{
			"experimentalApi": true,
		},
	})
	if err != nil {
		return fmt.Errorf("initialize codex app-server: %w", err)
	}
	return nil
}

func (harness *CodexHarness) startOrResumeThread(ctx context.Context, client *jsonRPCClient, request TurnRequest) (string, error) {
	if request.ThreadRef.ThreadID != "" && request.ThreadRef.Status == HarnessRefLinked {
		result, err := client.call(ctx, "thread/resume", map[string]any{
			"approvalPolicy":        "on-request",
			"approvalsReviewer":     "user",
			"cwd":                   request.Workspace.RootPath,
			"excludeTurns":          true,
			"runtimeWorkspaceRoots": []string{request.Workspace.RootPath},
			"threadId":              request.ThreadRef.ThreadID,
		})
		if err != nil {
			return "", &HarnessRefUnavailableError{
				Err:      err,
				Harness:  HarnessCodex,
				ThreadID: request.ThreadRef.ThreadID,
				Message:  fmt.Sprintf("resume codex thread %s: %v", request.ThreadRef.ThreadID, err),
			}
		}
		threadID, err := threadIDFromResponse(result)
		if err != nil {
			return "", &HarnessRefUnavailableError{
				Err:      err,
				Harness:  HarnessCodex,
				ThreadID: request.ThreadRef.ThreadID,
				Message:  fmt.Sprintf("resume codex thread %s: %v", request.ThreadRef.ThreadID, err),
			}
		}
		return threadID, nil
	}

	result, err := client.call(ctx, "thread/start", map[string]any{
		"approvalPolicy":        "on-request",
		"approvalsReviewer":     "user",
		"cwd":                   request.Workspace.RootPath,
		"runtimeWorkspaceRoots": []string{request.Workspace.RootPath},
	})
	if err != nil {
		return "", fmt.Errorf("start codex thread: %w", err)
	}
	threadID, err := threadIDFromResponse(result)
	if err != nil {
		return "", err
	}
	return threadID, nil
}

func startCodexTurn(ctx context.Context, client *jsonRPCClient, threadID string, request TurnRequest) (string, error) {
	result, err := client.call(ctx, "turn/start", map[string]any{
		"cwd":      request.Workspace.RootPath,
		"threadId": threadID,
		"input": []map[string]any{{
			"text": request.Prompt,
			"type": "text",
		}},
	})
	if err != nil {
		return "", fmt.Errorf("start codex turn: %w", err)
	}
	turnID, err := turnIDFromResponse(result)
	if err != nil {
		return "", err
	}
	return turnID, nil
}

func handleCodexNotification(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	switch message.Method {
	case "item/agentMessage/delta":
		return handleCodexAssistantDelta(message, threadID, turnID, sink)
	case "turn/completed":
		return handleCodexTurnCompleted(message, threadID, turnID)
	case "error":
		return false, fmt.Errorf("codex app-server error notification: %s", stringFieldFromRaw(message.Params, "message"))
	default:
		return false, sink.Trace("codex_notification_ignored", message.Method)
	}
}

func handleCodexAssistantDelta(message jsonRPCMessage, threadID string, turnID string, sink TurnSink) (bool, error) {
	params, err := objectValue(message.Params)
	if err != nil {
		return false, err
	}
	if stringField(params, "threadId") != threadID || stringField(params, "turnId") != turnID {
		return false, nil
	}
	return false, sink.AssistantTextDelta(stringField(params, "delta"))
}

func handleCodexTurnCompleted(message jsonRPCMessage, threadID string, turnID string) (bool, error) {
	params, err := objectValue(message.Params)
	if err != nil {
		return false, err
	}
	if stringField(params, "threadId") != threadID {
		return false, nil
	}
	turn, ok := params["turn"].(map[string]any)
	if !ok {
		return false, errors.New("codex turn/completed notification missing turn")
	}
	if stringField(turn, "id") != turnID {
		return false, nil
	}
	if stringField(turn, "status") == "failed" {
		return false, fmt.Errorf("codex turn failed: %s", turnErrorMessage(turn))
	}
	return true, nil
}

func (harness *CodexHarness) handleCodexServerRequest(message jsonRPCMessage, runID string, sink TurnSink) error {
	approval, details, err := approvalRequestFromCodex(message, runID)
	if err != nil {
		return err
	}
	harness.mu.Lock()
	harness.approvals[approval.ID] = codexPendingApproval{
		client:            message.client,
		method:            message.Method,
		permissionProfile: details.permissionProfile,
		requestID:         message.ID,
		runID:             runID,
		questions:         details.questions,
	}
	harness.mu.Unlock()
	return sink.ApprovalRequested(approval)
}

type codexApprovalDetails struct {
	permissionProfile map[string]any
	questions         []ApprovalQuestion
}

func approvalRequestFromCodex(message jsonRPCMessage, runID string) (ApprovalRequest, codexApprovalDetails, error) {
	params, err := objectValue(message.Params)
	if err != nil {
		return ApprovalRequest{}, codexApprovalDetails{}, err
	}
	requestID := requestIDString(message.ID)
	switch message.Method {
	case "item/commandExecution/requestApproval":
		return ApprovalRequest{
			ID:       "codex_" + requestID,
			RunID:    runID,
			Kind:     ApprovalKindCommand,
			Title:    "Command approval",
			Body:     stringField(params, "reason"),
			Command:  stringField(params, "command"),
			FilePath: stringField(params, "cwd"),
			Options:  []string{},
		}, codexApprovalDetails{}, nil
	case "item/fileChange/requestApproval":
		return ApprovalRequest{
			ID:       "codex_" + requestID,
			RunID:    runID,
			Kind:     ApprovalKindFileChange,
			Title:    "File change approval",
			Body:     stringField(params, "reason"),
			FilePath: stringField(params, "grantRoot"),
			Options:  []string{},
		}, codexApprovalDetails{}, nil
	case "item/permissions/requestApproval":
		permissions := objectField(params, "permissions")
		return ApprovalRequest{
			ID:         "codex_" + requestID,
			RunID:      runID,
			Kind:       ApprovalKindPermission,
			Title:      "Permission approval",
			Body:       stringField(params, "reason"),
			FilePath:   stringField(params, "cwd"),
			Permission: jsonSummary(permissions),
			Options:    []string{},
		}, codexApprovalDetails{permissionProfile: permissions}, nil
	case "item/tool/requestUserInput":
		questions, title, body, options := userInputQuestions(params)
		return ApprovalRequest{
			ID:        "codex_" + requestID,
			RunID:     runID,
			Kind:      ApprovalKindUserInput,
			Title:     title,
			Body:      body,
			Question:  body,
			Options:   options,
			Questions: questions,
		}, codexApprovalDetails{questions: questions}, nil
	default:
		return ApprovalRequest{}, codexApprovalDetails{}, fmt.Errorf("unsupported codex app-server request: %s", message.Method)
	}
}

func codexApprovalResult(pending codexPendingApproval, response ApprovalResponse) (codexApprovalReply, error) {
	switch pending.method {
	case "item/commandExecution/requestApproval":
		return codexApprovalReply{result: map[string]any{"decision": approvalDecision(response)}}, nil
	case "item/fileChange/requestApproval":
		return codexApprovalReply{result: map[string]any{"decision": approvalDecision(response)}}, nil
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
	default:
		return codexApprovalReply{}, fmt.Errorf("unsupported codex approval response method: %s", pending.method)
	}
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

func (harness *CodexHarness) registerActive(runID string, client *jsonRPCClient) {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	harness.active[runID] = &codexActiveTurn{client: client}
}

func (harness *CodexHarness) updateActiveTurn(runID string, threadID string, turnID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	active := harness.active[runID]
	if active == nil {
		return
	}
	active.threadID = threadID
	active.turnID = turnID
}

func (harness *CodexHarness) unregisterActive(runID string) {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	delete(harness.active, runID)
	for approvalID, approval := range harness.approvals {
		if approval.runID == runID {
			delete(harness.approvals, approvalID)
		}
	}
}

type jsonRPCClient struct {
	cmd           *exec.Cmd
	stdin         io.WriteCloser
	notifications chan jsonRPCMessage
	requests      chan jsonRPCMessage
	done          chan error

	mu      sync.Mutex
	nextID  int
	pending map[int]chan jsonRPCMessage
}

type jsonRPCMessage struct {
	ID     any             `json:"id,omitempty"`
	Method string          `json:"method,omitempty"`
	Params json.RawMessage `json:"params,omitempty"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *jsonRPCError   `json:"error,omitempty"`
	client *jsonRPCClient
}

type jsonRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func startJSONRPCClient(config CodexHarnessConfig) (*jsonRPCClient, error) {
	cmd := exec.Command(config.Command, config.Args...)
	if len(config.Env) > 0 {
		cmd.Env = append(os.Environ(), config.Env...)
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("create codex app-server stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("create codex app-server stdout: %w", err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start codex app-server: %w", err)
	}
	client := &jsonRPCClient{
		cmd:           cmd,
		stdin:         stdin,
		notifications: make(chan jsonRPCMessage, 128),
		requests:      make(chan jsonRPCMessage, 32),
		done:          make(chan error, 1),
		pending:       map[int]chan jsonRPCMessage{},
	}
	go client.readLoop(stdout, &stderr)
	return client, nil
}

func (client *jsonRPCClient) call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	id, responseChannel := client.registerPending()
	if err := client.write(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"method":  method,
		"params":  params,
	}); err != nil {
		client.unregisterPending(id)
		return nil, err
	}
	select {
	case <-ctx.Done():
		client.unregisterPending(id)
		return nil, ctx.Err()
	case response := <-responseChannel:
		if response.Error != nil {
			return nil, fmt.Errorf("%s failed: %s", method, response.Error.Message)
		}
		return response.Result, nil
	case err := <-client.done:
		client.unregisterPending(id)
		if err == nil {
			return nil, fmt.Errorf("%s failed: codex app-server exited", method)
		}
		return nil, fmt.Errorf("%s failed: codex app-server exited: %w", method, err)
	}
}

func (client *jsonRPCClient) respondResult(id any, result any) error {
	return client.write(map[string]any{"jsonrpc": "2.0", "id": id, "result": result})
}

func (client *jsonRPCClient) respondError(id any, code int, message string) error {
	return client.write(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"error":   map[string]any{"code": code, "message": message},
	})
}

func (client *jsonRPCClient) registerPending() (int, chan jsonRPCMessage) {
	client.mu.Lock()
	defer client.mu.Unlock()
	client.nextID++
	id := client.nextID
	channel := make(chan jsonRPCMessage, 1)
	client.pending[id] = channel
	return id, channel
}

func (client *jsonRPCClient) unregisterPending(id int) {
	client.mu.Lock()
	defer client.mu.Unlock()
	delete(client.pending, id)
}

func (client *jsonRPCClient) write(payload any) error {
	client.mu.Lock()
	defer client.mu.Unlock()
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode codex app-server message: %w", err)
	}
	if _, err := client.stdin.Write(append(data, '\n')); err != nil {
		return fmt.Errorf("write codex app-server message: %w", err)
	}
	return nil
}

func (client *jsonRPCClient) readLoop(stdout io.Reader, stderr *bytes.Buffer) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 4096), 16*1024*1024)
	for scanner.Scan() {
		var message jsonRPCMessage
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			client.done <- fmt.Errorf("decode codex app-server message: %w", err)
			return
		}
		message.client = client
		if message.Method != "" && message.ID != nil {
			client.requests <- message
			continue
		}
		if message.Method != "" {
			client.notifications <- message
			continue
		}
		if id, ok := intID(message.ID); ok {
			client.mu.Lock()
			channel := client.pending[id]
			delete(client.pending, id)
			client.mu.Unlock()
			if channel != nil {
				channel <- message
			}
		}
	}
	if err := scanner.Err(); err != nil {
		client.done <- err
		return
	}
	waitErr := client.cmd.Wait()
	if waitErr != nil {
		message := stderr.String()
		if message != "" {
			client.done <- fmt.Errorf("%w: %s", waitErr, message)
			return
		}
		client.done <- waitErr
		return
	}
	client.done <- nil
}

func (client *jsonRPCClient) close() {
	_ = client.stdin.Close()
	if client.cmd.Process != nil {
		_ = client.cmd.Process.Kill()
	}
}

func threadIDFromResponse(raw json.RawMessage) (string, error) {
	response, err := objectValue(raw)
	if err != nil {
		return "", err
	}
	thread, ok := response["thread"].(map[string]any)
	if !ok {
		return "", errors.New("codex thread response missing thread")
	}
	threadID := stringField(thread, "id")
	if threadID == "" {
		return "", errors.New("codex thread response missing thread id")
	}
	return threadID, nil
}

func turnIDFromResponse(raw json.RawMessage) (string, error) {
	response, err := objectValue(raw)
	if err != nil {
		return "", err
	}
	turn, ok := response["turn"].(map[string]any)
	if !ok {
		return "", errors.New("codex turn response missing turn")
	}
	turnID := stringField(turn, "id")
	if turnID == "" {
		return "", errors.New("codex turn response missing turn id")
	}
	return turnID, nil
}

func objectValue(raw json.RawMessage) (map[string]any, error) {
	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	return value, nil
}

func objectField(value map[string]any, name string) map[string]any {
	raw, ok := value[name].(map[string]any)
	if !ok || raw == nil {
		return map[string]any{}
	}
	return raw
}

func stringField(value map[string]any, name string) string {
	raw, ok := value[name]
	if !ok || raw == nil {
		return ""
	}
	text, ok := raw.(string)
	if !ok {
		return ""
	}
	return text
}

func boolField(value map[string]any, name string) bool {
	raw, ok := value[name]
	if !ok || raw == nil {
		return false
	}
	flag, ok := raw.(bool)
	return ok && flag
}

func stringFieldFromRaw(raw json.RawMessage, name string) string {
	value, err := objectValue(raw)
	if err != nil {
		return ""
	}
	return stringField(value, name)
}

func jsonSummary(value map[string]any) string {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "{}"
	}
	return string(data)
}

func questionOptions(question map[string]any) []string {
	rawOptions, ok := question["options"].([]any)
	if !ok {
		return []string{}
	}
	options := make([]string, 0, len(rawOptions))
	for _, rawOption := range rawOptions {
		option, ok := rawOption.(map[string]any)
		if ok {
			options = append(options, stringField(option, "label"))
		}
	}
	return options
}

func userInputQuestions(params map[string]any) ([]ApprovalQuestion, string, string, []string) {
	rawQuestions, _ := params["questions"].([]any)
	questions := make([]ApprovalQuestion, 0, len(rawQuestions))
	options := []string{}
	title := "User input requested"
	body := ""
	for index, raw := range rawQuestions {
		question, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		id := stringField(question, "id")
		optionsForQuestion := questionOptions(question)
		questions = append(questions, ApprovalQuestion{
			ID:       id,
			Header:   stringField(question, "header"),
			Question: stringField(question, "question"),
			Options:  optionsForQuestion,
			IsOther:  boolField(question, "isOther"),
			IsSecret: boolField(question, "isSecret"),
		})
		if index == 0 {
			if header := stringField(question, "header"); header != "" {
				title = header
			}
			body = stringField(question, "question")
			options = optionsForQuestion
		}
	}
	return questions, title, body, options
}

func turnErrorMessage(turn map[string]any) string {
	rawError, ok := turn["error"].(map[string]any)
	if !ok {
		return "unknown turn failure"
	}
	message := stringField(rawError, "message")
	if message == "" {
		return "unknown turn failure"
	}
	return message
}

func requestIDString(id any) string {
	switch value := id.(type) {
	case string:
		return value
	case float64:
		return strconv.Itoa(int(value))
	default:
		return fmt.Sprintf("%v", value)
	}
}

func intID(id any) (int, bool) {
	switch value := id.(type) {
	case float64:
		return int(value), true
	case int:
		return value, true
	default:
		return 0, false
	}
}
