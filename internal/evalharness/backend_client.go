package evalharness

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"

	"setta/internal/conversation"
	"setta/internal/director"
	"setta/internal/httpapi"
	"setta/internal/jsonio"
)

const (
	backendMaximumResponseBytes   = 4 * 1024 * 1024
	backendMaximumDiagnosticBytes = 4 * 1024
	backendMaximumTokenBytes      = 16 * 1024
)

type BackendClientConfig struct {
	BaseURL    string
	Token      string
	HTTPClient *http.Client
}

// BackendClient drives only the production HTTP boundary. It accepts numeric
// loopback HTTP addresses so the bootstrap token can never be sent to a remote
// endpoint through runner configuration.
type BackendClient struct {
	baseURL    *url.URL
	token      string
	httpClient *http.Client
}

func NewBackendClient(config BackendClientConfig) (*BackendClient, error) {
	baseURL, err := validateBackendBaseURL(config.BaseURL)
	if err != nil {
		return nil, err
	}
	if err := validateBackendToken(config.Token); err != nil {
		return nil, err
	}
	httpClient := config.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{}
	} else {
		clone := *httpClient
		httpClient = &clone
	}
	httpClient.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return &BackendClient{
		baseURL:    baseURL,
		token:      config.Token,
		httpClient: httpClient,
	}, nil
}

func (client *BackendClient) OpenWorkspace(
	ctx context.Context,
	rootPath string,
) (httpapi.OpenWorkspaceResponse, error) {
	response, err := postBackendJSON[httpapi.OpenWorkspaceResponse](
		ctx,
		client,
		"/workspaces/open",
		httpapi.OpenWorkspaceRequest{RootPath: rootPath},
	)
	if err != nil {
		return httpapi.OpenWorkspaceResponse{}, err
	}
	if strings.TrimSpace(response.Workspace.ID) == "" {
		return httpapi.OpenWorkspaceResponse{}, errors.New("open workspace response omitted workspace id")
	}
	if response.Workspace.RootPath != rootPath {
		return httpapi.OpenWorkspaceResponse{}, fmt.Errorf(
			"open workspace resolved root %q, want %q",
			response.Workspace.RootPath,
			rootPath,
		)
	}
	if response.Session.SelectedWorkspaceID != response.Workspace.ID {
		return httpapi.OpenWorkspaceResponse{}, errors.New("open workspace response did not select the opened workspace")
	}
	return response, nil
}

func (client *BackendClient) ReadGlobalRoleConfiguration(
	ctx context.Context,
) (conversation.RoleConfiguration, error) {
	configuration, err := getBackendJSON[conversation.RoleConfiguration](
		ctx,
		client,
		"/roles/configuration/global",
	)
	if err != nil {
		return conversation.RoleConfiguration{}, err
	}
	if err := configuration.Validate(); err != nil {
		return conversation.RoleConfiguration{}, fmt.Errorf("validate global role configuration response: %w", err)
	}
	if configuration.Scope.Kind != conversation.RoleProfileScopeGlobal {
		return conversation.RoleConfiguration{}, fmt.Errorf(
			"global role configuration response has scope %s",
			configuration.Scope.Kind,
		)
	}
	return configuration, nil
}

func (client *BackendClient) UpdateGlobalRoleConfiguration(
	ctx context.Context,
	updates []conversation.RoleProfileUpdate,
) (conversation.RoleConfiguration, error) {
	configuration, err := postBackendJSON[conversation.RoleConfiguration](
		ctx,
		client,
		"/roles/configuration/global/update",
		httpapi.UpdateGlobalRoleProfilesRequest{Updates: updates},
	)
	if err != nil {
		return conversation.RoleConfiguration{}, err
	}
	if err := configuration.Validate(); err != nil {
		return conversation.RoleConfiguration{}, fmt.Errorf("validate updated global role configuration response: %w", err)
	}
	if configuration.Scope.Kind != conversation.RoleProfileScopeGlobal {
		return conversation.RoleConfiguration{}, fmt.Errorf(
			"updated global role configuration response has scope %s",
			configuration.Scope.Kind,
		)
	}
	return configuration, nil
}

func (client *BackendClient) ReadWorkspaceRoleConfiguration(
	ctx context.Context,
	workspaceID string,
) (conversation.RoleConfiguration, error) {
	configuration, err := postBackendJSON[conversation.RoleConfiguration](
		ctx,
		client,
		"/workspaces/roles/read",
		httpapi.ReadWorkspaceRoleConfigurationRequest{WorkspaceID: workspaceID},
	)
	if err != nil {
		return conversation.RoleConfiguration{}, err
	}
	if err := configuration.Validate(); err != nil {
		return conversation.RoleConfiguration{}, fmt.Errorf("validate workspace role configuration response: %w", err)
	}
	if configuration.Scope.Kind != conversation.RoleProfileScopeWorkspace ||
		configuration.Scope.WorkspaceID == nil || *configuration.Scope.WorkspaceID != workspaceID {
		return conversation.RoleConfiguration{}, fmt.Errorf(
			"workspace role configuration response does not target workspace %s",
			workspaceID,
		)
	}
	return configuration, nil
}

