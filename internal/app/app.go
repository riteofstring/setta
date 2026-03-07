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
	binarypayload "setta/internal/binary"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/observability"
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
	projectStates, err := projectstate.OpenRegistry(context.Background(), cfg.Paths.SettaFilesRoot, projectstate.StoreOptions{})
	if err != nil {
		return nil, err
	}
	terminalService, err := terminals.New(terminals.Options{
		Logger: logger,
	})
	if err != nil {
		_ = projectStates.Close()
		return nil, err
	}
	binaryStore, err := binarypayload.NewStoreForRuntimeRoot(cfg.Paths.RuntimeRoot)
	if err != nil {
		_ = errors.Join(projectStates.Close(), terminalService.Close(context.Background()))
		return nil, err
	}
	runPlanner, err := runs.NewPlanner(runs.PlannerOptions{
		ProjectState:   projectStates.Main(),
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		RuntimeRoot:    cfg.Paths.RuntimeRoot,
	})
	if err != nil {
		_ = errors.Join(projectStates.Close(), terminalService.Close(context.Background()))
		return nil, err
	}
	runCodeService, err := runs.NewService(runs.ServiceOptions{
		Planner:       runPlanner,
		ProjectState:  projectStates.Main(),
		Terminals:     terminalService,
		BinaryStore:   binaryStore,
		ArtifactsRoot: filepath.Join(cfg.Paths.SettaFilesRoot, "artifacts"),
	})
	if err != nil {
		_ = errors.Join(projectStates.Close(), terminalService.Close(context.Background()))
		return nil, err
	}
	websocketHub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	listenerBroadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: websocketHub,
	})
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
					Auth:       authService,
					ModePolicy: modes.NewPolicy(cfg.Server.Mode),
				},
				WebsocketHub:        websocketHub,
				ListenerBroadcaster: listenerBroadcaster,
				Terminals:           terminalService,
			}); err != nil {
				panic(err)
			}
		},
		Register: func(r chi.Router) {
			if err := httpapi.RegisterBinaryRoutes(r, httpapi.BinaryRouteDependencies{
				ModePolicy: modes.NewPolicy(cfg.Server.Mode),
				Store:      binaryStore,
			}); err != nil {
				panic(err)
			}
			if err := httpapi.RegisterTerminalRoutes(r, httpapi.TerminalRouteDependencies{
				ModePolicy: modes.NewPolicy(cfg.Server.Mode),
				Terminals:  terminalService,
				RunCode:    runCodeService,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		_ = errors.Join(projectStates.Close(), terminalService.Close(context.Background()))
		return nil, err
	}

	return &App{
		config:        cfg,
		logger:        logger,
		authService:   authService,
		runtime:       manager,
		projectStates: projectStates,
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
	return errors.Join(a.projectStates.Close(), a.terminals.Close(ctx), a.runtime.Shutdown(ctx))
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
