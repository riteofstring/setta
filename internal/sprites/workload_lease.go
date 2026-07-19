package sprites

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"time"

	"setta/internal/runtimeprovider"
)

const (
	defaultManagementSocket = "/.sprite/api.sock"
	managementVirtualHost   = "sprite"
	maximumWorkloadLeaseTTL = time.Hour
	workloadLeaseTimeout    = 10 * time.Second
)

var workloadLeaseNamePattern = regexp.MustCompile(`^[a-z][a-z0-9-]{0,62}$`)

// WorkloadLeaseClient manages the Sprites Tasks API over the trusted
// in-runtime management socket.
type WorkloadLeaseClient struct {
	httpClient *http.Client
}

// WorkloadLeaseError is a content-free Tasks API failure safe to return across
// the trusted-runtime boundary.
type WorkloadLeaseError struct {
	Operation  string
	StatusCode int
	Err        error
}

func (err *WorkloadLeaseError) Error() string {
	if err.StatusCode != 0 {
		return fmt.Sprintf("Sprites workload lease %s failed with HTTP status %d", err.Operation, err.StatusCode)
	}
	return fmt.Sprintf("Sprites workload lease %s failed", err.Operation)
}

func (err *WorkloadLeaseError) Unwrap() error {
	return err.Err
}

// NewWorkloadLeaseClient connects to the standard Sprites management socket.
func NewWorkloadLeaseClient() *WorkloadLeaseClient {
	return newWorkloadLeaseClient(defaultManagementSocket)
}

// NewWorkloadLeaseClientForSocket allows deterministic Unix-socket tests while
// preserving the production wire protocol.
func NewWorkloadLeaseClientForSocket(socketPath string) (*WorkloadLeaseClient, error) {
	if !filepath.IsAbs(socketPath) || filepath.Clean(socketPath) != socketPath {
		return nil, fmt.Errorf("%w: management socket path must be absolute and clean", runtimeprovider.ErrInvalidContract)
	}

	return newWorkloadLeaseClient(socketPath), nil
}

func newWorkloadLeaseClient(socketPath string) *WorkloadLeaseClient {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			dialer := net.Dialer{}
			return dialer.DialContext(ctx, "unix", socketPath)
		},
	}
	return &WorkloadLeaseClient{
		httpClient: &http.Client{Transport: transport, Timeout: workloadLeaseTimeout},
	}
}

func (client *WorkloadLeaseClient) Acquire(
	ctx context.Context,
	request runtimeprovider.WorkloadLeaseRequest,
) (runtimeprovider.WorkloadLease, error) {
	if err := validateWorkloadLease(request.Name, request.TTL); err != nil {
		return runtimeprovider.WorkloadLease{}, err
	}

	body := workloadLeaseMutation{Name: request.Name, Expire: int64(request.TTL / time.Second)}
	return client.mutate(ctx, http.MethodPost, "/v1/tasks", body, http.StatusCreated, "acquire")
}

func (client *WorkloadLeaseClient) Renew(
	ctx context.Context,
	name string,
	ttl time.Duration,
) (runtimeprovider.WorkloadLease, error) {
	if err := validateWorkloadLease(name, ttl); err != nil {
		return runtimeprovider.WorkloadLease{}, err
	}

	body := workloadLeaseMutation{Expire: int64(ttl / time.Second)}
	return client.mutate(
		ctx,
		http.MethodPut,
		"/v1/tasks/"+url.PathEscape(name),
		body,
		http.StatusOK,
		"renew",
	)
}

func (client *WorkloadLeaseClient) Inspect(
	ctx context.Context,
	name string,
) (runtimeprovider.WorkloadLease, bool, error) {
	if err := validateWorkloadLeaseName(name); err != nil {
		return runtimeprovider.WorkloadLease{}, false, err
	}

	response, err := client.request(ctx, http.MethodGet, "/v1/tasks/"+url.PathEscape(name), nil)
	if err != nil {
		return runtimeprovider.WorkloadLease{}, false, &WorkloadLeaseError{Operation: "inspect", Err: err}
	}
	defer response.Body.Close()

	if response.StatusCode == http.StatusNotFound {
		return runtimeprovider.WorkloadLease{}, false, nil
	}
	if response.StatusCode != http.StatusOK {
		return runtimeprovider.WorkloadLease{}, false, &WorkloadLeaseError{
			Operation:  "inspect",
			StatusCode: response.StatusCode,
		}
	}

	lease, err := decodeWorkloadLease(response)
	if err != nil {
		return runtimeprovider.WorkloadLease{}, false, &WorkloadLeaseError{Operation: "inspect", Err: err}
	}
	return lease, true, nil
}

