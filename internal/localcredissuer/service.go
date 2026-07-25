// Package localcredissuer hosts the bounded credential issuer used only by
// explicitly configured local development runtimes.
//
// This package is not enabled by runtime defaults and must not be enabled by a
// cloud runtime. It preserves the production trust shape for local development:
// a one-time setup proof enrolls a user-owned device identity, runtime access is
// a separately revocable grant, and every runtime credential is signed,
// epoch-bound, and short-lived.
package localcredissuer

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"setta/internal/credissuer"
	"setta/internal/runtimeauth"
	"setta/internal/runtimecapability"
	"setta/internal/runtimeprovider"
	"setta/internal/runtimesetup"
)

var (
	ErrInvalidPairingToken = errors.New("invalid local enrollment pairing token")
	ErrInvalidDeviceSecret = errors.New("invalid local device identity secret")
	ErrRuntimeMismatch     = errors.New("local credential runtime mismatch")
)

type PairingTokenConsumer interface {
	ConsumePairingToken(context.Context, string) (bool, error)
}

type Config struct {
	BackendName    string
	Clock          func() time.Time
	CredentialTTL  time.Duration
	PairingTokens  PairingTokenConsumer
	ReleaseVersion string
	RuntimeID      string
	RuntimeName    string
	SetupStore     *runtimesetup.Store
	UserID         string
}

type EnrollRequest struct {
	PairingToken      string `json:"pairingToken"`
	ClientDisplayName string `json:"clientDisplayName"`
}

type EnrollResponse struct {
	UserID            string                    `json:"userId"`
	DeviceID          string                    `json:"deviceId"`
	DeviceSecret      string                    `json:"deviceSecret"`
	RuntimeID         string                    `json:"runtimeId"`
	ProtocolVersion   int                       `json:"protocolVersion"`
	RuntimeCredential RuntimeCredentialResponse `json:"runtimeCredential"`
}

type RefreshRequest struct {
	DeviceID     string `json:"deviceId"`
	DeviceSecret string `json:"deviceSecret"`
	RuntimeID    string `json:"runtimeId"`
}

type RuntimeCredentialResponse struct {
	DeviceID  string `json:"deviceId"`
	RuntimeID string `json:"runtimeId"`
	Token     string `json:"token"`
	ExpiresAt string `json:"expiresAt"`
}

type Service struct {
	mu             sync.Mutex
	authority      *credissuer.Issuer
	backendName    string
	clock          func() time.Time
	pairingTokens  PairingTokenConsumer
	releaseVersion string
	runtimeID      string
	runtimeName    string
	setupStore     *runtimesetup.Store
	userID         string
	devices        map[string]localDevice
}

type localDevice struct {
	displayName string
	secretHash  [sha256.Size]byte
	createdAt   time.Time
	revokedAt   *time.Time
}

func New(config Config) (*Service, error) {
	config = normalizeConfig(config)
	if err := validateConfig(config); err != nil {
		return nil, err
	}
	authority, err := credissuer.NewIssuer(credissuer.Config{
		Audience:      "setta-runtime",
		Clock:         config.Clock,
		CredentialTTL: config.CredentialTTL,
		Issuer:        "setta-local-dev://" + config.RuntimeID,
	})
	if err != nil {
		return nil, fmt.Errorf("create local credential issuer: %w", err)
	}
	ctx := context.Background()
	if _, err := authority.UpsertUser(ctx, config.UserID); err != nil {
		return nil, fmt.Errorf("register local credential user: %w", err)
	}
	if _, err := authority.RegisterRuntime(ctx, config.UserID, config.RuntimeName, 1); err != nil {
		return nil, fmt.Errorf("register local credential runtime: %w", err)
	}
	return &Service{
		authority:      authority,
		backendName:    config.BackendName,
		clock:          config.Clock,
		pairingTokens:  config.PairingTokens,
		releaseVersion: config.ReleaseVersion,
		runtimeID:      config.RuntimeID,
		runtimeName:    config.RuntimeName,
		setupStore:     config.SetupStore,
		userID:         config.UserID,
		devices:        map[string]localDevice{},
	}, nil
}

