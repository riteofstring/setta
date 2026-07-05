package terminal

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

const testDeviceSessionID = "device_session_test"

func TestManagerPrepareAndCommitWriteUsesImmutableBytes(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManager(t, starter, map[string]string{"workspace_terminal": root})
	created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	data := []byte("printf ok\r\n\t\x00\x1b")
	sha := terminalWriteSHA256(data)

	prepared := mustPrepareTerminalWrite(t, manager, data)
	if prepared.WorkspaceID != "workspace_terminal" ||
		prepared.PaneID != "pane_shell" ||
		prepared.SessionID != created.ID ||
		prepared.DeviceSessionID != testDeviceSessionID ||
		prepared.ByteCount != len(data) ||
		prepared.SHA256 != sha {
		t.Fatalf("prepared write = %+v, want target metadata and byte hash", prepared)
	}
	if !strings.HasPrefix(prepared.PreparedWriteID, "terminal_write_") {
		t.Fatalf("prepared write id = %s, want terminal_write_ prefix", prepared.PreparedWriteID)
	}
	if prepared.Preview != `printf ok\r\n\t\x00\x1b` {
		t.Fatalf("prepared preview = %q, want escaped control bytes", prepared.Preview)
	}

	committed, err := manager.CommitPreparedWrite(context.Background(), TerminalWriteCommitInput{
		PreparedWriteID: prepared.PreparedWriteID,
		DeviceSessionID: testDeviceSessionID,
		SHA256:          sha,
	})
	if err != nil {
		t.Fatalf("commit prepared write: %v", err)
	}
	if committed.PreparedWriteID != prepared.PreparedWriteID ||
		committed.SessionID != created.ID ||
		committed.ByteCount != len(data) ||
		committed.WrittenByteCount != len(data) ||
		committed.SHA256 != sha {
		t.Fatalf("committed write = %+v, want exact prepared metadata and byte count", committed)
	}
	if written := writtenPTYBytes(starter.handleAt(t, 0)); !bytes.Equal(written, data) {
		t.Fatalf("written bytes = %q, want exact prepared data %q", written, data)
	}

	_, err = manager.CommitPreparedWrite(context.Background(), TerminalWriteCommitInput{
		PreparedWriteID: prepared.PreparedWriteID,
		DeviceSessionID: testDeviceSessionID,
		SHA256:          sha,
	})
	if err == nil || !strings.Contains(err.Error(), "prepared terminal write not found") {
		t.Fatalf("second commit error = %v, want consumed prepared write", err)
	}
}

func TestManagerPrepareWriteValidatesBase64ByteCountAndHash(t *testing.T) {
	root := t.TempDir()
	manager := newTestManager(t, &recordingPTYStarter{}, map[string]string{"workspace_terminal": root})
	_ = mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	valid := terminalWritePrepareInput([]byte("echo ok\n"))

	cases := []struct {
		name   string
		mutate func(*TerminalWritePrepareInput)
		want   string
	}{
		{
			name: "missing device session",
			mutate: func(input *TerminalWritePrepareInput) {
				input.DeviceSessionID = ""
			},
			want: "device session id is required",
		},
		{
			name: "invalid base64",
			mutate: func(input *TerminalWritePrepareInput) {
				input.DataBase64 = "%%%not-base64%%%"
			},
			want: "dataBase64 is invalid",
		},
		{
			name: "wrong byte count",
			mutate: func(input *TerminalWritePrepareInput) {
				input.ByteCount += 1
			},
			want: "byteCount",
		},
		{
			name: "invalid hash shape",
			mutate: func(input *TerminalWritePrepareInput) {
				input.SHA256 = "abc"
			},
			want: "sha256 must be",
		},
		{
			name: "hash mismatch",
			mutate: func(input *TerminalWritePrepareInput) {
				input.SHA256 = strings.Repeat("0", 64)
			},
			want: "sha256 mismatch",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			input := valid
			tc.mutate(&input)
			_, err := manager.PrepareWrite(context.Background(), input)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("prepare error = %v, want containing %q", err, tc.want)
			}
		})
	}
}

