package sprites

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	spritessdk "github.com/superfly/sprites-go"

	"setta/internal/runtimeprovider"
)

const (
	serviceOperationObservationDuration = 3 * time.Second
	spritesAPIBaseURL                   = "https://api.sprites.dev"
	spritesAPIRequestTimeout            = 30 * time.Second
)

type sdkAPI interface {
	Create(context.Context, string, []string) error
	FindRuntime(context.Context, string) (*spritessdk.SpriteInfo, bool, error)
	Exec(context.Context, runtimeprovider.ExecRequest) (runtimeprovider.ExecResult, error)
	ConfigureURL(context.Context, string, string) error
	ProxySocket(context.Context, string, string, string) (net.Conn, error)
	EnsureService(context.Context, string, runtimeprovider.ServiceSpec) (*spritessdk.ServiceWithState, error)
	FindService(context.Context, string, string) (*spritessdk.ServiceWithState, bool, error)
	ApplyNetworkPolicy(context.Context, string, *spritessdk.NetworkPolicy) error
	InspectNetworkPolicy(context.Context, string) (*spritessdk.NetworkPolicy, error)
	CreateCheckpoint(context.Context, string, string) (*spritessdk.Checkpoint, error)
	FindCheckpoint(context.Context, string, string) (*spritessdk.Checkpoint, bool, error)
	RestoreCheckpoint(context.Context, string, string) error
	Suspend(context.Context, string) error
	Destroy(context.Context, string) error
	ServerVersion(context.Context, string) (string, error)
	OrganizationSnapshot(context.Context) (*sdkOrganizationSnapshot, error)
}

type sdkClient struct {
	client     *spritessdk.Client
	token      string
	baseURL    string
	httpClient *http.Client
}

func newSDKClient(token string) *sdkClient {
	return newSDKClientWithBaseURL(token, spritesAPIBaseURL)

}

func newSDKClientWithBaseURL(token string, baseURL string) *sdkClient {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	return &sdkClient{
		client: spritessdk.New(
			token,
			spritessdk.WithBaseURL(baseURL),
			spritessdk.WithDisableControl(),
		),
		token:      token,
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{Transport: transport, Timeout: spritesAPIRequestTimeout},
	}
}

func (client *sdkClient) Create(ctx context.Context, name string, labels []string) error {
	_, err := client.client.CreateSpriteWithOrg(ctx, name, nil, nil, labels)
	return err
}

func (client *sdkClient) FindRuntime(
	ctx context.Context,
	name string,
) (*spritessdk.SpriteInfo, bool, error) {
	response, body, err := client.requestAPI(
		ctx,
		http.MethodGet,
		"/v1/sprites/"+url.PathEscape(name),
	)
	if err != nil {
		return nil, false, err
	}
	if response.StatusCode == http.StatusNotFound {
		return nil, false, nil
	}
	if response.StatusCode != http.StatusOK {
		return nil, false, spritessdk.ParseAPIError(response, body)
	}
	var runtime spritessdk.SpriteInfo
	if err := json.Unmarshal(body, &runtime); err != nil {
		return nil, false, err
	}
	return &runtime, true, nil
}

func (client *sdkClient) Suspend(ctx context.Context, name string) error {
	response, body, err := client.requestAPI(ctx, http.MethodPost, "/v1/sprites/"+url.PathEscape(name)+"/suspend")
	if err != nil {
		return err
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return spritessdk.ParseAPIError(response, body)
	}
	return nil
}