func (service *Service) Enroll(ctx context.Context, request EnrollRequest, protocolVersion int) (EnrollResponse, error) {
	if strings.TrimSpace(request.ClientDisplayName) == "" {
		return EnrollResponse{}, errors.New("client display name is required")
	}
	consumed, err := service.pairingTokens.ConsumePairingToken(ctx, request.PairingToken)
	if err != nil {
		return EnrollResponse{}, fmt.Errorf("consume local enrollment pairing token: %w", err)
	}
	if !consumed {
		return EnrollResponse{}, ErrInvalidPairingToken
	}
	deviceID, err := randomID("device")
	if err != nil {
		return EnrollResponse{}, err
	}
	deviceSecret, err := randomSecret()
	if err != nil {
		return EnrollResponse{}, err
	}
	if _, err := service.authority.RegisterDevice(ctx, service.userID, deviceID); err != nil {
		return EnrollResponse{}, fmt.Errorf("register local device identity: %w", err)
	}
	credential, err := service.authorizeRuntime(ctx, deviceID)
	if err != nil {
		return EnrollResponse{}, err
	}
	service.mu.Lock()
	service.devices[deviceID] = localDevice{
		createdAt:   service.clock().UTC(),
		displayName: strings.TrimSpace(request.ClientDisplayName),
		secretHash:  sha256.Sum256([]byte(deviceSecret)),
	}
	service.mu.Unlock()
	return EnrollResponse{
		UserID:            service.userID,
		DeviceID:          deviceID,
		DeviceSecret:      deviceSecret,
		RuntimeID:         service.runtimeID,
		ProtocolVersion:   protocolVersion,
		RuntimeCredential: service.runtimeCredentialResponse(credential),
	}, nil
}

func (service *Service) Refresh(ctx context.Context, request RefreshRequest) (RuntimeCredentialResponse, error) {
	if request.RuntimeID != service.runtimeID {
		return RuntimeCredentialResponse{}, ErrRuntimeMismatch
	}
	if !service.validDeviceSecret(request.DeviceID, request.DeviceSecret) {
		return RuntimeCredentialResponse{}, ErrInvalidDeviceSecret
	}
	credential, err := service.authority.IssueRuntimeAccessCredential(ctx, credissuer.IssueRuntimeAccessCredentialRequest{
		DeviceID:    request.DeviceID,
		RuntimeName: service.runtimeName,
	})
	if err != nil {
		return RuntimeCredentialResponse{}, fmt.Errorf("issue local runtime credential: %w", err)
	}
	return service.runtimeCredentialResponse(credential), nil
}

func (service *Service) ListDeviceSessions(_ context.Context) ([]runtimeauth.DeviceSession, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	sessions := make([]runtimeauth.DeviceSession, 0, len(service.devices))
	for deviceID, device := range service.devices {
		sessions = append(sessions, deviceSession(deviceID, device))
	}
	sort.Slice(sessions, func(i, j int) bool { return sessions[i].ID < sessions[j].ID })
	return sessions, nil
}

func (service *Service) RevokeDeviceSession(ctx context.Context, deviceID string) (runtimeauth.DeviceSession, bool, error) {
	service.mu.Lock()
	device, ok := service.devices[deviceID]
	service.mu.Unlock()
	if !ok {
		return runtimeauth.DeviceSession{}, false, nil
	}
	revoked, _, err := service.authority.RevokeDevice(ctx, deviceID)
	if err != nil {
		return runtimeauth.DeviceSession{}, false, err
	}
	service.mu.Lock()
	device.revokedAt = revoked.RevokedAt
	service.devices[deviceID] = device
	service.mu.Unlock()
	return deviceSession(deviceID, device), true, nil
}

func (service *Service) VerifyRuntimeAccessCredential(ctx context.Context, token string) (credissuer.VerifiedCredential, bool, error) {
	return service.authority.VerifyRuntimeAccessCredential(ctx, token)
}

func (service *Service) RevalidateRuntimeAccessCredential(ctx context.Context, credential credissuer.VerifiedCredential) (bool, error) {
	return service.authority.RevalidateRuntimeAccessCredential(ctx, credential)
}

