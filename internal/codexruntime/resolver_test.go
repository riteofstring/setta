package codexruntime

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	stdruntime "runtime"
	"strings"
	"testing"

	"setta/internal/codexapp"
)

func TestResolveRejectsMissingBundledRuntimeWithoutPathFallback(t *testing.T) {
	executablePath := filepath.Join(t.TempDir(), "setta-backend")
	resolved, err := Resolve(context.Background(), ResolveOptions{
		Executable: func() (string, error) { return executablePath, nil },
		Getenv:     func(string) string { return "" },
	})
	if err == nil {
		t.Fatalf("resolve = %+v, want missing bundled runtime error", resolved)
	}
	providerErr := requireIncompatibleProviderError(t, err)
	if providerErr.Capability != CapabilityRuntimeResolution {
		t.Fatalf("capability = %q, want %q", providerErr.Capability, CapabilityRuntimeResolution)
	}
	if !strings.Contains(providerErr.BinaryPath, ManagedRuntimeDirectoryName) {
		t.Fatalf("binary candidates = %q, want bundled runtime paths", providerErr.BinaryPath)
	}
	if strings.Contains(providerErr.Error(), "PATH") {
		t.Fatalf("error mentions PATH fallback: %s", providerErr.Error())
	}
}

func TestResolveOverrideRequiresSessionSource(t *testing.T) {
	fake := writeFakeRuntimeScript(t, fakeRuntimeScriptConfig{SessionSource: false})
	_, err := Resolve(context.Background(), ResolveOptions{
		Getenv: func(name string) string {
			if name == DevelopmentOverrideEnv {
				return fake
			}
			return ""
		},
	})
	if err == nil {
		t.Fatal("resolve succeeded, want explicit session-source failure")
	}
	providerErr := requireIncompatibleProviderError(t, err)
	if providerErr.Capability != CapabilityExplicitSessionSource {
		t.Fatalf("capability = %q, want %q", providerErr.Capability, CapabilityExplicitSessionSource)
	}
	if providerErr.VersionOutput != "codex-app-server 0.0.0" {
		t.Fatalf("version = %q, want fake version", providerErr.VersionOutput)
	}
	if providerErr.AppServerEntrypoint != string(AppServerEntrypointDirect) {
		t.Fatalf("entrypoint = %q, want direct app-server", providerErr.AppServerEntrypoint)
	}
}

func TestResolveOverrideUsesDirectAppServer(t *testing.T) {
	fake := writeFakeRuntimeScript(t, fakeRuntimeScriptConfig{SessionSource: true})
	resolved, err := Resolve(context.Background(), ResolveOptions{
		Getenv: func(name string) string {
			if name == DevelopmentOverrideEnv {
				return fake
			}
			return ""
		},
	})
	if err != nil {
		t.Fatalf("resolve override: %v", err)
	}
	if resolved.Process.Command != fake {
		t.Fatalf("command = %q, want fake runtime %q", resolved.Process.Command, fake)
	}
	wantArgs := []string{"--listen", "stdio://", "--session-source", "app-server"}
	if strings.Join(resolved.Process.Args, "\x00") != strings.Join(wantArgs, "\x00") {
		t.Fatalf("args = %q, want %q", resolved.Process.Args, wantArgs)
	}
	if resolved.Identity.AppServerEntrypoint != string(AppServerEntrypointDirect) {
		t.Fatalf("entrypoint = %q, want direct app-server", resolved.Identity.AppServerEntrypoint)
	}
	if resolved.Identity.ArtifactSHA256 == "" {
		t.Fatal("artifact sha256 is empty")
	}
	if resolved.Identity.CodexSourceCommit != RequiredCodexSourceCommit ||
		resolved.Identity.ProtocolSchemaCommit != RequiredProtocolSchemaCommit {
		t.Fatalf("identity commits = %+v, want managed manifest commits", resolved.Identity)
	}
}

