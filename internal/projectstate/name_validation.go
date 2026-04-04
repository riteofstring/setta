package projectstate

import (
	"errors"
	"fmt"
	"strings"
)

type NameValidationErrors struct {
	ProjectConfigID string              `json:"projectConfigId"`
	ProjectErrors   []string            `json:"projectErrors"`
	SectionErrors   map[string][]string `json:"sectionErrors"`
	ParamErrors     map[string][]string `json:"paramErrors"`
}

func CollectNameValidationErrors(document Document, projectID string) (NameValidationErrors, error) {
	project, err := document.ProjectByID(projectID)
	if err != nil {
		return NameValidationErrors{}, err
	}

	sectionErrors, err := collectSectionNameConflicts(project)
	if err != nil {
		return NameValidationErrors{}, err
	}
	paramErrors, paramFormatErrors, err := collectParamNameErrors(project)
	if err != nil {
		return NameValidationErrors{}, err
	}
	sectionFormatErrors := collectSectionNameFormatErrors(project)
	headingNameErrors, err := collectTextBlockHeadingNameErrors(project)
	if err != nil {
		return NameValidationErrors{}, err
	}

	for sectionID, messages := range sectionFormatErrors {
		for _, message := range messages {
			appendUniqueError(sectionErrors, sectionID, message)
		}
	}
	for sectionID, messages := range headingNameErrors {
		for _, message := range messages {
			appendUniqueError(sectionErrors, sectionID, message)
		}
	}
	for paramID, messages := range paramFormatErrors {
		for _, message := range messages {
			appendUniqueError(paramErrors, paramID, message)
		}
	}

	return NameValidationErrors{
		ProjectConfigID: project.ID,
		ProjectErrors:   collectProjectNameFormatErrors(project),
		SectionErrors:   sectionErrors,
		ParamErrors:     paramErrors,
	}, nil
}

func CollectAllNameValidationErrors(document Document) ([]NameValidationErrors, error) {
	metadata := document.ProjectConfigMetadata()
	output := make([]NameValidationErrors, 0, len(metadata))
	for _, project := range metadata {
		errorsForProject, err := CollectNameValidationErrors(document, project.ID)
		if err != nil {
			return nil, err
		}
		output = append(output, errorsForProject)
	}
	return output, nil
}

func collectProjectNameFormatErrors(project Project) []string {
	allowReserved := false
	if _, reserved := projectReservedNames[strings.ToLower(strings.TrimSpace(project.Name))]; reserved {
		allowReserved = true
	}
	formatError := projectNameFormatError(strings.TrimSpace(project.Name), allowReserved)
	if formatError == "" {
		return nil
	}
	return []string{formatError}
}

func collectSectionNameConflicts(project Project) (map[string][]string, error) {
	errorsBySection := map[string][]string{}
	siblingsByParent := map[string][]string{}

	for _, sectionID := range sortedProjectSectionIDs(project.SectionVariantMap) {
		section, ok := project.Sections[sectionID]
		if !ok {
			return nil, fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
		}
		parentID := strings.TrimSpace(section.ParentSectionID)
		siblingsByParent[parentID] = append(siblingsByParent[parentID], sectionID)
	}

	for _, sectionIDs := range siblingsByParent {
		nameToIDs := map[string][]string{}
		for _, sectionID := range sectionIDs {
			name := strings.TrimSpace(project.Sections[sectionID].Name)
			if name == "" {
				continue
			}
			nameToIDs[name] = append(nameToIDs[name], sectionID)
		}
		for name, ids := range nameToIDs {
			if len(ids) < 2 {
				continue
			}
			message := fmt.Sprintf(`Duplicate sibling name "%s".`, name)
			for _, sectionID := range ids {
				appendUniqueError(errorsBySection, sectionID, message)
			}
		}
	}

	topLevelIDs := siblingsByParent[""]
	if len(topLevelIDs) != 0 {
		identifierToIDs := map[string][]string{}
		for _, sectionID := range topLevelIDs {
			name := strings.TrimSpace(project.Sections[sectionID].Name)
			if name == "" {
				continue
			}
			identifier := sanitizeSectionPythonIdentifier(name)
			identifierToIDs[identifier] = append(identifierToIDs[identifier], sectionID)
		}
		for _, ids := range identifierToIDs {
			if len(ids) < 2 {
				continue
			}
			for _, sectionID := range ids {
				appendUniqueError(
					errorsBySection,
					sectionID,
					"Section name conflicts with another top-level name after Python identifier sanitization.",
				)
			}
		}
	}

	_, slugToSectionIDs, err := activeSectionSlugMap(project, nil)
	if err != nil {
		return nil, err
	}
	for slug, ids := range slugToSectionIDs {
		if slug == "" {
			for _, sectionID := range ids {
				appendUniqueError(errorsBySection, sectionID, "Section name is invalid after sanitization.")
			}
			continue
		}
		if len(ids) < 2 {
			continue
		}
		message := fmt.Sprintf(`Section path slug "%s" conflicts with another section.`, slug)
		for _, sectionID := range ids {
			appendUniqueError(errorsBySection, sectionID, message)
		}
	}

	return errorsBySection, nil
}

