package projectstate

import (
	"fmt"
)

func (p *Project) validateNormalizedRelationships() error {
	if p == nil {
		return nil
	}

	if err := p.normalizeViewModesOnLoad(); err != nil {
		return fmt.Errorf("normalize view modes: %w", err)
	}
	p.ActiveIDs = pruneStaleSectionIDs(p.ActiveIDs, p.Sections)
	if err := p.validateTopLevelLayout(); err != nil {
		return err
	}
	if err := p.validateActiveSectionVariants(); err != nil {
		return err
	}
	if err := p.validateSectionVariantMemberships(); err != nil {
		return err
	}
	if err := p.validateCodeObjectVariantMemberships(); err != nil {
		return err
	}
	return p.validateEntryCodeBlock()
}

func (p *Project) validateTopLevelLayout() error {
	if p == nil {
		return nil
	}

	if err := p.validateTopLevelSectionIDs(); err != nil {
		return err
	}
	if err := p.validateStoredTopLevelSections(); err != nil {
		return err
	}
	if err := p.validateViewModeTopLevelSections(); err != nil {
		return err
	}
	return p.validateActiveViewMode()
}

func (p *Project) validateTopLevelSectionIDs() error {
	topLevelSeen := make(map[string]struct{}, len(p.TopLevelSectionIDs))
	for _, sectionID := range p.TopLevelSectionIDs {
		if err := p.validateTopLevelSectionExists(sectionID); err != nil {
			return err
		}
		if _, ok := topLevelSeen[sectionID]; ok {
			return fmt.Errorf("%w: %q", ErrDuplicateTopLevelSection, sectionID)
		}
		topLevelSeen[sectionID] = struct{}{}
	}
	return nil
}

func (p *Project) validateStoredTopLevelSections() error {
	for sectionID := range p.TopLevelSections {
		if err := p.validateTopLevelSectionExists(sectionID); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) validateViewModeTopLevelSections() error {
	for viewModeID, viewMode := range p.ViewModes {
		for sectionID := range viewMode.TopLevelSections {
			if _, ok := p.Sections[sectionID]; ok {
				continue
			}
			return fmt.Errorf("%w: viewMode=%q section=%q", ErrTopLevelSectionNotFound, viewModeID, sectionID)
		}
	}
	return nil
}

func (p *Project) validateActiveViewMode() error {
	if p.ActiveViewModeID == "" {
		return nil
	}
	if _, ok := p.ViewModes[p.ActiveViewModeID]; ok {
		return nil
	}
	return fmt.Errorf("%w: %q", ErrViewModeNotFound, p.ActiveViewModeID)
}

func (p *Project) validateTopLevelSectionExists(sectionID string) error {
	if _, ok := p.Sections[sectionID]; ok {
		return nil
	}
	return fmt.Errorf("%w: %q", ErrTopLevelSectionNotFound, sectionID)
}

func (p *Project) validateActiveSectionVariants() error {
	if p == nil {
		return nil
	}

	for sectionID, activeVariantID := range p.SectionVariantMap {
		section, ok := p.Sections[sectionID]
		if !ok {
			return fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
		}
		if _, ok := p.SectionVariants[activeVariantID]; !ok {
			return fmt.Errorf("%w: section=%q variant=%q", ErrSectionActiveVariantNotFound, sectionID, activeVariantID)
		}
		if !containsString(section.VariantIDs, activeVariantID) {
			return fmt.Errorf("%w: section=%q variant=%q", ErrSectionVariantMembership, sectionID, activeVariantID)
		}
	}
	return nil
}

func (p *Project) validateSectionVariantMemberships() error {
	if p == nil {
		return nil
	}

	for sectionID, section := range p.Sections {
		for _, variantID := range section.VariantIDs {
			if _, ok := p.SectionVariants[variantID]; !ok {
				return fmt.Errorf("%w: section=%q variant=%q", ErrSectionVariantNotFound, sectionID, variantID)
			}
		}
		if section.DefaultVariantID != "" && !containsString(section.VariantIDs, section.DefaultVariantID) {
			return fmt.Errorf("%w: section=%q variant=%q", ErrSectionVariantMembership, sectionID, section.DefaultVariantID)
		}
	}
	return nil
}

func (p *Project) validateCodeObjectVariantMemberships() error {
	if p == nil {
		return nil
	}

	for codeObjID, codeObj := range p.CodeObjs {
		for _, variantID := range codeObj.VariantIDs {
			if _, ok := p.CodeObjVariants[variantID]; !ok {
				return fmt.Errorf("%w: codeObj=%q variant=%q", ErrCodeObjVariantNotFound, codeObjID, variantID)
			}
		}
		if codeObj.DefaultVariantID != "" && !containsString(codeObj.VariantIDs, codeObj.DefaultVariantID) {
			return fmt.Errorf("%w: codeObj=%q variant=%q", ErrCodeObjVariantMembership, codeObjID, codeObj.DefaultVariantID)
		}
	}
	return nil
}

func (p *Project) validateEntryCodeBlock() error {
	if p == nil || p.EntryCodeBlockID == "" {
		return nil
	}
	if _, ok := p.Sections[p.EntryCodeBlockID]; !ok {
		return fmt.Errorf("%w: %q", ErrEntrySectionNotFound, p.EntryCodeBlockID)
	}
	return nil
}

func pruneStaleSectionIDs(sectionIDs []string, sections map[string]Section) []string {
	if len(sectionIDs) == 0 {
		return []string{}
	}

	pruned := make([]string, 0, len(sectionIDs))
	for _, sectionID := range sectionIDs {
		if _, ok := sections[sectionID]; !ok {
			continue
		}
		pruned = append(pruned, sectionID)
	}
	return pruned
}

func validateActiveIDsOnLoad(sectionIDs []string, sections map[string]Section) error {
	equal, err := persistedJSONEqual(
		struct {
			ActiveIDs []string `json:"activeIds,omitempty"`
		}{
			ActiveIDs: pruneStaleSectionIDs(sectionIDs, sections),
		},
		struct {
			ActiveIDs []string `json:"activeIds,omitempty"`
		}{
			ActiveIDs: sectionIDs,
		},
	)
	if err != nil {
		return err
	}
	if !equal {
		return ErrPersistedProjectActiveIDsRequireRepair
	}
	return nil
}
