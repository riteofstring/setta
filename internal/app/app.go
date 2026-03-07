package app

import (
	"context"
	"log/slog"
	"net/http"
	"os"

	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/runtime"
)

type App struct {
	config  config.Config
	logger  *slog.Logger
	runtime *runtime.Manager
	handler http.Handler
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
	handler, err := httpapi.NewHandler(httpapi.Dependencies{
		Logger: logger,
		Info: infoService{
			config:         cfg,
			authCookieName: authService.AuthCookieBaseName(),
		},
		Auth: authService,
	})
	if err != nil {
		return nil, err
	}

	return &App{
		config:  cfg,
		logger:  logger,
		runtime: manager,
		handler: handler,
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

func (a *App) Shutdown(ctx context.Context) error {
	return a.runtime.Shutdown(ctx)
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
