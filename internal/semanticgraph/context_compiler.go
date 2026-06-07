package semanticgraph

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"

	"setta/internal/semanticcontext"
)

const (
	semanticContextCompilerActorID = "semantic_context_compiler"
	defaultContextActivityLimit    = 40
)

type contextCandidate struct {
	key          string
	item         SemanticContextPackItem
	node         *SemanticNode
	directRank   int
	promotedRank int
	updatedAt    string
}

func (service *Service) CompileContext(ctx context.Context, request semanticcontext.CompileRequest) (semanticcontext.Delivery, error) {
	if err := validateCompileRequest(ctx, request); err != nil {
		return semanticcontext.Delivery{}, err
	}
	if _, err := service.resolveWorkspace(request.WorkspaceID); err != nil {
		return semanticcontext.Delivery{}, err
	}

	input := contextCompilerInput{
		request:    request,
		sourceRefs: semanticSourceRefsFromCompileRequest(request.SourceRefs),
	}
	candidates, err := service.contextCandidates(ctx, input)
	if err != nil {
		return semanticcontext.Delivery{}, err
	}
	if len(candidates) == 0 {
		return semanticcontext.Delivery{}, nil
	}

	packID, err := service.newID("semantic_context_pack")
	if err != nil {
		return semanticcontext.Delivery{}, fmt.Errorf("create semantic context pack id: %w", err)
	}
	selected, err := selectContextCandidates(candidates, request.TokenBudget)
	if err != nil {
		return semanticcontext.Delivery{}, err
	}
	if len(selected) == 0 {
		return semanticcontext.Delivery{}, nil
	}
	assignContextPackItemIDs(packID, selected)
	deliveredContext := renderContextPack(packID, selected)
	estimatedTokens := estimateTokens(deliveredContext)
	targetEntityID := primaryContextTarget(selected)
	payload := contextPackCreatedPayload{
		PackID:               packID,
		TriggerKind:          semanticContextTriggerFromRequest(request.TriggerKind),
		TargetEntityID:       targetEntityID,
		SourceRefs:           input.sourceRefs,
		AuthoredPromptHash:   sha256Hex(request.AuthoredPrompt),
		DeliveredContextHash: sha256Hex(deliveredContext),
		TokenBudget:          request.TokenBudget,
		EstimatedTokens:      estimatedTokens,
		ItemCount:            len(selected),
		Items:                contextItemsFromCandidates(selected),
		DeliveredContext:     deliveredContext,
	}
	event, err := service.semanticEvent(request.WorkspaceID, EventContextPackCreated, targetEntityID, SemanticAttachmentActor{
		ActorKind: ActorKindService,
		ActorID:   semanticContextCompilerActorID,
	}, payload)
	if err != nil {
		return semanticcontext.Delivery{}, err
	}
	appended, err := service.AppendEvent(ctx, event)
	if err != nil {
		return semanticcontext.Delivery{}, err
	}
	return semanticcontext.Delivery{
		PackID:        packID,
		ContextText:   deliveredContext,
		ItemCount:     len(selected),
		TokenBudget:   request.TokenBudget,
		TokenEstimate: estimatedTokens,
	}, ensureContextPackEventPersisted(appended, packID)
}

type contextCompilerInput struct {
	request    semanticcontext.CompileRequest
	sourceRefs SemanticContextSourceRefs
}

type contextCandidateState struct {
	nodesByID      map[string]SemanticNode
	edgesByNode    map[string][]SemanticEdge
	sourceEvidence []SemanticEvidenceAnchor
	sourceActivity []SemanticActivityInterval
	steering       []SemanticSteeringDirective
}

func validateCompileRequest(ctx context.Context, request semanticcontext.CompileRequest) error {
	if ctx == nil {
		return fmt.Errorf("context is required")
	}
	if err := validateStoreIDs("workspace id", request.WorkspaceID); err != nil {
		return err
	}
	if !isCompileTriggerSupported(request.TriggerKind) {
		return fmt.Errorf("semantic context trigger kind is unsupported: %s", request.TriggerKind)
	}
	if request.TokenBudget < 0 {
		return fmt.Errorf("semantic context tokenBudget must not be negative: %d", request.TokenBudget)
	}
	return validateContextSourceRefs(semanticSourceRefsFromCompileRequest(request.SourceRefs), "semantic context request")
}

