package semanticgraph

import (
	"encoding/json"
	"unicode/utf8"
)

func finalizeSemanticRuntimeSnapshot(snapshot *SemanticRuntimeSnapshot) {
	truncated := trimSemanticRuntimeSnapshot(snapshot)
	setSemanticRuntimePayloadBudget(&snapshot.PayloadBudget, snapshot, semanticRuntimeMaxSnapshotPayloadBytes, truncated)
}

func finalizeSemanticRuntimeDelta(delta *SemanticRuntimeDelta) {
	truncated := trimSemanticRuntimeDelta(delta)
	setSemanticRuntimePayloadBudget(&delta.PayloadBudget, delta, semanticRuntimeMaxDeltaPayloadBytes, truncated)
}

func setSemanticRuntimePayloadBudget(budget *SemanticRuntimePayloadBudget, value any, maxBytes int, truncatedStrings int) {
	budget.MaxByteSize = maxBytes
	budget.TruncatedStringCount = truncatedStrings
	for index := 0; index < 4; index++ {
		size := semanticRuntimePayloadByteSize(value)
		if size == budget.ByteSize {
			return
		}
		budget.ByteSize = size
	}
}

func semanticRuntimePayloadByteSize(value any) int {
	payload, err := json.Marshal(value)
	if err != nil {
		return 0
	}
	return len(payload)
}

func trimSemanticRuntimeSnapshot(snapshot *SemanticRuntimeSnapshot) int {
	truncated := 0
	for index := range snapshot.Cartographer.ActiveRuns {
		truncated += trimSemanticRuntimeCartographerRun(&snapshot.Cartographer.ActiveRuns[index])
	}
	for index := range snapshot.Cartographer.ActiveWindows {
		truncated += trimSemanticRuntimeCartographerWindow(&snapshot.Cartographer.ActiveWindows[index])
	}
	for index := range snapshot.Patches {
		truncated += trimSemanticRuntimePatchPreview(&snapshot.Patches[index])
	}
	for index := range snapshot.SemanticActivity.RecentSemanticChanges {
		truncated += trimSemanticRuntimeSemanticChange(&snapshot.SemanticActivity.RecentSemanticChanges[index])
	}
	for index := range snapshot.DisplayHints.AggregateSources {
		truncated += trimSemanticRuntimeSourceAggregate(&snapshot.DisplayHints.AggregateSources[index])
	}
	return truncated
}

func trimSemanticRuntimeDelta(delta *SemanticRuntimeDelta) int {
	truncated := 0
	for index := range delta.CartographerRunUpdates {
		truncated += trimSemanticRuntimeCartographerRun(&delta.CartographerRunUpdates[index])
	}
	for index := range delta.CartographerWindowUpdates {
		truncated += trimSemanticRuntimeCartographerWindow(&delta.CartographerWindowUpdates[index])
	}
	for index := range delta.PatchPreviewUpdates {
		truncated += trimSemanticRuntimePatchPreview(&delta.PatchPreviewUpdates[index])
	}
	for index := range delta.SemanticChangeUpdates {
		truncated += trimSemanticRuntimeSemanticChange(&delta.SemanticChangeUpdates[index])
	}
	for index := range delta.AggregateSourceUpdates {
		truncated += trimSemanticRuntimeSourceAggregate(&delta.AggregateSourceUpdates[index])
	}
	return truncated
}

func trimSemanticRuntimeCartographerRun(run *SemanticRuntimeCartographerRun) int {
	truncated := truncateStringBytes(&run.PublicSummary, semanticRuntimeMaxPublicSummaryBytes)
	truncated += trimSemanticRuntimeModelAudit(run.ModelAudit)
	return truncated
}

func trimSemanticRuntimeCartographerWindow(window *SemanticRuntimeCartographerWindow) int {
	return truncateStringBytes(&window.PublicSummary, semanticRuntimeMaxPublicSummaryBytes)
}

func trimSemanticRuntimePatchPreview(preview *SemanticRuntimePatchPreview) int {
	truncated := truncateStringBytes(&preview.PublicSummary, semanticRuntimeMaxPublicSummaryBytes)
	for index := range preview.NewNodes {
		truncated += truncateStringBytes(&preview.NewNodes[index].Label, semanticRuntimeMaxPreviewNodeTextBytes)
		truncated += truncateStringBytes(&preview.NewNodes[index].Summary, semanticRuntimeMaxPreviewNodeTextBytes)
	}
	return truncated
}

func trimSemanticRuntimeSemanticChange(change *SemanticRuntimeSemanticChange) int {
	return truncateStringBytes(&change.PublicSummary, semanticRuntimeMaxPublicSummaryBytes)
}

func trimSemanticRuntimeSourceAggregate(aggregate *SemanticRuntimeSourceAggregate) int {
	return trimSemanticRuntimeModelAudit(aggregate.ModelAudit)
}

func trimSemanticRuntimeModelAudit(audit *SemanticRuntimeModelAudit) int {
	if audit == nil {
		return 0
	}
	truncated := 0
	truncated += truncateStringBytes(&audit.RequestedModel, semanticRuntimeMaxModelAuditTextBytes)
	truncated += truncateStringBytes(&audit.EffectiveModel, semanticRuntimeMaxModelAuditTextBytes)
	truncated += truncateStringBytes(&audit.ReportedModel, semanticRuntimeMaxModelAuditTextBytes)
	truncated += truncateStringBytes(&audit.EffectiveReasoningEffort, semanticRuntimeMaxModelAuditTextBytes)
	truncated += truncateStringBytes(&audit.ReportedReasoningEffort, semanticRuntimeMaxModelAuditTextBytes)
	truncated += truncateStringBytes(&audit.Error, semanticRuntimeMaxModelAuditErrorBytes)
	return truncated
}

func truncateStringBytes(value *string, maxBytes int) int {
	truncated, ok := truncateUTF8StringBytes(*value, maxBytes)
	if !ok {
		return 0
	}
	*value = truncated
	return 1
}

func truncateUTF8StringBytes(value string, maxBytes int) (string, bool) {
	if maxBytes < 0 || len([]byte(value)) <= maxBytes {
		return value, false
	}
	if maxBytes == 0 {
		return "", value != ""
	}
	byteCount := 0
	for index, r := range value {
		runeBytes := utf8.RuneLen(r)
		if runeBytes < 0 {
			runeBytes = len(string(r))
		}
		if byteCount+runeBytes > maxBytes {
			return value[:index], true
		}
		byteCount += runeBytes
	}
	return value, false
}
