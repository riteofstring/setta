package semanticgraph

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/chat"
	"setta/internal/orchestrator"
)

const (
	defaultCartographerMaxWindowEvents         = 24
	defaultCartographerMaxWindowContentBytes   = 8192
	defaultCartographerAssistantThresholdBytes = 4096
	defaultCartographerOutputThresholdBytes    = 4096
	defaultCartographerPriorSummaryLimit       = 8
	defaultCartographerTokenBudget             = 6000
	cartographerEventSummaryLimit              = 720
	cartographerAggregateTextLimit             = 2400
	cartographerTrajectorySummaryLimit         = 1000
	cartographerContextActivityLimit           = 40
)

type CartographerObservationConfig struct {
	MaxWindowEvents         int
	MaxWindowContentBytes   int
	AssistantThresholdBytes int
	OutputThresholdBytes    int
	PriorSummaryLimit       int
	TokenBudget             int
}

type CartographerManualWindowRequest struct {
	WorkspaceID    string
	TriggerKind    CartographerRunTriggerKind
	TargetEntityID string
	SourceRefs     SemanticContextSourceRefs
	RunStatus      string
	TerminalReason string
	Summary        string
}

type CartographerChatEventSource interface {
	SubscribeEvents(chat.EventCursor) (*chat.EventSubscription, error)
}

type CartographerWorkflowEventSource interface {
	SubscribeEvents(orchestrator.WorkflowEventCursor) (*orchestrator.EventSubscription, error)
}

type cartographerSubscription interface {
	Unsubscribe()
}

type observedCartographerEvent struct {
	workspaceID         string
	source              CartographerTrajectoryEventSource
	eventID             string
	eventType           string
	streamID            string
	sequence            int
	workflowEventCursor string
	occurredAt          string
	sourceRefs          SemanticContextSourceRefs
	chatMessageID       string
	runItemID           string
	runItemType         string
	runItemStatus       string
	runStatus           string
	outputStream        string
	outputOrdinal       int
	content             string
	summary             string
	closeReason         CartographerWindowCloseReason
	item                *chat.RunItem
	run                 *chat.Run
}

func DefaultCartographerObservationConfig() CartographerObservationConfig {
	return CartographerObservationConfig{
		MaxWindowEvents:         defaultCartographerMaxWindowEvents,
		MaxWindowContentBytes:   defaultCartographerMaxWindowContentBytes,
		AssistantThresholdBytes: defaultCartographerAssistantThresholdBytes,
		OutputThresholdBytes:    defaultCartographerOutputThresholdBytes,
		PriorSummaryLimit:       defaultCartographerPriorSummaryLimit,
		TokenBudget:             defaultCartographerTokenBudget,
	}
}

func normalizeCartographerObservationConfig(config CartographerObservationConfig) CartographerObservationConfig {
	defaults := DefaultCartographerObservationConfig()
	if config.MaxWindowEvents <= 0 {
		config.MaxWindowEvents = defaults.MaxWindowEvents
	}
	if config.MaxWindowContentBytes <= 0 {
		config.MaxWindowContentBytes = defaults.MaxWindowContentBytes
	}
	if config.AssistantThresholdBytes <= 0 {
		config.AssistantThresholdBytes = defaults.AssistantThresholdBytes
	}
	if config.OutputThresholdBytes <= 0 {
		config.OutputThresholdBytes = defaults.OutputThresholdBytes
	}
	if config.PriorSummaryLimit <= 0 {
		config.PriorSummaryLimit = defaults.PriorSummaryLimit
	}
	if config.TokenBudget <= 0 {
		config.TokenBudget = defaults.TokenBudget
	}
	return config
}

