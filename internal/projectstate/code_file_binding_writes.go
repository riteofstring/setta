package projectstate

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
)

var ErrCodeFileAccessModeInvalid = errors.New("code file access mode is invalid")

func (d *Document) SetCodeFileBinding(projectID string, sectionID string, binding CodeFileBinding) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetCodeFileBinding(sectionID, binding); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetCodeFileBinding(
	ctx context.Context,
	projectID string,
	sectionID string,
	binding CodeFileBinding,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetCodeFileBinding(projectID, sectionID, binding); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) SetCodeFileBinding(sectionID string, binding CodeFileBinding) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return ErrSectionIDRequired
	}

	_, variant, impl, err := p.ResolveSection(trimmedSectionID)
	if err != nil {
		return err
	}
	if !impl.IsCode() || impl.Code == nil {
		return fmt.Errorf("%w: %q", ErrCodeSectionRequired, trimmedSectionID)
	}

	normalizedBinding, err := normalizeCodeFileBindingWrite(binding)
	if err != nil {
		return err
	}
	if err := p.setCurrentSectionField(trimmedSectionID, "codeFileBinding", codeFileBindingObject(normalizedBinding)); err != nil {
		return err
	}

	updatedImpl := impl.Clone()
	updatedImpl.Code.Binding = cloneCodeFileBinding(&normalizedBinding)
	p.SectionImpls[variant.ImplID] = updatedImpl
	return nil
}

func normalizeCodeFileBindingWrite(binding CodeFileBinding) (CodeFileBinding, error) {
	normalized, err := normalizeCodeFileBinding(&binding)
	if err != nil {
		return CodeFileBinding{}, err
	}
	normalized.Path = filepath.ToSlash(filepath.Clean(normalized.Path))
	normalized.AccessMode, err = normalizeCodeFileAccessMode(normalized.AccessMode)
	if err != nil {
		return CodeFileBinding{}, err
	}
	normalized.AutoBinding = false
	return *normalized, nil
}

func normalizeCodeFileAccessMode(mode CodeFileAccessMode) (CodeFileAccessMode, error) {
	trimmed := CodeFileAccessMode(strings.TrimSpace(string(mode)))
	switch trimmed {
	case CodeFileAccessModeReadWrite, CodeFileAccessModeReadOnly, CodeFileAccessModeWriteOnly:
		return trimmed, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrCodeFileAccessModeInvalid, trimmed)
	}
}

func codeFileBindingObject(binding CodeFileBinding) map[string]any {
	return map[string]any{
		"canonical_path": binding.Path,
		"access_mode":    string(binding.AccessMode),
		"autoBinding":    binding.AutoBinding,
	}
}
