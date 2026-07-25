// Package credissuer implements the bounded in-process credential authority
// used by the Sprites cloud-platform proof of concept.
package credissuer

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"

	"setta/internal/runtimeprovider"
	"setta/internal/runtimesetup"
)

const (
	CredentialAlgorithm = "setta-runtime-access-ed25519-v1"

	DefaultCredentialTTL = 5 * time.Minute
	MaxCredentialTTL     = 5 * time.Minute
	DefaultGrantTTL      = 24 * time.Hour

	// DefaultClockSkew is the only local tolerance the runtime verifier applies
	// to issued-at and expiry timestamps. The runtime never extends or renews a
	// credential locally; when the control plane is unreachable it can only
	// verify a cached signed credential until the credential's expiry plus this
	// bounded skew allowance.
	DefaultClockSkew = 30 * time.Second
)

var (
	ErrInvalidConfig              = errors.New("invalid credential issuer configuration")
	ErrInvalidCredential          = errors.New("invalid runtime access credential")
	ErrCredentialExpired          = errors.New("runtime access credential expired")
	ErrCredentialNotYetValid      = errors.New("runtime access credential is not yet valid")
	ErrCredentialAudienceMismatch = errors.New("runtime access credential audience mismatch")
	ErrCredentialIssuerMismatch   = errors.New("runtime access credential issuer mismatch")
	ErrCredentialRuntimeMismatch  = errors.New("runtime access credential runtime mismatch")
	ErrCredentialEpochStale       = errors.New("runtime access credential epoch is stale")
	ErrRuntimeAccessRevoked       = errors.New("runtime access grant is revoked")
	ErrRuntimeAccessSuspended     = errors.New("runtime access is suspended")
	ErrDeviceRevoked              = errors.New("device identity is revoked")
	ErrUserSuspended              = errors.New("user account is suspended")
	ErrSetupSeedConsumed          = errors.New("setup seed is consumed")
	ErrSetupSeedStale             = errors.New("setup seed credential epoch is stale")
	ErrNotFound                   = errors.New("credential authority record not found")
)

type UserStatus string

const (
	UserStatusActive    UserStatus = "active"
	UserStatusSuspended UserStatus = "suspended"
)

type RuntimeAccessState string

const (
	RuntimeAccessEnabled   RuntimeAccessState = "enabled"
	RuntimeAccessSuspended RuntimeAccessState = "suspended"
)

type Config struct {
	Issuer           string
	Audience         string
	Clock            func() time.Time
	CredentialTTL    time.Duration
	MaxCredentialTTL time.Duration
	GrantTTL         time.Duration
	ClockSkew        time.Duration
}

type Issuer struct {
	mu               sync.Mutex
	issuer           string
	audience         string
	clock            func() time.Time
	credentialTTL    time.Duration
	maxCredentialTTL time.Duration
	grantTTL         time.Duration
	clockSkew        time.Duration
	users            map[string]User
	devices          map[string]Device
	runtimes         map[string]Runtime
	grants           map[grantKey]RuntimeAccessGrant
	setupSeeds       map[string]SetupSeedRecord
	keys             map[string]signingKey
	activeKeyID      string
}

type User struct {
	ID          string
	Status      UserStatus
	SuspendedAt *time.Time
}

type Device struct {
	ID        string
	UserID    string
	CreatedAt time.Time
	RevokedAt *time.Time
}

type Runtime struct {
	Name              string
	UserID            string
	CredentialEpoch   uint64
	AccessState       RuntimeAccessState
	AccessStateSetAt  time.Time
	LastEpochBumpedAt time.Time
}

type RuntimeAccessGrant struct {
	DeviceID        string
	RuntimeName     string
	CredentialEpoch uint64
	CreatedAt       time.Time
	ExpiresAt       time.Time
	RevokedAt       *time.Time
}

type SetupSeedRecord struct {
	Seed       runtimesetup.Seed
	Registered time.Time
	ConsumedAt *time.Time
}

type AuthorizeRuntimeAccessRequest struct {
	DeviceID      string
	RuntimeName   string
	Attestation   runtimesetup.Attestation
	CredentialTTL time.Duration
	GrantTTL      time.Duration
}

