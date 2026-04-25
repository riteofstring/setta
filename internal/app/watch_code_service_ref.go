package app

import (
	"sync"

	"setta/internal/watchcode"
)

type watchCodeServiceRef struct {
	mu      sync.Mutex
	service *watchcode.Service
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

func (r *watchCodeServiceRef) Replace(service *watchcode.Service) error {
	if r == nil {
		return closeWatchCodeService(service)
	}
	r.mu.Lock()
	previous := r.service
	r.service = service
	r.mu.Unlock()
	if previous == service {
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

func closeWatchCodeServiceResource(ref *watchCodeServiceRef, fallback *watchcode.Service) error {
	if ref != nil {
		return ref.Close()
	}
	return closeWatchCodeService(fallback)
}
