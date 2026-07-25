package runtimeauth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

const (
	DeviceScopeFull DeviceScope = "full"

	PairingTokenTTL = 10 * time.Minute

	runtimeAuthDatabaseName = "runtime-auth.sqlite"
	runtimeAuthStoreVersion = 2
	sqliteDriverName        = "sqlite"
)

type DeviceScope string

type ContractValueSet struct {
	Name   string
	Values []string
}

type DeviceSession struct {
	ID          string      `json:"deviceId"`
	Scope       DeviceScope `json:"scope"`
	DisplayName string      `json:"displayName"`
	CreatedAt   string      `json:"createdAt"`
	LastSeenAt  string      `json:"lastSeenAt"`
	RevokedAt   *string     `json:"revokedAt"`
	IsBootstrap bool        `json:"-"`
}

type PairingToken struct {
	ID        string  `json:"pairingTokenId"`
	CreatedAt string  `json:"createdAt"`
	ExpiresAt string  `json:"expiresAt"`
	UsedAt    *string `json:"usedAt"`
}

type Store struct {
	appDataDir string
	dbPath     string
	db         *sql.DB
	clock      func() time.Time
	mu         sync.Mutex
	closed     bool
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

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{{
		Name:   "DeviceScope",
		Values: []string{string(DeviceScopeFull)},
	}}
}

func WithClock(clock func() time.Time) StoreOption {
	return func(store *Store) {
		store.clock = clock
	}
}

