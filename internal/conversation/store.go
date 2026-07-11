package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	sqlite "modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

const (
	conversationStateDirectoryName = "topic-conversations"
	conversationDatabaseName       = "conversations.sqlite"
	conversationStoreVersion       = 1

	defaultWriteQueueCapacity = 64
	defaultReadPoolSize       = 4
	defaultBusyTimeout        = 5 * time.Second
	sqliteDriverName          = "sqlite"
)

var ErrStoreClosed = errors.New("conversation store is closing or closed")

type WriteOutcome string

const (
	WriteOutcomeCancelled   WriteOutcome = "cancelled"
	WriteOutcomeSaturated   WriteOutcome = "saturated"
	WriteOutcomeStoreClosed WriteOutcome = "store_closed"
)

type PersistenceError struct {
	Operation string
	Path      string
	Err       error
}

type CorruptStateError struct {
	Path string
	Err  error
}

type WriteOutcomeError struct {
	Operation string
	Outcome   WriteOutcome
	Err       error
}

type StoreOption func(*storeConfig) error

type storeConfig struct {
	writeQueueCapacity int
	readPoolSize       int
	busyTimeout        time.Duration
}

type storeState uint8

const (
	storeStateOpen storeState = iota
	storeStateClosing
	storeStateClosed
)

type writeRequest struct {
	ctx       context.Context
	operation string
	run       func(context.Context, *sql.Tx) error
	result    chan error
}

type Store struct {
	dbPath string
	db     *sql.DB

	writer            *sql.Conn
	readerConnections []*sql.Conn
	readers           chan *sql.Conn
	writes            chan writeRequest
	writerDone        chan struct{}
	closing           chan struct{}
	closed            chan struct{}

	admissionMu sync.Mutex
	state       storeState
	readersWG   sync.WaitGroup
	closeErr    error
}

func WithWriteQueueCapacity(capacity int) StoreOption {
	return func(config *storeConfig) error {
		if capacity <= 0 {
			return fmt.Errorf("write queue capacity must be positive: %d", capacity)
		}
		config.writeQueueCapacity = capacity
		return nil
	}
}

func WithReadPoolSize(size int) StoreOption {
	return func(config *storeConfig) error {
		if size <= 0 {
			return fmt.Errorf("read pool size must be positive: %d", size)
		}
		config.readPoolSize = size
		return nil
	}
}

func WithBusyTimeout(timeout time.Duration) StoreOption {
	return func(config *storeConfig) error {
		if timeout < time.Millisecond || timeout%time.Millisecond != 0 {
			return fmt.Errorf("busy timeout must be a positive whole number of milliseconds: %s", timeout)
		}
		config.busyTimeout = timeout
		return nil
	}
}

func (err *PersistenceError) Error() string {
	return fmt.Sprintf("%s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *PersistenceError) Unwrap() error {
	return err.Err
}

func (err *CorruptStateError) Error() string {
	return fmt.Sprintf("malformed conversation state %s: %v", err.Path, err.Err)
}

func (err *CorruptStateError) Unwrap() error {
	return err.Err
}

func (err *WriteOutcomeError) Error() string {
	if err.Err == nil {
		return fmt.Sprintf("conversation write %s: %s", err.Operation, err.Outcome)
	}
	return fmt.Sprintf("conversation write %s: %s: %v", err.Operation, err.Outcome, err.Err)
}

func (err *WriteOutcomeError) Unwrap() error {
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

func IsWriteOutcome(err error, outcome WriteOutcome) bool {
	var outcomeError *WriteOutcomeError
	return errors.As(err, &outcomeError) && outcomeError.Outcome == outcome
}

func NewStore(appDataDir string, options ...StoreOption) (*Store, error) {
	if appDataDir == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	config := storeConfig{
		writeQueueCapacity: defaultWriteQueueCapacity,
		readPoolSize:       defaultReadPoolSize,
		busyTimeout:        defaultBusyTimeout,
	}
	for _, option := range options {
		if option == nil {
			return nil, errors.New("conversation store option must not be nil")
		}
		if err := option(&config); err != nil {
			return nil, err
		}
	}

	stateDir := filepath.Join(filepath.Clean(appDataDir), conversationStateDirectoryName)
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		return nil, &PersistenceError{Operation: "create conversation database directory", Path: stateDir, Err: err}
	}
	dbPath := filepath.Join(stateDir, conversationDatabaseName)
	db, err := sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		return nil, databaseError("open conversation database", dbPath, err)
	}
	connectionCount := config.readPoolSize + 1
	db.SetMaxOpenConns(connectionCount)
	db.SetMaxIdleConns(connectionCount)

	store := &Store{
		dbPath:     dbPath,
		db:         db,
		readers:    make(chan *sql.Conn, config.readPoolSize),
		writes:     make(chan writeRequest, config.writeQueueCapacity),
		writerDone: make(chan struct{}),
		closing:    make(chan struct{}),
		closed:     make(chan struct{}),
		state:      storeStateOpen,
	}
	if err := store.openConnections(context.Background(), config); err != nil {
		if closeErr := store.closeConnections(); closeErr != nil {
			err = errors.Join(err, closeErr)
		}
		return nil, err
	}
	go store.runWriter()
	return store, nil
}

