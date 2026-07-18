// Package runtimeprovider defines Setta-owned contracts for externally managed
// development runtimes.
package runtimeprovider

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"slices"
	"time"
)

const (
	managedNamePrefix  = "setta-u-"
	managedLabel       = "setta-managed"
	managedOwnerPrefix = "setta-owner-"
)

// ErrInvalidContract identifies a request that violates the Setta-owned
// provider contract before it reaches an external provider.
var ErrInvalidContract = errors.New("invalid runtime provider contract")

// Provider implements the minimum lifecycle operations required to prove an
// external development-runtime provider. Workload leases are deliberately not
// part of this interface; they are managed inside the runtime through
// WorkloadLeaseManager.
type Provider interface {
	Create(context.Context, CreateRequest) (RuntimeObservation, error)
	Inspect(context.Context, string) (RuntimeObservation, bool, error)
	Exec(context.Context, ExecRequest) (ExecResult, error)
	ConfigureURL(context.Context, string, URLAccess) error
	EnsureService(context.Context, string, ServiceSpec) (ServiceObservation, error)
	InspectService(context.Context, string, string) (ServiceObservation, bool, error)
	ApplyNetworkPolicy(context.Context, string, NetworkPolicy) error
	InspectNetworkPolicy(context.Context, string) (NetworkPolicy, error)
	CreateCheckpoint(context.Context, string, string) (CheckpointObservation, error)
	InspectCheckpoint(context.Context, string, string) (CheckpointObservation, bool, error)
	RestoreCheckpoint(context.Context, string, string) error
	Destroy(context.Context, string) error
}

// ManagedIdentity is the provider-visible identity derived from an
// authoritative Setta owner key. It intentionally contains no raw owner data.
type ManagedIdentity struct {
	Name   string
	Labels []string
}

// NewManagedIdentity deterministically derives one provider name and the exact
// ownership labels Setta uses for a user's runtime.
func NewManagedIdentity(ownerKey string) (ManagedIdentity, error) {
	if ownerKey == "" {
		return ManagedIdentity{}, fmt.Errorf("%w: owner key is empty", ErrInvalidContract)
	}

	digest := fmt.Sprintf("%x", sha256.Sum256([]byte(ownerKey)))[:32]
	return ManagedIdentityFromName(managedNamePrefix + digest)
}

// ManagedIdentityFromName reconstructs the exact ownership labels for a
// previously derived Setta runtime name.
func ManagedIdentityFromName(name string) (ManagedIdentity, error) {
	if err := ValidateManagedName(name); err != nil {
		return ManagedIdentity{}, err
	}
	digest := name[len(managedNamePrefix):]
	return ManagedIdentity{
		Name: name,
		Labels: []string{
			managedLabel,
			managedOwnerPrefix + digest,
		},
	}, nil
}

// Validate rejects provider identities not produced by NewManagedIdentity.
func (identity ManagedIdentity) Validate() error {
	const digestLength = 32

	if len(identity.Name) != len(managedNamePrefix)+digestLength ||
		identity.Name[:min(len(identity.Name), len(managedNamePrefix))] != managedNamePrefix {
		return fmt.Errorf("%w: malformed managed runtime name", ErrInvalidContract)
	}

	digest := identity.Name[len(managedNamePrefix):]
	expectedLabels := []string{managedLabel, managedOwnerPrefix + digest}
	if !slices.Equal(identity.Labels, expectedLabels) {
		return fmt.Errorf("%w: malformed managed runtime labels", ErrInvalidContract)
	}

	for _, character := range digest {
		if (character < '0' || character > '9') && (character < 'a' || character > 'f') {
			return fmt.Errorf("%w: malformed managed runtime digest", ErrInvalidContract)
		}
	}

	return nil
}

// ValidateManagedName rejects names outside Setta's deterministic runtime
// namespace without requiring callers to reconstruct provider labels.
func ValidateManagedName(name string) error {
	const digestLength = 32

	if len(name) != len(managedNamePrefix)+digestLength || name[:len(managedNamePrefix)] != managedNamePrefix {
		return fmt.Errorf("%w: malformed managed runtime name", ErrInvalidContract)
	}
	for _, character := range name[len(managedNamePrefix):] {
		if (character < '0' || character > '9') && (character < 'a' || character > 'f') {
			return fmt.Errorf("%w: malformed managed runtime digest", ErrInvalidContract)
		}
	}
	return nil
}

// CreateRequest describes an idempotent request for a Setta-managed runtime.
type CreateRequest struct {
	Identity ManagedIdentity
}

// RuntimeActivity is an observation of provider activity, not authoritative
// Setta lifecycle state.
type RuntimeActivity string

const (
	RuntimeActivityProvisioning RuntimeActivity = "provisioning"
	RuntimeActivityActive       RuntimeActivity = "active"
	RuntimeActivityWarm         RuntimeActivity = "warm"
	RuntimeActivityCold         RuntimeActivity = "cold"
)

// URLAccess is the Setta-owned subset of URL access modes proven for runtimes.
type URLAccess string

const (
	URLAccessAuthenticated URLAccess = "authenticated"
	URLAccessPublic        URLAccess = "public"
)

// RuntimeObservation contains provider observations without exposing provider
// SDK response types to control-plane code.
type RuntimeObservation struct {
	ProviderResourceID string
	Name               string
	Labels             []string
	Activity           RuntimeActivity
	URL                string
	URLAccess          URLAccess
	Placement          string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// ExecRequest describes a bounded non-interactive command execution.
type ExecRequest struct {
	RuntimeName string
	Path        string
	Arguments   []string
	Directory   string
	Environment map[string]string
	Stdin       []byte
}

// ExecResult contains the completed command result.
type ExecResult struct {
	ExitCode int
	Stdout   []byte
	Stderr   []byte
}

// ServiceSpec describes one restartable runtime service.
type ServiceSpec struct {
	Name      string
	Path      string
	Arguments []string
	Needs     []string
	HTTPPort  *int
}

// ServiceState is the observed state of a restartable service.
type ServiceState string

const (
	ServiceStateStopped  ServiceState = "stopped"
	ServiceStateStarting ServiceState = "starting"
	ServiceStateRunning  ServiceState = "running"
	ServiceStateStopping ServiceState = "stopping"
	ServiceStateFailed   ServiceState = "failed"
)

// ServiceObservation contains provider-neutral service definition and state.
type ServiceObservation struct {
	Spec         ServiceSpec
	State        ServiceState
	ProcessID    int
	RestartCount int
	Failure      string
}

// NetworkRuleAction controls matching outbound DNS domains.
type NetworkRuleAction string

const (
	NetworkRuleAllow NetworkRuleAction = "allow"
	NetworkRuleDeny  NetworkRuleAction = "deny"
)

// NetworkRule is either a domain rule or a provider-defined include profile.
// Exactly one of Domain and Include must be populated.
type NetworkRule struct {
	Action  NetworkRuleAction
	Domain  string
	Include string
}

// NetworkPolicy is an ordered set of outbound network rules.
type NetworkPolicy struct {
	Rules []NetworkRule
}

// CheckpointObservation identifies one whole-runtime filesystem checkpoint.
type CheckpointObservation struct {
	ID        string
	Comment   string
	CreatedAt time.Time
}
