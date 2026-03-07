package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

type InvalidSectionNameError struct {
	Message string
}

func (e *InvalidSectionNameError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (d *Document) SetSectionName(projectID string, sectionID string, name string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionName(sectionID, name); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionName(ctx context.Context, projectID string, sectionID string, name string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionName(projectID, sectionID, name); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionName(sectionID string, name string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized, err := validateSectionName(*p, sectionID, name)
	if err != nil {
		return err
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	section, ok := p.Sections[trimmedSectionID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrSectionNotFound, trimmedSectionID)
	}
	section.Name = normalized
	p.Sections[trimmedSectionID] = section
	return nil
}

func validateSectionName(project Project, sectionID string, name string) (string, error) {
	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return "", ErrSectionIDRequired
	}
	section, ok := project.Sections[trimmedSectionID]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrSectionNotFound, trimmedSectionID)
	}

	normalized := strings.TrimSpace(name)
	if formatError := sectionNameFormatError(normalized); formatError != "" {
		return "", &InvalidSectionNameError{Message: formatError}
	}

	parentID := strings.TrimSpace(section.ParentSectionID)
	siblingIDs, err := activeSiblingSectionIDs(project, trimmedSectionID, parentID)
	if err != nil {
		return "", err
	}
	for _, siblingID := range siblingIDs {
		if siblingID == trimmedSectionID {
			continue
		}
		sibling, ok := project.Sections[siblingID]
		if !ok {
			return "", fmt.Errorf("%w: %q", ErrSectionNotFound, siblingID)
		}
		if strings.TrimSpace(sibling.Name) == normalized {
			return "", &InvalidSectionNameError{
				Message: fmt.Sprintf("Section name %q already exists under this parent.", normalized),
			}
		}
	}

	if parentID == "" {
		normalizedIdentifier := sanitizeSectionPythonIdentifier(normalized)
		for _, siblingID := range siblingIDs {
			if siblingID == trimmedSectionID {
				continue
			}
			sibling, ok := project.Sections[siblingID]
			if !ok {
				return "", fmt.Errorf("%w: %q", ErrSectionNotFound, siblingID)
			}
			siblingName := strings.TrimSpace(sibling.Name)
			if siblingName == "" {
				continue
			}
			if sanitizeSectionPythonIdentifier(siblingName) == normalizedIdentifier {
				return "", &InvalidSectionNameError{
					Message: "Section name conflicts with another top-level name after Python identifier sanitization.",
				}
			}
		}
	}

	slugBySectionID, slugToSectionIDs, err := activeSectionSlugMap(project, map[string]string{
		trimmedSectionID: normalized,
	})
	if err != nil {
		return "", err
	}
	affectedSectionIDs, err := activeSectionAndDescendantIDs(project, trimmedSectionID)
	if err != nil {
		return "", err
	}
	for _, affectedSectionID := range affectedSectionIDs {
		sectionSlug := slugBySectionID[affectedSectionID]
		if sectionSlug == "" {
			return "", &InvalidSectionNameError{Message: "Section name is invalid after sanitization."}
		}
		if len(slugToSectionIDs[sectionSlug]) > 1 {
			return "", &InvalidSectionNameError{
				Message: fmt.Sprintf("Section path slug %q conflicts with another section.", sectionSlug),
			}
		}
	}

	return normalized, nil
}

func activeSiblingSectionIDs(project Project, sectionID string, parentID string) ([]string, error) {
	if parentID == "" {
		siblingIDs := make([]string, 0, len(project.Sections))
		for activeSectionID := range project.SectionVariantMap {
			section, ok := project.Sections[activeSectionID]
			if !ok {
				return nil, fmt.Errorf("%w: %q", ErrSectionNotFound, activeSectionID)
			}
			if strings.TrimSpace(section.ParentSectionID) != "" {
				continue
			}
			siblingIDs = append(siblingIDs, activeSectionID)
		}
		if len(siblingIDs) == 0 {
			return []string{sectionID}, nil
		}
		return siblingIDs, nil
	}
	return activeSectionChildren(project, parentID)
}

func sectionNameFormatError(normalized string) string {
	if normalized == "" {
		return "Section name cannot be empty."
	}
	if containsControlChars(normalized) {
		return "Section name cannot include control characters."
	}
	if strings.Contains(normalized, "/") || strings.Contains(normalized, "\\") {
		return "Section name cannot include path separators."
	}
	if strings.Contains(normalized, "..") {
		return "Section name cannot include '..' path segments."
	}
	for _, char := range normalized {
		if !isAllowedSimpleNameChar(char) {
			return "Section name can only contain letters, numbers, spaces, '_' and '-'."
		}
	}
	return ""
}

