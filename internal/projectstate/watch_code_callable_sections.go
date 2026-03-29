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
	didUpdate := false
	signatureRefetchIdentities := map[string]struct{}{}

	if _, ok := p.WatchCodeBaselineByPath[plan.SourcePath]; ok {
		if p.setWatchCodeBaseline(plan.SourcePath, plan.PrunedBaseline) {
			didUpdate = true
		}
	}

	pendingByIdentity := map[string]watchcode.CallableInfo{}

	for _, rename := range plan.Renames {
		updated, pending, err := p.applyWatchCodeRename(rename, plan.SourcePath)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
		if pending {
			pendingByIdentity[rename.NewCallable.Identity] = rename.NewCallable
		}
	}

	for _, identity := range plan.RemovedIdentities {
		updated, err := p.removeWatchCodeIdentity(identity)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
	}

	for _, metadataChange := range plan.MetadataChanges {
		if p.applyWatchCodeMetadataChange(metadataChange.Identity, metadataChange.Callable, plan.SourcePath) {
			didUpdate = true
		}
		pending, err := p.watchCodeEntryNeedsSection(metadataChange.Identity)
		if err != nil {
			return false, err
		}
		if pending {
			pendingByIdentity[metadataChange.Identity] = metadataChange.Callable
		}
	}

	for _, signatureChange := range plan.SignatureChanges {
		if p.applyWatchCodeMetadataChange(signatureChange.Identity, signatureChange.Callable, plan.SourcePath) {
			didUpdate = true
		}
		signatureRefetchIdentities[signatureChange.Identity] = struct{}{}
		pending, err := p.watchCodeEntryNeedsSection(signatureChange.Identity)
		if err != nil {
			return false, err
		}
		if pending {
			pendingByIdentity[signatureChange.Identity] = signatureChange.Callable
		}
	}

	for _, addition := range plan.Additions {
		if _, ok := p.WatchCodeRegistry[addition.Identity]; !ok {
			p.WatchCodeRegistry[addition.Identity] = WatchCodeRegistryEntry{
				CallableName:  addition.CanonicalName,
				Kind:          fromWatchcodeCallableKind(addition.Kind),
				SignatureHash: addition.SignatureHash,
				BodyHash:      addition.BodyHash,
				SourcePath:    plan.SourcePath,
				SectionIDs:    []string{},
				SectionsCount: 0,
			}
			didUpdate = true
		}
		pendingByIdentity[addition.Identity] = addition
	}

	pendingIdentities := make([]string, 0, len(pendingByIdentity))
	for identity := range pendingByIdentity {
		pendingIdentities = append(pendingIdentities, identity)
	}
	sort.Strings(pendingIdentities)
	for _, identity := range pendingIdentities {
		updated, err := p.ensureWatchCodeCallableSection(ctx, identity, pendingByIdentity[identity], resolver)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
	}

	refetchIdentities := make([]string, 0, len(signatureRefetchIdentities))
	for identity := range signatureRefetchIdentities {
		refetchIdentities = append(refetchIdentities, identity)
	}
	sort.Strings(refetchIdentities)
	for _, identity := range refetchIdentities {
		updated, err := p.refetchWatchCodeCallableSections(ctx, identity, resolver)
		if err != nil {
			return false, err
		}
		if updated {
			didUpdate = true
		}
	}

	return didUpdate, nil
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
	validSectionIDs := p.pruneWatchCodeSectionIDs(entry)
	if !stringSlicesEqual(entry.SectionIDs, validSectionIDs) || entry.SectionsCount != len(validSectionIDs) {
		entry.SectionIDs = validSectionIDs
		entry.SectionsCount = len(validSectionIDs)
		p.WatchCodeRegistry[identity] = entry
	}
	return len(validSectionIDs) == 0, nil
}

