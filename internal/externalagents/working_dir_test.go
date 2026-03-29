package externalagents

import (
	"os"
	"path/filepath"
	"testing"

	"setta/internal/externalagentconfigs"
)

type workingDirResolver struct {
	name    string
	resolve func(externalagentconfigs.Config) (string, func() error, error)
}

func testWorkingDirResolvers(workspaceRoot string) []workingDirResolver {
	return []workingDirResolver{
		{
			name: "codex",
			resolve: func(config externalagentconfigs.Config) (string, func() error, error) {
				return (&CodexExecutor{workspaceRoot: workspaceRoot}).resolveWorkingDir(config)
			},
		},
		{
			name: "claude",
			resolve: func(config externalagentconfigs.Config) (string, func() error, error) {
				return (&ClaudeExecutor{workspaceRoot: workspaceRoot}).resolveWorkingDir(config)
			},
		},
	}
}

func TestExecutorsResolveCustomWorkingDirCreatesTarget(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	for _, resolver := range testWorkingDirResolvers(workspaceRoot) {
		resolver := resolver
		t.Run(resolver.name, func(t *testing.T) {
			t.Parallel()

			customDir := filepath.Join(root, resolver.name, "custom-working-dir")
			resolved, cleanup, err := resolver.resolve(externalagentconfigs.Config{
				WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyCustom,
				WorkingDir:         stringPtr(customDir),
			})
			if err != nil {
				t.Fatalf("resolve custom working dir: %v", err)
			}
			if cleanup != nil {
				t.Fatalf("expected no cleanup callback for custom dir, got %T", cleanup)
			}
			if resolved != customDir {
				t.Fatalf("expected resolved custom dir %q, got %q", customDir, resolved)
			}
			info, err := os.Stat(customDir)
			if err != nil {
				t.Fatalf("stat custom dir: %v", err)
			}
			if !info.IsDir() {
				t.Fatalf("expected custom dir %q to exist", customDir)
			}
		})
	}
}

func TestExecutorsResolveTempWorkingDirCleanupRemovesDirectory(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	if err := os.MkdirAll(workspaceRoot, 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}

	for _, resolver := range testWorkingDirResolvers(workspaceRoot) {
		resolver := resolver
		t.Run(resolver.name, func(t *testing.T) {
			t.Parallel()

			resolved, cleanup, err := resolver.resolve(externalagentconfigs.Config{
				WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyTempDir,
			})
			if err != nil {
				t.Fatalf("resolve temp working dir: %v", err)
			}
			if cleanup == nil {
				t.Fatal("expected cleanup callback for temp dir")
			}
			if _, err := os.Stat(resolved); err != nil {
				t.Fatalf("stat temp dir before cleanup: %v", err)
			}
			if err := cleanup(); err != nil {
				t.Fatalf("cleanup temp dir: %v", err)
			}
			if _, err := os.Stat(resolved); !os.IsNotExist(err) {
				t.Fatalf("expected temp dir %q to be removed, stat err=%v", resolved, err)
			}
		})
	}
}