func (client *BackendClient) UpdateWorkspaceRoleConfiguration(
	ctx context.Context,
	workspaceID string,
	updates []conversation.RoleProfileUpdate,
) (conversation.RoleConfiguration, error) {
	configuration, err := postBackendJSON[conversation.RoleConfiguration](
		ctx,
		client,
		"/workspaces/roles/update",
		httpapi.UpdateWorkspaceRoleProfilesRequest{
			WorkspaceID: workspaceID,
			Updates:     updates,
		},
	)
	if err != nil {
		return conversation.RoleConfiguration{}, err
	}
	if err := configuration.Validate(); err != nil {
		return conversation.RoleConfiguration{}, fmt.Errorf("validate updated workspace role configuration response: %w", err)
	}
	if configuration.Scope.Kind != conversation.RoleProfileScopeWorkspace ||
		configuration.Scope.WorkspaceID == nil || *configuration.Scope.WorkspaceID != workspaceID {
		return conversation.RoleConfiguration{}, fmt.Errorf(
			"updated workspace role configuration response does not target workspace %s",
			workspaceID,
		)
	}
	return configuration, nil
}

func (client *BackendClient) ReadDirectorSnapshot(
	ctx context.Context,
) (director.DirectorSnapshot, error) {
	snapshot, err := getBackendJSON[director.DirectorSnapshot](ctx, client, "/director/snapshot")
	if err != nil {
		return director.DirectorSnapshot{}, err
	}
	if err := director.ValidateDirectorSnapshot(snapshot); err != nil {
		return director.DirectorSnapshot{}, fmt.Errorf("validate Director snapshot response: %w", err)
	}
	return snapshot, nil
}

func (client *BackendClient) DispatchDirectorIntent(
	ctx context.Context,
	intent director.DirectorIntent,
) (director.DirectorReceipt, error) {
	if err := director.ValidateDirectorIntent(intent); err != nil {
		return director.DirectorReceipt{}, fmt.Errorf("validate Director intent: %w", err)
	}
	receipt, err := postBackendJSON[director.DirectorReceipt](
		ctx,
		client,
		"/director/intents/dispatch",
		httpapi.DispatchDirectorIntentRequest{Intent: intent},
	)
	if err != nil {
		return director.DirectorReceipt{}, err
	}
	if err := director.ValidateDirectorReceipt(receipt); err != nil {
		return director.DirectorReceipt{}, fmt.Errorf("validate Director receipt response: %w", err)
	}
	return receipt, nil
}