func TestResolveBundledRuntimeRequiresPackagedManifest(t *testing.T) {
	fake := writeFakeRuntimeScript(t, fakeRuntimeScriptConfig{SessionSource: true})
	appDir := filepath.Join(t.TempDir(), "Setta.app", "Contents")
	resourcesDir := filepath.Join(appDir, "Resources")
	bundledPath := RuntimeBundleExecutablePath(resourcesDir, Platform())
	if err := os.MkdirAll(filepath.Dir(bundledPath), 0o755); err != nil {
		t.Fatalf("create bundled runtime dir: %v", err)
	}
	raw, err := os.ReadFile(fake)
	if err != nil {
		t.Fatalf("read fake runtime: %v", err)
	}
	if err := os.WriteFile(bundledPath, raw, 0o755); err != nil {
		t.Fatalf("write bundled runtime without manifest: %v", err)
	}

	_, err = Resolve(context.Background(), ResolveOptions{
		Executable: func() (string, error) {
			return filepath.Join(appDir, "MacOS", "setta-backend"), nil
		},
		Getenv: func(string) string { return "" },
	})
	if err == nil {
		t.Fatal("resolve bundled runtime succeeded, want missing manifest error")
	}
	providerErr := requireIncompatibleProviderError(t, err)
	if providerErr.Capability != CapabilityRuntimeIntegrity {
		t.Fatalf("capability = %q, want %q", providerErr.Capability, CapabilityRuntimeIntegrity)
	}
}

func TestResolveBundledRuntimeRejectsManifestMismatchBeforeExecution(t *testing.T) {
	if stdruntime.GOOS == "windows" {
		t.Skip("fake runtime shell script is Unix-only")
	}
	tempDir := t.TempDir()
	markerPath := filepath.Join(tempDir, "executed")
	appDir := filepath.Join(tempDir, "Setta.app", "Contents")
	resourcesDir := filepath.Join(appDir, "Resources")
	bundledPath := RuntimeBundleExecutablePath(resourcesDir, Platform())
	if err := os.MkdirAll(filepath.Dir(bundledPath), 0o755); err != nil {
		t.Fatalf("create bundled runtime dir: %v", err)
	}
	script := "#!/bin/sh\n" +
		"echo executed > '" + markerPath + "'\n" +
		"if [ \"$1\" = \"--version\" ]; then echo 'codex-app-server 0.0.0'; exit 0; fi\n" +
		"if [ \"$1\" = \"--help\" ]; then echo '--listen --session-source <SOURCE>'; exit 0; fi\n" +
		"exit 2\n"
	if err := os.WriteFile(bundledPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write bundled runtime: %v", err)
	}
	manifest := PackagedRuntimeManifest{
		Strategy:                StrategyBundledStandaloneAppServer,
		CodexSourceCommit:       RequiredCodexSourceCommit,
		ProtocolSchemaCommit:    RequiredProtocolSchemaCommit,
		ArtifactName:            platformExecutableName(RequiredArtifactName),
		Platform:                Platform(),
		SHA256:                  strings.Repeat("0", 64),
		VersionOutput:           "codex-app-server 0.0.0",
		AppServerEntrypoint:     string(AppServerEntrypointDirect),
		AppServerArgs:           []string{"--listen", "stdio://", "--session-source", "app-server"},
		RequiredSessionSource:   RequiredAppServerSessionSource,
		DevelopmentOverrideEnv:  DevelopmentOverrideEnv,
		ManagedRuntimeDirectory: ManagedRuntimeDirectoryName,
	}
	if err := writePackagedRuntimeManifest(RuntimeBundleManifestPath(bundledPath), manifest); err != nil {
		t.Fatalf("write bad packaged manifest: %v", err)
	}

	_, err := Resolve(context.Background(), ResolveOptions{
		Executable: func() (string, error) {
			return filepath.Join(appDir, "MacOS", "setta-backend"), nil
		},
		Getenv: func(string) string { return "" },
	})
	if err == nil {
		t.Fatal("resolve bundled runtime succeeded, want pre-execution integrity error")
	}
	providerErr := requireIncompatibleProviderError(t, err)
	if providerErr.Capability != CapabilityRuntimeIntegrity {
		t.Fatalf("capability = %q, want %q", providerErr.Capability, CapabilityRuntimeIntegrity)
	}
	if _, statErr := os.Stat(markerPath); !os.IsNotExist(statErr) {
		t.Fatalf("bundled runtime was executed before manifest rejection; stat marker err=%v", statErr)
	}
}

