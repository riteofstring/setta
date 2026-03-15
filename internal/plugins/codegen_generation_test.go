package plugins

import (
	"context"
	"strings"
	"testing"

	"setta/internal/config"
)

func TestServiceGeneratePluginCodegenTargetUsesDefaultFileName(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	resolved, ok, err := service.ResolvePluginCodegenTarget(context.Background(), "setta-fixture-backend-codegen:typescript")
	if err != nil {
		t.Fatalf("resolve plugin codegen target: %v", err)
	}
	if !ok {
		t.Fatal("expected resolved plugin codegen target")
	}
	if resolved.DefaultFileName != "fixture_state.ts" {
		t.Fatalf("unexpected default file name %q", resolved.DefaultFileName)
	}
	if strings.TrimSpace(resolved.ImplementationKey) == "" {
		t.Fatal("expected implementation key")
	}

	files, err := service.GeneratePluginCodegenTarget(
		context.Background(),
		"setta-fixture-backend-codegen:typescript",
		map[string]any{"name": "Alpha"},
		map[string]any{"className": "FixtureState"},
	)
	if err != nil {
		t.Fatalf("generate plugin codegen target: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("expected one generated file, got %#v", files)
	}
	if files[0].RelativePath != "fixture_state.ts" {
		t.Fatalf("unexpected generated relative path %q", files[0].RelativePath)
	}
	if !strings.Contains(files[0].Content, "export class FixtureState") {
		t.Fatalf("unexpected generated content %q", files[0].Content)
	}
}

func TestServiceGeneratePluginCodegenTargetCanonicalizesRelativePath(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	files, err := service.GeneratePluginCodegenTarget(
		context.Background(),
		"setta-fixture-backend-codegen:typescript",
		map[string]any{"name": "Alpha"},
		map[string]any{"outputPath": "./nested//setta_gen.ts"},
	)
	if err != nil {
		t.Fatalf("generate plugin codegen target: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("expected one generated file, got %#v", files)
	}
	if files[0].RelativePath != "nested/setta_gen.ts" {
		t.Fatalf("unexpected canonical relative path %q", files[0].RelativePath)
	}
}

func TestServiceGeneratePluginCodegenTargetRejectsAbsolutePath(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	_, err := service.GeneratePluginCodegenTarget(
		context.Background(),
		"setta-fixture-backend-codegen:typescript",
		map[string]any{"name": "Alpha"},
		map[string]any{"outputPath": "C:/outside.ts"},
	)
	if err == nil {
		t.Fatal("expected absolute path rejection")
	}
	if !strings.Contains(err.Error(), "cannot be absolute") {
		t.Fatalf("expected absolute path rejection, got %v", err)
	}
}
