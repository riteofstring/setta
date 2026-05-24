package externalagents

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/auth"
	"setta/internal/externalagentconfigs"
	"setta/internal/mcpx"
)

func (e *ClaudeExecutor) resolveWorkingDir(config externalagentconfigs.Config) (string, func() error, error) {
	switch config.WorkingDirStrategy {
	case externalagentconfigs.WorkingDirStrategyTempDir:
		root, err := os.MkdirTemp("", "setta-claude-")
		if err != nil {
			return "", nil, fmt.Errorf("create claude temp working dir: %w", err)
		}
		return root, func() error {
			return os.RemoveAll(root)
		}, nil
	case externalagentconfigs.WorkingDirStrategyCustom:
		path := strings.TrimSpace(derefOptionalString(config.WorkingDir))
		if path == "" {
			return "", nil, fmt.Errorf("custom working directory requires workingDir")
		}
		if err := os.MkdirAll(path, 0o755); err != nil {
			return "", nil, fmt.Errorf("create claude custom working dir: %w", err)
		}
		return path, nil, nil
	default:
		return e.workspaceRoot, nil, nil
	}
}

func (e *ClaudeExecutor) buildRuntimeEnv(config externalagentconfigs.Config) map[string]string {
	envMap := map[string]string{}
	for _, key := range []string{"PATH", "HOME", "USER", "SHELL", "TMPDIR", "TMP", "TEMP"} {
		if value := strings.TrimSpace(e.processEnv[key]); value != "" {
			envMap[key] = e.processEnv[key]
		}
	}
	for key, value := range externalagentconfigs.ResolveWhitelistedEnvVars(e.workspaceRoot, e.runtimeRoot, e.processEnv, config.EnvVarWhitelist).EnvVars {
		envMap[key] = value
	}
	return envMap
}

func (e *ClaudeExecutor) prepareClaudeSettings(config externalagentconfigs.Config) error {
	return externalagentconfigs.PrepareClaudeSettings(e.workspaceRoot, config)
}

func (e *ClaudeExecutor) ensureClaudeMCPConfig(request *StartRequest) (string, error) {
	if request == nil {
		return "", nil
	}
	if request.Inputs == nil {
		request.Inputs = map[string]any{}
	}
	if strings.TrimSpace(stringValue(request.Inputs["mcpConfig"])) != "" {
		return "", nil
	}
	configDir, err := os.MkdirTemp("", "setta-claude-mcp-")
	if err != nil {
		return "", fmt.Errorf("create claude mcp config dir: %w", err)
	}
	configPath := filepath.Join(configDir, claudeMCPConfigName)
	serverEntry := map[string]any{
		"type": "streamable_http",
		"url":  e.settaServerURL,
	}
	headers, err := e.buildClaudeMCPHeaders(*request)
	if err != nil {
		_ = os.RemoveAll(configDir)
		return "", err
	}
	if len(headers) > 0 {
		serverEntry["headers"] = headers
	}
	content, err := json.MarshalIndent(map[string]any{
		"mcpServers": map[string]any{
			mcpx.DefaultServerID: serverEntry,
		},
	}, "", "  ")
	if err != nil {
		_ = os.RemoveAll(configDir)
		return "", fmt.Errorf("encode claude mcp config: %w", err)
	}
	content = append(content, '\n')
	if err := os.WriteFile(configPath, content, 0o644); err != nil {
		_ = os.RemoveAll(configDir)
		return "", fmt.Errorf("write claude mcp config: %w", err)
	}
	request.Inputs["mcpConfig"] = configPath
	return configDir, nil
}

