// Package runtimesetup owns provider-neutral setup seed and attestation state
// for a freshly provisioned Setta runtime.
package runtimesetup

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"setta/internal/jsonio"
	"setta/internal/runtimecapability"
	"setta/internal/runtimeprovider"
)

const (
	SeedSchemaVersion = 1

	DefaultSeedTTL = 60 * time.Minute
	MaxSeedTTL     = 60 * time.Minute

	AttestationAlgorithm = "hmac-sha256-v1"

	attestationContext = "setta-runtime-setup-attestation-v1"
	runtimeStateDir    = "runtime"
	seedFileName       = "setup-attestation-seed.json"
)

type SeedInput struct {
	RuntimeName     string
	SetupID         string
	ReleaseVersion  string
	CredentialEpoch uint64
	AttestationKey  string
	ExpiresAt       time.Time
}

type Seed struct {
	SchemaVersion   int    `json:"schemaVersion"`
	RuntimeName     string `json:"runtimeName"`
	SetupID         string `json:"setupId"`
	ReleaseVersion  string `json:"releaseVersion"`
	CredentialEpoch uint64 `json:"credentialEpoch"`
	AttestationKey  string `json:"setupAttestationKey"`
	CreatedAt       string `json:"createdAt"`
	ExpiresAt       string `json:"expiresAt"`
	// NonceHashes prevents replay of one runtime challenge. Product authority
	// single-use is enforced when the control-plane credential issuer consumes
	// the setup attestation and burns the whole setup ID.
	NonceHashes     []string `json:"nonceHashes,omitempty"`
	FirstAttestedAt string   `json:"firstAttestedAt,omitempty"`
}

type AttestationChallenge struct {
	BackendName    string
	RuntimeID      string
	SetupID        string
	ReleaseVersion string
	FeatureSet     runtimecapability.RuntimeFeatureSet
	Nonce          string
}

type Attestation struct {
	Algorithm       string                              `json:"algorithm"`
	BackendName     string                              `json:"backendName"`
	RuntimeID       string                              `json:"runtimeId"`
	RuntimeName     string                              `json:"runtimeName"`
	SetupID         string                              `json:"setupId"`
	ReleaseVersion  string                              `json:"releaseVersion"`
	CredentialEpoch uint64                              `json:"credentialEpoch"`
	FeatureSet      runtimecapability.RuntimeFeatureSet `json:"featureSet"`
	Nonce           string                              `json:"nonce"`
	ExpiresAt       string                              `json:"expiresAt"`
	Attestation     string                              `json:"attestation"`
}

type AttestationStatus string

const (
	AttestationOK              AttestationStatus = "ok"
	AttestationNotFound        AttestationStatus = "not_found"
	AttestationExpired         AttestationStatus = "expired"
	AttestationReleaseMismatch AttestationStatus = "release_mismatch"
	AttestationReplayedNonce   AttestationStatus = "replayed_nonce"
)

type Store struct {
	path  string
	clock func() time.Time
	mu    sync.Mutex
}

type StoreOption func(*Store)

type PersistenceError struct {
	Operation string
	Path      string
	Err       error
}

type CorruptStateError struct {
	Path string
	Err  error
}

func NewStore(appDataDir string, options ...StoreOption) (*Store, error) {
	if strings.TrimSpace(appDataDir) == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	store := &Store{
		path:  SeedPath(appDataDir),
		clock: time.Now,
	}
	for _, option := range options {
		option(store)
	}
	return store, nil
}

func WithClock(clock func() time.Time) StoreOption {
	return func(store *Store) {
		store.clock = clock
	}
}

func (store *Store) Path() string {
	return store.path
}

func SeedPath(appDataDir string) string {
	return filepath.Join(appDataDir, runtimeStateDir, seedFileName)
}

func RemoteSeedDir(runtimeStateRoot string) string {
	return pathJoin(runtimeStateRoot, runtimeStateDir)
}

func RemoteSeedPath(runtimeStateRoot string) string {
	return pathJoin(RemoteSeedDir(runtimeStateRoot), seedFileName)
}

