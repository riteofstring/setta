package semanticgraph

import (
	"context"
	"errors"
	"fmt"
	"sort"
)

type cartographerPatchEventBuilder func(*Service, context.Context, string, SemanticAttachmentActor, CartographerPatch) ([]SemanticEvent, error)

var cartographerPatchEventBuilders = map[CartographerPatchOperation]cartographerPatchEventBuilder{
	CartographerPatchRecordFinding:      (*Service).cartographerRecordNodeEvents,
	CartographerPatchRecordDecision:     (*Service).cartographerRecordNodeEvents,
	CartographerPatchRecordConstraint:   (*Service).cartographerRecordNodeEvents,
	CartographerPatchRecordOpenQuestion: (*Service).cartographerRecordNodeEvents,
	CartographerPatchAttachEvidence:     (*Service).cartographerAttachEvidenceEvents,
	CartographerPatchUpdateNodeSummary:  (*Service).cartographerUpdateNodeSummaryEvents,
	CartographerPatchCreateEdge:         (*Service).cartographerCreateEdgeEvents,
	CartographerPatchStartActivity:      (*Service).cartographerStartActivityEvents,
	CartographerPatchEndActivity:        (*Service).cartographerEndActivityEvents,
	CartographerPatchSplitNode:          (*Service).cartographerSplitNodeEvents,
	CartographerPatchMergeNodes:         (*Service).cartographerMergeNodeEvents,
	CartographerPatchMarkResolved:       (*Service).cartographerMarkResolvedEvents,
}

func cartographerDecisionApplicationOrder(decisions []cartographerPatchDecision) []int {
	indexes := make([]int, len(decisions))
	for index := range decisions {
		indexes[index] = index
	}
	sort.SliceStable(indexes, func(left int, right int) bool {
		return cartographerPatchOperationApplicationPriority(decisions[indexes[left]].patch.Operation) <
			cartographerPatchOperationApplicationPriority(decisions[indexes[right]].patch.Operation)
	})
	return indexes
}

func cartographerPatchOperationApplicationPriority(operation CartographerPatchOperation) int {
	switch operation {
	case CartographerPatchRecordFinding,
		CartographerPatchRecordDecision,
		CartographerPatchRecordConstraint,
		CartographerPatchRecordOpenQuestion,
		CartographerPatchSplitNode,
		CartographerPatchMergeNodes:
		return 0
	case CartographerPatchAttachEvidence,
		CartographerPatchCreateEdge,
		CartographerPatchMarkResolved,
		CartographerPatchStartActivity:
		return 1
	default:
		return 2
	}
}

func (service *Service) cartographerSemanticEventsForPatch(ctx context.Context, workspaceID string, actor SemanticAttachmentActor, patch CartographerPatch) ([]SemanticEvent, error) {
	builder, ok := cartographerPatchEventBuilders[patch.Operation]
	if !ok {
		return nil, fmt.Errorf("cartographer patch operation %s is not auto-applicable", patch.Operation)
	}
	return builder(service, ctx, workspaceID, actor, patch)
}

func (service *Service) cartographerAttachEvidenceEvents(ctx context.Context, workspaceID string, actor SemanticAttachmentActor, patch CartographerPatch) ([]SemanticEvent, error) {
	targetID := patch.Payload.TargetEntityID
	if targetID == "" {
		targetID = patch.Payload.SemanticNodeID
	}
	return service.cartographerEvidenceEvents(ctx, workspaceID, actor, targetID, patch.Payload.EvidenceRefs, patch)
}

func (service *Service) cartographerUpdateNodeSummaryEvents(_ context.Context, workspaceID string, actor SemanticAttachmentActor, patch CartographerPatch) ([]SemanticEvent, error) {
	summary := patch.Payload.Summary
	event, err := service.semanticEvent(workspaceID, EventNodeUpdated, patch.Payload.SemanticNodeID, actor, nodeUpdatedPayload{
		NodeID:  patch.Payload.SemanticNodeID,
		Summary: &summary,
	})
	if err != nil {
		return nil, err
	}
	return []SemanticEvent{event}, nil
}

func (service *Service) cartographerCreateEdgeEvents(_ context.Context, workspaceID string, actor SemanticAttachmentActor, patch CartographerPatch) ([]SemanticEvent, error) {
	edgeID := patch.Payload.EdgeID
	if edgeID == "" {
		id, err := service.newID("semantic_edge")
		if err != nil {
			return nil, fmt.Errorf("create cartographer edge id: %w", err)
		}
		edgeID = id
	}
	event, err := service.semanticEvent(workspaceID, EventEdgeCreated, edgeID, actor, edgeCreatedPayload{
		EdgeID:     edgeID,
		Kind:       *patch.Payload.EdgeKind,
		FromNodeID: patch.Payload.FromNodeID,
		ToNodeID:   patch.Payload.ToNodeID,
		Label:      patch.Payload.Label,
		Summary:    patch.Payload.Summary,
	})
	if err != nil {
		return nil, err
	}
	return []SemanticEvent{event}, nil
}

