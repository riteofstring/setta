package semanticgraph

func collectCartographerEnvelopeNewNodeIDs(envelope CartographerPatchEnvelope) map[string]bool {
	ids := map[string]bool{}
	for _, patch := range envelope.Patches {
		if patch.Payload.NewNode != nil {
			ids[patch.Payload.NewNode.SemanticNodeID] = true
		}
		if patch.Payload.TargetNode != nil {
			ids[patch.Payload.TargetNode.SemanticNodeID] = true
		}
		for _, node := range patch.Payload.NewNodes {
			ids[node.SemanticNodeID] = true
		}
	}
	return ids
}

func collectCartographerEnvelopeNewNodeSignatures(envelope CartographerPatchEnvelope) map[string]int {
	signatures := map[string]int{}
	for _, patch := range envelope.Patches {
		for _, node := range cartographerPatchNewNodes(patch) {
			signature := cartographerNewNodeSignature(node)
			if signature != "" {
				signatures[signature]++
			}
		}
	}
	return signatures
}

func cartographerPatchSourceRefsMatchInput(patchRefs SemanticContextSourceRefs, bundle CartographerInputBundle) bool {
	candidates := []SemanticContextSourceRefs{bundle.SourceRefs}
	for _, observation := range bundle.Observations {
		candidates = append(candidates, cartographerObservationSourceRefs(observation))
	}
	for _, event := range bundle.NewEvents {
		candidates = append(candidates, cartographerTrajectoryEventSourceRefs(event))
	}
	for _, candidate := range bundle.EvidenceCandidates {
		candidates = append(candidates, candidate.SourceRefs)
	}
	for _, candidate := range candidates {
		if cartographerPatchSourceRefsMatchCandidate(patchRefs, candidate) {
			return true
		}
	}
	return cartographerPatchSourceRefsMatchInputAggregate(patchRefs, candidates)
}

func cartographerObservationSourceRefs(observation CartographerObservationRecord) SemanticContextSourceRefs {
	return SemanticContextSourceRefs{
		WorkflowDefinitionID:    observation.WorkflowDefinitionID,
		WorkflowExecutionID:     observation.WorkflowExecutionID,
		WorkflowNodeID:          observation.WorkflowNodeID,
		WorkflowNodeExecutionID: observation.WorkflowNodeExecutionID,
		ChatConversationID:      observation.ChatConversationID,
		ChatRunID:               observation.ChatRunID,
		ChatMessageID:           observation.ChatMessageID,
		RunItemID:               observation.RunItemID,
	}
}

func cartographerTrajectoryEventSourceRefs(event CartographerTrajectoryEvent) SemanticContextSourceRefs {
	refs := event.SourceRefs
	refs.ChatMessageID = firstNonEmpty(refs.ChatMessageID, event.ChatMessageID)
	refs.RunItemID = firstNonEmpty(refs.RunItemID, event.RunItemID)
	return refs
}

func cartographerPatchSourceRefsMatchCandidate(patchRefs SemanticContextSourceRefs, inputRefs SemanticContextSourceRefs) bool {
	patchValues := []struct {
		patch string
		input string
	}{
		{patch: patchRefs.WorkflowDefinitionID, input: inputRefs.WorkflowDefinitionID},
		{patch: patchRefs.WorkflowExecutionID, input: inputRefs.WorkflowExecutionID},
		{patch: patchRefs.WorkflowNodeID, input: inputRefs.WorkflowNodeID},
		{patch: patchRefs.WorkflowNodeExecutionID, input: inputRefs.WorkflowNodeExecutionID},
		{patch: patchRefs.ChatConversationID, input: inputRefs.ChatConversationID},
		{patch: patchRefs.ChatRunID, input: inputRefs.ChatRunID},
		{patch: patchRefs.ChatMessageID, input: inputRefs.ChatMessageID},
		{patch: patchRefs.RunItemID, input: inputRefs.RunItemID},
	}
	nonEmpty := false
	for _, item := range patchValues {
		if item.patch == "" {
			continue
		}
		nonEmpty = true
		if item.patch != item.input {
			return false
		}
	}
	return nonEmpty
}