func (client *sdkClient) Exec(
	ctx context.Context,
	request runtimeprovider.ExecRequest,
) (runtimeprovider.ExecResult, error) {
	command := client.client.Sprite(request.RuntimeName).CommandContext(ctx, request.Path, request.Arguments...)
	command.Dir = request.Directory
	command.Env = sortedEnvironment(request.Environment)
	if request.Stdin != nil {
		command.Stdin = bytes.NewReader(request.Stdin)
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr

	err := command.Run()
	result := runtimeprovider.ExecResult{
		ExitCode: command.ExitCode(),
		Stdout:   slices.Clone(stdout.Bytes()),
		Stderr:   slices.Clone(stderr.Bytes()),
	}
	if err == nil {
		return result, nil
	}
	var exitErr *spritessdk.ExitError
	if errors.As(err, &exitErr) {
		return result, nil
	}
	return result, err
}

func (client *sdkClient) requestAPI(
	ctx context.Context,
	method string,
	path string,
) (*http.Response, []byte, error) {
	request, err := http.NewRequestWithContext(ctx, method, client.baseURL+path, nil)
	if err != nil {
		return nil, nil, err
	}
	request.Header.Set("Authorization", "Bearer "+client.token)

	response, err := client.httpClient.Do(request)
	if err != nil {
		return nil, nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, nil, err
	}
	return response, body, nil
}

func (client *sdkClient) ConfigureURL(ctx context.Context, name string, auth string) error {
	return client.client.UpdateURLSettings(ctx, name, &spritessdk.URLSettings{Auth: auth})
}

func (client *sdkClient) ProxySocket(
	ctx context.Context,
	network string,
	name string,
	address string,
) (net.Conn, error) {
	return client.client.ProxySocket(ctx, network, name, address)
}

func (client *sdkClient) EnsureService(
	ctx context.Context,
	runtimeName string,
	spec runtimeprovider.ServiceSpec,
) (*spritessdk.ServiceWithState, error) {
	request, err := mapServiceSpecToSDK(spec)
	if err != nil {
		return nil, err
	}
	stream, err := client.client.CreateServiceWithDuration(ctx, runtimeName, spec.Name, request, serviceOperationObservationDuration)
	if err != nil {
		return nil, err
	}
	if err := consumeServiceStream(stream); err != nil {
		return nil, err
	}
	service, found, err := client.FindService(ctx, runtimeName, spec.Name)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, ErrIncompleteProviderStream
	}
	return service, nil
}

func (client *sdkClient) FindService(
	ctx context.Context,
	runtimeName string,
	serviceName string,
) (*spritessdk.ServiceWithState, bool, error) {
	services, err := client.client.ListServices(ctx, runtimeName)
	if err != nil {
		return nil, false, err
	}
	for _, service := range services {
		if service.Name == serviceName {
			return service, true, nil
		}
	}
	return nil, false, nil
}

func (client *sdkClient) ApplyNetworkPolicy(
	ctx context.Context,
	name string,
	policy *spritessdk.NetworkPolicy,
) error {
	return client.client.UpdateNetworkPolicy(ctx, name, policy)
}

func (client *sdkClient) InspectNetworkPolicy(
	ctx context.Context,
	name string,
) (*spritessdk.NetworkPolicy, error) {
	return client.client.GetNetworkPolicy(ctx, name)
}

func (client *sdkClient) CreateCheckpoint(
	ctx context.Context,
	name string,
	comment string,
) (*spritessdk.Checkpoint, error) {
	before, err := client.client.ListCheckpoints(ctx, name, "")
	if err != nil {
		return nil, err
	}
	stream, err := client.client.CreateCheckpointWithComment(ctx, name, comment)
	if err != nil {
		return nil, err
	}
	if err := consumeCheckpointStream(stream); err != nil {
		return nil, err
	}
	after, err := client.client.ListCheckpoints(ctx, name, "")
	if err != nil {
		return nil, err
	}
	return singleNewCheckpoint(before, after)
}

func (client *sdkClient) FindCheckpoint(
	ctx context.Context,
	name string,
	checkpointID string,
) (*spritessdk.Checkpoint, bool, error) {
	checkpoints, err := client.client.ListCheckpoints(ctx, name, "")
	if err != nil {
		return nil, false, err
	}
	for _, checkpoint := range checkpoints {
		if checkpoint.ID == checkpointID {
			return checkpoint, true, nil
		}
	}
	return nil, false, nil
}

