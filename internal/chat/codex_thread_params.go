package chat

func (harness *CodexHarness) codexThreadStartParams(workspaceRoot string) (map[string]any, error) {
	return map[string]any{
		"approvalPolicy":        "on-request",
		"approvalsReviewer":     "user",
		"cwd":                   workspaceRoot,
		"developerInstructions": codexDeveloperInstructions(),
		"runtimeWorkspaceRoots": []string{workspaceRoot},
	}, nil
}

func codexThreadResumeParams(workspaceRoot string, threadID string, conversation Conversation) (map[string]any, error) {
	params := map[string]any{
		"approvalsReviewer":     "user",
		"cwd":                   workspaceRoot,
		"excludeTurns":          true,
		"runtimeWorkspaceRoots": []string{workspaceRoot},
		"threadId":              threadID,
	}
	if err := applyCodexThreadResumeSettings(params, conversation); err != nil {
		return nil, err
	}
	return params, nil
}

func applyCodexThreadResumeSettings(params map[string]any, conversation Conversation) error {
	permission, ok, err := codexConversationPermissionSettings(conversation)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}
	if err := validateSettaCodexApprovalPolicy(permission.ApprovalPolicy, "thread/resume request approvalPolicy"); err != nil {
		return err
	}
	params["approvalPolicy"] = permission.ApprovalPolicy
	params["permissions"] = permission.Permissions
	return nil
}
