package chat

func assertFakeRepositorySandboxPolicy(mode string, message map[string]any) {
	params := fakeParams(message)
	if params["approvalPolicy"] != codexApprovalPolicyNever {
		panic("turn/start must disable execution approvals")
	}
	policy, ok := params["sandboxPolicy"].(map[string]any)
	if !ok {
		panic("turn/start missing repository sandbox policy")
	}
	if fakeTurnUsesReadOnlySandbox(mode) {
		if policy["type"] != "readOnly" || policy["networkAccess"] != false {
			panic("turn/start read-only sandbox policy mismatch")
		}
		return
	}
	writableRoots, ok := policy["writableRoots"].([]any)
	if policy["type"] != "workspaceWrite" ||
		policy["networkAccess"] != false ||
		policy["excludeSlashTmp"] != true ||
		policy["excludeTmpdirEnvVar"] != true ||
		!ok || len(writableRoots) != 0 {
		panic("turn/start workspace sandbox policy is not repository-scoped")
	}
}

func fakeTurnUsesReadOnlySandbox(mode string) bool {
	return mode == "structured-task" || mode == "initial-permission-settings" || mode == "resume-permission-settings"
}
