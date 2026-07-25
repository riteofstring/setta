package runtime

import (
	"context"
	"fmt"

	"setta/internal/conversation"
	"setta/internal/speech"
)

func newSpeechService(
	config speech.OpenAIProviderConfig,
	startupAPIKey string,
	store *conversation.Store,
) (*speech.Service, error) {
	providerController, err := speech.NewOpenAIProviderController(config, startupAPIKey)
	if err != nil {
		return nil, fmt.Errorf("create OpenAI speech provider controller: %w", err)
	}
	service, err := speech.NewService(context.Background(), speech.ServiceConfig{
		ProviderController:      providerController,
		SourceResolver:          speech.SourceResolverFunc(store.ResolveSpeechSource),
		VoiceConfigurationStore: store,
	})
	if err != nil {
		providerController.Shutdown()
		return nil, fmt.Errorf("create speech service: %w", err)
	}
	return service, nil
}
