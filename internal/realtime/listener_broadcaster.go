package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"

	"github.com/coder/websocket"
)

var (
	ErrEmptyRealtimeDeltas   = errors.New("realtime: listener deltas must contain at least one entry")
	ErrEmptyDependencyEvents = errors.New("realtime: listener dependency events must contain at least one entry")
)

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

type EmitDependencyEventsParams struct {
	ProjectID        string
	ShareSessionID   string
	DependencyEvents []ListenerDependencyEvent
}

type EmitRealtimeDeltasBinaryParams struct {
	ProjectID      string
	ShareSessionID string
	Deltas         []ListenerRealtimeDelta
	BinaryPayload  []byte
}

type EmitDependencyEventsBinaryParams struct {
	ProjectID        string
	ShareSessionID   string
	DependencyEvents []ListenerDependencyEvent
	BinaryPayload    []byte
}

type ForceRefreshParams struct {
	ProjectID           string
	ShareSessionID      string
	CallID              string
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
			ProjectConfigID: params.ProjectID,
			ShareSessionID:  params.ShareSessionID,
			Deltas:          cloneListenerDeltas(params.Deltas),
			Sequence:        sequence,
		}),
		targetConnectionIDs,
	)
	if err != nil {
		return 0, 0, err
	}
	return sequence, delivered, nil
}

func (b *ListenerBroadcaster) EmitRealtimeDeltasBinary(ctx context.Context, params EmitRealtimeDeltasBinaryParams) (uint64, int, error) {
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

	delivered, err := b.sendBinaryMessageToTargets(
		ctx,
		NewListenerRealtimeEventMessage(ListenerRealtimeEventContent{
			ProjectConfigID: params.ProjectID,
			ShareSessionID:  params.ShareSessionID,
			Deltas:          cloneListenerDeltas(params.Deltas),
			Sequence:        sequence,
		}),
		params.BinaryPayload,
		targetConnectionIDs,
	)
	if err != nil {
		return 0, 0, err
	}
	return sequence, delivered, nil
}

func (b *ListenerBroadcaster) EmitDependencyEvents(ctx context.Context, params EmitDependencyEventsParams) (uint64, int, error) {
	if len(params.DependencyEvents) == 0 {
		return 0, 0, ErrEmptyDependencyEvents
	}

	dependencyKeys := make([]string, 0, len(params.DependencyEvents))
	for _, event := range params.DependencyEvents {
		dependencyKey := strings.TrimSpace(event.DependencyKey)
		if dependencyKey == "" {
			return 0, 0, ErrEmptyListenerDependency
		}
		dependencyKeys = append(dependencyKeys, dependencyKey)
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
		NewListenerDependencyEventMessage(ListenerDependencyEventContent{
			ProjectConfigID:  params.ProjectID,
			ShareSessionID:   params.ShareSessionID,
			DependencyEvents: cloneDependencyEvents(params.DependencyEvents),
			Sequence:         sequence,
		}),
		targetConnectionIDs,
	)
	if err != nil {
		return 0, 0, err
	}
	return sequence, delivered, nil
}

func (b *ListenerBroadcaster) EmitDependencyEventsBinary(ctx context.Context, params EmitDependencyEventsBinaryParams) (uint64, int, error) {
	if len(params.DependencyEvents) == 0 {
		return 0, 0, ErrEmptyDependencyEvents
	}

	dependencyKeys := make([]string, 0, len(params.DependencyEvents))
	for _, event := range params.DependencyEvents {
		dependencyKey := strings.TrimSpace(event.DependencyKey)
		if dependencyKey == "" {
			return 0, 0, ErrEmptyListenerDependency
		}
		dependencyKeys = append(dependencyKeys, dependencyKey)
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

	delivered, err := b.sendBinaryMessageToTargets(
		ctx,
		NewListenerDependencyEventMessage(ListenerDependencyEventContent{
			ProjectConfigID:  params.ProjectID,
			ShareSessionID:   params.ShareSessionID,
			DependencyEvents: cloneDependencyEvents(params.DependencyEvents),
			Sequence:         sequence,
		}),
		params.BinaryPayload,
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
			ProjectConfigID: params.ProjectID,
			ShareSessionID:  params.ShareSessionID,
			CallID:          params.CallID,
			ProjectState:    cloneRawMessage(params.ProjectState),
		}),
		targetConnectionIDs,
	)
}

func (b *ListenerBroadcaster) RemoveConnection(connectionID string) {
	b.registry.RemoveConnection(connectionID)
}

func (b *ListenerBroadcaster) DropShareSession(shareSessionID string) {
	shareSessionID = strings.TrimSpace(shareSessionID)
	if shareSessionID == "" {
		return
	}

	b.registry.DropShareSession(shareSessionID)
	b.sequencer.DropShareSession(shareSessionID)
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
			delivered := b.websocketHub.sendFrame(ctx, websocket.MessageText, payload, connectionID)
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

func (b *ListenerBroadcaster) sendBinaryMessageToTargets(ctx context.Context, message any, binaryPayload []byte, connectionIDs []string) (int, error) {
	frame, err := EncodeBinaryFrame(message, binaryPayload)
	if err != nil {
		return 0, err
	}

	results := make(chan bool, len(connectionIDs))
	var wg sync.WaitGroup
	for _, connectionID := range connectionIDs {
		wg.Add(1)
		go func(connectionID string) {
			defer wg.Done()
			delivered := b.websocketHub.sendFrame(ctx, websocket.MessageBinary, frame, connectionID)
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
			Dependency:    delta.Dependency,
			Value:         cloneRawMessage(delta.Value),
			BinaryPayload: cloneBytes(delta.BinaryPayload),
		})
	}
	return cloned
}

func cloneDependencyEvents(events []ListenerDependencyEvent) []ListenerDependencyEvent {
	cloned := make([]ListenerDependencyEvent, 0, len(events))
	for _, event := range events {
		cloned = append(cloned, ListenerDependencyEvent{
			DependencyKey: event.DependencyKey,
			Payload:       cloneRawMessage(event.Payload),
			TimestampMS:   event.TimestampMS,
			BinaryPayload: cloneBytes(event.BinaryPayload),
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
