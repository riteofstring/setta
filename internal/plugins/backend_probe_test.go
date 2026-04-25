package plugins

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	backendruntime "setta/internal/appsubsystem/backendruntime"
)

func TestNormalizeBackendProbeResponseRejectsInvalidRoutePaths(t *testing.T) {
	// Backend route registrations must fail closed on traversal, empty, and whitespace segments.
	pluginRoot := t.TempDir()
	testCases := map[string]string{
		"missing-leading-slash": "../escape",
		"empty-segment":         "/foo//bar",
		"encoded-traversal":     "/%2e%2e/escape",
		"whitespace":            "/with space",
	}

	for name, invalidPath := range testCases {
		t.Run(name, func(t *testing.T) {
			_, err := normalizeBackendProbeResponse(pluginRoot, "setta-fixture-backend", backendProbeResponse{
				Routes: []PluginRegisteredBackendRoute{{
					Path:    invalidPath,
					Methods: []string{"GET"},
				}},
			})
			if err == nil {
				t.Fatalf("expected invalid route path %q to fail", invalidPath)
			}
			if !strings.Contains(err.Error(), "route 0: route path") {
				t.Fatalf("expected route path validation error, got %v", err)
			}
		})
	}
}

func TestNormalizeBackendProbeResponseRejectsInvalidStaticDirRoutePrefixes(t *testing.T) {
	// Backend static-dir registrations must reject invalid URL prefixes before route mounting.
	pluginRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(pluginRoot, "backend", "static"), 0o755); err != nil {
		t.Fatalf("mkdir backend static dir: %v", err)
	}
	testCases := map[string]string{
		"missing-leading-slash-traversal": "../escape",
		"encoded-traversal":               "/%2e%2e/escape",
		"empty-segment":                   "fixture//nested",
		"whitespace":                      "fixture with spaces",
	}

	for name, invalidPrefix := range testCases {
		t.Run(name, func(t *testing.T) {
			_, err := normalizeBackendProbeResponse(pluginRoot, "setta-fixture-backend-static-router", backendProbeResponse{
				StaticDirs: []PluginRegisteredStaticDir{{
					RoutePrefix: invalidPrefix,
					Dir:         "backend/static",
				}},
			})
			if err == nil {
				t.Fatalf("expected invalid static dir route prefix %q to fail", invalidPrefix)
			}
			if !strings.Contains(err.Error(), "static dir 0: routePrefix") {
				t.Fatalf("expected static dir routePrefix validation error, got %v", err)
			}
		})
	}
}

func TestNormalizeBackendProbeResponseNormalizesAndRestrictsRouteMethods(t *testing.T) {
	// Backend route registrations should uppercase, dedupe, and reject unsupported methods.
	pluginRoot := t.TempDir()

	normalized, err := normalizeBackendProbeResponse(pluginRoot, "setta-fixture-backend", backendProbeResponse{
		Routes: []PluginRegisteredBackendRoute{{
			Path:    "/items",
			Methods: []string{"get", "GET", "post", " patch "},
		}},
	})
	if err != nil {
		t.Fatalf("normalize backend route methods: %v", err)
	}
	if got := normalized.Routes[0].Methods; !slices.Equal(got, []string{"GET", "PATCH", "POST"}) {
		t.Fatalf("expected normalized route methods, got %#v", got)
	}

	testCases := map[string][]string{
		"options": {"OPTIONS"},
		"trace":   {"TRACE"},
	}
	for name, methods := range testCases {
		t.Run(name, func(t *testing.T) {
			_, err := normalizeBackendProbeResponse(pluginRoot, "setta-fixture-backend", backendProbeResponse{
				Routes: []PluginRegisteredBackendRoute{{
					Path:    "/items",
					Methods: methods,
				}},
			})
			if err == nil {
				t.Fatalf("expected unsupported methods %#v to fail", methods)
			}
			if !strings.Contains(err.Error(), "unsupported method") {
				t.Fatalf("expected unsupported-method error, got %v", err)
			}
		})
	}
}