func (service *Service) StartCartographerEventObserver(ctx context.Context, chatSource CartographerChatEventSource, workflowSource CartographerWorkflowEventSource) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := service.StartAutomaticCartographerProcessing(ctx); err != nil {
		return err
	}
	service.cartographerMu.Lock()
	defer service.cartographerMu.Unlock()
	if service.cartographerChatSubscription != nil || service.cartographerWorkflowSubscription != nil {
		service.StopAutomaticCartographerProcessing()
		return errors.New("cartographer event observer is already running")
	}
	if chatSource != nil {
		subscription, err := chatSource.SubscribeEvents(chat.EventCursor{})
		if err != nil {
			service.StopAutomaticCartographerProcessing()
			return err
		}
		service.cartographerChatSubscription = subscription
		go service.observeCartographerChatEvents(ctx, subscription.Events)
	}
	if workflowSource != nil {
		subscription, err := workflowSource.SubscribeEvents(orchestrator.WorkflowEventCursor{})
		if err != nil {
			if service.cartographerChatSubscription != nil {
				service.cartographerChatSubscription.Unsubscribe()
				service.cartographerChatSubscription = nil
			}
			service.StopAutomaticCartographerProcessing()
			return err
		}
		service.cartographerWorkflowSubscription = subscription
		go service.observeCartographerWorkflowEvents(ctx, subscription.Events)
	}
	return nil
}

func (service *Service) CloseCartographerEventObserver() {
	service.stopCartographerEventObserver()
}

func (service *Service) ShutdownCartographerEventObserver(ctx context.Context) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	service.stopCartographerEventObserver()
	return service.ShutdownAutomaticCartographerProcessing(ctx)
}

func (service *Service) stopCartographerEventObserver() {
	service.cartographerMu.Lock()
	defer service.cartographerMu.Unlock()
	if service.cartographerChatSubscription != nil {
		service.cartographerChatSubscription.Unsubscribe()
		service.cartographerChatSubscription = nil
	}
	if service.cartographerWorkflowSubscription != nil {
		service.cartographerWorkflowSubscription.Unsubscribe()
		service.cartographerWorkflowSubscription = nil
	}
	service.StopAutomaticCartographerProcessing()
}

func (service *Service) observeCartographerChatEvents(ctx context.Context, events <-chan chat.Event) {
	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			_, _ = service.ObserveCartographerChatEvent(ctx, event)
		}
	}
}

func (service *Service) observeCartographerWorkflowEvents(ctx context.Context, events <-chan orchestrator.WorkflowEventEnvelope) {
	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			_, _ = service.ObserveCartographerWorkflowEvent(ctx, event)
		}
	}
}

func (service *Service) ObserveCartographerChatEvent(ctx context.Context, event chat.Event) ([]CartographerWindow, error) {
	observed, ok, err := service.cartographerObservedChatEvent(event)
	if err != nil || !ok {
		return nil, err
	}
	return service.observeCartographerEvent(ctx, observed)
}

func (service *Service) ObserveCartographerWorkflowEvent(ctx context.Context, envelope orchestrator.WorkflowEventEnvelope) ([]CartographerWindow, error) {
	observed, ok, err := cartographerObservedWorkflowEvent(envelope)
	if err != nil || !ok {
		return nil, err
	}
	if err := service.enrichWorkflowObservedEventRefs(&observed, envelope.Event); err != nil {
		return nil, err
	}
	return service.observeCartographerEvent(ctx, observed)
}

func (service *Service) BuildManualCartographerWindow(ctx context.Context, request CartographerManualWindowRequest) (CartographerWindow, error) {
	if err := service.validateManualCartographerWindowCall(ctx, request); err != nil {
		return CartographerWindow{}, err
	}
	service.cartographerMu.Lock()
	defer service.cartographerMu.Unlock()

	now := timestamp(service.now())
	window, run, summary, err := service.newManualCartographerWindowRecords(ctx, request, now)
	if err != nil {
		return CartographerWindow{}, err
	}
	if _, err := service.SaveCartographerRun(ctx, run); err != nil {
		return CartographerWindow{}, err
	}
	if _, err := service.SaveCartographerWindow(ctx, window); err != nil {
		return CartographerWindow{}, err
	}
	if _, err := service.SaveCartographerTrajectorySummary(ctx, summary); err != nil {
		return CartographerWindow{}, err
	}
	return window, nil
}

func (service *Service) validateManualCartographerWindowCall(ctx context.Context, request CartographerManualWindowRequest) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if _, err := service.resolveWorkspace(request.WorkspaceID); err != nil {
		return err
	}
	return validateManualCartographerWindowRequest(request)
}

