package hostedmeasurement

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

var (
	flyProviderIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,127}$`)
	flyVolumeNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_]{0,63}$`)
)

const (
	DefaultFlyMachinesAPI = "https://api.machines.dev/v1"
	maximumFlyTokenBytes  = 16 * 1024
	maximumFlyResponse    = 2 * 1024 * 1024
)

type FlyMachinesClientConfig struct {
	BaseURL        string
	HTTPClient     *http.Client
	InventoryToken []byte
	MutationToken  []byte
}

type FlyMachinesClient struct {
	baseURL        *url.URL
	httpClient     *http.Client
	inventoryToken string
	mutationToken  string
}

type FlyAPIError struct {
	Operation  string
	StatusCode int
}

func (err *FlyAPIError) Error() string {
	return fmt.Sprintf("Fly Machines API %s returned HTTP %d", err.Operation, err.StatusCode)
}

func NewFlyMachinesClient(config FlyMachinesClientConfig) (*FlyMachinesClient, error) {
	if config.BaseURL == "" {
		config.BaseURL = DefaultFlyMachinesAPI
	}
	baseURL, err := url.Parse(config.BaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse Fly Machines API URL: %w", err)
	}
	if err := validateFlyAPIBaseURL(baseURL); err != nil {
		return nil, err
	}
	if config.HTTPClient == nil {
		return nil, errors.New("Fly Machines API HTTP client is required")
	}
	if config.HTTPClient.Timeout <= 0 {
		return nil, errors.New("Fly Machines API HTTP client must have a positive timeout")
	}
	if err := validateFlyTokens(config.MutationToken, config.InventoryToken); err != nil {
		return nil, err
	}
	return &FlyMachinesClient{
		baseURL:        baseURL,
		httpClient:     config.HTTPClient,
		inventoryToken: string(config.InventoryToken),
		mutationToken:  string(config.MutationToken),
	}, nil
}

func (client *FlyMachinesClient) ListApps(ctx context.Context, organization string) ([]ProviderResource, error) {
	query := make(url.Values)
	query.Set("org_slug", organization)
	var response flyAppsResponse
	if err := client.doJSON(ctx, "list_apps", http.MethodGet, "/apps", query, nil, client.inventoryToken, http.StatusOK, &response); err != nil {
		return nil, err
	}
	if response.TotalApps != len(response.Apps) {
		return nil, errors.New("Fly app inventory is incomplete")
	}
	resources := make([]ProviderResource, 0, len(response.Apps))
	for _, app := range response.Apps {
		resource := ProviderResource{ID: app.ID, Name: app.Name}
		if err := validateProviderResource(resource); err != nil {
			return nil, fmt.Errorf("decode Fly app inventory: %w", err)
		}
		resources = append(resources, resource)
	}
	return resources, nil
}

func (client *FlyMachinesClient) CreateApp(ctx context.Context, organization string, name string) (ProviderResource, error) {
	request := flyCreateAppRequest{AppName: name, Organization: organization}
	var response flyCreateAppResponse
	if err := client.doJSON(ctx, "create_app", http.MethodPost, "/apps", nil, request, client.mutationToken, http.StatusCreated, &response); err != nil {
		return ProviderResource{}, err
	}
	resource := ProviderResource{ID: response.ID, Name: name}
	if err := validateProviderResource(resource); err != nil {
		return ProviderResource{}, fmt.Errorf("decode created Fly app: %w", err)
	}
	return resource, nil
}

func (client *FlyMachinesClient) DestroyApp(ctx context.Context, _ string, name string) error {
	query := make(url.Values)
	query.Set("force", "true")
	path := "/apps/" + url.PathEscape(name)
	return client.doJSON(ctx, "delete_app", http.MethodDelete, path, query, nil, client.mutationToken, http.StatusAccepted, nil)
}

