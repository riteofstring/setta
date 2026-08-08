package projectstate

import (
	"fmt"
	"sort"
	"strings"
)

type BoundCodeFileBinding struct {
	ProjectID string
	SectionID string
}

type BoundCodeFileInput struct {
	Path     string
	Bindings []BoundCodeFileBinding
}

func PythonBoundCodeFileInputs(document Document, workspaceRoot string) ([]BoundCodeFileInput, error) {
	projectIDs := make([]string, 0, len(document.Projects))
	for projectID := range document.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	bindingsByPath := map[string][]BoundCodeFileBinding{}
	for _, projectID := range projectIDs {
		project := document.Projects[projectID]
		files, err := project.ActivePythonCodeSectionFiles()
		if err != nil {
			return nil, fmt.Errorf("project %q active python code section files: %w", projectID, err)
		}

		for _, file := range files {
			resolvedPath, err := resolveWatchCodeAbsolutePath(workspaceRoot, file.Binding.Path, "code binding")
			if err != nil {
				return nil, fmt.Errorf("project %q section %q resolve bound code path: %w", projectID, file.SectionID, err)
			}
			bindingsByPath[resolvedPath] = append(bindingsByPath[resolvedPath], BoundCodeFileBinding{
				ProjectID: projectID,
				SectionID: file.SectionID,
			})
		}
	}

	paths := make([]string, 0, len(bindingsByPath))
	for path := range bindingsByPath {
		paths = append(paths, path)
	}
	sort.Strings(paths)

	inputs := make([]BoundCodeFileInput, 0, len(paths))
	for _, path := range paths {
		bindings := append([]BoundCodeFileBinding(nil), bindingsByPath[path]...)
		sort.Slice(bindings, func(left int, right int) bool {
			if bindings[left].ProjectID != bindings[right].ProjectID {
				return bindings[left].ProjectID < bindings[right].ProjectID
			}
			return bindings[left].SectionID < bindings[right].SectionID
		})
		inputs = append(inputs, BoundCodeFileInput{
			Path:     path,
			Bindings: bindings,
		})
	}

	return inputs, nil
}

func (p *Project) SetBoundCodeSectionContent(sectionID string, code string) (bool, error) {
	if p == nil {
		return false, ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return false, ErrSectionIDRequired
	}

	section, variant, impl, err := p.ResolveSection(trimmedSectionID)
	if err != nil {
		return false, err
	}
	if !impl.IsCode() || impl.Code == nil {
		return false, fmt.Errorf("%w: %q", ErrCodeSectionRequired, trimmedSectionID)
	}
	if impl.Code.Binding == nil {
		return false, nil
	}

	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return false, err
	}
	if existingCode, ok := payloadRawStringFieldWithPresence(payload, "code"); ok && existingCode == code {
		return false, nil
	}

	if err := p.setCurrentSectionField(section.ID, "code", code); err != nil {
		return false, err
	}
	return true, nil
}