func (err *PersistenceError) Error() string {
	return fmt.Sprintf("%s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *PersistenceError) Unwrap() error {
	return err.Err
}

func (err *CorruptStateError) Error() string {
	return fmt.Sprintf("malformed runtime auth state %s: %v", err.Path, err.Err)
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

func NewStore(appDataDir string, options ...StoreOption) (*Store, error) {
	if appDataDir == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	appDataDir = filepath.Clean(appDataDir)
	runtimeDir := filepath.Join(appDataDir, "runtime")
	if err := os.MkdirAll(runtimeDir, 0o755); err != nil {
		return nil, &PersistenceError{Operation: "create runtime auth database directory", Path: runtimeDir, Err: err}
	}
	dbPath := filepath.Join(runtimeDir, runtimeAuthDatabaseName)
	db, err := sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		return nil, &PersistenceError{Operation: "open runtime auth database", Path: dbPath, Err: err}
	}
	db.SetMaxOpenConns(1)
	store := &Store{
		appDataDir: appDataDir,
		dbPath:     dbPath,
		db:         db,
		clock:      time.Now,
	}
	for _, option := range options {
		option(store)
	}
	if err := store.configureDatabase(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
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
	if err := store.db.Close(); err != nil {
		return store.persistenceError("close runtime auth database", err)
	}
	store.closed = true
	return nil
}

func (store *Store) CreateDeviceSession(ctx context.Context, displayName string) (DeviceSession, string, error) {
	session, token, err := newDeviceSession(displayName, store.clock())
	if err != nil {
		return DeviceSession{}, "", err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if err := store.insertDeviceSession(ctx, store.db, session, token); err != nil {
		return DeviceSession{}, "", err
	}
	return session, token, nil
}

func (store *Store) CreateBootstrapDeviceSession(ctx context.Context, displayName string) (DeviceSession, string, error) {
	session, token, err := newDeviceSession(displayName, store.clock())
	if err != nil {
		return DeviceSession{}, "", err
	}
	session.IsBootstrap = true
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return DeviceSession{}, "", store.persistenceError("begin bootstrap device session creation", err)
	}
	defer rollback(tx)
	revokedAt := timestamp(store.clock())
	if _, err := tx.ExecContext(ctx, `
UPDATE device_sessions
SET revoked_at = ?
WHERE is_bootstrap = 1 AND revoked_at IS NULL
`, revokedAt); err != nil {
		return DeviceSession{}, "", store.persistenceError("revoke stale bootstrap device sessions", err)
	}
	if err := store.insertDeviceSession(ctx, tx, session, token); err != nil {
		return DeviceSession{}, "", err
	}
	if err := tx.Commit(); err != nil {
		return DeviceSession{}, "", store.persistenceError("commit bootstrap device session creation", err)
	}
	return session, token, nil
}

func (store *Store) ResolveDeviceToken(ctx context.Context, token string) (DeviceSession, bool, error) {
	if token == "" {
		return DeviceSession{}, false, nil
	}
	tokenHash := hashToken(token)
	store.mu.Lock()
	defer store.mu.Unlock()
	session, storedHash, ok, err := store.queryDeviceSessionByTokenHash(ctx, tokenHash[:])
	if err != nil || !ok {
		return DeviceSession{}, false, err
	}
	if subtle.ConstantTimeCompare(tokenHash[:], storedHash) != 1 || session.RevokedAt != nil {
		return DeviceSession{}, false, nil
	}
	return session, true, nil
}

func (store *Store) TouchDeviceSession(ctx context.Context, deviceID string) (bool, error) {
	if deviceID == "" {
		return false, errors.New("device id is required")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	result, err := store.db.ExecContext(ctx, `
UPDATE device_sessions
SET last_seen_at = ?
WHERE id = ? AND revoked_at IS NULL
`, timestamp(store.clock()), deviceID)
	if err != nil {
		return false, store.persistenceError("touch device session", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return false, store.persistenceError("read touched device session count", err)
	}
	return rows == 1, nil
}

func (store *Store) CreatePairingToken(ctx context.Context) (PairingToken, string, error) {
	id, err := randomPrefixedID("pairing")
	if err != nil {
		return PairingToken{}, "", err
	}
	token, err := randomToken()
	if err != nil {
		return PairingToken{}, "", err
	}
	now := store.clock()
	pairing := PairingToken{
		ID:        id,
		CreatedAt: timestamp(now),
		ExpiresAt: timestamp(now.Add(PairingTokenTTL)),
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	_, err = store.db.ExecContext(ctx, `
INSERT INTO pairing_tokens (id, token_hash, created_at, expires_at)
VALUES (?, ?, ?, ?)
`, pairing.ID, hashTokenBytes(token), pairing.CreatedAt, pairing.ExpiresAt)
	if err != nil {
		return PairingToken{}, "", store.persistenceError("create pairing token", err)
	}
	return pairing, token, nil
}

func (store *Store) CompletePairing(
	ctx context.Context,
	token string,
	clientDisplayName string,
) (DeviceSession, string, bool, error) {
	if err := validatePairingCompletionDisplayName(clientDisplayName); err != nil {
		return DeviceSession{}, "", false, err
	}
	if token == "" {
		return DeviceSession{}, "", false, nil
	}
	session, deviceToken, err := newDeviceSession(clientDisplayName, store.clock())
	if err != nil {
		return DeviceSession{}, "", false, err
	}
	tokenHash := hashToken(token)
	return store.completePairingInTransaction(ctx, tokenHash[:], session, deviceToken)
}

// ConsumePairingToken burns a valid one-time pairing token without creating a
// device session. Local development credential issuers use this as the
// bootstrap proof before enrolling a user-scoped device identity.
func (store *Store) ConsumePairingToken(ctx context.Context, token string) (bool, error) {
	if token == "" {
		return false, nil
	}
	tokenHash := hashToken(token)
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return false, store.persistenceError("begin pairing token consumption", err)
	}
	defer rollback(tx)
	pairing, storedHash, ok, err := store.queryPairingTokenByHash(ctx, tx, tokenHash[:])
	if err != nil || !ok {
		return false, err
	}
	if subtle.ConstantTimeCompare(tokenHash[:], storedHash) != 1 {
		return false, nil
	}
	available, err := store.pairingTokenAvailable(pairing)
	if err != nil || !available {
		return false, err
	}
	if err := store.markPairingTokenConsumed(ctx, tx, pairing.ID); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, store.persistenceError("commit pairing token consumption", err)
	}
	return true, nil
}

func validatePairingCompletionDisplayName(clientDisplayName string) error {
	if strings.TrimSpace(clientDisplayName) == "" {
		return errors.New("client display name is required")
	}
	return nil
}

func (store *Store) completePairingInTransaction(
	ctx context.Context,
	tokenHash []byte,
	session DeviceSession,
	deviceToken string,
) (DeviceSession, string, bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return DeviceSession{}, "", false, store.persistenceError("begin pairing completion", err)
	}
	defer rollback(tx)
	pairing, storedHash, ok, err := store.queryPairingTokenByHash(ctx, tx, tokenHash[:])
	if err != nil || !ok {
		return DeviceSession{}, "", false, err
	}
	if subtle.ConstantTimeCompare(tokenHash, storedHash) != 1 {
		return DeviceSession{}, "", false, nil
	}
	available, err := store.pairingTokenAvailable(pairing)
	if err != nil {
		return DeviceSession{}, "", false, err
	}
	if !available {
		return DeviceSession{}, "", false, nil
	}
	if err := store.insertDeviceSession(ctx, tx, session, deviceToken); err != nil {
		return DeviceSession{}, "", false, err
	}
	if err := store.markPairingTokenUsed(ctx, tx, pairing.ID, session.ID); err != nil {
		return DeviceSession{}, "", false, err
	}
	if err := tx.Commit(); err != nil {
		return DeviceSession{}, "", false, store.persistenceError("commit pairing completion", err)
	}
	return session, deviceToken, true, nil
}

func (store *Store) ListDeviceSessions(ctx context.Context) ([]DeviceSession, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	rows, err := store.db.QueryContext(ctx, `
SELECT id, scope, display_name, created_at, last_seen_at, revoked_at, is_bootstrap
FROM device_sessions
ORDER BY created_at ASC, id ASC
`)
	if err != nil {
		return nil, store.persistenceError("list device sessions", err)
	}
	defer rows.Close()
	var sessions []DeviceSession
	for rows.Next() {
		session, err := scanDeviceSession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("list device sessions", err)
	}
	return sessions, nil
}

func (store *Store) RevokeDeviceSession(ctx context.Context, deviceID string) (DeviceSession, bool, error) {
	if deviceID == "" {
		return DeviceSession{}, false, errors.New("device id is required")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	session, ok, err := store.queryDeviceSessionByID(ctx, deviceID)
	if err != nil || !ok {
		return DeviceSession{}, ok, err
	}
	if session.RevokedAt != nil {
		return session, true, nil
	}
	revokedAt := timestamp(store.clock())
	_, err = store.db.ExecContext(ctx, `
UPDATE device_sessions
SET revoked_at = ?
WHERE id = ?
`, revokedAt, deviceID)
	if err != nil {
		return DeviceSession{}, false, store.persistenceError("revoke device session", err)
	}
	session.RevokedAt = &revokedAt
	return session, true, nil
}

func (store *Store) IsDeviceSessionRevoked(ctx context.Context, deviceID string) (bool, error) {
	if deviceID == "" {
		return true, errors.New("device id is required")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	var revokedAt sql.NullString
	err := store.db.QueryRowContext(ctx, `
SELECT revoked_at
FROM device_sessions
WHERE id = ?
`, deviceID).Scan(&revokedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return true, nil
	}
	if err != nil {
		return true, store.persistenceError("read device session revocation", err)
	}
	return revokedAt.Valid, nil
}

func newDeviceSession(displayName string, now time.Time) (DeviceSession, string, error) {
	if strings.TrimSpace(displayName) == "" {
		return DeviceSession{}, "", errors.New("device display name is required")
	}
	id, err := randomPrefixedID("device")
	if err != nil {
		return DeviceSession{}, "", err
	}
	token, err := randomToken()
	if err != nil {
		return DeviceSession{}, "", err
	}
	createdAt := timestamp(now)
	return DeviceSession{
		ID:          id,
		Scope:       DeviceScopeFull,
		DisplayName: displayName,
		CreatedAt:   createdAt,
		LastSeenAt:  createdAt,
	}, token, nil
}

func (store *Store) configureDatabase(ctx context.Context) error {
	pragmas := []string{
		"PRAGMA foreign_keys = ON",
		"PRAGMA journal_mode = WAL",
		"PRAGMA busy_timeout = 5000",
	}
	for _, pragma := range pragmas {
		if _, err := store.db.ExecContext(ctx, pragma); err != nil {
			return store.persistenceError("configure runtime auth database", err)
		}
	}
	var userVersion int
	if err := store.db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&userVersion); err != nil {
		return store.persistenceError("read runtime auth database schema version", err)
	}
	switch userVersion {
	case 0:
		hasSchema, err := store.hasUserSchema(ctx)
		if err != nil {
			return err
		}
		if hasSchema {
			return store.corruptError("runtime auth database", errors.New("unversioned database is not empty"))
		}
		if err := store.createSchema(ctx); err != nil {
			return err
		}
	case runtimeAuthStoreVersion:
		if err := store.requireSchemaObjects(ctx, "device_sessions", "device_sessions_revoked_idx", "pairing_tokens", "pairing_tokens_available_idx"); err != nil {
			return err
		}
	default:
		return store.corruptError("runtime auth database", fmt.Errorf("unsupported schema version %d", userVersion))
	}
	return nil
}

func (store *Store) createSchema(ctx context.Context) error {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return store.persistenceError("begin runtime auth database schema initialization", err)
	}
	defer rollback(tx)
	for _, statement := range sqliteSchemaStatements {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return store.persistenceError("initialize runtime auth database schema", err)
		}
	}
	if _, err := tx.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", runtimeAuthStoreVersion)); err != nil {
		return store.persistenceError("write runtime auth database schema version", err)
	}
	if err := tx.Commit(); err != nil {
		return store.persistenceError("commit runtime auth database schema", err)
	}
	return nil
}

