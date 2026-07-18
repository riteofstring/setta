package notify

import (
	"context"
	"database/sql"
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
	notifyDatabaseName         = "web-push.sqlite"
	notifyStoreVersion         = 1
	notifySQLiteDriverName     = "sqlite"
	defaultSubscriptionPageCap = 10000
)

type Store struct {
	db     *sql.DB
	dbPath string
	clock  func() time.Time

	mu     sync.Mutex
	closed bool
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
	return fmt.Sprintf("malformed web push state %s: %v", err.Path, err.Err)
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
	if strings.TrimSpace(appDataDir) == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	runtimeDir := filepath.Join(filepath.Clean(appDataDir), "runtime")
	if err := os.MkdirAll(runtimeDir, 0o755); err != nil {
		return nil, &PersistenceError{Operation: "create web push database directory", Path: runtimeDir, Err: err}
	}
	dbPath := filepath.Join(runtimeDir, notifyDatabaseName)
	db, err := sql.Open(notifySQLiteDriverName, dbPath)
	if err != nil {
		return nil, &PersistenceError{Operation: "open web push database", Path: dbPath, Err: err}
	}
	db.SetMaxOpenConns(1)
	store := &Store{
		db:     db,
		dbPath: dbPath,
		clock:  time.Now,
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
		return store.persistenceError("close web push database", err)
	}
	store.closed = true
	return nil
}

func (store *Store) SaveSubscription(ctx context.Context, deviceID string, subscription WebPushSubscription) (Subscription, error) {
	if strings.TrimSpace(deviceID) == "" {
		return Subscription{}, errors.New("device id is required")
	}
	if err := validateWebPushSubscription(subscription); err != nil {
		return Subscription{}, err
	}
	record := Subscription{
		Auth:      subscription.Keys.Auth,
		CreatedAt: timestamp(store.clock()),
		DeviceID:  deviceID,
		Endpoint:  subscription.Endpoint,
		P256DH:    subscription.Keys.P256DH,
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	_, err := store.db.ExecContext(ctx, `
INSERT INTO push_subscriptions (device_id, endpoint, p256dh, auth, created_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(device_id, endpoint)
DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
`, record.DeviceID, record.Endpoint, record.P256DH, record.Auth, record.CreatedAt)
	if err != nil {
		return Subscription{}, store.persistenceError("save web push subscription", err)
	}
	return record, nil
}

func (store *Store) DeleteSubscription(ctx context.Context, deviceID string, endpoint string) (bool, error) {
	if strings.TrimSpace(deviceID) == "" {
		return false, errors.New("device id is required")
	}
	if strings.TrimSpace(endpoint) == "" {
		return false, errors.New("subscription endpoint is required")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	result, err := store.db.ExecContext(ctx, `
DELETE FROM push_subscriptions
WHERE device_id = ? AND endpoint = ?
`, deviceID, endpoint)
	if err != nil {
		return false, store.persistenceError("delete web push subscription", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return false, store.persistenceError("read deleted web push subscription count", err)
	}
	return rows > 0, nil
}

func (store *Store) DeleteDeviceSubscriptions(ctx context.Context, deviceID string) (int, error) {
	if strings.TrimSpace(deviceID) == "" {
		return 0, errors.New("device id is required")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	result, err := store.db.ExecContext(ctx, `
DELETE FROM push_subscriptions
WHERE device_id = ?
`, deviceID)
	if err != nil {
		return 0, store.persistenceError("delete device web push subscriptions", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return 0, store.persistenceError("read deleted device web push subscription count", err)
	}
	return int(rows), nil
}

func (store *Store) DeleteEndpoint(ctx context.Context, endpoint string) (int, error) {
	if strings.TrimSpace(endpoint) == "" {
		return 0, errors.New("subscription endpoint is required")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	result, err := store.db.ExecContext(ctx, `
DELETE FROM push_subscriptions
WHERE endpoint = ?
`, endpoint)
	if err != nil {
		return 0, store.persistenceError("delete web push endpoint", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return 0, store.persistenceError("read deleted web push endpoint count", err)
	}
	return int(rows), nil
}

func (store *Store) ListSubscriptions(ctx context.Context) ([]Subscription, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	rows, err := store.db.QueryContext(ctx, `
SELECT device_id, endpoint, p256dh, auth, created_at
FROM push_subscriptions
ORDER BY created_at ASC, device_id ASC, endpoint ASC
LIMIT ?
`, defaultSubscriptionPageCap)
	if err != nil {
		return nil, store.persistenceError("list web push subscriptions", err)
	}
	defer rows.Close()
	return scanSubscriptions(rows)
}

func (store *Store) ListDeviceSubscriptions(ctx context.Context, deviceID string) ([]Subscription, error) {
	if strings.TrimSpace(deviceID) == "" {
		return nil, errors.New("device id is required")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	rows, err := store.db.QueryContext(ctx, `
SELECT device_id, endpoint, p256dh, auth, created_at
FROM push_subscriptions
WHERE device_id = ?
ORDER BY created_at ASC, endpoint ASC
`, deviceID)
	if err != nil {
		return nil, store.persistenceError("list device web push subscriptions", err)
	}
	defer rows.Close()
	return scanSubscriptions(rows)
}

func (store *Store) configureDatabase(ctx context.Context) error {
	pragmas := []string{
		"PRAGMA journal_mode = WAL",
		"PRAGMA busy_timeout = 5000",
	}
	for _, pragma := range pragmas {
		if _, err := store.db.ExecContext(ctx, pragma); err != nil {
			return store.persistenceError("configure web push database", err)
		}
	}
	if _, err := store.db.ExecContext(ctx, `
CREATE TABLE IF NOT EXISTS push_subscriptions (
  device_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (device_id, endpoint)
)
`); err != nil {
		return store.persistenceError("initialize web push database schema", err)
	}
	var userVersion int
	if err := store.db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&userVersion); err != nil {
		return store.persistenceError("read web push database schema version", err)
	}
	if userVersion != 0 && userVersion != notifyStoreVersion {
		return store.corruptError("web push database", fmt.Errorf("unsupported schema version %d", userVersion))
	}
	if userVersion == 0 {
		if _, err := store.db.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", notifyStoreVersion)); err != nil {
			return store.persistenceError("write web push database schema version", err)
		}
	}
	return nil
}

func scanSubscriptions(rows *sql.Rows) ([]Subscription, error) {
	var subscriptions []Subscription
	for rows.Next() {
		var subscription Subscription
		if err := rows.Scan(
			&subscription.DeviceID,
			&subscription.Endpoint,
			&subscription.P256DH,
			&subscription.Auth,
			&subscription.CreatedAt,
		); err != nil {
			return nil, err
		}
		subscriptions = append(subscriptions, subscription)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return subscriptions, nil
}

func validateWebPushSubscription(subscription WebPushSubscription) error {
	if strings.TrimSpace(subscription.Endpoint) == "" {
		return errors.New("subscription endpoint is required")
	}
	if strings.TrimSpace(subscription.Keys.P256DH) == "" {
		return errors.New("subscription p256dh key is required")
	}
	if strings.TrimSpace(subscription.Keys.Auth) == "" {
		return errors.New("subscription auth key is required")
	}
	return nil
}

func (store *Store) persistenceError(operation string, err error) error {
	return &PersistenceError{Operation: operation, Path: store.dbPath, Err: err}
}

func (store *Store) corruptError(path string, err error) error {
	return &CorruptStateError{Path: filepath.Join(filepath.Dir(store.dbPath), path), Err: err}
}

func timestamp(t time.Time) string {
	return t.UTC().Format(time.RFC3339Nano)
}
