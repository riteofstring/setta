package sprites

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	spritessdk "github.com/superfly/sprites-go"

	"setta/internal/runtimeprovider"
)

var (
	// ErrOwnershipMismatch prevents Setta from adopting or mutating a provider
	// resource whose labels do not match its deterministic identity.
	ErrOwnershipMismatch = errors.New("Sprites runtime ownership mismatch")
	// ErrUnexpectedProviderValue identifies a provider response outside the
	// pinned and live-proven contract.
	ErrUnexpectedProviderValue = errors.New("unexpected Sprites provider value")
	// ErrIncompleteProviderStream identifies a streaming mutation that ended
	// without an explicit completion event.
	ErrIncompleteProviderStream = errors.New("incomplete Sprites provider stream")
)

const (
	// spritesServiceIdentityWrapperPath is the documented fallback for
	// runtimeprovider.ServiceSpec.RunAs. The pinned sprites-go ServiceRequest
	// exposes only cmd, args, needs, and http_port, so Sprites cannot set a
	// service user natively. The adapter asks sprite-env to start setpriv under
	// the provider default identity; setpriv then execs the requested service
	// command under the requested runtime user and group.
	spritesServiceIdentityWrapperPath = "/usr/bin/setpriv"
)

// OperationError adds a content-free operation boundary while retaining typed
// causes for errors.Is and errors.As.
type OperationError struct {
	Operation  string
	StatusCode int
	RetryAfter int
	Err        error
}

func (err *OperationError) Error() string {
	if err.StatusCode != 0 {
		return fmt.Sprintf("Sprites %s failed with HTTP status %d", err.Operation, err.StatusCode)
	}
	return fmt.Sprintf("Sprites %s failed", err.Operation)
}

func (err *OperationError) Unwrap() error {
	return err.Err
}

// Adapter implements the Setta lifecycle contract through the pinned official
// Sprites Go SDK.
type Adapter struct {
	client sdkAPI
}

// NewAdapter constructs a production Sprites lifecycle adapter.
func NewAdapter(token string) (*Adapter, error) {
	if token == "" {
		return nil, fmt.Errorf("%w: Sprites token is empty", runtimeprovider.ErrInvalidContract)
	}
	return &Adapter{client: newSDKClient(token)}, nil
}

func (adapter *Adapter) Create(
	ctx context.Context,
	request runtimeprovider.CreateRequest,
) (runtimeprovider.RuntimeObservation, error) {
	if err := request.Identity.Validate(); err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}

	existing, found, err := adapter.inspect(ctx, request.Identity.Name)
	if err != nil {
		return runtimeprovider.RuntimeObservation{}, operationError("inspect before create", err)
	}
	if found {
		return requireOwnedObservation(request.Identity, existing)
	}

	if err := adapter.client.Create(ctx, request.Identity.Name, request.Identity.Labels); err != nil {
		return adapter.reconcileFailedCreate(ctx, request.Identity, err)
	}
	return adapter.inspectCreatedRuntime(ctx, request.Identity)
}

func (adapter *Adapter) inspectCreatedRuntime(
	ctx context.Context,
	identity runtimeprovider.ManagedIdentity,
) (runtimeprovider.RuntimeObservation, error) {
	created, found, err := adapter.inspect(ctx, identity.Name)
	if err != nil {
		return runtimeprovider.RuntimeObservation{}, operationError("inspect after create", err)
	}
	if !found {
		return runtimeprovider.RuntimeObservation{}, operationError("inspect after create", ErrIncompleteProviderStream)
	}
	return requireOwnedObservation(identity, created)
}

func (adapter *Adapter) reconcileFailedCreate(
	ctx context.Context,
	identity runtimeprovider.ManagedIdentity,
	createErr error,
) (runtimeprovider.RuntimeObservation, error) {
	adopted, found, inspectErr := adapter.inspect(ctx, identity.Name)
	if inspectErr != nil || !found {
		return runtimeprovider.RuntimeObservation{}, operationError("create", createErr)
	}
	return requireOwnedObservation(identity, adopted)
}

