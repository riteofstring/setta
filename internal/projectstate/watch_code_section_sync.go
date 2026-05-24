package projectstate

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"setta/internal/watchcode"
)

func (p *Project) applyWatchCodeDeletePlan(
	projectData *WatchCodePluginProjectData,
	plan watchcode.DeletePlan,
) (bool, error) {
	didUpdate := false
	for _, identity := range plan.RemovedIdentities {
		updated, err := p.removeWatchCodeIdentity(projectData, identity)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
	}
	if plan.RemoveBaselinePath {
		if _, ok := projectData.BaselineByPath[plan.SourcePath]; ok {
			delete(projectData.BaselineByPath, plan.SourcePath)
			didUpdate = true
		}
	}
	return didUpdate, nil
}

func (p *Project) watchCodeEntryNeedsSection(projectData *WatchCodePluginProjectData, identity string) (bool, error) {
	entry, ok := projectData.Registry[identity]
	if !ok {
		return false, nil
	}
	entry, updated := p.normalizeWatchCodeRegistryEntrySections(entry)
	if updated {
		projectData.Registry[identity] = entry
	}
	return len(entry.SectionIDs) == 0, nil
}

func (p *Project) ensureWatchCodeCallableSection(
	ctx context.Context,
	projectData *WatchCodePluginProjectData,
	identity string,
	callable watchcode.CallableInfo,
	resolver CallableSignatureResolver,
	parsedSignature CallableSignatureResult,
) (bool, error) {
	entry, ok := projectData.Registry[identity]
	if !ok {
		return false, nil
	}
	ctx = watchCodeContext(ctx)

	didUpdate := false
	entry, updated := p.normalizeWatchCodeRegistryEntrySections(entry)
	markWatchCodeUpdated(&didUpdate, updated)

	entry, previousReferenceName, referenceName, updated, err := p.syncWatchCodeEntryReferenceName(
		projectData,
		identity,
		entry,
		callable,
	)
	if err != nil {
		return false, err
	}
	markWatchCodeUpdated(&didUpdate, updated)

	importUpdated, err := p.ensureWatchCodePythonImport(callable.ModulePath, callable.SymbolName, referenceName)
	if err != nil {
		return false, err
	}
	markWatchCodeUpdated(&didUpdate, importUpdated)

	entry, createdSection, updated, err := p.ensureWatchCodeRegistryEntrySection(entry)
	if err != nil {
		return false, err
	}
	markWatchCodeUpdated(&didUpdate, updated)

	projectData.Registry[identity] = entry

	bound, err := p.bindWatchCodeCallableSections(
		ctx,
		projectData,
		entry.SectionIDs,
		referenceName,
		wrapWatchCodeParsedSignatureResolver(referenceName, parsedSignature, resolver),
	)
	if err != nil {
		return false, err
	}
	markWatchCodeUpdated(&didUpdate, bound)

	renamed, err := p.renameWatchCodeCallableSectionsIfNeeded(
		entry.SectionIDs,
		createdSection,
		previousReferenceName,
		referenceName,
	)
	if err != nil {
		return false, err
	}
	markWatchCodeUpdated(&didUpdate, renamed)

	return didUpdate, nil
}

func (p *Project) refetchWatchCodeCallableSections(
	ctx context.Context,
	projectData *WatchCodePluginProjectData,
	identity string,
	resolver CallableSignatureResolver,
	parsedSignature CallableSignatureResult,
) (bool, error) {
	entry, ok := projectData.Registry[identity]
	if !ok {
		return false, nil
	}
	ctx = watchCodeContext(ctx)

	didUpdate := false
	entry, updated := p.normalizeWatchCodeRegistryEntrySections(entry)
	if updated {
		projectData.Registry[identity] = entry
		didUpdate = true
	}
	if len(entry.SectionIDs) == 0 {
		return didUpdate, nil
	}

	callableName := strings.TrimSpace(entry.CallableName)
	if callableName == "" {
		return didUpdate, nil
	}

	signatureResolver := wrapWatchCodeParsedSignatureResolver(callableName, parsedSignature, resolver)
	for _, sectionID := range uniqueSortedTrimmedStrings(entry.SectionIDs) {
		updated, err := p.refetchWatchCodeCallableSectionVariants(ctx, projectData, sectionID, callableName, signatureResolver)
		if err != nil {
			return false, err
		}
		didUpdate = didUpdate || updated
	}

	return didUpdate, nil
}

