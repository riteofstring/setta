package speech

import (
	"errors"
	"fmt"
)

const e2eEnvironmentVariable = "SETTA_E2E"

func openAIProviderEndpointConfigFromEnvironment(getenv func(string) string) (OpenAIProviderConfig, error) {
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