func TestNormalizeBackendProbeResponseSortsNormalizedRegistrations(t *testing.T) {
	// Probe normalization should trim, resolve, and sort each registration slice deterministically.
	pluginRoot := t.TempDir()
	relativeCommand := filepath.Join(pluginRoot, "backend", "fixture-language-server.sh")
	if err := os.MkdirAll(filepath.Dir(relativeCommand), 0o755); err != nil {
		t.Fatalf("mkdir language server command dir: %v", err)
	}
	if err := os.WriteFile(relativeCommand, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write language server command: %v", err)
	}
	for _, dir := range []string{
		filepath.Join(pluginRoot, "backend", "static-a"),
		filepath.Join(pluginRoot, "backend", "static-b"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir static dir %q: %v", dir, err)
		}
	}

	normalized, err := normalizeBackendProbeResponse(pluginRoot, "setta-fixture-backend", backendProbeResponse{
		CodegenTargets: []PluginRegisteredCodegenTarget{
			{TargetID: " typescript-target ", Language: "typescript", Name: "TypeScript target", DefaultFileName: "ts.txt"},
			{TargetID: " go-target ", Language: "go", Name: "Go target", DefaultFileName: "go.txt"},
		},
		LanguageServers: []PluginRegisteredLanguageServer{
			{Name: "TypeScript LS", Language: " typescript ", Command: "./backend/fixture-language-server.sh", Args: []string{" --stdio "}},
			{Name: "Go LS", Language: "go", Command: "./backend/fixture-language-server.sh", Args: []string{" --stdio "}},
		},
		UISettingsRaw: []map[string]any{
			{
				"id":             "z-setting",
				"title":          "Z setting",
				"description":    "Z description",
				"paneId":         "pane-z",
				"revealKey":      "reveal-z",
				"synonyms":       []any{"zeta"},
				"mutability":     "writable",
				"valueSchema":    map[string]any{"type": "string"},
				"readHandlerId":  "read-z",
				"writeHandlerId": "write-z",
			},
			{
				"id":            "a-setting",
				"title":         "A setting",
				"description":   "A description",
				"paneId":        "pane-a",
				"revealKey":     "reveal-a",
				"synonyms":      []any{"alpha"},
				"mutability":    "readOnly",
				"valueSchema":   map[string]any{"type": "string"},
				"readHandlerId": "read-a",
			},
		},
		Routes: []PluginRegisteredBackendRoute{
			{Path: "/z-items", Methods: []string{"post", " GET "}},
			{Path: "/a-items", Methods: []string{"get"}},
		},
		StaticDirs: []PluginRegisteredStaticDir{
			{RoutePrefix: "/z-static", Dir: "backend/static-b"},
			{RoutePrefix: "/a-static", Dir: "backend/static-a"},
		},
		ListenerEndpoints: []PluginRegisteredListenerEndpoint{
			{Name: "z-endpoint"},
			{Name: "a-endpoint"},
		},
	})
	if err != nil {
		t.Fatalf("normalize backend probe response: %v", err)
	}

	if got := []string{normalized.CodegenTargets[0].Language, normalized.CodegenTargets[1].Language}; !slices.Equal(got, []string{"go", "typescript"}) {
		t.Fatalf("expected codegen targets sorted by language, got %#v", got)
	}
	if normalized.CodegenTargets[0].PluginID != "setta-fixture-backend" || normalized.CodegenTargets[0].TargetID != "go-target" {
		t.Fatalf("expected trimmed codegen target values, got %#v", normalized.CodegenTargets[0])
	}

	if got := []string{normalized.LanguageServers[0].Language, normalized.LanguageServers[1].Language}; !slices.Equal(got, []string{"go", "typescript"}) {
		t.Fatalf("expected language servers sorted by language, got %#v", got)
	}
	if normalized.LanguageServers[0].Command != relativeCommand {
		t.Fatalf("expected relative language server command to resolve to %q, got %q", relativeCommand, normalized.LanguageServers[0].Command)
	}
	if !slices.Equal(normalized.LanguageServers[0].Args, []string{"--stdio"}) {
		t.Fatalf("expected language server args to be trimmed, got %#v", normalized.LanguageServers[0].Args)
	}

	if got := []string{normalized.UISettings[0].LocalSettingID, normalized.UISettings[1].LocalSettingID}; !slices.Equal(got, []string{"a-setting", "z-setting"}) {
		t.Fatalf("expected ui settings sorted by id, got %#v", got)
	}
	if normalized.UISettings[0].WriteHandlerID != nil {
		t.Fatalf("expected readOnly setting to omit write handler, got %#v", normalized.UISettings[0].WriteHandlerID)
	}

	if got := []string{normalized.Routes[0].Path, normalized.Routes[1].Path}; !slices.Equal(got, []string{"/a-items", "/z-items"}) {
		t.Fatalf("expected routes sorted by path, got %#v", got)
	}
	if !slices.Equal(normalized.Routes[1].Methods, []string{"GET", "POST"}) {
		t.Fatalf("expected route methods to be normalized and sorted, got %#v", normalized.Routes[1].Methods)
	}

	if got := []string{normalized.StaticDirs[0].RoutePrefix, normalized.StaticDirs[1].RoutePrefix}; !slices.Equal(got, []string{"/a-static", "/z-static"}) {
		t.Fatalf("expected static dirs sorted by prefix, got %#v", got)
	}
	if got := []string{normalized.ListenerEndpoints[0].Name, normalized.ListenerEndpoints[1].Name}; !slices.Equal(got, []string{"a-endpoint", "z-endpoint"}) {
		t.Fatalf("expected listener endpoints sorted by name, got %#v", got)
	}
}

