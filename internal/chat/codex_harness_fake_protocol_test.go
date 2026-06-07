package chat

import (
	"encoding/json"
	"os"
	"strings"
	"time"

	"setta/internal/codexapp"
)

func writeFakeInitializeResponse(id any) {
	writeFakeResponse(id, map[string]any{
		"codexHome":      "/tmp/codex",
		"platformFamily": "unix",
		"platformOs":     "test",
		"userAgent":      "fake",
	})
}

func startTestJSONRPCClient(config CodexHarnessConfig) (*codexapp.Client, error) {
	return codexapp.StartProcess(codexapp.ProcessConfig{
		Command: config.Command,
		Args:    config.Args,
		Env:     config.Env,
	})
}

func writeFakeThreadResponse(id any, model string, effort ReasoningEffort) {
	writeFakeResponse(id, fakeCodexThreadResponse(model, effort))
}

func fakeCodexThreadResponse(model string, effort ReasoningEffort) map[string]any {
	return map[string]any{
		"approvalPolicy":    "on-request",
		"approvalsReviewer": "user",
		"cwd":               "/tmp/setta-fake",
		"model":             model,
		"modelProvider":     "fake",
		"reasoningEffort":   string(effort),
		"sandbox":           "workspace-write",
		"thread":            fakeCodexThread(),
	}
}

func fakeCodexThread() map[string]any {
	return map[string]any{
		"cliVersion":    "fake",
		"createdAt":     1,
		"cwd":           "/tmp/setta-fake",
		"ephemeral":     true,
		"id":            "thread_fake",
		"modelProvider": "fake",
		"preview":       "",
		"sessionId":     "session_fake",
		"source":        "user",
		"status":        map[string]any{"type": "idle"},
		"turns":         []any{},
		"updatedAt":     1,
	}
}

func fakeCodexTurn(status string) map[string]any {
	return map[string]any{
		"id":     "turn_fake",
		"items":  []any{},
		"status": status,
	}
}

func fakeCodexThreadSettings(model string, effort ReasoningEffort) map[string]any {
	return map[string]any{
		"approvalPolicy":    "on-request",
		"approvalsReviewer": "user",
		"collaborationMode": map[string]any{
			"mode": "default",
			"settings": map[string]any{
				"model": model,
			},
		},
		"cwd":           "/tmp/setta-fake",
		"effort":        string(effort),
		"model":         model,
		"modelProvider": "fake",
		"sandboxPolicy": "workspace-write",
	}
}

func writeFakeStreamTurn() {
	writeFakeAssistantDelta("hello ")
	writeFakeAssistantDelta("from codex")
	writeFakeCompletedTurn("completed")
}

func writeFakeTurnStartedID(turnID string) {
	writeFakeNotification("turn/started", map[string]any{
		"threadId": "thread_fake",
		"turnId":   turnID,
	})
}

func writeFakeRemoteControlStatus(status string) {
	writeFakeNotification("remoteControl/status/changed", map[string]any{
		"environmentId":  nil,
		"installationId": "installation_fake",
		"serverName":     "fake.local",
		"status":         status,
	})
}

func writeFakeMCPServerStartupStatus(name string, status string, errorMessage any) {
	writeFakeNotification("mcpServer/startupStatus/updated", map[string]any{
		"error":  errorMessage,
		"name":   name,
		"status": status,
	})
}

