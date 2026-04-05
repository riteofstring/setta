package transcriptionsessions

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	openai "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"setta/internal/llmconfig"
)

func buildOpenAITranscriptionClient(
	httpClient *http.Client,
	config llmconfig.Config,
	apiKeys map[string]string,
) (openai.Client, error) {
	apiKey, err := resolveAPIKey(apiKeys, config.APIKeyEnv)
	if err != nil {
		return openai.Client{}, err
	}

	if _, err := url.Parse(resolveOpenAIBaseURL(config.BaseURL)); err != nil {
		return openai.Client{}, newServiceError(
			ErrInvalidRequest,
			"Transcription config is missing or invalid for this transcription profile.",
		)
	}

	if httpClient == nil {
		httpClient = http.DefaultClient
	}

	options := []option.RequestOption{
		option.WithHTTPClient(httpClient),
		option.WithBaseURL(resolveOpenAIBaseURL(config.BaseURL)),
		option.WithMaxRetries(0),
		// Keep auth/config resolution bound to Setta's selected llmconfig entry.
		option.WithHeaderDel("Authorization"),
		option.WithHeaderDel("OpenAI-Organization"),
		option.WithHeaderDel("OpenAI-Project"),
	}
	if apiKey != "" {
		options = append(options, option.WithAPIKey(apiKey))
	}

	return openai.NewClient(options...), nil
}

func resolveOpenAIBaseURL(baseURL string) string {
	trimmed := strings.TrimSpace(baseURL)
	if trimmed == "" {
		return defaultOpenAIBaseURL
	}
	return trimmed
}

func wrapOpenAITranscriptionProviderError(err error) error {
	var apierr *openai.Error
	if errors.As(err, &apierr) && strings.TrimSpace(apierr.Message) != "" {
		return newServiceError(ErrProviderFailure, strings.TrimSpace(apierr.Message))
	}
	return newServiceError(ErrProviderFailure, defaultProviderErrorMessage)
}
