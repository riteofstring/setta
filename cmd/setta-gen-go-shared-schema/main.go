package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/sharedtypes"
)

const toolName = "setta-gen-go-shared-schema"

const requiredOutputMessage = toolName + ": at least one of -schema-out, -sidecar-out, or -openapi-out is required"

type outputPaths struct {
	schema  string
	sidecar string
	openAPI string
}

type generationTarget struct {
	path  string
	build func() (any, error)
}

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

func buildJSONReadySidecar() (any, error) {
	sidecar, err := sharedtypes.BuildSemanticSidecar()
	if err != nil {
		return nil, err
	}
	return sharedtypes.NormalizeSemanticSidecarForJSON(sidecar)
}

func buildSchemaDocument() (any, error) {
	return sharedtypes.BuildSchemaDocument()
}

func buildOpenAPIProjectionDocument() (any, error) {
	return sharedtypes.BuildOpenAPIProjectionDocument()
}

func appendRequestedTarget(targets []generationTarget, path string, build func() (any, error)) []generationTarget {
	if path == "" {
		return targets
	}
	return append(targets, generationTarget{path: path, build: build})
}

func (paths outputPaths) hasAny() bool {
	return paths.schema != "" || paths.sidecar != "" || paths.openAPI != ""
}

func (paths outputPaths) targets() []generationTarget {
	targets := make([]generationTarget, 0, 3)
	targets = appendRequestedTarget(targets, paths.schema, buildSchemaDocument)
	targets = appendRequestedTarget(targets, paths.sidecar, buildJSONReadySidecar)
	targets = appendRequestedTarget(targets, paths.openAPI, buildOpenAPIProjectionDocument)
	return targets
}

func parseOutputPaths(args []string, stderr io.Writer) (outputPaths, error) {
	flagSet := flag.NewFlagSet(toolName, flag.ContinueOnError)
	flagSet.SetOutput(stderr)
	schemaOutputPath := flagSet.String("schema-out", "", "path to the generated shared JSON Schema output file")
	sidecarOutputPath := flagSet.String("sidecar-out", "", "path to the generated shared semantic sidecar output file")
	openAPIOutputPath := flagSet.String("openapi-out", "", "path to the generated non-HTTP OpenAPI 3.1 projection output file")
	if err := flagSet.Parse(args); err != nil {
		return outputPaths{}, err
	}
	return outputPaths{
		schema:  strings.TrimSpace(*schemaOutputPath),
		sidecar: strings.TrimSpace(*sidecarOutputPath),
		openAPI: strings.TrimSpace(*openAPIOutputPath),
	}, nil
}

func generateOutputs(paths outputPaths) error {
	for _, target := range paths.targets() {
		value, err := target.build()
		if err != nil {
			return err
		}
		if err := writeJSON(target.path, value); err != nil {
			return err
		}
	}
	return nil
}

func run(args []string, stderr io.Writer) int {
	paths, err := parseOutputPaths(args, stderr)
	if err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	if !paths.hasAny() {
		fmt.Fprintln(stderr, requiredOutputMessage)
		return 2
	}
	if err := generateOutputs(paths); err != nil {
		fmt.Fprintf(stderr, "%s: %v\n", toolName, err)
		return 1
	}
	return 0
}

func main() {
	os.Exit(run(os.Args[1:], os.Stderr))
}
