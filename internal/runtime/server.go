package runtime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"setta/internal/appearance"
	"setta/internal/appstate"
	"setta/internal/codexaccount"
	"setta/internal/codexapp"
	"setta/internal/conversation"
	"setta/internal/conversationindex"
	"setta/internal/httpapi"
	"setta/internal/localcredissuer"
	"setta/internal/master"
	"setta/internal/narration"
	"setta/internal/runtimeauth"
	"setta/internal/runtimeidentity"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimesetup"
	"setta/internal/speech"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
	"setta/internal/workspaceui"
)

type Config struct {
	AllowRemote                bool
	AppDataDir                 string
	BootstrapDeviceDisplayName string
	// EnableLocalCredentialIssuer hosts the bounded credential authority used
	// only by local development and deterministic app workflows. Cloud runtimes
	// must leave it disabled and use the external Setta control plane.
	EnableLocalCredentialIssuer bool
	Host                        string
	Port                        int
	RuntimeDisplayName          string
	SkipBootstrapDeviceSession  bool
	Version                     string
	Stdout                      io.Writer
	Stderr                      io.Writer
	ShutdownTimeout             time.Duration
	Speech                      speech.OpenAIClientConfig
}

const (
	httpMaxHeaderBytes    = 1 * 1024 * 1024
	httpReadHeaderTimeout = 5 * time.Second
	httpReadTimeout       = 30 * time.Second
)

type ReadyEvent struct {
	Event             string `json:"event"`
	Addr              string `json:"addr"`
	BootstrapToken    string `json:"bootstrapToken,omitempty"`
	LocalPairingToken string `json:"localPairingToken,omitempty"`
	ProtocolVersion   int    `json:"protocolVersion"`
}

type Server struct {
	closeConversationStore func() error
	closeRuntimeAuth       func() error
	drainConversationTurns func(context.Context) error
	drainMasterRouting     func(context.Context) error
	drainNarration         func(context.Context) error
	codexManager           *codexapp.Manager
	server                 *http.Server
	listener               net.Listener
	done                   chan error
}

type runtimeServices struct {
	appearanceService        *appearance.Service
	authStore                *runtimeauth.Store
	bootstrapToken           string
	localPairingToken        string
	localCredentialIssuer    *localcredissuer.Service
	codexAccountService      *codexaccount.Service
	codexManager             *codexapp.Manager
	conversationService      *conversation.Service
	conversationInputService *conversation.InputService
	conversationIndexService *conversationindex.Service
	conversationStore        *conversation.Store
	masterInputService       *master.Service
	masterRouteService       *master.RouteService
	masterSessionService     *master.SessionService
	narratorService          *narration.Service
	roleConfigurationService *conversation.RoleConfigurationService
	speechService            *speech.Service
	workspaceUIService       *workspaceui.Service
	workspaceService         *workspacesession.Service
	runtimeIdentityManager   *runtimeIdentityManager
	infrastructureProvider   httpapi.RuntimeInfrastructureProvider
}

type runtimeAuthBootstrap struct {
	identityManager        *runtimeIdentityManager
	infrastructureProvider httpapi.RuntimeInfrastructureProvider
	store                  *runtimeauth.Store
	bootstrapToken         string
	localPairingToken      string
}

func DefaultConfig() Config {
	return Config{
		AppDataDir:                 "",
		BootstrapDeviceDisplayName: "Setta Desktop (local)",
		Host:                       "127.0.0.1",
		Port:                       0,
		Version:                    "dev",
		Stdout:                     io.Discard,
		Stderr:                     io.Discard,
		ShutdownTimeout:            5 * time.Second,
	}
}

func (config Config) Validate() error {
	if err := validateAppDataDir(config.AppDataDir); err != nil {
		return err
	}
	if config.Host == "" {
		return errors.New("host is required")
	}
	if err := validateBootstrapConfig(config); err != nil {
		return err
	}
	if err := config.validateHostBinding(); err != nil {
		return err
	}
	if err := validatePort(config.Port); err != nil {
		return err
	}
	if err := validateRuntimeDisplayNameOverride(config.RuntimeDisplayName); err != nil {
		return err
	}
	if config.Version == "" {
		return errors.New("version is required")
	}
	if config.ShutdownTimeout <= 0 {
		return errors.New("shutdown timeout must be positive")
	}
	return validateSpeechConfig(config.Speech)
}