func (adapter *Adapter) Inspect(
	ctx context.Context,
	name string,
) (runtimeprovider.RuntimeObservation, bool, error) {
	if err := runtimeprovider.ValidateManagedName(name); err != nil {
		return runtimeprovider.RuntimeObservation{}, false, err
	}
	observation, found, err := adapter.inspect(ctx, name)
	if err != nil {
		return runtimeprovider.RuntimeObservation{}, false, operationError("inspect", err)
	}
	return observation, found, nil
}

func (adapter *Adapter) Exec(
	ctx context.Context,
	request runtimeprovider.ExecRequest,
) (runtimeprovider.ExecResult, error) {
	if request.Path == "" {
		return runtimeprovider.ExecResult{}, fmt.Errorf("%w: exec path is empty", runtimeprovider.ErrInvalidContract)
	}
	if _, err := adapter.requireOwnedRuntime(ctx, request.RuntimeName); err != nil {
		return runtimeprovider.ExecResult{}, err
	}

	result, err := adapter.client.Exec(ctx, request)
	if err != nil {
		return result, operationError("exec", err)
	}
	return result, nil
}

func (adapter *Adapter) ConfigureURL(ctx context.Context, name string, access runtimeprovider.URLAccess) error {
	if _, err := adapter.requireOwnedRuntime(ctx, name); err != nil {
		return err
	}

	var providerAuth string
	switch access {
	case runtimeprovider.URLAccessAuthenticated:
		providerAuth = "sprite"
	case runtimeprovider.URLAccessPublic:
		providerAuth = "public"
	default:
		return fmt.Errorf("%w: unsupported URL access %q", runtimeprovider.ErrInvalidContract, access)
	}
	if err := adapter.client.ConfigureURL(ctx, name, providerAuth); err != nil {
		return operationError("configure URL", err)
	}
	return nil
}

func (adapter *Adapter) EnsureService(
	ctx context.Context,
	runtimeName string,
	spec runtimeprovider.ServiceSpec,
) (runtimeprovider.ServiceObservation, error) {
	if err := validateServiceSpec(spec); err != nil {
		return runtimeprovider.ServiceObservation{}, err
	}
	if _, err := adapter.requireOwnedRuntime(ctx, runtimeName); err != nil {
		return runtimeprovider.ServiceObservation{}, err
	}

	service, err := adapter.client.EnsureService(ctx, runtimeName, spec)
	if err != nil {
		return runtimeprovider.ServiceObservation{}, operationError("ensure service", err)
	}
	observation, err := mapService(service)
	if err != nil {
		return runtimeprovider.ServiceObservation{}, operationError("ensure service", err)
	}
	return observation, nil
}

func (adapter *Adapter) InspectService(
	ctx context.Context,
	runtimeName string,
	serviceName string,
) (runtimeprovider.ServiceObservation, bool, error) {
	if _, err := adapter.requireOwnedRuntime(ctx, runtimeName); err != nil {
		return runtimeprovider.ServiceObservation{}, false, err
	}
	if err := validateProviderPathName("service", serviceName); err != nil {
		return runtimeprovider.ServiceObservation{}, false, err
	}

	service, found, err := adapter.client.FindService(ctx, runtimeName, serviceName)
	if err != nil {
		return runtimeprovider.ServiceObservation{}, false, operationError("inspect service", err)
	}
	if !found {
		return runtimeprovider.ServiceObservation{}, false, nil
	}
	observation, err := mapService(service)
	if err != nil {
		return runtimeprovider.ServiceObservation{}, false, operationError("inspect service", err)
	}
	return observation, true, nil
}

func (adapter *Adapter) ApplyNetworkPolicy(
	ctx context.Context,
	name string,
	policy runtimeprovider.NetworkPolicy,
) error {
	if _, err := adapter.requireOwnedRuntime(ctx, name); err != nil {
		return err
	}
	providerPolicy, err := mapNetworkPolicyToSDK(policy)
	if err != nil {
		return err
	}
	if err := adapter.client.ApplyNetworkPolicy(ctx, name, providerPolicy); err != nil {
		return operationError("apply network policy", err)
	}
	return nil
}

