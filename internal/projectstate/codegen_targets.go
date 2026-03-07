package projectstate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrProjectCodegenTargetDuplicateLanguage   = errors.New("project codegen target language must be unique")
	ErrProjectCodegenTargetValidatorRequired   = errors.New("project codegen target validator is required for plugin targets")
	ErrProjectCodegenPythonMutationUnsupported = errors.New("python codegen target enablement and in-place edits are not supported in Go yet")
)

type CodegenTargetValidator interface {
	ValidateProjectCodegenTarget(context.Context, ProjectCodegenTarget) error
}

type CodegenTargetValidatorFunc func(context.Context, ProjectCodegenTarget) error

func (f CodegenTargetValidatorFunc) ValidateProjectCodegenTarget(ctx context.Context, target ProjectCodegenTarget) error {
	return f(ctx, target)
}

func (d *Document) SetProjectCodegenTargets(ctx context.Context, projectID string, targets []ProjectCodegenTarget, validator CodegenTargetValidator) error {
	if d == nil {
		return ErrProjectNotFound
	}
	if ctx == nil {
		ctx = context.Background()
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}

	normalizedTargets, err := normalizeCodegenTargetsForMutation(ctx, targets, validator)
	if err != nil {
		return err
	}
	if err := applySupportedPythonCodegenMutation(&project, normalizedTargets); err != nil {
		return err
	}

	project.CodegenTargets = cloneProjectCodegenTargets(normalizedTargets)
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetProjectCodegenTargets(ctx context.Context, projectID string, targets []ProjectCodegenTarget, validator CodegenTargetValidator) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetProjectCodegenTargets(ctx, projectID, targets, validator); err != nil {
			return document, err
		}
		return document, nil
	})
}

func normalizeCodegenTargetsForMutation(ctx context.Context, targets []ProjectCodegenTarget, validator CodegenTargetValidator) ([]ProjectCodegenTarget, error) {
	normalizedTargets := make([]ProjectCodegenTarget, 0, len(targets))
	seenLanguages := make(map[string]struct{}, len(targets))
	for _, target := range targets {
		normalized, err := target.Normalized()
		if err != nil {
			return nil, err
		}
		if _, ok := seenLanguages[normalized.Language]; ok {
			return nil, fmt.Errorf("%w: %s", ErrProjectCodegenTargetDuplicateLanguage, normalized.Language)
		}
		seenLanguages[normalized.Language] = struct{}{}
		normalizedTargets = append(normalizedTargets, normalized)
	}

	for _, normalized := range normalizedTargets {
		if normalized.Language != string(CodeLanguagePython) {
			if validator == nil {
				return nil, fmt.Errorf("%w: %s", ErrProjectCodegenTargetValidatorRequired, normalized.Language)
			}
			if err := validator.ValidateProjectCodegenTarget(ctx, normalized); err != nil {
				return nil, err
			}
		}
	}
	return normalizedTargets, nil
}

func applySupportedPythonCodegenMutation(project *Project, next []ProjectCodegenTarget) error {
	if project == nil {
		return ErrProjectNotFound
	}

	previousPython, previousHasPython := pythonCodegenTarget(project.CodegenTargets)
	nextPython, nextHasPython := pythonCodegenTarget(next)
	switch {
	case !previousHasPython && !nextHasPython:
		return nil
	case previousHasPython && !nextHasPython:
		cleanupRemovedPythonCodegen(project)
		return nil
	case previousHasPython && nextHasPython:
		equal, err := projectCodegenTargetsEqual(previousPython, nextPython)
		if err != nil {
			return err
		}
		if equal {
			return project.ReconcilePythonGeneratedBindings()
		}
		return ErrProjectCodegenPythonMutationUnsupported
	default:
		return ErrProjectCodegenPythonMutationUnsupported
	}
}

