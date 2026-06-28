package chat

func handleFakeGoalGet(mode string, message map[string]any) bool {
	assertFakeThreadID(message)
	switch mode {
	case "command-goal-edit":
		writeFakeGoalResponse(message["id"], "finish renderer tests", "active")
		return true
	case "goal-operation-set-preserves-old", "goal-operation-resume":
		writeFakeGoalResponse(message["id"], "existing provider goal", "active")
		return false
	}
	writeFakeResponse(message["id"], map[string]any{"goal": nil})
	return fakeCommandDone(mode)
}

func handleFakeGoalSetMethod(mode string, state *fakeCodexState, message map[string]any) bool {
	assertFakeGoalSet(mode, message)
	params := fakeParams(message)
	if mode == "goal-operation-resume" {
		assertFakeGoalResumeSet(params)
	}
	if handled, done := handleFakeGoalOperationPauseSet(mode, state, message, params); handled {
		return done
	}
	if mode == "goal-operation-set-preserves-old" && !state.goalCleared {
		writeFakeGoalResponse(message["id"], "existing provider goal", "active")
		return false
	}
	if fakeGoalOperationMode(mode) {
		return handleFakeGoalOperationSetMethod(mode, message, params)
	}
	writeFakeGoalResponse(message["id"], "finish renderer tests", "active")
	if mode == "command-goal-continuation" {
		writeFakeThreadGoalUpdated("finish renderer tests", "active")
		writeFakeTurnStartedID("turn_fake")
		writeFakeAssistantDelta("goal continuation")
		writeFakeThreadGoalUpdated("finish renderer tests", "complete")
		writeFakeCompletedTurn("completed")
		return true
	}
	return fakeCommandDone(mode)
}

func handleFakeGoalOperationPauseSet(mode string, state *fakeCodexState, message map[string]any, params map[string]any) (bool, bool) {
	if params["status"] != "paused" {
		return false, false
	}
	switch mode {
	case "goal-operation-cancel":
		state.goalPaused = true
		writeFakeGoalResponse(message["id"], "finish renderer tests", "paused")
		writeFakeThreadGoalUpdated("finish renderer tests", "paused")
		return true, false
	case "goal-operation-set-invalid-response":
		state.goalPaused = true
		writeFakeGoalResponse(message["id"], "finish renderer tests", "paused")
		return true, true
	default:
		return false, false
	}
}

func handleFakeGoalOperationSetMethod(mode string, message map[string]any, params map[string]any) bool {
	objective := fakeGoalOperationObjective(mode, params)
	if handled, done := handleFakeGoalOperationPreResponseSet(mode, message, objective); handled {
		return done
	}
	if fakeGoalOperationStartsBackgroundTerminal(mode) {
		writeFakeGoalOperationMultiTurn(mode, objective)
		writeFakeGoalResponse(message["id"], objective, "active")
		return true
	}
	writeFakeGoalResponse(message["id"], objective, "active")
	return handleFakeGoalOperationPostResponseEvents(mode, objective)
}

func handleFakeGoalOperationPreResponseSet(mode string, message map[string]any, objective string) (bool, bool) {
	switch mode {
	case "goal-operation-set-invalid-response":
		writeFakeResponse(message["id"], map[string]any{"goal": map[string]any{}})
		return true, false
	case "goal-operation-pre-sink-buffer":
		writeFakeGoalOperationPreSinkBuffer(objective)
		writeFakeGoalResponse(message["id"], objective, "active")
		return true, true
	case "goal-operation-pre-sink-overflow":
		writeFakeGoalOperationPreSinkOverflow(objective)
		writeFakeGoalResponse(message["id"], objective, "active")
		return true, true
	default:
		return false, false
	}
}

func handleFakeGoalOperationPostResponseEvents(mode string, objective string) bool {
	switch mode {
	case "goal-operation-no-runtime-turn",
		"goal-operation-busy-thread",
		"goal-operation-ephemeral-thread",
		"goal-operation-missing-path-thread":
		return false
	case "goal-operation-exit-before-runtime-turn":
		return true
	case "goal-operation-cancel":
		writeFakeThreadGoalUpdated(objective, "active")
		writeFakeTurnStartedForThread("thread_fake", "turn_goal_cancel")
		writeFakeAssistantDeltaForTurn("turn_goal_cancel", "item_goal_cancel", "goal cancellation waiting. ")
		return false
	case "goal-operation-clear-during-turn":
		writeFakeGoalOperationClearDuringTurn(objective)
		return true
	case "goal-operation-session-failure-after-start":
		writeFakeGoalOperationSessionFailureAfterStart(objective)
		return true
	case "goal-operation-interrupted-completion":
		writeFakeGoalOperationSingleTurnCompletion(objective, "interrupted")
		return true
	case "goal-operation-failed-completion":
		writeFakeGoalOperationSingleTurnCompletion(objective, "failed")
		return true
	case "goal-operation-idle-gap":
		writeFakeGoalOperationMultiTurn(mode, objective)
		return false
	default:
		writeFakeGoalOperationMultiTurn(mode, objective)
		return true
	}
}

