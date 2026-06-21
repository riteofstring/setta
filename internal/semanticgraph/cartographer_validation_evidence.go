package semanticgraph

import (
	"fmt"

	"setta/internal/chat"
)

func validateCartographerEvidenceCandidates(items []CartographerEvidenceCandidate, label string) error {
	for index, item := range items {
		itemLabel := fmt.Sprintf("%s evidenceCandidates[%d]", label, index)
		if err := validateStoreIDs(itemLabel+" id", item.ID, itemLabel+" sourceId", item.SourceID); err != nil {
			return err
		}
		if !isSemanticEvidenceSourceKind(item.SourceKind) {
			return fmt.Errorf("%s sourceKind is unsupported: %s", itemLabel, item.SourceKind)
		}
		if !isCartographerObservationKind(item.ObservationKind) {
			return fmt.Errorf("%s observationKind is unsupported: %s", itemLabel, item.ObservationKind)
		}
		if err := validateContextSourceRefs(item.SourceRefs, itemLabel); err != nil {
			return err
		}
		if err := validateCartographerFileOperations(item.FileOperations, itemLabel); err != nil {
			return err
		}
		if err := validateCartographerDiffStats(item.DiffStats, itemLabel+" diffStats"); err != nil {
			return err
		}
		if item.ExitCode < 0 {
			return fmt.Errorf("%s exitCode must not be negative: %d", itemLabel, item.ExitCode)
		}
	}
	return nil
}

func validateCartographerFileOperations(items []CartographerFileOperationSummary, label string) error {
	for index, item := range items {
		if err := validateCartographerFileOperation(item, fmt.Sprintf("%s fileOperations[%d]", label, index)); err != nil {
			return err
		}
	}
	return nil
}

func validateCartographerFileOperation(item CartographerFileOperationSummary, label string) error {
	return firstCartographerValidationError(
		func() error { return validateCartographerFileOperationIdentity(item, label) },
		func() error { return validateCartographerFileOperationRange(item, label) },
		func() error { return validateCartographerFileOperationStats(item, label) },
	)
}

func validateCartographerFileOperationIdentity(item CartographerFileOperationSummary, label string) error {
	if item.Path == "" {
		return fmt.Errorf("%s path is required", label)
	}
	if !isChatRunItemFileOperation(item.Operation) {
		return fmt.Errorf("%s operation is unsupported: %s", label, item.Operation)
	}
	return nil
}

func validateCartographerFileOperationRange(item CartographerFileOperationSummary, label string) error {
	if item.RangeStart < 0 || item.RangeEnd < 0 {
		return fmt.Errorf("%s range values must not be negative", label)
	}
	if item.RangeStart == 0 && item.RangeEnd != 0 {
		return fmt.Errorf("%s rangeStart is required when rangeEnd is set", label)
	}
	if item.RangeStart != 0 && item.RangeEnd == 0 {
		return fmt.Errorf("%s rangeEnd is required when rangeStart is set", label)
	}
	if item.RangeStart != 0 && item.RangeEnd < item.RangeStart {
		return fmt.Errorf("%s rangeEnd must be >= rangeStart", label)
	}
	return nil
}

func validateCartographerFileOperationStats(item CartographerFileOperationSummary, label string) error {
	if item.Additions < 0 || item.Deletions < 0 || item.ChangedFiles < 0 {
		return fmt.Errorf("%s stats must not be negative", label)
	}
	return nil
}

func validateCartographerDiffStats(stats CartographerDiffStatsSummary, label string) error {
	if stats.ChangedFiles < 0 || stats.Additions < 0 || stats.Deletions < 0 {
		return fmt.Errorf("%s values must not be negative", label)
	}
	return nil
}

func isChatRunItemFileOperation(operation chat.RunItemFileOperation) bool {
	switch operation {
	case chat.RunItemFileOperationRead,
		chat.RunItemFileOperationWrite,
		chat.RunItemFileOperationCreate,
		chat.RunItemFileOperationDelete,
		chat.RunItemFileOperationRename,
		chat.RunItemFileOperationDiff,
		chat.RunItemFileOperationUnknown:
		return true
	default:
		return false
	}
}
