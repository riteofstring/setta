package director

import (
	"encoding/json"
	"fmt"
	"strings"

	"setta/internal/conversation"
	"setta/internal/workspace"
)

// The fold from the durable log into registry state.
//
// The log is the canonical input: conversation records, turns, queues,
// trajectory events, and artifacts are already owned by the conversation store,
// and the Director facts are committed beside them. Commit order is the
// app-scoped order, so this fold is the whole mapping from durable truth to what
// the command center shows.

// WorkspaceResources is the folder metadata the registry reads. Resolving a
// bound folder and offering one to new work are different questions: a
// workstream keeps its folder resource after the folder is closed, so lookups
// read durable workspace metadata, while the folders a new workstream may be
// scoped to are the ones the app can reach right now.
type WorkspaceResources interface {
	LookupWorkspace(workspaceID string) (workspace.WorkspaceSummary, bool, error)
	AvailableWorkspaces() ([]workspace.WorkspaceSummary, error)
}

// registryEffectKind names what one applied durable event changed. Effects are
// what the subscription turns into pushed events, so a fact that changed nothing
// produces no traffic.
type registryEffectKind string

const (
	effectWorkstream registryEffectKind = "workstream"
	effectGraph      registryEffectKind = "graph"
	effectApproval   registryEffectKind = "approval"
	effectResource   registryEffectKind = "resource"
	effectArtifact   registryEffectKind = "artifact"
	effectText       registryEffectKind = "text"
	effectSelection  registryEffectKind = "selection"
	effectRemoval    registryEffectKind = "removal"
)

type registryEffect struct {
	kind  registryEffectKind
	id    string
	graph GraphChange
	text  *DirectorTextDeltaPayload
}

// applyCommitted folds one durable committed event. Kinds with no app-scoped
// meaning — narration, presentation, thread bindings, and side conversations —
// are not registry inputs and change nothing.
func (state *registryState) applyCommitted(
	event conversation.CommittedEvent,
	workspaces WorkspaceResources,
) ([]registryEffect, error) {
	state.cursor.CommitSequence = event.CommitSequence
	committedAt := event.CommittedAt
	state.lastEventAt = &committedAt
	var effects []registryEffect
	var err error
	switch event.Kind {
	case string(conversation.ConversationEventTypeConversationUpdated):
		effects, err = state.applyConversationUpdated(event, workspaces)
	case string(conversation.ConversationEventTypeBranchCreated):
		effects, err = state.applyBranchCreated(event)
	case string(conversation.ConversationEventTypeTurnUpdated):
		effects, err = state.applyTurnUpdated(event)
	case string(conversation.ConversationEventTypeQueueUpdated):
		effects, err = state.applyQueueUpdated(event)
	case string(conversation.ConversationEventTypeTrajectoryAppended):
		effects, err = state.applyTrajectoryAppended(event)
	case string(conversation.ConversationEventTypeArtifactCreated):
		effects, err = state.applyArtifactCreated(event)
	case DirectorFactCommittedKind:
		effects, err = state.applyDirectorFact(event)
	case conversation.DirectorConversationCommittedKind:
		effects, err = state.applyDirectorConversationEntry(event)
	default:
		effects = nil
	}
	if err != nil {
		return nil, err
	}
	state.streamSequences[event.StreamID] = event.StreamSequence
	return effects, nil
}

func decodeCommittedPayload[T any](event conversation.CommittedEvent) (T, error) {
	var payload T
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return payload, fmt.Errorf("decode committed event %s of kind %s: %w", event.ID, event.Kind, err)
	}
	return payload, nil
}

