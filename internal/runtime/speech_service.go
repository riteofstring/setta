package runtime

import (
	"context"
	"fmt"

	"setta/internal/conversation"
	"setta/internal/speech"
)

func newSpeechService(
	config speech.OpenAIClientConfig,
	store *conversation.Store,
) (*speech.Service, error) {
	provider, err := speech.NewOpenAIClient(config)
	if err != nil {
		return nil, fmt.Errorf("create OpenAI speech client: %w", err)
	}
	service, err := speech.NewService(context.Background(), speech.ServiceConfig{
		Provider:                provider,
		SourceResolver:          speech.SourceResolverFunc(store.ResolveSpeechSource),
		VoiceConfigurationStore: store,
	})
	if err != nil {
		return nil, fmt.Errorf("create speech service: %w", err)
	}
	return service, nil
}
