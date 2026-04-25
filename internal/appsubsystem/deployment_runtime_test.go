package appsubsystem

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/plugins"
)

func TestRequireAppModeRuntimeCapabilitiesReportsProviderSelectionFailures(t *testing.T) {
	t.Parallel()

	activePluginID := "acme.active-app-provider"
	testCases := []struct {
		name         string
		capabilities plugins.PluginAppSubsystemCapabilities
		expectedErr  string
	}{
		{
			name: "no provider",
			capabilities: plugins.PluginAppSubsystemCapabilities{
				ProviderSelection: &plugins.PluginAppSubsystemProviderSelection{
					Status: plugins.PluginAppSubsystemProviderSelectionStatusNoProvider,
				},
			},
			expectedErr: "app mode requires a single active app subsystem provider with app deployment runtime support: no app subsystem provider is active",
		},
		{
			name: "disabled provider",
			capabilities: plugins.PluginAppSubsystemCapabilities{
				ProviderSelection: &plugins.PluginAppSubsystemProviderSelection{
					Status:            plugins.PluginAppSubsystemProviderSelectionStatusDisabledProvider,
					DisabledPluginIDs: []string{"acme.disabled-b", "acme.disabled-a"},
				},
			},
			expectedErr: `app mode requires a single active app subsystem provider with app deployment runtime support: installed app subsystem providers are disabled ("acme.disabled-a", "acme.disabled-b")`,
		},
		{
			name: "invalid provider",
			capabilities: plugins.PluginAppSubsystemCapabilities{
				ProviderSelection: &plugins.PluginAppSubsystemProviderSelection{
					Status:           plugins.PluginAppSubsystemProviderSelectionStatusInvalidProvider,
					InvalidPluginIDs: []string{"acme.invalid-b", "acme.invalid-a"},
				},
			},
			expectedErr: `app mode requires a single active app subsystem provider with app deployment runtime support: installed app subsystem providers are invalid ("acme.invalid-a", "acme.invalid-b")`,
		},
		{
			name: "provider conflict",
			capabilities: plugins.PluginAppSubsystemCapabilities{
				ProviderSelection: &plugins.PluginAppSubsystemProviderSelection{
					Status:               plugins.PluginAppSubsystemProviderSelectionStatusConflict,
					ConflictingPluginIDs: []string{"acme.conflict-b", "acme.conflict-a"},
				},
			},
			expectedErr: `app mode requires a single active app subsystem provider with app deployment runtime support: multiple app subsystem providers are active ("acme.conflict-a", "acme.conflict-b"); disable all but one`,
		},
		{
			name: "active provider missing deployment runtime",
			capabilities: plugins.PluginAppSubsystemCapabilities{
				ProviderSelection: &plugins.PluginAppSubsystemProviderSelection{
					Status:           plugins.PluginAppSubsystemProviderSelectionStatusActive,
					SelectedPluginID: &activePluginID,
					ActivePluginIDs:  []string{activePluginID},
				},
				PluginID:      activePluginID,
				PluginEnabled: true,
			},
			expectedErr: `app mode requires a single active app subsystem provider with app deployment runtime support: app subsystem provider "acme.active-app-provider" does not declare app deployment runtime support`,
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			err := requireAppModeRuntimeCapabilities(testCase.capabilities)
			if !errors.Is(err, ErrAppModeProviderRequired) {
				t.Fatalf("expected ErrAppModeProviderRequired, got %v", err)
			}
			if err == nil || err.Error() != testCase.expectedErr {
				t.Fatalf("expected exact error %q, got %v", testCase.expectedErr, err)
			}
		})
	}
}

func TestRequireAppModeRuntimeCapabilitiesAllowsActiveDeploymentRuntimeProvider(t *testing.T) {
	t.Parallel()

	activePluginID := "acme.active-app-provider"
	err := requireAppModeRuntimeCapabilities(plugins.PluginAppSubsystemCapabilities{
		ProviderSelection: &plugins.PluginAppSubsystemProviderSelection{
			Status:           plugins.PluginAppSubsystemProviderSelectionStatusActive,
			SelectedPluginID: &activePluginID,
			ActivePluginIDs:  []string{activePluginID},
		},
		PluginID:             activePluginID,
		PluginEnabled:        true,
		AppDeploymentRuntime: true,
	})
	if err != nil {
		t.Fatalf("expected active deployment runtime provider to pass, got %v", err)
	}
}

