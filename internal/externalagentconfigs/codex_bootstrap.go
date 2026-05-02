package externalagentconfigs

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	toml "github.com/pelletier/go-toml/v2"
)

const codexMCPImportedAtKey = "codexMcpImportedAt"

var supportedCodexMCPServerFields = map[string]struct{}{
	"transport":              {},
	"url":                    {},
	"command":                {},
	"args":                   {},
	"env":                    {},
	"cwd":                    {},
	"encoding":               {},
	"encoding_error_handler": {},
	"http_headers":           {},
}

func resolveCodexBaseConfigPath(path string, config Config) string {
	if config.SettingsMode == SettingsModeExplicitPath {
		explicitPath := strings.TrimSpace(derefOptionalString(config.SettingsFilePath))
		if explicitPath != "" {
			return explicitPath
		}
	}
	if _, err := os.Stat(path); err == nil {
		return path
	}
	return ""
}

func loadCodexTOMLPayload(path string) (map[string]any, error) {
	if strings.TrimSpace(path) == "" {
		return map[string]any{}, nil
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read codex base config: %w", err)
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		return map[string]any{}, nil
	}
	payload := map[string]any{}
	if err := toml.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Errorf("decode codex base config: %w", err)
	}
	return payload, nil
}

func validateCodexMCPServersPayload(payload map[string]any) error {
	_, err := resolveRawCodexMCPServers(payload)
	return err
}

func bootstrapCodexMCPServersFromUserConfig(payload map[string]any, config Config) {
	if config.SettingsMode == SettingsModeExplicitPath {
		return
	}
	if getCodexMCPImportedAt(payload) != "" {
		return
	}
	existingServers, err := resolveRawCodexMCPServers(payload)
	if err != nil {
		return
	}
	if hasNonSettaCodexMCPServer(existingServers) {
		payload["mcp_servers"] = existingServers
		return
	}
	importedServers := loadCodexMCPServerPayloadsFromConfig()
	for serverID, serverPayload := range importedServers {
		if _, ok := existingServers[serverID]; ok {
			continue
		}
		existingServers[serverID] = cloneJSONMap(serverPayload)
	}
	payload["mcp_servers"] = existingServers
	if !hasNonSettaCodexMCPServer(existingServers) {
		return
	}
	payload[codexMCPImportedAtKey] = time.Now().UTC().Format(time.RFC3339)
}

func getCodexMCPImportedAt(payload map[string]any) string {
	rawMarker, ok := payload[codexMCPImportedAtKey].(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(rawMarker)
}

func resolveRawCodexMCPServers(payload map[string]any) (map[string]any, error) {
	if _, ok := payload["mcpServers"]; ok {
		return nil, fmt.Errorf("'mcpServers' is not supported. Use 'mcp_servers'.")
	}
	rawServers, ok := payload["mcp_servers"]
	if !ok {
		return map[string]any{}, nil
	}
	typedServers, ok := rawServers.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("'mcp_servers' must be an object")
	}
	return cloneJSONMap(typedServers), nil
}

func hasNonSettaCodexMCPServer(mcpServers map[string]any) bool {
	for serverID := range mcpServers {
		if strings.TrimSpace(serverID) != "setta" {
			return true
		}
	}
	return false
}

func loadCodexMCPServerPayloadsFromConfig() map[string]map[string]any {
	codexHomeEnv, codexHomeSet := os.LookupEnv("CODEX_HOME")
	if codexHomeSet {
		trimmedHome := strings.TrimSpace(codexHomeEnv)
		if trimmedHome == "" {
			return map[string]map[string]any{}
		}
		return loadCodexMCPServersFromPath(filepath.Join(trimmedHome, codexConfigFileName))
	}
	homeDir, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(homeDir) == "" {
		return map[string]map[string]any{}
	}
	return loadCodexMCPServersFromPath(filepath.Join(homeDir, ".codex", codexConfigFileName))
}

