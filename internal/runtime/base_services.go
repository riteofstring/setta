package runtime

import (
	"fmt"

	"setta/internal/agent"
	"setta/internal/appearance"
	"setta/internal/chat"
	"setta/internal/codexapp"
	"setta/internal/conversation"
	"setta/internal/orchestrator"
	"setta/internal/speech"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

type runtimeBaseServices struct {
	appearanceService   *appearance.Service
	chatService         *chat.Service
	codexManager        *codexapp.Manager
	conversationService *conversation.Service
	conversationStore   *conversation.Store
	speechService       *speech.Service
	workspaceService    *workspacesession.Service
	workspaceUIService  *workspaceui.Service
	workflowService     *orchestrator.Service
	workflowStore       *orchestrator.Store
}

func newRuntimeBaseServices(config Config) (runtimeBaseServices, error) {
	foundation, err := newRuntimeFoundation(config)
	if err != nil {
		return runtimeBaseServices{}, err
	}
	closeConversationStoreOnFailure := true
	defer func() {
		if closeConversationStoreOnFailure {
			_ = foundation.conversationStore.Close()
		}
	}()
	chatService, err := newChatService(config.AppDataDir, foundation.workspaceService, foundation.codexManager, config.ChatHarness)
	if err != nil {
		return runtimeBaseServices{}, err
	}
	workflowService, workflowStore, err := newWorkflowService(
		config.AppDataDir,
		foundation.workspaceService,
		chatService,
	)
	if err != nil {
		return runtimeBaseServices{}, err
	}
	speechService, err := newSpeechService(config.Speech, foundation.workspaceService)
	if err != nil {
		closeRuntimeServicesBeforeSpeechFailure(chatService, workflowService, workflowStore)
		return runtimeBaseServices{}, err
	}
	closeConversationStoreOnFailure = false
	return runtimeBaseServices{
		appearanceService:   foundation.appearanceService,
		chatService:         chatService,
		codexManager:        foundation.codexManager,
		conversationService: foundation.conversationService,
		conversationStore:   foundation.conversationStore,
		speechService:       speechService,
		workspaceService:    foundation.workspaceService,
		workspaceUIService:  foundation.workspaceUIService,
		workflowService:     workflowService,
		workflowStore:       workflowStore,
	}, nil
}

func closeRuntimeServicesBeforeSpeechFailure(
	chatService *chat.Service,
	workflowService *orchestrator.Service,
	workflowStore *orchestrator.Store,
) {
	chatService.CloseEvents()
	workflowService.CloseEvents()
	_ = workflowStore.Close()
}

type runtimeFoundation struct {
	appearanceService   *appearance.Service
	codexManager        *codexapp.Manager
	conversationService *conversation.Service
	conversationStore   *conversation.Store
	workspaceService    *workspacesession.Service
	workspaceUIService  *workspaceui.Service
}

func newRuntimeFoundation(config Config) (runtimeFoundation, error) {
	appearanceService, err := newAppearanceService(config.AppDataDir)
	if err != nil {
		return runtimeFoundation{}, err
	}
	workspaceService, err := newWorkspaceService(config.AppDataDir)
	if err != nil {
		return runtimeFoundation{}, err
	}
	workspaceUIService, err := newWorkspaceUIService(config.AppDataDir, workspaceService)
	if err != nil {
		return runtimeFoundation{}, err
	}
	conversationStore, err := conversation.NewStore(config.AppDataDir)
	if err != nil {
		return runtimeFoundation{}, fmt.Errorf("create conversation store: %w", err)
	}
	codexManager := newCodexManager()
	agentRuntime := agent.NewRuntime(agent.Config{Manager: codexManager, Version: config.Version})
	conversationService, err := conversation.NewService(conversationStore, workspaceService, agentRuntime)
	if err != nil {
		_ = conversationStore.Close()
		return runtimeFoundation{}, fmt.Errorf("create conversation service: %w", err)
	}
	return runtimeFoundation{
		appearanceService:   appearanceService,
		codexManager:        codexManager,
		conversationService: conversationService,
		conversationStore:   conversationStore,
		workspaceService:    workspaceService,
		workspaceUIService:  workspaceUIService,
	}, nil
}
