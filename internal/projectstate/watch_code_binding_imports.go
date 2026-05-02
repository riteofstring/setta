package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode"

	"setta/internal/watchcode"
)

func (p *Project) bindWatchCodeCallableSections(
	ctx context.Context,
	projectData *WatchCodePluginProjectData,
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
		response, err := p.setCallable(ctx, projectData, sectionID, callableName, true, resolver)
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

func resolveWatchCodeReferenceName(
	projectData *WatchCodePluginProjectData,
	callable watchcode.CallableInfo,
	excludeIdentity string,
) string {
	reserved := map[string]struct{}{}
	for identity, entry := range projectData.Registry {
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
	newPrefix, removed := removeWatchCodeImportLine(
		target.GenCodePrefix,
		buildWatchCodeImportLine(modulePath, symbolName, referenceName),
	)
	if !removed {
		return false, nil
	}
	target.GenCodePrefix = newPrefix
	if err := p.SetPythonCodegenTarget(target); err != nil {
		return false, err
	}
	return true, nil
}

func removeWatchCodeImportLine(prefix string, importLine string) (string, bool) {
	kept, removed := filterWatchCodeImportLines(strings.Split(prefix, "\n"), importLine)
	if !removed {
		return "", false
	}
	return normalizeWatchCodeImportPrefix(strings.Join(kept, "\n"), prefix), true
}

func filterWatchCodeImportLines(lines []string, importLine string) ([]string, bool) {
	kept := make([]string, 0, len(lines))
	removed := false
	for _, line := range lines {
		if strings.TrimSpace(line) == importLine {
			removed = true
			continue
		}
		kept = append(kept, line)
	}
	return kept, removed
}

func normalizeWatchCodeImportPrefix(prefix string, originalPrefix string) string {
	normalized := strings.TrimSuffix(prefix, "\n\n")
	if originalPrefix != "" && strings.HasSuffix(originalPrefix, "\n") && normalized != "" && !strings.HasSuffix(normalized, "\n") {
		normalized += "\n"
	}
	return normalized
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