func cleanupRemovedPythonCodegen(project *Project) {
	if project == nil {
		return
	}

	removedSectionIDs := generatedPythonSectionIDs(*project)
	removedSections := make(map[string]struct{}, len(removedSectionIDs))
	removedVariantIDs := make(map[string]struct{})
	removedImplIDs := make(map[string]struct{})

	for _, sectionID := range removedSectionIDs {
		removedSections[sectionID] = struct{}{}

		section, ok := project.Sections[sectionID]
		if !ok {
			continue
		}
		for _, variantID := range collectSectionVariantIDs(*project, section) {
			removedVariantIDs[variantID] = struct{}{}
			variant, ok := project.SectionVariants[variantID]
			if !ok {
				continue
			}
			removedImplIDs[variant.ImplID] = struct{}{}
		}
	}

	if _, ok := removedSections[project.EntryCodeBlockID]; ok {
		project.EntryCodeBlockID = ""
	}
	project.GeneratedCodeBinding = nil
	project.GeneratedMetadataBinding = nil
	project.TopLevelSectionIDs = filterStringSlice(project.TopLevelSectionIDs, removedSections)
	project.ActiveIDs = filterStringSlice(project.ActiveIDs, removedSections)
	project.Edges = filterEdgesBySectionIDs(project.Edges, removedSections)
	project.AgenticEdges = filterAgenticEdgesBySectionIDs(project.AgenticEdges, removedSections)

	for sectionID := range removedSections {
		delete(project.TopLevelSections, sectionID)
		delete(project.SectionVariantMap, sectionID)
		delete(project.Sections, sectionID)
	}
	for variantID := range removedVariantIDs {
		delete(project.SectionVariants, variantID)
	}

	stillReferencedImplIDs := make(map[string]struct{}, len(project.SectionVariants))
	for _, variant := range project.SectionVariants {
		stillReferencedImplIDs[variant.ImplID] = struct{}{}
	}
	for implID := range removedImplIDs {
		if _, ok := stillReferencedImplIDs[implID]; ok {
			continue
		}
		delete(project.SectionImpls, implID)
	}

	for viewModeID, viewMode := range project.ViewModes {
		for sectionID := range removedSections {
			delete(viewMode.VisibilityBySectionID, sectionID)
			delete(viewMode.TopLevelSections, sectionID)
		}
		project.ViewModes[viewModeID] = viewMode
	}
}

func generatedPythonSectionIDs(project Project) []string {
	sectionIDs := make([]string, 0, len(project.Sections))
	for sectionID, section := range project.Sections {
		if !sectionReferencesGeneratedPython(project, section) {
			continue
		}
		sectionIDs = append(sectionIDs, sectionID)
	}
	return sectionIDs
}

func sectionReferencesGeneratedPython(project Project, section Section) bool {
	for _, variantID := range collectSectionVariantIDs(project, section) {
		variant, ok := project.SectionVariants[variantID]
		if !ok {
			continue
		}
		impl, ok := project.SectionImpls[variant.ImplID]
		if !ok || !impl.IsGenerated() || impl.Generated == nil {
			continue
		}
		if impl.Generated.Kind == GeneratedSectionKindPythonCode || impl.Generated.Kind == GeneratedSectionKindPythonMetadata {
			return true
		}
	}
	return false
}

func collectSectionVariantIDs(project Project, section Section) []string {
	variantIDs := make([]string, 0, len(section.VariantIDs)+2)
	seen := make(map[string]struct{}, len(section.VariantIDs)+2)
	appendVariantID := func(raw string) {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			return
		}
		if _, ok := seen[trimmed]; ok {
			return
		}
		seen[trimmed] = struct{}{}
		variantIDs = append(variantIDs, trimmed)
	}

	for _, variantID := range section.VariantIDs {
		appendVariantID(variantID)
	}
	appendVariantID(section.DefaultVariantID)
	appendVariantID(project.SectionVariantMap[section.ID])
	return variantIDs
}

func filterStringSlice(values []string, removed map[string]struct{}) []string {
	if len(values) == 0 || len(removed) == 0 {
		return values
	}

	filtered := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := removed[value]; ok {
			continue
		}
		filtered = append(filtered, value)
	}
	return filtered
}

func filterEdgesBySectionIDs(edges []Edge, removed map[string]struct{}) []Edge {
	if len(edges) == 0 || len(removed) == 0 {
		return edges
	}

	filtered := make([]Edge, 0, len(edges))
	for _, edge := range edges {
		if _, ok := removed[edge.SourceSectionID]; ok {
			continue
		}
		if _, ok := removed[edge.TargetSectionID]; ok {
			continue
		}
		filtered = append(filtered, edge)
	}
	return filtered
}

