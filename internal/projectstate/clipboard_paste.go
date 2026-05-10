package projectstate

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

func (d *Document) PasteSections(projectID string, input PasteSectionsInput) error {
	if d == nil {
		return ErrProjectNotFound
	}
	if !isFinitePosition(input.Position) {
		return ErrPasteSectionsPositionInvalid
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}

	normalizedData, err := normalizeClipboardProjectState(input.Data)
	if err != nil {
		return err
	}
	if len(normalizedData.Core.Sections) == 0 {
		return nil
	}
	if !input.AsRef {
		normalizedData, err = cloneClipboardProjectState(normalizedData)
		if err != nil {
			return err
		}
	}
	normalizedData, err = filterClipboardSingletonSections(project, normalizedData)
	if err != nil {
		return err
	}
	if len(normalizedData.Core.Sections) == 0 {
		return nil
	}

	project.pruneTopLevelCreationViewState()
	if err := project.mergeClipboardSections(normalizedData, input.Position); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) PasteSections(ctx context.Context, projectID string, input PasteSectionsInput) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.PasteSections(projectID, input); err != nil {
			return document, err
		}
		return document, nil
	})
}

func normalizeClipboardProjectState(data ClipboardProjectStateCoreWithSectionVariantMap) (ClipboardProjectStateCoreWithSectionVariantMap, error) {
	project, err := data.toProject().Normalized()
	if err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}

	rootIDs := inferClipboardRootSectionIDs(project)
	if len(rootIDs) == 0 {
		if len(project.Sections) == 0 {
			return ClipboardProjectStateCoreWithSectionVariantMap{
				Core: ClipboardProjectStateCore{
					Sections:        map[string]Section{},
					SectionImpls:    map[string]SectionImpl{},
					SectionVariants: map[string]SectionVariant{},
					CodeObjs:        map[string]CodeObject{},
					CodeObjImpls:    map[string]CodeObjectImpl{},
					CodeObjVariants: map[string]CodeObjectVariant{},
				},
				SectionVariantMap: map[string]string{},
			}, nil
		}
		return ClipboardProjectStateCoreWithSectionVariantMap{}, ErrClipboardSectionVariantMissing
	}
	return project.prepareClipboardCoreWithVariants(rootIDs)
}

func inferClipboardRootSectionIDs(project Project) []string {
	roots := make([]string, 0, len(project.Sections))
	for sectionID, section := range project.Sections {
		parentID := strings.TrimSpace(section.ParentSectionID)
		if parentID == "" {
			roots = append(roots, sectionID)
			continue
		}
		if _, ok := project.Sections[parentID]; !ok {
			roots = append(roots, sectionID)
		}
	}
	sort.Strings(roots)
	return roots
}

func filterClipboardSingletonSections(project Project, data ClipboardProjectStateCoreWithSectionVariantMap) (ClipboardProjectStateCoreWithSectionVariantMap, error) {
	existingSingletons, err := existingSingletonSectionTypes(project)
	if err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	if len(existingSingletons) == 0 {
		return data, nil
	}

	clipboardProject := data.toProject()
	rootIDs := inferClipboardRootSectionIDs(clipboardProject)
	keptRootIDs := make([]string, 0, len(rootIDs))
	for _, rootID := range rootIDs {
		variantID := strings.TrimSpace(data.SectionVariantMap[rootID])
		if variantID == "" {
			variantID = strings.TrimSpace(clipboardProject.Sections[rootID].DefaultVariantID)
		}
		if variantID == "" {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, fmt.Errorf("%w: section=%q", ErrClipboardSectionVariantMissing, rootID)
		}
		payload, err := clipboardProject.EffectiveSectionPayload(rootID, variantID)
		if err != nil {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, err
		}
		sectionType := payloadStringField(payload, "type")
		if _, ok := existingSingletons[sectionType]; ok && isSingletonSectionType(sectionType) {
			continue
		}
		keptRootIDs = append(keptRootIDs, rootID)
	}
	if len(keptRootIDs) == len(rootIDs) {
		return data, nil
	}
	if len(keptRootIDs) == 0 {
		return ClipboardProjectStateCoreWithSectionVariantMap{
			Core: ClipboardProjectStateCore{
				Sections:        map[string]Section{},
				SectionImpls:    map[string]SectionImpl{},
				SectionVariants: map[string]SectionVariant{},
				CodeObjs:        map[string]CodeObject{},
				CodeObjImpls:    map[string]CodeObjectImpl{},
				CodeObjVariants: map[string]CodeObjectVariant{},
			},
			SectionVariantMap: map[string]string{},
		}, nil
	}
	return clipboardProject.prepareClipboardCoreWithVariants(keptRootIDs)
}

