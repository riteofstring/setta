package projectstate

import (
	"fmt"
)

func cloneClipboardProjectState(data ClipboardProjectStateCoreWithSectionVariantMap) (ClipboardProjectStateCoreWithSectionVariantMap, error) {
	remapper := newClipboardCloneRemapper(data.Clone())
	if err := remapper.cloneCodeObjectCore(); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	if err := remapper.remapCodeObjectRelations(); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	if err := remapper.cloneSectionCore(); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	if err := remapper.remapSectionRelations(); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	sectionVariantMap, err := remapper.remapSectionVariantMap()
	if err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	remapper.data.SectionVariantMap = sectionVariantMap
	return remapper.data, nil
}

type clipboardCloneRemapper struct {
	data ClipboardProjectStateCoreWithSectionVariantMap

	codeObjImplIDMap    map[string]string
	codeObjVariantIDMap map[string]string
	codeObjIDMap        map[string]string
	sectionImplIDMap    map[string]string
	sectionVariantIDMap map[string]string
	sectionIDMap        map[string]string
}

func newClipboardCloneRemapper(data ClipboardProjectStateCoreWithSectionVariantMap) *clipboardCloneRemapper {
	return &clipboardCloneRemapper{
		data:                data,
		codeObjImplIDMap:    make(map[string]string, len(data.Core.CodeObjImpls)),
		codeObjVariantIDMap: make(map[string]string, len(data.Core.CodeObjVariants)),
		codeObjIDMap:        make(map[string]string, len(data.Core.CodeObjs)),
		sectionImplIDMap:    make(map[string]string, len(data.Core.SectionImpls)),
		sectionVariantIDMap: make(map[string]string, len(data.Core.SectionVariants)),
		sectionIDMap:        make(map[string]string, len(data.Core.Sections)),
	}
}

func (r *clipboardCloneRemapper) cloneCodeObjectCore() error {
	codeObjImpls, err := r.cloneCodeObjectImpls()
	if err != nil {
		return err
	}
	codeObjVariants, err := r.cloneCodeObjectVariants()
	if err != nil {
		return err
	}
	codeObjs, err := r.cloneCodeObjects()
	if err != nil {
		return err
	}
	r.data.Core.CodeObjImpls = codeObjImpls
	r.data.Core.CodeObjVariants = codeObjVariants
	r.data.Core.CodeObjs = codeObjs
	return nil
}

func (r *clipboardCloneRemapper) cloneCodeObjectImpls() (map[string]CodeObjectImpl, error) {
	clonedImpls := make(map[string]CodeObjectImpl, len(r.data.Core.CodeObjImpls))
	for oldID, impl := range r.data.Core.CodeObjImpls {
		if codeObjImplIsPreset(impl) {
			clonedImpls[oldID] = impl.Clone()
			r.codeObjImplIDMap[oldID] = oldID
			continue
		}
		copiedImpl, err := cloneCodeObjectImplForClipboard(impl)
		if err != nil {
			return nil, err
		}
		clonedImpls[copiedImpl.ID] = copiedImpl
		r.codeObjImplIDMap[oldID] = copiedImpl.ID
	}
	return clonedImpls, nil
}

func (r *clipboardCloneRemapper) cloneCodeObjectVariants() (map[string]CodeObjectVariant, error) {
	clonedVariants := make(map[string]CodeObjectVariant, len(r.data.Core.CodeObjVariants))
	for oldID, variant := range r.data.Core.CodeObjVariants {
		newVariantID, err := newProjectStateID()
		if err != nil {
			return nil, err
		}
		copied := variant.Clone()
		copied.ID = newVariantID
		copied.ImplID = r.codeObjImplIDMap[variant.ImplID]
		copied.NonPresetImplIDs = remapIDSlice(variant.NonPresetImplIDs, r.codeObjImplIDMap)
		clonedVariants[newVariantID] = copied
		r.codeObjVariantIDMap[oldID] = newVariantID
	}
	return clonedVariants, nil
}

func (r *clipboardCloneRemapper) cloneCodeObjects() (map[string]CodeObject, error) {
	clonedCodeObjs := make(map[string]CodeObject, len(r.data.Core.CodeObjs))
	for oldID, codeObj := range r.data.Core.CodeObjs {
		newCodeObjID, err := newProjectStateID()
		if err != nil {
			return nil, err
		}
		copied := codeObj.Clone()
		copied.ID = newCodeObjID
		copied.VariantIDs = remapIDSlice(codeObj.VariantIDs, r.codeObjVariantIDMap)
		if copied.DefaultVariantID != "" {
			copied.DefaultVariantID = r.codeObjVariantIDMap[codeObj.DefaultVariantID]
		}
		clonedCodeObjs[newCodeObjID] = copied
		r.codeObjIDMap[oldID] = newCodeObjID
	}
	return clonedCodeObjs, nil
}