func TestNormalizeBackendProbeResponseValidatesAppSubsystemBackendContractVersion(
	t *testing.T,
) {
	t.Parallel()

	pluginRoot := t.TempDir()
	normalized, err := normalizeBackendProbeResponse(
		pluginRoot,
		"setta-fixture-backend",
		backendProbeResponse{
			AppSubsystemBackend: &backendProbeAppSubsystemBackendRegistration{
				ContractVersion: backendruntime.AppSubsystemBackendContractVersion,
			},
		},
	)
	if err != nil {
		t.Fatalf("normalize app subsystem backend registration: %v", err)
	}
	if normalized.AppSubsystemBackend == nil || normalized.AppSubsystemBackend.ContractVersion != backendruntime.AppSubsystemBackendContractVersion {
		t.Fatalf("expected normalized app subsystem backend registration, got %#v", normalized.AppSubsystemBackend)
	}

	_, err = normalizeBackendProbeResponse(
		pluginRoot,
		"setta-fixture-backend",
		backendProbeResponse{
			AppSubsystemBackend: &backendProbeAppSubsystemBackendRegistration{
				ContractVersion: backendruntime.AppSubsystemBackendContractVersion + 1,
			},
		},
	)
	if err == nil {
		t.Fatal("expected unsupported app subsystem backend contract version to fail")
	}
	if !strings.Contains(err.Error(), "appSubsystemBackend: unsupported contract version") {
		t.Fatalf("expected app subsystem backend version error, got %v", err)
	}
}

func TestNormalizeBackendLanguageServerRegistrationResolvesPluginRelativeCommand(t *testing.T) {
	// Plugin language-server commands should resolve relative filesystem paths against the plugin root.
	pluginRoot := t.TempDir()
	commandPath := filepath.Join(pluginRoot, "backend", "fixture-language-server.sh")
	if err := os.MkdirAll(filepath.Dir(commandPath), 0o755); err != nil {
		t.Fatalf("mkdir language server command dir: %v", err)
	}
	if err := os.WriteFile(commandPath, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write language server command: %v", err)
	}

	for name, command := range map[string]string{
		"dot-slash":       "./backend/fixture-language-server.sh",
		"subpath":         filepath.Join("backend", "fixture-language-server.sh"),
		"windows-subpath": `.\backend\fixture-language-server.sh`,
	} {
		t.Run(name, func(t *testing.T) {
			normalized, err := normalizeBackendLanguageServerRegistration(pluginRoot, "setta-fixture-backend", PluginRegisteredLanguageServer{
				Name:     "Fixture DSL",
				Language: "TypeScript",
				Command:  command,
				Args:     []string{"--stdio"},
			})
			if err != nil {
				t.Fatalf("normalize backend language server registration: %v", err)
			}
			if normalized.Command != commandPath {
				t.Fatalf("expected plugin-relative command to resolve to %q, got %q", commandPath, normalized.Command)
			}
		})
	}
}

