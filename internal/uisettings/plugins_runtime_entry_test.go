package uisettings

import (
	"context"
	"errors"
	"strings"
	"testing"

	"setta/internal/plugins"
)

type testPluginRuntimeService struct {
	runtimeResponse   plugins.PluginRuntimeResponse
	writeConfigCalls  int
	backendUISettings []plugins.PluginRegisteredUISetting
	backendReadValue  any
	backendWriteCalls int
}

func (s *testPluginRuntimeService) Runtime(plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error) {
	return s.runtimeResponse, nil
}

func (s *testPluginRuntimeService) WriteConfig(_ context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error) {
	s.writeConfigCalls++
	if len(s.runtimeResponse.List.Plugins) > 0 {
		s.runtimeResponse.List.Plugins[0].Config.CurrentConfig = cloneStringAnyMap(options.Config)
	}
	return plugins.PluginConfigWriteResponse{
		PluginID: options.PluginID,
		Config:   cloneStringAnyMap(options.Config),
		Validation: plugins.PluginConfigValidationResult{
			OK: true,
		},
	}, nil
}

func (s *testPluginRuntimeService) GetBackendUISettings(string) ([]plugins.PluginRegisteredUISetting, error) {
	return append([]plugins.PluginRegisteredUISetting(nil), s.backendUISettings...), nil
}

func (s *testPluginRuntimeService) ReadBackendUISettingValue(_ context.Context, _ plugins.BackendUISettingReadOptions) (any, error) {
	return cloneJSONValue(s.backendReadValue), nil
}

func (s *testPluginRuntimeService) WriteBackendUISettingValue(_ context.Context, options plugins.BackendUISettingWriteOptions) error {
	s.backendWriteCalls++
	s.backendReadValue = cloneJSONValue(options.Value)
	return nil
}

func newActivePluginRuntimeResponse(config map[string]any) plugins.PluginRuntimeResponse {
	return plugins.PluginRuntimeResponse{
		List: plugins.PluginListResponse{
			Plugins: []plugins.PluginListEntry{
				{
					PluginID: "plugin-a",
					Config: plugins.PluginConfigDescriptor{
						CurrentConfig: cloneStringAnyMap(config),
					},
					EffectiveCapabilities: []string{pluginRegisterPaneCapability},
				},
			},
		},
		Status: plugins.PluginStatusResponse{
			Plugins: []plugins.PluginStatusEntry{
				{
					PluginID:              "plugin-a",
					State:                 plugins.PluginRuntimeStateActive,
					EffectiveCapabilities: []string{pluginRegisterPaneCapability},
				},
			},
		},
	}
}

func newSchemaBackedRuntimeEntry(service PluginRuntimeService) RuntimeEntry {
	return buildPluginRuntimeEntry(service, "plugin-a", pluginUISettingDefinition{
		LocalSettingID: "public_name",
		Title:          "Public Name",
		Description:    "Test setting",
		PaneID:         "plugin-pane",
		RevealKey:      "public-name",
		ConfigPath:     []string{"settings", "enabled"},
		Mutability:     MutabilityWritable,
		ValueSchema: ValueSchema{
			Type: ValueTypeBoolean,
		},
		DefaultValue: false,
	})
}

func newBackendRegisteredRuntimeEntry(service PluginRuntimeService) RuntimeEntry {
	writeHandlerID := "write-enabled"
	return buildPluginBackendRuntimeEntry(service, plugins.PluginRegisteredUISetting{
		LocalSettingID: "public_name",
		PluginID:       "plugin-a",
		Title:          "Public Name",
		Description:    "Test setting",
		PaneID:         "plugin-pane",
		RevealKey:      "public-name",
		Mutability:     string(MutabilityWritable),
		ValueSchema: map[string]any{
			"type": "boolean",
		},
		ReadHandlerID:  "read-enabled",
		WriteHandlerID: &writeHandlerID,
	})
}

