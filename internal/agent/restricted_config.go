package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"setta/internal/codexapp"
)

const restrictedThreadBaseInstructions = `You are a restricted Setta reasoning component. Follow the supplied developer instructions exactly and return only the requested response. You have no shell, filesystem, browser, application, plugin, MCP, or delegation capabilities.`

type restrictedConfigCaller interface {
	Call(context.Context, string, any) (json.RawMessage, error)
}

func readRestrictedModelThreadConfig(
	ctx context.Context,
	caller restrictedConfigCaller,
	workspaceRoot string,
	invocation Invocation,
) (map[string]json.RawMessage, error) {
	serverNames, err := readConfiguredMCPServerNames(ctx, caller, workspaceRoot)
	if err != nil {
		return nil, err
	}
	return restrictedModelThreadConfig(invocation, serverNames)
}

func readConfiguredMCPServerNames(
	ctx context.Context,
	caller restrictedConfigCaller,
	workspaceRoot string,
) ([]string, error) {
	if caller == nil {
		return nil, errors.New("restricted thread config caller is required")
	}
	raw, err := caller.Call(ctx, codexapp.CodexMethodConfigRead, codexapp.ConfigReadParams{
		CWD: &workspaceRoot,
	})
	if err != nil {
		return nil, fmt.Errorf("read effective Codex config for restricted thread: %w", err)
	}
	if _, err := codexapp.DecodeConfigReadResponse(raw); err != nil {
		return nil, fmt.Errorf("decode effective Codex config for restricted thread: %w", err)
	}
	config, err := decodeEffectiveRestrictedConfig(raw)
	if err != nil {
		return nil, err
	}
	return configuredMCPServerNames(config)
}

func decodeEffectiveRestrictedConfig(raw json.RawMessage) (map[string]json.RawMessage, error) {
	var response struct {
		Config json.RawMessage `json:"config"`
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, fmt.Errorf("inspect effective Codex config for restricted thread: %w", err)
	}
	var config map[string]json.RawMessage
	if err := json.Unmarshal(response.Config, &config); err != nil {
		return nil, fmt.Errorf("effective Codex config for restricted thread must be an object: %w", err)
	}
	if config == nil {
		return nil, errors.New("effective Codex config for restricted thread must be an object")
	}
	return config, nil
}

func configuredMCPServerNames(config map[string]json.RawMessage) ([]string, error) {
	rawServers, found := config["mcp_servers"]
	if !found {
		return []string{}, nil
	}
	var servers map[string]json.RawMessage
	if err := json.Unmarshal(rawServers, &servers); err != nil {
		return nil, fmt.Errorf("effective Codex mcp_servers must be an object: %w", err)
	}
	if servers == nil {
		return nil, errors.New("effective Codex mcp_servers must be an object")
	}
	names := make([]string, 0, len(servers))
	for name := range servers {
		if strings.TrimSpace(name) == "" || strings.TrimSpace(name) != name {
			return nil, fmt.Errorf("effective Codex MCP server name %q is not normalized", name)
		}
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

func restrictedModelThreadConfig(
	invocation Invocation,
	mcpServerNames []string,
) (map[string]json.RawMessage, error) {
	webSearch, err := json.Marshal("disabled")
	if err != nil {
		return nil, err
	}
	disabledFeatures := []string{
		"apps",
		"artifact",
		"browser_use",
		"browser_use_external",
		"browser_use_full_cdp_access",
		"chronicle",
		"code_mode",
		"code_mode_host",
		"computer_use",
		"enable_fanout",
		"enable_mcp_apps",
		"goals",
		"hooks",
		"image_generation",
		"in_app_browser",
		"memories",
		"multi_agent",
		"multi_agent_v2",
		"network_proxy",
		"plugins",
		"plugin_sharing",
		"remote_plugin",
		"request_permissions_tool",
		"shell_tool",
		"skill_mcp_dependency_install",
		"standalone_web_search",
		"tool_suggest",
		"unified_exec",
		"workspace_dependencies",
	}
	features := make(map[string]bool, len(disabledFeatures))
	for _, feature := range disabledFeatures {
		features[feature] = false
	}
	featuresJSON, err := json.Marshal(features)
	if err != nil {
		return nil, err
	}
	orchestrator, err := json.Marshal(map[string]any{
		"mcp":    map[string]bool{"enabled": false},
		"skills": map[string]bool{"enabled": false},
	})
	if err != nil {
		return nil, err
	}
	mcpServers := make(map[string]map[string]bool, len(mcpServerNames))
	for _, name := range mcpServerNames {
		mcpServers[name] = map[string]bool{"enabled": false}
	}
	mcpServersJSON, err := json.Marshal(mcpServers)
	if err != nil {
		return nil, err
	}
	projectDocBytes, err := json.Marshal(0)
	if err != nil {
		return nil, err
	}
	reasoningEffort, err := json.Marshal(invocation.ReasoningEffort)
	if err != nil {
		return nil, err
	}
	return map[string]json.RawMessage{
		"features":               featuresJSON,
		"mcp_servers":            mcpServersJSON,
		"model_reasoning_effort": reasoningEffort,
		"orchestrator":           orchestrator,
		"project_doc_max_bytes":  projectDocBytes,
		"web_search":             webSearch,
	}, nil
}
