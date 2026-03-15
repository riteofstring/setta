package app

import (
	"setta/internal/externalagentconfigs"
	"setta/internal/plugins"
)

type externalAgentPluginAdapterProvider struct {
	plugins *plugins.Service
}

func (p externalAgentPluginAdapterProvider) RegisteredExternalAgentAdapters() ([]externalagentconfigs.PluginExternalAgentAdapter, error) {
	if p.plugins == nil {
		return []externalagentconfigs.PluginExternalAgentAdapter{}, nil
	}
	status, err := p.plugins.Status()
	if err != nil {
		return nil, err
	}
	adapters := []externalagentconfigs.PluginExternalAgentAdapter{}
	for _, pluginEntry := range status.Plugins {
		for _, adapter := range pluginEntry.RegisteredExternalAgentAdapters {
			adapters = append(adapters, externalagentconfigs.PluginExternalAgentAdapter{
				AdapterID:       adapter.AdapterID,
				PluginID:        adapter.PluginID,
				Name:            adapter.Name,
				RunModes:        append([]string(nil), adapter.RunModes...),
				Command:         adapter.Command,
				Args:            append([]string(nil), adapter.Args...),
				EnvVarWhitelist: append([]string(nil), adapter.EnvVarWhitelist...),
				DefaultModel:    cloneOptionalString(adapter.DefaultModel),
			})
		}
	}
	return adapters, nil
}
