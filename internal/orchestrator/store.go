package orchestrator

import (
	"bytes"
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
	workflowDatabaseName = "workflow-kernel.sqlite"
	workflowStoreVersion = 4
	sqliteDriverName     = "sqlite"
)

type WorkflowStore interface {
	SaveDefinitionVersion(WorkflowDefinitionVersion) error
	LatestDefinitionVersionNumber(workspaceID string, definitionID string) (int, error)
	LoadDefinitionVersion(workspaceID string, definitionID string, versionID string) (WorkflowDefinitionVersion, error)
	LoadExecution(workspaceID string, executionID string) (WorkflowExecution, error)
	ActiveExecutionForDefinition(workspaceID string, definitionID string) (WorkflowExecution, bool, error)
	ListExecutionSummariesForDefinition(workspaceID string, definitionID string, limit int) ([]WorkflowExecutionSummary, error)
	ListExecutions(workspaceID string) ([]WorkflowExecution, error)
	WorkspaceIDs() ([]string, error)
	PersistExecutionStart(WorkflowDefinitionVersion, WorkflowTransition) ([]WorkflowEventEnvelope, error)
	PersistTransition(WorkflowTransition) ([]WorkflowEventEnvelope, error)
	AppendWorkflowDefinitionEvent(WorkflowEvent) (WorkflowEventEnvelope, error)
	LoadExecutionEventPage(workspaceID string, executionID string, beforeOrdinal int, limit int) (WorkflowExecutionEventPage, error)
	LoadWorkflowEventStreamAfter(cursor WorkflowEventCursor) ([]WorkflowEventEnvelope, error)
}

var _ WorkflowStore = (*Store)(nil)

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
	return fmt.Sprintf("malformed workflow state %s: %v", err.Path, err.Err)
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
		return nil, &PersistenceError{Operation: "create workflow database directory", Path: appDataDir, Err: err}
	}
	dbPath := filepath.Join(appDataDir, workflowDatabaseName)
	db, err := sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		return nil, &PersistenceError{Operation: "open workflow database", Path: dbPath, Err: err}
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
		return store.persistenceError("close workflow database", err)
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
			return store.persistenceError("configure workflow database", err)
		}
	}
	if err := store.createSchema(ctx); err != nil {
		return err
	}
	var userVersion int
	if err := store.db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&userVersion); err != nil {
		return store.persistenceError("read workflow database schema version", err)
	}
	if userVersion != 0 && userVersion != workflowStoreVersion {
		return store.corruptError("workflow database", fmt.Errorf("unsupported schema version %d", userVersion))
	}
	if userVersion == 0 {
		if _, err := store.db.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", workflowStoreVersion)); err != nil {
			return store.persistenceError("write workflow database schema version", err)
		}
	}
	return nil
}

func (store *Store) createSchema(ctx context.Context) error {
	for _, statement := range sqliteSchemaStatements {
		if _, err := store.db.ExecContext(ctx, statement); err != nil {
			return store.persistenceError("initialize workflow database schema", err)
		}
	}
	return nil
}

