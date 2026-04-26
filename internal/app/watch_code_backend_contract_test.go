package app

import (
	"encoding/json"
	"net/http"
	"testing"

	"setta/internal/plugins"
	"setta/internal/watchcodecontracts"
)

func TestWatchCodeBackendContractDrivesRouteAndUISettingMatching(t *testing.T) {
	t.Parallel()

	const pluginID = "setta-watch-code"
	for _, suffix := range watchcodecontracts.BackendRouteSuffixes() {
		gotPluginID, gotSuffix, ok := watchcodecontracts.ParseBackendRoutePath(
			watchcodecontracts.BackendRoutePath(pluginID, suffix),
		)
		if !ok || gotPluginID != pluginID || gotSuffix != suffix {
			t.Fatalf("expected route suffix %q to parse for %q, got plugin=%q suffix=%q ok=%v", suffix, pluginID, gotPluginID, gotSuffix, ok)
		}
	}

	if _, _, ok := watchcodecontracts.ParseBackendRoutePath(watchcodecontracts.BackendRoutePath(pluginID, "missing")); ok {
		t.Fatal("expected unknown Watch Code backend route suffix to be rejected")
	}
	if _, _, ok := watchcodecontracts.ParseBackendRoutePath("/plugins/" + pluginID + "/watch-code/ enabled"); ok {
		t.Fatal("expected route suffixes with segment whitespace to be rejected")
	}
	if _, _, ok := watchcodecontracts.ParseBackendRoutePath("/plugins/plugin-alpha/nested/watch-code/inputs"); ok {
		t.Fatal("expected nested non-contract Watch Code-looking route to be rejected")
	}
	if gotPluginID, gotSuffix, ok := watchcodecontracts.ParseBackendRoutePath("/plugins/plugin-alpha/watch-code/inputs"); !ok || gotPluginID != "plugin-alpha" || gotSuffix != watchcodecontracts.BackendRouteSuffixInputs {
		t.Fatalf("expected exact Watch Code route to parse, got plugin=%q suffix=%q ok=%v", gotPluginID, gotSuffix, ok)
	}
	if _, _, ok := watchcodecontracts.ParseBackendRoutePath("/plugins/plugin-alpha/watch-code/enabled"); ok {
		t.Fatal("expected removed Watch Code enabled route to be rejected")
	}

	for _, setting := range watchcodecontracts.BackendUISettings() {
		writeHandlerID := setting.WriteHandlerID
		registration := plugins.PluginRegisteredUISetting{
			PluginID:       pluginID,
			LocalSettingID: setting.LocalSettingID,
			ReadHandlerID:  setting.ReadHandlerID,
			WriteHandlerID: &writeHandlerID,
		}
		if !watchCodeBackendUISettingRegistration(registration) {
			t.Fatalf("expected Watch Code UI setting registration %#v to match shared contract", registration)
		}
		if !watchcodecontracts.IsBackendReadHandlerID(setting.ReadHandlerID) {
			t.Fatalf("expected read handler %q to match shared contract", setting.ReadHandlerID)
		}
		if !watchcodecontracts.IsBackendWriteHandlerID(setting.WriteHandlerID) {
			t.Fatalf("expected write handler %q to match shared contract", setting.WriteHandlerID)
		}
	}
}

func TestWatchCodeBackendRouteInterceptorDeclinesUnownedRoutes(t *testing.T) {
	t.Parallel()

	capabilities := newWatchCodeCapabilityState()
	capabilities.Set(plugins.PluginWatchCodeCapabilities{
		PluginID:      "setta-watch-code",
		PluginEnabled: true,
		Python:        true,
	})
	host := newWatchCodeBackendRouteHost(nil, capabilities, nil, "/workspace")

	for _, path := range []string{
		"/plugins/plugin-alpha/watch-code/inputs",
		"/plugins/plugin-alpha/nested/watch-code/inputs",
		watchcodecontracts.BackendRoutePath("setta-watch-code", watchcodecontracts.BackendRouteSuffixInputs),
	} {
		response, handled := host.preflight(plugins.BackendHTTPRequest{
			Method: http.MethodGet,
			Path:   path,
		})
		if handled {
			t.Fatalf("expected unowned route %s to fall through, got response %#v", path, response)
		}
	}
}

