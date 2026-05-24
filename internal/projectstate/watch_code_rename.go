package projectstate

import (
	"fmt"
	"sort"
	"strings"

	"setta/internal/watchcode"
)

func (p *Project) applyWatchCodeRename(
	projectData *WatchCodePluginProjectData,
	plan watchcode.RenamePlan,
	sourcePath string,
) (bool, bool, error) {
	entry, ok := projectData.Registry[plan.OldIdentity]
	if !ok {
		return false, false, nil
	}

	didUpdate := false
	entry, updated := p.normalizeWatchCodeRegistryEntrySections(entry)
	didUpdate = didUpdate || updated

	previousReferenceName := strings.TrimSpace(entry.CallableName)
	oldModulePath, oldSymbolName, err := splitWatchCodeCanonicalIdentity(plan.OldIdentity)
	if err != nil {
		return false, false, err
	}

	replaceWatchCodeRegistryIdentity(projectData, plan.OldIdentity, plan.NewCallable, sourcePath, entry)
	didUpdate = true

	referenceName := resolveWatchCodeReferenceName(projectData, plan.NewCallable, plan.NewCallable.Identity)
	updated, err = p.syncWatchCodeRenameImports(
		oldModulePath,
		oldSymbolName,
		previousReferenceName,
		plan.NewCallable,
		referenceName,
	)
	if err != nil {
		return false, false, err
	}
	didUpdate = didUpdate || updated

	didUpdate = didUpdate || setWatchCodeRegistryCallableName(projectData, plan.NewCallable.Identity, referenceName)

	entry = projectData.Registry[plan.NewCallable.Identity]
	renamedSections, err := p.renameWatchCodeCallableSections(
		entry.SectionIDs,
		previousReferenceName,
		referenceName,
	)
	if err != nil {
		return false, false, err
	}
	if renamedSections {
		didUpdate = true
	}

	return didUpdate, len(entry.SectionIDs) == 0, nil
}

func (p *Project) removeWatchCodeIdentity(
	projectData *WatchCodePluginProjectData,
	identity string,
) (bool, error) {
	entry, ok := projectData.Registry[identity]
	if !ok {
		return false, nil
	}

	modulePath, symbolName, err := splitWatchCodeCanonicalIdentity(identity)
	if err != nil {
		return false, err
	}
	removedImport, err := p.removeWatchCodePythonImport(modulePath, symbolName, entry.CallableName)
	if err != nil {
		return false, err
	}
	_ = removedImport

	sectionIDs := p.pruneWatchCodeSectionIDs(entry)
	sectionsToDelete := make([]string, 0)
	for _, sectionID := range sectionIDs {
		deleteSection, err := p.removeWatchCodeCallableFromSection(projectData, sectionID, entry.CallableName)
		if err != nil {
			return false, err
		}
		if deleteSection {
			sectionsToDelete = append(sectionsToDelete, sectionID)
		}
	}
	if len(sectionsToDelete) > 0 {
		RemoveSections(p, sectionsToDelete)
		if err := p.pruneUnusedCodeObjects(); err != nil {
			return false, err
		}
	}

	delete(projectData.Registry, identity)
	return true, nil
}

func (p *Project) watchCodeCallableVariantsForName(sectionID string, callableName string) ([]string, error) {
	section, ok := p.Sections[sectionID]
	if !ok {
		return nil, nil
	}
	matched := make([]string, 0, len(section.VariantIDs))
	targetName := strings.TrimSpace(callableName)
	for _, variantID := range collectSectionVariantIDs(*p, section) {
		_, _, impl, err := p.ResolveSectionWithVariant(sectionID, variantID)
		if err != nil {
			return nil, err
		}
		payload, err := effectiveSectionPayload(*p, sectionID, variantID)
		if err != nil {
			return nil, err
		}
		sectionType := payloadStringField(payload, "type")
		if sectionType == "" {
			sectionType = fallbackSectionType(impl)
		}
		if sectionType != "Callable" {
			continue
		}
		callableID := payloadStringField(payload, "callable")
		if callableID == "" {
			continue
		}
		codeObj, ok := p.CodeObjs[callableID]
		if !ok {
			return nil, fmt.Errorf("%w: %q", ErrCodeObjNotFound, callableID)
		}
		if strings.TrimSpace(codeObj.Name) == targetName {
			matched = append(matched, variantID)
		}
	}
	sort.Strings(matched)
	return matched, nil
}

func (p *Project) deleteWatchCodeSectionVariant(
	projectData *WatchCodePluginProjectData,
	sectionID string,
	variantID string,
) error {
	section, ok := p.Sections[sectionID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
	}
	if !containsString(section.VariantIDs, variantID) {
		return nil
	}
	if len(section.VariantIDs) < 2 {
		return nil
	}

	p.Edges = filterEdgesWithoutSectionVariant(p.Edges, sectionID, variantID)

	nextVariants := filterStringSlice(section.VariantIDs, map[string]struct{}{variantID: {}})
	if len(nextVariants) == 0 {
		return nil
	}
	section.VariantIDs = nextVariants
	p.syncWatchCodeSectionVariantSelection(sectionID, &section, variantID, nextVariants[0])
	p.Sections[sectionID] = section
	delete(p.SectionVariants, variantID)

	if err := p.pruneUnusedCodeObjects(); err != nil {
		return err
	}
	return p.syncWatchCodeRegistrySectionMembership(projectData, sectionID)
}

func (p *Project) pruneUnusedCodeObjects() error {
	usedCodeObjIDs, err := p.watchCodeUsedCodeObjectIDs()
	if err != nil {
		return err
	}

	reachable, err := p.reachableWatchCodeCodeObjects(usedCodeObjIDs)
	if err != nil {
		return err
	}

	return p.deleteUnusedWatchCodeCodeObjects(reachable)
}

func effectiveCodeObjectPayloadForVariant(project Project, codeObjID string, variantID string) (map[string]any, error) {
	codeObj, ok := project.CodeObjs[strings.TrimSpace(codeObjID)]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
	}
	variant, ok := project.CodeObjVariants[strings.TrimSpace(variantID)]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, variantID)
	}
	impl, ok := project.CodeObjImpls[variant.ImplID]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrCodeObjImplNotFound, variant.ImplID)
	}
	base, err := rawObjectFromProjectPayload(codeObjImplPayloadUnchecked(impl))
	if err != nil {
		return nil, err
	}
	sharedModifier, err := rawObjectFromProjectPayload(codeObj.SharedModifier)
	if err != nil {
		return nil, err
	}
	modifier, err := rawObjectFromProjectPayload(variant.Modifier)
	if err != nil {
		return nil, err
	}
	return mergeProjectObjects(mergeProjectObjects(base, sharedModifier), modifier), nil
}

func (p *Project) deleteWatchCodeCodeObject(codeObjID string) error {
	codeObj, ok := p.CodeObjs[codeObjID]
	if !ok {
		return nil
	}
	for _, variantID := range codeObj.VariantIDs {
		variant, ok := p.CodeObjVariants[variantID]
		if !ok {
			continue
		}
		if err := p.clearPasswordSecretForImpl(variant.ImplID); err != nil {
			return err
		}
		delete(p.CodeObjImpls, variant.ImplID)
		delete(p.CodeObjVariants, variantID)
	}
	delete(p.CodeObjs, codeObjID)
	return nil
}
