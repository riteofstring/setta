package projectstate

import (
	"sort"
	"strings"

	"setta/internal/statefs"
)

type jsonSourceLoadTarget struct {
	ProjectID      string
	SectionID      string
	VariantID      string
	ResolvedPath   string
	JSONSourceKeys []string
}

func (d *Document) LoadAllJSONSourceVariantsFromDisk(workspaceRoot string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	targets, err := collectJSONSourceLoadTargets(*d, workspaceRoot)
	if err != nil {
		return err
	}
	return d.reloadJSONSourceTargetsFromDisk(targets)
}

func collectJSONSourceLoadTargets(document Document, workspaceRoot string) ([]jsonSourceLoadTarget, error) {
	targets := make([]jsonSourceLoadTarget, 0)
	for _, projectID := range sortedJSONSourceLoadProjectIDs(document.Projects) {
		projectTargets, err := collectProjectJSONSourceLoadTargets(projectID, document.Projects[projectID], workspaceRoot)
		if err != nil {
			return nil, err
		}
		targets = append(targets, projectTargets...)
	}
	return targets, nil
}

func collectProjectJSONSourceLoadTargets(
	projectID string,
	project Project,
	workspaceRoot string,
) ([]jsonSourceLoadTarget, error) {
	targets := make([]jsonSourceLoadTarget, 0)
	for _, sectionID := range sortedJSONSourceLoadSectionIDs(project.Sections) {
		sectionTargets, err := collectSectionJSONSourceLoadTargets(projectID, project, sectionID, workspaceRoot)
		if err != nil {
			return nil, err
		}
		targets = append(targets, sectionTargets...)
	}
	return targets, nil
}

func collectSectionJSONSourceLoadTargets(
	projectID string,
	project Project,
	sectionID string,
	workspaceRoot string,
) ([]jsonSourceLoadTarget, error) {
	section := project.Sections[sectionID]
	variantIDs := append([]string(nil), section.VariantIDs...)
	sort.Strings(variantIDs)

	targets := make([]jsonSourceLoadTarget, 0, len(variantIDs))
	for _, variantID := range variantIDs {
		target, ok, err := buildJSONSourceLoadTarget(projectID, project, sectionID, variantID, workspaceRoot)
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		targets = append(targets, target)
	}
	return targets, nil
}

func buildJSONSourceLoadTarget(
	projectID string,
	project Project,
	sectionID string,
	variantID string,
	workspaceRoot string,
) (jsonSourceLoadTarget, bool, error) {
	variant, ok := project.SectionVariants[variantID]
	if !ok {
		return jsonSourceLoadTarget{}, false, ErrSectionVariantNotFound
	}
	impl, ok := project.SectionImpls[variant.ImplID]
	if !ok {
		return jsonSourceLoadTarget{}, false, ErrSectionImplNotFound
	}
	payload, err := effectiveSectionPayload(project, sectionID, variantID)
	if err != nil {
		return jsonSourceLoadTarget{}, false, err
	}
	if !isJSONSourceLoadVariant(payload, impl) {
		return jsonSourceLoadTarget{}, false, nil
	}

	resolvedPath, err := resolveJSONSourceLoadPath(workspaceRoot, variant.Name)
	if err != nil {
		return jsonSourceLoadTarget{}, false, err
	}
	return jsonSourceLoadTarget{
		ProjectID:      projectID,
		SectionID:      sectionID,
		VariantID:      variantID,
		ResolvedPath:   resolvedPath,
		JSONSourceKeys: append([]string(nil), payloadStringArrayField(payload, "jsonSourceKeys")...),
	}, true, nil
}

func sortedJSONSourceLoadProjectIDs(projects map[string]Project) []string {
	ids := make([]string, 0, len(projects))
	for projectID := range projects {
		ids = append(ids, projectID)
	}
	sort.Strings(ids)
	return ids
}

func sortedJSONSourceLoadSectionIDs(sections map[string]Section) []string {
	ids := make([]string, 0, len(sections))
	for sectionID := range sections {
		ids = append(ids, sectionID)
	}
	sort.Strings(ids)
	return ids
}

func isJSONSourceLoadVariant(payload map[string]any, impl SectionImpl) bool {
	return canonicalSectionType(payloadStringField(payload, "type"), impl) == "Dict" &&
		payloadBoolField(payload, "isJsonSource")
}

func jsonSourceLoadGroupKey(resolvedPath string, jsonSourceKeys []string) string {
	return resolvedPath + "\x00" + displayJSONSourceKeys(jsonSourceKeys)
}

func resolveJSONSourceLoadPath(workspaceRoot string, variantName string) (string, error) {
	trimmed := strings.TrimSpace(variantName)
	if trimmed == "" {
		return "", nil
	}
	return statefs.NormalizePath(trimmed, strings.TrimSpace(workspaceRoot))
}

func loadJSONSourceObjectFromDisk(path string, jsonSourceKeys []string) (*JSONSourceObject, bool) {
	if strings.TrimSpace(path) == "" {
		return &JSONSourceObject{}, true
	}
	payload, exists, err := readOrderedJSONSourceObject(path)
	if err != nil {
		return &JSONSourceObject{}, true
	}
	if !exists {
		return &JSONSourceObject{}, true
	}
	current := &payload
	for _, key := range jsonSourceKeys {
		nextValue, ok := current.lookup(key)
		if !ok || nextValue.Object == nil {
			return &JSONSourceObject{}, true
		}
		current = nextValue.Object
	}
	return current.Clone(), false
}