func (service *Service) newManualCartographerWindowRecords(ctx context.Context, request CartographerManualWindowRequest, now string) (CartographerWindow, CartographerRun, CartographerTrajectorySummary, error) {
	sourceKind, sourceID, err := cartographerSourceFromManualRequest(request)
	if err != nil {
		return CartographerWindow{}, CartographerRun{}, CartographerTrajectorySummary{}, err
	}
	ids, err := service.newManualCartographerRecordIDs()
	if err != nil {
		return CartographerWindow{}, CartographerRun{}, CartographerTrajectorySummary{}, err
	}
	input, err := service.newManualCartographerInputBundle(ctx, request, ids.windowID, now)
	if err != nil {
		return CartographerWindow{}, CartographerRun{}, CartographerTrajectorySummary{}, err
	}
	run := newManualCartographerRun(request, ids.runID, input, now)
	window := newManualCartographerWindow(request, ids, sourceKind, sourceID, input, now)
	prepareCartographerQueuedRun(&run, window, now)
	summary := cartographerTrajectorySummaryFromWindow(ids.summaryID, window, input, now)
	return window, run, summary, nil
}

type manualCartographerRecordIDs struct {
	runID     string
	windowID  string
	summaryID string
}

func (service *Service) newManualCartographerRecordIDs() (manualCartographerRecordIDs, error) {
	runID, err := service.newID("cartographer_run")
	if err != nil {
		return manualCartographerRecordIDs{}, fmt.Errorf("create cartographer run id: %w", err)
	}
	windowID, err := service.newID("cartographer_window")
	if err != nil {
		return manualCartographerRecordIDs{}, fmt.Errorf("create cartographer window id: %w", err)
	}
	summaryID, err := service.newID("cartographer_summary")
	if err != nil {
		return manualCartographerRecordIDs{}, fmt.Errorf("create cartographer summary id: %w", err)
	}
	return manualCartographerRecordIDs{runID: runID, windowID: windowID, summaryID: summaryID}, nil
}

func (service *Service) newManualCartographerInputBundle(ctx context.Context, request CartographerManualWindowRequest, windowID string, now string) (CartographerInputBundle, error) {
	input, err := service.newCartographerInputBundle(ctx, cartographerInputBundleRequest{
		workspaceID:    request.WorkspaceID,
		triggerKind:    cartographerManualTriggerKind(request),
		targetEntityID: request.TargetEntityID,
		sourceRefs:     request.SourceRefs,
		runStatus:      request.RunStatus,
		terminalReason: request.TerminalReason,
		closeReason:    CartographerCloseManual,
		events:         []CartographerTrajectoryEvent{manualCartographerTrajectoryEvent(request, now)},
	})
	if err != nil {
		return CartographerInputBundle{}, err
	}
	input.WindowID = windowID
	return applyCartographerInputLimits(input, service.cartographerConfig), nil
}

func cartographerManualTriggerKind(request CartographerManualWindowRequest) CartographerRunTriggerKind {
	if request.TriggerKind != "" {
		return request.TriggerKind
	}
	return CartographerTriggerManual
}

func manualCartographerTrajectoryEvent(request CartographerManualWindowRequest, now string) CartographerTrajectoryEvent {
	return CartographerTrajectoryEvent{
		Source:      CartographerTrajectorySourceWorkflow,
		EventID:     "manual_cartographer_request",
		Type:        "cartographer.manual_current_progress",
		OccurredAt:  now,
		SourceRefs:  request.SourceRefs,
		Summary:     boundedText(request.Summary, cartographerEventSummaryLimit).text,
		Boundary:    true,
		CloseReason: CartographerCloseManual,
	}
}

func newManualCartographerRun(request CartographerManualWindowRequest, runID string, input CartographerInputBundle, now string) CartographerRun {
	return CartographerRun{
		ID:             runID,
		WorkspaceID:    request.WorkspaceID,
		Status:         CartographerRunQueued,
		TriggerKind:    cartographerManualTriggerKind(request),
		TargetEntityID: request.TargetEntityID,
		SourceRefs:     request.SourceRefs,
		InputBundle:    input,
		OutputSchema:   DefaultCartographerPatchEnvelopeSchema(),
		CreatedAt:      now,
		UpdatedAt:      now,
	}
}