func (adapter *Adapter) InspectNetworkPolicy(
	ctx context.Context,
	name string,
) (runtimeprovider.NetworkPolicy, error) {
	if _, err := adapter.requireOwnedRuntime(ctx, name); err != nil {
		return runtimeprovider.NetworkPolicy{}, err
	}
	policy, err := adapter.client.InspectNetworkPolicy(ctx, name)
	if err != nil {
		return runtimeprovider.NetworkPolicy{}, operationError("inspect network policy", err)
	}
	observation, err := mapNetworkPolicyFromSDK(policy)
	if err != nil {
		return runtimeprovider.NetworkPolicy{}, operationError("inspect network policy", err)
	}
	return observation, nil
}

func (adapter *Adapter) CreateCheckpoint(
	ctx context.Context,
	name string,
	comment string,
) (runtimeprovider.CheckpointObservation, error) {
	if _, err := adapter.requireOwnedRuntime(ctx, name); err != nil {
		return runtimeprovider.CheckpointObservation{}, err
	}
	if strings.TrimSpace(comment) == "" {
		return runtimeprovider.CheckpointObservation{}, fmt.Errorf(
			"%w: checkpoint comment is empty",
			runtimeprovider.ErrInvalidContract,
		)
	}
	checkpoint, err := adapter.client.CreateCheckpoint(ctx, name, comment)
	if err != nil {
		return runtimeprovider.CheckpointObservation{}, operationError("create checkpoint", err)
	}
	observation, err := mapCheckpoint(checkpoint)
	if err != nil {
		return runtimeprovider.CheckpointObservation{}, operationError("create checkpoint", err)
	}
	return observation, nil
}

func (adapter *Adapter) InspectCheckpoint(
	ctx context.Context,
	runtimeName string,
	checkpointID string,
) (runtimeprovider.CheckpointObservation, bool, error) {
	if _, err := adapter.requireOwnedRuntime(ctx, runtimeName); err != nil {
		return runtimeprovider.CheckpointObservation{}, false, err
	}
	if err := validateProviderPathName("checkpoint", checkpointID); err != nil {
		return runtimeprovider.CheckpointObservation{}, false, err
	}
	checkpoint, found, err := adapter.client.FindCheckpoint(ctx, runtimeName, checkpointID)
	if err != nil {
		return runtimeprovider.CheckpointObservation{}, false, operationError("inspect checkpoint", err)
	}
	if !found {
		return runtimeprovider.CheckpointObservation{}, false, nil
	}
	observation, err := mapCheckpoint(checkpoint)
	if err != nil {
		return runtimeprovider.CheckpointObservation{}, false, operationError("inspect checkpoint", err)
	}
	return observation, true, nil
}

func (adapter *Adapter) RestoreCheckpoint(ctx context.Context, runtimeName string, checkpointID string) error {
	if _, err := adapter.requireOwnedRuntime(ctx, runtimeName); err != nil {
		return err
	}
	if err := validateProviderPathName("checkpoint", checkpointID); err != nil {
		return err
	}
	if err := adapter.client.RestoreCheckpoint(ctx, runtimeName, checkpointID); err != nil {
		return operationError("restore checkpoint", err)
	}
	return nil
}

func (adapter *Adapter) Destroy(ctx context.Context, name string) error {
	observation, found, err := adapter.Inspect(ctx, name)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}
	identity, err := runtimeprovider.ManagedIdentityFromName(name)
	if err != nil {
		return err
	}
	if err := requireLabels(identity, observation.Labels); err != nil {
		return err
	}
	if err := adapter.client.Destroy(ctx, name); err != nil {
		return operationError("destroy", err)
	}
	return nil
}

// ServerVersion returns the version reported by the live Sprite environment.
// It is evidence for the Phase 1b harness, not a control-plane lifecycle field.
func (adapter *Adapter) ServerVersion(ctx context.Context, name string) (string, error) {
	if _, err := adapter.requireOwnedRuntime(ctx, name); err != nil {
		return "", err
	}
	version, err := adapter.client.ServerVersion(ctx, name)
	if err != nil {
		return "", operationError("inspect server version", err)
	}
	if version == "" {
		return "", operationError("inspect server version", ErrUnexpectedProviderValue)
	}
	return version, nil
}

