package httpapi

import (
	"strings"
	"testing"

	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/testutil/appsubsystemtest"
	"setta/internal/testutil/firstpartyplugin"
)

func setTestAppDefinition(
	t *testing.T,
	runtime *projectstate.Runtime,
	input appdefinition.SetInput,
) {
	appsubsystemtest.SetTestAppDefinition(t, runtime, input)
}

func mustMarshalTestRawJSON(t *testing.T, value any, field string) projectstate.RawJSON {
	return appsubsystemtest.MustMarshalTestRawJSON(t, value, field)
}

func mustMarshalStoredAppDefinition(
	t *testing.T,
	definition appdefinition.AppDefinition,
) projectstate.RawJSON {
	return appsubsystemtest.MustMarshalStoredAppDefinition(t, definition)
}

func mustDecodeStoredAppDefinition(
	t *testing.T,
	raw projectstate.RawJSON,
) appdefinition.AppDefinition {
	return appsubsystemtest.MustDecodeStoredAppDefinition(t, raw)
}

func newAppDefinitionToolRouteServer(
	t *testing.T,
	projectRuntime *projectstate.Runtime,
	options mcpx.ServerOptions,
) *mcpx.Server {
	t.Helper()

	if strings.TrimSpace(options.WorkspaceRoot) == "" {
		options.WorkspaceRoot = t.TempDir()
	}
	if options.ProjectState == nil {
		options.ProjectState = projectRuntime
	}
	if options.SectionNames == nil && projectRuntime != nil {
		options.SectionNames = routeSectionNameService{runtime: projectRuntime}
	}
	if len(options.ContributedToolRegistrations) == 0 && projectRuntime != nil {
		options.ContributedToolRegistrations = appDefinitionToolRegistrationsForTest(
			appdefinition.NewAppDefinitionService(
				projectRuntime,
				firstpartyplugin.AppSubsystemPluginID,
			),
		)
	}
	server, err := mcpx.NewServer(options)
	if err != nil {
		t.Fatalf("new mcp server: %v", err)
	}
	return server
}