func TestNormalizeBackendLanguageServerRegistrationRejectsMissingPathLikeCommands(t *testing.T) {
	pluginRoot := t.TempDir()

	for name, command := range map[string]string{
		"absolute":        filepath.Join(t.TempDir(), "missing-language-server"),
		"dot-slash":       "./backend/missing-language-server",
		"subpath":         filepath.Join("backend", "missing-language-server"),
		"windows-subpath": `.\backend\missing-language-server`,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := normalizeBackendLanguageServerRegistration(pluginRoot, "setta-fixture-backend", PluginRegisteredLanguageServer{
				Name:     "Fixture DSL",
				Language: "TypeScript",
				Command:  command,
				Args:     []string{"--stdio"},
			})
			if err == nil || !strings.Contains(err.Error(), "not executable") {
				t.Fatalf("expected missing path-like command to fail as non-executable, got %v", err)
			}
		})
	}
}

func TestNormalizeBackendLanguageServerRegistrationPreservesCustomSettingsKey(t *testing.T) {
	// Plugin language-server registrations should keep trimmed custom settings keys.
	pluginRoot := t.TempDir()
	settingsKey := " fixtureDslLanguageServer "

	normalized, err := normalizeBackendLanguageServerRegistration(pluginRoot, "setta-fixture-backend", PluginRegisteredLanguageServer{
		Name:        "Fixture DSL",
		Language:    "FixtureDSL",
		Command:     "python3",
		Args:        []string{"--stdio"},
		SettingsKey: &settingsKey,
	})
	if err != nil {
		t.Fatalf("normalize backend language server registration: %v", err)
	}
	if normalized.Language != "fixturedsl" {
		t.Fatalf("expected normalized language id fixturedsl, got %q", normalized.Language)
	}
	if normalized.SettingsKey == nil || *normalized.SettingsKey != "fixtureDslLanguageServer" {
		t.Fatalf("expected custom settings key to be preserved, got %#v", normalized.SettingsKey)
	}
}

func TestNormalizeBackendLanguageServerRegistrationPreservesRuntimeSearchPathsKey(t *testing.T) {
	pluginRoot := t.TempDir()
	runtimeSearchPathsKey := " fixtureDslLanguageServer.analysis.extraPaths "

	normalized, err := normalizeBackendLanguageServerRegistration(pluginRoot, "setta-fixture-backend", PluginRegisteredLanguageServer{
		Name:                  "Fixture DSL",
		Language:              "FixtureDSL",
		Command:               "python3",
		Args:                  []string{"--stdio"},
		RuntimeSearchPathsKey: &runtimeSearchPathsKey,
	})
	if err != nil {
		t.Fatalf("normalize backend language server registration: %v", err)
	}
	if normalized.RuntimeSearchPathsKey == nil || *normalized.RuntimeSearchPathsKey != "fixtureDslLanguageServer.analysis.extraPaths" {
		t.Fatalf("expected runtime search paths key to be preserved, got %#v", normalized.RuntimeSearchPathsKey)
	}
}

func TestNormalizeBackendLanguageServerRegistrationRejectsInvalidFields(t *testing.T) {
	// Language-server registrations must fail closed on missing commands.
	pluginRoot := t.TempDir()
	testCases := []struct {
		name         string
		registration PluginRegisteredLanguageServer
		wantErr      string
	}{
		{
			name: "missing-command",
			registration: PluginRegisteredLanguageServer{
				Name:     "Fixture DSL",
				Language: "typescript",
				Command:  "   ",
			},
			wantErr: "command is required",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := normalizeBackendLanguageServerRegistration(pluginRoot, "setta-fixture-backend", testCase.registration)
			if err == nil {
				t.Fatalf("expected invalid language-server registration %#v to fail", testCase.registration)
			}
			if !strings.Contains(err.Error(), testCase.wantErr) {
				t.Fatalf("expected error containing %q, got %v", testCase.wantErr, err)
			}
		})
	}
}