func (r *clipboardCloneRemapper) remapCodeObjectRelations() error {
	if err := remapCodeObjectImpls(r.data.Core.CodeObjImpls, r.codeObjIDMap, r.codeObjImplIDMap); err != nil {
		return err
	}
	if err := remapCodeObjects(r.data.Core.CodeObjs, r.codeObjIDMap); err != nil {
		return err
	}
	return remapCodeObjectVariants(r.data.Core.CodeObjVariants, r.codeObjIDMap)
}

func (r *clipboardCloneRemapper) cloneSectionCore() error {
	sectionImpls, err := r.cloneSectionImpls()
	if err != nil {
		return err
	}
	sectionVariants, err := r.cloneSectionVariants()
	if err != nil {
		return err
	}
	sections, err := r.cloneSections()
	if err != nil {
		return err
	}
	r.data.Core.SectionImpls = sectionImpls
	r.data.Core.SectionVariants = sectionVariants
	r.data.Core.Sections = sections
	return nil
}

func (r *clipboardCloneRemapper) cloneSectionImpls() (map[string]SectionImpl, error) {
	clonedImpls := make(map[string]SectionImpl, len(r.data.Core.SectionImpls))
	for oldID, impl := range r.data.Core.SectionImpls {
		if sectionImplIsPreset(impl) {
			clonedImpls[oldID] = impl.Clone()
			r.sectionImplIDMap[oldID] = oldID
			continue
		}
		copiedImpl, err := cloneSectionImplForClipboard(impl)
		if err != nil {
			return nil, err
		}
		clonedImpls[copiedImpl.ID] = copiedImpl
		r.sectionImplIDMap[oldID] = copiedImpl.ID
	}
	return clonedImpls, nil
}

func (r *clipboardCloneRemapper) cloneSectionVariants() (map[string]SectionVariant, error) {
	clonedVariants := make(map[string]SectionVariant, len(r.data.Core.SectionVariants))
	for oldID, variant := range r.data.Core.SectionVariants {
		newVariantID, err := newProjectStateID()
		if err != nil {
			return nil, err
		}
		copied := variant.Clone()
		copied.ID = newVariantID
		copied.ImplID = r.sectionImplIDMap[variant.ImplID]
		copied.NonPresetImplIDs = remapIDSlice(variant.NonPresetImplIDs, r.sectionImplIDMap)
		clonedVariants[newVariantID] = copied
		r.sectionVariantIDMap[oldID] = newVariantID
	}
	return clonedVariants, nil
}

func (r *clipboardCloneRemapper) cloneSections() (map[string]Section, error) {
	clonedSections := make(map[string]Section, len(r.data.Core.Sections))
	for oldID, section := range r.data.Core.Sections {
		newSectionID, err := newProjectStateID()
		if err != nil {
			return nil, err
		}
		copied := section.Clone()
		copied.ID = newSectionID
		copied.VariantIDs = remapIDSlice(section.VariantIDs, r.sectionVariantIDMap)
		if copied.DefaultVariantID != "" {
			copied.DefaultVariantID = r.sectionVariantIDMap[section.DefaultVariantID]
		}
		copied.ParentSectionID = section.ParentSectionID
		clonedSections[newSectionID] = copied
		r.sectionIDMap[oldID] = newSectionID
	}
	return clonedSections, nil
}

func (r *clipboardCloneRemapper) remapSectionRelations() error {
	if err := remapSections(r.data.Core.Sections, r.sectionIDMap, r.codeObjIDMap, r.codeObjVariantIDMap); err != nil {
		return err
	}
	if err := remapSectionVariants(r.data.Core.SectionVariants, r.sectionIDMap, r.codeObjIDMap, r.codeObjVariantIDMap); err != nil {
		return err
	}
	return remapSectionImpls(r.data.Core.SectionImpls, r.sectionIDMap, r.codeObjIDMap, r.codeObjVariantIDMap)
}

func (r *clipboardCloneRemapper) remapSectionVariantMap() (map[string]string, error) {
	remapped := make(map[string]string, len(r.data.SectionVariantMap))
	for sectionID, variantID := range r.data.SectionVariantMap {
		mappedSectionID, ok := r.sectionIDMap[sectionID]
		if !ok {
			return nil, fmt.Errorf("%w: section=%q", ErrSectionNotFound, sectionID)
		}
		mappedVariantID, ok := r.sectionVariantIDMap[variantID]
		if !ok {
			return nil, fmt.Errorf("%w: variant=%q", ErrSectionVariantNotFound, variantID)
		}
		remapped[mappedSectionID] = mappedVariantID
	}
	return remapped, nil
}
