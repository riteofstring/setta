package semanticgraph

import (
	"sort"
	"time"
)

const cartographerDiagnosticDuplicateEvidencePrevented = "duplicate_evidence_prevented"

type cartographerGraphUsefulnessAccumulator struct {
	score                    CartographerGraphUsefulnessScore
	nodeCounts               map[string]int
	edgeCounts               map[string]int
	sourceCounts             map[string]int
	touchedTargets           map[string]bool
	activityTargets          map[string]bool
	livePulseLatencies       []int
	committedUpdateLatencies []int
}

func cartographerGraphUsefulnessScoreForRun(run CartographerRun, records []CartographerPatchRecord) CartographerGraphUsefulnessScore {
	accumulator := newCartographerGraphUsefulnessAccumulator(run)
	for _, record := range records {
		accumulator.addPatchRecord(run, record)
	}
	return accumulator.finish()
}

func newCartographerGraphUsefulnessAccumulator(run CartographerRun) cartographerGraphUsefulnessAccumulator {
	return cartographerGraphUsefulnessAccumulator{
		nodeCounts:      map[string]int{},
		edgeCounts:      map[string]int{},
		sourceCounts:    map[string]int{},
		touchedTargets:  map[string]bool{},
		activityTargets: cartographerInputActivityTargets(run.InputBundle),
	}
}

func (accumulator *cartographerGraphUsefulnessAccumulator) addPatchRecord(run CartographerRun, record CartographerPatchRecord) {
	accumulator.score.DuplicateEvidencePrevented += cartographerDuplicateEvidenceDiagnosticCount(record)
	if !accumulator.addPatchOutcome(record) {
		return
	}
	accumulator.addAppliedPatch(run, record)
}

func (accumulator *cartographerGraphUsefulnessAccumulator) addPatchOutcome(record CartographerPatchRecord) bool {
	switch record.Status {
	case CartographerPatchRejected:
		accumulator.score.RejectedPatches++
		return false
	case CartographerPatchApplied:
		if len(record.CreatedSemanticEventIDs) == 0 {
			accumulator.score.NoopPatches++
			return false
		}
		accumulator.score.AppliedPatches++
		return true
	default:
		return false
	}
}

func (accumulator *cartographerGraphUsefulnessAccumulator) addAppliedPatch(run CartographerRun, record CartographerPatchRecord) {
	cartographerAccumulatePatchCreatedKinds(record.Patch, accumulator.nodeCounts, accumulator.edgeCounts, accumulator.sourceCounts)
	for _, targetID := range cartographerPatchTouchedTargets(record.Patch) {
		accumulator.touchedTargets[targetID] = true
	}
	if record.Patch.Operation == CartographerPatchStartActivity && record.Patch.Payload.TargetEntityID != "" {
		accumulator.activityTargets[record.Patch.Payload.TargetEntityID] = true
	}
	accumulator.addSourceLatencies(run, record)
}

func (accumulator *cartographerGraphUsefulnessAccumulator) addSourceLatencies(run CartographerRun, record CartographerPatchRecord) {
	for _, occurredAt := range cartographerPatchSourceTimes(run.InputBundle, record.Patch) {
		if latency, ok := cartographerLatencyMillis(occurredAt, run.StartedAt); ok {
			accumulator.livePulseLatencies = append(accumulator.livePulseLatencies, latency)
		}
		if latency, ok := cartographerLatencyMillis(occurredAt, record.AppliedAt); ok {
			accumulator.committedUpdateLatencies = append(accumulator.committedUpdateLatencies, latency)
		}
	}
}

func (accumulator *cartographerGraphUsefulnessAccumulator) finish() CartographerGraphUsefulnessScore {
	accumulator.score.CreatedNodesByKind = cartographerKindCountList(accumulator.nodeCounts)
	accumulator.score.CreatedEdgesByKind = cartographerKindCountList(accumulator.edgeCounts)
	accumulator.score.SourceLinksBySourceKind = cartographerKindCountList(accumulator.sourceCounts)
	accumulator.score.ActivityTargetCount = len(accumulator.touchedTargets)
	for targetID := range accumulator.touchedTargets {
		if accumulator.activityTargets[targetID] {
			accumulator.score.ActivityCoveredTargetCount++
		}
	}
	if accumulator.score.ActivityTargetCount > 0 {
		accumulator.score.ActivityCoveragePercent = accumulator.score.ActivityCoveredTargetCount * 100 / accumulator.score.ActivityTargetCount
	}
	accumulator.score.LivePulseLatencySampleCount = len(accumulator.livePulseLatencies)
	accumulator.score.CommittedUpdateLatencySampleCount = len(accumulator.committedUpdateLatencies)
	accumulator.score.MedianSourceEventToVisibleLivePulseMs = medianInt(accumulator.livePulseLatencies)
	accumulator.score.MedianSourceEventToCommittedSemanticUpdateMs = medianInt(accumulator.committedUpdateLatencies)
	normalizeCartographerGraphUsefulnessScore(&accumulator.score)
	return accumulator.score
}