func newBackendUISettingsOnlyRuntimeResponse() plugins.PluginRuntimeResponse {
	return plugins.PluginRuntimeResponse{
		List: plugins.PluginListResponse{
			Plugins: []plugins.PluginListEntry{
				{
					PluginID:              "plugin-a",
					EffectiveCapabilities: []string{pluginRegisterUISettingsCapability},
				},
			},
		},
		Status: plugins.PluginStatusResponse{
			Plugins: []plugins.PluginStatusEntry{
				{
					PluginID:              "plugin-a",
					State:                 plugins.PluginRuntimeStateActive,
					EffectiveCapabilities: []string{pluginRegisterUISettingsCapability},
				},
			},
		},
	}
}

func requireSettingError(t *testing.T, err error) *SettingError {
	t.Helper()
	var settingErr *SettingError
	if !errors.As(err, &settingErr) {
		t.Fatalf("expected SettingError, got %T (%v)", err, err)
	}
	return settingErr
}

func TestReadPluginConfigPathValueReturnsDefaultForMissingLeaf(t *testing.T) {
	t.Parallel()

	value, err := readPluginConfigPathValue(
		map[string]any{
			"settings": map[string]any{},
		},
		[]string{"settings", "enabled"},
		false,
		"plugin-a",
	)
	if err != nil {
		t.Fatalf("read missing leaf: %v", err)
	}
	if value != false {
		t.Fatalf("expected default false for missing leaf, got %#v", value)
	}
}

func TestReadPluginConfigPathValueRejectsNonObjectIntermediateNode(t *testing.T) {
	t.Parallel()

	_, err := readPluginConfigPathValue(
		map[string]any{
			"settings": "invalid",
		},
		[]string{"settings", "enabled"},
		false,
		"plugin-a",
	)
	settingErr := requireSettingError(t, err)
	if settingErr.Code != ErrorCodeMutationFailed {
		t.Fatalf("expected mutation_failed, got %q", settingErr.Code)
	}
	if !strings.Contains(settingErr.Message, "non-object node at settings") {
		t.Fatalf("expected non-object intermediate message, got %q", settingErr.Message)
	}
}

func TestNewScopedRegistryIncludesBackendRegisteredSettingWithRegisterUISettingsOnly(t *testing.T) {
	t.Parallel()

	writeHandlerID := "write-enabled"
	service := &testPluginRuntimeService{
		runtimeResponse:  newBackendUISettingsOnlyRuntimeResponse(),
		backendReadValue: false,
		backendUISettings: []plugins.PluginRegisteredUISetting{
			{
				PluginID:       "plugin-a",
				LocalSettingID: "enabled",
				Title:          "Backend Enabled",
				Description:    "Backend-provided setting.",
				PaneID:         "settings",
				RevealKey:      "enabled",
				Mutability:     string(MutabilityWritable),
				ValueSchema: map[string]any{
					"type": "boolean",
				},
				ReadHandlerID:  "read-enabled",
				WriteHandlerID: &writeHandlerID,
			},
		},
	}
	registry, err := NewScopedRegistry(ScopedRegistryOptions{
		Runtime:       openCoreRegistryRuntime(t),
		WorkspaceRoot: t.TempDir(),
		PluginService: service,
	})
	if err != nil {
		t.Fatalf("new scoped registry: %v", err)
	}

	settingID := "plugin::plugin-a::enabled"
	if !registry.HasKnownPluginSetting("plugin-a", "enabled") {
		t.Fatalf("expected backend-registered setting %s to be known", settingID)
	}
	entry, ok, err := registry.Get(settingID)
	if err != nil {
		t.Fatalf("get backend-registered setting: %v", err)
	}
	if !ok {
		t.Fatalf("expected backend-registered setting %s", settingID)
	}
	if entry.Metadata.Title != "Backend Enabled" {
		t.Fatalf("expected backend title, got %#v", entry.Metadata.Title)
	}
	value, err := registry.ReadValue(context.Background(), "project-alpha", settingID)
	if err != nil {
		t.Fatalf("read backend-registered setting: %v", err)
	}
	if value != false {
		t.Fatalf("expected backend value false, got %#v", value)
	}
}

