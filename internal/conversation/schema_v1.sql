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

CREATE TABLE conversation_inputs (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  source_pane_id TEXT,
  reply_to_input_id TEXT,
  input_text TEXT NOT NULL,
  input_modality TEXT NOT NULL CHECK (input_modality IN ('text', 'voice')),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'routing', 'awaiting_clarification', 'dispatched', 'failed')),
  routing_attempt INTEGER NOT NULL DEFAULT 0 CHECK (routing_attempt >= 0),
  routing_started_at TEXT,
  failure_json TEXT CHECK (failure_json IS NULL OR json_valid(failure_json)),
  submitted_at TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  UNIQUE(conversation_id, id),
  FOREIGN KEY (conversation_id, reply_to_input_id)
    REFERENCES conversation_inputs(conversation_id, id),
  CHECK (reply_to_input_id IS NULL OR reply_to_input_id <> id),
  CHECK (
    (status = 'routing' AND routing_started_at IS NOT NULL)
    OR (status <> 'routing' AND routing_started_at IS NULL)
  ),
  CHECK (
    (status = 'failed' AND failure_json IS NOT NULL)
    OR (status <> 'failed' AND failure_json IS NULL)
  )
) STRICT;

CREATE INDEX conversation_inputs_conversation_status_sequence_idx
  ON conversation_inputs(conversation_id, status, sequence);

CREATE UNIQUE INDEX conversation_inputs_one_clarification_reply_idx
  ON conversation_inputs(conversation_id, reply_to_input_id)
  WHERE reply_to_input_id IS NOT NULL;

CREATE TABLE conversation_route_decisions (
  stream_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  input_id TEXT NOT NULL,
  clarification_input_id TEXT,
  decision_ordinal INTEGER NOT NULL CHECK (decision_ordinal IN (1, 2)),
  routing_attempt INTEGER NOT NULL CHECK (routing_attempt > 0),
  router_context_json TEXT NOT NULL CHECK (json_valid(router_context_json)),
  resolved_invocation_json TEXT NOT NULL CHECK (json_valid(resolved_invocation_json)),
  route_decision_json TEXT NOT NULL CHECK (json_valid(route_decision_json)),
  resulting_command_json TEXT NOT NULL CHECK (json_valid(resulting_command_json)),
  resulting_command_key TEXT NOT NULL UNIQUE,
  decided_at TEXT NOT NULL,
  UNIQUE(conversation_id, input_id, decision_ordinal),
  UNIQUE(conversation_id, clarification_input_id),
  FOREIGN KEY (conversation_id, input_id)
    REFERENCES conversation_inputs(conversation_id, id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id, clarification_input_id)
    REFERENCES conversation_inputs(conversation_id, id) ON DELETE CASCADE,
  CHECK (
    (decision_ordinal = 1 AND clarification_input_id IS NULL)
    OR (decision_ordinal = 2 AND clarification_input_id IS NOT NULL)
  ),
  CHECK (clarification_input_id IS NULL OR clarification_input_id <> input_id)
) STRICT;

CREATE INDEX conversation_route_decisions_input_stream_idx
  ON conversation_route_decisions(conversation_id, input_id, stream_sequence);

CREATE TABLE conversation_route_command_completions (
  decision_id TEXT PRIMARY KEY REFERENCES conversation_route_decisions(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL
) STRICT;

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
  decision_source TEXT NOT NULL CHECK (decision_source IN ('conversation_router', 'master', 'director')),
  forked_at_turn_id TEXT REFERENCES conversation_turns(id),
  source_trajectory_sequence INTEGER NOT NULL CHECK (source_trajectory_sequence >= 0),
  provider_metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(provider_metadata_json)),
  created_at TEXT NOT NULL,
  CHECK (child_conversation_id <> parent_conversation_id),
  CHECK ((branch_kind = 'fork') = (forked_at_turn_id IS NOT NULL))
) STRICT;

CREATE INDEX conversation_branches_parent_idx
  ON conversation_branches(parent_conversation_id, created_at, child_conversation_id);

