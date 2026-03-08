package projectstate

import "sort"

const pythonCodeFileExtension = ".py"

type PythonCodeSectionFile struct {
	SectionID     string
	Binding       CodeFileBinding
	Code          string
	HasInlineCode bool
}

func activeSectionPathFullName(project Project, sectionID string) (string, error) {
	return activeSectionPathFullNameWithOverrides(project, sectionID, nil)
}

func activeSectionType(project Project, sectionID string) (string, error) {
	section, variant, impl, err := project.ResolveSection(sectionID)
	if err != nil {
		return "", err
	}
	payload, err := effectiveSectionPayload(project, section.ID, variant.ID)
	if err != nil {
		return "", err
	}
	if sectionType := payloadStringField(payload, "type"); sectionType != "" {
		return sectionType, nil
	}
	return fallbackSectionType(impl), nil
}

func activeSectionChildren(project Project, sectionID string) ([]string, error) {
	section, variant, _, err := project.ResolveSection(sectionID)
	if err != nil {
		return nil, err
	}
	payload, err := effectiveSectionPayload(project, section.ID, variant.ID)
	if err != nil {
		return nil, err
	}
	return payloadStringArrayField(payload, "children"), nil
}

func sortedProjectSectionIDs(sectionVariantMap map[string]string) []string {
	ids := make([]string, 0, len(sectionVariantMap))
	for sectionID := range sectionVariantMap {
		ids = append(ids, sectionID)
	}
	sort.Strings(ids)
	return ids
}

func indexOfString(values []string, target string) int {
	for index, value := range values {
		if value == target {
			return index
		}
	}
	return -1
}
