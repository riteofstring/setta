package settajsonrenderappgenbackend

import (
	"context"
	"testing"

	"github.com/go-chi/chi/v5"
	appdefinitionpkg "setta/internal/appsubsystem/appdefinition"
	neutralappdeploymenthttp "setta/internal/appsubsystem/appdeploymenthttp"
	"setta/internal/appsubsystem/apppublish"
	neutralmcptools "setta/internal/appsubsystem/mcptools"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
)

const ProviderPluginID = "setta-json-render-app-gen"

func NewAppDefinitionService(
	runtime *projectstate.Runtime,
	pluginID string,
) appdefinitionpkg.Runtime {
	return appdefinitionpkg.NewAppDefinitionService(runtime, pluginID)
}

func BuildMCPToolRegistrations(
	service appdefinitionpkg.Runtime,
	defaultAppSpecPath string,
) []mcpx.ToolRegistration {
	return neutralmcptools.BuildMCPToolRegistrations(service, defaultAppSpecPath)
}

func NewAppPublishService(
	options deployments.AppPublisherOptions,
	service appdefinitionpkg.Runtime,
	pluginID string,
) (deployments.AppPublishService, error) {
	return apppublish.NewService(options, service, pluginID)
}

type AppDeploymentIDERouteDependencies = neutralappdeploymenthttp.IDERouteDependencies

func RegisterAppDeploymentIDERoutes(
	router chi.Router,
	deps AppDeploymentIDERouteDependencies,
) error {
	return neutralappdeploymenthttp.RegisterIDERoutes(router, deps)
}

func RegisterAppDeploymentRoutes(
	router chi.Router,
	deps httpapi.DeploymentRouteDependencies,
	pluginID string,
) error {
	return neutralappdeploymenthttp.RegisterDeploymentRoutes(router, deps, pluginID)
}

func appDefinitionServiceForTest(
	runtime *projectstate.Runtime,
) appdefinitionpkg.Runtime {
	return NewAppDefinitionService(runtime, ProviderPluginID)
}

func setTestAppDefinition(
	t *testing.T,
	runtime *projectstate.Runtime,
	input appdefinitionpkg.SetInput,
) {
	t.Helper()

	service := appDefinitionServiceForTest(runtime)
	if _, _, err := service.SetAppDefinition(context.Background(), input); err != nil {
		t.Fatalf("set app definition: %v", err)
	}
}

func mustEncodeStoredAppDefinition(
	t *testing.T,
	definition *appdefinitionpkg.AppDefinition,
) projectstate.RawJSON {
	t.Helper()

	raw, err := appdefinitionpkg.EncodeStoredAppDefinition(definition)
	if err != nil {
		t.Fatalf("encode stored app definition: %v", err)
	}
	return raw
}

func mustDecodeStoredAppDefinition(
	t *testing.T,
	raw projectstate.RawJSON,
) *appdefinitionpkg.AppDefinition {
	t.Helper()

	definition, err := appdefinitionpkg.DecodeStoredAppDefinition(raw)
	if err != nil {
		t.Fatalf("decode stored app definition: %v", err)
	}
	return definition
}

func storedDocumentAppDefinition(
	t *testing.T,
	document projectstate.Document,
) *appdefinitionpkg.AppDefinition {
	t.Helper()

	return mustDecodeStoredAppDefinition(t, appdefinitionpkg.MustStorageForPlugin("setta-json-render-app-gen").StoredDocumentAppDefinitionRaw(document))
}

func withStoredDocumentAppDefinition(
	document projectstate.Document,
	raw projectstate.RawJSON,
) projectstate.Document {
	return appdefinitionpkg.MustStorageForPlugin("setta-json-render-app-gen").WithStoredDocumentAppDefinition(document, raw)
}