func isCompileTriggerSupported(trigger semanticcontext.TriggerKind) bool {
	switch trigger {
	case semanticcontext.TriggerWorkflowAgentStart,
		semanticcontext.TriggerSteering,
		semanticcontext.TriggerImmediateSteeringReplay,
		semanticcontext.TriggerPhaseBoundary,
		semanticcontext.TriggerAgentRequest:
		return true
	default:
		return false
	}
}

func semanticContextTriggerFromRequest(trigger semanticcontext.TriggerKind) SemanticContextTriggerKind {
	switch trigger {
	case semanticcontext.TriggerWorkflowAgentStart:
		return ContextTriggerWorkflowAgentStart
	case semanticcontext.TriggerSteering:
		return ContextTriggerSteering
	case semanticcontext.TriggerImmediateSteeringReplay:
		return ContextTriggerImmediateSteeringReplay
	case semanticcontext.TriggerPhaseBoundary:
		return ContextTriggerPhaseBoundary
	case semanticcontext.TriggerAgentRequest:
		return ContextTriggerAgentRequest
	default:
		return ""
	}
}

func semanticSourceRefsFromCompileRequest(refs semanticcontext.SourceRefs) SemanticContextSourceRefs {
	return SemanticContextSourceRefs{
		WorkflowDefinitionID:    refs.WorkflowDefinitionID,
		WorkflowExecutionID:     refs.WorkflowExecutionID,
		WorkflowNodeID:          refs.WorkflowNodeID,
		WorkflowNodeExecutionID: refs.WorkflowNodeExecutionID,
		ChatConversationID:      refs.ChatConversationID,
		ChatRunID:               refs.ChatRunID,
		ChatMessageID:           refs.ChatMessageID,
		RunItemID:               refs.RunItemID,
	}
}

func (service *Service) contextCandidates(ctx context.Context, input contextCompilerInput) ([]contextCandidate, error) {
	state, err := service.contextCandidateState(ctx, input)
	if err != nil {
		return nil, err
	}

	associated := contextAssociatedNodes(state.sourceEvidence, state.sourceActivity, state.steering, input.sourceRefs)
	candidates := map[string]contextCandidate{}
	addCandidate := func(candidate contextCandidate) {
		if candidate.item.EstimatedTokens <= 0 {
			candidate.item.EstimatedTokens = estimateContextItemTokens(candidate.item)
		}
		if existing, ok := candidates[candidate.key]; ok && compareContextCandidates(candidate, existing) >= 0 {
			return
		}
		candidates[candidate.key] = candidate
	}

	addSteeringContextCandidates(addCandidate, state.steering, input.sourceRefs, associated)
	addAssociatedNodeCandidates(addCandidate, state.nodesByID, associated, "explicit source association", 0)
	addNeighborhoodNodeCandidates(addCandidate, state.nodesByID, state.edgesByNode, associated)
	addConstraintNodeCandidates(addCandidate, state.nodesByID, associated)

	nodeIDs := contextCandidateNodeIDs(candidates)
	evidenceByNode, err := service.contextEvidenceForNodes(ctx, input.request.WorkspaceID, nodeIDs)
	if err != nil {
		return nil, err
	}
	for _, anchors := range evidenceByNode {
		for _, anchor := range anchors {
			addCandidate(contextCandidateForEvidence(anchor, input.sourceRefs))
		}
	}
	for _, interval := range state.sourceActivity {
		addCandidate(contextCandidateForActivity(interval, input.sourceRefs))
	}

	avoidTargets := avoidTargetIDs(candidates)
	filtered := applyAvoidDirectives(candidates, avoidTargets)
	result := make([]contextCandidate, 0, len(filtered))
	for _, candidate := range filtered {
		result = append(result, candidate)
	}
	sort.Slice(result, func(i int, j int) bool {
		return compareContextCandidates(result[i], result[j]) < 0
	})
	return result, nil
}