func (service *Service) authorizeRuntime(ctx context.Context, deviceID string) (credissuer.RuntimeAccessCredential, error) {
	setupID, err := randomID("setup")
	if err != nil {
		return credissuer.RuntimeAccessCredential{}, err
	}
	attestationKey, err := randomSecret()
	if err != nil {
		return credissuer.RuntimeAccessCredential{}, err
	}
	seed, err := runtimesetup.NewSeed(runtimesetup.SeedInput{
		AttestationKey:  attestationKey,
		CredentialEpoch: 1,
		ReleaseVersion:  service.releaseVersion,
		RuntimeName:     service.runtimeName,
		SetupID:         setupID,
	}, service.clock().UTC())
	if err != nil {
		return credissuer.RuntimeAccessCredential{}, fmt.Errorf("create local setup seed: %w", err)
	}
	if err := runtimesetup.WriteSeedFile(service.setupStore.Path(), seed); err != nil {
		return credissuer.RuntimeAccessCredential{}, fmt.Errorf("write local setup seed: %w", err)
	}
	if err := service.authority.RegisterSetupSeed(ctx, seed); err != nil {
		return credissuer.RuntimeAccessCredential{}, fmt.Errorf("register local setup seed: %w", err)
	}
	nonce, err := randomID("nonce")
	if err != nil {
		return credissuer.RuntimeAccessCredential{}, err
	}
	attestation, status, err := service.setupStore.CreateAttestation(ctx, runtimesetup.AttestationChallenge{
		BackendName:    service.backendName,
		FeatureSet:     runtimecapability.RuntimeFeatureSetIdentity(),
		Nonce:          nonce,
		ReleaseVersion: service.releaseVersion,
		RuntimeID:      service.runtimeID,
		SetupID:        setupID,
	})
	if err != nil {
		return credissuer.RuntimeAccessCredential{}, fmt.Errorf("create local setup attestation: %w", err)
	}
	if status != runtimesetup.AttestationOK {
		return credissuer.RuntimeAccessCredential{}, fmt.Errorf("create local setup attestation: status %s", status)
	}
	_, credential, err := service.authority.AuthorizeRuntimeAccess(ctx, credissuer.AuthorizeRuntimeAccessRequest{
		Attestation: attestation,
		DeviceID:    deviceID,
		RuntimeName: service.runtimeName,
	})
	if err != nil {
		return credissuer.RuntimeAccessCredential{}, fmt.Errorf("authorize local runtime access: %w", err)
	}
	return credential, nil
}

func (service *Service) runtimeCredentialResponse(credential credissuer.RuntimeAccessCredential) RuntimeCredentialResponse {
	return RuntimeCredentialResponse{
		DeviceID:  credential.Claims.DeviceID,
		RuntimeID: service.runtimeID,
		Token:     credential.Token,
		ExpiresAt: credential.Claims.ExpiresAt.Format(time.RFC3339Nano),
	}
}

func (service *Service) validDeviceSecret(deviceID string, secret string) bool {
	if deviceID == "" || secret == "" {
		return false
	}
	service.mu.Lock()
	device, ok := service.devices[deviceID]
	service.mu.Unlock()
	if !ok || device.revokedAt != nil {
		return false
	}
	actual := sha256.Sum256([]byte(secret))
	return subtle.ConstantTimeCompare(actual[:], device.secretHash[:]) == 1
}

func deviceSession(deviceID string, device localDevice) runtimeauth.DeviceSession {
	createdAt := device.createdAt.Format(time.RFC3339Nano)
	var revokedAt *string
	if device.revokedAt != nil {
		value := device.revokedAt.Format(time.RFC3339Nano)
		revokedAt = &value
	}
	return runtimeauth.DeviceSession{
		ID:          deviceID,
		Scope:       runtimeauth.DeviceScopeFull,
		DisplayName: device.displayName,
		CreatedAt:   createdAt,
		LastSeenAt:  createdAt,
		RevokedAt:   revokedAt,
	}
}

func normalizeConfig(config Config) Config {
	if config.Clock == nil {
		config.Clock = time.Now
	}
	if config.CredentialTTL == 0 {
		config.CredentialTTL = credissuer.DefaultCredentialTTL
	}
	return config
}

func validateConfig(config Config) error {
	if strings.TrimSpace(config.BackendName) == "" || strings.TrimSpace(config.ReleaseVersion) == "" || strings.TrimSpace(config.RuntimeID) == "" || strings.TrimSpace(config.UserID) == "" {
		return errors.New("local credential issuer identity configuration is required")
	}
	if err := runtimeprovider.ValidateManagedName(config.RuntimeName); err != nil {
		return err
	}
	if config.PairingTokens == nil || config.SetupStore == nil {
		return errors.New("local credential issuer stores are required")
	}
	if config.CredentialTTL <= 0 || config.CredentialTTL > credissuer.MaxCredentialTTL {
		return fmt.Errorf("local credential TTL must be within %s", credissuer.MaxCredentialTTL)
	}
	return nil
}

func randomID(prefix string) (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(value[:]), nil
}

func randomSecret() (string, error) {
	var value [32]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", fmt.Errorf("generate local credential secret: %w", err)
	}
	return hex.EncodeToString(value[:]), nil
}
