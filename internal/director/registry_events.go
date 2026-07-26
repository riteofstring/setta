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
	abortOnce sync.Once
	aborted   chan struct{}
}

func newRegistrySubscription(registry *Registry) *registrySubscription {
	subscription := &registrySubscription{
		registry: registry,
		events:   make(chan DirectorEvent, directorSubscriptionBuffer),
		aborted:  make(chan struct{}),
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
		subscription.abort()
	})
}

func (subscription *registrySubscription) close() {
	subscription.mutex.Lock()
	subscription.closed = true
	subscription.mutex.Unlock()
	subscription.signal.Broadcast()
}

func (subscription *registrySubscription) abort() {
	subscription.abortOnce.Do(func() {
		subscription.mutex.Lock()
		subscription.closed = true
		subscription.pending = nil
		subscription.mutex.Unlock()
		close(subscription.aborted)
		subscription.signal.Broadcast()
	})
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
		select {
		case subscription.events <- event:
		case <-subscription.aborted:
			return
		}
	}
}

// enqueue queues one event. A subscriber past its backlog bound is replaced with
// a single resync. Best-effort text shares the stream's cursor with semantic
// events, so silently dropping even one text event would create an
// indistinguishable sequence gap at the renderer; resync is the only bounded
// overload response that keeps the cursor honest.
func (subscription *registrySubscription) enqueue(event DirectorEvent) {
	subscription.mutex.Lock()
	defer subscription.mutex.Unlock()
	if subscription.closed || subscription.terminal {
		return
	}
	if len(subscription.pending) >= maxPendingDirectorEvents {
		subscription.pending = []DirectorEvent{subscription.registry.resyncEvent(
			DirectorResyncServerRequired,
			DirectorEventCursor{StreamID: event.StreamID, Sequence: event.Sequence},
		)}
		subscription.terminal = true
		subscription.closed = true
		subscription.signal.Broadcast()
		return
	}
	subscription.pending = append(subscription.pending, event)
	if event.Kind == DirectorEventResyncRequired {
		subscription.terminal = true
		subscription.closed = true
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

// resyncSubscribers ends the current live views without changing the durable
// stream position. Collection windows have no per-record eviction event, so a
// boundary shift is the typed point where each renderer takes a fresh bounded
// snapshot. A later subscriber starts from that snapshot and is not forced
// through a resync that belonged to an earlier view.
func (registry *Registry) resyncSubscribers(reason DirectorResyncReason) {
	requested := DirectorEventCursor{StreamID: registry.streamID, Sequence: registry.sequence}
	event := registry.resyncEvent(reason, requested)
	for subscription := range registry.subscribers {
		subscription.enqueue(event)
		delete(registry.subscribers, subscription)
	}
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
			SelectionChanged: &DirectorSelectionChangedPayload{SelectedWorkstreamID: registry.state.activeSelection()},
		}}, nil
	case effectRemoval:
		return []DirectorEvent{{
			EmittedAt: emittedAt,
			Kind:      DirectorEventWorkstreamRemoved,
			WorkstreamRemoved: &DirectorWorkstreamRemovedPayload{
				WorkstreamID: effect.id,
			},
		}}, nil
	case effectApproval:
		return registry.singleEvent(registry.approvalEvent(effect.id, emittedAt))
	case effectResource:
		return registry.singleEvent(registry.resourceEvent(effect.id, emittedAt))
	case effectArtifact:
		return registry.singleEvent(registry.artifactEvent(effect.id, emittedAt))
	case effectText:
		return registry.singleEvent(registry.textEvent(effect, emittedAt))
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

// textEvent publishes full text surfaces only for the selected workstream.
// Adjacent workstreams receive compact semantic summaries and background
// workstreams receive aggregate status, so streaming their transcript content
// would violate the same detail-level boundary the snapshot applies.
func (registry *Registry) textEvent(
	effect registryEffect,
	emittedAt string,
) (DirectorEvent, bool, error) {
	if registry.publishedLevels[effect.id] != WorkstreamDetailSelected {
		return DirectorEvent{}, false, nil
	}
	if effect.text == nil {
		return DirectorEvent{}, false, fmt.Errorf(
			"director text effect for workstream %s has no payload",
			effect.id,
		)
	}
	payload := *effect.text
	payload.RunID = copyOptionalString(effect.text.RunID)
	return DirectorEvent{
		EmittedAt: emittedAt,
		Kind:      DirectorEventTextDelta,
		TextDelta: &payload,
	}, true, nil
}

// levelChangeEffects reports rows entering or leaving the bounded live window
// and rows whose detail level moved. A row entering or becoming visible receives
// the full graph its new level promises; a row leaving receives the removal
// event that keeps the renderer's collection bounded.
func (registry *Registry) levelChangeEffects(
	applied []registryEffect,
) ([]registryEffect, map[string]bool, error) {
	effects := make([]registryEffect, 0)
	replacedGraphs := map[string]bool{}
	nextWindow := registry.nextPublishedWindow()
	appliedGraphChanges := graphChangesByWorkstream(applied)
	for _, workstreamID := range registry.state.order {
		changed, replaced, err := registry.levelChangeEffect(
			workstreamID,
			nextWindow[workstreamID],
			appliedGraphChanges[workstreamID],
		)
		if err != nil {
			return nil, nil, err
		}
		effects = append(effects, changed...)
		if replaced {
			replacedGraphs[workstreamID] = true
		}
	}
	registry.publishedWindow = nextWindow
	return effects, replacedGraphs, nil
}

func (registry *Registry) nextPublishedWindow() map[string]bool {
	next := map[string]bool{}
	for _, workstream := range registry.state.snapshotWindow() {
		next[workstream.record.ID] = true
	}
	return next
}

func (registry *Registry) levelChangeEffect(
	workstreamID string,
	isWindowed bool,
	appliedGraphChange GraphChange,
) ([]registryEffect, bool, error) {
	wasWindowed := registry.publishedWindow[workstreamID]
	if wasWindowed && !isWindowed {
		delete(registry.publishedLevels, workstreamID)
		return []registryEffect{{kind: effectRemoval, id: workstreamID}}, true, nil
	}
	if !isWindowed {
		delete(registry.publishedLevels, workstreamID)
		return nil, false, nil
	}
	return registry.visibleLevelChangeEffects(workstreamID, wasWindowed, appliedGraphChange)
}

func (registry *Registry) visibleLevelChangeEffects(
	workstreamID string,
	wasWindowed bool,
	appliedGraphChange GraphChange,
) ([]registryEffect, bool, error) {
	level := registry.detailLevelFor(workstreamID)
	previousLevel, hadLevel := registry.publishedLevels[workstreamID]
	if wasWindowed && hadLevel && previousLevel == level {
		return nil, false, nil
	}
	registry.publishedLevels[workstreamID] = level
	effects := []registryEffect{{kind: effectWorkstream, id: workstreamID}}
	if level == WorkstreamDetailBackground {
		return registry.backgroundLevelChangeEffects(
			workstreamID,
			wasWindowed,
			hadLevel,
			previousLevel,
			appliedGraphChange,
			effects,
		)
	}
	return registry.detailedLevelChangeEffects(
		workstreamID,
		wasWindowed,
		hadLevel,
		previousLevel,
		level,
		appliedGraphChange,
		effects,
	)
}

func (registry *Registry) backgroundLevelChangeEffects(
	workstreamID string,
	wasWindowed bool,
	hadLevel bool,
	previousLevel WorkstreamDetailLevel,
	appliedGraphChange GraphChange,
	effects []registryEffect,
) ([]registryEffect, bool, error) {
	if !wasWindowed || !hadLevel || previousLevel == WorkstreamDetailBackground {
		return effects, true, nil
	}
	previous, err := registry.state.workstreamGraph(workstreamID, previousLevel)
	if err != nil {
		return nil, false, err
	}
	removed := append([]string{}, appliedGraphChange.RemovedNodeIDs...)
	for _, node := range previous.Nodes {
		removed = append(removed, node.ID)
	}
	removed = uniqueStrings(removed)
	if len(removed) == 0 {
		return effects, true, nil
	}
	return append(effects, registryEffect{
		kind: effectGraph,
		id:   workstreamID,
		graph: GraphChange{
			WorkstreamID:   workstreamID,
			RemovedNodeIDs: removed,
		},
	}), true, nil
}

func (registry *Registry) detailedLevelChangeEffects(
	workstreamID string,
	wasWindowed bool,
	hadLevel bool,
	previousLevel WorkstreamDetailLevel,
	level WorkstreamDetailLevel,
	appliedGraphChange GraphChange,
	effects []registryEffect,
) ([]registryEffect, bool, error) {
	graph, err := registry.state.workstreamGraph(workstreamID, level)
	if err != nil {
		return nil, false, err
	}
	removed, err := registry.removedNodesForLevelChange(
		workstreamID,
		wasWindowed,
		hadLevel,
		previousLevel,
		graph,
		appliedGraphChange,
	)
	if err != nil {
		return nil, false, err
	}
	if graphChangeIsEmpty(graph.Nodes, graph.Edges, removed) {
		return effects, true, nil
	}
	return append(effects, registryEffect{
		kind: effectGraph,
		id:   workstreamID,
		graph: GraphChange{
			WorkstreamID:   workstreamID,
			Nodes:          graph.Nodes,
			Edges:          graph.Edges,
			RemovedNodeIDs: removed,
		},
	}), true, nil
}

func (registry *Registry) removedNodesForLevelChange(
	workstreamID string,
	wasWindowed bool,
	hadLevel bool,
	previousLevel WorkstreamDetailLevel,
	graph WorkstreamGraph,
	appliedGraphChange GraphChange,
) ([]string, error) {
	removed := append([]string{}, appliedGraphChange.RemovedNodeIDs...)
	if !wasWindowed || !hadLevel || previousLevel == WorkstreamDetailBackground {
		return uniqueStrings(removed), nil
	}
	previous, err := registry.state.workstreamGraph(workstreamID, previousLevel)
	if err != nil {
		return nil, err
	}
	removed = append(removed, nodesMissingFromGraph(previous.Nodes, graph.Nodes)...)
	return uniqueStrings(removed), nil
}

func graphChangeIsEmpty(nodes []SemanticNode, edges []SemanticEdge, removed []string) bool {
	return len(nodes) == 0 && len(edges) == 0 && len(removed) == 0
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
		if effect.kind != effectWorkstream {
			continue
		}
		if workstream := registry.state.workstreams[effect.id]; registry.publishedWindow[effect.id] &&
			!registry.state.isActiveWorkstream(workstream) {
			return true
		}
		if !registry.publishedWindow[effect.id] ||
			registry.detailLevelFor(effect.id) == WorkstreamDetailBackground {
			return true
		}
		if selected := registry.state.activeSelection(); selected != nil &&
			*selected == effect.id &&
			registry.state.aggregates.WorkstreamCount > MaxSnapshotWorkstreams {
			return true
		}
	}
	return false
}