func cartographerPatchSourceRefsMatchInputAggregate(patchRefs SemanticContextSourceRefs, inputRefs []SemanticContextSourceRefs) bool {
	patchValues := []struct {
		patch string
		input func(SemanticContextSourceRefs) string
	}{
		{patch: patchRefs.WorkflowDefinitionID, input: func(refs SemanticContextSourceRefs) string { return refs.WorkflowDefinitionID }},
		{patch: patchRefs.WorkflowExecutionID, input: func(refs SemanticContextSourceRefs) string { return refs.WorkflowExecutionID }},
		{patch: patchRefs.WorkflowNodeID, input: func(refs SemanticContextSourceRefs) string { return refs.WorkflowNodeID }},
		{patch: patchRefs.WorkflowNodeExecutionID, input: func(refs SemanticContextSourceRefs) string { return refs.WorkflowNodeExecutionID }},
		{patch: patchRefs.ChatConversationID, input: func(refs SemanticContextSourceRefs) string { return refs.ChatConversationID }},
		{patch: patchRefs.ChatRunID, input: func(refs SemanticContextSourceRefs) string { return refs.ChatRunID }},
		{patch: patchRefs.ChatMessageID, input: func(refs SemanticContextSourceRefs) string { return refs.ChatMessageID }},
		{patch: patchRefs.RunItemID, input: func(refs SemanticContextSourceRefs) string { return refs.RunItemID }},
	}
	nonEmpty := false
	for _, item := range patchValues {
		if item.patch == "" {
			continue
		}
		nonEmpty = true
		matched := false
		for _, refs := range inputRefs {
			if item.input(refs) == item.patch {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	return nonEmpty
}

func cartographerInputBundleHasSourceRef(bundle CartographerInputBundle, kind SemanticEvidenceSourceKind, sourceID string) bool {
	return cartographerInputBundleHasDirectSourceRef(bundle, kind, sourceID) ||
		cartographerInputBundleHasObservedSourceRef(bundle, kind, sourceID) ||
		cartographerInputBundleEvidenceHasSourceRef(bundle, kind, sourceID)
}

func cartographerInputBundleHasActivitySourceRef(bundle CartographerInputBundle, kind SemanticActivitySourceKind, sourceID string) bool {
	evidenceKind, ok := evidenceSourceKindForActivitySourceKind(kind)
	if !ok {
		return false
	}
	return cartographerInputBundleHasSourceRef(bundle, evidenceKind, sourceID)
}

func evidenceSourceKindForActivitySourceKind(kind SemanticActivitySourceKind) (SemanticEvidenceSourceKind, bool) {
	switch kind {
	case ActivitySourceWorkflowExecution:
		return EvidenceSourceWorkflowExecution, true
	case ActivitySourceWorkflowNode:
		return EvidenceSourceWorkflowNode, true
	case ActivitySourceChatRun:
		return EvidenceSourceChatRun, true
	case ActivitySourceChatMessage:
		return EvidenceSourceChatMessage, true
	case ActivitySourceRunItem, ActivitySourceCommand:
		return EvidenceSourceRunItem, true
	case ActivitySourceFileRange:
		return EvidenceSourceFileRange, true
	case ActivitySourceTest:
		return EvidenceSourceTest, true
	case ActivitySourceDiff:
		return EvidenceSourceDiff, true
	default:
		return "", false
	}
}

func cartographerInputBundleHasDirectSourceRef(bundle CartographerInputBundle, kind SemanticEvidenceSourceKind, sourceID string) bool {
	switch kind {
	case EvidenceSourceWorkflowExecution:
		return sourceID == bundle.SourceRefs.WorkflowExecutionID
	case EvidenceSourceWorkflowNode:
		return sourceID == bundle.SourceRefs.WorkflowNodeID || sourceID == bundle.SourceRefs.WorkflowNodeExecutionID
	case EvidenceSourceChatRun:
		return sourceID == bundle.SourceRefs.ChatRunID
	case EvidenceSourceChatMessage:
		return sourceID == bundle.SourceRefs.ChatMessageID
	default:
		return false
	}
}
