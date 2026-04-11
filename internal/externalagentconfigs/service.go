package externalagentconfigs

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	toml "github.com/pelletier/go-toml/v2"
	"setta/internal/statefs"
)

const (
	serviceSettingsRootName = "external_agent_settings"
	codexConfigFileName     = "config.toml"
)

var (
	ErrInvalidConfig = errors.New("invalid external agent config")
)

type ServiceOptions struct {
	Configs        *Store
	SettaFilesRoot string
	WorkspaceRoot  string
	SettaServerURL string
}

type Service struct {
	configs        *Store
	settaFilesRoot string
	workspaceRoot  string
	settaServerURL string
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.Configs == nil {
		return nil, fmt.Errorf("external agent config store is required")
	}
	filesRoot, err := statefs.NormalizePath(options.SettaFilesRoot, "")
	if err != nil {
		if strings.TrimSpace(options.SettaFilesRoot) == "" {
			return nil, ErrRootRequired
		}
		return nil, err
	}
	workspaceRoot := ""
	if strings.TrimSpace(options.WorkspaceRoot) != "" {
		workspaceRoot, err = statefs.NormalizePath(options.WorkspaceRoot, "")
		if err != nil {
			return nil, err
		}
	}
	return &Service{
		configs:        options.Configs,
		settaFilesRoot: filesRoot,
		workspaceRoot:  workspaceRoot,
		settaServerURL: strings.TrimSpace(options.SettaServerURL),
	}, nil
}

func (s *Service) List() ([]Config, error) {
	if err := s.requireConfigured(); err != nil {
		return nil, err
	}
	return s.configs.List()
}

func (s *Service) Get(configID string) (Config, error) {
	if err := s.requireConfigured(); err != nil {
		return Config{}, err
	}
	return s.configs.Get(configID)
}