func TestNewScopedRegistryOmitsSchemaDefinedSettingWithoutRegisterPane(t *testing.T) {
	t.Parallel()

	service := &testPluginRuntimeService{
		runtimeResponse: newBackendUISettingsOnlyRuntimeResponse(),
	}
	service.runtimeResponse.List.Plugins[0].Config = plugins.PluginConfigDescriptor{
		SchemaJSON: map[string]any{
			pluginUISettingsSchemaKey: []any{
				map[string]any{
					"settingId":    "theme_mode",
					"title":        "Theme mode",
					"description":  "Controls the plugin theme.",
					"paneId":       "appearance",
					"revealKey":    "theme-mode",
					"configPath":   []any{"appearance", "themeMode"},
					"valueSchema":  map[string]any{"type": string(ValueTypeString)},
					"defaultValue": "auto",
				},
			},
		},
	}

	registry, err := NewScopedRegistry(ScopedRegistryOptions{
		Runtime:       openCoreRegistryRuntime(t),
		WorkspaceRoot: t.TempDir(),
		PluginService: service,
	})
	if err != nil {
		t.Fatalf("new scoped registry: %v", err)
	}
	if registry.HasKnownPluginSetting("plugin-a", "theme_mode") {
		t.Fatal("expected schema-defined setting to require registerPane")
	}
	_, ok, err := registry.Get("plugin::plugin-a::theme_mode")
	if err != nil || ok {
		t.Fatalf("expected schema-defined setting to be absent without registerPane, ok=%v err=%v", ok, err)
	}
}

func TestBuildPluginRuntimeEntryRejectsInvalidExistingValueBeforeWrite(t *testing.T) {
	t.Parallel()

	service := &testPluginRuntimeService{
		runtimeResponse: newActivePluginRuntimeResponse(map[string]any{
			"settings": map[string]any{
				"enabled": "invalid-old-value",
			},
		}),
	}
	entry := newSchemaBackedRuntimeEntry(service)

	_, err := entry.WriteValue(context.Background(), "project-1", true, nil)
	settingErr := requireSettingError(t, err)
	if settingErr.Code != ErrorCodeInvalidValueType {
		t.Fatalf("expected invalid_value_type, got %q", settingErr.Code)
	}
	if service.writeConfigCalls != 0 {
		t.Fatalf("expected no config writes, got %d", service.writeConfigCalls)
	}
	settingsValue, ok := service.runtimeResponse.List.Plugins[0].Config.CurrentConfig["settings"].(map[string]any)
	if !ok {
		t.Fatalf("expected nested settings object to remain intact, got %#v", service.runtimeResponse.List.Plugins[0].Config.CurrentConfig["settings"])
	}
	if settingsValue["enabled"] != "invalid-old-value" {
		t.Fatalf("expected invalid existing value to remain unchanged, got %#v", settingsValue["enabled"])
	}
}

func TestBuildPluginRuntimeEntryRejectsNonObjectIntermediatePathWithoutMutation(t *testing.T) {
	t.Parallel()

	service := &testPluginRuntimeService{
		runtimeResponse: newActivePluginRuntimeResponse(map[string]any{
			"settings": "invalid-node",
		}),
	}
	entry := newSchemaBackedRuntimeEntry(service)

	_, err := entry.WriteValue(context.Background(), "project-1", true, nil)
	settingErr := requireSettingError(t, err)
	if settingErr.Code != ErrorCodeMutationFailed {
		t.Fatalf("expected mutation_failed, got %q", settingErr.Code)
	}
	if !strings.Contains(settingErr.Message, "non-object node at settings") {
		t.Fatalf("expected non-object intermediate message, got %q", settingErr.Message)
	}
	if service.writeConfigCalls != 0 {
		t.Fatalf("expected no config writes, got %d", service.writeConfigCalls)
	}
	if got := service.runtimeResponse.List.Plugins[0].Config.CurrentConfig["settings"]; got != "invalid-node" {
		t.Fatalf("expected invalid intermediate node to remain unchanged, got %#v", got)
	}
}

