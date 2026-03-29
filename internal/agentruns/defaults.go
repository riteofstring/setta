package agentruns

import (
	"errors"
	"fmt"
	"os"
)

func SeedDefaultEngineConfigsIfMissing(store *EngineStore) error {
	if store == nil {
		return ErrRootRequired
	}
	path := store.Path()
	if path == "" {
		return ErrRootRequired
	}
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("stat engine configs: %w", err)
	}
	return store.Write(defaultEngineConfigs())
}

func defaultEngineConfigs() []EngineConfig {
	thinking := true
	settaLLMID := "claude-sonnet"
	claudeCodeID := "external-claude-code"
	codexID := "external-codex"
	openCodeID := "external-opencode"
	return []EngineConfig{
		{
			ID:               "engine-setta-claude-sonnet",
			Name:             "Setta LLM (Claude Sonnet 4.5)",
			EngineType:       EngineTypeSettaLLM,
			SettaLLMConfigID: &settaLLMID,
			Defaults: EngineConfigDefaults{
				Thinking: &thinking,
			},
		},
		{
			ID:                    "engine-claude-code",
			Name:                  "Claude Code (SDK)",
			EngineType:            EngineTypeExternalAgent,
			ExternalAgentConfigID: &claudeCodeID,
		},
		{
			ID:                    "engine-codex",
			Name:                  "Codex (app-server)",
			EngineType:            EngineTypeExternalAgent,
			ExternalAgentConfigID: &codexID,
		},
		{
			ID:                    "engine-opencode",
			Name:                  "OpenCode (SDK)",
			EngineType:            EngineTypeExternalAgent,
			ExternalAgentConfigID: &openCodeID,
		},
	}
}
