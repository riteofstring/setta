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

type directorToolCallProjection struct {
	turnID   string
	tool     string
	resolved bool
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
	if projector.directorTurnIDs[entry.TurnID] {
		return fmt.Errorf("director turn %s records more than one user request", entry.TurnID)
	}
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
	if err := projector.closeDirectorTurn(context, SemanticNodeStatusCancelled); err != nil {
		return err
	}
	projector.directorTurnIDs[entry.TurnID] = true
	projector.openTurnNodeID = nodeID
	projector.openTurnID = entry.TurnID
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
	if err := projector.requireOpenDirectorTurn(entry); err != nil {
		return err
	}
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityToolCall,
		sourceID: entry.ID,
		kind:     SemanticNodeAction,
		status:   SemanticNodeStatusActive,
		actor:    SemanticActorDirector,
		summary:  fmt.Sprintf("Called %s.%s.", SettaToolNamespace, entry.Tool.Tool),
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	if err != nil {
		return err
	}
	projector.directorToolCalls[entry.ID] = directorToolCallProjection{
		turnID: entry.TurnID,
		tool:   entry.Tool.Tool,
	}
	if nodeID == "" {
		return fmt.Errorf("director tool call %s produced no node", entry.ID)
	}
	return nil
}

// projectDirectorToolReceipt resolves the call it answers. A refused call is a
// failed node carrying Setta's own reason, because a refusal the user cannot see
// is how the Director ends up claiming it did something it did not.
func projectDirectorToolReceipt(
	projector *DirectorGraphProjector,
	context factContext,
	entry conversation.DirectorConversationEntry,
) error {
	if err := projector.requireOpenDirectorTurn(entry); err != nil {
		return err
	}
	callID, call, err := projector.validatedDirectorToolCall(entry)
	if err != nil {
		return err
	}
	receipt, err := decodeDirectorToolReceipt(entry, callID, call.tool)
	if err != nil {
		return err
	}
	nodeID, err := SemanticNodeID(SemanticNodeIdentityToolCall, callID)
	if err != nil {
		return err
	}
	status := SemanticNodeStatusFailed
	if entry.Tool.Succeeded {
		status = SemanticNodeStatusSucceeded
	}
	chainAnchor := projector.lane.lastNodeID
	_, err = projector.commitNode(context, nodeSpec{
		nodeID:  nodeID,
		status:  status,
		summary: receipt.Summary,
	})
	if err != nil {
		return err
	}
	// Resolving an earlier call updates that node without moving chronological
	// time backwards. A decision the handler committed between the call and its
	// receipt remains what the next Director fact follows.
	projector.lane.lastNodeID = chainAnchor
	call.resolved = true
	projector.directorToolCalls[callID] = call
	return nil
}

func (projector *DirectorGraphProjector) validatedDirectorToolCall(
	entry conversation.DirectorConversationEntry,
) (string, directorToolCallProjection, error) {
	callID := *entry.Tool.CallID
	call, exists := projector.directorToolCalls[callID]
	if !exists {
		return "", directorToolCallProjection{}, fmt.Errorf(
			"director tool receipt %s answers call %s, which was never recorded",
			entry.ID,
			callID,
		)
	}
	if call.resolved {
		return "", directorToolCallProjection{}, fmt.Errorf(
			"director tool receipt %s answers call %s twice",
			entry.ID,
			callID,
		)
	}
	if entry.TurnID != call.turnID {
		return "", directorToolCallProjection{}, fmt.Errorf(
			"director tool receipt %s belongs to turn %s, not call %s turn %s",
			entry.ID,
			entry.TurnID,
			callID,
			call.turnID,
		)
	}
	if entry.Tool.Tool != call.tool {
		return "", directorToolCallProjection{}, fmt.Errorf(
			"director tool receipt %s reports %s, not call %s tool %s",
			entry.ID,
			entry.Tool.Tool,
			callID,
			call.tool,
		)
	}
	return callID, call, nil
}

func decodeDirectorToolReceipt(
	entry conversation.DirectorConversationEntry,
	callID string,
	tool string,
) (SettaToolReceipt, error) {
	var receipt SettaToolReceipt
	if err := json.Unmarshal(entry.Tool.Payload, &receipt); err != nil {
		return SettaToolReceipt{}, fmt.Errorf("decode setta tool receipt %s: %w", entry.ID, err)
	}
	if receipt.Tool != tool {
		return SettaToolReceipt{}, fmt.Errorf(
			"director tool receipt %s payload reports %s, not call %s tool %s",
			entry.ID,
			receipt.Tool,
			callID,
			tool,
		)
	}
	if err := validateTrimmedText("director tool receipt summary", receipt.Summary); err != nil {
		return SettaToolReceipt{}, err
	}
	return receipt, nil
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
	if err := projector.requireOpenDirectorTurn(entry); err != nil {
		return err
	}
	metadata := InterpretationMetadata{
		InterpretedBy: SemanticActorDirector,
		Model: InterpretationModelIdentity{
			Provider: string(entry.Text.Model.Provider),
			Model:    entry.Text.Model.Model,
		},
		InterpretedAt: entry.RecordedAt,
	}
	// The reply is the turn's outcome node: a Director ask ends on a verdict,
	// so the lane folds to the answer the way a run folds to its terminal.
	if _, err := projector.commitNode(context, nodeSpec{
		identity:       SemanticNodeIdentityDirectorReply,
		sourceID:       entry.ID,
		kind:           SemanticNodeCompleted,
		status:         SemanticNodeStatusSucceeded,
		actor:          SemanticActorDirector,
		summary:        entry.Text.Text,
		evidence:       EvidenceDirectorInterpretation,
		interpretation: &metadata,
		chain:          true,
	}); err != nil {
		return err
	}
	return projector.closeDirectorTurn(context, SemanticNodeStatusSucceeded)
}

// closeDirectorTurn resolves the request the lane still has open. A reply
// closes it as succeeded; a turn abandoned without one — the next request is
// proof it is over — closes as cancelled, because an interrupted ask is an
// intermediate state, never a claimed success. It is a no-op once the turn is
// closed, so a reply and the request that follows it cannot resolve the same
// turn twice.
//
// Resolving an older node must not rewrite what the applying entry is. The
// chain anchor and the entry's own node are restored afterwards, because the
// lane's next fact follows the fact that just happened rather than the request
// it answered.
func (projector *DirectorGraphProjector) closeDirectorTurn(
	context factContext,
	status SemanticNodeStatus,
) error {
	nodeID := projector.openTurnNodeID
	if nodeID == "" {
		return nil
	}
	projector.openTurnNodeID = ""
	projector.openTurnID = ""
	anchorNodeID := projector.lane.lastNodeID
	appliedNodeID := projector.nodeBySourceEvent[context.eventID]
	if _, err := projector.commitNode(context, nodeSpec{
		nodeID: nodeID,
		status: status,
	}); err != nil {
		return err
	}
	projector.lane.lastNodeID = anchorNodeID
	if appliedNodeID != "" {
		projector.nodeBySourceEvent[context.eventID] = appliedNodeID
	}
	return nil
}

func (projector *DirectorGraphProjector) requireOpenDirectorTurn(
	entry conversation.DirectorConversationEntry,
) error {
	if projector.openTurnID == "" {
		return fmt.Errorf(
			"director conversation entry %s of kind %s has no open user turn",
			entry.ID,
			entry.Kind,
		)
	}
	if entry.TurnID != projector.openTurnID {
		return fmt.Errorf(
			"director conversation entry %s belongs to turn %s, want open turn %s",
			entry.ID,
			entry.TurnID,
			projector.openTurnID,
		)
	}
	return nil
}
