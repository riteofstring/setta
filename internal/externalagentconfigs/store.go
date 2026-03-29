package externalagentconfigs

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"setta/internal/statefs"
)

const (
	FileName        = "external_agents.json"
	defaultFileMode = 0o644
)

var (
	ErrRootRequired      = errors.New("external agent configs root is required")
	ErrConfigNotFound    = errors.New("external agent config not found")
	ErrCheckerRequired   = errors.New("external agent preflight checker is required")
	ErrWorkspaceRequired = errors.New("external agent workspace root is required")
)

type ToolType string

const (
	ToolTypeClaudeCode ToolType = "claude_code"
	ToolTypeCodex      ToolType = "codex"
	ToolTypeOpenCode   ToolType = "opencode"
)

type RunMode string

const (
	RunModeMCP       RunMode = "mcp"
	RunModeServer    RunMode = "server"
	RunModeSDK       RunMode = "sdk"
	RunModeAppServer RunMode = "app_server"
)

type WorkingDirStrategy string

const (
	WorkingDirStrategyProjectRoot WorkingDirStrategy = "project_root"
	WorkingDirStrategyTempDir     WorkingDirStrategy = "temp_dir"
	WorkingDirStrategyCustom      WorkingDirStrategy = "custom"
)

type SettingsMode string

const (
	SettingsModeReadOnly       SettingsMode = "read_only"
	SettingsModeManagedLocal   SettingsMode = "managed_local"
	SettingsModeManagedProject SettingsMode = "managed_project"
	SettingsModeExplicitPath   SettingsMode = "explicit_path"
)

type SettingsManagedBlock struct {
	Claude   *ClaudeSettingsManaged   `json:"claude,omitempty"`
	Codex    map[string]any           `json:"codex,omitempty"`
	OpenCode *OpenCodeSettingsManaged `json:"opencode,omitempty"`
}

type Config struct {
	ID                      string                 `json:"id"`
	Name                    string                 `json:"name"`
	Description             string                 `json:"description"`
	ToolType                ToolType               `json:"toolType"`
	RunMode                 RunMode                `json:"runMode"`
	CommandPath             *string                `json:"commandPath,omitempty"`
	BaseURL                 *string                `json:"baseUrl,omitempty"`
	DefaultModel            *string                `json:"defaultModel,omitempty"`
	SandboxPolicy           *string                `json:"sandboxPolicy,omitempty"`
	ApprovalPolicy          *string                `json:"approvalPolicy,omitempty"`
	SettingsMode            SettingsMode           `json:"settingsMode"`
	SettingsSources         []ClaudeSettingsSource `json:"settingsSources,omitempty"`
	SettingsFilePath        *string                `json:"settingsFilePath,omitempty"`
	SettingsManagedBlock    *SettingsManagedBlock  `json:"settingsManagedBlock,omitempty"`
	SettingsAllowSettaEdits bool                   `json:"settingsAllowSettaEdits"`
	EnvVarWhitelist         []string               `json:"envVarWhitelist"`
	WorkingDirStrategy      WorkingDirStrategy     `json:"workingDirStrategy"`
	WorkingDir              *string                `json:"workingDir,omitempty"`
	CodexSkipGitRepoCheck   *bool                  `json:"codexSkipGitRepoCheck,omitempty"`
}

type Store struct {
	root string
	path string
}

func NewStore(root string) (*Store, error) {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		if strings.TrimSpace(root) == "" {
			return nil, ErrRootRequired
		}
		return nil, err
	}
	return &Store{
		root: resolvedRoot,
		path: filepath.Join(resolvedRoot, FileName),
	}, nil
}

func (s *Store) Path() string {
	if s == nil {
		return ""
	}
	return s.path
}

func (s *Store) List() ([]Config, error) {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return nil, ErrRootRequired
	}

	content, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Config{}, nil
		}
		return nil, fmt.Errorf("read external agent configs: %w", err)
	}

	return decodeConfigs(content)
}

func (s *Store) Get(configID string) (Config, error) {
	if s == nil {
		return Config{}, ErrRootRequired
	}
	trimmedID := strings.TrimSpace(configID)
	if trimmedID == "" {
		return Config{}, fmt.Errorf("%w: config id is required", ErrConfigNotFound)
	}
	configs, err := s.List()
	if err != nil {
		return Config{}, err
	}
	for _, config := range configs {
		if config.ID == trimmedID {
			return cloneConfig(config), nil
		}
	}
	return Config{}, fmt.Errorf("%w: %q", ErrConfigNotFound, trimmedID)
}

