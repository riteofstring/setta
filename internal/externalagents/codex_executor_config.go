package externalagents

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/agentprofiles"
	"setta/internal/auth"
	"setta/internal/externalagentconfigs"
	"setta/internal/mcpx"
	"setta/internal/tools"

	toml "github.com/pelletier/go-toml/v2"
)

func buildCodexPrompt(inputs map[string]any) string {
	if inputs == nil {
		return "\n"
	}
	parts := []string{}
	if rawMessages, ok := inputs["messages"].([]any); ok {
		for _, rawMessage := range rawMessages {
			message, ok := rawMessage.(map[string]any)
			if !ok {
				continue
			}
			role := strings.TrimSpace(stringValue(message["role"]))
			if role == "" || role == "system" || role == "developer" {
				continue
			}
			text := extractMessageText(message)
			if text == "" {
				continue
			}
			parts = append(parts, strings.Title(role)+":\n"+text)
		}
	}
	if prompt := strings.TrimSpace(stringValue(inputs["prompt"])); prompt != "" {
		parts = append(parts, prompt)
	}
	if len(parts) == 0 {
		return "\n"
	}
	return strings.Join(parts, "\n\n") + "\n"
}

func extractMessageText(message map[string]any) string {
	rawContent, ok := message["content"].([]any)
	if !ok {
		return ""
	}
	lines := []string{}
	for _, rawEntry := range rawContent {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		entryType := strings.TrimSpace(stringValue(entry["type"]))
		if entryType != "" && entryType != "text" {
			continue
		}
		text := stringValue(entry["text"])
		if text != "" {
			lines = append(lines, text)
		}
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func resolveCodexBaseConfig(config externalagentconfigs.Config, baseHome string) (string, string) {
	if config.SettingsMode == externalagentconfigs.SettingsModeExplicitPath {
		path := strings.TrimSpace(derefOptionalString(config.SettingsFilePath))
		if path != "" {
			return path, filepath.Dir(path)
		}
	}
	canonical := filepath.Join(baseHome, codexConfigFileName)
	if _, err := os.Stat(canonical); err == nil {
		return canonical, baseHome
	}
	return "", baseHome
}

func loadCodexConfigPayload(path string) (map[string]any, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read codex base config: %w", err)
	}
	payload := map[string]any{}
	if len(strings.TrimSpace(string(content))) == 0 {
		return payload, nil
	}
	if err := toml.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Errorf("decode codex base config: %w", err)
	}
	if _, ok := payload["mcpServers"]; ok {
		return nil, fmt.Errorf(
			"decode codex base config: top-level mcpServers is not supported; use mcp_servers",
		)
	}
	return payload, nil
}

func applyCodexRuntimeConfig(
	payload map[string]any,
	config externalagentconfigs.Config,
	workingDir string,
	inputs map[string]any,
	profile *agentprofiles.Profile,
	completionGuardEnabled bool,
	settaToolRegistry *tools.Registry,
	settaHeaders map[string]string,
) error {
	if payload == nil {
		return nil
	}
	applyCodexRuntimeCoreSettings(payload, config, inputs)
	applyCodexAPIKeyDefaults(payload, config.EnvVarWhitelist)
	applyCodexSettaMCPServer(payload, settaHeaders)
	applyCodexTrustedProject(payload, workingDir)
	if err := applyCodexEnabledToolsConfig(
		payload,
		profile,
		completionGuardEnabled,
		settaToolRegistry,
	); err != nil {
		return err
	}
	return nil
}

type codexRuntimeStringOverride struct {
	inputKey    string
	payloadKey  string
	configValue *string
}

func applyCodexRuntimeCoreSettings(
	payload map[string]any,
	config externalagentconfigs.Config,
	inputs map[string]any,
) {
	applyCodexRuntimeStringOverrides(payload, inputs, []codexRuntimeStringOverride{
		{
			inputKey:    "model",
			payloadKey:  "model",
			configValue: config.DefaultModel,
		},
		{
			inputKey:    "approvalPolicy",
			payloadKey:  "approval_policy",
			configValue: config.ApprovalPolicy,
		},
		{
			inputKey:    "sandboxPolicy",
			payloadKey:  "sandbox_mode",
			configValue: config.SandboxPolicy,
		},
	})
	prependCodexDeveloperInstructions(
		payload,
		strings.TrimSpace(stringValue(inputs["systemPrompt"])),
	)
	setCodexStringDefault(payload, "model_reasoning_summary", "none")
}

func applyCodexRuntimeStringOverrides(
	payload map[string]any,
	inputs map[string]any,
	overrides []codexRuntimeStringOverride,
) {
	for _, override := range overrides {
		resolved := firstNonEmptyTrimmed(
			stringValue(inputs[override.inputKey]),
			derefOptionalString(override.configValue),
		)
		if resolved == "" {
			continue
		}
		payload[override.payloadKey] = resolved
	}
}

