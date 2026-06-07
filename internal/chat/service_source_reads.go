package chat

import "fmt"

func (service *Service) ReadRun(workspaceID string, runID string) (Run, error) {
	if _, err := service.validateRunRequest(workspaceID, runID); err != nil {
		return Run{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.store.LoadRun(workspaceID, runID)
}

func (service *Service) ReadMessage(workspaceID string, conversationID string, messageID string) (ChatMessage, error) {
	if _, err := service.validateMessageMutationRequest(workspaceID, conversationID, messageID); err != nil {
		return ChatMessage{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.store.LoadMessageByID(workspaceID, conversationID, messageID)
}

func (service *Service) ReadRunItem(workspaceID string, runID string, runItemID string) (RunItem, error) {
	if _, err := service.validateRunItemOutputRequest(workspaceID, runID, runItemID); err != nil {
		return RunItem{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	items, err := service.store.LoadRunItems(workspaceID, runID)
	if err != nil {
		return RunItem{}, err
	}
	for _, item := range items {
		if item.ID == runItemID {
			return item, nil
		}
	}
	return RunItem{}, fmt.Errorf("run item %s was not found in run %s", runItemID, runID)
}
