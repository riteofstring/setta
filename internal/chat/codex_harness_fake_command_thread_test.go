package chat

func handleFakeCommandThread(mode string, state *fakeCodexState, message map[string]any) {
	if !fakeCommandUsesThread(mode) {
		return
	}
	method := message["method"]
	params := fakeParams(message)
	if fakeGoalOperationMode(mode) {
		handleFakeGoalOperationCommandThread(method, state, params)
		return
	}
	assertFakeCommandThreadMethod(mode, method)
	assertFakeCommandThreadPermissionParams(mode, method, params)
	assertFakeCommandThreadCommonParams(method, params)
	updateFakeCommandThreadState(state, method, params)
}

func handleFakeGoalOperationCommandThread(method any, state *fakeCodexState, params map[string]any) {
	if method != "thread/start" && method != "thread/resume" {
		panic("goal operation command should start or resume a thread")
	}
	state.commandThreadStarted = method == "thread/start"
	state.commandThreadResumed = method == "thread/resume"
	state.currentThreadID = "thread_fake"
	if method == "thread/resume" {
		if threadID, ok := params["threadId"].(string); ok && threadID != "" {
			state.currentThreadID = threadID
		}
	}
}

func assertFakeCommandThreadMethod(mode string, method any) {
	if fakeCommandStartsThread(mode) && method != "thread/start" {
		panic("goal set command should start a thread")
	}
	if fakeCommandResumesThread(mode) && method != "thread/resume" {
		panic("linked model command should resume a linked thread")
	}
}

func assertFakeCommandThreadPermissionParams(mode string, method any, params map[string]any) {
	if fakeCommandUsesFullAccessThreadPermission(mode) {
		if params["approvalPolicy"] != codexApprovalPolicyNever || params["permissions"] != codexPermissionProfileDangerFullAccess {
			panic("command thread start/resume missing full access permission params")
		}
		return
	}
	if method == "thread/start" {
		if params["approvalPolicy"] != codexApprovalPolicyOnRequest {
			panic("command thread start missing default approval params")
		}
		return
	}
	if _, ok := params["approvalPolicy"]; ok {
		panic("command thread resume should not override approval policy without conversation permission settings")
	}
	if _, ok := params["permissions"]; ok {
		panic("command thread resume should not override permissions without conversation permission settings")
	}
}

func assertFakeCommandThreadCommonParams(method any, params map[string]any) {
	if params["approvalsReviewer"] != "user" {
		panic("command thread start/resume missing approval reviewer params")
	}
	if params["cwd"] == "" {
		panic("command thread start/resume missing cwd")
	}
	if method == "thread/resume" && params["threadId"] != "thread_fake" {
		panic("command thread resume used wrong thread id")
	}
}

func updateFakeCommandThreadState(state *fakeCodexState, method any, params map[string]any) {
	state.commandThreadStarted = method == "thread/start"
	state.commandThreadResumed = method == "thread/resume"
	state.currentThreadID = "thread_fake"
	if method == "thread/resume" {
		state.currentThreadID = params["threadId"].(string)
	}
}

func fakeCommandUsesThread(mode string) bool {
	return fakeCommandStartsThread(mode) || fakeCommandResumesThread(mode)
}

func fakeCommandStartsThread(mode string) bool {
	return mode == "command-goal-set" || mode == "command-goal-set-permission-ignored" || mode == "command-goal-edit" || mode == "command-goal-pause-no-goal" || fakeGoalOperationMode(mode)
}

func fakeCommandUsesFullAccessThreadPermission(mode string) bool {
	return mode == "command-goal-set-permission-ignored" || mode == "command-model-list-linked-full-access"
}

func fakeCommandResumesThread(mode string) bool {
	switch mode {
	case "command-model-list-linked",
		"command-model-list-linked-full-access",
		"command-model-set",
		"command-model-set-no-notification",
		"command-model-set-unsupported-settings-update",
		"command-model-set-already-current",
		"command-model-set-preserves-permission",
		"command-permission-picker-linked",
		"command-permission-set",
		"command-effort-set",
		"command-effort-set-preserves-permission",
		"command-effort-set-already-current":
		return true
	default:
		return false
	}
}
