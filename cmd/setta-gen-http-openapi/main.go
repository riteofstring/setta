package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/httpapi"
	appsubsystemplugin "setta/plugins/setta-json-render-app-gen/backend"
)

func main() {
	outputPath := flag.String("out", "", "path to the generated OpenAPI JSON output file")
	flag.Parse()

	trimmedPath := strings.TrimSpace(*outputPath)
	if trimmedPath == "" {
		fmt.Fprintln(os.Stderr, "setta-gen-http-openapi: -out is required")
		os.Exit(2)
	}

	document, err := httpapi.BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
		func(deps httpapi.FrontendAPIRouteDependencies) httpapi.FrontendAPIRouteRegistrations {
			return appsubsystemplugin.BuildFrontendAPIRouteRegistrations(
				appsubsystemplugin.FrontendRouteRegistrationOptions{
					API: deps,
				},
			)
		},
	)
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
