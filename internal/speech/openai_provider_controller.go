package speech

import (
	"context"
	"errors"
	"fmt"
	"sync"
)

type OpenAIProviderController struct {
	mu        sync.RWMutex
	config    OpenAIProviderConfig
	client    *OpenAIClient
	newClient func(string, OpenAIProviderConfig) (*OpenAIClient, error)
}

func NewOpenAIProviderController(
	config OpenAIProviderConfig,
	startupAPIKey string,
) (*OpenAIProviderController, error) {
	controller := &OpenAIProviderController{
		config:    config,
		newClient: NewOpenAIClient,
	}
	if startupAPIKey == "" {
		if _, err := controller.newClient("", config); err != nil {
			return nil, fmt.Errorf("validate OpenAI speech provider configuration: %w", err)
		}
		return controller, nil
	}
	client, err := controller.newConfiguredClient(startupAPIKey)
	if err != nil {
		return nil, fmt.Errorf("create startup OpenAI speech client: %w", err)
	}
	controller.client = client
	return controller, nil
}

func (controller *OpenAIProviderController) Configured() bool {
	return controller.Snapshot() != nil
}

func (controller *OpenAIProviderController) Snapshot() Provider {
	if controller == nil {
		return nil
	}
	controller.mu.RLock()
	defer controller.mu.RUnlock()
	if controller.client == nil || !controller.client.Configured() {
		return nil
	}
	return controller.client
}

func (controller *OpenAIProviderController) Status() SpeechProviderStatus {
	if controller.Configured() {
		return SpeechProviderStatusConfigured
	}
	return SpeechProviderStatusNotConfigured
}

func (controller *OpenAIProviderController) ValidateCredential(
	ctx context.Context,
	apiKey string,
	safetyIdentifier string,
) error {
	client, err := controller.newConfiguredClient(apiKey)
	if err != nil {
		return err
	}
	defer client.closeIdleConnections()
	if _, err := client.CreateTranscriptionClientSecret(ctx, safetyIdentifier); err != nil {
		return err
	}
	return nil
}

func (controller *OpenAIProviderController) LoadCredential(apiKey string) error {
	client, err := controller.newConfiguredClient(apiKey)
	if err != nil {
		return err
	}
	controller.mu.Lock()
	previous := controller.client
	controller.client = client
	controller.mu.Unlock()
	previous.closeIdleConnections()
	return nil
}

func (controller *OpenAIProviderController) ClearCredential() {
	if controller == nil {
		return
	}
	controller.mu.Lock()
	previous := controller.client
	controller.client = nil
	controller.mu.Unlock()
	previous.closeIdleConnections()
}

func (controller *OpenAIProviderController) Shutdown() {
	controller.ClearCredential()
}

func (controller *OpenAIProviderController) newConfiguredClient(apiKey string) (*OpenAIClient, error) {
	if controller == nil {
		return nil, errors.New("OpenAI speech provider controller is required")
	}
	if controller.newClient == nil {
		return nil, errors.New("OpenAI speech client factory is required")
	}
	if err := validateSecret("speech API key", apiKey); err != nil {
		return nil, err
	}
	client, err := controller.newClient(apiKey, controller.config)
	if err != nil {
		return nil, err
	}
	if client == nil || !client.Configured() {
		return nil, classifiedError(ErrorNotConfigured, "OpenAI speech credential is required.", nil)
	}
	return client, nil
}
