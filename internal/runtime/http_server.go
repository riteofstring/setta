package runtime

import (
	"net/http"

	"setta/internal/httpapi"
)

func newHTTPServer(config Config, services runtimeServices) (*http.Server, error) {
	var localCredentialIssuer httpapi.LocalCredentialIssuerService
	var runtimeAccessService httpapi.RuntimeAccessService
	if services.localCredentialIssuer != nil {
		localCredentialIssuer = services.localCredentialIssuer
		runtimeAccessService = services.localCredentialIssuer
	}
	apiHandler, err := httpapi.NewHandlerWithError(httpapi.HandlerConfig{
		Metadata: httpapi.BackendMetadata{
			Name:    httpapi.BackendName,
			Version: config.Version,
		},
		AppearanceService:            services.appearanceService,
		ConversationNavigatorService: services.conversationService,
		ConversationService:          services.conversationService,
		DirectorService:              services.directorServices.commandCenter,
		RoleConfigurationService:     services.roleConfigurationService,
		CodexAccountService:          services.codexAccountService,
		LocalCredentialIssuer:        localCredentialIssuer,
		RuntimeAccessService:         runtimeAccessService,
		RuntimeEndpointAccess: httpapi.RuntimeEndpointAccessConfig{
			AllowedHTTPSOrigins: config.AllowedHTTPSOrigins,
			AllowedRequestHosts: config.AllowedRequestHosts,
		},
		RuntimeAuthService:        services.authStore,
		RuntimeDiagnosticsService: services.runtimeDiagnosticsService,
		RuntimeIdentityService:    services.runtimeIdentityManager,
		RuntimeSetupService:       services.runtimeSetupStore,
		SpeechService:             speechServiceWithCredentialPolicy(config.SpeechCredentialOwner, services.speechService),
		WorkspaceService:          services.workspaceService,
	})
	if err != nil {
		return nil, err
	}
	return &http.Server{
		Handler:           apiHandler,
		MaxHeaderBytes:    httpMaxHeaderBytes,
		ReadHeaderTimeout: httpReadHeaderTimeout,
		ReadTimeout:       httpReadTimeout,
	}, nil
}
