package plugins

import (
	"strings"
	"sync"
)

var (
	appSubsystemProviderRegistryMu sync.RWMutex
	appSubsystemProviderPluginIDs  = map[string]struct{}{}
)

func RegisterAppSubsystemProvider(pluginID string) {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		panic("app subsystem provider plugin id is required")
	}

	appSubsystemProviderRegistryMu.Lock()
	appSubsystemProviderPluginIDs[trimmedPluginID] = struct{}{}
	appSubsystemProviderRegistryMu.Unlock()
}

func appSubsystemProviderRegistered(pluginID string) bool {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return false
	}

	appSubsystemProviderRegistryMu.RLock()
	_, ok := appSubsystemProviderPluginIDs[trimmedPluginID]
	appSubsystemProviderRegistryMu.RUnlock()
	return ok
}