var sqliteSchemaStatements = splitSQLStatements(`
CREATE TABLE IF NOT EXISTS workflow_versions (
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

CREATE INDEX IF NOT EXISTS workflow_versions_definition_created_idx
  ON workflow_versions(definition_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS workflow_runs (
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

CREATE INDEX IF NOT EXISTS workflow_runs_workspace_started_idx
  ON workflow_runs(workspace_id, started_at DESC, id);

CREATE INDEX IF NOT EXISTS workflow_runs_workspace_definition_started_idx
  ON workflow_runs(workspace_id, definition_id, started_at DESC, id);

CREATE INDEX IF NOT EXISTS workflow_runs_nonterminal_idx
  ON workflow_runs(status, updated_at, id);

CREATE TABLE IF NOT EXISTS workflow_events (
  stream_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  definition_id TEXT NOT NULL,
  definition_name TEXT NOT NULL DEFAULT '',
  definition_version_id TEXT REFERENCES workflow_versions(id),
  run_id TEXT REFERENCES workflow_runs(id) ON DELETE CASCADE,
  ordinal INTEGER,
  type TEXT NOT NULL,
  node_id TEXT NOT NULL DEFAULT '',
  node_execution_id TEXT NOT NULL DEFAULT '',
  token_id TEXT NOT NULL DEFAULT '',
  runner_kind TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS workflow_events_run_ordinal_idx
  ON workflow_events(workspace_id, run_id, ordinal);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_events_run_ordinal_unique_idx
  ON workflow_events(run_id, ordinal)
  WHERE run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS workflow_node_attempts (
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
  agent_run_settings_json TEXT,
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

CREATE INDEX IF NOT EXISTS workflow_node_attempts_run_status_idx
  ON workflow_node_attempts(run_id, status, id);

CREATE TABLE IF NOT EXISTS workflow_tokens (
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

CREATE INDEX IF NOT EXISTS workflow_tokens_run_node_status_idx
  ON workflow_tokens(run_id, node_id, status, id);

CREATE TABLE IF NOT EXISTS workflow_loop_counters (
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY(run_id, node_id)
);

CREATE TABLE IF NOT EXISTS workflow_approvals (
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

CREATE INDEX IF NOT EXISTS workflow_approvals_run_status_idx
  ON workflow_approvals(run_id, status, created_at, id);

CREATE TABLE IF NOT EXISTS workflow_runner_state (
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

CREATE TABLE IF NOT EXISTS workflow_runner_refs (
  node_execution_id TEXT NOT NULL REFERENCES workflow_node_attempts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(node_execution_id, kind)
);

CREATE TABLE IF NOT EXISTS workflow_activity_refs (
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

CREATE INDEX IF NOT EXISTS workflow_activity_refs_node_idx
  ON workflow_activity_refs(node_execution_id, kind, id);

CREATE TABLE IF NOT EXISTS workflow_artifact_refs (
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

func validateDefinitionSnapshot(definition WorkflowDefinition) error {
	if definition.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported schemaVersion %d", definition.SchemaVersion)
	}
	if err := validateStoreIDs("definition id", definition.ID, "workspace id", definition.WorkspaceID); err != nil {
		return err
	}
	if definition.Name == "" {
		return fmt.Errorf("definition %s name is required", definition.ID)
	}
	if definition.CreatedAt == "" || definition.UpdatedAt == "" {
		return fmt.Errorf("definition %s timestamps are required", definition.ID)
	}
	return nil
}

func validateDefinitionVersionSnapshot(version WorkflowDefinitionVersion) error {
	if version.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported schemaVersion %d", version.SchemaVersion)
	}
	if err := validateStoreIDs("version id", version.ID, "workspace id", version.WorkspaceID, "definition id", version.DefinitionID); err != nil {
		return err
	}
	if version.VersionNumber <= 0 {
		return fmt.Errorf("definition version %s versionNumber must be positive", version.ID)
	}
	if version.Name == "" {
		return fmt.Errorf("definition version %s name is required", version.ID)
	}
	if version.CreatedAt == "" {
		return fmt.Errorf("definition version %s createdAt is required", version.ID)
	}
	return nil
}

func validateExecutionSnapshot(execution WorkflowExecution) error {
	if execution.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported schemaVersion %d", execution.SchemaVersion)
	}
	if err := validateStoreIDs("execution id", execution.ID, "workspace id", execution.WorkspaceID, "definition id", execution.DefinitionID, "definition version id", execution.DefinitionVersionID); err != nil {
		return err
	}
	if execution.Status == "" {
		return fmt.Errorf("execution %s status is required", execution.ID)
	}
	if execution.CreatedAt == "" || execution.StartedAt == "" || execution.UpdatedAt == "" {
		return fmt.Errorf("execution %s timestamps are required", execution.ID)
	}
	if execution.NodeExecutions == nil {
		return fmt.Errorf("execution %s nodeExecutions must not be null", execution.ID)
	}
	if execution.Tokens == nil {
		return fmt.Errorf("execution %s tokens must not be null", execution.ID)
	}
	if execution.LoopIterations == nil {
		return fmt.Errorf("execution %s loopIterations must not be null", execution.ID)
	}
	return nil
}

func validateWorkflowExecutionSummary(summary WorkflowExecutionSummary) error {
	if err := validateStoreIDs("execution id", summary.ID, "workspace id", summary.WorkspaceID, "definition id", summary.DefinitionID, "definition version id", summary.DefinitionVersionID); err != nil {
		return err
	}
	if summary.DefinitionVersionNumber <= 0 {
		return fmt.Errorf("workflow execution summary %s definitionVersionNumber must be positive", summary.ID)
	}
	if summary.Status == "" {
		return fmt.Errorf("workflow execution summary %s status is required", summary.ID)
	}
	if summary.StartedAt == "" || summary.UpdatedAt == "" {
		return fmt.Errorf("workflow execution summary %s timestamps are required", summary.ID)
	}
	return nil
}

func validateEventRecord(event WorkflowEvent) error {
	if isWorkflowDefinitionEventType(event.Type) {
		return validateWorkflowDefinitionEventRecord(event)
	}
	return validateWorkflowExecutionEventRecord(event)
}

func validateWorkflowExecutionEventRecord(event WorkflowEvent) error {
	if event.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported schemaVersion %d", event.SchemaVersion)
	}
	if err := validateStoreIDs("event id", event.ID, "workspace id", event.WorkspaceID, "execution id", event.ExecutionID, "definition id", event.DefinitionID, "definition version id", event.DefinitionVersionID); err != nil {
		return err
	}
	if event.Ordinal <= 0 {
		return fmt.Errorf("workflow event %s ordinal must be positive", event.ID)
	}
	if event.Type == "" {
		return fmt.Errorf("workflow event %s type is required", event.ID)
	}
	if event.CreatedAt == "" {
		return fmt.Errorf("workflow event %s createdAt is required", event.ID)
	}
	return nil
}

func validateWorkflowDefinitionEventRecord(event WorkflowEvent) error {
	if err := validateWorkflowDefinitionEventIdentity(event); err != nil {
		return err
	}
	if err := validateWorkflowDefinitionEventState(event); err != nil {
		return err
	}
	return validateWorkflowDefinitionEventScope(event)
}

func validateWorkflowDefinitionEventIdentity(event WorkflowEvent) error {
	if event.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported schemaVersion %d", event.SchemaVersion)
	}
	if err := validateStoreIDs("event id", event.ID, "workspace id", event.WorkspaceID, "definition id", event.DefinitionID); err != nil {
		return err
	}
	return nil
}

func validateWorkflowDefinitionEventState(event WorkflowEvent) error {
	if !isWorkflowDefinitionEventType(event.Type) {
		return fmt.Errorf("workflow definition event %s type is unsupported: %s", event.ID, event.Type)
	}
	if event.DefinitionName == "" {
		return fmt.Errorf("workflow definition event %s definitionName is required", event.ID)
	}
	if event.CreatedAt == "" {
		return fmt.Errorf("workflow definition event %s createdAt is required", event.ID)
	}
	return nil
}

func validateWorkflowDefinitionEventScope(event WorkflowEvent) error {
	if event.DefinitionVersionID != "" || event.ExecutionID != "" || event.Ordinal != 0 {
		return fmt.Errorf("workflow definition event %s must not include execution scope", event.ID)
	}
	if event.NodeID != "" || event.NodeExecutionID != "" || event.TokenID != "" || event.RunnerKind != nil {
		return fmt.Errorf("workflow definition event %s must not include run details", event.ID)
	}
	return nil
}

func isWorkflowDefinitionEventType(eventType WorkflowEventType) bool {
	switch eventType {
	case EventDefinitionCreated, EventDefinitionUpdated, EventDefinitionDeleted:
		return true
	default:
		return false
	}
}

func validateWorkflowEventCursor(cursor WorkflowEventCursor) error {
	if cursor.Sequence < 0 {
		return fmt.Errorf("workflow event stream sequence must be non-negative: %d", cursor.Sequence)
	}
	if cursor.Sequence > 0 && cursor.StreamID == "" {
		return errors.New("workflow event stream id is required for non-zero sequence")
	}
	if cursor.StreamID != "" && cursor.StreamID != WorkflowEventStreamID {
		return fmt.Errorf("unsupported workflow event stream id %s", cursor.StreamID)
	}
	return nil
}

func validateStoreIDs(pairs ...string) error {
	if len(pairs)%2 != 0 {
		return errors.New("validateStoreIDs requires label/value pairs")
	}
	for index := 0; index < len(pairs); index += 2 {
		if err := validateStorageID(pairs[index], pairs[index+1]); err != nil {
			return err
		}
	}
	return nil
}

func validateStorageID(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if !isStorageID(value) {
		return fmt.Errorf("%s %q must contain only letters, numbers, underscores, or hyphens", label, value)
	}
	return nil
}

func compactRawJSON(raw json.RawMessage, defaultJSON string) (string, error) {
	if len(raw) == 0 {
		return defaultJSON, nil
	}
	var buffer bytes.Buffer
	if err := json.Compact(&buffer, raw); err != nil {
		return "", err
	}
	return buffer.String(), nil
}

func marshalJSONColumn(value any) (string, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func nullableString(value string) sql.NullString {
	if value == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: value, Valid: true}
}

func nullableInt(value int) sql.NullInt64 {
	if value == 0 {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: int64(value), Valid: true}
}

func nullableWorkflowTerminalReason(reason *WorkflowTerminalReason) sql.NullString {
	if reason == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: string(*reason), Valid: true}
}

func nullableRunnerRecoveryOutcome(outcome *RunnerRecoveryOutcome) sql.NullString {
	if outcome == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: string(*outcome), Valid: true}
}

func nullableActionKind(kind *WorkflowActionKind) sql.NullString {
	if kind == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: string(*kind), Valid: true}
}

func nullableJSON(value any, present bool) (sql.NullString, error) {
	if !present {
		return sql.NullString{}, nil
	}
	encoded, err := marshalJSONColumn(value)
	if err != nil {
		return sql.NullString{}, err
	}
	return sql.NullString{String: encoded, Valid: true}, nil
}

func nullableRawJSON(raw json.RawMessage) (sql.NullString, error) {
	if len(raw) == 0 {
		return sql.NullString{}, nil
	}
	encoded, err := compactRawJSON(raw, "")
	if err != nil {
		return sql.NullString{}, err
	}
	return sql.NullString{String: encoded, Valid: true}, nil
}

func rawJSONFromString(value string) json.RawMessage {
	if value == "" {
		return nil
	}
	return json.RawMessage(value)
}

func stringFromNull(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return value.String
}

func nullStringValue(value sql.NullString) string {
	return stringFromNull(value)
}

func nullIntValue(value sql.NullInt64) int {
	if !value.Valid {
		return 0
	}
	return int(value.Int64)
}

func workflowTerminalReasonFromNull(value sql.NullString) *WorkflowTerminalReason {
	if !value.Valid {
		return nil
	}
	reason := WorkflowTerminalReason(value.String)
	return &reason
}

func runnerRecoveryOutcomeFromNull(value sql.NullString) *RunnerRecoveryOutcome {
	if !value.Valid {
		return nil
	}
	outcome := RunnerRecoveryOutcome(value.String)
	return &outcome
}

func actionKindFromNull(value sql.NullString) *WorkflowActionKind {
	if !value.Valid || value.String == "" {
		return nil
	}
	kind := WorkflowActionKind(value.String)
	return &kind
}

func (store *Store) persistenceError(operation string, err error) error {
	return &PersistenceError{Operation: operation, Path: store.dbPath, Err: err}
}

func (store *Store) corruptError(path string, err error) error {
	return &CorruptStateError{Path: path, Err: err}
}