func newManualCartographerWindow(request CartographerManualWindowRequest, ids manualCartographerRecordIDs, sourceKind CartographerSourceKind, sourceID string, input CartographerInputBundle, now string) CartographerWindow {
	return CartographerWindow{
		ID:          ids.windowID,
		WorkspaceID: request.WorkspaceID,
		RunID:       ids.runID,
		Status:      CartographerWindowClosed,
		Sequence:    1,
		SourceKind:  sourceKind,
		SourceID:    sourceID,
		SummaryID:   ids.summaryID,
		InputBundle: input,
		OpenedAt:    now,
		ClosedAt:    now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
}

func (service *Service) CloseQuietCartographerWindows(ctx context.Context, cutoff string) ([]CartographerWindow, error) {
	if ctx == nil {
		return nil, errors.New("context is required")
	}
	if cutoff == "" {
		cutoff = timestamp(service.now())
	}
	if err := validateTimestamp("cartographer quiet cutoff", cutoff); err != nil {
		return nil, err
	}
	service.cartographerMu.Lock()
	defer service.cartographerMu.Unlock()

	windows, err := service.store.ListOpenCartographerWindowsUpdatedBefore(ctx, cutoff)
	if err != nil {
		return nil, err
	}
	closed := make([]CartographerWindow, 0, len(windows))
	for _, window := range windows {
		window.InputBundle.TriggerKind = CartographerTriggerWorkflowWindow
		window.InputBundle.Truncation.Reasons = appendUniqueString(window.InputBundle.Truncation.Reasons, string(CartographerCloseQuietPeriod))
		window.InputBundle = applyCartographerInputLimits(window.InputBundle, service.cartographerConfig)
		if err := service.closeCartographerWindowLocked(ctx, &window, CartographerCloseQuietPeriod, cutoff); err != nil {
			return nil, err
		}
		run, ok, err := service.store.ReadCartographerRun(ctx, window.WorkspaceID, window.RunID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("cartographer run %s was not found for quiet window %s", window.RunID, window.ID)
		}
		run.InputBundle = window.InputBundle
		prepareCartographerQueuedRun(&run, window, cutoff)
		if _, err := service.SaveCartographerRun(ctx, run); err != nil {
			return nil, err
		}
		closed = append(closed, window)
	}
	if err := service.enqueueClosedCartographerWindows(ctx, closed); err != nil {
		return nil, err
	}
	return closed, nil
}

func (service *Service) observeCartographerEvent(ctx context.Context, observed observedCartographerEvent) ([]CartographerWindow, error) {
	if err := service.validateObservedCartographerEventCall(ctx, observed); err != nil {
		return nil, err
	}

	service.cartographerMu.Lock()
	defer service.cartographerMu.Unlock()

	cursor, err := service.cartographerCursorForObservedEvent(ctx, observed)
	if err != nil {
		return nil, err
	}
	if cartographerEventAlreadyObserved(cursor, observed) {
		return nil, nil
	}

	now := timestamp(service.now())
	sourceKind, sourceID, err := cartographerSourceFromRefs(observed.sourceRefs, "")
	if err != nil {
		return nil, err
	}
	window, run, opened, err := service.openCartographerWindowForEvent(ctx, cursor, observed, sourceKind, sourceID, now)
	if err != nil {
		return nil, err
	}
	advancedCursor, closeReason := service.applyObservedEventToWindow(&window, &run, cursor, observed, opened, now)
	if closeReason != "" {
		if err := service.persistClosedObservedWindow(ctx, &window, run, advancedCursor, closeReason, now); err != nil {
			return nil, err
		}
		closed := []CartographerWindow{window}
		if _, err := service.supersedeObsoleteQueuedCartographerWindows(ctx, window, now); err != nil {
			return nil, err
		}
		if err := service.enqueueClosedCartographerWindows(ctx, closed); err != nil {
			return nil, err
		}
		return closed, nil
	}

	return nil, service.persistOpenObservedWindow(ctx, window, run, advancedCursor)
}

func (service *Service) validateObservedCartographerEventCall(ctx context.Context, observed observedCartographerEvent) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if _, err := service.resolveWorkspace(observed.sourceRefsWorkspaceID()); err != nil {
		return err
	}
	return validateObservedCartographerEvent(observed)
}

