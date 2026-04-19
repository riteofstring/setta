package app

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/agenticsummarycache"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/appgenskills"
	"setta/internal/artifacts"
	"setta/internal/artifactwatch"
	"setta/internal/auth"
	"setta/internal/backendlogs"
	binarypayload "setta/internal/binary"
	"setta/internal/boundcode"
	"setta/internal/chatattachments"
	"setta/internal/chatmodes"
	"setta/internal/chatsections"
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/detachedruns"
	"setta/internal/devworktree"
	"setta/internal/externalagentconfigs"
	"setta/internal/externalagents"
	"setta/internal/filebrowser"
	"setta/internal/frontendorigins"
	"setta/internal/gitread"
	"setta/internal/httpapi"
	"setta/internal/jsonsourcewatch"
	"setta/internal/launcher"
	"setta/internal/llmconfig"
	"setta/internal/lsp"
	"setta/internal/lspcompletion"
	"setta/internal/lspsignature"
	"setta/internal/managedchat"
	"setta/internal/managedllm"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/notifications"
	"setta/internal/observability"
	"setta/internal/pathreveal"
	"setta/internal/plugins"
	"setta/internal/projectbackup"
	"setta/internal/projectshell"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/prompttemplates"
	"setta/internal/pythonenv"
	"setta/internal/realtime"
	"setta/internal/runchains"
	"setta/internal/runs"
	"setta/internal/runtime"
	"setta/internal/scriptablechat"
	"setta/internal/settingsstate"
	"setta/internal/shareartifacts"
	"setta/internal/sshx"
	"setta/internal/statemachineruns"
	"setta/internal/terminals"
	"setta/internal/tools"
	"setta/internal/transcriptionprofiles"
	"setta/internal/transcriptionsessions"
	"setta/internal/uisettings"
	"setta/internal/watchcode"
	"setta/internal/workspacelaunch"
	"setta/internal/wsapi"
	appsubsystemplugin "setta/plugins/setta-json-render-app-gen/backend"
)

type App struct {
	config          config.Config
	logger          *slog.Logger
	authService     *auth.Service
	runtime         *runtime.Manager
	projectStates   *projectstate.Registry
	deployment      *deployments.Runtime
	shareSessions   modes.ShareSessionStore
	terminals       *terminals.Service
	binaryStore     *binarypayload.Store
	runCode         *runs.Service
	agentRuns       *agentruns.Service
	agentRuntime    *agentruns.Runtime
	runChains       *runchains.Runtime
	settingsState   *settingsstate.Runtime
	websocketHub    *realtime.WebsocketHub
	listeners       *realtime.ListenerBroadcaster
	lspSync         *lsp.ProjectSynchronizer
	watchCode       *watchcode.Service
	jsonSourceWatch *jsonsourcewatch.Service
	artifactWatch   *artifactwatch.Service
	boundCode       *boundcode.Service
	promptWatcher   *prompttemplates.Watcher
	mcpServer       *mcpx.Server
	mcpClient       *mcpx.Client
	pluginRuntime   *pluginBackendRuntimeRefresher
	handler         http.Handler
}

func authServiceCurrentSessionOrNil(authService *auth.Service) *auth.CurrentSession {
	if authService == nil {
		return nil
	}
	currentSession, ok := authService.CurrentSession()
	if !ok {
		return nil
	}
	return currentSession
}

func resolveSettaServerURL(
	cfg config.Config,
	currentSession *auth.CurrentSession,
) string {
	settaServerURL := mcpx.BuildSettaServerURL(cfg.Server.Host, cfg.Server.Port)
	if settaServerURL != "" {
		return settaServerURL
	}
	if currentSession == nil {
		return ""
	}
	return mcpx.BuildSettaServerURL(
		currentSession.Metadata.Host,
		currentSession.Metadata.Port,
	)
}

type launchServices struct {
	trustedOrigins        *frontendorigins.Service
	launchIntentService   *workspacelaunch.IntentService
	localLaunchService    *workspacelaunch.LocalLaunchService
	localSessionLauncher  *launcher.LocalIDESessionLauncher
	sshRuntime            *sshx.Service
	launcherHome          *launcher.HomeService
	launcherManagement    *launcher.ManagementService
	launcherOpenWorkspace *launcher.OpenWorkspaceService
}

func launcherSessionAuthExpiryResolver(
	authService *auth.Service,
) func(now time.Time) (int64, error) {
	return func(now time.Time) (int64, error) {
		_, payload, err := authService.MintAuthCookie(now)
		if err != nil {
			return 0, err
		}
		return payload.Exp, nil
	}
}

func initializeSessionLaunchServices(
	cfg config.Config,
	authService *auth.Service,
	services *launchServices,
) error {
	trustedOrigins, err := frontendorigins.NewService(frontendorigins.Options{
		RuntimeRoot: cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		return err
	}
	services.trustedOrigins = trustedOrigins

	launchIntentService, err := workspacelaunch.NewIntentService(workspacelaunch.IntentServiceOptions{
		RuntimeRoot:    cfg.Paths.RuntimeRoot,
		TrustedOrigins: trustedOrigins,
	})
	if err != nil {
		return err
	}
	services.launchIntentService = launchIntentService

	executablePath, err := os.Executable()
	if err != nil {
		return err
	}
	localSessionLauncher, err := launcher.NewLocalIDESessionLauncher(launcher.LocalIDESessionLauncherOptions{
		ExecutablePath: executablePath,
	})
	if err != nil {
		return err
	}
	services.localSessionLauncher = localSessionLauncher

	sshRuntime, err := sshx.NewService(sshx.ServiceOptions{
		RuntimeRoot: cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		return err
	}
	services.sshRuntime = sshRuntime

	localLaunchService, err := workspacelaunch.NewLocalLaunchService(workspacelaunch.LocalLaunchServiceOptions{
		DefaultSettaHome:         cfg.Paths.SettaHome,
		DefaultProfileLookupHome: cfg.Paths.ProfileLookupHome,
		Intents:                  launchIntentService,
		TrustedOrigins:           trustedOrigins,
		Sessions:                 localSessionLauncher,
		SSH:                      sshRuntime,
		ResolveLauncherSessionAuthExpiry: launcherSessionAuthExpiryResolver(
			authService,
		),
	})
	if err != nil {
		return err
	}
	services.localLaunchService = localLaunchService
	return nil
}

func initializeIDELaunchManagementService(services *launchServices) error {
	executablePath, err := os.Executable()
	if err != nil {
		return err
	}
	launcherManagement, err := launcher.NewManagementService(launcher.ManagementServiceOptions{
		ExecutablePath: executablePath,
	})
	if err != nil {
		return err
	}
	services.launcherManagement = launcherManagement
	return nil
}

func initializeLauncherOpenWorkspaceService(
	cfg config.Config,
	authService *auth.Service,
	services *launchServices,
) error {
	launcherOpenWorkspace, err := launcher.NewOpenWorkspaceService(launcher.OpenWorkspaceServiceOptions{
		DefaultSettaHome: cfg.Paths.SettaHome,
		Home:             services.launcherHome,
		Sessions:         services.localSessionLauncher,
		TrustedOrigins:   services.trustedOrigins,
		ResolveLauncherSessionAuthExpiry: launcherSessionAuthExpiryResolver(
			authService,
		),
	})
	if err != nil {
		return err
	}
	services.launcherOpenWorkspace = launcherOpenWorkspace
	return nil
}

func initializeLaunchServices(
	cfg config.Config,
	authService *auth.Service,
	modePolicy modes.Policy,
) (launchServices, error) {
	services := launchServices{
		launcherHome: launcher.NewHomeService(launcher.HomeServiceOptions{
			EnvLookup: os.LookupEnv,
		}),
	}

	if authService.SupportsSessionAuth() {
		if err := initializeSessionLaunchServices(cfg, authService, &services); err != nil {
			return launchServices{}, err
		}
	}

	if modePolicy.IsIDE() {
		if err := initializeIDELaunchManagementService(&services); err != nil {
			return launchServices{}, err
		}
	}

	if modePolicy.IsLauncher() {
		if err := initializeLauncherOpenWorkspaceService(cfg, authService, &services); err != nil {
			return launchServices{}, err
		}
	}

	return services, nil
}

type projectServices struct {
	projectStates         *projectstate.Registry
	deploymentRuntime     *deployments.Runtime
	projectRuntime        *projectstate.Runtime
	settingsStateRuntime  *settingsstate.Runtime
	codegenValidator      projectstate.CodegenTargetValidator
	lspDiagnostics        *projectstate.LSPDiagnosticsRegistry
	lspRouter             *lsp.Router
	projectLSPSyncer      *lsp.ProjectSynchronizer
	lspCompletion         *lspcompletion.Service
	lspSignature          *lspsignature.Service
	pythonMaterializer    *codegen.PythonMaterializer
	pluginMaterializer    *codegen.PluginMaterializer
	watchCodeService      *watchcode.Service
	boundCodeService      *boundcode.Service
	watchCodeWarnings     *watchCodeWarningTracker
	codeUpdates           *codeUpdateService
	renameRefactors       *renameRefactorService
	plannerFilesRoot      string
	artifactsRoot         string
	shareSessions         modes.ShareSessionStore
	pluginDiscovery       *plugins.DiscoveryService
	pluginMutationService *plugins.Service
	pluginRouteService    httpapi.PluginRouteService
	pythonPackages        *pythonenv.Runtime
}

type projectWatchRefs struct {
	jsonSourceWatchService *jsonsourcewatch.Service
	artifactWatchService   *artifactwatch.Service
}

func closeInitializedProjectServices(services projectServices) error {
	return closeProjectStateServices(
		services.projectStates,
		services.deploymentRuntime,
		services.projectLSPSyncer,
		services.watchCodeService,
		services.boundCodeService,
		context.Background(),
	)
}

func initializeProjectServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	websocketHub *realtime.WebsocketHub,
	watchRefs *projectWatchRefs,
) (projectServices, error) {
	if modePolicy.IsDeployment() {
		return initializeDeploymentProjectServices(cfg)
	}

	services := projectServices{}
	if err := initializeWorkspacePluginServices(cfg, logger, &services); err != nil {
		return projectServices{}, err
	}
	if err := initializeWorkspaceLSPServices(cfg, logger, websocketHub, &services); err != nil {
		return projectServices{}, err
	}
	if err := openWorkspaceProjectServices(cfg, logger, websocketHub, watchRefs, &services); err != nil {
		return projectServices{}, err
	}
	if modePolicy.IsIDE() {
		if err := initializeIDEProjectEditingServices(cfg, logger, websocketHub, &services); err != nil {
			return projectServices{}, err
		}
	}
	return services, nil
}

func initializeDeploymentProjectServices(cfg config.Config) (projectServices, error) {
	services := projectServices{}
	typeRegistry, err := NewDeploymentTypeRegistry()
	if err != nil {
		return projectServices{}, err
	}
	manifest, err := deployments.LoadManifest(cfg.Paths.DeploymentRoot)
	if err != nil {
		return projectServices{}, err
	}
	registration, err := typeRegistry.ResolveStartupRegistration(
		string(cfg.Server.Mode),
		manifest,
	)
	if err != nil {
		return projectServices{}, err
	}
	listenerPython, err := pythonenv.ResolveCurrentProcessInterpreter(os.LookupEnv)
	if err != nil {
		listenerPython = ""
	}
	services.deploymentRuntime, err = registration.OpenRuntime(
		context.Background(),
		deployments.RuntimeOptions{
			DeploymentRoot: cfg.Paths.DeploymentRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			ListenerHost:   cfg.Server.Host,
			ListenerPort:   cfg.Server.Port,
			ListenerPython: listenerPython,
		},
	)
	if err != nil {
		return projectServices{}, err
	}
	services.projectRuntime = services.deploymentRuntime.Base()
	services.plannerFilesRoot = services.deploymentRuntime.Paths().DeploymentRoot
	services.artifactsRoot = services.deploymentRuntime.Paths().ArtifactsRoot
	services.shareSessions = services.deploymentRuntime

	pluginStore, err := plugins.NewStore(plugins.StoreOptions{
		WorkspaceRoot:  services.deploymentRuntime.Paths().DeploymentRoot,
		SettaFilesRoot: services.deploymentRuntime.Paths().DeploymentRoot,
		SettaHome:      services.deploymentRuntime.Paths().RuntimeRoot,
	})
	if err != nil {
		_ = closeInitializedProjectServices(services)
		return projectServices{}, err
	}
	services.pluginDiscovery, err = plugins.NewDiscoveryService(
		plugins.DiscoveryServiceOptions{
			Store:      pluginStore,
			ServerMode: cfg.Server.Mode,
		},
	)
	if err != nil {
		_ = closeInitializedProjectServices(services)
		return projectServices{}, err
	}
	services.pluginMutationService, err = plugins.NewService(plugins.ServiceOptions{
		Store:            pluginStore,
		DiscoveryService: services.pluginDiscovery,
		WorkspaceRoot:    services.deploymentRuntime.Paths().DeploymentRoot,
		SettaFilesRoot:   services.deploymentRuntime.Paths().DeploymentRoot,
		SettaHome:        services.deploymentRuntime.Paths().RuntimeRoot,
		ServerMode:       cfg.Server.Mode,
	})
	if err != nil {
		_ = closeInitializedProjectServices(services)
		return projectServices{}, err
	}
	services.pluginRouteService = services.pluginMutationService
	return services, nil
}

func initializeWorkspacePluginServices(
	cfg config.Config,
	logger *slog.Logger,
	services *projectServices,
) error {
	pythonMaterializer, err := codegen.NewPythonMaterializer(
		codegen.PythonMaterializerOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
		},
	)
	if err != nil {
		return err
	}
	services.pythonMaterializer = pythonMaterializer

	pythonPackages, err := pythonenv.NewRuntime(pythonenv.RuntimeOptions{})
	if err != nil {
		logger.Warn("python package inspection runtime unavailable", "error", err)
	}
	services.pythonPackages = pythonPackages

	pluginStore, err := plugins.NewStore(plugins.StoreOptions{
		WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		SettaHome:      cfg.Paths.SettaHome,
	})
	if err != nil {
		return err
	}
	services.pluginDiscovery, err = plugins.NewDiscoveryService(
		plugins.DiscoveryServiceOptions{
			Store:                 pluginStore,
			ServerMode:            cfg.Server.Mode,
			PackageManagerRuntime: services.pythonPackages,
		},
	)
	if err != nil {
		return err
	}
	services.pluginMutationService, err = plugins.NewService(plugins.ServiceOptions{
		Store:            pluginStore,
		DiscoveryService: services.pluginDiscovery,
		WorkspaceRoot:    cfg.Paths.WorkspaceRoot,
		SettaFilesRoot:   cfg.Paths.SettaFilesRoot,
		SettaHome:        cfg.Paths.SettaHome,
		ServerMode:       cfg.Server.Mode,
		CandidateProvider: plugins.NewProductionCandidateProvider(
			plugins.ProductionCandidateProviderOptions{
				PackageManagerRuntime: services.pythonPackages,
				SettaFilesRoot:        cfg.Paths.SettaFilesRoot,
			},
		),
		PackageManagerRuntime: services.pythonPackages,
	})
	if err != nil {
		return err
	}
	services.pluginMaterializer, err = codegen.NewPluginMaterializer(
		codegen.PluginMaterializerOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			Generator:      services.pluginMutationService,
		},
	)
	if err != nil {
		return err
	}
	services.codegenValidator = services.pluginMutationService
	services.pluginRouteService = services.pluginMutationService
	return nil
}

