package frontendvalues

import (
	"setta/internal/agentruns"
	"setta/internal/appsubsystem/appspec"
	appsubsystemchatmodes "setta/internal/appsubsystem/chatmodes"
)

type AppSubsystemChatSlashCommandValue struct {
	Command           string `json:"command"`
	Action            string `json:"action"`
	Summary           string `json:"summary"`
	PromptTemplate    string `json:"promptTemplate"`
	AppGenerationMode string `json:"appGenerationMode"`
}

type AppSubsystemCustomSlashCommandModeOptionValue struct {
	Value                   string `json:"value"`
	Label                   string `json:"label"`
	RequiresImageAttachment bool   `json:"requiresImageAttachment"`
}

type AppSubsystemChatUIConfigValue struct {
	SlashCommands                 []AppSubsystemChatSlashCommandValue             `json:"slashCommands"`
	CustomSlashCommandModeOptions []AppSubsystemCustomSlashCommandModeOptionValue `json:"customSlashCommandModeOptions"`
	DefaultCustomSlashCommandMode string                                          `json:"defaultCustomSlashCommandMode"`
}

func FrontendValueAppSpecPatchPolicyConfig() appspec.PatchPolicy {
	return appspec.DefaultPatchPolicy()
}

func FrontendValueAppSubsystemChatUIConfig() AppSubsystemChatUIConfigValue {
	metadataEntries := appsubsystemchatmodes.AppGenerationModeMetadataEntries()
	slashCommands := make([]AppSubsystemChatSlashCommandValue, 0, len(metadataEntries))
	modeOptions := make([]AppSubsystemCustomSlashCommandModeOptionValue, 0, len(metadataEntries)+1)
	modeOptions = append(modeOptions, AppSubsystemCustomSlashCommandModeOptionValue{
		Value: string(agentruns.ChatAppGenerationMessageModePlainChat),
		Label: "Plain chat",
	})
	for _, metadata := range metadataEntries {
		slashCommands = append(slashCommands, AppSubsystemChatSlashCommandValue{
			Command:           metadata.SlashCommand,
			Action:            metadata.SlashAction,
			Summary:           metadata.Summary,
			PromptTemplate:    metadata.PromptTemplate,
			AppGenerationMode: metadata.Mode,
		})
		modeOptions = append(modeOptions, AppSubsystemCustomSlashCommandModeOptionValue{
			Value:                   metadata.Mode,
			Label:                   metadata.Label,
			RequiresImageAttachment: metadata.AllowsReferenceImage,
		})
	}
	return AppSubsystemChatUIConfigValue{
		SlashCommands:                 slashCommands,
		CustomSlashCommandModeOptions: modeOptions,
		DefaultCustomSlashCommandMode: string(agentruns.ChatAppGenerationMessageModePlainChat),
	}
}
