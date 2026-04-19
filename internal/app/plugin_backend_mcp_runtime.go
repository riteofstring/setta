package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"setta/internal/appsubsystem"
	"setta/internal/mcpx"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/tools"
)

const pluginBackendBuildRootName = "plugin_backend_builds"

type pluginBackendMCPRuntime struct {
	client        *mcpx.Client
	serverIDs     map[string]struct{}
	registrations []mcpx.ToolRegistration
	toolNames     []string
}

func clonePluginBackendLaunchEnv(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	cloned := make(map[string]string, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

type pluginBackendMCPRuntimeOptions struct {
	Logger         *slog.Logger
	RuntimeRoot    string
	Snapshot       plugins.DiscoverySnapshot
	ProjectRuntime *projectstate.Runtime
}

func newPluginBackendMCPRuntime(ctx context.Context, options pluginBackendMCPRuntimeOptions) (*pluginBackendMCPRuntime, error) {
	runtime := &pluginBackendMCPRuntime{
		serverIDs:     map[string]struct{}{},
		registrations: []mcpx.ToolRegistration{},
		toolNames:     []string{},
	}
	serverConfigs, err := runtime.buildServerConfigs(
		options.Snapshot,
		filepath.Join(strings.TrimSpace(options.RuntimeRoot), pluginBackendBuildRootName),
	)
	if err != nil {
		return nil, err
	}
	if len(serverConfigs) != 0 {
		client, registrations, toolNames, err := startPluginBackendMCPClient(
			pluginBackendMCPContext(ctx),
			options.Logger,
			serverConfigs,
			runtime.serverIDs,
		)
		if err != nil {
			return nil, err
		}
		runtime.client = client
		runtime.registrations = registrations
		runtime.toolNames = toolNames
	}
	if err := runtime.appendAppSubsystemTools(
		options.Snapshot,
		options.ProjectRuntime,
	); err != nil {
		return nil, err
	}
	return runtime, nil
}

func (r *pluginBackendMCPRuntime) appendAppSubsystemTools(
	snapshot plugins.DiscoverySnapshot,
	projectRuntime *projectstate.Runtime,
) error {
	if r == nil || projectRuntime == nil {
		return nil
	}
	capabilities := plugins.AppSubsystemCapabilitiesFromSnapshot(snapshot)
	if !appSubsystemMCPToolsEnabled(capabilities) {
		return nil
	}
	registrations, err := appsubsystem.BuildMCPToolRegistrations(
		capabilities,
		projectRuntime,
	)
	if err != nil {
		return err
	}
	if len(registrations) == 0 {
		return nil
	}
	mcpRegistrations := appSubsystemMCPToolRegistrations(registrations)
	r.registrations = append(r.registrations, mcpRegistrations...)
	r.toolNames = append(r.toolNames, toolNamesForRegistrations(mcpRegistrations)...)
	return nil
}

func appSubsystemMCPToolsEnabled(
	capabilities plugins.PluginAppSubsystemCapabilities,
) bool {
	return capabilities.PluginEnabled &&
		(capabilities.AppAuthoringUI ||
			capabilities.AppPreviewUI ||
			capabilities.AppGenerationChatModes)
}

func toolNamesForRegistrations(
	registrations []mcpx.ToolRegistration,
) []string {
	if len(registrations) == 0 {
		return nil
	}
	names := make([]string, 0, len(registrations))
	seen := map[string]struct{}{}
	for _, registration := range registrations {
		name := strings.TrimSpace(registration.Spec.Name)
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}
	return names
}

func appSubsystemMCPToolRegistrations(
	registrations []appsubsystem.MCPToolRegistration,
) []mcpx.ToolRegistration {
	if len(registrations) == 0 {
		return nil
	}
	converted := make([]mcpx.ToolRegistration, 0, len(registrations))
	for _, registration := range registrations {
		converted = append(converted, mcpx.ToolRegistration{
			Spec:         registration.Spec,
			InputSchema:  registration.InputSchema,
			OutputSchema: registration.OutputSchema,
		})
	}
	return converted
}

func (r *pluginBackendMCPRuntime) buildServerConfigs(
	snapshot plugins.DiscoverySnapshot,
	buildRoot string,
) (map[string]mcpx.ServerConfig, error) {
	serverConfigs := map[string]mcpx.ServerConfig{}
	for _, entry := range snapshot.Plugins {
		if !pluginBackendEntryRegistersTools(entry) {
			continue
		}

		launch, err := plugins.ResolvePluginBackendLaunch(entry.SourcePath, *entry.Manifest, buildRoot)
		if err != nil {
			return nil, err
		}
		serverID := pluginBackendMCPServerID(entry.PluginID)
		serverConfigs[serverID] = mcpx.ServerConfig{
			Transport: mcpx.TransportStdio,
			Command:   launch.Command,
			Args:      append([]string(nil), launch.Args...),
			Env:       clonePluginBackendLaunchEnv(launch.Environment),
			CWD:       entry.SourcePath,
		}
		r.serverIDs[serverID] = struct{}{}
	}
	return serverConfigs, nil
}

func startPluginBackendMCPClient(
	ctx context.Context,
	logger *slog.Logger,
	serverConfigs map[string]mcpx.ServerConfig,
	serverIDs map[string]struct{},
) (*mcpx.Client, []mcpx.ToolRegistration, []string, error) {
	client, err := mcpx.NewClient(mcpx.ClientOptions{
		Logger:            logger,
		Servers:           serverConfigs,
		RetryDelay:        50 * time.Millisecond,
		ReconnectWait:     250 * time.Millisecond,
		KeepAliveInterval: time.Second,
		HTTPConnectWait:   time.Second,
	})
	if err != nil {
		return nil, nil, nil, err
	}
	client.Start(ctx)
	waitCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	registrations, toolNames, err := initializePluginBackendMCPClient(waitCtx, client, serverIDs)
	if err != nil {
		_ = client.Close(context.Background())
		return nil, nil, nil, err
	}
	return client, registrations, toolNames, nil
}

func initializePluginBackendMCPClient(
	ctx context.Context,
	client *mcpx.Client,
	serverIDs map[string]struct{},
) ([]mcpx.ToolRegistration, []string, error) {
	if err := waitForPluginBackendMCPServers(ctx, client, serverIDs); err != nil {
		return nil, nil, err
	}

	descriptors := client.ToolDescriptorsForServers(serverIDs)
	registrations, toolNames, err := buildPluginBackendMCPRegistrations(client, descriptors)
	if err != nil {
		return nil, nil, err
	}
	return registrations, toolNames, nil
}

func pluginBackendMCPContext(ctx context.Context) context.Context {
	if ctx != nil {
		return ctx
	}
	return context.Background()
}

func pluginBackendEntryRegistersTools(entry plugins.DiscoveredPlugin) bool {
	if entry.State != plugins.PluginRuntimeStateActive || !entry.HasBackend() || entry.Manifest == nil {
		return false
	}
	return containsPluginCapability(entry.EffectiveCapabilities, "registerMcpTools")
}

func (r *pluginBackendMCPRuntime) Close(ctx context.Context) error {
	if r == nil || r.client == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return r.client.Close(ctx)
}

func waitForPluginBackendMCPServers(ctx context.Context, client *mcpx.Client, serverIDs map[string]struct{}) error {
	if len(serverIDs) == 0 || client == nil {
		return nil
	}

	ticker := time.NewTicker(25 * time.Millisecond)
	defer ticker.Stop()

	for {
		ready, err := pluginBackendMCPServersConnected(client.RuntimeStatuses(), serverIDs)
		if err != nil {
			return err
		}
		if ready {
			return nil
		}
		if err := waitForPluginBackendMCPPoll(ctx, ticker.C); err != nil {
			return err
		}
	}
}

func pluginBackendMCPServersConnected(statuses []mcpx.ServerRuntimeStatus, serverIDs map[string]struct{}) (bool, error) {
	statusesByID := indexPluginBackendRuntimeStatuses(statuses)
	for serverID := range serverIDs {
		connected, err := pluginBackendMCPServerConnected(statusesByID, serverID)
		if err != nil {
			return false, err
		}
		if !connected {
			return false, nil
		}
	}
	return true, nil
}

func pluginBackendMCPServerConnected(statusesByID map[string]mcpx.ServerRuntimeStatus, serverID string) (bool, error) {
	status, ok := statusesByID[serverID]
	if !ok {
		return false, nil
	}
	if status.State == mcpx.RuntimeStateConnected {
		return true, nil
	}
	if status.State == mcpx.RuntimeStateError {
		return false, pluginBackendMCPRuntimeError(serverID, status.LastError)
	}
	return false, nil
}

func pluginBackendMCPRuntimeError(serverID string, lastError *string) error {
	message := ""
	if lastError != nil {
		message = strings.TrimSpace(*lastError)
	}
	if message == "" {
		return fmt.Errorf("plugin backend MCP runtime failed for %s", serverID)
	}
	return fmt.Errorf("plugin backend MCP runtime failed for %s: %s", serverID, message)
}

func waitForPluginBackendMCPPoll(ctx context.Context, ticker <-chan time.Time) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-ticker:
		return nil
	}
}

