package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/pythonsdkcontracts"
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
	outputPath := flag.String("out", pythonsdkcontracts.GeneratedPythonModulePath, "path to the generated Python SDK contracts output file")
	constantsOutputPath := flag.String("constants-out", pythonsdkcontracts.GeneratedPythonConstantsModulePath, "path to the generated lightweight Python SDK constants output file")
	flag.Parse()

	contracts, err := pythonsdkcontracts.Build()
	if err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-python-sdk-contracts: %v\n", err)
		os.Exit(1)
	}
	if err := writeOutput(*outputPath, contracts.PythonModule); err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-python-sdk-contracts: %v\n", err)
		os.Exit(1)
	}
	if err := writeOutput(*constantsOutputPath, contracts.PythonConstantsModule); err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-python-sdk-contracts: %v\n", err)
		os.Exit(1)
	}
}
