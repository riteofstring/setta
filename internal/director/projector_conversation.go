package director

import (
	"encoding/json"
	"fmt"

	"setta/internal/conversation"
)

// The Director's own lane in the graph.
//
// The Director is a conversation, not a workstream: it has no folder, no runs,
// and no work of its own to succeed or fail at. Its turns still belong on the
// canvas, because asking the app for something and watching Setta do it is the
// product. The lane is the app-scoped graph scope those facts project into —
// what the user asked, which Setta tools the Director called, what each call
// reported back, and what the Director said — while the work a call started
// draws in the workstream that is actually doing it.
//
// The lane is not a registry row. A workstream row carries a folder, a status,
// a queue, approvals, and artifacts; the Director has none of them, so listing
// it beside real work would mean inventing all of that.

// DirectorLaneID is the graph scope the Director's conversation projects into.
// It is deliberately outside the `workstream:` id space, because it is not one.
const DirectorLaneID = "director"

// directorConversationHandler projects one durable Director conversation entry.
type directorConversationHandler func(
	projector *DirectorGraphProjector,
	context factContext,
	entry conversation.DirectorConversationEntry,
) error

// directorConversationHandlers is total over the entry catalog, so an entry kind
// with no projection fails at the boundary instead of silently vanishing from
// the lane.
var directorConversationHandlers = map[conversation.DirectorConversationEntryKind]directorConversationHandler{
	conversation.DirectorConversationUserTurn:      projectDirectorUserTurn,
	conversation.DirectorConversationToolCall:      projectDirectorToolCall,
	conversation.DirectorConversationToolReceipt:   projectDirectorToolReceipt,
	conversation.DirectorConversationAssistantText: projectDirectorReply,
}

// directorConversationActors name who produced each entry. The user's words are
// the user's; everything else in a Director turn is the Director acting or
// answering, including the receipt Setta handed back, because the Director is
// what the receipt was given to.
var directorConversationActors = map[conversation.DirectorConversationEntryKind]SemanticActor{
	conversation.DirectorConversationUserTurn:      SemanticActorUser,
	conversation.DirectorConversationToolCall:      SemanticActorDirector,
	conversation.DirectorConversationToolReceipt:   SemanticActorDirector,
	conversation.DirectorConversationAssistantText: SemanticActorDirector,
}

func (projector *DirectorGraphProjector) applyDirectorConversation(
	entry conversation.DirectorConversationEntry,
) error {
	if err := entry.Validate(); err != nil {
		return fmt.Errorf("invalid director conversation entry %s: %w", entry.ID, err)
	}
	handler, handled := directorConversationHandlers[entry.Kind]
	if !handled {
		return fmt.Errorf("no projector handler for director conversation entry kind %q", entry.Kind)
	}
	rule, err := DirectorConversationFactRule(entry.Kind)
	if err != nil {
		return err
	}
	context := factContext{
		eventID:    entry.ID,
		emittedAt:  entry.RecordedAt,
		workstream: projector.lane,
		actor:      directorConversationActors[entry.Kind],
		sourceFact: string(entry.Kind),
		edgeKinds:  rule.EdgeKinds,
	}
	return handler(projector, context, entry)
}

// projectDirectorUserTurn opens the turn. A request stays active until it is
// answered, so the previous turn resolves here too: a new request is proof the
// one before it is over, which is what stops a turn that acted without replying
// from claiming forever that it is still in progress.
func projectDirectorUserTurn(
	projector *DirectorGraphProjector,
	context factContext,
	entry conversation.DirectorConversationEntry,
) error {
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityDirectorTurn,
		sourceID: entry.ID,
		kind:     SemanticNodeUserGoal,
		status:   SemanticNodeStatusActive,
		actor:    SemanticActorUser,
		summary:  entry.Text.Text,
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	if err != nil {
		return err
	}
	if err := projector.closeDirectorTurn(context); err != nil {
		return err
	}
	projector.openTurnNodeID = nodeID
	return nil
}

