package director

import (
	"fmt"
	"sync"
)

// The pushed app-scoped event stream.
//
// The renderer loads one snapshot with its cursor and then receives changes. It
// never asks again: every event here is produced by a durable fact arriving, and
// a subscriber that cannot be caught up from the retained window is told to
// resync rather than left to poll for the truth.

const (
	// retainedDirectorEvents bounds the replay window one materialization keeps.
	// A cursor older than the window resyncs, which is cheaper and more honest
	// than rebuilding the whole derived stream from the durable log.
	retainedDirectorEvents = 1024
	// maxPendingDirectorEvents bounds one subscriber's backlog. Semantic events
	// are lossless, so a subscriber that stops reading is resynced instead of
	// silently missing one.
	maxPendingDirectorEvents = 512
	// directorSubscriptionBuffer is the handoff between the registry and one
	// subscriber's reader.
	directorSubscriptionBuffer = 64
)

// registrySubscription is one subscriber's queue. Delivery runs on its own
// goroutine so a slow reader cannot stall the fold that produces events.
type registrySubscription struct {
	registry  *Registry
	events    chan DirectorEvent
	mutex     sync.Mutex
	signal    *sync.Cond
	pending   []DirectorEvent
	closed    bool
	terminal  bool
	unsubOnce sync.Once
}

func newRegistrySubscription(registry *Registry) *registrySubscription {
	subscription := &registrySubscription{
		registry: registry,
		events:   make(chan DirectorEvent, directorSubscriptionBuffer),
	}
	subscription.signal = sync.NewCond(&subscription.mutex)
	go subscription.deliver()
	return subscription
}

func (subscription *registrySubscription) Events() <-chan DirectorEvent {
	return subscription.events
}

func (subscription *registrySubscription) Unsubscribe() {
	subscription.unsubOnce.Do(func() {
		subscription.registry.removeSubscription(subscription)
		subscription.close()
	})
}

func (subscription *registrySubscription) close() {
	subscription.mutex.Lock()
	subscription.closed = true
	subscription.mutex.Unlock()
	subscription.signal.Broadcast()
}

func (subscription *registrySubscription) deliver() {
	defer close(subscription.events)
	for {
		subscription.mutex.Lock()
		for len(subscription.pending) == 0 && !subscription.closed {
			subscription.signal.Wait()
		}
		if len(subscription.pending) == 0 {
			subscription.mutex.Unlock()
			return
		}
		event := subscription.pending[0]
		subscription.pending = subscription.pending[1:]
		subscription.mutex.Unlock()
		subscription.events <- event
	}
}

// enqueue queues one event. A subscriber past its backlog bound is replaced with
// a single resync, because a lossless stream cannot skip an event to make room.
func (subscription *registrySubscription) enqueue(event DirectorEvent) {
	subscription.mutex.Lock()
	defer subscription.mutex.Unlock()
	if subscription.closed || subscription.terminal {
		return
	}
	if len(subscription.pending) >= maxPendingDirectorEvents {
		delivery, err := DirectorEventDeliveryFor(event.Kind)
		if err == nil && delivery == DirectorEventDeliveryBestEffort {
			return
		}
		subscription.pending = []DirectorEvent{subscription.registry.resyncEvent(
			DirectorResyncServerRequired,
			DirectorEventCursor{StreamID: event.StreamID, Sequence: event.Sequence},
		)}
		subscription.terminal = true
		subscription.signal.Broadcast()
		return
	}
	subscription.pending = append(subscription.pending, event)
	if event.Kind == DirectorEventResyncRequired {
		subscription.terminal = true
	}
	subscription.signal.Broadcast()
}

// publish stamps one event with its position in the derived stream, retains it
// for replay, and hands it to every subscriber.
func (registry *Registry) publish(event DirectorEvent) error {
	registry.sequence++
	event.SchemaVersion = DirectorContractSchemaVersion
	event.StreamID = registry.streamID
	event.Sequence = registry.sequence
	eventID, err := DirectorEventID(registry.streamID, registry.sequence)
	if err != nil {
		return err
	}
	event.EventID = eventID
	if err := ValidateDirectorEvent(event); err != nil {
		return err
	}
	registry.retain(event)
	for subscription := range registry.subscribers {
		subscription.enqueue(event)
	}
	return nil
}

