package controlplane

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"setta/internal/runtimeaccess"
	"setta/internal/runtimeprovider"
)

const (
	controlPlaneDatabaseName = "control-plane.sqlite"
	controlPlaneStoreVersion = 2
	sqliteDriverName         = "sqlite"
	defaultGrantTTL          = 24 * time.Hour
)

var (
	ErrNotFound            = errors.New("control-plane record not found")
	ErrIdempotencyConflict = errors.New("control-plane idempotency conflict")
	ErrFenceLost           = errors.New("control-plane operation fence lost")
)

type RateLimit struct {
	MaximumRequests int
	Window          time.Duration
}

type StoreConfig struct {
	Clock     func() time.Time
	Directory string
	RateLimit RateLimit
}

type Store struct {
	clock         func() time.Time
	db            *sql.DB
	dbPath        string
	rateLimit     RateLimit
	mu            sync.Mutex
	closed        bool
	invalidations map[grantKey]*grantInvalidation
	hostedUpdates map[string]chan struct{}
	operationWake chan struct{}
}

type grantKey struct {
	deviceID    string
	runtimeName string
}

type grantInvalidation struct {
	channel chan struct{}
	timer   *time.Timer
}

type authorizationRecord struct {
	deviceID          string
	runtimeName       string
	userStatus        UserStatus
	runtimeAccess     RuntimeAccessState
	deviceRevokedAt   sql.NullString
	grantRevokedAt    sql.NullString
	grantExpiresAtRaw string
}

func OpenStore(config StoreConfig) (*Store, error) {
	config = normalizeStoreConfig(config)
	if err := validateStoreConfig(config); err != nil {
		return nil, err
	}
	if err := ensurePrivateDirectory(config.Directory, "control-plane data"); err != nil {
		return nil, err
	}
	dbPath := filepath.Join(config.Directory, controlPlaneDatabaseName)
	if info, err := os.Lstat(dbPath); err == nil && !info.Mode().IsRegular() {
		return nil, errors.New("control-plane database path must be a regular file")
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("inspect control-plane database path: %w", err)
	}
	db, err := sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		return nil, fmt.Errorf("open control-plane database: %w", err)
	}
	db.SetMaxOpenConns(1)
	store := &Store{
		clock:         config.Clock,
		db:            db,
		dbPath:        dbPath,
		rateLimit:     config.RateLimit,
		invalidations: map[grantKey]*grantInvalidation{},
		hostedUpdates: map[string]chan struct{}{},
		operationWake: make(chan struct{}, 1),
	}
	if err := store.configureDatabase(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := os.Chmod(dbPath, 0o600); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("restrict control-plane database: %w", err)
	}
	return store, nil
}

func (store *Store) Path() string {
	return store.dbPath
}