func initializeWorkspaceLSPServices(
	cfg config.Config,
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	services *projectServices,
) error {
	services.lspDiagnostics = projectstate.NewLSPDiagnosticsRegistry(
		projectstate.LSPDiagnosticsRegistryOptions{
			Logger: logger,
			OnChange: func(payload projectstate.LSPDiagnosticsPayload) {
				logger.Debug(
					"broadcast lsp diagnostics",
					slog.String("trace_event", "broadcast_lsp_diagnostics"),
					slog.String("project_id", strings.TrimSpace(payload.ProjectID)),
					slog.Int("code_section_count", len(payload.CodeSections)),
					slog.Int("generated_error_sections", len(payload.GenCode.Errors)),
					slog.Int("unmapped_generated_diagnostic_count", len(payload.UnmappedGenCode)),
				)
				_, _ = websocketHub.BroadcastJSON(
					context.Background(),
					realtime.NewLSPDiagnosticsMessage(payload),
					realtime.Selection{Type: realtime.ConnectionTypeFrontend},
				)
			},
		},
	)
	lspRouter, err := lsp.NewRouter(lsp.RouterOptions{
		WorkspaceRoot: cfg.Paths.WorkspaceRoot,
		Environ:       os.Environ,
	})
	if err != nil {
		return err
	}
	services.lspRouter = lspRouter
	services.projectLSPSyncer, err = lsp.NewProjectSynchronizer(
		lsp.ProjectSynchronizerOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			Service:        services.lspRouter,
			Diagnostics:    services.lspDiagnostics,
			Logger:         logger,
		},
	)
	if err != nil {
		return err
	}
	services.lspCompletion, err = lspcompletion.NewService(
		lspcompletion.ServiceOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			LSPService:     services.lspRouter,
		},
	)
	if err != nil {
		return err
	}
	services.lspSignature, err = lspsignature.NewService(lspsignature.ServiceOptions{
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		RuntimeRoot:    cfg.Paths.RuntimeRoot,
		LSPService:     services.lspRouter,
	})
	return err
}

func openWorkspaceProjectServices(
	cfg config.Config,
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	watchRefs *projectWatchRefs,
	services *projectServices,
) error {
	passwordSecrets, err := projectstate.NewFilePasswordSecretStore(cfg.Paths.RuntimeRoot)
	if err != nil {
		return err
	}
	services.projectStates, err = projectstate.OpenRegistryWithOptions(
		context.Background(),
		cfg.Paths.SettaFilesRoot,
		projectstate.StoreOptions{},
		projectstate.RegistryOptions{
			MainRuntime: projectstate.RuntimeOptions{
				PasswordSecrets:                passwordSecrets,
				PythonCodegenSectionReconciler: services.pythonMaterializer,
				WatchCodeIgnoredRoots: []string{
					cfg.Paths.SettaFilesRoot,
					cfg.Paths.RuntimeRoot,
				},
				BeforeSave: func(ctx context.Context, snapshot projectstate.Snapshot) error {
					return handleProjectMainRuntimeBeforeSave(cfg, services, snapshot)
				},
				PersistedTransform: func(document projectstate.Document) (projectstate.Document, error) {
					if err := document.ClearJSONSourceValuesForPersistence(); err != nil {
						return document, err
					}
					return document, nil
				},
				AfterSave: func(ctx context.Context, snapshot projectstate.Snapshot) error {
					return handleProjectMainRuntimeAfterSave(cfg, logger, websocketHub, watchRefs, services, ctx, snapshot)
				},
			},
			SettingsRuntime: projectstate.RuntimeOptions{
				PasswordSecrets: passwordSecrets,
				AfterSave: func(ctx context.Context, snapshot projectstate.Snapshot) error {
					return handleProjectSettingsRuntimeAfterSave(services, websocketHub, ctx, snapshot)
				},
			},
		},
	)
	if err != nil {
		return err
	}
	services.projectRuntime = services.projectStates.Main()
	if _, err := services.projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		if err := document.LoadAllJSONSourceVariantsFromDisk(cfg.Paths.WorkspaceRoot); err != nil {
			return document, err
		}
		return document, nil
	}); err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	settingsStateStore, err := settingsstate.NewStore(
		filepath.Join(cfg.Paths.SettaFilesRoot, settingsstate.DefaultFileName),
		settingsstate.StoreOptions{
			SettingsProjectPath: services.projectStates.Paths().Settings,
		},
	)
	if err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	services.settingsStateRuntime, err = settingsstate.OpenRuntime(context.Background(), settingsStateStore)
	if err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	if err := bootstrapWorkspaceDefaultsInstallProfile(
		context.Background(),
		cfg.Paths.RuntimeRoot,
		services.settingsStateRuntime,
		services.pluginMutationService,
	); err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	if err := settingsstate.EnsureProjectRuntimeBootstrapped(
		context.Background(),
		services.settingsStateRuntime,
		services.projectStates.Settings(),
	); err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	services.plannerFilesRoot = cfg.Paths.SettaFilesRoot
	services.artifactsRoot = filepath.Join(cfg.Paths.SettaFilesRoot, "artifacts")
	configureWorkspaceProjectAutoRefetchHandlers(logger, websocketHub, services)
	services.shareSessions = services.deploymentRuntime
	return nil
}

func handleProjectMainRuntimeBeforeSave(
	cfg config.Config,
	services *projectServices,
	snapshot projectstate.Snapshot,
) error {
	if err := projectstate.SaveJSONSourceFiles(snapshot.Document, cfg.Paths.WorkspaceRoot); err != nil {
		return err
	}
	settingsDocument := settingsstate.Document(nil)
	if services.settingsStateRuntime != nil {
		settingsDocument = services.settingsStateRuntime.Snapshot().Document
	}
	autoBackupPolicy, err := settingsstate.AutoBackupPolicyForDocument(settingsDocument)
	if err != nil {
		return err
	}
	_, _, err = projectbackup.MaybeCreateBackup(
		projectbackup.ProjectPath(cfg.Paths.SettaFilesRoot),
		projectbackup.BackupDir(cfg.Paths.SettaFilesRoot),
		projectbackup.AutoBackupOptions{
			Enabled:          autoBackupPolicy.Enabled,
			FrequencySeconds: autoBackupPolicy.FrequencySeconds,
			KeepLastN:        autoBackupPolicy.KeepLastN,
		},
	)
	return err
}

func handleProjectMainRuntimeAfterSave(
	cfg config.Config,
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	watchRefs *projectWatchRefs,
	services *projectServices,
	ctx context.Context,
	snapshot projectstate.Snapshot,
) error {
	if err := syncProjectAfterSaveInputs(cfg, watchRefs, services, snapshot); err != nil {
		return err
	}
	if err := materializeProjectAfterSave(logger, services, ctx, snapshot); err != nil {
		return err
	}
	return broadcastProjectValidationErrors(websocketHub, ctx, snapshot)
}

func syncProjectAfterSaveInputs(
	cfg config.Config,
	watchRefs *projectWatchRefs,
	services *projectServices,
	snapshot projectstate.Snapshot,
) error {
	if services.watchCodeService != nil {
		if err := services.watchCodeService.SyncConfigs(projectstate.WatchCodeConfigInputs(snapshot.Document)); err != nil {
			return err
		}
	}
	if err := syncJSONSourceWatchInputs(watchRefs.jsonSourceWatchService, snapshot.Document, cfg.Paths.WorkspaceRoot); err != nil {
		return err
	}
	if err := syncArtifactWatchInputs(watchRefs.artifactWatchService, snapshot.Document, cfg.Paths.SettaFilesRoot); err != nil {
		return err
	}
	if services.watchCodeWarnings != nil {
		services.watchCodeWarnings.ReconcileDocument(snapshot.Document)
	}
	if services.boundCodeService != nil {
		inputs, err := projectstate.PythonBoundCodeFileInputs(snapshot.Document, cfg.Paths.WorkspaceRoot)
		if err != nil {
			return err
		}
		if err := services.boundCodeService.SyncInputs(boundCodeServiceInputs(inputs)); err != nil {
			return err
		}
	}
	return nil
}

func materializeProjectAfterSave(
	logger *slog.Logger,
	services *projectServices,
	ctx context.Context,
	snapshot projectstate.Snapshot,
) error {
	if err := services.pythonMaterializer.MaterializeDocument(ctx, snapshot.Document); err != nil {
		return err
	}
	if services.pluginMaterializer != nil {
		if err := services.pluginMaterializer.MaterializeDocument(ctx, snapshot.Document); err != nil {
			return err
		}
	}
	if err := services.projectLSPSyncer.MaterializeDocument(ctx, snapshot.Document); err != nil {
		logger.Warn("project lsp sync failed after save", "error", err)
	}
	if err := services.lspDiagnostics.PruneDocument(snapshot.Document); err != nil {
		return err
	}
	return nil
}

