package agent

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

type fakeAgentServerState struct {
	threadCounter        int
	turnCounter          int
	requestCounter       int
	threads              []string
	heldTurns            map[string]string
	pending              map[string]fakePendingApproval
	structured           map[string]bool
	cleanupRequestOnTurn map[string]bool
}

type fakePendingApproval struct {
	threadID      string
	turnID        string
	allowError    bool
	terminalState string
}

func runFakeAgentAppServer() {
	state := fakeAgentServerState{
		heldTurns:            map[string]string{},
		pending:              map[string]fakePendingApproval{},
		structured:           map[string]bool{},
		cleanupRequestOnTurn: map[string]bool{},
	}
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		var message map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			panic(err)
		}
		if _, hasMethod := message["method"]; !hasMethod {
			handleFakeAgentResponse(&state, message)
			continue
		}
		handleFakeAgentMethod(&state, message)
	}
	if err := scanner.Err(); err != nil {
		panic(err)
	}
}

func handleFakeAgentMethod(state *fakeAgentServerState, message map[string]any) {
	method, _ := message["method"].(string)
	if handleFakeAgentBootstrapMethod(method, message) {
		return
	}
	switch method {
	case "thread/start":
		handleFakeAgentThreadStart(state, message)
	case "thread/resume":
		threadID := fakeAgentStringParam(message, "threadId")
		writeFakeAgentResponse(message["id"], fakeAgentThreadOperationResponse(fakeAgentThread(threadID), "gpt-agent-test"))
	case "thread/read":
		threadID := fakeAgentStringParam(message, "threadId")
		thread := fakeAgentThread(threadID)
		thread["turns"] = []any{fakeAgentTurn("turn-history", "completed")}
		writeFakeAgentResponse(message["id"], map[string]any{"thread": thread})
	case "thread/list":
		data := make([]any, 0, len(state.threads))
		for _, threadID := range state.threads {
			data = append(data, fakeAgentThread(threadID))
		}
		writeFakeAgentResponse(message["id"], map[string]any{"data": data, "nextCursor": nil, "backwardsCursor": nil})
	case "thread/search":
		threadID := "thread-search"
		if len(state.threads) > 0 {
			threadID = state.threads[0]
		}
		writeFakeAgentResponse(message["id"], map[string]any{
			"data":            []any{map[string]any{"thread": fakeAgentThread(threadID), "snippet": "matching topic"}},
			"nextCursor":      nil,
			"backwardsCursor": nil,
		})
	case "thread/fork":
		handleFakeAgentThreadFork(state, message)
	case "thread/inject_items":
		params := fakeAgentParams(message)
		items, ok := params["items"].([]any)
		if !ok || len(items) == 0 {
			panic("thread/inject_items missing items")
		}
		writeFakeAgentResponse(message["id"], map[string]any{})
	case "thread/unsubscribe":
		writeFakeAgentResponse(message["id"], map[string]any{"status": "unsubscribed"})
	case "thread/backgroundTerminals/terminate":
		writeFakeAgentResponse(message["id"], map[string]any{"terminated": true})
	case "turn/start":
		handleFakeAgentTurnStart(state, message)
	case "turn/steer":
		handleFakeAgentTurnSteer(state, message)
	case "turn/interrupt":
		handleFakeAgentTurnInterrupt(state, message)
	default:
		writeFakeAgentError(message["id"], -32601, "unsupported fake method "+method)
	}
}

func handleFakeAgentThreadFork(state *fakeAgentServerState, message map[string]any) {
	params := fakeAgentParams(message)
	parentID := fakeAgentRequiredString(params, "threadId")
	state.threadCounter++
	threadID := fmt.Sprintf("thread-%d", state.threadCounter)
	thread := fakeAgentThread(threadID)
	thread["cwd"] = fakeAgentRequiredString(params, "cwd")
	thread["ephemeral"], _ = params["ephemeral"].(bool)
	thread["forkedFromId"] = parentID
	thread["parentThreadId"] = parentID
	state.threads = append(state.threads, threadID)
	model := "gpt-agent-test"
	if requestedModel, ok := params["model"].(string); ok && requestedModel != "" {
		model = requestedModel
	}
	writeFakeAgentResponse(message["id"], fakeAgentForkThreadOperationResponse(thread, params, model))
}