type IssueRuntimeAccessCredentialRequest struct {
	DeviceID      string
	RuntimeName   string
	CredentialTTL time.Duration
}

type RuntimeAccessCredential struct {
	Token  string
	KeyID  string
	Claims CredentialClaims
}

type VerifiedCredential struct {
	KeyID  string
	Claims CredentialClaims
}

type CredentialClaims struct {
	CredentialID    string    `json:"jti"`
	Issuer          string    `json:"iss"`
	Audience        string    `json:"aud"`
	UserID          string    `json:"userId"`
	DeviceID        string    `json:"deviceId"`
	RuntimeName     string    `json:"runtimeName"`
	CredentialEpoch uint64    `json:"credentialEpoch"`
	IssuedAt        time.Time `json:"iat"`
	ExpiresAt       time.Time `json:"exp"`
}

type PublishedKeySet struct {
	Issuer      string
	GeneratedAt time.Time
	Keys        []PublishedKey
}

type PublishedKey struct {
	ID        string
	Algorithm string
	PublicKey []byte
	NotBefore time.Time
	ExpiresAt *time.Time
}

type VerifierConfig struct {
	Issuer           string
	Audience         string
	RuntimeName      string
	KeySet           PublishedKeySet
	Clock            func() time.Time
	MaxCredentialTTL time.Duration
	ClockSkew        time.Duration
}

type Verifier struct {
	issuer           string
	audience         string
	runtimeName      string
	keySet           PublishedKeySet
	clock            func() time.Time
	maxCredentialTTL time.Duration
	clockSkew        time.Duration
}

type signingKey struct {
	id        string
	public    ed25519.PublicKey
	private   ed25519.PrivateKey
	notBefore time.Time
	expiresAt *time.Time
}

type grantKey struct {
	deviceID    string
	runtimeName string
}

type credentialHeader struct {
	Algorithm string `json:"alg"`
	KeyID     string `json:"kid"`
	Type      string `json:"typ"`
}

func NewIssuer(config Config) (*Issuer, error) {
	config = normalizeConfig(config)
	if err := validateIssuerConfig(config); err != nil {
		return nil, err
	}
	now := config.Clock().UTC()
	key, err := newSigningKey(now)
	if err != nil {
		return nil, err
	}
	return &Issuer{
		issuer:           config.Issuer,
		audience:         config.Audience,
		clock:            config.Clock,
		credentialTTL:    config.CredentialTTL,
		maxCredentialTTL: config.MaxCredentialTTL,
		grantTTL:         config.GrantTTL,
		clockSkew:        config.ClockSkew,
		users:            map[string]User{},
		devices:          map[string]Device{},
		runtimes:         map[string]Runtime{},
		grants:           map[grantKey]RuntimeAccessGrant{},
		setupSeeds:       map[string]SetupSeedRecord{},
		keys:             map[string]signingKey{key.id: key},
		activeKeyID:      key.id,
	}, nil
}

func (issuer *Issuer) UpsertUser(_ context.Context, userID string) (User, error) {
	userID, err := validateID("user id", userID)
	if err != nil {
		return User{}, err
	}
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	user, ok := issuer.users[userID]
	if !ok {
		user = User{ID: userID, Status: UserStatusActive}
		issuer.users[userID] = user
	}
	return user, nil
}

func (issuer *Issuer) SuspendUser(_ context.Context, userID string) (User, bool, error) {
	userID, err := validateID("user id", userID)
	if err != nil {
		return User{}, false, err
	}
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	user, ok := issuer.users[userID]
	if !ok {
		return User{}, false, nil
	}
	if user.Status != UserStatusSuspended {
		now := issuer.now()
		user.Status = UserStatusSuspended
		user.SuspendedAt = &now
		issuer.users[userID] = user
	}
	return user, true, nil
}