func broadcastProjectValidationErrors(
	websocketHub *realtime.WebsocketHub,
	ctx context.Context,
	snapshot projectstate.Snapshot,
) error {
	validationErrors, err := projectstate.CollectAllNameValidationErrors(snapshot.Document)
	if err != nil {
		return err
	}
	for _, validationError := range validationErrors {
		if _, err := websocketHub.BroadcastJSON(
			ctx,
			realtime.NewNameValidationErrorsMessage(validationError),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		); err != nil {
			return err
		}
	}
	return nil
}

func handleProjectSettingsRuntimeAfterSave(
	services *projectServices,
	websocketHub *realtime.WebsocketHub,
	ctx context.Context,
	snapshot projectstate.Snapshot,
) error {
	if services.settingsStateRuntime == nil {
		return errors.New("settings state runtime is not configured")
	}

	currentSettings := services.settingsStateRuntime.Snapshot().Document
	nextSettings, err := settingsstate.ApplySettingsProjectDocument(currentSettings, snapshot.Document)
	if err != nil {
		return err
	}
	if reflect.DeepEqual(currentSettings, nextSettings) {
		return nil
	}

	settingsSnapshot, err := services.settingsStateRuntime.ReplaceAndSave(ctx, nextSettings)
	if err != nil {
		return err
	}
	if _, err := websocketHub.BroadcastJSON(
		ctx,
		realtime.NewSettingsUpdateMessage(settingsSnapshot.Document),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	); err != nil {
		return err
	}
	return nil
}

func configureWorkspaceProjectAutoRefetchHandlers(
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	services *projectServices,
) {
	services.projectLSPSyncer.SetCallableAutoRefetchHandlers(
		func(ctx context.Context, projectID string, sectionIDs []string) {
			if err := refetchCallableParamsAndBroadcast(
				ctx,
				services.projectStates.Main(),
				websocketHub,
				projectID,
				sectionIDs,
				services.lspSignature,
			); err != nil {
				logger.Error("lsp callable auto-refetch after symbol resolution failed", "projectConfigId", projectID, "sectionIds", sectionIDs, "error", err)
			}
		},
		func(ctx context.Context, projectID string, sectionIDs []string) {
			enabled, err := settingsstate.AutoRefetchCallableParamsOnLSPMismatchEnabled(services.settingsStateRuntime.Snapshot().Document)
			if err != nil {
				logger.Error("lsp callable mismatch refetch policy lookup failed", "projectConfigId", projectID, "sectionIds", sectionIDs, "error", err)
				return
			}
			if !enabled {
				return
			}
			if err := refetchCallableParamsAndBroadcast(
				ctx,
				services.projectStates.Main(),
				websocketHub,
				projectID,
				sectionIDs,
				services.lspSignature,
			); err != nil {
				logger.Error("lsp callable auto-refetch after mismatch failed", "projectConfigId", projectID, "sectionIds", sectionIDs, "error", err)
			}
		},
	)
}

func initializeIDEProjectEditingServices(
	cfg config.Config,
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	services *projectServices,
) error {
	services.watchCodeWarnings = newWatchCodeWarningTracker()
	watchCodeService, err := watchcode.NewService(watchcode.ServiceOptions{
		WorkspaceRoot: cfg.Paths.WorkspaceRoot,
		OnFileUpdate: func(ctx context.Context, update watchcode.FileUpdate) error {
			signatureObserver := newWatchCodeSignatureObserver(services.lspSignature)
			snapshot, didUpdate, err := services.projectStates.Main().ApplyWatchCodeFileUpdate(
				ctx,
				update.ConfigID,
				update.Path,
				update.Raw,
				update.BaselineOnly,
				update.MovedFrom,
				cfg.Paths.WorkspaceRoot,
				signatureObserver,
			)
			if err != nil {
				return err
			}
			for _, message := range services.watchCodeWarnings.ConsumeNotifications(snapshot.Document, update.ConfigID, signatureObserver.Attempts()) {
				if _, err := websocketHub.BroadcastJSON(ctx, message, realtime.Selection{Type: realtime.ConnectionTypeFrontend}); err != nil {
					return err
				}
			}
			if didUpdate {
				return broadcastFrontendProjectStateUpdate(
					ctx,
					services.projectStates.Main(),
					websocketHub,
					snapshot,
					update.ConfigID,
				)
			}
			return nil
		},
		OnFileDelete: func(ctx context.Context, request watchcode.DeleteRequest) error {
			snapshot, didUpdate, err := services.projectStates.Main().ApplyWatchCodeFileDelete(
				ctx,
				request.ConfigID,
				request.Path,
				cfg.Paths.WorkspaceRoot,
			)
			if err != nil {
				return err
			}
			services.watchCodeWarnings.ReconcileDocument(snapshot.Document)
			if didUpdate {
				return broadcastFrontendProjectStateUpdate(
					ctx,
					services.projectStates.Main(),
					websocketHub,
					snapshot,
					request.ConfigID,
				)
			}
			return nil
		},
		OnError: func(err error) {
			logger.Error("watch code runtime failed", "error", err)
		},
	})
	if err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	services.watchCodeService = watchCodeService
	if err := services.watchCodeService.SyncConfigs(projectstate.WatchCodeConfigInputs(services.projectStates.Main().Snapshot().Document)); err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	if err := initializeIDECodeMutationServices(cfg, logger, websocketHub, services); err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	return nil
}

func initializeIDECodeMutationServices(
	cfg config.Config,
	logger *slog.Logger,
	websocketHub *realtime.WebsocketHub,
	services *projectServices,
) error {
	codeUpdates, err := newCodeUpdateService(codeUpdateServiceOptions{
		ProjectState:       services.projectRuntime,
		LSPSync:            services.projectLSPSyncer,
		CallableSignatures: services.lspSignature,
		WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
		WatchCodeWarnings:  services.watchCodeWarnings,
		WebsocketHub:       websocketHub,
		Logger:             logger,
	})
	if err != nil {
		_ = closeInitializedProjectServices(*services)
		return err
	}
	services.codeUpdates = codeUpdates
	services.renameRefactors, err = newRenameRefactorService(renameRefactorServiceOptions{
		ProjectState: services.projectRuntime,
		Settings:     services.settingsStateRuntime,
		WebsocketHub: websocketHub,
	})
	if err != nil {
		return err
	}
	services.boundCodeService, err = boundcode.NewService(boundcode.ServiceOptions{
		OnFileUpdate: func(ctx context.Context, update boundcode.FileUpdate) error {
			return services.codeUpdates.ReloadBoundCodeFile(ctx, update.Raw, update.Bindings)
		},
		OnError: func(err error) {
			logger.Error("bound code file runtime failed", "error", err)
		},
	})
	if err != nil {
		return err
	}
	inputs, err := projectstate.PythonBoundCodeFileInputs(
		services.projectStates.Main().Snapshot().Document,
		cfg.Paths.WorkspaceRoot,
	)
	if err != nil {
		return err
	}
	if err := services.boundCodeService.SyncInputs(boundCodeServiceInputs(inputs)); err != nil {
		return err
	}
	return nil
}

type ideAgentServices struct {
	agentRunService       *agentruns.Service
	engineStore           *agentruns.EngineStore
	agentRunStore         *agentruns.RunStore
	agentRunRuntime       *agentruns.Runtime
	managedChatService    *managedchat.Service
	stateMachineRuntime   *statemachineruns.Runtime
	scriptableChatService *scriptablechat.Service
	chatSectionChatIDs    *chatsections.Service
	gitReadService        *gitread.Service
	projectShellService   *projectshell.Service
	notificationService   *notifications.Service
	externalConfigStore   *externalagentconfigs.Store
	externalConfigService *externalagentconfigs.Service
	externalPreflight     externalagentconfigs.Checker
	transcriptionProfiles *transcriptionprofiles.Service
	transcriptionSessions *transcriptionsessions.Service
	temporaryIDs          *mcpx.TemporaryIDStore
	externalAgentFollow   *externalagents.FollowService
	externalAgentRuntime  *externalagents.Runtime
	externalAgentChats    *externalagents.Service
	externalAgentSend     *externalagents.SendService
	externalAgentExecutor externalagents.Executor
	llmRuntime            *llmconfig.Runtime
	llmService            *llmconfig.Service
	runChainRuntime       *runchains.Runtime
}

func initializeIDEAgentServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	appSubsystemCapabilities *appSubsystemCapabilityState,
	settaServerURL string,
	currentSession *auth.CurrentSession,
	authService *auth.Service,
	websocketHub *realtime.WebsocketHub,
	projectStates *projectstate.Registry,
	projectRuntime *projectstate.Runtime,
	settingsStateRuntime *settingsstate.Runtime,
	deploymentRuntime *deployments.Runtime,
	terminalService *terminals.Service,
	mcpClient *mcpx.Client,
	mcpToolRegistry *tools.Registry,
	attachmentService *chatattachments.Service,
	backendLogService *backendlogs.Service,
	promptTemplateStore *prompttemplates.Store,
	agentProfileStore *agentprofiles.Store,
) (ideAgentServices, error) {
	services := ideAgentServices{}
	if !modePolicy.IsIDE() || projectRuntime == nil {
		return services, nil
	}
	appGenerationModes, err := newAppGenerationModeResolver(appSubsystemCapabilities)
	if err != nil {
		return ideAgentServices{}, err
	}
	if err := initializeIDEAgentStoresAndConfigs(cfg, settaServerURL, websocketHub, &services); err != nil {
		return ideAgentServices{}, err
	}
	if err := initializeIDELLMServices(cfg, settaServerURL, agentProfileStore, &services); err != nil {
		return ideAgentServices{}, err
	}
	if err := initializeIDEManagedAgentServices(
		cfg,
		websocketHub,
		projectStates,
		projectRuntime,
		settingsStateRuntime,
		terminalService,
		mcpClient,
		attachmentService,
		appGenerationModes,
		&services,
	); err != nil {
		return ideAgentServices{}, err
	}
	if err := initializeIDEExternalAgentServices(
		cfg,
		logger,
		settaServerURL,
		currentSession,
		authService,
		websocketHub,
		projectRuntime,
		deploymentRuntime,
		mcpClient,
		mcpToolRegistry,
		attachmentService,
		backendLogService,
		promptTemplateStore,
		agentProfileStore,
		appGenerationModes,
		&services,
	); err != nil {
		return ideAgentServices{}, err
	}
	return services, nil
}

func initializeIDEAgentStoresAndConfigs(
	cfg config.Config,
	settaServerURL string,
	websocketHub *realtime.WebsocketHub,
	services *ideAgentServices,
) error {
	engineStore, err := agentruns.NewEngineStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	services.engineStore = engineStore

	agentRunStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	services.agentRunStore = agentRunStore
	services.agentRunStore.AddAfterSaveListener(func(run agentruns.Run) {
		_, _ = websocketHub.BroadcastJSON(
			context.Background(),
			realtime.NewAgentRunUpdatedMessage(run),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		)
	})

	externalConfigStore, err := externalagentconfigs.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	services.externalConfigStore = externalConfigStore
	services.externalConfigService, err = externalagentconfigs.NewService(externalagentconfigs.ServiceOptions{
		Configs:        externalConfigStore,
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
		SettaServerURL: settaServerURL,
	})
	if err != nil {
		return err
	}
	if err := services.externalConfigService.SeedDefaultConfigsIfMissing(); err != nil {
		return err
	}
	if err := services.externalConfigService.ReconcileManagedCanonicalConfigs(); err != nil {
		return err
	}
	externalPreflightChecker, err := externalagentconfigs.NewSystemChecker(externalagentconfigs.SystemCheckerOptions{
		WorkspaceRoot:          cfg.Paths.WorkspaceRoot,
		ManagedAPIKeysLockRoot: cfg.Paths.RuntimeRoot,
		ProcessEnv:             llmconfig.CurrentProcessEnv(),
	})
	if err != nil {
		return err
	}
	services.externalPreflight = externalPreflightChecker
	services.temporaryIDs, err = mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(cfg.Paths.RuntimeRoot))
	return err
}

