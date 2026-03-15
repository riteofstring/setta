package projectstate

func testStructuralMutationSettings(
	overrides map[string]AutoLayoutSectionMinDimensions,
) StructuralMutationSettings {
	settings := DefaultStructuralMutationSettings()
	for sectionType, dimensions := range overrides {
		settings.SectionSizingPolicy.ByType[sectionType] = dimensions
	}
	return settings
}

func testStructuralMutationSettingsWithTerminalHeight(height float64) StructuralMutationSettings {
	settings := DefaultStructuralMutationSettings()
	settings.TerminalDefaultHeight = height
	return settings
}