func loadCodexMCPServersFromPath(path string) map[string]map[string]any {
	content, err := os.ReadFile(path)
	if err != nil {
		return map[string]map[string]any{}
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		return map[string]map[string]any{}
	}
	payload := map[string]any{}
	if err := toml.Unmarshal(content, &payload); err != nil {
		return map[string]map[string]any{}
	}
	rawServers, err := resolveRawCodexMCPServers(payload)
	if err != nil || len(rawServers) == 0 {
		return map[string]map[string]any{}
	}
	return parseCodexMCPServers(rawServers)
}

func parseCodexMCPServers(rawServers map[string]any) map[string]map[string]any {
	type validatedEntry struct {
		serverID string
		entry    any
	}
	validatedEntries := []validatedEntry{}
	rawLabelsByCanonicalID := map[string][]string{}
	for rawServerID, rawEntry := range rawServers {
		serverID, err := validateCodexServerID(rawServerID)
		if err != nil {
			continue
		}
		validatedEntries = append(validatedEntries, validatedEntry{
			serverID: serverID,
			entry:    rawEntry,
		})
		rawLabelsByCanonicalID[serverID] = append(rawLabelsByCanonicalID[serverID], rawServerID)
	}

	collidedCanonicalIDs := map[string]struct{}{}
	for serverID, labels := range rawLabelsByCanonicalID {
		if len(labels) > 1 {
			collidedCanonicalIDs[serverID] = struct{}{}
		}
	}

	parsed := map[string]map[string]any{}
	for _, entry := range validatedEntries {
		if _, collided := collidedCanonicalIDs[entry.serverID]; collided {
			continue
		}
		serverPayload, err := parseCodexMCPServerEntry(entry.entry, entry.serverID)
		if err != nil {
			continue
		}
		parsed[entry.serverID] = serverPayload
	}
	return parsed
}

func validateCodexServerID(rawServerID string) (string, error) {
	serverID := strings.TrimSpace(rawServerID)
	if serverID == "" {
		return "", fmt.Errorf("server id is empty")
	}
	if serverID == "setta" {
		return "", fmt.Errorf("server id is reserved for setta")
	}
	if strings.Contains(serverID, "__") {
		return "", fmt.Errorf("server id cannot contain '__'")
	}
	return serverID, nil
}

type codexMCPServerEntryFields struct {
	serverID    string
	entry       map[string]any
	transport   string
	command     string
	url         string
	httpHeaders map[string]string
}

func parseCodexMCPServerEntry(rawEntry any, serverID string) (map[string]any, error) {
	fields, err := parseCodexMCPServerEntryFields(rawEntry, serverID)
	if err != nil {
		return nil, err
	}

	switch fields.transport {
	case "stdio":
		return buildCodexStdioServerPayload(fields)
	case "streamable_http":
		return buildCodexHTTPServerPayload(fields)
	default:
		return nil, fmt.Errorf("server %q has unsupported transport %q", serverID, fields.transport)
	}
}

func parseCodexMCPServerEntryFields(rawEntry any, serverID string) (codexMCPServerEntryFields, error) {
	entry, err := codexMCPServerEntryMap(rawEntry, serverID)
	if err != nil {
		return codexMCPServerEntryFields{}, err
	}
	transport, err := parseCodexOptionalStringField(entry, serverID, "transport")
	if err != nil {
		return codexMCPServerEntryFields{}, err
	}
	command, err := parseCodexOptionalStringField(entry, serverID, "command")
	if err != nil {
		return codexMCPServerEntryFields{}, err
	}
	url, err := parseCodexOptionalStringField(entry, serverID, "url")
	if err != nil {
		return codexMCPServerEntryFields{}, err
	}
	if command != "" && url != "" {
		return codexMCPServerEntryFields{}, fmt.Errorf("server %q cannot declare both command and url", serverID)
	}
	httpHeaders, err := parseCodexHTTPHeaders(entry, serverID)
	if err != nil {
		return codexMCPServerEntryFields{}, err
	}
	resolvedTransport, err := resolveCodexMCPServerTransport(serverID, transport, command, url)
	if err != nil {
		return codexMCPServerEntryFields{}, err
	}
	return codexMCPServerEntryFields{
		serverID:    serverID,
		entry:       entry,
		transport:   resolvedTransport,
		command:     command,
		url:         url,
		httpHeaders: httpHeaders,
	}, nil
}

