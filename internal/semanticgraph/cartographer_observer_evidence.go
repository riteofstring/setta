package semanticgraph

import (
	"strings"

	"setta/internal/chat"
)

func cartographerFileChangeSummary(item chat.RunItem) CartographerFileChangeSummary {
	return CartographerFileChangeSummary{
		RunItemID:      item.ID,
		Status:         string(item.Status),
		FilePaths:      append([]string{}, item.FilePaths...),
		FileOperations: cartographerFileOperationSummaries(item.FileOperations),
		PatchStatus:    item.PatchStatus,
		DiffSummary:    boundedText(item.DiffSummary, cartographerEventSummaryLimit).text,
		DiffStats:      cartographerDiffStatsSummary(item.DiffStats),
	}
}

func cartographerTestResultSummary(item chat.RunItem) CartographerTestResultSummary {
	return CartographerTestResultSummary{
		RunItemID: item.ID,
		Command:   item.Command,
		ExitCode:  item.ExitCode,
		Result:    boundedText(item.Result, cartographerEventSummaryLimit).text,
		Error:     boundedText(item.Error, cartographerEventSummaryLimit).text,
	}
}

func mergeRunItemEvidenceCandidate(bundle *CartographerInputBundle, item chat.RunItem, observed observedCartographerEvent) {
	candidate := cartographerRunItemEvidenceCandidate(item, observed.sourceRefs)
	if candidate.ID == "" || candidate.SourceKind == "" {
		return
	}
	bundle.EvidenceCandidates = upsertEvidenceCandidate(bundle.EvidenceCandidates, candidate)
}

func cartographerRunItemEvidenceCandidate(item chat.RunItem, refs SemanticContextSourceRefs) CartographerEvidenceCandidate {
	refs.RunItemID = firstNonEmpty(refs.RunItemID, item.ID)
	return CartographerEvidenceCandidate{
		ID:              item.ID,
		SourceKind:      cartographerRunItemEvidenceCandidateSourceKind(item),
		SourceID:        item.ID,
		ObservationKind: cartographerRunItemEvidenceCandidateObservationKind(item),
		SourceRefs:      refs,
		RunItemType:     string(item.Type),
		RunItemStatus:   string(item.Status),
		Title:           item.Title,
		Summary:         cartographerRunItemEvidenceCandidateSummary(item),
		FileOperations:  cartographerFileOperationSummaries(item.FileOperations),
		DiffStats:       cartographerDiffStatsSummary(item.DiffStats),
		Command:         item.Command,
		Cwd:             item.Cwd,
		ExitCode:        item.ExitCode,
		ToolName:        item.ToolName,
		ServerName:      item.ServerName,
		ResultSummary:   firstNonEmpty(item.Result, item.Progress, item.Summary),
		Error:           item.Error,
	}
}

func upsertEvidenceCandidate(items []CartographerEvidenceCandidate, candidate CartographerEvidenceCandidate) []CartographerEvidenceCandidate {
	for index := range items {
		if items[index].ID == candidate.ID {
			items[index] = candidate
			return items
		}
	}
	return append(items, candidate)
}

func cartographerRunItemEvidenceCandidateSourceKind(item chat.RunItem) SemanticEvidenceSourceKind {
	if item.Type == chat.RunItemTypeCommandExecution {
		return EvidenceSourceTest
	}
	if item.Type == chat.RunItemTypeDiff || item.Type == chat.RunItemTypeFileChange || cartographerRunItemHasDiffFacts(item) {
		return EvidenceSourceDiff
	}
	if cartographerRunItemHasFileOperation(item, chat.RunItemFileOperationRead) || len(item.FilePaths) > 0 {
		return EvidenceSourceFileRange
	}
	return EvidenceSourceRunItem
}

func cartographerRunItemEvidenceCandidateObservationKind(item chat.RunItem) CartographerObservationKind {
	kinds := cartographerRunItemObservationKinds(item)
	if len(kinds) > 0 {
		return kinds[0]
	}
	return CartographerObservationFileReadObserved
}

func cartographerRunItemEvidenceCandidateSummary(item chat.RunItem) string {
	parts := []string{}
	for _, value := range []string{
		item.Summary,
		item.Progress,
		item.Result,
		item.DiffSummary,
		item.Error,
		item.NoticeMessage,
	} {
		if value != "" {
			parts = append(parts, value)
		}
	}
	if len(parts) == 0 {
		return item.Title
	}
	return strings.Join(parts, "\n")
}

func cartographerFileOperationSummaries(operations []chat.RunItemFileOp) []CartographerFileOperationSummary {
	summaries := make([]CartographerFileOperationSummary, 0, len(operations))
	for _, operation := range operations {
		summaries = append(summaries, CartographerFileOperationSummary{
			Path:         operation.Path,
			DisplayPath:  operation.DisplayPath,
			Operation:    operation.Operation,
			RangeStart:   operation.RangeStart,
			RangeEnd:     operation.RangeEnd,
			Additions:    operation.Additions,
			Deletions:    operation.Deletions,
			ChangedFiles: operation.ChangedFiles,
			ContentHash:  operation.ContentHash,
		})
	}
	return summaries
}

func cartographerDiffStatsSummary(stats chat.RunItemDiffStats) CartographerDiffStatsSummary {
	return CartographerDiffStatsSummary{
		Summary:      boundedText(stats.Summary, cartographerEventSummaryLimit).text,
		ChangedFiles: stats.ChangedFiles,
		Additions:    stats.Additions,
		Deletions:    stats.Deletions,
		Structured:   stats.Structured,
	}
}

func compactCartographerEvidenceCandidateText(bundle CartographerInputBundle, limit int) CartographerInputBundle {
	for index := range bundle.EvidenceCandidates {
		candidate := &bundle.EvidenceCandidates[index]
		candidate.Title = boundedText(candidate.Title, limit).text
		candidate.Summary = boundedText(candidate.Summary, limit).text
		candidate.Command = boundedText(candidate.Command, limit).text
		candidate.Cwd = boundedText(candidate.Cwd, limit).text
		candidate.ResultSummary = boundedText(candidate.ResultSummary, limit).text
		candidate.Error = boundedText(candidate.Error, limit).text
		candidate.DiffStats.Summary = boundedText(candidate.DiffStats.Summary, limit).text
		for operationIndex := range candidate.FileOperations {
			candidate.FileOperations[operationIndex].Path = boundedText(candidate.FileOperations[operationIndex].Path, limit).text
			candidate.FileOperations[operationIndex].DisplayPath = boundedText(candidate.FileOperations[operationIndex].DisplayPath, limit).text
		}
	}
	for index := range bundle.FileChanges {
		bundle.FileChanges[index].DiffSummary = boundedText(bundle.FileChanges[index].DiffSummary, limit).text
		bundle.FileChanges[index].DiffStats.Summary = boundedText(bundle.FileChanges[index].DiffStats.Summary, limit).text
		for operationIndex := range bundle.FileChanges[index].FileOperations {
			bundle.FileChanges[index].FileOperations[operationIndex].Path = boundedText(bundle.FileChanges[index].FileOperations[operationIndex].Path, limit).text
			bundle.FileChanges[index].FileOperations[operationIndex].DisplayPath = boundedText(bundle.FileChanges[index].FileOperations[operationIndex].DisplayPath, limit).text
		}
	}
	return bundle
}
