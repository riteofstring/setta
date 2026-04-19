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
	registrations := httpapi.FrontendAPIRouteRegistrations{}
	for _, provider := range providers {
		providerRegistrations, err := appsubsystem.BuildFrontendAPIRouteRegistrations(
			appsubsystem.FrontendRouteRegistrationOptions{
				Capabilities:       provider,
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
		registrations.Project = append(
			registrations.Project,
			providerRegistrations.Project...,
		)
		registrations.Deployment = append(
			registrations.Deployment,
			providerRegistrations.Deployment...,
		)
	}
	return registrations, nil
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
