package agentprofiles

import (
	"errors"
	"fmt"
	"os"
)

func SeedDefaultProfilesIfMissing(store *Store) error {
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
		return fmt.Errorf("stat agent profiles: %w", err)
	}
	return store.Write(defaultProfiles())
}

func defaultProfiles() []Profile {
	engineSettaClaudeSonnet := "engine-setta-claude-sonnet"
	engineClaudeCode := "engine-claude-code"
	engineCodex := "engine-codex"
	return []Profile{
		{
			ID:             "agent-default",
			Name:           "Default (Setta LLM)",
			Description:    "Internal Setta LLM using Claude Sonnet 4.5",
			SystemPrompt:   "",
			EngineConfigID: &engineSettaClaudeSonnet,
			ToolAllowlist:  []string{},
		},
		{
			ID:             "agent-claude-code",
			Name:           "Claude Code",
			Description:    "External agent via Claude Code SDK",
			SystemPrompt:   "",
			EngineConfigID: &engineClaudeCode,
			ToolAllowlist:  []string{},
		},
		{
			ID:             "agent-codex",
			Name:           "Codex",
			Description:    "External agent via Codex app-server",
			SystemPrompt:   "",
			EngineConfigID: &engineCodex,
			ToolAllowlist:  []string{},
		},
	}
}
