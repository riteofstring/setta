package terminal

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"sort"
	"sync"
)

const terminalStreamDedupeSequenceLimit = 8192

type streamInputRegistry struct {
	mu      sync.Mutex
	streams map[string]*streamInputClient
}

type streamInputClient struct {
	sessions map[string]*streamInputSession
	mu       sync.Mutex
}

type streamInputSession struct {
	acknowledged int
	hashes       map[int][sha256.Size]byte
	mu           sync.Mutex
}

func newStreamInputRegistry() *streamInputRegistry {
	return &streamInputRegistry{streams: map[string]*streamInputClient{}}
}

func (manager *Manager) StartTerminalStream(clientStreamID string) ([]TerminalStreamSessionState, error) {
	if clientStreamID == "" {
		return nil, protocolError(TerminalStreamErrorIdentityMismatch, "client stream id is required", false, "", 0)
	}
	manager.streamInputs.mu.Lock()
	defer manager.streamInputs.mu.Unlock()
	if _, exists := manager.streamInputs.streams[clientStreamID]; exists {
		return nil, protocolError(TerminalStreamErrorIdentityMismatch, "client stream already exists; resume it instead", true, "", 0)
	}
	manager.streamInputs.streams[clientStreamID] = &streamInputClient{sessions: map[string]*streamInputSession{}}
	return []TerminalStreamSessionState{}, nil
}

func (manager *Manager) ResumeTerminalStream(clientStreamID string, sessions []TerminalStreamResumeSession) ([]TerminalStreamSessionState, error) {
	manager.streamInputs.mu.Lock()
	client := manager.streamInputs.streams[clientStreamID]
	manager.streamInputs.mu.Unlock()
	if client == nil {
		return nil, protocolError(TerminalStreamErrorIdentityMismatch, "client stream is no longer available", false, "", 0)
	}
	seen := map[string]bool{}
	for _, resume := range sessions {
		if resume.SessionID == "" || seen[resume.SessionID] {
			return nil, protocolError(TerminalStreamErrorMalformedFrame, "resume sessions must have unique non-empty session ids", false, resume.SessionID, 0)
		}
		seen[resume.SessionID] = true
		state := client.session(resume.SessionID)
		state.mu.Lock()
		if resume.LastAcknowledgedInputSequence < 0 || resume.LastAcknowledgedInputSequence > state.acknowledged {
			state.mu.Unlock()
			return nil, protocolError(TerminalStreamErrorInputSequenceConflict, "resume acknowledgement exceeds the server acknowledgement", false, resume.SessionID, resume.LastAcknowledgedInputSequence)
		}
		state.mu.Unlock()
	}
	return client.snapshot(), nil
}

func (manager *Manager) WriteTerminalStreamInput(ctx context.Context, clientStreamID string, input TerminalStreamInputMessage) (TerminalStreamInputAckMessage, error) {
	manager.streamInputs.mu.Lock()
	client := manager.streamInputs.streams[clientStreamID]
	manager.streamInputs.mu.Unlock()
	if client == nil {
		return TerminalStreamInputAckMessage{}, protocolError(TerminalStreamErrorIdentityMismatch, "client stream is no longer available", false, input.SessionID, input.InputSequence)
	}
	data, err := decodeStreamInput(input)
	if err != nil {
		return TerminalStreamInputAckMessage{}, err
	}
	state := client.session(input.SessionID)
	state.mu.Lock()
	defer state.mu.Unlock()
	hash := sha256.Sum256(data)
	if input.InputSequence <= state.acknowledged {
		if acceptedHash, ok := state.hashes[input.InputSequence]; ok && bytes.Equal(acceptedHash[:], hash[:]) {
			return inputAck(input.SessionID, state.acknowledged, len(data)), nil
		}
		return TerminalStreamInputAckMessage{}, protocolError(TerminalStreamErrorInputSequenceConflict, "input sequence was already accepted with different or expired bytes", false, input.SessionID, input.InputSequence)
	}
	if input.InputSequence != state.acknowledged+1 {
		return TerminalStreamInputAckMessage{}, protocolError(TerminalStreamErrorInputSequenceGap, fmt.Sprintf("input sequence %d must follow %d", input.InputSequence, state.acknowledged), true, input.SessionID, input.InputSequence)
	}
	if _, err := manager.runningSession(input.SessionID); err != nil {
		return TerminalStreamInputAckMessage{}, protocolError(TerminalStreamErrorSessionNotFound, err.Error(), false, input.SessionID, input.InputSequence)
	}
	written, err := manager.WriteInput(ctx, input.SessionID, data)
	if err != nil {
		return TerminalStreamInputAckMessage{}, protocolError(TerminalStreamErrorInternal, err.Error(), false, input.SessionID, input.InputSequence)
	}
	if written != len(data) {
		return TerminalStreamInputAckMessage{}, protocolError(TerminalStreamErrorInternal, fmt.Sprintf("terminal input wrote %d of %d bytes", written, len(data)), false, input.SessionID, input.InputSequence)
	}
	state.acknowledged = input.InputSequence
	state.hashes[input.InputSequence] = hash
	delete(state.hashes, input.InputSequence-terminalStreamDedupeSequenceLimit)
	return inputAck(input.SessionID, state.acknowledged, written), nil
}

