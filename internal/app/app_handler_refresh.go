package app

import (
	"net/http"
	"strings"
	"sync"

	"setta/internal/appsubsystem"
	"setta/internal/deployments"
	"setta/internal/plugins"
)

func newRefreshableAppHandler(
	handlerDeps appHandlerDeps,
) (*swappableHandler, func() error, error) {
	handler := newSwappableHandler(nil)
	refresh := func() error {
		nextDeps, err := currentAppHandlerDeps(handlerDeps)
		if err != nil {
			return err
		}
		nextHandler, err := newAppHandler(nextDeps)
		if err != nil {
			return err
		}
		handler.Set(nextHandler)
		if nextDeps.listenerBuiltInInvoker != nil {
			nextDeps.listenerBuiltInInvoker.SetHandler(nextHandler)
		}
		return nil
	}
	if err := refresh(); err != nil {
		return nil, nil, err
	}
	return handler, refresh, nil
}

func currentAppHandlerDeps(handlerDeps appHandlerDeps) (appHandlerDeps, error) {
	nextDeps := handlerDeps
	appPublisher, err := currentAppPublishService(handlerDeps)
	if err != nil {
		return appHandlerDeps{}, err
	}
	nextDeps.appPublisher = appPublisher
	return nextDeps, nil
}

func currentAppPublishService(handlerDeps appHandlerDeps) (deployments.AppPublishService, error) {
	if !handlerDeps.modePolicy.IsIDE() || handlerDeps.deploymentCatalog == nil || handlerDeps.projectRuntime == nil {
		return nil, nil
	}

	capabilities := plugins.PluginAppSubsystemCapabilities{}
	if handlerDeps.appSubsystemCapabilities != nil {
		capabilities = handlerDeps.appSubsystemCapabilities.AppSubsystemCapabilities()
	}
	providerSnapshot, err := currentAppPublishProviderSnapshot(handlerDeps, capabilities.PluginID)
	if err != nil {
		return nil, err
	}
	return appsubsystem.NewAppPublishService(capabilities, deployments.AppPublisherOptions{
		Catalog:          handlerDeps.deploymentCatalog,
		SettaFilesRoot:   handlerDeps.cfg.Paths.SettaFilesRoot,
		WorkspaceRoot:    handlerDeps.cfg.Paths.WorkspaceRoot,
		PluginSourcePath: providerSnapshot.SourcePath,
		EnabledPluginIDs: providerSnapshot.State.EnabledPluginIDs,
		PluginConfigByID: providerSnapshot.State.PluginConfigByID,
	}, handlerDeps.projectRuntime)
}

func currentAppPublishProviderSnapshot(
	handlerDeps appHandlerDeps,
	pluginID string,
) (plugins.ActivePluginDeploymentSnapshot, error) {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" || handlerDeps.pluginRuntime == nil || handlerDeps.pluginRuntime.service == nil {
		return plugins.ActivePluginDeploymentSnapshot{}, nil
	}
	return handlerDeps.pluginRuntime.service.DeploymentSnapshotForActivePlugin(trimmedPluginID)
}

type swappableHandler struct {
	mu      sync.RWMutex
	handler http.Handler
}

func newSwappableHandler(handler http.Handler) *swappableHandler {
	return &swappableHandler{handler: handler}
}

func (h *swappableHandler) Set(handler http.Handler) {
	if h == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.handler = handler
}

func (h *swappableHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h == nil {
		http.NotFound(w, r)
		return
	}

	h.mu.RLock()
	handler := h.handler
	h.mu.RUnlock()

	if handler == nil {
		http.NotFound(w, r)
		return
	}
	handler.ServeHTTP(w, r)
}