func NewSeed(input SeedInput, now time.Time) (Seed, error) {
	runtimeName, setupID, releaseVersion, credentialEpoch, attestationKey, err := validateSeedInput(input)
	if err != nil {
		return Seed{}, err
	}
	expiresAt := input.ExpiresAt
	if expiresAt.IsZero() {
		expiresAt = now.Add(DefaultSeedTTL)
	}
	if !expiresAt.After(now) {
		return Seed{}, errors.New("setup seed expiresAt must be in the future")
	}
	if expiresAt.After(now.Add(MaxSeedTTL)) {
		return Seed{}, fmt.Errorf("setup seed expiresAt must be within %s", MaxSeedTTL)
	}
	return Seed{
		SchemaVersion:   SeedSchemaVersion,
		RuntimeName:     runtimeName,
		SetupID:         setupID,
		ReleaseVersion:  releaseVersion,
		CredentialEpoch: credentialEpoch,
		AttestationKey:  attestationKey,
		CreatedAt:       timestamp(now),
		ExpiresAt:       timestamp(expiresAt),
	}, nil
}

func MarshalSeed(seed Seed) ([]byte, error) {
	if err := validateSeed(seed); err != nil {
		return nil, err
	}
	payload, err := json.MarshalIndent(seed, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal setup seed: %w", err)
	}
	return append(payload, '\n'), nil
}

func WriteSeedFile(path string, seed Seed) error {
	if !filepath.IsAbs(path) {
		return fmt.Errorf("setup seed path must be absolute: %s", path)
	}
	payload, err := MarshalSeed(seed)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return &PersistenceError{Operation: "create setup seed directory", Path: filepath.Dir(path), Err: err}
	}
	if err := os.Chmod(filepath.Dir(path), 0o700); err != nil {
		return &PersistenceError{Operation: "protect setup seed directory", Path: filepath.Dir(path), Err: err}
	}
	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, payload, 0o600); err != nil {
		return &PersistenceError{Operation: "write setup seed", Path: tempPath, Err: err}
	}
	if err := os.Chmod(tempPath, 0o600); err != nil {
		_ = os.Remove(tempPath)
		return &PersistenceError{Operation: "protect setup seed", Path: tempPath, Err: err}
	}
	if err := os.Rename(tempPath, path); err != nil {
		_ = os.Remove(tempPath)
		return &PersistenceError{Operation: "publish setup seed", Path: path, Err: err}
	}
	return nil
}

func (store *Store) CreateAttestation(
	ctx context.Context,
	challenge AttestationChallenge,
) (Attestation, AttestationStatus, error) {
	if err := ctx.Err(); err != nil {
		return Attestation{}, "", err
	}
	fields, err := validateChallenge(challenge)
	if err != nil {
		return Attestation{}, "", err
	}
	store.mu.Lock()
	defer store.mu.Unlock()

	seed, found, err := store.readSeed()
	if err != nil || !found {
		return Attestation{}, AttestationNotFound, err
	}
	if status := attestationSeedStatus(seed, fields); status != AttestationOK {
		return Attestation{}, status, nil
	}
	status, err := store.validateAttestationSeedTimes(seed)
	if err != nil {
		return Attestation{}, "", err
	}
	if status != AttestationOK {
		return Attestation{}, status, nil
	}
	nonceHash := hashNonce(fields.Nonce)
	if slicesContains(seed.NonceHashes, nonceHash) {
		return Attestation{}, AttestationReplayedNonce, nil
	}
	seed.NonceHashes = append(seed.NonceHashes, nonceHash)
	if seed.FirstAttestedAt == "" {
		seed.FirstAttestedAt = timestamp(store.clock())
	}
	if err := store.writeSeed(seed); err != nil {
		return Attestation{}, "", err
	}
	return attestationFromSeed(seed, fields), AttestationOK, nil
}

func attestationSeedStatus(seed Seed, fields attestationFields) AttestationStatus {
	if seed.SetupID != fields.SetupID {
		return AttestationNotFound
	}
	if seed.ReleaseVersion != fields.ReleaseVersion {
		return AttestationReleaseMismatch
	}
	return AttestationOK
}

func (store *Store) validateAttestationSeedTimes(seed Seed) (AttestationStatus, error) {
	expiresAt, err := parseSeedTime(seed.ExpiresAt)
	if err != nil {
		return "", store.corruptError(fmt.Errorf("expiresAt must be RFC3339Nano: %w", err))
	}
	createdAt, err := parseSeedTime(seed.CreatedAt)
	if err != nil {
		return "", store.corruptError(fmt.Errorf("createdAt must be RFC3339Nano: %w", err))
	}
	if store.clock().After(expiresAt) {
		return AttestationExpired, nil
	}
	if expiresAt.After(createdAt.Add(MaxSeedTTL)) {
		return "", store.corruptError(fmt.Errorf("expiresAt exceeds maximum setup seed TTL %s", MaxSeedTTL))
	}
	return AttestationOK, nil
}

