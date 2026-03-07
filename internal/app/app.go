package app

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/backendlogs"
	binarypayload "setta/internal/binary"
	"setta/internal/boundcode"
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/lsp"
	"setta/internal/lspcompletion"
	"setta/internal/lspsignature"
	"setta/internal/modes"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/runs"
	"setta/internal/runtime"
	"setta/internal/terminals"
	"setta/internal/watchcode"
	"setta/internal/wsapi"
)

type App struct {
	config        config.Config
	logger        *slog.Logger
	authService   *auth.Service
	runtime       *runtime.Manager
	projectStates *projectstate.Registry
	deployment    *deployments.Runtime
	shareSessions modes.ShareSessionStore
	terminals     *terminals.Service
	binaryStore   *binarypayload.Store
	runCode       *runs.Service
	websocketHub  *realtime.WebsocketHub
	listeners     *realtime.ListenerBroadcaster
	lspSync       *lsp.ProjectSynchronizer
	watchCode     *watchcode.Service
	boundCode     *boundcode.Service
	handler       http.Handler
}

func New(cfg config.Config, logger *slog.Logger) (*App, error) {
	if logger == nil {
		logger = observability.NewLogger(cfg.Server.LogLevel, os.Stderr)
	}

	modePolicy := modes.NewPolicy(cfg.Server.Mode)
	manager := runtime.New(context.Background(), logger)
	websocketHub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	authService, err := auth.NewService(auth.Options{
		Mode:              cfg.Server.Mode,
		RuntimeRoot:       cfg.Paths.RuntimeRoot,
		ProfileCookieName: cfg.Paths.AuthCookieName,
		EnvLookup:         os.LookupEnv,
	})
	if err != nil {
		return nil, err
	}

	var (
		projectStates      *projectstate.Registry
		deploymentRuntime  *deployments.Runtime
		projectRuntime     *projectstate.Runtime
		settingsRuntime    *projectstate.Runtime
		codegenValidator   projectstate.CodegenTargetValidator
		lspDiagnostics     *projectstate.LSPDiagnosticsRegistry
		projectLSPSyncer   *lsp.ProjectSynchronizer
		lspCompletion      *lspcompletion.Service
		lspSignature       *lspsignature.Service
		pythonMaterializer *codegen.PythonMaterializer
		pluginMaterializer *codegen.PluginMaterializer
		watchCodeService   *watchcode.Service
		boundCodeService   *boundcode.Service
		watchCodeWarnings  *watchCodeWarningTracker
		codeUpdates        *codeUpdateService
		plannerFilesRoot   string
		artifactsRoot      string
		shareSessions      modes.ShareSessionStore
	)
	if modePolicy.IsDeployment() {
		deploymentRuntime, err = deployments.Open(context.Background(), deployments.RuntimeOptions{
			DeploymentRoot: cfg.Paths.DeploymentRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
		})
		if err != nil {
			return nil, err
		}
		projectRuntime = deploymentRuntime.Base()
		plannerFilesRoot = deploymentRuntime.Paths().DeploymentRoot
		artifactsRoot = deploymentRuntime.Paths().ArtifactsRoot
		shareSessions = deploymentRuntime
	} else {
		workerRuntimeProvider, err := plugins.NewCurrentProcessWorkerRuntimeProvider(plugins.CurrentProcessWorkerRuntimeProviderOptions{})
		if err != nil {
			return nil, err
		}
		workerSpecs, err := plugins.NewFilesystemWorkerSpecResolver(plugins.FilesystemWorkerSpecResolverOptions{
			WorkspaceRoot:   cfg.Paths.WorkspaceRoot,
			SettaFilesRoot:  cfg.Paths.SettaFilesRoot,
			SettaHome:       cfg.Paths.SettaHome,
			RuntimeProvider: workerRuntimeProvider,
			ServerMode:      cfg.Server.Mode,
		})
		if err != nil {
			return nil, err
		}
		codegenValidator, err = plugins.NewProjectCodegenTargetValidator(workerSpecs)
		if err != nil {
			return nil, err
		}
		pluginMaterializer, err = codegen.NewPluginMaterializer(codegen.PluginMaterializerOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			WorkerSpecs:    workerSpecs,
		})
		if err != nil {
			return nil, err
		}
		pythonMaterializer, err = codegen.NewPythonMaterializer(codegen.PythonMaterializerOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
		})
		if err != nil {
			return nil, err
		}
		lspDiagnostics = projectstate.NewLSPDiagnosticsRegistry(projectstate.LSPDiagnosticsRegistryOptions{
			OnChange: func(payload projectstate.LSPDiagnosticsPayload) {
				_, _ = websocketHub.BroadcastJSON(
					context.Background(),
					realtime.NewLSPDiagnosticsMessage(payload),
					realtime.Selection{Type: realtime.ConnectionTypeFrontend},
				)
			},
		})
		pythonSession, err := lsp.NewCurrentProcessPythonSession(lsp.CurrentProcessPythonSessionOptions{
			WorkspaceRoot: cfg.Paths.WorkspaceRoot,
		})
		if err != nil {
			return nil, err
		}
		lspService := lsp.NewService(pythonSession)
		projectLSPSyncer, err = lsp.NewProjectSynchronizer(lsp.ProjectSynchronizerOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			Service:        lspService,
			Diagnostics:    lspDiagnostics,
		})
		if err != nil {
			return nil, err
		}
		lspCompletion, err = lspcompletion.NewService(lspcompletion.ServiceOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			LSPService:     lspService,
		})
		if err != nil {
			return nil, err
		}
		lspSignature, err = lspsignature.NewService(lspsignature.ServiceOptions{
			SettaFilesRoot: cfg.Paths.SettaFilesRoot,
			RuntimeRoot:    cfg.Paths.RuntimeRoot,
			LSPService:     lspService,
		})
		if err != nil {
			return nil, err
		}
		projectStates, err = projectstate.OpenRegistryWithOptions(context.Background(), cfg.Paths.SettaFilesRoot, projectstate.StoreOptions{}, projectstate.RegistryOptions{
			MainRuntime: projectstate.RuntimeOptions{
				AfterSave: func(ctx context.Context, snapshot projectstate.Snapshot) error {
					if watchCodeService != nil {
						if err := watchCodeService.SyncConfigs(projectstate.WatchCodeConfigInputs(snapshot.Document)); err != nil {
							return err
						}
					}
					if watchCodeWarnings != nil {
						watchCodeWarnings.ReconcileDocument(snapshot.Document)
					}
					if boundCodeService != nil {
						inputs, err := projectstate.PythonBoundCodeFileInputs(snapshot.Document, cfg.Paths.WorkspaceRoot)
						if err != nil {
							return err
						}
						if err := boundCodeService.SyncInputs(boundCodeServiceInputs(inputs)); err != nil {
							return err
						}
					}
					if err := pythonMaterializer.MaterializeDocument(ctx, snapshot.Document); err != nil {
						return err
					}
					if err := projectLSPSyncer.MaterializeDocument(ctx, snapshot.Document); err != nil {
						return err
					}
					if err := lspDiagnostics.PruneDocument(snapshot.Document); err != nil {
						return err
					}
					return pluginMaterializer.MaterializeDocument(ctx, snapshot.Document)
				},
			},
		})
		if err != nil {
			return nil, err
		}
		projectRuntime = projectStates.Main()
		settingsRuntime = projectStates.Settings()
		plannerFilesRoot = cfg.Paths.SettaFilesRoot
		artifactsRoot = filepath.Join(cfg.Paths.SettaFilesRoot, "artifacts")
		projectLSPSyncer.SetCallableAutoRefetchHandlers(
			func(ctx context.Context, projectID string, sectionIDs []string) {
				if _, _, err := projectStates.Main().RefetchCallableParams(ctx, projectID, sectionIDs, lspSignature); err != nil {
					logger.Error("lsp callable auto-refetch after symbol resolution failed", "projectConfigId", projectID, "sectionIds", sectionIDs, "error", err)
				}
			},
			func(ctx context.Context, projectID string, sectionIDs []string) {
				enabled, err := projectstate.AutoRefetchCallableParamsOnLSPMismatchEnabled(projectStates.Settings().Snapshot().Document)
				if err != nil {
					logger.Error("lsp callable mismatch refetch policy lookup failed", "projectConfigId", projectID, "sectionIds", sectionIDs, "error", err)
					return
				}
				if !enabled {
					return
				}
				if _, _, err := projectStates.Main().RefetchCallableParams(ctx, projectID, sectionIDs, lspSignature); err != nil {
					logger.Error("lsp callable auto-refetch after mismatch failed", "projectConfigId", projectID, "sectionIds", sectionIDs, "error", err)
				}
			},
		)
		if modePolicy.IsIDE() {
			watchCodeWarnings = newWatchCodeWarningTracker()
			watchCodeService, err = watchcode.NewService(watchcode.ServiceOptions{
				WorkspaceRoot: cfg.Paths.WorkspaceRoot,
				OnFileUpdate: func(ctx context.Context, update watchcode.FileUpdate) error {
					signatureObserver := newWatchCodeSignatureObserver(lspSignature)
					snapshot, _, err := projectStates.Main().ApplyWatchCodeFileUpdate(
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
					for _, message := range watchCodeWarnings.ConsumeNotifications(snapshot.Document, update.ConfigID, signatureObserver.Attempts()) {
						if _, err := websocketHub.BroadcastJSON(ctx, message, realtime.Selection{Type: realtime.ConnectionTypeFrontend}); err != nil {
							return err
						}
					}
					return nil
				},
				OnFileDelete: func(ctx context.Context, request watchcode.DeleteRequest) error {
					snapshot, _, err := projectStates.Main().ApplyWatchCodeFileDelete(
						ctx,
						request.ConfigID,
						request.Path,
						cfg.Paths.WorkspaceRoot,
					)
					if err != nil {
						return err
					}
					watchCodeWarnings.ReconcileDocument(snapshot.Document)
					return nil
				},
				OnError: func(err error) {
					logger.Error("watch code runtime failed", "error", err)
				},
			})
			if err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
			if err := watchCodeService.SyncConfigs(projectstate.WatchCodeConfigInputs(projectStates.Main().Snapshot().Document)); err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
			codeUpdates, err = newCodeUpdateService(codeUpdateServiceOptions{
				ProjectState:       projectRuntime,
				LSPSync:            projectLSPSyncer,
				CallableSignatures: lspSignature,
				WorkspaceRoot:      cfg.Paths.WorkspaceRoot,
				WatchCodeWarnings:  watchCodeWarnings,
				WebsocketHub:       websocketHub,
			})
			if err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
			boundCodeService, err = boundcode.NewService(boundcode.ServiceOptions{
				OnFileUpdate: func(ctx context.Context, update boundcode.FileUpdate) error {
					return codeUpdates.ReloadBoundCodeFile(ctx, update.Raw, update.Bindings)
				},
				OnError: func(err error) {
					logger.Error("bound code file runtime failed", "error", err)
				},
			})
			if err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
			inputs, err := projectstate.PythonBoundCodeFileInputs(projectStates.Main().Snapshot().Document, cfg.Paths.WorkspaceRoot)
			if err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
			if err := boundCodeService.SyncInputs(boundCodeServiceInputs(inputs)); err != nil {
				_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
				return nil, err
			}
		}
	}

	terminalService, err := terminals.New(terminals.Options{
		Logger: logger,
	})
	if err != nil {
		_ = closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background())
		return nil, err
	}
	binaryStore, err := binarypayload.NewStoreForRuntimeRoot(cfg.Paths.RuntimeRoot)
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	runPlanner, err := runs.NewPlanner(runs.PlannerOptions{
		ProjectState:   projectRuntime,
		SettaFilesRoot: plannerFilesRoot,
		RuntimeRoot:    cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	listenerBroadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: websocketHub,
	})
	listenerProducer := realtime.NewListenerProducer(realtime.ListenerProducerOptions{
		Broadcaster:  listenerBroadcaster,
		ProjectState: projectRuntime,
		Deployment:   deploymentRuntime,
	})
	backendLogService, err := backendlogs.NewService(backendlogs.ServiceOptions{
		Logger:       logger,
		WebsocketHub: websocketHub,
		EnvLookup:    os.LookupEnv,
	})
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	runCodeService, err := runs.NewService(runs.ServiceOptions{
		Planner:           runPlanner,
		ProjectState:      projectRuntime,
		DeploymentRuntime: deploymentRuntime,
		Terminals:         terminalService,
		BackendLogs:       backendLogService,
		BinaryStore:       binaryStore,
		ListenerProducer:  listenerProducer,
		ArtifactsRoot:     artifactsRoot,
	})
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}
	if deploymentRuntime != nil {
		manager.Go("deployment-session-cleanup", func(ctx context.Context) error {
			return runDeploymentSessionCleanupLoop(ctx, deploymentRuntime, terminalService, listenerBroadcaster, 0)
		})
	}
	handler, err := httpapi.NewHandler(httpapi.Dependencies{
		Logger: logger,
		Info: infoService{
			config:         cfg,
			authCookieName: authService.AuthCookieBaseName(),
		},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(cfg.Server.Mode),
		RegisterRoot: func(r chi.Router) {
			if err := wsapi.RegisterRoutes(r, wsapi.RouteDependencies{
				Transport: wsapi.Dependencies{
					Auth:          authService,
					ModePolicy:    modePolicy,
					ShareSessions: shareSessions,
				},
				WebsocketHub:        websocketHub,
				ListenerBroadcaster: listenerBroadcaster,
				ListenerProducer:    listenerProducer,
				Terminals:           terminalService,
			}); err != nil {
				panic(err)
			}
		},
		Register: func(r chi.Router) {
			if err := httpapi.RegisterListenerRoutes(r, httpapi.ListenerRouteDependencies{
				ModePolicy:          modePolicy,
				ShareSessions:       shareSessions,
				ProjectState:        projectRuntime,
				Deployment:          deploymentRuntime,
				ListenerBroadcaster: listenerBroadcaster,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterDeploymentRoutes(r, httpapi.DeploymentRouteDependencies{
				ModePolicy: modePolicy,
				Deployment: deploymentRuntime,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterBinaryRoutes(r, httpapi.BinaryRouteDependencies{
				ModePolicy: modePolicy,
				Store:      binaryStore,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterTerminalRoutes(r, httpapi.TerminalRouteDependencies{
				ModePolicy:    modePolicy,
				ShareSessions: shareSessions,
				Terminals:     terminalService,
				RunCode:       runCodeService,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterProjectRoutes(r, httpapi.ProjectRouteDependencies{
				ModePolicy:                     modePolicy,
				WorkspaceRoot:                  cfg.Paths.WorkspaceRoot,
				ProjectState:                   projectRuntime,
				SettingsState:                  settingsRuntime,
				CodegenTargetValidator:         codegenValidator,
				PythonCodegenSectionReconciler: pythonMaterializer,
				CallableSignatures:             lspSignature,
				CodeUpdates:                    codeUpdates,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterLSPRoutes(r, httpapi.LSPRouteDependencies{
				ModePolicy:   modePolicy,
				ProjectState: projectRuntime,
				Diagnostics:  lspDiagnostics,
				Completions:  lspCompletion,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		_ = errors.Join(closeProjectStateServices(projectStates, deploymentRuntime, projectLSPSyncer, watchCodeService, boundCodeService, context.Background()), terminalService.Close(context.Background()))
		return nil, err
	}

	return &App{
		config:        cfg,
		logger:        logger,
		authService:   authService,
		runtime:       manager,
		projectStates: projectStates,
		deployment:    deploymentRuntime,
		shareSessions: shareSessions,
		terminals:     terminalService,
		binaryStore:   binaryStore,
		runCode:       runCodeService,
		websocketHub:  websocketHub,
		listeners:     listenerBroadcaster,
		lspSync:       projectLSPSyncer,
		watchCode:     watchCodeService,
		boundCode:     boundCodeService,
		handler:       handler,
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

func (a *App) DeploymentRuntime() *deployments.Runtime {
	return a.deployment
}

func (a *App) ShareSessions() modes.ShareSessionStore {
	return a.shareSessions
}

func (a *App) Terminals() *terminals.Service {
	return a.terminals
}

func (a *App) BinaryStore() *binarypayload.Store {
	return a.binaryStore
}

func (a *App) RunCode() *runs.Service {
	return a.runCode
}

func (a *App) WebsocketHub() *realtime.WebsocketHub {
	return a.websocketHub
}

func (a *App) ListenerBroadcaster() *realtime.ListenerBroadcaster {
	return a.listeners
}

func (a *App) Shutdown(ctx context.Context) error {
	return errors.Join(
		closeProjectStateServices(a.projectStates, a.deployment, a.lspSync, a.watchCode, a.boundCode, ctx),
		a.terminals.Close(ctx),
		a.runtime.Shutdown(ctx),
	)
}

type infoService struct {
	config         config.Config
	authCookieName string
}

func (s infoService) ServerMode(context.Context) string {
	return string(s.config.Server.Mode)
}

func (s infoService) RuntimeInfo(context.Context) httpapi.RuntimeInfo {
	return httpapi.RuntimeInfo{
		Mode: string(s.config.Server.Mode),
		Paths: httpapi.RuntimePaths{
			WorkspaceRoot:      s.config.Paths.WorkspaceRoot,
			DeploymentRoot:     s.config.Paths.DeploymentRoot,
			SettaHome:          s.config.Paths.SettaHome,
			ProfileLookupHome:  s.config.Paths.ProfileLookupHome,
			Profile:            s.config.Paths.ProfileName,
			SettaFilesRoot:     s.config.Paths.SettaFilesRoot,
			SettaFilesLocation: s.config.Paths.ActiveSettaFilesLocation(),
			RuntimeRoot:        s.config.Paths.RuntimeRoot,
		},
		Policy: httpapi.RuntimePathPolicy{
			GlobalSettaFilesBase: s.config.User.GlobalSettaFilesBase,
			AutoMode:             string(s.config.User.AutoMode),
		},
		Auth: httpapi.RuntimeAuth{
			AuthCookieName: s.authCookieName,
		},
	}
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
