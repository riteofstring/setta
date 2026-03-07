package projectstate

import (
	"fmt"
	"path"
	"sort"
	"strings"
)

const pythonCodeFileExtension = ".py"

type PythonCodeSectionFile struct {
	SectionID     string
	Binding       CodeFileBinding
	Code          string
	HasInlineCode bool
}

func (p *Project) ReconcilePythonCodeSectionBindings() error {
	if p == nil {
		return ErrProjectNotFound
	}

	conflicts, err := activePythonSectionSlugConflictIDs(*p)
	if err != nil {
		return err
	}

	activeSectionIDs := sortedProjectSectionIDs(p.SectionVariantMap)
	for _, sectionID := range activeSectionIDs {
		section, variant, impl, err := p.ResolveSection(sectionID)
		if err != nil {
			return err
		}
		if !impl.IsCode() || impl.Code == nil || impl.Code.Language != CodeLanguagePython {
			continue
		}
		if impl.Code.Binding != nil {
			continue
		}
		if _, blocked := conflicts[section.ID]; blocked {
			continue
		}

		fullName, err := activeSectionPathFullName(*p, section.ID)
		if err != nil {
			return err
		}
		sectionSlug := sanitizeSectionSlug(fullName)
		if sectionSlug == "" {
			continue
		}

		impl.Code.Binding = &CodeFileBinding{
			Path:       path.Join(ProjectCodeSectionsRelativeRoot(p.Name), sectionSlug+pythonCodeFileExtension),
			AccessMode: CodeFileAccessModeReadWrite,
		}
		p.SectionImpls[variant.ImplID] = impl
	}
	return nil
}

func (p Project) ActivePythonCodeSectionFiles() ([]PythonCodeSectionFile, error) {
	files := make([]PythonCodeSectionFile, 0, len(p.SectionVariantMap))
	for _, sectionID := range sortedProjectSectionIDs(p.SectionVariantMap) {
		section, variant, impl, err := p.ResolveSection(sectionID)
		if err != nil {
			return nil, err
		}
		if !impl.IsCode() || impl.Code == nil || impl.Code.Language != CodeLanguagePython || impl.Code.Binding == nil {
			continue
		}

		payload, err := effectiveSectionPayload(p, section.ID, variant.ID)
		if err != nil {
			return nil, err
		}

		code, hasInlineCode := payloadRawStringFieldWithPresence(payload, "code")
		files = append(files, PythonCodeSectionFile{
			SectionID:     section.ID,
			Binding:       *cloneCodeFileBinding(impl.Code.Binding),
			Code:          code,
			HasInlineCode: hasInlineCode,
		})
	}
	return files, nil
}

func activePythonSectionSlugConflictIDs(project Project) (map[string]struct{}, error) {
	slugToSectionIDs := map[string][]string{}
	slugBySectionID := map[string]string{}

	for _, sectionID := range sortedProjectSectionIDs(project.SectionVariantMap) {
		_, _, impl, err := project.ResolveSection(sectionID)
		if err != nil {
			return nil, err
		}
		if !impl.IsCode() || impl.Code == nil || impl.Code.Language != CodeLanguagePython {
			continue
		}

		fullName, err := activeSectionPathFullName(project, sectionID)
		if err != nil {
			return nil, err
		}
		slug := sanitizeSectionSlug(fullName)
		slugBySectionID[sectionID] = slug
		slugToSectionIDs[slug] = append(slugToSectionIDs[slug], sectionID)
	}

	conflicts := map[string]struct{}{}
	for sectionID, slug := range slugBySectionID {
		if slug == "" {
			conflicts[sectionID] = struct{}{}
			continue
		}
		if len(slugToSectionIDs[slug]) > 1 {
			conflicts[sectionID] = struct{}{}
		}
	}
	return conflicts, nil
}

func activeSectionPathFullName(project Project, sectionID string) (string, error) {
	section, ok := project.Sections[sectionID]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
	}
	parentID := strings.TrimSpace(section.ParentSectionID)
	if parentID == "" {
		return section.Name, nil
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
			childSection, ok := project.Sections[childID]
			if !ok {
				return "", fmt.Errorf("%w: %q", ErrSectionNotFound, childID)
			}
			suffix = fmt.Sprintf("[\"%s\"]%s", childSection.Name, suffix)
		}

		parentSection, ok := project.Sections[parentID]
		if !ok {
			return "", fmt.Errorf("%w: %q", ErrParentSectionNotFound, parentID)
		}
		childID = parentID
		parentID = strings.TrimSpace(parentSection.ParentSectionID)
	}

	rootSection, ok := project.Sections[childID]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrSectionNotFound, childID)
	}
	return rootSection.Name + suffix, nil
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

func sanitizeSectionSlug(name string) string {
	replaced := strings.NewReplacer(
		"[", "_",
		"]", "_",
		"\"", "_",
		"'", "_",
		" ", "_",
	).Replace(name)
	for strings.Contains(replaced, "__") {
		replaced = strings.ReplaceAll(replaced, "__", "_")
	}
	return strings.Trim(strings.ToLower(replaced), "_")
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