func (registry *Registry) recordPublishedLevels() {
	window := registry.state.snapshotWindow()
	levels := make(map[string]WorkstreamDetailLevel, len(window))
	publishedWindow := make(map[string]bool, len(window))
	for _, workstream := range window {
		workstreamID := workstream.record.ID
		publishedWindow[workstreamID] = true
		levels[workstreamID] = registry.detailLevelFor(workstreamID)
	}
	registry.publishedLevels = levels
	registry.publishedWindow = publishedWindow
}

func (registry *Registry) recordPublishedCollections() {
	registry.publishedApprovals = approvalIDs(
		registry.state.snapshotApprovals(registry.publishedLevels),
	)
	registry.publishedResources = resourceRequestIDs(
		registry.state.snapshotResourceRequests(registry.publishedLevels),
	)
	registry.publishedArtifacts = artifactIDs(
		registry.state.snapshotArtifacts(registry.publishedLevels),
	)
}

// prepareCollectionEffects keeps incremental rails aligned with the same
// bounded collections a snapshot returns. Direct record effects can add,
// update, or resolve one published record. When a cap or workstream-window
// shift admits or evicts some other record, the event contract has no honest
// single-record delta for that change, so subscribers receive a typed resync.
func (registry *Registry) prepareCollectionEffects(
	effects []registryEffect,
) ([]registryEffect, bool) {
	published := registry.publishedCollections()
	next := registry.nextPublishedCollections()
	resync := collectionEffectsRequireResync(published, next, effects)
	filtered := filterPublishedCollectionEffects(effects, published, next)
	registry.publishedApprovals = next.approvals
	registry.publishedResources = next.resources
	registry.publishedArtifacts = next.artifacts
	return filtered, resync
}

