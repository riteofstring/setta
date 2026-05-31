package chat

import (
	"errors"
	"fmt"
)

type ChatOperationErrorCode string

const (
	ChatOperationErrorImmediateSteeringConflict ChatOperationErrorCode = "immediate_steering_conflict"
	ChatOperationErrorQueuedMessageConflict     ChatOperationErrorCode = "queued_message_conflict"
)

type ChatOperationError struct {
	Code    ChatOperationErrorCode
	Message string
	Err     error
}

func (err *ChatOperationError) Error() string {
	if err.Message != "" {
		return err.Message
	}
	if err.Err != nil {
		return err.Err.Error()
	}
	return string(err.Code)
}

func (err *ChatOperationError) Unwrap() error {
	return err.Err
}

func IsChatOperationError(err error) (*ChatOperationError, bool) {
	var operationError *ChatOperationError
	if errors.As(err, &operationError) {
		return operationError, true
	}
	return nil, false
}

func chatOperationError(code ChatOperationErrorCode, message string, err error) error {
	if message == "" && err == nil {
		message = string(code)
	}
	if message == "" && err != nil {
		message = err.Error()
	}
	return &ChatOperationError{Code: code, Err: err, Message: message}
}

func queuedMessageConflict(messageID string, message string) error {
	return chatOperationError(
		ChatOperationErrorQueuedMessageConflict,
		fmt.Sprintf("queued message %s cannot be changed: %s", messageID, message),
		nil,
	)
}

func immediateSteeringConflict(message string) error {
	return chatOperationError(ChatOperationErrorImmediateSteeringConflict, message, nil)
}
