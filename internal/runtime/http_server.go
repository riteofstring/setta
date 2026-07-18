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
		SpeechService:      services.speechService,
		WorkspaceUIService: services.workspaceUIService,
		WorkspaceService:   services.workspaceService,
	})
	return &http.Server{
		Handler:           webapp.NewHandler(apiHandler),
		MaxHeaderBytes:    httpMaxHeaderBytes,
		ReadHeaderTimeout: httpReadHeaderTimeout,
		ReadTimeout:       httpReadTimeout,
	}
}
