package semanticgraph

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
)

const (
	defaultSemanticRetrievalLimit       = 16
	semanticRetrievalRecentActivityRows = 6

	semanticRetrievalSourceExplicitSource      = "explicit_source"
	semanticRetrievalSourceExplicitGraph       = "explicit_graph"
	semanticRetrievalSourceWorkflowAssociation = "workflow_association"
	semanticRetrievalSourceSteering            = "steering"
	semanticRetrievalSourcePin                 = "pin"
	semanticRetrievalSourceRecentActivity      = "recent_activity"
)

type semanticRetrievalRequest struct {
	WorkspaceID string
	SourceRefs  SemanticContextSourceRefs
	Query       string
	ExactPaths  []string
	ExactTexts  []string
	Limit       int
}

type semanticRetrievalSet struct {
	Results  []SemanticRetrievalResult
	Nodes    []SemanticNode
	Edges    []SemanticEdge
	Evidence []SemanticEvidenceAnchor
	Activity []SemanticActivityInterval
	Steering []SemanticSteeringDirective
}

type semanticRetrievalAccumulator struct {
	resultsByKey map[string]SemanticRetrievalResult
}

type semanticRetrievalHydrationIDs struct {
	nodeIDs     map[string]bool
	evidenceIDs map[string]bool
	activityIDs map[string]bool
	steeringIDs map[string]bool
}

func (service *Service) retrieveSemanticContext(ctx context.Context, request semanticRetrievalRequest) (semanticRetrievalSet, error) {
	if err := validateSemanticRetrievalRequest(ctx, request); err != nil {
		return semanticRetrievalSet{}, err
	}
	graph, err := service.store.ReadGraph(ctx, request.WorkspaceID)
	if err != nil {
		return semanticRetrievalSet{}, err
	}
	nodesByID := semanticNodesByID(graph.Nodes)
	edgesByNode := contextEdgesByNode(graph.Edges)
	accumulator := semanticRetrievalAccumulator{resultsByKey: map[string]SemanticRetrievalResult{}}
	associated := map[string]bool{}
	if err := service.addSemanticRetrievalExplicitSources(ctx, request, accumulator.add, associated); err != nil {
		return semanticRetrievalSet{}, err
	}
	if err := service.addSemanticRetrievalSteering(ctx, request, accumulator.add, associated); err != nil {
		return semanticRetrievalSet{}, err
	}
	addSemanticRetrievalAssociatedNodes(accumulator.add, nodesByID, associated)
	addSemanticRetrievalGraphNeighbors(accumulator.add, nodesByID, edgesByNode, associated)
	if err := addSemanticRetrievalContextPackAssociations(ctx, service.store, accumulator.add, request); err != nil {
		return semanticRetrievalSet{}, err
	}
	if err := addSemanticRetrievalOptionalActivity(ctx, service.store, accumulator.add, request); err != nil {
		return semanticRetrievalSet{}, err
	}
	if err := addSemanticRetrievalSearchResults(ctx, service.store, accumulator.add, request, nodesByID); err != nil {
		return semanticRetrievalSet{}, err
	}

	results := accumulator.sorted(request.Limit)
	return service.hydrateSemanticRetrievalSet(ctx, request.WorkspaceID, results, graph)
}

func (service *Service) addSemanticRetrievalExplicitSources(ctx context.Context, request semanticRetrievalRequest, add func(SemanticRetrievalResult), associated map[string]bool) error {
	sourceEvidence, err := service.store.loadEvidenceBySourceRefs(ctx, request.WorkspaceID, request.SourceRefs)
	if err != nil {
		return err
	}
	for _, anchor := range sourceEvidence {
		associated[anchor.TargetEntityID] = true
		add(semanticRetrievalResultForEvidence(anchor, semanticRetrievalSourceExplicitSource, "source refs matched evidence anchor", 1000))
	}
	sourceActivity, err := service.store.loadActivityBySourceRefs(ctx, request.WorkspaceID, request.SourceRefs, defaultContextActivityLimit)
	if err != nil {
		return err
	}
	for _, interval := range sourceActivity {
		associated[interval.TargetEntityID] = true
		add(semanticRetrievalResultForActivity(interval, semanticRetrievalSourceExplicitSource, "source refs matched activity interval", 980))
	}
	return nil
}

