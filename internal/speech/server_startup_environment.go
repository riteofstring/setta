package speech

import (
	"errors"
	"fmt"
)

type OpenAIStartupConfig struct {
	Provider OpenAIProviderConfig
	APIKey   string
}

func OpenAIStartupConfigFromServerEnvironment(
	getenv func(string) string,
	unsetenv func(string) error,
) (OpenAIStartupConfig, error) {
	if getenv == nil {
		return OpenAIStartupConfig{}, errors.New("speech environment reader is required")
	}
	if unsetenv == nil {
		return OpenAIStartupConfig{}, errors.New("speech environment clearer is required")
	}
	config := OpenAIStartupConfig{APIKey: getenv(APIKeyEnvironmentVariable)}
	if err := unsetenv(APIKeyEnvironmentVariable); err != nil {
		return OpenAIStartupConfig{}, fmt.Errorf("clear %s after loading: %w", APIKeyEnvironmentVariable, err)
	}
	providerConfig, err := openAIProviderEndpointConfigFromEnvironment(getenv)
	if err != nil {
		return OpenAIStartupConfig{}, err
	}
	config.Provider = providerConfig
	if _, err := NewOpenAIClient(config.APIKey, config.Provider); err != nil {
		return OpenAIStartupConfig{}, fmt.Errorf("invalid server startup speech environment configuration: %w", err)
	}
	return config, nil
}
