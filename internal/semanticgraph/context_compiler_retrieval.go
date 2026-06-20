package semanticgraph

import (
	"context"
	"strings"
)

func (service *Service) addRetrievalContextCandidates(ctx context.Context, input contextCompilerInput, state contextCandidateState, addCandidate func(contextCandidate)) error {
	retrieval, err := service.retrieveSemanticContext(ctx, semanticRetrievalRequest{
		WorkspaceID: input.request.WorkspaceID,
		SourceRefs:  input.sourceRefs,
		Query:       input.request.AuthoredPrompt,
		Limit:       defaultSemanticRetrievalLimit,
	})
	if err != nil {
		return err
	}
	evidenceByID := semanticRetrievalEvidenceByID(retrieval.Evidence)
	activityByID := semanticRetrievalActivityByID(retrieval.Activity)
	steeringByID := semanticRetrievalSteeringByID(retrieval.Steering)
	for _, result := range retrieval.Results {
		candidate, ok := contextCandidateForRetrievalResult(result, state.nodesByID, evidenceByID, activityByID, steeringByID, input.sourceRefs)
		if ok {
			addCandidate(candidate)
		}
	}
	return nil
}

func contextCandidateForRetrievalResult(result SemanticRetrievalResult, nodesByID map[string]SemanticNode, evidenceByID map[string]SemanticEvidenceAnchor, activityByID map[string]SemanticActivityInterval, steeringByID map[string]SemanticSteeringDirective, packRefs SemanticContextSourceRefs) (contextCandidate, bool) {
	reason := retrievalReasonText(result)
	switch result.RecordKind {
	case semanticSearchRecordNode:
		return retrievalNodeCandidate(result, reason, nodesByID)
	case semanticSearchRecordEvidence:
		return retrievalEvidenceCandidate(result, reason, evidenceByID, packRefs)
	case semanticSearchRecordActivity:
		return retrievalActivityCandidate(result, reason, activityByID, packRefs)
	case semanticSearchRecordContextPackItem:
		return contextCandidateForRetrievalContextPackItem(result, reason), true
	case "steering":
		return retrievalSteeringCandidate(result, reason, steeringByID, packRefs)
	default:
		return contextCandidate{}, false
	}
}

func retrievalNodeCandidate(result SemanticRetrievalResult, reason string, nodesByID map[string]SemanticNode) (contextCandidate, bool) {
	node, ok := nodesByID[result.SemanticNodeID]
	if !ok || nodeExcludedFromContext(node) {
		return contextCandidate{}, false
	}
	candidate := contextCandidateForNode(node, reason, contextPriorityForRetrievalNode(node), 3)
	candidate.key = "node:" + node.ID
	return candidate, true
}

func retrievalEvidenceCandidate(result SemanticRetrievalResult, reason string, evidenceByID map[string]SemanticEvidenceAnchor, packRefs SemanticContextSourceRefs) (contextCandidate, bool) {
	anchor, ok := evidenceByID[result.EvidenceAnchorID]
	if !ok {
		return contextCandidate{}, false
	}
	candidate := contextCandidateForEvidence(anchor, packRefs)
	candidate.item.ReasonIncluded = reason
	candidate.directRank = 4
	return candidate, true
}

func retrievalActivityCandidate(result SemanticRetrievalResult, reason string, activityByID map[string]SemanticActivityInterval, packRefs SemanticContextSourceRefs) (contextCandidate, bool) {
	interval, ok := activityByID[result.ActivityIntervalID]
	if !ok {
		return contextCandidate{}, false
	}
	candidate := contextCandidateForActivity(interval, packRefs)
	candidate.item.ReasonIncluded = reason
	candidate.directRank = 4
	return candidate, true
}

func retrievalSteeringCandidate(result SemanticRetrievalResult, reason string, steeringByID map[string]SemanticSteeringDirective, packRefs SemanticContextSourceRefs) (contextCandidate, bool) {
	directive, ok := steeringByID[result.SteeringDirectiveID]
	if !ok {
		return contextCandidate{}, false
	}
	candidate := contextCandidateForSteering(directive, packRefs)
	candidate.item.ReasonIncluded = reason
	return candidate, true
}

func contextPriorityForRetrievalNode(node SemanticNode) SemanticContextPackPriority {
	if node.Kind == NodeKindConstraint || node.Promoted || node.Kind == NodeKindDecision {
		return ContextPriorityImportant
	}
	return ContextPriorityRelevant
}

func contextCandidateForRetrievalContextPackItem(result SemanticRetrievalResult, reason string) contextCandidate {
	priority := ContextPriorityRelevant
	if result.ItemKind == ContextPackItemConstraint || result.ItemKind == ContextPackItemDecision {
		priority = ContextPriorityImportant
	}
	updatedAt := result.UpdatedAt
	return contextCandidate{
		key:          "retrieval:" + result.RecordKind + ":" + result.RecordID,
		directRank:   4,
		promotedRank: 1,
		updatedAt:    updatedAt,
		item: SemanticContextPackItem{
			Kind:                firstNonEmptyContextItemKind(result.ItemKind, ContextPackItemConcept),
			SemanticNodeID:      result.SemanticNodeID,
			EvidenceAnchorID:    result.EvidenceAnchorID,
			ActivityIntervalID:  result.ActivityIntervalID,
			SteeringDirectiveID: result.SteeringDirectiveID,
			SourceRefs:          result.SourceRefs,
			Title:               result.Title,
			Summary:             result.Summary,
			ReasonIncluded:      reason,
			Priority:            priority,
			CreatedAt:           updatedAt,
			UpdatedAt:           updatedAt,
			EstimatedTokens:     estimateTokens(result.Title + "\n" + result.Summary + "\n" + reason),
		},
	}
}

func retrievalReasonText(result SemanticRetrievalResult) string {
	if len(result.Reasons) == 0 {
		return "retrieval result: " + result.Source
	}
	return "retrieval result: " + strings.Join(result.Reasons, "; ")
}

func firstNonEmptyContextItemKind(value SemanticContextPackItemKind, fallback SemanticContextPackItemKind) SemanticContextPackItemKind {
	if value != "" {
		return value
	}
	return fallback
}

func semanticRetrievalEvidenceByID(evidence []SemanticEvidenceAnchor) map[string]SemanticEvidenceAnchor {
	result := map[string]SemanticEvidenceAnchor{}
	for _, anchor := range evidence {
		result[anchor.ID] = anchor
	}
	return result
}

func semanticRetrievalActivityByID(activity []SemanticActivityInterval) map[string]SemanticActivityInterval {
	result := map[string]SemanticActivityInterval{}
	for _, interval := range activity {
		result[interval.ID] = interval
	}
	return result
}

func semanticRetrievalSteeringByID(steering []SemanticSteeringDirective) map[string]SemanticSteeringDirective {
	result := map[string]SemanticSteeringDirective{}
	for _, directive := range steering {
		result[directive.ID] = directive
	}
	return result
}