func watchCodeContext(ctx context.Context) context.Context {
	if ctx != nil {
		return ctx
	}
	return context.Background()
}

func markWatchCodeUpdated(didUpdate *bool, updated bool) {
	if updated {
		*didUpdate = true
	}
}

func (p *Project) normalizeWatchCodeRegistryEntrySections(entry WatchCodeRegistryEntry) (WatchCodeRegistryEntry, bool) {
	validSectionIDs := p.pruneWatchCodeSectionIDs(entry)
	if stringSlicesEqual(entry.SectionIDs, validSectionIDs) && entry.SectionsCount == len(validSectionIDs) {
		return entry, false
	}
	entry.SectionIDs = validSectionIDs
	entry.SectionsCount = len(validSectionIDs)
	return entry, true
}

func (p *Project) syncWatchCodeEntryReferenceName(
	projectData *WatchCodePluginProjectData,
	identity string,
	entry WatchCodeRegistryEntry,
	callable watchcode.CallableInfo,
) (WatchCodeRegistryEntry, string, string, bool, error) {
	previousReferenceName := strings.TrimSpace(entry.CallableName)
	referenceName := resolveWatchCodeReferenceName(projectData, callable, identity)
	if previousReferenceName == referenceName {
		return entry, previousReferenceName, referenceName, false, nil
	}

	modulePath, symbolName, err := splitWatchCodeCanonicalIdentity(identity)
	if err != nil {
		return entry, "", "", false, err
	}
	_, err = p.removeWatchCodePythonImport(modulePath, symbolName, previousReferenceName)
	if err != nil {
		return entry, "", "", false, err
	}
	entry.CallableName = referenceName
	return entry, previousReferenceName, referenceName, true, nil
}

func (p *Project) ensureWatchCodeRegistryEntrySection(entry WatchCodeRegistryEntry) (WatchCodeRegistryEntry, bool, bool, error) {
	if len(entry.SectionIDs) != 0 {
		return entry, false, false, nil
	}
	sectionID, err := p.createWatchCodeCallableSection()
	if err != nil {
		return entry, false, false, err
	}
	entry.SectionIDs = []string{sectionID}
	entry.SectionsCount = 1
	return entry, true, true, nil
}

func (p *Project) renameWatchCodeCallableSectionsIfNeeded(
	sectionIDs []string,
	createdSection bool,
	previousReferenceName string,
	referenceName string,
) (bool, error) {
	if createdSection || previousReferenceName == "" || previousReferenceName == referenceName {
		return false, nil
	}
	return p.renameWatchCodeCallableSections(sectionIDs, previousReferenceName, referenceName)
}

func (p *Project) refetchWatchCodeCallableSectionVariants(
	ctx context.Context,
	projectData *WatchCodePluginProjectData,
	sectionID string,
	callableName string,
	resolver CallableSignatureResolver,
) (bool, error) {
	if _, ok := p.Sections[sectionID]; !ok {
		return false, nil
	}

	didUpdate := false
	variantIDs, err := p.watchCodeCallableVariantsForName(sectionID, callableName)
	if err != nil {
		return false, err
	}
	for _, variantID := range variantIDs {
		updated, err := p.refetchWatchCodeCallableSectionVariant(ctx, projectData, sectionID, variantID, callableName, resolver)
		if err != nil {
			return false, err
		}
		didUpdate = didUpdate || updated
	}
	return didUpdate, nil
}

func (p *Project) refetchWatchCodeCallableSectionVariant(
	ctx context.Context,
	projectData *WatchCodePluginProjectData,
	sectionID string,
	variantID string,
	callableName string,
	resolver CallableSignatureResolver,
) (bool, error) {
	var response SetCallableResponse
	if err := p.withSectionVariantSelected(sectionID, variantID, func() error {
		var setCallableErr error
		response, setCallableErr = p.setCallable(ctx, projectData, sectionID, callableName, true, resolver)
		return setCallableErr
	}); err != nil {
		return false, err
	}
	return response.LSPStatus != SignatureHelpStatusSkipped, nil
}