func (service *Service) contextCandidateState(ctx context.Context, input contextCompilerInput) (contextCandidateState, error) {
	graph, err := service.store.ReadGraph(ctx, input.request.WorkspaceID)
	if err != nil {
		return contextCandidateState{}, err
	}
	sourceEvidence, err := service.store.loadEvidenceBySourceRefs(ctx, input.request.WorkspaceID, input.sourceRefs)
	if err != nil {
		return contextCandidateState{}, err
	}
	sourceActivity, err := service.store.loadActivityBySourceRefs(ctx, input.request.WorkspaceID, input.sourceRefs, defaultContextActivityLimit)
	if err != nil {
		return contextCandidateState{}, err
	}
	steering, err := service.store.loadActiveSteeringForContext(ctx, input.request.WorkspaceID)
	if err != nil {
		return contextCandidateState{}, err
	}
	nodesByID := map[string]SemanticNode{}
	for _, node := range graph.Nodes {
		nodesByID[node.ID] = node
	}
	return contextCandidateState{
		nodesByID:      nodesByID,
		edgesByNode:    contextEdgesByNode(graph.Edges),
		sourceEvidence: sourceEvidence,
		sourceActivity: sourceActivity,
		steering:       steering,
	}, nil
}

func addSteeringContextCandidates(add func(contextCandidate), steering []SemanticSteeringDirective, refs SemanticContextSourceRefs, associated map[string]bool) {
	for _, directive := range steering {
		if !steeringDirectiveRelevant(directive, refs, associated) {
			continue
		}
		add(contextCandidateForSteering(directive, refs))
		if directive.TargetEntityID != "" {
			associated[directive.TargetEntityID] = true
		}
	}
}

func contextEdgesByNode(edges []SemanticEdge) map[string][]SemanticEdge {
	edgesByNode := map[string][]SemanticEdge{}
	for _, edge := range edges {
		edgesByNode[edge.FromNodeID] = append(edgesByNode[edge.FromNodeID], edge)
		edgesByNode[edge.ToNodeID] = append(edgesByNode[edge.ToNodeID], edge)
	}
	return edgesByNode
}

func contextAssociatedNodes(evidence []SemanticEvidenceAnchor, activity []SemanticActivityInterval, steering []SemanticSteeringDirective, refs SemanticContextSourceRefs) map[string]bool {
	associated := map[string]bool{}
	for _, anchor := range evidence {
		associated[anchor.TargetEntityID] = true
	}
	for _, interval := range activity {
		associated[interval.TargetEntityID] = true
	}
	for _, directive := range steering {
		if steeringDirectiveRelevant(directive, refs, associated) || isContextPin(directive.Kind) {
			associated[directive.TargetEntityID] = true
		}
	}
	return associated
}

func addAssociatedNodeCandidates(add func(contextCandidate), nodesByID map[string]SemanticNode, associated map[string]bool, reason string, directRank int) {
	nodeIDs := sortedMapKeys(associated)
	for _, nodeID := range nodeIDs {
		node, ok := nodesByID[nodeID]
		if !ok || nodeExcludedFromContext(node) {
			continue
		}
		add(contextCandidateForNode(node, reason, contextPriorityForNode(node), directRank))
	}
}

func addNeighborhoodNodeCandidates(add func(contextCandidate), nodesByID map[string]SemanticNode, edgesByNode map[string][]SemanticEdge, associated map[string]bool) {
	for _, nodeID := range sortedMapKeys(associated) {
		edges := edgesByNode[nodeID]
		sort.Slice(edges, func(i int, j int) bool {
			return edges[i].ID < edges[j].ID
		})
		for _, edge := range edges {
			neighborID := edge.FromNodeID
			if neighborID == nodeID {
				neighborID = edge.ToNodeID
			}
			node, ok := nodesByID[neighborID]
			if !ok || nodeExcludedFromContext(node) {
				continue
			}
			reason := fmt.Sprintf("direct %s edge around associated node %s", edge.Kind, nodeID)
			add(contextCandidateForNode(node, reason, contextPriorityForNeighborhoodNode(node), 1))
		}
	}
}