func (client *FlyMachinesClient) ListVolumes(ctx context.Context, appName string) ([]ProviderResource, error) {
	path := "/apps/" + url.PathEscape(appName) + "/volumes"
	var response []flyVolumeResponse
	if err := client.doJSON(ctx, "list_volumes", http.MethodGet, path, nil, nil, client.inventoryToken, http.StatusOK, &response); err != nil {
		return nil, err
	}
	return volumeResources(response)
}

func (client *FlyMachinesClient) CreateVolume(ctx context.Context, spec VolumeSpec) (ProviderResource, error) {
	if err := validateVolumeSpec(spec); err != nil {
		return ProviderResource{}, err
	}
	request := flyCreateVolumeRequest{
		AutoBackupEnabled: spec.ScheduledSnapshots,
		Encrypted:         spec.Encrypted,
		Name:              spec.Name,
		Region:            spec.Region,
		RequireUniqueZone: false,
		SizeGiB:           spec.SizeGiB,
	}
	path := "/apps/" + url.PathEscape(spec.AppName) + "/volumes"
	var response flyVolumeResponse
	if err := client.doJSON(ctx, "create_volume", http.MethodPost, path, nil, request, client.mutationToken, http.StatusOK, &response); err != nil {
		return ProviderResource{}, err
	}
	if err := validateCreatedVolume(response, spec); err != nil {
		return ProviderResource{}, err
	}
	return ProviderResource{ID: response.ID, Name: response.Name, Region: response.Region}, nil
}

func (client *FlyMachinesClient) DestroyVolume(ctx context.Context, appName string, id string) error {
	path := "/apps/" + url.PathEscape(appName) + "/volumes/" + url.PathEscape(id)
	return client.doJSON(ctx, "delete_volume", http.MethodDelete, path, nil, nil, client.mutationToken, http.StatusOK, nil)
}

func (client *FlyMachinesClient) ListMachines(ctx context.Context, appName string) ([]ProviderResource, error) {
	path := "/apps/" + url.PathEscape(appName) + "/machines"
	var response []flyMachineResponse
	if err := client.doJSON(ctx, "list_machines", http.MethodGet, path, nil, nil, client.inventoryToken, http.StatusOK, &response); err != nil {
		return nil, err
	}
	resources := make([]ProviderResource, 0, len(response))
	for _, machine := range response {
		resource := ProviderResource{
			ID: machine.ID, Name: machine.Name, Region: machine.Region,
			ImageDigest: machine.ImageReference.Digest,
		}
		if err := validateProviderResource(resource); err != nil {
			return nil, fmt.Errorf("decode Fly machine inventory: %w", err)
		}
		resources = append(resources, resource)
	}
	return resources, nil
}

func (client *FlyMachinesClient) CreateMachine(ctx context.Context, spec MachineSpec) (ProviderResource, error) {
	if err := validateMachineSpec(spec); err != nil {
		return ProviderResource{}, err
	}
	request := buildCreateMachineRequest(spec)
	path := "/apps/" + url.PathEscape(spec.AppName) + "/machines"
	var response flyMachineResponse
	if err := client.doJSON(ctx, "create_machine", http.MethodPost, path, nil, request, client.mutationToken, http.StatusOK, &response); err != nil {
		return ProviderResource{}, err
	}
	resource := ProviderResource{
		ID: response.ID, Name: response.Name, Region: response.Region,
		ImageDigest: response.ImageReference.Digest,
	}
	if err := validateProviderResource(resource); err != nil {
		return ProviderResource{}, fmt.Errorf("decode created Fly machine: %w", err)
	}
	if resource.Name != spec.Name || resource.Region != spec.Region {
		return ProviderResource{}, errors.New("created Fly machine response differs from the requested identity or region")
	}
	wantDigest := spec.ImageReference[strings.LastIndex(spec.ImageReference, "@")+1:]
	if response.ImageReference.Digest != wantDigest {
		return ProviderResource{}, errors.New("created Fly machine did not attest the requested image digest")
	}
	return resource, nil
}

