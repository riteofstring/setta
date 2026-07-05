package runtime

import (
	"fmt"

	"setta/internal/chat"
	"setta/internal/easyrun"
	"setta/internal/orchestrator"
)

func closeRuntimeServicesBeforeEasyRunFailure(
	chatService *chat.Service,
	workflowService *orchestrator.Service,
	workflowStore *orchestrator.Store,
) {
	chatService.CloseEvents()
	workflowService.CloseEvents()
	_ = workflowStore.Close()
}

func newEasyRunService(appDataDir string, chatService *chat.Service) (*easyrun.Service, error) {
	store, err := easyrun.NewStore(appDataDir)
	if err != nil {
		return nil, fmt.Errorf("create easy-run store: %w", err)
	}
	service, err := easyrun.NewService(store, easyrun.WithChatService(chatService))
	if err != nil {
		return nil, fmt.Errorf("create easy-run service: %w", err)
	}
	return service, nil
}
