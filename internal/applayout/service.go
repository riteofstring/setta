package applayout

import (
	"errors"
	"sync"
)

type Service struct {
	store *Store
	mu    sync.Mutex
}

func NewService(store *Store) (*Service, error) {
	if store == nil {
		return nil, errors.New("app pane layout store is required")
	}
	return &Service{store: store}, nil
}

func (service *Service) ReadLayout() (AppPaneLayoutReadResult, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	return service.store.LoadLayout()
}

func (service *Service) SaveLayout(layout AppPaneLayout) (AppPaneLayout, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	return service.store.SaveLayout(layout)
}
