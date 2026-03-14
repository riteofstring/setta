package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"setta/internal/config"
)

// The first read-only resolver should build worker specs directly from the active plugin root and manifest.
func TestFilesystemWorkerSpecResolverResolvesWorkspacePlugin(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-codegen")

	resolver, err := NewFilesystemWorkerSpecResolver(FilesystemWorkerSpecResolverOptions{
		WorkspaceRoot:    roots.workspaceRoot,
		SettaFilesRoot:   roots.settaFilesRoot,
		SettaHome:        roots.settaHome,
		CommandPrefix:    workerRPCTestCommandPrefix(t, workerRPCTestRepoRoot(t)),
		ServerMode:       config.ModeIDE,
		Environment:      workerRPCTestEnv(workerRPCTestRepoRoot(t)),
		WorkingDirectory: roots.workspaceRoot,
	})
	if err != nil {
		t.Fatalf("new filesystem resolver: %v", err)
	}

	spec, err := resolver.ResolvePluginCodegenWorkerSpec(context.Background(), "setta-fixture-backend-codegen:typescript")
	if err != nil {
		t.Fatalf("resolve plugin codegen worker spec: %v", err)
	}

	if spec.PluginID != "setta-fixture-backend-codegen" {
		t.Fatalf("expected plugin id, got %q", spec.PluginID)
	}
	if spec.PluginVersion != "0.1.0" {
		t.Fatalf("expected plugin version, got %q", spec.PluginVersion)
	}
	if spec.PluginRoot != pluginRoot {
		t.Fatalf("expected workspace plugin root %q, got %q", pluginRoot, spec.PluginRoot)
	}
	expectedEntrypoint := filepath.Join(pluginRoot, "backend", "entrypoint.py")
	if spec.Entrypoint != expectedEntrypoint {
		t.Fatalf("expected entrypoint %q, got %q", expectedEntrypoint, spec.Entrypoint)
	}
	if spec.ServerMode != string(config.ModeIDE) {
		t.Fatalf("expected ide mode, got %q", spec.ServerMode)
	}
	expectedPrefix := workerRPCTestCommandPrefix(t, workerRPCTestRepoRoot(t))
	if !reflect.DeepEqual(spec.CommandPrefix, expectedPrefix) {
		t.Fatalf("expected command prefix %#v, got %#v", expectedPrefix, spec.CommandPrefix)
	}
	if len(spec.RequestedCapabilities) != 1 || spec.RequestedCapabilities[0] != CapabilityRegisterCodegenTarget {
		t.Fatalf("unexpected requested capabilities: %#v", spec.RequestedCapabilities)
	}
	if len(spec.EffectiveCapabilities) != 1 || spec.EffectiveCapabilities[0] != CapabilityRegisterCodegenTarget {
		t.Fatalf("unexpected effective capabilities: %#v", spec.EffectiveCapabilities)
	}
}

// Scope precedence should prefer workspace over setta_files over global, and re-resolve after roots change.
func TestFilesystemWorkerSpecResolverHonorsScopePrecedence(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	globalRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeGlobal, "backend-codegen")
	settaFilesRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "backend-codegen")
	workspaceRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-codegen")

	rewritePluginManifest(t, workspaceRoot, func(payload map[string]any) {
		payload["version"] = "0.3.0"
	})
	rewritePluginManifest(t, settaFilesRoot, func(payload map[string]any) {
		payload["version"] = "0.2.0"
	})
	rewritePluginManifest(t, globalRoot, func(payload map[string]any) {
		payload["version"] = "0.1.0"
	})

	resolver := mustNewFilesystemResolver(t, roots, config.ModeIDE)

	spec, err := resolver.ResolvePluginCodegenWorkerSpec(context.Background(), "setta-fixture-backend-codegen:typescript")
	if err != nil {
		t.Fatalf("resolve workspace-preferred spec: %v", err)
	}
	if spec.PluginRoot != workspaceRoot || spec.PluginVersion != "0.3.0" {
		t.Fatalf("expected workspace plugin root/version, got %q %q", spec.PluginRoot, spec.PluginVersion)
	}

	if err := os.RemoveAll(workspaceRoot); err != nil {
		t.Fatalf("remove workspace plugin: %v", err)
	}
	spec, err = resolver.ResolvePluginCodegenWorkerSpec(context.Background(), "setta-fixture-backend-codegen:typescript")
	if err != nil {
		t.Fatalf("resolve setta_files-preferred spec: %v", err)
	}
	if spec.PluginRoot != settaFilesRoot || spec.PluginVersion != "0.2.0" {
		t.Fatalf("expected setta_files plugin root/version, got %q %q", spec.PluginRoot, spec.PluginVersion)
	}

	if err := os.RemoveAll(settaFilesRoot); err != nil {
		t.Fatalf("remove setta_files plugin: %v", err)
	}
	spec, err = resolver.ResolvePluginCodegenWorkerSpec(context.Background(), "setta-fixture-backend-codegen:typescript")
	if err != nil {
		t.Fatalf("resolve global-preferred spec: %v", err)
	}
	if spec.PluginRoot != globalRoot || spec.PluginVersion != "0.1.0" {
		t.Fatalf("expected global plugin root/version, got %q %q", spec.PluginRoot, spec.PluginVersion)
	}
}