func TestNormalizeBackendLanguageServerRegistrationAllowsPythonTargets(t *testing.T) {
	pluginRoot := t.TempDir()

	normalized, err := normalizeBackendLanguageServerRegistration(pluginRoot, "setta-fixture-backend", PluginRegisteredLanguageServer{
		Name:     "Fixture Python",
		Language: "python",
		Command:  "python3",
		Args:     []string{"--stdio"},
	})
	if err != nil {
		t.Fatalf("normalize backend language server registration: %v", err)
	}
	if normalized.Language != "python" {
		t.Fatalf("expected normalized python language id, got %q", normalized.Language)
	}
}

func TestNormalizeBackendLanguageServersRejectsMultipleImplementationsPerPlugin(t *testing.T) {
	pluginRoot := t.TempDir()

	_, err := normalizeBackendLanguageServers(pluginRoot, "setta-fixture-backend", []PluginRegisteredLanguageServer{
		{
			Name:     "Fixture One",
			Language: "python",
			Command:  "python3",
			Args:     []string{"--stdio"},
		},
		{
			Name:     "Fixture Two",
			Language: "bash",
			Command:  "node",
			Args:     []string{"server.js"},
		},
	})
	if err == nil {
		t.Fatal("expected multiple plugin language server implementations to fail")
	}
	if !strings.Contains(err.Error(), "one implementation per plugin") {
		t.Fatalf("expected single-implementation error, got %v", err)
	}
}

func TestNormalizeBackendLanguageServerRegistrationTreatsBlankSettingsKeyAsOmitted(t *testing.T) {
	// Blank settings keys are normalized away instead of failing the entire registration.
	pluginRoot := t.TempDir()
	settingsKey := "   "

	normalized, err := normalizeBackendLanguageServerRegistration(pluginRoot, "setta-fixture-backend", PluginRegisteredLanguageServer{
		Name:        "Fixture DSL",
		Language:    "typescript",
		Command:     "python3",
		SettingsKey: &settingsKey,
	})
	if err != nil {
		t.Fatalf("normalize backend language server registration: %v", err)
	}
	if normalized.SettingsKey != nil {
		t.Fatalf("expected blank settings key to be omitted, got %#v", normalized.SettingsKey)
	}
}

func TestDecodeBackendProbeResponseRejectsRouteMethodsNotArrayOfStrings(t *testing.T) {
	// Malformed route method payloads should fail decode before probe normalization runs.
	_, err := decodeBackendProbeResponse([]byte(`{
		"schemaVersion": 1,
		"routes": [
			{
				"path": "/items",
				"methods": "GET"
			}
		]
	}`))
	if err == nil {
		t.Fatal("expected malformed route methods payload to fail decode")
	}
	if !strings.Contains(err.Error(), "methods") {
		t.Fatalf("expected route methods decode error, got %v", err)
	}
}

func TestDecodeBackendProbeResponseRejectsLanguageServerArgsNotArrayOfStrings(t *testing.T) {
	// Malformed language-server payloads should fail decode before they reach runtime status.
	_, err := decodeBackendProbeResponse([]byte(`{
		"schemaVersion": 1,
		"languageServers": [
			{
				"name": "Fixture DSL",
				"language": "typescript",
				"command": "python3",
				"args": "--stdio"
			}
		]
	}`))
	if err == nil {
		t.Fatal("expected malformed language-server args payload to fail decode")
	}
	if !strings.Contains(err.Error(), "args") {
		t.Fatalf("expected args decode error, got %v", err)
	}
}

