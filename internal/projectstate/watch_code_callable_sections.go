package projectstate

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode"

	"setta/internal/watchcode"
)

func (p *Project) applyWatchCodeScanPlan(
	ctx context.Context,
	plan watchcode.ScanPlan,
	resolver CallableSignatureResolver,
) (bool, error) {
	return p.applyWatchCodeScanPlanWithParsedSignatures(ctx, plan, resolver, nil)
}

func (p *Project) applyWatchCodeScanPlanWithParsedSignatures(
	ctx context.Context,
	plan watchcode.ScanPlan,
	resolver CallableSignatureResolver,
	parsedSignatures map[string]CallableSignatureResult,
) (bool, error) {
	state := newWatchCodeScanPlanState()
	state.markUpdated(p.applyWatchCodePrunedBaseline(plan.SourcePath, plan.PrunedBaseline))

	if err := p.applyWatchCodeRenamePlans(plan.SourcePath, plan.Renames, state); err != nil {
		return false, err
	}

	updated, err := p.removeWatchCodeIdentities(plan.RemovedIdentities)
	if err != nil {
		return false, err
	}
	state.markUpdated(updated)

	if err := p.applyWatchCodeMetadataChanges(plan.SourcePath, plan.MetadataChanges, state); err != nil {
		return false, err
	}
	if err := p.applyWatchCodeSignatureChanges(plan.SourcePath, plan.SignatureChanges, state); err != nil {
		return false, err
	}

	state.markUpdated(p.applyWatchCodeAdditions(plan.SourcePath, plan.Additions, state))

	updated, err = p.ensurePendingWatchCodeCallableSections(
		ctx,
		state.pendingByIdentity,
		resolver,
		parsedSignatures,
	)
	if err != nil {
		return false, err
	}
	state.markUpdated(updated)

	updated, err = p.refetchPendingWatchCodeCallableSections(
		ctx,
		state.signatureRefetchByIdentity,
		resolver,
		parsedSignatures,
	)
	if err != nil {
		return false, err
	}
	state.markUpdated(updated)

	return state.didUpdate, nil
}

type watchCodeScanPlanState struct {
	didUpdate                  bool
	pendingByIdentity          map[string]watchcode.CallableInfo
	signatureRefetchByIdentity map[string]watchcode.CallableInfo
}

func newWatchCodeScanPlanState() *watchCodeScanPlanState {
	return &watchCodeScanPlanState{
		pendingByIdentity:          map[string]watchcode.CallableInfo{},
		signatureRefetchByIdentity: map[string]watchcode.CallableInfo{},
	}
}

func (s *watchCodeScanPlanState) markUpdated(updated bool) {
	if updated {
		s.didUpdate = true
	}
}

func (s *watchCodeScanPlanState) trackPending(identity string, callable watchcode.CallableInfo) {
	s.pendingByIdentity[identity] = callable
}

func (s *watchCodeScanPlanState) trackSignatureRefetch(identity string, callable watchcode.CallableInfo) {
	s.signatureRefetchByIdentity[identity] = callable
}

func (p *Project) applyWatchCodePrunedBaseline(sourcePath string, prunedBaseline []string) bool {
	if _, ok := p.WatchCodeBaselineByPath[sourcePath]; !ok {
		return false
	}
	return p.setWatchCodeBaseline(sourcePath, prunedBaseline)
}

func (p *Project) applyWatchCodeRenamePlans(
	sourcePath string,
	renames []watchcode.RenamePlan,
	state *watchCodeScanPlanState,
) error {
	for _, rename := range renames {
		updated, pending, err := p.applyWatchCodeRename(rename, sourcePath)
		if err != nil {
			return err
		}
		state.markUpdated(updated)
		if pending {
			state.trackPending(rename.NewCallable.Identity, rename.NewCallable)
		}
	}
	return nil
}

func (p *Project) removeWatchCodeIdentities(identities []string) (bool, error) {
	didUpdate := false
	for _, identity := range identities {
		updated, err := p.removeWatchCodeIdentity(identity)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
	}
	return didUpdate, nil
}