func (p *Project) watchCodeParsedSignatureParamsMismatch(
	projectData *WatchCodePluginProjectData,
	identity string,
	params []CallableParamProposal,
) (bool, error) {
	entry, ok := projectData.Registry[identity]
	if !ok {
		return false, nil
	}
	callableName := strings.TrimSpace(entry.CallableName)
	if callableName == "" {
		return false, nil
	}

	expectedNames := callableParamProposalNames(params)
	for _, sectionID := range uniqueSortedTrimmedStrings(entry.SectionIDs) {
		variantIDs, err := p.watchCodeCallableVariantsForName(sectionID, callableName)
		if err != nil {
			return false, err
		}
		for _, variantID := range variantIDs {
			currentNames, ok, err := p.watchCodeCallableVariantParamNames(sectionID, variantID)
			if err != nil {
				return false, err
			}
			if ok && !stringSlicesEqual(currentNames, expectedNames) {
				return true, nil
			}
		}
	}
	return false, nil
}

func callableParamProposalNames(params []CallableParamProposal) []string {
	names := make([]string, 0, len(params))
	for _, param := range params {
		name := strings.TrimSpace(param.Name)
		if isSkippedCallableParamProposal(name) {
			continue
		}
		names = append(names, name)
	}
	return names
}

func (p *Project) watchCodeCallableVariantParamNames(sectionID string, variantID string) ([]string, bool, error) {
	sectionPayload, err := effectiveSectionPayload(*p, sectionID, variantID)
	if err != nil {
		return nil, false, err
	}
	callableID := payloadStringField(sectionPayload, "callable")
	if callableID == "" {
		return nil, false, nil
	}
	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	callableVariantID := strings.TrimSpace(codeObjVariantMap[callableID])
	if callableVariantID == "" {
		return nil, false, fmt.Errorf("%w: codeObj=%q", ErrCodeObjVariantNotFound, callableID)
	}
	callablePayload, err := effectiveCodeObjectPayloadForVariant(*p, callableID, callableVariantID)
	if err != nil {
		return nil, false, err
	}
	childIDs := payloadStringArrayField(callablePayload, "children")
	names := make([]string, 0, len(childIDs))
	for _, childID := range childIDs {
		codeObj, ok := p.CodeObjs[childID]
		if !ok {
			return nil, false, fmt.Errorf("%w: %q", ErrCodeObjNotFound, childID)
		}
		names = append(names, strings.TrimSpace(codeObj.Name))
	}
	return names, true, nil
}

func replaceWatchCodeRegistryIdentity(
	projectData *WatchCodePluginProjectData,
	oldIdentity string,
	newCallable watchcode.CallableInfo,
	sourcePath string,
	entry WatchCodeRegistryEntry,
) {
	delete(projectData.Registry, oldIdentity)
	entry.Kind = fromWatchcodeCallableKind(newCallable.Kind)
	entry.SignatureHash = newCallable.SignatureHash
	entry.BodyHash = newCallable.BodyHash
	entry.SourcePath = sourcePath
	projectData.Registry[newCallable.Identity] = entry
}

func (p *Project) syncWatchCodeRenameImports(
	oldModulePath string,
	oldSymbolName string,
	previousReferenceName string,
	newCallable watchcode.CallableInfo,
	referenceName string,
) (bool, error) {
	didUpdate := false
	if previousReferenceName != referenceName ||
		oldModulePath != newCallable.ModulePath ||
		oldSymbolName != newCallable.SymbolName {
		removedImport, err := p.removeWatchCodePythonImport(oldModulePath, oldSymbolName, previousReferenceName)
		if err != nil {
			return false, err
		}
		didUpdate = didUpdate || removedImport
	}

	importUpdated, err := p.ensureWatchCodePythonImport(newCallable.ModulePath, newCallable.SymbolName, referenceName)
	if err != nil {
		return false, err
	}
	return didUpdate || importUpdated, nil
}

