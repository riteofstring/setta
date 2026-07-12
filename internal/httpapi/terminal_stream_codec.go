package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/jsonio"
	"setta/internal/terminal"
)

func decodeTerminalStreamClientMessage(payload []byte) (terminal.TerminalStreamClientMessage, error) {
	var envelope struct {
		Kind terminal.TerminalStreamClientMessageKind `json:"kind"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return nil, fmt.Errorf("decode terminal stream frame kind: %w", err)
	}
	var target terminal.TerminalStreamClientMessage
	switch envelope.Kind {
	case terminal.TerminalStreamClientStart:
		target = &terminal.TerminalStreamStartMessage{}
	case terminal.TerminalStreamClientResume:
		target = &terminal.TerminalStreamResumeMessage{}
	case terminal.TerminalStreamClientInput:
		target = &terminal.TerminalStreamInputMessage{}
	default:
		return nil, &terminal.TerminalStreamProtocolError{
			Code:    terminal.TerminalStreamErrorUnsupportedMessage,
			Message: fmt.Sprintf("unsupported terminal stream frame kind %q", envelope.Kind),
		}
	}
	if err := jsonio.DecodeSingle(bytes.NewReader(payload), target); err != nil {
		return nil, fmt.Errorf("decode terminal stream %s frame: %w", envelope.Kind, err)
	}
	if err := validateTerminalStreamMessageKind(envelope.Kind, target); err != nil {
		return nil, err
	}
	return target, nil
}

func validateTerminalStreamMessageKind(kind terminal.TerminalStreamClientMessageKind, message terminal.TerminalStreamClientMessage) error {
	switch value := message.(type) {
	case *terminal.TerminalStreamStartMessage:
		if value.Kind != terminal.TerminalStreamClientStart {
			return fmt.Errorf("terminal stream start frame kind must be %s", terminal.TerminalStreamClientStart)
		}
	case *terminal.TerminalStreamResumeMessage:
		if value.Kind != terminal.TerminalStreamClientResume {
			return fmt.Errorf("terminal stream resume frame kind must be %s", terminal.TerminalStreamClientResume)
		}
	case *terminal.TerminalStreamInputMessage:
		if value.Kind != terminal.TerminalStreamClientInput {
			return fmt.Errorf("terminal stream input frame kind must be %s", terminal.TerminalStreamClientInput)
		}
	default:
		return fmt.Errorf("unsupported decoded terminal stream frame %T", message)
	}
	if kind == "" {
		return fmt.Errorf("terminal stream frame kind is required")
	}
	return nil
}

func terminalStreamProtocolErrorMessage(err error) terminal.TerminalStreamErrorMessage {
	message := terminal.TerminalStreamErrorMessage{
		Kind:    terminal.TerminalStreamServerError,
		Code:    terminal.TerminalStreamErrorMalformedFrame,
		Message: err.Error(),
	}
	var protocolErr *terminal.TerminalStreamProtocolError
	if errors.As(err, &protocolErr) {
		message.Code = protocolErr.Code
		message.Retryable = protocolErr.Retryable
		message.SessionID = protocolErr.SessionID
		message.InputSequence = protocolErr.InputSequence
	}
	return message
}
