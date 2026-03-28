package llmconfig

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"

	"setta/internal/statefs"
)

const (
	DefaultServerID   = "setta"
	ToolNameSeparator = "__"
	defaultFileMode   = 0o644
)

type Transport string

const (
	TransportSSE            Transport = "sse"
	TransportStreamableHTTP Transport = "streamable_http"
	TransportStdio          Transport = "stdio"
)

type ServerConfig struct {
	Transport            Transport         `json:"transport"`
	URL                  string            `json:"url,omitempty"`
	Command              string            `json:"command,omitempty"`
	Args                 []string          `json:"args,omitempty"`
	Env                  map[string]string `json:"env,omitempty"`
	HTTPHeaders          map[string]string `json:"http_headers,omitempty"`
	CWD                  string            `json:"cwd,omitempty"`
	Encoding             string            `json:"encoding,omitempty"`
	EncodingErrorHandler string            `json:"encoding_error_handler,omitempty"`
}

type Config struct {
	ID           string         `json:"id"`
	Model        string         `json:"model"`
	Provider     string         `json:"provider,omitempty"`
	BaseURL      string         `json:"base_url,omitempty"`
	APIKeyEnv    string         `json:"api_key_env,omitempty"`
	OtherParams  map[string]any `json:"other_params,omitempty"`
	MCPServerIDs []string       `json:"mcpServerIds,omitempty"`
	Temporary    bool           `json:"temporary,omitempty"`
}

type AllConfigs struct {
	Configs             map[string]Config       `json:"configs"`
	MCPServers          map[string]ServerConfig `json:"mcpServers"`
	DefaultMCPServerIDs []string                `json:"defaultMcpServerIds"`
	DefaultConfigID     string                  `json:"default_config_id,omitempty"`
	CodexMCPImportedAt  string                  `json:"codexMcpImportedAt,omitempty"`
}

type LoadOptions struct {
	SettaServerURL string
}

type Runtime struct {
	mu      sync.RWMutex
	configs AllConfigs
	apiKeys map[string]string
}

var (
	ErrTransportRequired         = errors.New("llm config transport is required")
	ErrTransportInvalid          = errors.New("llm config transport is invalid")
	ErrServerIDInvalid           = errors.New("llm config server id cannot include '__'")
	ErrServerURLRequired         = errors.New("llm config HTTP transport requires url")
	ErrServerCommandRequired     = errors.New("llm config stdio transport requires command")
	ErrServerHTTPHeadersInvalid  = errors.New("llm config stdio transport cannot declare http_headers")
	ErrServerEncodingUnsupported = errors.New("llm config stdio transport only supports utf-8 strict encoding")
)

type persistedFile struct {
	Configs             map[string]json.RawMessage `json:"configs"`
	MCPServers          map[string]json.RawMessage `json:"mcpServers"`
	DefaultMCPServerIDs []string                   `json:"defaultMcpServerIds"`
	DefaultConfigID     string                     `json:"default_config_id"`
	CodexMCPImportedAt  string                     `json:"codexMcpImportedAt"`
}

type persistedConfig struct {
	Model        string         `json:"model"`
	Provider     string         `json:"provider,omitempty"`
	BaseURL      string         `json:"base_url,omitempty"`
	APIKeyEnv    string         `json:"api_key_env,omitempty"`
	OtherParams  map[string]any `json:"other_params,omitempty"`
	MCPServerIDs []string       `json:"mcpServerIds,omitempty"`
	Temporary    bool           `json:"temporary,omitempty"`
}

func Path(settaFilesRoot string) string {
	return filepath.Join(settaFilesRoot, "llm_config.json")
}

