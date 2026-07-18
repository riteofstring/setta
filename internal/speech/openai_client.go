package speech

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	openAISafetyIdentifierHeader = "OpenAI-Safety-Identifier"
	defaultProviderTimeout       = 30 * time.Second
	maximumJSONResponseBytes     = 64 * 1024
)

type OpenAIProviderConfig struct {
	BaseURL          string
	AllowTestBaseURL bool
	HTTPClient       *http.Client
	RequestTimeout   time.Duration
}

type OpenAIClient struct {
	apiKey         string
	baseURL        string
	httpClient     *http.Client
	requestTimeout time.Duration
}

func NewOpenAIClient(apiKey string, config OpenAIProviderConfig) (*OpenAIClient, error) {
	if apiKey != "" {
		if err := validateSecret("speech API key", apiKey); err != nil {
			return nil, err
		}
	}
	baseURL, err := validateProviderBaseURL(config.BaseURL, config.AllowTestBaseURL)
	if err != nil {
		return nil, err
	}
	requestTimeout := config.RequestTimeout
	if requestTimeout == 0 {
		requestTimeout = defaultProviderTimeout
	}
	if requestTimeout < 0 {
		return nil, errors.New("speech provider request timeout must be positive")
	}
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{}
	}
	httpClientCopy := *httpClient
	httpClientCopy.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return &OpenAIClient{
		apiKey:         apiKey,
		baseURL:        baseURL,
		httpClient:     &httpClientCopy,
		requestTimeout: requestTimeout,
	}, nil
}

func validateProviderBaseURL(rawURL string, allowTestBaseURL bool) (string, error) {
	if rawURL == "" {
		rawURL = openAIBaseURL
	}
	rawURL = strings.TrimSuffix(rawURL, "/")
	if rawURL != openAIBaseURL && !allowTestBaseURL {
		return "", errors.New("non-production speech provider base URL requires explicit test authorization")
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("parse speech provider base URL: %w", err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("speech provider base URL requires a scheme and host")
	}
	if !validProviderScheme(parsed.Scheme) {
		return "", errors.New("speech provider base URL must use HTTP or HTTPS")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("speech provider base URL must not contain user info, a query, or a fragment")
	}
	return parsed.String(), nil
}

func validProviderScheme(scheme string) bool {
	return scheme == "http" || scheme == "https"
}

func (client *OpenAIClient) configured() bool {
	return client != nil && client.apiKey != ""
}

func (client *OpenAIClient) Configured() bool {
	return client.configured()
}

func (client *OpenAIClient) postJSON(ctx context.Context, path string, payload any, accept string, safetyIdentifier string) (*http.Response, error) {
	if !client.configured() {
		return nil, classifiedError(ErrorNotConfigured, "OpenAI speech is not configured.", nil)
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode OpenAI speech request: %w", err)
	}
	requestContext, cancel := context.WithTimeout(ctx, client.requestTimeout)
	request, err := http.NewRequestWithContext(requestContext, http.MethodPost, client.baseURL+path, bytes.NewReader(body))
	if err != nil {
		cancel()
		return nil, fmt.Errorf("create OpenAI speech request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+client.apiKey)
	request.Header.Set("Accept", accept)
	request.Header.Set("Content-Type", "application/json")
	if safetyIdentifier != "" {
		request.Header.Set(openAISafetyIdentifierHeader, safetyIdentifier)
	}
	response, err := client.httpClient.Do(request)
	if err != nil {
		cancel()
		if response != nil && response.Body != nil {
			_ = response.Body.Close()
		}
		return nil, classifyProviderTransportError(err)
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		_ = response.Body.Close()
		cancel()
		return nil, classifyProviderStatus(response.StatusCode)
	}
	if response.Body == nil {
		cancel()
		return nil, classifiedError(ErrorProviderResponseMalformed, "OpenAI speech returned an empty response body.", nil)
	}
	response.Body = cancelOnCloseBody{ReadCloser: response.Body, cancel: cancel}
	return response, nil
}

type cancelOnCloseBody struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (body cancelOnCloseBody) Close() error {
	err := body.ReadCloser.Close()
	body.cancel()
	return err
}

func classifyProviderTransportError(err error) error {
	switch {
	case errors.Is(err, context.Canceled):
		return classifiedError(ErrorProviderUnavailable, "OpenAI speech request was canceled.", err)
	case errors.Is(err, context.DeadlineExceeded):
		return classifiedError(ErrorProviderUnavailable, "OpenAI speech request timed out.", err)
	default:
		return classifiedError(ErrorProviderUnavailable, "OpenAI speech is unavailable.", err)
	}
}

func classifyProviderStatus(status int) error {
	switch {
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		return classifiedError(ErrorProviderRejected, "OpenAI rejected the speech credential or model access.", nil)
	case status == http.StatusTooManyRequests:
		return classifiedError(ErrorRateLimited, "OpenAI speech rate limit or quota was reached.", nil)
	case status == http.StatusRequestTimeout || status >= http.StatusInternalServerError:
		return classifiedError(ErrorProviderUnavailable, "OpenAI speech is unavailable.", nil)
	default:
		return classifiedError(ErrorProviderResponseMalformed, fmt.Sprintf("OpenAI speech returned unexpected status %d.", status), nil)
	}
}

func requireContentType(response *http.Response, allowed ...string) error {
	contentType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil {
		return classifiedError(ErrorProviderResponseMalformed, "OpenAI speech returned an invalid content type.", err)
	}
	for _, candidate := range allowed {
		if contentType == candidate {
			return nil
		}
	}
	return classifiedError(ErrorProviderResponseMalformed, fmt.Sprintf("OpenAI speech returned unsupported content type %q.", contentType), nil)
}

func readBoundedResponse(response *http.Response, maximum int64) ([]byte, error) {
	if response.Body == nil {
		return nil, classifiedError(ErrorProviderResponseMalformed, "OpenAI speech returned an empty response body.", nil)
	}
	if response.ContentLength > maximum {
		return nil, classifiedError(ErrorAudioTooLarge, fmt.Sprintf("OpenAI speech audio exceeded %d bytes.", maximum), nil)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maximum+1))
	if err != nil {
		if errors.Is(err, io.ErrUnexpectedEOF) {
			return nil, classifiedError(ErrorProviderResponseMalformed, "OpenAI speech returned a truncated response.", err)
		}
		return nil, classifiedError(ErrorProviderUnavailable, "OpenAI speech response could not be read.", err)
	}
	if int64(len(data)) > maximum {
		return nil, classifiedError(ErrorAudioTooLarge, fmt.Sprintf("OpenAI speech audio exceeded %d bytes.", maximum), nil)
	}
	if response.ContentLength >= 0 && response.ContentLength != int64(len(data)) {
		return nil, classifiedError(ErrorProviderResponseMalformed, "OpenAI speech returned a truncated response.", nil)
	}
	return data, nil
}

func decodeJSONResponse(response *http.Response, destination any) error {
	if err := requireContentType(response, "application/json"); err != nil {
		return err
	}
	data, err := readBoundedResponse(response, maximumJSONResponseBytes)
	if err != nil {
		if speechError, ok := AsError(err); ok && speechError.Code == ErrorAudioTooLarge {
			return classifiedError(ErrorProviderResponseMalformed, "OpenAI speech returned an oversized JSON response.", err)
		}
		return err
	}
	if err := json.Unmarshal(data, destination); err != nil {
		return classifiedError(ErrorProviderResponseMalformed, "OpenAI speech returned malformed JSON.", err)
	}
	return nil
}