func (issuer *Issuer) RegisterDevice(_ context.Context, userID string, deviceID string) (Device, error) {
	userID, err := validateID("user id", userID)
	if err != nil {
		return Device{}, err
	}
	deviceID, err = validateID("device id", deviceID)
	if err != nil {
		return Device{}, err
	}
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	user, ok := issuer.users[userID]
	if !ok {
		return Device{}, fmt.Errorf("%w: user %s", ErrNotFound, userID)
	}
	if user.Status == UserStatusSuspended {
		return Device{}, ErrUserSuspended
	}
	device, ok := issuer.devices[deviceID]
	if ok {
		if device.UserID != userID {
			return Device{}, fmt.Errorf("%w: device belongs to a different user", ErrInvalidCredential)
		}
		return device, nil
	}
	device = Device{
		ID:        deviceID,
		UserID:    userID,
		CreatedAt: issuer.now(),
	}
	issuer.devices[deviceID] = device
	return device, nil
}

func (issuer *Issuer) RevokeDevice(_ context.Context, deviceID string) (Device, bool, error) {
	deviceID, err := validateID("device id", deviceID)
	if err != nil {
		return Device{}, false, err
	}
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	device, ok := issuer.devices[deviceID]
	if !ok {
		return Device{}, false, nil
	}
	if device.RevokedAt == nil {
		now := issuer.now()
		device.RevokedAt = &now
		issuer.devices[deviceID] = device
	}
	return device, true, nil
}

func (issuer *Issuer) RegisterRuntime(_ context.Context, userID string, runtimeName string, credentialEpoch uint64) (Runtime, error) {
	userID, err := validateID("user id", userID)
	if err != nil {
		return Runtime{}, err
	}
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return Runtime{}, err
	}
	if credentialEpoch == 0 {
		return Runtime{}, fmt.Errorf("%w: credential epoch must be positive", ErrInvalidConfig)
	}
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	user, ok := issuer.users[userID]
	if !ok {
		return Runtime{}, fmt.Errorf("%w: user %s", ErrNotFound, userID)
	}
	if user.Status == UserStatusSuspended {
		return Runtime{}, ErrUserSuspended
	}
	runtime, ok := issuer.runtimes[runtimeName]
	if ok && runtime.UserID != userID {
		return Runtime{}, fmt.Errorf("%w: runtime belongs to a different user", ErrInvalidCredential)
	}
	now := issuer.now()
	runtime = Runtime{
		Name:             runtimeName,
		UserID:           userID,
		CredentialEpoch:  credentialEpoch,
		AccessState:      RuntimeAccessEnabled,
		AccessStateSetAt: now,
	}
	issuer.runtimes[runtimeName] = runtime
	return runtime, nil
}

func (issuer *Issuer) SetRuntimeAccessState(_ context.Context, runtimeName string, state RuntimeAccessState) (Runtime, bool, error) {
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return Runtime{}, false, err
	}
	if state != RuntimeAccessEnabled && state != RuntimeAccessSuspended {
		return Runtime{}, false, fmt.Errorf("%w: unsupported runtime access state %s", ErrInvalidConfig, state)
	}
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	runtime, ok := issuer.runtimes[runtimeName]
	if !ok {
		return Runtime{}, false, nil
	}
	if runtime.AccessState != state {
		runtime.AccessState = state
		runtime.AccessStateSetAt = issuer.now()
		issuer.runtimes[runtimeName] = runtime
	}
	return runtime, true, nil
}

func (issuer *Issuer) BumpRuntimeEpoch(_ context.Context, runtimeName string) (Runtime, bool, error) {
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return Runtime{}, false, err
	}
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	runtime, ok := issuer.runtimes[runtimeName]
	if !ok {
		return Runtime{}, false, nil
	}
	runtime.CredentialEpoch++
	runtime.LastEpochBumpedAt = issuer.now()
	issuer.runtimes[runtimeName] = runtime
	return runtime, true, nil
}

func (issuer *Issuer) RegisterSetupSeed(_ context.Context, seed runtimesetup.Seed) error {
	if _, err := runtimesetup.MarshalSeed(seed); err != nil {
		return err
	}
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	runtime, ok := issuer.runtimes[seed.RuntimeName]
	if !ok {
		return fmt.Errorf("%w: runtime %s", ErrNotFound, seed.RuntimeName)
	}
	if seed.CredentialEpoch != runtime.CredentialEpoch {
		return fmt.Errorf("%w: setup seed epoch %d current %d", ErrSetupSeedStale, seed.CredentialEpoch, runtime.CredentialEpoch)
	}
	record, ok := issuer.setupSeeds[seed.SetupID]
	if ok && record.ConsumedAt != nil {
		return ErrSetupSeedConsumed
	}
	issuer.setupSeeds[seed.SetupID] = SetupSeedRecord{
		Seed:       seed,
		Registered: issuer.now(),
		ConsumedAt: record.ConsumedAt,
	}
	return nil
}

