package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/sharedtypes"
)

func writeJSON(path string, value any) error {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(trimmedPath), 0o755); err != nil {
		return fmt.Errorf("create output dir: %w", err)
	}
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal json: %w", err)
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(trimmedPath, payload, 0o644); err != nil {
		return fmt.Errorf("write output: %w", err)
	}
	return nil
}

func main() {
	schemaOutputPath := flag.String("schema-out", "", "path to the generated shared JSON Schema output file")
	sidecarOutputPath := flag.String("sidecar-out", "", "path to the generated shared semantic sidecar output file")
	openAPIOutputPath := flag.String("openapi-out", "", "path to the generated non-HTTP OpenAPI 3.1 projection output file")
	flag.Parse()

	if strings.TrimSpace(*schemaOutputPath) == "" &&
		strings.TrimSpace(*sidecarOutputPath) == "" &&
		strings.TrimSpace(*openAPIOutputPath) == "" {
		fmt.Fprintln(os.Stderr, "setta-gen-go-shared-schema: at least one of -schema-out, -sidecar-out, or -openapi-out is required")
		os.Exit(2)
	}

	if strings.TrimSpace(*schemaOutputPath) != "" {
		schema, err := sharedtypes.BuildSchemaDocument()
		if err != nil {
			fmt.Fprintf(os.Stderr, "setta-gen-go-shared-schema: %v\n", err)
			os.Exit(1)
		}
		if err := writeJSON(*schemaOutputPath, schema); err != nil {
			fmt.Fprintf(os.Stderr, "setta-gen-go-shared-schema: %v\n", err)
			os.Exit(1)
		}
	}

	if strings.TrimSpace(*sidecarOutputPath) != "" {
		sidecar, err := sharedtypes.BuildSemanticSidecar()
		if err != nil {
			fmt.Fprintf(os.Stderr, "setta-gen-go-shared-schema: %v\n", err)
			os.Exit(1)
		}
		jsonReadySidecar, err := sharedtypes.NormalizeSemanticSidecarForJSON(sidecar)
		if err != nil {
			fmt.Fprintf(os.Stderr, "setta-gen-go-shared-schema: %v\n", err)
			os.Exit(1)
		}
		if err := writeJSON(*sidecarOutputPath, jsonReadySidecar); err != nil {
			fmt.Fprintf(os.Stderr, "setta-gen-go-shared-schema: %v\n", err)
			os.Exit(1)
		}
	}

	if strings.TrimSpace(*openAPIOutputPath) != "" {
		document, err := sharedtypes.BuildOpenAPIProjectionDocument()
		if err != nil {
			fmt.Fprintf(os.Stderr, "setta-gen-go-shared-schema: %v\n", err)
			os.Exit(1)
		}
		if err := writeJSON(*openAPIOutputPath, document); err != nil {
			fmt.Fprintf(os.Stderr, "setta-gen-go-shared-schema: %v\n", err)
			os.Exit(1)
		}
	}
}