func (service *Service) addSemanticRetrievalSteering(ctx context.Context, request semanticRetrievalRequest, add func(SemanticRetrievalResult), associated map[string]bool) error {
	steering, err := service.store.loadActiveSteeringForContext(ctx, request.WorkspaceID)
	if err != nil {
		return err
	}
	for _, directive := range steering {
		if !steeringDirectiveRelevant(directive, request.SourceRefs, associated) && !isContextPin(directive.Kind) {
			continue
		}
		associated[directive.TargetEntityID] = true
		source := semanticRetrievalSourceSteering
		reason := "active steering directive"
		score := 970.0
		if isContextPin(directive.Kind) {
			source = semanticRetrievalSourcePin
			reason = "active pinned semantic node"
			score = 975
		}
		add(semanticRetrievalResultForSteering(directive, source, reason, score))
	}
	return nil
}

func addSemanticRetrievalAssociatedNodes(add func(SemanticRetrievalResult), nodesByID map[string]SemanticNode, associated map[string]bool) {
	for _, nodeID := range sortedMapKeys(associated) {
		node, ok := nodesByID[nodeID]
		if !ok || nodeExcludedFromContext(node) {
			continue
		}
		add(semanticRetrievalResultForNode(node, semanticRetrievalSourceExplicitSource, "explicit source association", 960))
	}
}

func addSemanticRetrievalOptionalActivity(ctx context.Context, store *Store, add func(SemanticRetrievalResult), request semanticRetrievalRequest) error {
	if semanticRetrievalRequestHasSearchOrSource(request) {
		return addSemanticRetrievalRecentActivity(ctx, store, add, request.WorkspaceID)
	}
	return nil
}

func semanticRetrievalRequestHasSearchOrSource(request semanticRetrievalRequest) bool {
	return strings.TrimSpace(request.Query) != "" ||
		len(compactUniqueStrings(request.ExactPaths)) > 0 ||
		len(compactUniqueStrings(request.ExactTexts)) > 0 ||
		refsNonEmpty(request.SourceRefs)
}

func refsNonEmpty(refs SemanticContextSourceRefs) bool {
	return refs.WorkflowDefinitionID != "" ||
		refs.WorkflowExecutionID != "" ||
		refs.WorkflowNodeID != "" ||
		refs.WorkflowNodeExecutionID != "" ||
		refs.ChatConversationID != "" ||
		refs.ChatRunID != "" ||
		refs.ChatMessageID != "" ||
		refs.RunItemID != ""
}

func validateSemanticRetrievalRequest(ctx context.Context, request semanticRetrievalRequest) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", request.WorkspaceID); err != nil {
		return err
	}
	if err := validateContextSourceRefs(request.SourceRefs, "semantic retrieval request"); err != nil {
		return err
	}
	if request.Limit < 0 {
		return fmt.Errorf("semantic retrieval limit must not be negative: %d", request.Limit)
	}
	return nil
}

func (accumulator semanticRetrievalAccumulator) add(result SemanticRetrievalResult) {
	if result.RecordKind == "" || result.RecordID == "" {
		return
	}
	if result.ID == "" {
		result.ID = result.Source + ":" + result.RecordKind + ":" + result.RecordID
	}
	result.Reasons = compactUniqueStrings(result.Reasons)
	key := result.RecordKind + ":" + result.RecordID
	existing, ok := accumulator.resultsByKey[key]
	if !ok {
		accumulator.resultsByKey[key] = result
		return
	}
	if compareSemanticRetrievalResults(result, existing) < 0 {
		result.Reasons = appendUniqueStrings(result.Reasons, existing.Reasons...)
		accumulator.resultsByKey[key] = result
		return
	}
	existing.Reasons = appendUniqueStrings(existing.Reasons, result.Reasons...)
	accumulator.resultsByKey[key] = existing
}

func (accumulator semanticRetrievalAccumulator) sorted(limit int) []SemanticRetrievalResult {
	if limit <= 0 {
		limit = defaultSemanticRetrievalLimit
	}
	results := make([]SemanticRetrievalResult, 0, len(accumulator.resultsByKey))
	for _, result := range accumulator.resultsByKey {
		results = append(results, result)
	}
	sort.Slice(results, func(i int, j int) bool {
		return compareSemanticRetrievalResults(results[i], results[j]) < 0
	})
	if len(results) > limit {
		results = results[:limit]
	}
	return results
}

func compareSemanticRetrievalResults(left SemanticRetrievalResult, right SemanticRetrievalResult) int {
	if left.Score != right.Score {
		if left.Score > right.Score {
			return -1
		}
		return 1
	}
	if left.UpdatedAt != right.UpdatedAt {
		if left.UpdatedAt > right.UpdatedAt {
			return -1
		}
		return 1
	}
	if value := strings.Compare(left.RecordKind, right.RecordKind); value != 0 {
		return value
	}
	return strings.Compare(left.RecordID, right.RecordID)
}

