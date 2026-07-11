package runtime

import (
	"fmt"

	"setta/internal/easyrun"
	"setta/internal/speech"
	"setta/internal/workspacesession"
)

func newSpeechService(
	config speech.OpenAIClientConfig,
	easyRunService *easyrun.Service,
	workspaceService *workspacesession.Service,
) (*speech.Service, error) {
	provider, err := speech.NewOpenAIClient(config)
	if err != nil {
		return nil, fmt.Errorf("create OpenAI speech client: %w", err)
	}
	service, err := speech.NewService(speech.ServiceConfig{
		Provider:         provider,
		EasyRunSnapshots: easyRunService,
		Workspaces:       workspaceService,
	})
	if err != nil {
		return nil, fmt.Errorf("create speech service: %w", err)
	}
	return service, nil
}
