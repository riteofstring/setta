package app

import (
	"log/slog"
	"net/http"

	"setta/internal/agentruns"
	"setta/internal/artifactwatch"
	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/boundcode"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/jsonsourcewatch"
	"setta/internal/lsp"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
	"setta/internal/realtime"
	"setta/internal/runchains"
	"setta/internal/runs"
	"setta/internal/runtime"
	"setta/internal/settingsstate"
	"setta/internal/terminals"
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
	watchCodeRef    *watchCodeServiceRef
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