func VerifyAttestation(attestation Attestation, attestationKey string) error {
	key, err := validateAttestationKey(attestationKey)
	if err != nil {
		return err
	}
	fields, err := validateAttestationFields(attestation)
	if err != nil {
		return err
	}
	want := computeAttestation(key, fields)
	got, err := hex.DecodeString(attestation.Attestation)
	if err != nil || len(got) != sha256.Size {
		return errors.New("setup attestation must be 64 lowercase hex characters")
	}
	wantBytes, err := hex.DecodeString(want)
	if err != nil {
		return err
	}
	if subtle.ConstantTimeCompare(got, wantBytes) != 1 {
		return errors.New("setup attestation HMAC mismatch")
	}
	return nil
}

func (store *Store) readSeed() (Seed, bool, error) {
	data, err := os.ReadFile(store.path)
	if errors.Is(err, os.ErrNotExist) {
		return Seed{}, false, nil
	}
	if err != nil {
		return Seed{}, false, store.persistenceError("read setup seed", err)
	}
	var seed Seed
	if err := jsonio.DecodeSingle(bytes.NewReader(data), &seed); err != nil {
		return Seed{}, false, store.corruptError(err)
	}
	if err := validateSeed(seed); err != nil {
		return Seed{}, false, store.corruptError(err)
	}
	return seed, true, nil
}

func (store *Store) writeSeed(seed Seed) error {
	payload, err := MarshalSeed(seed)
	if err != nil {
		return err
	}
	tempPath := store.path + ".tmp"
	if err := os.WriteFile(tempPath, payload, 0o600); err != nil {
		return store.persistenceError("write setup seed", err)
	}
	if err := os.Chmod(tempPath, 0o600); err != nil {
		_ = os.Remove(tempPath)
		return store.persistenceError("protect setup seed", err)
	}
	if err := os.Rename(tempPath, store.path); err != nil {
		_ = os.Remove(tempPath)
		return store.persistenceError("publish setup seed", err)
	}
	return nil
}

func attestationFromSeed(seed Seed, fields attestationFields) Attestation {
	return Attestation{
		Algorithm:       AttestationAlgorithm,
		BackendName:     fields.BackendName,
		RuntimeID:       fields.RuntimeID,
		RuntimeName:     seed.RuntimeName,
		SetupID:         fields.SetupID,
		ReleaseVersion:  fields.ReleaseVersion,
		CredentialEpoch: seed.CredentialEpoch,
		FeatureSet:      fields.FeatureSet,
		Nonce:           fields.Nonce,
		ExpiresAt:       seed.ExpiresAt,
		Attestation: computeAttestation([]byte(seed.AttestationKey), attestationFields{
			BackendName:     fields.BackendName,
			RuntimeID:       fields.RuntimeID,
			RuntimeName:     seed.RuntimeName,
			SetupID:         fields.SetupID,
			ReleaseVersion:  fields.ReleaseVersion,
			CredentialEpoch: seed.CredentialEpoch,
			FeatureSet:      fields.FeatureSet,
			Nonce:           fields.Nonce,
		}),
	}
}

type attestationFields struct {
	BackendName     string
	RuntimeID       string
	RuntimeName     string
	SetupID         string
	ReleaseVersion  string
	CredentialEpoch uint64
	FeatureSet      runtimecapability.RuntimeFeatureSet
	Nonce           string
}

func validateSeedInput(input SeedInput) (string, string, string, uint64, string, error) {
	if err := runtimeprovider.ValidateManagedName(input.RuntimeName); err != nil {
		return "", "", "", 0, "", err
	}
	setupID, err := validateField("setupId", input.SetupID, 8, 128)
	if err != nil {
		return "", "", "", 0, "", err
	}
	releaseVersion, err := validateField("releaseVersion", input.ReleaseVersion, 1, 128)
	if err != nil {
		return "", "", "", 0, "", err
	}
	if input.CredentialEpoch == 0 {
		return "", "", "", 0, "", errors.New("credentialEpoch must be positive")
	}
	attestationKey, err := validateAttestationKey(input.AttestationKey)
	if err != nil {
		return "", "", "", 0, "", err
	}
	return input.RuntimeName, setupID, releaseVersion, input.CredentialEpoch, string(attestationKey), nil
}