func (e *ClaudeExecutor) buildClaudeMCPHeaders(request StartRequest) (map[string]string, error) {
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

func cloneCurrentSession(currentSession *auth.CurrentSession) *auth.CurrentSession {
	if currentSession == nil {
		return nil
	}
	cloned := *currentSession
	cloned.Metadata = currentSession.Metadata
	cloned.Secret = append([]byte(nil), currentSession.Secret...)
	return &cloned
}

func buildClaudeStartPayload(request StartRequest, workingDir string, envMap map[string]string) map[string]any {
	payload := map[string]any{
		"type":   "start",
		"prompt": buildClaudePrompt(request.Inputs),
		"cwd":    workingDir,
		"env":    cloneStringAnyMapToStringMap(envMap),
	}
	populateClaudeStartPayload(payload, request)
	return payload
}

func populateClaudeStartPayload(payload map[string]any, request StartRequest) {
	setOptionalStringPayloadField(payload, "cliPath", strings.TrimSpace(derefOptionalString(request.ExternalConfig.CommandPath)))
	setOptionalStringPayloadField(payload, "systemPrompt", strings.TrimSpace(stringValue(request.Inputs["systemPrompt"])))
	setOptionalStringPayloadField(payload, "model", resolveClaudeModel(request))
	setOptionalStringPayloadField(payload, "resume", strings.TrimSpace(stringValue(request.Inputs["sessionId"])))
	setOptionalStringSlicePayloadField(payload, "settingSources", resolveClaudeSettingSources(request.ExternalConfig))
	setOptionalClaudePolicyFields(payload, request)
	setOptionalStringSlicePayloadField(payload, "allowedTools", extractClaudeAllowedTools(request))
	setOptionalIntPayloadField(payload, "maxTurns", resolveClaudeMaxTurns(request.Inputs))
	setOptionalIntPayloadField(payload, "maxThinkingTokens", resolveClaudeThinkingBudget(request.Inputs))
	setOptionalMapPayloadField(payload, "sandbox", buildClaudeSandboxSettings(resolveClaudeSandboxPolicy(request)))
	setOptionalStringPayloadField(payload, "mcpConfigPath", strings.TrimSpace(stringValue(request.Inputs["mcpConfig"])))
}

func setOptionalClaudePolicyFields(payload map[string]any, request StartRequest) {
	policy := resolveClaudeApprovalPolicy(request)
	setOptionalStringPayloadField(payload, "permissionMode", resolveClaudePermissionMode(policy))
	payload["decisionPolicy"] = resolveClaudeDecisionPolicy(policy)
}

func setOptionalStringPayloadField(payload map[string]any, key string, value string) {
	if value == "" {
		return
	}
	payload[key] = value
}

func setOptionalStringSlicePayloadField(payload map[string]any, key string, values []string) {
	if len(values) == 0 {
		return
	}
	payload[key] = append([]string(nil), values...)
}

func setOptionalIntPayloadField(payload map[string]any, key string, value *int) {
	if value == nil {
		return
	}
	payload[key] = *value
}

func setOptionalMapPayloadField(payload map[string]any, key string, value map[string]any) {
	if value == nil {
		return
	}
	payload[key] = value
}

func buildClaudePrompt(inputs map[string]any) string {
	prompt := extractLatestUserPrompt(inputs)
	attachmentText := strings.TrimSpace(stringValue(inputs["attachmentText"]))
	if prompt != "" && attachmentText != "" {
		return prompt + "\n\n" + attachmentText + "\n"
	}
	if prompt != "" {
		return prompt + "\n"
	}
	if attachmentText != "" {
		return attachmentText + "\n"
	}
	return ""
}

func extractLatestUserPrompt(inputs map[string]any) string {
	if inputs == nil {
		return ""
	}
	rawMessages, ok := inputs["messages"].([]any)
	if ok {
		for index := len(rawMessages) - 1; index >= 0; index-- {
			message, ok := rawMessages[index].(map[string]any)
			if !ok {
				continue
			}
			if strings.TrimSpace(stringValue(message["role"])) != "user" {
				continue
			}
			text := extractMessageText(message)
			if text != "" {
				return text
			}
		}
	}
	return strings.TrimSpace(stringValue(inputs["prompt"]))
}

func resolveClaudeModel(request StartRequest) string {
	if request.ExternalConfig.DefaultModel != nil && strings.TrimSpace(*request.ExternalConfig.DefaultModel) != "" {
		return strings.TrimSpace(*request.ExternalConfig.DefaultModel)
	}
	return strings.TrimSpace(stringValue(request.Inputs["model"]))
}

func resolveClaudeSettingSources(config externalagentconfigs.Config) []string {
	if len(config.SettingsSources) > 0 {
		sources := make([]string, 0, len(config.SettingsSources))
		for _, value := range config.SettingsSources {
			sources = append(sources, string(value))
		}
		return sources
	}
	defaults := externalagentconfigs.DefaultClaudeSettingsSources()
	sources := make([]string, 0, len(defaults))
	for _, value := range defaults {
		sources = append(sources, string(value))
	}
	return sources
}

func resolveClaudeApprovalPolicy(request StartRequest) string {
	if override := strings.TrimSpace(stringValue(request.Inputs["approvalPolicy"])); override != "" {
		return override
	}
	return strings.TrimSpace(derefOptionalString(request.ExternalConfig.ApprovalPolicy))
}

func resolveClaudeSandboxPolicy(request StartRequest) string {
	if override := strings.TrimSpace(stringValue(request.Inputs["sandboxPolicy"])); override != "" {
		return override
	}
	return strings.TrimSpace(derefOptionalString(request.ExternalConfig.SandboxPolicy))
}

func resolveClaudePermissionMode(policy string) string {
	return externalagentconfigs.NormalizeClaudeApprovalPolicy(policy)
}

func resolveClaudeDecisionPolicy(policy string) string {
	if strings.TrimSpace(policy) == "" {
		return "ask"
	}
	normalized := strings.ToLower(policy)
	switch {
	case strings.Contains(normalized, "allow"), strings.Contains(normalized, "auto"), strings.Contains(normalized, "bypass"):
		return "allow"
	case strings.Contains(normalized, "deny"), strings.Contains(normalized, "block"):
		return "deny"
	default:
		return "ask"
	}
}

func extractClaudeAllowedTools(request StartRequest) []string {
	if tools := trimmedStringSlice(request.Inputs["allowedTools"]); len(tools) > 0 {
		return tools
	}
	if request.Profile != nil && len(request.Profile.ToolAllowlist) > 0 {
		return append([]string(nil), request.Profile.ToolAllowlist...)
	}
	return nil
}

func trimmedStringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return appendTrimmedStrings(make([]string, 0, len(typed)), typed)
	case []any:
		tools := make([]string, 0, len(typed))
		for _, raw := range typed {
			value, ok := raw.(string)
			if !ok {
				continue
			}
			tools = appendTrimmedString(tools, value)
		}
		return tools
	default:
		return nil
	}
}

