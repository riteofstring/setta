package managedllm

import (
	"fmt"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
)

func SupportsThinkingOutput(config llmconfig.Config) bool {
	request := agentruns.ExecutionRequest{
		LLMConfig:     config,
		RequestParams: buildManagedConfigRequestParams(config),
		Thinking:      true,
	}
	switch strings.ToLower(strings.TrimSpace(config.Provider)) {
	case anthropicProvider:
		_, enabled, err := resolveAnthropicThinkingConfig(request)
		return err == nil && enabled
	case geminiProvider:
		_, enabled, err := resolveGeminiThinkingConfig(request)
		return err == nil && enabled
	default:
		return false
	}
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
