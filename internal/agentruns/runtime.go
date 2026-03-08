package agentruns

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"setta/internal/agentprofiles"
)

var ErrRuntimeServiceRequired = fmt.Errorf("managed agent runtime service is required")

type LiveRunTracker interface {
	ActivateRun(run Run)
	DeactivateRun(runID string)
}

type RuntimeOptions struct {
	Service        *Service
	BaseContext    context.Context
	LiveRunTracker LiveRunTracker
}

type Runtime struct {
	service        *Service
	baseContext    context.Context
	liveRunTracker LiveRunTracker

	mu     sync.RWMutex
	active map[string]activeRunState
}

type activeRunState struct {
	cancel context.CancelFunc
	done   chan struct{}
}

func NewRuntime(options RuntimeOptions) (*Runtime, error) {
	if options.Service == nil {
		return nil, ErrRuntimeServiceRequired
	}
	baseContext := options.BaseContext
	if baseContext == nil {
		baseContext = context.Background()
	}
	return &Runtime{
		service:        options.Service,
		baseContext:    baseContext,
		liveRunTracker: options.LiveRunTracker,
		active:         map[string]activeRunState{},
	}, nil
}

func (r *Runtime) Disabled() bool {
	return r == nil || r.service == nil || r.service.Disabled()
}

func (r *Runtime) StartRun(profile agentprofiles.Profile, inputs map[string]any) (Run, error) {
	if r == nil || r.service == nil {
		return Run{}, ErrRuntimeServiceRequired
	}
	runContext, err := r.service.prepareRun(profile, inputs)
	if err != nil {
		return Run{}, err
	}

	ctx, cancel := context.WithCancel(r.baseContext)
	done := make(chan struct{})
	runID := runContext.run.ID

	r.mu.Lock()
	r.active[runID] = activeRunState{
		cancel: cancel,
		done:   done,
	}
	r.mu.Unlock()
	if r.liveRunTracker != nil {
		r.liveRunTracker.ActivateRun(runContext.run.Clone())
	}

	go func() {
		defer close(done)
		if r.liveRunTracker != nil {
			defer r.liveRunTracker.DeactivateRun(runID)
		}
		_, _ = r.service.executeRun(ctx, runContext)
		r.mu.Lock()
		delete(r.active, runID)
		r.mu.Unlock()
	}()

	return runContext.run.Clone(), nil
}

func (r *Runtime) StopRun(runID string) (Run, error) {
	if r == nil || r.service == nil {
		return Run{}, ErrRuntimeServiceRequired
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return Run{}, fmt.Errorf("%w: run id is required", ErrRunNotFound)
	}

	r.mu.RLock()
	active, ok := r.active[trimmedRunID]
	r.mu.RUnlock()
	if ok && active.cancel != nil {
		active.cancel()
	}
	if ok {
		<-active.done
		return r.service.runs.Load(trimmedRunID)
	}
	return r.service.cancelRun(trimmedRunID)
}

func (r *Runtime) WaitForRun(ctx context.Context, runID string) (Run, error) {
	if r == nil || r.service == nil {
		return Run{}, ErrRuntimeServiceRequired
	}
	trimmedRunID := strings.TrimSpace(runID)
	if trimmedRunID == "" {
		return Run{}, fmt.Errorf("%w: run id is required", ErrRunNotFound)
	}

	r.mu.RLock()
	active, ok := r.active[trimmedRunID]
	r.mu.RUnlock()
	if ok {
		select {
		case <-active.done:
		case <-ctx.Done():
			return Run{}, ctx.Err()
		}
	}
	return r.service.runs.Load(trimmedRunID)
}