func validateBootstrapConfig(config Config) error {
	if !config.SkipBootstrapDeviceSession && config.BootstrapDeviceDisplayName == "" {
		return errors.New("bootstrap device display name is required")
	}
	if config.EnableLocalCredentialIssuer && !config.SkipBootstrapDeviceSession {
		return errors.New("local credential issuer requires legacy bootstrap device sessions to be disabled")
	}
	return nil
}

func validateSpeechConfig(config speech.OpenAIClientConfig) error {
	if _, err := speech.NewOpenAIClient(config); err != nil {
		return fmt.Errorf("speech configuration is invalid: %w", err)
	}
	return nil
}

func validateRuntimeDisplayNameOverride(displayName string) error {
	if strings.TrimSpace(displayName) == "" {
		return nil
	}
	if _, err := runtimeidentity.NormalizeDisplayName(displayName); err != nil {
		return fmt.Errorf("runtime display name is invalid: %w", err)
	}
	return nil
}

func validateAppDataDir(appDataDir string) error {
	if appDataDir == "" {
		return errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	return nil
}

func (config Config) validateHostBinding() error {
	addr, err := netip.ParseAddr(config.Host)
	if err != nil {
		return fmt.Errorf("host must be a numeric IP address: %w", err)
	}
	if !addr.IsLoopback() && !config.AllowRemote {
		return fmt.Errorf("host must be loopback unless allow remote is enabled: %s", config.Host)
	}
	return nil
}

func validatePort(port int) error {
	if port < 0 || port > 65535 {
		return fmt.Errorf("port must be between 0 and 65535: %d", port)
	}
	return nil
}

func Start(ctx context.Context, config Config) (*Server, error) {
	config = normalizeConfig(config)
	if err := config.Validate(); err != nil {
		return nil, err
	}

	listenConfig := net.ListenConfig{}
	listener, err := listenConfig.Listen(ctx, "tcp", net.JoinHostPort(config.Host, strconv.Itoa(config.Port)))
	if err != nil {
		return nil, fmt.Errorf("bind backend listener: %w", err)
	}
	services, err := buildRuntimeServices(config)
	if err != nil {
		_ = listener.Close()
		return nil, err
	}

	server := &Server{
		closeConversationStore: services.conversationStore.Close,
		closeRuntimeAuth:       services.authStore.Close,
		drainConversationTurns: services.conversationService.Shutdown,
		drainMasterRouting:     services.masterRouteService.Shutdown,
		drainNarration:         services.narratorService.Shutdown,
		codexManager:           services.codexManager,
		server:                 newHTTPServer(config, services),
		listener:               listener,
		done:                   make(chan error, 1),
	}

	if err := json.NewEncoder(config.Stdout).Encode(ReadyEvent{
		Event:             "ready",
		Addr:              listener.Addr().String(),
		BootstrapToken:    services.bootstrapToken,
		LocalPairingToken: services.localPairingToken,
		ProtocolVersion:   httpapi.ProtocolVersion,
	}); err != nil {
		_ = listener.Close()
		closeRuntimeServicesAfterReadyFailure(config, server)
		return nil, fmt.Errorf("write ready event: %w", err)
	}

	go server.serve()
	return server, nil
}

func buildRuntimeServices(config Config) (runtimeServices, error) {
	authBootstrap, err := newRuntimeAuthBootstrap(config)
	if err != nil {
		return runtimeServices{}, err
	}
	closeAuthOnFailure := true
	defer func() {
		if closeAuthOnFailure {
			_ = authBootstrap.store.Close()
		}
	}()
	baseServices, err := newRuntimeBaseServices(config)
	if err != nil {
		return runtimeServices{}, err
	}
	closeConversationStoreOnFailure := true
	defer func() {
		if closeConversationStoreOnFailure {
			_ = baseServices.conversationStore.Close()
		}
	}()
	codexAccountService, err := codexaccount.NewService(baseServices.codexManager)
	if err != nil {
		return runtimeServices{}, fmt.Errorf("create Codex account service: %w", err)
	}
	setupStore, err := runtimesetup.NewStore(config.AppDataDir)
	if err != nil {
		return runtimeServices{}, fmt.Errorf("create runtime setup store: %w", err)
	}
	localCredentialIssuer, err := newLocalCredentialIssuer(config, authBootstrap, setupStore)
	if err != nil {
		return runtimeServices{}, err
	}

	closeAuthOnFailure = false
	closeConversationStoreOnFailure = false
	return runtimeServices{
		appearanceService:        baseServices.appearanceService,
		authStore:                authBootstrap.store,
		bootstrapToken:           authBootstrap.bootstrapToken,
		localPairingToken:        authBootstrap.localPairingToken,
		localCredentialIssuer:    localCredentialIssuer,
		codexAccountService:      codexAccountService,
		codexManager:             baseServices.codexManager,
		conversationService:      baseServices.conversationService,
		conversationInputService: baseServices.conversationInputService,
		conversationIndexService: baseServices.conversationIndexService,
		conversationStore:        baseServices.conversationStore,
		masterInputService:       baseServices.masterInputService,
		masterRouteService:       baseServices.masterRouteService,
		masterSessionService:     baseServices.masterSessionService,
		narratorService:          baseServices.narratorService,
		roleConfigurationService: baseServices.roleConfigurationService,
		speechService:            baseServices.speechService,
		workspaceUIService:       baseServices.workspaceUIService,
		workspaceService:         baseServices.workspaceService,
		runtimeIdentityManager:   authBootstrap.identityManager,
		infrastructureProvider:   authBootstrap.infrastructureProvider,
	}, nil
}

func newRuntimeAuthBootstrap(config Config) (runtimeAuthBootstrap, error) {
	identityManager, err := newRuntimeIdentityManager(config.AppDataDir, config.RuntimeDisplayName)
	if err != nil {
		return runtimeAuthBootstrap{}, err
	}
	infrastructureProvider, err := defaultRuntimeInfrastructureProvider()
	if err != nil {
		return runtimeAuthBootstrap{}, err
	}
	authStore, err := runtimeauth.NewStore(config.AppDataDir)
	if err != nil {
		return runtimeAuthBootstrap{}, fmt.Errorf("create runtime auth store: %w", err)
	}
	closeAuthOnFailure := true
	defer func() {
		if closeAuthOnFailure {
			_ = authStore.Close()
		}
	}()
	var bootstrapToken string
	if !config.SkipBootstrapDeviceSession {
		_, bootstrapToken, err = authStore.CreateBootstrapDeviceSession(context.Background(), config.BootstrapDeviceDisplayName)
		if err != nil {
			return runtimeAuthBootstrap{}, fmt.Errorf("create bootstrap device session: %w", err)
		}
	}
	var localPairingToken string
	if config.EnableLocalCredentialIssuer {
		_, localPairingToken, err = authStore.CreatePairingToken(context.Background())
		if err != nil {
			return runtimeAuthBootstrap{}, fmt.Errorf("create local enrollment pairing token: %w", err)
		}
	}
	closeAuthOnFailure = false
	return runtimeAuthBootstrap{
		identityManager:        identityManager,
		infrastructureProvider: infrastructureProvider,
		store:                  authStore,
		bootstrapToken:         bootstrapToken,
		localPairingToken:      localPairingToken,
	}, nil
}

func newLocalCredentialIssuer(
	config Config,
	authBootstrap runtimeAuthBootstrap,
	setupStore *runtimesetup.Store,
) (*localcredissuer.Service, error) {
	if !config.EnableLocalCredentialIssuer {
		return nil, nil
	}
	identity := authBootstrap.identityManager.identitySnapshot()
	managedIdentity, err := runtimeprovider.NewManagedIdentity("local-development:" + identity.RuntimeID)
	if err != nil {
		return nil, fmt.Errorf("derive local credential runtime identity: %w", err)
	}
	service, err := localcredissuer.New(localcredissuer.Config{
		BackendName:    httpapi.BackendName,
		PairingTokens:  authBootstrap.store,
		ReleaseVersion: config.Version,
		RuntimeID:      identity.RuntimeID,
		RuntimeName:    managedIdentity.Name,
		SetupStore:     setupStore,
		UserID:         "local-user-" + identity.RuntimeID,
	})
	if err != nil {
		return nil, fmt.Errorf("create local credential issuer: %w", err)
	}
	return service, nil
}

func closeRuntimeServicesAfterReadyFailure(config Config, server *Server) {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
	defer cancel()
	_ = server.shutdownNarration(shutdownCtx)
	_ = server.shutdownMasterRouting(shutdownCtx)
	_ = server.shutdownConversationStore()
	_ = server.shutdownRuntimeAuth()
	_ = server.shutdownCodex(shutdownCtx)
}

func newAppearanceService(appDataDir string) (*appearance.Service, error) {
	appearanceStore, err := appearance.NewStore(appDataDir)
	if err != nil {
		return nil, fmt.Errorf("create appearance settings store: %w", err)
	}
	appearanceService, err := appearance.NewService(appearanceStore)
	if err != nil {
		return nil, fmt.Errorf("load appearance settings: %w", err)
	}
	return appearanceService, nil
}

func newWorkspaceService(appDataDir string) (*workspacesession.Service, error) {
	appStore, err := appstate.NewStore(appDataDir)
	if err != nil {
		return nil, fmt.Errorf("create app state store: %w", err)
	}
	workspaceManager, err := workspace.NewManager(appDataDir)
	if err != nil {
		return nil, fmt.Errorf("create workspace manager: %w", err)
	}
	workspaceService, err := workspacesession.NewService(appStore, workspaceManager)
	if err != nil {
		return nil, fmt.Errorf("load workspace session: %w", err)
	}
	return workspaceService, nil
}

func newWorkspaceUIService(
	appDataDir string,
	workspaceService *workspacesession.Service,
	conversationStore *conversation.Store,
) (*workspaceui.Service, error) {
	store, err := workspaceui.NewStore(appDataDir)
	if err != nil {
		return nil, fmt.Errorf("create workspace UI store: %w", err)
	}
	observer, err := newWorkspaceUILayoutPaneBindingObserver(conversationStore)
	if err != nil {
		return nil, fmt.Errorf("create workspace UI pane binding observer: %w", err)
	}
	service, err := workspaceui.NewService(store, workspaceService, observer)
	if err != nil {
		return nil, fmt.Errorf("create workspace UI service: %w", err)
	}
	return service, nil
}

func (server *Server) Shutdown(ctx context.Context) error {
	if ctx == nil {
		return errors.New("shutdown context is required")
	}
	var shutdownErr error
	httpShutdown := server.startHTTPShutdown(ctx)
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownConversationTurns(ctx))
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownNarration(ctx))
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownMasterRouting(ctx))
	shutdownErr = firstShutdownError(shutdownErr, waitHTTPShutdown(ctx, httpShutdown))
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownConversationStore())
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownRuntimeAuth())
	shutdownErr = firstShutdownError(shutdownErr, server.shutdownCodex(ctx))
	return shutdownErr
}

func (server *Server) startHTTPShutdown(ctx context.Context) <-chan error {
	done := make(chan error, 1)
	go func() {
		done <- server.server.Shutdown(ctx)
	}()
	return done
}

func waitHTTPShutdown(ctx context.Context, done <-chan error) error {
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (server *Server) shutdownCodex(ctx context.Context) error {
	if server.codexManager == nil {
		return nil
	}
	return server.codexManager.Shutdown(ctx)
}

func (server *Server) shutdownRuntimeAuth() error {
	if server.closeRuntimeAuth != nil {
		return server.closeRuntimeAuth()
	}
	return nil
}

func firstShutdownError(current error, next error) error {
	if current != nil {
		return current
	}
	return next
}

func (server *Server) Wait() error {
	return <-server.done
}

func (server *Server) serve() {
	err := server.server.Serve(server.listener)
	if errors.Is(err, http.ErrServerClosed) {
		err = nil
	}
	server.done <- err
}

func normalizeConfig(config Config) Config {
	if config.Stdout == nil {
		config.Stdout = io.Discard
	}
	if config.Stderr == nil {
		config.Stderr = io.Discard
	}
	return config
}
