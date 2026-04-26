package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/uisettings"
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
	if _, _, ok := watchcodecontracts.ParseBackendRoutePath("/plugins/plugin-alpha/nested/watch-code/enabled"); ok {
		t.Fatal("expected nested non-contract Watch Code-looking route to be rejected")
	}
	if gotPluginID, gotSuffix, ok := watchcodecontracts.ParseBackendRoutePath("/plugins/plugin-alpha/watch-code/enabled"); !ok || gotPluginID != "plugin-alpha" || gotSuffix != watchcodecontracts.BackendRouteSuffixEnabled {
		t.Fatalf("expected exact Watch Code route to parse, got plugin=%q suffix=%q ok=%v", gotPluginID, gotSuffix, ok)
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
		"/plugins/plugin-alpha/watch-code/enabled",
		"/plugins/plugin-alpha/nested/watch-code/enabled",
	} {
		response, handled, err := host.intercept(context.Background(), plugins.BackendHTTPRequest{
			Method: http.MethodGet,
			Path:   path,
		})
		if err != nil {
			t.Fatalf("intercept %s: %v", path, err)
		}
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

			response, handled, err := host.intercept(context.Background(), plugins.BackendHTTPRequest{
				Method: http.MethodPost,
				Path:   watchcodecontracts.BackendRoutePath(providerPluginID, watchcodecontracts.BackendRouteSuffixEnabled),
				Body:   []byte(`{"projectConfigId":"project-alpha","enabled":true}`),
			})
			if err != nil {
				t.Fatalf("intercept unavailable provider route: %v", err)
			}
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

func TestWatchCodeBackendUISettingRejectsMissingProjectWithoutNoOpSuccess(t *testing.T) {
	t.Parallel()

	const providerPluginID = "setta-watch-code"
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})

	capabilities := newWatchCodeCapabilityState()
	capabilities.Set(plugins.PluginWatchCodeCapabilities{
		PluginID:      providerPluginID,
		PluginEnabled: true,
		Python:        true,
	})
	host := newWatchCodeBackendRouteHost(projectRuntime, capabilities, nil, t.TempDir())

	_, handled, err := host.readUISettingValue(plugins.BackendUISettingReadOptions{
		PluginID:        providerPluginID,
		HandlerID:       watchcodecontracts.BackendReadHandlerIDEnabled,
		ProjectConfigID: "missing-project",
	})
	if !handled {
		t.Fatal("expected Watch Code read handler to handle active provider setting")
	}
	if !errors.Is(err, projectstate.ErrProjectNotFound) {
		t.Fatalf("expected missing project read to return ErrProjectNotFound, got %v", err)
	}

	registry, err := uisettings.NewScopedRegistry(uisettings.ScopedRegistryOptions{
		Runtime:       projectRuntime,
		WorkspaceRoot: t.TempDir(),
		PluginService: watchCodeBackendUISettingHostTestService{
			host:     host,
			pluginID: providerPluginID,
		},
	})
	if err != nil {
		t.Fatalf("new ui settings registry: %v", err)
	}
	initialRevision := projectRuntime.Snapshot().Revision
	_, err = registry.WriteValue(
		context.Background(),
		"missing-project",
		"plugin::"+providerPluginID+"::enabled",
		false,
		nil,
	)
	var settingErr *uisettings.SettingError
	if !errors.As(err, &settingErr) {
		t.Fatalf("expected missing project write to return SettingError, got %v", err)
	}
	if settingErr.Code != uisettings.ErrorCodeMutationFailed {
		t.Fatalf("expected mutation_failed, got %q from %v", settingErr.Code, settingErr)
	}
	if revision := projectRuntime.Snapshot().Revision; revision != initialRevision {
		t.Fatalf("expected failed missing project write to leave revision %d unchanged, got %d", initialRevision, revision)
	}
}

type watchCodeBackendUISettingHostTestService struct {
	host     *watchCodeBackendRouteHost
	pluginID string
}

func (s watchCodeBackendUISettingHostTestService) Runtime(plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error) {
	capabilities := []string{"registerUISettings"}
	return plugins.PluginRuntimeResponse{
		List: plugins.PluginListResponse{
			Plugins: []plugins.PluginListEntry{
				{
					PluginID:              s.pluginID,
					EffectiveCapabilities: capabilities,
				},
			},
		},
		Status: plugins.PluginStatusResponse{
			Plugins: []plugins.PluginStatusEntry{
				{
					PluginID:              s.pluginID,
					State:                 plugins.PluginRuntimeStateActive,
					EffectiveCapabilities: capabilities,
				},
			},
		},
	}, nil
}

func (s watchCodeBackendUISettingHostTestService) WriteConfig(context.Context, plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error) {
	return plugins.PluginConfigWriteResponse{}, nil
}

func (s watchCodeBackendUISettingHostTestService) GetBackendUISettings(pluginID string) ([]plugins.PluginRegisteredUISetting, error) {
	if pluginID != s.pluginID {
		return nil, nil
	}
	writeHandlerID := watchcodecontracts.BackendWriteHandlerIDEnabled
	return []plugins.PluginRegisteredUISetting{
		{
			PluginID:       s.pluginID,
			LocalSettingID: watchcodecontracts.BackendLocalSettingIDEnabled,
			Title:          "Watch Code Enabled",
			Mutability:     string(uisettings.MutabilityWritable),
			ValueSchema: map[string]any{
				"type": "boolean",
			},
			ReadHandlerID:  watchcodecontracts.BackendReadHandlerIDEnabled,
			WriteHandlerID: &writeHandlerID,
		},
	}, nil
}

func (s watchCodeBackendUISettingHostTestService) ReadBackendUISettingValue(_ context.Context, options plugins.BackendUISettingReadOptions) (any, error) {
	value, handled, err := s.host.readUISettingValue(options)
	if handled || err != nil {
		return value, err
	}
	return nil, projectstate.ErrWatchCodeProviderPluginIDRequired
}

func (s watchCodeBackendUISettingHostTestService) WriteBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingWriteOptions) error {
	handled, err := s.host.writeUISettingValue(ctx, options)
	if handled || err != nil {
		return err
	}
	return projectstate.ErrWatchCodeProviderPluginIDRequired
}