func TestBundleRuntimeWritesManifestResolvedByBundledRuntime(t *testing.T) {
	fake := writeFakeRuntimeScript(t, fakeRuntimeScriptConfig{SessionSource: true})
	appDir := filepath.Join(t.TempDir(), "Setta.app", "Contents")
	resourcesDir := filepath.Join(appDir, "Resources")
	manifest, bundledPath, err := BundleRuntime(context.Background(), fake, resourcesDir, Platform())
	if err != nil {
		t.Fatalf("bundle runtime: %v", err)
	}
	if manifest.SHA256 == "" {
		t.Fatal("manifest sha256 is empty")
	}

	resolved, err := Resolve(context.Background(), ResolveOptions{
		Executable: func() (string, error) {
			return filepath.Join(appDir, "MacOS", "setta-backend"), nil
		},
		Getenv: func(string) string { return "" },
	})
	if err != nil {
		t.Fatalf("resolve bundled runtime: %v", err)
	}
	if resolved.Process.Command != bundledPath {
		t.Fatalf("command = %q, want bundled runtime %q", resolved.Process.Command, bundledPath)
	}
	if resolved.Identity.ArtifactSHA256 != manifest.SHA256 {
		t.Fatalf("sha256 = %q, want manifest sha %q", resolved.Identity.ArtifactSHA256, manifest.SHA256)
	}
}

func TestStartupProbeReportsFailedCapability(t *testing.T) {
	resolved := resolveFakeRuntimeForProbe(t, "missing-turns")
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process:                resolved.Process,
		InitializeParams:       map[string]any{"clientInfo": map[string]any{"name": "setta-test"}, "capabilities": map[string]any{"experimentalApi": true}},
		StartupInitializeError: StartupInitializeError(resolved.Identity),
		StartupProbe:           StartupProbe(resolved.Identity),
	})
	defer shutdownProbeManager(t, manager)

	_, err := manager.NewSession(context.Background())
	if err == nil {
		t.Fatal("manager start succeeded, want probe error")
	}
	providerErr := requireIncompatibleProviderError(t, err)
	if providerErr.Capability != CapabilityStartupProbeTurnsList {
		t.Fatalf("capability = %q, want %q", providerErr.Capability, CapabilityStartupProbeTurnsList)
	}
	if providerErr.BinaryPath == "" || providerErr.VersionOutput == "" || providerErr.AppServerEntrypoint == "" {
		t.Fatalf("probe error missing runtime metadata: %+v", providerErr)
	}
}

func TestStartupProbeRejectsThreadListError(t *testing.T) {
	resolved := resolveFakeRuntimeForProbe(t, "thread-list-storage-error")
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process:                resolved.Process,
		InitializeParams:       map[string]any{"clientInfo": map[string]any{"name": "setta-test"}, "capabilities": map[string]any{"experimentalApi": true}},
		StartupInitializeError: StartupInitializeError(resolved.Identity),
		StartupProbe:           StartupProbe(resolved.Identity),
	})
	defer shutdownProbeManager(t, manager)

	_, err := manager.NewSession(context.Background())
	if err == nil {
		t.Fatal("manager start succeeded, want thread/list probe error")
	}
	providerErr := requireIncompatibleProviderError(t, err)
	if providerErr.Capability != CapabilityStartupProbeThreadList {
		t.Fatalf("capability = %q, want %q", providerErr.Capability, CapabilityStartupProbeThreadList)
	}
}

