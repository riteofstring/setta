package chat

func approvalFilePaths(approval ApprovalRequest) []string {
	if approval.FilePath == "" {
		return nil
	}
	return []string{approval.FilePath}
}

func approvalRunItemType(approval ApprovalRequest) RunItemType {
	if approval.Kind == ApprovalKindFileChange {
		return RunItemTypeFileChange
	}
	return RunItemTypeCommandExecution
}
