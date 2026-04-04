package notifications

import (
	"errors"
	"path/filepath"
	"testing"
)

func TestStoreListByProjectAndDelete(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store, err := NewStore(root)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	if err := store.Write([]Notification{
		{
			ID:              "notification-1",
			ProjectConfigID: "project-alpha",
			Type:            TypeInfo,
			Message:         "Alpha note",
			Timestamp:       "2026-03-10T10:00:00Z",
		},
		{
			ID:              "notification-2",
			ProjectConfigID: "project-beta",
			Type:            TypeWarning,
			Message:         "Beta note",
			Timestamp:       "2026-03-10T11:00:00Z",
		},
	}); err != nil {
		t.Fatalf("write notifications: %v", err)
	}

	alphaNotifications, err := store.ListByProject("project-alpha")
	if err != nil {
		t.Fatalf("list alpha notifications: %v", err)
	}
	if len(alphaNotifications) != 1 || alphaNotifications[0].ID != "notification-1" {
		t.Fatalf("unexpected alpha notifications %#v", alphaNotifications)
	}

	deleted, err := store.Delete("notification-1")
	if err != nil {
		t.Fatalf("delete notification: %v", err)
	}
	if !deleted {
		t.Fatal("expected notification delete to succeed")
	}

	remaining, err := store.List()
	if err != nil {
		t.Fatalf("list remaining notifications: %v", err)
	}
	if len(remaining) != 1 || remaining[0].ID != "notification-2" {
		t.Fatalf("unexpected remaining notifications %#v", remaining)
	}

	if store.Path() != filepath.Join(root, fileName) {
		t.Fatalf("unexpected store path %q", store.Path())
	}
}

func TestServiceGetNotificationsRejectsBlankProjectID(t *testing.T) {
	t.Parallel()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	service, err := NewService(ServiceOptions{Store: store})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	_, err = service.GetNotifications(t.Context(), " ")
	if err == nil {
		t.Fatal("expected blank project id error")
	}
	if !errors.Is(err, ErrProjectConfigIDRequired) {
		t.Fatalf("expected ErrProjectConfigIDRequired, got %v", err)
	}
}