func (registry *Registry) retain(event DirectorEvent) {
	registry.retained = append(registry.retained, event)
	if len(registry.retained) <= retainedDirectorEvents {
		return
	}
	registry.retained = registry.retained[len(registry.retained)-retainedDirectorEvents:]
}

func (registry *Registry) retainedFrom() int {
	if len(registry.retained) == 0 {
		return registry.sequence + 1
	}
	return registry.retained[0].Sequence
}

// resyncEvent is the typed statement that replay from a cursor cannot continue.
// It carries both positions so the renderer can report what it missed instead of
// guessing.
func (registry *Registry) resyncEvent(reason DirectorResyncReason, requested DirectorEventCursor) DirectorEvent {
	eventID, _ := DirectorEventID(registry.streamID, registry.sequence+1)
	return DirectorEvent{
		SchemaVersion: DirectorContractSchemaVersion,
		StreamID:      registry.streamID,
		Sequence:      registry.sequence + 1,
		EventID:       eventID,
		EmittedAt:     registry.timestamp(),
		Kind:          DirectorEventResyncRequired,
		ResyncRequired: &DirectorResyncRequiredPayload{
			Reason:            reason,
			RequestedStreamID: requested.StreamID,
			RequestedSequence: requested.Sequence,
			CurrentStreamID:   registry.streamID,
			CurrentSequence:   registry.sequence,
		},
	}
}

// eventsForEffects turns one applied durable fact into the pushed events it
// justifies. Effects are deduplicated first, because one fact can touch the same
// record more than once and a renderer should receive one update, not three.
func (registry *Registry) eventsForEffects(effects []registryEffect) ([]DirectorEvent, error) {
	events := make([]DirectorEvent, 0, len(effects)+1)
	seen := map[string]bool{}
	for _, effect := range effects {
		key := string(effect.kind) + ":" + effect.id
		if effect.kind != effectGraph && seen[key] {
			continue
		}
		seen[key] = true
		produced, err := registry.eventForEffect(effect)
		if err != nil {
			return nil, err
		}
		events = append(events, produced...)
	}
	if registry.state.aggregates != registry.publishedAggregates {
		registry.publishedAggregates = registry.state.aggregates
		events = append(events, DirectorEvent{
			EmittedAt:         registry.timestamp(),
			Kind:              DirectorEventAggregatesUpdated,
			AggregatesUpdated: &DirectorAggregatesUpdatedPayload{Aggregates: registry.state.aggregates},
		})
	}
	return events, nil
}

func (registry *Registry) eventForEffect(effect registryEffect) ([]DirectorEvent, error) {
	emittedAt := registry.timestamp()
	switch effect.kind {
	case effectWorkstream:
		return registry.singleEvent(registry.workstreamEvent(effect.id, emittedAt))
	case effectGraph:
		return registry.graphEvents(effect.graph, emittedAt)
	case effectSelection:
		return []DirectorEvent{{
			EmittedAt:        emittedAt,
			Kind:             DirectorEventSelectionChanged,
			SelectionChanged: &DirectorSelectionChangedPayload{SelectedWorkstreamID: copyOptionalString(registry.state.selected)},
		}}, nil
	case effectApproval:
		return registry.singleEvent(registry.approvalEvent(effect.id, emittedAt))
	case effectResource:
		return registry.singleEvent(registry.resourceEvent(effect.id, emittedAt))
	case effectArtifact:
		return registry.singleEvent(registry.artifactEvent(effect.id, emittedAt))
	default:
		return nil, fmt.Errorf("unknown registry effect kind %q", effect.kind)
	}
}

func (registry *Registry) singleEvent(event DirectorEvent, emit bool, err error) ([]DirectorEvent, error) {
	if err != nil || !emit {
		return nil, err
	}
	return []DirectorEvent{event}, nil
}

