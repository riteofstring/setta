package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/backendlogs"
	"setta/internal/chatattachments"
	"setta/internal/chatmodes"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/externalagents"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/prompttemplates"
	"setta/internal/realtime"
	"setta/internal/runchains"
	"setta/internal/settingsstate"
	"setta/internal/statemachineruns"
	"setta/internal/terminals"
	"setta/internal/tools"
)

func newIDEProjectShellService(
	projectStates *projectstate.Registry,
	projectRuntime *projectstate.Runtime,
	settingsStateRuntime *settingsstate.Runtime,
	terminalService *terminals.Service,
	websocketHub *realtime.WebsocketHub,
) (*projectshell.Service, error) {
	return projectshell.NewService(projectshell.ServiceOptions{
		ProjectState:         projectRuntime,
		SettingsState:        settingsStateRuntime,
		SettingsProjectState: projectStates.Settings(),
		AfterProjectSave:     newProjectSaveNotifier(websocketHub),
		AfterProjectMetadataMutation: func(ctx context.Context, snapshot projectstate.Snapshot) error {
			return broadcastAllProjectMetadata(websocketHub, ctx, snapshot)
		},
		AfterProjectsDelete: newProjectTerminalDeleteHandler(terminalService),
		AfterProjectRename:  newProjectRenameBroadcaster(projectRuntime, websocketHub),
	})
}

