package app

import (
	"sync"

	"setta/internal/watchcode"
)

type watchCodeServiceRef struct {
	mu         sync.Mutex
	service    *watchcode.Service
	providerID string
}

func newWatchCodeServiceRef() *watchCodeServiceRef {
	return &watchCodeServiceRef{}
}

func (r *watchCodeServiceRef) Current() *watchcode.Service {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.service
}

func (r *watchCodeServiceRef) CurrentProviderID() string {
	if r == nil {
		return ""
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.providerID
}

func (r *watchCodeServiceRef) Replace(providerID string, service *watchcode.Service) error {
	if r == nil {
		return closeWatchCodeService(service)
	}
	r.mu.Lock()
	previous := r.service
	previousProviderID := r.providerID
	r.service = service
	r.providerID = providerID
	r.mu.Unlock()
	if previous == service && previousProviderID == providerID {
		return nil
	}
	return closeWatchCodeService(previous)
}

func (r *watchCodeServiceRef) Close() error {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	service := r.service
	r.service = nil
	r.providerID = ""
	r.mu.Unlock()
	return closeWatchCodeService(service)
}

func (r *watchCodeServiceRef) SyncConfigs(configs map[string]watchcode.ConfigInputs) error {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.service == nil {
		return nil
	}
	return r.service.SyncConfigs(configs)
}
