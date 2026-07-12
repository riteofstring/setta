package runtime

import (
	"context"
	"fmt"
	"time"

	"setta/internal/agent"
	"setta/internal/appearance"
	"setta/internal/chat"
	"setta/internal/codexapp"
	"setta/internal/conversation"
	"setta/internal/master"
	"setta/internal/narration"
	"setta/internal/orchestrator"
	"setta/internal/speech"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

type runtimeBaseServices struct {
	appearanceService        *appearance.Service
	chatService              *chat.Service
	codexManager             *codexapp.Manager
	conversationService      *conversation.Service
	conversationInputService *conversation.InputService
	conversationStore        *conversation.Store
	masterInputService       *master.Service
	narratorService          *narration.Service
	speechService            *speech.Service
	workspaceService         *workspacesession.Service
	workspaceUIService       *workspaceui.Service
	workflowService          *orchestrator.Service
	workflowStore            *orchestrator.Store
}

func newRuntimeBaseServices(config Config) (runtimeBaseServices, error) {
	foundation, err := newRuntimeFoundation(config)
	if err != nil {
		return runtimeBaseServices{}, err
	}
	closeFoundationOnFailure := true
	defer func() {
		if closeFoundationOnFailure {
			shutdownRuntimeFoundation(foundation, config.ShutdownTimeout)
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
	speechService, err := newSpeechService(config.Speech, foundation.conversationStore)
	if err != nil {
		closeRuntimeServicesBeforeSpeechFailure(chatService, workflowService, workflowStore)
		return runtimeBaseServices{}, err
	}
	closeFoundationOnFailure = false
	return runtimeBaseServices{
		appearanceService:        foundation.appearanceService,
		chatService:              chatService,
		codexManager:             foundation.codexManager,
		conversationService:      foundation.conversationService,
		conversationInputService: foundation.conversationInputService,
		conversationStore:        foundation.conversationStore,
		masterInputService:       foundation.masterInputService,
		narratorService:          foundation.narratorService,
		speechService:            speechService,
		workspaceService:         foundation.workspaceService,
		workspaceUIService:       foundation.workspaceUIService,
		workflowService:          workflowService,
		workflowStore:            workflowStore,
	}, nil
}

func shutdownRuntimeFoundation(foundation runtimeFoundation, timeout time.Duration) {
	serviceCtx, cancelServices := context.WithTimeout(context.Background(), timeout)
	_ = foundation.conversationService.Shutdown(serviceCtx)
	_ = foundation.narratorService.Shutdown(serviceCtx)
	cancelServices()
	managerCtx, cancelManager := context.WithTimeout(context.Background(), timeout)
	_ = foundation.codexManager.Shutdown(managerCtx)
	cancelManager()
	_ = foundation.conversationStore.Close()
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
	appearanceService        *appearance.Service
	codexManager             *codexapp.Manager
	conversationService      *conversation.Service
	conversationInputService *conversation.InputService
	conversationStore        *conversation.Store
	masterInputService       *master.Service
	narratorService          *narration.Service
	workspaceService         *workspacesession.Service
	workspaceUIService       *workspaceui.Service
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
	conversationInputService, err := conversation.NewInputService(conversationStore)
	if err != nil {
		_ = conversationStore.Close()
		return runtimeFoundation{}, fmt.Errorf("create conversation input service: %w", err)
	}
	masterInputService, err := master.NewService(conversationStore)
	if err != nil {
		_ = conversationStore.Close()
		return runtimeFoundation{}, fmt.Errorf("create master input service: %w", err)
	}
	codexManager := newCodexManager()
	agentRuntime := agent.NewRuntime(agent.Config{Manager: codexManager, Version: config.Version})
	narratorService, err := narration.NewService(conversationStore, workspaceService, agentRuntime)
	if err != nil {
		_ = conversationStore.Close()
		return runtimeFoundation{}, fmt.Errorf("create narrator service: %w", err)
	}
	conversationService, err := conversation.NewService(
		conversationStore,
		workspaceService,
		agentRuntime,
		conversation.WithNarrationTrajectoryObserver(narratorService),
	)
	if err != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
		defer cancel()
		_ = narratorService.Shutdown(shutdownCtx)
		_ = conversationStore.Close()
		return runtimeFoundation{}, fmt.Errorf("create conversation service: %w", err)
	}
	if err := narratorService.RecoverCommittedTrajectory(context.Background()); err != nil {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
		defer cancel()
		_ = conversationService.Shutdown(shutdownCtx)
		_ = narratorService.Shutdown(shutdownCtx)
		_ = conversationStore.Close()
		return runtimeFoundation{}, fmt.Errorf("recover narrator trajectory: %w", err)
	}
	return runtimeFoundation{
		appearanceService:        appearanceService,
		codexManager:             codexManager,
		conversationService:      conversationService,
		conversationInputService: conversationInputService,
		conversationStore:        conversationStore,
		masterInputService:       masterInputService,
		narratorService:          narratorService,
		workspaceService:         workspaceService,
		workspaceUIService:       workspaceUIService,
	}, nil
}