type organizationCapacity struct {
	Running      int
	Warm         int
	Cold         int
	RunningLimit int
	WarmLimit    int
}

func (adapter *Adapter) organizationCapacity(ctx context.Context) (organizationCapacity, error) {
	snapshot, err := adapter.client.OrganizationSnapshot(ctx)
	if err != nil {
		return organizationCapacity{}, operationError("inspect organization capacity", err)
	}
	return organizationCapacity{
		Running:      snapshot.Info.Running,
		Warm:         snapshot.Info.Warm,
		Cold:         snapshot.Info.Cold,
		RunningLimit: snapshot.Info.RunningLimit,
		WarmLimit:    snapshot.Info.WarmLimit,
	}, nil
}

func (adapter *Adapter) inspect(
	ctx context.Context,
	name string,
) (runtimeprovider.RuntimeObservation, bool, error) {
	runtime, found, err := adapter.client.FindRuntime(ctx, name)
	if err != nil || !found {
		return runtimeprovider.RuntimeObservation{}, found, err
	}
	observation, err := mapRuntime(runtime)
	if err != nil {
		return runtimeprovider.RuntimeObservation{}, false, err
	}
	return observation, true, nil
}

func (adapter *Adapter) requireOwnedRuntime(
	ctx context.Context,
	name string,
) (runtimeprovider.RuntimeObservation, error) {
	observation, found, err := adapter.Inspect(ctx, name)
	if err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	if !found {
		return runtimeprovider.RuntimeObservation{}, operationError("verify ownership", ErrUnexpectedProviderValue)
	}
	identity, err := runtimeprovider.ManagedIdentityFromName(name)
	if err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	if err := requireLabels(identity, observation.Labels); err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	return observation, nil
}

func mapRuntime(runtime *spritessdk.SpriteInfo) (runtimeprovider.RuntimeObservation, error) {
	if runtime == nil {
		return runtimeprovider.RuntimeObservation{}, fmt.Errorf("%w: missing runtime", ErrUnexpectedProviderValue)
	}
	activity, err := mapRuntimeActivity(runtime.Status)
	if err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	if runtime.URLSettings == nil {
		return runtimeprovider.RuntimeObservation{}, fmt.Errorf(
			"%w: missing URL settings",
			ErrUnexpectedProviderValue,
		)
	}
	var access runtimeprovider.URLAccess
	switch runtime.URLSettings.Auth {
	case "", "sprite":
		access = runtimeprovider.URLAccessAuthenticated
	case "public":
		access = runtimeprovider.URLAccessPublic
	default:
		return runtimeprovider.RuntimeObservation{}, fmt.Errorf(
			"%w: URL auth %q",
			ErrUnexpectedProviderValue,
			runtime.URLSettings.Auth,
		)
	}
	return runtimeprovider.RuntimeObservation{
		ProviderResourceID: runtime.ID,
		Name:               runtime.Name,
		Labels:             slices.Clone(runtime.Labels),
		Activity:           activity,
		URL:                runtime.URL,
		URLAccess:          access,
		Placement:          runtime.PrimaryRegion,
		CreatedAt:          runtime.CreatedAt,
		UpdatedAt:          runtime.UpdatedAt,
	}, nil
}

func mapRuntimeActivity(status string) (runtimeprovider.RuntimeActivity, error) {
	switch status {
	case "created", "provisioning":
		return runtimeprovider.RuntimeActivityProvisioning, nil
	case "running":
		return runtimeprovider.RuntimeActivityActive, nil
	case "warm":
		return runtimeprovider.RuntimeActivityWarm, nil
	case "cold":
		return runtimeprovider.RuntimeActivityCold, nil
	default:
		return "", fmt.Errorf("%w: runtime status %q", ErrUnexpectedProviderValue, status)
	}
}