func (store *Store) Path() string {
	if store == nil {
		return ""
	}
	return store.dbPath
}

func (store *Store) Close() error {
	if store == nil {
		return nil
	}
	store.admissionMu.Lock()
	switch store.state {
	case storeStateOpen:
		store.state = storeStateClosing
		close(store.closing)
		close(store.writes)
		store.admissionMu.Unlock()
	case storeStateClosing, storeStateClosed:
		closed := store.closed
		store.admissionMu.Unlock()
		<-closed
		return store.closeErr
	default:
		store.admissionMu.Unlock()
		return errors.New("conversation store has an invalid lifecycle state")
	}

	<-store.writerDone
	store.readersWG.Wait()
	closeErr := store.closeConnections()

	store.admissionMu.Lock()
	store.closeErr = closeErr
	store.state = storeStateClosed
	close(store.closed)
	store.admissionMu.Unlock()
	return closeErr
}

func (store *Store) openConnections(ctx context.Context, config storeConfig) error {
	writer, err := store.db.Conn(ctx)
	if err != nil {
		return databaseError("open conversation writer connection", store.dbPath, err)
	}
	store.writer = writer
	if err := configureWriterConnection(ctx, writer, config.busyTimeout, store.dbPath); err != nil {
		return err
	}
	if err := initializeSchema(ctx, writer, store.dbPath); err != nil {
		return err
	}

	for range config.readPoolSize {
		reader, err := store.db.Conn(ctx)
		if err != nil {
			return databaseError("open conversation reader connection", store.dbPath, err)
		}
		store.readerConnections = append(store.readerConnections, reader)
		if err := configureReaderConnection(ctx, reader, config.busyTimeout, store.dbPath); err != nil {
			return err
		}
		store.readers <- reader
	}
	return nil
}

func configureWriterConnection(ctx context.Context, connection *sql.Conn, busyTimeout time.Duration, dbPath string) error {
	if err := applyConnectionPragma(ctx, connection, "foreign_keys", "ON", dbPath); err != nil {
		return err
	}
	if err := applyConnectionPragma(ctx, connection, "busy_timeout", busyTimeout.Milliseconds(), dbPath); err != nil {
		return err
	}
	if err := applyConnectionPragma(ctx, connection, "synchronous", "NORMAL", dbPath); err != nil {
		return err
	}
	var journalMode string
	if err := connection.QueryRowContext(ctx, "PRAGMA journal_mode = WAL").Scan(&journalMode); err != nil {
		return databaseError("enable conversation database WAL mode", dbPath, err)
	}
	if !strings.EqualFold(journalMode, "wal") {
		return &PersistenceError{Operation: "enable conversation database WAL mode", Path: dbPath, Err: fmt.Errorf("journal_mode resolved to %q", journalMode)}
	}
	return verifyConnectionPragmas(ctx, connection, busyTimeout, false, dbPath)
}

