package semanticgraph

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
)

const (
	defaultAutomaticCartographerMaxConcurrent       = 2
	defaultAutomaticCartographerPerSourceConcurrent = 1
)

type automaticCartographerState struct {
	enabled              bool
	started              bool
	config               AutomaticCartographerProcessingConfig
	ctx                  context.Context
	cancel               context.CancelFunc
	queue                []CartographerProcessingQueueItem
	queuedByWindow       map[string]bool
	runningByWindow      map[string]CartographerProcessingQueueItem
	runningCountBySource map[string]int
	lastProcessed        CartographerProcessingQueueItem
	lastProcessedAt      string
	lastFailure          *CartographerProcessingFailure
	createdEventIDs      []string
	workers              sync.WaitGroup
	idleWaiters          []chan struct{}
}

func newAutomaticCartographerState() automaticCartographerState {
	return automaticCartographerState{
		enabled:              true,
		config:               normalizeAutomaticCartographerProcessingConfig(AutomaticCartographerProcessingConfig{}),
		queue:                []CartographerProcessingQueueItem{},
		queuedByWindow:       map[string]bool{},
		runningByWindow:      map[string]CartographerProcessingQueueItem{},
		runningCountBySource: map[string]int{},
		createdEventIDs:      []string{},
	}
}

func normalizeAutomaticCartographerProcessingConfig(config AutomaticCartographerProcessingConfig) AutomaticCartographerProcessingConfig {
	if config.MaxConcurrent <= 0 {
		config.MaxConcurrent = defaultAutomaticCartographerMaxConcurrent
	}
	if config.PerSourceConcurrent <= 0 {
		config.PerSourceConcurrent = defaultAutomaticCartographerPerSourceConcurrent
	}
	return config
}

func (service *Service) StartAutomaticCartographerProcessing(ctx context.Context) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	service.automaticCartographerMu.Lock()
	if !service.automaticCartographer.enabled {
		service.automaticCartographer.started = false
		service.automaticCartographerMu.Unlock()
		return nil
	}
	if service.automaticCartographer.started {
		service.automaticCartographerMu.Unlock()
		return errors.New("automatic cartographer processing is already running")
	}
	processingCtx, cancel := context.WithCancel(ctx)
	service.automaticCartographer.ctx = processingCtx
	service.automaticCartographer.cancel = cancel
	service.automaticCartographer.started = true
	service.automaticCartographerMu.Unlock()

	_, err := service.RecoverAutomaticCartographerWindows(ctx)
	if err != nil {
		service.StopAutomaticCartographerProcessing()
	}
	return err
}

