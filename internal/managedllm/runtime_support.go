package managedllm

import (
	"fmt"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
)

func SupportsThinkingOutput(config llmconfig.Config) bool {
	if strings.ToLower(strings.TrimSpace(config.Provider)) != anthropicProvider {
		return false
	}
	request := agentruns.ExecutionRequest{
		LLMConfig:     config,
		RequestParams: buildManagedConfigRequestParams(config),
		Thinking:      true,
	}
	_, enabled, err := resolveAnthropicThinkingConfig(request)
	return err == nil && enabled
}

func buildManagedConfigRequestParams(config llmconfig.Config) map[string]any {
	params := map[string]any{
		"model": config.Model,
	}
	if config.Provider != "" {
		params["custom_llm_provider"] = config.Provider
	}
	if config.BaseURL != "" {
		params["api_base"] = config.BaseURL
	}
	for key, value := range config.OtherParams {
		params[key] = cloneJSONValue(value)
	}
	return params
}

func unsupportedThinkingError(request agentruns.ExecutionRequest) error {
	modelName := strings.TrimSpace(request.LLMConfig.Model)
	providerDisplay := resolveProviderHint(request)
	if strings.TrimSpace(providerDisplay) == "" {
		providerDisplay = "default"
	}
	return fmt.Errorf(
		"%w: thinking is not supported for model %q via provider %q",
		ErrReasoningUnsupported,
		modelName,
		providerDisplay,
	)
}
