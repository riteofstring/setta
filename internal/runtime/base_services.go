package runtime

import (
	"setta/internal/appearance"
	"setta/internal/chat"
	"setta/internal/codexapp"
	"setta/internal/easyrun"
	"setta/internal/orchestrator"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

type runtimeBaseServices struct {
	appearanceService  *appearance.Service
	chatService        *chat.Service
	codexManager       *codexapp.Manager
	easyRunService     *easyrun.Service
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
	tools, err := chat.NewSettaAgentToolRegistry(easyrun.NewEmitArtifactAgentTool(easyRunService))
	if err != nil {
		easyRunService.CloseEvents()
		closeRuntimeServicesBeforeEasyRunFailure(chatService, workflowService, workflowStore)
		return runtimeBaseServices{}, err
	}
	if err := chatService.SetAgentToolRegistry(tools); err != nil {
		easyRunService.CloseEvents()
		closeRuntimeServicesBeforeEasyRunFailure(chatService, workflowService, workflowStore)
		return runtimeBaseServices{}, err
	}
	return runtimeBaseServices{
		appearanceService:  appearanceService,
		chatService:        chatService,
		codexManager:       codexManager,
		easyRunService:     easyRunService,
		workspaceService:   workspaceService,
		workspaceUIService: workspaceUIService,
		workflowService:    workflowService,
		workflowStore:      workflowStore,
	}, nil
}
