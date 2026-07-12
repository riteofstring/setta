package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/coder/websocket"
	"setta/internal/terminal"
)

const (
	terminalStreamHandshakeTimeout = 5 * time.Second
	terminalStreamInputQueueItems  = 1024
	terminalStreamOutputQueueItems = 4096
	terminalStreamReadLimitBytes   = 128 * 1024
)

var errTerminalStreamProtocolClosed = errors.New("terminal stream closed after protocol error")

type terminalStreamConnection struct {
	cancel       context.CancelCauseFunc
	clientID     string
	connection   *websocket.Conn
	ctx          context.Context
	deviceID     string
	eventCursor  terminal.TerminalStreamEventCursor
	handler      handler
	inputQueue   *terminalStreamByteQueue[terminal.TerminalStreamInputMessage]
	outputQueue  *terminalStreamByteQueue[terminalStreamOutbound]
	serverID     string
	sessions     []terminal.TerminalStreamSessionState
	subscription *terminal.EventSubscription
}

type terminalStreamOutbound struct {
	closeCode   websocket.StatusCode
	closeReason string
	payload     []byte
}

func (handler handler) serveTerminalStream(parent context.Context, websocketConnection *websocket.Conn, ticket terminalStreamTicket) {
	connection, err := handler.initializeTerminalStream(parent, websocketConnection, ticket)
	if err != nil {
		handler.writeTerminalStreamInitializationError(parent, websocketConnection, ticket, err)
		return
	}
	registrationID := handler.terminalStreamConnections.register(connection.clientID, connection.cancel)
	defer handler.terminalStreamConnections.unregister(connection.clientID, registrationID)
	defer connection.subscription.Unsubscribe()
	defer connection.recordDisconnect()

	if err := connection.enqueueMessage(terminal.TerminalStreamReadyMessage{
		Kind:                terminal.TerminalStreamServerReady,
		ProtocolVersion:     terminal.TerminalStreamProtocolVersion,
		ClientStreamID:      connection.clientID,
		ServerStreamID:      connection.serverID,
		EventCursor:         connection.eventCursor,
		Sessions:            connection.sessions,
		MaxInputBytes:       terminal.TerminalStreamMaxInputBytes,
		MaxQueuedInputBytes: terminal.TerminalStreamQueuedInputBytes,
	}); err != nil {
		connection.cancel(err)
	}
	connection.run()
}

func (handler handler) initializeTerminalStream(parent context.Context, websocketConnection *websocket.Conn, ticket terminalStreamTicket) (*terminalStreamConnection, error) {
	service := handler.terminalService
	if service == nil {
		return nil, errors.New("terminal service is unavailable")
	}
	websocketConnection.SetReadLimit(terminalStreamReadLimitBytes)
	handshakeCtx, cancelHandshake := context.WithTimeout(parent, terminalStreamHandshakeTimeout)
	defer cancelHandshake()
	messageType, payload, err := websocketConnection.Read(handshakeCtx)
	if err != nil {
		return nil, fmt.Errorf("read terminal stream initialization frame: %w", err)
	}
	if messageType != websocket.MessageText {
		return nil, errors.New("terminal stream frames must be text JSON")
	}
	message, err := decodeTerminalStreamClientMessage(payload)
	if err != nil {
		return nil, err
	}
	clientID, cursor, sessions, err := initializeTerminalStreamState(service, ticket, message)
	if err != nil {
		return nil, err
	}
	subscription, err := service.SubscribeEvents(terminal.EventCursor{StreamID: cursor.StreamID, Sequence: cursor.AfterSequence})
	if err != nil {
		return nil, &terminal.TerminalStreamProtocolError{Code: terminal.TerminalStreamErrorEventCursorUnavailable, Message: err.Error()}
	}
	serverID, err := newTerminalStreamServerID()
	if err != nil {
		subscription.Unsubscribe()
		return nil, err
	}
	ctx, cancel := context.WithCancelCause(parent)
	connection := &terminalStreamConnection{
		cancel:       cancel,
		clientID:     clientID,
		connection:   websocketConnection,
		ctx:          ctx,
		deviceID:     ticket.deviceID,
		eventCursor:  cursor,
		handler:      handler,
		inputQueue:   newTerminalStreamByteQueue[terminal.TerminalStreamInputMessage](terminal.TerminalStreamQueuedInputBytes, terminalStreamInputQueueItems),
		outputQueue:  newTerminalStreamByteQueue[terminalStreamOutbound](handler.terminalStreamOutputQueueBytes, terminalStreamOutputQueueItems),
		serverID:     serverID,
		sessions:     sessions,
		subscription: subscription,
	}
	connection.recordFrame(message, len(payload))
	return connection, nil
}