func appendTrimmedStrings(dst []string, values []string) []string {
	for _, value := range values {
		dst = appendTrimmedString(dst, value)
	}
	return dst
}

func appendTrimmedString(dst []string, value string) []string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return dst
	}
	return append(dst, trimmed)
}

func resolveClaudeMaxTurns(inputs map[string]any) *int {
	if inputs == nil {
		return nil
	}
	value := parseOptionalNonNegativeInt(inputs["maxTurns"])
	if value == nil {
		value = parseOptionalNonNegativeInt(inputs["max_turns"])
	}
	if value == nil {
		return nil
	}
	if *value < 1 {
		normalized := 1
		return &normalized
	}
	return value
}

func resolveClaudeThinkingBudget(inputs map[string]any) *int {
	if inputs == nil {
		return nil
	}
	if budget, resolved := resolveClaudeThinkingPayload(inputs["thinking"]); resolved {
		return budget
	}
	if budget := parseOptionalNonNegativeInt(inputs["thinkingBudgetTokens"]); budget != nil {
		return budget
	}
	return parseOptionalNonNegativeInt(inputs["thinking_budget_tokens"])
}

func resolveClaudeThinkingPayload(value any) (*int, bool) {
	switch typed := value.(type) {
	case bool:
		if typed {
			return claudeDefaultThinkingBudgetValue(), true
		}
		return nil, true
	case map[string]any:
		return resolveClaudeThinkingBudgetFromMap(typed)
	case string:
		if strings.EqualFold(strings.TrimSpace(typed), "disabled") {
			return nil, true
		}
	}
	return nil, false
}

