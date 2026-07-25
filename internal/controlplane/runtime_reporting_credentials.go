package controlplane

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"setta/internal/runtimeprovider"
)

type RuntimeReportingCredential struct {
	Token string `json:"token"`
}

type RuntimeReportingCredentialRotation struct {
	Epoch       uint64
	RuntimeName string
	UpdatedAt   time.Time
}

func NewRuntimeReportingCredential() (RuntimeReportingCredential, error) {
	token, err := randomToken()
	if err != nil {
		return RuntimeReportingCredential{}, err
	}
	return RuntimeReportingCredential{Token: token}, nil
}

func ValidateRuntimeReportingCredential(credential RuntimeReportingCredential) error {
	decoded, err := base64.RawURLEncoding.DecodeString(credential.Token)
	if err != nil || len(decoded) != 32 {
		return errors.New("runtime reporting credential token must be 32 bytes of base64url")
	}
	return nil
}

func (store *Store) RotateRuntimeReportingCredential(
	ctx context.Context,
	runtimeName string,
	credential RuntimeReportingCredential,
) (RuntimeReportingCredentialRotation, error) {
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return RuntimeReportingCredentialRotation{}, err
	}
	if err := ValidateRuntimeReportingCredential(credential); err != nil {
		return RuntimeReportingCredentialRotation{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.rotateRuntimeReportingCredentialLocked(ctx, runtimeName, credential)
}

func (store *Store) rotateRuntimeReportingCredentialLocked(
	ctx context.Context,
	runtimeName string,
	credential RuntimeReportingCredential,
) (RuntimeReportingCredentialRotation, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return RuntimeReportingCredentialRotation{}, fmt.Errorf("begin runtime reporting credential rotation: %w", err)
	}
	defer rollback(tx)
	if err := requireRuntimeExists(ctx, tx, runtimeName); err != nil {
		return RuntimeReportingCredentialRotation{}, err
	}
	now := store.clock().UTC()
	tokenHash := hashToken(credential.Token)
	epoch, updatedAt, found, err := readRuntimeReportingCredential(ctx, tx, runtimeName, tokenHash)
	if err != nil {
		return RuntimeReportingCredentialRotation{}, err
	}
	if !found {
		epoch, err = writeRuntimeReportingCredential(ctx, tx, runtimeName, tokenHash, now)
		if err != nil {
			return RuntimeReportingCredentialRotation{}, err
		}
		updatedAt = now
	}
	if err := tx.Commit(); err != nil {
		return RuntimeReportingCredentialRotation{}, fmt.Errorf("commit runtime reporting credential rotation: %w", err)
	}
	return RuntimeReportingCredentialRotation{
		Epoch:       epoch,
		RuntimeName: runtimeName,
		UpdatedAt:   updatedAt,
	}, nil
}

func requireRuntimeExists(ctx context.Context, tx *sql.Tx, runtimeName string) error {
	var found int
	err := tx.QueryRowContext(ctx, `SELECT 1 FROM runtimes WHERE name = ?`, runtimeName).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("read runtime for reporting credential: %w", err)
	}
	return nil
}

func readRuntimeReportingCredential(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
	tokenHash []byte,
) (uint64, time.Time, bool, error) {
	var epoch uint64
	var storedHash []byte
	var updatedAtRaw string
	err := tx.QueryRowContext(ctx, `
SELECT token_hash, epoch, updated_at
FROM runtime_reporting_credentials
WHERE runtime_name = ?
`, runtimeName).Scan(&storedHash, &epoch, &updatedAtRaw)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, time.Time{}, false, nil
	}
	if err != nil {
		return 0, time.Time{}, false, fmt.Errorf("read runtime reporting credential: %w", err)
	}
	updatedAt, err := time.Parse(time.RFC3339Nano, updatedAtRaw)
	if err != nil {
		return 0, time.Time{}, false, fmt.Errorf("parse runtime reporting credential update: %w", err)
	}
	return epoch, updatedAt, subtle.ConstantTimeCompare(storedHash, tokenHash) == 1, nil
}

func writeRuntimeReportingCredential(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
	tokenHash []byte,
	now time.Time,
) (uint64, error) {
	var epoch uint64
	err := tx.QueryRowContext(ctx, `
INSERT INTO runtime_reporting_credentials (runtime_name, token_hash, epoch, updated_at)
VALUES (?, ?, 1, ?)
ON CONFLICT(runtime_name) DO UPDATE SET
  token_hash = excluded.token_hash,
  epoch = runtime_reporting_credentials.epoch + 1,
  updated_at = excluded.updated_at
RETURNING epoch
`, runtimeName, tokenHash, timestamp(now)).Scan(&epoch)
	if err != nil {
		return 0, fmt.Errorf("write runtime reporting credential: %w", err)
	}
	return epoch, nil
}

func (store *Store) AuthorizeRuntimeReporter(
	ctx context.Context,
	credential RuntimeReportingCredential,
) (string, bool, error) {
	if err := ValidateRuntimeReportingCredential(credential); err != nil {
		return "", false, nil
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	var runtimeName string
	err := store.db.QueryRowContext(ctx, `
SELECT runtime_name
FROM runtime_reporting_credentials
WHERE token_hash = ?
`, hashToken(credential.Token)).Scan(&runtimeName)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("authorize runtime reporter: %w", err)
	}
	return runtimeName, true, nil
}
