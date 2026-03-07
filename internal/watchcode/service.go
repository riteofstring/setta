package watchcode

import (
	"context"
	"fmt"
	"os"
	"sync"
	"time"
)

const defaultPollInterval = 300 * time.Millisecond

type FileUpdate struct {
	ConfigID     string
	Path         string
	Raw          string
	BaselineOnly bool
	MovedFrom    string
}

type ServiceOptions struct {
	WorkspaceRoot string
	PollInterval  time.Duration
	OnFileUpdate  func(context.Context, FileUpdate) error
	OnFileDelete  func(context.Context, DeleteRequest) error
	OnError       func(error)
}

type Service struct {
	manager      *Manager
	pollInterval time.Duration
	onFileUpdate func(context.Context, FileUpdate) error
	onFileDelete func(context.Context, DeleteRequest) error
	onError      func(error)

	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}

	mu           sync.Mutex
	lastSnapshot TrackedFileSnapshot
}

func NewService(options ServiceOptions) (*Service, error) {
	manager, err := NewManager(options.WorkspaceRoot)
	if err != nil {
		return nil, err
	}

	pollInterval := options.PollInterval
	if pollInterval <= 0 {
		pollInterval = defaultPollInterval
	}
	ctx, cancel := context.WithCancel(context.Background())
	service := &Service{
		manager:      manager,
		pollInterval: pollInterval,
		onFileUpdate: options.OnFileUpdate,
		onFileDelete: options.OnFileDelete,
		onError:      options.OnError,
		ctx:          ctx,
		cancel:       cancel,
		done:         make(chan struct{}),
		lastSnapshot: TrackedFileSnapshot{Files: map[string]TrackedFile{}},
	}
	go service.run()
	return service, nil
}

func (s *Service) SyncConfigs(configs map[string]ConfigInputs) error {
	if s == nil {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.manager.SyncConfigs(configs); err != nil {
		return err
	}
	snapshot, err := BuildTrackedFileSnapshot(s.manager.ConfigSnapshots())
	if err != nil {
		return err
	}
	s.lastSnapshot = snapshot
	return nil
}

func (s *Service) ConfigSnapshots() map[string]ConfigSnapshot {
	if s == nil {
		return map[string]ConfigSnapshot{}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.manager.ConfigSnapshots()
}

func (s *Service) Close() error {
	if s == nil {
		return nil
	}
	s.cancel()
	<-s.done
	return nil
}

func (s *Service) run() {
	defer close(s.done)

	ticker := time.NewTicker(s.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			if err := s.pollOnce(); err != nil {
				s.reportError(err)
			}
		}
	}
}

func (s *Service) pollOnce() error {
	s.mu.Lock()
	snapshot, err := BuildTrackedFileSnapshot(s.manager.ConfigSnapshots())
	if err != nil {
		s.mu.Unlock()
		return err
	}
	events := DiffTrackedFileSnapshots(s.lastSnapshot, snapshot)
	s.lastSnapshot = snapshot
	for _, event := range events {
		if err := s.manager.HandleFileEvent(event.Path, event.Type, event.DestinationPath); err != nil {
			s.mu.Unlock()
			return err
		}
	}
	scans, deletes := s.manager.DrainScheduledWork()
	s.mu.Unlock()

	for _, deleteRequest := range deletes {
		if s.onFileDelete == nil {
			continue
		}
		if err := s.onFileDelete(s.ctx, deleteRequest); err != nil {
			return err
		}
	}
	for _, scan := range scans {
		if err := s.processScan(scan); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) processScan(scan PendingScan) error {
	raw, err := os.ReadFile(scan.Path)
	if err != nil {
		if os.IsNotExist(err) {
			if scan.MovedFrom != "" && s.onFileDelete != nil {
				return s.onFileDelete(s.ctx, DeleteRequest{
					ConfigID: scan.ConfigID,
					Path:     scan.MovedFrom,
				})
			}
			return nil
		}
		return err
	}
	if s.onFileUpdate == nil {
		return nil
	}
	return s.onFileUpdate(s.ctx, FileUpdate{
		ConfigID:     scan.ConfigID,
		Path:         scan.Path,
		Raw:          string(raw),
		BaselineOnly: scan.BaselineOnly,
		MovedFrom:    scan.MovedFrom,
	})
}

func (s *Service) reportError(err error) {
	if err == nil || s == nil {
		return
	}
	if s.onError != nil {
		s.onError(err)
		return
	}
	_ = fmt.Errorf("watchcode: %w", err)
}