func (client *FlyMachinesClient) DestroyMachine(ctx context.Context, appName string, id string) error {
	query := make(url.Values)
	query.Set("force", "true")
	path := "/apps/" + url.PathEscape(appName) + "/machines/" + url.PathEscape(id)
	return client.doJSON(ctx, "delete_machine", http.MethodDelete, path, query, nil, client.mutationToken, http.StatusOK, nil)
}

type FlyMachineExecRequest struct {
	AppName        string
	MachineID      string
	Command        string
	Stdin          []byte
	TimeoutSeconds int
}

type FlyMachineExecResult struct {
	ExitCode int
	Stdout   []byte
	Stderr   []byte
}

// ExecMachine executes one bounded command on an exact Machine through the
// typed Machines API. Output is returned only to the caller and is never
// included in transport or status errors.
func (client *FlyMachinesClient) ExecMachine(ctx context.Context, request FlyMachineExecRequest) (FlyMachineExecResult, error) {
	if err := validateFlyMachineExecRequest(request); err != nil {
		return FlyMachineExecResult{}, err
	}
	path := "/apps/" + url.PathEscape(request.AppName) + "/machines/" + url.PathEscape(request.MachineID) + "/exec"
	body := flyMachineExecRequest{
		Command: request.Command, Stdin: string(request.Stdin), TimeoutSeconds: request.TimeoutSeconds,
	}
	var response flyMachineExecResponse
	if err := client.doJSON(ctx, "exec_machine", http.MethodPost, path, nil, body, client.mutationToken, http.StatusOK, &response); err != nil {
		return FlyMachineExecResult{}, err
	}
	return FlyMachineExecResult{
		ExitCode: response.ExitCode, Stdout: []byte(response.Stdout), Stderr: []byte(response.Stderr),
	}, nil
}

func validateFlyMachineExecRequest(request FlyMachineExecRequest) error {
	if !organizationPattern.MatchString(request.AppName) || !flyProviderIDPattern.MatchString(request.MachineID) {
		return errors.New("Fly Machine exec requires an exact app and Machine identity")
	}
	if request.Command == "" || len(request.Command) > 32*1024 || strings.ContainsAny(request.Command, "\x00\r\n") {
		return errors.New("Fly Machine exec command must be a bounded single-line value")
	}
	if len(request.Stdin) > maximumFlyTokenBytes || request.TimeoutSeconds < 1 || request.TimeoutSeconds > 300 {
		return errors.New("Fly Machine exec stdin or timeout exceeds the fixed bounds")
	}
	return nil
}

func (client *FlyMachinesClient) doJSON(
	ctx context.Context,
	operation string,
	method string,
	path string,
	query url.Values,
	body any,
	token string,
	wantStatus int,
	result any,
) error {
	request, err := client.newRequest(ctx, method, path, query, body, token)
	if err != nil {
		return err
	}
	response, err := client.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("Fly Machines API %s transport failed", operation)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return ErrProviderNotFound
	}
	if response.StatusCode != wantStatus {
		return &FlyAPIError{Operation: operation, StatusCode: response.StatusCode}
	}
	responseData, err := io.ReadAll(io.LimitReader(response.Body, maximumFlyResponse+1))
	if err != nil {
		return fmt.Errorf("read Fly Machines API %s response", operation)
	}
	if len(responseData) > maximumFlyResponse {
		return fmt.Errorf("Fly Machines API %s response exceeds the size limit", operation)
	}
	if result == nil {
		return nil
	}
	decoder := json.NewDecoder(bytes.NewReader(responseData))
	if err := decoder.Decode(result); err != nil {
		return fmt.Errorf("decode Fly Machines API %s response: %w", operation, err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return fmt.Errorf("Fly Machines API %s response contains trailing JSON", operation)
	}
	return nil
}