func writeFakeReasoningSummaryArrayItem() {
	writeFakeNotification("item/completed", map[string]any{
		"completedAtMs": 1,
		"item": map[string]any{
			"content": []string{},
			"id":      "reasoning_summary_array_fake",
			"summary": []string{"checked context", "answered directly"},
			"type":    "reasoning",
		},
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
}

func writeFakeEmptyAgentMessageItem() {
	writeFakeNotification("item/started", map[string]any{
		"startedAtMs": 1,
		"item": map[string]any{
			"id":   "agent_message_empty_fake",
			"text": "",
			"type": "agentMessage",
		},
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
}

func writeFakeAccountRateLimits() {
	writeFakeNotification("account/rateLimits/updated", map[string]any{
		"rateLimits": map[string]any{
			"credits":              nil,
			"limitId":              "codex",
			"limitName":            "Codex",
			"planType":             "pro",
			"primary":              map[string]any{"resetsAt": nil, "usedPercent": 1, "windowDurationMins": 300},
			"rateLimitReachedType": nil,
			"secondary":            nil,
		},
	})
}

func writeFakeThreadGoalCleared() {
	writeFakeNotification("thread/goal/cleared", map[string]any{
		"threadId": "thread_fake",
	})
}

func writeFakeThreadStarted() {
	writeFakeNotification("thread/started", map[string]any{
		"thread": fakeCodexThread(),
	})
}

func writeFakeThreadStatusChanged(statusType string) {
	status := map[string]any{
		"type": statusType,
	}
	if statusType == "active" {
		status["activeFlags"] = []string{}
	}
	writeFakeNotification("thread/status/changed", map[string]any{
		"status":   status,
		"threadId": "thread_fake",
	})
}

func writeFakeThreadTokenUsage() {
	breakdown := map[string]any{
		"cachedInputTokens":     0,
		"inputTokens":           1,
		"outputTokens":          2,
		"reasoningOutputTokens": 0,
		"totalTokens":           3,
	}
	writeFakeNotification("thread/tokenUsage/updated", map[string]any{
		"threadId": "thread_fake",
		"tokenUsage": map[string]any{
			"last":               breakdown,
			"modelContextWindow": nil,
			"total":              breakdown,
		},
		"turnId": "turn_fake",
	})
}

func writeFakeUserMessageItem() {
	writeFakeNotification("item/started", map[string]any{
		"startedAtMs": 1,
		"item": map[string]any{
			"content": []any{map[string]any{
				"text": "hello",
				"type": "text",
			}},
			"id":   "user_message_fake",
			"type": "userMessage",
		},
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
}

func writeFakeErrorNotification(message string, willRetry bool) {
	writeFakeNotification("error", map[string]any{
		"error": map[string]any{
			"additionalDetails": nil,
			"codexErrorInfo":    nil,
			"message":           message,
		},
		"threadId":  "thread_fake",
		"turnId":    "turn_fake",
		"willRetry": willRetry,
	})
}

func writeFakeFailedTurn() {
	writeFakeNotification("turn/completed", map[string]any{
		"threadId": "thread_fake",
		"turn": map[string]any{
			"error":  map[string]any{"message": "model failed"},
			"id":     "turn_fake",
			"items":  []any{},
			"status": "failed",
		},
	})
}

func writeFakeActivityTurn() {
	writeFakeNotification("turn/started", map[string]any{
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/reasoning/summaryPartAdded", map[string]any{
		"itemId":   "reasoning_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/reasoning/summaryTextDelta", map[string]any{
		"delta":        "checked plan",
		"itemId":       "reasoning_fake",
		"summaryIndex": 0,
		"threadId":     "thread_fake",
		"turnId":       "turn_fake",
	})
	writeFakeNotification("item/started", map[string]any{
		"startedAtMs": 1,
		"threadId":    "thread_fake",
		"turnId":      "turn_fake",
		"item": map[string]any{
			"id":      "command_fake",
			"type":    "commandExecution",
			"command": "go test ./...",
			"cwd":     "/tmp/workspace",
			"status":  "inProgress",
		},
	})
	writeFakeNotification("item/commandExecution/outputDelta", map[string]any{
		"delta":    "ok\n",
		"itemId":   "command_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/fileChange/patchUpdated", map[string]any{
		"changedPaths": []string{"/tmp/workspace/main.go"},
		"itemId":       "file_fake",
		"status":       "updated",
		"threadId":     "thread_fake",
		"turnId":       "turn_fake",
	})
	writeFakeNotification("item/mcpToolCall/progress", map[string]any{
		"itemId":   "mcp_fake",
		"progress": "halfway",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("warning", map[string]any{
		"message":  "watch out",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/completed", map[string]any{
		"completedAtMs": 1,
		"threadId":      "thread_fake",
		"turnId":        "turn_fake",
		"item": map[string]any{
			"durationMs": 42,
			"exitCode":   0,
			"id":         "command_fake",
			"type":       "commandExecution",
			"command":    "go test ./...",
			"cwd":        "/tmp/workspace",
			"status":     "completed",
		},
	})
	writeFakeCompletedTurn("completed")
}

func writeFakeEmptyDeltaTurn() {
	writeFakeNotification("turn/started", map[string]any{
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/agentMessage/delta", map[string]any{
		"delta":    "",
		"itemId":   "item_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/plan/delta", map[string]any{
		"delta":    "",
		"itemId":   "plan_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/reasoning/summaryTextDelta", map[string]any{
		"delta":        "",
		"itemId":       "reasoning_fake",
		"summaryIndex": 0,
		"threadId":     "thread_fake",
		"turnId":       "turn_fake",
	})
	writeFakeNotification("item/reasoning/textDelta", map[string]any{
		"contentIndex": 0,
		"delta":        "",
		"itemId":       "reasoning_text_fake",
		"threadId":     "thread_fake",
		"turnId":       "turn_fake",
	})
	writeFakeNotification("item/commandExecution/outputDelta", map[string]any{
		"delta":    "",
		"itemId":   "command_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeAssistantDelta("after empty")
	writeFakeCompletedTurn("completed")
}

func writeFakeEmptyBase64OutputDeltaTurn() {
	writeFakeNotification("command/exec/outputDelta", map[string]any{
		"capReached":  false,
		"deltaBase64": "",
		"processId":   "command_process_fake",
		"stream":      "stdout",
	})
	writeFakeNotification("process/outputDelta", map[string]any{
		"capReached":    false,
		"deltaBase64":   "",
		"processHandle": "process_fake",
		"stream":        "stderr",
	})
	writeFakeAssistantDelta("after empty outputs")
	writeFakeCompletedTurn("completed")
}

func writeFakeUnsupportedOutputStreamTurn() {
	writeFakeNotification("command/exec/outputDelta", map[string]any{
		"capReached":  false,
		"deltaBase64": "b2sK",
		"processId":   "command_process_fake",
		"stream":      "stdlog",
	})
	time.Sleep(2 * time.Second)
}

func writeFakeProtocolCoverageNotifications() {
	writeFakeNotification("account/login/completed", map[string]any{"error": nil, "loginId": "login_fake", "success": true})
	writeFakeNotification("app/list/updated", map[string]any{"data": []any{}})
	writeFakeNotification("command/exec/outputDelta", map[string]any{
		"capReached":  false,
		"deltaBase64": "Y21kIG91dAo=",
		"processId":   "command_process_fake",
		"stream":      "stdout",
	})
	writeFakeNotification("deprecationNotice", map[string]any{
		"details": "Use the replacement protocol surface.",
		"summary": "Legacy protocol notice.",
	})
	writeFakeNotification("externalAgentConfig/import/completed", map[string]any{})
	writeFakeNotification("fs/changed", map[string]any{"changedPaths": []string{"/tmp/workspace/main.go"}, "watchId": "watch_fake"})
	writeFakeNotification("fuzzyFileSearch/sessionUpdated", map[string]any{"files": []any{}, "query": "main", "sessionId": "fuzzy_fake"})
	writeFakeNotification("fuzzyFileSearch/sessionCompleted", map[string]any{"sessionId": "fuzzy_fake"})
	writeFakeNotification("hook/started", map[string]any{
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
		"run": map[string]any{
			"completedAt":   nil,
			"displayOrder":  1,
			"durationMs":    nil,
			"entries":       []any{},
			"eventName":     "preToolUse",
			"executionMode": "auto",
			"handlerType":   "command",
			"id":            "hook_fake",
			"scope":         "workspace",
			"source":        "project",
			"sourcePath":    "/tmp/workspace/.codex/hooks.json",
			"startedAt":     1,
			"status":        "running",
			"statusMessage": nil,
		},
	})
	writeFakeNotification("hook/completed", map[string]any{
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
		"run": map[string]any{
			"completedAt":   2,
			"displayOrder":  1,
			"durationMs":    1,
			"entries":       []any{map[string]any{"kind": "stdout", "text": "ok"}},
			"eventName":     "preToolUse",
			"executionMode": "auto",
			"handlerType":   "command",
			"id":            "hook_fake",
			"scope":         "workspace",
			"source":        "project",
			"sourcePath":    "/tmp/workspace/.codex/hooks.json",
			"startedAt":     1,
			"status":        "completed",
			"statusMessage": "ok",
		},
	})
	writeFakeAutoApprovalReview("item/autoApprovalReview/started", "inProgress")
	writeFakeAutoApprovalReview("item/autoApprovalReview/completed", "approved")
	writeFakeContextCompaction("item/started", "context_compaction_fake")
	writeFakeContextCompaction("item/completed", "context_compaction_fake")
	writeFakeNotification("item/fileChange/patchUpdated", map[string]any{
		"changedPaths": []string{"/tmp/workspace/main.go"},
		"itemId":       "file_fake",
		"status":       "updated",
		"threadId":     "thread_fake",
		"turnId":       "turn_fake",
	})
	writeFakeNotification("item/reasoning/textDelta", map[string]any{
		"contentIndex": 0,
		"delta":        "private reasoning",
		"itemId":       "reasoning_text_fake",
		"threadId":     "thread_fake",
		"turnId":       "turn_fake",
	})
	writeFakeNotification("mcpServer/oauthLogin/completed", map[string]any{"name": "github", "success": true})
	writeFakeNotification("model/verification", map[string]any{
		"threadId":      "thread_fake",
		"turnId":        "turn_fake",
		"verifications": []string{"trustedAccessForCyber"},
	})
	writeFakeNotification("process/outputDelta", map[string]any{
		"capReached":    false,
		"deltaBase64":   "cHJvY2VzcyBvdXQK",
		"processHandle": "process_fake",
		"stream":        "stdout",
	})
	writeFakeNotification("process/exited", map[string]any{
		"exitCode":         0,
		"processHandle":    "process_fake",
		"stderr":           "",
		"stderrCapReached": false,
		"stdout":           "",
		"stdoutCapReached": false,
	})
	writeFakeNotification("serverRequest/resolved", map[string]any{"requestId": "unknown_request", "threadId": "thread_fake"})
	writeFakeNotification("skills/changed", map[string]any{})
	writeFakeRealtimeNotifications()
	writeFakeNotification("windows/worldWritableWarning", map[string]any{
		"extraCount":  1,
		"failedScan":  false,
		"samplePaths": []string{"C:\\tmp"},
	})
	writeFakeNotification("windowsSandbox/setupCompleted", map[string]any{"error": nil, "mode": "unelevated", "success": true})
	writeFakeAssistantDelta("coverage complete")
	writeFakeCompletedTurn("completed")
}

func writeFakeAutoApprovalReview(method string, status string) {
	writeFakeNotification(method, map[string]any{
		"action": map[string]any{
			"command": "go test ./...",
			"cwd":     "/tmp/workspace",
			"source":  "agent",
			"type":    "command",
		},
		"completedAtMs":  2,
		"decisionSource": "agent",
		"review": map[string]any{
			"rationale":         "safe",
			"riskLevel":         "low",
			"status":            status,
			"userAuthorization": "low",
		},
		"reviewId":     "review_fake",
		"startedAtMs":  1,
		"targetItemId": "command_fake",
		"threadId":     "thread_fake",
		"turnId":       "turn_fake",
	})
}

func writeFakeContextCompaction(method string, itemID string) {
	payload := map[string]any{
		"item": map[string]any{
			"id":   itemID,
			"type": "contextCompaction",
		},
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	}
	switch method {
	case "item/started":
		payload["startedAtMs"] = 1
	case "item/completed":
		payload["completedAtMs"] = 2
	}
	writeFakeNotification(method, payload)
}

func writeFakeRealtimeNotifications() {
	writeFakeNotification("thread/realtime/started", map[string]any{"realtimeSessionId": "realtime_fake", "threadId": "thread_fake", "version": 1})
	writeFakeNotification("thread/realtime/itemAdded", map[string]any{"item": map[string]any{"id": "item_fake"}, "threadId": "thread_fake"})
	writeFakeNotification("thread/realtime/transcript/delta", map[string]any{"delta": "hi", "role": "user", "threadId": "thread_fake"})
	writeFakeNotification("thread/realtime/transcript/done", map[string]any{"role": "user", "text": "hi", "threadId": "thread_fake"})
	writeFakeNotification("thread/realtime/outputAudio/delta", map[string]any{"audio": map[string]any{"data": "AAAA"}, "threadId": "thread_fake"})
	writeFakeNotification("thread/realtime/sdp", map[string]any{"sdp": "v=0", "threadId": "thread_fake"})
	writeFakeNotification("thread/realtime/error", map[string]any{"message": "disabled", "threadId": "thread_fake"})
	writeFakeNotification("thread/realtime/closed", map[string]any{"reason": nil, "threadId": "thread_fake"})
}

func writeFakeApprovalRequest(mode string) {
	switch mode {
	case "approval":
		writeFakeCommandApprovalRequest()
	case "permission":
		writeFakePermissionApprovalRequest()
	case "user-input":
		writeFakeUserInputApprovalRequest()
	}
}

func writeFakeMCPElicitationRequest(mode string) {
	switch mode {
	case "mcp-elicitation-form", "mcp-elicitation-form-cancel":
		writeFakeServerRequest("elicitation-1", "mcpServer/elicitation/request", map[string]any{
			"_meta":      map[string]any{"source": "fake"},
			"message":    "Choose deploy target",
			"mode":       "form",
			"serverName": "deploy",
			"threadId":   "thread_fake",
			"turnId":     "turn_fake",
			"requestedSchema": map[string]any{
				"type":     "object",
				"required": []string{"target", "confirm"},
				"properties": map[string]any{
					"target": map[string]any{
						"type": "string",
						"oneOf": []map[string]any{
							{"const": "staging", "title": "Staging"},
							{"const": "production", "title": "Production"},
						},
						"title": "Target",
					},
					"confirm": map[string]any{
						"type":  "boolean",
						"title": "Confirm",
					},
				},
			},
		})
	case "mcp-elicitation-url-decline":
		writeFakeServerRequest("elicitation-1", "mcpServer/elicitation/request", map[string]any{
			"_meta":         nil,
			"elicitationId": "elicitation_fake",
			"message":       "Open login",
			"mode":          "url",
			"serverName":    "deploy",
			"threadId":      "thread_fake",
			"turnId":        nil,
			"url":           "https://example.test/login",
		})
	}
}

func writeFakeImmediateServerRequest(mode string, state *fakeCodexState) {
	state.responseOutstanding = mode
	switch mode {
	case "dynamic-tool-unknown":
		writeFakeDynamicToolRequest("missingTool")
	case "dynamic-tool-registered":
		writeFakeDynamicToolRequest("fakeTool")
	case "attestation-unavailable", "attestation-provider":
		writeFakeServerRequest("attestation-1", "attestation/generate", map[string]any{})
	}
}

func writeFakeDynamicToolRequest(tool string) {
	writeFakeServerRequest("tool-1", "item/tool/call", map[string]any{
		"arguments": map[string]any{"value": "from codex"},
		"callId":    "tool_call_fake",
		"namespace": "setta",
		"threadId":  "thread_fake",
		"tool":      tool,
		"turnId":    "turn_fake",
	})
}

func writeFakeCommandApprovalRequest() {
	writeFakeServerRequest("approval-1", "item/commandExecution/requestApproval", map[string]any{
		"command":     "go test ./...",
		"itemId":      "item_fake",
		"startedAtMs": 0,
		"threadId":    "thread_fake",
		"turnId":      "turn_fake",
	})
}

func writeFakePermissionApprovalRequest() {
	writeFakeServerRequest("approval-1", "item/permissions/requestApproval", map[string]any{
		"cwd":         "/tmp/workspace",
		"itemId":      "item_fake",
		"permissions": map[string]any{"network": map[string]any{"enabled": true}},
		"reason":      "Need network access",
		"startedAtMs": 0,
		"threadId":    "thread_fake",
		"turnId":      "turn_fake",
	})
}

func writeFakeUserInputApprovalRequest() {
	writeFakeServerRequest("approval-1", "item/tool/requestUserInput", map[string]any{
		"itemId": "item_fake",
		"questions": []map[string]any{
			{
				"header":   "Branch",
				"id":       "branch",
				"options":  []map[string]any{{"description": "Use main", "label": "main"}},
				"question": "Which branch?",
			},
			{
				"header":   "Mode",
				"id":       "mode",
				"options":  []map[string]any{{"description": "Fast mode", "label": "fast"}},
				"question": "Which mode?",
			},
		},
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
}

func writeFakeMalformedApproval() {
	writeFakeServerRequest("approval-1", "item/commandExecution/requestApproval", map[string]any{
		"itemId":   "item_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	time.Sleep(2 * time.Second)
}

func writeFakeMalformedDelta() {
	writeFakeNotification("item/agentMessage/delta", map[string]any{
		"delta":    12,
		"itemId":   "item_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	time.Sleep(2 * time.Second)
}

func writeFakeUnsupportedRequest() {
	writeFakeServerRequest("request-unsupported", "item/unknown/requestApproval", map[string]any{
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	time.Sleep(2 * time.Second)
}

func writeFakeAssistantDelta(delta string) {
	writeFakeNotification("item/agentMessage/delta", map[string]any{
		"delta":    delta,
		"itemId":   "item_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
}

func writeFakeCompletedTurn(status string) {
	writeFakeNotification("turn/completed", map[string]any{
		"threadId": "thread_fake",
		"turn":     fakeCodexTurn(status),
	})
}

func assertFakeSteer(message map[string]any) {
	params := fakeParams(message)
	if params["threadId"] != "thread_fake" || params["expectedTurnId"] != "turn_fake" {
		panic("steer targeted wrong turn")
	}
	input, ok := params["input"].([]any)
	if !ok || len(input) != 1 {
		panic("steer missing input")
	}
	first, ok := input[0].(map[string]any)
	if !ok || first["text"] != "adjust course" || first["type"] != "text" {
		panic("steer input mismatch")
	}
}

func fakeParams(message map[string]any) map[string]any {
	params, ok := message["params"].(map[string]any)
	if !ok {
		panic("message missing params")
	}
	return params
}

func assertFakeThreadID(message map[string]any) {
	params := fakeParams(message)
	if params["threadId"] != "thread_fake" {
		panic("command targeted wrong thread")
	}
}

func assertFakeDynamicToolsThreadParams(mode string, message map[string]any) {
	switch mode {
	case "dynamic-tools-thread-start":
		if message["method"] != "thread/start" {
			panic("dynamic tools start test should start a thread")
		}
		params := fakeParams(message)
		assertFakeCodexDeveloperInstructions(params)
		tools, ok := params["dynamicTools"].([]any)
		if !ok || len(tools) != 2 {
			panic("thread/start missing dynamic tools")
		}
		visible := fakeDynamicToolByName(tools, "workspace_context")
		if visible == nil {
			panic("workspace_context dynamic tool missing")
		}
		if visible["namespace"] != "setta" || visible["deferLoading"] != nil {
			panic("workspace_context dynamic tool exposure mismatch")
		}
		schema, ok := visible["inputSchema"].(map[string]any)
		if !ok || schema["type"] != "object" {
			panic("workspace_context dynamic tool schema mismatch")
		}
		deferred := fakeDynamicToolByName(tools, "workspace_archive")
		if deferred == nil {
			panic("workspace_archive dynamic tool missing")
		}
		if deferred["namespace"] != "setta" || deferred["deferLoading"] != true {
			panic("workspace_archive dynamic tool exposure mismatch")
		}
	case "dynamic-tools-thread-resume":
		if message["method"] != "thread/resume" {
			panic("dynamic tools resume test should resume a thread")
		}
		params := fakeParams(message)
		if _, ok := params["dynamicTools"]; ok {
			panic("thread/resume should not include dynamicTools")
		}
	}
}

func assertFakeCodexDeveloperInstructions(params map[string]any) {
	instructions, ok := params["developerInstructions"].(string)
	if !ok || instructions == "" {
		panic("thread/start missing developer instructions")
	}
	if !strings.Contains(instructions, "available dynamic tool") ||
		!strings.Contains(instructions, "Do not invent dynamic tool names") {
		panic("thread/start developer instructions missing Setta dynamic tool guidance")
	}
}

func fakeDynamicToolByName(tools []any, name string) map[string]any {
	for _, raw := range tools {
		tool, ok := raw.(map[string]any)
		if ok && tool["name"] == name {
			return tool
		}
	}
	return nil
}

func assertFakePermissionApproval(message map[string]any) {
	result, ok := message["result"].(map[string]any)
	if !ok {
		panic("permission approval missing result")
	}
	permissions, ok := result["permissions"].(map[string]any)
	if !ok {
		panic("permission approval missing permissions")
	}
	network, ok := permissions["network"].(map[string]any)
	if !ok || network["enabled"] != true {
		panic("permission approval did not echo requested network permission")
	}
}

func assertFakeUserInputApproval(message map[string]any) {
	result, ok := message["result"].(map[string]any)
	if !ok {
		panic("user input approval missing result")
	}
	answers, ok := result["answers"].(map[string]any)
	if !ok {
		panic("user input approval missing answers")
	}
	assertFakeAnswer(answers, "branch", "main")
	assertFakeAnswer(answers, "mode", "fast")
}

func assertFakeMCPElicitationResponse(message map[string]any, expectedAction string, expectedContent map[string]any) {
	result, ok := message["result"].(map[string]any)
	if !ok {
		panic("mcp elicitation response missing result")
	}
	if result["action"] != expectedAction {
		panic("mcp elicitation action mismatch")
	}
	if expectedContent == nil {
		if result["content"] != nil {
			panic("mcp elicitation content should be null")
		}
		return
	}
	content, ok := result["content"].(map[string]any)
	if !ok {
		panic("mcp elicitation content missing")
	}
	for key, expected := range expectedContent {
		if content[key] != expected {
			panic("mcp elicitation content mismatch for " + key)
		}
	}
	meta, ok := result["_meta"].(map[string]any)
	if !ok || meta["source"] != "fake" {
		panic("mcp elicitation meta mismatch")
	}
}

func assertFakeErrorResponse(message map[string]any, expectedCode int, expectedMessage string) {
	errorObject, ok := message["error"].(map[string]any)
	if !ok {
		panic("expected json-rpc error response")
	}
	code, ok := errorObject["code"].(float64)
	if !ok || int(code) != expectedCode {
		panic("json-rpc error code mismatch")
	}
	messageText, ok := errorObject["message"].(string)
	if !ok || !strings.Contains(messageText, expectedMessage) {
		panic("json-rpc error message mismatch")
	}
}

func assertFakeDynamicToolResponse(message map[string]any) {
	result, ok := message["result"].(map[string]any)
	if !ok {
		panic("dynamic tool response missing result")
	}
	if result["success"] != true {
		panic("dynamic tool response success mismatch")
	}
	contentItems, ok := result["contentItems"].([]any)
	if !ok || len(contentItems) != 1 {
		panic("dynamic tool response content item missing")
	}
	first, ok := contentItems[0].(map[string]any)
	if !ok || first["type"] != "inputText" || first["text"] != "tool ok" {
		panic("dynamic tool response content item mismatch")
	}
}

func assertFakeAttestationResponse(message map[string]any) {
	result, ok := message["result"].(map[string]any)
	if !ok || result["token"] != "token_fake" {
		panic("attestation response token mismatch")
	}
}

func assertFakeAnswer(answers map[string]any, questionID string, expected string) {
	raw, ok := answers[questionID].(map[string]any)
	if !ok {
		panic("missing answer for " + questionID)
	}
	values, ok := raw["answers"].([]any)
	if !ok || len(values) != 1 || values[0] != expected {
		panic("unexpected answer for " + questionID)
	}
}

func writeFakeResponse(id any, result any) {
	writeFake(map[string]any{"id": id, "result": result})
}

func writeFakeErrorResponse(id any, code int, message string) {
	writeFake(map[string]any{"id": id, "error": map[string]any{"code": code, "message": message}})
}

func writeFakeNotification(method string, params any) {
	writeFake(map[string]any{"method": method, "params": params})
}

func writeFakeServerRequest(id any, method string, params any) {
	writeFake(map[string]any{"id": id, "method": method, "params": params})
}

func writeFake(payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	_, _ = os.Stdout.Write(append(data, '\n'))
}
