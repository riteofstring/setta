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
	flag.Parse()

	if strings.TrimSpace(*typesOutputPath) == "" {
		fmt.Fprintln(os.Stderr, "setta-gen-frontend-bindings: -types-out is required")
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
}
