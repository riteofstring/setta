package notifications

import (
	"context"
	"errors"
)

var ErrStoreRequired = errors.New("notifications service requires a store")

type ServiceOptions struct {
	Store *Store
}

type Service struct {
	store *Store
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.Store == nil {
		return nil, ErrStoreRequired
	}
	return &Service{store: options.Store}, nil
}

func (s *Service) GetNotifications(_ context.Context, projectConfigID string) ([]Notification, error) {
	if s == nil || s.store == nil {
		return nil, ErrStoreRequired
	}
	return s.store.ListByProject(projectConfigID)
}

func (s *Service) DeleteNotification(_ context.Context, notificationID string) (bool, error) {
	if s == nil || s.store == nil {
		return false, ErrStoreRequired
	}
	return s.store.Delete(notificationID)
}
