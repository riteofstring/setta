package watchcode

import (
	"slices"
	"sort"
	"strings"
)

type RegistryEntry struct {
	CallableName  string
	Kind          CallableKind
	SignatureHash string
	BodyHash      string
	SourcePath    string
	SectionIDs    []string
	SectionsCount int
}

type RenamePlan struct {
	OldIdentity string
	NewCallable CallableInfo
}

type MetadataChangePlan struct {
	Identity string
	Entry    RegistryEntry
	Callable CallableInfo
}

type SignatureChangePlan struct {
	Identity string
	Entry    RegistryEntry
	Callable CallableInfo
}

type ScanPlan struct {
	SourcePath        string
	PrunedBaseline    []string
	Renames           []RenamePlan
	RemovedIdentities []string
	MetadataChanges   []MetadataChangePlan
	SignatureChanges  []SignatureChangePlan
	BaselineSkipped   []CallableInfo
	Additions         []CallableInfo
}

type DeletePlan struct {
	SourcePath         string
	RemovedIdentities  []string
	RemoveBaselinePath bool
}

type MovePlan struct {
	SourcePath              string
	DestinationPath         string
	Tracked                 bool
	DestinationBaseline     []string
	RemoveSourceBaseline    bool
	MovedRegistryIdentities []string
}

func PlanScanUpdate(
	sourcePath string,
	callables []CallableInfo,
	registry map[string]RegistryEntry,
	baselineByPath map[string][]string,
) ScanPlan {
	trimmedSourcePath := strings.TrimSpace(sourcePath)
	currentByIdentity := make(map[string]CallableInfo, len(callables))
	for _, callable := range callables {
		currentByIdentity[callable.Identity] = callable
	}

	registryEntriesForFile := registryEntriesForSourcePath(trimmedSourcePath, registry)
	removedIdentities := sortedSetDifference(sortedRegistryIdentityKeys(registryEntriesForFile), sortedCallableIdentities(callables))
	addedIdentities := sortedSetDifference(sortedCallableIdentities(callables), sortedRegistryIdentityKeys(registryEntriesForFile))
	renames, remainingRemoved, remainingAdded := matchRenamePlans(removedIdentities, addedIdentities, currentByIdentity, registryEntriesForFile)

	prunedBaseline := sortedStringSlice(pruneBaselineEntries(baselineByPath[trimmedSourcePath], currentByIdentity))
	baselineSet := make(map[string]struct{}, len(prunedBaseline))
	for _, identity := range prunedBaseline {
		baselineSet[identity] = struct{}{}
	}

	metadataChanges := make([]MetadataChangePlan, 0)
	signatureChanges := make([]SignatureChangePlan, 0)
	baselineSkipped := make([]CallableInfo, 0)
	additions := make([]CallableInfo, 0)
	for _, callable := range callables {
		entry, exists := registry[callable.Identity]
		switch {
		case exists:
			if entry.SignatureHash != callable.SignatureHash {
				signatureChanges = append(signatureChanges, SignatureChangePlan{
					Identity: callable.Identity,
					Entry:    cloneRegistryEntry(entry),
					Callable: callable,
				})
				continue
			}
			if entry.BodyHash != callable.BodyHash || strings.TrimSpace(entry.SourcePath) != trimmedSourcePath {
				metadataChanges = append(metadataChanges, MetadataChangePlan{
					Identity: callable.Identity,
					Entry:    cloneRegistryEntry(entry),
					Callable: callable,
				})
			}
		case containsIdentity(remainingAdded, callable.Identity):
			if _, skipped := baselineSet[callable.Identity]; skipped {
				baselineSkipped = append(baselineSkipped, callable)
				continue
			}
			additions = append(additions, callable)
		}
	}

	sortRenamePlans(renames)
	sort.Strings(remainingRemoved)
	sortMetadataChanges(metadataChanges)
	sortSignatureChanges(signatureChanges)
	sortCallablesByIdentity(baselineSkipped)
	sortCallablesByIdentity(additions)

	return ScanPlan{
		SourcePath:        trimmedSourcePath,
		PrunedBaseline:    prunedBaseline,
		Renames:           renames,
		RemovedIdentities: remainingRemoved,
		MetadataChanges:   metadataChanges,
		SignatureChanges:  signatureChanges,
		BaselineSkipped:   baselineSkipped,
		Additions:         additions,
	}
}

