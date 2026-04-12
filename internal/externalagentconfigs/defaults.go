package externalagentconfigs

import (
	"errors"
	"fmt"
	"os"
)

func (s *Service) SeedDefaultConfigsIfMissing() error {
	if err := s.requireConfigured(); err != nil {
		return err
	}
	path := s.configs.Path()
	if path == "" {
		return ErrRootRequired
	}
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("stat external agent configs: %w", err)
	}
	for _, config := range defaultConfigs() {
		if _, err := s.Create(config); err != nil {
			return err
		}
	}
	return nil
}

func defaultConfigs() []Config {
	claudeModel := "claude-sonnet-4-5-20250929"
	workspaceWrite := "workspace-write"
	onFailure := "on-failure"
	return []Config{
		{
			ID:                      "external-claude-code",
			Name:                    "Claude Code (SDK)",
			Description:             "Claude Code via Python SDK",
			ToolType:                ToolTypeClaudeCode,
			RunMode:                 RunModeSDK,
			DefaultModel:            &claudeModel,
			SettingsMode:            SettingsModeManagedLocal,
			SettingsSources:         DefaultClaudeSettingsSources(),
			SettingsAllowSettaEdits: true,
			SettingsManagedBlock:    buildDefaultClaudeSettingsBlock(),
			EnvVarWhitelist:         []string{"ANTHROPIC_API_KEY"},
			WorkingDirStrategy:      WorkingDirStrategyProjectRoot,
		},
		{
			ID:                      "external-codex",
			Name:                    "Codex (app-server)",
			Description:             "Codex via app-server",
			ToolType:                ToolTypeCodex,
			RunMode:                 RunModeAppServer,
			SandboxPolicy:           &workspaceWrite,
			ApprovalPolicy:          &onFailure,
			SettingsMode:            SettingsModeManagedLocal,
			SettingsAllowSettaEdits: true,
			EnvVarWhitelist:         []string{"OPENAI_API_KEY"},
			WorkingDirStrategy:      WorkingDirStrategyProjectRoot,
		},
	}
}
