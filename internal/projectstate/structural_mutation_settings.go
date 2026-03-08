package projectstate

type StructuralMutationSettings struct {
	SectionSizingPolicy   AutoLayoutSectionSizingPolicy
	TerminalDefaultHeight float64
}

func DefaultStructuralMutationSettings() StructuralMutationSettings {
	return StructuralMutationSettings{
		SectionSizingPolicy:   cloneAutoLayoutSectionSizingPolicy(defaultAutoLayoutSectionSizingPolicy()),
		TerminalDefaultHeight: defaultTerminalSectionHeight,
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
