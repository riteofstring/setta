package runtime

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"setta/internal/agent"

	_ "modernc.org/sqlite"
)

func registerRuntimeLiveCodexThreadCleanup(t *testing.T, appDataDir string) {
	t.Helper()
	t.Cleanup(func() {
		cleanupRuntimeLiveCodexThreads(t, appDataDir)
	})
}

func cleanupRuntimeLiveCodexThreads(t *testing.T, appDataDir string) {
	t.Helper()
	threadIDs, err := runtimeLiveCodexThreadIDs(appDataDir)
	if err != nil {
		t.Errorf("collect live Codex provider threads for cleanup: %v", err)
		return
	}
	if len(threadIDs) == 0 {
		return
	}
	cleanup := agent.NewRuntime(agent.Config{
		ExcludedEnv: []string{"OPENAI_API_KEY"},
		Version:     "live-codex-cleanup",
	})
	ctx, cancel := context.WithTimeout(context.Background(), runtimeLiveCodexCleanupTimeout(len(threadIDs)))
	defer cancel()
	defer func() {
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer shutdownCancel()
		if err := cleanup.Shutdown(shutdownCtx); err != nil {
			t.Errorf("shutdown live Codex cleanup runtime: %v", err)
		}
	}()
	for _, threadID := range threadIDs {
		if err := cleanupRuntimeLiveCodexThread(ctx, cleanup, threadID); err != nil {
			t.Errorf("delete live Codex test thread %s: %v", threadID, err)
		}
	}
}

func cleanupRuntimeLiveCodexThread(ctx context.Context, cleanup *agent.Runtime, threadID string) error {
	if err := cleanup.DeleteThread(ctx, threadID); err != nil {
		if agent.IsProviderThreadMissing(err) {
			return nil
		}
		if archiveErr := cleanup.ArchiveThread(ctx, threadID); archiveErr != nil {
			return errors.Join(err, archiveErr)
		}
	}
	return nil
}

func runtimeLiveCodexCleanupTimeout(threadCount int) time.Duration {
	timeout := 30*time.Second + time.Duration(threadCount)*15*time.Second
	if timeout > 3*time.Minute {
		return 3 * time.Minute
	}
	return timeout
}

func runtimeLiveCodexThreadIDs(appDataDir string) ([]string, error) {
	if strings.TrimSpace(appDataDir) == "" {
		return nil, nil
	}
	dbPath := filepath.Join(appDataDir, "topic-conversations-v3", "conversations.sqlite")
	if _, err := os.Stat(dbPath); err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`
SELECT thread_id
FROM agent_thread_bindings
WHERE provider = 'codex'
`)
	if err != nil {
		if strings.Contains(err.Error(), "no such table") {
			return nil, nil
		}
		return nil, fmt.Errorf("read live Codex thread bindings: %w", err)
	}
	defer rows.Close()
	seen := map[string]struct{}{}
	for rows.Next() {
		var threadID string
		if err := rows.Scan(&threadID); err != nil {
			return nil, err
		}
		if strings.TrimSpace(threadID) != "" {
			seen[threadID] = struct{}{}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	threadIDs := make([]string, 0, len(seen))
	for threadID := range seen {
		threadIDs = append(threadIDs, threadID)
	}
	sort.Strings(threadIDs)
	return threadIDs, nil
}
