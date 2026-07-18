package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestNewStoreBootstrapsIsolatedSchemaAndConfiguresEveryConnection(t *testing.T) {
	appDataDir := t.TempDir()
	busyTimeout := 137 * time.Millisecond
	store, err := NewStore(
		appDataDir,
		WithWriteQueueCapacity(7),
		WithReadPoolSize(3),
		WithBusyTimeout(busyTimeout),
	)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})

	wantPath := filepath.Join(appDataDir, conversationStateDirectoryName, conversationDatabaseName)
	if store.Path() != wantPath {
		t.Fatalf("Path() = %q, want %q", store.Path(), wantPath)
	}
	if _, err := os.Stat(wantPath); err != nil {
		t.Fatalf("stat conversation database: %v", err)
	}
	if got := cap(store.writes); got != 7 {
		t.Fatalf("write queue capacity = %d, want 7", got)
	}
	if got := len(store.readerConnections); got != 3 {
		t.Fatalf("reader connection count = %d, want 3", got)
	}
	if got := store.db.Stats().MaxOpenConnections; got != 4 {
		t.Fatalf("max open connections = %d, want 4", got)
	}

	assertConnectionPragmas(t, store.writer, busyTimeout, false)
	for index, reader := range store.readerConnections {
		t.Run(fmt.Sprintf("reader-%d", index+1), func(t *testing.T) {
			assertConnectionPragmas(t, reader, busyTimeout, true)
		})
	}

	var version int
	if err := store.writer.QueryRowContext(context.Background(), "PRAGMA user_version").Scan(&version); err != nil {
		t.Fatalf("read user_version: %v", err)
	}
	if version != conversationStoreVersion {
		t.Fatalf("user_version = %d, want %d", version, conversationStoreVersion)
	}
	assertSchemaTables(t, store)

	err = store.read(context.Background(), "attempt write through read pool", func(ctx context.Context, reader *sql.Conn) error {
		_, err := reader.ExecContext(ctx, `
INSERT INTO committed_events(id, stream_id, stream_sequence, kind, payload_json, committed_at)
VALUES ('read-write', 'test', 1, 'test', '{}', '2026-07-11T00:00:00Z')
`)
		return err
	})
	if err == nil || !IsPersistenceError(err) {
		t.Fatalf("query-only reader write error = %v, want PersistenceError", err)
	}
	if got := countRows(t, store, "committed_events"); got != 0 {
		t.Fatalf("committed event count after reader write = %d, want 0", got)
	}
}

func TestNewStoreBootstrapsTypedArtifactSchemaInFreshNamespace(t *testing.T) {
	appDataDir := t.TempDir()
	legacyDBPath := filepath.Join(
		appDataDir,
		"topic-conversations-v2",
		conversationDatabaseName,
	)
	if err := os.MkdirAll(filepath.Dir(legacyDBPath), 0o755); err != nil {
		t.Fatalf("create legacy namespace: %v", err)
	}
	if err := os.WriteFile(legacyDBPath, []byte("legacy incompatible conversation store"), 0o600); err != nil {
		t.Fatalf("write legacy conversation store: %v", err)
	}

	store, err := NewStore(appDataDir, WithReadPoolSize(1))
	if err != nil {
		t.Fatalf("NewStore with legacy namespace present: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})

	wantPath := filepath.Join(appDataDir, conversationStateDirectoryName, conversationDatabaseName)
	if store.Path() != wantPath {
		t.Fatalf("Path() = %q, want %q", store.Path(), wantPath)
	}
	if store.Path() == legacyDBPath {
		t.Fatalf("store opened legacy namespace %q", legacyDBPath)
	}
	if _, err := os.Stat(legacyDBPath); err != nil {
		t.Fatalf("legacy conversation store should remain untouched: %v", err)
	}
}

func TestNewStoreValidatesLocationAndConcurrencyOptions(t *testing.T) {
	tests := []struct {
		name       string
		appDataDir string
		option     StoreOption
	}{
		{name: "empty path", appDataDir: ""},
		{name: "relative path", appDataDir: "relative"},
		{name: "zero write queue", appDataDir: t.TempDir(), option: WithWriteQueueCapacity(0)},
		{name: "zero read pool", appDataDir: t.TempDir(), option: WithReadPoolSize(0)},
		{name: "sub-millisecond busy timeout", appDataDir: t.TempDir(), option: WithBusyTimeout(time.Microsecond)},
		{name: "nil option", appDataDir: t.TempDir(), option: nil},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			options := []StoreOption{}
			if test.name == "nil option" || test.option != nil {
				options = append(options, test.option)
			}
			store, err := NewStore(test.appDataDir, options...)
			if err == nil {
				_ = store.Close()
				t.Fatal("NewStore succeeded, want validation error")
			}
		})
	}
}

