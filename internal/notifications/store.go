package notifications

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/statefs"
)

const (
	fileName      = "notifications.json"
	storeFileMode = 0o644
)

var ErrRootRequired = errors.New("notifications root is required")

type Store struct {
	root string
	path string
}

func NewStore(root string) (*Store, error) {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		if strings.TrimSpace(root) == "" {
			return nil, ErrRootRequired
		}
		return nil, err
	}
	return &Store{
		root: resolvedRoot,
		path: filepath.Join(resolvedRoot, fileName),
	}, nil
}

func (s *Store) Path() string {
	if s == nil {
		return ""
	}
	return s.path
}

func (s *Store) List() ([]Notification, error) {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return nil, ErrRootRequired
	}

	content, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Notification{}, nil
		}
		return nil, fmt.Errorf("read notifications: %w", err)
	}
	return decodeNotifications(content)
}

func (s *Store) Write(notifications []Notification) error {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return ErrRootRequired
	}

	normalized := make([]Notification, 0, len(notifications))
	for _, notification := range notifications {
		entry, err := notification.normalized()
		if err != nil {
			return err
		}
		normalized = append(normalized, entry)
	}

	content, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return fmt.Errorf("encode notifications: %w", err)
	}
	content = append(content, '\n')
	if err := statefs.AtomicWriteFile(s.path, content, storeFileMode); err != nil {
		return fmt.Errorf("write notifications: %w", err)
	}
	return nil
}

func (s *Store) ListByProject(projectConfigID string) ([]Notification, error) {
	if s == nil {
		return nil, ErrRootRequired
	}
	trimmedProjectConfigID := strings.TrimSpace(projectConfigID)
	if trimmedProjectConfigID == "" {
		return nil, ErrProjectConfigIDRequired
	}

	notifications, err := s.List()
	if err != nil {
		return nil, err
	}

	filtered := make([]Notification, 0, len(notifications))
	for _, notification := range notifications {
		if notification.ProjectConfigID == trimmedProjectConfigID {
			filtered = append(filtered, notification)
		}
	}
	return filtered, nil
}

func (s *Store) Delete(notificationID string) (bool, error) {
	if s == nil {
		return false, ErrRootRequired
	}
	trimmedNotificationID := strings.TrimSpace(notificationID)
	if trimmedNotificationID == "" {
		return false, ErrNotificationIDRequired
	}

	notifications, err := s.List()
	if err != nil {
		return false, err
	}

	for index, notification := range notifications {
		if notification.ID != trimmedNotificationID {
			continue
		}
		notifications = append(notifications[:index], notifications[index+1:]...)
		if err := s.Write(notifications); err != nil {
			return false, err
		}
		return true, nil
	}
	return false, nil
}

func decodeNotifications(content []byte) ([]Notification, error) {
	trimmed := bytes.TrimSpace(content)
	if len(trimmed) == 0 {
		return []Notification{}, nil
	}

	var payload any
	if err := json.Unmarshal(trimmed, &payload); err != nil {
		return nil, fmt.Errorf("decode notifications: %w", err)
	}
	if payload == nil {
		return []Notification{}, nil
	}

	rawEntries, ok := payload.([]any)
	if !ok {
		return nil, fmt.Errorf("notifications file must contain a JSON array")
	}

	notifications := make([]Notification, 0, len(rawEntries))
	for index, rawEntry := range rawEntries {
		entryContent, err := json.Marshal(rawEntry)
		if err != nil {
			return nil, fmt.Errorf("encode notification %d: %w", index, err)
		}

		decoder := json.NewDecoder(bytes.NewReader(entryContent))
		decoder.DisallowUnknownFields()
		var entry Notification
		if err := decoder.Decode(&entry); err != nil {
			return nil, fmt.Errorf("decode notification %d: %w", index, err)
		}

		normalized, err := entry.normalized()
		if err != nil {
			return nil, err
		}
		notifications = append(notifications, normalized)
	}

	return notifications, nil
}