func (p *Project) ensureWatchCodeCallableSection(
	ctx context.Context,
	identity string,
	callable watchcode.CallableInfo,
	resolver CallableSignatureResolver,
) (bool, error) {
	entry, ok := p.WatchCodeRegistry[identity]
	if !ok {
		return false, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	didUpdate := false
	validSectionIDs := p.pruneWatchCodeSectionIDs(entry)
	if !stringSlicesEqual(entry.SectionIDs, validSectionIDs) || entry.SectionsCount != len(validSectionIDs) {
		entry.SectionIDs = validSectionIDs
		entry.SectionsCount = len(validSectionIDs)
		didUpdate = true
	}

	previousReferenceName := strings.TrimSpace(entry.CallableName)
	referenceName := p.resolveWatchCodeReferenceName(callable, identity)
	if previousReferenceName != referenceName {
		modulePath, symbolName, err := splitWatchCodeCanonicalIdentity(identity)
		if err != nil {
			return false, err
		}
		removedImport, err := p.removeWatchCodePythonImport(modulePath, symbolName, previousReferenceName)
		if err != nil {
			return false, err
		}
		if removedImport {
			didUpdate = true
		}
		entry.CallableName = referenceName
		didUpdate = true
	}

	importUpdated, err := p.ensureWatchCodePythonImport(callable.ModulePath, callable.SymbolName, referenceName)
	if err != nil {
		return false, err
	}
	if importUpdated {
		didUpdate = true
	}

	createdSection := false
	if len(entry.SectionIDs) == 0 {
		sectionID, err := p.createWatchCodeCallableSection()
		if err != nil {
			return false, err
		}
		entry.SectionIDs = []string{sectionID}
		entry.SectionsCount = 1
		createdSection = true
		didUpdate = true
	}

	p.WatchCodeRegistry[identity] = entry

	bound, err := p.bindWatchCodeCallableSections(ctx, entry.SectionIDs, referenceName, resolver)
	if err != nil {
		return false, err
	}
	if bound {
		didUpdate = true
	}

	if !createdSection && previousReferenceName != "" && previousReferenceName != referenceName {
		renamed, err := p.renameWatchCodeCallableSections(
			entry.SectionIDs,
			previousReferenceName,
			referenceName,
		)
		if err != nil {
			return false, err
		}
		if renamed {
			didUpdate = true
		}
	}

	return didUpdate, nil
}

func (p *Project) refetchWatchCodeCallableSections(
	ctx context.Context,
	identity string,
	resolver CallableSignatureResolver,
) (bool, error) {
	entry, ok := p.WatchCodeRegistry[identity]
	if !ok {
		return false, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	didUpdate := false
	validSectionIDs := p.pruneWatchCodeSectionIDs(entry)
	if !stringSlicesEqual(entry.SectionIDs, validSectionIDs) || entry.SectionsCount != len(validSectionIDs) {
		entry.SectionIDs = validSectionIDs
		entry.SectionsCount = len(validSectionIDs)
		p.WatchCodeRegistry[identity] = entry
		didUpdate = true
	}
	if len(validSectionIDs) == 0 {
		return didUpdate, nil
	}

	callableName := strings.TrimSpace(entry.CallableName)
	if callableName == "" {
		return didUpdate, nil
	}

	for _, sectionID := range uniqueSortedTrimmedStrings(validSectionIDs) {
		if _, ok := p.Sections[sectionID]; !ok {
			continue
		}
		variantIDs, err := p.watchCodeCallableVariantsForName(sectionID, callableName)
		if err != nil {
			return false, err
		}
		for _, variantID := range variantIDs {
			var response SetCallableResponse
			if err := p.withSectionVariantSelected(sectionID, variantID, func() error {
				var setCallableErr error
				response, setCallableErr = p.SetCallable(ctx, sectionID, callableName, true, resolver)
				return setCallableErr
			}); err != nil {
				return false, err
			}
			if response.LSPStatus != SignatureHelpStatusSkipped {
				didUpdate = true
			}
		}
	}

	return didUpdate, nil
}

func (p *Project) applyWatchCodeRename(plan watchcode.RenamePlan, sourcePath string) (bool, bool, error) {
	entry, ok := p.WatchCodeRegistry[plan.OldIdentity]
	if !ok {
		return false, false, nil
	}

	didUpdate := false
	entry.SectionIDs = p.pruneWatchCodeSectionIDs(entry)
	entry.SectionsCount = len(entry.SectionIDs)

	previousReferenceName := strings.TrimSpace(entry.CallableName)
	oldModulePath, oldSymbolName, err := splitWatchCodeCanonicalIdentity(plan.OldIdentity)
	if err != nil {
		return false, false, err
	}

	delete(p.WatchCodeRegistry, plan.OldIdentity)
	entry.Kind = fromWatchcodeCallableKind(plan.NewCallable.Kind)
	entry.SignatureHash = plan.NewCallable.SignatureHash
	entry.BodyHash = plan.NewCallable.BodyHash
	entry.SourcePath = sourcePath
	p.WatchCodeRegistry[plan.NewCallable.Identity] = entry
	didUpdate = true

	referenceName := p.resolveWatchCodeReferenceName(plan.NewCallable, plan.NewCallable.Identity)
	if previousReferenceName != referenceName || oldModulePath != plan.NewCallable.ModulePath || oldSymbolName != plan.NewCallable.SymbolName {
		removedImport, err := p.removeWatchCodePythonImport(oldModulePath, oldSymbolName, previousReferenceName)
		if err != nil {
			return false, false, err
		}
		if removedImport {
			didUpdate = true
		}
	}
	importUpdated, err := p.ensureWatchCodePythonImport(plan.NewCallable.ModulePath, plan.NewCallable.SymbolName, referenceName)
	if err != nil {
		return false, false, err
	}
	if importUpdated {
		didUpdate = true
	}

	entry = p.WatchCodeRegistry[plan.NewCallable.Identity]
	if entry.CallableName != referenceName {
		entry.CallableName = referenceName
		p.WatchCodeRegistry[plan.NewCallable.Identity] = entry
		didUpdate = true
	}

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
		if _, ok := p.Sections[sectionID]; !ok {
			continue
		}
		variantsToRemove, err := p.watchCodeCallableVariantsForName(sectionID, entry.CallableName)
		if err != nil {
			return false, err
		}
		if len(variantsToRemove) == 0 {
			continue
		}
		section := p.Sections[sectionID]
		if len(section.VariantIDs) == len(variantsToRemove) {
			sectionsToDelete = append(sectionsToDelete, sectionID)
			continue
		}
		for _, variantID := range variantsToRemove {
			if err := p.deleteWatchCodeSectionVariant(sectionID, variantID); err != nil {
				return false, err
			}
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

	filteredEdges := make([]Edge, 0, len(p.Edges))
	for _, edge := range p.Edges {
		if (edge.SourceSectionID == sectionID && edge.SourceVariantID == variantID) ||
			(edge.TargetSectionID == sectionID && edge.TargetVariantID == variantID) {
			continue
		}
		filteredEdges = append(filteredEdges, edge)
	}
	p.Edges = filteredEdges

	nextVariants := make([]string, 0, len(section.VariantIDs)-1)
	for _, candidate := range section.VariantIDs {
		if candidate == variantID {
			continue
		}
		nextVariants = append(nextVariants, candidate)
	}
	if len(nextVariants) == 0 {
		return nil
	}
	section.VariantIDs = nextVariants
	if section.DefaultVariantID == variantID {
		section.DefaultVariantID = nextVariants[0]
	}
	if p.SectionVariantMap[sectionID] == variantID {
		p.SectionVariantMap[sectionID] = nextVariants[0]
	}
	p.Sections[sectionID] = section
	delete(p.SectionVariants, variantID)

	if err := p.pruneUnusedCodeObjects(); err != nil {
		return err
	}
	return p.syncWatchCodeRegistrySectionMembership(sectionID)
}

func (p *Project) pruneUnusedCodeObjects() error {
	usedCodeObjIDs := map[string]struct{}{}
	for sectionID, section := range p.Sections {
		for _, variantID := range collectSectionVariantIDs(*p, section) {
			if _, ok := p.SectionVariants[variantID]; !ok {
				continue
			}
			payload, err := effectiveSectionPayload(*p, sectionID, variantID)
			if err != nil {
				return err
			}
			for codeObjID := range payloadStringMapField(payload, "codeObjVariantMap") {
				usedCodeObjIDs[codeObjID] = struct{}{}
			}
		}
	}

	pending := make([]string, 0, len(usedCodeObjIDs))
	for codeObjID := range usedCodeObjIDs {
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
			return fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
		}
		reachable[codeObjID] = struct{}{}
		for _, variantID := range codeObj.VariantIDs {
			payload, err := effectiveCodeObjectPayloadForVariant(*p, codeObjID, variantID)
			if err != nil {
				return err
			}
			pending = append(pending, payloadStringArrayField(payload, "children")...)
		}
	}

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
				if codeObj.Name == trimmedCallableName {
					return nil
				}
				codeObj.Name = trimmedCallableName
				p.CodeObjs[callableID] = codeObj
				didUpdate = true
				return nil
			}); err != nil {
				return false, err
			}
		}
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
	for _, line := range existingLines {
		stripped := strings.TrimSpace(line)
		if stripped == "" {
			continue
		}
		if stripped == importLine {
			return false, nil
		}
		if !strings.HasPrefix(stripped, "from "+modulePath+" import") {
			continue
		}
		if commentIndex := strings.Index(stripped, "#"); commentIndex >= 0 {
			stripped = strings.TrimSpace(stripped[:commentIndex])
		}
		parts := strings.SplitN(stripped, "import", 2)
		if len(parts) != 2 {
			continue
		}
		imports := strings.Split(parts[1], ",")
		for _, item := range imports {
			trimmed := strings.TrimSpace(item)
			if trimmed == "" {
				continue
			}
			if referenceName == symbolName && trimmed == symbolName {
				return false, nil
			}
			if referenceName != symbolName && trimmed == symbolName+" as "+referenceName {
				return false, nil
			}
		}
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

	callableNamesBySection := map[string]struct{}{}
	if section, ok := p.Sections[trimmedSectionID]; ok {
		for _, variantID := range collectSectionVariantIDs(*p, section) {
			if _, ok := p.SectionVariants[variantID]; !ok {
				continue
			}
			payload, err := effectiveSectionPayload(*p, trimmedSectionID, variantID)
			if err != nil {
				return err
			}
			sectionType := payloadStringField(payload, "type")
			if sectionType == "" {
				implID := strings.TrimSpace(p.SectionVariants[variantID].ImplID)
				if impl, ok := p.SectionImpls[implID]; ok {
					sectionType = fallbackSectionType(impl)
				}
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
				return fmt.Errorf("%w: %q", ErrCodeObjNotFound, callableID)
			}
			callableName := strings.TrimSpace(codeObj.Name)
			if callableName == "" {
				continue
			}
			callableNamesBySection[callableName] = struct{}{}
		}
	}

	identities := make([]string, 0, len(p.WatchCodeRegistry))
	for identity := range p.WatchCodeRegistry {
		identities = append(identities, identity)
	}
	sort.Strings(identities)

	for _, identity := range identities {
		entry := p.WatchCodeRegistry[identity]
		nextSectionIDs := filterStringSlice(
			uniqueSortedTrimmedStrings(p.pruneWatchCodeSectionIDs(entry)),
			map[string]struct{}{trimmedSectionID: {}},
		)
		if _, ok := callableNamesBySection[strings.TrimSpace(entry.CallableName)]; ok {
			nextSectionIDs = uniqueSortedTrimmedStrings(append(nextSectionIDs, trimmedSectionID))
		}
		if stringSlicesEqual(entry.SectionIDs, nextSectionIDs) && entry.SectionsCount == len(nextSectionIDs) {
			continue
		}
		entry.SectionIDs = nextSectionIDs
		entry.SectionsCount = len(nextSectionIDs)
		p.WatchCodeRegistry[identity] = entry
	}

	return nil
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