func prependCodexDeveloperInstructions(payload map[string]any, systemPrompt string) {
	if systemPrompt == "" {
		return
	}
	if existing := strings.TrimSpace(stringValue(payload["developer_instructions"])); existing != "" {
		payload["developer_instructions"] = systemPrompt + "\n\n" + existing
		return
	}
	payload["developer_instructions"] = systemPrompt
}

func applyCodexAPIKeyDefaults(payload map[string]any, envWhitelist []string) {
	if !envWhitelistContains(envWhitelist, "OPENAI_API_KEY") {
		return
	}
	setCodexStringDefault(payload, "forced_login_method", "api")
	setCodexStringDefault(payload, "preferred_auth_method", "apikey")
	setCodexStringDefault(payload, "cli_auth_credentials_store", "file")
	features := ensureAnyMapFromValue(payload["features"])
	setCodexMapValueDefault(features, "remote_models", false)
	setCodexMapValueDefault(features, "remote_compaction", false)
	payload["features"] = features
}

func applyCodexSettaMCPServer(payload map[string]any, settaHeaders map[string]string) {
	mcpServers := ensureAnyMapFromValue(payload["mcp_servers"])
	serverEntry := ensureAnyMapFromValue(mcpServers[mcpx.DefaultServerID])
	if len(serverEntry) == 0 && len(settaHeaders) == 0 {
		return
	}
	serverEntry = externalagentconfigs.NormalizeSettaCodexMCPServerEntry(serverEntry, "")
	if len(settaHeaders) > 0 {
		headerEntry := ensureAnyMapFromValue(serverEntry["http_headers"])
		for key, value := range settaHeaders {
			headerEntry[key] = value
		}
		serverEntry["http_headers"] = headerEntry
	}
	mcpServers[mcpx.DefaultServerID] = serverEntry
	payload["mcp_servers"] = mcpServers
}

func applyCodexTrustedProject(payload map[string]any, workingDir string) {
	projects := ensureAnyMapFromValue(payload["projects"])
	projectEntry := ensureAnyMapFromValue(projects[workingDir])
	projectEntry["trust_level"] = "trusted"
	projects[workingDir] = projectEntry
	payload["projects"] = projects
}

func applyCodexEnabledToolsConfig(
	payload map[string]any,
	profile *agentprofiles.Profile,
	completionGuardEnabled bool,
	settaToolRegistry *tools.Registry,
) error {
	enabledTools, err := buildCodexEnabledTools(profile, completionGuardEnabled, settaToolRegistry)
	if err != nil {
		return err
	}
	if len(enabledTools) == 0 {
		return nil
	}
	mcpServers := ensureAnyMapFromValue(payload["mcp_servers"])
	serverEntry := ensureAnyMapFromValue(mcpServers[mcpx.DefaultServerID])
	serverEntry["enabled_tools"] = append([]string(nil), enabledTools...)
	mcpServers[mcpx.DefaultServerID] = serverEntry
	payload["mcp_servers"] = mcpServers
	return nil
}

func setCodexStringDefault(payload map[string]any, key string, value string) {
	if strings.TrimSpace(stringValue(payload[key])) != "" {
		return
	}
	payload[key] = value
}

func setCodexMapValueDefault(payload map[string]any, key string, value any) {
	if _, exists := payload[key]; exists {
		return
	}
	payload[key] = value
}