func assertFakeGoalResumeSet(params map[string]any) {
	if _, ok := params["objective"]; ok {
		panic("goal resume should not replace the provider objective")
	}
	if params["status"] != "active" {
		panic("goal resume should set active status")
	}
}

func fakeGoalOperationObjective(mode string, params map[string]any) string {
	objective := "finish renderer tests"
	if mode == "goal-operation-resume" {
		objective = "existing provider goal"
	}
	if value, ok := params["objective"].(string); ok && value != "" {
		objective = value
	}
	return objective
}

func handleFakeModelList(mode string, state *fakeCodexState, message map[string]any) bool {
	assertFakeModelList(message)
	if mode == "command-model-list-paginated" {
		return handleFakePaginatedModelList(state, message)
	}
	writeFakeDefaultModelListResponse(message["id"])
	switch mode {
	case "command-model-set",
		"command-model-set-no-notification",
		"command-model-set-unsupported-settings-update",
		"command-effort-set":
		return false
	}
	return fakeCommandDone(mode)
}

func handleFakePaginatedModelList(state *fakeCodexState, message map[string]any) bool {
	state.modelListCalls++
	params := fakeParams(message)
	switch state.modelListCalls {
	case 1:
		requireNoModelListCursor(params)
		writeFakeModelListFirstPage(message["id"])
		return false
	case 2:
		requireModelListCursor(params, "page_two")
		writeFakeModelListSecondPage(message["id"])
		return true
	default:
		panic("unexpected extra model list page")
	}
}

func requireNoModelListCursor(params map[string]any) {
	if _, ok := params["cursor"]; ok {
		panic("first model list page should not include cursor")
	}
}

func requireModelListCursor(params map[string]any, expected string) {
	if params["cursor"] != expected {
		panic("second model list page used wrong cursor")
	}
}

func writeFakeModelListFirstPage(id any) {
	writeFakeResponse(id, map[string]any{
		"data": []map[string]any{
			{
				"defaultReasoningEffort": "high",
				"description":            "Hidden model.",
				"displayName":            "Hidden Test",
				"hidden":                 true,
				"id":                     "hidden-test",
				"isDefault":              false,
				"model":                  "hidden-test",
				"supportedReasoningEfforts": []map[string]any{
					{"description": "High reasoning.", "reasoningEffort": "high"},
				},
			},
			{
				"defaultReasoningEffort": "high",
				"description":            "First visible model.",
				"displayName":            "GPT Test",
				"hidden":                 false,
				"id":                     "gpt-test",
				"isDefault":              true,
				"model":                  "gpt-test",
				"supportedReasoningEfforts": []map[string]any{
					{"description": "High reasoning.", "reasoningEffort": "high"},
					{"description": "Extra high reasoning.", "reasoningEffort": "xhigh"},
				},
			},
		},
		"nextCursor": "page_two",
	})
}

func writeFakeModelListSecondPage(id any) {
	writeFakeResponse(id, map[string]any{
		"data": []map[string]any{{
			"defaultReasoningEffort": "medium",
			"description":            "Second visible model.",
			"displayName":            "GPT Test 2",
			"hidden":                 false,
			"id":                     "gpt-test-2",
			"isDefault":              false,
			"model":                  "gpt-test-2",
			"supportedReasoningEfforts": []map[string]any{
				{"description": "Medium reasoning.", "reasoningEffort": "medium"},
			},
		}},
		"nextCursor": nil,
	})
}

func writeFakeDefaultModelListResponse(id any) {
	writeFakeResponse(id, map[string]any{
		"data": []map[string]any{{
			"defaultReasoningEffort": "high",
			"description":            "Fake model.",
			"displayName":            "GPT Test",
			"hidden":                 false,
			"id":                     "gpt-test",
			"isDefault":              true,
			"model":                  "gpt-test",
			"supportedReasoningEfforts": []map[string]any{
				{"description": "Medium reasoning.", "reasoningEffort": "medium"},
				{"description": "High reasoning.", "reasoningEffort": "high"},
				{"description": "Extra high reasoning.", "reasoningEffort": "xhigh"},
			},
		}},
		"nextCursor": nil,
	})
}

func handleFakeThreadSettingsUpdate(mode string, message map[string]any) bool {
	if mode == "command-model-set-already-current" || mode == "command-effort-set-already-current" {
		panic("already-current settings command should not update settings")
	}
	if mode == "command-effort-set" {
		assertFakeEffortSet(message)
	} else {
		assertFakeModelSet(message)
	}
	if mode == "command-model-set-unsupported-settings-update" {
		writeFakeErrorResponse(message["id"], -32600, "thread/settings/update requires experimentalApi capability")
		return true
	}
	writeFakeResponse(message["id"], map[string]any{})
	if mode == "command-model-set-no-notification" {
		return false
	}
	writeFakeThreadSettingsUpdated("gpt-test", ReasoningEffortHigh)
	return fakeCommandDone(mode)
}