func TestDecodeBackendProbeResponseRejectsUnknownLanguageServerFields(t *testing.T) {
	// Unknown language-server fields must fail decode instead of being silently ignored.
	_, err := decodeBackendProbeResponse([]byte(`{
		"schemaVersion": 1,
		"languageServers": [
			{
				"name": "Fixture DSL",
				"language": "typescript",
				"command": "python3",
				"unsupported": true
			}
		]
	}`))
	if err == nil {
		t.Fatal("expected unknown language-server field to fail decode")
	}
	if !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("expected unknown-field decode error, got %v", err)
	}
}

func TestNormalizeBackendCodegenTargetRegistrationRejectsInvalidFields(t *testing.T) {
	// Codegen target registrations must fail closed on missing required fields and invalid default files.
	testCases := []struct {
		name    string
		target  PluginRegisteredCodegenTarget
		wantErr string
	}{
		{
			name: "missing-target-id",
			target: PluginRegisteredCodegenTarget{
				Language:        "setta-fixture-backend-codegen:typescript",
				Name:            "Fixture TypeScript State",
				DefaultFileName: "fixture_state.ts",
			},
			wantErr: "targetId is required",
		},
		{
			name: "missing-name",
			target: PluginRegisteredCodegenTarget{
				TargetID:        "typescript",
				Language:        "setta-fixture-backend-codegen:typescript",
				DefaultFileName: "fixture_state.ts",
			},
			wantErr: "name is required",
		},
		{
			name: "missing-default-file-name",
			target: PluginRegisteredCodegenTarget{
				TargetID: "typescript",
				Language: "setta-fixture-backend-codegen:typescript",
				Name:     "Fixture TypeScript State",
			},
			wantErr: "defaultFileName is required",
		},
		{
			name: "path-default-file-name",
			target: PluginRegisteredCodegenTarget{
				TargetID:        "typescript",
				Language:        "setta-fixture-backend-codegen:typescript",
				Name:            "Fixture TypeScript State",
				DefaultFileName: "nested/fixture_state.ts",
			},
			wantErr: "must be a file name",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := normalizeBackendCodegenTargetRegistration("setta-fixture-backend", testCase.target)
			if err == nil {
				t.Fatalf("expected invalid codegen target registration %#v to fail", testCase.target)
			}
			if !strings.Contains(err.Error(), testCase.wantErr) {
				t.Fatalf("expected error containing %q, got %v", testCase.wantErr, err)
			}
		})
	}
}

func TestDecodeBackendProbeResponseRejectsUnsupportedSchemaVersion(t *testing.T) {
	// Probe schema mismatches should fail closed instead of activating stale backends.
	_, err := decodeBackendProbeResponse([]byte(`{
		"schemaVersion": 999,
		"codegenTargets": [],
		"languageServers": [],
		"uiSettings": [],
		"routes": [],
		"staticDirs": [],
		"listenerEndpoints": []
	}`))
	if err == nil {
		t.Fatal("expected unsupported probe schema version to fail")
	}
	if !strings.Contains(err.Error(), "unsupported schema version") {
		t.Fatalf("expected schema version error, got %v", err)
	}
}

func TestDecodeBackendProbeResponseRejectsLeadingStdoutNoise(t *testing.T) {
	// Probe stdout is reserved for JSON, so leading logs must fail decode.
	_, err := decodeBackendProbeResponse([]byte("plugin-import-log\n{\"schemaVersion\":1}"))
	if err == nil {
		t.Fatal("expected leading stdout noise to fail decode")
	}
}

