package semanticgraph

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type cartographerProcessingDurableHealth struct {
	QueuedWindows           []CartographerWindow
	RunningWindows          []CartographerWindow
	StaleLeaseCount         int
	SupersededWindowCount   int
	CompletedNoopRunCount   int
	FailedRunCount          int
	PendingReviewPatchCount int
	LastAppliedPatchID      string
	LastAppliedAt           string
	LastNoopRunID           string
	LastNoopAt              string
	LastNoopReason          string
	LastSupersededWindowID  string
	LastSupersededAt        string
	LastFailure             *CartographerProcessingFailure
}

const cartographerWindowQueueSelectSQL = `
SELECT semantic_cartographer_windows.workspace_id,
       semantic_cartographer_windows.id,
       semantic_cartographer_windows.run_id,
       semantic_cartographer_windows.status,
       semantic_cartographer_windows.sequence,
       semantic_cartographer_windows.source_kind,
       semantic_cartographer_windows.source_id,
       semantic_cartographer_windows.cursor_id,
       semantic_cartographer_windows.summary_id,
       semantic_cartographer_windows.input_bundle_json,
       semantic_cartographer_windows.opened_at,
       semantic_cartographer_windows.closed_at,
       semantic_cartographer_windows.created_at,
       semantic_cartographer_windows.updated_at
FROM semantic_cartographer_windows
`

func (store *Store) ListClosedQueuedCartographerWindows(ctx context.Context) ([]CartographerWindow, error) {
	return store.listCartographerWindowsByRunStatus(ctx, CartographerRunQueued, defaultSemanticPageLimit, `
ORDER BY runs.priority DESC, semantic_cartographer_windows.closed_at ASC, semantic_cartographer_windows.updated_at ASC, semantic_cartographer_windows.id ASC
`)
}

func (store *Store) ListRunningCartographerWindows(ctx context.Context) ([]CartographerWindow, error) {
	return store.listCartographerWindowsByRunStatus(ctx, CartographerRunRunning, defaultSemanticPageLimit, `
ORDER BY runs.lease_deadline ASC, runs.started_at ASC, semantic_cartographer_windows.id ASC
`)
}

func (store *Store) ListExpiredRunningCartographerWindows(ctx context.Context, now string) ([]CartographerWindow, error) {
	if ctx == nil {
		return nil, errors.New("context is required")
	}
	if err := validateTimestamp("cartographer lease recovery timestamp", now); err != nil {
		return nil, err
	}
	rows, err := store.db.QueryContext(ctx, cartographerWindowQueueSelectSQL+`
JOIN semantic_cartographer_runs AS runs
  ON runs.workspace_id = semantic_cartographer_windows.workspace_id
 AND runs.id = semantic_cartographer_windows.run_id
WHERE runs.status = ?
  AND (runs.lease_deadline = '' OR runs.lease_deadline <= ?)
ORDER BY runs.lease_deadline ASC, runs.updated_at ASC, semantic_cartographer_windows.id ASC
`, CartographerRunRunning, now)
	if err != nil {
		return nil, store.persistenceError("list expired running cartographer windows", err)
	}
	return scanCartographerWindows(rows)
}

func (store *Store) ListQueuedCartographerWindowsForSource(ctx context.Context, sourceKey string) ([]CartographerWindow, error) {
	if ctx == nil {
		return nil, errors.New("context is required")
	}
	if sourceKey == "" {
		return []CartographerWindow{}, nil
	}
	rows, err := store.db.QueryContext(ctx, cartographerWindowQueueSelectSQL+`
JOIN semantic_cartographer_runs AS runs
  ON runs.workspace_id = semantic_cartographer_windows.workspace_id
 AND runs.id = semantic_cartographer_windows.run_id
WHERE semantic_cartographer_windows.status = ?
  AND runs.status = ?
  AND runs.source_key = ?
ORDER BY runs.priority DESC, semantic_cartographer_windows.closed_at DESC, runs.created_at DESC, semantic_cartographer_windows.id DESC
`, CartographerWindowClosed, CartographerRunQueued, sourceKey)
	if err != nil {
		return nil, store.persistenceError("list queued cartographer source windows", err)
	}
	return scanCartographerWindows(rows)
}

func (store *Store) ReadCartographerProcessingDurableHealth(ctx context.Context, now string) (cartographerProcessingDurableHealth, error) {
	if ctx == nil {
		return cartographerProcessingDurableHealth{}, errors.New("context is required")
	}
	if err := validateTimestamp("cartographer processing health timestamp", now); err != nil {
		return cartographerProcessingDurableHealth{}, err
	}
	queued, err := store.ListClosedQueuedCartographerWindows(ctx)
	if err != nil {
		return cartographerProcessingDurableHealth{}, err
	}
	running, err := store.ListRunningCartographerWindows(ctx)
	if err != nil {
		return cartographerProcessingDurableHealth{}, err
	}
	health := cartographerProcessingDurableHealth{
		QueuedWindows:  queued,
		RunningWindows: running,
	}
	if err := store.readCartographerProcessingDurableCounts(ctx, &health, now); err != nil {
		return cartographerProcessingDurableHealth{}, err
	}
	if err := store.readCartographerProcessingLastRecords(ctx, &health); err != nil {
		return cartographerProcessingDurableHealth{}, err
	}
	return health, nil
}