func configureReaderConnection(ctx context.Context, connection *sql.Conn, busyTimeout time.Duration, dbPath string) error {
	if err := applyConnectionPragma(ctx, connection, "foreign_keys", "ON", dbPath); err != nil {
		return err
	}
	if err := applyConnectionPragma(ctx, connection, "busy_timeout", busyTimeout.Milliseconds(), dbPath); err != nil {
		return err
	}
	if err := applyConnectionPragma(ctx, connection, "synchronous", "NORMAL", dbPath); err != nil {
		return err
	}
	if err := applyConnectionPragma(ctx, connection, "query_only", "ON", dbPath); err != nil {
		return err
	}
	return verifyConnectionPragmas(ctx, connection, busyTimeout, true, dbPath)
}

func applyConnectionPragma(ctx context.Context, connection *sql.Conn, name string, value any, dbPath string) error {
	if _, err := connection.ExecContext(ctx, fmt.Sprintf("PRAGMA %s = %v", name, value)); err != nil {
		return databaseError("configure conversation database connection", dbPath, err)
	}
	return nil
}

func verifyConnectionPragmas(ctx context.Context, connection *sql.Conn, busyTimeout time.Duration, queryOnly bool, dbPath string) error {
	if err := verifyIntegerPragma(ctx, connection, "foreign_keys", 1, dbPath); err != nil {
		return err
	}
	if err := verifyIntegerPragma(ctx, connection, "busy_timeout", busyTimeout.Milliseconds(), dbPath); err != nil {
		return err
	}
	if err := verifyTextPragma(ctx, connection, "journal_mode", "wal", dbPath); err != nil {
		return err
	}
	if err := verifyIntegerPragma(ctx, connection, "synchronous", 1, dbPath); err != nil {
		return err
	}
	wantQueryOnly := 0
	if queryOnly {
		wantQueryOnly = 1
	}
	return verifyIntegerPragma(ctx, connection, "query_only", int64(wantQueryOnly), dbPath)
}

func verifyIntegerPragma(ctx context.Context, connection *sql.Conn, name string, expected int64, dbPath string) error {
	var actual int64
	if err := connection.QueryRowContext(ctx, "PRAGMA "+name).Scan(&actual); err != nil {
		return databaseError("verify conversation database "+name, dbPath, err)
	}
	if actual != expected {
		return pragmaMismatchError(dbPath, name, expected, actual)
	}
	return nil
}

func verifyTextPragma(ctx context.Context, connection *sql.Conn, name string, expected string, dbPath string) error {
	var actual string
	if err := connection.QueryRowContext(ctx, "PRAGMA "+name).Scan(&actual); err != nil {
		return databaseError("verify conversation database "+name, dbPath, err)
	}
	if !strings.EqualFold(actual, expected) {
		return pragmaMismatchError(dbPath, name, expected, actual)
	}
	return nil
}

func pragmaMismatchError(dbPath string, pragma string, expected any, actual any) error {
	return &PersistenceError{
		Operation: "verify conversation database connection pragmas",
		Path:      dbPath,
		Err:       fmt.Errorf("PRAGMA %s: expected %v, got %v", pragma, expected, actual),
	}
}

func (store *Store) write(ctx context.Context, operation string, run func(context.Context, *sql.Tx) error) error {
	result, err := store.enqueueWrite(ctx, operation, run)
	if err != nil {
		return err
	}
	return <-result
}

func (store *Store) enqueueWrite(ctx context.Context, operation string, run func(context.Context, *sql.Tx) error) (<-chan error, error) {
	if ctx == nil {
		return nil, errors.New("conversation write context is required")
	}
	if operation == "" {
		return nil, errors.New("conversation write operation is required")
	}
	if run == nil {
		return nil, errors.New("conversation write callback is required")
	}
	if err := ctx.Err(); err != nil {
		return nil, newWriteOutcomeError(operation, WriteOutcomeCancelled, err)
	}
	request := writeRequest{
		ctx:       ctx,
		operation: operation,
		run:       run,
		result:    make(chan error, 1),
	}

	store.admissionMu.Lock()
	defer store.admissionMu.Unlock()
	if store.state != storeStateOpen {
		return nil, newWriteOutcomeError(operation, WriteOutcomeStoreClosed, ErrStoreClosed)
	}
	select {
	case store.writes <- request:
		return request.result, nil
	default:
		return nil, newWriteOutcomeError(operation, WriteOutcomeSaturated, nil)
	}
}

