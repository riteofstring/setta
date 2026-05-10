package projectstate

import (
	"fmt"
	"sort"
	"strings"
)

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

func (p *Project) syncWatchCodeRegistrySectionMembership(
	projectData *WatchCodePluginProjectData,
	sectionID string,
) error {
	if p == nil || projectData == nil || len(projectData.Registry) == 0 {
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

	for _, identity := range sortedWatchCodeRegistryIdentities(projectData.Registry) {
		p.syncWatchCodeRegistryEntryMembership(projectData, identity, trimmedSectionID, callableNamesBySection)
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
	projectData *WatchCodePluginProjectData,
	identity string,
	sectionID string,
	callableNamesBySection map[string]struct{},
) {
	entry := projectData.Registry[identity]
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
	projectData.Registry[identity] = entry
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
