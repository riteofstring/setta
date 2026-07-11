package httpapi

import (
	"context"
	"errors"
	"sync"
	"time"
)

const defaultTerminalStreamOutputQueueBytes = 4 * 1024 * 1024

var errTerminalStreamReplaced = errors.New("terminal stream replaced by a newer connection")

type TerminalStreamRecorder interface {
	RecordTerminalStream(TerminalStreamRecord)
}

type TerminalStreamRecord struct {
	At             string `json:"at"`
	Type           string `json:"type"`
	RuntimeID      string `json:"runtimeId"`
	DeviceID       string `json:"deviceId"`
	ClientStreamID string `json:"clientStreamId"`
	SessionID      string `json:"sessionId"`
	MessageKind    string `json:"messageKind"`
	InputSequence  int    `json:"inputSequence"`
	EventID        string `json:"eventId"`
	ByteCount      int    `json:"byteCount"`
	Code           string `json:"code"`
	Reason         string `json:"reason"`
}

type terminalStreamConnectionRegistry struct {
	active map[string]terminalStreamConnectionRegistration
	mu     sync.Mutex
	nextID int
}

type terminalStreamConnectionRegistration struct {
	cancel context.CancelCauseFunc
	id     int
}

func newTerminalStreamConnectionRegistry() *terminalStreamConnectionRegistry {
	return &terminalStreamConnectionRegistry{active: map[string]terminalStreamConnectionRegistration{}}
}

func (registry *terminalStreamConnectionRegistry) register(clientStreamID string, cancel context.CancelCauseFunc) int {
	registry.mu.Lock()
	previous := registry.active[clientStreamID]
	registry.nextID++
	id := registry.nextID
	registry.active[clientStreamID] = terminalStreamConnectionRegistration{cancel: cancel, id: id}
	registry.mu.Unlock()
	if previous.cancel != nil {
		previous.cancel(errTerminalStreamReplaced)
	}
	return id
}

func (registry *terminalStreamConnectionRegistry) unregister(clientStreamID string, id int) {
	registry.mu.Lock()
	defer registry.mu.Unlock()
	if registry.active[clientStreamID].id == id {
		delete(registry.active, clientStreamID)
	}
}

func (handler handler) recordTerminalStream(record TerminalStreamRecord) {
	if handler.terminalStreamRecorder == nil {
		return
	}
	if record.At == "" {
		record.At = time.Now().UTC().Format(time.RFC3339Nano)
	}
	record.RuntimeID = handler.runtimeMetadata.ID
	handler.terminalStreamRecorder.RecordTerminalStream(record)
}