func codexMCPServerEntryMap(rawEntry any, serverID string) (map[string]any, error) {
	entry, ok := rawEntry.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("server %q entry must be an object", serverID)
	}
	for field := range entry {
		if _, ok := supportedCodexMCPServerFields[field]; !ok {
			return nil, fmt.Errorf("server %q has unsupported fields: %s", serverID, field)
		}
	}
	return entry, nil
}

func resolveCodexMCPServerTransport(serverID string, transport string, command string, url string) (string, error) {
	resolvedTransport := strings.ToLower(transport)
	if resolvedTransport != "" {
		return resolvedTransport, nil
	}
	switch {
	case command != "":
		return "stdio", nil
	case url != "":
		return "streamable_http", nil
	default:
		return "", fmt.Errorf("server %q must declare either command or url", serverID)
	}
}

func buildCodexStdioServerPayload(fields codexMCPServerEntryFields) (map[string]any, error) {
	if fields.url != "" {
		return nil, fmt.Errorf("server %q stdio transport cannot declare url", fields.serverID)
	}
	if fields.command == "" {
		return nil, fmt.Errorf("server %q stdio transport requires command", fields.serverID)
	}
	if len(fields.httpHeaders) > 0 {
		return nil, fmt.Errorf("server %q stdio transport cannot define http_headers", fields.serverID)
	}
	if err := validateCodexStdioEncoding(fields.entry, fields.serverID); err != nil {
		return nil, err
	}

	serverPayload := map[string]any{
		"transport": "stdio",
		"command":   fields.command,
	}
	args, err := parseCodexArgs(fields.entry, fields.serverID)
	if err != nil {
		return nil, err
	}
	if len(args) > 0 {
		serverPayload["args"] = args
	}
	env, err := parseCodexEnv(fields.entry, fields.serverID)
	if err != nil {
		return nil, err
	}
	if len(env) > 0 {
		serverPayload["env"] = env
	}
	cwd, err := parseCodexOptionalStringField(fields.entry, fields.serverID, "cwd")
	if err != nil {
		return nil, err
	}
	if cwd != "" {
		serverPayload["cwd"] = cwd
	}
	return serverPayload, nil
}

func validateCodexStdioEncoding(entry map[string]any, serverID string) error {
	encoding, err := parseCodexEncoding(entry, serverID)
	if err != nil {
		return err
	}
	encodingErrorHandler, err := parseCodexEncodingErrorHandler(entry, serverID)
	if err != nil {
		return err
	}
	if encoding != "utf-8" || encodingErrorHandler != "strict" {
		return fmt.Errorf("server %q stdio transport only supports utf-8 strict encoding", serverID)
	}
	return nil
}

func buildCodexHTTPServerPayload(fields codexMCPServerEntryFields) (map[string]any, error) {
	if fields.command != "" {
		return nil, fmt.Errorf("server %q %s transport cannot declare command", fields.serverID, fields.transport)
	}
	if fields.url == "" {
		return nil, fmt.Errorf("server %q %s transport requires url", fields.serverID, fields.transport)
	}
	serverPayload := map[string]any{
		"transport": fields.transport,
		"url":       fields.url,
	}
	if len(fields.httpHeaders) > 0 {
		serverPayload["http_headers"] = fields.httpHeaders
	}
	return serverPayload, nil
}

