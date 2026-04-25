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
	return neutralmcptools.BuildMCPToolRegistrations(
		service,
		appspec.MustForPlugin(firstpartyplugin.AppSubsystemPluginID).DefaultPath(),
		mcpx.ExecuteScopedProjectStateOperation,
	)
}
