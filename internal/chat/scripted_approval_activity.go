package chat

func approvalRequestRunItem(approval ApprovalRequest) RunItem {
	return RunItem{
		ProviderItemID: approval.ProviderItemID,
		Type:           RunItemTypeApprovalRequest,
		Status:         RunItemStatusPending,
		Title:          approval.Title,
		Summary:        approval.Body,
		Details:        NewRunItemApprovalDetails(runItemApprovalRequestDetails(approval)),
	}
}

func runItemApprovalRequestDetails(approval ApprovalRequest) RunItemApprovalDetails {
	kind := approval.Kind
	status := approval.Status
	if status == "" {
		status = ApprovalStatusPending
	}
	details := RunItemApprovalDetails{
		ApprovalID:      approval.ID,
		ApprovalKind:    &kind,
		ApprovalStatus:  &status,
		Title:           approval.Title,
		Body:            approval.Body,
		Command:         approval.Command,
		Permission:      approval.Permission,
		Question:        approval.Question,
		Options:         append([]string{}, approval.Options...),
		Questions:       cloneApprovalQuestions(approval.Questions),
		StructuredInput: approval.StructuredInput,
	}
	switch approval.Kind {
	case ApprovalKindCommand, ApprovalKindPermission:
		details.Cwd = approval.FilePath
	case ApprovalKindFileChange:
		details.FilePath = approval.FilePath
	}
	if approval.StructuredInput != nil {
		details.ProviderRequestID = approval.StructuredInput.ProviderRequestID
	}
	return cloneApprovalDetails(details)
}
