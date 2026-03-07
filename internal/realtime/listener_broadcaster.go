package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
)

var ErrEmptyRealtimeDeltas = errors.New("realtime: listener deltas must contain at least one entry")

type ListenerBroadcasterOptions struct {
	WebsocketHub *WebsocketHub
	Registry     *ListenerRegistry
	Sequencer    *Sequencer
}

type ListenerBroadcaster struct {
	websocketHub *WebsocketHub
	registry     *ListenerRegistry
	sequencer    *Sequencer
}

type EmitRealtimeDeltasParams struct {
	ProjectID      string
	ShareSessionID string
	Deltas         []ListenerRealtimeDelta
}

type ForceRefreshParams struct {
	ProjectID           string
	ShareSessionID      string
	ProjectState        json.RawMessage
	TargetConnectionIDs []string
}

func NewListenerBroadcaster(options ListenerBroadcasterOptions) *ListenerBroadcaster {
	websocketHub := options.WebsocketHub
	if websocketHub == nil {
		websocketHub = NewWebsocketHub(WebsocketHubOptions{})
	}

	registry := options.Registry
	if registry == nil {
		registry = NewListenerRegistry()
	}

	sequencer := options.Sequencer
	if sequencer == nil {
		sequencer = NewSequencer()
	}

	return &ListenerBroadcaster{
		websocketHub: websocketHub,
		registry:     registry,
		sequencer:    sequencer,
	}
}

func (b *ListenerBroadcaster) Registry() *ListenerRegistry {
	return b.registry
}

func (b *ListenerBroadcaster) EmitRealtimeDeltas(ctx context.Context, params EmitRealtimeDeltasParams) (uint64, int, error) {
	if len(params.Deltas) == 0 {
		return 0, 0, ErrEmptyRealtimeDeltas
	}

	dependencyKeys := make([]string, 0, len(params.Deltas))
	for _, delta := range params.Deltas {
		if strings.TrimSpace(delta.Dependency) == "" {
			return 0, 0, ErrEmptyListenerDependency
		}
		dependencyKeys = append(dependencyKeys, strings.TrimSpace(delta.Dependency))
	}

	scope := Scope{
		ProjectID:      params.ProjectID,
		ShareSessionID: params.ShareSessionID,
	}
	sequence, err := b.sequencer.Next(scope)
	if err != nil {
		return 0, 0, err
	}

	targetConnectionIDs := b.registry.MatchingConnectionIDs(
		params.ProjectID,
		dependencyKeys,
		params.ShareSessionID,
	)
	if len(targetConnectionIDs) == 0 {
		return sequence, 0, nil
	}

	delivered, err := b.sendMessageToTargets(
		ctx,
		NewListenerRealtimeEventMessage(ListenerRealtimeEventContent{
			ProjectID:      params.ProjectID,
			ShareSessionID: params.ShareSessionID,
			Deltas:         cloneListenerDeltas(params.Deltas),
			Sequence:       sequence,
		}),
		targetConnectionIDs,
	)
	if err != nil {
		return 0, 0, err
	}
	return sequence, delivered, nil
}

func (b *ListenerBroadcaster) SendForceRefresh(ctx context.Context, params ForceRefreshParams) (int, error) {
	scope := Scope{
		ProjectID:      params.ProjectID,
		ShareSessionID: params.ShareSessionID,
	}
	if err := b.sequencer.Reset(scope); err != nil {
		return 0, err
	}

	targetConnectionIDs := cloneConnectionIDs(params.TargetConnectionIDs)
	if len(targetConnectionIDs) == 0 {
		targetConnectionIDs = b.registry.BootstrapConnectionIDs(params.ProjectID, params.ShareSessionID)
	}
	if len(targetConnectionIDs) == 0 {
		return 0, nil
	}

	return b.sendMessageToTargets(
		ctx,
		NewListenerForceRefreshMessage(ListenerForceRefreshContent{
			ProjectID:      params.ProjectID,
			ShareSessionID: params.ShareSessionID,
			ProjectState:   cloneRawMessage(params.ProjectState),
		}),
		targetConnectionIDs,
	)
}

func (b *ListenerBroadcaster) RemoveConnection(connectionID string) {
	b.registry.RemoveConnection(connectionID)
}

func (b *ListenerBroadcaster) sendMessageToTargets(ctx context.Context, message any, connectionIDs []string) (int, error) {
	payload, err := json.Marshal(message)
	if err != nil {
		return 0, err
	}

	results := make(chan bool, len(connectionIDs))
	var wg sync.WaitGroup
	for _, connectionID := range connectionIDs {
		wg.Add(1)
		go func(connectionID string) {
			defer wg.Done()
			delivered := b.websocketHub.sendPayload(ctx, payload, connectionID)
			if !delivered {
				b.registry.RemoveConnection(connectionID)
			}
			results <- delivered
		}(connectionID)
	}
	wg.Wait()
	close(results)

	delivered := 0
	for wasDelivered := range results {
		if wasDelivered {
			delivered++
		}
	}
	return delivered, nil
}

func cloneListenerDeltas(deltas []ListenerRealtimeDelta) []ListenerRealtimeDelta {
	cloned := make([]ListenerRealtimeDelta, 0, len(deltas))
	for _, delta := range deltas {
		cloned = append(cloned, ListenerRealtimeDelta{
			Dependency: delta.Dependency,
			Value:      cloneRawMessage(delta.Value),
		})
	}
	return cloned
}

func cloneConnectionIDs(connectionIDs []string) []string {
	if len(connectionIDs) == 0 {
		return nil
	}

	cloned := make([]string, 0, len(connectionIDs))
	for _, connectionID := range connectionIDs {
		connectionID = strings.TrimSpace(connectionID)
		if connectionID == "" {
			continue
		}
		cloned = append(cloned, connectionID)
	}
	return cloned
}

func cloneRawMessage(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return nil
	}

	cloned := make(json.RawMessage, len(raw))
	copy(cloned, raw)
	return cloned
}