func (issuer *Issuer) AuthorizeRuntimeAccess(
	_ context.Context,
	request AuthorizeRuntimeAccessRequest,
) (RuntimeAccessGrant, RuntimeAccessCredential, error) {
	deviceID, err := validateID("device id", request.DeviceID)
	if err != nil {
		return RuntimeAccessGrant{}, RuntimeAccessCredential{}, err
	}
	if err := runtimeprovider.ValidateManagedName(request.RuntimeName); err != nil {
		return RuntimeAccessGrant{}, RuntimeAccessCredential{}, err
	}
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	if _, _, _, err := issuer.activeDeviceRuntimeUserLocked(deviceID, request.RuntimeName); err != nil {
		return RuntimeAccessGrant{}, RuntimeAccessCredential{}, err
	}
	if err := issuer.consumeSetupAttestationLocked(request.RuntimeName, request.Attestation); err != nil {
		return RuntimeAccessGrant{}, RuntimeAccessCredential{}, err
	}
	grant, err := issuer.upsertGrantLocked(deviceID, request.RuntimeName, request.GrantTTL)
	if err != nil {
		return RuntimeAccessGrant{}, RuntimeAccessCredential{}, err
	}
	credential, err := issuer.issueCredentialLocked(deviceID, request.RuntimeName, request.CredentialTTL)
	if err != nil {
		return RuntimeAccessGrant{}, RuntimeAccessCredential{}, err
	}
	return grant, credential, nil
}

func (issuer *Issuer) IssueRuntimeAccessCredential(
	_ context.Context,
	request IssueRuntimeAccessCredentialRequest,
) (RuntimeAccessCredential, error) {
	deviceID, err := validateID("device id", request.DeviceID)
	if err != nil {
		return RuntimeAccessCredential{}, err
	}
	if err := runtimeprovider.ValidateManagedName(request.RuntimeName); err != nil {
		return RuntimeAccessCredential{}, err
	}
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	return issuer.issueCredentialLocked(deviceID, request.RuntimeName, request.CredentialTTL)
}

func (issuer *Issuer) RevokeRuntimeAccessGrant(_ context.Context, deviceID string, runtimeName string) (RuntimeAccessGrant, bool, error) {
	deviceID, err := validateID("device id", deviceID)
	if err != nil {
		return RuntimeAccessGrant{}, false, err
	}
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return RuntimeAccessGrant{}, false, err
	}
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	key := grantKey{deviceID: deviceID, runtimeName: runtimeName}
	grant, ok := issuer.grants[key]
	if !ok {
		return RuntimeAccessGrant{}, false, nil
	}
	if grant.RevokedAt == nil {
		now := issuer.now()
		grant.RevokedAt = &now
		issuer.grants[key] = grant
	}
	return grant, true, nil
}

func (issuer *Issuer) Device(_ context.Context, deviceID string) (Device, bool) {
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	device, ok := issuer.devices[deviceID]
	return device, ok
}

func (issuer *Issuer) RuntimeAccessGrant(_ context.Context, deviceID string, runtimeName string) (RuntimeAccessGrant, bool) {
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	grant, ok := issuer.grants[grantKey{deviceID: deviceID, runtimeName: runtimeName}]
	return grant, ok
}

func (issuer *Issuer) RotateSigningKey(_ context.Context) (PublishedKey, error) {
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	now := issuer.now()
	if current, ok := issuer.keys[issuer.activeKeyID]; ok && current.expiresAt == nil {
		expiresAt := now.Add(issuer.maxCredentialTTL + issuer.clockSkew)
		current.expiresAt = &expiresAt
		issuer.keys[current.id] = current
	}
	key, err := newSigningKey(now)
	if err != nil {
		return PublishedKey{}, err
	}
	issuer.keys[key.id] = key
	issuer.activeKeyID = key.id
	return publishedKey(key), nil
}