func addConstraintNodeCandidates(add func(contextCandidate), nodesByID map[string]SemanticNode, associated map[string]bool) {
	for _, nodeID := range sortedNodeIDs(nodesByID) {
		node := nodesByID[nodeID]
		if node.Kind != NodeKindConstraint || nodeExcludedFromContext(node) {
			continue
		}
		priority := ContextPriorityImportant
		reason := "workspace constraint node"
		if associated[node.ID] || node.Promoted {
			priority = ContextPriorityRequired
			reason = "active associated constraint"
		}
		add(contextCandidateForNode(node, reason, priority, 0))
	}
}

func contextCandidateForNode(node SemanticNode, reason string, priority SemanticContextPackPriority, directRank int) contextCandidate {
	nodeCopy := node
	kind := contextItemKindForNode(node.Kind)
	return contextCandidate{
		key:          "node:" + node.ID,
		node:         &nodeCopy,
		directRank:   directRank,
		promotedRank: promotedRank(node.Promoted),
		updatedAt:    node.UpdatedAt,
		item: SemanticContextPackItem{
			Kind:            kind,
			SemanticNodeID:  node.ID,
			Title:           node.Label,
			Summary:         node.Summary,
			ReasonIncluded:  reason,
			Priority:        priority,
			CreatedAt:       node.CreatedAt,
			UpdatedAt:       node.UpdatedAt,
			EstimatedTokens: estimateTokens(node.Label + "\n" + node.Summary + "\n" + reason),
		},
	}
}

func contextCandidateForSteering(directive SemanticSteeringDirective, packRefs SemanticContextSourceRefs) contextCandidate {
	priority := ContextPriorityImportant
	reason := "active steering directive"
	title := steeringTitle(directive)
	if directive.Kind == SteeringKindConstraint {
		priority = ContextPriorityRequired
		reason = "active constraint steering"
	}
	if directive.Kind == SteeringKindFocus || directive.Kind == SteeringKindValidate {
		reason = "explicit " + string(directive.Kind) + " steering"
	}
	if isContextPin(directive.Kind) {
		reason = "active " + string(directive.Kind)
	}
	if directive.Kind == SteeringKindAvoid {
		reason = "explicit avoid steering warning"
	}
	return contextCandidate{
		key:          "steering:" + directive.ID,
		directRank:   0,
		promotedRank: 1,
		updatedAt:    directive.UpdatedAt,
		item: SemanticContextPackItem{
			Kind:                ContextPackItemSteering,
			SemanticNodeID:      directive.TargetEntityID,
			SteeringDirectiveID: directive.ID,
			SourceRefs:          contextSourceRefsForSteering(directive, packRefs),
			Title:               title,
			Summary:             directive.Instruction,
			ReasonIncluded:      reason,
			Priority:            priority,
			CreatedAt:           directive.CreatedAt,
			UpdatedAt:           directive.UpdatedAt,
			EstimatedTokens:     estimateTokens(title + "\n" + directive.Instruction + "\n" + reason),
		},
	}
}

func contextCandidateForEvidence(anchor SemanticEvidenceAnchor, packRefs SemanticContextSourceRefs) contextCandidate {
	title := evidenceTitle(anchor)
	summary := anchor.Summary
	if summary == "" {
		summary = anchor.Text
	}
	return contextCandidate{
		key:          "evidence:" + anchor.ID,
		directRank:   2,
		promotedRank: 1,
		updatedAt:    anchor.CreatedAt,
		item: SemanticContextPackItem{
			Kind:             contextEvidenceItemKind(anchor),
			SemanticNodeID:   anchor.TargetEntityID,
			EvidenceAnchorID: anchor.ID,
			SourceRefs:       contextSourceRefsForEvidence(anchor, packRefs),
			Title:            title,
			Summary:          summary,
			ReasonIncluded:   "direct evidence for selected semantic node",
			Priority:         ContextPriorityRelevant,
			CreatedAt:        anchor.CreatedAt,
			UpdatedAt:        anchor.CreatedAt,
			EstimatedTokens:  estimateTokens(title + "\n" + summary),
		},
	}
}

