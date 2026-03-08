package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/frontendbindings"
)

func main() {
	outputPath := flag.String("out", "", "path to the generated TS output file")
	flag.Parse()

	trimmedOutputPath := strings.TrimSpace(*outputPath)
	if trimmedOutputPath == "" {
		fmt.Fprintln(os.Stderr, "setta-gen-frontend-bindings: -out is required")
		os.Exit(2)
	}

	if err := os.MkdirAll(filepath.Dir(trimmedOutputPath), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-frontend-bindings: create output dir: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(trimmedOutputPath, []byte(frontendbindings.RenderWebsocketRoutesTS()), 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "setta-gen-frontend-bindings: write output: %v\n", err)
		os.Exit(1)
	}
}