func cartographerDuplicateEvidenceDiagnosticCount(record CartographerPatchRecord) int {
	count := 0
	for _, diagnostic := range record.ApplicationResult.Diagnostics {
		if diagnostic.Code == cartographerDiagnosticDuplicateEvidencePrevented {
			count++
		}
	}
	return count
}

func cartographerAccumulatePatchCreatedKinds(patch CartographerPatch, nodeCounts map[string]int, edgeCounts map[string]int, sourceCounts map[string]int) {
	switch patch.Operation {
	case CartographerPatchRecordFinding, CartographerPatchRecordDecision, CartographerPatchRecordConstraint, CartographerPatchRecordOpenQuestion:
		if patch.Payload.NewNode != nil {
			nodeCounts[string(patch.Payload.NewNode.Kind)]++
		}
		cartographerAccumulateSourceLinkKinds(sourceCounts, cartographerPatchAllEvidenceRefs(patch))
	case CartographerPatchAttachEvidence:
		cartographerAccumulateSourceLinkKinds(sourceCounts, patch.Payload.EvidenceRefs)
	case CartographerPatchCreateEdge:
		if patch.Payload.EdgeKind != nil {
			edgeCounts[string(*patch.Payload.EdgeKind)]++
		}
	case CartographerPatchSplitNode:
		for _, node := range patch.Payload.NewNodes {
			nodeCounts[string(node.Kind)]++
		}
	case CartographerPatchMergeNodes:
		if patch.Payload.TargetNode != nil {
			nodeCounts[string(patch.Payload.TargetNode.Kind)]++
		}
	case CartographerPatchMarkResolved:
		edgeCounts[string(EdgeKindResolves)]++
	}
}

func cartographerAccumulateSourceLinkKinds(sourceCounts map[string]int, refs []CartographerPatchEvidenceRef) {
	for _, ref := range refs {
		if ref.SourceKind == "" {
			continue
		}
		sourceCounts[string(ref.SourceKind)]++
	}
}

func cartographerPatchTouchedTargets(patch CartographerPatch) []string {
	targets := []string{}
	appendTarget := func(targetID string) {
		if targetID != "" {
			targets = append(targets, targetID)
		}
	}
	appendTarget(patch.Payload.SemanticNodeID)
	appendTarget(patch.Payload.TargetEntityID)
	if patch.Payload.NewNode != nil {
		appendTarget(patch.Payload.NewNode.SemanticNodeID)
	}
	appendTarget(patch.Payload.FromNodeID)
	appendTarget(patch.Payload.ToNodeID)
	appendTarget(patch.Payload.SourceNodeID)
	appendTarget(patch.Payload.ResolutionNodeID)
	for _, nodeID := range patch.Payload.SourceNodeIDs {
		appendTarget(nodeID)
	}
	for _, node := range patch.Payload.NewNodes {
		appendTarget(node.SemanticNodeID)
	}
	if patch.Payload.TargetNode != nil {
		appendTarget(patch.Payload.TargetNode.SemanticNodeID)
	}
	return uniqueSortedStrings(targets)
}

func cartographerInputActivityTargets(bundle CartographerInputBundle) map[string]bool {
	targets := map[string]bool{}
	for _, activity := range bundle.Activity {
		if activity.TargetEntityID != "" {
			targets[activity.TargetEntityID] = true
		}
	}
	return targets
}

