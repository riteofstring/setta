package notifications

import (
	"errors"
	"fmt"
	"strings"

	"setta/internal/realtime"
)

type NotificationType = realtime.NotificationType

var (
	ErrProjectConfigIDRequired = errors.New("notification project config id is required")
	ErrNotificationIDRequired  = errors.New("notification id is required")
	ErrNotificationTypeInvalid = errors.New("notification type is invalid")
)

type Notification struct {
	ID              string           `json:"id"`
	ProjectConfigID string           `json:"projectConfigId"`
	Type            NotificationType `json:"type"`
	Message         string           `json:"message"`
	Temporary       bool             `json:"temporary"`
	Timestamp       string           `json:"timestamp"`
	Metadata        map[string]any   `json:"metadata"`
	ReadStatus      bool             `json:"read_status"`
}

func (n Notification) normalized() (Notification, error) {
	normalized := n
	normalized.ID = strings.TrimSpace(normalized.ID)
	if normalized.ID == "" {
		return Notification{}, ErrNotificationIDRequired
	}

	normalized.ProjectConfigID = strings.TrimSpace(normalized.ProjectConfigID)
	if normalized.ProjectConfigID == "" {
		return Notification{}, ErrProjectConfigIDRequired
	}

	switch normalized.Type {
	case realtime.NotificationTypeError, realtime.NotificationTypeWarning, realtime.NotificationTypeInfo, realtime.NotificationTypeSave:
	default:
		return Notification{}, fmt.Errorf("%w: %q", ErrNotificationTypeInvalid, normalized.Type)
	}

	normalized.Timestamp = strings.TrimSpace(normalized.Timestamp)
	if normalized.Timestamp == "" {
		return Notification{}, fmt.Errorf("notification timestamp is required")
	}

	if strings.TrimSpace(normalized.Message) == "" {
		return Notification{}, fmt.Errorf("notification message is required")
	}

	return normalized, nil
}