CREATE TABLE side_conversations (
  id TEXT PRIMARY KEY,
  parent_conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  parent_pane_id TEXT NOT NULL,
  decision_source TEXT NOT NULL CHECK (decision_source IN ('conversation_router', 'master')),
  provider_thread_id TEXT,
  source_provider_thread_id TEXT NOT NULL,
  source_provider_turn_id TEXT,
  source_trajectory_sequence INTEGER NOT NULL CHECK (source_trajectory_sequence >= 0),
  last_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_event_sequence >= 0),
  active_turn_id TEXT,
  active_provider_turn_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('preparing', 'active', 'disposing', 'failed')),
  resolved_side_agent_invocation_json TEXT NOT NULL CHECK (json_valid(resolved_side_agent_invocation_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disposed_at TEXT,
  failure_json TEXT CHECK (failure_json IS NULL OR json_valid(failure_json)),
  CHECK (active_provider_turn_id IS NULL OR active_turn_id IS NOT NULL),
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

CREATE TABLE agent_thread_bindings (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'codex'),
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('linked', 'missing', 'unavailable')),
  created_at TEXT NOT NULL,
  last_resumed_at TEXT,
  last_turn_id TEXT REFERENCES conversation_turns(id),
  provider_metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(provider_metadata_json)),
  UNIQUE(provider, thread_id)
) STRICT;

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
  provider_thread_id TEXT,
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
  kind TEXT NOT NULL CHECK (kind IN ('markdown', 'table', 'bar_chart', 'file')),
  title TEXT NOT NULL DEFAULT '',
  markdown_json TEXT CHECK (markdown_json IS NULL OR json_valid(markdown_json)),
  table_json TEXT CHECK (table_json IS NULL OR json_valid(table_json)),
  bar_chart_json TEXT CHECK (bar_chart_json IS NULL OR json_valid(bar_chart_json)),
  file_json TEXT CHECK (file_json IS NULL OR json_valid(file_json)),
  created_at TEXT NOT NULL,
  CHECK (
    (kind = 'markdown' AND markdown_json IS NOT NULL AND table_json IS NULL AND bar_chart_json IS NULL AND file_json IS NULL)
    OR (kind = 'table' AND markdown_json IS NULL AND table_json IS NOT NULL AND bar_chart_json IS NULL AND file_json IS NULL)
    OR (kind = 'bar_chart' AND markdown_json IS NULL AND table_json IS NULL AND bar_chart_json IS NOT NULL AND file_json IS NULL)
    OR (kind = 'file' AND markdown_json IS NULL AND table_json IS NULL AND bar_chart_json IS NULL AND file_json IS NOT NULL)
  )
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

CREATE TABLE topic_index_documents (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  resource_scope_kind TEXT NOT NULL CHECK (resource_scope_kind IN ('folderless', 'folder')),
  folder_workspace_id TEXT,
  title TEXT NOT NULL,
  topic_descriptor TEXT NOT NULL,
  recent_user_requests_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(recent_user_requests_json)),
  recent_final_summaries_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(recent_final_summaries_json)),
  updated_at TEXT NOT NULL,
  updated_sort_key TEXT NOT NULL,
  CHECK (
    (resource_scope_kind = 'folderless' AND folder_workspace_id IS NULL)
    OR (resource_scope_kind = 'folder' AND folder_workspace_id IS NOT NULL AND length(folder_workspace_id) > 0)
  )
) STRICT;

CREATE INDEX topic_index_documents_scope_updated_idx
  ON topic_index_documents(resource_scope_kind, folder_workspace_id, updated_sort_key DESC, conversation_id);

CREATE INDEX topic_index_documents_updated_idx
  ON topic_index_documents(updated_sort_key DESC, conversation_id);

CREATE VIRTUAL TABLE topic_index_search USING fts5(
  conversation_id UNINDEXED,
  resource_scope_kind UNINDEXED,
  folder_workspace_id UNINDEXED,
  title,
  topic_descriptor,
  recent_user_requests,
  recent_final_summaries,
  tokenize = 'unicode61'
);

CREATE TABLE role_profile_overrides (
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('global', 'workspace', 'conversation')),
  scope_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('master', 'agent', 'narrator', 'side_agent')),
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