func TestNewStoreRejectsUnsupportedIncompleteAndMalformedDatabases(t *testing.T) {
	tests := []struct {
		name    string
		prepare func(*testing.T, string)
	}{
		{
			name: "unsupported version",
			prepare: func(t *testing.T, path string) {
				withRawDatabase(t, path, func(db *sql.DB) {
					if _, err := db.Exec("PRAGMA user_version = 2"); err != nil {
						t.Fatalf("set unsupported user_version: %v", err)
					}
				})
			},
		},
		{
			name: "nonempty unversioned schema",
			prepare: func(t *testing.T, path string) {
				withRawDatabase(t, path, func(db *sql.DB) {
					if _, err := db.Exec("CREATE TABLE legacy_state(id TEXT PRIMARY KEY)"); err != nil {
						t.Fatalf("create unversioned legacy table: %v", err)
					}
				})
			},
		},
		{
			name: "incomplete version one schema",
			prepare: func(t *testing.T, path string) {
				withRawDatabase(t, path, func(db *sql.DB) {
					if _, err := db.Exec("PRAGMA user_version = 1"); err != nil {
						t.Fatalf("set version one: %v", err)
					}
				})
			},
		},
		{
			name: "wrong version one table definition",
			prepare: func(t *testing.T, path string) {
				withRawDatabase(t, path, func(db *sql.DB) {
					for _, statement := range splitSQLStatements(schemaV1SQL) {
						if _, err := db.Exec(statement); err != nil {
							t.Fatalf("create version one schema fixture: %v", err)
						}
					}
					if _, err := db.Exec("DROP TABLE conversations"); err != nil {
						t.Fatalf("drop conversations table: %v", err)
					}
					if _, err := db.Exec("CREATE TABLE conversations(id TEXT PRIMARY KEY) STRICT"); err != nil {
						t.Fatalf("create malformed conversations table: %v", err)
					}
					if _, err := db.Exec("PRAGMA user_version = 1"); err != nil {
						t.Fatalf("set version one: %v", err)
					}
				})
			},
		},
		{
			name: "malformed sqlite file",
			prepare: func(t *testing.T, path string) {
				if err := os.WriteFile(path, []byte("not a sqlite database"), 0o600); err != nil {
					t.Fatalf("write malformed database: %v", err)
				}
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			appDataDir := t.TempDir()
			stateDir := filepath.Join(appDataDir, conversationStateDirectoryName)
			if err := os.MkdirAll(stateDir, 0o755); err != nil {
				t.Fatalf("create state directory: %v", err)
			}
			test.prepare(t, filepath.Join(stateDir, conversationDatabaseName))
			store, err := NewStore(appDataDir, WithReadPoolSize(1))
			if err == nil {
				_ = store.Close()
				t.Fatal("NewStore succeeded, want corruption error")
			}
			if !IsCorruptStateError(err) {
				t.Fatalf("NewStore error = %T %v, want CorruptStateError", err, err)
			}
		})
	}
}

func TestCorruptCommittedRecordIsRejectedAfterRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir, WithReadPoolSize(1))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	appendTestOutboxEvents(t, store, []CommittedEventDraft{
		transactionTestEventDraft(
			"event-before-corruption",
			"conversation:corrupt",
			map[string]string{"state": "valid"},
		),
	})
	path := store.Path()
	if err := store.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	withRawDatabase(t, path, func(db *sql.DB) {
		if _, err := db.Exec(`UPDATE committed_events SET payload_json = 'null'`); err != nil {
			t.Fatalf("corrupt committed event: %v", err)
		}
	})

	reopened, err := NewStore(appDataDir, WithReadPoolSize(1))
	if err != nil {
		t.Fatalf("reopen structurally valid store: %v", err)
	}
	t.Cleanup(func() {
		if err := reopened.Close(); err != nil {
			t.Errorf("close reopened store: %v", err)
		}
	})
	_, err = reopened.ReadCommittedEvents(context.Background(), CommittedEventCursor{}, 10)
	if err == nil || !IsCorruptStateError(err) {
		t.Fatalf("corrupt committed event read error = %T %v, want CorruptStateError", err, err)
	}
}