func addSemanticRetrievalGraphNeighbors(add func(SemanticRetrievalResult), nodesByID map[string]SemanticNode, edgesByNode map[string][]SemanticEdge, associated map[string]bool) {
	for _, nodeID := range sortedMapKeys(associated) {
		edges := append([]SemanticEdge{}, edgesByNode[nodeID]...)
		sort.Slice(edges, func(i int, j int) bool { return edges[i].ID < edges[j].ID })
		for _, edge := range edges {
			neighborID := edge.FromNodeID
			if neighborID == nodeID {
				neighborID = edge.ToNodeID
			}
			node, ok := nodesByID[neighborID]
			if !ok || nodeExcludedFromContext(node) {
				continue
			}
			reason := fmt.Sprintf("semantic %s edge around associated node %s", edge.Kind, nodeID)
			add(semanticRetrievalResultForNode(node, semanticRetrievalSourceExplicitGraph, reason, 930))
		}
	}
}

func addSemanticRetrievalContextPackAssociations(ctx context.Context, store *Store, add func(SemanticRetrievalResult), request semanticRetrievalRequest) error {
	if request.SourceRefs.WorkflowExecutionID == "" && request.SourceRefs.ChatRunID == "" {
		return nil
	}
	packs, err := store.ListContextPacks(ctx, SemanticContextPackFilter{
		WorkspaceID:         request.WorkspaceID,
		WorkflowExecutionID: request.SourceRefs.WorkflowExecutionID,
		ChatRunID:           request.SourceRefs.ChatRunID,
		Limit:               defaultSemanticRetrievalLimit,
	})
	if err != nil {
		return err
	}
	for _, pack := range packs.Packs {
		for _, item := range pack.Items {
			add(semanticRetrievalResultForContextPackItem(pack, item, semanticRetrievalSourceWorkflowAssociation, "prior context pack for this workflow or chat run", 900))
		}
	}
	return nil
}

func addSemanticRetrievalRecentActivity(ctx context.Context, store *Store, add func(SemanticRetrievalResult), workspaceID string) error {
	activity, err := store.loadRecentSemanticActivity(ctx, workspaceID, semanticRetrievalRecentActivityRows)
	if err != nil {
		return err
	}
	for _, interval := range activity {
		add(semanticRetrievalResultForActivity(interval, semanticRetrievalSourceRecentActivity, "recent semantic activity", 500))
	}
	return nil
}

func addSemanticRetrievalSearchResults(ctx context.Context, store *Store, add func(SemanticRetrievalResult), request semanticRetrievalRequest, nodesByID map[string]SemanticNode) error {
	results, err := store.SearchSemanticText(ctx, SemanticSearchRequest{
		WorkspaceID: request.WorkspaceID,
		Query:       request.Query,
		ExactPaths:  request.ExactPaths,
		ExactTexts:  request.ExactTexts,
		Limit:       defaultSemanticRetrievalLimit,
	})
	if err != nil {
		return err
	}
	for _, result := range results {
		if result.SemanticNodeID != "" {
			if node, ok := nodesByID[result.SemanticNodeID]; ok && nodeExcludedFromContext(node) {
				continue
			}
		}
		result.Score = semanticRetrievalSearchScore(result)
		result.Reasons = semanticRetrievalSearchReasons(result)
		add(result)
	}
	return nil
}

func semanticRetrievalSearchScore(result SemanticRetrievalResult) float64 {
	switch result.Source {
	case "exact_path":
		return 850
	case "exact_text":
		return 830
	default:
		return 700 - result.FTSScore
	}
}

func semanticRetrievalSearchReasons(result SemanticRetrievalResult) []string {
	switch result.Source {
	case "exact_path":
		return []string{"exact path match from current work"}
	case "exact_text":
		return []string{"exact text match from current work"}
	default:
		return []string{"FTS match from current prompt or observations"}
	}
}

