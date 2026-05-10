package mcpx

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Transport string

const (
	TransportStreamableHTTP Transport = "streamable_http"
	TransportStdio          Transport = "stdio"
)

type RuntimeState string

const (
	RuntimeStateConnected  RuntimeState = "connected"
	RuntimeStateConnecting RuntimeState = "connecting"
	RuntimeStateRetrying   RuntimeState = "retrying"
	RuntimeStateError      RuntimeState = "error"
	RuntimeStateDisabled   RuntimeState = "disabled"
	RuntimeStateUnknown    RuntimeState = "unknown"
)

type ServerRuntimeStatus struct {
	ServerID            string       `json:"serverId"`
	Source              string       `json:"source"`
	Transport           Transport    `json:"transport"`
	Endpoint            string       `json:"endpoint"`
	State               RuntimeState `json:"state"`
	LastAttemptAt       *time.Time   `json:"lastAttemptAt"`
	LastConnectedAt     *time.Time   `json:"lastConnectedAt"`
	LastFailureAt       *time.Time   `json:"lastFailureAt"`
	ConsecutiveFailures int          `json:"consecutiveFailures"`
	LastError           *string      `json:"lastError"`
	MissingEnvVar       *string      `json:"missingEnvVar"`
	ToolCount           int          `json:"toolCount"`
}

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

type LoadServerConfigsOptions struct {
	SettaServerURL string
}

type llmConfigFile struct {
	Configs         map[string]json.RawMessage `json:"configs"`
	DefaultConfigID *string                    `json:"default_config_id"`
	MCPServers      map[string]ServerConfig    `json:"mcpServers"`
}

var (
	ErrTransportRequired         = errors.New("mcpx: transport is required")
	ErrTransportInvalid          = errors.New("mcpx: transport is invalid")
	ErrServerIDInvalid           = errors.New("mcpx: server id cannot include '__'")
	ErrServerURLRequired         = errors.New("mcpx: HTTP transport requires url")
	ErrServerCommandRequired     = errors.New("mcpx: stdio transport requires command")
	ErrServerHTTPHeadersInvalid  = errors.New("mcpx: stdio transport cannot declare http_headers")
	ErrServerEncodingUnsupported = errors.New("mcpx: stdio transport only supports utf-8 strict encoding")
)

func LoadServerConfigs(path string, opts LoadServerConfigsOptions) (map[string]ServerConfig, error) {
	data, err := os.ReadFile(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return defaultServerConfigs(opts), nil
	case err != nil:
		return nil, fmt.Errorf("mcpx: read %s: %w", path, err)
	}

	if len(bytes.TrimSpace(data)) == 0 {
		return defaultServerConfigs(opts), nil
	}

	var payload llmConfigFile
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, fmt.Errorf("mcpx: decode %s: %w", path, err)
	}

	if isEmptyLLMConfigPayload(payload) {
		return defaultServerConfigs(opts), nil
	}

	return normalizeServerConfigs(payload.MCPServers, opts)
}

func BuildSettaServerURL(host string, port int) string {
	trimmedHost := strings.TrimSpace(host)
	if trimmedHost == "" || port <= 0 {
		return ""
	}
	switch trimmedHost {
	case "0.0.0.0":
		trimmedHost = "127.0.0.1"
	case "::":
		trimmedHost = "::1"
	}
	return "http://" + net.JoinHostPort(trimmedHost, strconv.Itoa(port)) + "/mcp"
}

func LLMConfigPath(settaFilesRoot string) string {
	return filepath.Join(settaFilesRoot, "llm_config.json")
}

func defaultServerConfigs(opts LoadServerConfigsOptions) map[string]ServerConfig {
	if strings.TrimSpace(opts.SettaServerURL) == "" {
		return map[string]ServerConfig{}
	}
	return map[string]ServerConfig{
		DefaultServerID: {
			Transport: TransportStreamableHTTP,
			URL:       strings.TrimSpace(opts.SettaServerURL),
		},
	}
}

func isEmptyLLMConfigPayload(payload llmConfigFile) bool {
	return len(payload.Configs) == 0 &&
		payload.DefaultConfigID == nil &&
		len(payload.MCPServers) == 0
}

