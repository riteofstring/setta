package chat

func handleFakeGoalGet(mode string, message map[string]any) bool {
	assertFakeThreadID(message)
	if mode == "command-goal-edit" {
		writeFakeGoalResponse(message["id"], "finish renderer tests", "active")
		return true
	}
	writeFakeResponse(message["id"], map[string]any{"goal": nil})
	return fakeCommandDone(mode)
}

func handleFakeGoalSetMethod(mode string, message map[string]any) bool {
	assertFakeGoalSet(mode, message)
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

func handleFakeModelList(mode string, state *fakeCodexState, message map[string]any) bool {
	assertFakeModelList(message)
	if mode == "command-model-list-paginated" {
		return handleFakePaginatedModelList(state, message)
	}
	if mode == "catalog-model-list-invalid-reasoning" {
		writeFakeInvalidReasoningModelListResponse(message["id"])
		return true
	}
	writeFakeDefaultModelListResponse(message["id"])
	if mode == "catalog-model-list-no-thread" {
		return true
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

func writeFakeInvalidReasoningModelListResponse(id any) {
	writeFakeResponse(id, map[string]any{
		"data": []map[string]any{{
			"defaultReasoningEffort": "enormous",
			"description":            "Invalid model.",
			"displayName":            "Invalid Test",
			"hidden":                 false,
			"id":                     "invalid-test",
			"isDefault":              true,
			"model":                  "invalid-test",
			"supportedReasoningEfforts": []map[string]any{
				{"description": "Invalid reasoning.", "reasoningEffort": "enormous"},
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