func (service *Service) StopAutomaticCartographerProcessing() {
	service.automaticCartographerMu.Lock()
	cancel := service.automaticCartographer.cancel
	service.automaticCartographer.cancel = nil
	service.automaticCartographer.ctx = nil
	service.automaticCartographer.started = false
	service.automaticCartographerMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (service *Service) ReadCartographerProcessingState(context.Context) (CartographerProcessingState, error) {
	service.automaticCartographerMu.Lock()
	defer service.automaticCartographerMu.Unlock()
	return service.cartographerProcessingStateLocked(), nil
}

func (service *Service) RecoverAutomaticCartographerWindows(ctx context.Context) (CartographerProcessingRecoveryResult, error) {
	if ctx == nil {
		return CartographerProcessingRecoveryResult{}, errors.New("context is required")
	}
	windows, err := service.store.ListClosedPendingCartographerWindows(ctx)
	if err != nil {
		return CartographerProcessingRecoveryResult{}, err
	}
	recovered := make([]CartographerProcessingQueueItem, 0, len(windows))
	for _, window := range windows {
		item, enqueued := service.enqueueClosedCartographerWindow(window, timestamp(service.now()))
		if enqueued {
			recovered = append(recovered, item)
		}
	}
	state, err := service.ReadCartographerProcessingState(ctx)
	if err != nil {
		return CartographerProcessingRecoveryResult{}, err
	}
	return CartographerProcessingRecoveryResult{
		State:            state,
		RecoveredCount:   len(recovered),
		RecoveredWindows: recovered,
	}, nil
}

func (service *Service) enqueueClosedCartographerWindows(windows []CartographerWindow) {
	now := timestamp(service.now())
	for _, window := range windows {
		service.enqueueClosedCartographerWindow(window, now)
	}
}

func (service *Service) enqueueClosedCartographerWindow(window CartographerWindow, now string) (CartographerProcessingQueueItem, bool) {
	if window.Status != CartographerWindowClosed {
		return CartographerProcessingQueueItem{}, false
	}
	item := cartographerProcessingQueueItem(window, now)

	service.automaticCartographerMu.Lock()
	if !service.automaticCartographer.enabled || !service.automaticCartographer.started {
		service.automaticCartographerMu.Unlock()
		return CartographerProcessingQueueItem{}, false
	}
	if service.automaticCartographer.queuedByWindow[item.WindowID] {
		service.automaticCartographerMu.Unlock()
		return item, false
	}
	if _, running := service.automaticCartographer.runningByWindow[item.WindowID]; running {
		service.automaticCartographerMu.Unlock()
		return item, false
	}
	item.Position = len(service.automaticCartographer.queue) + 1
	service.automaticCartographer.queue = append(service.automaticCartographer.queue, item)
	service.automaticCartographer.queuedByWindow[item.WindowID] = true
	service.scheduleAutomaticCartographerProcessingLocked()
	service.automaticCartographerMu.Unlock()
	service.publishSemanticGraphChangeForCartographerAudit(item.WorkspaceID, []string{window.InputBundle.TargetEntityID}, []string{item.RunID}, []string{item.WindowID}, nil)
	return item, true
}

func (service *Service) scheduleAutomaticCartographerProcessingLocked() {
	for service.automaticCartographer.started &&
		service.automaticCartographer.enabled &&
		len(service.automaticCartographer.runningByWindow) < service.automaticCartographer.config.MaxConcurrent {
		index := service.nextAutomaticCartographerQueueIndexLocked()
		if index < 0 {
			return
		}
		item := service.automaticCartographer.queue[index]
		service.automaticCartographer.queue = append(service.automaticCartographer.queue[:index], service.automaticCartographer.queue[index+1:]...)
		delete(service.automaticCartographer.queuedByWindow, item.WindowID)
		item.StartedAt = timestamp(service.now())
		service.automaticCartographer.runningByWindow[item.WindowID] = item
		service.automaticCartographer.runningCountBySource[item.SourceKey]++
		processingCtx := service.automaticCartographer.ctx
		service.automaticCartographer.workers.Add(1)
		go service.runAutomaticCartographerWindow(processingCtx, item)
	}
	service.renumberAutomaticCartographerQueueLocked()
}

func (service *Service) nextAutomaticCartographerQueueIndexLocked() int {
	for index, item := range service.automaticCartographer.queue {
		if service.automaticCartographer.runningCountBySource[item.SourceKey] < service.automaticCartographer.config.PerSourceConcurrent {
			return index
		}
	}
	return -1
}

func (service *Service) renumberAutomaticCartographerQueueLocked() {
	for index := range service.automaticCartographer.queue {
		service.automaticCartographer.queue[index].Position = index + 1
	}
}

func (service *Service) runAutomaticCartographerWindow(ctx context.Context, item CartographerProcessingQueueItem) {
	defer service.automaticCartographer.workers.Done()
	service.publishSemanticGraphChangeForCartographerAudit(item.WorkspaceID, nil, []string{item.RunID}, []string{item.WindowID}, nil)
	if ctx == nil {
		ctx = context.Background()
	}
	result, err := service.processCartographerWindow(ctx, item.WorkspaceID, item.WindowID, cartographerWindowProcessingOptions{
		AutoApplyValidatedPatches: true,
	})
	service.finishAutomaticCartographerWindow(item, result, err)
}

func (service *Service) finishAutomaticCartographerWindow(item CartographerProcessingQueueItem, result CartographerWindowProcessResult, processErr error) {
	service.automaticCartographerMu.Lock()
	if _, ok := service.automaticCartographer.runningByWindow[item.WindowID]; ok {
		delete(service.automaticCartographer.runningByWindow, item.WindowID)
		if service.automaticCartographer.runningCountBySource[item.SourceKey] > 1 {
			service.automaticCartographer.runningCountBySource[item.SourceKey]--
		} else {
			delete(service.automaticCartographer.runningCountBySource, item.SourceKey)
		}
	}
	now := timestamp(service.now())
	if processErr != nil {
		service.automaticCartographer.lastFailure = &CartographerProcessingFailure{
			WorkspaceID: item.WorkspaceID,
			WindowID:    item.WindowID,
			RunID:       item.RunID,
			SourceKey:   item.SourceKey,
			Message:     processErr.Error(),
			FailedAt:    now,
		}
	} else {
		service.automaticCartographer.lastProcessed = item
		service.automaticCartographer.lastProcessedAt = now
		service.automaticCartographer.createdEventIDs = appendUniqueStrings(service.automaticCartographer.createdEventIDs, result.Run.CreatedSemanticEventIDs...)
		if result.Run.Status == CartographerRunFailed || result.Run.Status == CartographerRunRejected {
			message := result.Run.Error
			if message == "" {
				message = fmt.Sprintf("cartographer run finished with status %s", result.Run.Status)
			}
			service.automaticCartographer.lastFailure = &CartographerProcessingFailure{
				WorkspaceID: item.WorkspaceID,
				WindowID:    item.WindowID,
				RunID:       item.RunID,
				SourceKey:   item.SourceKey,
				Message:     message,
				FailedAt:    now,
			}
		}
	}
	service.scheduleAutomaticCartographerProcessingLocked()
	service.notifyAutomaticCartographerIdleLocked()
	service.automaticCartographerMu.Unlock()
	service.publishSemanticGraphChangeForCartographerAudit(item.WorkspaceID, nil, []string{item.RunID}, []string{item.WindowID}, nil)
}

func (service *Service) WaitForAutomaticCartographerIdle(ctx context.Context) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	service.automaticCartographerMu.Lock()
	if service.automaticCartographerIdleLocked() {
		service.automaticCartographerMu.Unlock()
		return nil
	}
	waiter := make(chan struct{})
	service.automaticCartographer.idleWaiters = append(service.automaticCartographer.idleWaiters, waiter)
	service.automaticCartographerMu.Unlock()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-waiter:
		return nil
	}
}

