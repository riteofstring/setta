# Backend Workflow Kernel SQLite Schema

This reference supports [Backend Workflow Kernel Architecture Plan](backend_workflow_kernel_architecture_plan.md).

SQLite is the workflow kernel runtime persistence store. Authored workflow definitions live in workspace JSON files; SQLite stores immutable version snapshots captured for runs, event log rows, and materialized state updates. It uses WAL mode, and JSON columns store compact JSON text validated by Go before commit.

## Schema

```sql
CREATE TABLE workflow_versions (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  definition_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  graph_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(definition_id, version_number)
);

CREATE INDEX workflow_versions_definition_created_idx
  ON workflow_versions(definition_id, created_at DESC, id);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  definition_id TEXT NOT NULL,
  definition_version_id TEXT NOT NULL REFERENCES workflow_versions(id),
  status TEXT NOT NULL,
  terminal_reason TEXT,
  recovery_outcome TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT NOT NULL DEFAULT '',
  last_event_ordinal INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX workflow_runs_workspace_started_idx
  ON workflow_runs(workspace_id, started_at DESC, id);

CREATE INDEX workflow_runs_nonterminal_idx
  ON workflow_runs(status, updated_at, id);

CREATE TABLE workflow_run_events (
  stream_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  definition_id TEXT NOT NULL,
  definition_version_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  type TEXT NOT NULL,
  node_id TEXT NOT NULL DEFAULT '',
  node_execution_id TEXT NOT NULL DEFAULT '',
  token_id TEXT NOT NULL DEFAULT '',
  runner_kind TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(run_id, ordinal)
);

CREATE INDEX workflow_run_events_run_ordinal_idx
  ON workflow_run_events(run_id, ordinal);

CREATE TABLE workflow_node_attempts (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  iteration INTEGER NOT NULL,
  status TEXT NOT NULL,
  action_kind TEXT,
  runner_kind TEXT,
  idempotency_key TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  action_policy_json TEXT,
  side_effect_policy_json TEXT NOT NULL DEFAULT '{}',
  runner_capabilities_json TEXT,
  scheduled_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  result_status TEXT,
  result_json TEXT,
  output_json TEXT,
  exit_code INTEGER,
  error TEXT NOT NULL DEFAULT '',
  recovery_outcome TEXT,
  recovery_message TEXT NOT NULL DEFAULT '',
  UNIQUE(run_id, node_id, attempt, iteration)
);

CREATE INDEX workflow_node_attempts_run_status_idx
  ON workflow_node_attempts(run_id, status, id);

CREATE TABLE workflow_tokens (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL DEFAULT '',
  edge_id TEXT NOT NULL DEFAULT '',
  iteration INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX workflow_tokens_run_node_status_idx
  ON workflow_tokens(run_id, node_id, status, id);

CREATE TABLE workflow_loop_counters (
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(run_id, node_id)
);

CREATE TABLE workflow_approvals (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_execution_id TEXT NOT NULL REFERENCES workflow_node_attempts(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  runner_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  approval_kind TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT,
  side_effect_policy_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX workflow_approvals_run_status_idx
  ON workflow_approvals(run_id, status, created_at, id);

CREATE TABLE workflow_runner_state (
  node_execution_id TEXT PRIMARY KEY REFERENCES workflow_node_attempts(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  runner_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  last_runner_event_ordinal INTEGER NOT NULL DEFAULT 0,
  opaque_state_json TEXT NOT NULL DEFAULT '{}',
  recovery_token TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workflow_runner_refs (
  node_execution_id TEXT NOT NULL REFERENCES workflow_node_attempts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(node_execution_id, kind)
);

CREATE TABLE workflow_activity_refs (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_execution_id TEXT NOT NULL REFERENCES workflow_node_attempts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  start_cursor TEXT NOT NULL DEFAULT '',
  end_cursor TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX workflow_activity_refs_node_idx
  ON workflow_activity_refs(node_execution_id, kind, id);

CREATE TABLE workflow_artifact_refs (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_execution_id TEXT NOT NULL REFERENCES workflow_node_attempts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  uri TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
```

## Transaction Boundary

Each kernel transition runs in one SQLite transaction and commits:

- New `workflow_run_events` rows with contiguous per-run ordinals and global `stream_sequence` values.
- All materialized state changes in `workflow_runs`, `workflow_node_attempts`, `workflow_tokens`, `workflow_loop_counters`, `workflow_approvals`, `workflow_runner_state`, `workflow_runner_refs`, `workflow_activity_refs`, and `workflow_artifact_refs`.
- The updated `workflow_runs.last_event_ordinal`.

There is no separate event stream shadow table. `workflow_run_events.stream_sequence` is the durable global event stream cursor.
