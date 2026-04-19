package appsubsystem

import (
	"errors"
	"testing"

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