func (issuer *Issuer) PublishedKeys() PublishedKeySet {
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	now := issuer.now()
	keys := make([]PublishedKey, 0, len(issuer.keys))
	for _, key := range issuer.keys {
		if key.expiresAt != nil && now.After(key.expiresAt.Add(issuer.clockSkew)) {
			continue
		}
		keys = append(keys, publishedKey(key))
	}
	return PublishedKeySet{
		Issuer:      issuer.issuer,
		GeneratedAt: now,
		Keys:        keys,
	}
}

func (issuer *Issuer) VerifyCredential(_ context.Context, token string) (VerifiedCredential, error) {
	issuer.mu.Lock()
	keySet := issuer.publishedKeysLocked()
	config := verifierConfig{
		issuer:           issuer.issuer,
		audience:         issuer.audience,
		keySet:           keySet,
		clock:            issuer.clock,
		maxCredentialTTL: issuer.maxCredentialTTL,
		clockSkew:        issuer.clockSkew,
	}
	issuer.mu.Unlock()

	credential, err := verifyToken(token, config)
	if err != nil {
		return VerifiedCredential{}, err
	}
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	if err := issuer.revalidateCredentialLocked(credential.Claims); err != nil {
		return VerifiedCredential{}, err
	}
	return credential, nil
}

func (issuer *Issuer) VerifyRuntimeAccessCredential(
	ctx context.Context,
	token string,
) (VerifiedCredential, bool, error) {
	credential, err := issuer.VerifyCredential(ctx, token)
	if err != nil {
		if isCredentialAuthorizationError(err) {
			return VerifiedCredential{}, false, nil
		}
		return VerifiedCredential{}, false, err
	}
	return credential, true, nil
}