func cartographerPatchSourceTimes(bundle CartographerInputBundle, patch CartographerPatch) []string {
	times := []string{}
	seen := map[string]bool{}
	appendTime := func(value string) {
		if value == "" || seen[value] {
			return
		}
		seen[value] = true
		times = append(times, value)
	}
	for _, event := range bundle.NewEvents {
		if cartographerPatchSourceRefsMatchCandidate(patch.SourceRefs, cartographerTrajectoryEventSourceRefs(event)) ||
			cartographerPatchEvidenceRefsMatchTrajectoryEvent(cartographerPatchAllEvidenceRefs(patch), event) {
			appendTime(event.OccurredAt)
		}
	}
	for _, observation := range bundle.Observations {
		if cartographerPatchSourceRefsMatchCandidate(patch.SourceRefs, cartographerObservationSourceRefs(observation)) ||
			cartographerPatchEvidenceRefsMatchObservation(cartographerPatchAllEvidenceRefs(patch), observation) {
			appendTime(observation.OccurredAt)
		}
	}
	sort.Strings(times)
	return times
}

func cartographerPatchEvidenceRefsMatchTrajectoryEvent(refs []CartographerPatchEvidenceRef, event CartographerTrajectoryEvent) bool {
	return cartographerPatchEvidenceRefsMatchSources(refs, cartographerEvidenceMatchSources{
		runItemID:           event.RunItemID,
		chatMessageID:       event.ChatMessageID,
		workflowNodeID:      event.SourceRefs.WorkflowNodeID,
		workflowExecutionID: event.SourceRefs.WorkflowExecutionID,
		chatRunID:           event.SourceRefs.ChatRunID,
	})
}

func cartographerPatchEvidenceRefsMatchObservation(refs []CartographerPatchEvidenceRef, observation CartographerObservationRecord) bool {
	return cartographerPatchEvidenceRefsMatchSources(refs, cartographerEvidenceMatchSources{
		runItemID:           observation.RunItemID,
		chatMessageID:       observation.ChatMessageID,
		workflowNodeID:      observation.WorkflowNodeID,
		workflowExecutionID: observation.WorkflowExecutionID,
		chatRunID:           observation.ChatRunID,
	})
}

type cartographerEvidenceMatchSources struct {
	runItemID           string
	chatMessageID       string
	workflowNodeID      string
	workflowExecutionID string
	chatRunID           string
}

func cartographerPatchEvidenceRefsMatchSources(refs []CartographerPatchEvidenceRef, sources cartographerEvidenceMatchSources) bool {
	for _, ref := range refs {
		if cartographerPatchEvidenceRefMatchesSources(ref, sources) {
			return true
		}
	}
	return false
}

func cartographerPatchEvidenceRefMatchesSources(ref CartographerPatchEvidenceRef, sources cartographerEvidenceMatchSources) bool {
	if ref.SourceID == "" {
		return false
	}
	switch ref.SourceKind {
	case EvidenceSourceRunItem, EvidenceSourceFileRange, EvidenceSourceDiff, EvidenceSourceTest:
		return ref.SourceID == sources.runItemID
	case EvidenceSourceChatMessage:
		return ref.SourceID == sources.chatMessageID
	case EvidenceSourceWorkflowNode:
		return ref.SourceID == sources.workflowNodeID
	case EvidenceSourceWorkflowExecution:
		return ref.SourceID == sources.workflowExecutionID
	case EvidenceSourceChatRun:
		return ref.SourceID == sources.chatRunID
	default:
		return false
	}
}

func cartographerLatencyMillis(start string, end string) (int, bool) {
	if start == "" || end == "" {
		return 0, false
	}
	startedAt, err := time.Parse(time.RFC3339Nano, start)
	if err != nil {
		return 0, false
	}
	endedAt, err := time.Parse(time.RFC3339Nano, end)
	if err != nil {
		return 0, false
	}
	duration := endedAt.Sub(startedAt)
	if duration < 0 {
		return 0, false
	}
	return int(duration / time.Millisecond), true
}

func medianInt(values []int) int {
	if len(values) == 0 {
		return 0
	}
	sorted := append([]int{}, values...)
	sort.Ints(sorted)
	mid := len(sorted) / 2
	if len(sorted)%2 == 1 {
		return sorted[mid]
	}
	return (sorted[mid-1] + sorted[mid]) / 2
}

func cartographerKindCountList(counts map[string]int) []CartographerGraphUsefulnessKindCount {
	kinds := make([]string, 0, len(counts))
	for kind := range counts {
		kinds = append(kinds, kind)
	}
	sort.Strings(kinds)
	result := make([]CartographerGraphUsefulnessKindCount, 0, len(kinds))
	for _, kind := range kinds {
		result = append(result, CartographerGraphUsefulnessKindCount{Kind: kind, Count: counts[kind]})
	}
	return result
}