func Load(path string, opts LoadOptions) (AllConfigs, error) {
	resolvedPath, err := statefs.NormalizePath(path, "")
	if err != nil {
		return AllConfigs{}, fmt.Errorf("llm config path: %w", err)
	}
	content, err := os.ReadFile(resolvedPath)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return defaultConfigs(opts), nil
	case err != nil:
		return AllConfigs{}, fmt.Errorf("read llm config: %w", err)
	}
	if len(bytes.TrimSpace(content)) == 0 {
		return defaultConfigs(opts), nil
	}

	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()

	var payload persistedFile
	if err := decoder.Decode(&payload); err != nil {
		return AllConfigs{}, fmt.Errorf("decode llm config: %w", err)
	}
	if isEmptyPayload(payload) {
		return defaultConfigs(opts), nil
	}

	configs := make(map[string]Config, len(payload.Configs))
	for configID, raw := range payload.Configs {
		normalizedID := strings.TrimSpace(configID)
		if normalizedID == "" {
			return AllConfigs{}, fmt.Errorf("llm config id is required")
		}
		if idPresent(raw) {
			return AllConfigs{}, fmt.Errorf("LLM config %q cannot declare an id; use the key instead", normalizedID)
		}
		entry, err := decodePersistedConfig(raw)
		if err != nil {
			return AllConfigs{}, fmt.Errorf("decode llm config %q: %w", normalizedID, err)
		}
		config, err := normalizeConfig(normalizedID, Config{
			Model:        entry.Model,
			Provider:     entry.Provider,
			BaseURL:      entry.BaseURL,
			APIKeyEnv:    entry.APIKeyEnv,
			OtherParams:  entry.OtherParams,
			MCPServerIDs: entry.MCPServerIDs,
			Temporary:    entry.Temporary,
		})
		if err != nil {
			return AllConfigs{}, err
		}
		configs[normalizedID] = config
	}

	servers := make(map[string]ServerConfig, len(payload.MCPServers))
	for serverID, raw := range payload.MCPServers {
		normalizedID := strings.TrimSpace(serverID)
		if normalizedID == "" {
			return AllConfigs{}, fmt.Errorf("llm config server id is required")
		}
		if strings.Contains(normalizedID, ToolNameSeparator) {
			return AllConfigs{}, fmt.Errorf("%w: %s", ErrServerIDInvalid, normalizedID)
		}
		server, err := decodeServerConfig(raw)
		if err != nil {
			return AllConfigs{}, fmt.Errorf("decode llm server %q: %w", normalizedID, err)
		}
		server, err = normalizeServerConfig(normalizedID, server)
		if err != nil {
			return AllConfigs{}, err
		}
		servers[normalizedID] = server
	}

	loaded := AllConfigs{
		Configs:             configs,
		MCPServers:          ensureSettaServerURL(servers, strings.TrimSpace(opts.SettaServerURL)),
		DefaultMCPServerIDs: normalizeServerIDs(payload.DefaultMCPServerIDs),
		DefaultConfigID:     strings.TrimSpace(payload.DefaultConfigID),
		CodexMCPImportedAt:  strings.TrimSpace(payload.CodexMCPImportedAt),
	}
	return loaded.normalized()
}

func Save(path string, configs AllConfigs) error {
	resolvedPath, err := statefs.NormalizePath(path, "")
	if err != nil {
		return fmt.Errorf("llm config path: %w", err)
	}
	normalized, err := configs.normalized()
	if err != nil {
		return err
	}

	persistedConfigs := map[string]persistedConfig{}
	for configID, config := range normalized.Configs {
		if config.Temporary {
			continue
		}
		persistedConfigs[configID] = persistedConfig{
			Model:        config.Model,
			Provider:     config.Provider,
			BaseURL:      config.BaseURL,
			APIKeyEnv:    config.APIKeyEnv,
			OtherParams:  cloneAnyMap(config.OtherParams),
			MCPServerIDs: cloneStringSlicePreserveNil(config.MCPServerIDs),
			Temporary:    config.Temporary,
		}
	}
	defaultConfigID := normalized.DefaultConfigID
	if defaultConfigID != "" {
		if _, ok := persistedConfigs[defaultConfigID]; !ok {
			defaultConfigID = ""
		}
	}
	payload := struct {
		Configs             map[string]persistedConfig `json:"configs,omitempty"`
		MCPServers          map[string]ServerConfig    `json:"mcpServers,omitempty"`
		DefaultMCPServerIDs []string                   `json:"defaultMcpServerIds,omitempty"`
		DefaultConfigID     string                     `json:"default_config_id,omitempty"`
		CodexMCPImportedAt  string                     `json:"codexMcpImportedAt,omitempty"`
	}{
		Configs:             persistedConfigs,
		MCPServers:          cloneServerConfigs(normalized.MCPServers),
		DefaultMCPServerIDs: cloneStringSlice(normalized.DefaultMCPServerIDs),
		DefaultConfigID:     defaultConfigID,
		CodexMCPImportedAt:  normalized.CodexMCPImportedAt,
	}
	content, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("encode llm config: %w", err)
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(resolvedPath, content, defaultFileMode); err != nil {
		return fmt.Errorf("write llm config: %w", err)
	}
	return nil
}