// Disabled plugins should not resolve even if an installed backend manifest exists at the highest-precedence root.
func TestFilesystemWorkerSpecResolverRejectsDisabledPlugin(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-codegen")
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"disabledPluginIds": []string{"setta-fixture-backend-codegen"},
	})

	resolver := mustNewFilesystemResolver(t, roots, config.ModeIDE)
	_, err := resolver.ResolvePluginCodegenWorkerSpec(context.Background(), "setta-fixture-backend-codegen:typescript")
	if !errors.Is(err, ErrFilesystemWorkerSpecResolverPluginDisabled) {
		t.Fatalf("expected disabled plugin error, got %v", err)
	}
}

// Global plugins with manifest-default disabled should still resolve when global auto-enable state says they are active.
func TestFilesystemWorkerSpecResolverHonorsGlobalAutoEnablement(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	globalRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeGlobal, "backend-codegen")
	rewritePluginManifest(t, globalRoot, func(payload map[string]any) {
		payload["enabledByDefault"] = false
	})
	writeJSONFile(t, filepath.Join(roots.settaHome, "plugins_global_state.json"), map[string]any{
		"autoEnabledPluginIds": []string{"setta-fixture-backend-codegen"},
	})

	resolver := mustNewFilesystemResolver(t, roots, config.ModeIDE)
	spec, err := resolver.ResolvePluginCodegenWorkerSpec(context.Background(), "setta-fixture-backend-codegen:typescript")
	if err != nil {
		t.Fatalf("resolve global auto-enabled plugin: %v", err)
	}
	if spec.PluginRoot != globalRoot {
		t.Fatalf("expected global plugin root %q, got %q", globalRoot, spec.PluginRoot)
	}
}

// Share/app mode should not resolve codegen workers because registerCodegenTarget is blocked by mode policy there.
func TestFilesystemWorkerSpecResolverRejectsModeBlockedCodegenCapability(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-codegen")

	resolver := mustNewFilesystemResolver(t, roots, config.ModeShare)
	_, err := resolver.ResolvePluginCodegenWorkerSpec(context.Background(), "setta-fixture-backend-codegen:typescript")
	if !errors.Is(err, ErrFilesystemWorkerSpecResolverCodegenCapability) {
		t.Fatalf("expected mode-blocked capability error, got %v", err)
	}
}

// Plugins without the backend codegen capability should fail before any worker process starts.
func TestFilesystemWorkerSpecResolverRejectsMissingCodegenCapability(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")

	resolver := mustNewFilesystemResolver(t, roots, config.ModeIDE)
	_, err := resolver.ResolvePluginCodegenWorkerSpec(context.Background(), "setta-fixture-backend:typescript")
	if !errors.Is(err, ErrFilesystemWorkerSpecResolverCodegenCapability) {
		t.Fatalf("expected missing capability error, got %v", err)
	}
}