func decodeStreamInput(input TerminalStreamInputMessage) ([]byte, error) {
	if input.SessionID == "" || input.InputSequence <= 0 {
		return nil, protocolError(TerminalStreamErrorMalformedFrame, "terminal input requires a session id and positive sequence", false, input.SessionID, input.InputSequence)
	}
	if base64.StdEncoding.DecodedLen(len(input.DataBase64)) > TerminalStreamMaxInputBytes {
		return nil, protocolError(TerminalStreamErrorInputTooLarge, fmt.Sprintf("terminal stream input exceeds %d bytes", TerminalStreamMaxInputBytes), false, input.SessionID, input.InputSequence)
	}
	data, err := base64.StdEncoding.DecodeString(input.DataBase64)
	if err != nil {
		return nil, protocolError(TerminalStreamErrorMalformedFrame, "terminal input dataBase64 must be valid base64", false, input.SessionID, input.InputSequence)
	}
	if len(data) == 0 || len(data) > TerminalStreamMaxInputBytes {
		return nil, protocolError(TerminalStreamErrorInputTooLarge, fmt.Sprintf("terminal stream input must contain 1-%d bytes", TerminalStreamMaxInputBytes), false, input.SessionID, input.InputSequence)
	}
	return data, nil
}

func (client *streamInputClient) session(sessionID string) *streamInputSession {
	client.mu.Lock()
	defer client.mu.Unlock()
	state := client.sessions[sessionID]
	if state == nil {
		state = &streamInputSession{hashes: map[int][sha256.Size]byte{}}
		client.sessions[sessionID] = state
	}
	return state
}

func (client *streamInputClient) snapshot() []TerminalStreamSessionState {
	client.mu.Lock()
	defer client.mu.Unlock()
	states := make([]TerminalStreamSessionState, 0, len(client.sessions))
	for sessionID, state := range client.sessions {
		state.mu.Lock()
		states = append(states, TerminalStreamSessionState{SessionID: sessionID, AcknowledgedInputSequence: state.acknowledged})
		state.mu.Unlock()
	}
	sort.Slice(states, func(left int, right int) bool { return states[left].SessionID < states[right].SessionID })
	return states
}

func inputAck(sessionID string, sequence int, acceptedBytes int) TerminalStreamInputAckMessage {
	return TerminalStreamInputAckMessage{
		Kind:                      TerminalStreamServerInputAck,
		SessionID:                 sessionID,
		AcknowledgedInputSequence: sequence,
		AcceptedBytes:             acceptedBytes,
	}
}

func protocolError(code TerminalStreamErrorCode, message string, retryable bool, sessionID string, sequence int) error {
	return &TerminalStreamProtocolError{Code: code, Message: message, Retryable: retryable, SessionID: sessionID, InputSequence: sequence}
}
