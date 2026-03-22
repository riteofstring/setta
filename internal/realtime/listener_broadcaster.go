package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"sync"

	"github.com/coder/websocket"
	"setta/internal/pythonsdkcontracts"
)

var (
	ErrEmptyRealtimeDeltas   = errors.New("realtime: listener deltas must contain at least one entry")
	ErrEmptyDependencyEvents = errors.New("realtime: listener dependency events must contain at least one entry")
)

type ListenerBroadcasterOptions struct {
	WebsocketHub *WebsocketHub
	Registry     *ListenerRegistry
	Sequencer    *Sequencer
	TemporaryIDs ListenerTemporaryIDStore
}

type ListenerBroadcaster struct {
	websocketHub *WebsocketHub
	registry     *ListenerRegistry
	sequencer    *Sequencer
	temporaryIDs ListenerTemporaryIDStore
}

type EmitRealtimeDeltasParams struct {
	ProjectID         string
	ShareSessionID    string
	Deltas            []ListenerRealtimeDelta
	DependencyValues  *ListenerRenderedDependencyValues
	MatchDependencies []string
}

type EmitDependencyEventsParams struct {
	ProjectID        string
	ShareSessionID   string
	DependencyEvents []ListenerDependencyEvent
}

type EmitRealtimeDeltasBinaryParams struct {
	ProjectID         string
	ShareSessionID    string
	Deltas            []ListenerRealtimeDelta
	DependencyValues  *ListenerRenderedDependencyValues
	MatchDependencies []string
	BinaryPayload     []byte
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
	Snapshot            pythonsdkcontracts.ListenerSnapshot
	Sequence            *uint64
	RefreshKind         string
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
		temporaryIDs: options.TemporaryIDs,
	}
}

func (b *ListenerBroadcaster) Registry() *ListenerRegistry {
	return b.registry
}

func (b *ListenerBroadcaster) EmitRealtimeDeltas(ctx context.Context, params EmitRealtimeDeltasParams) (uint64, int, error) {
	if len(params.Deltas) == 0 {
		return 0, 0, ErrEmptyRealtimeDeltas
	}

	dependencyKeys, err := listenerRealtimeMatchDependencies(params.Deltas, params.MatchDependencies)
	if err != nil {
		return 0, 0, err
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
			ProjectConfigID:  params.ProjectID,
			ShareSessionID:   params.ShareSessionID,
			Deltas:           cloneListenerDeltas(params.Deltas),
			DependencyValues: cloneListenerRenderedDependencyValues(params.DependencyValues),
			Sequence:         sequence,
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

	dependencyKeys, err := listenerRealtimeMatchDependencies(params.Deltas, params.MatchDependencies)
	if err != nil {
		return 0, 0, err
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
			ProjectConfigID:  params.ProjectID,
			ShareSessionID:   params.ShareSessionID,
			Deltas:           cloneListenerDeltas(params.Deltas),
			DependencyValues: cloneListenerRenderedDependencyValues(params.DependencyValues),
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
			CallID:      params.CallID,
			Snapshot:    cloneListenerSnapshot(params.Snapshot, params.ShareSessionID),
			Sequence:    params.Sequence,
			RefreshKind: params.RefreshKind,
		}),
		targetConnectionIDs,
	)
}