func initializeTerminalStreamState(service TerminalService, ticket terminalStreamTicket, message terminal.TerminalStreamClientMessage) (string, terminal.TerminalStreamEventCursor, []terminal.TerminalStreamSessionState, error) {
	switch value := message.(type) {
	case *terminal.TerminalStreamStartMessage:
		if value.ClientStreamID != ticket.clientStreamID {
			return "", terminal.TerminalStreamEventCursor{}, nil, &terminal.TerminalStreamProtocolError{Code: terminal.TerminalStreamErrorIdentityMismatch, Message: "ticket and start frame client stream ids do not match"}
		}
		sessions, err := service.StartTerminalStream(value.ClientStreamID)
		return value.ClientStreamID, value.EventCursor, sessions, err
	case *terminal.TerminalStreamResumeMessage:
		if value.ClientStreamID != ticket.clientStreamID {
			return "", terminal.TerminalStreamEventCursor{}, nil, &terminal.TerminalStreamProtocolError{Code: terminal.TerminalStreamErrorIdentityMismatch, Message: "ticket and resume frame client stream ids do not match"}
		}
		sessions, err := service.ResumeTerminalStream(value.ClientStreamID, value.Sessions)
		return value.ClientStreamID, value.EventCursor, sessions, err
	default:
		return "", terminal.TerminalStreamEventCursor{}, nil, &terminal.TerminalStreamProtocolError{Code: terminal.TerminalStreamErrorNotReady, Message: "terminal stream must begin with start or resume"}
	}
}

func (connection *terminalStreamConnection) run() {
	loops := []func() error{
		connection.readLoop,
		connection.inputLoop,
		connection.eventLoop,
		connection.writeLoop,
	}
	for _, loop := range loops {
		go func(run func() error) {
			if err := run(); err != nil {
				connection.cancel(err)
			}
		}(loop)
	}
	<-connection.ctx.Done()
	connection.closeForCause(context.Cause(connection.ctx))
}

func (connection *terminalStreamConnection) enqueueMessage(message terminal.TerminalStreamServerMessage) error {
	payload, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("marshal terminal stream message %T: %w", message, err)
	}
	if !connection.outputQueue.push(terminalStreamOutbound{payload: payload}, len(payload)) {
		return &terminal.TerminalStreamProtocolError{Code: terminal.TerminalStreamErrorOutputBackpressure, Message: "terminal stream output queue is full", Retryable: true}
	}
	return nil
}

func (connection *terminalStreamConnection) enqueueFatal(message terminal.TerminalStreamErrorMessage, code websocket.StatusCode, reason string) bool {
	payload, err := json.Marshal(message)
	if err != nil {
		return false
	}
	return connection.outputQueue.push(terminalStreamOutbound{payload: payload, closeCode: code, closeReason: reason}, len(payload))
}

func (handler handler) writeTerminalStreamInitializationError(ctx context.Context, connection *websocket.Conn, ticket terminalStreamTicket, err error) {
	message := terminalStreamProtocolErrorMessage(err)
	payload, marshalErr := json.Marshal(message)
	if marshalErr == nil {
		_ = connection.Write(ctx, websocket.MessageText, payload)
	}
	_ = connection.Close(websocket.StatusPolicyViolation, string(message.Code))
	handler.recordTerminalStream(TerminalStreamRecord{
		Type:           "terminal_stream_disconnected",
		DeviceID:       ticket.deviceID,
		ClientStreamID: ticket.clientStreamID,
		Code:           string(message.Code),
		Reason:         message.Message,
	})
}

func newTerminalStreamServerID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return "terminal_stream_" + hex.EncodeToString(bytes), nil
}
