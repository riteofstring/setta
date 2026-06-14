package semanticgraph

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"
)

const (
	defaultAutomaticCartographerMaxConcurrent       = 2
	defaultAutomaticCartographerPerSourceConcurrent = 1
	defaultAutomaticCartographerLeaseDuration       = 10 * time.Minute
	defaultAutomaticCartographerMaxQueuedPerSource  = 8
	defaultCartographerQueuePriority                = 100
	finalCartographerQueuePriority                  = 1000
	cartographerConcurrencyGuidance                 = "Worker concurrency is a post-correctness tuning knob; stale running work is handled by durable leases and queue volume reduction first."
)

type automaticCartographerState struct {
	enabled              bool
	started              bool
	leaseOwner           string
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
	if config.LeaseDurationSeconds <= 0 {
		config.LeaseDurationSeconds = int(defaultAutomaticCartographerLeaseDuration / time.Second)
	}
	if config.MaxQueuedPerSource <= 0 {
		config.MaxQueuedPerSource = defaultAutomaticCartographerMaxQueuedPerSource
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
	if service.automaticCartographer.leaseOwner == "" {
		leaseOwner, err := service.newID("cartographer_worker")
		if err != nil {
			service.automaticCartographerMu.Unlock()
			return fmt.Errorf("create automatic cartographer lease owner id: %w", err)
		}
		service.automaticCartographer.leaseOwner = leaseOwner
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

func (service *Service) ShutdownAutomaticCartographerProcessing(ctx context.Context) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	service.StopAutomaticCartographerProcessing()
	done := make(chan struct{})
	go func() {
		service.automaticCartographer.workers.Wait()
		close(done)
	}()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-done:
		return nil
	}
}

func (service *Service) ReadCartographerProcessingState(ctx context.Context) (CartographerProcessingState, error) {
	if ctx == nil {
		return CartographerProcessingState{}, errors.New("context is required")
	}
	service.automaticCartographerMu.Lock()
	state := service.cartographerProcessingStateLocked()
	service.automaticCartographerMu.Unlock()
	return service.enrichCartographerProcessingState(ctx, state)
}

func (service *Service) RecoverAutomaticCartographerWindows(ctx context.Context) (CartographerProcessingRecoveryResult, error) {
	if ctx == nil {
		return CartographerProcessingRecoveryResult{}, errors.New("context is required")
	}
	now := timestamp(service.now())
	recoveredExpired, abandoned, err := service.recoverExpiredCartographerLeases(ctx, now)
	if err != nil {
		return CartographerProcessingRecoveryResult{}, err
	}
	windows, err := service.store.ListClosedQueuedCartographerWindows(ctx)
	if err != nil {
		return CartographerProcessingRecoveryResult{}, err
	}
	recovered := append([]CartographerProcessingQueueItem{}, recoveredExpired...)
	for _, window := range windows {
		item, enqueued, err := service.enqueueClosedCartographerWindow(ctx, window, now)
		if err != nil {
			return CartographerProcessingRecoveryResult{}, err
		}
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
		AbandonedCount:   len(abandoned),
		AbandonedWindows: abandoned,
	}, nil
}

func (service *Service) recoverExpiredCartographerLeases(ctx context.Context, now string) ([]CartographerProcessingQueueItem, []CartographerProcessingQueueItem, error) {
	windows, err := service.store.ListExpiredRunningCartographerWindows(ctx, now)
	if err != nil {
		return nil, nil, err
	}
	recovered := []CartographerProcessingQueueItem{}
	abandoned := []CartographerProcessingQueueItem{}
	for _, window := range windows {
		run, ok, err := service.store.ReadCartographerRun(ctx, window.WorkspaceID, window.RunID)
		if err != nil {
			return nil, nil, err
		}
		if !ok {
			return nil, nil, fmt.Errorf("cartographer run %s was not found for expired lease window %s", window.RunID, window.ID)
		}
		item := cartographerProcessingQueueItem(window, run)
		if window.Status == CartographerWindowClosed {
			run.Status = CartographerRunQueued
			run.LeaseOwner = ""
			run.LeaseDeadline = ""
			run.StartedAt = ""
			run.UpdatedAt = now
			run.Diagnostics = append(run.Diagnostics, service.newCartographerDiagnostic(run.ID, "", CartographerDiagnosticWarning, "lease_expired_requeued", "expired cartographer lease was recovered and requeued", "$.leaseDeadline", now))
			if _, err := service.SaveCartographerRun(ctx, run); err != nil {
				return nil, nil, err
			}
			item.Status = CartographerRunQueued
			item.LeaseOwner = ""
			item.LeaseDeadline = ""
			item.StartedAt = ""
			recovered = append(recovered, item)
			continue
		}
		run.Status = CartographerRunAbandoned
		run.LeaseOwner = ""
		run.LeaseDeadline = ""
		run.CompletedAt = now
		run.UpdatedAt = now
		run.Error = "expired cartographer lease was abandoned because the source window is no longer processable"
		run.Diagnostics = append(run.Diagnostics, service.newCartographerDiagnostic(run.ID, "", CartographerDiagnosticWarning, "lease_expired_abandoned", run.Error, "$.leaseDeadline", now))
		if _, err := service.SaveCartographerRun(ctx, run); err != nil {
			return nil, nil, err
		}
		item.Status = CartographerRunAbandoned
		item.LeaseOwner = ""
		item.LeaseDeadline = ""
		item.CompletedAt = now
		abandoned = append(abandoned, item)
	}
	return recovered, abandoned, nil
}

func (service *Service) enqueueClosedCartographerWindows(ctx context.Context, windows []CartographerWindow) error {
	now := timestamp(service.now())
	for _, window := range windows {
		if _, _, err := service.enqueueClosedCartographerWindow(ctx, window, now); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) enqueueClosedCartographerWindow(ctx context.Context, window CartographerWindow, now string) (CartographerProcessingQueueItem, bool, error) {
	if window.Status != CartographerWindowClosed {
		return CartographerProcessingQueueItem{}, false, nil
	}
	run, ok, err := service.readQueuedCartographerRunForWindow(ctx, window, now)
	if !ok {
		return CartographerProcessingQueueItem{}, false, err
	}
	superseded, err := service.supersedeQueuedCartographerWindowsOverSourceCap(ctx, run.SourceKey, now)
	if err != nil {
		return CartographerProcessingQueueItem{}, false, err
	}
	if len(superseded) > 0 {
		service.removeQueuedCartographerWindows(superseded)
		if stringSliceContains(superseded, window.ID) {
			return CartographerProcessingQueueItem{}, false, nil
		}
	}
	item := cartographerProcessingQueueItem(window, run)
	queued, known := service.queueAutomaticCartographerItem(item)
	if !queued {
		if known {
			return item, false, nil
		}
		return CartographerProcessingQueueItem{}, false, nil
	}
	service.publishSemanticGraphChangeForCartographerAudit(item.WorkspaceID, []string{window.InputBundle.TargetEntityID}, []string{item.RunID}, []string{item.WindowID}, nil)
	return item, true, nil
}

func (service *Service) readQueuedCartographerRunForWindow(ctx context.Context, window CartographerWindow, now string) (CartographerRun, bool, error) {
	run, ok, err := service.store.ReadCartographerRun(ctx, window.WorkspaceID, window.RunID)
	if err != nil {
		return CartographerRun{}, false, err
	}
	if !ok {
		return CartographerRun{}, false, fmt.Errorf("cartographer run %s was not found for closed window %s", window.RunID, window.ID)
	}
	if run.Status != CartographerRunQueued {
		return CartographerRun{}, false, nil
	}
	if run.SourceEpochID == "" || run.SourceKey == "" || run.Priority <= 0 || !cartographerRunSettingsSnapshotComplete(run) {
		if err := service.prepareCartographerQueuedRun(ctx, &run, window, now, false); err != nil {
			return CartographerRun{}, false, err
		}
		if _, err := service.SaveCartographerRun(ctx, run); err != nil {
			return CartographerRun{}, false, err
		}
	}
	return run, true, nil
}

func (service *Service) queueAutomaticCartographerItem(item CartographerProcessingQueueItem) (bool, bool) {
	service.automaticCartographerMu.Lock()
	defer service.automaticCartographerMu.Unlock()
	if !service.automaticCartographer.enabled || !service.automaticCartographer.started {
		return false, false
	}
	if service.automaticCartographer.queuedByWindow[item.WindowID] {
		return false, true
	}
	if _, running := service.automaticCartographer.runningByWindow[item.WindowID]; running {
		return false, true
	}
	item.Position = len(service.automaticCartographer.queue) + 1
	service.automaticCartographer.queue = append(service.automaticCartographer.queue, item)
	service.automaticCartographer.queuedByWindow[item.WindowID] = true
	service.scheduleAutomaticCartographerProcessingLocked()
	return true, true
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
		item.LeaseOwner = service.automaticCartographer.leaseOwner
		item.LeaseDeadline = cartographerLeaseDeadline(service.now(), service.automaticCartographer.config)
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
		LeaseOwner:                item.LeaseOwner,
		LeaseDeadline:             item.LeaseDeadline,
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
	for {
		if idle, err := service.automaticCartographerDurablyIdle(ctx); err != nil {
			return err
		} else if idle {
			return nil
		}
		service.automaticCartographerMu.Lock()
		if service.automaticCartographerIdleLocked() && service.automaticCartographer.started {
			service.automaticCartographerMu.Unlock()
			if _, err := service.RecoverAutomaticCartographerWindows(ctx); err != nil {
				return err
			}
			continue
		}
		waiter := make(chan struct{})
		service.automaticCartographer.idleWaiters = append(service.automaticCartographer.idleWaiters, waiter)
		service.automaticCartographerMu.Unlock()

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-waiter:
		}
	}
}

func (service *Service) automaticCartographerIdleLocked() bool {
	return len(service.automaticCartographer.queue) == 0 && len(service.automaticCartographer.runningByWindow) == 0
}

func (service *Service) automaticCartographerDurablyIdle(ctx context.Context) (bool, error) {
	state, err := service.ReadCartographerProcessingState(ctx)
	if err != nil {
		return false, err
	}
	return state.DurableQueuedWindowCount == 0 && state.DurableRunningWindowCount == 0 && state.QueuedWindowCount == 0 && state.RunningWindowCount == 0, nil
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
		ConcurrencyGuidance:      cartographerConcurrencyGuidance,
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

func (service *Service) enrichCartographerProcessingState(ctx context.Context, state CartographerProcessingState) (CartographerProcessingState, error) {
	health, err := service.store.ReadCartographerProcessingDurableHealth(ctx, timestamp(service.now()))
	if err != nil {
		return CartographerProcessingState{}, err
	}
	queued, err := service.cartographerProcessingQueueItems(ctx, health.QueuedWindows)
	if err != nil {
		return CartographerProcessingState{}, err
	}
	running, err := service.cartographerProcessingQueueItems(ctx, health.RunningWindows)
	if err != nil {
		return CartographerProcessingState{}, err
	}
	state.QueuedWindows = queued
	state.RunningWindows = running
	state.QueuedWindowCount = len(queued)
	state.RunningWindowCount = len(running)
	state.DurableQueuedWindowCount = len(queued)
	state.DurableRunningWindowCount = len(running)
	state.StaleLeaseCount = health.StaleLeaseCount
	state.SupersededWindowCount = health.SupersededWindowCount
	state.CompletedNoopRunCount = health.CompletedNoopRunCount
	state.FailedRunCount = health.FailedRunCount
	state.PendingReviewPatchCount = health.PendingReviewPatchCount
	state.LastAppliedPatchID = health.LastAppliedPatchID
	state.LastAppliedAt = health.LastAppliedAt
	state.LastNoopRunID = health.LastNoopRunID
	state.LastNoopAt = health.LastNoopAt
	state.LastNoopReason = health.LastNoopReason
	state.LastSupersededWindowID = health.LastSupersededWindowID
	state.LastSupersededAt = health.LastSupersededAt
	if state.LastFailure == nil {
		state.LastFailure = health.LastFailure
	}
	return state, nil
}

func (service *Service) cartographerProcessingQueueItems(ctx context.Context, windows []CartographerWindow) ([]CartographerProcessingQueueItem, error) {
	items := make([]CartographerProcessingQueueItem, 0, len(windows))
	for index, window := range windows {
		run, ok, err := service.store.ReadCartographerRun(ctx, window.WorkspaceID, window.RunID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("cartographer run %s was not found for processing state window %s", window.RunID, window.ID)
		}
		item := cartographerProcessingQueueItem(window, run)
		item.Position = index + 1
		items = append(items, item)
	}
	if items == nil {
		return []CartographerProcessingQueueItem{}, nil
	}
	return items, nil
}

func cartographerProcessingQueueItem(window CartographerWindow, run CartographerRun) CartographerProcessingQueueItem {
	return CartographerProcessingQueueItem{
		WorkspaceID:   window.WorkspaceID,
		WindowID:      window.ID,
		RunID:         window.RunID,
		Status:        run.Status,
		TriggerKind:   run.TriggerKind,
		SourceEpochID: run.SourceEpochID,
		SourceKey:     firstNonEmpty(run.SourceKey, cartographerProcessingSourceKey(window)),
		Priority:      run.Priority,
		LeaseOwner:    run.LeaseOwner,
		LeaseDeadline: run.LeaseDeadline,
		AttemptCount:  run.AttemptCount,
		EnqueuedAt:    run.CreatedAt,
		StartedAt:     run.StartedAt,
		CompletedAt:   run.CompletedAt,
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

func (service *Service) prepareCartographerQueuedRun(ctx context.Context, run *CartographerRun, window CartographerWindow, now string, forceSettingsSnapshot bool) error {
	prepareCartographerQueuedRunMetadata(run, window, now)
	return service.applyCartographerRunSettingsSnapshot(ctx, run, forceSettingsSnapshot)
}

func prepareCartographerQueuedRunMetadata(run *CartographerRun, window CartographerWindow, now string) {
	run.Status = CartographerRunQueued
	run.WindowID = window.ID
	run.SourceEpochID = window.ID
	run.SourceKey = cartographerProcessingSourceKey(window)
	run.Priority = cartographerQueuePriority(run.TriggerKind)
	run.LeaseOwner = ""
	run.LeaseDeadline = ""
	run.CompletedAt = ""
	run.UpdatedAt = now
	run.Error = ""
}

func cartographerQueuePriority(trigger CartographerRunTriggerKind) int {
	if trigger == CartographerTriggerWorkflowDone {
		return finalCartographerQueuePriority
	}
	return defaultCartographerQueuePriority
}

func cartographerLeaseDeadline(now time.Time, config AutomaticCartographerProcessingConfig) string {
	return timestamp(now.Add(time.Duration(config.LeaseDurationSeconds) * time.Second))
}

func (service *Service) supersedeObsoleteQueuedCartographerWindows(ctx context.Context, finalWindow CartographerWindow, now string) ([]string, error) {
	refs, ok := cartographerCompletionSourceRefs(finalWindow)
	if !ok {
		return nil, nil
	}
	windows, err := service.store.ListClosedQueuedCartographerWindows(ctx)
	if err != nil {
		return nil, err
	}
	superseded, err := service.supersedeMatchingQueuedCartographerWindows(ctx, windows, finalWindow, refs, now)
	if err != nil {
		return nil, err
	}
	service.removeQueuedCartographerWindows(superseded)
	return superseded, nil
}

func cartographerCompletionSourceRefs(window CartographerWindow) (SemanticContextSourceRefs, bool) {
	if window.InputBundle.TriggerKind != CartographerTriggerWorkflowDone {
		return SemanticContextSourceRefs{}, false
	}
	refs := window.InputBundle.SourceRefs
	return refs, refs.WorkflowExecutionID != "" || refs.ChatRunID != ""
}

func (service *Service) supersedeMatchingQueuedCartographerWindows(ctx context.Context, windows []CartographerWindow, finalWindow CartographerWindow, refs SemanticContextSourceRefs, now string) ([]string, error) {
	superseded := []string{}
	for _, window := range windows {
		if window.ID == finalWindow.ID || window.RunID == finalWindow.RunID {
			continue
		}
		run, ok, err := service.store.ReadCartographerRun(ctx, window.WorkspaceID, window.RunID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("cartographer run %s was not found for obsolete window %s", window.RunID, window.ID)
		}
		if run.Status != CartographerRunQueued {
			continue
		}
		if !cartographerRunMatchesCompletionSource(run, refs) {
			continue
		}
		if err := service.supersedeQueuedCartographerRun(ctx, &run, "superseded_by_workflow_done", "obsolete queued cartographer window was superseded by the workflow completion synthesis pass", now); err != nil {
			return nil, err
		}
		superseded = append(superseded, window.ID)
	}
	return superseded, nil
}

func (service *Service) supersedeQueuedCartographerWindowsOverSourceCap(ctx context.Context, sourceKey string, now string) ([]string, error) {
	maxQueued := service.automaticCartographer.config.MaxQueuedPerSource
	if maxQueued <= 0 {
		maxQueued = defaultAutomaticCartographerMaxQueuedPerSource
	}
	windows, err := service.store.ListQueuedCartographerWindowsForSource(ctx, sourceKey)
	if err != nil {
		return nil, err
	}
	if len(windows) <= maxQueued {
		return nil, nil
	}
	superseded := []string{}
	for _, window := range windows[maxQueued:] {
		run, ok, err := service.store.ReadCartographerRun(ctx, window.WorkspaceID, window.RunID)
		if err != nil {
			return nil, err
		}
		if !ok || run.Status != CartographerRunQueued {
			continue
		}
		if err := service.supersedeQueuedCartographerRun(ctx, &run, "source_backlog_cap_superseded", "queued cartographer window was superseded by the per-source backlog cap", now); err != nil {
			return nil, err
		}
		superseded = append(superseded, window.ID)
	}
	return superseded, nil
}

func (service *Service) supersedeQueuedCartographerRun(ctx context.Context, run *CartographerRun, code string, message string, now string) error {
	run.Status = CartographerRunSuperseded
	run.LeaseOwner = ""
	run.LeaseDeadline = ""
	run.CompletedAt = now
	run.UpdatedAt = now
	run.Error = message
	run.Diagnostics = append(run.Diagnostics, service.newCartographerDiagnostic(run.ID, "", CartographerDiagnosticInfo, code, message, "$.status", now))
	if _, err := service.SaveCartographerRun(ctx, *run); err != nil {
		return err
	}
	service.publishSemanticGraphChangeForCartographerAudit(run.WorkspaceID, []string{run.TargetEntityID}, []string{run.ID}, []string{run.WindowID}, nil)
	return nil
}

func cartographerRunMatchesCompletionSource(run CartographerRun, refs SemanticContextSourceRefs) bool {
	if refs.WorkflowExecutionID != "" && run.SourceRefs.WorkflowExecutionID == refs.WorkflowExecutionID {
		return true
	}
	if refs.ChatRunID != "" && run.SourceRefs.ChatRunID == refs.ChatRunID {
		return true
	}
	return false
}

func (service *Service) removeQueuedCartographerWindows(windowIDs []string) {
	if len(windowIDs) == 0 {
		return
	}
	remove := map[string]bool{}
	for _, windowID := range windowIDs {
		remove[windowID] = true
	}
	service.automaticCartographerMu.Lock()
	defer service.automaticCartographerMu.Unlock()
	service.removeQueuedCartographerWindowsLocked(remove)
}

func (service *Service) removeQueuedCartographerWindowsLocked(remove map[string]bool) {
	if len(remove) == 0 {
		return
	}
	filtered := service.automaticCartographer.queue[:0]
	for _, item := range service.automaticCartographer.queue {
		if remove[item.WindowID] {
			delete(service.automaticCartographer.queuedByWindow, item.WindowID)
			continue
		}
		filtered = append(filtered, item)
	}
	service.automaticCartographer.queue = filtered
	service.renumberAutomaticCartographerQueueLocked()
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
