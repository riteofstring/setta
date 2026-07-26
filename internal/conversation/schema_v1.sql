CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  title TEXT NOT NULL,
  topic_descriptor TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('idle', 'working', 'waiting_for_approval', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  last_trajectory_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_trajectory_sequence >= 0)
) STRICT;

CREATE INDEX conversations_workspace_updated_idx
  ON conversations(workspace_id, updated_at DESC, id);

CREATE TABLE conversation_turns (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  authored_input_json TEXT NOT NULL CHECK (json_valid(authored_input_json)),
  delivery TEXT NOT NULL CHECK (delivery IN ('normal', 'queued', 'steering')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'cancelled', 'failed')),
  accepted_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  requested_role_profile_json TEXT NOT NULL CHECK (json_valid(requested_role_profile_json)),
  resolved_invocation_json TEXT CHECK (resolved_invocation_json IS NULL OR json_valid(resolved_invocation_json)),
  provider_turn_id TEXT,
  error_json TEXT CHECK (error_json IS NULL OR json_valid(error_json))
) STRICT;

CREATE INDEX conversation_turns_conversation_accepted_idx
  ON conversation_turns(conversation_id, accepted_at, id);

CREATE UNIQUE INDEX conversation_turns_one_running_idx
  ON conversation_turns(conversation_id)
  WHERE status = 'running';

CREATE TABLE conversation_queue (
  turn_id TEXT PRIMARY KEY REFERENCES conversation_turns(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  queued_at TEXT NOT NULL,
  UNIQUE(conversation_id, ordinal)
) STRICT;

CREATE TABLE conversation_branches (
  child_conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  parent_conversation_id TEXT NOT NULL REFERENCES conversations(id),
  branch_kind TEXT NOT NULL CHECK (branch_kind IN ('fork', 'child')),
  decision_source TEXT NOT NULL CHECK (decision_source = 'director'),
  forked_at_turn_id TEXT REFERENCES conversation_turns(id),
  source_trajectory_sequence INTEGER NOT NULL CHECK (source_trajectory_sequence >= 0),
  created_at TEXT NOT NULL,
  CHECK (child_conversation_id <> parent_conversation_id),
  CHECK ((branch_kind = 'fork') = (forked_at_turn_id IS NOT NULL))
) STRICT;

CREATE INDEX conversation_branches_parent_idx
  ON conversation_branches(parent_conversation_id, created_at, child_conversation_id);

CREATE TABLE side_conversations (
  id TEXT PRIMARY KEY,
  parent_conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  decision_source TEXT NOT NULL CHECK (decision_source = 'director'),
  source_turn_id TEXT,
  source_trajectory_sequence INTEGER NOT NULL CHECK (source_trajectory_sequence >= 0),
  last_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_event_sequence >= 0),
  active_turn_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('preparing', 'active', 'disposing', 'failed')),
  resolved_side_agent_invocation_json TEXT NOT NULL CHECK (json_valid(resolved_side_agent_invocation_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disposed_at TEXT,
  failure_json TEXT CHECK (failure_json IS NULL OR json_valid(failure_json)),
  CHECK (disposed_at IS NULL OR active_turn_id IS NULL)
) STRICT;

CREATE INDEX side_conversations_parent_status_idx
  ON side_conversations(parent_conversation_id, status, created_at, id);

CREATE TABLE side_conversation_events (
  stream_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  side_conversation_id TEXT NOT NULL REFERENCES side_conversations(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  turn_id TEXT,
  emitted_at TEXT NOT NULL,
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  UNIQUE(side_conversation_id, sequence)
) STRICT;

CREATE INDEX side_conversation_events_side_sequence_idx
  ON side_conversation_events(side_conversation_id, sequence);

CREATE TABLE trajectory_events (
  stream_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  turn_id TEXT REFERENCES conversation_turns(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  emitted_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  provider_event_id TEXT,
  provider_turn_id TEXT,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  UNIQUE(conversation_id, sequence)
) STRICT;

CREATE INDEX trajectory_events_conversation_sequence_idx
  ON trajectory_events(conversation_id, sequence);

CREATE INDEX trajectory_events_turn_sequence_idx
  ON trajectory_events(turn_id, sequence)
  WHERE turn_id IS NOT NULL;

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  turn_id TEXT REFERENCES conversation_turns(id) ON DELETE CASCADE,
  trajectory_sequence INTEGER CHECK (trajectory_sequence IS NULL OR trajectory_sequence > 0),
  title TEXT NOT NULL CHECK (length(title) > 0),
  kind TEXT NOT NULL CHECK (length(kind) > 0),
  summary TEXT NOT NULL CHECK (length(summary) > 0),
  language TEXT NOT NULL CHECK (language IN ('openui_lang')),
  catalog_id TEXT NOT NULL CHECK (catalog_id IN ('setta.artifacts.v1')),
  source TEXT NOT NULL CHECK (length(source) > 0),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX artifacts_conversation_created_idx
  ON artifacts(conversation_id, created_at, id);

CREATE TABLE narrator_state (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  observed_through_sequence INTEGER NOT NULL DEFAULT 0 CHECK (observed_through_sequence >= 0),
  checkpoint_through_sequence INTEGER NOT NULL DEFAULT 0 CHECK (checkpoint_through_sequence >= 0),
  checkpoint_text TEXT NOT NULL DEFAULT '',
  current_focus TEXT NOT NULL DEFAULT '',
  current_focus_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_focus_revision >= 0),
  current_focus_source_sequence INTEGER NOT NULL DEFAULT 0 CHECK (current_focus_source_sequence >= 0),
  topic_descriptor TEXT NOT NULL DEFAULT '',
  last_invocation_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('ready', 'running', 'degraded')),
  degradation_json TEXT CHECK (degradation_json IS NULL OR json_valid(degradation_json)),
  updated_at TEXT NOT NULL,
  CHECK (checkpoint_through_sequence <= observed_through_sequence),
  CHECK (
    (current_focus_revision = 0 AND current_focus = '' AND current_focus_source_sequence = 0)
    OR (current_focus_revision > 0 AND current_focus <> '' AND current_focus_source_sequence > 0)
  )
) STRICT;

CREATE TABLE narration_events (
  stream_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  turn_id TEXT REFERENCES conversation_turns(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('milestone', 'status_reply', 'final_summary', 'topic_descriptor')),
  source_sequence_start INTEGER NOT NULL CHECK (source_sequence_start >= 0),
  source_sequence_end INTEGER NOT NULL CHECK (source_sequence_end >= source_sequence_start),
  trigger TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  resolved_invocation_json TEXT NOT NULL CHECK (json_valid(resolved_invocation_json)),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX narration_events_conversation_stream_idx
  ON narration_events(conversation_id, stream_sequence);

CREATE TABLE role_profile_overrides (
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('global', 'workspace', 'conversation')),
  scope_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('director', 'agent', 'narrator', 'side_agent')),
  provider TEXT NOT NULL CHECK (provider = 'codex'),
  profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(scope_kind, scope_id, role),
  CHECK (
    (scope_kind = 'global' AND scope_id = '')
    OR (scope_kind IN ('workspace', 'conversation') AND scope_id <> '')
  )
) STRICT;

