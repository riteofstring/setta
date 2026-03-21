package projectstate

import (
	"os"
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
	projectIDs := make([]string, 0, len(document.Projects))
	for projectID := range document.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	targets := make([]jsonSourceLoadTarget, 0)
	for _, projectID := range projectIDs {
		project := document.Projects[projectID]
		sectionIDs := make([]string, 0, len(project.Sections))
		for sectionID := range project.Sections {
			sectionIDs = append(sectionIDs, sectionID)
		}
		sort.Strings(sectionIDs)
		for _, sectionID := range sectionIDs {
			section := project.Sections[sectionID]
			variantIDs := append([]string(nil), section.VariantIDs...)
			sort.Strings(variantIDs)
			for _, variantID := range variantIDs {
				variant, ok := project.SectionVariants[variantID]
				if !ok {
					return nil, ErrSectionVariantNotFound
				}
				impl, ok := project.SectionImpls[variant.ImplID]
				if !ok {
					return nil, ErrSectionImplNotFound
				}
				payload, err := effectiveSectionPayload(project, sectionID, variantID)
				if err != nil {
					return nil, err
				}
				if canonicalSectionType(payloadStringField(payload, "type"), impl) != "Dict" || !payloadBoolField(payload, "isJsonSource") {
					continue
				}
				resolvedPath, err := resolveJSONSourceLoadPath(workspaceRoot, variant.Name)
				if err != nil {
					return nil, err
				}
				targets = append(targets, jsonSourceLoadTarget{
					ProjectID:      projectID,
					SectionID:      sectionID,
					VariantID:      variantID,
					ResolvedPath:   resolvedPath,
					JSONSourceKeys: append([]string(nil), payloadStringArrayField(payload, "jsonSourceKeys")...),
				})
			}
		}
	}
	return targets, nil
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
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &JSONSourceObject{}, true
		}
		return &JSONSourceObject{}, true
	}
	payload, err := decodeOrderedJSONObjectFromJSON(content)
	if err != nil {
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
