package terminal

const (
	TerminalStreamTicketTTLSeconds = 30
	TerminalStreamMaxInputBytes    = 64 * 1024
	TerminalStreamQueuedInputBytes = 256 * 1024
	TerminalStreamProtocolVersion  = 1
)

type TerminalStreamClientMessageKind string

const (
	TerminalStreamClientStart  TerminalStreamClientMessageKind = "terminal.stream.start"
	TerminalStreamClientResume TerminalStreamClientMessageKind = "terminal.stream.resume"
	TerminalStreamClientInput  TerminalStreamClientMessageKind = "terminal.stream.input"
)

type TerminalStreamServerMessageKind string

const (
	TerminalStreamServerReady           TerminalStreamServerMessageKind = "terminal.stream.ready"
	TerminalStreamServerInputAck        TerminalStreamServerMessageKind = "terminal.stream.inputAck"
	TerminalStreamServerEvent           TerminalStreamServerMessageKind = "terminal.stream.event"
	TerminalStreamServerReplayTruncated TerminalStreamServerMessageKind = "terminal.stream.replayTruncated"
	TerminalStreamServerError           TerminalStreamServerMessageKind = "terminal.stream.error"
)

type TerminalStreamErrorCode string

const (
	TerminalStreamErrorMalformedFrame         TerminalStreamErrorCode = "malformed_frame"
	TerminalStreamErrorUnsupportedMessage     TerminalStreamErrorCode = "unsupported_message"
	TerminalStreamErrorNotReady               TerminalStreamErrorCode = "stream_not_ready"
	TerminalStreamErrorIdentityMismatch       TerminalStreamErrorCode = "stream_identity_mismatch"
	TerminalStreamErrorSessionNotFound        TerminalStreamErrorCode = "session_not_found"
	TerminalStreamErrorInputSequenceGap       TerminalStreamErrorCode = "input_sequence_gap"
	TerminalStreamErrorInputSequenceConflict  TerminalStreamErrorCode = "input_sequence_conflict"
	TerminalStreamErrorInputTooLarge          TerminalStreamErrorCode = "input_too_large"
	TerminalStreamErrorInputBackpressure      TerminalStreamErrorCode = "input_backpressure"
	TerminalStreamErrorEventCursorUnavailable TerminalStreamErrorCode = "event_cursor_unavailable"
	TerminalStreamErrorInternal               TerminalStreamErrorCode = "internal_error"
)

// TerminalStreamClientMessage is the JSON frame sent by a terminal client.
// A connection must begin with exactly one start or resume frame before input.
type TerminalStreamClientMessage interface {
	terminalStreamClientMessage()
}

type TerminalStreamStartMessage struct {
	Kind           TerminalStreamClientMessageKind `json:"kind"`
	ClientStreamID string                          `json:"clientStreamId"`
	EventCursor    TerminalStreamEventCursor       `json:"eventCursor"`
}

func (TerminalStreamStartMessage) terminalStreamClientMessage() {}

type TerminalStreamResumeMessage struct {
	Kind           TerminalStreamClientMessageKind `json:"kind"`
	ClientStreamID string                          `json:"clientStreamId"`
	EventCursor    TerminalStreamEventCursor       `json:"eventCursor"`
	Sessions       []TerminalStreamResumeSession   `json:"sessions"`
}

func (TerminalStreamResumeMessage) terminalStreamClientMessage() {}

// TerminalStreamInputMessage sequences input independently per session. The
// first sequence is 1. A repeated sequence with identical bytes is deduplicated;
// different bytes at an accepted sequence are a conflict, and a sequence above
// the next expected value is a gap.
type TerminalStreamInputMessage struct {
	Kind          TerminalStreamClientMessageKind `json:"kind"`
	SessionID     string                          `json:"sessionId"`
	InputSequence int                             `json:"inputSequence"`
	DataBase64    string                          `json:"dataBase64"`
}

func (TerminalStreamInputMessage) terminalStreamClientMessage() {}

type TerminalStreamEventCursor struct {
	StreamID      string `json:"streamId"`
	AfterSequence int    `json:"afterSequence"`
}

type TerminalStreamResumeSession struct {
	SessionID                     string `json:"sessionId"`
	LastAcknowledgedInputSequence int    `json:"lastAcknowledgedInputSequence"`
}

// TerminalStreamServerMessage is the JSON frame sent by the runtime.
type TerminalStreamServerMessage interface {
	terminalStreamServerMessage()
}

type TerminalStreamReadyMessage struct {
	Kind                TerminalStreamServerMessageKind `json:"kind"`
	ProtocolVersion     int                             `json:"protocolVersion"`
	ClientStreamID      string                          `json:"clientStreamId"`
	ServerStreamID      string                          `json:"serverStreamId"`
	EventCursor         TerminalStreamEventCursor       `json:"eventCursor"`
	Sessions            []TerminalStreamSessionState    `json:"sessions"`
	MaxInputBytes       int                             `json:"maxInputBytes"`
	MaxQueuedInputBytes int                             `json:"maxQueuedInputBytes"`
}

func (TerminalStreamReadyMessage) terminalStreamServerMessage() {}

// TerminalStreamInputAckMessage acknowledges the highest contiguous sequence
// written to the PTY. Clients retain later input until it is acknowledged and
// replay it after a successful resume.
type TerminalStreamInputAckMessage struct {
	Kind                      TerminalStreamServerMessageKind `json:"kind"`
	SessionID                 string                          `json:"sessionId"`
	AcknowledgedInputSequence int                             `json:"acknowledgedInputSequence"`
	AcceptedBytes             int                             `json:"acceptedBytes"`
}

func (TerminalStreamInputAckMessage) terminalStreamServerMessage() {}

type TerminalStreamEventMessage struct {
	Kind  TerminalStreamServerMessageKind `json:"kind"`
	Event TerminalEvent                   `json:"event"`
}

func (TerminalStreamEventMessage) terminalStreamServerMessage() {}

// TerminalStreamReplayTruncatedMessage carries the existing terminal buffer
// truncation event as an explicit stream frame.
type TerminalStreamReplayTruncatedMessage struct {
	Kind  TerminalStreamServerMessageKind `json:"kind"`
	Event TerminalEvent                   `json:"event"`
}

func (TerminalStreamReplayTruncatedMessage) terminalStreamServerMessage() {}

type TerminalStreamErrorMessage struct {
	Kind          TerminalStreamServerMessageKind `json:"kind"`
	Code          TerminalStreamErrorCode         `json:"code"`
	Message       string                          `json:"message"`
	Retryable     bool                            `json:"retryable"`
	SessionID     string                          `json:"sessionId"`
	InputSequence int                             `json:"inputSequence"`
}

func (TerminalStreamErrorMessage) terminalStreamServerMessage() {}

type TerminalStreamSessionState struct {
	SessionID                 string `json:"sessionId"`
	AcknowledgedInputSequence int    `json:"acknowledgedInputSequence"`
}