func TestStartupProbeRejectsUnexpectedMissingThreadError(t *testing.T) {
	resolved := resolveFakeRuntimeForProbe(t, "turns-requires-experimental")
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process:                resolved.Process,
		InitializeParams:       map[string]any{"clientInfo": map[string]any{"name": "setta-test"}, "capabilities": map[string]any{"experimentalApi": true}},
		StartupInitializeError: StartupInitializeError(resolved.Identity),
		StartupProbe:           StartupProbe(resolved.Identity),
	})
	defer shutdownProbeManager(t, manager)

	_, err := manager.NewSession(context.Background())
	if err == nil {
		t.Fatal("manager start succeeded, want thread/turns/list probe error")
	}
	providerErr := requireIncompatibleProviderError(t, err)
	if providerErr.Capability != CapabilityStartupProbeTurnsList {
		t.Fatalf("capability = %q, want %q", providerErr.Capability, CapabilityStartupProbeTurnsList)
	}
	if !strings.Contains(providerErr.Error(), "experimentalApi capability") {
		t.Fatalf("error = %q, want experimentalApi cause", providerErr.Error())
	}
}

func TestStartupInitializeFailureIsTyped(t *testing.T) {
	resolved := resolveFakeRuntimeForProbe(t, "initialize-rejects")
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process:                resolved.Process,
		InitializeParams:       map[string]any{"clientInfo": map[string]any{"name": "setta-test"}, "capabilities": map[string]any{"experimentalApi": true}},
		StartupInitializeError: StartupInitializeError(resolved.Identity),
		StartupProbe:           StartupProbe(resolved.Identity),
	})
	defer shutdownProbeManager(t, manager)

	_, err := manager.NewSession(context.Background())
	if err == nil {
		t.Fatal("manager start succeeded, want typed initialize error")
	}
	providerErr := requireIncompatibleProviderError(t, err)
	if providerErr.Capability != CapabilityStartupProbeInitialize {
		t.Fatalf("capability = %q, want %q", providerErr.Capability, CapabilityStartupProbeInitialize)
	}
	if providerErr.BinaryPath == "" || providerErr.VersionOutput == "" || providerErr.AppServerEntrypoint == "" {
		t.Fatalf("initialize error missing runtime metadata: %+v", providerErr)
	}
}

func TestStartupProbeSucceedsAgainstCompatibleFakeRuntime(t *testing.T) {
	resolved := resolveFakeRuntimeForProbe(t, "compatible")
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process:                resolved.Process,
		InitializeParams:       map[string]any{"clientInfo": map[string]any{"name": "setta-test"}, "capabilities": map[string]any{"experimentalApi": true}},
		StartupInitializeError: StartupInitializeError(resolved.Identity),
		StartupProbe:           StartupProbe(resolved.Identity),
	})
	defer shutdownProbeManager(t, manager)

	if _, err := manager.NewSession(context.Background()); err != nil {
		t.Fatalf("manager start with compatible probe runtime: %v", err)
	}
}

type fakeRuntimeScriptConfig struct {
	SessionSource bool
}

func resolveFakeRuntimeForProbe(t *testing.T, mode string) ResolvedRuntime {
	t.Helper()
	fake := writeFakeRuntimeScript(t, fakeRuntimeScriptConfig{SessionSource: true})
	resolved, err := Resolve(context.Background(), ResolveOptions{
		Getenv: func(name string) string {
			if name == DevelopmentOverrideEnv {
				return fake
			}
			return ""
		},
	})
	if err != nil {
		t.Fatalf("resolve fake runtime: %v", err)
	}
	resolved.Process.Env = append(resolved.Process.Env, "SETTA_CODEXRUNTIME_FAKE_MODE="+mode)
	return resolved
}