func contextCandidateForActivity(interval SemanticActivityInterval, packRefs SemanticContextSourceRefs) contextCandidate {
	title := fmt.Sprintf("%s activity", interval.Kind)
	return contextCandidate{
		key:          "activity:" + interval.ID,
		directRank:   2,
		promotedRank: 1,
		updatedAt:    interval.UpdatedAt,
		item: SemanticContextPackItem{
			Kind:               ContextPackItemActivity,
			SemanticNodeID:     interval.TargetEntityID,
			ActivityIntervalID: interval.ID,
			SourceRefs:         contextSourceRefsForActivity(interval, packRefs),
			Title:              title,
			Summary:            interval.Summary,
			ReasonIncluded:     "recent activity tied to current source refs",
			Priority:           ContextPriorityRelevant,
			CreatedAt:          interval.StartedAt,
			UpdatedAt:          interval.UpdatedAt,
			EstimatedTokens:    estimateTokens(title + "\n" + interval.Summary),
		},
	}
}

func contextItemKindForNode(kind SemanticNodeKind) SemanticContextPackItemKind {
	switch kind {
	case NodeKindConstraint:
		return ContextPackItemConstraint
	case NodeKindDecision:
		return ContextPackItemDecision
	case NodeKindQuestion:
		return ContextPackItemQuestion
	case NodeKindFinding:
		return ContextPackItemFinding
	default:
		return ContextPackItemConcept
	}
}

func contextPriorityForNode(node SemanticNode) SemanticContextPackPriority {
	if node.Kind == NodeKindConstraint {
		return ContextPriorityRequired
	}
	if node.Promoted || node.Kind == NodeKindDecision || node.Kind == NodeKindQuestion {
		return ContextPriorityImportant
	}
	return ContextPriorityRelevant
}

func contextPriorityForNeighborhoodNode(node SemanticNode) SemanticContextPackPriority {
	if node.Kind == NodeKindConstraint || node.Promoted || node.Kind == NodeKindDecision || node.Kind == NodeKindQuestion {
		return ContextPriorityImportant
	}
	return ContextPriorityRelevant
}

func nodeExcludedFromContext(node SemanticNode) bool {
	return node.Dismissed || node.MergedIntoNodeID != ""
}

func steeringDirectiveRelevant(directive SemanticSteeringDirective, refs SemanticContextSourceRefs, associated map[string]bool) bool {
	if directive.Status != SteeringStatusActive {
		return false
	}
	if directive.Scope == SteeringScopeWorkspace || directive.Scope == SteeringScopeSession {
		return true
	}
	if steeringRefsMatch(directive, refs) {
		return true
	}
	return directive.TargetEntityID != "" && associated[directive.TargetEntityID]
}

func steeringRefsMatch(directive SemanticSteeringDirective, refs SemanticContextSourceRefs) bool {
	return refsMatch(contextSourceRefsForSteering(directive, SemanticContextSourceRefs{}), refs)
}

func refsMatch(candidate SemanticContextSourceRefs, refs SemanticContextSourceRefs) bool {
	return nonEmptyEqual(candidate.WorkflowExecutionID, refs.WorkflowExecutionID) ||
		nonEmptyEqual(candidate.WorkflowNodeID, refs.WorkflowNodeID) ||
		nonEmptyEqual(candidate.WorkflowNodeExecutionID, refs.WorkflowNodeExecutionID) ||
		nonEmptyEqual(candidate.ChatConversationID, refs.ChatConversationID) ||
		nonEmptyEqual(candidate.ChatRunID, refs.ChatRunID) ||
		nonEmptyEqual(candidate.ChatMessageID, refs.ChatMessageID) ||
		nonEmptyEqual(candidate.RunItemID, refs.RunItemID)
}