func broadcastAllProjectMetadata(
	websocketHub *realtime.WebsocketHub,
	ctx context.Context,
	snapshot projectstate.Snapshot,
) error {
	var defaultProjectID *string
	if trimmedDefaultProjectID := strings.TrimSpace(snapshot.Document.DefaultProjectID); trimmedDefaultProjectID != "" {
		defaultProjectID = &trimmedDefaultProjectID
	}
	_, err := websocketHub.BroadcastJSON(
		ctx,
		realtime.NewAllProjectMetadataMessage(realtime.AllProjectMetadataContent{
			DefaultProjectConfigID: defaultProjectID,
			ProjectMetadata:        snapshot.Document.ProjectConfigMetadata(),
		}),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	return err
}

func newProjectSaveNotifier(
	websocketHub *realtime.WebsocketHub,
) func(context.Context, projectstate.Snapshot, string) error {
	return func(ctx context.Context, _ projectstate.Snapshot, projectID string) error {
		notificationID, err := newAppNotificationID()
		if err != nil {
			return err
		}
		_, err = websocketHub.BroadcastJSON(
			ctx,
			realtime.NewNotificationMessage(realtime.NotificationContent{
				ID:              notificationID,
				ProjectConfigID: projectID,
				Type:            realtime.NotificationTypeSave,
				Message:         "Saved!",
				Temporary:       false,
				Timestamp:       time.Now().UTC().Format(time.RFC3339Nano),
				Metadata:        map[string]any{},
				ReadStatus:      false,
			}),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		)
		return err
	}
}

func newProjectTerminalDeleteHandler(
	terminalService *terminals.Service,
) func(context.Context, projectstate.Snapshot, []string) error {
	return func(ctx context.Context, _ projectstate.Snapshot, deletedIDs []string) error {
		var joined error
		for _, projectID := range deletedIDs {
			for _, session := range terminalService.List(projectID, "") {
				joined = errors.Join(joined, terminalService.Delete(ctx, session.ID))
			}
		}
		return joined
	}
}

func newProjectRenameBroadcaster(
	projectRuntime *projectstate.Runtime,
	websocketHub *realtime.WebsocketHub,
) func(context.Context, projectstate.Snapshot, string) error {
	return func(ctx context.Context, snapshot projectstate.Snapshot, projectID string) error {
		projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
		if err != nil {
			return err
		}
		status := projectRuntime.FrontendOpStatus()
		if _, err := websocketHub.BroadcastJSON(
			ctx,
			realtime.NewProjectStateUpdateMessage(realtime.ProjectStateUpdateContent{
				ProjectState:   projectStateView,
				CompletedOpIDs: status.Completed,
				PendingOpIDs:   status.Pending,
			}),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		); err != nil {
			return err
		}
		return broadcastAllProjectMetadata(websocketHub, ctx, snapshot)
	}
}

func initializeIDEExternalAgentServices(
	cfg config.Config,
	logger *slog.Logger,
	settaServerURL string,
	currentSession *auth.CurrentSession,
	authService *auth.Service,
	websocketHub *realtime.WebsocketHub,
	projectRuntime *projectstate.Runtime,
	deploymentRuntime *deployments.Runtime,
	mcpClient *mcpx.Client,
	mcpToolRegistry *tools.Registry,
	attachmentService *chatattachments.Service,
	backendLogService *backendlogs.Service,
	promptTemplateStore *prompttemplates.Store,
	agentProfileStore *agentprofiles.Store,
	appGenerationModes chatmodes.AppGenerationModeResolver,
	services *ideAgentServices,
) error {
	if err := initializeIDEExternalRuntimeServices(
		cfg,
		logger,
		settaServerURL,
		currentSession,
		authService,
		websocketHub,
		projectRuntime,
		mcpClient,
		mcpToolRegistry,
		attachmentService,
		backendLogService,
		agentProfileStore,
		appGenerationModes,
		services,
	); err != nil {
		return err
	}
	return initializeIDEStateMachineServices(
		logger,
		projectRuntime,
		deploymentRuntime,
		attachmentService,
		promptTemplateStore,
		agentProfileStore,
		services,
	)
}

func initializeIDEExternalRuntimeServices(
	cfg config.Config,
	logger *slog.Logger,
	settaServerURL string,
	currentSession *auth.CurrentSession,
	authService *auth.Service,
	websocketHub *realtime.WebsocketHub,
	projectRuntime *projectstate.Runtime,
	mcpClient *mcpx.Client,
	mcpToolRegistry *tools.Registry,
	attachmentService *chatattachments.Service,
	backendLogService *backendlogs.Service,
	agentProfileStore *agentprofiles.Store,
	appGenerationModes chatmodes.AppGenerationModeResolver,
	services *ideAgentServices,
) error {
	followService, err := externalagents.NewFollowService(externalagents.FollowServiceOptions{
		Tools:        mcpClient,
		TemporaryIDs: services.temporaryIDs,
		Broadcaster:  websocketHub,
	})
	if err != nil {
		return err
	}
	services.externalAgentFollow = followService
	services.externalAgentRuntime, err = externalagents.NewRuntime(externalagents.RuntimeOptions{
		Runs:        services.agentRunStore,
		Follow:      services.externalAgentFollow,
		BackendLogs: backendLogService,
		Logger:      logger,
	})
	if err != nil {
		return err
	}
	services.externalAgentChats, err = externalagents.NewService(externalagents.ServiceOptions{
		Runs: services.agentRunStore,
		Live: services.externalAgentRuntime,
	})
	if err != nil {
		return err
	}
	codexExecutor, err := externalagents.NewCodexExecutor(externalagents.CodexExecutorOptions{
		Runs:               services.agentRunStore,
		Runtime:            services.externalAgentRuntime,
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		SettaFilesRoot:     cfg.Paths.SettaFilesRoot,
		SettaToolRegistry:  mcpToolRegistry,
		CurrentSession:     currentSession,
		AuthCookieBaseName: authService.AuthCookieBaseName(),
		RuntimeRoot:        cfg.Paths.RuntimeRoot,
		ProcessEnv:         llmconfig.CurrentProcessEnv(),
		Logger:             logger,
	})
	if err != nil {
		return err
	}
	claudeExecutor, err := externalagents.NewClaudeExecutor(externalagents.ClaudeExecutorOptions{
		Runs:               services.agentRunStore,
		Runtime:            services.externalAgentRuntime,
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		SettaServerURL:     settaServerURL,
		CurrentSession:     currentSession,
		AuthCookieBaseName: authService.AuthCookieBaseName(),
		RuntimeRoot:        cfg.Paths.RuntimeRoot,
		ProcessEnv:         llmconfig.CurrentProcessEnv(),
	})
	if err != nil {
		return err
	}
	externalAgentExecutor := externalagents.NewMultiExecutor(externalagents.MultiExecutorOptions{
		Claude: claudeExecutor,
		Codex:  codexExecutor,
	})
	services.externalAgentExecutor = externalAgentExecutor
	services.externalAgentSend, err = externalagents.NewSendService(externalagents.SendServiceOptions{
		ProjectState:       projectRuntime,
		Engines:            services.engineStore,
		Runs:               services.agentRunStore,
		Profiles:           agentProfileStore,
		Configs:            services.externalConfigStore,
		Runtime:            services.externalAgentRuntime,
		Preflight:          services.externalPreflight,
		Attachments:        attachmentService,
		Executor:           externalAgentExecutor,
		SettaFilesRoot:     cfg.Paths.SettaFilesRoot,
		AppGenerationModes: appGenerationModes,
	})
	return err
}

func initializeIDEStateMachineServices(
	logger *slog.Logger,
	projectRuntime *projectstate.Runtime,
	deploymentRuntime *deployments.Runtime,
	attachmentService *chatattachments.Service,
	promptTemplateStore *prompttemplates.Store,
	agentProfileStore *agentprofiles.Store,
	services *ideAgentServices,
) error {
	var err error
	services.stateMachineRuntime, err = statemachineruns.NewRuntime(statemachineruns.RuntimeOptions{
		Runs:                  services.agentRunStore,
		Engines:               services.engineStore,
		Profiles:              agentProfileStore,
		Templates:             promptTemplateStore,
		ResolveProjectRuntime: newStateMachineProjectRuntimeResolver(projectRuntime, deploymentRuntime),
		ManagedChats:          services.managedChatService,
		ManagedRuns:           services.agentRunRuntime,
		ExternalChats:         services.externalAgentSend,
		ExternalRuns:          services.externalAgentRuntime,
	})
	if err != nil {
		return err
	}
	registerStateMachineTerminalChildRunListener(logger, services)
	externalAgentRunService, err := externalagents.NewRunService(externalagents.RunServiceOptions{
		ProjectState: projectRuntime,
		Engines:      services.engineStore,
		Runs:         services.agentRunStore,
		Configs:      services.externalConfigStore,
		Runtime:      services.externalAgentRuntime,
		Preflight:    services.externalPreflight,
		Attachments:  attachmentService,
		Executor:     services.externalAgentExecutor,
	})
	if err != nil {
		return err
	}
	services.runChainRuntime, err = runchains.NewRuntime(runchains.RuntimeOptions{
		Runs:         services.agentRunStore,
		Engines:      services.engineStore,
		Profiles:     agentProfileStore,
		ProjectState: projectRuntime,
		Managed:      services.agentRunRuntime,
		External:     externalAgentRunService,
		TemporaryIDs: services.temporaryIDs,
	})
	return err
}

func newStateMachineProjectRuntimeResolver(
	projectRuntime *projectstate.Runtime,
	deploymentRuntime *deployments.Runtime,
) func(*string) (*projectstate.Runtime, error) {
	return func(shareSessionID *string) (*projectstate.Runtime, error) {
		return resolveStateMachineProjectRuntime(projectRuntime, deploymentRuntime, shareSessionID)
	}
}

func resolveStateMachineProjectRuntime(
	projectRuntime *projectstate.Runtime,
	deploymentRuntime *deployments.Runtime,
	shareSessionID *string,
) (*projectstate.Runtime, error) {
	trimmedShareSessionID := ""
	if shareSessionID != nil {
		trimmedShareSessionID = strings.TrimSpace(*shareSessionID)
	}
	if trimmedShareSessionID == "" {
		if projectRuntime == nil {
			return nil, fmt.Errorf("project runtime is required")
		}
		return projectRuntime, nil
	}
	if deploymentRuntime == nil {
		return nil, fmt.Errorf(
			"deployment runtime is required for workflow share session %s",
			trimmedShareSessionID,
		)
	}
	return deploymentRuntime.Overlay(trimmedShareSessionID)
}

func registerStateMachineTerminalChildRunListener(
	logger *slog.Logger,
	services *ideAgentServices,
) {
	services.agentRunStore.AddAfterSaveListener(func(run agentruns.Run) {
		if !shouldHandleStateMachineTerminalChildRun(services.stateMachineRuntime, run) {
			return
		}
		savedRun := run.Clone()
		go processStateMachineTerminalChildRun(logger, services.stateMachineRuntime, savedRun)
	})
}

func shouldHandleStateMachineTerminalChildRun(
	runtime *statemachineruns.Runtime,
	run agentruns.Run,
) bool {
	if runtime == nil || !isTerminalAgentRunStatus(run.Status) {
		return false
	}
	parentRunType, ok := run.Inputs["stateMachineParentRunType"].(string)
	return ok && strings.TrimSpace(parentRunType) == statemachineruns.RunTypeStateMachine
}

func isTerminalAgentRunStatus(status agentruns.RunStatus) bool {
	switch status {
	case agentruns.RunStatusCompleted, agentruns.RunStatusFailed, agentruns.RunStatusCancelled:
		return true
	default:
		return false
	}
}

func processStateMachineTerminalChildRun(
	logger *slog.Logger,
	runtime *statemachineruns.Runtime,
	savedRun agentruns.Run,
) {
	if _, err := runtime.HandleTerminalChildRunUpdate(savedRun); err != nil {
		logger.Error(
			"state machine runtime failed to process child run update",
			"runId",
			savedRun.ID,
			"error",
			err,
		)
	}
}