CREATE TABLE conversation_presentation_profiles (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  palette_selection TEXT NOT NULL CHECK (palette_selection IN ('auto_distinct', 'exact')),
  requested_palette_id TEXT,
  resolved_palette_id TEXT NOT NULL,
  palette_reuse_json TEXT CHECK (palette_reuse_json IS NULL OR json_valid(palette_reuse_json)),
  narrator_voice_selection TEXT NOT NULL CHECK (narrator_voice_selection IN ('auto_distinct', 'exact')),
  requested_narrator_voice_id TEXT,
  resolved_narrator_voice_id TEXT,
  narrator_voice_reuse_json TEXT CHECK (narrator_voice_reuse_json IS NULL OR json_valid(narrator_voice_reuse_json)),
  narrator_speech_enabled INTEGER NOT NULL CHECK (narrator_speech_enabled IN (0, 1)),
  updated_at TEXT NOT NULL,
  CHECK ((palette_selection = 'exact' AND requested_palette_id IS NOT NULL) OR palette_selection = 'auto_distinct'),
  CHECK ((narrator_voice_selection = 'exact' AND requested_narrator_voice_id IS NOT NULL) OR narrator_voice_selection = 'auto_distinct')
) STRICT;

CREATE TABLE director_voice_selection (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  selection TEXT NOT NULL CHECK (selection IN ('auto_distinct', 'exact')),
  requested_voice_id TEXT,
  resolved_voice_id TEXT,
  reuse_json TEXT CHECK (reuse_json IS NULL OR json_valid(reuse_json)),
  updated_at TEXT NOT NULL,
  CHECK ((selection = 'exact' AND requested_voice_id IS NOT NULL) OR selection = 'auto_distinct')
) STRICT;

CREATE TABLE narrator_voice_default (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  selection TEXT NOT NULL CHECK (selection IN ('auto_distinct', 'exact')),
  requested_voice_id TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    (selection = 'exact' AND requested_voice_id IS NOT NULL)
    OR (selection = 'auto_distinct' AND requested_voice_id IS NULL)
  )
) STRICT;

CREATE TABLE committed_events (
  commit_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  stream_id TEXT NOT NULL,
  stream_sequence INTEGER NOT NULL CHECK (stream_sequence > 0),
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  committed_at TEXT NOT NULL,
  UNIQUE(stream_id, stream_sequence)
) STRICT;

CREATE INDEX committed_events_stream_sequence_idx
  ON committed_events(stream_id, stream_sequence);
