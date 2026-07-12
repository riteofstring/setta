package runtime

import (
	"fmt"

	"setta/internal/speech"
)

func newSpeechService(config speech.OpenAIClientConfig) (*speech.Service, error) {
	provider, err := speech.NewOpenAIClient(config)
	if err != nil {
		return nil, fmt.Errorf("create OpenAI speech client: %w", err)
	}
	service, err := speech.NewService(speech.ServiceConfig{Provider: provider})
	if err != nil {
		return nil, fmt.Errorf("create speech service: %w", err)
	}
	return service, nil
}
