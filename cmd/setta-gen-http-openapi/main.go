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
)

func buildOpenAPIDocumentAppSubsystemRegistrations(
	deps httpapi.FrontendAPIRouteDependencies,
	providers []appsubsystemproviders.DiscoveredProvider,
) (httpapi.FrontendAPIRouteRegistrations, error) {
	mergedProvider, ok := mergedOpenAPIProvider(providers)
	if !ok {
		return httpapi.FrontendAPIRouteRegistrations{}, nil
	}
	return appsubsystem.BuildFrontendAPIRouteRegistrations(
		appsubsystem.FrontendRouteRegistrationOptions{
			Capabilities:       mergedProvider,
			ModePolicy:         deps.Project.ModePolicy,
			ProjectState:       deps.Project.ProjectState,
			AppGenSkill:        deps.AppGenSkill,
			ShareDeploymentIDE: deps.ShareDeploymentIDE,
			AppDeployment: httpapi.DeploymentRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeApp),
			},
		},
	)
}

func mergedOpenAPIProvider(
	providers []appsubsystemproviders.DiscoveredProvider,
) (appsubsystemproviders.DiscoveredProvider, bool) {
	merged := appsubsystemproviders.DiscoveredProvider{}
	for _, provider := range providers {
		if merged.PluginID == "" {
			merged.PluginID = strings.TrimSpace(provider.PluginID)
		}
		merged.Capabilities.AppAuthoringUI =
			merged.Capabilities.AppAuthoringUI || provider.Capabilities.AppAuthoringUI
		merged.Capabilities.AppPreviewUI =
			merged.Capabilities.AppPreviewUI || provider.Capabilities.AppPreviewUI
		merged.Capabilities.AppGenerationChatModes =
			merged.Capabilities.AppGenerationChatModes || provider.Capabilities.AppGenerationChatModes
		merged.Capabilities.AppDeploymentRuntime =
			merged.Capabilities.AppDeploymentRuntime || provider.Capabilities.AppDeploymentRuntime
	}
	if merged.PluginID == "" {
		return appsubsystemproviders.DiscoveredProvider{}, false
	}
	if !merged.Capabilities.AppAuthoringUI &&
		!merged.Capabilities.AppGenerationChatModes &&
		!merged.Capabilities.AppDeploymentRuntime {
		return appsubsystemproviders.DiscoveredProvider{}, false
	}
	return merged, true
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
			registrations, err := buildOpenAPIDocumentAppSubsystemRegistrations(
				deps,
				appsubsystemproviders.DiscoveredProviders(),
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
