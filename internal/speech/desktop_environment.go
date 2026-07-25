package speech

import "fmt"

func OpenAIProviderConfigFromDesktopEnvironment(
	getenv func(string) string,
) (OpenAIProviderConfig, error) {
	config, err := openAIProviderEndpointConfigFromEnvironment(getenv)
	if err != nil {
		return OpenAIProviderConfig{}, err
	}
	if _, err := NewOpenAIClient("", config); err != nil {
		return OpenAIProviderConfig{}, fmt.Errorf("invalid desktop speech provider environment configuration: %w", err)
	}
	return config, nil
}
