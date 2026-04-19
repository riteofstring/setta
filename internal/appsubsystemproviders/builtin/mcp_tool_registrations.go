package settajsonrenderappgenbackend

import (
	"setta/internal/appsubsystem/appdefinition"
	neutralmcptools "setta/internal/appsubsystem/mcptools"
	"setta/internal/mcpx"
)

func BuildMCPToolRegistrations(
	service appdefinition.Runtime,
	defaultAppSpecPath string,
) []mcpx.ToolRegistration {
	return neutralmcptools.BuildMCPToolRegistrations(service, defaultAppSpecPath)
}
