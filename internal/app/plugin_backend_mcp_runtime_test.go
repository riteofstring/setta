package app

import (
	"context"
	"slices"
	"strings"
	"testing"

	"setta/internal/mcpx"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/testutil/appsubsystemprovider"
)

func TestPluginBackendMCPServersConnected(t *testing.T) {
	toolError := "boom"
	serverIDs := map[string]struct{}{
		"alpha": {},
		"beta":  {},
	}

	tests := []struct {
		name     string
		statuses []mcpx.ServerRuntimeStatus
		want     bool
		wantErr  string
	}{
		{
			name: "all connected",
			statuses: []mcpx.ServerRuntimeStatus{
				{ServerID: "alpha", State: mcpx.RuntimeStateConnected},
				{ServerID: "beta", State: mcpx.RuntimeStateConnected},
			},
			want: true,
		},
		{
			name: "missing server stays pending",
			statuses: []mcpx.ServerRuntimeStatus{
				{ServerID: "alpha", State: mcpx.RuntimeStateConnected},
			},
		},
		{
			name: "non-connected state stays pending",
			statuses: []mcpx.ServerRuntimeStatus{
				{ServerID: "alpha", State: mcpx.RuntimeStateConnected},
				{ServerID: "beta", State: mcpx.RuntimeStateConnecting},
			},
		},
		{
			name: "error surfaces runtime message",
			statuses: []mcpx.ServerRuntimeStatus{
				{ServerID: "alpha", State: mcpx.RuntimeStateConnected},
				{ServerID: "beta", State: mcpx.RuntimeStateError, LastError: &toolError},
			},
			wantErr: "plugin backend MCP runtime failed for beta: boom",
		},
		{
			name: "error without runtime message keeps fallback text",
			statuses: []mcpx.ServerRuntimeStatus{
				{ServerID: "alpha", State: mcpx.RuntimeStateConnected},
				{ServerID: "beta", State: mcpx.RuntimeStateError, LastError: testStringPtr("   ")},
			},
			wantErr: "plugin backend MCP runtime failed for beta",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			connected, err := pluginBackendMCPServersConnected(tt.statuses, serverIDs)
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("expected error %q, got nil", tt.wantErr)
				}
				if err.Error() != tt.wantErr {
					t.Fatalf("expected error %q, got %q", tt.wantErr, err.Error())
				}
				return
			}
			if err != nil {
				t.Fatalf("pluginBackendMCPServersConnected returned error: %v", err)
			}
			if connected != tt.want {
				t.Fatalf("expected connected=%t, got %t", tt.want, connected)
			}
		})
	}
}

func TestPluginBackendMCPRuntimeErrorTrimsMessage(t *testing.T) {
	err := pluginBackendMCPRuntimeError("alpha", testStringPtr("  failed to launch  "))
	if err == nil {
		t.Fatal("expected runtime error")
	}
	if !strings.Contains(err.Error(), "failed to launch") {
		t.Fatalf("expected trimmed runtime message, got %q", err.Error())
	}
}

func TestNewPluginBackendMCPRuntimeIncludesUnknownProviderTools(t *testing.T) {
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open overlay project runtime: %v", err)
	}
	defer func() {
		if closeErr := projectRuntime.Close(); closeErr != nil {
			t.Fatalf("close overlay project runtime: %v", closeErr)
		}
	}()

	runtime, err := newPluginBackendMCPRuntime(context.Background(), pluginBackendMCPRuntimeOptions{
		RuntimeRoot:    t.TempDir(),
		Snapshot:       appSubsystemDiscoverySnapshotForTest(appsubsystemprovider.PluginID),
		ProjectRuntime: projectRuntime,
	})
	if err != nil {
		t.Fatalf("newPluginBackendMCPRuntime returned error: %v", err)
	}
	defer func() {
		if closeErr := runtime.Close(context.Background()); closeErr != nil {
			t.Fatalf("close plugin backend MCP runtime: %v", closeErr)
		}
	}()

	if runtime.client != nil {
		t.Fatal("expected no external plugin backend client for app-subsystem-only snapshot")
	}
	for _, want := range []string{
		"get_app_catalog",
		"list_app_components",
		"get_app_definition",
		"validate_app_definition",
		"set_app_definition",
		"stream_app_definition",
		"update_app_definition",
	} {
		if !slices.Contains(runtime.toolNames, want) {
			t.Fatalf("expected tool %q in runtime toolNames %v", want, runtime.toolNames)
		}
	}
}