// projectDirectorToolCall draws the call as it was made rather than after it
// returned. The label is the tool's own name because the arguments are provider
// text, and what a call is worth is what Setta reports it did.
func projectDirectorToolCall(
	projector *DirectorGraphProjector,
	context factContext,
	entry conversation.DirectorConversationEntry,
) error {
	_, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityToolCall,
		sourceID: entry.ID,
		kind:     SemanticNodeAction,
		status:   SemanticNodeStatusActive,
		actor:    SemanticActorDirector,
		summary:  fmt.Sprintf("Called %s.%s.", SettaToolNamespace, entry.Tool.Tool),
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	return err
}

// projectDirectorToolReceipt resolves the call it answers. A refused call is a
// failed node carrying Setta's own reason, because a refusal the user cannot see
// is how the Director ends up claiming it did something it did not.
func projectDirectorToolReceipt(
	projector *DirectorGraphProjector,
	context factContext,
	entry conversation.DirectorConversationEntry,
) error {
	nodeID, err := SemanticNodeID(SemanticNodeIdentityToolCall, *entry.Tool.CallID)
	if err != nil {
		return err
	}
	if _, exists := projector.lane.nodeIndex[nodeID]; !exists {
		return fmt.Errorf(
			"director tool receipt %s answers call %s, which was never recorded",
			entry.ID,
			*entry.Tool.CallID,
		)
	}
	var receipt SettaToolReceipt
	if err := json.Unmarshal(entry.Tool.Payload, &receipt); err != nil {
		return fmt.Errorf("decode setta tool receipt %s: %w", entry.ID, err)
	}
	status := SemanticNodeStatusFailed
	if entry.Tool.Succeeded {
		status = SemanticNodeStatusSucceeded
	}
	_, err = projector.commitNode(context, nodeSpec{
		nodeID:  nodeID,
		status:  status,
		summary: receipt.Summary,
	})
	return err
}

// projectDirectorReply draws what the Director told the user and closes the
// turn it answered. The text is model-authored, so the node carries the model
// that authored it and the evidence class that keeps it visually separable from
// a fact the app observed.
func projectDirectorReply(
	projector *DirectorGraphProjector,
	context factContext,
	entry conversation.DirectorConversationEntry,
) error {
	metadata := InterpretationMetadata{
		InterpretedBy: SemanticActorDirector,
		Model: InterpretationModelIdentity{
			Provider:  string(entry.Text.Model.Provider),
			Model:     entry.Text.Model.Model,
			RuntimeID: entry.Text.Model.ThreadID,
		},
		InterpretedAt: entry.RecordedAt,
	}
	if _, err := projector.commitNode(context, nodeSpec{
		identity:       SemanticNodeIdentityDirectorReply,
		sourceID:       entry.ID,
		kind:           SemanticNodeMilestone,
		status:         SemanticNodeStatusSucceeded,
		actor:          SemanticActorDirector,
		summary:        entry.Text.Text,
		evidence:       EvidenceDirectorInterpretation,
		interpretation: &metadata,
		chain:          true,
	}); err != nil {
		return err
	}
	return projector.closeDirectorTurn(context)
}

// closeDirectorTurn succeeds the request the lane still has open. It is a no-op
// once the turn is closed, so a reply and the request that follows it cannot
// resolve the same turn twice.
//
// Resolving an older node must not rewrite what the applying entry is. The
// chain anchor and the entry's own node are restored afterwards, because the
// lane's next fact follows the fact that just happened rather than the request
// it answered.
func (projector *DirectorGraphProjector) closeDirectorTurn(context factContext) error {
	nodeID := projector.openTurnNodeID
	if nodeID == "" {
		return nil
	}
	projector.openTurnNodeID = ""
	anchorNodeID := projector.lane.lastNodeID
	appliedNodeID := projector.nodeBySourceEvent[context.eventID]
	if _, err := projector.commitNode(context, nodeSpec{
		nodeID: nodeID,
		status: SemanticNodeStatusSucceeded,
	}); err != nil {
		return err
	}
	projector.lane.lastNodeID = anchorNodeID
	if appliedNodeID != "" {
		projector.nodeBySourceEvent[context.eventID] = appliedNodeID
	}
	return nil
}
