package projectstate

import (
	"strings"
)

func applyTopLevelSectionLayoutSnapshot(
	p *Project,
	layoutSnapshot map[string]TopLevelSectionLayout,
) {
	if p == nil || layoutSnapshot == nil {
		return
	}
	ensureProjectTopLevelSectionsMap(p)
	activeViewModeID, activeViewMode, hasActiveViewMode := p.activeCreateTopLevelSectionLayoutSnapshotViewMode()
	for sectionID, layout := range layoutSnapshot {
		if !p.canApplyTopLevelSectionLayoutSnapshot(sectionID) {
			continue
		}
		nextLayout := mergeTopLevelSectionLayoutSnapshot(p.TopLevelSections[sectionID], layout)
		p.TopLevelSections[sectionID] = nextLayout
		if hasActiveViewMode {
			activeViewMode = applyTopLevelSectionLayoutSnapshotToViewMode(activeViewMode, sectionID, nextLayout)
		}
	}
	if hasActiveViewMode {
		p.ViewModes[activeViewModeID] = activeViewMode
	}
}

func ensureProjectTopLevelSectionsMap(p *Project) {
	if p.TopLevelSections == nil {
		p.TopLevelSections = map[string]TopLevelSectionLayout{}
	}
}

func (p Project) activeCreateTopLevelSectionLayoutSnapshotViewMode() (string, ViewMode, bool) {
	activeViewModeID := strings.TrimSpace(p.ActiveViewModeID)
	if activeViewModeID == "" {
		return "", ViewMode{}, false
	}
	viewMode, ok := p.ViewModes[activeViewModeID]
	if !ok {
		return "", ViewMode{}, false
	}
	return activeViewModeID, viewMode, true
}

func (p Project) canApplyTopLevelSectionLayoutSnapshot(sectionID string) bool {
	section, ok := p.Sections[sectionID]
	return ok && strings.TrimSpace(section.ParentSectionID) == ""
}

func mergeTopLevelSectionLayoutSnapshot(
	existing TopLevelSectionLayout,
	layout TopLevelSectionLayout,
) TopLevelSectionLayout {
	nextLayout := layout.Clone()
	if nextLayout.W == nil {
		nextLayout.W = cloneFloat64Pointer(existing.W)
	}
	if nextLayout.H == nil {
		nextLayout.H = cloneFloat64Pointer(existing.H)
	}
	return nextLayout
}

func applyTopLevelSectionLayoutSnapshotToViewMode(
	viewMode ViewMode,
	sectionID string,
	layout TopLevelSectionLayout,
) ViewMode {
	if viewMode.TopLevelSections == nil {
		viewMode.TopLevelSections = map[string]TopLevelSectionLayout{}
	}
	viewMode.TopLevelSections[sectionID] = layout.Clone()
	return viewMode
}

func (p Project) nextCreateTopLevelSectionZIndex() int {
	next := 0
	for _, layout := range p.TopLevelSections {
		if layout.ZIndex >= next {
			next = layout.ZIndex + 1
		}
	}
	return next
}

func (p *Project) pruneTopLevelCreationViewState() {
	if p == nil {
		return
	}
	validSections := projectSectionIDSet(p.Sections)
	validTopLevelSections := p.validTopLevelSectionIDs()
	p.TopLevelSectionIDs = filterCreateTopLevelSectionIDs(p.TopLevelSectionIDs, validTopLevelSections)
	deleteInvalidTopLevelSectionLayouts(p.TopLevelSections, validTopLevelSections)
	pruneCreateTopLevelSectionViewModes(p.ViewModes, validSections, validTopLevelSections)
}

func projectSectionIDSet(sections map[string]Section) map[string]struct{} {
	validSections := make(map[string]struct{}, len(sections))
	for sectionID := range sections {
		validSections[sectionID] = struct{}{}
	}
	return validSections
}

func filterCreateTopLevelSectionIDs(ids []string, validTopLevelSections map[string]struct{}) []string {
	seenTopLevels := map[string]struct{}{}
	filteredTopLevelIDs := make([]string, 0, len(ids))
	for _, sectionID := range ids {
		if _, ok := validTopLevelSections[sectionID]; !ok {
			continue
		}
		if _, duplicate := seenTopLevels[sectionID]; duplicate {
			continue
		}
		seenTopLevels[sectionID] = struct{}{}
		filteredTopLevelIDs = append(filteredTopLevelIDs, sectionID)
	}
	return filteredTopLevelIDs
}

func deleteInvalidTopLevelSectionLayouts(
	layouts map[string]TopLevelSectionLayout,
	validTopLevelSections map[string]struct{},
) {
	for sectionID := range layouts {
		if _, ok := validTopLevelSections[sectionID]; ok {
			continue
		}
		delete(layouts, sectionID)
	}
}

func pruneCreateTopLevelSectionViewModes(
	viewModes map[string]ViewMode,
	validSections map[string]struct{},
	validTopLevelSections map[string]struct{},
) {
	for viewModeID, viewMode := range viewModes {
		deleteInvalidViewModeTopLevelSections(viewMode.TopLevelSections, validTopLevelSections)
		deleteInvalidViewModeVisibility(viewMode.VisibilityBySectionID, validSections)
		viewModes[viewModeID] = viewMode
	}
}

func deleteInvalidViewModeTopLevelSections(
	topLevelSections map[string]TopLevelSectionLayout,
	validTopLevelSections map[string]struct{},
) {
	for sectionID := range topLevelSections {
		if _, ok := validTopLevelSections[sectionID]; ok {
			continue
		}
		delete(topLevelSections, sectionID)
	}
}

func deleteInvalidViewModeVisibility(
	visibility map[string]bool,
	validSections map[string]struct{},
) {
	for sectionID := range visibility {
		if _, ok := validSections[sectionID]; ok {
			continue
		}
		delete(visibility, sectionID)
	}
}

func nextAvailableCreatedTopLevelSectionName(project Project, implType string) (string, error) {
	if preferredName, ok := preferredCreatedSectionName(implType); ok && createTopLevelSectionNameAvailable(project, preferredName) {
		return preferredName, nil
	}
	return nextAvailableMemorableName(func(candidate string) (bool, error) {
		return createTopLevelSectionNameAvailable(project, candidate), nil
	})
}

func preferredCreatedSectionName(implType string) (string, bool) {
	switch strings.TrimSpace(implType) {
	case "GlobalVariables":
		return "Global Variables", true
	case "GenPythonCode":
		return "Generated Python Code", true
	case "GenPythonMetadata":
		return "Generated Python Metadata", true
	case "StateMachineStart":
		return "State Machine Start", true
	case "StateMachineGate":
		return "State Machine Gate", true
	case "StateMachineEnd":
		return "State Machine End", true
	default:
		return "", false
	}
}

func createTopLevelSectionNameAvailable(project Project, candidate string) bool {
	normalized := strings.TrimSpace(candidate)
	if normalized == "" {
		return false
	}
	normalizedSlug := sanitizeSectionSlug(normalized)
	normalizedIdentifier := sanitizeSectionPythonIdentifier(normalized)
	for sectionID := range project.SectionVariantMap {
		section, ok := project.Sections[sectionID]
		if !ok {
			continue
		}
		if strings.TrimSpace(section.ParentSectionID) != "" {
			continue
		}
		existingName := strings.TrimSpace(section.Name)
		if existingName == normalized {
			return false
		}
		if sanitizeSectionSlug(existingName) == normalizedSlug {
			return false
		}
		if sanitizeSectionPythonIdentifier(existingName) == normalizedIdentifier {
			return false
		}
	}
	return true
}
