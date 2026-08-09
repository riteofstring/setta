package runtime

import (
	"context"
	"errors"
	"log/slog"
	"sync"
)

type TaskFunc func(context.Context) error

type Manager struct {
	ctx    context.Context
	cancel context.CancelFunc
	logger *slog.Logger

	wg           sync.WaitGroup
	firstErrOnce sync.Once
	firstErr     error
	stopOnce     sync.Once
}

func New(parent context.Context, logger *slog.Logger) *Manager {
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	return &Manager{
		ctx:    ctx,
		cancel: cancel,
		logger: logger,
	}
}

func (m *Manager) Context() context.Context {
	return m.ctx
}

func (m *Manager) Go(name string, fn TaskFunc) {
	if fn == nil {
		return
	}

	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		if err := fn(m.ctx); err != nil && !errors.Is(err, context.Canceled) {
			m.firstErrOnce.Do(func() {
				m.firstErr = err
			})
			if m.logger != nil {
				m.logger.Error("background task failed", slog.String("task", name), slog.String("error", err.Error()))
			}
			m.cancel()
		}
	}()
}

func (m *Manager) Shutdown(ctx context.Context) error {
	m.stopOnce.Do(func() {
		m.cancel()
	})

	done := make(chan struct{})
	go func() {
		m.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		return m.firstErr
	case <-ctx.Done():
		return ctx.Err()
	}
}
