package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The first Go-owned codegen runtime should start a real worker, capture its registration, and invoke generation end to end.
func TestStartCodegenRuntimeWithPythonWorker(t *testing.T) {
	spec := newBackendCodegenWorkerSpec(t, []string{CapabilityRegisterCodegenTarget})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	runtime, err := StartCodegenRuntime(ctx, CodegenRuntimeStartOptions{
		WorkerSpec: spec,
	})
	if err != nil {
		t.Fatalf("start codegen runtime: %v", err)
	}
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close codegen runtime: %v", err)
		}
	}()

	handshake := runtime.Handshake()
	if handshake.PluginID != "setta-fixture-backend-codegen" {
		t.Fatalf("expected backend-codegen handshake, got %q", handshake.PluginID)
	}
	if handshake.PluginVersion != "0.1.0" {
		t.Fatalf("expected plugin version 0.1.0, got %q", handshake.PluginVersion)
	}

	registrations := runtime.Registrations()
	if len(registrations) != 1 {
		t.Fatalf("expected 1 codegen registration, got %d", len(registrations))
	}
	registration := registrations[0]
	if registration.TargetID != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("expected typescript target id, got %q", registration.TargetID)
	}
	if registration.PluginID != "setta-fixture-backend-codegen" {
		t.Fatalf("expected backend-codegen plugin id, got %q", registration.PluginID)
	}
	if registration.Language != "typescript" {
		t.Fatalf("expected typescript language, got %q", registration.Language)
	}
	if registration.Name != "TypeScript" {
		t.Fatalf("expected TypeScript target name, got %q", registration.Name)
	}
	if registration.DefaultFileName != "setta_gen.ts" {
		t.Fatalf("expected default file name setta_gen.ts, got %q", registration.DefaultFileName)
	}

	generatedFiles, err := runtime.Generate(ctx, registration.TargetID, map[string]any{
		"projectConfig": map[string]any{
			"name": "FixtureProject",
		},
	}, map[string]any{
		"className": "FixtureState",
	})
	if err != nil {
		t.Fatalf("generate codegen target: %v", err)
	}

	if len(generatedFiles) != 1 {
		t.Fatalf("expected 1 generated file, got %d", len(generatedFiles))
	}
	if generatedFiles[0].RelativePath != "setta_gen.ts" {
		t.Fatalf("expected setta_gen.ts output, got %q", generatedFiles[0].RelativePath)
	}
	expectedContent := "export class FixtureState {\n  readonly projectName = 'FixtureProject';\n}\n"
	if generatedFiles[0].Content != expectedContent {
		t.Fatalf("unexpected generated content: %q", generatedFiles[0].Content)
	}
}

// Capability-denied host failures should surface back through worker registration as typed RPC errors.
func TestStartCodegenRuntimePropagatesCapabilityDenied(t *testing.T) {
	spec := newBackendCodegenWorkerSpec(t, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	runtime, err := StartCodegenRuntime(ctx, CodegenRuntimeStartOptions{
		WorkerSpec: spec,
	})
	if runtime != nil {
		t.Fatal("expected nil runtime")
	}
	if err == nil {
		t.Fatal("expected start failure")
	}

	var rpcErr *WorkerRPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected worker RPC error, got %T: %v", err, err)
	}
	if rpcErr.Code != workerRPCCapabilityDeniedCode {
		t.Fatalf("expected %q error code, got %q", workerRPCCapabilityDeniedCode, rpcErr.Code)
	}
	if !strings.Contains(rpcErr.Message, CapabilityRegisterCodegenTarget) {
		t.Fatalf("expected capability name in %q", rpcErr.Message)
	}
}