func (store *Store) read(ctx context.Context, operation string, run func(context.Context, *sql.Conn) error) error {
	if ctx == nil {
		return errors.New("conversation read context is required")
	}
	if operation == "" {
		return errors.New("conversation read operation is required")
	}
	if run == nil {
		return errors.New("conversation read callback is required")
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	store.admissionMu.Lock()
	if store.state != storeStateOpen {
		store.admissionMu.Unlock()
		return ErrStoreClosed
	}
	store.readersWG.Add(1)
	store.admissionMu.Unlock()
	defer store.readersWG.Done()

	var reader *sql.Conn
	select {
	case reader = <-store.readers:
	case <-ctx.Done():
		return ctx.Err()
	}
	defer func() {
		store.readers <- reader
	}()
	if err := run(ctx, reader); err != nil {
		return databaseError(operation, store.dbPath, err)
	}
	return nil
}

func (store *Store) runWriter() {
	defer close(store.writerDone)
	for request := range store.writes {
		request.result <- store.executeWrite(request)
		close(request.result)
	}
}

func (store *Store) executeWrite(request writeRequest) error {
	if err := request.ctx.Err(); err != nil {
		return newWriteOutcomeError(request.operation, WriteOutcomeCancelled, err)
	}
	tx, err := store.writer.BeginTx(request.ctx, nil)
	if err != nil {
		return store.classifyWriteError(request, err)
	}
	if err := request.run(request.ctx, tx); err != nil {
		rollbackErr := tx.Rollback()
		if rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
			err = errors.Join(err, rollbackErr)
		}
		return store.classifyWriteError(request, err)
	}
	if err := tx.Commit(); err != nil {
		return store.classifyWriteError(request, err)
	}
	return nil
}

func (store *Store) classifyWriteError(request writeRequest, err error) error {
	if ctxErr := request.ctx.Err(); ctxErr != nil {
		return newWriteOutcomeError(request.operation, WriteOutcomeCancelled, errors.Join(ctxErr, err))
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return newWriteOutcomeError(request.operation, WriteOutcomeCancelled, err)
	}
	return databaseError(request.operation, store.dbPath, err)
}

func (store *Store) closeConnections() error {
	errorsFound := make([]error, 0, len(store.readerConnections)+2)
	for _, reader := range store.readerConnections {
		if reader == nil {
			continue
		}
		if err := reader.Close(); err != nil {
			errorsFound = append(errorsFound, &PersistenceError{Operation: "close conversation reader connection", Path: store.dbPath, Err: err})
		}
	}
	if store.writer != nil {
		if err := store.writer.Close(); err != nil {
			errorsFound = append(errorsFound, &PersistenceError{Operation: "close conversation writer connection", Path: store.dbPath, Err: err})
		}
	}
	if store.db != nil {
		if err := store.db.Close(); err != nil {
			errorsFound = append(errorsFound, &PersistenceError{Operation: "close conversation database", Path: store.dbPath, Err: err})
		}
	}
	return errors.Join(errorsFound...)
}

func databaseError(operation string, dbPath string, err error) error {
	if isSQLiteCorruption(err) {
		return &CorruptStateError{Path: dbPath, Err: err}
	}
	return &PersistenceError{Operation: operation, Path: dbPath, Err: err}
}

func isSQLiteCorruption(err error) bool {
	var sqliteError *sqlite.Error
	if !errors.As(err, &sqliteError) {
		return false
	}
	primaryCode := sqliteError.Code() & 0xff
	return primaryCode == sqlite3.SQLITE_CORRUPT || primaryCode == sqlite3.SQLITE_NOTADB
}

func newWriteOutcomeError(operation string, outcome WriteOutcome, err error) error {
	return &WriteOutcomeError{Operation: operation, Outcome: outcome, Err: err}
}