func (client *FlyMachinesClient) newRequest(
	ctx context.Context,
	method string,
	path string,
	query url.Values,
	body any,
	token string,
) (*http.Request, error) {
	var encodedBody []byte
	var err error
	if body != nil {
		encodedBody, err = json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("encode Fly Machines API request: %w", err)
		}
	}
	requestURL := *client.baseURL
	requestURL.Path = strings.TrimSuffix(client.baseURL.Path, "/") + path
	requestURL.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(ctx, method, requestURL.String(), bytes.NewReader(encodedBody))
	if err != nil {
		return nil, fmt.Errorf("build Fly Machines API request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	return request, nil
}

func validateFlyAPIBaseURL(baseURL *url.URL) error {
	if baseURL.Host == "" || baseURL.User != nil || baseURL.RawQuery != "" || baseURL.Fragment != "" {
		return errors.New("Fly Machines API URL must be an absolute credential-free base URL")
	}
	hostname := baseURL.Hostname()
	if baseURL.Scheme != "https" && hostname != "127.0.0.1" && hostname != "::1" && hostname != "localhost" {
		return errors.New("Fly Machines API URL must use HTTPS")
	}
	return nil
}

func validateFlyTokens(mutation []byte, inventory []byte) error {
	if !validFlyToken(mutation) || !validFlyToken(inventory) {
		return errors.New("Fly mutation and inventory tokens must be private printable-ASCII values without outer spaces")
	}
	if len(mutation) == len(inventory) && subtle.ConstantTimeCompare(mutation, inventory) == 1 {
		return errors.New("Fly mutation and inventory tokens must be distinct")
	}
	return nil
}

func validFlyToken(token []byte) bool {
	if len(token) == 0 || len(token) > maximumFlyTokenBytes {
		return false
	}
	if token[0] == ' ' || token[len(token)-1] == ' ' {
		return false
	}
	for _, character := range token {
		if character < 0x20 || character > 0x7e {
			return false
		}
	}
	return true
}

func validateProviderResource(resource ProviderResource) error {
	if !flyProviderIDPattern.MatchString(resource.ID) || !flyProviderIDPattern.MatchString(resource.Name) {
		return errors.New("Fly provider resource has an invalid id or name")
	}
	if resource.Region != "" && !regionPattern.MatchString(resource.Region) {
		return errors.New("Fly provider resource has an invalid region")
	}
	if resource.ImageDigest != "" && !flyDigestPattern.MatchString(resource.ImageDigest) {
		return errors.New("Fly provider resource has an invalid image digest")
	}
	return nil
}

func volumeResources(volumes []flyVolumeResponse) ([]ProviderResource, error) {
	resources := make([]ProviderResource, 0, len(volumes))
	for _, volume := range volumes {
		resource := ProviderResource{ID: volume.ID, Name: volume.Name, Region: volume.Region}
		if err := validateProviderResource(resource); err != nil {
			return nil, fmt.Errorf("decode Fly volume inventory: %w", err)
		}
		resources = append(resources, resource)
	}
	return resources, nil
}

func validateVolumeSpec(spec VolumeSpec) error {
	if spec.AppName == "" || !flyVolumeNamePattern.MatchString(spec.Name) || !regionPattern.MatchString(spec.Region) {
		return errors.New("Fly volume spec requires an app, deterministic name, and region")
	}
	if spec.SizeGiB != 1 || !spec.Encrypted || spec.ScheduledSnapshots {
		return errors.New("Fly volume spec must be encrypted, one GiB, and have scheduled snapshots disabled")
	}
	return nil
}

func validateCreatedVolume(response flyVolumeResponse, spec VolumeSpec) error {
	resource := ProviderResource{ID: response.ID, Name: response.Name, Region: response.Region}
	if err := validateProviderResource(resource); err != nil {
		return fmt.Errorf("decode created Fly volume: %w", err)
	}
	if response.Name != spec.Name || response.Region != spec.Region || response.SizeGiB != spec.SizeGiB || !response.Encrypted {
		return errors.New("created Fly volume response differs from the fixed requested shape")
	}
	if response.AutoBackupEnabled == nil || *response.AutoBackupEnabled {
		return errors.New("created Fly volume did not confirm scheduled snapshots disabled")
	}
	return nil
}

func validateMachineSpec(spec MachineSpec) error {
	if err := validateMachineIdentity(spec); err != nil {
		return err
	}
	if err := validateMachineCompute(spec); err != nil {
		return err
	}
	return validateMachineService(spec)
}

func validateMachineIdentity(spec MachineSpec) error {
	if spec.AppName == "" || spec.Name == "" || !regionPattern.MatchString(spec.Region) || !flyImagePattern.MatchString(spec.ImageReference) {
		return errors.New("Fly machine spec requires app, name, region, and digest-pinned image")
	}
	return nil
}

func validateMachineCompute(spec MachineSpec) error {
	if spec.VolumeID == "" || spec.VolumeMountPath != "/data" || spec.CPUKind != "shared" || spec.CPUs != 1 || spec.MemoryMiB != 256 {
		return errors.New("Fly machine compute or volume shape differs from the fixed measurement shape")
	}
	return nil
}

func validateMachineService(spec MachineSpec) error {
	if spec.InternalPort != 8080 || !spec.ForceHTTPS || spec.HardConcurrencyLimit != 64 || !spec.AutoStartMachines {
		return errors.New("Fly machine service shape differs from the fixed measurement shape")
	}
	if spec.AutoStopMachines != "stop" || spec.MinimumMachines != 0 || spec.HealthPath != "/healthz" {
		return errors.New("Fly machine lifecycle shape differs from the fixed measurement shape")
	}
	return nil
}

func buildCreateMachineRequest(spec MachineSpec) flyCreateMachineRequest {
	return flyCreateMachineRequest{
		Name:   spec.Name,
		Region: spec.Region,
		Config: flyMachineConfig{
			Image: spec.ImageReference,
			Env: map[string]string{
				"SETTA_CONTROL_PLANE_DATA_DIR":       "/data/control-plane",
				"SETTA_CONTROL_PLANE_HOST":           "0.0.0.0",
				"SETTA_CONTROL_PLANE_RUNTIME_TARGET": "127.0.0.1:7345",
				"SETTA_CONTROL_PLANE_SECRET_DIR":     "/data/runtime-secrets",
			},
			Files: []flyMachineFile{{
				GuestPath:  "/run/setta/inner-runtime-credential",
				SecretName: "SETTA_INNER_RUNTIME_CREDENTIAL",
			}},
			Guest:  flyMachineGuest{CPUKind: spec.CPUKind, CPUs: spec.CPUs, MemoryMiB: spec.MemoryMiB},
			Mounts: []flyMachineMount{{Volume: spec.VolumeID, Path: spec.VolumeMountPath}},
			Checks: map[string]flyMachineCheck{
				"healthz": {
					Type: "http", Port: spec.InternalPort, Protocol: "http", Method: http.MethodGet,
					Path: spec.HealthPath, Interval: "10s", Timeout: "2s", GracePeriod: "5s",
				},
			},
			Services: []flyMachineService{{
				Protocol: "tcp", InternalPort: spec.InternalPort,
				Concurrency: flyMachineConcurrency{Type: "requests", HardLimit: spec.HardConcurrencyLimit},
				Ports: []flyMachinePort{
					{Port: 80, Handlers: []string{"http"}, ForceHTTPS: spec.ForceHTTPS},
					{Port: 443, Handlers: []string{"http", "tls"}},
				},
				AutoStart: spec.AutoStartMachines, AutoStop: spec.AutoStopMachines, MinimumMachines: spec.MinimumMachines,
			}},
			Restart: flyMachineRestart{Policy: "always"},
			Processes: []flyMachineProcess{{
				Entrypoint:       []string{"/usr/local/bin/setta-control-plane"},
				Command:          []string{"serve"},
				IgnoreAppSecrets: true,
				Secrets:          []flyMachineProcessSecret{{EnvironmentVariable: "SPRITE_TOKEN"}},
			}},
		},
	}
}

type flyAppsResponse struct {
	TotalApps int              `json:"total_apps"`
	Apps      []flyAppResponse `json:"apps"`
}

type flyAppResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type flyCreateAppRequest struct {
	AppName      string `json:"app_name"`
	Organization string `json:"org_slug"`
}

type flyCreateAppResponse struct {
	ID string `json:"id"`
}

type flyCreateVolumeRequest struct {
	AutoBackupEnabled bool   `json:"auto_backup_enabled"`
	Encrypted         bool   `json:"encrypted"`
	Name              string `json:"name"`
	Region            string `json:"region"`
	RequireUniqueZone bool   `json:"require_unique_zone"`
	SizeGiB           int    `json:"size_gb"`
}

type flyVolumeResponse struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Region            string `json:"region"`
	SizeGiB           int    `json:"size_gb"`
	Encrypted         bool   `json:"encrypted"`
	AutoBackupEnabled *bool  `json:"auto_backup_enabled"`
}