func buildPluginBackendMCPRegistrations(client *mcpx.Client, descriptors map[string]mcpx.ToolDescriptor) ([]mcpx.ToolRegistration, []string, error) {
	namespacedNames := make([]string, 0, len(descriptors))
	for namespacedName := range descriptors {
		namespacedNames = append(namespacedNames, namespacedName)
	}
	sort.Strings(namespacedNames)

	registrations := make([]mcpx.ToolRegistration, 0, len(namespacedNames))
	toolNames := make([]string, 0, len(namespacedNames))
	seenNames := map[string]struct{}{}
	for _, namespacedName := range namespacedNames {
		descriptor := descriptors[namespacedName]
		toolName := strings.TrimSpace(descriptor.RemoteName)
		if toolName == "" {
			return nil, nil, fmt.Errorf("plugin backend MCP tool name is required")
		}
		if _, exists := seenNames[toolName]; exists {
			return nil, nil, fmt.Errorf("%w: %s", tools.ErrToolDuplicate, toolName)
		}
		seenNames[toolName] = struct{}{}

		namespacedToolName := namespacedName
		metadata := pluginBackendMCPToolMetadata(descriptor)
		registrations = append(registrations, mcpx.ToolRegistration{
			Spec: tools.Spec{
				Name:        toolName,
				Description: strings.TrimSpace(descriptor.Description),
				Metadata:    metadata,
				Handler: func(ctx context.Context, arguments map[string]any) (any, error) {
					result, err := client.CallTool(ctx, namespacedToolName, arguments)
					if err != nil {
						return nil, err
					}
					if result.IsError {
						return nil, pluginBackendMCPToolCallError(result)
					}
					if result.StructuredContent != nil {
						return result.StructuredContent, nil
					}
					return result.Text, nil
				},
			},
			InputSchema:  normalizePluginBackendToolSchema(descriptor.InputSchema),
			OutputSchema: normalizePluginBackendToolSchema(descriptor.OutputSchema),
		})
		toolNames = append(toolNames, toolName)
	}
	return registrations, toolNames, nil
}

