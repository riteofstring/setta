package runtime

import (
	"net/http"

	"setta/internal/httpapi"
	"setta/internal/webapp"
)

func newHTTPServer(config Config, services runtimeServices) *http.Server {
	apiHandler := httpapi.NewHandler(httpapi.HandlerConfig{
		Metadata: httpapi.BackendMetadata{
			Name:    httpapi.BackendName,
			Version: config.Version,
		},
		AppearanceService:            services.appearanceService,
		ChatService:                  services.chatService,
		ConversationInputService:     services.conversationInputService,
		ConversationNavigatorService: services.conversationService,
		ConversationService:          services.conversationService,
		MasterInputService:           services.masterInputService,
		NarratorStatusService:        services.narratorService,
		CodexAccountService:          services.codexAccountService,
		NotifyService:                services.notifyService,
		RuntimeAuthService:           services.authStore,
		RuntimeIdentityService:       services.runtimeIdentityManager,
		RuntimeMetadata: httpapi.RuntimeMetadata{
			InfrastructureProvider: services.infrastructureProvider,
		},
		SemanticGraphService:     services.semanticGraphService,
		SpeechService:            services.speechService,
		TerminalService:          services.terminalService,
		WorkspaceActivityService: services.workspaceActivityService,
		WorkspaceUIService:       services.workspaceUIService,
		WorkspaceService:         services.workspaceService,
		WorkflowService:          services.workflowService,
	})
	return &http.Server{
		Handler:           webapp.NewHandler(apiHandler),
		MaxHeaderBytes:    httpMaxHeaderBytes,
		ReadHeaderTimeout: httpReadHeaderTimeout,
		ReadTimeout:       httpReadTimeout,
	}
}
