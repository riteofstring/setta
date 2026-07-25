package director

import (
	"fmt"

	"setta/internal/conversation"
)

// The Director graph projector.
//
// The graph is a projection, not canonical state: durable typed facts go in, a
// semantic graph comes out, and replaying the same ordered facts must produce
// the same graph. The projector holds no clock, no randomness, no I/O, and no
// view state, so a live push stream and a cold replay of the same events are the
// same computation.

// MaxNodePublicSummaryRunes bounds the label a node carries into the canvas.
// Bounding is not summarizing: the durable event keeps the full text for the
// accessible detail surfaces, and the projector never rewrites what it truncates.
const MaxNodePublicSummaryRunes = 240

// ProjectorEvent is one durable fact at its position in the app-scoped stream.
// Exactly one of the four owners is populated: workstream records own the
// durable existence and current title of a workstream, conversation trajectory
// events own what happened inside it, Director facts own app-scoped truth, and
// Director conversation entries own the dialogue the user is having with the
// app itself.
type ProjectorEvent struct {
	Sequence             int
	WorkstreamRecord     *WorkstreamRecordProjection
	Trajectory           *conversation.TrajectoryEvent
	Director             *DirectorFactEvent
	DirectorConversation *conversation.DirectorConversationEntry
}

// owners reports how many durable facts the event carries. Exactly one is
// projectable; anything else is a caller that lost track of what it read.
func (event ProjectorEvent) owners() int {
	count := 0
	for _, populated := range []bool{
		event.WorkstreamRecord != nil,
		event.Trajectory != nil,
		event.Director != nil,
		event.DirectorConversation != nil,
	} {
		if populated {
			count++
		}
	}
	return count
}

// sourceEventID is the durable id of whichever fact the event carries.
func (event ProjectorEvent) sourceEventID() string {
	switch {
	case event.WorkstreamRecord != nil:
		return event.WorkstreamRecord.ID
	case event.Trajectory != nil:
		return event.Trajectory.ID
	case event.Director != nil:
		return event.Director.ID
	default:
		return event.DirectorConversation.ID
	}
}

// ReplayError is a projection failure the live path can answer with a typed
// resync_required event. It exists so a cursor that cannot continue becomes a
// resync instead of an internal error shown to the user.
type ReplayError struct {
	Reason   DirectorResyncReason
	Sequence int
	Detail   string
}

func (err *ReplayError) Error() string {
	return fmt.Sprintf("director replay failed at sequence %d (%s): %s", err.Sequence, err.Reason, err.Detail)
}

// DirectorGraphProjector applies durable facts in stream order. It is applied
// incrementally by the live subscription and in bulk by replay; both paths run
// the same Apply.
type DirectorGraphProjector struct {
	lastSequence       int
	order              []string
	workstreams        map[string]*projectedWorkstream
	byConversation     map[string]string
	workstreamParents  map[string]*string
	runIDs             map[string]bool
	runOwners          map[string]string
	artifactIDs        map[string]bool
	sourceEventIDs     map[string]bool
	sourceEventOwners  map[string]string
	nodeBySourceEvent  map[string]string
	trajectorySequence map[string]int
	selected           *string
	pendingDelegation  []pendingDelegation
	directorTurnIDs    map[string]bool
	directorToolCalls  map[string]directorToolCallProjection
	// lane is the Director's own graph scope. It exists from the first frame
	// because the Director conversation exists from the first frame; what it
	// holds is only ever what the user and the Director actually did.
	lane *projectedWorkstream
	// openTurnNodeID is the Director request the lane has not closed yet.
	openTurnNodeID string
	// openTurnID is the durable turn that request belongs to. Calls, receipts,
	// and replies must all name it so one turn cannot resolve another.
	openTurnID string
}

// pendingDelegation remembers a committed decision until the target workstream
// produces the run it delegated to. The edge cannot be drawn when the decision
// commits, because the work it authorizes does not exist yet.
type pendingDelegation struct {
	decisionWorkstreamID string
	decisionNodeID       string
	targetWorkstreamID   string
}

