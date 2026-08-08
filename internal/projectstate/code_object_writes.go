package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrCodeObjectValueMutationUnsupported = errors.New("code object type does not support direct value mutation")
	ErrInvalidTypeErrorIgnoreState        = errors.New("section ignoreTypeErrors state is invalid")
	ErrTypeErrorIgnoreUnsupported         = errors.New("section does not support ignoreTypeErrors")
)

type TypeErrorIgnoreState struct {
	Callable bool            `json:"callable" py_default:"go_value"`
	Params   map[string]bool `json:"params" py_default:"go_value"`
}

func (d *Document) SetSectionCodeObjectValue(projectID string, sectionID string, codeObjID string, value string) error {
	return d.SetSectionCodeObjectValueForVariant(projectID, sectionID, "", codeObjID, value)
}

func (d *Document) SetSectionCodeObjectValueForVariant(
	projectID string,
	sectionID string,
	sectionVariantID string,
	codeObjID string,
	value string,
) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetSectionCodeObjectValueForVariant(
		sectionID,
		sectionVariantID,
		codeObjID,
		value,
	); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionCodeObjectValue(ctx context.Context, projectID string, sectionID string, codeObjID string, value string) (Snapshot, error) {
	return r.SetSectionCodeObjectValueForVariant(ctx, projectID, sectionID, "", codeObjID, value)
}

func (r *Runtime) SetSectionCodeObjectValueForVariant(
	ctx context.Context,
	projectID string,
	sectionID string,
	sectionVariantID string,
	codeObjID string,
	value string,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionCodeObjectValueForVariant(
			projectID,
			sectionID,
			sectionVariantID,
			codeObjID,
			value,
		); err != nil {
			return document, err
		}
		if err := r.reconcileProjectPythonGeneratedSectionsAfterProjectMutation(ctx, &document, projectID); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p Project) TypeErrorIgnoreStateForSection(sectionID string) (TypeErrorIgnoreState, error) {
	_, _, _, payload, err := p.resolveTypeErrorIgnoreContext(sectionID)
	if err != nil {
		return TypeErrorIgnoreState{}, err
	}
	value, ok := payload["ignoreTypeErrors"]
	if !ok {
		return TypeErrorIgnoreState{Params: map[string]bool{}}, nil
	}
	return typeErrorIgnoreStateFromValue(value)
}

func (p *Project) SetTypeErrorIgnore(sectionID string, paramInfoID *string, ignoreTypeErrors bool) error {
	if p == nil {
		return ErrProjectNotFound
	}

	_, _, _, payload, err := p.resolveTypeErrorIgnoreContext(sectionID)
	if err != nil {
		return err
	}
	if paramInfoID != nil && strings.TrimSpace(*paramInfoID) != "" {
		if _, _, _, _, err := p.ResolveSectionCodeObject(sectionID, strings.TrimSpace(*paramInfoID)); err != nil {
			return err
		}
	}

	ignoreState, err := p.TypeErrorIgnoreStateForSection(sectionID)
	if err != nil {
		return err
	}
	nextParams := cloneBoolMap(ignoreState.Params)
	if paramInfoID == nil || strings.TrimSpace(*paramInfoID) == "" {
		ignoreState.Callable = ignoreTypeErrors
		ignoreState.Params = nextParams
		return p.setCurrentTypeErrorIgnoreState(sectionID, ignoreState)
	}

	paramID := strings.TrimSpace(*paramInfoID)
	if ignoreTypeErrors {
		nextParams[paramID] = true
	} else {
		delete(nextParams, paramID)
	}
	ignoreState.Params = nextParams

	if _, ok := payload["ignoreTypeErrors"]; !ok {
		ignoreState.Callable = false
	}
	return p.setCurrentTypeErrorIgnoreState(sectionID, ignoreState)
}

