package runtime

import (
	"net/http"

	"setta/internal/httpapi"
)

func newHTTPServer(config Config, services runtimeServices) *http.Server {
	apiHandler := httpapi.NewHandler(httpapi.HandlerConfig{
		Metadata: httpapi.BackendMetadata{
			Name:    httpapi.BackendName,
			Version: config.Version,
		},
		AppearanceService:            services.appearanceService,
		AppPaneLayoutService:         services.appPaneLayoutService,
		ConversationInputService:     services.conversationInputService,
		ConversationNavigatorService: services.conversationService,
		ConversationService:          services.conversationService,
		RoleConfigurationService:     services.roleConfigurationService,
		MasterInputService:           services.masterInputService,
		CodexAccountService:          services.codexAccountService,
		RuntimeAuthService:           services.authStore,
		RuntimeIdentityService:       services.runtimeIdentityManager,
		RuntimeMetadata: httpapi.RuntimeMetadata{
			InfrastructureProvider: services.infrastructureProvider,
		},
		SpeechService:      speechServiceWithCredentialPolicy(config.SpeechCredentialOwner, services.speechService),
		WorkspaceUIService: services.workspaceUIService,
		WorkspaceService:   services.workspaceService,
	})
	return &http.Server{
		Handler:           apiHandler,
		MaxHeaderBytes:    httpMaxHeaderBytes,
		ReadHeaderTimeout: httpReadHeaderTimeout,
		ReadTimeout:       httpReadTimeout,
	}
}
