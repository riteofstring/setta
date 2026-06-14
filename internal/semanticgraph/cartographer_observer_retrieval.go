package semanticgraph

import (
	"context"
	"strings"
)

func (service *Service) expandCartographerInputWithRetrieval(ctx context.Context, bundle *CartographerInputBundle) error {
	retrieval, err := service.retrieveSemanticContext(ctx, semanticRetrievalRequest{
		WorkspaceID: bundle.WorkspaceID,
		SourceRefs:  bundle.SourceRefs,
		Query:       cartographerRetrievalQuery(*bundle),
		ExactPaths:  cartographerRetrievalPaths(*bundle),
		ExactTexts:  cartographerRetrievalExactTexts(*bundle),
		Limit:       defaultSemanticRetrievalLimit,
	})
	if err != nil {
		return err
	}
	bundle.RetrievalResults = mergeSemanticRetrievalResults(bundle.RetrievalResults, retrieval.Results)
	bundle.ExistingNodes = mergeSemanticNodes(bundle.ExistingNodes, retrieval.Nodes)
	bundle.ExistingEdges = mergeSemanticEdges(bundle.ExistingEdges, retrieval.Edges)
	bundle.Evidence = mergeSemanticEvidenceAnchors(bundle.Evidence, retrieval.Evidence)
	bundle.Activity = mergeSemanticActivityIntervals(bundle.Activity, retrieval.Activity)
	bundle.Steering = mergeSemanticSteeringDirectives(bundle.Steering, retrieval.Steering)
	return nil
}

func cartographerRetrievalQuery(bundle CartographerInputBundle) string {
	parts := []string{
		bundle.PromptSummary,
		bundle.PromptText,
		bundle.AssistantResponseSummary,
		bundle.AssistantText,
	}
	for _, observation := range bundle.Observations {
		parts = append(parts, observation.Summary, observation.TextExcerpt, observation.Command, observation.FilePath)
	}
	for _, tool := range bundle.ToolCalls {
		parts = append(parts, tool.Title, tool.Command, tool.ResultSummary, tool.Error)
	}
	for _, change := range bundle.FileChanges {
		parts = append(parts, strings.Join(change.FilePaths, " "), change.DiffSummary)
	}
	for _, test := range bundle.TestResults {
		parts = append(parts, test.Command, test.Result, test.Error)
	}
	for _, output := range bundle.OutputSummaries {
		parts = append(parts, output.Summary)
	}
	for _, event := range bundle.NewEvents {
		parts = append(parts, event.Summary)
	}
	return boundedText(strings.Join(compactUniqueStrings(parts), "\n"), cartographerAggregateTextLimit).text
}

func cartographerRetrievalPaths(bundle CartographerInputBundle) []string {
	paths := []string{}
	for _, observation := range bundle.Observations {
		paths = append(paths, observation.FilePath)
		paths = append(paths, observation.FilePaths...)
	}
	for _, change := range bundle.FileChanges {
		paths = append(paths, change.FilePaths...)
	}
	return compactUniqueStrings(paths)
}

func cartographerRetrievalExactTexts(bundle CartographerInputBundle) []string {
	texts := []string{}
	for _, observation := range bundle.Observations {
		if observation.Command != "" {
			texts = append(texts, observation.Command)
		}
	}
	for _, tool := range bundle.ToolCalls {
		if tool.Command != "" {
			texts = append(texts, tool.Command)
		}
	}
	return compactUniqueStrings(texts)
}

func mergeSemanticRetrievalResults(existing []SemanticRetrievalResult, additions []SemanticRetrievalResult) []SemanticRetrievalResult {
	seen := map[string]int{}
	result := append([]SemanticRetrievalResult{}, existing...)
	for index := range result {
		result[index].Reasons = nonNilSlice(result[index].Reasons)
		seen[result[index].ID] = index
	}
	for _, addition := range additions {
		addition.Reasons = nonNilSlice(addition.Reasons)
		if index, ok := seen[addition.ID]; ok {
			result[index].Reasons = appendUniqueStrings(result[index].Reasons, addition.Reasons...)
			continue
		}
		seen[addition.ID] = len(result)
		result = append(result, addition)
	}
	return result
}

func mergeSemanticNodes(existing []SemanticNode, additions []SemanticNode) []SemanticNode {
	seen := map[string]bool{}
	result := append([]SemanticNode{}, existing...)
	for _, item := range result {
		seen[item.ID] = true
	}
	for _, item := range additions {
		if item.ID == "" || seen[item.ID] {
			continue
		}
		seen[item.ID] = true
		result = append(result, item)
	}
	return result
}

func mergeSemanticEdges(existing []SemanticEdge, additions []SemanticEdge) []SemanticEdge {
	seen := map[string]bool{}
	result := append([]SemanticEdge{}, existing...)
	for _, item := range result {
		seen[item.ID] = true
	}
	for _, item := range additions {
		if item.ID == "" || seen[item.ID] {
			continue
		}
		seen[item.ID] = true
		result = append(result, item)
	}
	return result
}

func mergeSemanticEvidenceAnchors(existing []SemanticEvidenceAnchor, additions []SemanticEvidenceAnchor) []SemanticEvidenceAnchor {
	seen := map[string]bool{}
	result := append([]SemanticEvidenceAnchor{}, existing...)
	for _, item := range result {
		seen[item.ID] = true
	}
	for _, item := range additions {
		if item.ID == "" || seen[item.ID] {
			continue
		}
		seen[item.ID] = true
		result = append(result, item)
	}
	return result
}

func mergeSemanticActivityIntervals(existing []SemanticActivityInterval, additions []SemanticActivityInterval) []SemanticActivityInterval {
	seen := map[string]bool{}
	result := append([]SemanticActivityInterval{}, existing...)
	for _, item := range result {
		seen[item.ID] = true
	}
	for _, item := range additions {
		if item.ID == "" || seen[item.ID] {
			continue
		}
		seen[item.ID] = true
		result = append(result, item)
	}
	return result
}

func mergeSemanticSteeringDirectives(existing []SemanticSteeringDirective, additions []SemanticSteeringDirective) []SemanticSteeringDirective {
	seen := map[string]bool{}
	result := append([]SemanticSteeringDirective{}, existing...)
	for _, item := range result {
		seen[item.ID] = true
	}
	for _, item := range additions {
		if item.ID == "" || seen[item.ID] {
			continue
		}
		seen[item.ID] = true
		result = append(result, item)
	}
	return result
}
