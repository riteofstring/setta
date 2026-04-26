package mcpx

import (
	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	neutralmcptools "setta/internal/appsubsystem/mcptools"
	"setta/internal/testutil/firstpartyplugin"
)

func appDefinitionToolRegistrationsForTest(
	service appdefinition.Runtime,
) []ToolRegistration {
	registrations := neutralmcptools.BuildAppCatalogToolRegistrations()
	return append(
		registrations,
		neutralmcptools.BuildAppDefinitionToolRegistrations(
			service,
			appspec.MustForPlugin(firstpartyplugin.AppSubsystemPluginID).DefaultPath(),
			ExecuteScopedProjectStateOperation,
		)...,
	)
}