func initializeIDELLMServices(
	cfg config.Config,
	settaServerURL string,
	agentProfileStore *agentprofiles.Store,
	services *ideAgentServices,
) error {
	transcriptionStore, err := transcriptionprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	llmConfigs, err := llmconfig.Load(
		llmconfig.Path(cfg.Paths.SettaFilesRoot),
		llmconfig.LoadOptions{
			SettaServerURL: settaServerURL,
		},
	)
	if err != nil {
		return err
	}
	services.llmRuntime, err = llmconfig.NewRuntime(llmConfigs)
	if err != nil {
		return err
	}
	workspaceEnv, err := llmconfig.ReadEnvFile(filepath.Join(cfg.Paths.WorkspaceRoot, ".env"))
	if err != nil {
		return err
	}
	services.llmRuntime.UpdateAPIKeys(llmconfig.ResolveRuntimeAPIKeys(
		llmConfigs,
		workspaceEnv,
		llmconfig.CurrentProcessEnv(),
	))
	services.llmService, err = llmconfig.NewService(llmconfig.ServiceOptions{
		ConfigPath:             llmconfig.Path(cfg.Paths.SettaFilesRoot),
		ManagedAPIKeysPath:     llmconfig.ManagedAPIKeysPath(cfg.Paths.WorkspaceRoot),
		ManagedAPIKeysLockRoot: cfg.Paths.RuntimeRoot,
		Runtime:                services.llmRuntime,
	})
	if err != nil {
		return err
	}
	services.transcriptionProfiles, err = transcriptionprofiles.NewService(transcriptionprofiles.ServiceOptions{
		Profiles: transcriptionStore,
		LLM:      services.llmRuntime,
	})
	if err != nil {
		return err
	}
	services.transcriptionSessions, err = transcriptionsessions.NewService(transcriptionsessions.ServiceOptions{
		LLM: services.llmRuntime,
	})
	if err != nil {
		return err
	}
	if err := agentruns.SeedDefaultEngineConfigsIfMissing(services.engineStore); err != nil {
		return err
	}
	if err := agentprofiles.SeedDefaultProfilesIfMissing(agentProfileStore); err != nil {
		return err
	}
	return services.transcriptionProfiles.SeedDefaultProfilesIfMissing()
}

func initializeIDEManagedAgentServices(
	cfg config.Config,
	websocketHub *realtime.WebsocketHub,
	projectStates *projectstate.Registry,
	projectRuntime *projectstate.Runtime,
	settingsStateRuntime *settingsstate.Runtime,
	terminalService *terminals.Service,
	mcpClient *mcpx.Client,
	attachmentService *chatattachments.Service,
	appGenerationModes chatmodes.AppGenerationModeResolver,
	services *ideAgentServices,
) error {
	managedLiveRuntime := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{
		Broadcaster: websocketHub,
	})
	agentRunService, err := agentruns.NewService(agentruns.ServiceOptions{
		ProjectState: projectRuntime,
		Engines:      services.engineStore,
		Runs:         services.agentRunStore,
		LLM:          services.llmRuntime,
		Executor: managedllm.NewExecutor(managedllm.ExecutorOptions{
			Live:        managedLiveRuntime,
			Tools:       mcpClient,
			Attachments: attachmentService,
			ResultFollow: managedllm.NewToolResultFollowEmitter(managedllm.ToolResultFollowEmitterOptions{
				Broadcaster:  websocketHub,
				TemporaryIDs: services.temporaryIDs,
			}),
		}),
		TemporaryIDs: services.temporaryIDs,
		CompletionGuardProvider: func() (bool, error) {
			if settingsStateRuntime == nil {
				return false, errors.New("settings state runtime is not configured")
			}
			return settingsstate.CompletionGuardEnabled(settingsStateRuntime.Snapshot().Document)
		},
	})
	if err != nil {
		return err
	}
	services.agentRunService = agentRunService
	services.agentRunRuntime, err = agentruns.NewRuntime(agentruns.RuntimeOptions{
		Service:        services.agentRunService,
		LiveRunTracker: managedLiveRuntime,
	})
	if err != nil {
		return err
	}
	services.managedChatService, err = managedchat.NewService(managedchat.ServiceOptions{
		ProjectState:       projectRuntime,
		Runs:               services.agentRunStore,
		Engines:            services.engineStore,
		LLM:                services.llmRuntime,
		Starter:            services.agentRunRuntime,
		Live:               managedLiveRuntime,
		Stopper:            services.agentRunRuntime,
		AppGenerationModes: appGenerationModes,
	})
	if err != nil {
		return err
	}
	services.chatSectionChatIDs, err = chatsections.NewService(chatsections.ServiceOptions{
		ProjectState: projectRuntime,
		Runs:         services.agentRunStore,
	})
	if err != nil {
		return err
	}
	services.scriptableChatService, err = scriptablechat.NewService(scriptablechat.ServiceOptions{
		Runs:        services.agentRunStore,
		Engines:     services.engineStore,
		LLM:         services.llmRuntime,
		Tools:       mcpClient,
		Broadcaster: websocketHub,
	})
	if err != nil {
		return err
	}
	services.gitReadService, err = gitread.NewService(gitread.ServiceOptions{
		WorkspaceRoot: cfg.Paths.WorkspaceRoot,
	})
	if err != nil {
		return err
	}
	services.projectShellService, err = newIDEProjectShellService(
		projectStates,
		projectRuntime,
		settingsStateRuntime,
		terminalService,
		websocketHub,
	)
	if err != nil {
		return err
	}
	notificationStore, err := notifications.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	services.notificationService, err = notifications.NewService(notifications.ServiceOptions{
		Store: notificationStore,
	})
	return err
}

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

type appHandlerDeps struct {
	cfg                      config.Config
	logger                   *slog.Logger
	authService              *auth.Service
	trustedOrigins           *frontendorigins.Service
	modePolicy               modes.Policy
	projectStates            *projectstate.Registry
	projectRuntime           *projectstate.Runtime
	settingsStateRuntime     *settingsstate.Runtime
	deploymentRuntime        *deployments.Runtime
	shareSessions            modes.ShareSessionStore
	attachmentService        *chatattachments.Service
	pluginRouteService       httpapi.PluginRouteService
	appSubsystemCapabilities *appSubsystemCapabilityState
	websocketHub             *realtime.WebsocketHub
	uiSettingRevealResults   *realtime.UISettingRevealResultHub
	listenerBroadcaster      *realtime.ListenerBroadcaster
	listenerBuiltInInvoker   *listenerEndpointInvoker
	listenerProducer         *realtime.ListenerProducer
	terminalService          *terminals.Service
	temporaryIDs             *mcpx.TemporaryIDStore
	mcpServer                *mcpx.Server
	pathRevealService        *pathreveal.Service
	authRefreshWindowSeconds int
	worktreeName             string
	statusReadyAt            time.Time
	deploymentCatalog        *deployments.Catalog
	sharePublisher           deployments.SharePublishService
	appPublisher             deployments.AppPublishService
	launcherHome             *launcher.HomeService
	launcherManagement       *launcher.ManagementService
	launcherOpenWorkspace    *launcher.OpenWorkspaceService
	launchIntentService      *workspacelaunch.IntentService
	localLaunchService       *workspacelaunch.LocalLaunchService
	binaryStore              *binarypayload.Store
	fileBrowserService       *filebrowser.Service
	artifactService          *artifacts.Service
	shareArtifactService     *shareartifacts.Service
	runCodeService           *runs.Service
	runPlanner               *runs.Planner
	detachedRunManager       *detachedruns.Manager
	projectShellService      *projectshell.Service
	notificationService      *notifications.Service
	gitReadService           *gitread.Service
	promptTemplateStore      *prompttemplates.Store
	chatSectionChatIDs       *chatsections.Service
	codegenValidator         projectstate.CodegenTargetValidator
	pythonMaterializer       *codegen.PythonMaterializer
	lspSignature             *lspsignature.Service
	codeUpdates              *codeUpdateService
	renameRefactors          *renameRefactorService
	managedChatService       *managedchat.Service
	externalAgentSend        *externalagents.SendService
	externalAgentChats       *externalagents.Service
	externalAgentFollow      *externalagents.FollowService
	externalAgentRuntime     *externalagents.Runtime
	transcriptionProfiles    *transcriptionprofiles.Service
	transcriptionSessions    *transcriptionsessions.Service
	agentProfileStore        *agentprofiles.Store
	promptTemplateWatcher    *prompttemplates.Watcher
	appGenSkillService       *appgenskills.Service
	externalConfigService    *externalagentconfigs.Service
	externalPreflight        externalagentconfigs.Checker
	engineStore              *agentruns.EngineStore
	llmRuntime               *llmconfig.Runtime
	llmService               *llmconfig.Service
	agenticSummaryStatus     *agenticsummarycache.Service
	agentRunStore            *agentruns.RunStore
	agentRunRuntime          *agentruns.Runtime
	runChainRuntime          *runchains.Runtime
	stateMachineRuntime      *statemachineruns.Runtime
	mcpClient                *mcpx.Client
	lspDiagnostics           *projectstate.LSPDiagnosticsRegistry
	lspCompletion            *lspcompletion.Service
	projectLSPSyncer         *lsp.ProjectSynchronizer
	pluginRuntime            *pluginBackendRuntimeRefresher
}

func registerRootRoutes(r chi.Router, deps appHandlerDeps) error {
	if deps.pluginRouteService != nil {
		if err := httpapi.RegisterPluginRootRoutes(r, httpapi.PluginRootRouteDependencies{
			Service:        deps.pluginRouteService,
			Auth:           deps.authService,
			TrustedOrigins: deps.trustedOrigins,
		}); err != nil {
			return err
		}
	}
	var rootDeps httpapi.FrontendRootRouteDependencies
	if deps.attachmentService != nil {
		rootDeps.AttachmentRoot = &httpapi.AttachmentRootRouteDependencies{
			ModePolicy:    deps.modePolicy,
			ShareSessions: deps.shareSessions,
			Deployment:    deps.deploymentRuntime,
			Service:       deps.attachmentService,
		}
	}
	if err := httpapi.RegisterFrontendRootRoutes(r, rootDeps); err != nil {
		return err
	}
	return wsapi.RegisterRoutes(r, wsapi.RouteDependencies{
		Transport: wsapi.Dependencies{
			Auth:           deps.authService,
			ModePolicy:     deps.modePolicy,
			ShareSessions:  deps.shareSessions,
			TrustedOrigins: deps.trustedOrigins,
		},
		Deployment:             deps.deploymentRuntime,
		ProjectState:           deps.projectRuntime,
		Artifacts:              deps.artifactService,
		ShareArtifacts:         deps.shareArtifactService,
		WebsocketHub:           deps.websocketHub,
		UISettingRevealResults: deps.uiSettingRevealResults,
		ListenerBroadcaster:    deps.listenerBroadcaster,
		BuiltInListenerInvoker: deps.listenerBuiltInInvoker,
		ListenerProducer:       deps.listenerProducer,
		Terminals:              deps.terminalService,
		TemporaryIDs:           deps.temporaryIDs,
	})
}

func registerAuthenticatedRootRoutes(r chi.Router, deps appHandlerDeps) error {
	if deps.mcpServer == nil {
		return nil
	}
	r.Handle("/mcp", deps.mcpServer.Handler())
	r.Handle("/mcp/", deps.mcpServer.Handler())
	return httpapi.RegisterMCPRootRoutes(r, httpapi.MCPRootRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Server:       deps.mcpServer,
		ProjectState: deps.projectRuntime,
		WebsocketHub: deps.websocketHub,
	})
}