func (service *Service) cartographerStartActivityEvents(_ context.Context, workspaceID string, actor SemanticAttachmentActor, patch CartographerPatch) ([]SemanticEvent, error) {
	activityID := patch.Payload.ActivityID
	if activityID == "" {
		id, err := service.newID("semantic_activity")
		if err != nil {
			return nil, fmt.Errorf("create cartographer activity id: %w", err)
		}
		activityID = id
	}
	payload := activityStartedPayload{
		IntervalID:              activityID,
		TargetEntityID:          patch.Payload.TargetEntityID,
		Kind:                    *patch.Payload.ActivityKind,
		Summary:                 patch.PublicSummary,
		SourceKind:              *patch.Payload.ActivitySourceKind,
		SourceID:                patch.Payload.ActivitySourceID,
		WorkflowDefinitionID:    patch.SourceRefs.WorkflowDefinitionID,
		WorkflowExecutionID:     patch.SourceRefs.WorkflowExecutionID,
		WorkflowNodeID:          patch.SourceRefs.WorkflowNodeID,
		WorkflowNodeExecutionID: patch.SourceRefs.WorkflowNodeExecutionID,
		ChatConversationID:      patch.SourceRefs.ChatConversationID,
		ChatRunID:               patch.SourceRefs.ChatRunID,
		ChatMessageID:           patch.SourceRefs.ChatMessageID,
		RunItemID:               patch.SourceRefs.RunItemID,
		ActorKind:               actor.ActorKind,
		ActorID:                 actor.ActorID,
	}
	event, err := service.semanticEvent(workspaceID, EventActivityStarted, patch.Payload.TargetEntityID, actor, payload)
	if err != nil {
		return nil, err
	}
	return []SemanticEvent{event}, nil
}

func (service *Service) cartographerEndActivityEvents(ctx context.Context, workspaceID string, actor SemanticAttachmentActor, patch CartographerPatch) ([]SemanticEvent, error) {
	interval, ok, err := service.store.loadSemanticActivityIntervalByID(ctx, workspaceID, patch.Payload.ActivityID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("semantic activity interval %s does not exist", patch.Payload.ActivityID)
	}
	event, err := service.semanticEvent(workspaceID, EventActivityEnded, interval.TargetEntityID, actor, activityEndedPayload{
		IntervalID: patch.Payload.ActivityID,
	})
	if err != nil {
		return nil, err
	}
	return []SemanticEvent{event}, nil
}

func (service *Service) cartographerSplitNodeEvents(ctx context.Context, workspaceID string, actor SemanticAttachmentActor, patch CartographerPatch) ([]SemanticEvent, error) {
	nodes := make([]nodeCreatedPayload, 0, len(patch.Payload.NewNodes))
	newNodeIDs := map[string]bool{}
	for _, node := range patch.Payload.NewNodes {
		payload := cartographerNodeCreatedPayload(node)
		nodes = append(nodes, payload)
		newNodeIDs[payload.NodeID] = true
	}
	event, err := service.semanticEvent(workspaceID, EventNodeSplit, patch.Payload.SourceNodeID, actor, nodeSplitPayload{
		SourceNodeID: patch.Payload.SourceNodeID,
		Nodes:        nodes,
	})
	if err != nil {
		return nil, err
	}
	reassignment, err := service.semanticReassignment(ctx, workspaceID, patch.Payload.Reassignments, newNodeIDs, actor)
	if err != nil {
		return nil, err
	}
	return append([]SemanticEvent{event}, reassignment.events...), nil
}

func (service *Service) cartographerMergeNodeEvents(ctx context.Context, workspaceID string, actor SemanticAttachmentActor, patch CartographerPatch) ([]SemanticEvent, error) {
	target := cartographerNodeCreatedPayload(*patch.Payload.TargetNode)
	event, err := service.semanticEvent(workspaceID, EventNodeMerged, target.NodeID, actor, nodeMergedPayload{
		SourceNodeIDs: patch.Payload.SourceNodeIDs,
		TargetNode:    target,
	})
	if err != nil {
		return nil, err
	}
	reassignment, err := service.semanticReassignment(ctx, workspaceID, patch.Payload.Reassignments, map[string]bool{target.NodeID: true}, actor)
	if err != nil {
		return nil, err
	}
	return append([]SemanticEvent{event}, reassignment.events...), nil
}

func (service *Service) cartographerMarkResolvedEvents(_ context.Context, workspaceID string, actor SemanticAttachmentActor, patch CartographerPatch) ([]SemanticEvent, error) {
	if patch.Payload.ResolutionNodeID == "" {
		return nil, errors.New("cartographer mark_resolved application requires resolutionNodeId")
	}
	edgeID := patch.Payload.EdgeID
	if edgeID == "" {
		id, err := service.newID("semantic_edge")
		if err != nil {
			return nil, fmt.Errorf("create cartographer resolution edge id: %w", err)
		}
		edgeID = id
	}
	event, err := service.semanticEvent(workspaceID, EventEdgeCreated, edgeID, actor, edgeCreatedPayload{
		EdgeID:     edgeID,
		Kind:       EdgeKindResolves,
		FromNodeID: patch.Payload.ResolutionNodeID,
		ToNodeID:   patch.Payload.SemanticNodeID,
		Label:      patch.Payload.Label,
		Summary:    patch.PublicSummary,
	})
	if err != nil {
		return nil, err
	}
	return []SemanticEvent{event}, nil
}

func cartographerNodeCreatedPayload(node CartographerPatchNewNode) nodeCreatedPayload {
	return nodeCreatedPayload{
		NodeID:      node.SemanticNodeID,
		Kind:        node.Kind,
		Label:       node.Label,
		Summary:     node.Summary,
		WhyItExists: node.WhyItExists,
		FutureUse:   node.FutureUse,
	}
}
