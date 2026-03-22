package projectstate

import (
	"fmt"
	"sort"
	"strings"

	"setta/internal/pythonsdkcontracts"
)

func BuildRunnerSummarySnapshot(document Document, projectID string) (pythonsdkcontracts.RunnerSummarySnapshot, error) {
	project, err := document.ProjectByID(projectID)
	if err != nil {
		return pythonsdkcontracts.RunnerSummarySnapshot{}, err
	}

	sections := make([]pythonsdkcontracts.RunnerSummarySection, 0, len(project.SectionVariantMap))
	for _, sectionID := range sortedProjectSectionIDs(project.SectionVariantMap) {
		section, variant, impl, err := project.ResolveSection(sectionID)
		if err != nil {
			return pythonsdkcontracts.RunnerSummarySnapshot{}, err
		}
		payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
		if err != nil {
			return pythonsdkcontracts.RunnerSummarySnapshot{}, err
		}

		variants := make([]pythonsdkcontracts.RunnerSummaryVariant, 0, len(section.VariantIDs))
		for _, variantID := range section.VariantIDs {
			sectionVariant, ok := project.SectionVariants[variantID]
			if !ok {
				return pythonsdkcontracts.RunnerSummarySnapshot{}, fmt.Errorf("%w: %q", ErrSectionVariantNotFound, variantID)
			}
			variants = append(variants, pythonsdkcontracts.RunnerSummaryVariant{
				ID:   sectionVariant.ID,
				Name: sectionVariant.Name,
			})
		}

		sectionSummary := pythonsdkcontracts.RunnerSummarySection{
			ID:          section.ID,
			Name:        section.Name,
			DisplayName: trimmedStringPointer(section.DisplayName),
			Variants:    variants,
			Params:      []pythonsdkcontracts.RunnerSummaryParam{},
		}
		sectionType := payloadStringField(payload, "type")
		if sectionType == "" {
			sectionType = fallbackSectionType(impl)
		}
		sectionSummary.SupportsParams = runnerSummarySectionSupportsParams(sectionType)

		if sectionSummary.SupportsParams {
			paramIDs := sortedRunnerSummaryParamIDs(payloadStringMapField(payload, "codeObjVariantMap"))
			params := make([]pythonsdkcontracts.RunnerSummaryParam, 0, len(paramIDs))
			for _, codeObjID := range paramIDs {
				codeObj, ok := project.CodeObjs[codeObjID]
				if !ok {
					return pythonsdkcontracts.RunnerSummarySnapshot{}, fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
				}
				params = append(params, pythonsdkcontracts.RunnerSummaryParam{
					ID:          codeObj.ID,
					Name:        codeObj.Name,
					DisplayName: trimmedStringPointer(codeObj.DisplayName),
				})
			}
			sectionSummary.Params = params
		}

		sections = append(sections, sectionSummary)
	}

	return pythonsdkcontracts.RunnerSummarySnapshot{
		ProjectConfigID: project.ID,
		Sections:        sections,
	}, nil
}

func (r *Runtime) RunnerSummarySnapshot(projectID string) (pythonsdkcontracts.RunnerSummarySnapshot, error) {
	if r == nil {
		return pythonsdkcontracts.RunnerSummarySnapshot{}, ErrRuntimeClosed
	}
	return BuildRunnerSummarySnapshot(r.Snapshot().Document, projectID)
}

func runnerSummarySectionSupportsParams(sectionType string) bool {
	switch strings.TrimSpace(sectionType) {
	case "Callable", "Dict", "GlobalVariables":
		return true
	default:
		return false
	}
}

func trimmedStringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func sortedRunnerSummaryParamIDs(codeObjVariantMap map[string]string) []string {
	ids := make([]string, 0, len(codeObjVariantMap))
	for codeObjID := range codeObjVariantMap {
		ids = append(ids, codeObjID)
	}
	sort.Strings(ids)
	return ids
}