// projectedWorkstream is the live graph of one workstream plus the small amount
// of causal bookkeeping edge derivation needs.
type projectedWorkstream struct {
	id                    string
	nodes                 []SemanticNode
	nodeIndex             map[string]int
	edges                 []SemanticEdge
	edgeIndex             map[string]bool
	lastNodeID            string
	lastRunNodeID         map[string]string
	openRunNodeIDs        []string
	recoveryAnchor        string
	agentLivenessBlock    map[string]string
	agentLivenessRecovery map[string]string
	providerLifecycleNode map[string]string
	planStepNodes         map[string][]string
	runInputs             map[string]string
	runFinalResponses     map[string]runFinalResponse
	goalNodes             map[string]string
	activityNodes         map[string]string
	fileChangeNodes       map[string]string
	pendingFileChangeNode map[string]string
	approvalNodes         map[string]string
	subagentNodes         map[string]string
	validationNodes       map[string]string
	runArtifacts          map[string][]string
	recoveryStatuses      map[string]RecoveryStatus
	changedNodeIDs        map[string]bool
	changedEdgeIDs        map[string]bool
	removedNodeIDs        map[string]bool
	removedNodeOrder      []string
}

func newProjectedWorkstream(id string) *projectedWorkstream {
	return &projectedWorkstream{
		id:                    id,
		nodeIndex:             map[string]int{},
		edgeIndex:             map[string]bool{},
		lastRunNodeID:         map[string]string{},
		agentLivenessBlock:    map[string]string{},
		agentLivenessRecovery: map[string]string{},
		providerLifecycleNode: map[string]string{},
		planStepNodes:         map[string][]string{},
		runInputs:             map[string]string{},
		runFinalResponses:     map[string]runFinalResponse{},
		goalNodes:             map[string]string{},
		activityNodes:         map[string]string{},
		fileChangeNodes:       map[string]string{},
		pendingFileChangeNode: map[string]string{},
		approvalNodes:         map[string]string{},
		subagentNodes:         map[string]string{},
		validationNodes:       map[string]string{},
		runArtifacts:          map[string][]string{},
		recoveryStatuses:      map[string]RecoveryStatus{},
		changedNodeIDs:        map[string]bool{},
		changedEdgeIDs:        map[string]bool{},
		removedNodeIDs:        map[string]bool{},
	}
}

// NewDirectorGraphProjector returns an empty projector positioned before the
// first event of a stream. The Director lane is present from the start and
// carries no nodes: the scope the Director talks in always exists, and nothing
// has been said in it yet.
func NewDirectorGraphProjector() *DirectorGraphProjector {
	lane := newProjectedWorkstream(DirectorLaneID)
	return &DirectorGraphProjector{
		workstreams:        map[string]*projectedWorkstream{DirectorLaneID: lane},
		byConversation:     map[string]string{},
		workstreamParents:  map[string]*string{DirectorLaneID: nil},
		runIDs:             map[string]bool{},
		runOwners:          map[string]string{},
		artifactIDs:        map[string]bool{},
		sourceEventIDs:     map[string]bool{},
		sourceEventOwners:  map[string]string{},
		nodeBySourceEvent:  map[string]string{},
		trajectorySequence: map[string]int{},
		directorTurnIDs:    map[string]bool{},
		directorToolCalls:  map[string]directorToolCallProjection{},
		lane:               lane,
	}
}

// ProjectDirectorGraph replays a whole ordered history. It is the cold-start and
// test path over the same Apply the live subscription uses.
func ProjectDirectorGraph(events []ProjectorEvent) (GraphProjection, error) {
	projector := NewDirectorGraphProjector()
	for _, event := range events {
		if err := projector.Apply(event); err != nil {
			return GraphProjection{}, err
		}
	}
	return projector.Projection(), nil
}

// Apply advances the projection by one durable fact.
func (projector *DirectorGraphProjector) Apply(event ProjectorEvent) error {
	if err := projector.validateStreamPosition(event); err != nil {
		return err
	}
	if event.owners() != 1 {
		return fmt.Errorf("projector event at sequence %d must carry exactly one durable fact", event.Sequence)
	}
	sourceEventID := event.sourceEventID()
	if projector.sourceEventIDs[sourceEventID] {
		return fmt.Errorf("projector event at sequence %d repeats durable fact id %q", event.Sequence, sourceEventID)
	}
	var err error
	switch {
	case event.WorkstreamRecord != nil:
		err = projector.applyWorkstreamRecord(*event.WorkstreamRecord)
	case event.Trajectory != nil:
		err = projector.applyTrajectory(event.Sequence, *event.Trajectory)
	case event.Director != nil:
		err = projector.applyDirectorFact(event.Sequence, *event.Director)
	default:
		err = projector.applyDirectorConversation(*event.DirectorConversation)
	}
	if err != nil {
		return err
	}
	projector.lastSequence = event.Sequence
	projector.sourceEventIDs[sourceEventID] = true
	switch {
	case event.WorkstreamRecord != nil:
		projector.sourceEventOwners[sourceEventID] = event.WorkstreamRecord.WorkstreamID
	case event.Trajectory != nil:
		projector.sourceEventOwners[sourceEventID] = projector.byConversation[event.Trajectory.ConversationID]
	case event.Director != nil:
		projector.sourceEventOwners[sourceEventID] = projector.directorFactOwner(*event.Director)
	default:
		projector.sourceEventOwners[sourceEventID] = DirectorLaneID
	}
	return nil
}