func (store *Store) readCartographerProcessingDurableCounts(ctx context.Context, health *cartographerProcessingDurableHealth, now string) error {
	var err error
	if health.StaleLeaseCount, err = store.countCartographerRuns(ctx, "status = ? AND (lease_deadline = '' OR lease_deadline <= ?)", CartographerRunRunning, now); err != nil {
		return err
	}
	if health.SupersededWindowCount, err = store.countCartographerRuns(ctx, "status = ?", CartographerRunSuperseded); err != nil {
		return err
	}
	if health.CompletedNoopRunCount, err = store.countCartographerRuns(ctx, "status = ?", CartographerRunCompletedNoop); err != nil {
		return err
	}
	if health.FailedRunCount, err = store.countCartographerRuns(ctx, "status IN (?, ?)", CartographerRunFailed, CartographerRunRejected); err != nil {
		return err
	}
	if health.PendingReviewPatchCount, err = store.countCartographerPatches(ctx, "status = ?", CartographerPatchPendingReview); err != nil {
		return err
	}
	return nil
}

func (store *Store) readCartographerProcessingLastRecords(ctx context.Context, health *cartographerProcessingDurableHealth) error {
	if err := store.readLastAppliedCartographerPatch(ctx, health); err != nil {
		return err
	}
	if err := store.readLastNoopCartographerRun(ctx, health); err != nil {
		return err
	}
	if err := store.readLastSupersededCartographerWindow(ctx, health); err != nil {
		return err
	}
	if err := store.readLastFailedCartographerRun(ctx, health); err != nil {
		return err
	}
	return nil
}

func (store *Store) listCartographerWindowsByRunStatus(ctx context.Context, status CartographerRunStatus, limit int, orderBy string) ([]CartographerWindow, error) {
	if ctx == nil {
		return nil, errors.New("context is required")
	}
	limit = normalizedCartographerLimit(limit)
	rows, err := store.db.QueryContext(ctx, cartographerWindowQueueSelectSQL+`
JOIN semantic_cartographer_runs AS runs
  ON runs.workspace_id = semantic_cartographer_windows.workspace_id
 AND runs.id = semantic_cartographer_windows.run_id
WHERE semantic_cartographer_windows.status = ?
  AND runs.status = ?
`+orderBy+`
LIMIT ?
`, CartographerWindowClosed, status, limit)
	if err != nil {
		return nil, store.persistenceError("list cartographer windows by run status", err)
	}
	return scanCartographerWindows(rows)
}

func scanCartographerWindows(rows *sql.Rows) ([]CartographerWindow, error) {
	defer rows.Close()
	windows := []CartographerWindow{}
	for rows.Next() {
		window, err := scanCartographerWindow(rows)
		if err != nil {
			return nil, err
		}
		windows = append(windows, window)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return windows, nil
}

func (store *Store) countCartographerRuns(ctx context.Context, condition string, args ...any) (int, error) {
	var count int
	row := store.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM semantic_cartographer_runs WHERE "+condition, args...)
	if err := row.Scan(&count); err != nil {
		return 0, store.persistenceError("count cartographer runs", err)
	}
	return count, nil
}

func (store *Store) countCartographerPatches(ctx context.Context, condition string, args ...any) (int, error) {
	var count int
	row := store.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM semantic_cartographer_patches WHERE "+condition, args...)
	if err := row.Scan(&count); err != nil {
		return 0, store.persistenceError("count cartographer patches", err)
	}
	return count, nil
}

func (store *Store) readLastAppliedCartographerPatch(ctx context.Context, health *cartographerProcessingDurableHealth) error {
	row := store.db.QueryRowContext(ctx, `
SELECT id, applied_at
FROM semantic_cartographer_patches
WHERE status = ? AND applied_at != ''
ORDER BY applied_at DESC, id DESC
LIMIT 1
`, CartographerPatchApplied)
	if err := row.Scan(&health.LastAppliedPatchID, &health.LastAppliedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return store.persistenceError("read last applied cartographer patch", err)
	}
	return nil
}

func (store *Store) readLastNoopCartographerRun(ctx context.Context, health *cartographerProcessingDurableHealth) error {
	row := store.db.QueryRowContext(ctx, `
SELECT id, completed_at, error
FROM semantic_cartographer_runs
WHERE status = ?
ORDER BY completed_at DESC, id DESC
LIMIT 1
`, CartographerRunCompletedNoop)
	if err := row.Scan(&health.LastNoopRunID, &health.LastNoopAt, &health.LastNoopReason); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return store.persistenceError("read last no-op cartographer run", err)
	}
	return nil
}

func (store *Store) readLastSupersededCartographerWindow(ctx context.Context, health *cartographerProcessingDurableHealth) error {
	row := store.db.QueryRowContext(ctx, `
SELECT window_id, updated_at
FROM semantic_cartographer_runs
WHERE status = ?
ORDER BY updated_at DESC, id DESC
LIMIT 1
`, CartographerRunSuperseded)
	if err := row.Scan(&health.LastSupersededWindowID, &health.LastSupersededAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return store.persistenceError("read last superseded cartographer window", err)
	}
	return nil
}

func (store *Store) readLastFailedCartographerRun(ctx context.Context, health *cartographerProcessingDurableHealth) error {
	var failure CartographerProcessingFailure
	var status CartographerRunStatus
	row := store.db.QueryRowContext(ctx, `
SELECT workspace_id, window_id, id, source_key, error, updated_at, status
FROM semantic_cartographer_runs
WHERE status IN (?, ?)
ORDER BY updated_at DESC, id DESC
LIMIT 1
`, CartographerRunFailed, CartographerRunRejected)
	if err := row.Scan(&failure.WorkspaceID, &failure.WindowID, &failure.RunID, &failure.SourceKey, &failure.Message, &failure.FailedAt, &status); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return store.persistenceError("read last failed cartographer run", err)
	}
	if failure.Message == "" {
		failure.Message = fmt.Sprintf("cartographer run finished with status %s", status)
	}
	health.LastFailure = &failure
	return nil
}