func validateSeed(seed Seed) error {
	if seed.SchemaVersion != SeedSchemaVersion {
		return fmt.Errorf("setup seed schemaVersion = %d, want %d", seed.SchemaVersion, SeedSchemaVersion)
	}
	if err := validateStoredSeedInput(seed); err != nil {
		return err
	}
	if err := validateStoredSeedTimes(seed); err != nil {
		return err
	}
	if err := validateStoredSeedNonceHashes(seed.NonceHashes); err != nil {
		return err
	}
	if seed.FirstAttestedAt != "" {
		if _, err := parseSeedTime(seed.FirstAttestedAt); err != nil {
			return fmt.Errorf("firstAttestedAt must be RFC3339Nano: %w", err)
		}
	}
	return nil
}

func validateStoredSeedInput(seed Seed) error {
	_, setupID, releaseVersion, credentialEpoch, _, err := validateSeedInput(SeedInput{
		RuntimeName:     seed.RuntimeName,
		SetupID:         seed.SetupID,
		ReleaseVersion:  seed.ReleaseVersion,
		CredentialEpoch: seed.CredentialEpoch,
		AttestationKey:  seed.AttestationKey,
		ExpiresAt:       time.Time{},
	})
	if err != nil {
		return err
	}
	if setupID != seed.SetupID || releaseVersion != seed.ReleaseVersion || credentialEpoch != seed.CredentialEpoch {
		return errors.New("setup seed normalization mismatch")
	}
	return nil
}

func validateStoredSeedTimes(seed Seed) error {
	createdAt, err := parseSeedTime(seed.CreatedAt)
	if err != nil {
		return fmt.Errorf("createdAt must be RFC3339Nano: %w", err)
	}
	expiresAt, err := parseSeedTime(seed.ExpiresAt)
	if err != nil {
		return fmt.Errorf("expiresAt must be RFC3339Nano: %w", err)
	}
	if !expiresAt.After(createdAt) {
		return errors.New("expiresAt must be after createdAt")
	}
	if expiresAt.After(createdAt.Add(MaxSeedTTL)) {
		return fmt.Errorf("expiresAt exceeds maximum setup seed TTL %s", MaxSeedTTL)
	}
	return nil
}

func validateStoredSeedNonceHashes(nonceHashes []string) error {
	for _, nonceHash := range nonceHashes {
		if !isLowercaseSHA256Hex(nonceHash) {
			return errors.New("nonceHashes must contain lowercase SHA-256 hex values")
		}
	}
	return nil
}

func validateChallenge(challenge AttestationChallenge) (attestationFields, error) {
	backendName, err := validateField("backendName", challenge.BackendName, 1, 128)
	if err != nil {
		return attestationFields{}, err
	}
	runtimeID, err := validateRuntimeID(challenge.RuntimeID)
	if err != nil {
		return attestationFields{}, err
	}
	setupID, err := validateField("setupId", challenge.SetupID, 8, 128)
	if err != nil {
		return attestationFields{}, err
	}
	releaseVersion, err := validateField("releaseVersion", challenge.ReleaseVersion, 1, 128)
	if err != nil {
		return attestationFields{}, err
	}
	if err := runtimecapability.ValidateRuntimeFeatureSet(challenge.FeatureSet); err != nil {
		return attestationFields{}, err
	}
	nonce, err := validateField("nonce", challenge.Nonce, 16, 512)
	if err != nil {
		return attestationFields{}, err
	}
	return attestationFields{
		BackendName:    backendName,
		RuntimeID:      runtimeID,
		SetupID:        setupID,
		ReleaseVersion: releaseVersion,
		FeatureSet:     challenge.FeatureSet,
		Nonce:          nonce,
	}, nil
}

func validateAttestationFields(attestation Attestation) (attestationFields, error) {
	if attestation.Algorithm != AttestationAlgorithm {
		return attestationFields{}, fmt.Errorf("setup attestation algorithm = %q, want %q", attestation.Algorithm, AttestationAlgorithm)
	}
	if attestation.RuntimeName == "" {
		return attestationFields{}, errors.New("runtimeName is required")
	}
	if err := runtimeprovider.ValidateManagedName(attestation.RuntimeName); err != nil {
		return attestationFields{}, err
	}
	fields, err := validateChallenge(AttestationChallenge{
		BackendName:    attestation.BackendName,
		RuntimeID:      attestation.RuntimeID,
		SetupID:        attestation.SetupID,
		ReleaseVersion: attestation.ReleaseVersion,
		FeatureSet:     attestation.FeatureSet,
		Nonce:          attestation.Nonce,
	})
	if err != nil {
		return attestationFields{}, err
	}
	fields.RuntimeName = attestation.RuntimeName
	if attestation.CredentialEpoch == 0 {
		return attestationFields{}, errors.New("credentialEpoch must be positive")
	}
	fields.CredentialEpoch = attestation.CredentialEpoch
	if _, err := parseSeedTime(attestation.ExpiresAt); err != nil {
		return attestationFields{}, fmt.Errorf("expiresAt must be RFC3339Nano: %w", err)
	}
	return fields, nil
}