func handleFakeAgentBootstrapMethod(method string, message map[string]any) bool {
	switch method {
	case "initialize":
		writeFakeAgentResponse(message["id"], map[string]any{
			"codexHome":      "/tmp/codex",
			"platformFamily": "unix",
			"platformOs":     "test",
			"userAgent":      "setta-agent-fake",
		})
	case "initialized":
	case "model/list":
		writeFakeAgentResponse(message["id"], map[string]any{
			"data": []any{
				fakeAgentModel("gpt-agent-test", "high", true),
				fakeAgentModel("gpt-narrator-test", "low", false),
			},
			"nextCursor": nil,
		})
	default:
		return false
	}
	return true
}

func handleFakeAgentThreadStart(state *fakeAgentServerState, message map[string]any) {
	params := fakeAgentParams(message)
	state.threadCounter++
	threadID := fmt.Sprintf("thread-%d", state.threadCounter)
	thread := fakeAgentThread(threadID)
	ephemeral, _ := params["ephemeral"].(bool)
	thread["ephemeral"] = ephemeral
	model := "gpt-agent-test"
	if requestedModel, ok := params["model"].(string); ok && requestedModel != "" {
		model = requestedModel
	}
	_, hasDynamicTools := params["dynamicTools"]
	structured := params["allowProviderModelFallback"] == false && hasDynamicTools
	if structured {
		assertFakeFreshStructuredThreadStart(params)
		state.structured[threadID] = true
	}
	if !ephemeral {
		state.threads = append(state.threads, threadID)
	}
	writeFakeAgentResponse(message["id"], fakeAgentThreadOperationResponse(thread, model))
}

func assertFakeFreshStructuredThreadStart(params map[string]any) {
	if params["allowProviderModelFallback"] != false {
		panic("fresh structured thread must disable provider model fallback")
	}
	if params["approvalPolicy"] != "never" || params["sandbox"] != "read-only" {
		panic("fresh structured thread must be read-only with approvals disabled")
	}
	if params["model"] != "gpt-narrator-test" {
		panic("fresh structured thread must use the exact requested model")
	}
	if developer, _ := params["developerInstructions"].(string); !strings.Contains(developer, "Do not inspect the workspace") {
		panic("fresh structured thread is missing restricted developer instructions")
	}
	assertFakeEmptyArray(params, "dynamicTools")
	assertFakeEmptyArray(params, "environments")
	assertFakeEmptyArray(params, "selectedCapabilityRoots")
	config, ok := params["config"].(map[string]any)
	if !ok || config["web_search"] != "disabled" {
		panic("fresh structured thread must disable web search")
	}
	if config["project_doc_max_bytes"] != float64(0) {
		panic("fresh structured thread must disable workspace project instructions")
	}
	features, ok := config["features"].(map[string]any)
	if !ok || features["image_generation"] != false {
		panic("fresh structured thread must disable image generation")
	}
}

func assertFakeEmptyArray(params map[string]any, field string) {
	values, ok := params[field].([]any)
	if !ok || len(values) != 0 {
		panic("fresh structured thread field " + field + " must be an empty array")
	}
}

func handleFakeAgentTurnStart(state *fakeAgentServerState, message map[string]any) {
	params := fakeAgentParams(message)
	threadID := fakeAgentRequiredString(params, "threadId")
	state.turnCounter++
	turnID := fmt.Sprintf("provider-turn-%d", state.turnCounter)
	writeFakeAgentResponse(message["id"], map[string]any{"turn": fakeAgentTurn(turnID, "inProgress")})
	if state.structured[threadID] {
		handleFakeFreshStructuredTurn(state, params, threadID, turnID)
		return
	}
	text := fakeAgentTurnInputText(params)
	switch text {
	case "hold", "interrupt":
		state.heldTurns[turnID] = threadID
	case "approval":
		state.requestCounter++
		requestID := fmt.Sprintf("approval-%d", state.requestCounter)
		state.pending[requestID] = fakePendingApproval{threadID: threadID, turnID: turnID}
		writeFakeAgentRequest(requestID, "item/tool/requestUserInput", map[string]any{
			"itemId":   "approval-item-" + turnID,
			"threadId": threadID,
			"turnId":   turnID,
			"questions": []any{map[string]any{
				"id":       "scope",
				"header":   "Scope",
				"question": "Which scope?",
				"options":  []any{map[string]any{"label": "focused", "description": "Use the focused scope."}},
			}},
		})
	default:
		writeFakeAgentNormalTurn(threadID, turnID)
	}
}