func (service *Service) hydrateSemanticRetrievalSet(ctx context.Context, workspaceID string, results []SemanticRetrievalResult, graph SemanticGraph) (semanticRetrievalSet, error) {
	ids := semanticRetrievalHydrationIDsForResults(results)
	nodes := hydratedSemanticRetrievalNodes(graph.Nodes, ids.nodeIDs)
	evidence, err := service.hydrateSemanticRetrievalEvidence(ctx, workspaceID, ids.evidenceIDs)
	if err != nil {
		return semanticRetrievalSet{}, err
	}
	activity, err := service.hydrateSemanticRetrievalActivity(ctx, workspaceID, ids.activityIDs)
	if err != nil {
		return semanticRetrievalSet{}, err
	}
	steering, err := service.hydrateSemanticRetrievalSteering(ctx, workspaceID, ids.steeringIDs)
	if err != nil {
		return semanticRetrievalSet{}, err
	}
	return semanticRetrievalSet{
		Results:  results,
		Nodes:    nodes,
		Edges:    hydratedSemanticRetrievalEdges(graph.Edges, ids.nodeIDs),
		Evidence: evidence,
		Activity: activity,
		Steering: steering,
	}, nil
}

func semanticRetrievalHydrationIDsForResults(results []SemanticRetrievalResult) semanticRetrievalHydrationIDs {
	ids := semanticRetrievalHydrationIDs{
		nodeIDs:     map[string]bool{},
		evidenceIDs: map[string]bool{},
		activityIDs: map[string]bool{},
		steeringIDs: map[string]bool{},
	}
	for _, result := range results {
		if result.SemanticNodeID != "" {
			ids.nodeIDs[result.SemanticNodeID] = true
		}
		if result.EvidenceAnchorID != "" {
			ids.evidenceIDs[result.EvidenceAnchorID] = true
		}
		if result.ActivityIntervalID != "" {
			ids.activityIDs[result.ActivityIntervalID] = true
		}
		if result.SteeringDirectiveID != "" {
			ids.steeringIDs[result.SteeringDirectiveID] = true
		}
	}
	return ids
}

func hydratedSemanticRetrievalNodes(graphNodes []SemanticNode, nodeIDs map[string]bool) []SemanticNode {
	nodesByID := semanticNodesByID(graphNodes)
	nodes := []SemanticNode{}
	for _, nodeID := range sortedMapKeys(nodeIDs) {
		node, ok := nodesByID[nodeID]
		if !ok || nodeExcludedFromContext(node) {
			continue
		}
		nodes = append(nodes, node)
	}
	return nodes
}

func (service *Service) hydrateSemanticRetrievalEvidence(ctx context.Context, workspaceID string, evidenceIDs map[string]bool) ([]SemanticEvidenceAnchor, error) {
	evidence := []SemanticEvidenceAnchor{}
	for _, evidenceID := range sortedMapKeys(evidenceIDs) {
		anchor, ok, err := service.store.loadSemanticEvidenceAnchorByID(ctx, workspaceID, evidenceID)
		if err != nil {
			return nil, err
		}
		if ok {
			evidence = append(evidence, anchor)
		}
	}
	return evidence, nil
}

func (service *Service) hydrateSemanticRetrievalActivity(ctx context.Context, workspaceID string, activityIDs map[string]bool) ([]SemanticActivityInterval, error) {
	activity := []SemanticActivityInterval{}
	for _, activityID := range sortedMapKeys(activityIDs) {
		interval, ok, err := service.store.loadSemanticActivityIntervalByID(ctx, workspaceID, activityID)
		if err != nil {
			return nil, err
		}
		if ok {
			activity = append(activity, interval)
		}
	}
	return activity, nil
}

func (service *Service) hydrateSemanticRetrievalSteering(ctx context.Context, workspaceID string, steeringIDs map[string]bool) ([]SemanticSteeringDirective, error) {
	steering := []SemanticSteeringDirective{}
	for _, steeringID := range sortedMapKeys(steeringIDs) {
		directive, ok, err := service.store.loadSemanticSteeringDirectiveByID(ctx, workspaceID, steeringID)
		if err != nil {
			return nil, err
		}
		if ok {
			steering = append(steering, directive)
		}
	}
	return steering, nil
}

func hydratedSemanticRetrievalEdges(graphEdges []SemanticEdge, nodeIDs map[string]bool) []SemanticEdge {
	edges := []SemanticEdge{}
	for _, edge := range graphEdges {
		if nodeIDs[edge.FromNodeID] || nodeIDs[edge.ToNodeID] {
			edges = append(edges, edge)
		}
	}
	sort.Slice(edges, func(i int, j int) bool { return edges[i].ID < edges[j].ID })
	return edges
}

func semanticNodesByID(nodes []SemanticNode) map[string]SemanticNode {
	nodesByID := map[string]SemanticNode{}
	for _, node := range nodes {
		nodesByID[node.ID] = node
	}
	return nodesByID
}