func NormalizeSettaCodexMCPServerEntry(entry map[string]any, settaServerURL string) map[string]any {
	normalized := map[string]any{}
	for key, value := range entry {
		normalized[key] = cloneJSONValue(value)
	}
	for _, key := range []string{
		"command",
		"args",
		"env",
		"cwd",
		"encoding",
		"encoding_error_handler",
	} {
		delete(normalized, key)
	}
	normalized["transport"] = "streamable_http"
	if trimmedURL := strings.TrimSpace(settaServerURL); trimmedURL != "" {
		normalized["url"] = trimmedURL
	}
	return normalized
}

func parseCodexOptionalStringField(entry map[string]any, serverID string, fieldName string) (string, error) {
	rawValue, ok := entry[fieldName]
	if !ok {
		return "", nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", fmt.Errorf("server %q %s must be a string", serverID, fieldName)
	}
	return strings.TrimSpace(value), nil
}

func parseCodexHTTPHeaders(entry map[string]any, serverID string) (map[string]string, error) {
	rawValue, ok := entry["http_headers"]
	if !ok || rawValue == nil {
		return map[string]string{}, nil
	}
	rawHeaders, ok := rawValue.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("server %q http_headers must be an object", serverID)
	}
	headers := map[string]string{}
	for rawName, rawHeaderValue := range rawHeaders {
		headerValue, ok := rawHeaderValue.(string)
		if !ok {
			return nil, fmt.Errorf("server %q http_headers values must be string key/value pairs", serverID)
		}
		headerName := strings.TrimSpace(rawName)
		if headerName == "" {
			continue
		}
		headers[headerName] = headerValue
	}
	return headers, nil
}

func parseCodexArgs(entry map[string]any, serverID string) ([]string, error) {
	rawValue, ok := entry["args"]
	if !ok || rawValue == nil {
		return []string{}, nil
	}
	rawArgs, ok := rawValue.([]any)
	if !ok {
		return nil, fmt.Errorf("server %q args must be an array of strings", serverID)
	}
	args := make([]string, 0, len(rawArgs))
	for index, rawArg := range rawArgs {
		arg, ok := rawArg.(string)
		if !ok {
			return nil, fmt.Errorf("server %q has invalid args[%d] value (expected string)", serverID, index)
		}
		trimmed := strings.TrimSpace(arg)
		if trimmed != "" {
			args = append(args, trimmed)
		}
	}
	return args, nil
}

func parseCodexEnv(entry map[string]any, serverID string) (map[string]string, error) {
	rawValue, ok := entry["env"]
	if !ok || rawValue == nil {
		return map[string]string{}, nil
	}
	rawEnv, ok := rawValue.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("server %q env must be an object of string key/value pairs", serverID)
	}
	env := map[string]string{}
	for rawKey, rawEnvValue := range rawEnv {
		envValue, ok := rawEnvValue.(string)
		if !ok {
			return nil, fmt.Errorf("server %q has invalid env.%s value (expected string)", serverID, rawKey)
		}
		envKey := strings.TrimSpace(rawKey)
		if envKey == "" {
			return nil, fmt.Errorf("server %q has an empty env key", serverID)
		}
		env[envKey] = envValue
	}
	return env, nil
}

func parseCodexEncoding(entry map[string]any, serverID string) (string, error) {
	encoding, err := parseCodexOptionalStringField(entry, serverID, "encoding")
	if err != nil {
		return "", err
	}
	if encoding == "" {
		return "utf-8", nil
	}
	return encoding, nil
}

func parseCodexEncodingErrorHandler(entry map[string]any, serverID string) (string, error) {
	value, err := parseCodexOptionalStringField(entry, serverID, "encoding_error_handler")
	if err != nil {
		return "", err
	}
	if value == "" {
		return "strict", nil
	}
	normalized := strings.ToLower(value)
	if normalized != "strict" && normalized != "ignore" && normalized != "replace" {
		return "", fmt.Errorf("server %q has unsupported encoding_error_handler %q", serverID, normalized)
	}
	return normalized, nil
}
