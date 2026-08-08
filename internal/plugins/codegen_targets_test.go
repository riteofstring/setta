package plugins

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"setta/internal/config"
	"setta/internal/projectstate"
)

func TestServiceValidateProjectCodegenTargetAcceptsRegisteredPluginTarget(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	if err := service.ValidateProjectCodegenTarget(context.Background(), projectstate.ProjectCodegenTarget{
		Language: "setta-fixture-backend-codegen:typescript",
	}); err != nil {
		t.Fatalf("validate registered plugin target: %v", err)
	}
}

func TestServiceValidateProjectCodegenTargetRejectsUnknownPluginTarget(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	err := service.ValidateProjectCodegenTarget(context.Background(), projectstate.ProjectCodegenTarget{
		Language: "setta-fixture-backend-codegen:typescript",
	})
	if !errors.Is(err, ErrRegisteredCodegenTargetNotFound) {
		t.Fatalf("expected not-found plugin target validation error, got %v", err)
	}
}

func TestServiceValidateProjectCodegenTargetRejectsAmbiguousPluginTargetRegistrations(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")

	for _, pluginID := range []string{"setta-fixture-backend-a", "setta-fixture-backend-b"} {
		pluginRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), pluginID)
		copyBackendCodegenFixtureDir(t, sourceRoot, pluginRoot)
		rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
			payload["id"] = pluginID
			payload["name"] = pluginID
			payload["capabilities"] = []string{"registerCodegenTarget"}
		})
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	err := service.ValidateProjectCodegenTarget(context.Background(), projectstate.ProjectCodegenTarget{
		Language: "setta-fixture-backend-codegen:typescript",
	})
	if !errors.Is(err, ErrRegisteredCodegenTargetConflict) {
		t.Fatalf("expected conflicting plugin target registration error, got %v", err)
	}
}
