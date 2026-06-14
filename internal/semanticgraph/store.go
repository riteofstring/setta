package semanticgraph

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	_ "modernc.org/sqlite"
)

const (
	semanticDatabaseName = "semantic-graph.sqlite"
	semanticStoreVersion = 13
	sqliteDriverName     = "sqlite"
)

type Store struct {
	appDataDir string
	dbPath     string
	db         *sql.DB
	mu         sync.Mutex
	closed     bool
}

type PersistenceError struct {
	Operation string
	Path      string
	Err       error
}

type CorruptStateError struct {
	Path string
	Err  error
}

func (err *PersistenceError) Error() string {
	return fmt.Sprintf("%s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *PersistenceError) Unwrap() error {
	return err.Err
}

func (err *CorruptStateError) Error() string {
	return fmt.Sprintf("malformed semantic graph state %s: %v", err.Path, err.Err)
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

func NewStore(appDataDir string) (*Store, error) {
	if appDataDir == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	appDataDir = filepath.Clean(appDataDir)
	if err := os.MkdirAll(appDataDir, 0o755); err != nil {
		return nil, &PersistenceError{Operation: "create semantic graph database directory", Path: appDataDir, Err: err}
	}
	dbPath := filepath.Join(appDataDir, semanticDatabaseName)
	db, err := sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		return nil, &PersistenceError{Operation: "open semantic graph database", Path: dbPath, Err: err}
	}
	db.SetMaxOpenConns(1)
	store := &Store{
		appDataDir: appDataDir,
		dbPath:     dbPath,
		db:         db,
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
		return store.persistenceError("close semantic graph database", err)
	}
	store.closed = true
	return nil
}

func (store *Store) configureDatabase(ctx context.Context) error {
	pragmas := []string{
		"PRAGMA foreign_keys = ON",
		"PRAGMA journal_mode = WAL",
		"PRAGMA busy_timeout = 5000",
	}
	for _, pragma := range pragmas {
		if _, err := store.db.ExecContext(ctx, pragma); err != nil {
			return store.persistenceError("configure semantic graph database", err)
		}
	}
	var userVersion int
	if err := store.db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&userVersion); err != nil {
		return store.persistenceError("read semantic graph database schema version", err)
	}
	if userVersion != 0 && userVersion != semanticStoreVersion {
		return store.corruptError("semantic graph database", unsupportedSemanticStoreVersionError(userVersion))
	}
	if err := store.createSchema(ctx); err != nil {
		return err
	}
	if userVersion == 0 {
		if err := store.createDefaultSemanticCartographerSettings(ctx); err != nil {
			return err
		}
		if _, err := store.db.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", semanticStoreVersion)); err != nil {
			return store.persistenceError("write semantic graph database schema version", err)
		}
	} else if err := store.validateSemanticCartographerSettingsRow(ctx); err != nil {
		return err
	}
	return nil
}

func unsupportedSemanticStoreVersionError(version int) error {
	return fmt.Errorf(
		"unsupported schema version %d; reset the semantic graph store by deleting semantic-graph.sqlite and its WAL/SHM sidecar files",
		version,
	)
}

func (store *Store) createSchema(ctx context.Context) error {
	for _, statement := range sqliteSchemaStatements {
		if _, err := store.db.ExecContext(ctx, statement); err != nil {
			return store.persistenceError("initialize semantic graph database schema", err)
		}
	}
	return nil
}