func (p *Project) applyWatchCodeMetadataChanges(
	sourcePath string,
	changes []watchcode.MetadataChangePlan,
	state *watchCodeScanPlanState,
) error {
	for _, change := range changes {
		if err := p.applyWatchCodeTrackedCallableChange(
			sourcePath,
			change.Identity,
			change.Callable,
			false,
			state,
		); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) applyWatchCodeSignatureChanges(
	sourcePath string,
	changes []watchcode.SignatureChangePlan,
	state *watchCodeScanPlanState,
) error {
	for _, change := range changes {
		if err := p.applyWatchCodeTrackedCallableChange(
			sourcePath,
			change.Identity,
			change.Callable,
			true,
			state,
		); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) applyWatchCodeTrackedCallableChange(
	sourcePath string,
	identity string,
	callable watchcode.CallableInfo,
	shouldRefetch bool,
	state *watchCodeScanPlanState,
) error {
	state.markUpdated(p.applyWatchCodeMetadataChange(identity, callable, sourcePath))
	if shouldRefetch {
		state.trackSignatureRefetch(identity, callable)
	}

	pending, err := p.watchCodeEntryNeedsSection(identity)
	if err != nil {
		return err
	}
	if pending {
		state.trackPending(identity, callable)
	}
	return nil
}

func (p *Project) applyWatchCodeAdditions(
	sourcePath string,
	additions []watchcode.CallableInfo,
	state *watchCodeScanPlanState,
) bool {
	didUpdate := false
	for _, addition := range additions {
		if _, ok := p.WatchCodeRegistry[addition.Identity]; !ok {
			p.WatchCodeRegistry[addition.Identity] = WatchCodeRegistryEntry{
				CallableName:  addition.CanonicalName,
				Kind:          fromWatchcodeCallableKind(addition.Kind),
				SignatureHash: addition.SignatureHash,
				BodyHash:      addition.BodyHash,
				SourcePath:    sourcePath,
				SectionIDs:    []string{},
				SectionsCount: 0,
			}
			didUpdate = true
		}
		state.trackPending(addition.Identity, addition)
	}
	return didUpdate
}

func (p *Project) ensurePendingWatchCodeCallableSections(
	ctx context.Context,
	pendingByIdentity map[string]watchcode.CallableInfo,
	resolver CallableSignatureResolver,
	parsedSignatures map[string]CallableSignatureResult,
) (bool, error) {
	didUpdate := false
	for _, identity := range sortedWatchCodeCallableIdentities(pendingByIdentity) {
		updated, err := p.ensureWatchCodeCallableSection(
			ctx,
			identity,
			pendingByIdentity[identity],
			resolver,
			parsedSignatures[identity],
		)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
	}
	return didUpdate, nil
}

func (p *Project) refetchPendingWatchCodeCallableSections(
	ctx context.Context,
	signatureRefetchByIdentity map[string]watchcode.CallableInfo,
	resolver CallableSignatureResolver,
	parsedSignatures map[string]CallableSignatureResult,
) (bool, error) {
	didUpdate := false
	for _, identity := range sortedWatchCodeCallableIdentities(signatureRefetchByIdentity) {
		updated, err := p.refetchWatchCodeCallableSections(
			ctx,
			identity,
			resolver,
			parsedSignatures[identity],
		)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
	}
	return didUpdate, nil
}

func sortedWatchCodeCallableIdentities(callablesByIdentity map[string]watchcode.CallableInfo) []string {
	identities := make([]string, 0, len(callablesByIdentity))
	for identity := range callablesByIdentity {
		identities = append(identities, identity)
	}
	sort.Strings(identities)
	return identities
}

func (p *Project) applyWatchCodeDeletePlan(plan watchcode.DeletePlan) (bool, error) {
	didUpdate := false
	for _, identity := range plan.RemovedIdentities {
		updated, err := p.removeWatchCodeIdentity(identity)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
	}
	if plan.RemoveBaselinePath {
		if _, ok := p.WatchCodeBaselineByPath[plan.SourcePath]; ok {
			delete(p.WatchCodeBaselineByPath, plan.SourcePath)
			didUpdate = true
		}
	}
	return didUpdate, nil
}

func (p *Project) watchCodeEntryNeedsSection(identity string) (bool, error) {
	entry, ok := p.WatchCodeRegistry[identity]
	if !ok {
		return false, nil
	}
	entry, updated := p.normalizeWatchCodeRegistryEntrySections(entry)
	if updated {
		p.WatchCodeRegistry[identity] = entry
	}
	return len(entry.SectionIDs) == 0, nil
}

func (p *Project) ensureWatchCodeCallableSection(
	ctx context.Context,
	identity string,
	callable watchcode.CallableInfo,
	resolver CallableSignatureResolver,
	parsedSignature CallableSignatureResult,
) (bool, error) {
	entry, ok := p.WatchCodeRegistry[identity]
	if !ok {
		return false, nil
	}
	ctx = watchCodeContext(ctx)

	didUpdate := false
	entry, updated := p.normalizeWatchCodeRegistryEntrySections(entry)
	markWatchCodeUpdated(&didUpdate, updated)

	entry, previousReferenceName, referenceName, updated, err := p.syncWatchCodeEntryReferenceName(
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

	p.WatchCodeRegistry[identity] = entry

	bound, err := p.bindWatchCodeCallableSections(
		ctx,
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
	identity string,
	resolver CallableSignatureResolver,
	parsedSignature CallableSignatureResult,
) (bool, error) {
	entry, ok := p.WatchCodeRegistry[identity]
	if !ok {
		return false, nil
	}
	ctx = watchCodeContext(ctx)

	didUpdate := false
	entry, updated := p.normalizeWatchCodeRegistryEntrySections(entry)
	if updated {
		p.WatchCodeRegistry[identity] = entry
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
		updated, err := p.refetchWatchCodeCallableSectionVariants(ctx, sectionID, callableName, signatureResolver)
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
	identity string,
	entry WatchCodeRegistryEntry,
	callable watchcode.CallableInfo,
) (WatchCodeRegistryEntry, string, string, bool, error) {
	previousReferenceName := strings.TrimSpace(entry.CallableName)
	referenceName := p.resolveWatchCodeReferenceName(callable, identity)
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
		updated, err := p.refetchWatchCodeCallableSectionVariant(ctx, sectionID, variantID, callableName, resolver)
		if err != nil {
			return false, err
		}
		didUpdate = didUpdate || updated
	}
	return didUpdate, nil
}

func (p *Project) refetchWatchCodeCallableSectionVariant(
	ctx context.Context,
	sectionID string,
	variantID string,
	callableName string,
	resolver CallableSignatureResolver,
) (bool, error) {
	var response SetCallableResponse
	if err := p.withSectionVariantSelected(sectionID, variantID, func() error {
		var setCallableErr error
		response, setCallableErr = p.SetCallable(ctx, sectionID, callableName, true, resolver)
		return setCallableErr
	}); err != nil {
		return false, err
	}
	return response.LSPStatus != SignatureHelpStatusSkipped, nil
}

func (p *Project) replaceWatchCodeRegistryIdentity(
	oldIdentity string,
	newCallable watchcode.CallableInfo,
	sourcePath string,
	entry WatchCodeRegistryEntry,
) {
	delete(p.WatchCodeRegistry, oldIdentity)
	entry.Kind = fromWatchcodeCallableKind(newCallable.Kind)
	entry.SignatureHash = newCallable.SignatureHash
	entry.BodyHash = newCallable.BodyHash
	entry.SourcePath = sourcePath
	p.WatchCodeRegistry[newCallable.Identity] = entry
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

func (p *Project) setWatchCodeRegistryCallableName(identity string, referenceName string) bool {
	entry := p.WatchCodeRegistry[identity]
	if entry.CallableName == referenceName {
		return false
	}
	entry.CallableName = referenceName
	p.WatchCodeRegistry[identity] = entry
	return true
}

func (p *Project) removeWatchCodeCallableFromSection(sectionID string, callableName string) (bool, error) {
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
		if err := p.deleteWatchCodeSectionVariant(sectionID, variantID); err != nil {
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

func watchCodeParsedSignatureResults(callables []watchcode.CallableInfo) map[string]CallableSignatureResult {
	if len(callables) == 0 {
		return nil
	}

	output := make(map[string]CallableSignatureResult, len(callables))
	for _, callable := range callables {
		output[callable.Identity] = CallableSignatureResult{
			Status: SignatureHelpStatusMatched,
			Params: watchCodeParamProposals(callable),
		}
	}
	return output
}

func watchCodeParamProposals(callable watchcode.CallableInfo) []CallableParamProposal {
	proposals := make([]CallableParamProposal, 0, len(callable.Params))
	for _, param := range callable.Params {
		proposals = append(proposals, CallableParamProposal{
			Name:           strings.TrimSpace(param.Name),
			DefaultValue:   strings.TrimSpace(param.DefaultValue),
			TypeAnnotation: strings.TrimSpace(param.TypeAnnotation),
			PassingStyle:   strings.TrimSpace(param.PassingStyle),
		})
	}
	return proposals
}

func wrapWatchCodeParsedSignatureResolver(
	callableName string,
	parsedSignature CallableSignatureResult,
	fallback CallableSignatureResolver,
) CallableSignatureResolver {
	if parsedSignature.Status != SignatureHelpStatusMatched {
		return fallback
	}
	return watchCodeParsedSignatureResolver{
		callableName:     strings.TrimSpace(callableName),
		parsedSignature:  parsedSignature,
		fallbackResolver: fallback,
	}
}

type watchCodeParsedSignatureResolver struct {
	callableName     string
	parsedSignature  CallableSignatureResult
	fallbackResolver CallableSignatureResolver
}

func (r watchCodeParsedSignatureResolver) recordFinalStatus(callableName string, status SignatureHelpStatus) {
	recorder, ok := r.fallbackResolver.(CallableSignatureStatusRecorder)
	if !ok {
		return
	}
	recorder.RecordCallableSignatureStatus(callableName, status)
}

func (r watchCodeParsedSignatureResolver) ResolveCallableSignature(
	ctx context.Context,
	project Project,
	sectionID string,
	callableName string,
) (CallableSignatureResult, bool, error) {
	trimmedCallableName := strings.TrimSpace(callableName)
	if trimmedCallableName == "" {
		return CallableSignatureResult{}, false, nil
	}
	if trimmedCallableName != r.callableName {
		if r.fallbackResolver == nil {
			return CallableSignatureResult{}, false, nil
		}
		return r.fallbackResolver.ResolveCallableSignature(ctx, project, sectionID, callableName)
	}

	if r.fallbackResolver == nil {
		return r.parsedSignature, true, nil
	}

	result, ok, err := r.fallbackResolver.ResolveCallableSignature(ctx, project, sectionID, callableName)
	if err != nil {
		return CallableSignatureResult{}, false, err
	}
	if !ok {
		r.recordFinalStatus(trimmedCallableName, r.parsedSignature.Status)
		return r.parsedSignature, true, nil
	}
	if result.Status != SignatureHelpStatusMatched || !sameCallableParamNames(result.Params, r.parsedSignature.Params) {
		parsedResult := r.parsedSignature
		if strings.TrimSpace(result.Documentation) != "" {
			parsedResult.Documentation = result.Documentation
		}
		r.recordFinalStatus(trimmedCallableName, parsedResult.Status)
		return parsedResult, true, nil
	}
	r.recordFinalStatus(trimmedCallableName, result.Status)
	return result, true, nil
}

func sameCallableParamNames(left []CallableParamProposal, right []CallableParamProposal) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if strings.TrimSpace(left[index].Name) != strings.TrimSpace(right[index].Name) {
			return false
		}
	}
	return true
}

func (p *Project) applyWatchCodeRename(plan watchcode.RenamePlan, sourcePath string) (bool, bool, error) {
	entry, ok := p.WatchCodeRegistry[plan.OldIdentity]
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

	p.replaceWatchCodeRegistryIdentity(plan.OldIdentity, plan.NewCallable, sourcePath, entry)
	didUpdate = true

	referenceName := p.resolveWatchCodeReferenceName(plan.NewCallable, plan.NewCallable.Identity)
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

	didUpdate = didUpdate || p.setWatchCodeRegistryCallableName(plan.NewCallable.Identity, referenceName)

	entry = p.WatchCodeRegistry[plan.NewCallable.Identity]
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

func (p *Project) removeWatchCodeIdentity(identity string) (bool, error) {
	entry, ok := p.WatchCodeRegistry[identity]
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
		deleteSection, err := p.removeWatchCodeCallableFromSection(sectionID, entry.CallableName)
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

	delete(p.WatchCodeRegistry, identity)
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

func (p *Project) deleteWatchCodeSectionVariant(sectionID string, variantID string) error {
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
	return p.syncWatchCodeRegistrySectionMembership(sectionID)
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

func (p *Project) bindWatchCodeCallableSections(
	ctx context.Context,
	sectionIDs []string,
	callableName string,
	resolver CallableSignatureResolver,
) (bool, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	didUpdate := false
	for _, sectionID := range uniqueSortedTrimmedStrings(sectionIDs) {
		if _, ok := p.Sections[sectionID]; !ok {
			continue
		}
		updated, err := p.ensureWatchCodeCallableSelection(sectionID, callableName)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
		if !updated {
			continue
		}
		response, err := p.SetCallable(ctx, sectionID, callableName, true, resolver)
		if err != nil {
			return false, err
		}
		if response.LSPStatus != SignatureHelpStatusSkipped {
			didUpdate = true
		}
	}
	return didUpdate, nil
}

func (p *Project) ensureWatchCodeCallableSelection(sectionID string, callableName string) (bool, error) {
	trimmedCallableName := strings.TrimSpace(callableName)
	if trimmedCallableName == "" {
		return false, nil
	}
	sectionPayload, err := p.currentCallableSectionPayload(sectionID)
	if err != nil {
		if errors.Is(err, ErrCallableSectionRequired) {
			return false, nil
		}
		return false, err
	}
	currentCallableID := payloadStringField(sectionPayload, "callable")
	if currentCallableID != "" && p.callableNameByID(currentCallableID) == trimmedCallableName {
		return false, nil
	}

	targetCallableID := p.findCallableIDByName(sectionPayload, trimmedCallableName)
	if targetCallableID == "" {
		callableCore, callableVariant, callableImpl, err := newCallableCodeObject(trimmedCallableName, "")
		if err != nil {
			return false, err
		}
		targetCallableID = callableCore.ID
		p.CodeObjs[callableCore.ID] = callableCore
		p.CodeObjVariants[callableVariant.ID] = callableVariant
		p.CodeObjImpls[callableImpl.ID] = callableImpl
		if err := p.setSectionCodeObjectVariant(sectionID, callableCore.ID, callableVariant.ID); err != nil {
			return false, err
		}
	}
	if err := p.setCurrentSectionField(sectionID, "callable", targetCallableID); err != nil {
		return false, err
	}
	return true, nil
}

func (p *Project) renameWatchCodeCallableSections(
	sectionIDs []string,
	previousCallableName string,
	callableName string,
) (bool, error) {
	trimmedPreviousCallableName := strings.TrimSpace(previousCallableName)
	trimmedCallableName := strings.TrimSpace(callableName)
	if trimmedPreviousCallableName == "" || trimmedPreviousCallableName == trimmedCallableName {
		return false, nil
	}

	didUpdate := false
	for _, sectionID := range uniqueSortedTrimmedStrings(sectionIDs) {
		if _, ok := p.Sections[sectionID]; !ok {
			continue
		}
		variantIDs, err := p.watchCodeCallableVariantsForName(sectionID, trimmedPreviousCallableName)
		if err != nil {
			return false, err
		}
		for _, variantID := range variantIDs {
			updated, err := p.renameWatchCodeCallableSectionVariant(sectionID, variantID, trimmedCallableName)
			if err != nil {
				return false, err
			}
			didUpdate = didUpdate || updated
		}
	}
	return didUpdate, nil
}

func (p *Project) renameWatchCodeCallableSectionVariant(
	sectionID string,
	variantID string,
	callableName string,
) (bool, error) {
	didUpdate := false
	if err := p.withSectionVariantSelected(sectionID, variantID, func() error {
		sectionPayload, err := p.currentCallableSectionPayload(sectionID)
		if err != nil {
			if errors.Is(err, ErrCallableSectionRequired) {
				return nil
			}
			return err
		}
		callableID := payloadStringField(sectionPayload, "callable")
		if callableID == "" {
			return nil
		}
		codeObj, ok := p.CodeObjs[callableID]
		if !ok {
			return fmt.Errorf("%w: %q", ErrCodeObjNotFound, callableID)
		}
		if codeObj.Name == callableName {
			return nil
		}
		codeObj.Name = callableName
		p.CodeObjs[callableID] = codeObj
		didUpdate = true
		return nil
	}); err != nil {
		return false, err
	}
	return didUpdate, nil
}

func (p *Project) createWatchCodeCallableSection() (string, error) {
	if p == nil {
		return "", ErrProjectNotFound
	}

	result, err := p.CreateTopLevelSection(
		CreateTopLevelSectionInput{
			ImplType: "Callable",
		},
		DefaultStructuralMutationSettings(),
	)
	if err != nil {
		return "", err
	}
	return result.SectionID, nil
}

func (p *Project) resolveWatchCodeReferenceName(callable watchcode.CallableInfo, excludeIdentity string) string {
	reserved := map[string]struct{}{}
	for identity, entry := range p.WatchCodeRegistry {
		if excludeIdentity != "" && identity == excludeIdentity {
			continue
		}
		if trimmed := strings.TrimSpace(entry.CallableName); trimmed != "" {
			reserved[trimmed] = struct{}{}
		}
	}
	base := strings.TrimSpace(callable.SymbolName)
	if base == "" {
		return strings.TrimSpace(callable.CanonicalName)
	}
	if _, ok := reserved[base]; !ok {
		return base
	}
	for suffix := 2; ; suffix++ {
		candidate := fmt.Sprintf("%s%d", base, suffix)
		if _, ok := reserved[candidate]; !ok {
			return candidate
		}
	}
}

func splitWatchCodeCanonicalIdentity(identity string) (string, string, error) {
	trimmedIdentity := strings.TrimSpace(identity)
	if trimmedIdentity == "" || !strings.Contains(trimmedIdentity, ":") {
		return "", "", fmt.Errorf("invalid watch code identity %q", identity)
	}
	canonicalName := strings.TrimSpace(strings.SplitN(trimmedIdentity, ":", 2)[0])
	if canonicalName == "" {
		return "", "", fmt.Errorf("invalid watch code identity %q", identity)
	}
	lastDot := strings.LastIndex(canonicalName, ".")
	if lastDot < 0 {
		return "", canonicalName, nil
	}
	return canonicalName[:lastDot], canonicalName[lastDot+1:], nil
}

func (p *Project) ensureWatchCodePythonImport(modulePath string, symbolName string, referenceName string) (bool, error) {
	target, ok, err := p.PythonCodegenTarget()
	if err != nil {
		return false, err
	}
	if !ok || !watchCodeImportPathValid(modulePath, symbolName, referenceName) {
		return false, nil
	}
	importLine := buildWatchCodeImportLine(modulePath, symbolName, referenceName)
	existingLines := strings.Split(target.GenCodePrefix, "\n")
	if watchCodeImportAlreadyPresent(existingLines, modulePath, symbolName, referenceName, importLine) {
		return false, nil
	}

	prefix := target.GenCodePrefix
	if prefix != "" && !strings.HasSuffix(prefix, "\n") {
		prefix += "\n"
	}
	target.GenCodePrefix = prefix + importLine + "\n"
	if err := p.SetPythonCodegenTarget(target); err != nil {
		return false, err
	}
	return true, nil
}

func watchCodeImportAlreadyPresent(
	lines []string,
	modulePath string,
	symbolName string,
	referenceName string,
	importLine string,
) bool {
	for _, line := range lines {
		if watchCodeImportLineMatches(line, modulePath, symbolName, referenceName, importLine) {
			return true
		}
	}
	return false
}

func watchCodeImportLineMatches(
	line string,
	modulePath string,
	symbolName string,
	referenceName string,
	importLine string,
) bool {
	stripped := strings.TrimSpace(line)
	if stripped == "" {
		return false
	}
	if stripped == importLine {
		return true
	}
	if !strings.HasPrefix(stripped, "from "+modulePath+" import") {
		return false
	}
	if commentIndex := strings.Index(stripped, "#"); commentIndex >= 0 {
		stripped = strings.TrimSpace(stripped[:commentIndex])
	}
	parts := strings.SplitN(stripped, "import", 2)
	if len(parts) != 2 {
		return false
	}
	return watchCodeImportListContains(parts[1], symbolName, referenceName)
}

func watchCodeImportListContains(importList string, symbolName string, referenceName string) bool {
	for _, item := range strings.Split(importList, ",") {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if referenceName == symbolName && trimmed == symbolName {
			return true
		}
		if referenceName != symbolName && trimmed == symbolName+" as "+referenceName {
			return true
		}
	}
	return false
}

func (p *Project) removeWatchCodePythonImport(modulePath string, symbolName string, referenceName string) (bool, error) {
	target, ok, err := p.PythonCodegenTarget()
	if err != nil {
		return false, err
	}
	if !ok || !watchCodeImportPathValid(modulePath, symbolName, referenceName) {
		return false, nil
	}
	importLine := buildWatchCodeImportLine(modulePath, symbolName, referenceName)
	lines := strings.Split(target.GenCodePrefix, "\n")
	kept := make([]string, 0, len(lines))
	removed := false
	for _, line := range lines {
		if strings.TrimSpace(line) == importLine {
			removed = true
			continue
		}
		kept = append(kept, line)
	}
	if !removed {
		return false, nil
	}
	newPrefix := strings.Join(kept, "\n")
	newPrefix = strings.TrimSuffix(newPrefix, "\n\n")
	if target.GenCodePrefix != "" && strings.HasSuffix(target.GenCodePrefix, "\n") && newPrefix != "" && !strings.HasSuffix(newPrefix, "\n") {
		newPrefix += "\n"
	}
	target.GenCodePrefix = newPrefix
	if err := p.SetPythonCodegenTarget(target); err != nil {
		return false, err
	}
	return true, nil
}

func buildWatchCodeImportLine(modulePath string, symbolName string, referenceName string) string {
	if strings.TrimSpace(referenceName) == strings.TrimSpace(symbolName) {
		return "from " + modulePath + " import " + symbolName
	}
	return "from " + modulePath + " import " + symbolName + " as " + referenceName
}

func watchCodeImportPathValid(modulePath string, symbolName string, referenceName string) bool {
	trimmedModulePath := strings.TrimSpace(modulePath)
	trimmedSymbolName := strings.TrimSpace(symbolName)
	trimmedReferenceName := strings.TrimSpace(referenceName)
	if trimmedModulePath == "" || trimmedSymbolName == "" || trimmedReferenceName == "" {
		return false
	}
	if strings.HasPrefix(trimmedModulePath, ".") {
		return false
	}
	for _, part := range strings.Split(trimmedModulePath, ".") {
		if !isPythonIdentifier(part) {
			return false
		}
	}
	return isPythonIdentifier(trimmedSymbolName) && isPythonIdentifier(trimmedReferenceName)
}

func isPythonIdentifier(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	for index, r := range trimmed {
		if index == 0 {
			if r != '_' && !unicode.IsLetter(r) {
				return false
			}
			continue
		}
		if r != '_' && !unicode.IsLetter(r) && !unicode.IsDigit(r) {
			return false
		}
	}
	return true
}

func (p *Project) pruneWatchCodeSectionIDs(entry WatchCodeRegistryEntry) []string {
	if len(entry.SectionIDs) == 0 {
		return nil
	}
	valid := make([]string, 0, len(entry.SectionIDs))
	for _, sectionID := range entry.SectionIDs {
		if _, ok := p.Sections[sectionID]; ok {
			valid = append(valid, sectionID)
		}
	}
	return valid
}

func (p *Project) syncWatchCodeRegistrySectionMembership(sectionID string) error {
	if p == nil || len(p.WatchCodeRegistry) == 0 {
		return nil
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return nil
	}

	callableNamesBySection, err := p.watchCodeCallableNamesForSection(trimmedSectionID)
	if err != nil {
		return err
	}

	for _, identity := range sortedWatchCodeRegistryIdentities(p.WatchCodeRegistry) {
		p.syncWatchCodeRegistryEntryMembership(identity, trimmedSectionID, callableNamesBySection)
	}

	return nil
}

func (p *Project) watchCodeCallableNamesForSection(sectionID string) (map[string]struct{}, error) {
	callableNamesBySection := map[string]struct{}{}
	section, ok := p.Sections[sectionID]
	if !ok {
		return callableNamesBySection, nil
	}

	for _, variantID := range collectSectionVariantIDs(*p, section) {
		callableName, ok, err := p.watchCodeCallableNameForVariant(sectionID, variantID)
		if err != nil {
			return nil, err
		}
		if ok {
			callableNamesBySection[callableName] = struct{}{}
		}
	}
	return callableNamesBySection, nil
}

func (p *Project) watchCodeCallableNameForVariant(sectionID string, variantID string) (string, bool, error) {
	if _, ok := p.SectionVariants[variantID]; !ok {
		return "", false, nil
	}
	payload, err := effectiveSectionPayload(*p, sectionID, variantID)
	if err != nil {
		return "", false, err
	}
	if !watchCodeSectionPayloadIsCallable(*p, payload, variantID) {
		return "", false, nil
	}
	callableID := payloadStringField(payload, "callable")
	if callableID == "" {
		return "", false, nil
	}
	codeObj, ok := p.CodeObjs[callableID]
	if !ok {
		return "", false, fmt.Errorf("%w: %q", ErrCodeObjNotFound, callableID)
	}
	callableName := strings.TrimSpace(codeObj.Name)
	if callableName == "" {
		return "", false, nil
	}
	return callableName, true, nil
}

func watchCodeSectionPayloadIsCallable(project Project, payload map[string]any, variantID string) bool {
	sectionType := payloadStringField(payload, "type")
	if sectionType == "" {
		implID := strings.TrimSpace(project.SectionVariants[variantID].ImplID)
		if impl, ok := project.SectionImpls[implID]; ok {
			sectionType = fallbackSectionType(impl)
		}
	}
	return sectionType == "Callable"
}

func sortedWatchCodeRegistryIdentities(registry map[string]WatchCodeRegistryEntry) []string {
	identities := make([]string, 0, len(registry))
	for identity := range registry {
		identities = append(identities, identity)
	}
	sort.Strings(identities)
	return identities
}

func (p *Project) syncWatchCodeRegistryEntryMembership(
	identity string,
	sectionID string,
	callableNamesBySection map[string]struct{},
) {
	entry := p.WatchCodeRegistry[identity]
	nextSectionIDs := filterStringSlice(
		uniqueSortedTrimmedStrings(p.pruneWatchCodeSectionIDs(entry)),
		map[string]struct{}{sectionID: {}},
	)
	if _, ok := callableNamesBySection[strings.TrimSpace(entry.CallableName)]; ok {
		nextSectionIDs = uniqueSortedTrimmedStrings(append(nextSectionIDs, sectionID))
	}
	if stringSlicesEqual(entry.SectionIDs, nextSectionIDs) && entry.SectionsCount == len(nextSectionIDs) {
		return
	}
	entry.SectionIDs = nextSectionIDs
	entry.SectionsCount = len(nextSectionIDs)
	p.WatchCodeRegistry[identity] = entry
}

func (p *Project) withSectionVariantSelected(
	sectionID string,
	variantID string,
	run func() error,
) error {
	if run == nil {
		return nil
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	trimmedVariantID := strings.TrimSpace(variantID)
	if p.SectionVariantMap == nil {
		p.SectionVariantMap = map[string]string{}
	}
	originalVariantID, hadOriginal := p.SectionVariantMap[trimmedSectionID]
	p.SectionVariantMap[trimmedSectionID] = trimmedVariantID
	defer func() {
		if hadOriginal {
			p.SectionVariantMap[trimmedSectionID] = originalVariantID
			return
		}
		delete(p.SectionVariantMap, trimmedSectionID)
	}()
	return run()
}

func stringSlicesEqual(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