func (store *Store) hasUserSchema(ctx context.Context) (bool, error) {
	var count int
	if err := store.db.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM sqlite_schema
WHERE name NOT LIKE 'sqlite_%'
`).Scan(&count); err != nil {
		return false, store.persistenceError("inspect runtime auth database schema", err)
	}
	return count != 0, nil
}

func (store *Store) requireSchemaObjects(ctx context.Context, names ...string) error {
	for _, name := range names {
		var count int
		if err := store.db.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM sqlite_schema
WHERE name = ? AND type IN ('index', 'table')
`, name).Scan(&count); err != nil {
			return store.persistenceError("validate runtime auth database schema", err)
		}
		if count != 1 {
			return store.corruptError("runtime auth database", fmt.Errorf("missing schema object %s", name))
		}
	}
	return nil
}

type sqlExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func (store *Store) insertDeviceSession(
	ctx context.Context,
	exec sqlExecutor,
	session DeviceSession,
	token string,
) error {
	_, err := exec.ExecContext(ctx, `
INSERT INTO device_sessions (id, token_hash, scope, display_name, created_at, last_seen_at, is_bootstrap)
VALUES (?, ?, ?, ?, ?, ?, ?)
`, session.ID, hashTokenBytes(token), session.Scope, session.DisplayName, session.CreatedAt, session.LastSeenAt, sqliteBool(session.IsBootstrap))
	if err != nil {
		return store.persistenceError("create device session", err)
	}
	return nil
}