func (issuer *Issuer) RevalidateRuntimeAccessCredential(
	_ context.Context,
	credential VerifiedCredential,
) (bool, error) {
	issuer.mu.Lock()
	defer issuer.mu.Unlock()
	if err := validateClaimsTiming(credential.Claims, issuer.now(), issuer.maxCredentialTTL, issuer.clockSkew); err != nil {
		if isCredentialAuthorizationError(err) {
			return false, nil
		}
		return false, err
	}
	if err := issuer.revalidateCredentialLocked(credential.Claims); err != nil {
		if isCredentialAuthorizationError(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (issuer *Issuer) upsertGrantLocked(deviceID string, runtimeName string, ttl time.Duration) (RuntimeAccessGrant, error) {
	if ttl == 0 {
		ttl = issuer.grantTTL
	}
	if ttl <= 0 {
		return RuntimeAccessGrant{}, fmt.Errorf("%w: grant TTL must be positive", ErrInvalidConfig)
	}
	device, runtime, user, err := issuer.activeDeviceRuntimeUserLocked(deviceID, runtimeName)
	if err != nil {
		return RuntimeAccessGrant{}, err
	}
	if device.UserID != runtime.UserID || user.ID != runtime.UserID {
		return RuntimeAccessGrant{}, fmt.Errorf("%w: device/runtime user mismatch", ErrInvalidCredential)
	}
	now := issuer.now()
	grant := RuntimeAccessGrant{
		DeviceID:        device.ID,
		RuntimeName:     runtime.Name,
		CredentialEpoch: runtime.CredentialEpoch,
		CreatedAt:       now,
		ExpiresAt:       now.Add(ttl),
	}
	issuer.grants[grantKey{deviceID: deviceID, runtimeName: runtimeName}] = grant
	return grant, nil
}

func (issuer *Issuer) issueCredentialLocked(deviceID string, runtimeName string, ttl time.Duration) (RuntimeAccessCredential, error) {
	if ttl == 0 {
		ttl = issuer.credentialTTL
	}
	if ttl <= 0 || ttl > issuer.maxCredentialTTL {
		return RuntimeAccessCredential{}, fmt.Errorf("%w: credential TTL must be within %s", ErrInvalidConfig, issuer.maxCredentialTTL)
	}
	device, runtime, _, err := issuer.activeDeviceRuntimeUserLocked(deviceID, runtimeName)
	if err != nil {
		return RuntimeAccessCredential{}, err
	}
	grant, ok := issuer.grants[grantKey{deviceID: deviceID, runtimeName: runtimeName}]
	if !ok {
		return RuntimeAccessCredential{}, fmt.Errorf("%w: runtime access grant", ErrNotFound)
	}
	now := issuer.now()
	if grant.RevokedAt != nil {
		return RuntimeAccessCredential{}, ErrRuntimeAccessRevoked
	}
	if now.After(grant.ExpiresAt) {
		return RuntimeAccessCredential{}, ErrRuntimeAccessRevoked
	}
	if grant.CredentialEpoch != runtime.CredentialEpoch {
		return RuntimeAccessCredential{}, ErrCredentialEpochStale
	}
	key := issuer.keys[issuer.activeKeyID]
	claims := CredentialClaims{
		CredentialID:    mustRandomID("rac"),
		Issuer:          issuer.issuer,
		Audience:        issuer.audience,
		UserID:          device.UserID,
		DeviceID:        device.ID,
		RuntimeName:     runtime.Name,
		CredentialEpoch: runtime.CredentialEpoch,
		IssuedAt:        now,
		ExpiresAt:       now.Add(ttl),
	}
	token, err := signClaims(key, claims)
	if err != nil {
		return RuntimeAccessCredential{}, err
	}
	return RuntimeAccessCredential{Token: token, KeyID: key.id, Claims: claims}, nil
}

func (issuer *Issuer) consumeSetupAttestationLocked(runtimeName string, attestation runtimesetup.Attestation) error {
	record, ok := issuer.setupSeeds[attestation.SetupID]
	if !ok {
		return fmt.Errorf("%w: setup seed %s", ErrNotFound, attestation.SetupID)
	}
	if record.ConsumedAt != nil {
		return ErrSetupSeedConsumed
	}
	seed := record.Seed
	if seed.RuntimeName != runtimeName || attestation.RuntimeName != runtimeName {
		return ErrCredentialRuntimeMismatch
	}
	runtime, ok := issuer.runtimes[runtimeName]
	if !ok {
		return fmt.Errorf("%w: runtime %s", ErrNotFound, runtimeName)
	}
	if seed.CredentialEpoch != runtime.CredentialEpoch || attestation.CredentialEpoch != runtime.CredentialEpoch {
		return fmt.Errorf("%w: setup epoch %d attestation epoch %d current %d", ErrSetupSeedStale, seed.CredentialEpoch, attestation.CredentialEpoch, runtime.CredentialEpoch)
	}
	if err := runtimesetup.VerifyAttestation(attestation, seed.AttestationKey); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidCredential, err)
	}
	now := issuer.now()
	record.ConsumedAt = &now
	issuer.setupSeeds[attestation.SetupID] = record
	return nil
}

func (issuer *Issuer) activeDeviceRuntimeUserLocked(deviceID string, runtimeName string) (Device, Runtime, User, error) {
	device, ok := issuer.devices[deviceID]
	if !ok {
		return Device{}, Runtime{}, User{}, fmt.Errorf("%w: device %s", ErrNotFound, deviceID)
	}
	if device.RevokedAt != nil {
		return Device{}, Runtime{}, User{}, ErrDeviceRevoked
	}
	runtime, ok := issuer.runtimes[runtimeName]
	if !ok {
		return Device{}, Runtime{}, User{}, fmt.Errorf("%w: runtime %s", ErrNotFound, runtimeName)
	}
	if runtime.AccessState != RuntimeAccessEnabled {
		return Device{}, Runtime{}, User{}, ErrRuntimeAccessSuspended
	}
	user, ok := issuer.users[device.UserID]
	if !ok {
		return Device{}, Runtime{}, User{}, fmt.Errorf("%w: user %s", ErrNotFound, device.UserID)
	}
	if user.Status == UserStatusSuspended {
		return Device{}, Runtime{}, User{}, ErrUserSuspended
	}
	return device, runtime, user, nil
}

func (issuer *Issuer) revalidateCredentialLocked(claims CredentialClaims) error {
	if claims.Issuer != issuer.issuer {
		return ErrCredentialIssuerMismatch
	}
	if claims.Audience != issuer.audience {
		return ErrCredentialAudienceMismatch
	}
	if err := runtimeprovider.ValidateManagedName(claims.RuntimeName); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidCredential, err)
	}
	device, runtime, user, err := issuer.activeDeviceRuntimeUserLocked(claims.DeviceID, claims.RuntimeName)
	if err != nil {
		return err
	}
	if credentialSubjectMismatch(claims, device, runtime, user) {
		return fmt.Errorf("%w: credential subject does not match authority state", ErrInvalidCredential)
	}
	if claims.CredentialEpoch != runtime.CredentialEpoch {
		return ErrCredentialEpochStale
	}
	return issuer.revalidateGrantLocked(claims)
}