func validateRuntimeID(value string) (string, error) {
	if len(value) != 32 || !isLowercaseHex(value) {
		return "", errors.New("runtimeId must be 32 lowercase hex characters")
	}
	return value, nil
}

func validateAttestationKey(value string) ([]byte, error) {
	if strings.TrimSpace(value) != value || value == "" {
		return nil, errors.New("setup attestation key is required")
	}
	if len(value) < 32 {
		return nil, errors.New("setup attestation key must be at least 32 bytes")
	}
	if len(value) > 4096 {
		return nil, errors.New("setup attestation key must be at most 4096 bytes")
	}
	if containsControlCharacter(value) {
		return nil, errors.New("setup attestation key must not contain control characters")
	}
	return []byte(value), nil
}

func validateField(name string, value string, minLength int, maxLength int) (string, error) {
	if strings.TrimSpace(value) != value || value == "" {
		return "", fmt.Errorf("%s is required", name)
	}
	if len(value) < minLength {
		return "", fmt.Errorf("%s must be at least %d bytes", name, minLength)
	}
	if len(value) > maxLength {
		return "", fmt.Errorf("%s must be at most %d bytes", name, maxLength)
	}
	if containsControlCharacter(value) {
		return "", fmt.Errorf("%s must not contain control characters", name)
	}
	return value, nil
}

func computeAttestation(key []byte, fields attestationFields) string {
	mac := hmac.New(sha256.New, key)
	writeHMACField(mac, attestationContext)
	writeHMACField(mac, fields.BackendName)
	writeHMACField(mac, fields.RuntimeName)
	writeHMACField(mac, fields.RuntimeID)
	writeHMACField(mac, fields.SetupID)
	writeHMACField(mac, fields.ReleaseVersion)
	writeHMACField(mac, fmt.Sprintf("%d", fields.CredentialEpoch))
	writeHMACField(mac, fmt.Sprintf("%d", fields.FeatureSet.Version))
	for _, feature := range fields.FeatureSet.Features {
		writeHMACField(mac, feature)
	}
	writeHMACField(mac, fields.Nonce)
	return hex.EncodeToString(mac.Sum(nil))
}

func writeHMACField(writer io.Writer, value string) {
	_, _ = writer.Write([]byte(value))
	_, _ = writer.Write([]byte{0})
}

func hashNonce(nonce string) string {
	sum := sha256.Sum256([]byte(nonce))
	return hex.EncodeToString(sum[:])
}

func parseSeedTime(value string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, value)
}

func timestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func containsControlCharacter(value string) bool {
	for _, char := range value {
		if char < 0x20 || char == 0x7f {
			return true
		}
	}
	return false
}

func isLowercaseSHA256Hex(value string) bool {
	return len(value) == sha256.Size*2 && isLowercaseHex(value)
}

func isLowercaseHex(value string) bool {
	if value == "" || strings.ToLower(value) != value {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil
}

func slicesContains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func pathJoin(first string, rest ...string) string {
	parts := make([]string, 0, len(rest)+1)
	parts = append(parts, strings.TrimRight(first, "/"))
	parts = append(parts, rest...)
	return strings.Join(parts, "/")
}

func (err *PersistenceError) Error() string {
	return fmt.Sprintf("%s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *PersistenceError) Unwrap() error {
	return err.Err
}

func (err *CorruptStateError) Error() string {
	return fmt.Sprintf("malformed runtime setup state %s: %v", err.Path, err.Err)
}

func (err *CorruptStateError) Unwrap() error {
	return err.Err
}

func IsPersistenceError(err error) bool {
	var persistenceError *PersistenceError
	return errors.As(err, &persistenceError)
}

func IsCorruptStateError(err error) bool {
	var corruptStateError *CorruptStateError
	return errors.As(err, &corruptStateError)
}

func (store *Store) persistenceError(operation string, err error) error {
	return &PersistenceError{Operation: operation, Path: store.path, Err: err}
}

func (store *Store) corruptError(err error) error {
	return &CorruptStateError{Path: store.path, Err: err}
}