func (state *registryState) applyConversationUpdated(
	event conversation.CommittedEvent,
	workspaces WorkspaceResources,
) ([]registryEffect, error) {
	payload, err := decodeCommittedPayload[conversation.ConversationUpdatedEventPayload](event)
	if err != nil {
		return nil, err
	}
	record := payload.Conversation
	if err := record.Validate(); err != nil {
		return nil, err
	}
	var effects []registryEffect
	workstream, known := state.workstreams[state.byConversation[record.ID]]
	anchorChanged := !known
	if !known {
		workstream, err = state.registerConversation(record, workspaces)
		if err != nil {
			return nil, err
		}
	} else {
		scope, bindings, err := resolveWorkstreamScope(record.WorkspaceID, workspaces)
		if err != nil {
			return nil, err
		}
		workstream.record.ResourceScope = scope
		workstream.record.ResourceBindings = bindings
		anchorChanged = workstream.record.Title != record.Title
	}
	// The conversation record is the durable fact that a workstream exists and
	// what it is currently called. The first record creates the anchor, and a
	// later title change advances it without treating unrelated run/status
	// record updates as new graph evidence.
	if anchorChanged {
		if err := state.projectWorkstreamRecord(event, workstream, record); err != nil {
			return nil, err
		}
		effects, err = state.collectGraphChanges()
		if err != nil {
			return nil, err
		}
	}
	workstream.record.Title = record.Title
	workstream.archived = record.ArchivedAt != nil
	if err := state.refreshWorkstream(workstream, event.CommittedAt); err != nil {
		return nil, err
	}
	return append(effects, registryEffect{kind: effectWorkstream, id: workstream.record.ID}), nil
}

// registerConversation admits a conversation to the app-scoped registry. A
// folderless conversation is a first-class workstream here: the folder is a
// resource it may bind, never the identity it needs to exist.
func (state *registryState) registerConversation(
	record conversation.TopicConversation,
	workspaces WorkspaceResources,
) (*registryWorkstream, error) {
	workstreamID, err := WorkstreamIDForConversation(record.ID)
	if err != nil {
		return nil, err
	}
	scope, bindings, err := resolveWorkstreamScope(record.WorkspaceID, workspaces)
	if err != nil {
		return nil, err
	}
	parentID := state.pendingParents[record.ID]
	delete(state.pendingParents, record.ID)
	return state.registerWorkstreamRecord(Workstream{
		ID:               workstreamID,
		Title:            record.Title,
		Status:           WorkstreamStatusIdle,
		ParentID:         parentID,
		ResourceScope:    scope,
		ResourceBindings: bindings,
		CreatedAt:        record.CreatedAt,
		UpdatedAt:        record.UpdatedAt,
	}, record.ID)
}

func resolveWorkstreamScope(
	workspaceID *string,
	workspaces WorkspaceResources,
) (WorkstreamResourceScope, []WorkstreamResourceBinding, error) {
	if workspaceID == nil {
		return WorkstreamResourceScope{Kind: WorkstreamResourceScopeFolderless},
			[]WorkstreamResourceBinding{},
			nil
	}
	if workspaces == nil {
		return WorkstreamResourceScope{}, nil, fmt.Errorf("workspace resources are required to bind a folder resource")
	}
	summary, found, err := workspaces.LookupWorkspace(*workspaceID)
	if err != nil {
		return WorkstreamResourceScope{}, nil, err
	}
	if !found {
		return WorkstreamResourceScope{}, nil, fmt.Errorf(
			"workspace %s has no durable metadata to bind as a workstream resource",
			*workspaceID,
		)
	}
	folder := WorkstreamFolderResource{WorkspaceID: summary.ID, RootPath: summary.RootPath}
	return WorkstreamResourceScope{Kind: WorkstreamResourceScopeFolder, Folder: &folder},
		[]WorkstreamResourceBinding{{Kind: WorkstreamResourceKindFolder, Folder: &folder}},
		nil
}

// applyBranchCreated remembers a forked conversation's parentage. The branch
// record is committed ahead of the conversation record it describes, so the
// workstream is registered — and anchored in the graph — already knowing where
// it came from.
func (state *registryState) applyBranchCreated(event conversation.CommittedEvent) ([]registryEffect, error) {
	payload, err := decodeCommittedPayload[conversation.ConversationBranchCreatedEventPayload](event)
	if err != nil {
		return nil, err
	}
	childConversationID := payload.Branch.ChildConversationID
	if workstreamID, registered := state.byConversation[childConversationID]; registered {
		return nil, fmt.Errorf(
			"workstream %s was registered before its parentage was durable",
			workstreamID,
		)
	}
	parent, err := state.workstreamForConversation(payload.Branch.ParentConversationID)
	if err != nil {
		return nil, err
	}
	parentID := parent.record.ID
	state.pendingParents[childConversationID] = &parentID
	return nil, nil
}

