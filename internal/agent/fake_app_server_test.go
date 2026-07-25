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
	pendingDynamicTools  map[string]fakePendingDynamicTool
	structured           map[string]bool
	cleanupRequestOnTurn map[string]bool
	cleanupFailureOnTurn map[string]bool
	unsubscribed         map[string]bool
}

type fakePendingApproval struct {
	threadID      string
	turnID        string
	allowError    bool
	terminalState string
}

type fakePendingDynamicTool struct {
	threadID    string
	turnID      string
	wantSuccess bool
}

func runFakeAgentAppServer() {
	state := fakeAgentServerState{
		heldTurns:            map[string]string{},
		pending:              map[string]fakePendingApproval{},
		pendingDynamicTools:  map[string]fakePendingDynamicTool{},
		structured:           map[string]bool{},
		cleanupRequestOnTurn: map[string]bool{},
		cleanupFailureOnTurn: map[string]bool{},
		unsubscribed:         map[string]bool{},
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
		handleFakeAgentThreadResume(state, message)
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
		handleFakeAgentThreadUnsubscribe(state, message)
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

func handleFakeAgentThreadUnsubscribe(state *fakeAgentServerState, message map[string]any) {
	status := "unsubscribed"
	threadID := fakeAgentRequiredString(fakeAgentParams(message), "threadId")
	if threadID == "thread-not-loaded" {
		status = "notLoaded"
	} else if state.unsubscribed[threadID] {
		status = "notSubscribed"
	} else {
		state.unsubscribed[threadID] = true
	}
	writeFakeAgentResponse(message["id"], map[string]any{"status": status})
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
	case "config/read":
		writeFakeAgentResponse(message["id"], map[string]any{
			"config": map[string]any{
				"mcp_servers": map[string]any{
					"configured-test-server": map[string]any{
						"command": "must-not-run",
					},
				},
			},
			"origins": map[string]any{},
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
	if cwd, ok := params["cwd"].(string); ok {
		thread["cwd"] = cwd
	}
	ephemeral, _ := params["ephemeral"].(bool)
	thread["ephemeral"] = ephemeral
	model := "gpt-agent-test"
	if requestedModel, ok := params["model"].(string); ok && requestedModel != "" {
		model = requestedModel
	}
	structured := params["allowProviderModelFallback"] == false && ephemeral
	if structured {
		assertFakeFreshStructuredThreadStart(params)
		state.structured[threadID] = true
	}
	if params["allowProviderModelFallback"] == false && !ephemeral {
		assertFakeRestrictedDurableThreadStart(params)
	}
	if !ephemeral {
		state.threads = append(state.threads, threadID)
	}
	response := fakeAgentThreadOperationResponse(thread, params, model)
	if structured && strings.Contains(
		fakeAgentRequiredString(params, "developerInstructions"),
		"SIMULATE_RESTRICTED_RESPONSE_DRIFT",
	) {
		response["runtimeWorkspaceRoots"] = []any{"/tmp/unexpected-runtime-root"}
	}
	writeFakeAgentResponse(message["id"], response)
}

func handleFakeAgentThreadResume(state *fakeAgentServerState, message map[string]any) {
	params := fakeAgentParams(message)
	threadID := fakeAgentRequiredString(params, "threadId")
	thread := fakeAgentThread(threadID)
	if cwd, ok := params["cwd"].(string); ok {
		thread["cwd"] = cwd
	}
	model := "gpt-agent-test"
	if requestedModel, ok := params["model"].(string); ok && requestedModel != "" {
		model = requestedModel
		assertFakeRestrictedDurableThreadResume(params)
	}
	response := fakeAgentThreadOperationResponse(thread, params, model)
	if threadID == "thread-restricted-response-drift" {
		response["sandbox"] = fakeAgentSandboxPolicy("workspace-write")
	}
	delete(state.unsubscribed, threadID)
	writeFakeAgentResponse(message["id"], response)
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
	assertFakeEmptyArray(params, "runtimeWorkspaceRoots")
	assertFakeEmptyArray(params, "selectedCapabilityRoots")
	config, ok := params["config"].(map[string]any)
	if !ok || config["web_search"] != "disabled" {
		panic("fresh structured thread must disable web search")
	}
	if config["project_doc_max_bytes"] != float64(0) {
		panic("fresh structured thread must disable workspace project instructions")
	}
	features, ok := config["features"].(map[string]any)
	if !ok || features["image_generation"] != false || features["plugins"] != false ||
		features["apps"] != false || features["multi_agent"] != false ||
		features["shell_snapshot"] != false || features["shell_tool"] != false ||
		features["tool_call_mcp_elicitation"] != false || features["unified_exec"] != false {
		panic("fresh structured thread must disable external capability features")
	}
	assertFakeRestrictedConfig(params, config)
}

func assertFakeRestrictedDurableThreadStart(params map[string]any) {
	if params["ephemeral"] != false {
		panic("restricted durable thread must not be ephemeral")
	}
	if params["historyMode"] != "legacy" {
		panic("restricted durable thread must retain provider history")
	}
	assertFakeRestrictedThreadPolicy(params)
	assertFakeEmptyArray(params, "dynamicTools")
	assertFakeEmptyArray(params, "environments")
	assertFakeEmptyArray(params, "runtimeWorkspaceRoots")
	assertFakeEmptyArray(params, "selectedCapabilityRoots")
}

func assertFakeRestrictedDurableThreadResume(params map[string]any) {
	assertFakeRestrictedThreadPolicy(params)
	assertFakeEmptyArray(params, "runtimeWorkspaceRoots")
}

func assertFakeRestrictedThreadPolicy(params map[string]any) {
	if params["approvalPolicy"] != "never" || params["sandbox"] != "read-only" {
		panic("restricted durable thread must be read-only with approvals disabled")
	}
	if _, ok := params["serviceTier"]; !ok {
		panic("restricted durable thread must explicitly pin or clear service tier")
	}
	if developer, _ := params["developerInstructions"].(string); !strings.Contains(developer, "Setta") {
		panic("restricted durable thread is missing Setta developer instructions")
	}
	config, ok := params["config"].(map[string]any)
	if !ok || config["web_search"] != "disabled" || config["project_doc_max_bytes"] != float64(0) {
		panic("restricted durable thread must disable external and project context")
	}
	if effort, ok := config["model_reasoning_effort"].(string); !ok || effort == "" {
		panic("restricted durable thread must pin reasoning effort")
	}
	assertFakeRestrictedConfig(params, config)
}

func assertFakeRestrictedConfig(params map[string]any, config map[string]any) {
	if base, _ := params["baseInstructions"].(string); base != restrictedThreadBaseInstructions {
		panic("restricted thread must replace configured base instructions")
	}
	orchestrator, ok := config["orchestrator"].(map[string]any)
	if !ok {
		panic("restricted thread must configure the Codex orchestrator")
	}
	for _, key := range []string{"mcp", "skills"} {
		value, ok := orchestrator[key].(map[string]any)
		if !ok || value["enabled"] != false {
			panic("restricted thread must disable orchestrator " + key)
		}
	}
	servers, ok := config["mcp_servers"].(map[string]any)
	if !ok {
		panic("restricted thread must configure effective MCP servers")
	}
	server, ok := servers["configured-test-server"].(map[string]any)
	if !ok || server["enabled"] != false {
		panic("restricted thread must disable every effective MCP server")
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
	if _, structured := params["outputSchema"]; structured {
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
	case "dynamic tool":
		state.requestCounter++
		requestID := fmt.Sprintf("dynamic-tool-%d", state.requestCounter)
		state.pendingDynamicTools[requestID] = fakePendingDynamicTool{
			threadID:    threadID,
			turnID:      turnID,
			wantSuccess: true,
		}
		writeFakeAgentRequest(requestID, "item/tool/call", map[string]any{
			"arguments": map[string]any{"answer": "ok"},
			"callId":    "call-" + turnID,
			"namespace": "setta",
			"threadId":  threadID,
			"tool":      "emit_artifact",
			"turnId":    turnID,
		})
	case "dynamic tool failure":
		state.requestCounter++
		requestID := fmt.Sprintf("dynamic-tool-%d", state.requestCounter)
		state.pendingDynamicTools[requestID] = fakePendingDynamicTool{
			threadID:    threadID,
			turnID:      turnID,
			wantSuccess: false,
		}
		writeFakeAgentRequest(requestID, "item/tool/call", map[string]any{
			"arguments": map[string]any{"answer": "bad"},
			"callId":    "call-" + turnID,
			"namespace": "setta",
			"threadId":  threadID,
			"tool":      "emit_artifact",
			"turnId":    turnID,
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
	case `{"mode":"tool-cleanup-fail"}`:
		state.heldTurns[turnID] = threadID
		state.cleanupFailureOnTurn[turnID] = true
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
	if state.cleanupFailureOnTurn[turnID] {
		delete(state.cleanupFailureOnTurn, turnID)
		writeFakeAgentError(message["id"], -32603, "scripted structured cleanup failure")
		return
	}
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
	if pending, ok := state.pendingDynamicTools[requestID]; ok {
		handleFakeDynamicToolResponse(state, requestID, pending, message)
		return
	}
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

func handleFakeDynamicToolResponse(
	state *fakeAgentServerState,
	requestID string,
	pending fakePendingDynamicTool,
	message map[string]any,
) {
	delete(state.pendingDynamicTools, requestID)
	result, ok := message["result"].(map[string]any)
	if !ok || result["success"] != pending.wantSuccess {
		panic("dynamic tool response has no successful result")
	}
	items, ok := result["contentItems"].([]any)
	if !ok || len(items) != 1 {
		panic("dynamic tool response content items drifted")
	}
	item, ok := items[0].(map[string]any)
	if !ok || item["type"] != "inputText" {
		panic("dynamic tool response item drifted")
	}
	if pending.wantSuccess && item["text"] != "dynamic tool acknowledged" {
		panic("dynamic tool response item drifted")
	}
	if !pending.wantSuccess {
		text := fmt.Sprint(item["text"])
		if !strings.Contains(text, "dynamic tool arguments drifted") {
			panic("dynamic tool failure response item drifted")
		}
		var failure map[string]any
		if err := json.Unmarshal([]byte(text), &failure); err != nil {
			panic("dynamic tool failure response was not structured JSON")
		}
		fieldErrors, ok := failure["fieldErrors"].([]any)
		if failure["code"] != "dynamic_tool_handler_failed" ||
			failure["retryable"] != true ||
			failure["diagnosticReference"] == "" ||
			!ok ||
			len(fieldErrors) != 0 {
			panic("dynamic tool failure response metadata drifted")
		}
	}
	writeFakeAgentTurnCompleted(pending.threadID, pending.turnID, "completed")
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

func fakeAgentThreadOperationResponse(
	thread map[string]any,
	params map[string]any,
	model string,
) map[string]any {
	approvalPolicy := any("on-request")
	if requested, ok := params["approvalPolicy"]; ok {
		approvalPolicy = requested
	}
	cwd := any("/tmp/setta-agent-fake")
	if requested, ok := params["cwd"]; ok {
		cwd = requested
	}
	reasoningEffort := any("high")
	if config, ok := params["config"].(map[string]any); ok {
		if requested, ok := config["model_reasoning_effort"].(string); ok {
			reasoningEffort = requested
		}
	}
	sandbox := any("workspace-write")
	if requested, ok := params["sandbox"]; ok {
		sandbox = fakeAgentSandboxPolicy(requested)
	}
	serviceTier := params["serviceTier"]
	if serviceTier == nil {
		serviceTier = codexDefaultServiceTier
	}
	return map[string]any{
		"approvalPolicy":        approvalPolicy,
		"approvalsReviewer":     "user",
		"cwd":                   cwd,
		"instructionSources":    []any{},
		"model":                 model,
		"modelProvider":         "fake",
		"reasoningEffort":       reasoningEffort,
		"runtimeWorkspaceRoots": params["runtimeWorkspaceRoots"],
		"sandbox":               sandbox,
		"serviceTier":           serviceTier,
		"thread":                thread,
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