func semanticRetrievalResultForNode(node SemanticNode, source string, reason string, score float64) SemanticRetrievalResult {
	return SemanticRetrievalResult{
		ID:             source + ":" + semanticSearchRecordNode + ":" + node.ID,
		Source:         source,
		RecordKind:     semanticSearchRecordNode,
		RecordID:       node.ID,
		SemanticNodeID: node.ID,
		ItemKind:       contextItemKindForNode(node.Kind),
		Title:          node.Label,
		Summary:        node.Summary,
		Reasons:        []string{reason},
		Score:          score,
		UpdatedAt:      node.UpdatedAt,
	}
}

func semanticRetrievalResultForEvidence(anchor SemanticEvidenceAnchor, source string, reason string, score float64) SemanticRetrievalResult {
	return SemanticRetrievalResult{
		ID:               source + ":" + semanticSearchRecordEvidence + ":" + anchor.ID,
		Source:           source,
		RecordKind:       semanticSearchRecordEvidence,
		RecordID:         anchor.ID,
		SemanticNodeID:   anchor.TargetEntityID,
		EvidenceAnchorID: anchor.ID,
		ItemKind:         contextEvidenceItemKind(anchor),
		SourceKind:       string(anchor.SourceKind),
		SourceID:         anchor.SourceID,
		URI:              anchor.URI,
		Path:             anchor.Path,
		SourceRefs:       contextSourceRefsForEvidence(anchor, SemanticContextSourceRefs{}),
		Title:            evidenceTitle(anchor),
		Summary:          firstNonEmpty(anchor.Summary, anchor.Text),
		Reasons:          []string{reason},
		Score:            score,
		UpdatedAt:        anchor.CreatedAt,
	}
}

func semanticRetrievalResultForActivity(interval SemanticActivityInterval, source string, reason string, score float64) SemanticRetrievalResult {
	return SemanticRetrievalResult{
		ID:                 source + ":" + semanticSearchRecordActivity + ":" + interval.ID,
		Source:             source,
		RecordKind:         semanticSearchRecordActivity,
		RecordID:           interval.ID,
		SemanticNodeID:     interval.TargetEntityID,
		ActivityIntervalID: interval.ID,
		ItemKind:           ContextPackItemActivity,
		SourceKind:         string(interval.SourceKind),
		SourceID:           interval.SourceID,
		SourceRefs:         contextSourceRefsForActivity(interval, SemanticContextSourceRefs{}),
		Title:              string(interval.Kind) + " activity",
		Summary:            interval.Summary,
		Reasons:            []string{reason},
		Score:              score,
		UpdatedAt:          interval.UpdatedAt,
	}
}

func semanticRetrievalResultForSteering(directive SemanticSteeringDirective, source string, reason string, score float64) SemanticRetrievalResult {
	return SemanticRetrievalResult{
		ID:                  source + ":steering:" + directive.ID,
		Source:              source,
		RecordKind:          "steering",
		RecordID:            directive.ID,
		SemanticNodeID:      directive.TargetEntityID,
		SteeringDirectiveID: directive.ID,
		ItemKind:            ContextPackItemSteering,
		SourceRefs:          contextSourceRefsForSteering(directive, SemanticContextSourceRefs{}),
		Title:               steeringTitle(directive),
		Summary:             directive.Instruction,
		Reasons:             []string{reason},
		Score:               score,
		UpdatedAt:           directive.UpdatedAt,
	}
}

func semanticRetrievalResultForContextPackItem(record SemanticContextPackRecord, item SemanticContextPackItem, source string, reason string, score float64) SemanticRetrievalResult {
	recordID := item.ItemID
	if recordID == "" {
		recordID = record.ID + ":" + item.Title
	}
	return SemanticRetrievalResult{
		ID:                  source + ":" + semanticSearchRecordContextPackItem + ":" + recordID,
		Source:              source,
		RecordKind:          semanticSearchRecordContextPackItem,
		RecordID:            recordID,
		SemanticNodeID:      item.SemanticNodeID,
		EvidenceAnchorID:    item.EvidenceAnchorID,
		ActivityIntervalID:  item.ActivityIntervalID,
		SteeringDirectiveID: item.SteeringDirectiveID,
		ContextPackID:       record.ID,
		ContextPackItemID:   item.ItemID,
		ItemKind:            item.Kind,
		SourceRefs:          contextRefsWithFallback(item.SourceRefs, record.SourceRefs),
		Title:               item.Title,
		Summary:             item.Summary,
		Reasons:             []string{reason},
		Score:               score,
		UpdatedAt:           firstNonEmpty(item.UpdatedAt, record.CreatedAt),
	}
}