func TestManagerCommitPreparedWriteValidatesApprovalBinding(t *testing.T) {
	root := t.TempDir()
	starter := &recordingPTYStarter{}
	manager := newTestManager(t, starter, map[string]string{"workspace_terminal": root})
	_ = mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	prepared := mustPrepareTerminalWrite(t, manager, []byte("echo approved\n"))

	_, err := manager.CommitPreparedWrite(context.Background(), TerminalWriteCommitInput{
		PreparedWriteID: prepared.PreparedWriteID,
		DeviceSessionID: "device_session_other",
		SHA256:          prepared.SHA256,
	})
	if err == nil || !strings.Contains(err.Error(), "different device session") {
		t.Fatalf("wrong device commit error = %v, want device binding failure", err)
	}
	_, err = manager.CommitPreparedWrite(context.Background(), TerminalWriteCommitInput{
		PreparedWriteID: prepared.PreparedWriteID,
		DeviceSessionID: testDeviceSessionID,
		SHA256:          strings.Repeat("1", 64),
	})
	if err == nil || !strings.Contains(err.Error(), "sha256 mismatch") {
		t.Fatalf("wrong hash commit error = %v, want hash binding failure", err)
	}
	committed, err := manager.CommitPreparedWrite(context.Background(), TerminalWriteCommitInput{
		PreparedWriteID: prepared.PreparedWriteID,
		DeviceSessionID: testDeviceSessionID,
		SHA256:          prepared.SHA256,
	})
	if err != nil {
		t.Fatalf("commit after rejected binding attempts: %v", err)
	}
	if committed.WrittenByteCount != prepared.ByteCount {
		t.Fatalf("committed bytes = %d, want %d", committed.WrittenByteCount, prepared.ByteCount)
	}
}

func TestManagerCommitPreparedWriteFailsOnExpiryAndTargetMismatch(t *testing.T) {
	t.Run("expired", func(t *testing.T) {
		root := t.TempDir()
		starter := &recordingPTYStarter{}
		var clockMu sync.Mutex
		now := time.Date(2026, 7, 8, 12, 0, 0, 0, time.UTC)
		manager := newTestManagerWithConfig(t, starter, map[string]string{"workspace_terminal": root}, ManagerConfig{
			Clock: func() time.Time {
				clockMu.Lock()
				defer clockMu.Unlock()
				return now
			},
			PreparedWriteTTL: time.Second,
		})
		_ = mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
		data := []byte("echo stale\n")
		prepared := mustPrepareTerminalWrite(t, manager, data)

		clockMu.Lock()
		now = now.Add(time.Second)
		clockMu.Unlock()
		_, err := manager.CommitPreparedWrite(context.Background(), TerminalWriteCommitInput{
			PreparedWriteID: prepared.PreparedWriteID,
			DeviceSessionID: testDeviceSessionID,
			SHA256:          prepared.SHA256,
		})
		if err == nil || !strings.Contains(err.Error(), "expired") {
			t.Fatalf("expired commit error = %v, want expiry failure", err)
		}
		if written := writtenPTYBytes(starter.handleAt(t, 0)); len(written) != 0 {
			t.Fatalf("expired write bytes = %q, want none", written)
		}
	})

	t.Run("target mismatch", func(t *testing.T) {
		root := t.TempDir()
		starter := &recordingPTYStarter{}
		manager := newTestManager(t, starter, map[string]string{"workspace_terminal": root})
		created := mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
		prepared := mustPrepareTerminalWrite(t, manager, []byte("echo old\n"))
		if _, err := manager.Close(context.Background(), created.ID, false); err != nil {
			t.Fatalf("close prepared target session: %v", err)
		}
		_ = mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)

		_, err := manager.CommitPreparedWrite(context.Background(), TerminalWriteCommitInput{
			PreparedWriteID: prepared.PreparedWriteID,
			DeviceSessionID: testDeviceSessionID,
			SHA256:          prepared.SHA256,
		})
		if err == nil || !strings.Contains(err.Error(), "target changed") {
			t.Fatalf("target mismatch commit error = %v, want target changed", err)
		}
		if written := writtenPTYBytes(starter.handleAt(t, 1)); len(written) != 0 {
			t.Fatalf("replacement session written bytes = %q, want none", written)
		}
	})
}

