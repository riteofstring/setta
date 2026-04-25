package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/appsubsystem"
	"setta/internal/appsubsystemproviders"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/plugins"
)

type openAPICapabilityProvider struct {
	capabilities plugins.PluginAppSubsystemCapabilities
}

func (p openAPICapabilityProvider) AppSubsystemCapabilities() plugins.PluginAppSubsystemCapabilities {
	return p.capabilities
}

func buildOpenAPIDocumentRouteRegistrations(
	deps httpapi.FrontendAPIRouteDependencies,
	providers []plugins.PluginAppSubsystemFeatureManifest,
) (httpapi.FrontendAPIRouteRegistrations, error) {
	mergedCapabilities, ok := appsubsystemproviders.MergeOpenAPICapabilities(providers)
	if !ok {
		return buildOpenAPIDocumentWatchCodeRegistrations(deps), nil
	}
	registrations, err := appsubsystem.BuildFrontendAPIRouteRegistrations(
		appsubsystem.FrontendRouteRegistrationOptions{
			Capabilities:       openAPICapabilityProvider{capabilities: mergedCapabilities},
			ModePolicy:         deps.Project.ModePolicy,
			ProjectState:       deps.Project.ProjectState,
			AppGenSkill:        deps.AppGenSkill,
			ShareDeploymentIDE: deps.ShareDeploymentIDE,
			AppDeployment: httpapi.DeploymentRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeApp),
			},
		},
	)
	if err != nil {
		return httpapi.FrontendAPIRouteRegistrations{}, err
	}
	watchCodeRegistrations := buildOpenAPIDocumentWatchCodeRegistrations(deps)
	registrations.Project = append(registrations.Project, watchCodeRegistrations.Project...)
	return registrations, nil
}

func buildOpenAPIDocumentWatchCodeRegistrations(
	deps httpapi.FrontendAPIRouteDependencies,
) httpapi.FrontendAPIRouteRegistrations {
	return httpapi.BuildWatchCodeFrontendAPIRouteRegistrations(
		httpapi.WatchCodeRouteDependencies{
			ModePolicy: deps.Project.ModePolicy,
		},
	)
}

func main() {
	outputPath := flag.String("out", "", "path to the generated OpenAPI JSON output file")
	flag.Parse()

	trimmedPath := strings.TrimSpace(*outputPath)
	if trimmedPath == "" {
		fmt.Fprintln(os.Stderr, "setta-gen-http-openapi: -out is required")
		os.Exit(2)
	}

	var registrationErr error
	document, err := httpapi.BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		func(deps httpapi.FrontendAPIRouteDependencies) httpapi.FrontendAPIRouteRegistrations {
			registrations, err := buildOpenAPIDocumentRouteRegistrations(
				deps,
				appsubsystemproviders.DiscoveredProviderCapabilities(),
			)
			registrationErr = err
			return registrations
		},
	)
	if registrationErr != nil {
		err = registrationErr
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-http-openapi: %v\n", err)
		os.Exit(1)
	}

	content, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-http-openapi: marshal openapi: %v\n", err)
		os.Exit(1)
	}
	content = append(content, '\n')

	if err := os.MkdirAll(filepath.Dir(trimmedPath), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-http-openapi: create output dir: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(trimmedPath, content, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-http-openapi: write output: %v\n", err)
		os.Exit(1)
	}
}
