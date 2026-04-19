package app

import (
	"sync"

	"setta/internal/plugins"
)

type appSubsystemCapabilityState struct {
	mu           sync.RWMutex
	capabilities plugins.PluginAppSubsystemCapabilities
}

func newAppSubsystemCapabilityState() *appSubsystemCapabilityState {
	return &appSubsystemCapabilityState{
		capabilities: plugins.PluginAppSubsystemCapabilities{
			PluginID: plugins.AppSubsystemPluginID,
		},
	}
}

func (s *appSubsystemCapabilityState) Set(
	capabilities plugins.PluginAppSubsystemCapabilities,
) {
	if s == nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.capabilities = capabilities
}

func (s *appSubsystemCapabilityState) SetFromSnapshot(
	snapshot plugins.DiscoverySnapshot,
) {
	if s == nil {
		return
	}
	s.Set(plugins.AppSubsystemCapabilitiesFromSnapshot(snapshot))
}

func (s *appSubsystemCapabilityState) AppSubsystemCapabilities() plugins.PluginAppSubsystemCapabilities {
	if s == nil {
		return plugins.PluginAppSubsystemCapabilities{
			PluginID: plugins.AppSubsystemPluginID,
		}
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.capabilities
}
