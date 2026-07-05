package runtimeauth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
)

const (
	ProvisionedPairingTokenTTL = 60 * time.Minute

	setupAttestationAlgorithm = "hmac-sha256-v1"
	setupAttestationContext   = "setta-setup-attestation-v1"
)

type SeedProvisionedPairingTokenInput struct {
	PairingTokenHash string
	ProvisionID      string
	AttestationKey   string
	ExpiresAt        time.Time
}

type SetupAttestationChallenge struct {
	RuntimeID       string
	ProvisionID     string
	Nonce           string
	NodeFingerprint string
}

type SetupAttestation struct {
	Algorithm       string
	RuntimeID       string
	ProvisionID     string
	Nonce           string
	NodeFingerprint string
	ExpiresAt       string
	Attestation     string
}

type SetupAttestationStatus string

const (
	SetupAttestationOK            SetupAttestationStatus = "ok"
	SetupAttestationNotFound      SetupAttestationStatus = "not_found"
	SetupAttestationExpired       SetupAttestationStatus = "expired"
	SetupAttestationAlreadyPaired SetupAttestationStatus = "already_paired"
	SetupAttestationReplayedNonce SetupAttestationStatus = "replayed_nonce"
)

type setupAttestationFields struct {
	RuntimeID       string
	ProvisionID     string
	Nonce           string
	NodeFingerprint string
}

type provisionedPairingRow struct {
	PairingID      string
	ExpiresAt      string
	UsedAt         *string
	AttestationKey []byte
}