func (c AllConfigs) ResolveConfig(configID string) (Config, error) {
	trimmedID := strings.TrimSpace(configID)
	if trimmedID == "" {
		return Config{}, fmt.Errorf("llm config requires a provider id")
	}
	config, ok := c.Configs[trimmedID]
	if !ok {
		return Config{}, fmt.Errorf("llm config missing provider %q", trimmedID)
	}
	return cloneConfig(config), nil
}

func (c AllConfigs) ResolveMCPServerIDs(config Config) ([]string, error) {
	var serverIDs []string
	if config.MCPServerIDs != nil {
		serverIDs = cloneStringSlice(config.MCPServerIDs)
	} else if len(c.DefaultMCPServerIDs) > 0 {
		serverIDs = cloneStringSlice(c.DefaultMCPServerIDs)
	} else {
		serverIDs = make([]string, 0, len(c.MCPServers))
		for serverID := range c.MCPServers {
			serverIDs = append(serverIDs, serverID)
		}
		slices.Sort(serverIDs)
	}
	if err := validateServerIDs(serverIDs, c.MCPServers, fmt.Sprintf("LLM config %q", config.ID)); err != nil {
		return nil, err
	}
	return serverIDs, nil
}

func (c AllConfigs) BuildRequestParams(config Config) (map[string]any, string) {
	payload := map[string]any{
		"model": config.Model,
	}
	if config.Provider != "" {
		payload["custom_llm_provider"] = config.Provider
	}
	if config.BaseURL != "" {
		payload["api_base"] = config.BaseURL
	}
	for key, value := range config.OtherParams {
		payload[key] = value
	}
	return payload, config.APIKeyEnv
}

func NewRuntime(configs AllConfigs) (*Runtime, error) {
	normalized, err := configs.normalized()
	if err != nil {
		return nil, err
	}
	return &Runtime{
		configs: normalized,
		apiKeys: map[string]string{},
	}, nil
}

func (r *Runtime) UpdateConfig(configs AllConfigs) error {
	if r == nil {
		return nil
	}
	normalized, err := configs.normalized()
	if err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.configs = normalized
	r.apiKeys = FilterEnvVarsForConfig(r.apiKeys, normalized)
	return nil
}

func (r *Runtime) UpdateAPIKeys(payload map[string]string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.apiKeys = FilterEnvVarsForConfig(payload, r.configs)
}

func (r *Runtime) Configs() AllConfigs {
	if r == nil {
		return AllConfigs{}
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return cloneAllConfigs(r.configs)
}

func (r *Runtime) APIKeys() map[string]string {
	if r == nil {
		return map[string]string{}
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return cloneStringMap(r.apiKeys)
}

func ReadEnvFile(path string) (map[string]string, error) {
	resolvedPath, err := statefs.NormalizePath(path, "")
	if err != nil {
		return nil, fmt.Errorf("env path: %w", err)
	}
	content, err := os.ReadFile(resolvedPath)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return map[string]string{}, nil
	case err != nil:
		return nil, fmt.Errorf("read env file: %w", err)
	}
	if len(bytes.TrimSpace(content)) == 0 {
		return map[string]string{}, nil
	}
	parsed, err := parseEnvContent(string(content))
	if err != nil {
		return nil, fmt.Errorf("parse env file: %w", err)
	}
	return parsed, nil
}

func CurrentProcessEnv() map[string]string {
	env := map[string]string{}
	for _, entry := range os.Environ() {
		key, value, ok := strings.Cut(entry, "=")
		if !ok {
			continue
		}
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			continue
		}
		env[trimmedKey] = value
	}
	return env
}