func mapService(service *spritessdk.ServiceWithState) (runtimeprovider.ServiceObservation, error) {
	if service == nil || service.State == nil {
		return runtimeprovider.ServiceObservation{}, fmt.Errorf("%w: missing service state", ErrUnexpectedProviderValue)
	}
	var state runtimeprovider.ServiceState
	switch service.State.Status {
	case "stopped":
		state = runtimeprovider.ServiceStateStopped
	case "starting":
		state = runtimeprovider.ServiceStateStarting
	case "running":
		state = runtimeprovider.ServiceStateRunning
	case "stopping":
		state = runtimeprovider.ServiceStateStopping
	case "failed":
		state = runtimeprovider.ServiceStateFailed
	default:
		return runtimeprovider.ServiceObservation{}, fmt.Errorf(
			"%w: service status %q",
			ErrUnexpectedProviderValue,
			service.State.Status,
		)
	}
	var httpPort *int
	if service.HTTPPort != nil {
		value := *service.HTTPPort
		httpPort = &value
	}
	commandPath, arguments, runAs, err := mapServiceCommandFromSDK(service.Cmd, service.Args)
	if err != nil {
		return runtimeprovider.ServiceObservation{}, err
	}
	return runtimeprovider.ServiceObservation{
		Spec: runtimeprovider.ServiceSpec{
			Name:      service.Name,
			Path:      commandPath,
			Arguments: arguments,
			Needs:     slices.Clone(service.Needs),
			HTTPPort:  httpPort,
			RunAs:     runAs,
		},
		State:        state,
		ProcessID:    service.State.PID,
		RestartCount: service.State.RestartCount,
		Failure:      service.State.Error,
	}, nil
}

func mapNetworkPolicyToSDK(policy runtimeprovider.NetworkPolicy) (*spritessdk.NetworkPolicy, error) {
	mapped := &spritessdk.NetworkPolicy{Rules: make([]spritessdk.NetworkPolicyRule, 0, len(policy.Rules))}
	for _, rule := range policy.Rules {
		if (rule.Domain == "") == (rule.Include == "") {
			return nil, fmt.Errorf("%w: network rule must set exactly one selector", runtimeprovider.ErrInvalidContract)
		}
		if rule.Include != "" {
			if rule.Action != "" {
				return nil, fmt.Errorf("%w: included network rule has an action", runtimeprovider.ErrInvalidContract)
			}
		} else if rule.Action != runtimeprovider.NetworkRuleAllow && rule.Action != runtimeprovider.NetworkRuleDeny {
			return nil, fmt.Errorf("%w: invalid network rule action %q", runtimeprovider.ErrInvalidContract, rule.Action)
		}
		mapped.Rules = append(mapped.Rules, spritessdk.NetworkPolicyRule{
			Domain:  rule.Domain,
			Action:  string(rule.Action),
			Include: rule.Include,
		})
	}
	return mapped, nil
}

func mapNetworkPolicyFromSDK(policy *spritessdk.NetworkPolicy) (runtimeprovider.NetworkPolicy, error) {
	if policy == nil {
		return runtimeprovider.NetworkPolicy{}, fmt.Errorf("%w: missing network policy", ErrUnexpectedProviderValue)
	}
	mapped := runtimeprovider.NetworkPolicy{Rules: make([]runtimeprovider.NetworkRule, 0, len(policy.Rules))}
	for _, rule := range policy.Rules {
		candidate := runtimeprovider.NetworkRule{
			Action:  runtimeprovider.NetworkRuleAction(rule.Action),
			Domain:  rule.Domain,
			Include: rule.Include,
		}
		if _, err := mapNetworkPolicyToSDK(runtimeprovider.NetworkPolicy{Rules: []runtimeprovider.NetworkRule{candidate}}); err != nil {
			return runtimeprovider.NetworkPolicy{}, fmt.Errorf("%w: %v", ErrUnexpectedProviderValue, err)
		}
		mapped.Rules = append(mapped.Rules, candidate)
	}
	return mapped, nil
}