func (store *Store) Close() error {
	if store == nil || store.db == nil {
		return nil
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.closed {
		return nil
	}
	for _, invalidation := range store.invalidations {
		if invalidation.timer != nil {
			invalidation.timer.Stop()
		}
		close(invalidation.channel)
	}
	store.invalidations = nil
	for _, update := range store.hostedUpdates {
		close(update)
	}
	store.hostedUpdates = nil
	if err := store.db.Close(); err != nil {
		return fmt.Errorf("close control-plane database: %w", err)
	}
	store.closed = true
	return nil
}

func (store *Store) UpsertUser(ctx context.Context, userID string) (User, error) {
	if err := validateIdentifier("user id", userID); err != nil {
		return User{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	now := store.clock().UTC()
	_, err := store.db.ExecContext(ctx, `
INSERT INTO users (id, status, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
`, userID, UserStatusActive, timestamp(now))
	if err != nil {
		return User{}, fmt.Errorf("upsert control-plane user: %w", err)
	}
	return store.readUserLocked(ctx, userID)
}

func (store *Store) AssignRuntime(ctx context.Context, request AssignRuntimeRequest) (Runtime, error) {
	if err := validateAssignment(request); err != nil {
		return Runtime{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.assignRuntimeLocked(ctx, request)
}

func (store *Store) assignRuntimeLocked(ctx context.Context, request AssignRuntimeRequest) (Runtime, error) {
	previousRuntime, previousEpoch, err := store.readAssignmentStateLocked(ctx, request.UserID, request.RuntimeName)
	if err != nil {
		return Runtime{}, err
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return Runtime{}, fmt.Errorf("begin runtime assignment: %w", err)
	}
	defer rollback(tx)
	replayed, err := runtimeAssignmentReplay(ctx, tx, request)
	if err != nil {
		return Runtime{}, err
	}
	if replayed {
		if err := tx.Rollback(); err != nil {
			return Runtime{}, fmt.Errorf("close replayed runtime assignment: %w", err)
		}
		return store.readRuntimeLocked(ctx, request.RuntimeName)
	}
	now := timestamp(store.clock().UTC())
	if err := writeRuntimeAssignment(ctx, tx, request, now); err != nil {
		return Runtime{}, err
	}
	if err := tx.Commit(); err != nil {
		return Runtime{}, fmt.Errorf("commit runtime assignment: %w", err)
	}
	store.invalidateChangedAssignmentLocked(previousRuntime, previousEpoch, request)
	return store.readRuntimeLocked(ctx, request.RuntimeName)
}

func (store *Store) invalidateChangedAssignmentLocked(
	previousRuntime string,
	previousEpoch uint64,
	request AssignRuntimeRequest,
) {
	if previousRuntime != "" && previousRuntime != request.RuntimeName {
		store.invalidateRuntimeLocked(previousRuntime)
	}
	if previousEpoch != 0 && previousEpoch != request.CredentialEpoch {
		store.invalidateRuntimeLocked(request.RuntimeName)
	}
}

func writeRuntimeAssignment(
	ctx context.Context,
	tx *sql.Tx,
	request AssignRuntimeRequest,
	now string,
) error {
	result, err := tx.ExecContext(ctx, `
INSERT INTO runtimes (
  name, user_id, lifecycle, access_state, credential_epoch,
  upstream_authority, credential_secret_ref, updated_at
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(name) DO UPDATE SET
  lifecycle = excluded.lifecycle,
  access_state = excluded.access_state,
  credential_epoch = excluded.credential_epoch,
  upstream_authority = excluded.upstream_authority,
  credential_secret_ref = excluded.credential_secret_ref,
  updated_at = excluded.updated_at
WHERE runtimes.user_id = excluded.user_id
`, request.RuntimeName, request.UserID, request.Lifecycle, request.AccessState,
		request.CredentialEpoch, request.UpstreamAuthority, request.CredentialSecretRef, now)
	if err != nil {
		return fmt.Errorf("record assigned runtime: %w", err)
	}
	if err := requireOneRow(result, "record assigned runtime"); err != nil {
		return fmt.Errorf("runtime is owned by another user: %w", err)
	}
	result, err = tx.ExecContext(ctx, `
UPDATE users
SET active_runtime_name = ?, updated_at = ?
WHERE id = ?
`, request.RuntimeName, now, request.UserID)
	if err != nil {
		return fmt.Errorf("assign active runtime: %w", err)
	}
	if err := requireOneRow(result, "assign active runtime"); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO operations (idempotency_key, kind, user_id, runtime_name, request_fingerprint, completed_at)
VALUES (?, 'assign_runtime', ?, ?, ?, ?)
`, request.IdempotencyKey, request.UserID, request.RuntimeName, runtimeAssignmentFingerprint(request), now); err != nil {
		return fmt.Errorf("record runtime assignment operation: %w", err)
	}
	return nil
}

func (store *Store) CreateDeviceGrant(
	ctx context.Context,
	request CreateDeviceGrantRequest,
) (CreatedDeviceGrant, error) {
	if err := validateDeviceGrantRequest(request); err != nil {
		return CreatedDeviceGrant{}, err
	}
	credential, err := NewDeviceCredential()
	if err != nil {
		return CreatedDeviceGrant{}, err
	}
	return store.EnsureDeviceGrant(ctx, EnsureDeviceGrantRequest{
		Credential:  credential,
		UserID:      request.UserID,
		RuntimeName: request.RuntimeName,
		DisplayName: request.DisplayName,
		GrantTTL:    request.GrantTTL,
	})
}

func (store *Store) EnsureDeviceGrant(
	ctx context.Context,
	request EnsureDeviceGrantRequest,
) (CreatedDeviceGrant, error) {
	grantRequest := CreateDeviceGrantRequest{
		UserID:      request.UserID,
		RuntimeName: request.RuntimeName,
		DisplayName: request.DisplayName,
		GrantTTL:    request.GrantTTL,
	}
	if err := validateDeviceGrantRequest(grantRequest); err != nil {
		return CreatedDeviceGrant{}, err
	}
	if err := validateDeviceCredential(request.Credential); err != nil {
		return CreatedDeviceGrant{}, err
	}
	now := store.clock().UTC()
	grantTTL := request.GrantTTL
	if grantTTL == 0 {
		grantTTL = defaultGrantTTL
	}
	device := Device{ID: request.Credential.DeviceID, UserID: request.UserID, DisplayName: request.DisplayName, CreatedAt: now}
	grant := RuntimeAccessGrant{DeviceID: device.ID, RuntimeName: request.RuntimeName, CreatedAt: now, ExpiresAt: now.Add(grantTTL)}
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return CreatedDeviceGrant{}, fmt.Errorf("begin device grant creation: %w", err)
	}
	defer rollback(tx)
	if err := requireActiveRuntime(ctx, tx, request.UserID, request.RuntimeName); err != nil {
		return CreatedDeviceGrant{}, err
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO devices (id, user_id, token_hash, display_name, created_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(id) DO NOTHING
`, device.ID, device.UserID, hashToken(request.Credential.Token), device.DisplayName, timestamp(device.CreatedAt)); err != nil {
		return CreatedDeviceGrant{}, fmt.Errorf("create control-plane device: %w", err)
	}
	if err := requireMatchingDeviceCredential(ctx, tx, device, request.Credential.Token); err != nil {
		return CreatedDeviceGrant{}, err
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO runtime_access_grants (device_id, runtime_name, created_at, expires_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(device_id, runtime_name) DO NOTHING
`, grant.DeviceID, grant.RuntimeName, timestamp(grant.CreatedAt), timestamp(grant.ExpiresAt)); err != nil {
		return CreatedDeviceGrant{}, fmt.Errorf("create runtime access grant: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return CreatedDeviceGrant{}, fmt.Errorf("commit device grant creation: %w", err)
	}
	return store.readDeviceGrantLocked(ctx, device.ID, grant.RuntimeName, request.Credential.Token)
}

func (store *Store) AuthorizeClient(
	ctx context.Context,
	credential string,
) (runtimeaccess.ClientAuthorization, error) {
	if credential == "" {
		return runtimeaccess.ClientAuthorization{Outcome: runtimeaccess.AuthorizationUnauthorized}, nil
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	record, found, err := store.readAuthorizationLocked(ctx, credential)
	if err != nil {
		return runtimeaccess.ClientAuthorization{}, err
	}
	if !found {
		return runtimeaccess.ClientAuthorization{Outcome: runtimeaccess.AuthorizationUnauthorized}, nil
	}
	expiresAt, err := time.Parse(time.RFC3339Nano, record.grantExpiresAtRaw)
	if err != nil {
		return runtimeaccess.ClientAuthorization{}, fmt.Errorf("parse runtime access expiry: %w", err)
	}
	outcome := authorizationOutcome(record, expiresAt, store.clock().UTC())
	if outcome != runtimeaccess.AuthorizationAllowed {
		return runtimeaccess.ClientAuthorization{Outcome: outcome}, nil
	}
	return store.authorizeAllowedRecordLocked(ctx, record, expiresAt)
}

func (store *Store) authorizeAllowedRecordLocked(
	ctx context.Context,
	record authorizationRecord,
	expiresAt time.Time,
) (runtimeaccess.ClientAuthorization, error) {
	allowed, err := store.consumeRateLimitLocked(ctx, record.deviceID)
	if err != nil {
		return runtimeaccess.ClientAuthorization{}, err
	}
	if !allowed {
		return runtimeaccess.ClientAuthorization{Outcome: runtimeaccess.AuthorizationRateLimited}, nil
	}
	key := grantKey{deviceID: record.deviceID, runtimeName: record.runtimeName}
	invalidated := store.invalidationLocked(key, expiresAt)
	return runtimeaccess.ClientAuthorization{
		Outcome:     runtimeaccess.AuthorizationAllowed,
		RuntimeName: record.runtimeName,
		Invalidated: invalidated,
	}, nil
}

func authorizationOutcome(
	record authorizationRecord,
	expiresAt time.Time,
	now time.Time,
) runtimeaccess.AuthorizationOutcome {
	if record.deviceRevokedAt.Valid || record.grantRevokedAt.Valid || !now.Before(expiresAt) {
		return runtimeaccess.AuthorizationRevoked
	}
	if record.userStatus == UserStatusSuspended || record.runtimeAccess == RuntimeAccessSuspended {
		return runtimeaccess.AuthorizationSuspended
	}
	return runtimeaccess.AuthorizationAllowed
}

func (store *Store) RevokeDevice(ctx context.Context, deviceID string) error {
	if err := validateIdentifier("device id", deviceID); err != nil {
		return err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	result, err := store.db.ExecContext(ctx, `
UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL
`, timestamp(store.clock().UTC()), deviceID)
	if err != nil {
		return fmt.Errorf("revoke control-plane device: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read revoked device count: %w", err)
	}
	if rows == 0 {
		var existingID string
		err := store.db.QueryRowContext(ctx, `SELECT id FROM devices WHERE id = ?`, deviceID).Scan(&existingID)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("confirm control-plane device revocation: %w", err)
		}
		return nil
	}
	store.invalidateDeviceLocked(deviceID)
	return nil
}

func (store *Store) SetUserStatus(ctx context.Context, userID string, status UserStatus) error {
	if err := validateIdentifier("user id", userID); err != nil {
		return err
	}
	if !validUserStatus(status) {
		return fmt.Errorf("invalid user status %q", status)
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	deviceIDs, err := store.readUserDeviceIDsLocked(ctx, userID)
	if err != nil {
		return err
	}
	result, err := store.db.ExecContext(ctx, `
UPDATE users SET status = ?, updated_at = ? WHERE id = ?
`, status, timestamp(store.clock().UTC()), userID)
	if err != nil {
		return fmt.Errorf("set control-plane user status: %w", err)
	}
	if err := requireOneRow(result, "set control-plane user status"); err != nil {
		return err
	}
	if status == UserStatusSuspended {
		for _, deviceID := range deviceIDs {
			store.invalidateDeviceLocked(deviceID)
		}
	} else {
		store.notifyOperationWakeLocked()
	}
	return nil
}

func (store *Store) SetRuntimeAccessState(
	ctx context.Context,
	runtimeName string,
	state RuntimeAccessState,
) error {
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return err
	}
	if !validRuntimeAccessState(state) {
		return fmt.Errorf("invalid runtime access state %q", state)
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	result, err := store.db.ExecContext(ctx, `
UPDATE runtimes SET access_state = ?, updated_at = ? WHERE name = ?
`, state, timestamp(store.clock().UTC()), runtimeName)
	if err != nil {
		return fmt.Errorf("set runtime access state: %w", err)
	}
	if err := requireOneRow(result, "set runtime access state"); err != nil {
		return err
	}
	if state == RuntimeAccessSuspended {
		store.invalidateRuntimeLocked(runtimeName)
	}
	return nil
}

func (store *Store) ResolveRoute(ctx context.Context, runtimeName string) (RouteRecord, error) {
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return RouteRecord{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	var route RouteRecord
	err := store.db.QueryRowContext(ctx, `
SELECT r.name, r.upstream_authority, r.credential_secret_ref
FROM runtimes r
JOIN users u ON u.id = r.user_id AND u.active_runtime_name = r.name
WHERE r.name = ? AND u.status = ? AND r.access_state = ? AND r.lifecycle = ?
`, runtimeName, UserStatusActive, RuntimeAccessEnabled, RuntimeLifecycleReady).Scan(
		&route.RuntimeName,
		&route.UpstreamAuthority,
		&route.CredentialSecretRef,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return RouteRecord{}, ErrNotFound
	}
	if err != nil {
		return RouteRecord{}, fmt.Errorf("resolve control-plane route: %w", err)
	}
	return route, nil
}

func (store *Store) readAuthorizationLocked(
	ctx context.Context,
	credential string,
) (authorizationRecord, bool, error) {
	digest := hashToken(credential)
	var record authorizationRecord
	var storedHash []byte
	err := store.db.QueryRowContext(ctx, `
SELECT d.id, d.token_hash, r.name, u.status, r.access_state,
       d.revoked_at, g.revoked_at, g.expires_at
FROM devices d
JOIN users u ON u.id = d.user_id
JOIN runtimes r ON r.name = u.active_runtime_name AND r.user_id = u.id
JOIN runtime_access_grants g ON g.device_id = d.id AND g.runtime_name = r.name
WHERE d.token_hash = ?
`, digest).Scan(
		&record.deviceID,
		&storedHash,
		&record.runtimeName,
		&record.userStatus,
		&record.runtimeAccess,
		&record.deviceRevokedAt,
		&record.grantRevokedAt,
		&record.grantExpiresAtRaw,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return authorizationRecord{}, false, nil
	}
	if err != nil {
		return authorizationRecord{}, false, fmt.Errorf("authorize control-plane credential: %w", err)
	}
	if subtle.ConstantTimeCompare(digest, storedHash) != 1 {
		return authorizationRecord{}, false, nil
	}
	return record, true, nil
}

func (store *Store) consumeRateLimitLocked(ctx context.Context, deviceID string) (bool, error) {
	now := store.clock().UTC()
	windowStart := now.Truncate(store.rateLimit.Window)
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("begin gateway rate-limit update: %w", err)
	}
	defer rollback(tx)
	var storedWindow string
	var requestCount int
	err = tx.QueryRowContext(ctx, `
SELECT window_started_at, request_count FROM gateway_rate_windows WHERE device_id = ?
`, deviceID).Scan(&storedWindow, &requestCount)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		requestCount = 0
	case err != nil:
		return false, fmt.Errorf("read gateway rate limit: %w", err)
	case storedWindow != timestamp(windowStart):
		requestCount = 0
	}
	if requestCount >= store.rateLimit.MaximumRequests {
		return false, nil
	}
	requestCount++
	if _, err := tx.ExecContext(ctx, `
INSERT INTO gateway_rate_windows (device_id, window_started_at, request_count)
VALUES (?, ?, ?)
ON CONFLICT(device_id) DO UPDATE SET
  window_started_at = excluded.window_started_at,
  request_count = excluded.request_count
`, deviceID, timestamp(windowStart), requestCount); err != nil {
		return false, fmt.Errorf("update gateway rate limit: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("commit gateway rate limit: %w", err)
	}
	return true, nil
}

func (store *Store) invalidationLocked(key grantKey, expiresAt time.Time) <-chan struct{} {
	if existing := store.invalidations[key]; existing != nil {
		return existing.channel
	}
	entry := &grantInvalidation{channel: make(chan struct{})}
	delay := expiresAt.Sub(store.clock().UTC())
	if delay <= 0 {
		close(entry.channel)
	} else {
		entry.timer = time.AfterFunc(delay, func() {
			store.mu.Lock()
			defer store.mu.Unlock()
			current := store.invalidations[key]
			if current == entry {
				close(current.channel)
				delete(store.invalidations, key)
			}
		})
	}
	store.invalidations[key] = entry
	return entry.channel
}

func (store *Store) invalidateDeviceLocked(deviceID string) {
	for key := range store.invalidations {
		if key.deviceID == deviceID {
			store.invalidateGrantLocked(key)
		}
	}
}

func (store *Store) invalidateRuntimeLocked(runtimeName string) {
	for key := range store.invalidations {
		if key.runtimeName == runtimeName {
			store.invalidateGrantLocked(key)
		}
	}
}

func (store *Store) readUserDeviceIDsLocked(ctx context.Context, userID string) ([]string, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT id FROM devices WHERE user_id = ?`, userID)
	if err != nil {
		return nil, fmt.Errorf("read control-plane user devices: %w", err)
	}
	defer rows.Close()
	var deviceIDs []string
	for rows.Next() {
		var deviceID string
		if err := rows.Scan(&deviceID); err != nil {
			return nil, fmt.Errorf("scan control-plane user device: %w", err)
		}
		deviceIDs = append(deviceIDs, deviceID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read control-plane user devices: %w", err)
	}
	return deviceIDs, nil
}

func (store *Store) invalidateGrantLocked(key grantKey) {
	entry := store.invalidations[key]
	if entry == nil {
		return
	}
	if entry.timer != nil {
		entry.timer.Stop()
	}
	close(entry.channel)
	delete(store.invalidations, key)
}

func normalizeStoreConfig(config StoreConfig) StoreConfig {
	if config.Clock == nil {
		config.Clock = time.Now
	}
	if config.RateLimit.MaximumRequests == 0 {
		config.RateLimit.MaximumRequests = 120
	}
	if config.RateLimit.Window == 0 {
		config.RateLimit.Window = time.Minute
	}
	return config
}

func validateStoreConfig(config StoreConfig) error {
	if config.Directory == "" || !filepath.IsAbs(config.Directory) {
		return errors.New("control-plane data directory must be absolute")
	}
	if config.RateLimit.MaximumRequests <= 0 || config.RateLimit.Window <= 0 {
		return errors.New("control-plane rate limit must be positive")
	}
	return nil
}

func validateAssignment(request AssignRuntimeRequest) error {
	if err := validateIdentifier("idempotency key", request.IdempotencyKey); err != nil {
		return err
	}
	if err := validateIdentifier("user id", request.UserID); err != nil {
		return err
	}
	if err := runtimeprovider.ValidateManagedName(request.RuntimeName); err != nil {
		return err
	}
	if !validRuntimeLifecycle(request.Lifecycle) {
		return fmt.Errorf("invalid runtime lifecycle %q", request.Lifecycle)
	}
	if !validRuntimeAccessState(request.AccessState) {
		return fmt.Errorf("invalid runtime access state %q", request.AccessState)
	}
	if request.CredentialEpoch == 0 {
		return errors.New("runtime credential epoch must be positive")
	}
	if err := validateAuthority(request.UpstreamAuthority); err != nil {
		return err
	}
	return validateSecretReference(request.CredentialSecretRef)
}

func validateDeviceGrantRequest(request CreateDeviceGrantRequest) error {
	if err := validateIdentifier("user id", request.UserID); err != nil {
		return err
	}
	if err := runtimeprovider.ValidateManagedName(request.RuntimeName); err != nil {
		return err
	}
	if strings.TrimSpace(request.DisplayName) == "" || request.DisplayName != strings.TrimSpace(request.DisplayName) {
		return errors.New("device display name must be non-empty trimmed text")
	}
	if request.GrantTTL < 0 || request.GrantTTL > 30*24*time.Hour {
		return errors.New("runtime access grant TTL must be between zero and 30 days")
	}
	return nil
}

func validUserStatus(status UserStatus) bool {
	return status == UserStatusActive || status == UserStatusSuspended
}

func validRuntimeLifecycle(lifecycle RuntimeLifecycle) bool {
	switch lifecycle {
	case RuntimeLifecycleProvisioning, RuntimeLifecycleReady, RuntimeLifecycleDeleting, RuntimeLifecycleFailed:
		return true
	default:
		return false
	}
}

func validRuntimeAccessState(state RuntimeAccessState) bool {
	return state == RuntimeAccessEnabled || state == RuntimeAccessSuspended
}

func validateIdentifier(label string, value string) error {
	if value == "" || value != strings.TrimSpace(value) || len(value) > 200 {
		return fmt.Errorf("%s must be non-empty trimmed text up to 200 characters", label)
	}
	for _, character := range value {
		if character < 0x21 || character > 0x7e {
			return fmt.Errorf("%s must contain only visible ASCII", label)
		}
	}
	return nil
}

func validateAuthority(authority string) error {
	if strings.TrimSpace(authority) == "" || strings.ContainsAny(authority, "/?#@ \t\r\n") {
		return errors.New("runtime upstream authority must be a bare loopback host:port authority")
	}
	host, port, err := net.SplitHostPort(authority)
	if err != nil {
		return fmt.Errorf("runtime upstream authority is invalid: %w", err)
	}
	parsedPort, err := strconv.ParseUint(port, 10, 16)
	if err != nil || parsedPort == 0 {
		return errors.New("runtime upstream authority port must be between 1 and 65535")
	}
	if host == "localhost" {
		return nil
	}
	parsedHost := net.ParseIP(host)
	if parsedHost == nil || !parsedHost.IsLoopback() {
		return errors.New("runtime upstream authority host must be loopback")
	}
	return nil
}

func validateSecretReference(reference string) error {
	if err := validateIdentifier("credential secret reference", reference); err != nil {
		return err
	}
	for _, character := range reference {
		if (character < 'a' || character > 'z') && (character < '0' || character > '9') && character != '-' && character != '_' {
			return errors.New("credential secret reference must contain lowercase letters, digits, dashes, or underscores")
		}
	}
	return nil
}

func timestamp(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.000000000Z")
}

func hashToken(token string) []byte {
	digest := sha256.Sum256([]byte(token))
	return digest[:]
}

func runtimeAssignmentFingerprint(request AssignRuntimeRequest) string {
	fields := []string{
		request.UserID,
		request.RuntimeName,
		string(request.Lifecycle),
		string(request.AccessState),
		strconv.FormatUint(request.CredentialEpoch, 10),
		request.UpstreamAuthority,
		request.CredentialSecretRef,
	}
	digest := sha256.Sum256([]byte(strings.Join(fields, "\x00")))
	return hex.EncodeToString(digest[:])
}

func randomToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate control-plane token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func NewDeviceCredential() (DeviceCredential, error) {
	deviceID, err := randomIdentifier("device")
	if err != nil {
		return DeviceCredential{}, err
	}
	token, err := randomToken()
	if err != nil {
		return DeviceCredential{}, err
	}
	return DeviceCredential{DeviceID: deviceID, Token: token}, nil
}

// ValidateDeviceCredential validates a credential before it crosses a
// process or provider boundary.
func ValidateDeviceCredential(credential DeviceCredential) error {
	return validateDeviceCredential(credential)
}

func validateDeviceCredential(credential DeviceCredential) error {
	if err := validateIdentifier("device id", credential.DeviceID); err != nil {
		return err
	}
	decoded, err := base64.RawURLEncoding.DecodeString(credential.Token)
	if err != nil || len(decoded) != 32 {
		return errors.New("device credential token must be 32 bytes of base64url entropy")
	}
	return nil
}

func randomIdentifier(prefix string) (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate control-plane identifier: %w", err)
	}
	return prefix + "_" + base64.RawURLEncoding.EncodeToString(raw), nil
}

func requireOneRow(result sql.Result, operation string) error {
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read %s row count: %w", operation, err)
	}
	if rows != 1 {
		return ErrNotFound
	}
	return nil
}

func rollback(tx *sql.Tx) {
	_ = tx.Rollback()
}

var _ runtimeaccess.ClientAuthorizer = (*Store)(nil)
