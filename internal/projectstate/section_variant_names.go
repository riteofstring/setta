package projectstate

import (
	"fmt"
	"sort"
	"strings"
)

func nextAvailableSectionVariantName(existingNames []string, preferredName string) (string, error) {
	usedNames := make(map[string]struct{}, len(existingNames))
	for _, name := range existingNames {
		trimmed := strings.TrimSpace(name)
		if trimmed == "" {
			continue
		}
		usedNames[trimmed] = struct{}{}
	}

	trimmedPreferred := strings.TrimSpace(preferredName)
	if trimmedPreferred != "" {
		if _, exists := usedNames[trimmedPreferred]; !exists {
			return trimmedPreferred, nil
		}
		for suffix := 2; ; suffix++ {
			candidate := fmt.Sprintf("%s_%d", trimmedPreferred, suffix)
			if _, exists := usedNames[candidate]; !exists {
				return candidate, nil
			}
		}
	}

	return nextAvailableMemorableName(func(candidate string) (bool, error) {
		_, exists := usedNames[candidate]
		return !exists, nil
	})
}

func collectSectionVariantNames(section Section, variants map[string]SectionVariant) []string {
	output := make([]string, 0, len(section.VariantIDs))
	for _, variantID := range section.VariantIDs {
		variant, ok := variants[variantID]
		if !ok {
			continue
		}
		trimmed := strings.TrimSpace(variant.Name)
		if trimmed == "" {
			continue
		}
		output = append(output, trimmed)
	}
	return output
}

func (p *Project) ensureSectionVariantNames() error {
	if p == nil {
		return nil
	}

	sectionIDs := make([]string, 0, len(p.Sections))
	for sectionID := range p.Sections {
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)

	for _, sectionID := range sectionIDs {
		section, ok := p.Sections[sectionID]
		if !ok {
			continue
		}
		existingNames := collectSectionVariantNames(section, p.SectionVariants)
		for _, variantID := range section.VariantIDs {
			variant, ok := p.SectionVariants[variantID]
			if !ok {
				continue
			}
			if strings.TrimSpace(variant.Name) != "" {
				continue
			}
			nextName, err := nextAvailableSectionVariantName(existingNames, section.Name)
			if err != nil {
				return err
			}
			variant.Name = nextName
			p.SectionVariants[variant.ID] = variant
			existingNames = append(existingNames, nextName)
		}
	}

	return nil
}
