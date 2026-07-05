package easyrun

import "errors"

type Service struct {
	events *EventHub
	store  *Store
}

func NewService(store *Store) (*Service, error) {
	if store == nil {
		return nil, errors.New("easy-run store is required")
	}
	events, err := NewEventHub(EasyRunEventStreamID)
	if err != nil {
		return nil, err
	}
	return &Service{
		events: events,
		store:  store,
	}, nil
}

func (service *Service) ReadSnapshot(workspaceID string) (EasyRunSnapshot, error) {
	if service == nil {
		return EasyRunSnapshot{}, errors.New("easy-run service is required")
	}
	return service.store.LoadLatestSnapshot(workspaceID, service.events.Cursor())
}

func (service *Service) SubscribeEvents(cursor EasyRunEventCursor) (*EventSubscription, error) {
	if service == nil {
		return nil, errors.New("easy-run service is required")
	}
	return service.events.Subscribe(cursor)
}

func (service *Service) CloseEvents() {
	if service == nil {
		return
	}
	service.events.Close()
}
