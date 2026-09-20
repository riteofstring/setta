package projectfs

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestRootConfinesRegularBoundedReads(t *testing.T) {
	directory := t.TempDir()
	writeFixture(t, filepath.Join(directory, "data", "value.txt"), "value")
	root, err := Open(directory)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer root.Close()
	content, err := root.ReadRegular("data/value.txt", 5)
	if err != nil || string(content) != "value" {
		t.Fatalf("ReadRegular() = %q, %v", content, err)
	}
	if _, err := root.ReadRegular("data/value.txt", 4); !errors.Is(err, ErrMaximumSize) {
		t.Fatalf("ReadRegular(size limit) error = %v", err)
	}
	for _, relative := range []string{"", " data/value.txt", "../value.txt", "/value.txt", "data\\value.txt", "data/../value.txt"} {
		if _, err := root.ReadRegular(relative, 10); !errors.Is(err, ErrInvalidPath) {
			t.Fatalf("ReadRegular(%q) error = %v", relative, err)
		}
	}
	if _, err := root.ReadRegular("data", 10); !errors.Is(err, ErrIrregularPath) {
		t.Fatalf("ReadRegular(directory) error = %v", err)
	}
}

func TestRootRejectsSymlinkTraversalAndIrregularFiles(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink permissions vary on Windows")
	}
	directory := t.TempDir()
	outside := t.TempDir()
	writeFixture(t, filepath.Join(outside, "secret.txt"), "secret")
	if err := os.Symlink(outside, filepath.Join(directory, "linked")); err != nil {
		t.Fatalf("Symlink() error = %v", err)
	}
	root, err := Open(directory)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer root.Close()
	if _, err := root.ReadRegular("linked/secret.txt", 100); err == nil {
		t.Fatal("ReadRegular(symlink traversal) error = nil")
	}
	if err := root.EnsureDirectory("linked/child", 0o755); err == nil {
		t.Fatal("EnsureDirectory(symlink traversal) error = nil")
	}
	if err := os.Symlink(filepath.Join(outside, "secret.txt"), filepath.Join(directory, "value.txt")); err != nil {
		t.Fatalf("Symlink() error = %v", err)
	}
	if err := root.Replace("value.txt", []byte("replacement"), 100, 0o600); !errors.Is(err, ErrIrregularPath) {
		t.Fatalf("Replace(symlink) error = %v", err)
	}
}

func TestEnsureDirectoryRejectsReplacedAncestor(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink permissions vary on Windows")
	}
	directory := t.TempDir()
	root, err := Open(directory)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer root.Close()
	if err := root.EnsureDirectory(".local/state", 0o755); err != nil {
		t.Fatalf("EnsureDirectory() error = %v", err)
	}
	if err := os.RemoveAll(filepath.Join(directory, ".local", "state")); err != nil {
		t.Fatalf("RemoveAll() error = %v", err)
	}
	if err := os.Symlink(t.TempDir(), filepath.Join(directory, ".local", "state")); err != nil {
		t.Fatalf("Symlink() error = %v", err)
	}
	if err := root.EnsureDirectory(".local/state/child", 0o755); err == nil {
		t.Fatal("EnsureDirectory(replaced ancestor) error = nil")
	}
}

func TestWriteExclusiveAndReplacePublishCompleteBytes(t *testing.T) {
	root, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer root.Close()
	if err := root.EnsureDirectory("state", 0o755); err != nil {
		t.Fatalf("EnsureDirectory() error = %v", err)
	}
	if err := root.WriteExclusive("state/value.json", []byte("first"), 5, 0o600); err != nil {
		t.Fatalf("WriteExclusive() error = %v", err)
	}
	if err := root.WriteExclusive("state/value.json", []byte("second"), 6, 0o600); err == nil {
		t.Fatal("WriteExclusive(existing) error = nil")
	}
	if err := root.Replace("state/value.json", []byte("second"), 6, 0o600); err != nil {
		t.Fatalf("Replace() error = %v", err)
	}
	content, err := root.ReadRegular("state/value.json", 6)
	if err != nil || string(content) != "second" {
		t.Fatalf("ReadRegular() = %q, %v", content, err)
	}
	info, err := os.Stat(filepath.Join(root.Path(), "state", "value.json"))
	if err != nil || info.Mode().Perm()&0o077 != 0 {
		t.Fatalf("replacement mode = %v, %v", info.Mode().Perm(), err)
	}
	entries, err := os.ReadDir(filepath.Join(root.Path(), "state"))
	if err != nil || len(entries) != 1 {
		t.Fatalf("state entries = %v, %v", entries, err)
	}
}