func handleFakeFreshStructuredTurn(
	state *fakeAgentServerState,
	params map[string]any,
	threadID string,
	turnID string,
) {
	assertFakeFreshStructuredTurnStart(params)
	input := fakeAgentTurnInputText(params)
	switch input {
	case `{"mode":"hold"}`:
		state.heldTurns[turnID] = threadID
	case `{"mode":"tool"}`:
		state.heldTurns[turnID] = threadID
		command := fakeAgentCommandItem("command-"+turnID, "inProgress", nil)
		writeFakeAgentNotification("item/started", map[string]any{
			"threadId":    threadID,
			"turnId":      turnID,
			"startedAtMs": 1,
			"item":        command,
		})
	case `{"mode":"tool-cleanup-request"}`:
		state.heldTurns[turnID] = threadID
		state.cleanupRequestOnTurn[turnID] = true
		command := fakeAgentCommandItem("command-"+turnID, "inProgress", nil)
		writeFakeAgentNotification("item/started", map[string]any{
			"threadId":    threadID,
			"turnId":      turnID,
			"startedAtMs": 1,
			"item":        command,
		})
	case `{"mode":"double"}`:
		writeFakeStructuredAgentMessage(threadID, turnID, "agent-a-"+turnID, `{"answer":"FIRST"}`)
		writeFakeStructuredAgentMessage(threadID, turnID, "agent-b-"+turnID, `{"answer":"SECOND"}`)
		writeFakeAgentTurnCompleted(threadID, turnID, "completed")
	default:
		writeFakeStructuredAgentMessage(threadID, turnID, "agent-"+turnID, `{"answer":"STRUCTURED_OK"}`)
		writeFakeAgentTurnCompleted(threadID, turnID, "completed")
	}
}

func assertFakeFreshStructuredTurnStart(params map[string]any) {
	if params["approvalPolicy"] != "never" || params["model"] != "gpt-narrator-test" || params["effort"] != "low" {
		panic("fresh structured turn must preserve exact model, effort, and approval policy")
	}
	sandbox, ok := params["sandboxPolicy"].(map[string]any)
	if !ok || sandbox["type"] != "readOnly" {
		panic("fresh structured turn must use the read-only sandbox policy")
	}
	schema, ok := params["outputSchema"].(map[string]any)
	if !ok || schema["type"] != "object" || schema["additionalProperties"] != false {
		panic("fresh structured turn is missing its strict output schema")
	}
}

func writeFakeStructuredAgentMessage(threadID string, turnID string, itemID string, text string) {
	item := map[string]any{"id": itemID, "text": text, "type": "agentMessage"}
	writeFakeAgentNotification("item/completed", map[string]any{
		"threadId":      threadID,
		"turnId":        turnID,
		"completedAtMs": 2,
		"item":          item,
	})
}

func handleFakeAgentTurnSteer(state *fakeAgentServerState, message map[string]any) {
	params := fakeAgentParams(message)
	turnID := fakeAgentRequiredString(params, "expectedTurnId")
	threadID := state.heldTurns[turnID]
	if threadID == "" {
		panic("turn/steer targeted a turn that is not held")
	}
	delete(state.heldTurns, turnID)
	writeFakeAgentResponse(message["id"], map[string]any{"turnId": turnID})
	writeFakeAgentNotification("item/agentMessage/delta", map[string]any{
		"delta":    "steered",
		"itemId":   "agent-" + turnID,
		"threadId": threadID,
		"turnId":   turnID,
	})
	writeFakeAgentTurnCompleted(threadID, turnID, "completed")
}

