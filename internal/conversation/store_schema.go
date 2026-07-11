package conversation

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"sort"
	"strings"
)

//go:embed schema_v1.sql
var schemaV1SQL string

var schemaV1Tables = []string{
	"agent_thread_bindings",
	"artifacts",
	"committed_events",
	"conversation_branches",
	"conversation_presentation_profiles",
	"conversation_queue",
	"conversation_turns",
	"conversations",
	"master_route_decisions",
	"master_sessions",
	"master_voice_selection",
	"narration_events",
	"narrator_state",
	"pane_bindings",
	"role_profile_overrides",
	"side_conversations",
	"topic_index_documents",
	"topic_index_search",
	"trajectory_events",
}

var schemaV1Indexes = []string{
	"artifacts_conversation_created_idx",
	"committed_events_stream_sequence_idx",
	"conversation_branches_parent_idx",
	"conversation_turns_conversation_accepted_idx",
	"conversation_turns_one_running_idx",
	"conversations_workspace_updated_idx",
	"master_route_decisions_session_stream_idx",
	"narration_events_conversation_stream_idx",
	"pane_bindings_conversation_focus_idx",
	"side_conversations_parent_status_idx",
	"topic_index_documents_workspace_updated_idx",
	"trajectory_events_conversation_sequence_idx",
	"trajectory_events_turn_sequence_idx",
}

func initializeSchema(ctx context.Context, connection *sql.Conn, dbPath string) error {
	if err := checkDatabaseIntegrity(ctx, connection, dbPath); err != nil {
		return err
	}
	var version int
	if err := connection.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		return databaseError("read conversation database schema version", dbPath, err)
	}
	switch version {
	case 0:
		hasSchema, err := hasUserSchema(ctx, connection, dbPath)
		if err != nil {
			return err
		}
		if hasSchema {
			return &CorruptStateError{Path: dbPath, Err: errors.New("unversioned database is not empty")}
		}
		if err := createSchemaV1(ctx, connection, dbPath); err != nil {
			return err
		}
	case conversationStoreVersion:
	default:
		return &CorruptStateError{Path: dbPath, Err: fmt.Errorf("unsupported schema version %d", version)}
	}
	if err := validateSchemaV1(ctx, connection, dbPath); err != nil {
		return err
	}
	return checkForeignKeys(ctx, connection, dbPath)
}

func createSchemaV1(ctx context.Context, connection *sql.Conn, dbPath string) error {
	tx, err := connection.BeginTx(ctx, nil)
	if err != nil {
		return databaseError("begin conversation schema initialization", dbPath, err)
	}
	for _, statement := range splitSQLStatements(schemaV1SQL) {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			rollbackErr := tx.Rollback()
			if rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
				err = errors.Join(err, rollbackErr)
			}
			return databaseError("initialize conversation database schema", dbPath, err)
		}
	}
	setVersion := fmt.Sprintf("PRAGMA user_version = %d", conversationStoreVersion)
	if _, err := tx.ExecContext(ctx, setVersion); err != nil {
		rollbackErr := tx.Rollback()
		if rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
			err = errors.Join(err, rollbackErr)
		}
		return databaseError("write conversation database schema version", dbPath, err)
	}
	if err := tx.Commit(); err != nil {
		return databaseError("commit conversation database schema", dbPath, err)
	}
	return nil
}

func validateSchemaV1(ctx context.Context, connection *sql.Conn, dbPath string) error {
	rows, err := connection.QueryContext(ctx, `
SELECT type, name
FROM sqlite_schema
WHERE type IN ('index', 'table')
`)
	if err != nil {
		return databaseError("read conversation database schema", dbPath, err)
	}
	found := make(map[string]string, len(schemaV1Tables)+len(schemaV1Indexes))
	for rows.Next() {
		var objectType string
		var name string
		if err := rows.Scan(&objectType, &name); err != nil {
			_ = rows.Close()
			return databaseError("decode conversation database schema", dbPath, err)
		}
		found[name] = objectType
	}
	if err := rows.Close(); err != nil {
		return databaseError("close conversation database schema rows", dbPath, err)
	}
	if err := rows.Err(); err != nil {
		return databaseError("read conversation database schema rows", dbPath, err)
	}
	missing := make([]string, 0, len(schemaV1Tables)+len(schemaV1Indexes))
	for _, table := range schemaV1Tables {
		if found[table] != "table" {
			missing = append(missing, "table "+table)
		}
	}
	for _, index := range schemaV1Indexes {
		if found[index] != "index" {
			missing = append(missing, "index "+index)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		return &CorruptStateError{Path: dbPath, Err: fmt.Errorf("schema version 1 is missing objects: %s", strings.Join(missing, ", "))}
	}
	return nil
}

func hasUserSchema(ctx context.Context, connection *sql.Conn, dbPath string) (bool, error) {
	var name string
	err := connection.QueryRowContext(ctx, `
SELECT name
FROM sqlite_schema
WHERE name NOT LIKE 'sqlite_%'
LIMIT 1
`).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, databaseError("inspect unversioned conversation database", dbPath, err)
	}
	return true, nil
}

func checkDatabaseIntegrity(ctx context.Context, connection *sql.Conn, dbPath string) error {
	rows, err := connection.QueryContext(ctx, "PRAGMA quick_check")
	if err != nil {
		return databaseError("check conversation database integrity", dbPath, err)
	}
	problems := make([]string, 0)
	for rows.Next() {
		var result string
		if err := rows.Scan(&result); err != nil {
			_ = rows.Close()
			return databaseError("decode conversation database integrity result", dbPath, err)
		}
		if result != "ok" {
			problems = append(problems, result)
		}
	}
	if err := rows.Close(); err != nil {
		return databaseError("close conversation database integrity rows", dbPath, err)
	}
	if err := rows.Err(); err != nil {
		return databaseError("read conversation database integrity result", dbPath, err)
	}
	if len(problems) > 0 {
		return &CorruptStateError{Path: dbPath, Err: fmt.Errorf("SQLite quick_check failed: %s", strings.Join(problems, "; "))}
	}
	return nil
}

func checkForeignKeys(ctx context.Context, connection *sql.Conn, dbPath string) error {
	rows, err := connection.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		return databaseError("check conversation database foreign keys", dbPath, err)
	}
	defer rows.Close()
	if rows.Next() {
		var table string
		var rowID sql.NullInt64
		var parent string
		var foreignKeyID int
		if err := rows.Scan(&table, &rowID, &parent, &foreignKeyID); err != nil {
			return databaseError("decode conversation database foreign key failure", dbPath, err)
		}
		return &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("foreign key check failed for table %s row %v parent %s constraint %d", table, rowID, parent, foreignKeyID),
		}
	}
	if err := rows.Err(); err != nil {
		return databaseError("read conversation database foreign key check", dbPath, err)
	}
	return nil
}

func splitSQLStatements(sqlText string) []string {
	rawStatements := strings.Split(sqlText, ";")
	statements := make([]string, 0, len(rawStatements))
	for _, raw := range rawStatements {
		statement := strings.TrimSpace(raw)
		if statement != "" {
			statements = append(statements, statement)
		}
	}
	return statements
}
