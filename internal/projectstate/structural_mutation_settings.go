package projectstate

type StructuralMutationSettings struct {
	SectionSizingPolicy   AutoLayoutSectionSizingPolicy
	TerminalDefaultHeight float64
	SectionDefaultsByType map[string]map[string]any
}

func DefaultStructuralMutationSettings() StructuralMutationSettings {
	return StructuralMutationSettings{
		SectionSizingPolicy:   cloneAutoLayoutSectionSizingPolicy(defaultAutoLayoutSectionSizingPolicy()),
		TerminalDefaultHeight: defaultTerminalSectionHeight,
		SectionDefaultsByType: map[string]map[string]any{},
	}
}

func normalizeStructuralMutationSettings(settings StructuralMutationSettings) StructuralMutationSettings {
	normalized := DefaultStructuralMutationSettings()
	for sectionType, dimensions := range settings.SectionSizingPolicy.ByType {
		normalized.SectionSizingPolicy.ByType[sectionType] = dimensions
	}
	if settings.TerminalDefaultHeight > 0 {
		normalized.TerminalDefaultHeight = settings.TerminalDefaultHeight
	}
	for sectionType, defaults := range settings.SectionDefaultsByType {
		normalized.SectionDefaultsByType[sectionType] = cloneProjectObject(defaults)
	}
	return normalized
}

func cloneAutoLayoutSectionSizingPolicy(policy AutoLayoutSectionSizingPolicy) AutoLayoutSectionSizingPolicy {
	cloned := AutoLayoutSectionSizingPolicy{
		ByType: make(map[string]AutoLayoutSectionMinDimensions, len(policy.ByType)),
	}
	for sectionType, dimensions := range policy.ByType {
		cloned.ByType[sectionType] = dimensions
	}
	return cloned
}