func TestFailedReplacementLeavesPriorFileReadable(t *testing.T) {
	root, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer root.Close()
	if err := root.WriteExclusive("value.txt", []byte("prior"), 5, 0o600); err != nil {
		t.Fatalf("WriteExclusive() error = %v", err)
	}
	replacement, err := root.StageReplacement("value.txt", []byte("candidate"), 9, 0o600)
	if err != nil {
		t.Fatalf("StageReplacement() error = %v", err)
	}
	if err := root.directory.Remove(replacement.temporary); err != nil {
		t.Fatalf("Remove(staged) error = %v", err)
	}
	if err := replacement.Commit(); err == nil {
		t.Fatal("Commit(missing staged file) error = nil")
	}
	if err := replacement.Discard(); err != nil {
		t.Fatalf("Discard() error = %v", err)
	}
	content, err := root.ReadRegular("value.txt", 5)
	if err != nil || string(content) != "prior" {
		t.Fatalf("prior file = %q, %v", content, err)
	}
	if err := root.Replace("value.txt", []byte("too large"), 3, 0o600); !errors.Is(err, ErrMaximumSize) {
		t.Fatalf("Replace(size failure) error = %v", err)
	}
}

func TestAdvisoryLockIsExclusiveAndCancellationAware(t *testing.T) {
	directory := t.TempDir()
	first, err := Open(directory)
	if err != nil {
		t.Fatalf("Open(first) error = %v", err)
	}
	defer first.Close()
	second, err := Open(directory)
	if err != nil {
		t.Fatalf("Open(second) error = %v", err)
	}
	defer second.Close()
	if err := first.EnsureDirectory("state", 0o755); err != nil {
		t.Fatalf("EnsureDirectory() error = %v", err)
	}
	entered := make(chan struct{})
	release := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		done <- first.WithLock(context.Background(), "state/write.lock", func() error {
			close(entered)
			<-release
			return nil
		})
	}()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("first lock was not acquired")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()
	called := false
	err = second.WithLock(ctx, "state/write.lock", func() error {
		called = true
		return nil
	})
	if !errors.Is(err, context.DeadlineExceeded) || called {
		t.Fatalf("contended lock = %v, called = %v", err, called)
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatalf("first lock error = %v", err)
	}
	if err := second.WithLock(context.Background(), "state/write.lock", func() error {
		called = true
		return nil
	}); err != nil || !called {
		t.Fatalf("released lock = %v, called = %v", err, called)
	}
}

func TestAdvisoryLockSerializesConcurrentWriters(t *testing.T) {
	directory := t.TempDir()
	root, err := Open(directory)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer root.Close()
	if err := root.EnsureDirectory("state", 0o755); err != nil {
		t.Fatalf("EnsureDirectory() error = %v", err)
	}
	var active atomic.Int32
	var maximum atomic.Int32
	var wait sync.WaitGroup
	errorsFound := make(chan error, 8)
	for index := 0; index < 8; index++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			err := root.WithLock(context.Background(), "state/write.lock", func() error {
				current := active.Add(1)
				for previous := maximum.Load(); current > previous && !maximum.CompareAndSwap(previous, current); previous = maximum.Load() {
				}
				time.Sleep(time.Millisecond)
				active.Add(-1)
				return nil
			})
			if err != nil {
				errorsFound <- err
			}
		}()
	}
	wait.Wait()
	close(errorsFound)
	for err := range errorsFound {
		t.Fatalf("WithLock() error = %v", err)
	}
	if maximum.Load() != 1 {
		t.Fatalf("maximum concurrent writers = %d", maximum.Load())
	}
}

func TestRootCloseAndReplacementCleanupAreIdempotent(t *testing.T) {
	root, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	replacement, err := root.StageReplacement("value.txt", []byte("value"), 5, 0o600)
	if err != nil {
		t.Fatalf("StageReplacement() error = %v", err)
	}
	if err := replacement.Discard(); err != nil {
		t.Fatalf("Discard() error = %v", err)
	}
	if err := replacement.Discard(); err != nil {
		t.Fatalf("second Discard() error = %v", err)
	}
	if err := replacement.Commit(); !errors.Is(err, ErrReplacementClosed) {
		t.Fatalf("Commit(discarded) error = %v", err)
	}
	if err := root.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if err := root.Close(); err != nil {
		t.Fatalf("second Close() error = %v", err)
	}
	if _, err := root.ReadRegular("value.txt", 5); !errors.Is(err, ErrClosed) {
		t.Fatalf("ReadRegular(closed) error = %v", err)
	}
}

func TestCanonicalRootRejectsInvalidAndNonDirectoryInputs(t *testing.T) {
	for _, rootPath := range []string{"", " relative ", string([]byte{'b', 'a', 'd', 0, 'p', 'a', 't', 'h'}), filepath.Join(t.TempDir(), "missing")} {
		if _, err := CanonicalRoot(rootPath); err == nil {
			t.Fatalf("CanonicalRoot(%q) error = nil", rootPath)
		}
	}
	filePath := filepath.Join(t.TempDir(), "file")
	writeFixture(t, filePath, "value")
	if _, err := CanonicalRoot(filePath); !errors.Is(err, ErrIrregularPath) {
		t.Fatalf("CanonicalRoot(file) error = %v", err)
	}
}

func writeFixture(t *testing.T, filePath string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filePath, []byte(content), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}
