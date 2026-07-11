package httpapi

import (
	"context"
	"encoding/base64"
	"errors"

	"github.com/coder/websocket"
	"setta/internal/terminal"
)

func (connection *terminalStreamConnection) readLoop() error {
	for {
		messageType, payload, err := connection.connection.Read(connection.ctx)
		if err != nil {
			return err
		}
		if messageType != websocket.MessageText {
			return connection.rejectFrame(errors.New("terminal stream frames must be text JSON"))
		}
		message, err := decodeTerminalStreamClientMessage(payload)
		if err != nil {
			return connection.rejectFrame(err)
		}
		connection.recordFrame(message, len(payload))
		input, ok := message.(*terminal.TerminalStreamInputMessage)
		if !ok {
			return connection.rejectFrame(&terminal.TerminalStreamProtocolError{
				Code:    terminal.TerminalStreamErrorNotReady,
				Message: "terminal stream has already been initialized",
			})
		}
		inputBytes := base64.StdEncoding.DecodedLen(len(input.DataBase64))
		if !connection.inputQueue.push(*input, inputBytes) {
			protocolErr := &terminal.TerminalStreamProtocolError{
				Code:          terminal.TerminalStreamErrorInputBackpressure,
				Message:       "terminal stream input queue is full",
				Retryable:     true,
				SessionID:     input.SessionID,
				InputSequence: input.InputSequence,
			}
			return connection.rejectFrame(protocolErr)
		}
	}
}

func (connection *terminalStreamConnection) inputLoop() error {
	for {
		input, ok := connection.inputQueue.pop(connection.ctx)
		if !ok {
			return nil
		}
		ack, err := connection.handler.terminalService.WriteTerminalStreamInput(connection.ctx, connection.clientID, input)
		if err != nil {
			if enqueueErr := connection.enqueueMessage(terminalStreamProtocolErrorMessage(err)); enqueueErr != nil {
				return enqueueErr
			}
			continue
		}
		connection.handler.recordTerminalStream(TerminalStreamRecord{
			Type:           "terminal_stream_pty_write",
			DeviceID:       connection.deviceID,
			ClientStreamID: connection.clientID,
			SessionID:      ack.SessionID,
			MessageKind:    string(input.Kind),
			InputSequence:  ack.AcknowledgedInputSequence,
			ByteCount:      ack.AcceptedBytes,
		})
		if err := connection.enqueueMessage(ack); err != nil {
			return err
		}
	}
}

func (connection *terminalStreamConnection) eventLoop() error {
	for {
		select {
		case <-connection.ctx.Done():
			return nil
		case event, ok := <-connection.subscription.Events:
			if !ok {
				return errors.New("terminal event subscription closed")
			}
			var message terminal.TerminalStreamServerMessage = terminal.TerminalStreamEventMessage{
				Kind:  terminal.TerminalStreamServerEvent,
				Event: event,
			}
			if event.Type == terminal.TerminalEventBufferTruncated {
				message = terminal.TerminalStreamReplayTruncatedMessage{
					Kind:  terminal.TerminalStreamServerReplayTruncated,
					Event: event,
				}
			}
			connection.handler.recordTerminalStream(TerminalStreamRecord{
				Type:           "terminal_stream_event_emitted",
				DeviceID:       connection.deviceID,
				ClientStreamID: connection.clientID,
				SessionID:      event.SessionID,
				EventID:        event.EventID,
				ByteCount:      event.Payload.ByteCount,
			})
			if err := connection.enqueueMessage(message); err != nil {
				return err
			}
		}
	}
}

func (connection *terminalStreamConnection) writeLoop() error {
	for {
		outbound, ok := connection.outputQueue.pop(connection.ctx)
		if !ok {
			return nil
		}
		if err := connection.connection.Write(connection.ctx, websocket.MessageText, outbound.payload); err != nil {
			return err
		}
		if outbound.closeCode != 0 {
			_ = connection.connection.Close(outbound.closeCode, outbound.closeReason)
			return errTerminalStreamProtocolClosed
		}
	}
}

func (connection *terminalStreamConnection) rejectFrame(err error) error {
	message := terminalStreamProtocolErrorMessage(err)
	code := websocket.StatusPolicyViolation
	if message.Code == terminal.TerminalStreamErrorInputBackpressure {
		code = websocket.StatusTryAgainLater
	}
	if !connection.enqueueFatal(message, code, string(message.Code)) {
		return &terminal.TerminalStreamProtocolError{
			Code:      terminal.TerminalStreamErrorOutputBackpressure,
			Message:   "terminal stream output queue is full",
			Retryable: true,
		}
	}
	<-connection.ctx.Done()
	return nil
}

func (connection *terminalStreamConnection) closeForCause(cause error) {
	code := websocket.StatusNormalClosure
	reason := "terminal_stream_closed"
	switch {
	case errors.Is(cause, errTerminalStreamReplaced):
		code = websocket.StatusPolicyViolation
		reason = "stream_replaced"
	case errors.Is(cause, errTerminalStreamProtocolClosed):
		return
	case cause == nil || errors.Is(cause, context.Canceled):
	case terminalStreamErrorCode(cause) == terminal.TerminalStreamErrorOutputBackpressure:
		code = websocket.StatusTryAgainLater
		reason = string(terminal.TerminalStreamErrorOutputBackpressure)
	default:
		if closeCode := websocket.CloseStatus(cause); closeCode != -1 {
			return
		}
		code = websocket.StatusInternalError
		reason = "internal_error"
	}
	_ = connection.connection.Close(code, reason)
}

func (connection *terminalStreamConnection) recordFrame(message terminal.TerminalStreamClientMessage, wireBytes int) {
	record := TerminalStreamRecord{
		Type:           "terminal_stream_frame_received",
		DeviceID:       connection.deviceID,
		ClientStreamID: connection.clientID,
		ByteCount:      wireBytes,
	}
	switch value := message.(type) {
	case *terminal.TerminalStreamStartMessage:
		record.MessageKind = string(value.Kind)
	case *terminal.TerminalStreamResumeMessage:
		record.MessageKind = string(value.Kind)
	case *terminal.TerminalStreamInputMessage:
		record.MessageKind = string(value.Kind)
		record.SessionID = value.SessionID
		record.InputSequence = value.InputSequence
	}
	connection.handler.recordTerminalStream(record)
}

func (connection *terminalStreamConnection) recordDisconnect() {
	cause := context.Cause(connection.ctx)
	record := TerminalStreamRecord{
		Type:           "terminal_stream_disconnected",
		DeviceID:       connection.deviceID,
		ClientStreamID: connection.clientID,
	}
	if cause != nil {
		record.Code = string(terminalStreamErrorCode(cause))
		record.Reason = cause.Error()
	}
	connection.handler.recordTerminalStream(record)
}

func terminalStreamErrorCode(err error) terminal.TerminalStreamErrorCode {
	var protocolErr *terminal.TerminalStreamProtocolError
	if errors.As(err, &protocolErr) {
		return protocolErr.Code
	}
	if err == nil {
		return ""
	}
	return terminal.TerminalStreamErrorInternal
}
