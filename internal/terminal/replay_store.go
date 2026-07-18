package terminal

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"time"

	"setta/internal/jsonio"
)

const (
	replayStateSchemaVersion = 1
	replayStateDirName       = "terminal"
	replayStateFileName      = "replay-v1.json"
	minimumReplayFileBytes   = 64 * 1024
)

type ReplayRecoveryError struct {
	Operation string
	Path      string
	Err       error
}

func (err *ReplayRecoveryError) Error() string {
	return fmt.Sprintf("terminal replay recovery %s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *ReplayRecoveryError) Unwrap() error {
	return err.Err
}

type replayStore struct {
	maxBytes int
	path     string
}

type replayState struct {
	SchemaVersion int             `json:"schemaVersion"`
	StreamID      string          `json:"streamId"`
	Sequence      int             `json:"sequence"`
	Sessions      []replaySession `json:"sessions"`
}

type replaySession struct {
	SessionID   string                   `json:"sessionId"`
	WorkspaceID string                   `json:"workspaceId"`
	PaneID      string                   `json:"paneId"`
	ProfileID   string                   `json:"profileId"`
	CWD         string                   `json:"cwd"`
	Cols        int                      `json:"cols"`
	Rows        int                      `json:"rows"`
	Status      SessionStatus            `json:"status"`
	CreatedAt   string                   `json:"createdAt"`
	UpdatedAt   string                   `json:"updatedAt"`
	ExitCode    int                      `json:"exitCode"`
	Events      []persistedTerminalEvent `json:"events"`
}

type persistedTerminalEvent struct {
	EmittedAt string        `json:"emittedAt"`
	Event     TerminalEvent `json:"event"`
}

type recoveredTerminalSession struct {
	Cols        int
	CreatedAt   time.Time
	CWD         string
	ExitCode    int
	Message     string
	PaneID      string
	ProfileID   string
	Rows        int
	SessionID   string
	Status      SessionStatus
	UpdatedAt   time.Time
	WorkspaceID string
}

func newReplayStore(appDataDir string, maxBytes int) (*replayStore, error) {
	if appDataDir == "" {
		return nil, errors.New("terminal replay app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("terminal replay app data directory must be absolute: %s", appDataDir)
	}
	if maxBytes < minimumReplayFileBytes {
		return nil, fmt.Errorf("terminal replay file cap must be at least %d bytes: %d", minimumReplayFileBytes, maxBytes)
	}
	return &replayStore{
		maxBytes: maxBytes,
		path:     filepath.Join(filepath.Clean(appDataDir), replayStateDirName, replayStateFileName),
	}, nil
}

func (store *replayStore) load() (replayState, error) {
	file, err := os.Open(store.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return replayState{SchemaVersion: replayStateSchemaVersion, Sessions: []replaySession{}}, nil
		}
		return replayState{}, &ReplayRecoveryError{Operation: "read", Path: store.path, Err: err}
	}
	defer file.Close()

	var state replayState
	if err := jsonio.DecodeSingle(file, &state); err != nil {
		return replayState{}, &ReplayRecoveryError{Operation: "decode", Path: store.path, Err: err}
	}
	if err := validateReplayState(state); err != nil {
		return replayState{}, &ReplayRecoveryError{Operation: "validate", Path: store.path, Err: err}
	}
	return state, nil
}

func (store *replayStore) save(state replayState) (replayState, error) {
	state = capReplayState(state, store.maxBytes)
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return replayState{}, &ReplayRecoveryError{Operation: "encode", Path: store.path, Err: err}
	}
	data = append(data, '\n')
	if len(data) > store.maxBytes {
		return replayState{}, &ReplayRecoveryError{
			Operation: "cap",
			Path:      store.path,
			Err:       fmt.Errorf("encoded replay state is %d bytes, cap is %d", len(data), store.maxBytes),
		}
	}
	if err := writeReplayStateAtomically(store.path, data); err != nil {
		return replayState{}, err
	}
	return state, nil
}

func capReplayState(state replayState, maxBytes int) replayState {
	for {
		size, err := encodedReplayStateSize(state)
		if err != nil || size <= maxBytes {
			return state
		}
		sessionIndex, eventIndex, found := oldestReplayEvent(state)
		if !found {
			return state
		}
		dropped := state.Sessions[sessionIndex].Events[eventIndex].Event
		events := state.Sessions[sessionIndex].Events
		state.Sessions[sessionIndex].Events = append(events[:eventIndex], events[eventIndex+1:]...)
		if dropped.Type == TerminalEventOutput {
			upsertReplayDiskTruncation(&state, sessionIndex, dropped.Payload.ByteCount)
		}
	}
}