type publishedCollections struct {
	approvals map[string]bool
	artifacts map[string]bool
	resources map[string]bool
}

func (registry *Registry) publishedCollections() publishedCollections {
	return publishedCollections{
		approvals: registry.publishedApprovals,
		artifacts: registry.publishedArtifacts,
		resources: registry.publishedResources,
	}
}

func (registry *Registry) nextPublishedCollections() publishedCollections {
	return publishedCollections{
		approvals: approvalIDs(registry.state.snapshotApprovals(registry.publishedLevels)),
		artifacts: artifactIDs(registry.state.snapshotArtifacts(registry.publishedLevels)),
		resources: resourceRequestIDs(
			registry.state.snapshotResourceRequests(registry.publishedLevels),
		),
	}
}

func collectionEffectsRequireResync(
	published publishedCollections,
	next publishedCollections,
	effects []registryEffect,
) bool {
	for _, collection := range []struct {
		before map[string]bool
		after  map[string]bool
		kind   registryEffectKind
	}{
		{before: published.approvals, after: next.approvals, kind: effectApproval},
		{before: published.artifacts, after: next.artifacts, kind: effectArtifact},
		{before: published.resources, after: next.resources, kind: effectResource},
	} {
		expected := applyCollectionEffects(collection.before, collection.after, effects, collection.kind)
		if !equalStringSets(expected, collection.after) {
			return true
		}
	}
	return false
}