func TestManagerCommitPreparedWriteCompletesPartialPTYWrites(t *testing.T) {
	root := t.TempDir()
	handle := &chunkedWritePTYHandle{
		recordingPTYHandle: newRecordingPTYHandle(Profile{}),
		maxChunk:           2,
	}
	manager := newTestManager(t, &singlePTYStarter{handle: handle}, map[string]string{"workspace_terminal": root})
	_ = mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	data := []byte("abcdef\n")
	prepared := mustPrepareTerminalWrite(t, manager, data)

	committed, err := manager.CommitPreparedWrite(context.Background(), TerminalWriteCommitInput{
		PreparedWriteID: prepared.PreparedWriteID,
		DeviceSessionID: testDeviceSessionID,
		SHA256:          prepared.SHA256,
	})
	if err != nil {
		t.Fatalf("commit chunked prepared write: %v", err)
	}
	if committed.WrittenByteCount != len(data) || !bytes.Equal(writtenPTYBytes(handle.recordingPTYHandle), data) {
		t.Fatalf("chunked commit = %+v written %q, want full data %q", committed, writtenPTYBytes(handle.recordingPTYHandle), data)
	}
	if calls := handle.writeCallCount(); calls != 4 {
		t.Fatalf("write calls = %d, want four partial writes", calls)
	}
}

func TestManagerCommitPreparedWriteFailsLoudlyOnPartialPTYError(t *testing.T) {
	root := t.TempDir()
	handle := &chunkedWritePTYHandle{
		recordingPTYHandle: newRecordingPTYHandle(Profile{}),
		errOnCall:          1,
		maxChunk:           2,
	}
	manager := newTestManager(t, &singlePTYStarter{handle: handle}, map[string]string{"workspace_terminal": root})
	_ = mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	prepared := mustPrepareTerminalWrite(t, manager, []byte("abcd"))

	_, err := manager.CommitPreparedWrite(context.Background(), TerminalWriteCommitInput{
		PreparedWriteID: prepared.PreparedWriteID,
		DeviceSessionID: testDeviceSessionID,
		SHA256:          prepared.SHA256,
	})
	if err == nil || !strings.Contains(err.Error(), "wrote 2 of 4 bytes") {
		t.Fatalf("partial failure error = %v, want written byte count", err)
	}
	if written := string(writtenPTYBytes(handle.recordingPTYHandle)); written != "ab" {
		t.Fatalf("partial failure wrote %q, want only first partial write", written)
	}
	_, err = manager.CommitPreparedWrite(context.Background(), TerminalWriteCommitInput{
		PreparedWriteID: prepared.PreparedWriteID,
		DeviceSessionID: testDeviceSessionID,
		SHA256:          prepared.SHA256,
	})
	if err == nil || !strings.Contains(err.Error(), "prepared terminal write not found") {
		t.Fatalf("retry after partial failure error = %v, want consumed prepared write", err)
	}
}