func (service *Service) cartographerCursorForObservedEvent(ctx context.Context, observed observedCartographerEvent) (CartographerCursor, error) {
	cursorKey := cartographerCursorKeyFromSourceRefs(observed.sourceRefs)
	cursorKey.WorkspaceID = observed.sourceRefsWorkspaceID()
	cursor, ok, err := service.store.ReadCartographerCursor(ctx, cursorKey)
	if err != nil {
		return CartographerCursor{}, err
	}
	if !ok {
		cursor, err = service.newCartographerCursor(cursorKey)
		if err != nil {
			return CartographerCursor{}, err
		}
	}
	normalizeCartographerCursor(&cursor)
	return cursor, nil
}

func (service *Service) newCartographerCursor(cursorKey CartographerCursorKey) (CartographerCursor, error) {
	cursorID, err := service.newID("cartographer_cursor")
	if err != nil {
		return CartographerCursor{}, fmt.Errorf("create cartographer cursor id: %w", err)
	}
	return CartographerCursor{
		ID:                         cursorID,
		WorkspaceID:                cursorKey.WorkspaceID,
		WorkflowExecutionID:        cursorKey.WorkflowExecutionID,
		WorkflowNodeExecutionID:    cursorKey.WorkflowNodeExecutionID,
		ChatConversationID:         cursorKey.ChatConversationID,
		ChatRunID:                  cursorKey.ChatRunID,
		LastOutputOrdinalByRunItem: map[string]int{},
	}, nil
}

func (service *Service) applyObservedEventToWindow(window *CartographerWindow, run *CartographerRun, cursor CartographerCursor, observed observedCartographerEvent, opened bool, now string) (CartographerCursor, CartographerWindowCloseReason) {
	if opened {
		cursor.LastWindowID = ""
	}
	event := cartographerTrajectoryEventFromObserved(observed)
	window.InputBundle.NewEvents = append(window.InputBundle.NewEvents, event)
	window.InputBundle.ObservedEventRefs = appendUniqueString(window.InputBundle.ObservedEventRefs, event.EventID)
	mergeObservedEventIntoInput(&window.InputBundle, observed, service.cartographerConfig)
	advancedCursor := advanceCartographerCursor(cursor, observed, now)
	window.InputBundle.WindowEndCursor = cartographerWindowCursorFromCursor(advancedCursor)
	closeReason := cartographerCloseReason(window.InputBundle, observed, service.cartographerConfig)
	window.InputBundle = applyCartographerInputLimits(window.InputBundle, service.cartographerConfig)
	run.InputBundle = window.InputBundle
	run.UpdatedAt = now
	return advancedCursor, closeReason
}

func (service *Service) persistClosedObservedWindow(ctx context.Context, window *CartographerWindow, run CartographerRun, cursor CartographerCursor, closeReason CartographerWindowCloseReason, now string) error {
	if closeReason == CartographerCloseWorkflowRunTerminal {
		window.InputBundle.TriggerKind = CartographerTriggerWorkflowDone
		run.TriggerKind = CartographerTriggerWorkflowDone
	}
	if err := service.closeCartographerWindowLocked(ctx, window, closeReason, now); err != nil {
		return err
	}
	run.InputBundle = window.InputBundle
	cursor.LastWindowID = window.ID
	prepareCartographerQueuedRun(&run, *window, now)
	if _, err := service.SaveCartographerRun(ctx, run); err != nil {
		return err
	}
	_, err := service.store.SaveCartographerCursor(ctx, cursor)
	return err
}

func (service *Service) persistOpenObservedWindow(ctx context.Context, window CartographerWindow, run CartographerRun, cursor CartographerCursor) error {
	if _, err := service.SaveCartographerRun(ctx, run); err != nil {
		return err
	}
	if _, err := service.SaveCartographerWindow(ctx, window); err != nil {
		return err
	}
	_, err := service.store.SaveCartographerCursor(ctx, cursor)
	return err
}

func (service *Service) openCartographerWindowForEvent(ctx context.Context, cursor CartographerCursor, observed observedCartographerEvent, sourceKind CartographerSourceKind, sourceID string, now string) (CartographerWindow, CartographerRun, bool, error) {
	window, run, ok, err := service.readOpenCartographerWindowAndRun(ctx, cursor)
	if err != nil || ok {
		return window, run, false, err
	}

	return service.newOpenCartographerWindowForEvent(ctx, cursor, observed, sourceKind, sourceID, now)
}

