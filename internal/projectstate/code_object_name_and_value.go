package projectstate

import (
	"context"
	"fmt"
	"strings"
)

func (d *Document) SetParamNameAndValue(projectID string, sectionID string, codeObjID string, name string, value string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetParamNameAndValue(sectionID, codeObjID, name, value); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetParamNameAndValue(ctx context.Context, projectID string, sectionID string, codeObjID string, name string, value string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetParamNameAndValue(projectID, sectionID, codeObjID, name, value); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) SetParamNameAndValue(sectionID string, codeObjID string, name string, value string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedCodeObjID := strings.TrimSpace(codeObjID)
	if trimmedCodeObjID == "" {
		return ErrCodeObjIDRequired
	}
	if _, ok := p.CodeObjs[trimmedCodeObjID]; !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjNotFound, trimmedCodeObjID)
	}

	normalized, err := validateParamCodeObjectNameForSection(*p, sectionID, trimmedCodeObjID, name)
	if err != nil {
		return err
	}
	if _, _, _, _, err := p.resolveSectionCodeObjectValueMutationContext(sectionID, trimmedCodeObjID); err != nil {
		return err
	}

	if err := p.setSectionCodeObjectField(sectionID, trimmedCodeObjID, "value", value); err != nil {
		return err
	}

	codeObj := p.CodeObjs[trimmedCodeObjID]
	codeObj.Name = normalized
	p.CodeObjs[codeObj.ID] = codeObj
	return nil
}
