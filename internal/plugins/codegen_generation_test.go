package plugins

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
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

func TestServiceResolvePluginCodegenTargetImplementationKeyIncludesPluginAndSourceDigest(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan plugins: %v", err)
	}
	entry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if entry.SourceDigestSHA256 == nil || strings.TrimSpace(*entry.SourceDigestSHA256) == "" {
		t.Fatalf("expected source digest on backend fixture entry, got %#v", entry.SourceDigestSHA256)
	}

	resolved, ok, err := service.ResolvePluginCodegenTarget(context.Background(), "setta-fixture-backend-codegen:typescript")
	if err != nil {
		t.Fatalf("resolve plugin codegen target: %v", err)
	}
	if !ok {
		t.Fatal("expected resolved plugin codegen target")
	}

	for _, fragment := range []string{
		entry.PluginID,
		"typescript",
		"setta-fixture-backend-codegen:typescript",
		*entry.SourceDigestSHA256,
	} {
		if !strings.Contains(resolved.ImplementationKey, fragment) {
			t.Fatalf("expected implementation key %q to contain %q", resolved.ImplementationKey, fragment)
		}
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

func TestServiceGeneratePluginCodegenTargetRejectsMissingResponsePayload(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})
	writePluginBackendCodegenFixtureMainGo(t, pluginRoot, `{"schemaVersion":1}`)

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	_, err := service.GeneratePluginCodegenTarget(
		context.Background(),
		"setta-fixture-backend-codegen:typescript",
		map[string]any{"name": "Alpha"},
		map[string]any{"className": "FixtureState"},
	)
	if err == nil {
		t.Fatal("expected missing codegen response payload to fail")
	}
	if !strings.Contains(err.Error(), "missing codegen target response payload") {
		t.Fatalf("expected missing codegen target response payload error, got %v", err)
	}
}

func TestServiceGeneratePluginCodegenTargetRejectsBlankLanguageAndUnknownTarget(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	_, err := service.GeneratePluginCodegenTarget(
		context.Background(),
		" ",
		map[string]any{},
		map[string]any{},
	)
	if err == nil {
		t.Fatal("expected blank codegen language to fail")
	}
	if !strings.Contains(err.Error(), "codegen target language is required") {
		t.Fatalf("expected blank language validation error, got %v", err)
	}

	_, err = service.GeneratePluginCodegenTarget(
		context.Background(),
		"setta-fixture-backend-codegen:missing",
		map[string]any{},
		map[string]any{},
	)
	if !strings.Contains(err.Error(), ErrRegisteredCodegenTargetNotFound.Error()) {
		t.Fatalf("expected unknown target not-found error, got %v", err)
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

func TestServiceGeneratePluginCodegenTargetHonorsCanceledContext(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := service.GeneratePluginCodegenTarget(
		ctx,
		"setta-fixture-backend-codegen:typescript",
		map[string]any{"name": "Alpha"},
		map[string]any{"className": "FixtureState"},
	)
	if err == nil {
		t.Fatal("expected canceled context to abort plugin codegen generation")
	}
	if !strings.Contains(err.Error(), "context canceled") {
		t.Fatalf("expected context canceled error, got %v", err)
	}
}

func TestServiceGeneratePluginCodegenTargetWaitsForServiceLock(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerCodegenTarget"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	assertServiceCallWaitsForLock(t, service, func() error {
		_, err := service.GeneratePluginCodegenTarget(
			context.Background(),
			"setta-fixture-backend-codegen:typescript",
			map[string]any{"name": "Alpha"},
			map[string]any{},
		)
		return err
	})
}