func registerAPIRoutes(r chi.Router, deps appHandlerDeps) error {
	var apiDeps httpapi.FrontendAPIRouteDependencies
	if deps.pluginRouteService != nil {
		apiDeps.Plugin = &httpapi.PluginRouteDependencies{
			ModePolicy: deps.modePolicy,
			Service:    deps.pluginRouteService,
		}
	}
	apiDeps.Status = httpapi.StatusRouteDependencies{
		ModePolicy:               deps.modePolicy,
		SettaHome:                deps.cfg.Paths.SettaHome,
		GlobalSettaFilesBase:     deps.cfg.User.GlobalSettaFilesBase,
		ActiveSettaFilesLocation: deps.cfg.Paths.ActiveSettaFilesLocation(),
		SettaFilesRoot:           deps.cfg.Paths.SettaFilesRoot,
		RevealPath:               deps.pathRevealService,
		AuthRefreshWindowSeconds: deps.authRefreshWindowSeconds,
		WorktreeName:             deps.worktreeName,
		ReadyAt:                  deps.statusReadyAt,
	}
	apiDeps.Docstring = httpapi.DocstringRouteDependencies{ModePolicy: deps.modePolicy}
	apiDeps.Settings = httpapi.SettingsRouteDependencies{
		ModePolicy:    deps.modePolicy,
		SettingsState: deps.settingsStateRuntime,
		WebsocketHub:  deps.websocketHub,
		PluginRuntime: deps.pluginRouteService,
	}
	apiDeps.Listener = httpapi.ListenerRouteDependencies{
		ModePolicy:          deps.modePolicy,
		ShareSessions:       deps.shareSessions,
		ProjectState:        deps.projectRuntime,
		Deployment:          deps.deploymentRuntime,
		ListenerBroadcaster: deps.listenerBroadcaster,
	}
	apiDeps.ShareDeploymentIDE = httpapi.ShareDeploymentIDERouteDependencies{
		ModePolicy:     deps.modePolicy,
		ProjectState:   deps.projectRuntime,
		Catalog:        deps.deploymentCatalog,
		SharePublisher: deps.sharePublisher,
	}
	if deps.modePolicy.IsShare() {
		apiDeps.ShareDeployment = httpapi.DeploymentRouteDependencies{
			ModePolicy: deps.modePolicy,
			Deployment: deps.deploymentRuntime,
		}
	}
	if deps.modePolicy.IsApp() {
		apiDeps.AppDeployment = httpapi.DeploymentRouteDependencies{
			ModePolicy: deps.modePolicy,
			Deployment: deps.deploymentRuntime,
		}
	}
	apiDeps.LauncherHome = httpapi.LauncherHomeRouteDependencies{
		ModePolicy:       deps.modePolicy,
		Auth:             deps.authService,
		DefaultSettaHome: deps.cfg.Paths.SettaHome,
		Home:             deps.launcherHome,
		OpenWorkspace:    deps.launcherOpenWorkspace,
	}
	apiDeps.LauncherManagement = httpapi.LauncherManagementRouteDependencies{
		ModePolicy:       deps.modePolicy,
		DefaultSettaHome: deps.cfg.Paths.SettaHome,
		Manager:          deps.launcherManagement,
	}
	apiDeps.WorkspaceLaunch = httpapi.WorkspaceLaunchRouteDependencies{
		ModePolicy: deps.modePolicy,
		Auth:       deps.authService,
		Intents:    deps.launchIntentService,
		Launch:     deps.localLaunchService,
	}
	apiDeps.Binary = httpapi.BinaryRouteDependencies{
		ModePolicy:    deps.modePolicy,
		ShareSessions: deps.shareSessions,
		Deployment:    deps.deploymentRuntime,
		Store:         deps.binaryStore,
	}
	apiDeps.Attachment = httpapi.AttachmentRouteDependencies{
		ModePolicy:    deps.modePolicy,
		ShareSessions: deps.shareSessions,
		Deployment:    deps.deploymentRuntime,
		Service:       deps.attachmentService,
	}
	apiDeps.FileBrowser = httpapi.FileBrowserRouteDependencies{
		ModePolicy:     deps.modePolicy,
		DeploymentRoot: deps.cfg.Paths.DeploymentRoot,
		Browser:        deps.fileBrowserService,
	}
	apiDeps.Artifact = httpapi.ArtifactRouteDependencies{
		ModePolicy:     deps.modePolicy,
		ShareSessions:  deps.shareSessions,
		Artifacts:      deps.artifactService,
		ShareArtifacts: deps.shareArtifactService,
	}
	apiDeps.Terminal = httpapi.TerminalRouteDependencies{
		ModePolicy:    deps.modePolicy,
		ShareSessions: deps.shareSessions,
		Deployment:    deps.deploymentRuntime,
		Terminals:     deps.terminalService,
		RunCode:       deps.runCodeService,
	}
	apiDeps.DetachedRun = httpapi.DetachedRunRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Planner:      deps.runPlanner,
		Runs:         deps.detachedRunManager,
		ProjectState: deps.projectRuntime,
	}
	apiDeps.ProjectShell = httpapi.ProjectShellRouteDependencies{
		ModePolicy:    deps.modePolicy,
		Shell:         deps.projectShellService,
		Notifications: deps.notificationService,
	}
	apiDeps.Git = httpapi.GitRouteDependencies{
		ModePolicy: deps.modePolicy,
		Git:        deps.gitReadService,
	}
	apiDeps.Project = httpapi.ProjectRouteDependencies{
		ModePolicy:                     deps.modePolicy,
		WorkspaceRoot:                  deps.cfg.Paths.WorkspaceRoot,
		ProjectState:                   deps.projectRuntime,
		SettingsProjectState:           deps.projectStates.Settings(),
		WebsocketHub:                   deps.websocketHub,
		PromptTemplates:                deps.promptTemplateStore,
		ShareSessions:                  deps.shareSessions,
		Deployment:                     deps.deploymentRuntime,
		SettingsState:                  deps.settingsStateRuntime,
		EdgeExpressionBuilder:          projectstate.EdgeExpressionBuilderFunc(codegen.BuildPythonEdgeExpression),
		CodegenTargetValidator:         deps.codegenValidator,
		PythonCodegenSectionReconciler: deps.pythonMaterializer,
		CallableSignatures:             deps.lspSignature,
	}
	if deps.chatSectionChatIDs != nil {
		apiDeps.Project.ChatSectionChatID = deps.chatSectionChatIDs.GetChatID
	}
	if deps.codeUpdates != nil {
		apiDeps.Project.SetCode = deps.codeUpdates.SetCode
		apiDeps.Project.FormatCode = deps.codeUpdates.FormatCode
	}
	if deps.renameRefactors != nil {
		apiDeps.Project.SetSectionName = deps.renameRefactors.SetSectionName
		apiDeps.Project.AcceptRenameRefactor = deps.renameRefactors.AcceptRenameRefactor
		apiDeps.Project.DeclineRenameRefactor = deps.renameRefactors.DeclineRenameRefactor
	}
	appDefinitionService := appsubsystemplugin.NewAppDefinitionService(deps.projectRuntime)
	apiDeps.AppDefinition = httpapi.AppDefinitionRouteDependencies{
		ModePolicy: deps.modePolicy,
		Service:    appDefinitionService,
	}
	apiDeps.AI = httpapi.AIRouteDependencies{
		ModePolicy:            deps.modePolicy,
		Deployment:            deps.deploymentRuntime,
		ManagedChats:          deps.managedChatService,
		ExternalAgentSend:     deps.externalAgentSend,
		ExternalAgentChats:    deps.externalAgentChats,
		ExternalAgentFollow:   deps.externalAgentFollow,
		ExternalAgentRuns:     deps.externalAgentRuntime,
		TranscriptionProfiles: deps.transcriptionProfiles,
		TranscriptionSessions: deps.transcriptionSessions,
		Sessions:              deps.authService,
	}
	apiDeps.AgentProfile = httpapi.AgentProfileRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Profiles:     deps.agentProfileStore,
		Deployment:   deps.deploymentRuntime,
		WebsocketHub: deps.websocketHub,
	}
	apiDeps.PromptTemplate = httpapi.PromptTemplateRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Templates:    deps.promptTemplateStore,
		Watcher:      deps.promptTemplateWatcher,
		ProjectState: deps.projectRuntime,
		Deployment:   deps.deploymentRuntime,
		WebsocketHub: deps.websocketHub,
	}
	apiDeps.AppGenSkill = httpapi.AppGenSkillRouteDependencies{
		ModePolicy: deps.modePolicy,
		Service:    deps.appGenSkillService,
	}
	apiDeps.ExternalAgentConfig = httpapi.ExternalAgentConfigRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Configs:      deps.externalConfigService,
		Preflight:    deps.externalPreflight,
		Deployment:   deps.deploymentRuntime,
		WebsocketHub: deps.websocketHub,
	}
	apiDeps.EngineConfig = httpapi.EngineConfigRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Engines:      deps.engineStore,
		LLM:          deps.llmRuntime,
		WebsocketHub: deps.websocketHub,
	}
	apiDeps.TranscriptionProfile = httpapi.TranscriptionProfileRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Profiles:     deps.transcriptionProfiles,
		Deployment:   deps.deploymentRuntime,
		WebsocketHub: deps.websocketHub,
	}
	apiDeps.LLM = httpapi.LLMRouteDependencies{
		ModePolicy:   deps.modePolicy,
		Service:      deps.llmService,
		WebsocketHub: deps.websocketHub,
	}
	apiDeps.AgenticSummaryCache = httpapi.AgenticSummaryCacheRouteDependencies{
		ModePolicy:   deps.modePolicy,
		ProjectState: deps.projectRuntime,
		Statuses:     deps.agenticSummaryStatus,
	}
	apiDeps.AgentRun = httpapi.AgentRunRouteDependencies{
		ModePolicy: deps.modePolicy,
		Profiles:   deps.agentProfileStore,
		Runs:       deps.agentRunStore,
		Managed:    deps.agentRunRuntime,
		Chains:     deps.runChainRuntime,
	}
	apiDeps.StateMachine = httpapi.StateMachineRunRouteDependencies{
		ModePolicy:    deps.modePolicy,
		ShareSessions: deps.deploymentRuntime,
		Runtime:       deps.stateMachineRuntime,
	}
	apiDeps.MCP = httpapi.MCPRouteDependencies{
		Logger:                   deps.logger,
		ModePolicy:               deps.modePolicy,
		LLMConfigPath:            mcpx.LLMConfigPath(deps.cfg.Paths.SettaFilesRoot),
		ActiveSettaFilesLocation: deps.cfg.Paths.ActiveSettaFilesLocation(),
		Client:                   deps.mcpClient,
		ExternalStatusProvider: externalMCPStatusProvider{
			runtime: deps.externalAgentRuntime,
			send:    deps.externalAgentSend,
		},
	}
	apiDeps.LSP = httpapi.LSPRouteDependencies{
		ModePolicy:    deps.modePolicy,
		ProjectState:  deps.projectRuntime,
		Diagnostics:   deps.lspDiagnostics,
		Completions:   deps.lspCompletion,
		Admin:         newWorkspaceLSPAdmin(deps.projectLSPSyncer, deps.pluginRuntime),
		WebsocketHub:  deps.websocketHub,
		PluginRuntime: deps.pluginRouteService,
	}
	return httpapi.RegisterFrontendAPIRoutes(
		r,
		apiDeps,
		appsubsystemplugin.BuildFrontendAPIRouteRegistrations(
			appsubsystemplugin.FrontendRouteRegistrationOptions{
				Capabilities:              deps.appSubsystemCapabilities,
				API:                       apiDeps,
				AppDeploymentIDEPublisher: deps.appPublisher,
			},
		),
	)
}

