package semanticgraph

import (
	"crypto/sha256"
	"encoding/hex"
)

func cartographerInputBundleHasObservedSourceRef(bundle CartographerInputBundle, kind SemanticEvidenceSourceKind, sourceID string) bool {
	check, ok := cartographerObservedSourceRefChecks[kind]
	if !ok {
		return false
	}
	return check(bundle, sourceID)
}

type cartographerObservedSourceRefCheck func(CartographerInputBundle, string) bool

var cartographerObservedSourceRefChecks = map[SemanticEvidenceSourceKind]cartographerObservedSourceRefCheck{
	EvidenceSourceRunItem:     cartographerInputBundleHasRunItemObservationSourceRef,
	EvidenceSourceChatMessage: cartographerInputBundleHasChatMessageObservationSourceRef,
	EvidenceSourceFileRange:   cartographerInputBundleHasFileOrDiffObservationSourceRef,
	EvidenceSourceDiff:        cartographerInputBundleHasFileOrDiffObservationSourceRef,
	EvidenceSourceTest:        cartographerInputBundleHasTestObservationSourceRef,
	EvidenceSourcePrompt:      cartographerInputBundleHasObservedEventRef,
	EvidenceSourceLog:         cartographerInputBundleHasObservedEventRef,
	EvidenceSourceDocument:    cartographerInputBundleHasObservedEventRef,
}

func cartographerInputBundleHasRunItemObservationSourceRef(bundle CartographerInputBundle, sourceID string) bool {
	return cartographerTrajectoryEventsHaveRunItem(bundle.NewEvents, sourceID) ||
		cartographerObservationsHaveRunItem(bundle.Observations, sourceID) ||
		cartographerToolCallsHaveRunItem(bundle.ToolCalls, sourceID) ||
		cartographerEvidenceCandidatesHaveSourceRef(bundle.EvidenceCandidates, EvidenceSourceRunItem, sourceID)
}

func cartographerInputBundleHasChatMessageObservationSourceRef(bundle CartographerInputBundle, sourceID string) bool {
	return cartographerTrajectoryEventsHaveChatMessage(bundle.NewEvents, sourceID) ||
		cartographerObservationsHaveChatMessage(bundle.Observations, sourceID)
}

func cartographerInputBundleHasFileOrDiffObservationSourceRef(bundle CartographerInputBundle, sourceID string) bool {
	return cartographerObservationsHaveRunItem(bundle.Observations, sourceID) ||
		cartographerFileChangesHaveRunItem(bundle.FileChanges, sourceID) ||
		cartographerEvidenceCandidatesHaveSourceRef(bundle.EvidenceCandidates, EvidenceSourceFileRange, sourceID) ||
		cartographerEvidenceCandidatesHaveSourceRef(bundle.EvidenceCandidates, EvidenceSourceDiff, sourceID)
}

func cartographerInputBundleHasTestObservationSourceRef(bundle CartographerInputBundle, sourceID string) bool {
	return cartographerObservationsHaveRunItem(bundle.Observations, sourceID) ||
		cartographerTestResultsHaveRunItem(bundle.TestResults, sourceID) ||
		cartographerEvidenceCandidatesHaveSourceRef(bundle.EvidenceCandidates, EvidenceSourceTest, sourceID)
}

func cartographerInputBundleHasObservedEventRef(bundle CartographerInputBundle, sourceID string) bool {
	return stringSliceContains(bundle.ObservedEventRefs, sourceID)
}

func cartographerObservationsHaveRunItem(observations []CartographerObservationRecord, runItemID string) bool {
	for _, observation := range observations {
		if observation.RunItemID == runItemID {
			return true
		}
	}
	return false
}

func cartographerObservationsHaveChatMessage(observations []CartographerObservationRecord, chatMessageID string) bool {
	for _, observation := range observations {
		if observation.ChatMessageID == chatMessageID {
			return true
		}
	}
	return false
}

func cartographerInputBundleEvidenceHasSourceRef(bundle CartographerInputBundle, kind SemanticEvidenceSourceKind, sourceID string) bool {
	for _, evidence := range bundle.Evidence {
		if evidence.SourceKind == kind && evidence.SourceID == sourceID {
			return true
		}
	}
	return false
}

func cartographerEvidenceCandidatesHaveSourceRef(items []CartographerEvidenceCandidate, kind SemanticEvidenceSourceKind, sourceID string) bool {
	for _, item := range items {
		if item.SourceKind == kind && item.SourceID == sourceID {
			return true
		}
		if kind == EvidenceSourceRunItem && item.SourceID == sourceID {
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

func cartographerTrajectoryEventsHaveChatMessage(events []CartographerTrajectoryEvent, chatMessageID string) bool {
	for _, event := range events {
		if event.ChatMessageID == chatMessageID {
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
		Observations:        len(bundle.Observations),
		ToolCalls:           len(bundle.ToolCalls),
		FileChanges:         len(bundle.FileChanges),
		TestResults:         len(bundle.TestResults),
		OutputSummaries:     len(bundle.OutputSummaries),
		EvidenceCandidates:  len(bundle.EvidenceCandidates),
		ExistingNodes:       len(bundle.ExistingNodes),
		ExistingEdges:       len(bundle.ExistingEdges),
		Evidence:            len(bundle.Evidence),
		Activity:            len(bundle.Activity),
		Steering:            len(bundle.Steering),
		ContextPacks:        len(bundle.ContextPacks),
		RetrievalResults:    len(bundle.RetrievalResults),
		TrajectorySummaries: len(bundle.TrajectorySummaries),
		ObservedEventRefs:   len(bundle.ObservedEventRefs),
	}
}

func hashBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}