func (store *Store) SeedProvisionedPairingToken(ctx context.Context, input SeedProvisionedPairingTokenInput) (PairingToken, error) {
	tokenHash, provisionID, attestationKey, err := validateProvisionedPairingSeed(input)
	if err != nil {
		return PairingToken{}, err
	}
	id, err := randomPrefixedID("pairing")
	if err != nil {
		return PairingToken{}, err
	}
	now := store.clock()
	expiresAt := input.ExpiresAt
	if expiresAt.IsZero() {
		expiresAt = now.Add(ProvisionedPairingTokenTTL)
	}
	if !expiresAt.After(now) {
		return PairingToken{}, errors.New("provisioned pairing token expiresAt must be in the future")
	}
	pairing := PairingToken{
		ID:        id,
		CreatedAt: timestamp(now),
		ExpiresAt: timestamp(expiresAt),
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.seedProvisionedPairingToken(ctx, pairing, tokenHash, provisionID, attestationKey)
}

func (store *Store) CreateSetupAttestation(
	ctx context.Context,
	challenge SetupAttestationChallenge,
) (SetupAttestation, SetupAttestationStatus, error) {
	fields, err := validateSetupAttestationChallenge(challenge)
	if err != nil {
		return SetupAttestation{}, "", err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	row, status, err := store.availableProvisionedPairing(ctx, fields.ProvisionID)
	if err != nil || status != SetupAttestationOK {
		return SetupAttestation{}, status, err
	}
	replayed, err := store.recordSetupAttestationNonce(ctx, row.PairingID, fields.Nonce)
	if err != nil {
		return SetupAttestation{}, "", err
	}
	if replayed {
		return SetupAttestation{}, SetupAttestationReplayedNonce, nil
	}
	return setupAttestationFromRow(row, fields), SetupAttestationOK, nil
}

func (store *Store) seedProvisionedPairingToken(
	ctx context.Context,
	pairing PairingToken,
	tokenHash []byte,
	provisionID string,
	attestationKey []byte,
) (PairingToken, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return PairingToken{}, store.persistenceError("begin provisioned pairing seed", err)
	}
	defer rollback(tx)
	if _, err := tx.ExecContext(ctx, `
INSERT INTO pairing_tokens (id, token_hash, created_at, expires_at)
VALUES (?, ?, ?, ?)
`, pairing.ID, tokenHash, pairing.CreatedAt, pairing.ExpiresAt); err != nil {
		return PairingToken{}, store.persistenceError("seed provisioned pairing token", err)
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO provisioned_pairing_tokens (pairing_token_id, provision_id, attestation_key, created_at, expires_at)
VALUES (?, ?, ?, ?, ?)
`, pairing.ID, provisionID, attestationKey, pairing.CreatedAt, pairing.ExpiresAt); err != nil {
		return PairingToken{}, store.persistenceError("seed provisioned pairing metadata", err)
	}
	if err := tx.Commit(); err != nil {
		return PairingToken{}, store.persistenceError("commit provisioned pairing seed", err)
	}
	return pairing, nil
}

func (store *Store) availableProvisionedPairing(
	ctx context.Context,
	provisionID string,
) (provisionedPairingRow, SetupAttestationStatus, error) {
	row, ok, err := store.queryProvisionedPairingByProvisionID(ctx, provisionID)
	if err != nil {
		return provisionedPairingRow{}, "", err
	}
	if !ok {
		return provisionedPairingRow{}, SetupAttestationNotFound, nil
	}
	if row.UsedAt != nil {
		return provisionedPairingRow{}, SetupAttestationAlreadyPaired, nil
	}
	expiresAt, err := time.Parse(time.RFC3339Nano, row.ExpiresAt)
	if err != nil {
		return provisionedPairingRow{}, "", store.corruptError("provisioned pairing token", fmt.Errorf("expires_at must be RFC3339: %w", err))
	}
	if store.clock().After(expiresAt) {
		return provisionedPairingRow{}, SetupAttestationExpired, nil
	}
	if len(row.AttestationKey) == 0 {
		return provisionedPairingRow{}, SetupAttestationAlreadyPaired, nil
	}
	return row, SetupAttestationOK, nil
}

func (store *Store) queryProvisionedPairingByProvisionID(
	ctx context.Context,
	provisionID string,
) (provisionedPairingRow, bool, error) {
	var row provisionedPairingRow
	var usedAt sql.NullString
	err := store.db.QueryRowContext(ctx, `
SELECT pairing_tokens.id, pairing_tokens.expires_at, pairing_tokens.used_at, provisioned_pairing_tokens.attestation_key
FROM provisioned_pairing_tokens
JOIN pairing_tokens ON pairing_tokens.id = provisioned_pairing_tokens.pairing_token_id
WHERE provisioned_pairing_tokens.provision_id = ?
`, provisionID).Scan(&row.PairingID, &row.ExpiresAt, &usedAt, &row.AttestationKey)
	if errors.Is(err, sql.ErrNoRows) {
		return provisionedPairingRow{}, false, nil
	}
	if err != nil {
		return provisionedPairingRow{}, false, store.persistenceError("resolve provisioned pairing token", err)
	}
	row.UsedAt = nullableStringPointer(usedAt)
	return row, true, nil
}

func (store *Store) recordSetupAttestationNonce(ctx context.Context, pairingID string, nonce string) (bool, error) {
	nonceHash := hashToken(nonce)
	var existing int
	err := store.db.QueryRowContext(ctx, `
SELECT 1
FROM setup_attestation_nonces
WHERE pairing_token_id = ? AND nonce_hash = ?
`, pairingID, nonceHash[:]).Scan(&existing)
	if err == nil {
		return true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return false, store.persistenceError("resolve setup attestation nonce", err)
	}
	if _, err := store.db.ExecContext(ctx, `
INSERT INTO setup_attestation_nonces (pairing_token_id, nonce_hash, created_at)
VALUES (?, ?, ?)
`, pairingID, nonceHash[:], timestamp(store.clock())); err != nil {
		return false, store.persistenceError("record setup attestation nonce", err)
	}
	return false, nil
}

func setupAttestationFromRow(row provisionedPairingRow, fields setupAttestationFields) SetupAttestation {
	return SetupAttestation{
		Algorithm:       setupAttestationAlgorithm,
		RuntimeID:       fields.RuntimeID,
		ProvisionID:     fields.ProvisionID,
		Nonce:           fields.Nonce,
		NodeFingerprint: fields.NodeFingerprint,
		ExpiresAt:       row.ExpiresAt,
		Attestation: computeSetupAttestation(
			row.AttestationKey,
			fields.RuntimeID,
			fields.ProvisionID,
			fields.Nonce,
			fields.NodeFingerprint,
		),
	}
}

func validateProvisionedPairingSeed(input SeedProvisionedPairingTokenInput) ([]byte, string, []byte, error) {
	tokenHash, err := validatePairingTokenHash(input.PairingTokenHash)
	if err != nil {
		return nil, "", nil, err
	}
	provisionID, err := validateProvisionID(input.ProvisionID)
	if err != nil {
		return nil, "", nil, err
	}
	attestationKey, err := validateAttestationKey(input.AttestationKey)
	if err != nil {
		return nil, "", nil, err
	}
	return tokenHash, provisionID, attestationKey, nil
}

func validateSetupAttestationChallenge(challenge SetupAttestationChallenge) (setupAttestationFields, error) {
	runtimeID, err := validateSetupAttestationField("runtimeID", challenge.RuntimeID, 1, 128)
	if err != nil {
		return setupAttestationFields{}, err
	}
	provisionID, err := validateProvisionID(challenge.ProvisionID)
	if err != nil {
		return setupAttestationFields{}, err
	}
	nonce, err := validateSetupAttestationField("nonce", challenge.Nonce, 16, 512)
	if err != nil {
		return setupAttestationFields{}, err
	}
	nodeFingerprint, err := validateSetupAttestationField("nodeFingerprint", challenge.NodeFingerprint, 1, 512)
	if err != nil {
		return setupAttestationFields{}, err
	}
	return setupAttestationFields{
		RuntimeID:       runtimeID,
		ProvisionID:     provisionID,
		Nonce:           nonce,
		NodeFingerprint: nodeFingerprint,
	}, nil
}

func validatePairingTokenHash(value string) ([]byte, error) {
	if strings.TrimSpace(value) != value || value == "" {
		return nil, errors.New("pairing token hash is required")
	}
	decoded, err := hex.DecodeString(value)
	if err != nil || len(decoded) != sha256.Size || strings.ToLower(value) != value {
		return nil, errors.New("pairing token hash must be 64 lowercase hex characters")
	}
	return decoded, nil
}

func validateProvisionID(value string) (string, error) {
	return validateSetupAttestationField("provisionId", value, 8, 128)
}

func validateAttestationKey(value string) ([]byte, error) {
	if strings.TrimSpace(value) != value || value == "" {
		return nil, errors.New("provision attestation key is required")
	}
	if len(value) < 32 {
		return nil, errors.New("provision attestation key must be at least 32 bytes")
	}
	if len(value) > 4096 {
		return nil, errors.New("provision attestation key must be at most 4096 bytes")
	}
	if containsControlCharacter(value) {
		return nil, errors.New("provision attestation key must not contain control characters")
	}
	return []byte(value), nil
}

func validateSetupAttestationField(name string, value string, minLength int, maxLength int) (string, error) {
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

func containsControlCharacter(value string) bool {
	for _, char := range value {
		if char < 0x20 || char == 0x7f {
			return true
		}
	}
	return false
}

func computeSetupAttestation(
	attestationKey []byte,
	runtimeID string,
	provisionID string,
	nonce string,
	nodeFingerprint string,
) string {
	mac := hmac.New(sha256.New, attestationKey)
	writeHMACField(mac, setupAttestationContext)
	writeHMACField(mac, runtimeID)
	writeHMACField(mac, provisionID)
	writeHMACField(mac, nonce)
	writeHMACField(mac, nodeFingerprint)
	return hex.EncodeToString(mac.Sum(nil))
}

func writeHMACField(writer io.Writer, value string) {
	_, _ = writer.Write([]byte(value))
	_, _ = writer.Write([]byte{0})
}