func (state *registryState) applyTurnUpdated(event conversation.CommittedEvent) ([]registryEffect, error) {
	payload, err := decodeCommittedPayload[conversation.ConversationTurnUpdatedEventPayload](event)
	if err != nil {
		return nil, err
	}
	turn := payload.Turn
	workstream, err := state.workstreamForConversation(turn.ConversationID)
	if err != nil {
		return nil, err
	}
	switch turn.Status {
	case conversation.TurnStatusRunning:
		runID := turn.ID
		workstream.activeRunID = &runID
	case conversation.TurnStatusCompleted, conversation.TurnStatusCancelled, conversation.TurnStatusFailed:
		if workstream.activeRunID != nil && *workstream.activeRunID == turn.ID {
			workstream.activeRunID = nil
		}
		workstream.lastTerminalRun = turn.Status
	case conversation.TurnStatusQueued:
		// The durable queue owns how much work is waiting.
	default:
		return nil, fmt.Errorf("unknown turn status %q on turn %s", turn.Status, turn.ID)
	}
	if err := state.refreshWorkstream(workstream, event.CommittedAt); err != nil {
		return nil, err
	}
	return []registryEffect{{kind: effectWorkstream, id: workstream.record.ID}}, nil
}

func (state *registryState) applyQueueUpdated(event conversation.CommittedEvent) ([]registryEffect, error) {
	payload, err := decodeCommittedPayload[conversation.ConversationQueueUpdatedEventPayload](event)
	if err != nil {
		return nil, err
	}
	conversationID, err := conversation.ConversationIDFromStreamID(event.StreamID)
	if err != nil {
		return nil, err
	}
	if len(payload.Queue) > 0 {
		conversationID = payload.Queue[0].ConversationID
		for _, queued := range payload.Queue[1:] {
			if queued.ConversationID != conversationID {
				return nil, fmt.Errorf(
					"queue event %s mixes conversations %s and %s",
					event.ID,
					conversationID,
					queued.ConversationID,
				)
			}
		}
	}
	workstream, err := state.workstreamForConversation(conversationID)
	if err != nil {
		return nil, err
	}
	workstream.queuedRunCount = len(payload.Queue)
	if err := state.refreshWorkstream(workstream, event.CommittedAt); err != nil {
		return nil, err
	}
	return []registryEffect{{kind: effectWorkstream, id: workstream.record.ID}}, nil
}

// applyTrajectoryAppended is the one input that advances the semantic graph.
// The projector decides what the fact means; the registry records the actionable
// state the rails need beside it.
func (state *registryState) applyTrajectoryAppended(event conversation.CommittedEvent) ([]registryEffect, error) {
	payload, err := decodeCommittedPayload[conversation.ConversationTrajectoryAppendedEventPayload](event)
	if err != nil {
		return nil, err
	}
	trajectory := payload.Event
	workstream, err := state.workstreamForConversation(trajectory.ConversationID)
	if err != nil {
		return nil, err
	}
	if err := state.applyProjectorEvent(ProjectorEvent{Trajectory: &trajectory}); err != nil {
		return nil, err
	}
	effects, err := state.collectGraphChanges()
	if err != nil {
		return nil, err
	}
	recordEffects, err := state.applyTrajectoryRecords(workstream, trajectory)
	if err != nil {
		return nil, err
	}
	effects = append(effects, recordEffects...)
	if text, visible := trajectoryTextDelta(workstream.record.ID, trajectory); visible {
		effects = append(effects, registryEffect{
			kind: effectText,
			id:   workstream.record.ID,
			text: &text,
		})
	}
	if err := state.refreshWorkstream(workstream, trajectory.EmittedAt); err != nil {
		return nil, err
	}
	return append(effects, registryEffect{kind: effectWorkstream, id: workstream.record.ID}), nil
}