func CollectAPIKeyNames(configs AllConfigs) []string {
	names := map[string]struct{}{}
	for _, config := range configs.Configs {
		if trimmed := strings.TrimSpace(config.APIKeyEnv); trimmed != "" {
			names[trimmed] = struct{}{}
		}
	}
	keys := make([]string, 0, len(names))
	for key := range names {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}

func FilterEnvVarsForConfig(envVars map[string]string, configs AllConfigs) map[string]string {
	filtered := map[string]string{}
	for _, key := range CollectAPIKeyNames(configs) {
		if value, ok := envVars[key]; ok {
			filtered[key] = value
		}
	}
	return filtered
}

func ResolveRuntimeAPIKeys(configs AllConfigs, managedEnv map[string]string, processEnv map[string]string) map[string]string {
	merged := map[string]string{}
	for key, value := range FilterEnvVarsForConfig(processEnv, configs) {
		merged[key] = value
	}
	for key, value := range FilterEnvVarsForConfig(managedEnv, configs) {
		merged[key] = value
	}
	return merged
}

func (c AllConfigs) normalized() (AllConfigs, error) {
	normalized := AllConfigs{
		Configs:             map[string]Config{},
		MCPServers:          map[string]ServerConfig{},
		DefaultMCPServerIDs: normalizeServerIDs(c.DefaultMCPServerIDs),
		DefaultConfigID:     strings.TrimSpace(c.DefaultConfigID),
		CodexMCPImportedAt:  strings.TrimSpace(c.CodexMCPImportedAt),
	}
	for serverID, server := range c.MCPServers {
		normalizedID := strings.TrimSpace(serverID)
		if normalizedID == "" {
			return AllConfigs{}, fmt.Errorf("llm config server id is required")
		}
		if strings.Contains(normalizedID, ToolNameSeparator) {
			return AllConfigs{}, fmt.Errorf("%w: %s", ErrServerIDInvalid, normalizedID)
		}
		normalizedServer, err := normalizeServerConfig(normalizedID, server)
		if err != nil {
			return AllConfigs{}, err
		}
		normalized.MCPServers[normalizedID] = normalizedServer
	}
	for configID, config := range c.Configs {
		normalizedConfig, err := normalizeConfig(configID, config)
		if err != nil {
			return AllConfigs{}, err
		}
		normalized.Configs[normalizedConfig.ID] = normalizedConfig
	}
	if err := validateServerIDs(normalized.DefaultMCPServerIDs, normalized.MCPServers, "defaultMcpServerIds"); err != nil {
		return AllConfigs{}, err
	}
	for _, config := range normalized.Configs {
		if config.MCPServerIDs == nil {
			continue
		}
		if err := validateServerIDs(config.MCPServerIDs, normalized.MCPServers, fmt.Sprintf("LLM config %q mcpServerIds", config.ID)); err != nil {
			return AllConfigs{}, err
		}
	}
	if normalized.DefaultConfigID != "" {
		if _, ok := normalized.Configs[normalized.DefaultConfigID]; !ok {
			normalized.DefaultConfigID = ""
		}
	}
	return normalized, nil
}

func defaultConfigs(opts LoadOptions) AllConfigs {
	configs := map[string]Config{
		"claude-sonnet": {
			ID:        "claude-sonnet",
			Model:     "claude-sonnet-4-5-20250929",
			Provider:  "anthropic",
			APIKeyEnv: "ANTHROPIC_API_KEY",
		},
		"openai-whisper-1": {
			ID:        "openai-whisper-1",
			Model:     "whisper-1",
			Provider:  "openai",
			APIKeyEnv: "OPENAI_API_KEY",
		},
	}
	servers := map[string]ServerConfig{}
	if strings.TrimSpace(opts.SettaServerURL) != "" {
		servers[DefaultServerID] = ServerConfig{
			Transport: TransportSSE,
			URL:       strings.TrimSpace(opts.SettaServerURL),
		}
	}
	return AllConfigs{
		Configs:         configs,
		MCPServers:      servers,
		DefaultConfigID: "claude-sonnet",
	}
}

func isEmptyPayload(payload persistedFile) bool {
	return len(payload.Configs) == 0 &&
		len(payload.MCPServers) == 0 &&
		len(payload.DefaultMCPServerIDs) == 0 &&
		payload.DefaultConfigID == "" &&
		payload.CodexMCPImportedAt == ""
}

func decodePersistedConfig(raw json.RawMessage) (persistedConfig, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var entry persistedConfig
	if err := decoder.Decode(&entry); err != nil {
		return persistedConfig{}, err
	}
	return entry, nil
}

func decodeServerConfig(raw json.RawMessage) (ServerConfig, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var entry ServerConfig
	if err := decoder.Decode(&entry); err != nil {
		return ServerConfig{}, err
	}
	return entry, nil
}

func idPresent(raw json.RawMessage) bool {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(raw, &payload); err != nil {
		return false
	}
	_, ok := payload["id"]
	return ok
}

func normalizeConfig(configID string, raw Config) (Config, error) {
	normalizedID := strings.TrimSpace(configID)
	if normalizedID == "" {
		return Config{}, fmt.Errorf("llm config id is required")
	}
	model := strings.TrimSpace(raw.Model)
	if model == "" {
		return Config{}, fmt.Errorf("llm config %q model is required", normalizedID)
	}
	normalized := Config{
		ID:           normalizedID,
		Model:        model,
		Provider:     strings.TrimSpace(raw.Provider),
		BaseURL:      strings.TrimSpace(raw.BaseURL),
		APIKeyEnv:    strings.TrimSpace(raw.APIKeyEnv),
		OtherParams:  cloneAnyMap(raw.OtherParams),
		MCPServerIDs: normalizeServerIDsPreserveNil(raw.MCPServerIDs),
		Temporary:    raw.Temporary,
	}
	return normalized, nil
}

func normalizeServerConfig(serverID string, raw ServerConfig) (ServerConfig, error) {
	normalized := ServerConfig{
		Transport:            Transport(strings.ToLower(strings.TrimSpace(string(raw.Transport)))),
		URL:                  strings.TrimSpace(raw.URL),
		Command:              strings.TrimSpace(raw.Command),
		Args:                 cloneStringSlice(raw.Args),
		Env:                  cloneStringMap(raw.Env),
		HTTPHeaders:          cloneStringMap(raw.HTTPHeaders),
		CWD:                  strings.TrimSpace(raw.CWD),
		Encoding:             strings.ToLower(strings.TrimSpace(raw.Encoding)),
		EncodingErrorHandler: strings.ToLower(strings.TrimSpace(raw.EncodingErrorHandler)),
	}
	if normalized.Encoding == "" {
		normalized.Encoding = "utf-8"
	}
	if normalized.EncodingErrorHandler == "" {
		normalized.EncodingErrorHandler = "strict"
	}
	switch normalized.Transport {
	case "":
		return ServerConfig{}, fmt.Errorf("%w for server %q", ErrTransportRequired, serverID)
	case TransportSSE, TransportStreamableHTTP:
		if normalized.URL == "" {
			return ServerConfig{}, fmt.Errorf("%w for server %q", ErrServerURLRequired, serverID)
		}
		if normalized.Command != "" {
			return ServerConfig{}, fmt.Errorf("llm config HTTP transport cannot declare command for server %q", serverID)
		}
	case TransportStdio:
		if normalized.Command == "" {
			return ServerConfig{}, fmt.Errorf("%w for server %q", ErrServerCommandRequired, serverID)
		}
		if normalized.URL != "" {
			return ServerConfig{}, fmt.Errorf("llm config stdio transport cannot declare url for server %q", serverID)
		}
		if len(normalized.HTTPHeaders) > 0 {
			return ServerConfig{}, fmt.Errorf("%w for server %q", ErrServerHTTPHeadersInvalid, serverID)
		}
		if normalized.Encoding != "utf-8" || normalized.EncodingErrorHandler != "strict" {
			return ServerConfig{}, fmt.Errorf("%w for server %q", ErrServerEncodingUnsupported, serverID)
		}
	default:
		return ServerConfig{}, fmt.Errorf("%w: %q", ErrTransportInvalid, raw.Transport)
	}
	return normalized, nil
}

func ensureSettaServerURL(servers map[string]ServerConfig, settaServerURL string) map[string]ServerConfig {
	cloned := cloneServerConfigs(servers)
	if settaServerURL == "" {
		return cloned
	}
	server, ok := cloned[DefaultServerID]
	if !ok {
		return cloned
	}
	if server.Transport != TransportSSE && server.Transport != TransportStreamableHTTP {
		return cloned
	}
	server.URL = settaServerURL
	cloned[DefaultServerID] = server
	return cloned
}

func validateServerIDs(serverIDs []string, servers map[string]ServerConfig, label string) error {
	seen := map[string]struct{}{}
	for _, rawID := range serverIDs {
		serverID := strings.TrimSpace(rawID)
		if serverID == "" {
			return fmt.Errorf("%s includes an empty server id", label)
		}
		if _, ok := seen[serverID]; ok {
			return fmt.Errorf("%s includes duplicate server id %q", label, serverID)
		}
		seen[serverID] = struct{}{}
		if _, ok := servers[serverID]; !ok {
			return fmt.Errorf("%s references unknown MCP server %q", label, serverID)
		}
	}
	return nil
}

func normalizeServerIDs(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, trimmed)
	}
	return normalized
}

