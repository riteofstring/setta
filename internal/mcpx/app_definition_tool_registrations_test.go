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
	return neutralmcptools.BuildMCPToolRegistrations(
		service,
		appspec.MustForPlugin(firstpartyplugin.AppSubsystemPluginID).DefaultPath(),
		ExecuteScopedProjectStateOperation,
	)
}
