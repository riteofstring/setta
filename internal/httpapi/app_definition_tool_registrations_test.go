package httpapi

import (
	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	neutralmcptools "setta/internal/appsubsystem/mcptools"
	"setta/internal/mcpx"
	"setta/internal/testutil/firstpartyplugin"
)

func appDefinitionToolRegistrationsForTest(
	service appdefinition.Runtime,
) []mcpx.ToolRegistration {
	registrations := neutralmcptools.BuildAppCatalogToolRegistrations()
	return append(
		registrations,
		neutralmcptools.BuildAppDefinitionToolRegistrations(
			service,
			appspec.MustForPlugin(firstpartyplugin.AppSubsystemPluginID).DefaultPath(),
			mcpx.ExecuteScopedProjectStateOperation,
		)...,
	)
}