func credentialSubjectMismatch(claims CredentialClaims, device Device, runtime Runtime, user User) bool {
	return claims.UserID != user.ID || device.UserID != user.ID || runtime.UserID != user.ID
}

func (issuer *Issuer) revalidateGrantLocked(claims CredentialClaims) error {
	grant, ok := issuer.grants[grantKey{deviceID: claims.DeviceID, runtimeName: claims.RuntimeName}]
	if !ok {
		return fmt.Errorf("%w: runtime access grant", ErrNotFound)
	}
	if grant.RevokedAt != nil {
		return ErrRuntimeAccessRevoked
	}
	if issuer.now().After(grant.ExpiresAt) {
		return ErrRuntimeAccessRevoked
	}
	if grant.CredentialEpoch != claims.CredentialEpoch {
		return ErrCredentialEpochStale
	}
	return nil
}

func signClaims(key signingKey, claims CredentialClaims) (string, error) {
	headerPayload, err := json.Marshal(credentialHeader{
		Algorithm: CredentialAlgorithm,
		KeyID:     key.id,
		Type:      "setta-runtime-access",
	})
	if err != nil {
		return "", fmt.Errorf("marshal credential header: %w", err)
	}
	claimsPayload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("marshal credential claims: %w", err)
	}
	signingInput := base64.RawURLEncoding.EncodeToString(headerPayload) + "." +
		base64.RawURLEncoding.EncodeToString(claimsPayload)
	signature := ed25519.Sign(key.private, []byte(signingInput))
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func newSigningKey(now time.Time) (signingKey, error) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return signingKey{}, fmt.Errorf("generate credential signing key: %w", err)
	}
	return signingKey{
		id:        mustRandomID("key"),
		public:    public,
		private:   private,
		notBefore: now,
	}, nil
}

func publishedKey(key signingKey) PublishedKey {
	return PublishedKey{
		ID:        key.id,
		Algorithm: CredentialAlgorithm,
		PublicKey: append([]byte(nil), key.public...),
		NotBefore: key.notBefore,
		ExpiresAt: cloneTimePointer(key.expiresAt),
	}
}

func (issuer *Issuer) publishedKeysLocked() PublishedKeySet {
	now := issuer.now()
	keys := make([]PublishedKey, 0, len(issuer.keys))
	for _, key := range issuer.keys {
		if key.expiresAt != nil && now.After(key.expiresAt.Add(issuer.clockSkew)) {
			continue
		}
		keys = append(keys, publishedKey(key))
	}
	return PublishedKeySet{Issuer: issuer.issuer, GeneratedAt: now, Keys: keys}
}

func clonePublishedKeySet(keySet PublishedKeySet) PublishedKeySet {
	clone := PublishedKeySet{
		Issuer:      keySet.Issuer,
		GeneratedAt: keySet.GeneratedAt,
		Keys:        make([]PublishedKey, 0, len(keySet.Keys)),
	}
	for _, key := range keySet.Keys {
		clone.Keys = append(clone.Keys, PublishedKey{
			ID:        key.ID,
			Algorithm: key.Algorithm,
			PublicKey: append([]byte(nil), key.PublicKey...),
			NotBefore: key.NotBefore,
			ExpiresAt: cloneTimePointer(key.ExpiresAt),
		})
	}
	return clone
}

func cloneTimePointer(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	clone := *value
	return &clone
}