func TestLoadAppSubsystemCapabilitiesIgnoresGlobalScopeInDeploymentMode(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	deploymentRoot := filepath.Join(root, "deployment")
	runtimeRoot := filepath.Join(root, "runtime")
	packagedPluginID := "acme.packaged"
	writeDeploymentRuntimeTestProviderPlugin(
		t,
		filepath.Join(deploymentRoot, ".setta_plugins", packagedPluginID),
		packagedPluginID,
		true,
	)
	writeDeploymentRuntimeTestProviderPlugin(
		t,
		filepath.Join(runtimeRoot, "plugins", "acme.host"),
		"acme.host",
		false,
	)
	writeDeploymentRuntimeTestJSON(t, filepath.Join(deploymentRoot, "plugins_state.json"), map[string]any{
		"enabledPluginIds": []string{packagedPluginID},
	})

	capabilities, err := LoadAppSubsystemCapabilities(DeploymentRuntimeOptions{
		Mode:           config.ModeApp,
		DeploymentRoot: deploymentRoot,
		RuntimeRoot:    runtimeRoot,
	})
	if err != nil {
		t.Fatalf("load app subsystem capabilities: %v", err)
	}

	if capabilities.PluginID != packagedPluginID ||
		!capabilities.PluginEnabled ||
		!capabilities.AppDeploymentRuntime {
		t.Fatalf("expected packaged deployment provider capabilities, got %#v", capabilities)
	}
	if capabilities.ProviderSelection == nil {
		t.Fatalf("expected provider selection, got %#v", capabilities)
	}
	if capabilities.ProviderSelection.Status != plugins.PluginAppSubsystemProviderSelectionStatusActive {
		t.Fatalf("expected active packaged provider, got %#v", capabilities.ProviderSelection)
	}
	if capabilities.ProviderSelection.SelectedPluginID == nil ||
		*capabilities.ProviderSelection.SelectedPluginID != packagedPluginID {
		t.Fatalf("expected selected provider %q, got %#v", packagedPluginID, capabilities.ProviderSelection)
	}
	if len(capabilities.ProviderSelection.ConflictingPluginIDs) != 0 ||
		len(capabilities.ProviderSelection.InvalidPluginIDs) != 0 {
		t.Fatalf("expected global provider to be ignored, got %#v", capabilities.ProviderSelection)
	}
}

func writeDeploymentRuntimeTestProviderPlugin(
	t *testing.T,
	pluginRoot string,
	pluginID string,
	withBackend bool,
) {
	t.Helper()

	manifest := map[string]any{
		"schemaVersion":     1,
		"id":                pluginID,
		"name":              pluginID,
		"version":           "0.1.0",
		"settaVersionRange": ">=0.0.0",
		"enabledByDefault":  true,
		"capabilities":      []string{},
		"featureCapabilities": map[string]any{
			"appSubsystem": map[string]any{
				"appDeploymentRuntime": true,
			},
		},
	}
	if withBackend {
		manifest["backend"] = map[string]any{
			"entrypoint": "runtime_backend/main.py",
		}
		manifest["capabilities"] = []string{"registerAppSubsystemBackend"}
		writeDeploymentRuntimeTestBackendProbe(t, filepath.Join(pluginRoot, "runtime_backend", "main.py"))
	}
	writeDeploymentRuntimeTestJSON(t, filepath.Join(pluginRoot, "setta.plugin.json"), manifest)
}

func writeDeploymentRuntimeTestBackendProbe(t *testing.T, path string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir backend probe parent: %v", err)
	}
	content := strings.Join([]string{
		"import json",
		"import sys",
		`if len(sys.argv) == 2 and sys.argv[1] == "--setta-plugin-backend-probe":`,
		`    print(json.dumps({"schemaVersion": 1, "appSubsystemBackend": {"contractVersion": 1}}))`,
		"",
	}, "\n")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write backend probe: %v", err)
	}
}

func writeDeploymentRuntimeTestJSON(t *testing.T, path string, payload any) {
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
