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
			"entitlements",
			"runtimes",
			"runtimes_user_idx",
			"runtime_reporting_credentials",
			"devices",
			"devices_user_idx",
			"runtime_access_grants",
			"gateway_rate_windows",
			"operations",
			"runtime_operations",
			"runtime_operations_due_idx",
			"runtime_deletion_operations",
			"runtime_deletion_operations_due_idx",
			"runtime_deletion_operations_active_idx",
			"runtime_progress",
			"provider_observations",
			"hosted_access_intents",
			"hosted_access_capabilities",
			"hosted_access_progress",
			"user_budget_policies",
			"usage_intervals",
			"usage_intervals_runtime_window_idx",
			"budget_cutoff_operations",
			"budget_cutoff_operations_due_idx",
			"runtime_accounting_ledgers",
			"runtime_accounting_events",
			"runtime_accounting_windows",
			"operational_alert_deduplication",
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

CREATE TABLE IF NOT EXISTS entitlements (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  state TEXT NOT NULL CHECK(state IN ('active', 'grace', 'export_only', 'ended')),
  grace_ends_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK((state = 'grace') = (grace_ends_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS runtimes (
  name TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  lifecycle TEXT NOT NULL CHECK(lifecycle IN ('provisioning', 'ready', 'deleting', 'failed')),
  access_state TEXT NOT NULL CHECK(access_state IN ('enabled', 'suspended', 'export_only', 'delete_scheduled')),
  health_state TEXT NOT NULL DEFAULT 'unknown'
    CHECK(health_state IN ('unknown', 'healthy', 'degraded', 'unreachable')),
  credential_epoch INTEGER NOT NULL CHECK(credential_epoch > 0),
  upstream_authority TEXT NOT NULL,
  credential_secret_ref TEXT NOT NULL,
  desired_release TEXT NOT NULL DEFAULT '',
  observed_release TEXT NOT NULL DEFAULT '',
  cpu_core_millionths INTEGER NOT NULL CHECK(cpu_core_millionths > 0),
  memory_bytes INTEGER NOT NULL CHECK(memory_bytes > 0),
  storage_bytes INTEGER NOT NULL CHECK(storage_bytes > 0),
  wake_requested_at TEXT,
  last_ready_at TEXT,
  deletion_scheduled_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK((access_state = 'delete_scheduled') = (deletion_scheduled_at IS NOT NULL)),
  UNIQUE(name, user_id)
);

CREATE INDEX IF NOT EXISTS runtimes_user_idx ON runtimes(user_id, name);

CREATE TABLE IF NOT EXISTS runtime_reporting_credentials (
  runtime_name TEXT PRIMARY KEY REFERENCES runtimes(name) ON DELETE CASCADE,
  token_hash BLOB NOT NULL UNIQUE,
  epoch INTEGER NOT NULL CHECK(epoch > 0),
  updated_at TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS runtime_deletion_operations (
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

CREATE INDEX IF NOT EXISTS runtime_deletion_operations_due_idx
  ON runtime_deletion_operations(status, next_attempt_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS runtime_deletion_operations_active_idx
  ON runtime_deletion_operations(runtime_name)
  WHERE status IN ('pending', 'running', 'retry_wait');

CREATE TABLE IF NOT EXISTS runtime_progress (
  operation_id TEXT NOT NULL,
  cursor INTEGER NOT NULL CHECK(cursor > 0),
  kind TEXT NOT NULL CHECK(kind IN ('ensure_runtime', 'wake_runtime', 'delete_runtime')),
  state TEXT NOT NULL CHECK(state IN (
    'queued', 'reconciling', 'retrying', 'provisioned', 'wake_requested',
    'healthy', 'deletion_scheduled', 'deleted', 'failed', 'canceled'
  )),
  error_code TEXT NOT NULL,
  retryable INTEGER NOT NULL CHECK(retryable IN (0, 1)),
  occurred_at TEXT NOT NULL,
  CHECK(
    (kind = 'ensure_runtime' AND state IN (
      'queued', 'reconciling', 'retrying', 'provisioned', 'failed', 'canceled'
    )) OR
    (kind = 'wake_runtime' AND state IN ('wake_requested', 'healthy', 'failed')) OR
    (kind = 'delete_runtime' AND state IN (
      'deletion_scheduled', 'reconciling', 'retrying', 'deleted', 'failed', 'canceled'
    ))
  ),
  PRIMARY KEY(operation_id, cursor)
);

CREATE TABLE IF NOT EXISTS provider_observations (
  runtime_name TEXT PRIMARY KEY REFERENCES runtimes(name),
  provider_resource_id TEXT NOT NULL,
  activity TEXT NOT NULL,
  url_access TEXT NOT NULL,
  placement TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hosted_access_intents (
  intent_id TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT NOT NULL,
  workstream_id TEXT NOT NULL,
  client_device_id TEXT NOT NULL,
  client_kind TEXT NOT NULL CHECK(client_kind IN ('desktop', 'phone')),
  runtime_name TEXT REFERENCES runtimes(name),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hosted_access_capabilities (
  intent_id TEXT NOT NULL REFERENCES hosted_access_intents(intent_id),
  capability TEXT NOT NULL CHECK(capability IN ('observe', 'steer', 'approve', 'artifacts')),
  PRIMARY KEY(intent_id, capability)
);

CREATE TABLE IF NOT EXISTS hosted_access_progress (
  intent_id TEXT NOT NULL REFERENCES hosted_access_intents(intent_id),
  cursor INTEGER NOT NULL CHECK(cursor > 0),
  state TEXT NOT NULL CHECK(state IN (
    'preparing_access', 'syncing_project', 'ready_on_phone', 'needs_attention', 'suspended'
  )),
  reason_code TEXT NOT NULL,
  retryable INTEGER NOT NULL CHECK(retryable IN (0, 1)),
  occurred_at TEXT NOT NULL,
  PRIMARY KEY(intent_id, cursor)
);

CREATE TABLE IF NOT EXISTS user_budget_policies (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  covered_limit_usd_micros INTEGER NOT NULL CHECK(covered_limit_usd_micros > 0),
  safety_reserve_usd_micros INTEGER NOT NULL CHECK(safety_reserve_usd_micros >= 0),
  cutoff_exposure_usd_micros INTEGER NOT NULL CHECK(cutoff_exposure_usd_micros >= 0),
  maximum_cutoff_lag_ns INTEGER NOT NULL CHECK(maximum_cutoff_lag_ns > 0),
  accrued_usd_micros INTEGER NOT NULL DEFAULT 0 CHECK(accrued_usd_micros >= 0),
  cutoff_required_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK(period_end > period_start),
  CHECK(safety_reserve_usd_micros + cutoff_exposure_usd_micros < covered_limit_usd_micros)
);

CREATE TABLE IF NOT EXISTS usage_intervals (
  idempotency_key TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  runtime_name TEXT NOT NULL REFERENCES runtimes(name),
  budget_period_start TEXT NOT NULL,
  interval_start TEXT NOT NULL,
  interval_end TEXT NOT NULL,
  measurement_source TEXT NOT NULL CHECK(measurement_source = 'setta_conservative'),
  covered_cost_usd_micros INTEGER NOT NULL CHECK(covered_cost_usd_micros >= 0),
  cumulative_cost_usd_micros INTEGER NOT NULL CHECK(cumulative_cost_usd_micros >= 0),
  enforced_budget_usd_micros INTEGER NOT NULL CHECK(enforced_budget_usd_micros > 0),
  cutoff_required INTEGER NOT NULL CHECK(cutoff_required IN (0, 1)),
  recorded_at TEXT NOT NULL,
  CHECK(interval_end > interval_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_intervals_runtime_window_idx
  ON usage_intervals(runtime_name, interval_start, interval_end);

CREATE TABLE IF NOT EXISTS budget_cutoff_operations (
  idempotency_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  runtime_name TEXT NOT NULL REFERENCES runtimes(name),
  period_start TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'retry_wait', 'succeeded', 'failed')),
  attempt_count INTEGER NOT NULL CHECK(attempt_count >= 0),
  fence_token INTEGER NOT NULL CHECK(fence_token >= 0),
  lease_owner TEXT,
  lease_expires_at TEXT,
  next_attempt_at TEXT NOT NULL,
  last_error_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  CHECK((status = 'running') = (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)),
  UNIQUE(user_id, period_start)
);

CREATE INDEX IF NOT EXISTS budget_cutoff_operations_due_idx
  ON budget_cutoff_operations(status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS runtime_accounting_ledgers (
  runtime_name TEXT PRIMARY KEY REFERENCES runtimes(name),
  state_json BLOB NOT NULL,
  boundary_state_json BLOB NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_accounting_events (
  runtime_name TEXT NOT NULL REFERENCES runtimes(name),
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  event_id TEXT NOT NULL,
  event_json BLOB NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(runtime_name, sequence),
  UNIQUE(runtime_name, event_id)
);

CREATE TABLE IF NOT EXISTS runtime_accounting_windows (
  idempotency_key TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  runtime_name TEXT NOT NULL REFERENCES runtimes(name),
  user_id TEXT NOT NULL REFERENCES users(id),
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  start_sequence INTEGER NOT NULL CHECK(start_sequence >= 0),
  end_sequence INTEGER NOT NULL CHECK(end_sequence >= start_sequence),
  evidence_json BLOB NOT NULL,
  finalized_at TEXT NOT NULL,
  CHECK(window_end > window_start),
  UNIQUE(runtime_name, window_start),
  UNIQUE(runtime_name, window_end)
);

CREATE TABLE IF NOT EXISTS operational_alert_deduplication (
  signal TEXT NOT NULL,
  subject_kind TEXT NOT NULL CHECK(subject_kind IN (
    'runtime_operation', 'runtime_deletion_operation', 'budget_cutoff_operation',
    'workload_lease', 'gateway_attachment'
  )),
  subject_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY(signal, subject_kind, subject_id)
);

`