func nonEmptyEqual(left string, right string) bool {
	return left != "" && left == right
}

func isContextPin(kind SemanticSteeringKind) bool {
	return kind == SteeringKindSessionPin || kind == SteeringKindWorkspacePin
}

func avoidTargetIDs(candidates map[string]contextCandidate) map[string]bool {
	targets := map[string]bool{}
	for _, candidate := range candidates {
		if candidate.item.Kind == ContextPackItemSteering &&
			strings.Contains(candidate.item.ReasonIncluded, "avoid") &&
			candidate.item.SemanticNodeID != "" {
			targets[candidate.item.SemanticNodeID] = true
		}
	}
	return targets
}

func applyAvoidDirectives(candidates map[string]contextCandidate, avoidTargets map[string]bool) map[string]contextCandidate {
	if len(avoidTargets) == 0 {
		return candidates
	}
	filtered := map[string]contextCandidate{}
	for key, candidate := range candidates {
		if candidate.item.Kind != ContextPackItemSteering &&
			candidate.item.Priority != ContextPriorityRequired &&
			avoidTargets[candidate.item.SemanticNodeID] {
			continue
		}
		filtered[key] = candidate
	}
	return filtered
}

func compareContextCandidates(left contextCandidate, right contextCandidate) int {
	if value := priorityRank(left.item.Priority) - priorityRank(right.item.Priority); value != 0 {
		return value
	}
	if value := left.directRank - right.directRank; value != 0 {
		return value
	}
	if value := left.promotedRank - right.promotedRank; value != 0 {
		return value
	}
	if left.updatedAt != right.updatedAt {
		if left.updatedAt > right.updatedAt {
			return -1
		}
		return 1
	}
	if value := left.item.EstimatedTokens - right.item.EstimatedTokens; value != 0 {
		return value
	}
	return strings.Compare(left.key, right.key)
}

func priorityRank(priority SemanticContextPackPriority) int {
	switch priority {
	case ContextPriorityRequired:
		return 0
	case ContextPriorityImportant:
		return 1
	case ContextPriorityRelevant:
		return 2
	default:
		return 3
	}
}

func promotedRank(promoted bool) int {
	if promoted {
		return 0
	}
	return 1
}

func selectContextCandidates(candidates []contextCandidate, tokenBudget int) ([]contextCandidate, error) {
	if tokenBudget <= 0 {
		return candidates, nil
	}
	selected := []contextCandidate{}
	used := estimateTokens("Setta semantic context pack")
	for _, candidate := range candidates {
		itemCost := candidate.item.EstimatedTokens + 4
		if used+itemCost > tokenBudget {
			if candidate.item.Priority == ContextPriorityRequired {
				return nil, fmt.Errorf("required semantic context item %s exceeds token budget %d", candidate.item.Title, tokenBudget)
			}
			continue
		}
		selected = append(selected, candidate)
		used += itemCost
	}
	return selected, nil
}

func assignContextPackItemIDs(packID string, candidates []contextCandidate) {
	for index := range candidates {
		candidates[index].item.ItemID = fmt.Sprintf("%s_item_%03d", packID, index+1)
	}
}

func contextItemsFromCandidates(candidates []contextCandidate) []SemanticContextPackItem {
	items := make([]SemanticContextPackItem, 0, len(candidates))
	for _, candidate := range candidates {
		items = append(items, candidate.item)
	}
	return items
}

func renderContextPack(packID string, candidates []contextCandidate) string {
	var builder strings.Builder
	builder.WriteString("Setta semantic context pack ")
	builder.WriteString(packID)
	for _, candidate := range candidates {
		item := candidate.item
		builder.WriteString("\n- [")
		builder.WriteString(string(item.Priority))
		builder.WriteString("] ")
		builder.WriteString(contextItemDisplayKind(item.Kind))
		builder.WriteString(": ")
		builder.WriteString(item.Title)
		if item.Summary != "" {
			builder.WriteString("\n  Summary: ")
			builder.WriteString(item.Summary)
		}
		builder.WriteString("\n  Reason: ")
		builder.WriteString(item.ReasonIncluded)
		evidence := contextItemEvidenceRef(item)
		if evidence != "" {
			builder.WriteString("\n  Evidence: ")
			builder.WriteString(evidence)
		}
	}
	return builder.String()
}