func mapCheckpoint(checkpoint *spritessdk.Checkpoint) (runtimeprovider.CheckpointObservation, error) {
	if checkpoint == nil || checkpoint.ID == "" {
		return runtimeprovider.CheckpointObservation{}, fmt.Errorf(
			"%w: missing checkpoint",
			ErrUnexpectedProviderValue,
		)
	}
	return runtimeprovider.CheckpointObservation{
		ID:        checkpoint.ID,
		Comment:   checkpoint.Comment,
		CreatedAt: checkpoint.CreateTime,
	}, nil
}

func requireLabels(identity runtimeprovider.ManagedIdentity, actual []string) error {
	expected := slices.Clone(identity.Labels)
	actual = slices.Clone(actual)
	slices.Sort(expected)
	slices.Sort(actual)
	if !slices.Equal(expected, actual) {
		return ErrOwnershipMismatch
	}
	return nil
}

func requireOwnedObservation(
	identity runtimeprovider.ManagedIdentity,
	observation runtimeprovider.RuntimeObservation,
) (runtimeprovider.RuntimeObservation, error) {
	if err := requireLabels(identity, observation.Labels); err != nil {
		return runtimeprovider.RuntimeObservation{}, err
	}
	return observation, nil
}

func validateServiceSpec(spec runtimeprovider.ServiceSpec) error {
	return spec.Validate()
}

func validateProviderPathName(kind string, name string) error {
	if !workloadLeaseNamePattern.MatchString(name) {
		return fmt.Errorf("%w: malformed %s name", runtimeprovider.ErrInvalidContract, kind)
	}
	return nil
}

func operationError(operation string, err error) error {
	if err == nil {
		return nil
	}
	result := &OperationError{Operation: operation, Err: err}
	var apiErr *spritessdk.APIError
	if errors.As(err, &apiErr) {
		result.StatusCode = apiErr.StatusCode
		result.RetryAfter = apiErr.GetRetryAfterSeconds()
	}
	return result
}

var _ runtimeprovider.Provider = (*Adapter)(nil)

func mapServiceSpecToSDK(spec runtimeprovider.ServiceSpec) (*spritessdk.ServiceRequest, error) {
	if err := validateServiceSpec(spec); err != nil {
		return nil, err
	}

	commandPath := spec.Path
	arguments := slices.Clone(spec.Arguments)
	if !spec.RunAs.IsZero() {
		commandPath, arguments = wrapServiceCommandForIdentity(commandPath, arguments, spec.RunAs)
	}
	return &spritessdk.ServiceRequest{
		Cmd:      commandPath,
		Args:     arguments,
		Needs:    slices.Clone(spec.Needs),
		HTTPPort: spec.HTTPPort,
	}, nil
}

func wrapServiceCommandForIdentity(
	commandPath string,
	arguments []string,
	identity runtimeprovider.ServiceIdentity,
) (string, []string) {
	wrapped := []string{
		"--reuid", identity.User,
		"--regid", identity.Group,
		"--clear-groups",
		"--",
		commandPath,
	}
	wrapped = append(wrapped, arguments...)
	return spritesServiceIdentityWrapperPath, wrapped
}

func mapServiceCommandFromSDK(
	commandPath string,
	arguments []string,
) (string, []string, runtimeprovider.ServiceIdentity, error) {
	if commandPath != spritesServiceIdentityWrapperPath {
		return commandPath, slices.Clone(arguments), runtimeprovider.ServiceIdentity{}, nil
	}
	if len(arguments) < 7 ||
		arguments[0] != "--reuid" ||
		arguments[2] != "--regid" ||
		arguments[4] != "--clear-groups" ||
		arguments[5] != "--" ||
		!strings.HasPrefix(arguments[6], "/") {
		return commandPath, slices.Clone(arguments), runtimeprovider.ServiceIdentity{}, nil
	}
	runAs := runtimeprovider.ServiceIdentity{User: arguments[1], Group: arguments[3]}
	if err := runAs.Validate(); err != nil {
		return "", nil, runtimeprovider.ServiceIdentity{}, fmt.Errorf("%w: %v", ErrUnexpectedProviderValue, err)
	}
	return arguments[6], slices.Clone(arguments[7:]), runAs, nil
}
