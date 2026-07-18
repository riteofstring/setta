package speech

import (
	"errors"
	"fmt"
)

const e2eEnvironmentVariable = "SETTA_E2E"

type OpenAIStartupConfig struct {
	Provider OpenAIProviderConfig
	APIKey   string
}

func OpenAIProviderConfigFromDesktopEnvironment(
	getenv func(string) string,
) (OpenAIProviderConfig, error) {
	config, err := openAIProviderConfigFromEnvironment(getenv)
	if err != nil {
		return OpenAIProviderConfig{}, err
	}
	if _, err := NewOpenAIClient("", config); err != nil {
		return OpenAIProviderConfig{}, fmt.Errorf("invalid speech environment configuration: %w", err)
	}
	return config, nil
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
	providerConfig, err := openAIProviderConfigFromEnvironment(getenv)
	if err != nil {
		return OpenAIStartupConfig{}, err
	}
	config.Provider = providerConfig
	if _, err := NewOpenAIClient(config.APIKey, config.Provider); err != nil {
		return OpenAIStartupConfig{}, fmt.Errorf("invalid speech environment configuration: %w", err)
	}
	return config, nil
}

func openAIProviderConfigFromEnvironment(getenv func(string) string) (OpenAIProviderConfig, error) {
	if getenv == nil {
		return OpenAIProviderConfig{}, errors.New("speech environment reader is required")
	}
	config := OpenAIProviderConfig{}
	if baseURL := getenv(E2EBaseURLEnvironmentVariable); baseURL != "" {
		if getenv(e2eEnvironmentVariable) != "1" {
			return OpenAIProviderConfig{}, fmt.Errorf(
				"%s requires %s=1",
				E2EBaseURLEnvironmentVariable,
				e2eEnvironmentVariable,
			)
		}
		config.BaseURL = baseURL
		config.AllowTestBaseURL = true
	}
	return config, nil
}