func (s *Service) ReconcileManagedCanonicalConfigs() error {
	if err := s.requireConfigured(); err != nil {
		return err
	}
	configs, err := s.configs.List()
	if err != nil {
		return err
	}
	for _, config := range configs {
		if config.SettingsMode == SettingsModeExplicitPath {
			continue
		}
		switch config.ToolType {
		case ToolTypeCodex:
			if err := s.writeCodexConfig(s.codexConfigPath(config.ID), config); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Service) Create(config Config) (Config, error) {
	if err := s.requireConfigured(); err != nil {
		return Config{}, err
	}
	normalized, err := s.prepareForMutation(config)
	if err != nil {
		return Config{}, err
	}
	existing, err := s.configs.List()
	if err != nil {
		return Config{}, err
	}

	cleanup, err := s.syncCanonicalArtifacts(normalized)
	if err != nil {
		return Config{}, err
	}
	defer func() {
		if cleanup != nil {
			cleanup()
		}
	}()

	existing = append(existing, normalized)
	if err := s.configs.Write(existing); err != nil {
		return Config{}, err
	}
	cleanup = nil
	return cloneConfig(normalized), nil
}

func (s *Service) Update(config Config) (Config, error) {
	if err := s.requireConfigured(); err != nil {
		return Config{}, err
	}
	normalized, err := s.prepareForMutation(config)
	if err != nil {
		return Config{}, err
	}
	existing, err := s.configs.List()
	if err != nil {
		return Config{}, err
	}
	for index := range existing {
		entry := existing[index]
		if entry.ID != normalized.ID {
			continue
		}

		cleanup, syncErr := s.syncCanonicalArtifacts(normalized)
		if syncErr != nil {
			return Config{}, syncErr
		}
		defer func() {
			if cleanup != nil {
				cleanup()
			}
		}()

		existing[index] = normalized
		if err := s.configs.Write(existing); err != nil {
			return Config{}, err
		}
		cleanup = nil
		s.reconcileCanonicalArtifacts(normalized.ID, normalized)
		return cloneConfig(normalized), nil
	}
	return Config{}, fmt.Errorf("%w: %q", ErrConfigNotFound, normalized.ID)
}

func (s *Service) Delete(configID string) error {
	if err := s.requireConfigured(); err != nil {
		return err
	}
	trimmedID := strings.TrimSpace(configID)
	if trimmedID == "" {
		return fmt.Errorf("%w: config id is required", ErrConfigNotFound)
	}
	existing, err := s.configs.List()
	if err != nil {
		return err
	}
	for index, entry := range existing {
		if entry.ID != trimmedID {
			continue
		}
		existing = append(existing[:index], existing[index+1:]...)
		if err := s.configs.Write(existing); err != nil {
			return err
		}
		s.removeAllCanonicalArtifacts(trimmedID)
		return nil
	}
	return fmt.Errorf("%w: %q", ErrConfigNotFound, trimmedID)
}

func (s *Service) requireConfigured() error {
	if s == nil || s.configs == nil || strings.TrimSpace(s.settaFilesRoot) == "" {
		return fmt.Errorf("external agent config service is not configured")
	}
	return nil
}

func (s *Service) prepareForMutation(config Config) (Config, error) {
	normalized, err := normalizeMutationConfig(config)
	if err != nil {
		return Config{}, err
	}
	if normalized.ToolType == ToolTypeCodex {
		if normalized.ApprovalPolicy == nil {
			approvalPolicy := "on-failure"
			normalized.ApprovalPolicy = &approvalPolicy
		}
		if normalized.SandboxPolicy == nil {
			sandboxPolicy := "workspace-write"
			normalized.SandboxPolicy = &sandboxPolicy
		}
	}
	if normalized.SettingsManagedBlock == nil {
		switch normalized.ToolType {
		case ToolTypeClaudeCode:
			normalized.SettingsManagedBlock = buildDefaultClaudeSettingsBlock()
		}
	}
	return normalized, nil
}

func normalizeMutationConfig(config Config) (Config, error) {
	normalized := cloneConfig(config)
	trimOptionalStringPointer(&normalized.CommandPath)
	trimOptionalStringPointer(&normalized.BaseURL)
	trimOptionalStringPointer(&normalized.DefaultModel)
	trimOptionalStringPointer(&normalized.SandboxPolicy)
	trimOptionalStringPointer(&normalized.ApprovalPolicy)
	trimOptionalStringPointer(&normalized.SettingsFilePath)
	trimOptionalStringPointer(&normalized.WorkingDir)
	normalized.EnvVarWhitelist = normalizeStringList(normalized.EnvVarWhitelist)

	normalizedConfig, err := normalizeConfig(normalized, 0)
	if err != nil {
		return Config{}, fmt.Errorf("%w: %s", ErrInvalidConfig, err.Error())
	}
	return normalizedConfig, nil
}

func trimOptionalStringPointer(value **string) {
	if value == nil || *value == nil {
		return
	}
	trimmed := strings.TrimSpace(**value)
	if trimmed == "" {
		*value = nil
		return
	}
	*value = &trimmed
}

func normalizeStringList(values []string) []string {
	if values == nil {
		return []string{}
	}
	seen := map[string]struct{}{}
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	slices.Sort(normalized)
	return normalized
}

func envWhitelistContains(whitelist []string, target string) bool {
	trimmedTarget := strings.TrimSpace(target)
	if trimmedTarget == "" {
		return false
	}
	for _, value := range whitelist {
		if strings.EqualFold(strings.TrimSpace(value), trimmedTarget) {
			return true
		}
	}
	return false
}

func buildDefaultClaudeSettingsBlock() *SettingsManagedBlock {
	return &SettingsManagedBlock{
		Claude: &ClaudeSettingsManaged{
			Permissions: &ClaudeSettingsPermissions{
				Allow: append([]string(nil), defaultClaudeAllowRules...),
				Ask:   append([]string(nil), defaultClaudeAskRules...),
				Deny:  []string{},
			},
		},
	}
}

var defaultClaudeAllowRules = []string{
	"mcp__setta__*",
}

var defaultClaudeAskRules = []string{
	"Bash(rm:*)",
	"Bash(sudo:*)",
	"Bash(chmod:*)",
	"Bash(chown:*)",
	"Bash(git push:*)",
	"Bash(git reset:*)",
	"Bash(git clean:*)",
	"Bash(dd:*)",
	"Bash(mkfs:*)",
	"Bash(diskutil:*)",
	"Bash(shutdown:*)",
	"Bash(reboot:*)",
}

func (s *Service) syncCanonicalArtifacts(config Config) (func(), error) {
	switch {
	case config.ToolType == ToolTypeCodex && config.SettingsMode != SettingsModeExplicitPath:
		path := s.codexConfigPath(config.ID)
		snapshot, err := snapshotFile(path)
		if err != nil {
			return nil, err
		}
		if err := s.writeCodexConfig(path, config); err != nil {
			return nil, err
		}
		return func() { restoreFileSnapshot(path, snapshot) }, nil
	case config.ToolType == ToolTypeClaudeCode:
		path := ResolveClaudeSettingsPath(config, s.workspaceRoot)
		if path == "" {
			return nil, nil
		}
		snapshot, err := snapshotFile(path)
		if err != nil {
			return nil, err
		}
		if err := PrepareClaudeSettings(s.workspaceRoot, config); err != nil {
			return nil, err
		}
		return func() { restoreFileSnapshot(path, snapshot) }, nil
	default:
		return nil, nil
	}
}

func (s *Service) reconcileCanonicalArtifacts(configID string, config Config) {
	if config.ToolType != ToolTypeCodex || config.SettingsMode == SettingsModeExplicitPath {
		_ = os.RemoveAll(filepath.Dir(s.codexConfigPath(configID)))
	}
}

func (s *Service) removeAllCanonicalArtifacts(configID string) {
	_ = os.RemoveAll(filepath.Dir(s.codexConfigPath(configID)))
}

func (s *Service) codexConfigPath(configID string) string {
	return filepath.Join(s.settaFilesRoot, serviceSettingsRootName, "codex", configID, codexConfigFileName)
}

func (s *Service) writeCodexConfig(path string, config Config) error {
	payload, err := prepareCodexPayload(path, config)
	if err != nil {
		return err
	}
	applyOptionalCodexStringOverride(payload, "model", config.DefaultModel)
	applyOptionalCodexStringOverride(payload, "approval_policy", config.ApprovalPolicy)
	applyOptionalCodexStringOverride(payload, "sandbox_mode", config.SandboxPolicy)
	applyCodexOpenAIAuthDefaults(payload, config.EnvVarWhitelist)
	ensureCodexReasoningSummary(payload)
	payload["mcp_servers"] = ensureSettaCodexMCPServers(payload["mcp_servers"], s.settaServerURL)
	return writeCodexTOMLPayload(path, payload)
}

func prepareCodexPayload(path string, config Config) (map[string]any, error) {
	payload, err := loadCodexTOMLPayload(resolveCodexBaseConfigPath(path, config))
	if err != nil {
		return nil, err
	}
	mergeManagedCodexPayload(payload, config.SettingsManagedBlock)
	if err := validateCodexPayloadForWrite(payload); err != nil {
		return nil, err
	}
	bootstrapCodexMCPServersFromUserConfig(payload, config)
	if err := validateCodexPayloadForWrite(payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func mergeManagedCodexPayload(payload map[string]any, block *SettingsManagedBlock) {
	if block == nil || block.Codex == nil {
		return
	}
	for key, value := range block.Codex {
		payload[key] = cloneJSONValue(value)
	}
}

func validateCodexPayloadForWrite(payload map[string]any) error {
	if err := validateCodexMCPServersPayload(payload); err != nil {
		return fmt.Errorf("decode codex base config: %w", err)
	}
	return nil
}

func applyOptionalCodexStringOverride(payload map[string]any, key string, value *string) {
	if trimmed := derefOptionalString(value); trimmed != "" {
		payload[key] = trimmed
	}
}

func applyCodexOpenAIAuthDefaults(payload map[string]any, whitelist []string) {
	if !envWhitelistContains(whitelist, "OPENAI_API_KEY") {
		return
	}
	payload["forced_login_method"] = "api"
	payload["preferred_auth_method"] = "apikey"
	payload["cli_auth_credentials_store"] = "file"
	payload["features"] = map[string]any{
		"remote_models":     false,
		"remote_compaction": false,
	}
}

func ensureCodexReasoningSummary(payload map[string]any) {
	if _, ok := payload["model_reasoning_summary"]; ok {
		return
	}
	payload["model_reasoning_summary"] = "none"
}

func ensureSettaCodexMCPServers(rawServers any, settaServerURL string) map[string]any {
	mcpServers, _ := rawServers.(map[string]any)
	if mcpServers == nil {
		mcpServers = map[string]any{}
	}
	serverEntry, _ := mcpServers["setta"].(map[string]any)
	mcpServers["setta"] = NormalizeSettaCodexMCPServerEntry(serverEntry, settaServerURL)
	return mcpServers
}

func writeCodexTOMLPayload(path string, payload map[string]any) error {
	content, err := toml.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode codex canonical config: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create codex canonical config dir: %w", err)
	}
	if err := statefs.AtomicWriteFile(path, content, defaultFileMode); err != nil {
		return fmt.Errorf("write codex canonical config: %w", err)
	}
	return nil
}

type fileSnapshot struct {
	existed bool
	content []byte
}

func snapshotFile(path string) (fileSnapshot, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fileSnapshot{existed: false}, nil
		}
		return fileSnapshot{}, fmt.Errorf("snapshot canonical config: %w", err)
	}
	return fileSnapshot{
		existed: true,
		content: append([]byte(nil), content...),
	}, nil
}

func restoreFileSnapshot(path string, snapshot fileSnapshot) {
	if !snapshot.existed {
		_ = os.Remove(path)
		return
	}
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	_ = statefs.AtomicWriteFile(path, snapshot.content, defaultFileMode)
}

type serviceError struct {
	cause   error
	message string
}

func (e *serviceError) Error() string {
	if e == nil {
		return ""
	}
	return e.message
}

func (e *serviceError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.cause
}

func newServiceError(cause error, message string) error {
	return &serviceError{
		cause:   cause,
		message: message,
	}
}