func pluginBackendMCPToolMetadata(descriptor mcpx.ToolDescriptor) tools.Metadata {
	if descriptor.Metadata != nil {
		return *descriptor.Metadata
	}

	metadata := tools.Metadata{
		Kind: descriptor.Kind,
	}
	if descriptor.ReadOnly {
		metadata.AccessType = tools.AccessTypeRead
	} else {
		metadata.AccessType = tools.AccessTypeWrite
	}
	return metadata
}

func normalizePluginBackendToolSchema(schema any) map[string]any {
	if typed, ok := schema.(map[string]any); ok {
		return typed
	}
	return map[string]any{
		"type":                 "object",
		"additionalProperties": true,
	}
}

func pluginBackendMCPToolCallError(result mcpx.ToolCallResult) error {
	if payload, ok := result.StructuredContent.(map[string]any); ok {
		code, _ := payload["code"].(string)
		message, _ := payload["message"].(string)
		if strings.TrimSpace(code) != "" || strings.TrimSpace(message) != "" {
			if strings.TrimSpace(code) == "" {
				code = "internal_error"
			}
			if strings.TrimSpace(message) == "" {
				message = code
			}
			return mcpx.NewToolError(code, "%s", message)
		}
	}

	message := strings.TrimSpace(result.Text)
	if message == "" {
		message = "plugin backend MCP tool failed"
	}
	return mcpx.NewToolError("internal_error", "%s", message)
}

func indexPluginBackendRuntimeStatuses(statuses []mcpx.ServerRuntimeStatus) map[string]mcpx.ServerRuntimeStatus {
	indexed := make(map[string]mcpx.ServerRuntimeStatus, len(statuses))
	for _, status := range statuses {
		indexed[status.ServerID] = status
	}
	return indexed
}

func pluginBackendMCPServerID(pluginID string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(pluginID)))
	return "plugin_" + hex.EncodeToString(sum[:8])
}

func containsPluginCapability(capabilities []string, expected string) bool {
	for _, capability := range capabilities {
		if capability == expected {
			return true
		}
	}
	return false
}