func (d *Document) SetTypeErrorIgnore(projectID string, sectionID string, paramInfoID *string, ignoreTypeErrors bool) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetTypeErrorIgnore(sectionID, paramInfoID, ignoreTypeErrors); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetTypeErrorIgnore(ctx context.Context, projectID string, sectionID string, paramInfoID *string, ignoreTypeErrors bool) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetTypeErrorIgnore(projectID, sectionID, paramInfoID, ignoreTypeErrors); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) SetCodeObjectDisplayName(codeObjID string, displayName string) error {
	if p == nil {
		return ErrProjectNotFound
	}
	trimmedCodeObjID := strings.TrimSpace(codeObjID)
	if trimmedCodeObjID == "" {
		return ErrCodeObjIDRequired
	}
	codeObj, ok := p.CodeObjs[trimmedCodeObjID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjNotFound, trimmedCodeObjID)
	}
	codeObj.DisplayName = displayName
	p.CodeObjs[codeObj.ID] = codeObj
	return nil
}

func (d *Document) SetCodeObjectDisplayName(projectID string, codeObjID string, displayName string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetCodeObjectDisplayName(codeObjID, displayName); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetCodeObjectDisplayName(ctx context.Context, projectID string, codeObjID string, displayName string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetCodeObjectDisplayName(projectID, codeObjID, displayName); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p Project) resolveTypeErrorIgnoreContext(sectionID string) (Section, SectionVariant, SectionImpl, map[string]any, error) {
	section, variant, impl, err := p.ResolveSection(sectionID)
	if err != nil {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, err
	}
	payload, err := effectiveSectionPayload(p, section.ID, variant.ID)
	if err != nil {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, err
	}
	if _, ok := payload["codeObjVariantMap"]; !ok {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, fmt.Errorf("%w: %q", ErrTypeErrorIgnoreUnsupported, sectionID)
	}
	return section, variant, impl, payload, nil
}

func (p *Project) setCurrentTypeErrorIgnoreState(sectionID string, ignoreState TypeErrorIgnoreState) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalized, err := normalizeTypeErrorIgnoreState(ignoreState)
	if err != nil {
		return err
	}
	if _, _, _, _, err := p.resolveTypeErrorIgnoreContext(sectionID); err != nil {
		return err
	}

	return p.setCurrentSectionField(sectionID, "ignoreTypeErrors", map[string]any{
		"callable": normalized.Callable,
		"params":   cloneBoolMap(normalized.Params),
	})
}

func typeErrorIgnoreStateFromValue(value any) (TypeErrorIgnoreState, error) {
	state := TypeErrorIgnoreState{
		Params: map[string]bool{},
	}
	if value == nil {
		return state, nil
	}
	object, ok := value.(map[string]any)
	if !ok {
		return TypeErrorIgnoreState{}, ErrInvalidTypeErrorIgnoreState
	}

	if rawCallable, ok := object["callable"]; ok {
		callable, ok := rawCallable.(bool)
		if !ok {
			return TypeErrorIgnoreState{}, ErrInvalidTypeErrorIgnoreState
		}
		state.Callable = callable
	}
	if rawParams, ok := object["params"]; ok {
		params, ok := rawParams.(map[string]any)
		if !ok {
			return TypeErrorIgnoreState{}, ErrInvalidTypeErrorIgnoreState
		}
		for paramID, rawIgnore := range params {
			ignored, ok := rawIgnore.(bool)
			if !ok {
				return TypeErrorIgnoreState{}, ErrInvalidTypeErrorIgnoreState
			}
			if ignored {
				state.Params[paramID] = true
			}
		}
	}
	return normalizeTypeErrorIgnoreState(state)
}

func normalizeTypeErrorIgnoreState(state TypeErrorIgnoreState) (TypeErrorIgnoreState, error) {
	normalized := TypeErrorIgnoreState{
		Callable: state.Callable,
		Params:   map[string]bool{},
	}
	for paramID, ignored := range state.Params {
		trimmedParamID := strings.TrimSpace(paramID)
		if trimmedParamID == "" {
			return TypeErrorIgnoreState{}, ErrInvalidTypeErrorIgnoreState
		}
		if ignored {
			normalized.Params[trimmedParamID] = true
		}
	}
	return normalized, nil
}