func activeSectionSlugMap(project Project, nameOverrides map[string]string) (map[string]string, map[string][]string, error) {
	slugBySectionID := make(map[string]string, len(project.SectionVariantMap))
	slugToSectionIDs := map[string][]string{}

	for _, sectionID := range sortedProjectSectionIDs(project.SectionVariantMap) {
		fullName, err := activeSectionPathFullNameWithOverrides(project, sectionID, nameOverrides)
		if err != nil {
			return nil, nil, err
		}
		slug := sanitizeSectionSlug(fullName)
		slugBySectionID[sectionID] = slug
		slugToSectionIDs[slug] = append(slugToSectionIDs[slug], sectionID)
	}

	return slugBySectionID, slugToSectionIDs, nil
}

func activeSectionAndDescendantIDs(project Project, sectionID string) ([]string, error) {
	if _, ok := project.Sections[sectionID]; !ok {
		return nil, fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
	}

	descendants := []string{sectionID}
	children, err := activeSectionChildren(project, sectionID)
	if err != nil {
		return nil, err
	}
	for _, childID := range children {
		childDescendants, err := activeSectionAndDescendantIDs(project, childID)
		if err != nil {
			return nil, err
		}
		descendants = append(descendants, childDescendants...)
	}
	return descendants, nil
}

func activeSectionPathFullNameWithOverrides(project Project, sectionID string, nameOverrides map[string]string) (string, error) {
	section, ok := project.Sections[sectionID]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
	}
	parentID := strings.TrimSpace(section.ParentSectionID)
	if parentID == "" {
		return activeSectionNameWithOverride(project, sectionID, nameOverrides)
	}

	childID := sectionID
	suffix := ""
	for parentID != "" {
		childType, err := activeSectionType(project, childID)
		if err != nil {
			return "", err
		}
		if childType == "ListRoot" {
			children, err := activeSectionChildren(project, parentID)
			if err != nil {
				return "", err
			}
			index := indexOfString(children, childID)
			if index < 0 {
				return "", fmt.Errorf("project section %q missing from parent %q children", childID, parentID)
			}
			suffix = fmt.Sprintf("[%d]%s", index, suffix)
		} else {
			childName, err := activeSectionNameWithOverride(project, childID, nameOverrides)
			if err != nil {
				return "", err
			}
			suffix = fmt.Sprintf("[\"%s\"]%s", childName, suffix)
		}

		parentSection, ok := project.Sections[parentID]
		if !ok {
			return "", fmt.Errorf("%w: %q", ErrParentSectionNotFound, parentID)
		}
		childID = parentID
		parentID = strings.TrimSpace(parentSection.ParentSectionID)
	}

	rootName, err := activeSectionNameWithOverride(project, childID, nameOverrides)
	if err != nil {
		return "", err
	}
	return rootName + suffix, nil
}

func activeSectionNameWithOverride(project Project, sectionID string, nameOverrides map[string]string) (string, error) {
	if overrideName, ok := nameOverrides[sectionID]; ok {
		return overrideName, nil
	}
	section, ok := project.Sections[sectionID]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
	}
	return section.Name, nil
}

func sanitizeSectionPythonIdentifier(name string) string {
	sanitizedRunes := make([]rune, 0, len(name))
	for _, char := range name {
		if char == '_' || unicode.IsLetter(char) || unicode.IsDigit(char) {
			sanitizedRunes = append(sanitizedRunes, char)
			continue
		}
		sanitizedRunes = append(sanitizedRunes, '_')
	}

	sanitized := string(sanitizedRunes)
	if sanitized == "" {
		sanitized = "_"
	}
	firstRune, _ := utf8.DecodeRuneInString(sanitized)
	if unicode.IsDigit(firstRune) {
		sanitized = "_" + sanitized
	}
	if isSectionPythonKeyword(sanitized) {
		sanitized = "_" + sanitized
	}
	return sanitized
}

func isSectionPythonKeyword(value string) bool {
	switch value {
	case "False", "None", "True", "and", "as", "assert", "async", "await",
		"break", "case", "class", "continue", "def", "del", "elif", "else",
		"except", "finally", "for", "from", "global", "if", "import", "in",
		"is", "lambda", "match", "nonlocal", "not", "or", "pass", "raise",
		"return", "try", "type", "while", "with", "yield":
		return true
	default:
		return false
	}
}

func IsInvalidSectionNameError(err error) bool {
	var invalid *InvalidSectionNameError
	return errors.As(err, &invalid)
}