func (store *Store) queryDeviceSessionByTokenHash(
	ctx context.Context,
	tokenHash []byte,
) (DeviceSession, []byte, bool, error) {
	var session DeviceSession
	var storedHash []byte
	var revokedAt sql.NullString
	var isBootstrap int
	err := store.db.QueryRowContext(ctx, `
SELECT id, token_hash, scope, display_name, created_at, last_seen_at, revoked_at, is_bootstrap
FROM device_sessions
WHERE token_hash = ?
`, tokenHash).Scan(
		&session.ID,
		&storedHash,
		&session.Scope,
		&session.DisplayName,
		&session.CreatedAt,
		&session.LastSeenAt,
		&revokedAt,
		&isBootstrap,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return DeviceSession{}, nil, false, nil
	}
	if err != nil {
		return DeviceSession{}, nil, false, store.persistenceError("resolve device token", err)
	}
	session.RevokedAt = nullableStringPointer(revokedAt)
	session.IsBootstrap = isBootstrap == 1
	return session, storedHash, true, nil
}

type pairingTokenRow struct {
	ID        string
	ExpiresAt string
	UsedAt    *string
}

func (store *Store) queryPairingTokenByHash(
	ctx context.Context,
	tx *sql.Tx,
	tokenHash []byte,
) (pairingTokenRow, []byte, bool, error) {
	var pairing pairingTokenRow
	var storedHash []byte
	var usedAt sql.NullString
	err := tx.QueryRowContext(ctx, `
SELECT id, token_hash, expires_at, used_at
FROM pairing_tokens
WHERE token_hash = ?
`, tokenHash).Scan(&pairing.ID, &storedHash, &pairing.ExpiresAt, &usedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return pairingTokenRow{}, nil, false, nil
	}
	if err != nil {
		return pairingTokenRow{}, nil, false, store.persistenceError("resolve pairing token", err)
	}
	pairing.UsedAt = nullableStringPointer(usedAt)
	return pairing, storedHash, true, nil
}

func (store *Store) pairingTokenAvailable(pairing pairingTokenRow) (bool, error) {
	if pairing.UsedAt != nil {
		return false, nil
	}
	expiresAt, err := time.Parse(time.RFC3339Nano, pairing.ExpiresAt)
	if err != nil {
		return false, store.corruptError("pairing token", fmt.Errorf("expires_at must be RFC3339: %w", err))
	}
	return !store.clock().After(expiresAt), nil
}

