package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/pythonsharedtypes"
)

func writeOutput(path string, content string) error {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return fmt.Errorf("output path is required")
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
	outputPath := flag.String("out", pythonsharedtypes.GeneratedPythonModulePath, "path to the generated shared Python types output file")
	flag.Parse()

	types, err := pythonsharedtypes.Build()
	if err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-python-shared-types: %v\n", err)
		os.Exit(1)
	}
	if err := writeOutput(*outputPath, types.PythonModule); err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-python-shared-types: %v\n", err)
		os.Exit(1)
	}
}