func contextItemDisplayKind(kind SemanticContextPackItemKind) string {
	switch kind {
	case ContextPackItemConstraint:
		return "Constraint"
	case ContextPackItemDecision:
		return "Decision"
	case ContextPackItemQuestion:
		return "Question"
	case ContextPackItemFinding:
		return "Finding"
	case ContextPackItemSteering:
		return "Steering"
	case ContextPackItemEvidence:
		return "Evidence"
	case ContextPackItemActivity:
		return "Activity"
	case ContextPackItemFile:
		return "File"
	default:
		return "Concept"
	}
}

func contextItemEvidenceRef(item SemanticContextPackItem) string {
	if item.EvidenceAnchorID != "" {
		return item.EvidenceAnchorID
	}
	if item.ActivityIntervalID != "" {
		return item.ActivityIntervalID
	}
	if item.SteeringDirectiveID != "" {
		return item.SteeringDirectiveID
	}
	return firstNonEmpty(
		item.SourceRefs.WorkflowNodeExecutionID,
		item.SourceRefs.WorkflowExecutionID,
		item.SourceRefs.ChatRunID,
		item.SourceRefs.ChatMessageID,
		item.SourceRefs.RunItemID,
	)
}

func primaryContextTarget(candidates []contextCandidate) string {
	target := ""
	for _, candidate := range candidates {
		nodeID := candidate.item.SemanticNodeID
		if nodeID == "" {
			continue
		}
		if target == "" {
			target = nodeID
			continue
		}
		if target != nodeID {
			return ""
		}
	}
	return target
}

func estimateContextItemTokens(item SemanticContextPackItem) int {
	return estimateTokens(item.Title + "\n" + item.Summary + "\n" + item.ReasonIncluded)
}

func estimateTokens(value string) int {
	runes := utf8.RuneCountInString(value)
	if runes == 0 {
		return 0
	}
	return (runes + 3) / 4
}

func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return "sha256:" + hex.EncodeToString(sum[:])
}

func ensureContextPackEventPersisted(event SemanticEvent, packID string) error {
	if event.EventType != EventContextPackCreated {
		return fmt.Errorf("persisted event type = %s, want %s", event.EventType, EventContextPackCreated)
	}
	if event.TargetEntityID != "" {
		return nil
	}
	if event.EventID == "" || packID == "" {
		return fmt.Errorf("context pack event was not persisted")
	}
	return nil
}

func (service *Service) contextEvidenceForNodes(ctx context.Context, workspaceID string, nodeIDs []string) (map[string][]SemanticEvidenceAnchor, error) {
	result := map[string][]SemanticEvidenceAnchor{}
	for _, nodeID := range nodeIDs {
		anchors, err := service.store.loadSemanticEvidence(ctx, workspaceID, nodeID)
		if err != nil {
			return nil, err
		}
		result[nodeID] = anchors
	}
	return result, nil
}

func contextCandidateNodeIDs(candidates map[string]contextCandidate) []string {
	seen := map[string]bool{}
	for _, candidate := range candidates {
		if candidate.item.SemanticNodeID != "" {
			seen[candidate.item.SemanticNodeID] = true
		}
	}
	return sortedMapKeys(seen)
}

