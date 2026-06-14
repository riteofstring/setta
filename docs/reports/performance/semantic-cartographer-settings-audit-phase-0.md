# Semantic Cartographer Settings Audit Phase 0

Date: 2026-06-15

## Scope

Phase 0 audits the current cartographer run metadata before replacing the run
audit schema with explicit requested, effective, and reported model/reasoning
fields. The local source was queried read-only:

```text
sqlite3 -readonly "$HOME/.setta/semantic-graph.sqlite"
```

The database reported `PRAGMA user_version = 9` and 132 rows in
`semantic_cartographer_runs`.

## Recent Run Counts

Recent scope: latest 200 `semantic_cartographer_runs` rows ordered by
`updated_at DESC, id DESC`. The current store has 132 rows, so this covers all
recorded runs in the local store.

| status | trigger | model | error | runs |
| --- | --- | --- | --- | ---: |
| superseded | workflow_window | `<empty>` | queued cartographer window was superseded by the per-source backlog cap | 101 |
| completed_noop | workflow_window | gpt-5.5 | cartographer patch envelope proposed no semantic graph mutations | 18 |
| superseded | workflow_window | `<empty>` | obsolete queued cartographer window was superseded by the workflow completion synthesis pass | 7 |
| applied | workflow_window | gpt-5.5 | `<empty>` | 3 |
| failed | workflow_done | `<empty>` | start codex structured task turn: turn/start failed: Input exceeds the maximum length of 1048576 characters. | 1 |
| rejected | workflow_window | gpt-5.5 | cartographer patch validation rejected all proposed mutations | 1 |
| superseded | workflow_window | `<empty>` | open cartographer epoch was folded into the workflow completion synthesis pass | 1 |

## Model Audit Gaps

Distinct models currently recorded:

| model | runs |
| --- | ---: |
| `<empty>` | 110 |
| gpt-5.5 | 22 |

Runs with an empty `model`: 110.

Failed `workflow_done` runs caused by input length: 1.

## Current Run Table Schema

```sql
CREATE TABLE semantic_cartographer_runs (
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
  model TEXT NOT NULL DEFAULT '',
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
  input_item_counts_json TEXT NOT NULL DEFAULT '{}',
  raw_harness_response_hash TEXT NOT NULL DEFAULT '',
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

CREATE INDEX semantic_cartographer_runs_workspace_source_idx
  ON semantic_cartographer_runs(workspace_id, workflow_execution_id, chat_run_id, target_entity_id, updated_at DESC, id);

CREATE INDEX semantic_cartographer_runs_queue_idx
  ON semantic_cartographer_runs(status, priority DESC, created_at ASC, id);

CREATE INDEX semantic_cartographer_runs_source_key_idx
  ON semantic_cartographer_runs(workspace_id, source_key, status, priority DESC, created_at DESC, id);
```

## Reset Action

This phase treats the next cartographer audit schema as a semantic graph
store-version change. Existing cartographer rows are not migrated or preserved.
The implementation bumps the semantic graph SQLite `user_version`; stores at the
previous version fail on open with reset guidance.

Focused verification uses temporary app-data directories, so it does not mutate
the developer's real `~/.setta` store. Before local app verification against the
default global store, stop Setta and reset the semantic graph store with:

```text
rm -f "$HOME/.setta/semantic-graph.sqlite" "$HOME/.setta/semantic-graph.sqlite-shm" "$HOME/.setta/semantic-graph.sqlite-wal"
```

For a full global Setta state reset instead of only the semantic graph store,
use:

```text
./scripts/reset_global_setta_state.sh --yes
```