CREATE TABLE master_voice_selection (
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

CREATE TABLE master_sessions (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL CHECK (provider = 'codex'),
  provider_thread_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('initializing', 'ready', 'running', 'degraded')),
  resolved_invocation_json TEXT NOT NULL CHECK (json_valid(resolved_invocation_json)),
  durable_context_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(durable_context_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  degradation_json TEXT CHECK (degradation_json IS NULL OR json_valid(degradation_json))
) STRICT;

CREATE TABLE master_inputs (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  input_text TEXT NOT NULL,
  input_modality TEXT NOT NULL CHECK (input_modality IN ('voice', 'text')),
  input_source TEXT NOT NULL CHECK (input_source IN ('shell', 'conversation_escalation')),
  submitted_at TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  routing_status TEXT NOT NULL DEFAULT 'accepted' CHECK (routing_status IN ('accepted', 'routing', 'decided', 'cancelled', 'failed')),
  routing_attempt INTEGER NOT NULL DEFAULT 0 CHECK (routing_attempt >= 0),
  routing_started_at TEXT,
  routing_failure_json TEXT CHECK (routing_failure_json IS NULL OR json_valid(routing_failure_json)),
  focused_workspace_id TEXT,
  focused_conversation_id TEXT,
  focused_pane_id TEXT,
  originating_workspace_id TEXT,
  originating_conversation_id TEXT,
  originating_pane_id TEXT,
  originating_conversation_input_id TEXT,
  UNIQUE(originating_conversation_input_id),
  FOREIGN KEY (originating_conversation_id, originating_conversation_input_id)
    REFERENCES conversation_inputs(conversation_id, id),
  CHECK (
    (input_source = 'shell'
      AND originating_workspace_id IS NULL
      AND originating_conversation_id IS NULL
      AND originating_pane_id IS NULL
      AND originating_conversation_input_id IS NULL)
    OR (input_source = 'conversation_escalation'
      AND originating_workspace_id IS NOT NULL
      AND originating_conversation_id IS NOT NULL
      AND originating_conversation_input_id IS NOT NULL)
  ),
  CHECK (
    (routing_status = 'routing' AND routing_started_at IS NOT NULL)
    OR (routing_status <> 'routing' AND routing_started_at IS NULL)
  ),
  CHECK (
    (routing_status = 'failed' AND routing_failure_json IS NOT NULL)
    OR (routing_status <> 'failed' AND routing_failure_json IS NULL)
  )
) STRICT;

CREATE INDEX master_inputs_routing_status_accepted_idx
  ON master_inputs(routing_status, sequence);

CREATE TABLE master_input_cancellations (
  input_id TEXT PRIMARY KEY REFERENCES master_inputs(id) ON DELETE CASCADE,
  routing_attempt INTEGER NOT NULL CHECK (routing_attempt >= 0),
  cancelled_at TEXT NOT NULL
) STRICT;

CREATE TABLE master_route_decisions (
  stream_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  master_session_id TEXT NOT NULL REFERENCES master_sessions(id) ON DELETE CASCADE,
  input_id TEXT NOT NULL UNIQUE REFERENCES master_inputs(id) ON DELETE CASCADE,
  routing_attempt INTEGER NOT NULL CHECK (routing_attempt > 0),
  candidate_context_json TEXT NOT NULL CHECK (json_valid(candidate_context_json)),
  resolved_invocation_json TEXT NOT NULL CHECK (json_valid(resolved_invocation_json)),
  route_decision_json TEXT NOT NULL CHECK (json_valid(route_decision_json)),
  resulting_command_json TEXT NOT NULL CHECK (json_valid(resulting_command_json)),
  decided_at TEXT NOT NULL
) STRICT;

CREATE INDEX master_route_decisions_session_stream_idx
  ON master_route_decisions(master_session_id, stream_sequence);

CREATE TABLE master_presentation_resolutions (
  decision_id TEXT PRIMARY KEY REFERENCES master_route_decisions(id) ON DELETE CASCADE,
  intent_id TEXT NOT NULL UNIQUE,
  pane_id TEXT NOT NULL,
  resolved_at TEXT NOT NULL
) STRICT;

CREATE TABLE master_route_command_completions (
  decision_id TEXT PRIMARY KEY REFERENCES master_route_decisions(id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL
) STRICT;

CREATE TABLE master_route_clarification_replies (
  reply_input_id TEXT PRIMARY KEY REFERENCES master_inputs(id) ON DELETE CASCADE,
  clarification_decision_id TEXT NOT NULL REFERENCES master_route_decisions(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX master_route_clarification_replies_decision_idx
  ON master_route_clarification_replies(clarification_decision_id);

CREATE TABLE pane_bindings (
  pane_id TEXT PRIMARY KEY,
  workspace_id TEXT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_focused_at TEXT
) STRICT;

CREATE INDEX pane_bindings_conversation_focus_idx
  ON pane_bindings(conversation_id, last_focused_at DESC, pane_id);

CREATE UNIQUE INDEX pane_bindings_conversation_unique_idx
  ON pane_bindings(conversation_id);

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