func sortedNodeIDs(nodes map[string]SemanticNode) []string {
	ids := make([]string, 0, len(nodes))
	for id := range nodes {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func sortedMapKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key, ok := range values {
		if ok {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	return keys
}

func contextSourceRefsForSteering(directive SemanticSteeringDirective, fallback SemanticContextSourceRefs) SemanticContextSourceRefs {
	return contextRefsWithFallback(SemanticContextSourceRefs{
		WorkflowDefinitionID:    directive.WorkflowDefinitionID,
		WorkflowExecutionID:     directive.WorkflowExecutionID,
		WorkflowNodeID:          directive.WorkflowNodeID,
		WorkflowNodeExecutionID: directive.WorkflowNodeExecutionID,
		ChatConversationID:      directive.ChatConversationID,
		ChatRunID:               directive.ChatRunID,
		ChatMessageID:           directive.ChatMessageID,
		RunItemID:               directive.RunItemID,
	}, fallback)
}

func contextSourceRefsForEvidence(anchor SemanticEvidenceAnchor, fallback SemanticContextSourceRefs) SemanticContextSourceRefs {
	return contextRefsWithFallback(SemanticContextSourceRefs{
		WorkflowDefinitionID:    anchor.WorkflowDefinitionID,
		WorkflowExecutionID:     anchor.WorkflowExecutionID,
		WorkflowNodeID:          anchor.WorkflowNodeID,
		WorkflowNodeExecutionID: anchor.WorkflowNodeExecutionID,
		ChatConversationID:      anchor.ChatConversationID,
		ChatRunID:               anchor.ChatRunID,
		ChatMessageID:           anchor.ChatMessageID,
		RunItemID:               anchor.RunItemID,
	}, fallback)
}

func contextSourceRefsForActivity(interval SemanticActivityInterval, fallback SemanticContextSourceRefs) SemanticContextSourceRefs {
	return contextRefsWithFallback(SemanticContextSourceRefs{
		WorkflowDefinitionID:    interval.WorkflowDefinitionID,
		WorkflowExecutionID:     interval.WorkflowExecutionID,
		WorkflowNodeID:          interval.WorkflowNodeID,
		WorkflowNodeExecutionID: interval.WorkflowNodeExecutionID,
		ChatConversationID:      interval.ChatConversationID,
		ChatRunID:               interval.ChatRunID,
		ChatMessageID:           interval.ChatMessageID,
		RunItemID:               interval.RunItemID,
	}, fallback)
}

func contextRefsWithFallback(refs SemanticContextSourceRefs, fallback SemanticContextSourceRefs) SemanticContextSourceRefs {
	if refs.WorkflowDefinitionID == "" {
		refs.WorkflowDefinitionID = fallback.WorkflowDefinitionID
	}
	if refs.WorkflowExecutionID == "" {
		refs.WorkflowExecutionID = fallback.WorkflowExecutionID
	}
	if refs.WorkflowNodeID == "" {
		refs.WorkflowNodeID = fallback.WorkflowNodeID
	}
	if refs.WorkflowNodeExecutionID == "" {
		refs.WorkflowNodeExecutionID = fallback.WorkflowNodeExecutionID
	}
	if refs.ChatConversationID == "" {
		refs.ChatConversationID = fallback.ChatConversationID
	}
	if refs.ChatRunID == "" {
		refs.ChatRunID = fallback.ChatRunID
	}
	if refs.ChatMessageID == "" {
		refs.ChatMessageID = fallback.ChatMessageID
	}
	if refs.RunItemID == "" {
		refs.RunItemID = fallback.RunItemID
	}
	return refs
}

func evidenceTitle(anchor SemanticEvidenceAnchor) string {
	if anchor.Path != "" {
		if anchor.RangeStart > 0 || anchor.RangeEnd > 0 {
			return fmt.Sprintf("%s:%d-%d", anchor.Path, anchor.RangeStart, anchor.RangeEnd)
		}
		return anchor.Path
	}
	if anchor.URI != "" {
		return anchor.URI
	}
	return firstNonEmpty(anchor.SourceID, anchor.ID)
}

func contextEvidenceItemKind(anchor SemanticEvidenceAnchor) SemanticContextPackItemKind {
	if anchor.SourceKind == EvidenceSourceFileRange {
		return ContextPackItemFile
	}
	return ContextPackItemEvidence
}

func steeringTitle(directive SemanticSteeringDirective) string {
	if directive.Kind == SteeringKindConstraint {
		return "Constraint steering"
	}
	if directive.Kind == SteeringKindAvoid {
		return "Avoid steering"
	}
	return string(directive.Kind) + " steering"
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
