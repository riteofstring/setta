package app

import (
	"strings"
	"sync"

	"setta/internal/plugins"
)

type watchCodeCapabilityState struct {
	mu           sync.RWMutex
	capabilities plugins.PluginWatchCodeCapabilities
}

func newWatchCodeCapabilityState() *watchCodeCapabilityState {
	return &watchCodeCapabilityState{
		capabilities: plugins.WatchCodeCapabilitiesFromSnapshot(plugins.DiscoverySnapshot{}),
	}
}

func (s *watchCodeCapabilityState) Set(
	capabilities plugins.PluginWatchCodeCapabilities,
) {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.capabilities = capabilities
}

func (s *watchCodeCapabilityState) SetFromSnapshot(
	snapshot plugins.DiscoverySnapshot,
) {
	if s == nil {
		return
	}
	s.Set(plugins.WatchCodeCapabilitiesFromSnapshot(snapshot))
}

func (s *watchCodeCapabilityState) WatchCodeCapabilities() plugins.PluginWatchCodeCapabilities {
	if s == nil {
		return plugins.WatchCodeCapabilitiesFromSnapshot(plugins.DiscoverySnapshot{})
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.capabilities
}

func (s *watchCodeCapabilityState) ProviderActive() bool {
	_, ok := s.ActiveProviderPluginID()
	return ok
}

func (s *watchCodeCapabilityState) ActiveProviderPluginID() (string, bool) {
	capabilities := s.WatchCodeCapabilities()
	pluginID := strings.TrimSpace(capabilities.PluginID)
	return pluginID, capabilities.PluginEnabled && capabilities.Python && pluginID != ""
}