func PlanDeleteUpdate(sourcePath string, registry map[string]RegistryEntry, baselineByPath map[string][]string) DeletePlan {
	trimmedSourcePath := strings.TrimSpace(sourcePath)
	removedIdentities := sortedRegistryIdentityKeys(registryEntriesForSourcePath(trimmedSourcePath, registry))
	_, removeBaselinePath := baselineByPath[trimmedSourcePath]
	return DeletePlan{
		SourcePath:         trimmedSourcePath,
		RemovedIdentities:  removedIdentities,
		RemoveBaselinePath: removeBaselinePath,
	}
}

func PlanMoveUpdate(
	sourcePath string,
	destinationPath string,
	callablesAtDestination []CallableInfo,
	parsed bool,
	registry map[string]RegistryEntry,
	baselineByPath map[string][]string,
) MovePlan {
	trimmedSourcePath := strings.TrimSpace(sourcePath)
	trimmedDestinationPath := strings.TrimSpace(destinationPath)

	sourceBaseline, sourceBaselineExists := baselineByPath[trimmedSourcePath]
	movedRegistryIdentities := sortedRegistryIdentityKeys(registryEntriesForSourcePath(trimmedSourcePath, registry))
	tracked := sourceBaselineExists || len(movedRegistryIdentities) > 0
	if !tracked {
		return MovePlan{
			SourcePath:      trimmedSourcePath,
			DestinationPath: trimmedDestinationPath,
		}
	}

	var destinationBaseline []string
	switch {
	case parsed:
		destinationBaseline = sortedCallableIdentities(callablesAtDestination)
	case sourceBaselineExists:
		destinationBaseline = sortedStringSlice(sourceBaseline)
	default:
		destinationBaseline = nil
	}

	return MovePlan{
		SourcePath:              trimmedSourcePath,
		DestinationPath:         trimmedDestinationPath,
		Tracked:                 true,
		DestinationBaseline:     destinationBaseline,
		RemoveSourceBaseline:    sourceBaselineExists,
		MovedRegistryIdentities: movedRegistryIdentities,
	}
}

func registryEntriesForSourcePath(sourcePath string, registry map[string]RegistryEntry) map[string]RegistryEntry {
	output := make(map[string]RegistryEntry)
	for identity, entry := range registry {
		if strings.TrimSpace(entry.SourcePath) != sourcePath {
			continue
		}
		output[identity] = cloneRegistryEntry(entry)
	}
	return output
}

func pruneBaselineEntries(entries []string, currentByIdentity map[string]CallableInfo) []string {
	if len(entries) == 0 {
		return nil
	}
	output := make([]string, 0, len(entries))
	seen := map[string]struct{}{}
	for _, identity := range entries {
		trimmedIdentity := strings.TrimSpace(identity)
		if trimmedIdentity == "" {
			continue
		}
		if _, ok := currentByIdentity[trimmedIdentity]; !ok {
			continue
		}
		if _, ok := seen[trimmedIdentity]; ok {
			continue
		}
		seen[trimmedIdentity] = struct{}{}
		output = append(output, trimmedIdentity)
	}
	return output
}