func TestNewPluginBackendMCPRuntimeSkipsUnregisteredProvider(t *testing.T) {
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open overlay project runtime: %v", err)
	}
	defer func() {
		if closeErr := projectRuntime.Close(); closeErr != nil {
			t.Fatalf("close overlay project runtime: %v", closeErr)
		}
	}()

	runtime, err := newPluginBackendMCPRuntime(context.Background(), pluginBackendMCPRuntimeOptions{
		RuntimeRoot:    t.TempDir(),
		Snapshot:       appSubsystemDiscoverySnapshotForTest("setta-unregistered-app-provider"),
		ProjectRuntime: projectRuntime,
	})
	if err != nil {
		t.Fatalf("new plugin backend MCP runtime: %v", err)
	}
	for _, toolName := range runtime.toolNames {
		if strings.Contains(toolName, "app") {
			t.Fatalf("expected unregistered provider app tools to stay unavailable, got %#v", runtime.toolNames)
		}
	}
}

func TestNewPluginBackendMCPRuntimeSkipsMixedRegisteredAndUnregisteredProviders(
	t *testing.T,
) {
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open overlay project runtime: %v", err)
	}
	defer func() {
		if closeErr := projectRuntime.Close(); closeErr != nil {
			t.Fatalf("close overlay project runtime: %v", closeErr)
		}
	}()

	runtime, err := newPluginBackendMCPRuntime(context.Background(), pluginBackendMCPRuntimeOptions{
		RuntimeRoot: t.TempDir(),
		Snapshot: plugins.DiscoverySnapshot{
			Plugins: []plugins.DiscoveredPlugin{
				{
					PluginID: appsubsystemprovider.PluginID,
					State:    plugins.PluginRuntimeStateActive,
					Manifest: &plugins.PluginManifest{
						ID: appsubsystemprovider.PluginID,
						FeatureCapabilities: &plugins.PluginFeatureCapabilitiesManifest{
							AppSubsystem: &plugins.PluginAppSubsystemFeatureManifest{
								AppGenerationChatModes: true,
							},
						},
					},
				},
				{
					PluginID: "setta-unregistered-app-provider",
					State:    plugins.PluginRuntimeStateActive,
					Manifest: &plugins.PluginManifest{
						ID: "setta-unregistered-app-provider",
						FeatureCapabilities: &plugins.PluginFeatureCapabilitiesManifest{
							AppSubsystem: &plugins.PluginAppSubsystemFeatureManifest{
								AppGenerationChatModes: true,
							},
						},
					},
				},
			},
		},
		ProjectRuntime: projectRuntime,
	})
	if err != nil {
		t.Fatalf("new plugin backend MCP runtime: %v", err)
	}
	for _, toolName := range runtime.toolNames {
		if strings.Contains(toolName, "app") {
			t.Fatalf("expected mixed registered and unregistered providers to skip app tools, got %#v", runtime.toolNames)
		}
	}
}

func TestNewPluginBackendMCPRuntimeSkipsAppSubsystemToolsWithoutChatModes(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open overlay project runtime: %v", err)
	}
	defer func() {
		if closeErr := projectRuntime.Close(); closeErr != nil {
			t.Fatalf("close overlay project runtime: %v", closeErr)
		}
	}()

	runtime, err := newPluginBackendMCPRuntime(context.Background(), pluginBackendMCPRuntimeOptions{
		RuntimeRoot: t.TempDir(),
		Snapshot: plugins.DiscoverySnapshot{
			Plugins: []plugins.DiscoveredPlugin{
				{
					PluginID: appsubsystemprovider.PluginID,
					State:    plugins.PluginRuntimeStateActive,
					Manifest: &plugins.PluginManifest{
						ID: appsubsystemprovider.PluginID,
						FeatureCapabilities: &plugins.PluginFeatureCapabilitiesManifest{
							AppSubsystem: &plugins.PluginAppSubsystemFeatureManifest{
								AppPreviewUI: true,
							},
						},
					},
				},
			},
		},
		ProjectRuntime: projectRuntime,
	})
	if err != nil {
		t.Fatalf("new plugin backend MCP runtime: %v", err)
	}
	defer func() {
		if closeErr := runtime.Close(context.Background()); closeErr != nil {
			t.Fatalf("close plugin backend MCP runtime: %v", closeErr)
		}
	}()

	for _, toolName := range runtime.toolNames {
		if strings.Contains(toolName, "app") {
			t.Fatalf("expected preview-only provider to skip app MCP tools, got %#v", runtime.toolNames)
		}
	}
}

func testStringPtr(value string) *string {
	return &value
}

func appSubsystemDiscoverySnapshotForTest(pluginID string) plugins.DiscoverySnapshot {
	return plugins.DiscoverySnapshot{
		Plugins: []plugins.DiscoveredPlugin{
			{
				PluginID: pluginID,
				State:    plugins.PluginRuntimeStateActive,
				Manifest: &plugins.PluginManifest{
					ID: pluginID,
					FeatureCapabilities: &plugins.PluginFeatureCapabilitiesManifest{
						AppSubsystem: &plugins.PluginAppSubsystemFeatureManifest{
							AppGenerationChatModes: true,
						},
					},
				},
			},
		},
	}
}