func handleFakeAgentTurnInterrupt(state *fakeAgentServerState, message map[string]any) {
	params := fakeAgentParams(message)
	turnID := fakeAgentRequiredString(params, "turnId")
	threadID := state.heldTurns[turnID]
	if threadID == "" {
		panic("turn/interrupt targeted a turn that is not held")
	}
	delete(state.heldTurns, turnID)
	writeFakeAgentResponse(message["id"], map[string]any{})
	if state.cleanupRequestOnTurn[turnID] {
		delete(state.cleanupRequestOnTurn, turnID)
		state.requestCounter++
		requestID := fmt.Sprintf("cleanup-request-%d", state.requestCounter)
		state.pending[requestID] = fakePendingApproval{
			threadID:      threadID,
			turnID:        turnID,
			allowError:    true,
			terminalState: "interrupted",
		}
		writeFakeAgentRequest(requestID, "item/tool/requestUserInput", map[string]any{
			"itemId":   "cleanup-item-" + turnID,
			"threadId": threadID,
			"turnId":   turnID,
			"questions": []any{map[string]any{
				"id":       "cleanup",
				"header":   "Cleanup",
				"question": "This request must be rejected during cleanup.",
				"options":  []any{},
			}},
		})
		return
	}
	writeFakeAgentTurnCompleted(threadID, turnID, "interrupted")
}

func handleFakeAgentResponse(state *fakeAgentServerState, message map[string]any) {
	requestID := fmt.Sprint(message["id"])
	pending, ok := state.pending[requestID]
	if !ok {
		panic("unexpected fake app-server response id " + requestID)
	}
	delete(state.pending, requestID)
	if _, ok := message["result"]; !ok {
		if _, hasError := message["error"]; !pending.allowError || !hasError {
			panic("approval response has no permitted result or error")
		}
	}
	terminalState := pending.terminalState
	if terminalState == "" {
		terminalState = "completed"
	}
	writeFakeAgentTurnCompleted(pending.threadID, pending.turnID, terminalState)
}

func writeFakeAgentNormalTurn(threadID string, turnID string) {
	writeFakeAgentNotification("turn/plan/updated", map[string]any{
		"threadId": threadID,
		"turnId":   turnID,
		"plan": []any{
			map[string]any{"step": "Inspect", "status": "completed"},
			map[string]any{"step": "Implement", "status": "inProgress"},
		},
	})
	command := fakeAgentCommandItem("command-"+turnID, "inProgress", nil)
	writeFakeAgentNotification("item/started", map[string]any{"threadId": threadID, "turnId": turnID, "startedAtMs": 1, "item": command})
	writeFakeAgentNotification("item/agentMessage/delta", map[string]any{
		"delta":    "working",
		"itemId":   "agent-" + turnID,
		"threadId": threadID,
		"turnId":   turnID,
	})
	agentItem := map[string]any{"id": "agent-" + turnID, "text": "finished", "type": "agentMessage"}
	writeFakeAgentNotification("item/completed", map[string]any{"threadId": threadID, "turnId": turnID, "completedAtMs": 2, "item": agentItem})
	exitCode := 0
	command = fakeAgentCommandItem("command-"+turnID, "completed", &exitCode)
	writeFakeAgentNotification("item/completed", map[string]any{"threadId": threadID, "turnId": turnID, "completedAtMs": 3, "item": command})
	writeFakeAgentTurnCompleted(threadID, turnID, "completed")
}

func writeFakeAgentTurnCompleted(threadID string, turnID string, status string) {
	writeFakeAgentNotification("turn/completed", map[string]any{
		"threadId": threadID,
		"turn":     fakeAgentTurn(turnID, status),
	})
}

func fakeAgentThread(threadID string) map[string]any {
	return map[string]any{
		"cliVersion":    "fake",
		"createdAt":     1,
		"cwd":           "/tmp/setta-agent-fake",
		"ephemeral":     false,
		"id":            threadID,
		"modelProvider": "fake",
		"preview":       "",
		"sessionId":     "session-" + threadID,
		"source":        "user",
		"status":        map[string]any{"type": "idle"},
		"turns":         []any{},
		"updatedAt":     1,
	}
}

func fakeAgentThreadOperationResponse(thread map[string]any, model string) map[string]any {
	return map[string]any{
		"approvalPolicy":    "on-request",
		"approvalsReviewer": "user",
		"cwd":               "/tmp/setta-agent-fake",
		"model":             model,
		"modelProvider":     "fake",
		"reasoningEffort":   "high",
		"sandbox":           "workspace-write",
		"thread":            thread,
	}
}