func TestRoleProfileOverrideSchemaSupportsEveryResolutionScope(t *testing.T) {
	store := newTestStore(t)
	err := store.write(context.Background(), "insert role profile override scopes", func(ctx context.Context, tx *sql.Tx) error {
		for _, scope := range []struct {
			kind string
			id   string
		}{
			{kind: "global", id: ""},
			{kind: "workspace", id: "workspace-1"},
			{kind: "conversation", id: "conversation-1"},
		} {
			if _, err := tx.ExecContext(ctx, `
INSERT INTO role_profile_overrides(scope_kind, scope_id, role, provider, profile_json, updated_at)
VALUES (?, ?, 'narrator', 'codex', '{}', '2026-07-11T00:00:00Z')
`, scope.kind, scope.id); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("insert valid override scopes: %v", err)
	}
	if got := countRows(t, store, "role_profile_overrides"); got != 3 {
		t.Fatalf("role override count = %d, want 3", got)
	}

	err = store.write(context.Background(), "reject empty workspace override scope", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
INSERT INTO role_profile_overrides(scope_kind, scope_id, role, provider, profile_json, updated_at)
VALUES ('workspace', '', 'agent', 'codex', '{}', '2026-07-11T00:00:00Z')
`)
		return err
	})
	if err == nil || !IsPersistenceError(err) {
		t.Fatalf("empty workspace override scope error = %v, want PersistenceError", err)
	}
}

func TestWriteTransactionCommitsOrRollsBackAsAUnit(t *testing.T) {
	store := newTestStore(t)
	sentinel := errors.New("reject transaction")
	err := store.write(context.Background(), "rollback conversation and event", func(ctx context.Context, tx *sql.Tx) error {
		if err := insertTestConversation(ctx, tx, "rollback-conversation"); err != nil {
			return err
		}
		if err := insertCommittedEvent(ctx, tx, "rollback-event", "rollback-stream"); err != nil {
			return err
		}
		return sentinel
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("rollback write error = %v, want sentinel", err)
	}
	if got := countRows(t, store, "conversations"); got != 0 {
		t.Fatalf("conversation count after rollback = %d, want 0", got)
	}
	if got := countRows(t, store, "committed_events"); got != 0 {
		t.Fatalf("committed event count after rollback = %d, want 0", got)
	}

	err = store.write(context.Background(), "commit conversation and event", func(ctx context.Context, tx *sql.Tx) error {
		if err := insertTestConversation(ctx, tx, "committed-conversation"); err != nil {
			return err
		}
		return insertCommittedEvent(ctx, tx, "committed-event", "committed-stream")
	})
	if err != nil {
		t.Fatalf("commit write: %v", err)
	}
	if got := countRows(t, store, "conversations"); got != 1 {
		t.Fatalf("conversation count after commit = %d, want 1", got)
	}
	if got := countRows(t, store, "committed_events"); got != 1 {
		t.Fatalf("committed event count after commit = %d, want 1", got)
	}
}

func TestConcurrentActorWritesSerializeWithoutSQLiteBusy(t *testing.T) {
	const actorCount = 96
	store, err := NewStore(t.TempDir(), WithWriteQueueCapacity(actorCount), WithReadPoolSize(3))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	start := make(chan struct{})
	errorsFound := make(chan error, actorCount)
	var actors sync.WaitGroup
	for actor := range actorCount {
		actors.Add(1)
		go func() {
			defer actors.Done()
			<-start
			id := fmt.Sprintf("actor-%03d", actor)
			errorsFound <- store.write(ctx, "append actor event", func(ctx context.Context, tx *sql.Tx) error {
				return insertCommittedEvent(ctx, tx, id, id)
			})
		}()
	}
	close(start)
	actors.Wait()
	close(errorsFound)
	for err := range errorsFound {
		if err != nil {
			t.Errorf("concurrent write: %v", err)
		}
	}
	if t.Failed() {
		t.FailNow()
	}
	if got := countRows(t, store, "committed_events"); got != actorCount {
		t.Fatalf("committed event count = %d, want %d", got, actorCount)
	}
}

func TestWriteAdmissionReportsCancellationAndSaturation(t *testing.T) {
	store, err := NewStore(t.TempDir(), WithWriteQueueCapacity(1), WithReadPoolSize(1))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})

	cancelledContext, cancelImmediately := context.WithCancel(context.Background())
	cancelImmediately()
	_, err = store.enqueueWrite(cancelledContext, "cancel before admission", noOpWrite)
	assertWriteOutcome(t, err, WriteOutcomeCancelled)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled admission error = %v, want context.Canceled", err)
	}

	blocker := acquireExternalWriteLock(t, store.Path())
	firstStarted := make(chan struct{})
	firstResult, err := store.enqueueWrite(context.Background(), "blocked first write", func(ctx context.Context, tx *sql.Tx) error {
		close(firstStarted)
		return insertCommittedEvent(ctx, tx, "first", "first")
	})
	if err != nil {
		t.Fatalf("enqueue first write: %v", err)
	}
	<-firstStarted

	queuedContext, cancelQueued := context.WithCancel(context.Background())
	var queuedCallbackRan atomic.Bool
	queuedResult, err := store.enqueueWrite(queuedContext, "cancel accepted write", func(context.Context, *sql.Tx) error {
		queuedCallbackRan.Store(true)
		return nil
	})
	if err != nil {
		t.Fatalf("enqueue cancellable write: %v", err)
	}
	_, err = store.enqueueWrite(context.Background(), "saturated write", noOpWrite)
	assertWriteOutcome(t, err, WriteOutcomeSaturated)

	cancelQueued()
	blocker.Release(t)
	if err := receiveWriteResult(t, firstResult); err != nil {
		t.Fatalf("first write result: %v", err)
	}
	queuedErr := receiveWriteResult(t, queuedResult)
	assertWriteOutcome(t, queuedErr, WriteOutcomeCancelled)
	if !errors.Is(queuedErr, context.Canceled) {
		t.Fatalf("accepted cancellation error = %v, want context.Canceled", queuedErr)
	}
	if queuedCallbackRan.Load() {
		t.Fatal("callback ran after its accepted write context was cancelled")
	}
	if got := countRows(t, store, "committed_events"); got != 1 {
		t.Fatalf("committed event count = %d, want 1", got)
	}
}

func TestCloseDrainsAcceptedWritesAndRejectsNewWork(t *testing.T) {
	appDataDir := t.TempDir()
	store, err := NewStore(appDataDir, WithWriteQueueCapacity(2), WithReadPoolSize(1))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	blocker := acquireExternalWriteLock(t, store.Path())
	firstStarted := make(chan struct{})
	firstResult, err := store.enqueueWrite(context.Background(), "drain first write", func(ctx context.Context, tx *sql.Tx) error {
		close(firstStarted)
		return insertCommittedEvent(ctx, tx, "drain-first", "drain-first")
	})
	if err != nil {
		t.Fatalf("enqueue first write: %v", err)
	}
	<-firstStarted
	secondResult, err := store.enqueueWrite(context.Background(), "drain second write", func(ctx context.Context, tx *sql.Tx) error {
		return insertCommittedEvent(ctx, tx, "drain-second", "drain-second")
	})
	if err != nil {
		t.Fatalf("enqueue second write: %v", err)
	}

	closeResult := make(chan error, 1)
	go func() {
		closeResult <- store.Close()
	}()
	<-store.closing
	_, err = store.enqueueWrite(context.Background(), "write during shutdown", noOpWrite)
	assertWriteOutcome(t, err, WriteOutcomeStoreClosed)
	if !errors.Is(err, ErrStoreClosed) {
		t.Fatalf("shutdown admission error = %v, want ErrStoreClosed", err)
	}
	select {
	case err := <-closeResult:
		t.Fatalf("Close returned before accepted writes drained: %v", err)
	default:
	}

	blocker.Release(t)
	if err := receiveWriteResult(t, firstResult); err != nil {
		t.Fatalf("first drained write: %v", err)
	}
	if err := receiveWriteResult(t, secondResult); err != nil {
		t.Fatalf("second drained write: %v", err)
	}
	if err := <-closeResult; err != nil {
		t.Fatalf("Close: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("second Close: %v", err)
	}

	reopened, err := NewStore(appDataDir, WithReadPoolSize(1))
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	t.Cleanup(func() {
		if err := reopened.Close(); err != nil {
			t.Errorf("close reopened store: %v", err)
		}
	})
	if got := countRows(t, reopened, "committed_events"); got != 2 {
		t.Fatalf("committed event count after restart = %d, want 2", got)
	}
}

func TestReadPoolIsBoundedAndContextAware(t *testing.T) {
	store, err := NewStore(t.TempDir(), WithReadPoolSize(1))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})

	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	firstResult := make(chan error, 1)
	go func() {
		firstResult <- store.read(context.Background(), "hold one reader", func(context.Context, *sql.Conn) error {
			close(firstStarted)
			<-releaseFirst
			return nil
		})
	}()
	<-firstStarted

	queuedContext, cancelQueued := context.WithCancel(context.Background())
	queuedResult := make(chan error, 1)
	go func() {
		queuedResult <- store.read(queuedContext, "wait for reader", func(context.Context, *sql.Conn) error {
			return errors.New("queued reader callback must not run")
		})
	}()
	cancelQueued()
	if err := <-queuedResult; !errors.Is(err, context.Canceled) {
		t.Fatalf("queued read error = %v, want context.Canceled", err)
	}
	close(releaseFirst)
	if err := <-firstResult; err != nil {
		t.Fatalf("first read: %v", err)
	}
}

func assertConnectionPragmas(t *testing.T, connection *sql.Conn, busyTimeout time.Duration, queryOnly bool) {
	t.Helper()
	ctx := context.Background()
	var foreignKeys int
	if err := connection.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&foreignKeys); err != nil {
		t.Fatalf("read foreign_keys: %v", err)
	}
	if foreignKeys != 1 {
		t.Fatalf("foreign_keys = %d, want 1", foreignKeys)
	}
	var actualBusyTimeout int64
	if err := connection.QueryRowContext(ctx, "PRAGMA busy_timeout").Scan(&actualBusyTimeout); err != nil {
		t.Fatalf("read busy_timeout: %v", err)
	}
	if actualBusyTimeout != busyTimeout.Milliseconds() {
		t.Fatalf("busy_timeout = %d, want %d", actualBusyTimeout, busyTimeout.Milliseconds())
	}
	var journalMode string
	if err := connection.QueryRowContext(ctx, "PRAGMA journal_mode").Scan(&journalMode); err != nil {
		t.Fatalf("read journal_mode: %v", err)
	}
	if journalMode != "wal" {
		t.Fatalf("journal_mode = %q, want wal", journalMode)
	}
	var synchronous int
	if err := connection.QueryRowContext(ctx, "PRAGMA synchronous").Scan(&synchronous); err != nil {
		t.Fatalf("read synchronous: %v", err)
	}
	if synchronous != 1 {
		t.Fatalf("synchronous = %d, want 1", synchronous)
	}
	var actualQueryOnly int
	if err := connection.QueryRowContext(ctx, "PRAGMA query_only").Scan(&actualQueryOnly); err != nil {
		t.Fatalf("read query_only: %v", err)
	}
	wantQueryOnly := 0
	if queryOnly {
		wantQueryOnly = 1
	}
	if actualQueryOnly != wantQueryOnly {
		t.Fatalf("query_only = %d, want %d", actualQueryOnly, wantQueryOnly)
	}
}

func assertSchemaTables(t *testing.T, store *Store) {
	t.Helper()
	rows, err := store.writer.QueryContext(context.Background(), `
SELECT type, name
FROM sqlite_schema
WHERE type IN ('index', 'table')
`)
	if err != nil {
		t.Fatalf("read schema tables: %v", err)
	}
	defer rows.Close()
	found := make(map[string]string)
	for rows.Next() {
		var objectType string
		var name string
		if err := rows.Scan(&objectType, &name); err != nil {
			t.Fatalf("scan schema table: %v", err)
		}
		found[name] = objectType
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate schema tables: %v", err)
	}
	for name, definition := range schemaV1Objects {
		if found[name] != definition.objectType {
			t.Errorf("schema %s %q was not created", definition.objectType, name)
		}
	}
}

func newTestStore(t *testing.T, options ...StoreOption) *Store {
	t.Helper()
	store, err := NewStore(t.TempDir(), options...)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})
	return store
}

func countRows(t *testing.T, store *Store, table string) int {
	t.Helper()
	_, allowed := schemaV1Objects[table]
	if !allowed {
		t.Fatalf("test requested count from unexpected table %q", table)
	}
	var count int
	err := store.read(context.Background(), "count test rows", func(ctx context.Context, reader *sql.Conn) error {
		return reader.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&count)
	})
	if err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	return count
}

type sqlExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func insertTestConversation(ctx context.Context, executor sqlExecutor, id string) error {
	_, err := executor.ExecContext(ctx, `
INSERT INTO conversations(id, workspace_id, title, status, created_at, updated_at)
VALUES (?, 'workspace', 'Test conversation', 'idle', '2026-07-11T00:00:00Z', '2026-07-11T00:00:00Z')
`, id)
	return err
}

func insertCommittedEvent(ctx context.Context, executor sqlExecutor, id string, streamID string) error {
	_, err := executor.ExecContext(ctx, `
INSERT INTO committed_events(id, stream_id, stream_sequence, kind, payload_json, committed_at)
VALUES (?, ?, 1, 'test', '{}', '2026-07-11T00:00:00Z')
`, id, streamID)
	return err
}

func noOpWrite(context.Context, *sql.Tx) error {
	return nil
}

func assertWriteOutcome(t *testing.T, err error, outcome WriteOutcome) {
	t.Helper()
	if !IsWriteOutcome(err, outcome) {
		t.Fatalf("write error = %T %v, want outcome %q", err, err, outcome)
	}
}

func receiveWriteResult(t *testing.T, result <-chan error) error {
	t.Helper()
	select {
	case err := <-result:
		return err
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for write result")
		return nil
	}
}

type externalWriteLock struct {
	db         *sql.DB
	connection *sql.Conn
	released   bool
}

func acquireExternalWriteLock(t *testing.T, path string) *externalWriteLock {
	t.Helper()
	db, err := sql.Open(sqliteDriverName, path)
	if err != nil {
		t.Fatalf("open external lock database: %v", err)
	}
	db.SetMaxOpenConns(1)
	connection, err := db.Conn(context.Background())
	if err != nil {
		_ = db.Close()
		t.Fatalf("open external lock connection: %v", err)
	}
	if _, err := connection.ExecContext(context.Background(), "PRAGMA busy_timeout = 5000"); err != nil {
		_ = connection.Close()
		_ = db.Close()
		t.Fatalf("configure external lock connection: %v", err)
	}
	if _, err := connection.ExecContext(context.Background(), "BEGIN IMMEDIATE"); err != nil {
		_ = connection.Close()
		_ = db.Close()
		t.Fatalf("acquire external write lock: %v", err)
	}
	lock := &externalWriteLock{db: db, connection: connection}
	t.Cleanup(func() {
		if !lock.released {
			lock.Release(t)
		}
	})
	return lock
}

func (lock *externalWriteLock) Release(t *testing.T) {
	t.Helper()
	if lock.released {
		return
	}
	if _, err := lock.connection.ExecContext(context.Background(), "ROLLBACK"); err != nil {
		t.Errorf("release external write lock: %v", err)
	}
	if err := lock.connection.Close(); err != nil {
		t.Errorf("close external lock connection: %v", err)
	}
	if err := lock.db.Close(); err != nil {
		t.Errorf("close external lock database: %v", err)
	}
	lock.released = true
}

func withRawDatabase(t *testing.T, path string, run func(*sql.DB)) {
	t.Helper()
	db, err := sql.Open(sqliteDriverName, path)
	if err != nil {
		t.Fatalf("open raw database: %v", err)
	}
	run(db)
	if err := db.Close(); err != nil {
		t.Fatalf("close raw database: %v", err)
	}
}