// levelChangeEffects reports the workstreams whose detail level moved. A
// workstream that just became selected or adjacent must receive the graph its
// new level promises, because the renderer was holding nothing for it.
func (registry *Registry) levelChangeEffects() ([]registryEffect, error) {
	effects := make([]registryEffect, 0)
	for _, workstreamID := range registry.state.order {
		level := registry.detailLevelFor(workstreamID)
		if registry.publishedLevels[workstreamID] == level {
			continue
		}
		registry.publishedLevels[workstreamID] = level
		effects = append(effects, registryEffect{kind: effectWorkstream, id: workstreamID})
		if level == WorkstreamDetailBackground {
			continue
		}
		graph, err := registry.state.workstreamGraph(workstreamID, level)
		if err != nil {
			return nil, err
		}
		if len(graph.Nodes) == 0 && len(graph.Edges) == 0 {
			continue
		}
		effects = append(effects, registryEffect{
			kind:  effectGraph,
			id:    workstreamID,
			graph: GraphChange{WorkstreamID: workstreamID, Nodes: graph.Nodes, Edges: graph.Edges},
		})
	}
	return effects, nil
}

// needsLevelRefresh answers whether the adjacency set can have moved. It changes
// only when selection moves or when a workstream the registry was treating as
// background produced something, so an ordinary update inside the visible set
// costs no re-sort.
func (registry *Registry) needsLevelRefresh(effects []registryEffect) bool {
	for _, effect := range effects {
		if effect.kind == effectSelection {
			return true
		}
		if effect.kind == effectWorkstream && registry.detailLevelFor(effect.id) == WorkstreamDetailBackground {
			return true
		}
	}
	return false
}

func (registry *Registry) recordPublishedLevels() {
	levels := make(map[string]WorkstreamDetailLevel, len(registry.state.order))
	for _, workstreamID := range registry.state.order {
		levels[workstreamID] = registry.detailLevelFor(workstreamID)
	}
	registry.publishedLevels = levels
}

func (registry *Registry) workstreamEvent(workstreamID string, emittedAt string) (DirectorEvent, bool, error) {
	workstream, known := registry.state.workstreams[workstreamID]
	if !known {
		return DirectorEvent{}, false, fmt.Errorf("workstream %s left the registry while it was being reported", workstreamID)
	}
	return DirectorEvent{
		EmittedAt: emittedAt,
		Kind:      DirectorEventWorkstreamUpdated,
		WorkstreamUpdated: &DirectorWorkstreamUpdatedPayload{
			Entry: DirectorWorkstreamEntry{
				Workstream:  cloneWorkstream(workstream.record),
				DetailLevel: registry.detailLevelFor(workstreamID),
			},
		},
	}, true, nil
}

// graphEvents carry only what the fact touched. Sending the changed nodes and
// edges rather than a replacement graph is what keeps a burst of provider events
// from rebuilding a scene once per event.
//
// A background workstream receives none of this: it renders aggregate status,
// and its status already travels in its registry row. A change larger than one
// event's bound is split rather than truncated, because a delta that drops part
// of itself would leave the renderer holding a graph that never existed.
func (registry *Registry) graphEvents(change GraphChange, emittedAt string) ([]DirectorEvent, error) {
	level := registry.detailLevelFor(change.WorkstreamID)
	if level == WorkstreamDetailBackground {
		return nil, nil
	}
	maxNodes := MaxSnapshotGraphNodes
	if level == WorkstreamDetailAdjacent {
		maxNodes = MaxSnapshotAdjacentGraphNodes
	}
	events := make([]DirectorEvent, 0, 1)
	for _, nodes := range chunkSlice(change.Nodes, maxNodes) {
		events = append(events, registry.graphEvent(change.WorkstreamID, level, emittedAt, func(payload *DirectorGraphUpdatedPayload) {
			payload.Nodes = nodes
		}))
	}
	for _, edges := range chunkSlice(change.Edges, MaxSnapshotGraphEdges) {
		events = append(events, registry.graphEvent(change.WorkstreamID, level, emittedAt, func(payload *DirectorGraphUpdatedPayload) {
			payload.Edges = edges
		}))
	}
	for _, removed := range chunkSlice(change.RemovedNodeIDs, maxNodes) {
		events = append(events, registry.graphEvent(change.WorkstreamID, level, emittedAt, func(payload *DirectorGraphUpdatedPayload) {
			payload.RemovedNodeIDs = removed
		}))
	}
	return events, nil
}