func filterAgenticEdgesBySectionIDs(edges []AgenticEdge, removed map[string]struct{}) []AgenticEdge {
	if len(edges) == 0 || len(removed) == 0 {
		return edges
	}

	filtered := make([]AgenticEdge, 0, len(edges))
	for _, edge := range edges {
		if _, ok := removed[edge.SourceSectionID]; ok {
			continue
		}
		if _, ok := removed[edge.TargetSectionID]; ok {
			continue
		}
		filtered = append(filtered, edge)
	}
	return filtered
}

func pythonCodegenTarget(targets []ProjectCodegenTarget) (ProjectCodegenTarget, bool) {
	for _, target := range targets {
		if strings.TrimSpace(target.Language) != string(CodeLanguagePython) {
			continue
		}
		return target.Clone(), true
	}
	return ProjectCodegenTarget{}, false
}

func cloneProjectCodegenTargets(targets []ProjectCodegenTarget) []ProjectCodegenTarget {
	if len(targets) == 0 {
		return nil
	}

	cloned := make([]ProjectCodegenTarget, len(targets))
	for index, target := range targets {
		cloned[index] = target.Clone()
	}
	return cloned
}

func projectCodegenTargetsEqual(left ProjectCodegenTarget, right ProjectCodegenTarget) (bool, error) {
	if left.Language != right.Language {
		return false, nil
	}
	if strings.TrimSpace(left.Language) == string(CodeLanguagePython) {
		return pythonCodegenTargetsEqual(left, right)
	}

	leftPayload, err := compactRawJSON(left.Payload)
	if err != nil {
		return false, fmt.Errorf("compact project codegen target %q payload: %w", left.Language, err)
	}
	rightPayload, err := compactRawJSON(right.Payload)
	if err != nil {
		return false, fmt.Errorf("compact project codegen target %q payload: %w", right.Language, err)
	}
	return bytes.Equal(leftPayload, rightPayload), nil
}

func pythonCodegenTargetsEqual(left ProjectCodegenTarget, right ProjectCodegenTarget) (bool, error) {
	leftConfig, err := DecodePythonCodegenTarget(left)
	if err != nil {
		return false, err
	}
	rightConfig, err := DecodePythonCodegenTarget(right)
	if err != nil {
		return false, err
	}
	if leftConfig.GenCodePrefix != rightConfig.GenCodePrefix {
		return false, nil
	}
	if leftConfig.GenCodeSuffix != rightConfig.GenCodeSuffix {
		return false, nil
	}
	if leftConfig.GenerateMetadata != rightConfig.GenerateMetadata {
		return false, nil
	}

	leftSectionPolicy, err := leftConfig.DecodedSectionPolicy()
	if err != nil {
		return false, fmt.Errorf("decode project codegen target %q sectionPolicy: %w", left.Language, err)
	}
	rightSectionPolicy, err := rightConfig.DecodedSectionPolicy()
	if err != nil {
		return false, fmt.Errorf("decode project codegen target %q sectionPolicy: %w", right.Language, err)
	}
	if !pythonSectionCodegenPoliciesEqual(leftSectionPolicy, rightSectionPolicy) {
		return false, nil
	}

	leftCodeObjValuePolicy, err := leftConfig.DecodedCodeObjValuePolicy()
	if err != nil {
		return false, fmt.Errorf("decode project codegen target %q codeObjValuePolicy: %w", left.Language, err)
	}
	rightCodeObjValuePolicy, err := rightConfig.DecodedCodeObjValuePolicy()
	if err != nil {
		return false, fmt.Errorf("decode project codegen target %q codeObjValuePolicy: %w", right.Language, err)
	}
	return pythonCodeObjValuePoliciesEqual(leftCodeObjValuePolicy, rightCodeObjValuePolicy), nil
}

func compactRawJSON(raw RawJSON) (RawJSON, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, nil
	}

	var compacted bytes.Buffer
	if err := json.Compact(&compacted, trimmed); err != nil {
		return nil, err
	}
	return cloneRawJSON(compacted.Bytes()), nil
}