func collectSectionNameFormatErrors(project Project) map[string][]string {
	errorsBySection := map[string][]string{}
	for _, sectionID := range sortedProjectSectionIDs(project.SectionVariantMap) {
		section, ok := project.Sections[sectionID]
		if !ok {
			continue
		}
		if formatError := sectionNameFormatError(strings.TrimSpace(section.Name)); formatError != "" {
			appendUniqueError(errorsBySection, sectionID, formatError)
		}
	}
	return errorsBySection
}

func collectTextBlockHeadingNameErrors(project Project) (map[string][]string, error) {
	errorsBySection := map[string][]string{}
	_, slugToSectionIDs, err := activeSectionSlugMap(project, nil)
	if err != nil {
		return nil, err
	}

	for _, sectionID := range sortedProjectSectionIDs(project.SectionVariantMap) {
		section, variant, impl, err := project.ResolveSection(sectionID)
		if err != nil {
			return nil, err
		}
		payload, err := effectiveSectionPayload(project, section.ID, variant.ID)
		if err != nil {
			return nil, err
		}
		sectionType := payloadStringField(payload, "type")
		if sectionType == "" {
			sectionType = fallbackSectionType(impl)
		}
		if !strings.EqualFold(sectionType, "TextBlock") {
			continue
		}
		if !payloadBoolField(payload, "headingAsSectionName") {
			continue
		}
		heading := strings.TrimSpace(
			extractFirstTextBlockHeading(
				payloadRawStringField(payload, "text"),
				payloadStringField(payload, "format"),
			),
		)
		if heading == "" {
			continue
		}
		validationError, err := sectionNameValidationErrorWithSlugIndex(project, section.ID, heading, slugToSectionIDs)
		if err != nil {
			return nil, err
		}
		if validationError == "" {
			continue
		}
		appendUniqueError(
			errorsBySection,
			section.ID,
			"Text block heading cannot be used as section name: "+validationError,
		)
	}

	return errorsBySection, nil
}