type flyCreateMachineRequest struct {
	Name   string           `json:"name"`
	Region string           `json:"region"`
	Config flyMachineConfig `json:"config"`
}

type flyMachineExecRequest struct {
	Command        string `json:"cmd"`
	Stdin          string `json:"stdin,omitempty"`
	TimeoutSeconds int    `json:"timeout"`
}

type flyMachineExecResponse struct {
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
}

type flyMachineConfig struct {
	Image     string                     `json:"image"`
	Env       map[string]string          `json:"env"`
	Files     []flyMachineFile           `json:"files"`
	Guest     flyMachineGuest            `json:"guest"`
	Mounts    []flyMachineMount          `json:"mounts"`
	Checks    map[string]flyMachineCheck `json:"checks"`
	Services  []flyMachineService        `json:"services"`
	Restart   flyMachineRestart          `json:"restart"`
	Processes []flyMachineProcess        `json:"processes"`
}

type flyMachineFile struct {
	GuestPath  string `json:"guest_path"`
	SecretName string `json:"secret_name"`
}

type flyMachineProcess struct {
	Entrypoint       []string                  `json:"entrypoint"`
	Command          []string                  `json:"cmd"`
	IgnoreAppSecrets bool                      `json:"ignore_app_secrets"`
	Secrets          []flyMachineProcessSecret `json:"secrets"`
}