func setWatchCodeRegistryCallableName(
	projectData *WatchCodePluginProjectData,
	identity string,
	referenceName string,
) bool {
	entry := projectData.Registry[identity]
	if entry.CallableName == referenceName {
		return false
	}
	entry.CallableName = referenceName
	projectData.Registry[identity] = entry
	return true
}

func (p *Project) removeWatchCodeCallableFromSection(
	projectData *WatchCodePluginProjectData,
	sectionID string,
	callableName string,
) (bool, error) {
	if _, ok := p.Sections[sectionID]; !ok {
		return false, nil
	}

	variantsToRemove, err := p.watchCodeCallableVariantsForName(sectionID, callableName)
	if err != nil || len(variantsToRemove) == 0 {
		return false, err
	}

	section := p.Sections[sectionID]
	if len(section.VariantIDs) == len(variantsToRemove) {
		return true, nil
	}
	for _, variantID := range variantsToRemove {
		if err := p.deleteWatchCodeSectionVariant(projectData, sectionID, variantID); err != nil {
			return false, err
		}
	}
	return false, nil
}

func filterEdgesWithoutSectionVariant(edges []Edge, sectionID string, variantID string) []Edge {
	filteredEdges := make([]Edge, 0, len(edges))
	for _, edge := range edges {
		if (edge.SourceSectionID == sectionID && edge.SourceVariantID == variantID) ||
			(edge.TargetSectionID == sectionID && edge.TargetVariantID == variantID) {
			continue
		}
		filteredEdges = append(filteredEdges, edge)
	}
	return filteredEdges
}

func (p *Project) syncWatchCodeSectionVariantSelection(
	sectionID string,
	section *Section,
	removedVariantID string,
	fallbackVariantID string,
) {
	if section.DefaultVariantID == removedVariantID {
		section.DefaultVariantID = fallbackVariantID
	}
	if p.SectionVariantMap[sectionID] == removedVariantID {
		p.SectionVariantMap[sectionID] = fallbackVariantID
	}
}

func (p *Project) watchCodeUsedCodeObjectIDs() (map[string]struct{}, error) {
	usedCodeObjIDs := map[string]struct{}{}
	for sectionID, section := range p.Sections {
		for _, variantID := range collectSectionVariantIDs(*p, section) {
			if _, ok := p.SectionVariants[variantID]; !ok {
				continue
			}
			payload, err := effectiveSectionPayload(*p, sectionID, variantID)
			if err != nil {
				return nil, err
			}
			for codeObjID := range payloadStringMapField(payload, "codeObjVariantMap") {
				usedCodeObjIDs[codeObjID] = struct{}{}
			}
		}
	}
	return usedCodeObjIDs, nil
}

func (p *Project) reachableWatchCodeCodeObjects(rootIDs map[string]struct{}) (map[string]struct{}, error) {
	pending := make([]string, 0, len(rootIDs))
	for codeObjID := range rootIDs {
		pending = append(pending, codeObjID)
	}

	reachable := map[string]struct{}{}
	for len(pending) > 0 {
		lastIndex := len(pending) - 1
		codeObjID := pending[lastIndex]
		pending = pending[:lastIndex]
		if _, ok := reachable[codeObjID]; ok {
			continue
		}
		codeObj, ok := p.CodeObjs[codeObjID]
		if !ok {
			return nil, fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
		}
		reachable[codeObjID] = struct{}{}
		for _, variantID := range codeObj.VariantIDs {
			payload, err := effectiveCodeObjectPayloadForVariant(*p, codeObjID, variantID)
			if err != nil {
				return nil, err
			}
			pending = append(pending, payloadStringArrayField(payload, "children")...)
		}
	}
	return reachable, nil
}

func (p *Project) deleteUnusedWatchCodeCodeObjects(reachable map[string]struct{}) error {
	codeObjIDs := make([]string, 0, len(p.CodeObjs))
	for codeObjID := range p.CodeObjs {
		codeObjIDs = append(codeObjIDs, codeObjID)
	}
	sort.Strings(codeObjIDs)
	for _, codeObjID := range codeObjIDs {
		if _, ok := reachable[codeObjID]; ok {
			continue
		}
		if err := p.deleteWatchCodeCodeObject(codeObjID); err != nil {
			return err
		}
	}
	return nil
}
