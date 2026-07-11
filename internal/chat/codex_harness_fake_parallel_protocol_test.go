package chat

import (
	"fmt"
	"strings"
)

func fakeParallelAssignThread(mode string, state *fakeCodexState, message map[string]any) bool {
	if mode != "parallel-turns" {
		return false
	}
	params := fakeParams(message)
	switch message["method"] {
	case "thread/start":
		state.parallelThreadSeq++
		state.currentThreadID = fmt.Sprintf("thread_parallel_%d", state.parallelThreadSeq)
	case "thread/resume":
		threadID, ok := params["threadId"].(string)
		if !ok || threadID == "" {
			panic("parallel thread/resume missing threadId")
		}
		state.currentThreadID = threadID
	default:
		panic("parallel mode used unsupported thread method")
	}
	return true
}

func handleFakeParallelTurnStartMode(mode string, message map[string]any) (bool, bool) {
	if mode != "parallel-turns" {
		return false, false
	}
	params := fakeParams(message)
	threadID, ok := params["threadId"].(string)
	if !ok || threadID == "" {
		panic("parallel turn/start missing threadId")
	}
	turnID := fakeParallelTurnID(threadID)
	prompt := fakeTurnInputText(message)
	writeFakeTurnStartedForThread(threadID, turnID)
	switch {
	case strings.Contains(prompt, "stall"):
		writeFakeAssistantDeltaForThreadAndTurn(threadID, turnID, "item_"+turnID+"_stall", "stalling "+threadID+" ")
	case strings.Contains(prompt, "wait-steer"):
		writeFakeAssistantDeltaForThreadAndTurn(threadID, turnID, "item_"+turnID+"_waiting", "waiting "+threadID+" ")
	default:
		writeFakeStandaloneProcessNoise(threadID)
		writeFakeParallelCommandLifecycle(threadID, turnID)
		writeFakeAssistantDeltaForThreadAndTurn(threadID, turnID, "item_"+turnID+"_assistant", "done "+threadID)
		writeFakeCompletedTurnForThreadAndTurn(threadID, turnID, "completed")
	}
	return true, false
}

func handleFakeParallelTurnSteer(message map[string]any) bool {
	params := fakeParams(message)
	threadID, ok := params["threadId"].(string)
	if !ok || threadID == "" {
		panic("parallel turn/steer missing threadId")
	}
	turnID, ok := params["expectedTurnId"].(string)
	if !ok || turnID == "" {
		panic("parallel turn/steer missing expectedTurnId")
	}
	writeFakeResponse(message["id"], map[string]any{})
	writeFakeAssistantDeltaForThreadAndTurn(threadID, turnID, "item_"+turnID+"_steered", "steered "+threadID)
	writeFakeCompletedTurnForThreadAndTurn(threadID, turnID, "completed")
	return false
}

func handleFakeParallelTurnInterrupt(message map[string]any) bool {
	params := fakeParams(message)
	threadID, ok := params["threadId"].(string)
	if !ok || threadID == "" {
		panic("parallel turn/interrupt missing threadId")
	}
	turnID, ok := params["turnId"].(string)
	if !ok || turnID == "" {
		panic("parallel turn/interrupt missing turnId")
	}
	writeFakeResponse(message["id"], map[string]any{})
	writeFakeCompletedTurnForThreadAndTurn(threadID, turnID, "interrupted")
	return false
}

func fakeParallelTurnID(threadID string) string {
	return "turn_" + strings.TrimPrefix(threadID, "thread_")
}

func writeFakeStandaloneProcessNoise(threadID string) {
	processID := "standalone_" + threadID
	writeFakeNotification("command/exec/outputDelta", map[string]any{
		"capReached":  false,
		"deltaBase64": "c3RhbmRhbG9uZSBjbWQK",
		"processId":   processID + "_command",
		"stream":      "stdout",
	})
	writeFakeNotification("process/outputDelta", map[string]any{
		"capReached":    false,
		"deltaBase64":   "c3RhbmRhbG9uZSBwcm9jZXNzCg==",
		"processHandle": processID + "_process",
		"stream":        "stderr",
	})
}