func (store *Store) markPairingTokenUsed(
	ctx context.Context,
	tx *sql.Tx,
	pairingID string,
	deviceID string,
) error {
	result, err := tx.ExecContext(ctx, `
UPDATE pairing_tokens
SET used_at = ?, client_device_id = ?
WHERE id = ? AND used_at IS NULL
`, timestamp(store.clock()), deviceID, pairingID)
	if err != nil {
		return store.persistenceError("mark pairing token used", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return store.persistenceError("read pairing token update count", err)
	}
	if rows != 1 {
		return store.corruptError("pairing token", fmt.Errorf("unexpected update count %d", rows))
	}
	return nil
}

func (store *Store) markPairingTokenConsumed(ctx context.Context, tx *sql.Tx, pairingID string) error {
	result, err := tx.ExecContext(ctx, `
UPDATE pairing_tokens
SET used_at = ?
WHERE id = ? AND used_at IS NULL
`, timestamp(store.clock()), pairingID)
	if err != nil {
		return store.persistenceError("mark pairing token consumed", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return store.persistenceError("read pairing token consumption count", err)
	}
	if rows != 1 {
		return store.corruptError("pairing token", fmt.Errorf("unexpected consumption count %d", rows))
	}
	return nil
}

func (store *Store) queryDeviceSessionByID(
	ctx context.Context,
	deviceID string,
) (DeviceSession, bool, error) {
	row := store.db.QueryRowContext(ctx, `
SELECT id, scope, display_name, created_at, last_seen_at, revoked_at, is_bootstrap
FROM device_sessions
WHERE id = ?
`, deviceID)
	session, err := scanDeviceSession(row)
	if errors.Is(err, sql.ErrNoRows) {
		return DeviceSession{}, false, nil
	}
	if err != nil {
		return DeviceSession{}, false, err
	}
	return session, true, nil
}

type deviceSessionScanner interface {
	Scan(...any) error
}

func scanDeviceSession(scanner deviceSessionScanner) (DeviceSession, error) {
	var session DeviceSession
	var revokedAt sql.NullString
	var isBootstrap int
	err := scanner.Scan(
		&session.ID,
		&session.Scope,
		&session.DisplayName,
		&session.CreatedAt,
		&session.LastSeenAt,
		&revokedAt,
		&isBootstrap,
	)
	if err != nil {
		return DeviceSession{}, err
	}
	session.RevokedAt = nullableStringPointer(revokedAt)
	session.IsBootstrap = isBootstrap == 1
	return session, nil
}

func sqliteBool(value bool) int {
	if value {
		return 1
	}
	return 0
}

func rollback(tx *sql.Tx) {
	_ = tx.Rollback()
}

func nullableStringPointer(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func hashTokenBytes(token string) []byte {
	sum := hashToken(token)
	return sum[:]
}

func hashToken(token string) [32]byte {
	return sha256.Sum256([]byte(token))
}

func randomToken() (string, error) {
	var data [32]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", fmt.Errorf("generate auth token: %w", err)
	}
	return hex.EncodeToString(data[:]), nil
}

func randomPrefixedID(prefix string) (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(data[:]), nil
}

func timestamp(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func (store *Store) persistenceError(operation string, err error) error {
	return &PersistenceError{Operation: operation, Path: store.dbPath, Err: err}
}

func (store *Store) corruptError(path string, err error) error {
	return &CorruptStateError{Path: path, Err: err}
}

func splitSQLStatements(sqlText string) []string {
	rawStatements := strings.Split(sqlText, ";")
	statements := make([]string, 0, len(rawStatements))
	for _, raw := range rawStatements {
		statement := strings.TrimSpace(raw)
		if statement == "" {
			continue
		}
		statements = append(statements, statement)
	}
	return statements
}

var sqliteSchemaStatements = splitSQLStatements(`
CREATE TABLE IF NOT EXISTS device_sessions (
  id TEXT PRIMARY KEY,
  token_hash BLOB NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK(scope = 'full'),
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  is_bootstrap INTEGER NOT NULL DEFAULT 0 CHECK(is_bootstrap IN (0, 1))
);

CREATE INDEX IF NOT EXISTS device_sessions_revoked_idx
  ON device_sessions(revoked_at, id);

CREATE TABLE IF NOT EXISTS pairing_tokens (
  id TEXT PRIMARY KEY,
  token_hash BLOB NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  client_device_id TEXT REFERENCES device_sessions(id)
);

CREATE INDEX IF NOT EXISTS pairing_tokens_available_idx
  ON pairing_tokens(used_at, expires_at, id);
`)
