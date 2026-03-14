package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var ErrCodeSectionReadOnly = errors.New("code section is read-only")

func (d *Document) SetCode(projectID string, sectionID string, code string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetCode(sectionID, code); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetCode(ctx context.Context, projectID string, sectionID string, code string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetCode(projectID, sectionID, code); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) SetCode(sectionID string, code string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return ErrSectionIDRequired
	}

	section, variant, impl, err := p.ResolveSection(trimmedSectionID)
	if err != nil {
		return err
	}
	if !impl.IsCode() || impl.Code == nil {
		return fmt.Errorf("%w: %q", ErrCodeSectionRequired, trimmedSectionID)
	}

	payload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return err
	}
	if effectiveCodeSectionBindingAccessMode(payload, impl.Code.Binding) == CodeFileAccessModeReadOnly {
		return fmt.Errorf("%w: %q", ErrCodeSectionReadOnly, trimmedSectionID)
	}

	return p.setCurrentSectionField(trimmedSectionID, "code", code)
}

func effectiveCodeSectionBindingAccessMode(payload map[string]any, binding *CodeFileBinding) CodeFileAccessMode {
	bindingObject, ok := payloadObjectField(payload, "codeFileBinding")
	if ok {
		mode := strings.TrimSpace(payloadStringField(bindingObject, "access_mode"))
		if mode == "" {
			mode = strings.TrimSpace(payloadStringField(bindingObject, "accessMode"))
		}
		if mode != "" {
			return CodeFileAccessMode(mode)
		}
	}
	if binding == nil || strings.TrimSpace(string(binding.AccessMode)) == "" {
		return CodeFileAccessModeReadWrite
	}
	return binding.AccessMode
}

func payloadObjectField(object map[string]any, key string) (map[string]any, bool) {
	value, ok := object[key]
	if !ok {
		return nil, false
	}
	nested, ok := value.(map[string]any)
	if !ok {
		return nil, false
	}
	return nested, true
}
