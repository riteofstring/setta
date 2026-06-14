package semanticgraph

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

func cartographerInputBundleHasObservedSourceRef(bundle CartographerInputBundle, kind SemanticEvidenceSourceKind, sourceID string) bool {
	switch kind {
	case EvidenceSourceRunItem:
		return cartographerTrajectoryEventsHaveRunItem(bundle.NewEvents, sourceID) ||
			cartographerToolCallsHaveRunItem(bundle.ToolCalls, sourceID)
	case EvidenceSourceFileRange:
		return cartographerFileChangesHaveRunItem(bundle.FileChanges, sourceID)
	case EvidenceSourceTest:
		return cartographerTestResultsHaveRunItem(bundle.TestResults, sourceID)
	case EvidenceSourceDiff:
		return cartographerFileChangesHaveRunItem(bundle.FileChanges, sourceID)
	case EvidenceSourcePrompt, EvidenceSourceLog, EvidenceSourceDocument:
		return stringSliceContains(bundle.ObservedEventRefs, sourceID)
	default:
		return false
	}
}

func cartographerInputBundleEvidenceHasSourceRef(bundle CartographerInputBundle, kind SemanticEvidenceSourceKind, sourceID string) bool {
	for _, evidence := range bundle.Evidence {
		if evidence.SourceKind == kind && evidence.SourceID == sourceID {
			return true
		}
	}
	return false
}

func cartographerTrajectoryEventsHaveRunItem(events []CartographerTrajectoryEvent, runItemID string) bool {
	for _, event := range events {
		if event.RunItemID == runItemID {
			return true
		}
	}
	return false
}

func cartographerToolCallsHaveRunItem(items []CartographerToolCallSummary, runItemID string) bool {
	for _, item := range items {
		if item.RunItemID == runItemID {
			return true
		}
	}
	return false
}

func cartographerFileChangesHaveRunItem(items []CartographerFileChangeSummary, runItemID string) bool {
	for _, item := range items {
		if item.RunItemID == runItemID {
			return true
		}
	}
	return false
}

func cartographerTestResultsHaveRunItem(items []CartographerTestResultSummary, runItemID string) bool {
	for _, item := range items {
		if item.RunItemID == runItemID {
			return true
		}
	}
	return false
}

func stringSliceContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func eventIDsForPatchIndexes(events []SemanticEvent, indexes map[string][]int) map[string][]string {
	result := map[string][]string{}
	for patchID, eventIndexes := range indexes {
		for _, index := range eventIndexes {
			result[patchID] = append(result[patchID], events[index].EventID)
		}
	}
	return result
}

func semanticEventIDs(events []SemanticEvent) []string {
	ids := make([]string, 0, len(events))
	for _, event := range events {
		ids = append(ids, event.EventID)
	}
	return ids
}

func cartographerInputItemCounts(bundle CartographerInputBundle) CartographerInputItemCounts {
	return CartographerInputItemCounts{
		NewEvents:           len(bundle.NewEvents),
		ToolCalls:           len(bundle.ToolCalls),
		FileChanges:         len(bundle.FileChanges),
		TestResults:         len(bundle.TestResults),
		OutputSummaries:     len(bundle.OutputSummaries),
		ExistingNodes:       len(bundle.ExistingNodes),
		ExistingEdges:       len(bundle.ExistingEdges),
		Evidence:            len(bundle.Evidence),
		Activity:            len(bundle.Activity),
		Steering:            len(bundle.Steering),
		ContextPacks:        len(bundle.ContextPacks),
		TrajectorySummaries: len(bundle.TrajectorySummaries),
		ObservedEventRefs:   len(bundle.ObservedEventRefs),
	}
}

func hashJSONValue(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return hashBytes(data)
}

func hashBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}