func TestNormalizeBackendUISettingRegistrationDefaultWritable(t *testing.T) {
	t.Parallel()

	raw := map[string]any{
		"id":             " setting-id ",
		"title":          " Setting Title ",
		"description":    " Description ",
		"paneId":         " pane.settings ",
		"revealKey":      " reveal.key ",
		"synonyms":       []any{" first ", "second"},
		"valueSchema":    map[string]any{"type": "boolean"},
		"readHandlerId":  " read-handler ",
		"writeHandlerId": " write-handler ",
	}

	registration, err := normalizeBackendUISettingRegistration(" plugin.test ", raw)
	if err != nil {
		t.Fatalf("normalize backend ui setting registration: %v", err)
	}

	if registration.LocalSettingID != "setting-id" {
		t.Fatalf("expected trimmed local setting id, got %#v", registration.LocalSettingID)
	}
	if registration.PluginID != "plugin.test" {
		t.Fatalf("expected trimmed plugin id, got %#v", registration.PluginID)
	}
	if registration.Mutability != "writable" {
		t.Fatalf("expected default writable mutability, got %#v", registration.Mutability)
	}
	if registration.WriteHandlerID == nil || *registration.WriteHandlerID != "write-handler" {
		t.Fatalf("expected write handler id, got %#v", registration.WriteHandlerID)
	}
	if len(registration.Synonyms) != 2 || registration.Synonyms[0] != "first" || registration.Synonyms[1] != "second" {
		t.Fatalf("expected trimmed synonyms, got %#v", registration.Synonyms)
	}

	rawSchema := raw["valueSchema"].(map[string]any)
	rawSchema["type"] = "string"
	if registration.ValueSchema["type"] != "boolean" {
		t.Fatalf("expected cloned value schema, got %#v", registration.ValueSchema)
	}
}

func TestNormalizeBackendUISettingRegistrationReadOnlyOmitsWriteHandler(t *testing.T) {
	t.Parallel()

	registration, err := normalizeBackendUISettingRegistration("plugin.test", map[string]any{
		"id":            "setting-id",
		"title":         "Setting Title",
		"description":   "Description",
		"paneId":        "pane.settings",
		"revealKey":     "reveal.key",
		"mutability":    "readOnly",
		"valueSchema":   map[string]any{"type": "boolean"},
		"readHandlerId": "read-handler",
	})
	if err != nil {
		t.Fatalf("normalize readOnly backend ui setting registration: %v", err)
	}
	if registration.Mutability != "readOnly" {
		t.Fatalf("expected readOnly mutability, got %#v", registration.Mutability)
	}
	if registration.WriteHandlerID != nil {
		t.Fatalf("expected no write handler, got %#v", registration.WriteHandlerID)
	}
}

func TestNormalizeBackendUISettingRegistrationRejectsInvalidInputs(t *testing.T) {
	t.Parallel()

	base := func() map[string]any {
		return map[string]any{
			"id":             "setting-id",
			"title":          "Setting Title",
			"description":    "Description",
			"paneId":         "pane.settings",
			"revealKey":      "reveal.key",
			"valueSchema":    map[string]any{"type": "boolean"},
			"readHandlerId":  "read-handler",
			"writeHandlerId": "write-handler",
		}
	}

	tests := []struct {
		name      string
		mutate    func(map[string]any)
		wantError string
	}{
		{
			name: "unsupported key",
			mutate: func(raw map[string]any) {
				raw["extra"] = true
			},
			wantError: `unsupported key "extra"`,
		},
		{
			name: "compound id",
			mutate: func(raw map[string]any) {
				raw["id"] = "group::setting"
			},
			wantError: "id must not contain '::'",
		},
		{
			name: "readOnly with write handler",
			mutate: func(raw map[string]any) {
				raw["mutability"] = "readOnly"
			},
			wantError: "writeHandlerId must be omitted when mutability=readOnly",
		},
		{
			name: "writable without write handler",
			mutate: func(raw map[string]any) {
				delete(raw, "writeHandlerId")
			},
			wantError: "writeHandlerId is required when mutability=writable",
		},
		{
			name: "non object schema",
			mutate: func(raw map[string]any) {
				raw["valueSchema"] = []any{"boolean"}
			},
			wantError: "valueSchema must be an object",
		},
	}

	for _, testCase := range tests {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			raw := base()
			testCase.mutate(raw)

			_, err := normalizeBackendUISettingRegistration("plugin.test", raw)
			if err == nil {
				t.Fatalf("expected error containing %q", testCase.wantError)
			}
			if !strings.Contains(err.Error(), testCase.wantError) {
				t.Fatalf("expected error containing %q, got %v", testCase.wantError, err)
			}
		})
	}
}
