package runtime

import (
	"net/http"

	"setta/internal/httpapi"
	"setta/internal/webapp"
)

func newHTTPServer(config Config, services runtimeServices) *http.Server {
	var localCredentialIssuer httpapi.LocalCredentialIssuerService
	var runtimeAccessService httpapi.RuntimeAccessService
	if services.localCredentialIssuer != nil {
		localCredentialIssuer = services.localCredentialIssuer
		runtimeAccessService = services.localCredentialIssuer
	}
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
		LocalCredentialIssuer:        localCredentialIssuer,
		RuntimeAccessService:         runtimeAccessService,
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