func firstNonEmptyTrimmed(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

type codexToolAllowlist struct {
	allowAll  bool
	toolNames []string
}

func buildCodexToolAllowlist(profile *agentprofiles.Profile, completionGuardEnabled bool) (*codexToolAllowlist, error) {
	if profile == nil || len(profile.ToolAllowlist) == 0 {
		return nil, nil
	}

	allowAll := false
	toolNames := map[string]struct{}{}
	for _, entry := range profile.ToolAllowlist {
		allowAllEntry, toolName, err := normalizeCodexToolAllowlistEntry(entry)
		if err != nil {
			return nil, err
		}
		if allowAllEntry {
			allowAll = true
			continue
		}
		toolNames[toolName] = struct{}{}
	}
	if allowAll {
		return &codexToolAllowlist{allowAll: true}, nil
	}
	if len(toolNames) == 0 {
		return nil, nil
	}
	return finalizeCodexToolAllowlist(toolNames, completionGuardEnabled), nil
}

func normalizeCodexToolAllowlistEntry(entry string) (bool, string, error) {
	normalized := strings.TrimSpace(entry)
	if normalized == "" {
		return false, "", fmt.Errorf("toolAllowlist entries must be non-empty strings")
	}
	if strings.HasPrefix(normalized, "mcp__") {
		normalized = strings.TrimPrefix(normalized, "mcp__")
	}
	if !strings.Contains(normalized, mcpx.ToolNameSeparator) {
		return normalized == mcpx.DefaultServerID, normalized, nil
	}
	serverID, toolName, ok := mcpx.SplitNamespacedToolName(normalized)
	if !ok || strings.TrimSpace(serverID) == "" || strings.TrimSpace(toolName) == "" {
		return false, "", fmt.Errorf("invalid tool allowlist entry %q", entry)
	}
	if serverID != mcpx.DefaultServerID {
		return false, "", fmt.Errorf("external tool allowlist only supports MCP server %q: %s", mcpx.DefaultServerID, entry)
	}
	return false, toolName, nil
}

func finalizeCodexToolAllowlist(
	toolNames map[string]struct{},
	completionGuardEnabled bool,
) *codexToolAllowlist {
	toolNames["set_agentic_context"] = struct{}{}
	if completionGuardEnabled {
		toolNames["report_completion_status"] = struct{}{}
	}
	resolved := make([]string, 0, len(toolNames))
	for toolName := range toolNames {
		resolved = append(resolved, toolName)
	}
	sort.Strings(resolved)
	return &codexToolAllowlist{
		toolNames: resolved,
	}
}

func buildCodexEnabledTools(
	profile *agentprofiles.Profile,
	completionGuardEnabled bool,
	settaToolRegistry *tools.Registry,
) ([]string, error) {
	allowlist, err := buildCodexToolAllowlist(profile, completionGuardEnabled)
	if err != nil {
		return nil, err
	}
	if allowlist != nil && !allowlist.allowAll {
		return append([]string(nil), allowlist.toolNames...), nil
	}
	return listCodexRegisteredToolNames(settaToolRegistry), nil
}

func listCodexRegisteredToolNames(settaToolRegistry *tools.Registry) []string {
	if settaToolRegistry == nil {
		return nil
	}
	registered := settaToolRegistry.List()
	if len(registered) == 0 {
		return nil
	}
	names := make([]string, 0, len(registered))
	for _, tool := range registered {
		names = append(names, tool.Name)
	}
	return names
}

func (e *CodexExecutor) buildCodexMCPHeaders(request StartRequest) (map[string]string, error) {
	headers := map[string]string{}
	if e != nil && e.currentSession != nil {
		cookieName, err := auth.CookieName(e.authCookieBaseName, e.currentSession.Metadata.ID)
		if err != nil {
			return nil, err
		}
		cookieValue, err := auth.NewAuthCookieManager(auth.DefaultAuthCookieTTL).Mint(
			e.currentSession.Metadata.ID,
			e.currentSession.Secret,
			e.timeNow(),
		)
		if err != nil {
			return nil, err
		}
		headers["Cookie"] = cookieName + "=" + cookieValue
	}
	if projectConfigID := strings.TrimSpace(request.ProjectConfigID); projectConfigID != "" {
		headers[mcpx.AgenticContextProjectConfigIDHeader] = projectConfigID
	}
	if chatID := strings.TrimSpace(request.ChatID); chatID != "" {
		headers[mcpx.AgenticContextChatIDHeader] = chatID
	}
	if runID := strings.TrimSpace(request.Run.ID); runID != "" {
		headers[mcpx.AgenticContextRunIDHeader] = runID
	}
	if sectionID := strings.TrimSpace(derefOptionalString(request.SectionID)); sectionID != "" {
		headers[mcpx.AgenticContextSectionIDHeader] = sectionID
	}
	if frontendAffinityToken := strings.TrimSpace(stringValue(request.Inputs["frontendAffinityToken"])); frontendAffinityToken != "" {
		headers[mcpx.AgenticContextFrontendAffinityHeader] = frontendAffinityToken
	}
	if boolValue(request.Inputs["allowUnscoped"]) {
		headers[mcpx.AgenticContextAllowUnscopedHeader] = "true"
	}
	return headers, nil
}

func normalizeCodexSettaToolName(toolName string) string {
	trimmedToolName := strings.TrimSpace(toolName)
	if !strings.HasPrefix(trimmedToolName, codexSettaToolPrefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(trimmedToolName, codexSettaToolPrefix))
}

func copyCodexAuthFile(baseAuthDir string, runtimeHome string) error {
	if strings.TrimSpace(baseAuthDir) == "" {
		return nil
	}
	source := filepath.Join(baseAuthDir, "auth.json")
	if _, err := os.Stat(source); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("stat codex auth file: %w", err)
	}
	destination := filepath.Join(runtimeHome, "auth.json")
	if _, err := os.Stat(destination); err == nil {
		return nil
	}
	content, err := os.ReadFile(source)
	if err != nil {
		return fmt.Errorf("read codex auth file: %w", err)
	}
	if err := os.WriteFile(destination, content, 0o600); err != nil {
		return fmt.Errorf("write codex auth file: %w", err)
	}
	return nil
}