func (b *ListenerBroadcaster) BroadcastCoverageSnapshot(
	ctx context.Context,
	projectID string,
	shareSessionID string,
) (int, error) {
	snapshot, err := BuildListenerCoverageSnapshot(
		projectID,
		b.registry.RegistrationsForProject(projectID, shareSessionID),
	)
	if err != nil {
		return 0, err
	}
	return b.websocketHub.BroadcastJSON(
		ctx,
		NewListenerCoverageSnapshotMessage(snapshot),
		Selection{
			Type:           ConnectionTypeFrontend,
			ShareSessionID: strings.TrimSpace(shareSessionID),
		},
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
	type sendResult struct {
		delivered bool
		err       error
	}

	results := make(chan sendResult, len(connectionIDs))
	var wg sync.WaitGroup
	for _, connectionID := range connectionIDs {
		wg.Add(1)
		go func(connectionID string) {
			defer wg.Done()
			payload, err := b.listenerPayloadForConnection(connectionID, message)
			if err != nil {
				results <- sendResult{err: err}
				return
			}
			delivered := b.websocketHub.sendFrame(ctx, websocket.MessageText, payload, connectionID)
			if !delivered {
				b.registry.RemoveConnection(connectionID)
			}
			results <- sendResult{delivered: delivered}
		}(connectionID)
	}
	wg.Wait()
	close(results)

	delivered := 0
	var firstErr error
	for result := range results {
		if result.err != nil && firstErr == nil {
			firstErr = result.err
		}
		if result.delivered {
			delivered++
		}
	}
	if firstErr != nil {
		return 0, firstErr
	}
	return delivered, nil
}

func (b *ListenerBroadcaster) sendBinaryMessageToTargets(ctx context.Context, message any, binaryPayload []byte, connectionIDs []string) (int, error) {
	type sendResult struct {
		delivered bool
		err       error
	}

	results := make(chan sendResult, len(connectionIDs))
	var wg sync.WaitGroup
	for _, connectionID := range connectionIDs {
		wg.Add(1)
		go func(connectionID string) {
			defer wg.Done()
			frame, err := b.listenerBinaryFrameForConnection(connectionID, message, binaryPayload)
			if err != nil {
				results <- sendResult{err: err}
				return
			}
			delivered := b.websocketHub.sendFrame(ctx, websocket.MessageBinary, frame, connectionID)
			if !delivered {
				b.registry.RemoveConnection(connectionID)
			}
			results <- sendResult{delivered: delivered}
		}(connectionID)
	}
	wg.Wait()
	close(results)

	delivered := 0
	var firstErr error
	for result := range results {
		if result.err != nil && firstErr == nil {
			firstErr = result.err
		}
		if result.delivered {
			delivered++
		}
	}
	if firstErr != nil {
		return 0, firstErr
	}
	return delivered, nil
}

func (b *ListenerBroadcaster) listenerPayloadForConnection(connectionID string, message any) ([]byte, error) {
	translated, err := b.listenerMessageForConnection(connectionID, message)
	if err != nil {
		return nil, err
	}
	return json.Marshal(translated)
}

func (b *ListenerBroadcaster) listenerBinaryFrameForConnection(connectionID string, message any, binaryPayload []byte) ([]byte, error) {
	translated, err := b.listenerMessageForConnection(connectionID, message)
	if err != nil {
		return nil, err
	}
	return EncodeBinaryFrame(translated, binaryPayload)
}

func (b *ListenerBroadcaster) listenerMessageForConnection(connectionID string, message any) (any, error) {
	if b.temporaryIDs == nil {
		return message, nil
	}
	bootstrap, ok := b.registry.Bootstrap(connectionID)
	if !ok || !bootstrap.UseTemporaryIDs {
		return message, nil
	}
	return translateListenerMessageToTemporary(message, b.temporaryIDs)
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

func cloneListenerDependencyCatalog(catalog *ListenerDependencyCatalog) *ListenerDependencyCatalog {
	if catalog == nil {
		return nil
	}
	clonedEntries := make([]ListenerDependencyCatalogEntry, 0, len(catalog.Entries))
	for _, entry := range catalog.Entries {
		clonedEntry := entry
		if len(entry.Dependencies) > 0 {
			clonedEntry.Dependencies = append([]string(nil), entry.Dependencies...)
		}
		clonedEntries = append(clonedEntries, clonedEntry)
	}
	return &ListenerDependencyCatalog{Entries: clonedEntries}
}

func cloneListenerRenderedDependencyValues(values *ListenerRenderedDependencyValues) *ListenerRenderedDependencyValues {
	if values == nil {
		return nil
	}
	clonedEntries := make([]ListenerRenderedDependencyValue, 0, len(values.Entries))
	for _, entry := range values.Entries {
		clonedEntries = append(clonedEntries, entry)
	}
	return &ListenerRenderedDependencyValues{Entries: clonedEntries}
}

func cloneListenerSnapshot(
	snapshot pythonsdkcontracts.ListenerSnapshot,
	shareSessionID string,
) pythonsdkcontracts.ListenerSnapshot {
	clonedCatalogEntries := make([]pythonsdkcontracts.ListenerDependencyCatalogEntry, 0, len(snapshot.DependencyCatalog.Entries))
	for _, entry := range snapshot.DependencyCatalog.Entries {
		clonedEntry := entry
		clonedEntry.Dependencies = append([]string(nil), entry.Dependencies...)
		clonedCatalogEntries = append(clonedCatalogEntries, clonedEntry)
	}
	clonedValueEntries := make([]pythonsdkcontracts.ListenerRenderedDependencyValue, 0, len(snapshot.DependencyValues.Entries))
	for _, entry := range snapshot.DependencyValues.Entries {
		clonedValueEntries = append(clonedValueEntries, entry)
	}
	cloned := pythonsdkcontracts.ListenerSnapshot{
		ProjectConfigID: snapshot.ProjectConfigID,
		ShareSessionID:  snapshot.ShareSessionID,
		DependencyCatalog: pythonsdkcontracts.ListenerDependencyCatalog{
			Entries: clonedCatalogEntries,
		},
		DependencyValues: pythonsdkcontracts.ListenerRenderedDependencyValues{
			Entries: clonedValueEntries,
		},
	}
	if strings.TrimSpace(shareSessionID) != "" {
		shareSessionIDCopy := strings.TrimSpace(shareSessionID)
		cloned.ShareSessionID = &shareSessionIDCopy
	}
	return cloned
}

func listenerRealtimeMatchDependencies(
	deltas []ListenerRealtimeDelta,
	matchDependencies []string,
) ([]string, error) {
	dependencySet := map[string]struct{}{}
	for _, dependencyKey := range matchDependencies {
		dependencyKey = strings.TrimSpace(dependencyKey)
		if dependencyKey == "" {
			continue
		}
		dependencySet[dependencyKey] = struct{}{}
	}
	for _, delta := range deltas {
		dependencyKey := strings.TrimSpace(delta.Dependency)
		if dependencyKey == "" {
			return nil, ErrEmptyListenerDependency
		}
		dependencySet[dependencyKey] = struct{}{}
	}
	dependencyKeys := make([]string, 0, len(dependencySet))
	for dependencyKey := range dependencySet {
		dependencyKeys = append(dependencyKeys, dependencyKey)
	}
	sort.Strings(dependencyKeys)
	return dependencyKeys, nil
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
