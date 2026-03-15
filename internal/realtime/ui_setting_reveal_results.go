package realtime

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
)

var ErrUISettingRevealRequestNotRegistered = errors.New("realtime: UI setting reveal request is not registered")

type RegisterUISettingRevealRequestParams struct {
	ExpectedWebsocketID     string
	ExpectedProjectConfigID string
	ExpectedSettingIDs      []string
}

type RevealResultTransportDisconnectedError struct {
	RequestID   string
	WebsocketID string
}

func (e *RevealResultTransportDisconnectedError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf(
		"frontend websocket disconnected while reveal request was pending: %s (request %s)",
		e.WebsocketID,
		e.RequestID,
	)
}

type RevealResultContractMismatchError struct {
	RequestID   string
	WebsocketID string
	Reason      string
}

func (e *RevealResultContractMismatchError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf(
		"frontend reveal response contract mismatch for request %s from websocket %s: %s",
		e.RequestID,
		e.WebsocketID,
		e.Reason,
	)
}

type UISettingRevealResultHub struct {
	mu      sync.RWMutex
	waiters map[string]*uiSettingRevealResultWaiter
}

type uiSettingRevealResultWaiter struct {
	expectedWebsocketID     string
	expectedProjectConfigID string
	expectedSettingIDs      []string
	resultCh                chan uiSettingRevealWaitResult
	once                    sync.Once
}

type uiSettingRevealWaitResult struct {
	content UISettingRevealResultContent
	err     error
}

func NewUISettingRevealResultHub() *UISettingRevealResultHub {
	return &UISettingRevealResultHub{
		waiters: map[string]*uiSettingRevealResultWaiter{},
	}
}