func fakeAgentForkThreadOperationResponse(
	thread map[string]any,
	params map[string]any,
	model string,
) map[string]any {
	reasoningEffort := "high"
	if config, ok := params["config"].(map[string]any); ok {
		if requested, ok := config["model_reasoning_effort"].(string); ok {
			reasoningEffort = requested
		}
	}
	return map[string]any{
		"approvalPolicy":    params["approvalPolicy"],
		"approvalsReviewer": "user",
		"cwd":               params["cwd"],
		"model":             model,
		"modelProvider":     "fake",
		"reasoningEffort":   reasoningEffort,
		"sandbox":           fakeAgentSandboxPolicy(params["sandbox"]),
		"serviceTier":       params["serviceTier"],
		"thread":            thread,
	}
}

func fakeAgentSandboxPolicy(value any) map[string]any {
	switch value {
	case "read-only":
		return map[string]any{"networkAccess": false, "type": "readOnly"}
	case "workspace-write":
		return map[string]any{
			"excludeSlashTmp":     false,
			"excludeTmpdirEnvVar": false,
			"networkAccess":       false,
			"type":                "workspaceWrite",
			"writableRoots":       []any{},
		}
	case "danger-full-access":
		return map[string]any{"type": "dangerFullAccess"}
	default:
		panic(fmt.Sprintf("unsupported fake sandbox mode %v", value))
	}
}

func fakeAgentModel(id string, effort string, isDefault bool) map[string]any {
	return map[string]any{
		"defaultReasoningEffort": effort,
		"description":            id + " description",
		"displayName":            id,
		"hidden":                 false,
		"id":                     id,
		"isDefault":              isDefault,
		"model":                  id,
		"supportedReasoningEfforts": []any{
			map[string]any{"description": effort, "reasoningEffort": effort},
		},
	}
}

func fakeAgentTurn(turnID string, status string) map[string]any {
	return map[string]any{"id": turnID, "items": []any{}, "status": status}
}

func fakeAgentCommandItem(itemID string, status string, exitCode *int) map[string]any {
	return map[string]any{
		"aggregatedOutput": "output",
		"command":          "printf test",
		"commandActions":   []any{},
		"cwd":              "/tmp/setta-agent-fake",
		"exitCode":         exitCode,
		"id":               itemID,
		"status":           status,
		"type":             "commandExecution",
	}
}

func fakeAgentTurnInputText(params map[string]any) string {
	input, ok := params["input"].([]any)
	if !ok || len(input) != 1 {
		panic("turn/start input must contain one item")
	}
	item, ok := input[0].(map[string]any)
	if !ok {
		panic("turn/start input item must be an object")
	}
	return fakeAgentRequiredString(item, "text")
}

func fakeAgentParams(message map[string]any) map[string]any {
	params, ok := message["params"].(map[string]any)
	if !ok {
		panic("fake request params must be an object")
	}
	return params
}

func fakeAgentStringParam(message map[string]any, field string) string {
	return fakeAgentRequiredString(fakeAgentParams(message), field)
}

func fakeAgentRequiredString(value map[string]any, field string) string {
	text, ok := value[field].(string)
	if !ok || text == "" {
		panic("fake request field " + field + " is required")
	}
	return text
}

func writeFakeAgentResponse(id any, result any) {
	writeFakeAgentMessage(map[string]any{"jsonrpc": "2.0", "id": id, "result": result})
}

func writeFakeAgentError(id any, code int, message string) {
	writeFakeAgentMessage(map[string]any{"jsonrpc": "2.0", "id": id, "error": map[string]any{"code": code, "message": message}})
}

func writeFakeAgentNotification(method string, params any) {
	writeFakeAgentMessage(map[string]any{"jsonrpc": "2.0", "method": method, "params": params})
}

func writeFakeAgentRequest(id any, method string, params any) {
	writeFakeAgentMessage(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params})
}

func writeFakeAgentMessage(message any) {
	if err := json.NewEncoder(os.Stdout).Encode(message); err != nil {
		panic(err)
	}
}