// trajectoryTextDelta fans durable public detail-surface updates into the
// app-scoped stream. Assistant text is append-only. A public reasoning update
// replaces that run's current summary, and process progress appends to its
// detail surface; the surface tag is what lets the renderer apply those
// semantics without turning any of the text into graph truth.
func trajectoryTextDelta(
	workstreamID string,
	event conversation.TrajectoryEvent,
) (DirectorTextDeltaPayload, bool) {
	payload := DirectorTextDeltaPayload{
		WorkstreamID: workstreamID,
		RunID:        copyOptionalString(event.TurnID),
	}
	switch event.Kind {
	case conversation.TrajectoryEventAgentPublicTextDelta:
		payload.Surface = DirectorTextSurfaceAssistantMessage
		payload.Text = event.AgentPublicTextDelta.Delta
	case conversation.TrajectoryEventPublicReasoningSummaryUpdated:
		payload.Surface = DirectorTextSurfaceReasoningSummary
		payload.Text = strings.Join(event.PublicReasoningSummaryUpdated.Summary, "\n\n")
	case conversation.TrajectoryEventActivityProgressed:
		if strings.TrimSpace(event.ActivityProgressed.Progress) == "" {
			return DirectorTextDeltaPayload{}, false
		}
		payload.Surface = DirectorTextSurfaceProcessOutput
		payload.Text = event.ActivityProgressed.Progress
	default:
		return DirectorTextDeltaPayload{}, false
	}
	return payload, true
}

// applyDirectorConversationEntry folds one line of the Director's own dialogue.
// It changes no registry row: the Director is not a workstream, so what it said
// and what it called are graph facts and nothing else. What its calls actually
// did reaches the registry as the durable facts those calls committed.
func (state *registryState) applyDirectorConversationEntry(
	event conversation.CommittedEvent,
) ([]registryEffect, error) {
	entry, err := conversation.DecodeDirectorConversationEntry(event)
	if err != nil {
		return nil, err
	}
	if err := state.applyProjectorEvent(ProjectorEvent{DirectorConversation: &entry}); err != nil {
		return nil, err
	}
	return state.collectGraphChanges()
}

// collectGraphChanges turns the projector's pending deltas into effects and
// keeps each workstream's blocker set in step with its graph. The Director lane
// has no registry row to keep in step: nothing in it blocks work, because the
// work is elsewhere.
func (state *registryState) collectGraphChanges() ([]registryEffect, error) {
	changes := state.projector.TakeGraphChanges()
	effects := make([]registryEffect, 0, len(changes))
	for _, change := range changes {
		if change.WorkstreamID != DirectorLaneID {
			workstream, known := state.workstreams[change.WorkstreamID]
			if !known {
				return nil, fmt.Errorf("graph change names unknown workstream %s", change.WorkstreamID)
			}
			workstream.trackBlockedNodes(change)
		}
		effects = append(effects, registryEffect{
			kind:  effectGraph,
			id:    change.WorkstreamID,
			graph: change,
		})
	}
	return effects, nil
}

// projectWorkstreamRecord projects the canonical conversation.updated event
// instead of manufacturing a registration fact id. SourceEventIDs are durable
// event ids by contract, so the anchor must point back to the record the store
// actually committed.
func (state *registryState) projectWorkstreamRecord(
	event conversation.CommittedEvent,
	workstream *registryWorkstream,
	record conversation.TopicConversation,
) error {
	projection := WorkstreamRecordProjection{
		ID:             event.ID,
		EmittedAt:      event.CommittedAt,
		WorkstreamID:   workstream.record.ID,
		ConversationID: workstream.conversationID,
		Title:          record.Title,
		ParentID:       copyOptionalString(workstream.record.ParentID),
	}
	return state.applyProjectorEvent(ProjectorEvent{WorkstreamRecord: &projection})
}