func writeFakeRuntimeScript(t *testing.T, config fakeRuntimeScriptConfig) string {
	t.Helper()
	if stdruntime.GOOS == "windows" {
		t.Skip("fake runtime shell script is Unix-only")
	}
	help := "--listen"
	if config.SessionSource {
		help += " --session-source <SOURCE>"
	}
	path := filepath.Join(t.TempDir(), "codex-app-server")
	testBinary := os.Args[0]
	script := "#!/bin/sh\n" +
		"if [ \"$1\" = \"--version\" ]; then echo 'codex-app-server 0.0.0'; exit 0; fi\n" +
		"if [ \"$1\" = \"--help\" ]; then echo '" + help + "'; exit 0; fi\n" +
		"if [ \"$1\" = \"--listen\" ] && [ \"$2\" = \"stdio://\" ] && [ \"$3\" = \"--session-source\" ] && [ \"$4\" = \"app-server\" ]; then exec '" + testBinary + "' -test.run=TestCodexRuntimeFakeAppServer --; fi\n" +
		"echo unexpected fake runtime args: \"$@\" >&2\n" +
		"exit 2\n"
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake runtime script: %v", err)
	}
	return path
}

func requireIncompatibleProviderError(t *testing.T, err error) *IncompatibleProviderError {
	t.Helper()
	var providerErr *IncompatibleProviderError
	if !errors.As(err, &providerErr) {
		t.Fatalf("error = %T %v, want IncompatibleProviderError", err, err)
	}
	return providerErr
}

func shutdownProbeManager(t *testing.T, manager *codexapp.Manager) {
	t.Helper()
	if err := manager.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown probe manager: %v", err)
	}
}

func TestCodexRuntimeFakeAppServer(t *testing.T) {
	mode := os.Getenv("SETTA_CODEXRUNTIME_FAKE_MODE")
	if mode == "" {
		return
	}
	runCodexRuntimeFakeAppServer(mode)
	os.Exit(0)
}

func runCodexRuntimeFakeAppServer(mode string) {
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		var message map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			panic(err)
		}
		method, _ := message["method"].(string)
		id, hasID := message["id"]
		if !hasID {
			continue
		}
		switch method {
		case codexapp.CodexMethodInitialize:
			if mode == "initialize-rejects" {
				writeFakeRuntimeError(id, -32600, "initialize rejected required capabilities")
			} else {
				writeFakeRuntimeResult(id, map[string]any{})
			}
		case codexapp.CodexMethodThreadList:
			if mode == "thread-list-storage-error" {
				writeFakeRuntimeError(id, -32603, "failed to open thread store")
			} else {
				writeFakeRuntimeResult(id, map[string]any{"data": []any{}})
			}
		case codexapp.CodexMethodThreadRead,
			codexapp.CodexMethodThreadGoalGet,
			codexapp.CodexMethodThreadGoalSet,
			codexapp.CodexMethodThreadGoalClear,
			codexapp.CodexMethodThreadSettingsUpdate:
			writeFakeRuntimeError(id, -32600, "thread not found: 00000000-0000-4000-8000-000000000001")
		case codexapp.CodexMethodThreadTurnsList:
			if mode == "missing-turns" {
				writeFakeRuntimeError(id, -32601, "method not found")
			} else if mode == "turns-requires-experimental" {
				writeFakeRuntimeError(id, -32600, "thread/turns/list requires experimentalApi capability")
			} else {
				writeFakeRuntimeError(id, -32600, "thread not loaded: 00000000-0000-4000-8000-000000000001")
			}
		default:
			writeFakeRuntimeError(id, -32601, "method not found")
		}
	}
}

func writeFakeRuntimeResult(id any, result any) {
	writeFakeRuntimeMessage(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"result":  result,
	})
}

func writeFakeRuntimeError(id any, code int, message string) {
	writeFakeRuntimeMessage(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"error": map[string]any{
			"code":    code,
			"message": message,
		},
	})
}

func writeFakeRuntimeMessage(message map[string]any) {
	raw, err := json.Marshal(message)
	if err != nil {
		panic(err)
	}
	os.Stdout.Write(append(raw, '\n'))
}