func resolveClaudeThinkingBudgetFromMap(payload map[string]any) (*int, bool) {
	for _, key := range []string{"budget_tokens", "budgetTokens"} {
		if budget := parseOptionalNonNegativeInt(payload[key]); budget != nil {
			return budget, true
		}
	}
	if strings.EqualFold(strings.TrimSpace(stringValue(payload["type"])), "enabled") {
		return claudeDefaultThinkingBudgetValue(), true
	}
	return nil, false
}

func claudeDefaultThinkingBudgetValue() *int {
	value := claudeDefaultThinkingBudget
	return &value
}

func parseOptionalNonNegativeInt(value any) *int {
	switch typed := value.(type) {
	case int:
		if typed < 0 {
			return nil
		}
		return &typed
	case float64:
		normalized := int(typed)
		if float64(normalized) != typed || normalized < 0 {
			return nil
		}
		return &normalized
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil
		}
		var parsed int
		if _, err := fmt.Sscanf(trimmed, "%d", &parsed); err != nil || parsed < 0 {
			return nil
		}
		return &parsed
	default:
		return nil
	}
}

func boolValue(value any) bool {
	typed, ok := value.(bool)
	return ok && typed
}

func buildClaudeSandboxSettings(policy string) map[string]any {
	normalized := strings.TrimSpace(policy)
	if normalized == "" {
		return nil
	}
	if strings.HasPrefix(normalized, "{") || strings.HasPrefix(normalized, "[") {
		parsed := map[string]any{}
		if err := json.Unmarshal([]byte(normalized), &parsed); err == nil {
			return parsed
		}
	}
	switch strings.ToLower(normalized) {
	case "disabled", "off", "false", "0", "dangerously_disable", "dangerously-disable":
		return map[string]any{"enabled": false}
	case "allow_unsandboxed_commands", "allow-unsandboxed-commands", "allow_unsandboxed":
		return map[string]any{"enabled": true, "allowUnsandboxedCommands": true}
	case "enabled", "on", "true", "sandboxed":
		return map[string]any{"enabled": true}
	default:
		return nil
	}
}

func extractClaudeSessionID(payload map[string]any) string {
	for _, key := range []string{"sessionId", "session_id"} {
		if value := strings.TrimSpace(stringValue(payload[key])); value != "" {
			return value
		}
	}
	if eventPayload, ok := mapValue(payload["event"]); ok {
		for _, key := range []string{"sessionId", "session_id"} {
			if value := strings.TrimSpace(stringValue(eventPayload[key])); value != "" {
				return value
			}
		}
	}
	return ""
}

func extractClaudeResult(payload map[string]any) *claudeResultPayload {
	result := &claudeResultPayload{
		SessionID: extractClaudeSessionID(payload),
		Result:    strings.TrimSpace(stringValue(payload["result"])),
		IsError:   boolValue(payload["isError"]),
	}
	if usage, ok := mapValue(payload["usage"]); ok {
		result.Usage = cloneAnyMap(usage)
	}
	return result
}

func buildClaudeApprovalArguments(payload map[string]any) map[string]any {
	arguments := map[string]any{}
	if approvalID := strings.TrimSpace(stringValue(payload["approvalId"])); approvalID != "" {
		arguments["approvalId"] = approvalID
	}
	if toolName := normalizeClaudeToolName(stringValue(payload["toolName"])); toolName != "" {
		arguments["toolName"] = toolName
	}
	if toolType := strings.TrimSpace(stringValue(payload["toolType"])); toolType != "" {
		arguments["toolType"] = toolType
	}
	if payload["tool"] != nil {
		arguments["tool"] = deepCloneJSONValue(payload["tool"])
	}
	if payload["input"] != nil {
		arguments["input"] = deepCloneJSONValue(payload["input"])
	}
	return arguments
}

func normalizeClaudeToolName(raw string) string {
	normalized := mcpx.NormalizeToolName(raw)
	if normalized == "" {
		normalized = strings.TrimSpace(raw)
	}
	if !strings.HasPrefix(strings.TrimSpace(raw), "mcp__") && strings.EqualFold(normalized, "question") {
		return askUserQuestionToolName
	}
	return normalized
}
