package chat

func resolvedApprovalStatus(approval ApprovalRequest, approved bool, cancelled bool) ApprovalStatus {
	switch {
	case cancelled:
		return ApprovalStatusCancelled
	case approval.Kind == ApprovalKindUserInput:
		return ApprovalStatusAnswered
	case approved:
		return ApprovalStatusApproved
	default:
		return ApprovalStatusDenied
	}
}

func approvalRunItemStatus(status ApprovalStatus) RunItemStatus {
	switch status {
	case ApprovalStatusCancelled:
		return RunItemStatusCancelled
	case ApprovalStatusPending:
		return RunItemStatusPending
	case ApprovalStatusApproved, ApprovalStatusAnswered, ApprovalStatusDenied:
		return RunItemStatusCompleted
	default:
		return RunItemStatusCompleted
	}
}

func (service *Service) updateApprovalRunItemResolvedLocked(workspaceID string, run Run, approval ApprovalRequest) error {
	item, ok, err := service.approvalRunItemLocked(workspaceID, run.ID, approval)
	if err != nil || !ok {
		return err
	}
	details, ok := item.ApprovalDetails()
	if !ok {
		return nil
	}
	updated := cloneApprovalDetails(*details)
	updated.ApprovalID = keepString(updated.ApprovalID, approval.ID)
	status := approval.Status
	updated.ApprovalStatus = &status
	item.Status = approvalRunItemStatus(status)
	if item.CompletedAt == "" && item.Status != RunItemStatusPending && item.Status != RunItemStatusRunning {
		item.CompletedAt = timestamp(service.now())
	}
	item.Details = NewRunItemApprovalDetails(updated)
	if err := service.store.SaveRunItem(item); err != nil {
		return err
	}
	if err := service.ingestRunItemBlockForActiveTurnLocked(item); err != nil {
		return err
	}
	_, err = service.events.Publish(NewRunItemUpdatedEvent(item))
	return err
}

func (service *Service) approvalRunItemLocked(workspaceID string, runID string, approval ApprovalRequest) (RunItem, bool, error) {
	if approval.RunItemID != "" {
		item, err := service.store.loadRunItem(workspaceID, runID, approval.RunItemID)
		if err != nil {
			return RunItem{}, false, err
		}
		return item, true, nil
	}
	if approval.ProviderItemID == "" {
		return RunItem{}, false, nil
	}
	return service.store.FindRunItemByProviderID(workspaceID, runID, approval.ProviderItemID)
}
