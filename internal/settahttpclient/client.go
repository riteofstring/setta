package settahttpclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"setta/internal/backendconn"
	"setta/internal/httpapi"
)

type Client struct {
	authToken  string
	baseURL    *url.URL
	httpClient *http.Client
	endpoints  map[string]httpapi.ContractEndpoint
}

type Option func(*Client)

type BackendError struct {
	StatusCode int
	Code       string
	Message    string
}

func (err BackendError) Error() string {
	if err.Code == "" {
		return fmt.Sprintf("backend returned HTTP %d", err.StatusCode)
	}
	return fmt.Sprintf("%s: %s", err.Code, err.Message)
}

func New(baseAddr string, timeout time.Duration, options ...Option) (*Client, error) {
	if baseAddr == "" {
		return nil, errors.New("backend address is required")
	}
	parsed, err := url.Parse(baseAddr)
	if err != nil {
		return nil, fmt.Errorf("parse backend address: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("backend address must start with http:// or https://: %s", baseAddr)
	}
	if parsed.Host == "" {
		return nil, fmt.Errorf("backend address host is required: %s", baseAddr)
	}
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	endpoints := map[string]httpapi.ContractEndpoint{}
	for _, endpoint := range httpapi.Contracts().Endpoints {
		endpoints[endpoint.Name] = endpoint
	}
	client := &Client{
		baseURL:    parsed,
		httpClient: &http.Client{Timeout: timeout},
		endpoints:  endpoints,
	}
	for _, option := range options {
		option(client)
	}
	return client, nil
}

func WithAuthToken(token string) Option {
	return func(client *Client) {
		client.authToken = token
	}
}

func (client *Client) Endpoint(name string) (httpapi.ContractEndpoint, bool) {
	endpoint, ok := client.endpoints[name]
	return endpoint, ok
}

func Endpoints() []httpapi.ContractEndpoint {
	return httpapi.Contracts().Endpoints
}

func (client *Client) Call(ctx context.Context, name string, requestPayload any) (json.RawMessage, error) {
	endpoint, ok := client.Endpoint(name)
	if !ok {
		return nil, fmt.Errorf("unknown backend operation: %s", name)
	}
	var body []byte
	if endpoint.Request != nil {
		if requestPayload == nil {
			return nil, fmt.Errorf("%s request payload is required", name)
		}
		encoded, err := json.Marshal(requestPayload)
		if err != nil {
			return nil, fmt.Errorf("marshal %s request: %w", name, err)
		}
		body = encoded
	}
	return client.CallRaw(ctx, endpoint, body)
}

func (client *Client) CallRaw(ctx context.Context, endpoint httpapi.ContractEndpoint, body []byte) (json.RawMessage, error) {
	if endpoint.Streaming {
		return nil, fmt.Errorf("%s is a streaming endpoint", endpoint.Name)
	}
	request, err := client.request(ctx, endpoint, body)
	if err != nil {
		return nil, err
	}
	response, err := client.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("connect to backend: %w", err)
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, fmt.Errorf("read %s response: %w", endpoint.Name, err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, decodeBackendError(response.StatusCode, responseBody)
	}
	return json.RawMessage(responseBody), nil
}

func (client *Client) Stream(ctx context.Context, name string, lastEventID string) (*http.Response, error) {
	endpoint, ok := client.Endpoint(name)
	if !ok {
		return nil, fmt.Errorf("unknown backend operation: %s", name)
	}
	if !endpoint.Streaming {
		return nil, fmt.Errorf("%s is not a streaming endpoint", name)
	}
	request, err := client.request(ctx, endpoint, nil)
	if err != nil {
		return nil, err
	}
	if lastEventID != "" {
		request.Header.Set("Last-Event-ID", lastEventID)
	}
	response, err := client.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("connect to backend stream: %w", err)
	}
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return response, nil
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		return nil, fmt.Errorf("read stream error response: %w", err)
	}
	return nil, decodeBackendError(response.StatusCode, body)
}

func (client *Client) request(ctx context.Context, endpoint httpapi.ContractEndpoint, body []byte) (*http.Request, error) {
	target := *client.baseURL
	target.Path = endpoint.Path
	target.RawQuery = ""
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	request, err := http.NewRequestWithContext(ctx, endpoint.Method, target.String(), reader)
	if err != nil {
		return nil, fmt.Errorf("create %s request: %w", endpoint.Name, err)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if client.authToken != "" {
		request.Header.Set(backendconn.AuthHeader, backendconn.BearerToken(client.authToken))
	}
	return request, nil
}

func decodeBackendError(statusCode int, body []byte) BackendError {
	var response httpapi.ErrorResponse
	if err := json.Unmarshal(body, &response); err != nil || response.Error.Code == "" {
		return BackendError{
			StatusCode: statusCode,
			Code:       "backend_http_error",
			Message:    string(bytes.TrimSpace(body)),
		}
	}
	return BackendError{
		StatusCode: statusCode,
		Code:       response.Error.Code,
		Message:    response.Error.Message,
	}
}