func matchRenamePlans(
	removedIdentities []string,
	addedIdentities []string,
	currentByIdentity map[string]CallableInfo,
	registryEntriesForFile map[string]RegistryEntry,
) ([]RenamePlan, []string, []string) {
	remainingRemoved := append([]string(nil), removedIdentities...)
	remainingAdded := append([]string(nil), addedIdentities...)
	if len(remainingRemoved) == 0 || len(remainingAdded) == 0 {
		return nil, remainingRemoved, remainingAdded
	}

	addedByKey := make(map[string][]CallableInfo, len(remainingAdded))
	for _, identity := range remainingAdded {
		callable, ok := currentByIdentity[identity]
		if !ok {
			continue
		}
		key := renameKey(callable.Kind, callable.SignatureHash, callable.BodyHash)
		addedByKey[key] = append(addedByKey[key], callable)
	}
	for key := range addedByKey {
		sortCallablesByIdentity(addedByKey[key])
	}

	renames := make([]RenamePlan, 0)
	retainedRemoved := make([]string, 0, len(remainingRemoved))
	consumedAdded := make(map[string]struct{})
	for _, oldIdentity := range remainingRemoved {
		entry, ok := registryEntriesForFile[oldIdentity]
		if !ok {
			retainedRemoved = append(retainedRemoved, oldIdentity)
			continue
		}
		key := renameKey(entry.Kind, entry.SignatureHash, entry.BodyHash)
		candidates := addedByKey[key]
		if len(candidates) == 0 {
			retainedRemoved = append(retainedRemoved, oldIdentity)
			continue
		}
		selected := candidates[0]
		addedByKey[key] = candidates[1:]
		consumedAdded[selected.Identity] = struct{}{}
		renames = append(renames, RenamePlan{
			OldIdentity: oldIdentity,
			NewCallable: selected,
		})
	}

	retainedAdded := make([]string, 0, len(remainingAdded))
	for _, identity := range remainingAdded {
		if _, consumed := consumedAdded[identity]; consumed {
			continue
		}
		retainedAdded = append(retainedAdded, identity)
	}
	return renames, retainedRemoved, retainedAdded
}

func renameKey(kind CallableKind, signatureHash string, bodyHash string) string {
	return string(kind) + ":" + signatureHash + ":" + bodyHash
}

func sortCallablesByIdentity(values []CallableInfo) {
	sort.Slice(values, func(i int, j int) bool {
		return values[i].Identity < values[j].Identity
	})
}

func sortRenamePlans(values []RenamePlan) {
	sort.Slice(values, func(i int, j int) bool {
		if values[i].OldIdentity == values[j].OldIdentity {
			return values[i].NewCallable.Identity < values[j].NewCallable.Identity
		}
		return values[i].OldIdentity < values[j].OldIdentity
	})
}

func sortMetadataChanges(values []MetadataChangePlan) {
	sort.Slice(values, func(i int, j int) bool {
		return values[i].Identity < values[j].Identity
	})
}

func sortSignatureChanges(values []SignatureChangePlan) {
	sort.Slice(values, func(i int, j int) bool {
		return values[i].Identity < values[j].Identity
	})
}

func sortedRegistryIdentityKeys(values map[string]RegistryEntry) []string {
	output := make([]string, 0, len(values))
	for identity := range values {
		output = append(output, identity)
	}
	sort.Strings(output)
	return output
}

func sortedCallableIdentities(callables []CallableInfo) []string {
	output := make([]string, 0, len(callables))
	for _, callable := range callables {
		output = append(output, callable.Identity)
	}
	sort.Strings(output)
	return output
}

func sortedStringSlice(values []string) []string {
	output := append([]string(nil), values...)
	sort.Strings(output)
	return output
}

func sortedSetDifference(left []string, right []string) []string {
	output := make([]string, 0, len(left))
	for _, candidate := range left {
		if slices.Contains(right, candidate) {
			continue
		}
		output = append(output, candidate)
	}
	return output
}

func containsIdentity(identities []string, identity string) bool {
	return slices.Contains(identities, identity)
}

func cloneRegistryEntry(entry RegistryEntry) RegistryEntry {
	return RegistryEntry{
		CallableName:  strings.TrimSpace(entry.CallableName),
		Kind:          entry.Kind,
		SignatureHash: strings.TrimSpace(entry.SignatureHash),
		BodyHash:      strings.TrimSpace(entry.BodyHash),
		SourcePath:    strings.TrimSpace(entry.SourcePath),
		SectionIDs:    append([]string(nil), entry.SectionIDs...),
		SectionsCount: entry.SectionsCount,
	}
}