// directorFactOwner names the scope a Director fact was projected into. A fact
// that happened in no workstream happened in the Director's own lane, which is
// where the app-scoped half of the dialogue is drawn.
func (projector *DirectorGraphProjector) directorFactOwner(fact DirectorFactEvent) string {
	if fact.WorkstreamID != nil {
		return *fact.WorkstreamID
	}
	return DirectorLaneID
}

// validateStreamPosition keeps the projection honest about gaps. A repeated or
// reordered event means the caller replayed from the wrong place, and a skipped
// sequence means events were lost; both are resync conditions, not silent
// recoveries.
func (projector *DirectorGraphProjector) validateStreamPosition(event ProjectorEvent) error {
	if event.Sequence <= projector.lastSequence {
		return &ReplayError{
			Reason:   DirectorResyncEventBeforeSnapshot,
			Sequence: event.Sequence,
			Detail:   fmt.Sprintf("stream is already at sequence %d", projector.lastSequence),
		}
	}
	if event.Sequence != projector.lastSequence+1 {
		return &ReplayError{
			Reason:   DirectorResyncEventSequenceGap,
			Sequence: event.Sequence,
			Detail:   fmt.Sprintf("expected sequence %d", projector.lastSequence+1),
		}
	}
	return nil
}

func (projector *DirectorGraphProjector) applyTrajectory(sequence int, event conversation.TrajectoryEvent) error {
	if err := event.Validate(); err != nil {
		return fmt.Errorf("invalid trajectory event %s: %w", event.ID, err)
	}
	workstream, err := projector.trajectoryOwner(sequence, event)
	if err != nil {
		return err
	}
	if err := projector.checkRunIsOpen(workstream, event); err != nil {
		return err
	}
	handler, handled := trajectoryHandlers[event.Kind]
	if !handled {
		return fmt.Errorf("no projector handler for trajectory event kind %q", event.Kind)
	}
	rule, ruleErr := TrajectoryFactRule(event.Kind)
	if ruleErr != nil {
		return ruleErr
	}
	actor, actorErr := SemanticActorForTrajectoryActor(event.Actor)
	if actorErr != nil {
		return actorErr
	}
	if event.TurnID != nil {
		if err := projector.claimRunID(*event.TurnID, workstream.id); err != nil {
			return err
		}
	}
	context := factContext{
		eventID:    event.ID,
		emittedAt:  event.EmittedAt,
		workstream: workstream,
		runID:      event.TurnID,
		actor:      actor,
		sourceFact: string(event.Kind),
		edgeKinds:  rule.EdgeKinds,
	}
	if err := handler(projector, context, event); err != nil {
		return err
	}
	projector.trajectorySequence[event.ConversationID] = event.Sequence
	return nil
}

// trajectoryOwner resolves the workstream a conversation's fact belongs to and
// keeps that conversation's own ordering honest. A missing owner or a skipped
// per-conversation sequence means the caller replayed from the wrong place, so
// both are typed resync conditions rather than internal errors.
func (projector *DirectorGraphProjector) trajectoryOwner(
	sequence int,
	event conversation.TrajectoryEvent,
) (*projectedWorkstream, error) {
	workstream, known := projector.workstreamForConversation(event.ConversationID)
	if !known {
		return nil, &ReplayError{
			Reason:   DirectorResyncEventBeforeSnapshot,
			Sequence: sequence,
			Detail:   fmt.Sprintf("conversation %q has no registered workstream", event.ConversationID),
		}
	}
	expected := projector.trajectorySequence[event.ConversationID] + 1
	if event.Sequence != expected {
		return nil, &ReplayError{
			Reason:   DirectorResyncEventSequenceGap,
			Sequence: sequence,
			Detail: fmt.Sprintf(
				"conversation %q expected trajectory sequence %d, got %d",
				event.ConversationID,
				expected,
				event.Sequence,
			),
		}
	}
	return workstream, nil
}

