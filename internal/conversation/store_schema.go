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

type schemaObjectDefinition struct {
	objectType string
	sql        string
}

var schemaV1Objects map[string]schemaObjectDefinition

func init() {
	schemaV1Objects = mustParseSchemaObjectDefinitions(schemaV1SQL)
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
SELECT type, name, sql
FROM sqlite_schema
WHERE type IN ('index', 'table')
`)
	if err != nil {
		return databaseError("read conversation database schema", dbPath, err)
	}
	found := make(map[string]schemaObjectDefinition, len(schemaV1Objects))
	for rows.Next() {
		var objectType string
		var name string
		var definitionSQL sql.NullString
		if err := rows.Scan(&objectType, &name, &definitionSQL); err != nil {
			_ = rows.Close()
			return databaseError("decode conversation database schema", dbPath, err)
		}
		found[name] = schemaObjectDefinition{objectType: objectType, sql: normalizeSchemaSQL(definitionSQL.String)}
	}
	if err := rows.Close(); err != nil {
		return databaseError("close conversation database schema rows", dbPath, err)
	}
	if err := rows.Err(); err != nil {
		return databaseError("read conversation database schema rows", dbPath, err)
	}
	problems := make([]string, 0)
	for name, expected := range schemaV1Objects {
		actual, ok := found[name]
		if !ok || actual.objectType != expected.objectType {
			problems = append(problems, "missing "+expected.objectType+" "+name)
			continue
		}
		if actual.sql != expected.sql {
			problems = append(problems, "unexpected definition for "+expected.objectType+" "+name)
		}
	}
	if len(problems) > 0 {
		sort.Strings(problems)
		return &CorruptStateError{Path: dbPath, Err: fmt.Errorf("schema version 1 does not match its owner definition: %s", strings.Join(problems, ", "))}
	}
	return nil
}

func mustParseSchemaObjectDefinitions(sqlText string) map[string]schemaObjectDefinition {
	definitions := make(map[string]schemaObjectDefinition)
	for _, statement := range splitSQLStatements(sqlText) {
		name, definition, ok := parseSchemaObjectDefinition(statement)
		if !ok {
			panic(fmt.Sprintf("unsupported conversation schema statement: %s", statement))
		}
		if _, exists := definitions[name]; exists {
			panic("duplicate conversation schema object: " + name)
		}
		definitions[name] = definition
	}
	return definitions
}

func parseSchemaObjectDefinition(statement string) (string, schemaObjectDefinition, bool) {
	fields := strings.Fields(statement)
	var objectType string
	var name string
	switch {
	case hasSchemaPrefix(fields, "CREATE", "TABLE"):
		objectType = "table"
		name = fields[2]
	case hasSchemaPrefix(fields, "CREATE", "VIRTUAL", "TABLE"):
		objectType = "table"
		name = fields[3]
	case hasSchemaPrefix(fields, "CREATE", "INDEX"):
		objectType = "index"
		name = fields[2]
	case hasSchemaPrefix(fields, "CREATE", "UNIQUE", "INDEX"):
		objectType = "index"
		name = fields[3]
	default:
		return "", schemaObjectDefinition{}, false
	}
	return name, schemaObjectDefinition{objectType: objectType, sql: normalizeSchemaSQL(statement)}, true
}

func hasSchemaPrefix(fields []string, prefix ...string) bool {
	if len(fields) <= len(prefix) {
		return false
	}
	for index, expected := range prefix {
		if !strings.EqualFold(fields[index], expected) {
			return false
		}
	}
	return true
}

func normalizeSchemaSQL(sqlText string) string {
	return strings.Join(strings.Fields(sqlText), " ")
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