func (s *Store) Write(configs []Config) error {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return ErrRootRequired
	}
	normalized := make([]Config, 0, len(configs))
	for index, config := range configs {
		entry, err := normalizeConfig(config, index)
		if err != nil {
			return err
		}
		normalized = append(normalized, entry)
	}
	content, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return fmt.Errorf("encode external agent configs: %w", err)
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(s.path, content, defaultFileMode); err != nil {
		return fmt.Errorf("write external agent configs: %w", err)
	}
	return nil
}

func decodeConfigs(content []byte) ([]Config, error) {
	trimmedContent := bytes.TrimSpace(content)
	if len(trimmedContent) == 0 {
		return []Config{}, nil
	}

	var payload any
	if err := json.Unmarshal(trimmedContent, &payload); err != nil {
		return nil, fmt.Errorf("decode external agent configs: %w", err)
	}
	if isEmptyJSONValue(payload) {
		return []Config{}, nil
	}
	rawConfigs, ok := payload.([]any)
	if !ok {
		return nil, fmt.Errorf("external agent configs file must contain a JSON array")
	}

	configs := make([]Config, 0, len(rawConfigs))
	for index, rawConfig := range rawConfigs {
		entryContent, err := json.Marshal(rawConfig)
		if err != nil {
			return nil, fmt.Errorf("encode external agent config %d: %w", index, err)
		}
		var config Config
		if err := json.Unmarshal(entryContent, &config); err != nil {
			return nil, fmt.Errorf("decode external agent config %d: %w", index, err)
		}
		normalized, err := normalizeConfig(config, index)
		if err != nil {
			return nil, err
		}
		configs = append(configs, normalized)
	}
	return configs, nil
}

func normalizeConfig(config Config, index int) (Config, error) {
	normalized := cloneConfig(config)
	normalized.ID = strings.TrimSpace(normalized.ID)
	normalized.Name = strings.TrimSpace(normalized.Name)
	normalized.Description = strings.TrimSpace(normalized.Description)
	normalized.ToolType = ToolType(strings.TrimSpace(string(normalized.ToolType)))
	normalized.RunMode = RunMode(strings.TrimSpace(string(normalized.RunMode)))
	normalized.SettingsMode = SettingsMode(strings.TrimSpace(string(normalized.SettingsMode)))
	normalized.WorkingDirStrategy = WorkingDirStrategy(strings.TrimSpace(string(normalized.WorkingDirStrategy)))

	if normalized.ID == "" {
		return Config{}, fmt.Errorf("external agent config %d id is required", index)
	}
	if normalized.Name == "" {
		return Config{}, fmt.Errorf("external agent config %d name is required", index)
	}
	switch normalized.ToolType {
	case ToolTypeClaudeCode, ToolTypeCodex, ToolTypeOpenCode:
	default:
		return Config{}, fmt.Errorf("external agent config %q toolType is invalid", normalized.ID)
	}
	switch normalized.RunMode {
	case RunModeMCP, RunModeServer, RunModeSDK, RunModeAppServer:
	default:
		return Config{}, fmt.Errorf("external agent config %q runMode is invalid", normalized.ID)
	}
	if normalized.SettingsMode == "" {
		normalized.SettingsMode = SettingsModeManagedLocal
	}
	if normalized.WorkingDirStrategy == "" {
		normalized.WorkingDirStrategy = WorkingDirStrategyProjectRoot
	}
	normalizedSettingsSources, err := normalizeClaudeSettingsSources(normalized.SettingsSources)
	if err != nil {
		return Config{}, fmt.Errorf("external agent config %q settingsSources is invalid: %w", normalized.ID, err)
	}
	normalized.SettingsSources = normalizedSettingsSources
	if normalized.EnvVarWhitelist == nil {
		normalized.EnvVarWhitelist = []string{}
	}
	if !config.SettingsAllowSettaEdits {
		normalized.SettingsAllowSettaEdits = false
	} else {
		normalized.SettingsAllowSettaEdits = true
	}
	return normalized, nil
}