func encodedReplayStateSize(state replayState) (int, error) {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return 0, err
	}
	return len(data) + 1, nil
}

func upsertReplayDiskTruncation(state *replayState, sessionIndex int, droppedBytes int) {
	session := &state.Sessions[sessionIndex]
	for index := len(session.Events) - 1; index >= 0; index-- {
		event := &session.Events[index].Event
		if event.Type != TerminalEventBufferTruncated {
			continue
		}
		event.Payload.DroppedBytes += droppedBytes
		event.Payload.DroppedChunks++
		event.Payload.ByteCount = event.Payload.DroppedBytes
		event.Payload.Message = terminalReplayHistoryTruncatedMessage(event.Payload.DroppedChunks)
		return
	}
	state.Sequence++
	emittedAt := session.UpdatedAt
	event := TerminalEvent{
		SchemaVersion: SchemaVersion,
		StreamID:      state.StreamID,
		Sequence:      state.Sequence,
		EventID:       fmt.Sprintf("%s:%d", state.StreamID, state.Sequence),
		Type:          TerminalEventBufferTruncated,
		EmittedAt:     emittedAt,
		WorkspaceID:   session.WorkspaceID,
		PaneID:        session.PaneID,
		SessionID:     session.SessionID,
		Payload: TerminalEventPayload{
			ByteCount:     droppedBytes,
			DroppedBytes:  droppedBytes,
			DroppedChunks: 1,
			Status:        session.Status,
			CWD:           session.CWD,
			Cols:          session.Cols,
			Rows:          session.Rows,
			ExitCode:      session.ExitCode,
			Message:       terminalReplayHistoryTruncatedMessage(1),
		},
	}
	session.Events = append(session.Events, persistedTerminalEvent{
		EmittedAt: emittedAt,
		Event:     event,
	})
}

func oldestReplayEvent(state replayState) (int, int, bool) {
	oldestSession := 0
	oldestEvent := 0
	var oldest time.Time
	found := false
	for sessionIndex := range state.Sessions {
		for eventIndex, event := range state.Sessions[sessionIndex].Events {
			emittedAt, err := time.Parse(time.RFC3339Nano, event.EmittedAt)
			if err != nil {
				return sessionIndex, eventIndex, true
			}
			if !found || emittedAt.Before(oldest) {
				oldestSession = sessionIndex
				oldestEvent = eventIndex
				oldest = emittedAt
				found = true
			}
		}
	}
	return oldestSession, oldestEvent, found
}

func writeReplayStateAtomically(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return &ReplayRecoveryError{Operation: "create directory", Path: dir, Err: err}
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return &ReplayRecoveryError{Operation: "protect directory", Path: dir, Err: err}
	}
	file, err := os.CreateTemp(dir, ".tmp-replay-*.json")
	if err != nil {
		return &ReplayRecoveryError{Operation: "create temp file", Path: dir, Err: err}
	}
	tempPath := file.Name()
	removeTemp := true
	defer func() {
		if removeTemp {
			_ = os.Remove(tempPath)
		}
	}()
	if err := file.Chmod(0o600); err != nil {
		_ = file.Close()
		return &ReplayRecoveryError{Operation: "protect temp file", Path: tempPath, Err: err}
	}
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return &ReplayRecoveryError{Operation: "write temp file", Path: tempPath, Err: err}
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return &ReplayRecoveryError{Operation: "sync temp file", Path: tempPath, Err: err}
	}
	if err := file.Close(); err != nil {
		return &ReplayRecoveryError{Operation: "close temp file", Path: tempPath, Err: err}
	}
	if err := os.Rename(tempPath, path); err != nil {
		return &ReplayRecoveryError{Operation: "replace", Path: path, Err: err}
	}
	removeTemp = false
	if err := syncDirectory(dir); err != nil {
		return &ReplayRecoveryError{Operation: "sync directory", Path: dir, Err: err}
	}
	return nil
}

