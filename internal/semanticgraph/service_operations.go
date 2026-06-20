package semanticgraph

import (
	"context"
	"errors"
	"fmt"
)

func (service *Service) RenameNode(ctx context.Context, input RenameSemanticNodeInput) (SemanticMutationResult, error) {
	actor, err := service.prepareNodeOperation(ctx, input.WorkspaceID, input.NodeID, input.Actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	if err := requireNonEmpty(input.Label, "node label"); err != nil {
		return SemanticMutationResult{}, err
	}
	event, err := service.semanticEvent(input.WorkspaceID, EventNodeRenamed, input.NodeID, actor, nodeRenamedPayload{
		NodeID: input.NodeID,
		Label:  input.Label,
	})
	if err != nil {
		return SemanticMutationResult{}, err
	}
	return service.appendMutationEvents(ctx, input.WorkspaceID, input.NodeID, []SemanticEvent{event}, nil)
}

func (service *Service) UpdateNode(ctx context.Context, input UpdateSemanticNodeInput) (SemanticMutationResult, error) {
	actor, err := service.prepareNodeOperation(ctx, input.WorkspaceID, input.NodeID, input.Actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	if input.Kind == nil && input.Summary == nil {
		return SemanticMutationResult{}, errors.New("semantic node update requires kind or summary")
	}
	if input.Kind != nil && !isSemanticNodeKind(*input.Kind) {
		return SemanticMutationResult{}, fmt.Errorf("node kind is unsupported: %s", *input.Kind)
	}
	event, err := service.semanticEvent(input.WorkspaceID, EventNodeUpdated, input.NodeID, actor, nodeUpdatedPayload{
		NodeID:  input.NodeID,
		Kind:    input.Kind,
		Summary: input.Summary,
	})
	if err != nil {
		return SemanticMutationResult{}, err
	}
	return service.appendMutationEvents(ctx, input.WorkspaceID, input.NodeID, []SemanticEvent{event}, nil)
}

func (service *Service) DismissNode(ctx context.Context, input SemanticNodeOperationInput) (SemanticMutationResult, error) {
	actor, err := service.prepareNodeOperation(ctx, input.WorkspaceID, input.NodeID, input.Actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	event, err := service.semanticEvent(input.WorkspaceID, EventNodeDismissed, input.NodeID, actor, nodeDismissedPayload{NodeID: input.NodeID})
	if err != nil {
		return SemanticMutationResult{}, err
	}
	return service.appendMutationEvents(ctx, input.WorkspaceID, input.NodeID, []SemanticEvent{event}, nil)
}

func (service *Service) PromoteNode(ctx context.Context, input SemanticNodeOperationInput) (SemanticMutationResult, error) {
	actor, err := service.prepareNodeOperation(ctx, input.WorkspaceID, input.NodeID, input.Actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	event, err := service.semanticEvent(input.WorkspaceID, EventNodePromoted, input.NodeID, actor, nodePromotedPayload{NodeID: input.NodeID})
	if err != nil {
		return SemanticMutationResult{}, err
	}
	return service.appendMutationEvents(ctx, input.WorkspaceID, input.NodeID, []SemanticEvent{event}, nil)
}

func (service *Service) CreateUserNode(ctx context.Context, input CreateSemanticNodeInput) (SemanticMutationResult, error) {
	if _, err := service.resolveWorkspace(input.WorkspaceID); err != nil {
		return SemanticMutationResult{}, err
	}
	actor, err := normalizeAttachmentActor(input.Actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	seed, err := service.operationNodeSeed(input.NodeID, input.Kind, input.Label, input.Summary)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	event, err := service.semanticEvent(input.WorkspaceID, EventNodeCreated, seed.NodeID, actor, seed)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	return service.appendMutationEvents(ctx, input.WorkspaceID, seed.NodeID, []SemanticEvent{event}, nil)
}

func (service *Service) CreateUserEdge(ctx context.Context, input CreateSemanticEdgeInput) (SemanticMutationResult, error) {
	actor, edgeID, err := service.prepareEdgeCreate(ctx, input)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	payload := edgeCreatedPayload{
		EdgeID:     edgeID,
		Kind:       input.Kind,
		FromNodeID: input.FromNodeID,
		ToNodeID:   input.ToNodeID,
		Label:      input.Label,
		Summary:    input.Summary,
	}
	event, err := service.semanticEvent(input.WorkspaceID, EventEdgeCreated, edgeID, actor, payload)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	return service.appendMutationEvents(ctx, input.WorkspaceID, edgeID, []SemanticEvent{event}, nil)
}

func (service *Service) UpdateEdge(ctx context.Context, input UpdateSemanticEdgeInput) (SemanticMutationResult, error) {
	actor, err := service.prepareEdgeOperation(ctx, input.WorkspaceID, input.EdgeID, input.Actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	if input.Kind == nil && input.Label == nil && input.Summary == nil {
		return SemanticMutationResult{}, errors.New("semantic edge update requires kind, label, or summary")
	}
	if input.Kind != nil && !isSemanticEdgeKind(*input.Kind) {
		return SemanticMutationResult{}, fmt.Errorf("edge kind is unsupported: %s", *input.Kind)
	}
	event, err := service.semanticEvent(input.WorkspaceID, EventEdgeUpdated, input.EdgeID, actor, edgeUpdatedPayload{
		EdgeID:  input.EdgeID,
		Kind:    input.Kind,
		Label:   input.Label,
		Summary: input.Summary,
	})
	if err != nil {
		return SemanticMutationResult{}, err
	}
	return service.appendMutationEvents(ctx, input.WorkspaceID, input.EdgeID, []SemanticEvent{event}, nil)
}

func (service *Service) RemoveEdge(ctx context.Context, input SemanticEdgeOperationInput) (SemanticMutationResult, error) {
	actor, err := service.prepareEdgeOperation(ctx, input.WorkspaceID, input.EdgeID, input.Actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	event, err := service.semanticEvent(input.WorkspaceID, EventEdgeRemoved, input.EdgeID, actor, edgeRemovedPayload{EdgeID: input.EdgeID})
	if err != nil {
		return SemanticMutationResult{}, err
	}
	return service.appendMutationEvents(ctx, input.WorkspaceID, input.EdgeID, []SemanticEvent{event}, nil)
}

func (service *Service) SplitNode(ctx context.Context, input SplitSemanticNodeInput) (SemanticMutationResult, error) {
	actor, err := service.prepareNodeOperation(ctx, input.WorkspaceID, input.SourceNodeID, input.Actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	nodes, newNodeIDs, err := service.operationNodeSeeds(input.Nodes)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	payload := nodeSplitPayload{SourceNodeID: input.SourceNodeID, Nodes: nodes}
	event, err := service.semanticEvent(input.WorkspaceID, EventNodeSplit, input.SourceNodeID, actor, payload)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	reassignment, err := service.semanticReassignment(ctx, input.WorkspaceID, input.Reassignments, newNodeIDs, actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	events := append([]SemanticEvent{event}, reassignment.events...)
	return service.appendMutationEvents(ctx, input.WorkspaceID, input.SourceNodeID, events, reassignment.layoutPositions)
}

func (service *Service) MergeNodes(ctx context.Context, input MergeSemanticNodesInput) (SemanticMutationResult, error) {
	if _, err := service.resolveWorkspace(input.WorkspaceID); err != nil {
		return SemanticMutationResult{}, err
	}
	actor, err := normalizeAttachmentActor(input.Actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	if len(input.SourceNodeIDs) == 0 {
		return SemanticMutationResult{}, errors.New("merge source nodes are required")
	}
	for _, sourceID := range input.SourceNodeIDs {
		if err := service.requireSemanticNode(ctx, input.WorkspaceID, sourceID); err != nil {
			return SemanticMutationResult{}, err
		}
	}
	target, err := service.operationNodeSeed(input.TargetNode.NodeID, input.TargetNode.Kind, input.TargetNode.Label, input.TargetNode.Summary)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	payload := nodeMergedPayload{SourceNodeIDs: input.SourceNodeIDs, TargetNode: target}
	event, err := service.semanticEvent(input.WorkspaceID, EventNodeMerged, target.NodeID, actor, payload)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	reassignment, err := service.semanticReassignment(ctx, input.WorkspaceID, input.Reassignments, map[string]bool{target.NodeID: true}, actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	events := append([]SemanticEvent{event}, reassignment.events...)
	return service.appendMutationEvents(ctx, input.WorkspaceID, target.NodeID, events, reassignment.layoutPositions)
}

func (service *Service) CreateSteeringDirective(ctx context.Context, input CreateSteeringDirectiveInput) (SemanticMutationResult, error) {
	if _, err := service.resolveWorkspace(input.WorkspaceID); err != nil {
		return SemanticMutationResult{}, err
	}
	if err := service.requireSemanticNode(ctx, input.WorkspaceID, input.TargetEntityID); err != nil {
		return SemanticMutationResult{}, err
	}
	actor, err := normalizeAttachmentActor(input.Actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	directiveID, err := service.newID("semantic_steering")
	if err != nil {
		return SemanticMutationResult{}, fmt.Errorf("create semantic steering directive id: %w", err)
	}
	scope := input.Scope
	if scope == "" {
		scope = SteeringScopeWorkspace
	}
	payload := steeringCreatedPayload{
		DirectiveID:             directiveID,
		TargetEntityID:          input.TargetEntityID,
		Kind:                    input.Kind,
		Instruction:             input.Instruction,
		Status:                  SteeringStatusActive,
		Scope:                   scope,
		WorkflowDefinitionID:    input.WorkflowDefinitionID,
		WorkflowExecutionID:     input.WorkflowExecutionID,
		WorkflowNodeID:          input.WorkflowNodeID,
		WorkflowNodeExecutionID: input.WorkflowNodeExecutionID,
		ChatConversationID:      input.ChatConversationID,
		ChatRunID:               input.ChatRunID,
		ChatMessageID:           input.ChatMessageID,
		RunItemID:               input.RunItemID,
	}
	event, err := service.semanticEvent(input.WorkspaceID, EventSteeringCreated, input.TargetEntityID, actor, payload)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	return service.appendMutationEvents(ctx, input.WorkspaceID, input.TargetEntityID, []SemanticEvent{event}, nil)
}

func (service *Service) UpdateSteeringDirective(ctx context.Context, input UpdateSteeringDirectiveInput) (SemanticMutationResult, error) {
	if _, err := service.resolveWorkspace(input.WorkspaceID); err != nil {
		return SemanticMutationResult{}, err
	}
	directive, ok, err := service.store.loadSemanticSteeringDirectiveByID(ctx, input.WorkspaceID, input.DirectiveID)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	if !ok {
		return SemanticMutationResult{}, fmt.Errorf("semantic steering directive %s does not exist", input.DirectiveID)
	}
	actor, err := normalizeAttachmentActor(input.Actor)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	if input.Instruction == nil && input.Status == nil && input.SupersedesDirectiveID == "" {
		return SemanticMutationResult{}, errors.New("steering directive update requires instruction, status, or supersedesDirectiveId")
	}
	if input.Status != nil && !isSemanticSteeringStatus(*input.Status) {
		return SemanticMutationResult{}, fmt.Errorf("steering status is unsupported: %s", *input.Status)
	}
	event, err := service.semanticEvent(input.WorkspaceID, EventSteeringUpdated, directive.TargetEntityID, actor, steeringUpdatedPayload{
		DirectiveID:           input.DirectiveID,
		Instruction:           input.Instruction,
		Status:                input.Status,
		SupersedesDirectiveID: input.SupersedesDirectiveID,
	})
	if err != nil {
		return SemanticMutationResult{}, err
	}
	return service.appendMutationEvents(ctx, input.WorkspaceID, directive.TargetEntityID, []SemanticEvent{event}, nil)
}

func (service *Service) prepareNodeOperation(ctx context.Context, workspaceID string, nodeID string, actorInput SemanticAttachmentActor) (SemanticAttachmentActor, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return SemanticAttachmentActor{}, err
	}
	if err := service.requireSemanticNode(ctx, workspaceID, nodeID); err != nil {
		return SemanticAttachmentActor{}, err
	}
	return normalizeAttachmentActor(actorInput)
}

func (service *Service) prepareEdgeCreate(ctx context.Context, input CreateSemanticEdgeInput) (SemanticAttachmentActor, string, error) {
	if _, err := service.resolveWorkspace(input.WorkspaceID); err != nil {
		return SemanticAttachmentActor{}, "", err
	}
	if !isSemanticEdgeKind(input.Kind) {
		return SemanticAttachmentActor{}, "", fmt.Errorf("edge kind is unsupported: %s", input.Kind)
	}
	if err := service.requireSemanticNode(ctx, input.WorkspaceID, input.FromNodeID); err != nil {
		return SemanticAttachmentActor{}, "", err
	}
	if err := service.requireSemanticNode(ctx, input.WorkspaceID, input.ToNodeID); err != nil {
		return SemanticAttachmentActor{}, "", err
	}
	actor, err := normalizeAttachmentActor(input.Actor)
	if err != nil {
		return SemanticAttachmentActor{}, "", err
	}
	edgeID := input.EdgeID
	if edgeID == "" {
		edgeID, err = service.newID("semantic_edge")
		if err != nil {
			return SemanticAttachmentActor{}, "", fmt.Errorf("create semantic edge id: %w", err)
		}
	}
	if err := validateStoreIDs("edge id", edgeID); err != nil {
		return SemanticAttachmentActor{}, "", err
	}
	return actor, edgeID, nil
}

func (service *Service) prepareEdgeOperation(ctx context.Context, workspaceID string, edgeID string, actorInput SemanticAttachmentActor) (SemanticAttachmentActor, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return SemanticAttachmentActor{}, err
	}
	if _, ok, err := service.store.loadSemanticEdgeByID(ctx, workspaceID, edgeID); err != nil {
		return SemanticAttachmentActor{}, err
	} else if !ok {
		return SemanticAttachmentActor{}, fmt.Errorf("semantic edge %s does not exist", edgeID)
	}
	return normalizeAttachmentActor(actorInput)
}

func (service *Service) operationNodeSeeds(inputs []SemanticNodeSeedInput) ([]nodeCreatedPayload, map[string]bool, error) {
	if len(inputs) == 0 {
		return nil, nil, errors.New("semantic nodes are required")
	}
	nodes := make([]nodeCreatedPayload, 0, len(inputs))
	nodeIDs := map[string]bool{}
	for _, input := range inputs {
		node, err := service.operationNodeSeed(input.NodeID, input.Kind, input.Label, input.Summary)
		if err != nil {
			return nil, nil, err
		}
		if nodeIDs[node.NodeID] {
			return nil, nil, fmt.Errorf("semantic node input contains duplicate node id %s", node.NodeID)
		}
		nodeIDs[node.NodeID] = true
		nodes = append(nodes, node)
	}
	return nodes, nodeIDs, nil
}

func (service *Service) operationNodeSeed(nodeID string, kind SemanticNodeKind, label string, summary string) (nodeCreatedPayload, error) {
	var err error
	if nodeID == "" {
		nodeID, err = service.newID("semantic_node")
		if err != nil {
			return nodeCreatedPayload{}, fmt.Errorf("create semantic node id: %w", err)
		}
	}
	payload := nodeCreatedPayload{NodeID: nodeID, Kind: kind, Label: label, Summary: summary}
	if err := validateNodeSeedPayload(payload); err != nil {
		return nodeCreatedPayload{}, err
	}
	return payload, nil
}

type preparedSemanticReassignment struct {
	events          []SemanticEvent
	layoutPositions []SemanticLayoutPositionInput
}

func (service *Service) semanticReassignment(ctx context.Context, workspaceID string, input SemanticReassignmentInputs, allowedNewTargets map[string]bool, actor SemanticAttachmentActor) (preparedSemanticReassignment, error) {
	events := []SemanticEvent{}
	layout := []SemanticLayoutPositionInput{}
	edgeEvents, err := service.semanticEdgeReassignmentEvents(ctx, workspaceID, input.Edges, allowedNewTargets, actor)
	if err != nil {
		return preparedSemanticReassignment{}, err
	}
	events = append(events, edgeEvents...)
	evidenceEvents, err := service.semanticEvidenceReassignmentEvents(ctx, workspaceID, input.Evidence, allowedNewTargets, actor)
	if err != nil {
		return preparedSemanticReassignment{}, err
	}
	events = append(events, evidenceEvents...)
	activityEvents, err := service.semanticActivityReassignmentEvents(ctx, workspaceID, input.Activity, allowedNewTargets, actor)
	if err != nil {
		return preparedSemanticReassignment{}, err
	}
	events = append(events, activityEvents...)
	steeringEvents, err := service.semanticSteeringReassignmentEvents(ctx, workspaceID, input.Steering, allowedNewTargets, actor)
	if err != nil {
		return preparedSemanticReassignment{}, err
	}
	events = append(events, steeringEvents...)
	layout, err = service.semanticLayoutReassignmentPositions(ctx, workspaceID, input.Layout, allowedNewTargets)
	if err != nil {
		return preparedSemanticReassignment{}, err
	}
	return preparedSemanticReassignment{events: events, layoutPositions: layout}, nil
}

func (service *Service) semanticEdgeReassignmentEvents(ctx context.Context, workspaceID string, inputs []SemanticEdgeReassignmentInput, allowedNewTargets map[string]bool, actor SemanticAttachmentActor) ([]SemanticEvent, error) {
	events := make([]SemanticEvent, 0, len(inputs))
	for _, input := range inputs {
		edge, ok, err := service.store.loadSemanticEdgeByID(ctx, workspaceID, input.EdgeID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("semantic edge %s does not exist", input.EdgeID)
		}
		if err := service.requireExistingOrNewNode(ctx, workspaceID, input.FromNodeID, allowedNewTargets); err != nil {
			return nil, err
		}
		if err := service.requireExistingOrNewNode(ctx, workspaceID, input.ToNodeID, allowedNewTargets); err != nil {
			return nil, err
		}
		edgeID := input.TargetEdgeID
		if edgeID == "" {
			edgeID, err = service.newID("semantic_edge")
			if err != nil {
				return nil, fmt.Errorf("create semantic reassigned edge id: %w", err)
			}
		}
		if err := validateStoreIDs("target edge id", edgeID); err != nil {
			return nil, err
		}
		payload := edgeCreatedPayload{
			EdgeID:     edgeID,
			Kind:       edge.Kind,
			FromNodeID: input.FromNodeID,
			ToNodeID:   input.ToNodeID,
			Label:      edge.Label,
			Summary:    edge.Summary,
		}
		event, err := service.semanticEvent(workspaceID, EventEdgeCreated, edgeID, actor, payload)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}

func (service *Service) semanticEvidenceReassignmentEvents(ctx context.Context, workspaceID string, inputs []SemanticEvidenceReassignmentInput, allowedNewTargets map[string]bool, actor SemanticAttachmentActor) ([]SemanticEvent, error) {
	events := make([]SemanticEvent, 0, len(inputs))
	for _, input := range inputs {
		if err := service.requireExistingOrNewNode(ctx, workspaceID, input.TargetNodeID, allowedNewTargets); err != nil {
			return nil, err
		}
		anchor, ok, err := service.store.loadSemanticEvidenceAnchorByID(ctx, workspaceID, input.AnchorID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("semantic evidence anchor %s does not exist", input.AnchorID)
		}
		anchorID, err := service.newID("semantic_evidence")
		if err != nil {
			return nil, fmt.Errorf("create reassigned semantic evidence id: %w", err)
		}
		payload := evidenceAttachedPayload{
			AnchorID:                anchorID,
			TargetEntityID:          input.TargetNodeID,
			SourceKind:              anchor.SourceKind,
			SourceID:                anchor.SourceID,
			URI:                     anchor.URI,
			Path:                    anchor.Path,
			RangeStart:              anchor.RangeStart,
			RangeEnd:                anchor.RangeEnd,
			Text:                    anchor.Text,
			Summary:                 anchor.Summary,
			ContentHash:             anchor.ContentHash,
			WorkflowDefinitionID:    anchor.WorkflowDefinitionID,
			WorkflowExecutionID:     anchor.WorkflowExecutionID,
			WorkflowNodeID:          anchor.WorkflowNodeID,
			WorkflowNodeExecutionID: anchor.WorkflowNodeExecutionID,
			ChatConversationID:      anchor.ChatConversationID,
			ChatRunID:               anchor.ChatRunID,
			ChatMessageID:           anchor.ChatMessageID,
			RunItemID:               anchor.RunItemID,
			ReassignedFromAnchorID:  anchor.ID,
		}
		event, err := service.semanticEvent(workspaceID, EventEvidenceAttached, input.TargetNodeID, actor, payload)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}

func (service *Service) semanticActivityReassignmentEvents(ctx context.Context, workspaceID string, inputs []SemanticActivityReassignmentInput, allowedNewTargets map[string]bool, actor SemanticAttachmentActor) ([]SemanticEvent, error) {
	events := []SemanticEvent{}
	for _, input := range inputs {
		if err := service.requireExistingOrNewNode(ctx, workspaceID, input.TargetNodeID, allowedNewTargets); err != nil {
			return nil, err
		}
		interval, ok, err := service.store.loadSemanticActivityIntervalByID(ctx, workspaceID, input.ActivityIntervalID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("semantic activity interval %s does not exist", input.ActivityIntervalID)
		}
		intervalID, err := service.newID("semantic_activity")
		if err != nil {
			return nil, fmt.Errorf("create reassigned semantic activity id: %w", err)
		}
		payload := activityStartedPayload{
			IntervalID:               intervalID,
			TargetEntityID:           input.TargetNodeID,
			Kind:                     interval.Kind,
			Summary:                  interval.Summary,
			SourceKind:               interval.SourceKind,
			SourceID:                 interval.SourceID,
			EvidenceAnchorID:         interval.EvidenceAnchorID,
			WorkflowDefinitionID:     interval.WorkflowDefinitionID,
			WorkflowExecutionID:      interval.WorkflowExecutionID,
			WorkflowNodeID:           interval.WorkflowNodeID,
			WorkflowNodeExecutionID:  interval.WorkflowNodeExecutionID,
			ChatConversationID:       interval.ChatConversationID,
			ChatRunID:                interval.ChatRunID,
			ChatMessageID:            interval.ChatMessageID,
			RunItemID:                interval.RunItemID,
			ReassignedFromIntervalID: interval.ID,
			ActorKind:                actor.ActorKind,
			ActorID:                  actor.ActorID,
		}
		started, err := service.semanticEvent(workspaceID, EventActivityStarted, input.TargetNodeID, actor, payload)
		if err != nil {
			return nil, err
		}
		events = append(events, started)
		if interval.EndedAt != "" {
			ended, err := service.semanticEvent(workspaceID, EventActivityEnded, input.TargetNodeID, actor, activityEndedPayload{IntervalID: intervalID})
			if err != nil {
				return nil, err
			}
			events = append(events, ended)
		}
	}
	return events, nil
}

func (service *Service) semanticSteeringReassignmentEvents(ctx context.Context, workspaceID string, inputs []SemanticSteeringReassignmentInput, allowedNewTargets map[string]bool, actor SemanticAttachmentActor) ([]SemanticEvent, error) {
	events := make([]SemanticEvent, 0, len(inputs))
	for _, input := range inputs {
		if err := service.requireExistingOrNewNode(ctx, workspaceID, input.TargetNodeID, allowedNewTargets); err != nil {
			return nil, err
		}
		directive, ok, err := service.store.loadSemanticSteeringDirectiveByID(ctx, workspaceID, input.DirectiveID)
		if err != nil {
			return nil, err
		}
		if !ok {
			return nil, fmt.Errorf("semantic steering directive %s does not exist", input.DirectiveID)
		}
		directiveID, err := service.newID("semantic_steering")
		if err != nil {
			return nil, fmt.Errorf("create reassigned semantic steering directive id: %w", err)
		}
		payload := steeringCreatedPayload{
			DirectiveID:               directiveID,
			TargetEntityID:            input.TargetNodeID,
			Kind:                      directive.Kind,
			Instruction:               directive.Instruction,
			Status:                    directive.Status,
			Scope:                     directive.Scope,
			WorkflowDefinitionID:      directive.WorkflowDefinitionID,
			WorkflowExecutionID:       directive.WorkflowExecutionID,
			WorkflowNodeID:            directive.WorkflowNodeID,
			WorkflowNodeExecutionID:   directive.WorkflowNodeExecutionID,
			ChatConversationID:        directive.ChatConversationID,
			ChatRunID:                 directive.ChatRunID,
			ChatMessageID:             directive.ChatMessageID,
			RunItemID:                 directive.RunItemID,
			SupersedesDirectiveID:     directive.SupersedesDirectiveID,
			ReassignedFromDirectiveID: directive.ID,
		}
		event, err := service.semanticEvent(workspaceID, EventSteeringCreated, input.TargetNodeID, actor, payload)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}

func (service *Service) semanticLayoutReassignmentPositions(ctx context.Context, workspaceID string, inputs []SemanticLayoutReassignmentInput, allowedNewTargets map[string]bool) ([]SemanticLayoutPositionInput, error) {
	if len(inputs) == 0 {
		return nil, nil
	}
	positions, err := service.store.loadSemanticLayoutPositions(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	positionsByID := map[string]SemanticLayoutPosition{}
	for _, position := range positions {
		positionsByID[position.EntityID] = position
	}
	result := make([]SemanticLayoutPositionInput, 0, len(inputs))
	for _, input := range inputs {
		position, ok := positionsByID[input.EntityID]
		if !ok {
			return nil, fmt.Errorf("semantic layout position %s does not exist", input.EntityID)
		}
		if err := service.requireExistingOrNewNode(ctx, workspaceID, input.TargetEntityID, allowedNewTargets); err != nil {
			return nil, err
		}
		result = append(result, SemanticLayoutPositionInput{
			EntityID: input.TargetEntityID,
			X:        position.X,
			Y:        position.Y,
			Pinned:   position.Pinned,
		})
	}
	return result, nil
}

func (service *Service) requireExistingOrNewNode(ctx context.Context, workspaceID string, nodeID string, allowedNewTargets map[string]bool) error {
	if err := validateStoreIDs("target node id", nodeID); err != nil {
		return err
	}
	if allowedNewTargets[nodeID] {
		return nil
	}
	return service.requireSemanticNode(ctx, workspaceID, nodeID)
}

func (service *Service) appendMutationEvents(ctx context.Context, workspaceID string, targetEntityID string, events []SemanticEvent, layoutPositions []SemanticLayoutPositionInput) (SemanticMutationResult, error) {
	appended, err := service.appendEvents(ctx, events)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	if len(layoutPositions) > 0 {
		if _, err := service.UpdateLayoutPositions(ctx, workspaceID, layoutPositions); err != nil {
			return SemanticMutationResult{}, err
		}
	}
	graph, err := service.ReadGraph(ctx, workspaceID)
	if err != nil {
		return SemanticMutationResult{}, err
	}
	var detail *SemanticNodeDetail
	if node, ok, err := service.store.loadSemanticNode(ctx, workspaceID, targetEntityID); err != nil {
		return SemanticMutationResult{}, err
	} else if ok {
		nodeDetail, ok, err := service.ReadNodeDetail(ctx, workspaceID, node.ID)
		if err != nil {
			return SemanticMutationResult{}, err
		}
		if ok {
			detail = &nodeDetail
		}
	}
	return SemanticMutationResult{
		WorkspaceID:    workspaceID,
		TargetEntityID: targetEntityID,
		Graph:          graph,
		NodeDetail:     detail,
		Events:         appended,
	}, nil
}
