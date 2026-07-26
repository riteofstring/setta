package director

import (
	"fmt"

	"setta/internal/conversation"
)

// WorkstreamRecordProjection is the projection-owned view of one durable
// conversation.updated event. The conversation record is the canonical fact
// that a workstream exists, so its committed event id — not a synthetic
// registration id — owns the anchor's provenance. Later record updates advance
// the same anchor when its public title changes.
type WorkstreamRecordProjection struct {
	ID             string
	EmittedAt      string
	WorkstreamID   string
	ConversationID string
	Title          string
	ParentID       *string
}

func (record WorkstreamRecordProjection) validate() error {
	if err := validateIdentifier("workstream record event id", record.ID); err != nil {
		return err
	}
	if err := validateTimestamp("workstream record emitted at", record.EmittedAt); err != nil {
		return err
	}
	if err := validateIdentifier("workstream record workstream id", record.WorkstreamID); err != nil {
		return err
	}
	if err := validateIdentifier("workstream record conversation id", record.ConversationID); err != nil {
		return err
	}
	expected, err := WorkstreamIDForConversation(record.ConversationID)
	if err != nil {
		return err
	}
	if record.WorkstreamID != expected {
		return fmt.Errorf(
			"conversation %s projects as workstream %s, not %s",
			record.ConversationID,
			expected,
			record.WorkstreamID,
		)
	}
	if err := validateTrimmedText("workstream record title", record.Title); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("workstream record parent id", record.ParentID); err != nil {
		return err
	}
	if record.ParentID != nil && *record.ParentID == record.WorkstreamID {
		return fmt.Errorf("workstream %s cannot be its own parent", record.WorkstreamID)
	}
	return nil
}

func (projector *DirectorGraphProjector) applyWorkstreamRecord(
	record WorkstreamRecordProjection,
) error {
	if err := record.validate(); err != nil {
		return err
	}
	rule := WorkstreamRecordFactRule()
	workstream, exists := projector.workstreams[record.WorkstreamID]
	if exists {
		if projected := projector.byConversation[record.ConversationID]; projected != record.WorkstreamID {
			return fmt.Errorf(
				"conversation %s is projected as workstream %s, not %s",
				record.ConversationID,
				projected,
				record.WorkstreamID,
			)
		}
		if !equalOptionalString(projector.workstreamParents[record.WorkstreamID], record.ParentID) {
			return fmt.Errorf("workstream %s changed its durable parent", record.WorkstreamID)
		}
		return projector.updateWorkstreamAnchor(record, workstream, rule)
	}
	if existing, bound := projector.byConversation[record.ConversationID]; bound {
		return fmt.Errorf(
			"conversation %s is already projected as workstream %s",
			record.ConversationID,
			existing,
		)
	}
	if record.ParentID != nil {
		if _, known := projector.workstreams[*record.ParentID]; !known {
			return fmt.Errorf(
				"workstream %s names parent %s, which is not registered",
				record.WorkstreamID,
				*record.ParentID,
			)
		}
	}
	workstream = newProjectedWorkstream(record.WorkstreamID)
	projector.workstreams[record.WorkstreamID] = workstream
	projector.workstreamParents[record.WorkstreamID] = copyOptionalString(record.ParentID)
	projector.byConversation[record.ConversationID] = record.WorkstreamID
	projector.order = append(projector.order, record.WorkstreamID)
	return projector.createWorkstreamAnchor(record, workstream, rule)
}

func (projector *DirectorGraphProjector) createWorkstreamAnchor(
	record WorkstreamRecordProjection,
	workstream *projectedWorkstream,
	rule SourceFactRule,
) error {
	context := workstreamRecordContext(record, workstream, rule)
	_, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityWorkstream,
		sourceID: record.WorkstreamID,
		kind:     SemanticNodeWorkstream,
		status:   SemanticNodeStatusActive,
		actor:    SemanticActorSystem,
		summary:  record.Title,
		evidence: EvidenceRuntimeFact,
	})
	return err
}

// updateWorkstreamAnchor advances durable title/provenance without making the
// anchor the next chronological fact. A rename updates what the workstream is
// called; the next run fact still follows whatever happened most recently
// inside the workstream.
func (projector *DirectorGraphProjector) updateWorkstreamAnchor(
	record WorkstreamRecordProjection,
	workstream *projectedWorkstream,
	rule SourceFactRule,
) error {
	nodeID, err := SemanticNodeID(SemanticNodeIdentityWorkstream, record.WorkstreamID)
	if err != nil {
		return err
	}
	if _, exists := workstream.nodeIndex[nodeID]; !exists {
		return fmt.Errorf("workstream %s has no durable anchor", record.WorkstreamID)
	}
	chainAnchor := workstream.lastNodeID
	_, err = projector.commitNode(workstreamRecordContext(record, workstream, rule), nodeSpec{
		nodeID:  nodeID,
		status:  SemanticNodeStatusActive,
		summary: record.Title,
	})
	if err != nil {
		return err
	}
	workstream.lastNodeID = chainAnchor
	return nil
}

func workstreamRecordContext(
	record WorkstreamRecordProjection,
	workstream *projectedWorkstream,
	rule SourceFactRule,
) factContext {
	return factContext{
		eventID:    record.ID,
		emittedAt:  record.EmittedAt,
		workstream: workstream,
		actor:      SemanticActorSystem,
		sourceFact: string(conversation.ConversationEventTypeConversationUpdated),
		edgeKinds:  rule.EdgeKinds,
	}
}