func TestNormalizeGeneratedCodegenFilesRejectsInvalidEntries(t *testing.T) {
	t.Parallel()

	target := PluginRegisteredCodegenTarget{
		PluginID:        "setta-fixture-backend",
		TargetID:        "typescript",
		Language:        "setta-fixture-backend-codegen:typescript",
		Name:            "Fixture TypeScript State",
		DefaultFileName: "setta_gen.ts",
	}
	testCases := []struct {
		name    string
		files   []backendRuntimeCodegenFile
		wantErr string
	}{
		{
			name: "absolute-path",
			files: []backendRuntimeCodegenFile{{
				RelativePath: stringPointer("/tmp/absolute.ts"),
				Content:      stringPointer("export const x = 1;\n"),
			}},
			wantErr: "cannot be absolute",
		},
		{
			name: "escape-path",
			files: []backendRuntimeCodegenFile{{
				RelativePath: stringPointer("../escape.ts"),
				Content:      stringPointer("export const x = 1;\n"),
			}},
			wantErr: "cannot escape target root",
		},
		{
			name: "duplicate-path",
			files: []backendRuntimeCodegenFile{
				{
					RelativePath: stringPointer("setta_gen.ts"),
					Content:      stringPointer("first"),
				},
				{
					RelativePath: stringPointer("./setta_gen.ts"),
					Content:      stringPointer("second"),
				},
			},
			wantErr: "is duplicated",
		},
		{
			name: "missing-content",
			files: []backendRuntimeCodegenFile{{
				RelativePath: stringPointer("setta_gen.ts"),
			}},
			wantErr: "content is required",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := normalizeGeneratedCodegenFiles(target, testCase.files)
			if err == nil {
				t.Fatalf("expected invalid generated files %#v to fail", testCase.files)
			}
			if !strings.Contains(err.Error(), testCase.wantErr) {
				t.Fatalf("expected error containing %q, got %v", testCase.wantErr, err)
			}
		})
	}
}

func TestNormalizeGeneratedCodegenFilesAllowsEmptyList(t *testing.T) {
	t.Parallel()

	target := PluginRegisteredCodegenTarget{
		PluginID:        "setta-fixture-backend",
		TargetID:        "typescript",
		Language:        "setta-fixture-backend-codegen:typescript",
		Name:            "Fixture TypeScript State",
		DefaultFileName: "setta_gen.ts",
	}

	files, err := normalizeGeneratedCodegenFiles(target, nil)
	if err != nil {
		t.Fatalf("normalize generated codegen files: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("expected empty generated file list, got %#v", files)
	}
}

func writePluginBackendCodegenFixtureMainGo(t *testing.T, pluginRoot string, runtimePayload string) {
	t.Helper()

	source := fmt.Sprintf(`package main

import (
	"encoding/json"
	"fmt"
	"os"
)

const (
	backendProbeArg = "--setta-plugin-backend-probe"
	backendRuntimeArg = "--setta-plugin-backend-runtime"
)

func main() {
	if len(os.Args) != 2 {
		return
	}
	switch os.Args[1] {
	case backendProbeArg:
		writeJSON(map[string]any{
			"schemaVersion": 1,
			"codegenTargets": []map[string]any{
				{
					"targetId":        "typescript",
					"language":        "setta-fixture-backend-codegen:typescript",
					"name":            "Fixture TypeScript State",
					"defaultFileName": "fixture_state.ts",
				},
			},
			"languageServers":   []map[string]any{},
			"uiSettings":        []map[string]any{},
			"routes":            []map[string]any{},
			"staticDirs":        []map[string]any{},
			"listenerEndpoints": []map[string]any{},
		})
	case backendRuntimeArg:
		writeRawJSON(%q)
	}
}

func writeJSON(payload any) {
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		fail("encode payload: %%v", err)
	}
}

func writeRawJSON(payload string) {
	if _, err := fmt.Fprintln(os.Stdout, payload); err != nil {
		fail("write payload: %%v", err)
	}
}

func fail(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
`, runtimePayload)

	if err := os.WriteFile(filepath.Join(pluginRoot, "backend", "main.go"), []byte(source), 0o644); err != nil {
		t.Fatalf("write backend codegen fixture main.go: %v", err)
	}
}