func (client *sdkClient) RestoreCheckpoint(ctx context.Context, name string, checkpointID string) error {
	stream, err := client.client.RestoreCheckpoint(ctx, name, checkpointID)
	if err != nil {
		return err
	}
	return consumeRestoreStream(stream)
}

func (client *sdkClient) Destroy(ctx context.Context, name string) error {
	return client.client.DeleteSprite(ctx, name)
}

func (client *sdkClient) ServerVersion(ctx context.Context, name string) (string, error) {
	if err := client.client.FetchVersion(ctx, name); err != nil {
		return "", err
	}
	return client.client.SpriteVersion(), nil
}

type sdkOrganizationSnapshot struct {
	Info     spritessdk.OrgInfo
	Runtimes []spritessdk.SpriteInfo
}

type sdkOrganizationPage struct {
	spritessdk.OrgInfo
	Sprites               []spritessdk.SpriteInfo `json:"sprites"`
	HasMore               bool                    `json:"has_more"`
	NextContinuationToken string                  `json:"next_continuation_token"`
}

func (client *sdkClient) OrganizationSnapshot(ctx context.Context) (*sdkOrganizationSnapshot, error) {
	var snapshot sdkOrganizationSnapshot
	seenNames := make(map[string]struct{})
	seenTokens := make(map[string]struct{})
	continuationToken := ""
	for {
		page, err := client.organizationPage(ctx, continuationToken)
		if err != nil {
			return nil, err
		}
		if err := addOrganizationPage(&snapshot, page, seenNames); err != nil {
			return nil, err
		}
		if !page.HasMore {
			return requireCompleteOrganizationSnapshot(&snapshot)
		}
		if page.NextContinuationToken == "" && organizationSnapshotCountMatches(&snapshot) {
			return &snapshot, nil
		}
		if err := rememberContinuationToken(page.NextContinuationToken, seenTokens); err != nil {
			return nil, err
		}
		continuationToken = page.NextContinuationToken
	}
}

func requireCompleteOrganizationSnapshot(
	snapshot *sdkOrganizationSnapshot,
) (*sdkOrganizationSnapshot, error) {
	if !organizationSnapshotCountMatches(snapshot) {
		return nil, fmt.Errorf("%w: organization counters do not match the complete Sprite list", ErrUnexpectedProviderValue)
	}
	return snapshot, nil
}

func organizationSnapshotCountMatches(snapshot *sdkOrganizationSnapshot) bool {
	return snapshot.Info.Running+snapshot.Info.Warm+snapshot.Info.Cold == len(snapshot.Runtimes)
}

func (client *sdkClient) organizationPage(
	ctx context.Context,
	continuationToken string,
) (sdkOrganizationPage, error) {
	const pageSize = 50

	query := url.Values{"max_results": {strconv.Itoa(pageSize)}}
	if continuationToken != "" {
		query.Set("continuation_token", continuationToken)
	}
	response, body, err := client.requestAPI(ctx, http.MethodGet, "/v1/sprites?"+query.Encode())
	if err != nil {
		return sdkOrganizationPage{}, err
	}
	if response.StatusCode != http.StatusOK {
		return sdkOrganizationPage{}, spritessdk.ParseAPIError(response, body)
	}
	var page sdkOrganizationPage
	if err := json.Unmarshal(body, &page); err != nil {
		return sdkOrganizationPage{}, err
	}
	if page.Name == "" || page.RunningLimit < 1 || page.WarmLimit < 1 {
		return sdkOrganizationPage{}, ErrUnexpectedProviderValue
	}
	return page, nil
}

