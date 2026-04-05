package uisettings

import (
	"context"
)

type CountProviderFunc func(context.Context) (int, error)

type ProjectAISettingProviders struct {
	LLMAPIKeys      CountProviderFunc
	AgentProfiles   CountProviderFunc
	PromptTemplates CountProviderFunc
	ExternalAgents  CountProviderFunc
}

func buildProjectAISettingEntries(providers ProjectAISettingProviders) []RuntimeEntry {
	return []RuntimeEntry{
		buildProjectAISettingEntry(
			"core.project_ai_settings.llm_api_keys",
			"LLM API Keys",
			[]string{"llm api keys", "api keys", "provider keys"},
			"Managed LLM API keys configured for the workspace.",
			"project-ai-settings-llm-api-keys",
			providers.LLMAPIKeys,
		),
		buildProjectAISettingEntry(
			"core.project_ai_settings.agent_profiles",
			"Agent Profiles",
			[]string{"agent profiles", "profiles", "stored agents"},
			"Stored agent profiles available to Project AI tools.",
			"project-ai-settings-agent-profiles",
			providers.AgentProfiles,
		),
		buildProjectAISettingEntry(
			"core.project_ai_settings.prompt_templates",
			"Prompt Templates",
			[]string{"prompt templates", "templates", "prompts"},
			"Prompt templates available to Project AI tools and workflows.",
			"project-ai-settings-prompt-templates",
			providers.PromptTemplates,
		),
		buildProjectAISettingEntry(
			"core.project_ai_settings.external_agents",
			"External Agents",
			[]string{"external agents", "agent adapters", "codex", "claude code"},
			"Configured external-agent backends available to Project AI.",
			"project-ai-settings-external-agents",
			providers.ExternalAgents,
		),
	}
}

func buildProjectAISettingEntry(
	settingID string,
	title string,
	synonyms []string,
	description string,
	accordionItemValue string,
	countProvider CountProviderFunc,
) RuntimeEntry {
	return RuntimeEntry{
		Metadata: Entry{
			SettingID:   settingID,
			Title:       title,
			Synonyms:    append([]string(nil), synonyms...),
			Description: description,
			Location: Location{
				Side:           SideLeft,
				OverviewTabKey: "ProjectAISettings",
			},
			Highlight: Highlight{
				Strategy: HighlightStrategyDOMAnchor,
				AnchorID: settingID,
			},
			Source:     SourceCore,
			Mutability: MutabilityReadOnly,
			ValueSchema: ValueSchema{
				Type: ValueTypeInteger,
			},
			RevealActivationSteps: []RevealActivationStep{
				{
					Type:      RevealActivationProjectAIAccordion,
					ItemValue: accordionItemValue,
				},
			},
		},
		ReadValue: func(ctx context.Context, _ string) (any, error) {
			if countProvider == nil {
				return nil, newSettingError(ErrorCodeMutationFailed, "UI setting %q is unavailable.", settingID)
			}
			count, err := countProvider(ctx)
			if err != nil {
				return nil, newSettingError(ErrorCodeMutationFailed, "Failed to read %s: %v", settingID, err)
			}
			if count < 0 {
				return nil, newSettingError(ErrorCodeMutationFailed, "Failed to read %s: negative count.", settingID)
			}
			return count, nil
		},
	}
}