// Go should continue to validate worker codegen payloads instead of trusting arbitrary result shapes.
func TestNormalizeCodegenGenerationPayloadRejectsInvalidEntries(t *testing.T) {
	t.Parallel()

	registration := RegisteredCodegenTarget{
		TargetID:        "setta-fixture-backend-codegen:typescript",
		PluginID:        "setta-fixture-backend-codegen",
		DefaultFileName: "setta_gen.ts",
	}

	testCases := []struct {
		name    string
		payload any
		message string
	}{
		{
			name:    "missing files",
			payload: map[string]any{},
			message: "must include files array",
		},
		{
			name:    "empty files",
			payload: map[string]any{"files": []any{}},
			message: "must generate at least one file",
		},
		{
			name: "absolute path",
			payload: map[string]any{
				"files": []any{
					map[string]any{
						"relativePath": "/tmp/absolute.ts",
						"content":      "export const x = 1;\n",
					},
				},
			},
			message: "cannot be absolute",
		},
		{
			name: "windows absolute path",
			payload: map[string]any{
				"files": []any{
					map[string]any{
						"relativePath": `C:\tmp\absolute.ts`,
						"content":      "export const x = 1;\n",
					},
				},
			},
			message: "cannot be absolute",
		},
		{
			name: "escaping path",
			payload: map[string]any{
				"files": []any{
					map[string]any{
						"relativePath": "../escape.ts",
						"content":      "export const x = 1;\n",
					},
				},
			},
			message: "cannot escape target root",
		},
		{
			name: "duplicate path",
			payload: map[string]any{
				"files": []any{
					map[string]any{
						"relativePath": "setta_gen.ts",
						"content":      "first",
					},
					map[string]any{
						"relativePath": "./setta_gen.ts",
						"content":      "second",
					},
				},
			},
			message: "is duplicated",
		},
		{
			name: "non-string content",
			payload: map[string]any{
				"files": []any{
					map[string]any{
						"relativePath": "setta_gen.ts",
						"content":      123,
					},
				},
			},
			message: "content must be a string",
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			encoded, err := json.Marshal(testCase.payload)
			if err != nil {
				t.Fatalf("marshal payload: %v", err)
			}

			_, err = normalizeCodegenGenerationPayload(registration, encoded)
			if !errors.Is(err, ErrCodegenGenerationPayloadInvalid) {
				t.Fatalf("expected payload-invalid error, got %v", err)
			}
			if !strings.Contains(err.Error(), testCase.message) {
				t.Fatalf("expected %q in %v", testCase.message, err)
			}
		})
	}
}

// Equivalent path spellings should collapse to one canonical relative path before file writes happen.
func TestNormalizeCodegenGenerationPayloadCanonicalizesRelativePaths(t *testing.T) {
	t.Parallel()

	registration := RegisteredCodegenTarget{
		TargetID:        "setta-fixture-backend-codegen:typescript",
		PluginID:        "setta-fixture-backend-codegen",
		DefaultFileName: "setta_gen.ts",
	}
	encoded, err := json.Marshal(map[string]any{
		"files": []any{
			map[string]any{
				"relativePath": "./nested//setta_gen.ts",
				"content":      "export const x = 1;\n",
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	generatedFiles, err := normalizeCodegenGenerationPayload(registration, encoded)
	if err != nil {
		t.Fatalf("normalize generation payload: %v", err)
	}
	if len(generatedFiles) != 1 {
		t.Fatalf("expected 1 generated file, got %d", len(generatedFiles))
	}
	if generatedFiles[0].RelativePath != "nested/setta_gen.ts" {
		t.Fatalf("expected canonicalized path, got %q", generatedFiles[0].RelativePath)
	}
}

func newBackendCodegenWorkerSpec(t *testing.T, effectiveCapabilities []string) BackendWorkerSpec {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	pluginRoot := copyBackendCodegenFixture(t, repoRoot)
	return BackendWorkerSpec{
		PythonBinary:          workerRPCTestPythonBinary(t, repoRoot),
		PluginID:              "setta-fixture-backend-codegen",
		PluginVersion:         "0.1.0",
		PluginRoot:            pluginRoot,
		Entrypoint:            filepath.Join(pluginRoot, "backend", "entrypoint.py"),
		ServerMode:            "launcher",
		EffectiveCapabilities: append([]string(nil), effectiveCapabilities...),
		Environment:           workerRPCTestEnv(repoRoot),
		WorkingDirectory:      repoRoot,
	}
}

func copyBackendCodegenFixture(t *testing.T, repoRoot string) string {
	t.Helper()

	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend-codegen")
	targetRoot := filepath.Join(t.TempDir(), "backend-codegen")
	copyBackendCodegenFixtureDir(t, sourceRoot, targetRoot)
	return targetRoot
}

func copyBackendCodegenFixtureDir(t *testing.T, sourceRoot string, targetRoot string) {
	t.Helper()

	entries, err := os.ReadDir(sourceRoot)
	if err != nil {
		t.Fatalf("read fixture directory %s: %v", sourceRoot, err)
	}
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		t.Fatalf("mkdir fixture target %s: %v", targetRoot, err)
	}

	for _, entry := range entries {
		sourcePath := filepath.Join(sourceRoot, entry.Name())
		targetPath := filepath.Join(targetRoot, entry.Name())

		if entry.IsDir() {
			copyBackendCodegenFixtureDir(t, sourcePath, targetPath)
			continue
		}

		info, err := entry.Info()
		if err != nil {
			t.Fatalf("stat fixture entry %s: %v", sourcePath, err)
		}
		payload, err := os.ReadFile(sourcePath)
		if err != nil {
			t.Fatalf("read fixture file %s: %v", sourcePath, err)
		}
		if err := os.WriteFile(targetPath, payload, info.Mode().Perm()); err != nil {
			t.Fatalf("write fixture file %s: %v", targetPath, err)
		}
	}
}
