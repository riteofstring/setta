package speech

import (
	"errors"
	"fmt"
)

const e2eEnvironmentVariable = "SETTA_E2E"

func OpenAIClientConfigFromEnvironment(
	getenv func(string) string,
	unsetenv func(string) error,
) (OpenAIClientConfig, error) {
	if getenv == nil {
		return OpenAIClientConfig{}, errors.New("speech environment reader is required")
	}
	if unsetenv == nil {
		return OpenAIClientConfig{}, errors.New("speech environment clearer is required")
	}
	config := OpenAIClientConfig{
		APIKey: getenv(APIKeyEnvironmentVariable),
	}
	if err := unsetenv(APIKeyEnvironmentVariable); err != nil {
		return OpenAIClientConfig{}, fmt.Errorf("clear %s after loading: %w", APIKeyEnvironmentVariable, err)
	}
	if baseURL := getenv(E2EBaseURLEnvironmentVariable); baseURL != "" {
		if getenv(e2eEnvironmentVariable) != "1" {
			return OpenAIClientConfig{}, fmt.Errorf(
				"%s requires %s=1",
				E2EBaseURLEnvironmentVariable,
				e2eEnvironmentVariable,
			)
		}
		config.BaseURL = baseURL
		config.AllowTestBaseURL = true
	}
	if _, err := NewOpenAIClient(config); err != nil {
		return OpenAIClientConfig{}, fmt.Errorf("invalid speech environment configuration: %w", err)
	}
	return config, nil
}