func sectionNameValidationErrorWithSlugIndex(
	project Project,
	sectionID string,
	normalized string,
	slugToSectionIDs map[string][]string,
) (string, error) {
	if formatError := sectionNameFormatError(normalized); formatError != "" {
		return formatError, nil
	}

	section, ok := project.Sections[sectionID]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
	}
	parentID := strings.TrimSpace(section.ParentSectionID)
	siblingIDs, err := activeSiblingSectionIDs(project, sectionID, parentID)
	if err != nil {
		return "", err
	}
	for _, siblingID := range siblingIDs {
		if siblingID == sectionID {
			continue
		}
		sibling, ok := project.Sections[siblingID]
		if !ok {
			return "", fmt.Errorf("%w: %q", ErrSectionNotFound, siblingID)
		}
		if strings.TrimSpace(sibling.Name) == normalized {
			return fmt.Sprintf(`Section name "%s" already exists under this parent.`, normalized), nil
		}
	}

	if parentID == "" {
		normalizedIdentifier := sanitizeSectionPythonIdentifier(normalized)
		for _, siblingID := range siblingIDs {
			if siblingID == sectionID {
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
				return "Section name conflicts with another top-level name after Python identifier sanitization.", nil
			}
		}
	}

	fullName, err := activeSectionPathFullNameWithOverrides(project, sectionID, map[string]string{
		sectionID: normalized,
	})
	if err != nil {
		return "", err
	}
	slug := sanitizeSectionSlug(fullName)
	if slug == "" {
		return "Section name is invalid after sanitization.", nil
	}
	for _, existingID := range slugToSectionIDs[slug] {
		if existingID != sectionID {
			return fmt.Sprintf(`Section path slug "%s" conflicts with another section.`, slug), nil
		}
	}
	return "", nil
}

func collectParamNameErrors(project Project) (map[string][]string, map[string][]string, error) {
	conflictErrors := map[string][]string{}
	formatErrors := map[string][]string{}

	for _, sectionID := range sortedProjectSectionIDs(project.SectionVariantMap) {
		section, variant, impl, err := project.ResolveSection(sectionID)
		if err != nil {
			return nil, nil, err
		}
		sectionPayload, err := effectiveSectionPayload(project, section.ID, variant.ID)
		if err != nil {
			return nil, nil, err
		}
		sectionType := payloadStringField(sectionPayload, "type")
		if sectionType == "" {
			sectionType = fallbackSectionType(impl)
		}

		codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
		if len(codeObjVariantMap) == 0 {
			continue
		}

		if sectionType != "MetaControl" {
			rootCodeObjID := codeObjectRenameRootID(sectionPayload)
			if rootCodeObjID != "" {
				_, childrenByID, err := collectCodeObjectHierarchy(project, codeObjVariantMap, rootCodeObjID)
				if err != nil {
					return nil, nil, err
				}
				for _, childIDs := range childrenByID {
					nameToIDs := map[string][]string{}
					for _, childID := range childIDs {
						codeObj, ok := project.CodeObjs[childID]
						if !ok {
							return nil, nil, fmt.Errorf("%w: %q", ErrCodeObjNotFound, childID)
						}
						name := strings.TrimSpace(codeObj.Name)
						if name == "" {
							continue
						}
						nameToIDs[name] = append(nameToIDs[name], childID)
					}
					for name, ids := range nameToIDs {
						if len(ids) < 2 {
							continue
						}
						message := fmt.Sprintf(`Duplicate param name "%s".`, name)
						for _, codeObjID := range ids {
							appendUniqueError(conflictErrors, codeObjID, message)
						}
					}
				}
			}
		}

		for codeObjID := range codeObjVariantMap {
			codeObj, ok := project.CodeObjs[codeObjID]
			if !ok {
				return nil, nil, fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
			}
			payload, _, _, codeObjImpl, err := project.ResolveSectionCodeObject(section.ID, codeObjID)
			if err != nil {
				return nil, nil, err
			}
			codeObjType := payloadStringField(payload, "type")
			if codeObjType == "" {
				codeObjType = strings.TrimSpace(codeObjImpl.Type)
			}
			if !isRenamableCodeObjectType(codeObjType) {
				continue
			}
			if _, err := validateCodeObjectNameFormat(project, sectionPayload, sectionType, section.ID, codeObjID, codeObj.Name); err != nil {
				var invalid *InvalidCodeObjectNameError
				if errors.As(err, &invalid) {
					appendUniqueError(formatErrors, codeObjID, invalid.Message)
					continue
				}
				return nil, nil, err
			}
		}
	}

	return conflictErrors, formatErrors, nil
}

func appendUniqueError(errorsByID map[string][]string, id string, message string) {
	if message == "" {
		return
	}
	for _, existing := range errorsByID[id] {
		if existing == message {
			return
		}
	}
	errorsByID[id] = append(errorsByID[id], message)
}