func (client *WorkloadLeaseClient) Release(ctx context.Context, name string) error {
	if err := validateWorkloadLeaseName(name); err != nil {
		return err
	}

	response, err := client.request(ctx, http.MethodDelete, "/v1/tasks/"+url.PathEscape(name), nil)
	if err != nil {
		return &WorkloadLeaseError{Operation: "release", Err: err}
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusNoContent && response.StatusCode != http.StatusNotFound {
		return &WorkloadLeaseError{Operation: "release", StatusCode: response.StatusCode}
	}
	return nil
}

type workloadLeaseMutation struct {
	Name   string `json:"name,omitempty"`
	Expire int64  `json:"expire"`
}

type workloadLeaseResponse struct {
	Name      string    `json:"name"`
	StartedAt time.Time `json:"started_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

func (client *WorkloadLeaseClient) mutate(
	ctx context.Context,
	method string,
	path string,
	body workloadLeaseMutation,
	expectedStatus int,
	operation string,
) (runtimeprovider.WorkloadLease, error) {
	encoded, err := json.Marshal(body)
	if err != nil {
		return runtimeprovider.WorkloadLease{}, &WorkloadLeaseError{Operation: operation, Err: err}
	}

	response, err := client.request(ctx, method, path, encoded)
	if err != nil {
		return runtimeprovider.WorkloadLease{}, &WorkloadLeaseError{Operation: operation, Err: err}
	}
	defer response.Body.Close()

	if response.StatusCode != expectedStatus {
		return runtimeprovider.WorkloadLease{}, &WorkloadLeaseError{
			Operation:  operation,
			StatusCode: response.StatusCode,
		}
	}

	lease, err := decodeWorkloadLease(response)
	if err != nil {
		return runtimeprovider.WorkloadLease{}, &WorkloadLeaseError{Operation: operation, Err: err}
	}
	return lease, nil
}

func (client *WorkloadLeaseClient) request(
	ctx context.Context,
	method string,
	path string,
	body []byte,
) (*http.Response, error) {
	request, err := http.NewRequestWithContext(
		ctx,
		method,
		"http://"+managementVirtualHost+path,
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}
	request.Host = managementVirtualHost
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	return client.httpClient.Do(request)
}

func decodeWorkloadLease(response *http.Response) (runtimeprovider.WorkloadLease, error) {
	var decoded workloadLeaseResponse
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		return runtimeprovider.WorkloadLease{}, err
	}
	if decoded.Name == "" || decoded.StartedAt.IsZero() || decoded.ExpiresAt.IsZero() {
		return runtimeprovider.WorkloadLease{}, errors.New("Tasks API returned an incomplete workload lease")
	}
	return runtimeprovider.WorkloadLease{
		Name:      decoded.Name,
		StartedAt: decoded.StartedAt,
		ExpiresAt: decoded.ExpiresAt,
	}, nil
}

func validateWorkloadLease(name string, ttl time.Duration) error {
	if err := validateWorkloadLeaseName(name); err != nil {
		return err
	}
	if ttl < time.Second || ttl > maximumWorkloadLeaseTTL || ttl%time.Second != 0 {
		return fmt.Errorf(
			"%w: workload lease TTL must be whole seconds from 1s through %s",
			runtimeprovider.ErrInvalidContract,
			maximumWorkloadLeaseTTL,
		)
	}
	return nil
}

func validateWorkloadLeaseName(name string) error {
	if !workloadLeaseNamePattern.MatchString(name) {
		return fmt.Errorf("%w: malformed workload lease name", runtimeprovider.ErrInvalidContract)
	}
	return nil
}

var _ runtimeprovider.WorkloadLeaseManager = (*WorkloadLeaseClient)(nil)