// Target ids must retain the worker target namespace shape instead of falling back to ambiguous plugin-only lookup.
func TestFilesystemWorkerSpecResolverRejectsInvalidTargetID(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	resolver := mustNewFilesystemResolver(t, roots, config.ModeIDE)

	testCases := []string{
		"",
		"setta-fixture-backend-codegen",
		"setta-fixture-backend-codegen:",
	}
	for _, targetID := range testCases {
		targetID := targetID
		t.Run(targetID, func(t *testing.T) {
			_, err := resolver.ResolvePluginCodegenWorkerSpec(context.Background(), targetID)
			if !errors.Is(err, ErrFilesystemWorkerSpecResolverTargetIDRequired) && !errors.Is(err, ErrFilesystemWorkerSpecResolverTargetIDInvalid) {
				t.Fatalf("expected target id validation error, got %v", err)
			}
		})
	}
}

type filesystemResolverTestRoots struct {
	workspaceRoot  string
	settaFilesRoot string
	settaHome      string
}

func newFilesystemResolverTestRoots(t *testing.T) filesystemResolverTestRoots {
	t.Helper()

	baseRoot := t.TempDir()
	roots := filesystemResolverTestRoots{
		workspaceRoot:  filepath.Join(baseRoot, "workspace"),
		settaFilesRoot: filepath.Join(baseRoot, "setta_files"),
		settaHome:      filepath.Join(baseRoot, ".setta"),
	}
	for _, root := range []string{roots.workspaceRoot, roots.settaFilesRoot, roots.settaHome} {
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatalf("mkdir test root %s: %v", root, err)
		}
	}
	return roots
}

func mustNewFilesystemResolver(t *testing.T, roots filesystemResolverTestRoots, mode config.Mode) *FilesystemWorkerSpecResolver {
	t.Helper()

	resolver, err := NewFilesystemWorkerSpecResolver(FilesystemWorkerSpecResolverOptions{
		WorkspaceRoot:    roots.workspaceRoot,
		SettaFilesRoot:   roots.settaFilesRoot,
		SettaHome:        roots.settaHome,
		CommandPrefix:    workerRPCTestCommandPrefix(t, workerRPCTestRepoRoot(t)),
		ServerMode:       mode,
		Environment:      workerRPCTestEnv(workerRPCTestRepoRoot(t)),
		WorkingDirectory: roots.workspaceRoot,
	})
	if err != nil {
		t.Fatalf("new filesystem resolver: %v", err)
	}
	return resolver
}

func copyPluginFixtureToScope(t *testing.T, roots filesystemResolverTestRoots, scope filesystemPluginScope, fixtureName string) string {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	manifestPayload, err := os.ReadFile(filepath.Join(sourceRoot, "setta.plugin.json"))
	if err != nil {
		t.Fatalf("read fixture manifest: %v", err)
	}
	var manifest struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode fixture manifest: %v", err)
	}

	targetRoot := filepath.Join(pluginScopeRoot(roots, scope), manifest.ID)
	copyBackendCodegenFixtureDir(t, sourceRoot, targetRoot)
	return targetRoot
}

func pluginScopeRoot(roots filesystemResolverTestRoots, scope filesystemPluginScope) string {
	switch scope {
	case filesystemPluginScopeWorkspace:
		return filepath.Join(roots.workspaceRoot, ".setta_plugins")
	case filesystemPluginScopeSettaFiles:
		return filepath.Join(roots.settaFilesRoot, "plugins")
	default:
		return filepath.Join(roots.settaHome, "plugins")
	}
}

func rewritePluginManifest(t *testing.T, pluginRoot string, mutate func(map[string]any)) {
	t.Helper()

	manifestPath := filepath.Join(pluginRoot, "setta.plugin.json")
	payload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read manifest %s: %v", manifestPath, err)
	}

	var manifest map[string]any
	if err := json.Unmarshal(payload, &manifest); err != nil {
		t.Fatalf("decode manifest %s: %v", manifestPath, err)
	}
	mutate(manifest)
	writeJSONFile(t, manifestPath, manifest)
}

func writeJSONFile(t *testing.T, path string, payload any) {
	t.Helper()

	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal json %s: %v", path, err)
	}
	content = append(content, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir parent %s: %v", path, err)
	}
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write json %s: %v", path, err)
	}
}