func (service *Service) automaticCartographerIdleLocked() bool {
	return len(service.automaticCartographer.queue) == 0 && len(service.automaticCartographer.runningByWindow) == 0
}

func (service *Service) notifyAutomaticCartographerIdleLocked() {
	if !service.automaticCartographerIdleLocked() {
		return
	}
	for _, waiter := range service.automaticCartographer.idleWaiters {
		close(waiter)
	}
	service.automaticCartographer.idleWaiters = nil
}

func (service *Service) cartographerProcessingStateLocked() CartographerProcessingState {
	queued := append([]CartographerProcessingQueueItem(nil), service.automaticCartographer.queue...)
	if queued == nil {
		queued = []CartographerProcessingQueueItem{}
	}
	running := make([]CartographerProcessingQueueItem, 0, len(service.automaticCartographer.runningByWindow))
	for _, item := range service.automaticCartographer.runningByWindow {
		running = append(running, item)
	}
	if running == nil {
		running = []CartographerProcessingQueueItem{}
	}
	sort.Slice(running, func(left int, right int) bool {
		if running[left].StartedAt == running[right].StartedAt {
			return running[left].WindowID < running[right].WindowID
		}
		return running[left].StartedAt < running[right].StartedAt
	})
	createdIDs := append([]string(nil), service.automaticCartographer.createdEventIDs...)
	if createdIDs == nil {
		createdIDs = []string{}
	}
	return CartographerProcessingState{
		Enabled:                  service.automaticCartographer.enabled,
		Started:                  service.automaticCartographer.started,
		MaxConcurrent:            service.automaticCartographer.config.MaxConcurrent,
		PerSourceConcurrent:      service.automaticCartographer.config.PerSourceConcurrent,
		QueuedWindowCount:        len(queued),
		RunningWindowCount:       len(running),
		QueuedWindows:            queued,
		RunningWindows:           running,
		LastProcessedWorkspaceID: service.automaticCartographer.lastProcessed.WorkspaceID,
		LastProcessedWindowID:    service.automaticCartographer.lastProcessed.WindowID,
		LastProcessedRunID:       service.automaticCartographer.lastProcessed.RunID,
		LastProcessedAt:          service.automaticCartographer.lastProcessedAt,
		LastFailure:              service.automaticCartographer.lastFailure,
		CreatedSemanticEventIDs:  createdIDs,
	}
}

func cartographerProcessingQueueItem(window CartographerWindow, now string) CartographerProcessingQueueItem {
	return CartographerProcessingQueueItem{
		WorkspaceID: window.WorkspaceID,
		WindowID:    window.ID,
		RunID:       window.RunID,
		SourceKey:   cartographerProcessingSourceKey(window),
		EnqueuedAt:  now,
	}
}

func cartographerProcessingSourceKey(window CartographerWindow) string {
	if window.CursorID != "" {
		return window.WorkspaceID + ":cursor:" + window.CursorID
	}
	if window.InputBundle.SourceRefs.ChatRunID != "" {
		return window.WorkspaceID + ":chat_run:" + window.InputBundle.SourceRefs.ChatRunID
	}
	if window.InputBundle.SourceRefs.WorkflowExecutionID != "" {
		return window.WorkspaceID + ":workflow_execution:" + window.InputBundle.SourceRefs.WorkflowExecutionID
	}
	if window.SourceID != "" {
		return window.WorkspaceID + ":" + string(window.SourceKind) + ":" + window.SourceID
	}
	return window.WorkspaceID + ":window:" + window.ID
}

func appendUniqueStrings(values []string, additions ...string) []string {
	seen := map[string]bool{}
	for _, value := range values {
		seen[value] = true
	}
	for _, addition := range additions {
		if addition == "" || seen[addition] {
			continue
		}
		values = append(values, addition)
		seen[addition] = true
	}
	if values == nil {
		return []string{}
	}
	return values
}