func filterPublishedCollectionEffects(
	effects []registryEffect,
	published publishedCollections,
	next publishedCollections,
) []registryEffect {
	filtered := make([]registryEffect, 0, len(effects))
	for _, effect := range effects {
		if collectionEffectIsVisible(effect, published, next) {
			filtered = append(filtered, effect)
		}
	}
	return filtered
}

func collectionEffectIsVisible(
	effect registryEffect,
	published publishedCollections,
	next publishedCollections,
) bool {
	var before map[string]bool
	var after map[string]bool
	switch effect.kind {
	case effectApproval:
		before, after = published.approvals, next.approvals
	case effectArtifact:
		before, after = published.artifacts, next.artifacts
	case effectResource:
		before, after = published.resources, next.resources
	default:
		return true
	}
	return before[effect.id] || after[effect.id]
}

func (registry *Registry) workstreamEvent(workstreamID string, emittedAt string) (DirectorEvent, bool, error) {
	if !registry.publishedWindow[workstreamID] {
		return DirectorEvent{}, false, nil
	}
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
// A background workstream receives no additions: it renders aggregate status,
// and its status already travels in its registry row. It does receive removals
// when it moves from a visible level to background, so the renderer cannot keep
// drawing stale detail. A change larger than one event's bound is split rather
// than truncated, because a delta that drops part of itself would leave the
// renderer holding a graph that never existed.
func (registry *Registry) graphEvents(change GraphChange, emittedAt string) ([]DirectorEvent, error) {
	level := registry.detailLevelFor(change.WorkstreamID)
	if level == WorkstreamDetailBackground && len(change.RemovedNodeIDs) == 0 {
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
	if workstreamID == DirectorLaneID {
		// The Director lane is never adjacent or background. It is the one place
		// the user is always looking, because it is where they are talking.
		return WorkstreamDetailSelected
	}
	selected := registry.state.activeSelection()
	if selected != nil && *selected == workstreamID {
		return WorkstreamDetailSelected
	}
	if registry.carried[workstreamID] {
		return graphDetailWithoutSelection(selected, len(registry.carried))
	}
	return WorkstreamDetailBackground
}

/*
 * How much of a workstream a snapshot carries when it is not the selected one.
 *
 * The compact level answers "does this need me?" — blockers, results, the last
 * milestone — which is the right answer for a workstream sitting beside the one
 * you are reading. It is the wrong answer when there is no one you are reading:
 * on the Director's own view every workstream is what you came to see, and a
 * summary of each is a view with the work left out.
 */
func graphDetailWithoutSelection(selected *string, carried int) WorkstreamDetailLevel {
	if selected != nil {
		return WorkstreamDetailAdjacent
	}
	if carried <= MaxDirectorColumnGraphs {
		return WorkstreamDetailSelected
	}
	return WorkstreamDetailAdjacent
}

// refreshDetailLevels recomputes which workstreams are adjacent. It runs after a
// fold rather than per event, so the level an event reports and the level the
// next snapshot assigns come from the same decision.
func (registry *Registry) refreshDetailLevels() {
	window := registry.state.snapshotWindow()
	selected := registry.state.activeSelection()
	/*
	 * How many graphs one snapshot carries.
	 *
	 * Beside a selected workstream a handful of compact neighbours is context.
	 * On the Director's own view the graphs are the view, so it carries every
	 * conversation it can and reduces them to tiles rather than dropping them:
	 * a conversation that vanishes from the canvas because a ninth one started
	 * is the app losing work in front of the user.
	 */
	budget := MaxSnapshotAdjacentGraphs
	if selected == nil {
		budget = MaxDirectorTiledGraphs
	}
	carried := make(map[string]bool, budget)
	for _, workstream := range window {
		if selected != nil && *selected == workstream.record.ID {
			continue
		}
		if len(carried) == budget {
			break
		}
		carried[workstream.record.ID] = true
	}
	registry.carried = carried
}

func withoutGraphEffects(effects []registryEffect, replaced map[string]bool) []registryEffect {
	if len(replaced) == 0 {
		return effects
	}
	filtered := make([]registryEffect, 0, len(effects))
	for _, effect := range effects {
		if effect.kind == effectGraph && replaced[effect.id] {
			continue
		}
		filtered = append(filtered, effect)
	}
	return filtered
}

func graphChangesByWorkstream(effects []registryEffect) map[string]GraphChange {
	changes := map[string]GraphChange{}
	for _, effect := range effects {
		if effect.kind != effectGraph {
			continue
		}
		change := changes[effect.id]
		change.WorkstreamID = effect.id
		change.Nodes = append(change.Nodes, effect.graph.Nodes...)
		change.Edges = append(change.Edges, effect.graph.Edges...)
		change.RemovedNodeIDs = append(change.RemovedNodeIDs, effect.graph.RemovedNodeIDs...)
		changes[effect.id] = change
	}
	return changes
}

func nodesMissingFromGraph(previous []SemanticNode, next []SemanticNode) []string {
	retained := make(map[string]bool, len(next))
	for _, node := range next {
		retained[node.ID] = true
	}
	removed := make([]string, 0)
	for _, node := range previous {
		if !retained[node.ID] {
			removed = append(removed, node.ID)
		}
	}
	return removed
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func applyCollectionEffects(
	previous map[string]bool,
	current map[string]bool,
	effects []registryEffect,
	kind registryEffectKind,
) map[string]bool {
	expected := cloneStringSet(previous)
	for _, effect := range effects {
		if effect.kind != kind {
			continue
		}
		if current[effect.id] {
			expected[effect.id] = true
		} else {
			delete(expected, effect.id)
		}
	}
	return expected
}

func cloneStringSet(source map[string]bool) map[string]bool {
	cloned := make(map[string]bool, len(source))
	for value := range source {
		cloned[value] = true
	}
	return cloned
}

func equalStringSets(left map[string]bool, right map[string]bool) bool {
	if len(left) != len(right) {
		return false
	}
	for value := range left {
		if !right[value] {
			return false
		}
	}
	return true
}

func approvalIDs(records []ApprovalRequest) map[string]bool {
	ids := make(map[string]bool, len(records))
	for _, record := range records {
		ids[record.ID] = true
	}
	return ids
}

func resourceRequestIDs(records []ResourceRequest) map[string]bool {
	ids := make(map[string]bool, len(records))
	for _, record := range records {
		ids[record.ID] = true
	}
	return ids
}

func artifactIDs(records []WorkstreamArtifact) map[string]bool {
	ids := make(map[string]bool, len(records))
	for _, record := range records {
		ids[record.ID] = true
	}
	return ids
}