func newAppHandler(deps appHandlerDeps) (http.Handler, error) {
	return httpapi.NewHandler(httpapi.Dependencies{
		Logger:         deps.logger,
		Info:           httpapi.NewConfigInfoService(deps.cfg, deps.authService.AuthCookieBaseName()),
		Auth:           deps.authService,
		TrustedOrigins: deps.trustedOrigins,
		ModePolicy:     deps.modePolicy,
		RegisterRoot: func(r chi.Router) {
			if err := registerRootRoutes(r, deps); err != nil {
				panic(err)
			}
		},
		RegisterAuthenticatedRoot: func(r chi.Router) {
			if err := registerAuthenticatedRootRoutes(r, deps); err != nil {
				panic(err)
			}
		},
		Register: func(r chi.Router) {
			if err := registerAPIRoutes(r, deps); err != nil {
				panic(err)
			}
		},
	})
}

type appBaseServices struct {
	manager           *runtime.Manager
	websocketHub      *realtime.WebsocketHub
	authService       *auth.Service
	currentSession    *auth.CurrentSession
	settaServerURL    string
	mcpToolRegistry   *tools.Registry
	mcpClient         *mcpx.Client
	backendLogService *backendlogs.Service
}

type appWorkspaceServices struct {
	terminalService      *terminals.Service
	binaryStore          *binarypayload.Store
	fileBrowserService   *filebrowser.Service
	artifactService      *artifacts.Service
	shareArtifactService *shareartifacts.Service
	attachmentService    *chatattachments.Service
	agentProfileStore    *agentprofiles.Store
	promptTemplateStore  *prompttemplates.Store
	agenticSummaryStatus *agenticsummarycache.Service
	appGenSkillService   *appgenskills.Service
	pathRevealService    *pathreveal.Service
}

type appRuntimeServices struct {
	ideAgents              ideAgentServices
	runPlanner             *runs.Planner
	listenerBroadcaster    *realtime.ListenerBroadcaster
	uiSettingRevealResults *realtime.UISettingRevealResultHub
	listenerProducer       *realtime.ListenerProducer
	promptTemplateWatcher  *prompttemplates.Watcher
	uiSettingRevealService uisettings.RevealService
	runCodeService         *runs.Service
	detachedRunManager     *detachedruns.Manager
}

type appPlatformServices struct {
	deploymentCatalog        *deployments.Catalog
	sharePublisher           deployments.SharePublishService
	appPublisher             deployments.AppPublishService
	pluginRuntime            *pluginBackendRuntimeRefresher
	pluginRouteService       httpapi.PluginRouteService
	appSubsystemCapabilities *appSubsystemCapabilityState
	mcpServer                *mcpx.Server
}

type appHandlerServices struct {
	handler                http.Handler
	jsonSourceWatchService *jsonsourcewatch.Service
	artifactWatchService   *artifactwatch.Service
}

func initializeAppBaseServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
) (appBaseServices, error) {
	services := appBaseServices{
		manager:         runtime.New(context.Background(), logger),
		websocketHub:    realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}),
		mcpToolRegistry: tools.NewRegistry(),
	}
	authService, err := auth.NewService(auth.Options{
		Mode:              cfg.Server.Mode,
		RuntimeRoot:       cfg.Paths.RuntimeRoot,
		ProfileCookieName: cfg.Paths.AuthCookieName,
		EnvLookup:         os.LookupEnv,
	})
	if err != nil {
		return appBaseServices{}, err
	}
	services.authService = authService
	if modePolicy.IsIDE() {
		services.mcpClient, err = newInternalMCPClient(cfg, logger, authService)
		if err != nil {
			return appBaseServices{}, err
		}
	}
	services.currentSession = authServiceCurrentSessionOrNil(services.authService)
	services.settaServerURL = resolveSettaServerURL(cfg, services.currentSession)
	services.backendLogService, err = backendlogs.NewService(backendlogs.ServiceOptions{
		Logger:       logger,
		WebsocketHub: services.websocketHub,
		EnvLookup:    os.LookupEnv,
	})
	if err != nil {
		return appBaseServices{}, err
	}
	return services, nil
}

func closeProjectAndTerminal(projectServices projectServices, terminalService *terminals.Service) error {
	return errors.Join(
		closeInitializedProjectServices(projectServices),
		closeTerminalService(terminalService, context.Background()),
	)
}

func closeTerminalService(service *terminals.Service, ctx context.Context) error {
	if service == nil {
		return nil
	}
	return service.Close(ctx)
}

func initializeAppWorkspaceRuntimeServices(
	cfg config.Config,
	modePolicy modes.Policy,
	authService *auth.Service,
	websocketHub *realtime.WebsocketHub,
	projectServices projectServices,
	services *appWorkspaceServices,
) error {
	var err error
	if modePolicy.IsIDE() {
		services.fileBrowserService, err = filebrowser.NewService(filebrowser.ServiceOptions{
			WorkspaceRoot:        cfg.Paths.WorkspaceRoot,
			SettaFilesRoot:       cfg.Paths.SettaFilesRoot,
			RuntimeRoot:          cfg.Paths.RuntimeRoot,
			GlobalSettaFilesBase: cfg.User.GlobalSettaFilesBase,
			BinaryStore:          services.binaryStore,
			Sessions:             authService,
		})
		if err != nil {
			return err
		}
		services.artifactService, err = artifacts.NewService(artifacts.ServiceOptions{
			WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			ArtifactsRoot:  projectServices.artifactsRoot,
			BinaryStore:    services.binaryStore,
		})
		if err != nil {
			return err
		}
	}
	if projectServices.deploymentRuntime != nil {
		services.shareArtifactService, err = shareartifacts.NewService(shareartifacts.ServiceOptions{
			Deployment:   projectServices.deploymentRuntime,
			BinaryStore:  services.binaryStore,
			WebsocketHub: websocketHub,
		})
		if err != nil {
			return err
		}
	}
	if projectServices.projectRuntime == nil {
		return nil
	}
	services.attachmentService, err = chatattachments.NewService(chatattachments.ServiceOptions{
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		Host:           cfg.Server.Host,
		Port:           cfg.Server.Port,
		ProjectState:   projectServices.projectRuntime,
		Deployment:     projectServices.deploymentRuntime,
		Sessions:       authService,
	})
	return err
}

func initializeAppWorkspaceIDEHelpers(
	cfg config.Config,
	modePolicy modes.Policy,
	services *appWorkspaceServices,
) error {
	if !modePolicy.IsIDE() {
		return nil
	}
	appGenSkillService, err := appgenskills.NewService(appgenskills.ServiceOptions{
		WorkspaceRoot: cfg.Paths.WorkspaceRoot,
		LookupEnv:     os.LookupEnv,
	})
	if err != nil {
		return err
	}
	services.appGenSkillService = appGenSkillService
	services.pathRevealService, err = pathreveal.NewService(pathreveal.ServiceOptions{
		WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		Skills:         services.appGenSkillService,
	})
	return err
}

func initializeAppWorkspaceServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	authService *auth.Service,
	websocketHub *realtime.WebsocketHub,
	projectServices projectServices,
) (appWorkspaceServices, error) {
	services := appWorkspaceServices{}
	var err error
	services.terminalService, err = terminals.New(terminals.Options{
		Logger: logger,
	})
	if err != nil {
		_ = closeInitializedProjectServices(projectServices)
		return appWorkspaceServices{}, err
	}
	services.binaryStore, err = binarypayload.NewStoreForRuntimeRoot(cfg.Paths.RuntimeRoot)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, services.terminalService)
		return appWorkspaceServices{}, err
	}
	if err := initializeAppWorkspaceRuntimeServices(
		cfg,
		modePolicy,
		authService,
		websocketHub,
		projectServices,
		&services,
	); err != nil {
		_ = closeProjectAndTerminal(projectServices, services.terminalService)
		return appWorkspaceServices{}, err
	}
	services.agentProfileStore, err = agentprofiles.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, services.terminalService)
		return appWorkspaceServices{}, err
	}
	services.promptTemplateStore, err = prompttemplates.NewStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, services.terminalService)
		return appWorkspaceServices{}, err
	}
	services.agenticSummaryStatus, err = agenticsummarycache.NewService(cfg.Paths.SettaFilesRoot)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, services.terminalService)
		return appWorkspaceServices{}, err
	}
	if err := initializeAppWorkspaceIDEHelpers(cfg, modePolicy, &services); err != nil {
		_ = closeProjectAndTerminal(projectServices, services.terminalService)
		return appWorkspaceServices{}, err
	}
	return services, nil
}

func initializeAppRuntimeServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	base appBaseServices,
	projectServices projectServices,
	workspaceServices appWorkspaceServices,
	appSubsystemCapabilities *appSubsystemCapabilityState,
) (appRuntimeServices, error) {
	services := appRuntimeServices{
		uiSettingRevealResults: realtime.NewUISettingRevealResultHub(),
	}
	var err error
	services.ideAgents, err = initializeIDEAgentServices(
		cfg,
		logger,
		modePolicy,
		appSubsystemCapabilities,
		base.settaServerURL,
		base.currentSession,
		base.authService,
		base.websocketHub,
		projectServices.projectStates,
		projectServices.projectRuntime,
		projectServices.settingsStateRuntime,
		projectServices.deploymentRuntime,
		workspaceServices.terminalService,
		base.mcpClient,
		base.mcpToolRegistry,
		workspaceServices.attachmentService,
		base.backendLogService,
		workspaceServices.promptTemplateStore,
		workspaceServices.agentProfileStore,
	)
	if err != nil {
		return appRuntimeServices{}, err
	}
	services.runPlanner, err = runs.NewPlanner(runs.PlannerOptions{
		ProjectState:   projectServices.projectRuntime,
		SettaFilesRoot: projectServices.plannerFilesRoot,
		RuntimeRoot:    cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		return appRuntimeServices{}, err
	}
	services.listenerBroadcaster = realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: base.websocketHub,
		TemporaryIDs: services.ideAgents.temporaryIDs,
	})
	services.listenerProducer = realtime.NewListenerProducer(realtime.ListenerProducerOptions{
		Broadcaster:  services.listenerBroadcaster,
		ProjectState: projectServices.projectRuntime,
		Deployment:   projectServices.deploymentRuntime,
	})
	services.promptTemplateWatcher, err = prompttemplates.NewWatcher(prompttemplates.WatcherOptions{
		Store:    workspaceServices.promptTemplateStore,
		Interval: 100 * time.Millisecond,
		OnTemplatesUpdated: func(ctx context.Context, templates []prompttemplates.Template) error {
			_, err := base.websocketHub.BroadcastJSON(
				ctx,
				realtime.NewPromptTemplatesUpdatedMessage(templates),
				realtime.Selection{Type: realtime.ConnectionTypeFrontend},
			)
			return err
		},
		OnParseError: func(ctx context.Context, _ error) error {
			return base.backendLogService.LogAndBroadcast(ctx, backendlogs.LogRequest{
				Severity: backendlogs.SeverityError,
				Message:  "Failed to parse prompt templates; keeping previous prompts",
			})
		},
	})
	if err != nil {
		return appRuntimeServices{}, err
	}
	services.uiSettingRevealService, err = uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: base.websocketHub,
		Results:   services.uiSettingRevealResults,
	})
	if err != nil {
		return appRuntimeServices{}, err
	}
	services.runCodeService, err = runs.NewService(runs.ServiceOptions{
		Planner:           services.runPlanner,
		ProjectState:      projectServices.projectRuntime,
		SettingsState:     projectServices.settingsStateRuntime,
		DeploymentRuntime: projectServices.deploymentRuntime,
		Terminals:         workspaceServices.terminalService,
		BackendLogs:       base.backendLogService,
		BinaryStore:       workspaceServices.binaryStore,
		ListenerProducer:  services.listenerProducer,
		ArtifactsRoot:     projectServices.artifactsRoot,
	})
	if err != nil {
		return appRuntimeServices{}, err
	}
	services.detachedRunManager, err = detachedruns.NewManager(detachedruns.ManagerOptions{
		RuntimeRoot: cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		return appRuntimeServices{}, err
	}
	return services, nil
}