func existingSingletonSectionTypes(project Project) (map[string]struct{}, error) {
	result := map[string]struct{}{}
	for sectionID, section := range project.Sections {
		variantID := strings.TrimSpace(project.SectionVariantMap[sectionID])
		if variantID == "" {
			variantID = strings.TrimSpace(section.DefaultVariantID)
		}
		if variantID == "" {
			continue
		}
		payload, err := project.EffectiveSectionPayload(sectionID, variantID)
		if err != nil {
			return nil, err
		}
		sectionType := payloadStringField(payload, "type")
		if isSingletonSectionType(sectionType) {
			result[sectionType] = struct{}{}
		}
	}
	return result, nil
}

func isSingletonSectionType(sectionType string) bool {
	switch strings.TrimSpace(sectionType) {
	case "GlobalVariables", "GenPythonCode", "GenPythonMetadata":
		return true
	default:
		return false
	}
}

func (p *Project) mergeClipboardSections(data ClipboardProjectStateCoreWithSectionVariantMap, position Position) error {
	if p == nil {
		return ErrProjectNotFound
	}
	p.ensureClipboardMergeMaps()

	rootIDs := inferClipboardRootSectionIDs(data.toProject())
	rootSet := stringSetFromSlice(rootIDs)
	p.mergeClipboardCore(data.Core, rootSet)
	mergeStringMap(p.SectionVariantMap, data.SectionVariantMap)
	p.addClipboardRootLayouts(rootIDs, position)
	return nil
}

func (p *Project) ensureClipboardMergeMaps() {
	if p.Sections == nil {
		p.Sections = map[string]Section{}
	}
	if p.SectionImpls == nil {
		p.SectionImpls = map[string]SectionImpl{}
	}
	if p.SectionVariants == nil {
		p.SectionVariants = map[string]SectionVariant{}
	}
	if p.CodeObjs == nil {
		p.CodeObjs = map[string]CodeObject{}
	}
	if p.CodeObjImpls == nil {
		p.CodeObjImpls = map[string]CodeObjectImpl{}
	}
	if p.CodeObjVariants == nil {
		p.CodeObjVariants = map[string]CodeObjectVariant{}
	}
	if p.SectionVariantMap == nil {
		p.SectionVariantMap = map[string]string{}
	}
	if p.TopLevelSections == nil {
		p.TopLevelSections = map[string]TopLevelSectionLayout{}
	}
}

func (p *Project) mergeClipboardCore(core ClipboardProjectStateCore, rootSet map[string]struct{}) {
	p.mergeClipboardSectionsMap(core.Sections, rootSet)
	mergeClonedEntries(p.SectionImpls, core.SectionImpls, func(impl SectionImpl) SectionImpl { return impl.Clone() })
	mergeClonedEntries(p.SectionVariants, core.SectionVariants, func(variant SectionVariant) SectionVariant { return variant.Clone() })
	mergeClonedEntries(p.CodeObjs, core.CodeObjs, func(codeObj CodeObject) CodeObject { return codeObj.Clone() })
	mergeClonedEntries(p.CodeObjImpls, core.CodeObjImpls, func(impl CodeObjectImpl) CodeObjectImpl { return impl.Clone() })
	mergeClonedEntries(p.CodeObjVariants, core.CodeObjVariants, func(variant CodeObjectVariant) CodeObjectVariant { return variant.Clone() })
}

func (p *Project) mergeClipboardSectionsMap(sections map[string]Section, rootSet map[string]struct{}) {
	for sectionID, section := range sections {
		cloned := section.Clone()
		if _, ok := rootSet[sectionID]; ok {
			cloned.ParentSectionID = ""
		}
		p.Sections[sectionID] = cloned
		if strings.TrimSpace(cloned.ParentSectionID) != "" {
			p.removeTopLevelSectionViewState(sectionID)
		}
	}
}

func (p *Project) addClipboardRootLayouts(rootIDs []string, position Position) {
	nextZIndex := p.nextCreateTopLevelSectionZIndex()
	for _, sectionID := range rootIDs {
		p.addTopLevelSectionViewState(sectionID, TopLevelSectionLayout{
			X:      position.X,
			Y:      position.Y,
			ZIndex: nextZIndex,
		})
		nextZIndex++
	}
}

func mergeClonedEntries[T any](dest map[string]T, source map[string]T, clone func(T) T) {
	for id, value := range source {
		dest[id] = clone(value)
	}
}

func mergeStringMap(dest map[string]string, source map[string]string) {
	for key, value := range source {
		dest[key] = value
	}
}
