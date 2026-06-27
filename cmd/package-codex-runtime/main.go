package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"setta/internal/codexruntime"
)

func main() {
	source := flag.String("source", os.Getenv(codexruntime.DevelopmentOverrideEnv), "source codex-app-server binary")
	resourcesDir := flag.String("resources-dir", "", "Electron Resources directory or equivalent runtime resource root")
	platform := flag.String("platform", codexruntime.Platform(), "target platform as goos/goarch")
	flag.Parse()

	if *source == "" {
		fatalf("source codex-app-server binary is required")
	}
	if *resourcesDir == "" {
		fatalf("resources directory is required")
	}

	manifest, targetPath, err := codexruntime.BundleRuntime(context.Background(), *source, *resourcesDir, *platform)
	if err != nil {
		fatalf("%v", err)
	}
	response := struct {
		TargetPath string                               `json:"targetPath"`
		Manifest   codexruntime.PackagedRuntimeManifest `json:"manifest"`
	}{
		TargetPath: targetPath,
		Manifest:   manifest,
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(response); err != nil {
		fatalf("encode package result: %v", err)
	}
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