func initializeAppDeploymentPublishers(
	cfg config.Config,
	modePolicy modes.Policy,
	services *appPlatformServices,
) error {
	if !modePolicy.IsIDE() {
		return nil
	}
	catalogRoot, err := deployments.DefaultCatalogRoot(cfg.Paths.SettaFilesRoot)
	if err != nil {
		return err
	}
	services.deploymentCatalog, err = deployments.NewCatalog(deployments.CatalogOptions{
		Root: catalogRoot,
	})
	if err != nil {
		return err
	}
	services.sharePublisher, err = deployments.NewSharePublisher(deployments.SharePublisherOptions{
		Catalog:        services.deploymentCatalog,
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
	})
	if err != nil {
		return err
	}
	services.appPublisher, err = appsubsystemplugin.NewAppPublishService(deployments.AppPublisherOptions{
		Catalog:        services.deploymentCatalog,
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		WorkspaceRoot:  cfg.Paths.WorkspaceRoot,
	})
	return err
}

func configureAppPluginRuntime(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	projectServices projectServices,
	services *appPlatformServices,
) {
	if !modePolicy.IsIDE() || projectServices.pluginDiscovery == nil {
		return
	}
	services.pluginRuntime = &pluginBackendRuntimeRefresher{
		service:                  projectServices.pluginMutationService,
		logger:                   logger,
		runtimeRoot:              cfg.Paths.RuntimeRoot,
		settings:                 projectServices.settingsStateRuntime,
		lspRouter:                projectServices.lspRouter,
		projectState:             projectServices.projectRuntime,
		projectSync:              projectServices.projectLSPSyncer,
		appSubsystemCapabilities: services.appSubsystemCapabilities,
	}
	projectServices.pluginMutationService.SetRestartCallback(func(ctx context.Context) (bool, error) {
		if services.pluginRuntime == nil {
			return false, errors.New("plugin backend runtime refresher is not configured")
		}
		if _, err := services.pluginRuntime.Refresh(ctx); err != nil {
			return false, err
		}
		return true, nil
	})
	services.pluginRouteService = newPluginMutationRuntimeService(
		projectServices.pluginMutationService,
		services.pluginRuntime,
		services.appSubsystemCapabilities,
	)
}

func initializeAppMCPServer(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	base appBaseServices,
	projectServices projectServices,
	workspaceServices appWorkspaceServices,
	runtimeServices appRuntimeServices,
	services *appPlatformServices,
) error {
	if !modePolicy.IsIDE() {
		return nil
	}
	mcpServer, err := mcpx.NewServer(mcpx.ServerOptions{
		Logger:                       logger,
		Registry:                     base.mcpToolRegistry,
		WorkspaceRoot:                cfg.Paths.WorkspaceRoot,
		ProjectState:                 projectServices.projectRuntime,
		SkipDefaultAppSubsystemTools: true,
		AfterProjectStateMutation: func(ctx context.Context, projectID string) error {
			return broadcastFrontendProjectStateUpdate(
				ctx,
				projectServices.projectStates.Main(),
				base.websocketHub,
				projectServices.projectStates.Main().Snapshot(),
				projectID,
			)
		},
		CodegenTargetValidator:         projectServices.codegenValidator,
		PythonCodegenSectionReconciler: projectServices.pythonMaterializer,
		CodeUpdates:                    projectServices.codeUpdates,
		SettingsState:                  projectServices.settingsStateRuntime,
		SectionNames:                   projectServices.renameRefactors,
		CallableSignatures:             projectServices.lspSignature,
		PluginMutations:                services.pluginRouteService,
		PythonPackages:                 projectServices.pythonPackages,
		LSPDiagnostics:                 projectServices.lspDiagnostics,
		MCPStatuses:                    base.mcpClient,
		Terminals:                      workspaceServices.terminalService,
		DocsRoot:                       filepath.Join(cfg.Paths.WorkspaceRoot, "docs"),
		TemporaryIDMapPath:             mcpx.TemporaryIDMapPath(cfg.Paths.RuntimeRoot),
		AgentProfiles:                  workspaceServices.agentProfileStore,
		PromptTemplates:                workspaceServices.promptTemplateStore,
		ExternalAgentConfigs:           runtimeServices.ideAgents.externalConfigService,
		LLMAPIKeys:                     runtimeServices.ideAgents.llmService,
		AgentRuns:                      runtimeServices.ideAgents.agentRunService,
		UISettingReveals:               runtimeServices.uiSettingRevealService,
		StateMachineRuns:               runtimeServices.ideAgents.stateMachineRuntime,
		ToolInvocations:                runtimeServices.ideAgents.externalAgentRuntime,
	})
	if err != nil {
		return err
	}
	services.mcpServer = mcpServer
	if services.pluginRuntime == nil {
		return nil
	}
	services.pluginRuntime.mcpServer = services.mcpServer
	if err := services.pluginRuntime.Initialize(context.Background()); err != nil {
		_ = errors.Join(
			closeMCPClient(base.mcpClient, context.Background()),
			closeSettingsState(projectServices.settingsStateRuntime),
			services.pluginRuntime.Close(context.Background()),
		)
		return err
	}
	return nil
}

func initializeAppPlatformServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	base appBaseServices,
	projectServices projectServices,
	workspaceServices appWorkspaceServices,
	runtimeServices appRuntimeServices,
	appSubsystemCapabilities *appSubsystemCapabilityState,
) (appPlatformServices, error) {
	services := appPlatformServices{
		pluginRouteService:       projectServices.pluginRouteService,
		appSubsystemCapabilities: appSubsystemCapabilities,
	}
	if err := initializeAppDeploymentPublishers(cfg, modePolicy, &services); err != nil {
		return appPlatformServices{}, err
	}
	configureAppPluginRuntime(cfg, logger, modePolicy, projectServices, &services)
	if err := initializeAppMCPServer(
		cfg,
		logger,
		modePolicy,
		base,
		projectServices,
		workspaceServices,
		runtimeServices,
		&services,
	); err != nil {
		return appPlatformServices{}, err
	}
	return services, nil
}

func initializeAppHandlerAndWatchServices(
	cfg config.Config,
	logger *slog.Logger,
	modePolicy modes.Policy,
	base appBaseServices,
	launchServices launchServices,
	projectServices projectServices,
	workspaceServices appWorkspaceServices,
	runtimeServices appRuntimeServices,
	platformServices appPlatformServices,
	watchRefs *projectWatchRefs,
) (appHandlerServices, error) {
	services := appHandlerServices{}
	authRefreshWindowSeconds := int(base.authService.AuthCookieRefreshWindow() / time.Second)
	worktreeName := devworktree.ActiveName()
	statusReadyAt := time.Now().UTC()
	listenerBuiltInInvoker, err := newListenerEndpointInvoker(
		runtimeServices.ideAgents.scriptableChatService,
		projectServices.projectRuntime,
		projectServices.deploymentRuntime,
		runtimeServices.ideAgents.chatSectionChatIDs,
		platformServices.pluginRouteService,
	)
	if err != nil {
		return appHandlerServices{}, err
	}
	services.handler, err = newAppHandler(appHandlerDeps{
		cfg:                      cfg,
		logger:                   logger,
		authService:              base.authService,
		trustedOrigins:           launchServices.trustedOrigins,
		modePolicy:               modePolicy,
		projectStates:            projectServices.projectStates,
		projectRuntime:           projectServices.projectRuntime,
		settingsStateRuntime:     projectServices.settingsStateRuntime,
		deploymentRuntime:        projectServices.deploymentRuntime,
		shareSessions:            projectServices.shareSessions,
		attachmentService:        workspaceServices.attachmentService,
		pluginRouteService:       platformServices.pluginRouteService,
		appSubsystemCapabilities: platformServices.appSubsystemCapabilities,
		websocketHub:             base.websocketHub,
		uiSettingRevealResults:   runtimeServices.uiSettingRevealResults,
		listenerBroadcaster:      runtimeServices.listenerBroadcaster,
		listenerBuiltInInvoker:   listenerBuiltInInvoker,
		listenerProducer:         runtimeServices.listenerProducer,
		terminalService:          workspaceServices.terminalService,
		temporaryIDs:             runtimeServices.ideAgents.temporaryIDs,
		mcpServer:                platformServices.mcpServer,
		pathRevealService:        workspaceServices.pathRevealService,
		authRefreshWindowSeconds: authRefreshWindowSeconds,
		worktreeName:             worktreeName,
		statusReadyAt:            statusReadyAt,
		deploymentCatalog:        platformServices.deploymentCatalog,
		sharePublisher:           platformServices.sharePublisher,
		appPublisher:             platformServices.appPublisher,
		launcherHome:             launchServices.launcherHome,
		launcherManagement:       launchServices.launcherManagement,
		launcherOpenWorkspace:    launchServices.launcherOpenWorkspace,
		launchIntentService:      launchServices.launchIntentService,
		localLaunchService:       launchServices.localLaunchService,
		binaryStore:              workspaceServices.binaryStore,
		fileBrowserService:       workspaceServices.fileBrowserService,
		artifactService:          workspaceServices.artifactService,
		shareArtifactService:     workspaceServices.shareArtifactService,
		runCodeService:           runtimeServices.runCodeService,
		runPlanner:               runtimeServices.runPlanner,
		detachedRunManager:       runtimeServices.detachedRunManager,
		projectShellService:      runtimeServices.ideAgents.projectShellService,
		notificationService:      runtimeServices.ideAgents.notificationService,
		gitReadService:           runtimeServices.ideAgents.gitReadService,
		promptTemplateStore:      workspaceServices.promptTemplateStore,
		chatSectionChatIDs:       runtimeServices.ideAgents.chatSectionChatIDs,
		codegenValidator:         projectServices.codegenValidator,
		pythonMaterializer:       projectServices.pythonMaterializer,
		lspSignature:             projectServices.lspSignature,
		codeUpdates:              projectServices.codeUpdates,
		renameRefactors:          projectServices.renameRefactors,
		managedChatService:       runtimeServices.ideAgents.managedChatService,
		externalAgentSend:        runtimeServices.ideAgents.externalAgentSend,
		externalAgentChats:       runtimeServices.ideAgents.externalAgentChats,
		externalAgentFollow:      runtimeServices.ideAgents.externalAgentFollow,
		externalAgentRuntime:     runtimeServices.ideAgents.externalAgentRuntime,
		transcriptionProfiles:    runtimeServices.ideAgents.transcriptionProfiles,
		transcriptionSessions:    runtimeServices.ideAgents.transcriptionSessions,
		agentProfileStore:        workspaceServices.agentProfileStore,
		promptTemplateWatcher:    runtimeServices.promptTemplateWatcher,
		appGenSkillService:       workspaceServices.appGenSkillService,
		externalConfigService:    runtimeServices.ideAgents.externalConfigService,
		externalPreflight:        runtimeServices.ideAgents.externalPreflight,
		engineStore:              runtimeServices.ideAgents.engineStore,
		llmRuntime:               runtimeServices.ideAgents.llmRuntime,
		llmService:               runtimeServices.ideAgents.llmService,
		agenticSummaryStatus:     workspaceServices.agenticSummaryStatus,
		agentRunStore:            runtimeServices.ideAgents.agentRunStore,
		agentRunRuntime:          runtimeServices.ideAgents.agentRunRuntime,
		runChainRuntime:          runtimeServices.ideAgents.runChainRuntime,
		stateMachineRuntime:      runtimeServices.ideAgents.stateMachineRuntime,
		mcpClient:                base.mcpClient,
		lspDiagnostics:           projectServices.lspDiagnostics,
		lspCompletion:            projectServices.lspCompletion,
		projectLSPSyncer:         projectServices.projectLSPSyncer,
		pluginRuntime:            platformServices.pluginRuntime,
	})
	if err != nil {
		return appHandlerServices{}, err
	}
	listenerBuiltInInvoker.SetHandler(services.handler)
	if modePolicy.IsIDE() {
		services.jsonSourceWatchService, err = newJSONSourceWatchService(jsonSourceWatchServiceOptions{
			ProjectState:  projectServices.projectRuntime,
			WebsocketHub:  base.websocketHub,
			WorkspaceRoot: cfg.Paths.WorkspaceRoot,
			Logger:        logger,
		})
		if err != nil {
			return appHandlerServices{}, err
		}
		watchRefs.jsonSourceWatchService = services.jsonSourceWatchService
		if err := syncJSONSourceWatchInputs(
			services.jsonSourceWatchService,
			projectServices.projectRuntime.Snapshot().Document,
			cfg.Paths.WorkspaceRoot,
		); err != nil {
			_ = services.jsonSourceWatchService.Close()
			return appHandlerServices{}, err
		}
		services.artifactWatchService, err = newArtifactWatchService(artifactWatchServiceOptions{
			Artifacts:      workspaceServices.artifactService,
			WebsocketHub:   base.websocketHub,
			ListenerEvents: runtimeServices.listenerProducer,
			Logger:         logger,
		})
		if err != nil {
			_ = services.jsonSourceWatchService.Close()
			return appHandlerServices{}, err
		}
		watchRefs.artifactWatchService = services.artifactWatchService
		if err := syncArtifactWatchInputs(
			services.artifactWatchService,
			projectServices.projectRuntime.Snapshot().Document,
			cfg.Paths.SettaFilesRoot,
		); err != nil {
			_ = errors.Join(
				services.artifactWatchService.Close(),
				services.jsonSourceWatchService.Close(),
			)
			return appHandlerServices{}, err
		}
	}
	if err := runtimeServices.promptTemplateWatcher.Start(context.Background()); err != nil {
		_ = errors.Join(
			runtimeServices.promptTemplateWatcher.Close(),
			closeArtifactWatchService(services.artifactWatchService),
			closeJSONSourceWatchService(services.jsonSourceWatchService),
		)
		return appHandlerServices{}, err
	}
	return services, nil
}

