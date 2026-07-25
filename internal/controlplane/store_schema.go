package controlplane

import (
	"context"
	"fmt"
	"strings"
)

func (store *Store) configureDatabase(ctx context.Context) error {
	for _, pragma := range []string{
		"PRAGMA foreign_keys = ON",
		"PRAGMA journal_mode = WAL",
		"PRAGMA busy_timeout = 5000",
	} {
		if _, err := store.db.ExecContext(ctx, pragma); err != nil {
			return fmt.Errorf("configure control-plane database: %w", err)
		}
	}
	var version int
	if err := store.db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		return fmt.Errorf("read control-plane database version: %w", err)
	}
	switch version {
	case 0:
		hasSchema, err := controlPlaneHasUserSchema(ctx, store)
		if err != nil {
			return err
		}
		if hasSchema {
			return fmt.Errorf("unversioned control-plane database is not empty")
		}
		if err := createControlPlaneSchema(ctx, store); err != nil {
			return err
		}
	case controlPlaneStoreVersion:
		if err := requireControlPlaneSchemaObjects(ctx, store,
			"users",
			"runtimes",
			"runtimes_user_idx",
			"devices",
			"devices_user_idx",
			"runtime_access_grants",
			"gateway_rate_windows",
			"operations",
			"runtime_operations",
			"runtime_operations_due_idx",
			"provider_observations",
		); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unsupported control-plane database version %d", version)
	}
	return nil
}

func createControlPlaneSchema(ctx context.Context, store *Store) error {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin control-plane database initialization: %w", err)
	}
	defer rollback(tx)
	for _, statement := range splitSQLStatements(controlPlaneSchema) {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("initialize control-plane database: %w", err)
		}
	}
	if _, err := tx.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", controlPlaneStoreVersion)); err != nil {
		return fmt.Errorf("write control-plane database version: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit control-plane database initialization: %w", err)
	}
	return nil
}

func controlPlaneHasUserSchema(ctx context.Context, store *Store) (bool, error) {
	var count int
	if err := store.db.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM sqlite_schema
WHERE name NOT LIKE 'sqlite_%'
`).Scan(&count); err != nil {
		return false, fmt.Errorf("inspect control-plane database schema: %w", err)
	}
	return count != 0, nil
}

func requireControlPlaneSchemaObjects(ctx context.Context, store *Store, names ...string) error {
	for _, name := range names {
		var count int
		if err := store.db.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM sqlite_schema
WHERE name = ? AND type IN ('index', 'table')
`, name).Scan(&count); err != nil {
			return fmt.Errorf("validate control-plane database schema: %w", err)
		}
		if count != 1 {
			return fmt.Errorf("control-plane database is missing schema object %s", name)
		}
	}
	return nil
}

func splitSQLStatements(text string) []string {
	raw := strings.Split(text, ";")
	statements := make([]string, 0, len(raw))
	for _, value := range raw {
		value = strings.TrimSpace(value)
		if value != "" {
			statements = append(statements, value)
		}
	}
	return statements
}

const controlPlaneSchema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('active', 'suspended')),
  active_runtime_name TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(active_runtime_name, id) REFERENCES runtimes(name, user_id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS runtimes (
  name TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('provisioning', 'ready', 'deleting', 'failed')),
  access_state TEXT NOT NULL CHECK(access_state IN ('enabled', 'suspended')),
  credential_epoch INTEGER NOT NULL CHECK(credential_epoch > 0),
  upstream_authority TEXT NOT NULL,
  credential_secret_ref TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(name, user_id)
);

CREATE INDEX IF NOT EXISTS runtimes_user_idx ON runtimes(user_id, name);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash BLOB NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS devices_user_idx ON devices(user_id, revoked_at, id);

CREATE TABLE IF NOT EXISTS runtime_access_grants (
  device_id TEXT NOT NULL REFERENCES devices(id),
  runtime_name TEXT NOT NULL REFERENCES runtimes(name),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY(device_id, runtime_name)
);

CREATE TABLE IF NOT EXISTS gateway_rate_windows (
  device_id TEXT PRIMARY KEY REFERENCES devices(id),
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL CHECK(request_count >= 0)
);

CREATE TABLE IF NOT EXISTS operations (
  idempotency_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  runtime_name TEXT NOT NULL REFERENCES runtimes(name),
  request_fingerprint TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_operations (
  idempotency_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  runtime_name TEXT NOT NULL REFERENCES runtimes(name),
  request_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'retry_wait', 'succeeded', 'failed', 'canceled')),
  attempt_count INTEGER NOT NULL CHECK(attempt_count >= 0),
  fence_token INTEGER NOT NULL CHECK(fence_token >= 0),
  lease_owner TEXT,
  lease_expires_at TEXT,
  next_attempt_at TEXT NOT NULL,
  last_error_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  CHECK((status = 'running') = (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS runtime_operations_due_idx
  ON runtime_operations(status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS provider_observations (
  runtime_name TEXT PRIMARY KEY REFERENCES runtimes(name),
  provider_resource_id TEXT NOT NULL,
  activity TEXT NOT NULL,
  url_access TEXT NOT NULL,
  placement TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

`