type flyMachineProcessSecret struct {
	EnvironmentVariable string `json:"env_var"`
}

type flyMachineGuest struct {
	CPUKind   string `json:"cpu_kind"`
	CPUs      int    `json:"cpus"`
	MemoryMiB int    `json:"memory_mb"`
}

type flyMachineMount struct {
	Volume string `json:"volume"`
	Path   string `json:"path"`
}

type flyMachineCheck struct {
	Type        string `json:"type"`
	Port        int    `json:"port"`
	Protocol    string `json:"protocol"`
	Method      string `json:"method"`
	Path        string `json:"path"`
	Interval    string `json:"interval"`
	Timeout     string `json:"timeout"`
	GracePeriod string `json:"grace_period"`
}

type flyMachineService struct {
	Protocol        string                `json:"protocol"`
	InternalPort    int                   `json:"internal_port"`
	Concurrency     flyMachineConcurrency `json:"concurrency"`
	Ports           []flyMachinePort      `json:"ports"`
	AutoStart       bool                  `json:"autostart"`
	AutoStop        string                `json:"autostop"`
	MinimumMachines int                   `json:"min_machines_running"`
}

type flyMachineConcurrency struct {
	Type      string `json:"type"`
	HardLimit int    `json:"hard_limit"`
}

type flyMachinePort struct {
	Port       int      `json:"port"`
	Handlers   []string `json:"handlers"`
	ForceHTTPS bool     `json:"force_https,omitempty"`
}

type flyMachineRestart struct {
	Policy string `json:"policy"`
}

type flyMachineResponse struct {
	ID             string                   `json:"id"`
	Name           string                   `json:"name"`
	Region         string                   `json:"region"`
	ImageReference flyMachineImageReference `json:"image_ref"`
}

type flyMachineImageReference struct {
	Digest string `json:"digest"`
}

var _ FlyProvider = (*FlyMachinesClient)(nil)