func (registry *Registry) graphEvent(
	workstreamID string,
	level WorkstreamDetailLevel,
	emittedAt string,
	fill func(*DirectorGraphUpdatedPayload),
) DirectorEvent {
	payload := &DirectorGraphUpdatedPayload{
		WorkstreamID:   workstreamID,
		DetailLevel:    level,
		Nodes:          []SemanticNode{},
		Edges:          []SemanticEdge{},
		RemovedNodeIDs: []string{},
	}
	fill(payload)
	return DirectorEvent{
		EmittedAt:    emittedAt,
		Kind:         DirectorEventGraphUpdated,
		GraphUpdated: payload,
	}
}

func chunkSlice[T any](values []T, size int) [][]T {
	if len(values) == 0 {
		return nil
	}
	chunks := make([][]T, 0, (len(values)+size-1)/size)
	for start := 0; start < len(values); start += size {
		end := start + size
		if end > len(values) {
			end = len(values)
		}
		chunks = append(chunks, values[start:end])
	}
	return chunks
}

func (registry *Registry) approvalEvent(approvalID string, emittedAt string) (DirectorEvent, bool, error) {
	record, known := registry.state.approvals[approvalID]
	if !known {
		return DirectorEvent{}, false, fmt.Errorf("approval %s left the registry while it was being reported", approvalID)
	}
	return DirectorEvent{
		EmittedAt:       emittedAt,
		Kind:            DirectorEventApprovalUpdated,
		ApprovalUpdated: &DirectorApprovalUpdatedPayload{Approval: cloneApprovalRequest(*record)},
	}, true, nil
}

func (registry *Registry) resourceEvent(requestID string, emittedAt string) (DirectorEvent, bool, error) {
	record, known := registry.state.resources[requestID]
	if !known {
		return DirectorEvent{}, false, fmt.Errorf("resource request %s left the registry while it was being reported", requestID)
	}
	return DirectorEvent{
		EmittedAt: emittedAt,
		Kind:      DirectorEventResourceRequestUpdated,
		ResourceRequestUpdated: &DirectorResourceRequestUpdatedPayload{
			ResourceRequest: cloneResourceRequest(*record),
		},
	}, true, nil
}

func (registry *Registry) artifactEvent(artifactID string, emittedAt string) (DirectorEvent, bool, error) {
	record, known := registry.state.artifacts[artifactID]
	if !known {
		return DirectorEvent{}, false, fmt.Errorf("artifact %s left the registry while it was being reported", artifactID)
	}
	return DirectorEvent{
		EmittedAt:       emittedAt,
		Kind:            DirectorEventArtifactUpdated,
		ArtifactUpdated: &DirectorArtifactUpdatedPayload{Artifact: cloneWorkstreamArtifact(*record)},
	}, true, nil
}

// detailLevelFor reports the depth the registry currently assigns a workstream.
// Detail level is a consequence of selection and recency, so an event carries
// the level the receiving renderer should hold that workstream at.
func (registry *Registry) detailLevelFor(workstreamID string) WorkstreamDetailLevel {
	if registry.state.selected != nil && *registry.state.selected == workstreamID {
		return WorkstreamDetailSelected
	}
	if _, adjacent := registry.adjacent[workstreamID]; adjacent {
		return WorkstreamDetailAdjacent
	}
	return WorkstreamDetailBackground
}

// refreshDetailLevels recomputes which workstreams are adjacent. It runs after a
// fold rather than per event, so the level an event reports and the level the
// next snapshot assigns come from the same decision.
func (registry *Registry) refreshDetailLevels() {
	window := registry.state.snapshotWindow()
	adjacent := make(map[string]bool, MaxSnapshotAdjacentGraphs)
	count := 0
	for _, workstream := range window {
		if registry.state.selected != nil && *registry.state.selected == workstream.record.ID {
			continue
		}
		if count == MaxSnapshotAdjacentGraphs {
			break
		}
		adjacent[workstream.record.ID] = true
		count++
	}
	registry.adjacent = adjacent
}