func normalizeConfig(config Config) Config {
	if config.Clock == nil {
		config.Clock = time.Now
	}
	if config.CredentialTTL == 0 {
		config.CredentialTTL = DefaultCredentialTTL
	}
	if config.MaxCredentialTTL == 0 {
		config.MaxCredentialTTL = MaxCredentialTTL
	}
	if config.GrantTTL == 0 {
		config.GrantTTL = DefaultGrantTTL
	}
	if config.ClockSkew == 0 {
		config.ClockSkew = DefaultClockSkew
	}
	return config
}

func validateIssuerConfig(config Config) error {
	if strings.TrimSpace(config.Issuer) == "" {
		return fmt.Errorf("%w: issuer is required", ErrInvalidConfig)
	}
	if strings.TrimSpace(config.Audience) == "" {
		return fmt.Errorf("%w: audience is required", ErrInvalidConfig)
	}
	if config.CredentialTTL <= 0 || config.MaxCredentialTTL <= 0 || config.CredentialTTL > config.MaxCredentialTTL {
		return fmt.Errorf("%w: credential TTL must be positive and no greater than max credential TTL", ErrInvalidConfig)
	}
	if config.GrantTTL <= 0 {
		return fmt.Errorf("%w: grant TTL must be positive", ErrInvalidConfig)
	}
	if config.ClockSkew < 0 || config.ClockSkew > time.Minute {
		return fmt.Errorf("%w: clock skew must be between zero and one minute", ErrInvalidConfig)
	}
	return nil
}

func normalizeVerifierConfig(config VerifierConfig) VerifierConfig {
	if config.Clock == nil {
		config.Clock = time.Now
	}
	if config.MaxCredentialTTL == 0 {
		config.MaxCredentialTTL = MaxCredentialTTL
	}
	if config.ClockSkew == 0 {
		config.ClockSkew = DefaultClockSkew
	}
	return config
}

func validateVerifierConfig(config VerifierConfig) error {
	if strings.TrimSpace(config.Issuer) == "" {
		return fmt.Errorf("%w: issuer is required", ErrInvalidConfig)
	}
	if strings.TrimSpace(config.Audience) == "" {
		return fmt.Errorf("%w: audience is required", ErrInvalidConfig)
	}
	if config.RuntimeName != "" {
		if err := runtimeprovider.ValidateManagedName(config.RuntimeName); err != nil {
			return err
		}
	}
	if config.MaxCredentialTTL <= 0 {
		return fmt.Errorf("%w: max credential TTL must be positive", ErrInvalidConfig)
	}
	if config.ClockSkew < 0 || config.ClockSkew > time.Minute {
		return fmt.Errorf("%w: clock skew must be between zero and one minute", ErrInvalidConfig)
	}
	if len(config.KeySet.Keys) == 0 {
		return fmt.Errorf("%w: published key set is empty", ErrInvalidConfig)
	}
	return nil
}

func validateID(label string, value string) (string, error) {
	if strings.TrimSpace(value) != value || value == "" {
		return "", fmt.Errorf("%s is required", label)
	}
	if len(value) > 128 {
		return "", fmt.Errorf("%s must be at most 128 bytes", label)
	}
	if strings.ContainsAny(value, " \t\r\n") {
		return "", fmt.Errorf("%s must not contain whitespace", label)
	}
	return value, nil
}

func decodeStrict(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return errors.New("unexpected trailing JSON")
	}
	return nil
}

func mustRandomID(prefix string) string {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		panic(fmt.Sprintf("generate %s id: %v", prefix, err))
	}
	return prefix + "_" + hex.EncodeToString(data[:])
}

func (issuer *Issuer) now() time.Time {
	return issuer.clock().UTC()
}

func isCredentialAuthorizationError(err error) bool {
	for _, authorizationError := range []error{
		ErrInvalidCredential,
		ErrCredentialExpired,
		ErrCredentialNotYetValid,
		ErrCredentialAudienceMismatch,
		ErrCredentialIssuerMismatch,
		ErrCredentialRuntimeMismatch,
		ErrCredentialEpochStale,
		ErrRuntimeAccessRevoked,
		ErrRuntimeAccessSuspended,
		ErrDeviceRevoked,
		ErrUserSuspended,
		ErrNotFound,
	} {
		if errors.Is(err, authorizationError) {
			return true
		}
	}
	return false
}
