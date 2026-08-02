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

const structuredCallBaseInstructions = `You are a restricted Setta reasoning component. Follow the supplied developer instructions exactly and return only the requested response. You have no direct shell, filesystem, browser, application, plugin, MCP, or delegation capabilities. Returning schema-constrained classification labels or typed decision data named by the developer instructions does not exercise those capabilities and is allowed.`

type RestrictedThreadConfigCaller interface {
	Call(context.Context, string, any) (json.RawMessage, error)
}

type RestrictedThreadConfigOptions struct {
	CWD             *string
	ReasoningEffort string
	ShellTools      bool
	UserInput       bool
}

var restrictedThreadFeatureNames = []string{
	"apply_patch_freeform",
	"apply_patch_streaming_events",
	"apps",
	"apps_mcp_path_override",
	"artifact",
	"auth_elicitation",
	"browser_use",
	"browser_use_external",
	"browser_use_full_cdp_access",
	"chronicle",
	"code_mode",
	"code_mode_host",
	"code_mode_only",
	"codex_git_commit",
	"collaboration_modes",
	"computer_use",
	"deferred_executor",
	"deferred_tool_world_state",
	"default_mode_request_user_input",
	"enable_fanout",
	"enable_mcp_apps",
	"exec_permission_approvals",
	"executor_capability_discovery",
	"external_agent_memory_import",
	"external_migration",
	"goals",
	"guardian_approval",
	"guardianv2",
	"hooks",
	"image_generation",
	"in_app_browser",
	"js_repl",
	"js_repl_tools_only",
	"mcp_2026_07_28",
	"memories",
	"mentions_v2",
	"multi_agent",
	"multi_agent_v2",
	"network_proxy",
	"non_prefixed_mcp_tool_names",
	"plugin_hooks",
	"plugins",
	"plugin_sharing",
	"personality",
	"prevent_idle_sleep",
	"realtime_conversation",
	"remote_control",
	"remote_plugin",
	"request_permissions_tool",
	"request_rule",
	"respect_system_proxy",
	"search_tool",
	"secret_auth_storage",
	"shell_snapshot",
	"shell_tool",
	"shell_zsh_fork",
	"skill_env_var_dependency_prompt",
	"skill_mcp_dependency_install",
	"skill_search",
	"standalone_web_search",
	"terminal_visualization_instructions",
	"tool_call_mcp_elicitation",
	"tool_search",
	"tool_search_always_defer_mcp_tools",
	"tool_suggest",
	"unavailable_dummy_tools",
	"undo",
	"unified_exec",
	"unified_exec_zsh_fork",
	"use_agent_identity",
	"web_search_cached",
	"web_search_request",
	"workspace_dependencies",
}

var restrictedThreadShellFeatureNames = []string{"shell_tool", "unified_exec"}

const restrictedThreadUserInputFeatureName = "default_mode_request_user_input"

func readStructuredCallThreadConfig(
	ctx context.Context,
	caller RestrictedThreadConfigCaller,
	workspaceRoot string,
	invocation Invocation,
) (map[string]json.RawMessage, error) {
	return ReadRestrictedThreadConfig(ctx, caller, RestrictedThreadConfigOptions{
		CWD:             &workspaceRoot,
		ReasoningEffort: invocation.ReasoningEffort,
	})
}

func ReadRestrictedThreadConfig(
	ctx context.Context,
	caller RestrictedThreadConfigCaller,
	options RestrictedThreadConfigOptions,
) (map[string]json.RawMessage, error) {
	serverNames, err := readConfiguredMCPServerNames(ctx, caller, options.CWD)
	if err != nil {
		return nil, err
	}
	return restrictedThreadConfig(options, serverNames)
}

func RestrictedThreadDisabledFeatureNames(shellTools bool, userInput bool) []string {
	disabled := make([]string, 0, len(restrictedThreadFeatureNames))
	for _, feature := range restrictedThreadFeatureNames {
		if (shellTools && containsString(restrictedThreadShellFeatureNames, feature)) ||
			(userInput && feature == restrictedThreadUserInputFeatureName) {
			continue
		}
		disabled = append(disabled, feature)
	}
	return disabled
}

func RestrictedThreadEnabledFeatureNames(shellTools bool, userInput bool) []string {
	enabled := make([]string, 0, len(restrictedThreadShellFeatureNames)+1)
	if shellTools {
		enabled = append(enabled, restrictedThreadShellFeatureNames...)
	}
	if userInput {
		enabled = append(enabled, restrictedThreadUserInputFeatureName)
	}
	return enabled
}

func readConfiguredMCPServerNames(
	ctx context.Context,
	caller RestrictedThreadConfigCaller,
	cwd *string,
) ([]string, error) {
	if caller == nil {
		return nil, errors.New("restricted-thread config caller is required")
	}
	raw, err := caller.Call(ctx, codexapp.CodexMethodConfigRead, codexapp.ConfigReadParams{
		CWD: cwd,
	})
	if err != nil {
		return nil, fmt.Errorf("read effective Codex config for restricted thread: %w", err)
	}
	if _, err := codexapp.DecodeConfigReadResponse(raw); err != nil {
		return nil, fmt.Errorf("decode effective Codex config for restricted thread: %w", err)
	}
	config, err := decodeEffectiveStructuredCallConfig(raw)
	if err != nil {
		return nil, err
	}
	return configuredMCPServerNames(config)
}

func decodeEffectiveStructuredCallConfig(raw json.RawMessage) (map[string]json.RawMessage, error) {
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

func restrictedThreadConfig(
	options RestrictedThreadConfigOptions,
	mcpServerNames []string,
) (map[string]json.RawMessage, error) {
	if strings.TrimSpace(options.ReasoningEffort) == "" {
		return nil, errors.New("restricted thread reasoning effort is required")
	}
	webSearch, err := json.Marshal("disabled")
	if err != nil {
		return nil, err
	}
	disabledFeatures := RestrictedThreadDisabledFeatureNames(options.ShellTools, options.UserInput)
	features := make(map[string]bool, len(disabledFeatures))
	for _, feature := range disabledFeatures {
		features[feature] = false
	}
	for _, feature := range RestrictedThreadEnabledFeatureNames(options.ShellTools, options.UserInput) {
		features[feature] = true
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
	reasoningEffort, err := json.Marshal(options.ReasoningEffort)
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