func (service *Service) readOpenCartographerWindowAndRun(ctx context.Context, cursor CartographerCursor) (CartographerWindow, CartographerRun, bool, error) {
	window, ok, err := service.store.ReadOpenCartographerWindowForCursor(ctx, cursor.WorkspaceID, cursor.ID)
	if err != nil || !ok {
		return CartographerWindow{}, CartographerRun{}, ok, err
	}
	run, ok, err := service.store.ReadCartographerRun(ctx, cursor.WorkspaceID, window.RunID)
	if err != nil {
		return CartographerWindow{}, CartographerRun{}, false, err
	}
	if !ok {
		return CartographerWindow{}, CartographerRun{}, false, fmt.Errorf("cartographer run %s was not found for open window %s", window.RunID, window.ID)
	}
	return window, run, true, nil
}

func (service *Service) newOpenCartographerWindowForEvent(ctx context.Context, cursor CartographerCursor, observed observedCartographerEvent, sourceKind CartographerSourceKind, sourceID string, now string) (CartographerWindow, CartographerRun, bool, error) {
	runID, err := service.newID("cartographer_run")
	if err != nil {
		return CartographerWindow{}, CartographerRun{}, false, fmt.Errorf("create cartographer run id: %w", err)
	}
	windowID, err := service.newID("cartographer_window")
	if err != nil {
		return CartographerWindow{}, CartographerRun{}, false, fmt.Errorf("create cartographer window id: %w", err)
	}
	trigger := CartographerTriggerWorkflowWindow
	if observed.closeReason == CartographerCloseWorkflowRunTerminal {
		trigger = CartographerTriggerWorkflowDone
	}
	input, err := service.newCartographerInputBundle(ctx, cartographerInputBundleRequest{
		workspaceID:       cursor.WorkspaceID,
		triggerKind:       trigger,
		sourceRefs:        observed.sourceRefs,
		runStatus:         observed.runStatus,
		windowID:          windowID,
		windowStartCursor: cartographerWindowCursorFromCursor(cursor),
		windowEndCursor:   cartographerWindowCursorFromCursor(cursor),
	})
	if err != nil {
		return CartographerWindow{}, CartographerRun{}, false, err
	}
	run := CartographerRun{
		ID:           runID,
		WorkspaceID:  cursor.WorkspaceID,
		Status:       CartographerRunQueued,
		TriggerKind:  trigger,
		SourceRefs:   observed.sourceRefs,
		InputBundle:  input,
		OutputSchema: DefaultCartographerPatchEnvelopeSchema(),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	window := CartographerWindow{
		ID:          windowID,
		WorkspaceID: cursor.WorkspaceID,
		RunID:       runID,
		Status:      CartographerWindowOpen,
		Sequence:    1,
		SourceKind:  sourceKind,
		SourceID:    sourceID,
		CursorID:    cursor.ID,
		InputBundle: input,
		OpenedAt:    now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	prepareCartographerQueuedRun(&run, window, now)
	return window, run, true, nil
}

func (service *Service) closeCartographerWindowLocked(ctx context.Context, window *CartographerWindow, closeReason CartographerWindowCloseReason, now string) error {
	summaryID := window.SummaryID
	if summaryID == "" {
		id, err := service.newID("cartographer_summary")
		if err != nil {
			return fmt.Errorf("create cartographer summary id: %w", err)
		}
		summaryID = id
	}
	window.Status = CartographerWindowClosed
	window.SummaryID = summaryID
	window.ClosedAt = now
	window.UpdatedAt = now
	if len(window.InputBundle.NewEvents) > 0 {
		lastIndex := len(window.InputBundle.NewEvents) - 1
		window.InputBundle.NewEvents[lastIndex].Boundary = true
		window.InputBundle.NewEvents[lastIndex].CloseReason = closeReason
	}
	window.InputBundle.Truncation.Reasons = appendUniqueString(window.InputBundle.Truncation.Reasons, string(closeReason))
	window.InputBundle = applyCartographerInputLimits(window.InputBundle, service.cartographerConfig)
	if _, err := service.SaveCartographerWindow(ctx, *window); err != nil {
		return err
	}
	summary := cartographerTrajectorySummaryFromWindow(summaryID, *window, window.InputBundle, now)
	if _, err := service.SaveCartographerTrajectorySummary(ctx, summary); err != nil {
		return err
	}
	return nil
}