func TestBuildPluginRuntimeEntryStalePreconditionUsesCanonicalSettingID(t *testing.T) {
	t.Parallel()

	service := &testPluginRuntimeService{
		runtimeResponse: newActivePluginRuntimeResponse(map[string]any{
			"settings": map[string]any{
				"enabled": true,
			},
		}),
	}
	entry := newSchemaBackedRuntimeEntry(service)

	_, err := entry.WriteValue(context.Background(), "project-1", false, false)
	settingErr := requireSettingError(t, err)
	if settingErr.Code != ErrorCodeMutationFailed {
		t.Fatalf("expected mutation_failed, got %q", settingErr.Code)
	}
	if !strings.Contains(settingErr.Message, "plugin::plugin-a::public_name changed since pre-write validation") {
		t.Fatalf("expected canonical setting id in stale-precondition message, got %q", settingErr.Message)
	}
	if strings.Contains(settingErr.Message, "enabled changed since pre-write validation") {
		t.Fatalf("expected canonical setting id rather than config-path leaf in message, got %q", settingErr.Message)
	}
	if service.writeConfigCalls != 0 {
		t.Fatalf("expected no config writes, got %d", service.writeConfigCalls)
	}
}

func TestBuildPluginBackendRuntimeEntryRejectsInvalidExistingValueBeforeWrite(t *testing.T) {
	t.Parallel()

	service := &testPluginRuntimeService{
		runtimeResponse:  newActivePluginRuntimeResponse(map[string]any{}),
		backendReadValue: "invalid-old-value",
	}
	entry := newBackendRegisteredRuntimeEntry(service)

	_, err := entry.WriteValue(context.Background(), "project-1", true, nil)
	settingErr := requireSettingError(t, err)
	if settingErr.Code != ErrorCodeInvalidValueType {
		t.Fatalf("expected invalid_value_type, got %q", settingErr.Code)
	}
	if !strings.Contains(settingErr.Message, "plugin::plugin-a::public_name") {
		t.Fatalf("expected canonical setting id in invalid pre-write message, got %q", settingErr.Message)
	}
	if !strings.Contains(settingErr.Message, "returned an invalid value during pre-write validation") {
		t.Fatalf("expected invalid pre-write old-value message, got %q", settingErr.Message)
	}
	if service.backendWriteCalls != 0 {
		t.Fatalf("expected no backend writes, got %d", service.backendWriteCalls)
	}
	if service.backendReadValue != "invalid-old-value" {
		t.Fatalf("expected invalid existing backend value to remain unchanged, got %#v", service.backendReadValue)
	}
}

func TestBuildPluginBackendRuntimeEntryStalePreconditionUsesCanonicalSettingID(t *testing.T) {
	t.Parallel()

	service := &testPluginRuntimeService{
		runtimeResponse:  newActivePluginRuntimeResponse(map[string]any{}),
		backendReadValue: true,
	}
	entry := newBackendRegisteredRuntimeEntry(service)

	_, err := entry.WriteValue(context.Background(), "project-1", false, false)
	settingErr := requireSettingError(t, err)
	if settingErr.Code != ErrorCodeMutationFailed {
		t.Fatalf("expected mutation_failed, got %q", settingErr.Code)
	}
	if !strings.Contains(settingErr.Message, "plugin::plugin-a::public_name changed since pre-write validation") {
		t.Fatalf("expected canonical setting id in stale-precondition message, got %q", settingErr.Message)
	}
	if strings.Contains(settingErr.Message, "read-enabled changed since pre-write validation") {
		t.Fatalf("expected canonical setting id rather than handler id in message, got %q", settingErr.Message)
	}
	if service.backendWriteCalls != 0 {
		t.Fatalf("expected no backend writes, got %d", service.backendWriteCalls)
	}
}
