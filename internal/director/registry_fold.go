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

// registrationFactPrefix derives the id of the registration fact a conversation
// produces. Registration is derived rather than written: the durable conversation
// record already says a workstream exists, and a second durable record of the
// same fact could disagree with it.
const registrationFactPrefix = "director-fact:workstream_registered:"

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
	workstream, known := state.workstreams[state.byConversation[record.ID]]
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
	}
	workstream.record.Title = record.Title
	workstream.archived = record.ArchivedAt != nil
	if err := state.refreshWorkstream(workstream, event.CommittedAt); err != nil {
		return nil, err
	}
	return []registryEffect{{kind: effectWorkstream, id: workstream.record.ID}}, nil
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
	return state.registerWorkstreamRecord(Workstream{
		ID:               workstreamID,
		Title:            record.Title,
		Status:           WorkstreamStatusIdle,
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

// applyBranchCreated attaches a fork or child conversation to its parent
// workstream. The branch record is committed after the conversation record it
// describes, which is why graph registration waits for a workstream's first
// graph fact instead of happening when its row appears.
func (state *registryState) applyBranchCreated(event conversation.CommittedEvent) ([]registryEffect, error) {
	payload, err := decodeCommittedPayload[conversation.ConversationBranchCreatedEventPayload](event)
	if err != nil {
		return nil, err
	}
	child, err := state.workstreamForConversation(payload.Branch.ChildConversationID)
	if err != nil {
		return nil, err
	}
	parent, err := state.workstreamForConversation(payload.Branch.ParentConversationID)
	if err != nil {
		return nil, err
	}
	if child.projected {
		return nil, fmt.Errorf(
			"workstream %s was projected before its parentage was durable",
			child.record.ID,
		)
	}
	parentID := parent.record.ID
	child.record.ParentID = &parentID
	if err := state.refreshWorkstream(child, event.CommittedAt); err != nil {
		return nil, err
	}
	return []registryEffect{{kind: effectWorkstream, id: child.record.ID}}, nil
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
		if turn.Status == conversation.TurnStatusCompleted {
			workstream.recordForkPoint(turn, event.CommittedAt)
		}
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
	if err := state.ensureProjected(workstream); err != nil {
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

// collectGraphChanges turns the projector's pending deltas into effects and
// keeps each workstream's blocker set in step with its graph.
func (state *registryState) collectGraphChanges() ([]registryEffect, error) {
	changes := state.projector.TakeGraphChanges()
	effects := make([]registryEffect, 0, len(changes))
	for _, change := range changes {
		workstream, known := state.workstreams[change.WorkstreamID]
		if !known {
			return nil, fmt.Errorf("graph change names unknown workstream %s", change.WorkstreamID)
		}
		workstream.trackBlockedNodes(change)
		effects = append(effects, registryEffect{
			kind:  effectGraph,
			id:    change.WorkstreamID,
			graph: change,
		})
	}
	return effects, nil
}

// ensureProjected registers a workstream in the graph projector immediately
// before its first graph fact. Deferring it is what lets a fork's parentage —
// committed after the conversation record — reach the projection that derives
// delegation from it.
func (state *registryState) ensureProjected(workstream *registryWorkstream) error {
	if workstream.projected {
		return nil
	}
	if parentID := workstream.record.ParentID; parentID != nil {
		parent, known := state.workstreams[*parentID]
		if !known {
			return fmt.Errorf(
				"workstream %s names parent %s, which is not registered",
				workstream.record.ID,
				*parentID,
			)
		}
		if err := state.ensureProjected(parent); err != nil {
			return err
		}
	}
	fact := DirectorFactEvent{
		ID:           registrationFactPrefix + workstream.record.ID,
		EmittedAt:    workstream.record.CreatedAt,
		Kind:         DirectorFactWorkstreamRegistered,
		WorkstreamID: &workstream.record.ID,
		Actor:        SemanticActorSystem,
		WorkstreamRegistered: &DirectorWorkstreamRegistered{
			Title:          workstream.record.Title,
			ConversationID: workstream.conversationID,
			ParentID:       copyOptionalString(workstream.record.ParentID),
			ResourceScope:  workstream.record.ResourceScope,
		},
	}
	workstream.projected = true
	return state.applyProjectorEvent(ProjectorEvent{Director: &fact})
}