func addOrganizationPage(
	snapshot *sdkOrganizationSnapshot,
	page sdkOrganizationPage,
	seenNames map[string]struct{},
) error {
	if snapshot.Info.Name == "" {
		snapshot.Info = page.OrgInfo
	} else if snapshot.Info != page.OrgInfo {
		return fmt.Errorf("%w: organization capacity changed during pagination", ErrUnexpectedProviderValue)
	}
	for _, runtime := range page.Sprites {
		if runtime.Name == "" {
			return fmt.Errorf("%w: listed Sprite has no name", ErrUnexpectedProviderValue)
		}
		if _, duplicate := seenNames[runtime.Name]; duplicate {
			return fmt.Errorf("%w: duplicate listed Sprite %q", ErrUnexpectedProviderValue, runtime.Name)
		}
		seenNames[runtime.Name] = struct{}{}
		snapshot.Runtimes = append(snapshot.Runtimes, runtime)
	}
	return nil
}

func rememberContinuationToken(token string, seenTokens map[string]struct{}) error {
	if token == "" {
		return fmt.Errorf("%w: paginated Sprite list has no continuation token", ErrUnexpectedProviderValue)
	}
	if _, duplicate := seenTokens[token]; duplicate {
		return fmt.Errorf("%w: repeated Sprite list continuation token", ErrUnexpectedProviderValue)
	}
	seenTokens[token] = struct{}{}
	return nil
}

type serviceStream interface {
	Next() (*spritessdk.ServiceLogEvent, error)
	Close() error
}

func consumeServiceStream(stream serviceStream) error {
	defer stream.Close()
	completed := false
	for {
		event, err := stream.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
		switch event.Type {
		case "stdout", "stderr", "started", "stopping", "stopped", "exit":
		case "complete":
			completed = true
		case "error":
			return ErrIncompleteProviderStream
		default:
			return fmt.Errorf("%w: service stream event %q", ErrUnexpectedProviderValue, event.Type)
		}
	}
	if !completed {
		return ErrIncompleteProviderStream
	}
	return nil
}

type checkpointStream interface {
	Next() (*spritessdk.StreamMessage, error)
	Close() error
}

type mutationStreamError struct {
	operation string
	detail    string
}

func (err *mutationStreamError) Error() string {
	return fmt.Sprintf("%s stream error: %s", err.operation, err.detail)
}

func consumeCheckpointStream(stream checkpointStream) error {
	return consumeMutationStream(stream, "checkpoint")
}

func consumeRestoreStream(stream checkpointStream) error {
	return consumeMutationStream(stream, "restore")
}

func consumeMutationStream(stream checkpointStream, operation string) error {
	defer stream.Close()
	completed := false
	for {
		message, err := stream.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
		switch message.Type {
		case "info", "stdout", "stderr":
		case "complete":
			completed = true
		case "error":
			return &mutationStreamError{operation: operation, detail: streamMessageDetail(message)}
		default:
			return fmt.Errorf("%w: %s stream event %q", ErrUnexpectedProviderValue, operation, message.Type)
		}
	}
	if !completed {
		return ErrIncompleteProviderStream
	}
	return nil
}

func streamMessageDetail(message *spritessdk.StreamMessage) string {
	detail := strings.TrimSpace(message.Error)
	if detail != "" {
		return detail
	}
	detail = strings.TrimSpace(message.Data)
	if detail != "" {
		return detail
	}
	return "provider returned an error event without detail"
}

func singleNewCheckpoint(
	before []*spritessdk.Checkpoint,
	after []*spritessdk.Checkpoint,
) (*spritessdk.Checkpoint, error) {
	existing := make(map[string]struct{}, len(before))
	for _, checkpoint := range before {
		existing[checkpoint.ID] = struct{}{}
	}
	var created *spritessdk.Checkpoint
	for _, checkpoint := range after {
		if _, found := existing[checkpoint.ID]; found {
			continue
		}
		if created != nil {
			return nil, ErrIncompleteProviderStream
		}
		created = checkpoint
	}
	if created == nil {
		return nil, ErrIncompleteProviderStream
	}
	return created, nil
}

func sortedEnvironment(environment map[string]string) []string {
	result := make([]string, 0, len(environment))
	for name, value := range environment {
		result = append(result, name+"="+value)
	}
	sort.Strings(result)
	return result
}

var _ sdkAPI = (*sdkClient)(nil)