func (client *BackendClient) ReadConversationSnapshot(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (conversation.ConversationSnapshot, error) {
	snapshot, err := postBackendJSON[conversation.ConversationSnapshot](
		ctx,
		client,
		"/conversations/snapshot/read",
		httpapi.ReadConversationSnapshotRequest{
			WorkspaceID:    &workspaceID,
			ConversationID: conversationID,
		},
	)
	if err != nil {
		return conversation.ConversationSnapshot{}, err
	}
	if err := snapshot.Validate(); err != nil {
		return conversation.ConversationSnapshot{}, fmt.Errorf("validate conversation snapshot response: %w", err)
	}
	if snapshot.Conversation.ID != conversationID || snapshot.Conversation.WorkspaceID == nil ||
		*snapshot.Conversation.WorkspaceID != workspaceID {
		return conversation.ConversationSnapshot{}, fmt.Errorf(
			"conversation snapshot response does not target %s/%s",
			workspaceID,
			conversationID,
		)
	}
	return snapshot, nil
}

func validateBackendBaseURL(value string) (*url.URL, error) {
	if strings.TrimSpace(value) == "" {
		return nil, errors.New("backend base URL is required")
	}
	if strings.TrimSpace(value) != value {
		return nil, errors.New("backend base URL must not have surrounding whitespace")
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return nil, fmt.Errorf("parse backend base URL: %w", err)
	}
	if err := validateBackendOriginShape(parsed, value); err != nil {
		return nil, err
	}
	address, err := netip.ParseAddr(parsed.Hostname())
	if err != nil {
		return nil, fmt.Errorf("backend base URL host must be a numeric loopback address: %s", parsed.Hostname())
	}
	if !address.IsLoopback() {
		return nil, fmt.Errorf("backend base URL host must be a numeric loopback address: %s", parsed.Hostname())
	}
	port := parsed.Port()
	if port == "" {
		return nil, errors.New("backend base URL must include the bound loopback port")
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil {
		return nil, fmt.Errorf("backend base URL has invalid port %q", port)
	}
	if portNumber < 1 || portNumber > 65535 {
		return nil, fmt.Errorf("backend base URL has invalid port %q", port)
	}
	return parsed, nil
}

func validateBackendOriginShape(parsed *url.URL, original string) error {
	if parsed.Scheme != "http" {
		return fmt.Errorf("backend base URL must be an origin-only loopback HTTP URL: %s", original)
	}
	for _, forbidden := range []bool{
		parsed.User != nil,
		parsed.Host == "",
		parsed.Opaque != "",
		parsed.Path != "",
		parsed.RawPath != "",
		parsed.ForceQuery,
		parsed.RawQuery != "",
		parsed.Fragment != "",
	} {
		if forbidden {
			return fmt.Errorf("backend base URL must be an origin-only loopback HTTP URL: %s", original)
		}
	}
	return nil
}

func validateBackendToken(token string) error {
	if token == "" {
		return errors.New("backend bootstrap token is required")
	}
	if len(token) > backendMaximumTokenBytes {
		return fmt.Errorf("backend bootstrap token is %d bytes, maximum is %d", len(token), backendMaximumTokenBytes)
	}
	if strings.ContainsAny(token, " \t\r\n") {
		return errors.New("backend bootstrap token contains whitespace")
	}
	return nil
}

func getBackendJSON[Response any](
	ctx context.Context,
	client *BackendClient,
	path string,
) (Response, error) {
	return doBackendJSON[Response](ctx, client, http.MethodGet, path, nil)
}

func postBackendJSON[Response any](
	ctx context.Context,
	client *BackendClient,
	path string,
	payload any,
) (Response, error) {
	var body bytes.Buffer
	encoder := json.NewEncoder(&body)
	if err := encoder.Encode(payload); err != nil {
		var zero Response
		return zero, fmt.Errorf("encode backend request %s: %w", path, err)
	}
	return doBackendJSON[Response](ctx, client, http.MethodPost, path, &body)
}

func doBackendJSON[Response any](
	ctx context.Context,
	client *BackendClient,
	method string,
	path string,
	body io.Reader,
) (Response, error) {
	var zero Response
	request, err := client.newRequest(ctx, method, path, body)
	if err != nil {
		return zero, err
	}
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := client.httpClient.Do(request)
	if err != nil {
		return zero, fmt.Errorf("send backend request %s %s: %w", method, path, err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return zero, backendResponseError(response, method, path)
	}
	if err := requireResponseMediaType(response, "application/json"); err != nil {
		return zero, err
	}
	limited := io.LimitReader(response.Body, backendMaximumResponseBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return zero, fmt.Errorf("read backend response %s %s: %w", method, path, err)
	}
	if len(data) > backendMaximumResponseBytes {
		return zero, fmt.Errorf("backend response %s %s exceeds %d bytes", method, path, backendMaximumResponseBytes)
	}
	if err := jsonio.DecodeSingle(bytes.NewReader(data), &zero); err != nil {
		return zero, fmt.Errorf("decode backend response %s %s: %w", method, path, err)
	}
	return zero, nil
}

func (client *BackendClient) newRequest(
	ctx context.Context,
	method string,
	path string,
	body io.Reader,
) (*http.Request, error) {
	if client == nil || client.baseURL == nil || client.httpClient == nil {
		return nil, errors.New("backend client is required")
	}
	if ctx == nil {
		return nil, errors.New("backend request context is required")
	}
	if !strings.HasPrefix(path, "/") {
		return nil, fmt.Errorf("backend request path must be absolute: %s", path)
	}
	request, err := http.NewRequestWithContext(ctx, method, client.baseURL.String()+path, body)
	if err != nil {
		return nil, fmt.Errorf("create backend request %s %s: %w", method, path, err)
	}
	request.Header.Set("Authorization", "Bearer "+client.token)
	return request, nil
}

func backendResponseError(response *http.Response, method string, path string) error {
	limited := io.LimitReader(response.Body, backendMaximumDiagnosticBytes+1)
	data, readErr := io.ReadAll(limited)
	if readErr == nil && len(data) <= backendMaximumDiagnosticBytes {
		var payload httpapi.ErrorResponse
		if err := jsonio.DecodeSingle(bytes.NewReader(data), &payload); err == nil &&
			strings.TrimSpace(payload.Error.Code) != "" && strings.TrimSpace(payload.Error.Message) != "" {
			return fmt.Errorf(
				"backend request %s %s returned %d %s: %s",
				method,
				path,
				response.StatusCode,
				payload.Error.Code,
				payload.Error.Message,
			)
		}
	}
	return fmt.Errorf("backend request %s %s returned HTTP %d", method, path, response.StatusCode)
}

func requireResponseMediaType(response *http.Response, expected string) error {
	mediaType, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil || mediaType != expected {
		return fmt.Errorf(
			"backend response %s %s has content type %q, want %s",
			response.Request.Method,
			response.Request.URL.Path,
			response.Header.Get("Content-Type"),
			expected,
		)
	}
	return nil
}
