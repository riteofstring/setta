package coordinator

import (
	"fmt"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/aggregate"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/renderer"
)

func (coordinator *Coordinator) prepareSectionClipboardCandidate(
	prepared aggregate.SectionClipboardPasteCandidate,
) (aggregate.Candidate, error) {
	paths, err := clipboardCandidateTargetPaths(coordinator.snapshot.State, prepared)
	if err != nil {
		return aggregate.Candidate{}, err
	}
	originalReplacements := clipboardOriginalPathReplacements(paths.current, paths.candidate)
	rewritten, err := renderer.RewriteSectionReferences(
		prepared.Candidate.State,
		projectSectionIDs(coordinator.snapshot.State),
		originalReplacements,
	)
	if err != nil {
		return aggregate.Candidate{}, err
	}
	cloneReplacements := clipboardClonePathReplacements(originalReplacements, prepared, paths.source, paths.candidate)
	rewritten, err = renderer.RewriteSectionReferences(
		rewritten,
		prepared.ClonedSectionIDs,
		cloneReplacements,
	)
	if err != nil {
		return aggregate.Candidate{}, err
	}
	if err := rewritten.Validate(); err != nil {
		return aggregate.Candidate{}, fmt.Errorf("validate rewritten clipboard candidate: %w", err)
	}
	candidate := prepared.Candidate
	candidate.State = rewritten
	return candidate, nil
}

type clipboardCandidatePaths struct {
	candidate map[string]string
	current   map[string]string
	source    map[string]string
}

func clipboardCandidateTargetPaths(current aggregate.State, prepared aggregate.SectionClipboardPasteCandidate) (clipboardCandidatePaths, error) {
	currentPaths, err := renderer.TargetPaths(current)
	if err != nil {
		return clipboardCandidatePaths{}, fmt.Errorf("allocate current target paths: %w", err)
	}
	candidatePaths, err := renderer.TargetPaths(prepared.Candidate.State)
	if err != nil {
		return clipboardCandidatePaths{}, fmt.Errorf("allocate candidate target paths: %w", err)
	}
	sourcePaths, err := renderer.TargetPaths(prepared.SourceState)
	if err != nil {
		return clipboardCandidatePaths{}, fmt.Errorf("allocate clipboard target paths: %w", err)
	}
	return clipboardCandidatePaths{
		candidate: candidatePaths,
		current:   currentPaths,
		source:    sourcePaths,
	}, nil
}

func clipboardClonePathReplacements(
	original map[string]string,
	prepared aggregate.SectionClipboardPasteCandidate,
	sourcePaths map[string]string,
	candidatePaths map[string]string,
) map[string]string {
	result := make(map[string]string, len(original)+len(prepared.SourceToDestinationIDs))
	for source, destination := range original {
		result[source] = destination
	}
	for sourceID, destinationID := range prepared.SourceToDestinationIDs {
		sourcePath, sourceExists := sourcePaths[sourceID]
		destinationPath, destinationExists := candidatePaths[destinationID]
		if sourceExists && destinationExists && sourcePath != destinationPath {
			result[sourcePath] = destinationPath
		}
	}
	return result
}

func clipboardOriginalPathReplacements(current map[string]string, candidate map[string]string) map[string]string {
	result := make(map[string]string)
	for targetID, currentPath := range current {
		candidatePath, survives := candidate[targetID]
		if survives && currentPath != candidatePath {
			result[currentPath] = candidatePath
		}
	}
	return result
}

func projectSectionIDs(state aggregate.State) []string {
	result := make([]string, 0, len(state.Callables)+len(state.ParameterDictionaries)+len(state.Lists))
	for _, callable := range state.Callables {
		result = append(result, callable.ID)
	}
	for _, dictionary := range state.ParameterDictionaries {
		result = append(result, dictionary.ID)
	}
	for _, list := range state.Lists {
		result = append(result, list.ID)
	}
	return result
}