func normalizeServerIDsPreserveNil(values []string) []string {
	if values == nil {
		return nil
	}
	return normalizeServerIDs(values)
}

func cloneAllConfigs(configs AllConfigs) AllConfigs {
	cloned := AllConfigs{
		Configs:             map[string]Config{},
		MCPServers:          cloneServerConfigs(configs.MCPServers),
		DefaultMCPServerIDs: cloneStringSlice(configs.DefaultMCPServerIDs),
		DefaultConfigID:     configs.DefaultConfigID,
		CodexMCPImportedAt:  configs.CodexMCPImportedAt,
	}
	for configID, config := range configs.Configs {
		cloned.Configs[configID] = cloneConfig(config)
	}
	return cloned
}

func cloneConfig(config Config) Config {
	cloned := config
	cloned.OtherParams = cloneAnyMap(config.OtherParams)
	cloned.MCPServerIDs = cloneStringSlicePreserveNil(config.MCPServerIDs)
	return cloned
}

func cloneServerConfigs(servers map[string]ServerConfig) map[string]ServerConfig {
	if servers == nil {
		return map[string]ServerConfig{}
	}
	cloned := make(map[string]ServerConfig, len(servers))
	for serverID, server := range servers {
		cloned[serverID] = ServerConfig{
			Transport:            server.Transport,
			URL:                  server.URL,
			Command:              server.Command,
			Args:                 cloneStringSlice(server.Args),
			Env:                  cloneStringMap(server.Env),
			HTTPHeaders:          cloneStringMap(server.HTTPHeaders),
			CWD:                  server.CWD,
			Encoding:             server.Encoding,
			EncodingErrorHandler: server.EncodingErrorHandler,
		}
	}
	return cloned
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func cloneStringMap(input map[string]string) map[string]string {
	if input == nil {
		return nil
	}
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func cloneStringSlice(input []string) []string {
	if len(input) == 0 {
		return []string{}
	}
	return append([]string(nil), input...)
}

func cloneStringSlicePreserveNil(input []string) []string {
	if input == nil {
		return nil
	}
	return cloneStringSlice(input)
}
