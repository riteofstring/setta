package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/pythonsharedconstants"
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
	outputPath := flag.String("out", pythonsharedconstants.GeneratedPythonModulePath, "path to the generated shared Python constants output file")
	flag.Parse()

	generated, err := pythonsharedconstants.Build()
	if err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-python-shared-constants: %v\n", err)
		os.Exit(1)
	}
	if err := writeOutput(*outputPath, generated.PythonModule); err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-python-shared-constants: %v\n", err)
		os.Exit(1)
	}
}