// checkRunIsOpen rejects a fact that arrives after its run already ended. A
// terminal run closes the visible causal chain, so a later fact on it would
// describe work the graph already said was over.
func (projector *DirectorGraphProjector) checkRunIsOpen(
	workstream *projectedWorkstream,
	event conversation.TrajectoryEvent,
) error {
	if event.TurnID == nil {
		return nil
	}
	terminalNodeID, err := SemanticNodeID(SemanticNodeIdentityRunTerminal, *event.TurnID)
	if err != nil {
		return err
	}
	if _, terminal := workstream.nodeIndex[terminalNodeID]; terminal {
		return fmt.Errorf(
			"run %s already has a terminal fact; trajectory event %s cannot follow it",
			*event.TurnID,
			event.ID,
		)
	}
	return nil
}

func (projector *DirectorGraphProjector) applyDirectorFact(sequence int, fact DirectorFactEvent) error {
	if err := ValidateDirectorFactEvent(fact); err != nil {
		return err
	}
	if fact.Kind == DirectorFactWorkstreamRegistered {
		rule, err := DirectorFactRule(fact.Kind)
		if err != nil {
			return err
		}
		return projector.registerWorkstream(fact, rule.EdgeKinds)
	}
	handler, handled := directorHandlers[fact.Kind]
	if !handled {
		return fmt.Errorf("no projector handler for director fact %q", fact.Kind)
	}
	rule, err := DirectorFactRule(fact.Kind)
	if err != nil {
		return err
	}
	// A decision that started a root workstream was made before that workstream
	// existed, so it happened where the Director was: in its own lane, beside the
	// request that asked for it.
	workstream := projector.lane
	if fact.WorkstreamID != nil {
		known := false
		if workstream, known = projector.workstreams[*fact.WorkstreamID]; !known {
			return &ReplayError{
				Reason:   DirectorResyncEventBeforeSnapshot,
				Sequence: sequence,
				Detail:   fmt.Sprintf("director fact %s names unregistered workstream %q", fact.ID, *fact.WorkstreamID),
			}
		}
	}
	if fact.RunID != nil {
		if err := projector.claimRunID(*fact.RunID, workstream.id); err != nil {
			return err
		}
	}
	context := factContext{
		eventID:    fact.ID,
		emittedAt:  fact.EmittedAt,
		workstream: workstream,
		runID:      fact.RunID,
		actor:      fact.Actor,
		sourceFact: string(fact.Kind),
		edgeKinds:  rule.EdgeKinds,
	}
	return handler(projector, context, fact)
}

func (projector *DirectorGraphProjector) claimRunID(runID string, workstreamID string) error {
	if owner, claimed := projector.runOwners[runID]; claimed && owner != workstreamID {
		return fmt.Errorf(
			"run %s belongs to workstream %s, not workstream %s",
			runID,
			owner,
			workstreamID,
		)
	}
	projector.runIDs[runID] = true
	projector.runOwners[runID] = workstreamID
	return nil
}

func (projector *DirectorGraphProjector) workstreamForConversation(conversationID string) (*projectedWorkstream, bool) {
	workstreamID, known := projector.byConversation[conversationID]
	if !known {
		return nil, false
	}
	workstream, exists := projector.workstreams[workstreamID]
	return workstream, exists
}

func (projector *DirectorGraphProjector) liveAuthority() GraphAuthority {
	return GraphAuthority{
		WorkstreamParents: projector.workstreamParents,
		RunIDs:            projector.runIDs,
		ArtifactIDs:       projector.artifactIDs,
	}
}

// GraphProjection is an immutable snapshot of the projected graph. Callers
// window it by detail level; nothing here depends on selection, hover, or
// camera.
type GraphProjection struct {
	SelectedWorkstreamID *string
	WorkstreamIDs        []string
	Authority            GraphAuthority
	graphs               map[string]WorkstreamGraph
	milestones           map[string]WorkstreamMilestone
}

