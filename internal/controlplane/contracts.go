// Package controlplane owns the durable records and deployable boundary for
// Setta-managed cloud runtimes.
package controlplane

import (
	"time"

	"setta/internal/runtimeprovider"
)

type UserStatus string
type RuntimeLifecycle string
type RuntimeAccessState string
type RuntimeOperationStatus string

const (
	UserStatusActive    UserStatus = "active"
	UserStatusSuspended UserStatus = "suspended"

	RuntimeLifecycleProvisioning RuntimeLifecycle = "provisioning"
	RuntimeLifecycleReady        RuntimeLifecycle = "ready"
	RuntimeLifecycleDeleting     RuntimeLifecycle = "deleting"
	RuntimeLifecycleFailed       RuntimeLifecycle = "failed"

	RuntimeAccessEnabled   RuntimeAccessState = "enabled"
	RuntimeAccessSuspended RuntimeAccessState = "suspended"

	RuntimeOperationPending   RuntimeOperationStatus = "pending"
	RuntimeOperationRunning   RuntimeOperationStatus = "running"
	RuntimeOperationRetryWait RuntimeOperationStatus = "retry_wait"
	RuntimeOperationSucceeded RuntimeOperationStatus = "succeeded"
	RuntimeOperationFailed    RuntimeOperationStatus = "failed"
	RuntimeOperationCanceled  RuntimeOperationStatus = "canceled"
)

type User struct {
	ID                string
	Status            UserStatus
	ActiveRuntimeName string
	UpdatedAt         time.Time
}

type Runtime struct {
	Name                string
	UserID              string
	Lifecycle           RuntimeLifecycle
	AccessState         RuntimeAccessState
	CredentialEpoch     uint64
	UpstreamAuthority   string
	CredentialSecretRef string
	UpdatedAt           time.Time
}

type Device struct {
	ID          string
	UserID      string
	DisplayName string
	CreatedAt   time.Time
	RevokedAt   *time.Time
}

type RuntimeAccessGrant struct {
	DeviceID    string
	RuntimeName string
	CreatedAt   time.Time
	ExpiresAt   time.Time
	RevokedAt   *time.Time
}

type AssignRuntimeRequest struct {
	IdempotencyKey      string
	UserID              string
	RuntimeName         string
	Lifecycle           RuntimeLifecycle
	AccessState         RuntimeAccessState
	CredentialEpoch     uint64
	UpstreamAuthority   string
	CredentialSecretRef string
}

type CreateDeviceGrantRequest struct {
	UserID      string
	RuntimeName string
	DisplayName string
	GrantTTL    time.Duration
}

type CreatedDeviceGrant struct {
	Device Device
	Grant  RuntimeAccessGrant
	Token  string
}

type DeviceCredential struct {
	DeviceID string `json:"device_id"`
	Token    string `json:"token"`
}

const BootstrapReadyEvent = "control_plane_bootstrap_ready"

type BootstrapEvent struct {
	DeviceID    string `json:"device_id"`
	Event       string `json:"event"`
	RuntimeName string `json:"runtime_name"`
}

type EnsureDeviceGrantRequest struct {
	Credential  DeviceCredential
	UserID      string
	RuntimeName string
	DisplayName string
	GrantTTL    time.Duration
}

type RouteRecord struct {
	RuntimeName         string
	UpstreamAuthority   string
	CredentialSecretRef string
}

type EnsureRuntimeRequest struct {
	IdempotencyKey      string
	UserID              string
	RuntimeName         string
	CredentialEpoch     uint64
	UpstreamAuthority   string
	CredentialSecretRef string
}

type RuntimeOperation struct {
	IdempotencyKey string
	UserID         string
	RuntimeName    string
	Status         RuntimeOperationStatus
	AttemptCount   int
	FenceToken     uint64
	LeaseOwner     string
	LeaseExpiresAt *time.Time
	NextAttemptAt  time.Time
	LastErrorCode  string
	CreatedAt      time.Time
	UpdatedAt      time.Time
	CompletedAt    *time.Time
}

type ProviderObservation struct {
	RuntimeName        string
	ProviderResourceID string
	Activity           runtimeprovider.RuntimeActivity
	URLAccess          runtimeprovider.URLAccess
	Placement          string
	ObservedAt         time.Time
}
