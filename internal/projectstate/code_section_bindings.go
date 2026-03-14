package projectstate

import (
	"path"
	"strings"
)

type ActiveCodeSectionFile struct {
	SectionID     string
	Language      CodeLanguage
	Binding       CodeFileBinding
	Code          string
	HasInlineCode bool
}

func (p *Project) ReconcileCodeSectionBindings() error {
	if p == nil {
		return ErrProjectNotFound
	}

	conflicts, err := activeCodeSectionSlugConflictIDs(*p)
	if err != nil {
		return err
	}

	activeSectionIDs := sortedProjectSectionIDs(p.SectionVariantMap)
	for _, sectionID := range activeSectionIDs {
		section, variant, impl, err := p.ResolveSection(sectionID)
		if err != nil {
			return err
		}
		if !impl.IsCode() || impl.Code == nil {
			continue
		}
		if impl.IsGeneratedEntrySection() || impl.Code.Binding != nil {
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
			Path: path.Join(
				ProjectCodeSectionsRelativeRoot(p.Name),
				sectionSlug+"."+codeLanguageExtension(impl.Code.Language),
			),
			AccessMode: CodeFileAccessModeReadWrite,
		}
		p.SectionImpls[variant.ImplID] = impl
	}
	return nil
}

func (p Project) ActiveCodeSectionFiles() ([]ActiveCodeSectionFile, error) {
	files := make([]ActiveCodeSectionFile, 0, len(p.SectionVariantMap))
	for _, sectionID := range sortedProjectSectionIDs(p.SectionVariantMap) {
		section, variant, impl, err := p.ResolveSection(sectionID)
		if err != nil {
			return nil, err
		}
		if !impl.IsCode() || impl.Code == nil || impl.Code.Binding == nil || impl.IsGeneratedEntrySection() {
			continue
		}

		payload, err := effectiveSectionPayload(p, section.ID, variant.ID)
		if err != nil {
			return nil, err
		}

		code, hasInlineCode := payloadRawStringFieldWithPresence(payload, "code")
		files = append(files, ActiveCodeSectionFile{
			SectionID:     section.ID,
			Language:      normalizeCodeLanguage(impl.Code.Language),
			Binding:       *cloneCodeFileBinding(impl.Code.Binding),
			Code:          code,
			HasInlineCode: hasInlineCode,
		})
	}
	return files, nil
}

func activeCodeSectionSlugConflictIDs(project Project) (map[string]struct{}, error) {
	slugToSectionIDs := map[string][]string{}
	slugBySectionID := map[string]string{}

	for _, sectionID := range sortedProjectSectionIDs(project.SectionVariantMap) {
		_, _, impl, err := project.ResolveSection(sectionID)
		if err != nil {
			return nil, err
		}
		if !impl.IsCode() || impl.Code == nil || impl.IsGeneratedEntrySection() {
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

func (p *Project) ReconcilePythonCodeSectionBindings() error {
	return p.ReconcileCodeSectionBindings()
}

func (p Project) ActivePythonCodeSectionFiles() ([]PythonCodeSectionFile, error) {
	files, err := p.ActiveCodeSectionFiles()
	if err != nil {
		return nil, err
	}

	pythonFiles := make([]PythonCodeSectionFile, 0, len(files))
	for _, file := range files {
		if normalizeCodeLanguage(file.Language) != CodeLanguagePython {
			continue
		}
		pythonFiles = append(pythonFiles, PythonCodeSectionFile{
			SectionID:     file.SectionID,
			Binding:       file.Binding,
			Code:          file.Code,
			HasInlineCode: file.HasInlineCode,
		})
	}
	return pythonFiles, nil
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
