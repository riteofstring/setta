package runtime

import (
	"fmt"

	"setta/internal/appearance"
	"setta/internal/chat"
	"setta/internal/codexapp"
	"setta/internal/conversation"
	"setta/internal/easyrun"
	"setta/internal/orchestrator"
	"setta/internal/speech"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

type runtimeBaseServices struct {
	appearanceService  *appearance.Service
	chatService        *chat.Service
	codexManager       *codexapp.Manager
	conversationStore  *conversation.Store
	easyRunService     *easyrun.Service
	speechService      *speech.Service
	workspaceService   *workspacesession.Service
	workspaceUIService *workspaceui.Service
	workflowService    *orchestrator.Service
	workflowStore      *orchestrator.Store
}

func newRuntimeBaseServices(config Config) (runtimeBaseServices, error) {
	appearanceService, err := newAppearanceService(config.AppDataDir)
	if err != nil {
		return runtimeBaseServices{}, err
	}
	workspaceService, err := newWorkspaceService(config.AppDataDir)
	if err != nil {
		return runtimeBaseServices{}, err
	}
	workspaceUIService, err := newWorkspaceUIService(config.AppDataDir, workspaceService)
	if err != nil {
		return runtimeBaseServices{}, err
	}
	conversationStore, err := conversation.NewStore(config.AppDataDir)
	if err != nil {
		return runtimeBaseServices{}, fmt.Errorf("create conversation store: %w", err)
	}
	closeConversationStoreOnFailure := true
	defer func() {
		if closeConversationStoreOnFailure {
			_ = conversationStore.Close()
		}
	}()
	codexManager := newCodexManager()
	chatService, err := newChatService(config.AppDataDir, workspaceService, codexManager, config.ChatHarness)
	if err != nil {
		return runtimeBaseServices{}, err
	}
	workflowService, workflowStore, err := newWorkflowService(
		config.AppDataDir,
		workspaceService,
		chatService,
	)
	if err != nil {
		return runtimeBaseServices{}, err
	}
	easyRunService, err := newEasyRunService(config.AppDataDir, chatService, workspaceService)
	if err != nil {
		closeRuntimeServicesBeforeEasyRunFailure(chatService, workflowService, workflowStore)
		return runtimeBaseServices{}, err
	}
	speechService, err := newSpeechService(config.Speech, easyRunService, workspaceService)
	if err != nil {
		easyRunService.CloseEvents()
		closeRuntimeServicesBeforeEasyRunFailure(chatService, workflowService, workflowStore)
		return runtimeBaseServices{}, err
	}
	if err := configureSettaAgentTools(chatService, easyRunService); err != nil {
		easyRunService.CloseEvents()
		closeRuntimeServicesBeforeEasyRunFailure(chatService, workflowService, workflowStore)
		return runtimeBaseServices{}, err
	}
	closeConversationStoreOnFailure = false
	return runtimeBaseServices{
		appearanceService:  appearanceService,
		chatService:        chatService,
		codexManager:       codexManager,
		conversationStore:  conversationStore,
		easyRunService:     easyRunService,
		speechService:      speechService,
		workspaceService:   workspaceService,
		workspaceUIService: workspaceUIService,
		workflowService:    workflowService,
		workflowStore:      workflowStore,
	}, nil
}

func configureSettaAgentTools(chatService *chat.Service, easyRunService *easyrun.Service) error {
	tools, err := chat.NewSettaAgentToolRegistry(easyrun.NewEmitArtifactAgentTool(easyRunService))
	if err != nil {
		return err
	}
	return chatService.SetAgentToolRegistry(tools)
}
