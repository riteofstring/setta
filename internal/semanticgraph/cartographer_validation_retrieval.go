package semanticgraph

import "fmt"

func validateSemanticRetrievalResults(results []SemanticRetrievalResult, label string) error {
	for index, result := range results {
		itemLabel := fmt.Sprintf("%s[%d]", label, index)
		if err := validateSemanticRetrievalResult(result, itemLabel); err != nil {
			return err
		}
	}
	return nil
}

func validateSemanticRetrievalResult(result SemanticRetrievalResult, label string) error {
	if err := requireNonEmpty(result.ID, label+" id"); err != nil {
		return err
	}
	if err := requireNonEmpty(result.Source, label+" source"); err != nil {
		return err
	}
	if err := requireNonEmpty(result.RecordKind, label+" recordKind"); err != nil {
		return err
	}
	if err := requireNonEmpty(result.RecordID, label+" recordId"); err != nil {
		return err
	}
	if result.ItemKind == "" {
		return fmt.Errorf("%s itemKind is required", label)
	}
	if !isSemanticContextPackItemKind(result.ItemKind) {
		return fmt.Errorf("%s itemKind is unsupported: %s", label, result.ItemKind)
	}
	if err := validateContextSourceRefs(result.SourceRefs, label); err != nil {
		return err
	}
	if result.UpdatedAt != "" {
		if err := validateTimestamp(label+" updatedAt", result.UpdatedAt); err != nil {
			return err
		}
	}
	return validateOptionalStoreIDs([]optionalStoreID{
		{label: label + " semantic node id", value: result.SemanticNodeID},
		{label: label + " evidence anchor id", value: result.EvidenceAnchorID},
		{label: label + " activity interval id", value: result.ActivityIntervalID},
		{label: label + " steering directive id", value: result.SteeringDirectiveID},
		{label: label + " context pack id", value: result.ContextPackID},
		{label: label + " context pack item id", value: result.ContextPackItemID},
		{label: label + " source id", value: result.SourceID},
	})
}