func TestManagerCommitPreparedWriteSerializesWritesPerSession(t *testing.T) {
	root := t.TempDir()
	handle := &blockingChunkedWritePTYHandle{
		recordingPTYHandle: newRecordingPTYHandle(Profile{}),
		firstWriteEntered:  make(chan struct{}),
		releaseFirstWrite:  make(chan struct{}),
	}
	manager := newTestManager(t, &singlePTYStarter{handle: handle}, map[string]string{"workspace_terminal": root})
	_ = mustCreateTestSession(t, manager, "workspace_terminal", "pane_shell", "", "", 80, 24)
	first := mustPrepareTerminalWrite(t, manager, []byte("abc"))
	second := mustPrepareTerminalWrite(t, manager, []byte("XYZ"))

	firstDone := make(chan error, 1)
	go func() {
		_, err := manager.CommitPreparedWrite(context.Background(), TerminalWriteCommitInput{
			PreparedWriteID: first.PreparedWriteID,
			DeviceSessionID: testDeviceSessionID,
			SHA256:          first.SHA256,
		})
		firstDone <- err
	}()
	<-handle.firstWriteEntered

	secondStarted := make(chan struct{})
	secondDone := make(chan error, 1)
	go func() {
		close(secondStarted)
		_, err := manager.CommitPreparedWrite(context.Background(), TerminalWriteCommitInput{
			PreparedWriteID: second.PreparedWriteID,
			DeviceSessionID: testDeviceSessionID,
			SHA256:          second.SHA256,
		})
		secondDone <- err
	}()
	<-secondStarted
	select {
	case err := <-secondDone:
		t.Fatalf("second commit completed while first write was blocked: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	if written := string(writtenPTYBytes(handle.recordingPTYHandle)); written != "a" {
		t.Fatalf("written bytes while first write blocked = %q, want only first byte", written)
	}

	close(handle.releaseFirstWrite)
	if err := <-firstDone; err != nil {
		t.Fatalf("first commit: %v", err)
	}
	if err := <-secondDone; err != nil {
		t.Fatalf("second commit: %v", err)
	}
	if written := string(writtenPTYBytes(handle.recordingPTYHandle)); written != "abcXYZ" {
		t.Fatalf("serialized written bytes = %q, want first prepared write then second", written)
	}
}

func mustPrepareTerminalWrite(t *testing.T, manager *Manager, data []byte) TerminalPreparedWrite {
	t.Helper()
	prepared, err := manager.PrepareWrite(context.Background(), terminalWritePrepareInput(data))
	if err != nil {
		t.Fatalf("prepare terminal write: %v", err)
	}
	return prepared
}

func terminalWritePrepareInput(data []byte) TerminalWritePrepareInput {
	return TerminalWritePrepareInput{
		WorkspaceID:     "workspace_terminal",
		PaneID:          "pane_shell",
		DeviceSessionID: testDeviceSessionID,
		DataBase64:      base64.StdEncoding.EncodeToString(data),
		ByteCount:       len(data),
		SHA256:          terminalWriteSHA256(data),
	}
}

func writtenPTYBytes(handle *recordingPTYHandle) []byte {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return append([]byte{}, handle.writes.Bytes()...)
}

type singlePTYStarter struct {
	handle PTYHandle
}

func (starter *singlePTYStarter) Start(_ context.Context, profile Profile) (PTYHandle, error) {
	switch handle := starter.handle.(type) {
	case *chunkedWritePTYHandle:
		handle.profile = profile
	case *blockingChunkedWritePTYHandle:
		handle.profile = profile
	case *recordingPTYHandle:
		handle.profile = profile
	}
	return starter.handle, nil
}

type chunkedWritePTYHandle struct {
	*recordingPTYHandle

	mu        sync.Mutex
	errOnCall int
	maxChunk  int
	writeCall int
}

func (handle *chunkedWritePTYHandle) Write(data []byte) (int, error) {
	handle.mu.Lock()
	handle.writeCall += 1
	call := handle.writeCall
	handle.mu.Unlock()

	count := len(data)
	if handle.maxChunk > 0 && count > handle.maxChunk {
		count = handle.maxChunk
	}
	if count > 0 {
		_, _ = handle.recordingPTYHandle.Write(data[:count])
	}
	if handle.errOnCall > 0 && call == handle.errOnCall {
		return count, errors.New("scripted terminal write failure")
	}
	return count, nil
}

func (handle *chunkedWritePTYHandle) writeCallCount() int {
	handle.mu.Lock()
	defer handle.mu.Unlock()
	return handle.writeCall
}

type blockingChunkedWritePTYHandle struct {
	*recordingPTYHandle

	firstWriteEntered chan struct{}
	releaseFirstWrite chan struct{}
	once              sync.Once
}

func (handle *blockingChunkedWritePTYHandle) Write(data []byte) (int, error) {
	if len(data) == 0 {
		return 0, nil
	}
	_, _ = handle.recordingPTYHandle.Write(data[:1])
	handle.once.Do(func() {
		close(handle.firstWriteEntered)
		<-handle.releaseFirstWrite
	})
	return 1, nil
}
