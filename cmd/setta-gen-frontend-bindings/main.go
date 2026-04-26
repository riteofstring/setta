package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/frontendbindings"
)

func writeOutput(path string, content string) error {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(trimmedPath), 0o755); err != nil {
		return fmt.Errorf("create output dir: %w", err)
	}
	if err := os.WriteFile(trimmedPath, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write output: %w", err)
	}
	return nil
}

func main() {
	typesOutputPath := flag.String("types-out", "", "path to the generated TS type output file")
	toolingConstantsOutputPath := flag.String("tooling-constants-out", "", "path to the generated frontend tooling constants JSON file")
	watchCodeContractOutputPath := flag.String("watch-code-contract-out", "", "path to the generated Watch Code frontend contract TS file")
	flag.Parse()

	if strings.TrimSpace(*typesOutputPath) == "" &&
		strings.TrimSpace(*toolingConstantsOutputPath) == "" &&
		strings.TrimSpace(*watchCodeContractOutputPath) == "" {
		fmt.Fprintln(os.Stderr, "setta-gen-frontend-bindings: at least one output path is required")
		os.Exit(2)
	}

	bindings, err := frontendbindings.Build()
	if err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-frontend-bindings: %v\n", err)
		os.Exit(1)
	}

	if err := writeOutput(*typesOutputPath, bindings.TypesTS); err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-frontend-bindings: %v\n", err)
		os.Exit(1)
	}
	if err := writeOutput(*toolingConstantsOutputPath, bindings.ToolingConstantsJSON); err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-frontend-bindings: %v\n", err)
		os.Exit(1)
	}
	if err := writeOutput(*watchCodeContractOutputPath, bindings.WatchCodeBackendContractTS); err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-frontend-bindings: %v\n", err)
		os.Exit(1)
	}
}