func (h *UISettingRevealResultHub) RegisterRequest(requestID string, params RegisterUISettingRevealRequestParams) error {
	if h == nil {
		return fmt.Errorf("realtime: UI setting reveal result hub is required")
	}
	normalizedRequestID := strings.TrimSpace(requestID)
	if normalizedRequestID == "" {
		return fmt.Errorf("realtime: UI setting reveal request id is required")
	}

	waiter := &uiSettingRevealResultWaiter{
		expectedWebsocketID:     strings.TrimSpace(params.ExpectedWebsocketID),
		expectedProjectConfigID: strings.TrimSpace(params.ExpectedProjectConfigID),
		expectedSettingIDs:      normalizeExpectedSettingIDs(params.ExpectedSettingIDs),
		resultCh:                make(chan uiSettingRevealWaitResult, 1),
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	if _, exists := h.waiters[normalizedRequestID]; exists {
		return fmt.Errorf("realtime: duplicate UI setting reveal request id %q", normalizedRequestID)
	}
	h.waiters[normalizedRequestID] = waiter
	return nil
}

func (h *UISettingRevealResultHub) CancelRequest(requestID string) bool {
	if h == nil {
		return false
	}
	normalizedRequestID := strings.TrimSpace(requestID)
	if normalizedRequestID == "" {
		return false
	}

	waiter, ok := h.waiter(normalizedRequestID)
	if !ok {
		return false
	}
	h.removeWaiter(normalizedRequestID, waiter)
	return waiter.deliver(uiSettingRevealWaitResult{err: context.Canceled})
}

func (h *UISettingRevealResultHub) CancelRequestsForWebsocketID(websocketID string) int {
	if h == nil {
		return 0
	}
	normalizedWebsocketID := strings.TrimSpace(websocketID)
	if normalizedWebsocketID == "" {
		return 0
	}

	h.mu.RLock()
	matching := make([]struct {
		requestID string
		waiter    *uiSettingRevealResultWaiter
	}, 0, len(h.waiters))
	for requestID, waiter := range h.waiters {
		if waiter.expectedWebsocketID != normalizedWebsocketID {
			continue
		}
		matching = append(matching, struct {
			requestID string
			waiter    *uiSettingRevealResultWaiter
		}{
			requestID: requestID,
			waiter:    waiter,
		})
	}
	h.mu.RUnlock()

	cancelled := 0
	for _, item := range matching {
		if item.waiter.deliver(uiSettingRevealWaitResult{
			err: &RevealResultTransportDisconnectedError{
				RequestID:   item.requestID,
				WebsocketID: normalizedWebsocketID,
			},
		}) {
			cancelled++
		}
	}
	return cancelled
}

func (h *UISettingRevealResultHub) Wait(ctx context.Context, requestID string) (UISettingRevealResultContent, error) {
	if h == nil {
		return UISettingRevealResultContent{}, fmt.Errorf("realtime: UI setting reveal result hub is required")
	}
	normalizedRequestID := strings.TrimSpace(requestID)
	if normalizedRequestID == "" {
		return UISettingRevealResultContent{}, ErrUISettingRevealRequestNotRegistered
	}

	waiter, ok := h.waiter(normalizedRequestID)
	if !ok {
		return UISettingRevealResultContent{}, ErrUISettingRevealRequestNotRegistered
	}
	defer h.removeWaiter(normalizedRequestID, waiter)

	select {
	case result := <-waiter.resultCh:
		return result.content, result.err
	case <-ctx.Done():
		return UISettingRevealResultContent{}, ctx.Err()
	}
}

func (h *UISettingRevealResultHub) Resolve(content UISettingRevealResultContent, fromWebsocketID string) bool {
	if h == nil {
		return false
	}

	normalizedRequestID := strings.TrimSpace(content.RequestID)
	waiter, ok := h.waiter(normalizedRequestID)
	if !ok {
		return false
	}
	return waiter.deliver(waiter.validate(content, strings.TrimSpace(fromWebsocketID)))
}

func (h *UISettingRevealResultHub) waiter(requestID string) (*uiSettingRevealResultWaiter, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	waiter, ok := h.waiters[requestID]
	return waiter, ok
}

func (h *UISettingRevealResultHub) removeWaiter(requestID string, waiter *uiSettingRevealResultWaiter) {
	h.mu.Lock()
	defer h.mu.Unlock()
	current, ok := h.waiters[requestID]
	if ok && current == waiter {
		delete(h.waiters, requestID)
	}
}

func (w *uiSettingRevealResultWaiter) deliver(result uiSettingRevealWaitResult) bool {
	delivered := false
	w.once.Do(func() {
		w.resultCh <- result
		delivered = true
	})
	return delivered
}

func (w *uiSettingRevealResultWaiter) validate(content UISettingRevealResultContent, fromWebsocketID string) uiSettingRevealWaitResult {
	if w.expectedWebsocketID != "" && w.expectedWebsocketID != fromWebsocketID {
		return uiSettingRevealWaitResult{
			err: &RevealResultContractMismatchError{
				RequestID:   content.RequestID,
				WebsocketID: fromWebsocketID,
				Reason: fmt.Sprintf(
					"frontend reveal response websocket mismatch: expected %s but received %s",
					w.expectedWebsocketID,
					fromWebsocketID,
				),
			},
		}
	}
	if w.expectedProjectConfigID != "" && strings.TrimSpace(content.ProjectConfigID) != w.expectedProjectConfigID {
		return uiSettingRevealWaitResult{
			err: &RevealResultContractMismatchError{
				RequestID:   content.RequestID,
				WebsocketID: fromWebsocketID,
				Reason: fmt.Sprintf(
					"frontend reveal response project mismatch: expected %s but received %s",
					w.expectedProjectConfigID,
					strings.TrimSpace(content.ProjectConfigID),
				),
			},
		}
	}
	if len(w.expectedSettingIDs) > 0 {
		actualSettingIDs := make([]string, 0, len(content.Statuses))
		for _, status := range content.Statuses {
			actualSettingIDs = append(actualSettingIDs, strings.TrimSpace(status.SettingID))
		}
		actualSettingIDs = normalizeExpectedSettingIDs(actualSettingIDs)
		if !slices.Equal(w.expectedSettingIDs, actualSettingIDs) {
			return uiSettingRevealWaitResult{
				err: &RevealResultContractMismatchError{
					RequestID:   content.RequestID,
					WebsocketID: fromWebsocketID,
					Reason: fmt.Sprintf(
						"frontend reveal response setting id mismatch: expected [%s] but received [%s]",
						strings.Join(w.expectedSettingIDs, ", "),
						strings.Join(actualSettingIDs, ", "),
					),
				},
			}
		}
	}
	return uiSettingRevealWaitResult{content: content}
}

func normalizeExpectedSettingIDs(settingIDs []string) []string {
	if len(settingIDs) == 0 {
		return nil
	}
	normalized := make([]string, 0, len(settingIDs))
	for _, settingID := range settingIDs {
		trimmed := strings.TrimSpace(settingID)
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, trimmed)
	}
	slices.Sort(normalized)
	return normalized
}