func startAppBackgroundServices(
	modePolicy modes.Policy,
	manager *runtime.Manager,
	deploymentRuntime *deployments.Runtime,
	terminalService *terminals.Service,
	listenerBroadcaster *realtime.ListenerBroadcaster,
	shareArtifactService *shareartifacts.Service,
	transcriptionSessions *transcriptionsessions.Service,
	mcpClient *mcpx.Client,
) {
	if deploymentRuntime != nil {
		manager.Go("deployment-session-cleanup", func(ctx context.Context) error {
			return runDeploymentSessionCleanupLoop(
				ctx,
				deploymentRuntime,
				terminalService,
				listenerBroadcaster,
				shareArtifactService,
				0,
			)
		})
	}
	if modePolicy.IsIDE() && transcriptionSessions != nil {
		manager.Go("transcription-session-cleanup", func(ctx context.Context) error {
			return runTranscriptionSessionCleanupLoop(ctx, transcriptionSessions, 0)
		})
	}
	if mcpClient != nil {
		mcpClient.Start(context.Background())
	}
}

func New(cfg config.Config, logger *slog.Logger) (*App, error) {
	if logger == nil {
		logger = observability.NewLogger(cfg.Server.LogLevel, os.Stderr)
	}

	modePolicy := modes.NewPolicy(cfg.Server.Mode)
	baseServices, err := initializeAppBaseServices(cfg, logger, modePolicy)
	if err != nil {
		return nil, err
	}
	watchRefs := &projectWatchRefs{}
	launchServices, err := initializeLaunchServices(cfg, baseServices.authService, modePolicy)
	if err != nil {
		return nil, err
	}
	projectServices, err := initializeProjectServices(
		cfg,
		logger,
		modePolicy,
		baseServices.websocketHub,
		watchRefs,
	)
	if err != nil {
		return nil, err
	}
	workspaceServices, err := initializeAppWorkspaceServices(
		cfg,
		logger,
		modePolicy,
		baseServices.authService,
		baseServices.websocketHub,
		projectServices,
	)
	if err != nil {
		return nil, err
	}
	appSubsystemCapabilities, err := initializeAppSubsystemCapabilities(projectServices)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, workspaceServices.terminalService)
		return nil, err
	}
	runtimeServices, err := initializeAppRuntimeServices(
		cfg,
		logger,
		modePolicy,
		baseServices,
		projectServices,
		workspaceServices,
		appSubsystemCapabilities,
	)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, workspaceServices.terminalService)
		return nil, err
	}
	platformServices, err := initializeAppPlatformServices(
		cfg,
		logger,
		modePolicy,
		baseServices,
		projectServices,
		workspaceServices,
		runtimeServices,
		appSubsystemCapabilities,
	)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, workspaceServices.terminalService)
		return nil, err
	}
	handlerServices, err := initializeAppHandlerAndWatchServices(
		cfg,
		logger,
		modePolicy,
		baseServices,
		launchServices,
		projectServices,
		workspaceServices,
		runtimeServices,
		platformServices,
		watchRefs,
	)
	if err != nil {
		_ = closeProjectAndTerminal(projectServices, workspaceServices.terminalService)
		return nil, err
	}
	startAppBackgroundServices(
		modePolicy,
		baseServices.manager,
		projectServices.deploymentRuntime,
		workspaceServices.terminalService,
		runtimeServices.listenerBroadcaster,
		workspaceServices.shareArtifactService,
		runtimeServices.ideAgents.transcriptionSessions,
		baseServices.mcpClient,
	)

	return &App{
		config:          cfg,
		logger:          logger,
		authService:     baseServices.authService,
		runtime:         baseServices.manager,
		projectStates:   projectServices.projectStates,
		deployment:      projectServices.deploymentRuntime,
		shareSessions:   projectServices.shareSessions,
		terminals:       workspaceServices.terminalService,
		binaryStore:     workspaceServices.binaryStore,
		runCode:         runtimeServices.runCodeService,
		agentRuns:       runtimeServices.ideAgents.agentRunService,
		agentRuntime:    runtimeServices.ideAgents.agentRunRuntime,
		runChains:       runtimeServices.ideAgents.runChainRuntime,
		settingsState:   projectServices.settingsStateRuntime,
		websocketHub:    baseServices.websocketHub,
		listeners:       runtimeServices.listenerBroadcaster,
		lspSync:         projectServices.projectLSPSyncer,
		watchCode:       projectServices.watchCodeService,
		jsonSourceWatch: handlerServices.jsonSourceWatchService,
		artifactWatch:   handlerServices.artifactWatchService,
		boundCode:       projectServices.boundCodeService,
		promptWatcher:   runtimeServices.promptTemplateWatcher,
		mcpServer:       platformServices.mcpServer,
		mcpClient:       baseServices.mcpClient,
		pluginRuntime:   platformServices.pluginRuntime,
		handler:         handlerServices.handler,
	}, nil
}

func (a *App) Config() config.Config {
	return a.config
}

func (a *App) Handler() http.Handler {
	return a.handler
}

func (a *App) Runtime() *runtime.Manager {
	return a.runtime
}

func (a *App) Auth() *auth.Service {
	return a.authService
}

func (a *App) ProjectStates() *projectstate.Registry {
	return a.projectStates
}

func (a *App) SettingsState() *settingsstate.Runtime {
	return a.settingsState
}

func newAppNotificationID() (string, error) {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func (a *App) Terminals() *terminals.Service {
	return a.terminals
}

func (a *App) Shutdown(ctx context.Context) error {
	return errors.Join(
		a.promptWatcher.Close(),
		closeArtifactWatchService(a.artifactWatch),
		closeJSONSourceWatchService(a.jsonSourceWatch),
		closeManagedAgentRuntime(a.agentRuntime, ctx),
		closeProjectStateServices(a.projectStates, a.deployment, a.lspSync, a.watchCode, a.boundCode, ctx),
		closeMCPClient(a.mcpClient, ctx),
		closeSettingsState(a.settingsState),
		a.pluginRuntime.Close(ctx),
		a.terminals.Close(ctx),
		a.runtime.Shutdown(ctx),
	)
}

func closeProjectResources(projectStates *projectstate.Registry, deploymentRuntime *deployments.Runtime) error {
	return errors.Join(closeProjectStates(projectStates), closeDeploymentRuntime(deploymentRuntime))
}

func closeProjectStateServices(
	projectStates *projectstate.Registry,
	deploymentRuntime *deployments.Runtime,
	syncer *lsp.ProjectSynchronizer,
	watchService *watchcode.Service,
	boundCodeService *boundcode.Service,
	ctx context.Context,
) error {
	return errors.Join(
		closeBoundCodeService(boundCodeService),
		closeWatchCodeService(watchService),
		closeLSPProjectSynchronizer(syncer, ctx),
		closeProjectResources(projectStates, deploymentRuntime),
	)
}

func closeManagedAgentRuntime(runtime *agentruns.Runtime, ctx context.Context) error {
	if runtime == nil {
		return nil
	}
	return runtime.Shutdown(ctx)
}

func closeProjectStates(projectStates *projectstate.Registry) error {
	if projectStates == nil {
		return nil
	}
	return projectStates.Close()
}

func closeDeploymentRuntime(deploymentRuntime *deployments.Runtime) error {
	if deploymentRuntime == nil {
		return nil
	}
	return deploymentRuntime.Close()
}

func closeLSPProjectSynchronizer(syncer *lsp.ProjectSynchronizer, ctx context.Context) error {
	if syncer == nil {
		return nil
	}
	return syncer.Close(ctx)
}

func closeWatchCodeService(service *watchcode.Service) error {
	if service == nil {
		return nil
	}
	return service.Close()
}

func closeBoundCodeService(service *boundcode.Service) error {
	if service == nil {
		return nil
	}
	return service.Close()
}

func closeJSONSourceWatchService(service *jsonsourcewatch.Service) error {
	if service == nil {
		return nil
	}
	return service.Close()
}

func closeArtifactWatchService(service *artifactwatch.Service) error {
	if service == nil {
		return nil
	}
	return service.Close()
}

func boundCodeServiceInputs(inputs []projectstate.BoundCodeFileInput) []boundcode.FileInput {
	serviceInputs := make([]boundcode.FileInput, 0, len(inputs))
	for _, input := range inputs {
		bindings := make([]boundcode.Binding, 0, len(input.Bindings))
		for _, binding := range input.Bindings {
			bindings = append(bindings, boundcode.Binding{
				ProjectID: binding.ProjectID,
				SectionID: binding.SectionID,
			})
		}
		serviceInputs = append(serviceInputs, boundcode.FileInput{
			Path:     input.Path,
			Bindings: bindings,
		})
	}
	return serviceInputs
}

func newInternalMCPClient(cfg config.Config, logger *slog.Logger, authService *auth.Service) (*mcpx.Client, error) {
	serverConfigs, err := mcpx.LoadServerConfigs(
		mcpx.LLMConfigPath(cfg.Paths.SettaFilesRoot),
		mcpx.LoadServerConfigsOptions{
			SettaServerURL: resolveSettaServerURL(
				cfg,
				authServiceCurrentSessionOrNil(authService),
			),
		},
	)
	if err != nil {
		return nil, err
	}

	return mcpx.NewClient(mcpx.ClientOptions{
		Logger:  logger,
		Servers: serverConfigs,
		HeaderProvider: func(serverID string) (http.Header, error) {
			if serverID != mcpx.DefaultServerID {
				return nil, nil
			}
			return buildInternalMCPHeaders(authService)
		},
	})
}

func buildInternalMCPHeaders(authService *auth.Service) (http.Header, error) {
	if authService == nil {
		return nil, nil
	}
	session, ok := authService.CurrentSession()
	if !ok {
		return nil, auth.ErrMissingCurrentSession
	}
	token, _, err := authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		return nil, err
	}
	cookieName, err := authService.CookieName(session.Metadata.ID)
	if err != nil {
		return nil, err
	}
	headers := http.Header{}
	headers.Set("Cookie", cookieName+"="+token)
	return headers, nil
}

func closeMCPClient(client *mcpx.Client, ctx context.Context) error {
	if client == nil {
		return nil
	}
	return client.Close(ctx)
}

func closeSettingsState(runtime *settingsstate.Runtime) error {
	if runtime == nil {
		return nil
	}
	return runtime.Close()
}