// Projection copies the live projection so a caller can hold it across further
// Apply calls without observing a half-applied event.
func (projector *DirectorGraphProjector) Projection() GraphProjection {
	projection := GraphProjection{
		SelectedWorkstreamID: copyOptionalString(projector.selected),
		WorkstreamIDs:        append([]string(nil), projector.order...),
		Authority: GraphAuthority{
			WorkstreamParents: copyParents(projector.workstreamParents),
			RunIDs:            copyIDSet(projector.runIDs),
			ArtifactIDs:       copyIDSet(projector.artifactIDs),
		},
		graphs:     make(map[string]WorkstreamGraph, len(projector.workstreams)),
		milestones: map[string]WorkstreamMilestone{},
	}
	for id, workstream := range projector.workstreams {
		projection.graphs[id] = WorkstreamGraph{
			WorkstreamID: id,
			DetailLevel:  WorkstreamDetailSelected,
			Nodes:        cloneSemanticNodes(workstream.nodes),
			Edges:        cloneSemanticEdges(workstream.edges),
		}
		if milestone, found := workstream.milestone(); found {
			projection.milestones[id] = milestone
		}
	}
	return projection
}

// milestone is the last meaningful public fact of a workstream: what an adjacent
// or background workstream renders instead of a trajectory.
func (workstream *projectedWorkstream) milestone() (WorkstreamMilestone, bool) {
	for index := len(workstream.nodes) - 1; index >= 0; index-- {
		node := workstream.nodes[index]
		if !milestoneKinds[node.Kind] {
			continue
		}
		return WorkstreamMilestone{
			NodeID:        node.ID,
			Kind:          node.Kind,
			PublicSummary: node.PublicSummary,
			OccurredAt:    node.UpdatedAt,
		}, true
	}
	// The anchor is the workstream's identity, not something that happened in
	// it. A row already shows its title, so reporting the anchor as the last
	// milestone would tell the user the same thing twice and would claim an idle
	// workstream had produced something.
	for index := len(workstream.nodes) - 1; index >= 0; index-- {
		last := workstream.nodes[index]
		if last.Kind == SemanticNodeWorkstream {
			continue
		}
		return WorkstreamMilestone{
			NodeID:        last.ID,
			Kind:          last.Kind,
			PublicSummary: last.PublicSummary,
			OccurredAt:    last.UpdatedAt,
		}, true
	}
	return WorkstreamMilestone{}, false
}

// milestoneKinds are the node kinds worth showing when a workstream is reduced
// to one line. They are outcomes and blockers — the facts that tell the user
// whether the workstream needs them.
var milestoneKinds = map[SemanticNodeKind]bool{
	SemanticNodeCompleted:        true,
	SemanticNodeFailed:           true,
	SemanticNodeCancelled:        true,
	SemanticNodeApprovalRequired: true,
	SemanticNodeResourceRequired: true,
	SemanticNodeBlocked:          true,
	SemanticNodeArtifact:         true,
	SemanticNodeMilestone:        true,
}

// Milestone returns the workstream's last meaningful public fact.
func (projection GraphProjection) Milestone(workstreamID string) (WorkstreamMilestone, bool) {
	milestone, found := projection.milestones[workstreamID]
	return milestone, found
}

func copyOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}

func copyParents(parents map[string]*string) map[string]*string {
	copied := make(map[string]*string, len(parents))
	for id, parent := range parents {
		copied[id] = copyOptionalString(parent)
	}
	return copied
}

func copyIDSet(ids map[string]bool) map[string]bool {
	copied := make(map[string]bool, len(ids))
	for id, present := range ids {
		copied[id] = present
	}
	return copied
}

func cloneSemanticNodes(nodes []SemanticNode) []SemanticNode {
	cloned := make([]SemanticNode, len(nodes))
	for index, node := range nodes {
		cloned[index] = cloneSemanticNode(node)
	}
	return cloned
}

func cloneSemanticNode(node SemanticNode) SemanticNode {
	cloned := node
	cloned.RunID = copyOptionalString(node.RunID)
	cloned.SourceEventIDs = append([]string{}, node.SourceEventIDs...)
	cloned.ArtifactIDs = append([]string{}, node.ArtifactIDs...)
	cloned.CompletedAt = copyOptionalString(node.CompletedAt)
	if node.Interpretation != nil {
		interpretation := *node.Interpretation
		if node.Interpretation.Confidence != nil {
			confidence := *node.Interpretation.Confidence
			interpretation.Confidence = &confidence
		}
		cloned.Interpretation = &interpretation
	}
	return cloned
}

func cloneSemanticEdges(edges []SemanticEdge) []SemanticEdge {
	cloned := make([]SemanticEdge, len(edges))
	for index, edge := range edges {
		cloned[index] = edge
		cloned[index].SourceEventIDs = append([]string{}, edge.SourceEventIDs...)
	}
	return cloned
}