func normalizeServerConfigs(raw map[string]ServerConfig, opts LoadServerConfigsOptions) (map[string]ServerConfig, error) {
	normalized := make(map[string]ServerConfig, len(raw))
	for serverID, config := range raw {
		if strings.Contains(strings.TrimSpace(serverID), ToolNameSeparator) {
			return nil, fmt.Errorf("%w: %s", ErrServerIDInvalid, serverID)
		}
		resolved, err := config.normalize(serverID)
		if err != nil {
			return nil, err
		}
		if serverID == DefaultServerID &&
			strings.TrimSpace(opts.SettaServerURL) != "" &&
			resolved.Transport == TransportStreamableHTTP {
			resolved.URL = strings.TrimSpace(opts.SettaServerURL)
		}
		normalized[serverID] = resolved
	}
	return normalized, nil
}

func (c ServerConfig) normalize(serverID string) (ServerConfig, error) {
	normalized := c.trimmedCopy()
	normalized.applyEncodingDefaults()
	if err := validateServerTransport(serverID, normalized, c.Transport); err != nil {
		return ServerConfig{}, err
	}
	return normalized, nil
}

func (c ServerConfig) trimmedCopy() ServerConfig {
	return ServerConfig{
		Transport:            Transport(strings.ToLower(strings.TrimSpace(string(c.Transport)))),
		URL:                  strings.TrimSpace(c.URL),
		Command:              strings.TrimSpace(c.Command),
		Args:                 append([]string(nil), c.Args...),
		Env:                  cloneStringMap(c.Env),
		HTTPHeaders:          cloneStringMap(c.HTTPHeaders),
		CWD:                  strings.TrimSpace(c.CWD),
		Encoding:             strings.ToLower(strings.TrimSpace(c.Encoding)),
		EncodingErrorHandler: strings.ToLower(strings.TrimSpace(c.EncodingErrorHandler)),
	}
}

func (c *ServerConfig) applyEncodingDefaults() {
	if c.Encoding == "" {
		c.Encoding = "utf-8"
	}
	if c.EncodingErrorHandler == "" {
		c.EncodingErrorHandler = "strict"
	}
}

func validateServerTransport(serverID string, config ServerConfig, rawTransport Transport) error {
	switch config.Transport {
	case "":
		return fmt.Errorf("%w for server %q", ErrTransportRequired, serverID)
	case TransportStreamableHTTP:
		return validateHTTPServerConfig(serverID, config)
	case TransportStdio:
		return validateStdioServerConfig(serverID, config)
	default:
		return fmt.Errorf("%w: %q", ErrTransportInvalid, rawTransport)
	}
}

func validateHTTPServerConfig(serverID string, config ServerConfig) error {
	if config.URL == "" {
		return fmt.Errorf("%w for server %q", ErrServerURLRequired, serverID)
	}
	if config.Command != "" {
		return fmt.Errorf("mcpx: HTTP transport cannot declare command for server %q", serverID)
	}
	return nil
}

func validateStdioServerConfig(serverID string, config ServerConfig) error {
	if config.Command == "" {
		return fmt.Errorf("%w for server %q", ErrServerCommandRequired, serverID)
	}
	if config.URL != "" {
		return fmt.Errorf("mcpx: stdio transport cannot declare url for server %q", serverID)
	}
	if len(config.HTTPHeaders) > 0 {
		return fmt.Errorf("%w for server %q", ErrServerHTTPHeadersInvalid, serverID)
	}
	if config.usesUnsupportedEncoding() {
		return fmt.Errorf("%w for server %q", ErrServerEncodingUnsupported, serverID)
	}
	return nil
}

func (c ServerConfig) usesUnsupportedEncoding() bool {
	return c.Encoding != "utf-8" || c.EncodingErrorHandler != "strict"
}

func cloneRuntimeStatus(status ServerRuntimeStatus) ServerRuntimeStatus {
	return ServerRuntimeStatus{
		ServerID:            status.ServerID,
		Source:              status.Source,
		Transport:           status.Transport,
		Endpoint:            status.Endpoint,
		State:               status.State,
		LastAttemptAt:       cloneTimePtr(status.LastAttemptAt),
		LastConnectedAt:     cloneTimePtr(status.LastConnectedAt),
		LastFailureAt:       cloneTimePtr(status.LastFailureAt),
		ConsecutiveFailures: status.ConsecutiveFailures,
		LastError:           cloneStringPtr(status.LastError),
		MissingEnvVar:       cloneStringPtr(status.MissingEnvVar),
		ToolCount:           status.ToolCount,
	}
}

func cloneStringMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	cloned := make(map[string]string, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func cloneStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneTimePtr(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
