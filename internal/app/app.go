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
	"setta/internal/codegen"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/runs"
	"setta/internal/runtime"
	"setta/internal/terminals"
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
	handler       http.Handler
}

func New(cfg config.Config, logger *slog.Logger) (*App, error) {
	if logger == nil {
		logger = observability.NewLogger(cfg.Server.LogLevel, os.Stderr)
	}

	modePolicy := modes.NewPolicy(cfg.Server.Mode)
	manager := runtime.New(context.Background(), logger)
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
		codegenValidator   projectstate.CodegenTargetValidator
		pythonMaterializer *codegen.PythonMaterializer
		pluginMaterializer *codegen.PluginMaterializer
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
		projectStates, err = projectstate.OpenRegistryWithOptions(context.Background(), cfg.Paths.SettaFilesRoot, projectstate.StoreOptions{}, projectstate.RegistryOptions{
			MainRuntime: projectstate.RuntimeOptions{
				AfterSave: func(ctx context.Context, snapshot projectstate.Snapshot) error {
					if err := pythonMaterializer.MaterializeDocument(ctx, snapshot.Document); err != nil {
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
		plannerFilesRoot = cfg.Paths.SettaFilesRoot
		artifactsRoot = filepath.Join(cfg.Paths.SettaFilesRoot, "artifacts")
	}

	terminalService, err := terminals.New(terminals.Options{
		Logger: logger,
	})
	if err != nil {
		_ = closeProjectResources(projectStates, deploymentRuntime)
		return nil, err
	}
	binaryStore, err := binarypayload.NewStoreForRuntimeRoot(cfg.Paths.RuntimeRoot)
	if err != nil {
		_ = errors.Join(closeProjectResources(projectStates, deploymentRuntime), terminalService.Close(context.Background()))
		return nil, err
	}
	runPlanner, err := runs.NewPlanner(runs.PlannerOptions{
		ProjectState:   projectRuntime,
		SettaFilesRoot: plannerFilesRoot,
		RuntimeRoot:    cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		_ = errors.Join(closeProjectResources(projectStates, deploymentRuntime), terminalService.Close(context.Background()))
		return nil, err
	}
	websocketHub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
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
		_ = errors.Join(closeProjectResources(projectStates, deploymentRuntime), terminalService.Close(context.Background()))
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
		_ = errors.Join(closeProjectResources(projectStates, deploymentRuntime), terminalService.Close(context.Background()))
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
				ProjectState:                   projectRuntime,
				CodegenTargetValidator:         codegenValidator,
				PythonCodegenSectionReconciler: pythonMaterializer,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		_ = errors.Join(closeProjectResources(projectStates, deploymentRuntime), terminalService.Close(context.Background()))
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
	return errors.Join(closeProjectResources(a.projectStates, a.deployment), a.terminals.Close(ctx), a.runtime.Shutdown(ctx))
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