func cloneConfig(config Config) Config {
	cloned := config
	cloned.CommandPath = cloneStringPtr(config.CommandPath)
	cloned.BaseURL = cloneStringPtr(config.BaseURL)
	cloned.DefaultModel = cloneStringPtr(config.DefaultModel)
	cloned.SandboxPolicy = cloneStringPtr(config.SandboxPolicy)
	cloned.ApprovalPolicy = cloneStringPtr(config.ApprovalPolicy)
	cloned.SettingsFilePath = cloneStringPtr(config.SettingsFilePath)
	cloned.SettingsManagedBlock = cloneSettingsManagedBlock(config.SettingsManagedBlock)
	cloned.WorkingDir = cloneStringPtr(config.WorkingDir)
	cloned.CodexSkipGitRepoCheck = cloneBoolPtr(config.CodexSkipGitRepoCheck)
	if config.SettingsSources != nil {
		cloned.SettingsSources = append([]ClaudeSettingsSource(nil), config.SettingsSources...)
	}
	if config.EnvVarWhitelist != nil {
		cloned.EnvVarWhitelist = append([]string(nil), config.EnvVarWhitelist...)
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

func cloneBoolPtr(value *bool) *bool {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneSettingsManagedBlock(value *SettingsManagedBlock) *SettingsManagedBlock {
	if value == nil {
		return nil
	}
	cloned := &SettingsManagedBlock{}
	if value.Claude != nil {
		cloned.Claude = &ClaudeSettingsManaged{
			DefaultMode: cloneStringPtr(value.Claude.DefaultMode),
			MCP:         cloneJSONMap(value.Claude.MCP),
		}
		if value.Claude.Permissions != nil {
			cloned.Claude.Permissions = &ClaudeSettingsPermissions{
				Allow: append([]string(nil), value.Claude.Permissions.Allow...),
				Ask:   append([]string(nil), value.Claude.Permissions.Ask...),
				Deny:  append([]string(nil), value.Claude.Permissions.Deny...),
			}
		}
	}
	if value.Codex != nil {
		cloned.Codex = cloneJSONMap(value.Codex)
	}
	if value.OpenCode != nil {
		cloned.OpenCode = &OpenCodeSettingsManaged{
			MCP:        cloneJSONMap(value.OpenCode.MCP),
			Model:      cloneStringPtr(value.OpenCode.Model),
			Permission: cloneJSONValue(value.OpenCode.Permission),
		}
	}
	return cloned
}

func cloneJSONMap(value map[string]any) map[string]any {
	if value == nil {
		return nil
	}
	cloned := make(map[string]any, len(value))
	for key, entry := range value {
		cloned[key] = cloneJSONValue(entry)
	}
	return cloned
}

func cloneJSONValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case map[string]any:
		return cloneJSONMap(typed)
	case []any:
		cloned := make([]any, 0, len(typed))
		for _, entry := range typed {
			cloned = append(cloned, cloneJSONValue(entry))
		}
		return cloned
	default:
		return typed
	}
}

func normalizeClaudeSettingsSources(
	values []ClaudeSettingsSource,
) ([]ClaudeSettingsSource, error) {
	if values == nil {
		return []ClaudeSettingsSource{}, nil
	}
	seen := map[ClaudeSettingsSource]struct{}{}
	normalized := make([]ClaudeSettingsSource, 0, len(values))
	for _, value := range values {
		trimmed := ClaudeSettingsSource(strings.TrimSpace(string(value)))
		if trimmed == "" {
			continue
		}
		switch trimmed {
		case ClaudeSettingsSourceUser, ClaudeSettingsSourceProject, ClaudeSettingsSourceLocal:
		default:
			return nil, fmt.Errorf("unsupported source %q", trimmed)
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	slices.SortFunc(normalized, func(a ClaudeSettingsSource, b ClaudeSettingsSource) int {
		return strings.Compare(string(a), string(b))
	})
	return normalized, nil
}

func isEmptyJSONValue(value any) bool {
	switch typed := value.(type) {
	case nil:
		return true
	case bool:
		return !typed
	case string:
		return typed == ""
	case []any:
		return len(typed) == 0
	case map[string]any:
		return len(typed) == 0
	case float64:
		return typed == 0
	default:
		return false
	}
}
