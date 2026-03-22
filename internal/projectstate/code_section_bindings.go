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
		if impl.IsGeneratedEntrySection() {
			continue
		}
		payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
		if err != nil {
			return err
		}
		binding := effectiveCodeFileBinding(payload, impl.Code.Binding)
		if _, blocked := conflicts[section.ID]; blocked {
			if binding != nil && binding.AutoBinding {
				updatedImpl, err := setCodeSectionBinding(impl, nil)
				if err != nil {
					return err
				}
				p.SectionImpls[variant.ImplID] = updatedImpl
			}
			continue
		}
		if binding != nil {
			if impl.Code.Binding == nil {
				updatedImpl, err := setCodeSectionBinding(impl, binding)
				if err != nil {
					return err
				}
				p.SectionImpls[variant.ImplID] = updatedImpl
			}
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

		updatedImpl, err := setCodeSectionBinding(impl, &CodeFileBinding{
			Path: path.Join(
				ProjectCodeSectionsRelativeRoot(p.Name),
				sectionSlug+"."+codeLanguageExtension(impl.Code.Language),
			),
			AccessMode:  CodeFileAccessModeReadWrite,
			AutoBinding: true,
		})
		if err != nil {
			return err
		}
		p.SectionImpls[variant.ImplID] = updatedImpl
	}
	return nil
}

func (p *Project) ReconcileGeneratedSectionBindings() error {
	if p == nil {
		return ErrProjectNotFound
	}

	for _, sectionID := range sortedProjectSectionIDs(p.SectionVariantMap) {
		_, variant, impl, err := p.ResolveSection(sectionID)
		if err != nil {
			return err
		}
		if !impl.IsGenerated() || impl.Generated == nil {
			continue
		}

		var binding *CodeFileBinding
		switch impl.Generated.Kind {
		case GeneratedSectionKindPythonCode:
			binding = p.GeneratedCodeBinding
		case GeneratedSectionKindPythonMetadata:
			binding = p.GeneratedMetadataBinding
		default:
			continue
		}

		updatedImpl := impl.Clone()
		payload, err := rawObjectFromProjectPayload(sectionImplPayloadUnchecked(updatedImpl))
		if err != nil {
			return err
		}
		if binding == nil {
			delete(payload, "codeFileBinding")
		} else {
			payload["codeFileBinding"] = codeFileBindingObject(*binding)
		}
		rawPayload, err := marshalProjectObject(payload)
		if err != nil {
			return err
		}
		updatedImpl.Payload = rawPayload
		p.SectionImpls[variant.ImplID] = updatedImpl
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

func effectiveCodeFileBinding(payload map[string]any, binding *CodeFileBinding) *CodeFileBinding {
	if binding != nil {
		return cloneCodeFileBinding(binding)
	}

	bindingObject, ok := payloadObjectField(payload, "codeFileBinding")
	if !ok {
		return nil
	}

	path := strings.TrimSpace(payloadStringField(bindingObject, "canonical_path"))
	if path == "" {
		return nil
	}

	accessMode := strings.TrimSpace(payloadStringField(bindingObject, "access_mode"))

	autoBinding, _ := bindingObject["autoBinding"].(bool)
	return &CodeFileBinding{
		Path:        path,
		AccessMode:  CodeFileAccessMode(accessMode),
		AutoBinding: autoBinding,
	}
}

func setCodeSectionBinding(impl SectionImpl, binding *CodeFileBinding) (SectionImpl, error) {
	updatedImpl := impl.Clone()
	updatedImpl.Code.Binding = cloneCodeFileBinding(binding)

	payload, err := rawObjectFromProjectPayload(sectionImplPayloadUnchecked(updatedImpl))
	if err != nil {
		return SectionImpl{}, err
	}
	if binding == nil {
		delete(payload, "codeFileBinding")
	} else {
		payload["codeFileBinding"] = codeFileBindingObject(*binding)
	}
	rawPayload, err := marshalProjectObject(payload)
	if err != nil {
		return SectionImpl{}, err
	}
	updatedImpl.Payload = rawPayload
	return updatedImpl, nil
}

func validateCanonicalCodeFileBindingPayload(payload map[string]any) error {
	rawBinding, ok := payload["codeFileBinding"]
	if !ok {
		return nil
	}

	bindingObject, ok := rawBinding.(map[string]any)
	if !ok {
		return ErrFrontendPayloadInvalid
	}
	if _, ok := bindingObject["path"]; ok {
		return ErrCodeFileBindingLegacyPayloadKeys
	}
	if _, ok := bindingObject["accessMode"]; ok {
		return ErrCodeFileBindingLegacyPayloadKeys
	}

	path := strings.TrimSpace(payloadStringField(bindingObject, "canonical_path"))
	if path == "" {
		return ErrCodeFileBindingPathRequired
	}
	if _, err := normalizeCodeFileAccessMode(CodeFileAccessMode(payloadStringField(bindingObject, "access_mode"))); err != nil {
		return err
	}
	return nil
}