func syncDirectory(path string) error {
	if runtime.GOOS == "windows" {
		return nil
	}
	dir, err := os.Open(path)
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

func replayStateFromHub(hub *eventHub) replayState {
	state := replayState{
		SchemaVersion: replayStateSchemaVersion,
		StreamID:      hub.streamID,
		Sequence:      hub.sequence,
		Sessions:      make([]replaySession, 0, len(hub.sessionBuffers)),
	}
	for _, buffer := range hub.sessionBuffers {
		session := replaySession{
			SessionID:   buffer.sessionID,
			WorkspaceID: buffer.workspaceID,
			PaneID:      buffer.paneID,
			ProfileID:   buffer.profileID,
			CWD:         buffer.cwd,
			Cols:        buffer.cols,
			Rows:        buffer.rows,
			Status:      buffer.status,
			CreatedAt:   formatReplayTime(buffer.createdAt),
			UpdatedAt:   formatReplayTime(buffer.updatedAt),
			ExitCode:    buffer.exitCode,
			Events:      make([]persistedTerminalEvent, 0, len(buffer.events)),
		}
		for _, retained := range buffer.events {
			session.Events = append(session.Events, persistedTerminalEvent{
				EmittedAt: retained.emittedAt.UTC().Format(time.RFC3339Nano),
				Event:     retained.event,
			})
		}
		state.Sessions = append(state.Sessions, session)
	}
	sort.Slice(state.Sessions, func(left int, right int) bool {
		return state.Sessions[left].SessionID < state.Sessions[right].SessionID
	})
	return state
}

func replayBuffersFromState(state replayState) map[string]*terminalSessionEventBuffer {
	buffers := make(map[string]*terminalSessionEventBuffer, len(state.Sessions))
	for _, session := range state.Sessions {
		buffer := &terminalSessionEventBuffer{
			cols:        session.Cols,
			createdAt:   parseReplayTime(session.CreatedAt),
			cwd:         session.CWD,
			exitCode:    session.ExitCode,
			paneID:      session.PaneID,
			profileID:   session.ProfileID,
			rows:        session.Rows,
			sessionID:   session.SessionID,
			status:      session.Status,
			updatedAt:   parseReplayTime(session.UpdatedAt),
			workspaceID: session.WorkspaceID,
		}
		for _, event := range session.Events {
			emittedAt := parseReplayTime(event.EmittedAt)
			buffer.events = append(buffer.events, retainedTerminalEvent{
				emittedAt: emittedAt,
				event:     event.Event,
			})
			if event.Event.Type == TerminalEventOutput {
				buffer.outputBytes += event.Event.Payload.ByteCount
			}
		}
		buffers[session.SessionID] = buffer
	}
	return buffers
}

func validateReplayState(state replayState) error {
	if state.SchemaVersion != replayStateSchemaVersion {
		return fmt.Errorf("schemaVersion = %d, want %d", state.SchemaVersion, replayStateSchemaVersion)
	}
	if state.StreamID == "" {
		return errors.New("streamId is required")
	}
	if state.Sequence < 0 {
		return fmt.Errorf("sequence must be non-negative: %d", state.Sequence)
	}
	seenSessions := map[string]struct{}{}
	seenSequences := map[int]struct{}{}
	for _, session := range state.Sessions {
		if err := validateReplaySession(state.StreamID, state.Sequence, session, seenSessions, seenSequences); err != nil {
			return err
		}
	}
	return nil
}

func validateReplaySession(
	streamID string,
	stateSequence int,
	session replaySession,
	seenSessions map[string]struct{},
	seenSequences map[int]struct{},
) error {
	if err := validateReplaySessionFields(session, seenSessions); err != nil {
		return err
	}
	for _, retained := range session.Events {
		if err := validateRetainedReplayEvent(streamID, stateSequence, session, retained, seenSequences); err != nil {
			return err
		}
	}
	return nil
}

func validateReplaySessionFields(session replaySession, seenSessions map[string]struct{}) error {
	for _, validation := range []func() error{
		func() error { return validateReplaySessionIdentity(session, seenSessions) },
		func() error { return validateReplaySessionShape(session) },
		func() error { return validateReplaySessionTimes(session) },
	} {
		if err := validation(); err != nil {
			return err
		}
	}
	return nil
}

func validateReplaySessionIdentity(session replaySession, seenSessions map[string]struct{}) error {
	if session.SessionID == "" || session.WorkspaceID == "" || session.PaneID == "" {
		return errors.New("terminal replay session identity is incomplete")
	}
	if session.ProfileID == "" || !filepath.IsAbs(session.CWD) {
		return fmt.Errorf("terminal replay session %s profile or cwd is invalid", session.SessionID)
	}
	if _, exists := seenSessions[session.SessionID]; exists {
		return fmt.Errorf("duplicate terminal replay session %s", session.SessionID)
	}
	seenSessions[session.SessionID] = struct{}{}
	return nil
}

func validateReplaySessionShape(session replaySession) error {
	if session.Cols < 1 || session.Cols > MaxCols || session.Rows < 1 || session.Rows > MaxRows {
		return fmt.Errorf("terminal replay session %s dimensions are invalid", session.SessionID)
	}
	if !validReplaySessionStatus(session.Status) {
		return fmt.Errorf("terminal replay session %s status is invalid: %s", session.SessionID, session.Status)
	}
	return nil
}

func validateReplaySessionTimes(session replaySession) error {
	if _, err := time.Parse(time.RFC3339Nano, session.CreatedAt); err != nil {
		return fmt.Errorf("terminal replay session %s createdAt: %w", session.SessionID, err)
	}
	if _, err := time.Parse(time.RFC3339Nano, session.UpdatedAt); err != nil {
		return fmt.Errorf("terminal replay session %s updatedAt: %w", session.SessionID, err)
	}
	return nil
}

func validReplaySessionStatus(status SessionStatus) bool {
	switch status {
	case SessionStatusStarting, SessionStatusRunning, SessionStatusExited, SessionStatusClosed, SessionStatusError:
		return true
	default:
		return false
	}
}

func validateRetainedReplayEvent(
	streamID string,
	stateSequence int,
	session replaySession,
	retained persistedTerminalEvent,
	seenSequences map[int]struct{},
) error {
	event := retained.Event
	if replayEventMetadataMismatch(streamID, session, event) {
		return fmt.Errorf("terminal replay session %s contains mismatched event metadata", session.SessionID)
	}
	if !validReplayEventType(event.Type) {
		return fmt.Errorf("terminal replay event %s type is invalid: %s", event.EventID, event.Type)
	}
	if event.Sequence <= 0 || event.Sequence > stateSequence {
		return fmt.Errorf("terminal replay event sequence %d is invalid", event.Sequence)
	}
	if _, exists := seenSequences[event.Sequence]; exists {
		return fmt.Errorf("duplicate terminal replay event sequence %d", event.Sequence)
	}
	seenSequences[event.Sequence] = struct{}{}
	if retained.EmittedAt != event.EmittedAt {
		return fmt.Errorf("terminal replay event %s emittedAt mismatch", event.EventID)
	}
	if _, err := time.Parse(time.RFC3339Nano, retained.EmittedAt); err != nil {
		return fmt.Errorf("terminal replay event %s emittedAt: %w", event.EventID, err)
	}
	if event.Type == TerminalEventOutput {
		data, err := base64.StdEncoding.DecodeString(event.Payload.DataBase64)
		if err != nil || len(data) != event.Payload.ByteCount {
			return fmt.Errorf("terminal replay event %s output payload is invalid", event.EventID)
		}
	}
	return nil
}

func replayEventMetadataMismatch(streamID string, session replaySession, event TerminalEvent) bool {
	return event.SchemaVersion != SchemaVersion ||
		event.StreamID != streamID ||
		event.EventID != fmt.Sprintf("%s:%d", streamID, event.Sequence) ||
		event.SessionID != session.SessionID ||
		event.WorkspaceID != session.WorkspaceID ||
		event.PaneID != session.PaneID
}

func validReplayEventType(eventType TerminalEventType) bool {
	switch eventType {
	case TerminalEventOutput,
		TerminalEventStarted,
		TerminalEventExited,
		TerminalEventClosed,
		TerminalEventError,
		TerminalEventBufferTruncated:
		return true
	default:
		return false
	}
}

func formatReplayTime(value time.Time) string {
	if value.IsZero() {
		return time.Unix(0, 0).UTC().Format(time.RFC3339Nano)
	}
	return value.UTC().Format(time.RFC3339Nano)
}

func parseReplayTime(value string) time.Time {
	parsed, _ := time.Parse(time.RFC3339Nano, value)
	return parsed
}