func TestWatchCodeBackendRouteInterceptorFailsClosedForUnavailableProviderCandidates(t *testing.T) {
	t.Parallel()

	const providerPluginID = "setta-watch-code"
	cases := map[string]plugins.PluginWatchCodeCapabilities{
		"pending restart": {
			ProviderSelection: &plugins.PluginWatchCodeProviderSelection{
				Status:                  plugins.PluginWatchCodeProviderSelectionStatusPendingRestart,
				PendingRestartPluginIDs: []string{providerPluginID},
			},
		},
		"provider conflict": {
			ProviderSelection: &plugins.PluginWatchCodeProviderSelection{
				Status:               plugins.PluginWatchCodeProviderSelectionStatusConflict,
				ActivePluginIDs:      []string{providerPluginID, "other-watch-code"},
				ConflictingPluginIDs: []string{providerPluginID, "other-watch-code"},
			},
		},
		"disabled provider": {
			ProviderSelection: &plugins.PluginWatchCodeProviderSelection{
				Status:            plugins.PluginWatchCodeProviderSelectionStatusDisabledProvider,
				DisabledPluginIDs: []string{providerPluginID},
			},
		},
		"invalid provider": {
			ProviderSelection: &plugins.PluginWatchCodeProviderSelection{
				Status:           plugins.PluginWatchCodeProviderSelectionStatusInvalidProvider,
				InvalidPluginIDs: []string{providerPluginID},
			},
		},
	}

	for name, capabilitiesPayload := range cases {
		name := name
		capabilitiesPayload := capabilitiesPayload
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			capabilities := newWatchCodeCapabilityState()
			capabilities.Set(capabilitiesPayload)
			host := newWatchCodeBackendRouteHost(nil, capabilities, nil, "/workspace")

			response, handled := host.preflight(plugins.BackendHTTPRequest{
				Method: http.MethodPost,
				Path:   watchcodecontracts.BackendRoutePath(providerPluginID, watchcodecontracts.BackendRouteSuffixInputs),
				Body:   []byte(`{"projectConfigId":"project-alpha","folders":[],"files":[]}`),
			})
			if !handled {
				t.Fatal("expected Watch Code provider candidate route to be handled by Go host")
			}
			if response.StatusCode != http.StatusConflict {
				t.Fatalf("expected fail-closed 409 response, got %#v", response)
			}
			var payload struct {
				Error struct {
					Code string `json:"code"`
				} `json:"error"`
			}
			if err := json.Unmarshal(response.Body, &payload); err != nil {
				t.Fatalf("decode fail-closed response: %v", err)
			}
			if payload.Error.Code != watchcodecontracts.BackendErrorProviderRequired {
				t.Fatalf("expected provider-required error, got %#v", payload.Error)
			}
		})
	}
}

func TestWatchCodeBackendUISettingsFilterModeBlockedProviderCandidate(t *testing.T) {
	t.Parallel()

	const providerPluginID = "setta-watch-code"
	watchCodeSettings := make([]plugins.PluginRegisteredUISetting, 0)
	for _, setting := range watchcodecontracts.BackendUISettings() {
		writeHandlerID := setting.WriteHandlerID
		watchCodeSettings = append(watchCodeSettings, plugins.PluginRegisteredUISetting{
			PluginID:       providerPluginID,
			LocalSettingID: setting.LocalSettingID,
			ReadHandlerID:  setting.ReadHandlerID,
			WriteHandlerID: &writeHandlerID,
		})
	}
	nonWatchCodeSetting := plugins.PluginRegisteredUISetting{
		PluginID:       providerPluginID,
		LocalSettingID: "label",
		ReadHandlerID:  "read_label",
	}
	snapshot := plugins.DiscoverySnapshot{
		Plugins: []plugins.DiscoveredPlugin{
			{
				PluginID: providerPluginID,
				State:    plugins.PluginRuntimeStateActive,
				Manifest: &plugins.PluginManifest{
					FeatureCapabilities: &plugins.PluginFeatureCapabilitiesManifest{
						WatchCode: &plugins.PluginWatchCodeFeatureManifest{
							CanvasControlsUI: true,
						},
					},
				},
				BlockedCapabilities: []plugins.PluginBlockedCapability{
					{
						Capability: "registerWatchCodeBackend",
						Reason:     plugins.PluginBlockedCapabilityReasonModePolicy,
					},
				},
			},
		},
	}

	registrations := append(watchCodeSettings, nonWatchCodeSetting)
	filtered := filterUnavailableWatchCodeBackendUISettings(
		snapshot,
		providerPluginID,
		registrations,
	)
	if len(filtered) != 1 || filtered[0].LocalSettingID != nonWatchCodeSetting.LocalSettingID {
		t.Fatalf("expected only non-Watch Code setting to remain, got %#v", filtered)
	}
	if !watchCodeBackendUISettingCandidate(snapshot, providerPluginID, watchCodeSettings[0].ReadHandlerID) {
		t.Fatal("expected mode-blocked Watch Code provider to remain an unavailable UI-setting candidate")
	}
}
