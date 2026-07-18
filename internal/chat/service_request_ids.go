package chat

import "setta/internal/workspace"

func (service *Service) resolveWorkspaceForRequest(workspaceID string) (workspace.WorkspaceSummary, error) {
	if err := validateWorkspaceID(workspaceID); err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return service.workspaceResolver.ResolveWorkspace(workspaceID)
}

func (service *Service) validateConversationRequest(workspaceID string, conversationID string) (workspace.WorkspaceSummary, error) {
	workspaceSummary, err := service.resolveWorkspaceForRequest(workspaceID)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	if err := validateConversationID(conversationID); err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return workspaceSummary, nil
}

func (service *Service) validateMessageMutationRequest(workspaceID string, conversationID string, messageID string) (workspace.WorkspaceSummary, error) {
	workspaceSummary, err := service.validateConversationRequest(workspaceID, conversationID)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	if err := validateMessageID(messageID); err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return workspaceSummary, nil
}

func (service *Service) validateRunRequest(workspaceID string, runID string) (workspace.WorkspaceSummary, error) {
	workspaceSummary, err := service.resolveWorkspaceForRequest(workspaceID)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	if err := validateRunID(runID); err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return workspaceSummary, nil
}

func (service *Service) validateRunItemOutputRequest(workspaceID string, runID string, runItemID string) (workspace.WorkspaceSummary, error) {
	workspaceSummary, err := service.validateRunRequest(workspaceID, runID)
	if err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	if err := validateRunItemID(runItemID); err != nil {
		return workspace.WorkspaceSummary{}, err
	}
	return workspaceSummary, nil
}

func (service *Service) validateOptionalDiagnosticFilters(workspaceID string, conversationID string, runID string) error {
	if err := validateWorkspaceID(workspaceID); err != nil {
		return err
	}
	if err := validateOptionalStorageID("conversation id", conversationID); err != nil {
		return err
	}
	return validateOptionalStorageID("run id", runID)
}