var sqliteSchemaStatements = splitSQLStatements(`
CREATE TABLE IF NOT EXISTS semantic_events (
  stream_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',
  run_id TEXT NOT NULL DEFAULT '',
  workflow_execution_id TEXT NOT NULL DEFAULT '',
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL DEFAULT '',
  causation_id TEXT NOT NULL DEFAULT '',
  correlation_id TEXT NOT NULL DEFAULT '',
  trace_id TEXT NOT NULL DEFAULT '',
  span_id TEXT NOT NULL DEFAULT '',
  logical_clock INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  model_info_json TEXT NOT NULL DEFAULT '{}',
  confidence INTEGER,
  supersedes_event_id TEXT NOT NULL DEFAULT '',
  retracted_by_event_id TEXT NOT NULL DEFAULT '',
  UNIQUE(workspace_id, logical_clock)
);

CREATE INDEX IF NOT EXISTS semantic_events_workspace_clock_idx
  ON semantic_events(workspace_id, logical_clock DESC, event_id);

CREATE INDEX IF NOT EXISTS semantic_events_workspace_target_clock_idx
  ON semantic_events(workspace_id, target_entity_id, logical_clock DESC, event_id);

CREATE TABLE IF NOT EXISTS semantic_nodes_current (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  dismissed INTEGER NOT NULL DEFAULT 0,
  promoted INTEGER NOT NULL DEFAULT 0,
  split_from_node_id TEXT NOT NULL DEFAULT '',
  split_into_node_ids_json TEXT NOT NULL DEFAULT '[]',
  merged_into_node_id TEXT NOT NULL DEFAULT '',
  created_by_event_id TEXT NOT NULL,
  updated_by_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS semantic_nodes_workspace_kind_idx
  ON semantic_nodes_current(workspace_id, kind, id);

CREATE TABLE IF NOT EXISTS semantic_edges_current (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  created_by_event_id TEXT NOT NULL,
  updated_by_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS semantic_edges_workspace_nodes_idx
  ON semantic_edges_current(workspace_id, from_node_id, to_node_id, id);

CREATE TABLE IF NOT EXISTS semantic_evidence_anchors (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT '',
  uri TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  range_start INTEGER NOT NULL DEFAULT 0,
  range_end INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  workflow_definition_id TEXT NOT NULL DEFAULT '',
  workflow_execution_id TEXT NOT NULL DEFAULT '',
  workflow_node_id TEXT NOT NULL DEFAULT '',
  workflow_node_execution_id TEXT NOT NULL DEFAULT '',
  chat_conversation_id TEXT NOT NULL DEFAULT '',
  chat_run_id TEXT NOT NULL DEFAULT '',
  chat_message_id TEXT NOT NULL DEFAULT '',
  run_item_id TEXT NOT NULL DEFAULT '',
  reassigned_from_anchor_id TEXT NOT NULL DEFAULT '',
  created_by_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS semantic_evidence_workspace_target_idx
  ON semantic_evidence_anchors(workspace_id, target_entity_id, created_at, id);

CREATE TABLE IF NOT EXISTS semantic_activity_intervals (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL DEFAULT '',
  source_id TEXT NOT NULL DEFAULT '',
  evidence_anchor_id TEXT NOT NULL DEFAULT '',
  workflow_definition_id TEXT NOT NULL DEFAULT '',
  workflow_execution_id TEXT NOT NULL DEFAULT '',
  workflow_node_id TEXT NOT NULL DEFAULT '',
  workflow_node_execution_id TEXT NOT NULL DEFAULT '',
  chat_conversation_id TEXT NOT NULL DEFAULT '',
  chat_run_id TEXT NOT NULL DEFAULT '',
  chat_message_id TEXT NOT NULL DEFAULT '',
  run_item_id TEXT NOT NULL DEFAULT '',
  reassigned_from_interval_id TEXT NOT NULL DEFAULT '',
  actor_kind TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL DEFAULT '',
  started_by_event_id TEXT NOT NULL,
  ended_by_event_id TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS semantic_activity_workspace_target_idx
  ON semantic_activity_intervals(workspace_id, target_entity_id, started_at DESC, id);

CREATE INDEX IF NOT EXISTS semantic_activity_workspace_source_idx
  ON semantic_activity_intervals(workspace_id, source_kind, source_id, started_at DESC, id);

CREATE INDEX IF NOT EXISTS semantic_activity_workspace_run_idx
  ON semantic_activity_intervals(workspace_id, workflow_execution_id, chat_run_id, started_at DESC, id);

CREATE INDEX IF NOT EXISTS semantic_activity_workspace_active_idx
  ON semantic_activity_intervals(workspace_id, ended_at, started_at DESC, id);

CREATE TABLE IF NOT EXISTS semantic_steering_directives (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL,
  scope TEXT NOT NULL,
  workflow_definition_id TEXT NOT NULL DEFAULT '',
  workflow_execution_id TEXT NOT NULL DEFAULT '',
  workflow_node_id TEXT NOT NULL DEFAULT '',
  workflow_node_execution_id TEXT NOT NULL DEFAULT '',
  chat_conversation_id TEXT NOT NULL DEFAULT '',
  chat_run_id TEXT NOT NULL DEFAULT '',
  chat_message_id TEXT NOT NULL DEFAULT '',
  run_item_id TEXT NOT NULL DEFAULT '',
  supersedes_directive_id TEXT NOT NULL DEFAULT '',
  reassigned_from_directive_id TEXT NOT NULL DEFAULT '',
  created_by_event_id TEXT NOT NULL,
  updated_by_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS semantic_steering_workspace_target_idx
  ON semantic_steering_directives(workspace_id, target_entity_id, status ASC, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS semantic_context_pack_history (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  trigger_kind TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  workflow_definition_id TEXT NOT NULL DEFAULT '',
  workflow_execution_id TEXT NOT NULL DEFAULT '',
  workflow_node_id TEXT NOT NULL DEFAULT '',
  workflow_node_execution_id TEXT NOT NULL DEFAULT '',
  chat_conversation_id TEXT NOT NULL DEFAULT '',
  chat_run_id TEXT NOT NULL DEFAULT '',
  chat_message_id TEXT NOT NULL DEFAULT '',
  run_item_id TEXT NOT NULL DEFAULT '',
  authored_prompt_hash TEXT NOT NULL DEFAULT '',
  delivered_context_hash TEXT NOT NULL DEFAULT '',
  token_budget INTEGER NOT NULL DEFAULT 0,
  estimated_tokens INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,
  items_json TEXT NOT NULL DEFAULT '[]',
  delivered_context TEXT NOT NULL DEFAULT '',
  created_by_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS semantic_context_pack_workspace_target_idx
  ON semantic_context_pack_history(workspace_id, target_entity_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS semantic_context_pack_workspace_workflow_idx
  ON semantic_context_pack_history(workspace_id, workflow_execution_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS semantic_context_pack_workspace_chat_run_idx
  ON semantic_context_pack_history(workspace_id, chat_run_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS semantic_layout_positions (
  workspace_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, entity_id)
);

CREATE TABLE IF NOT EXISTS semantic_cartographer_settings (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  schema_version INTEGER NOT NULL,
  settings_json TEXT NOT NULL,
  settings_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS semantic_cartographer_runs (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  status TEXT NOT NULL,
  trigger_kind TEXT NOT NULL,
  target_entity_id TEXT NOT NULL DEFAULT '',
  workflow_definition_id TEXT NOT NULL DEFAULT '',
  workflow_execution_id TEXT NOT NULL DEFAULT '',
  workflow_node_id TEXT NOT NULL DEFAULT '',
  workflow_node_execution_id TEXT NOT NULL DEFAULT '',
  chat_conversation_id TEXT NOT NULL DEFAULT '',
  chat_run_id TEXT NOT NULL DEFAULT '',
  chat_message_id TEXT NOT NULL DEFAULT '',
  run_item_id TEXT NOT NULL DEFAULT '',
  input_bundle_json TEXT NOT NULL DEFAULT '{}',
  output_schema_json TEXT NOT NULL DEFAULT '{}',
  harness_kind TEXT NOT NULL DEFAULT '',
  settings_hash TEXT NOT NULL DEFAULT '',
  task_profile TEXT NOT NULL DEFAULT '',
  requested_model_selection TEXT NOT NULL DEFAULT '',
  requested_model TEXT NOT NULL DEFAULT '',
  effective_model TEXT NOT NULL DEFAULT '',
  reported_model TEXT NOT NULL DEFAULT '',
  requested_reasoning_effort TEXT NOT NULL DEFAULT '',
  requested_input_budget INTEGER NOT NULL DEFAULT 0,
  effective_reasoning_effort TEXT NOT NULL DEFAULT '',
  reported_reasoning_effort TEXT NOT NULL DEFAULT '',
  reasoning_effort_reported INTEGER NOT NULL DEFAULT 0,
  request_id TEXT NOT NULL DEFAULT '',
  response_id TEXT NOT NULL DEFAULT '',
  window_id TEXT NOT NULL DEFAULT '',
  source_epoch_id TEXT NOT NULL DEFAULT '',
  source_key TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT NOT NULL DEFAULT '',
  lease_deadline TEXT NOT NULL DEFAULT '',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  input_bundle_hash TEXT NOT NULL DEFAULT '',
  input_bundle_bytes INTEGER NOT NULL DEFAULT 0,
  input_bundle_character_count INTEGER NOT NULL DEFAULT 0,
  input_item_counts_json TEXT NOT NULL DEFAULT '{}',
  output_schema_bytes INTEGER NOT NULL DEFAULT 0,
  raw_harness_response_hash TEXT NOT NULL DEFAULT '',
  raw_harness_response_bytes INTEGER NOT NULL DEFAULT 0,
  close_reason TEXT NOT NULL DEFAULT '',
  queue_wait_ms INTEGER NOT NULL DEFAULT 0,
  harness_duration_ms INTEGER NOT NULL DEFAULT 0,
  validation_duration_ms INTEGER NOT NULL DEFAULT 0,
  application_duration_ms INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  trajectory_summary TEXT NOT NULL DEFAULT '',
  created_semantic_event_ids_json TEXT NOT NULL DEFAULT '[]',
  diagnostics_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  error TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS semantic_cartographer_runs_workspace_source_idx
  ON semantic_cartographer_runs(workspace_id, workflow_execution_id, chat_run_id, target_entity_id, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS semantic_cartographer_runs_queue_idx
  ON semantic_cartographer_runs(status, priority DESC, created_at ASC, id);

CREATE INDEX IF NOT EXISTS semantic_cartographer_runs_source_key_idx
  ON semantic_cartographer_runs(workspace_id, source_key, status, priority DESC, created_at DESC, id);

CREATE TABLE IF NOT EXISTS semantic_cartographer_windows (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  cursor_id TEXT NOT NULL DEFAULT '',
  summary_id TEXT NOT NULL DEFAULT '',
  input_bundle_json TEXT NOT NULL DEFAULT '{}',
  opened_at TEXT NOT NULL DEFAULT '',
  closed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS semantic_cartographer_windows_workspace_run_idx
  ON semantic_cartographer_windows(workspace_id, run_id, sequence ASC, id);

CREATE INDEX IF NOT EXISTS semantic_cartographer_windows_workspace_source_idx
  ON semantic_cartographer_windows(workspace_id, source_kind, source_id, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS semantic_cartographer_cursors (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  workflow_execution_id TEXT NOT NULL DEFAULT '',
  workflow_node_execution_id TEXT NOT NULL DEFAULT '',
  chat_conversation_id TEXT NOT NULL DEFAULT '',
  chat_run_id TEXT NOT NULL DEFAULT '',
  last_chat_event_stream_id TEXT NOT NULL DEFAULT '',
  last_chat_event_sequence INTEGER NOT NULL DEFAULT 0,
  last_workflow_event_cursor TEXT NOT NULL DEFAULT '',
  last_output_ordinal_by_run_item_json TEXT NOT NULL DEFAULT '{}',
  last_window_id TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, id),
  UNIQUE(workspace_id, workflow_execution_id, workflow_node_execution_id, chat_conversation_id, chat_run_id)
);

CREATE TABLE IF NOT EXISTS semantic_cartographer_trajectory_summaries (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  window_id TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  workflow_definition_id TEXT NOT NULL DEFAULT '',
  workflow_execution_id TEXT NOT NULL DEFAULT '',
  workflow_node_id TEXT NOT NULL DEFAULT '',
  workflow_node_execution_id TEXT NOT NULL DEFAULT '',
  chat_conversation_id TEXT NOT NULL DEFAULT '',
  chat_run_id TEXT NOT NULL DEFAULT '',
  chat_message_id TEXT NOT NULL DEFAULT '',
  run_item_id TEXT NOT NULL DEFAULT '',
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS semantic_cartographer_summaries_workspace_run_idx
  ON semantic_cartographer_trajectory_summaries(workspace_id, run_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS semantic_cartographer_summaries_workspace_source_idx
  ON semantic_cartographer_trajectory_summaries(workspace_id, source_kind, source_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS semantic_cartographer_patches (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  window_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  patch_json TEXT NOT NULL DEFAULT '{}',
  validation_result_json TEXT NOT NULL DEFAULT '{}',
  application_result_json TEXT NOT NULL DEFAULT '{}',
  created_semantic_event_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  validated_at TEXT NOT NULL DEFAULT '',
  applied_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS semantic_cartographer_patches_workspace_run_idx
  ON semantic_cartographer_patches(workspace_id, run_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS semantic_cartographer_validation_diagnostics (
  workspace_id TEXT NOT NULL,
  id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  patch_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS semantic_cartographer_diagnostics_workspace_patch_idx
  ON semantic_cartographer_validation_diagnostics(workspace_id, patch_id, created_at ASC, id);

CREATE VIRTUAL TABLE IF NOT EXISTS semantic_search_fts USING fts5(
  workspace_id UNINDEXED,
  record_kind UNINDEXED,
  record_id UNINDEXED,
  semantic_node_id UNINDEXED,
  evidence_anchor_id UNINDEXED,
  activity_interval_id UNINDEXED,
  steering_directive_id UNINDEXED,
  context_pack_id UNINDEXED,
  context_pack_item_id UNINDEXED,
  item_kind UNINDEXED,
  source_kind UNINDEXED,
  source_id UNINDEXED,
  uri UNINDEXED,
  path UNINDEXED,
  workflow_definition_id UNINDEXED,
  workflow_execution_id UNINDEXED,
  workflow_node_id UNINDEXED,
  workflow_node_execution_id UNINDEXED,
  chat_conversation_id UNINDEXED,
  chat_run_id UNINDEXED,
  chat_message_id UNINDEXED,
  run_item_id UNINDEXED,
  title,
  summary,
  body,
  updated_at UNINDEXED,
  tokenize = 'unicode61'
);
`)

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

func (store *Store) persistenceError(operation string, err error) error {
	return &PersistenceError{Operation: operation, Path: store.dbPath, Err: err}
}

func (store *Store) corruptError(path string, err error) error {
	return &CorruptStateError{Path: path, Err: err}
}

func modelInfoFromJSON(raw string) (map[string]string, error) {
	info := map[string]string{}
	if raw == "" {
		return info, nil
	}
	if err := json.Unmarshal([]byte(raw), &info); err != nil {
		return nil, err
	}
	return info, nil
}
