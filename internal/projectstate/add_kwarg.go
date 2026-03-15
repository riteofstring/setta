package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrAddKwargUnsupported           = errors.New("section does not support add_kwarg")
	ErrAddKwargCallableUnset         = errors.New("callable section must have an active callable before add_kwarg")
	ErrAddKwargParentTypeUnsupported = errors.New("add_kwarg parent code object type is not supported")
)

const (
	addKwargDictRootName   = ""
	nestedParamCodeObjType = "NestedParam"
)

func isKwargDictLikeSectionType(sectionType string) bool {
	return sectionType == "Dict" || sectionType == "GlobalVariables"
}

type AddKwargResult struct {
	CodeObjID string `json:"codeObjId"`
}

func (d *Document) AddKwarg(projectID string, sectionID string) (AddKwargResult, error) {
	if d == nil {
		return AddKwargResult{}, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return AddKwargResult{}, err
	}
	result, err := project.AddKwarg(sectionID)
	if err != nil {
		return AddKwargResult{}, err
	}
	d.Projects[project.ID] = project
	return result, nil
}

func (r *Runtime) AddKwarg(ctx context.Context, projectID string, sectionID string) (Snapshot, AddKwargResult, error) {
	if r == nil {
		return Snapshot{}, AddKwargResult{}, ErrRuntimeClosed
	}

	var result AddKwargResult
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		var mutationErr error
		result, mutationErr = document.AddKwarg(projectID, sectionID)
		if mutationErr != nil {
			return document, mutationErr
		}
		return document, nil
	})
	if err != nil {
		return Snapshot{}, AddKwargResult{}, err
	}
	return snapshot, result, nil
}

func (p *Project) AddKwarg(sectionID string) (AddKwargResult, error) {
	if p == nil {
		return AddKwargResult{}, ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return AddKwargResult{}, ErrSectionIDRequired
	}

	sectionType, sectionPayload, err := p.resolveAddKwargSectionContext(trimmedSectionID)
	if err != nil {
		return AddKwargResult{}, err
	}

	var codeObjID string
	switch sectionType {
	case "Callable":
		codeObjID, err = p.addKwargToCallableSection(trimmedSectionID, sectionPayload)
	case "Dict", "GlobalVariables":
		codeObjID, err = p.addKwargToDictSection(trimmedSectionID, sectionPayload)
	default:
		return AddKwargResult{}, fmt.Errorf("%w: section=%q type=%q", ErrAddKwargUnsupported, trimmedSectionID, sectionType)
	}
	if err != nil {
		return AddKwargResult{}, err
	}
	return AddKwargResult{CodeObjID: codeObjID}, nil
}

func (p Project) resolveAddKwargSectionContext(sectionID string) (string, map[string]any, error) {
	section, variant, impl, err := p.ResolveSection(sectionID)
	if err != nil {
		return "", nil, err
	}
	payload, err := effectiveSectionPayload(p, section.ID, variant.ID)
	if err != nil {
		return "", nil, err
	}
	sectionType := canonicalSectionType(payloadStringField(payload, "type"), impl)
	if sectionType != "Callable" && !isKwargDictLikeSectionType(sectionType) {
		return "", nil, fmt.Errorf("%w: section=%q type=%q", ErrAddKwargUnsupported, sectionID, sectionType)
	}
	return sectionType, payload, nil
}

func (p *Project) addKwargToCallableSection(sectionID string, sectionPayload map[string]any) (string, error) {
	callableID := payloadStringField(sectionPayload, "callable")
	if callableID == "" {
		return "", fmt.Errorf("%w: section=%q", ErrAddKwargCallableUnset, sectionID)
	}

	callablePayload, _, _, callableImpl, err := p.resolveCurrentCodeObjectContext(sectionID, callableID)
	if err != nil {
		return "", err
	}
	callableType := payloadStringField(callablePayload, "type")
	if callableType == "" {
		callableType = strings.TrimSpace(callableImpl.Type)
	}
	if callableType != codeCallableType {
		return "", fmt.Errorf("%w: codeObj=%q type=%q", ErrAddKwargParentTypeUnsupported, callableID, callableType)
	}

	paramCore, paramVariant, paramImpl, err := newAddKwargCodeObject("")
	if err != nil {
		return "", err
	}
	p.storeCreatedCodeObject(paramCore, paramVariant, paramImpl)
	if err := p.setSectionCodeObjectVariant(sectionID, paramCore.ID, paramVariant.ID); err != nil {
		return "", err
	}

	nextChildIDs := append(payloadStringArrayField(callablePayload, "children"), paramCore.ID)
	if err := p.setCurrentCodeObjectField(sectionID, callableID, "children", nextChildIDs); err != nil {
		return "", err
	}
	return paramCore.ID, nil
}

func (p *Project) addKwargToDictSection(sectionID string, sectionPayload map[string]any) (string, error) {
	topLevelParamID := payloadStringField(sectionPayload, "topLevelParamId")
	var err error
	if topLevelParamID == "" {
		topLevelParamID, err = p.ensureDictTopLevelParam(sectionID)
		if err != nil {
			return "", err
		}
	}

	rootPayload, _, _, rootImpl, err := p.resolveCurrentCodeObjectContext(sectionID, topLevelParamID)
	if err != nil {
		return "", err
	}
	rootType := payloadStringField(rootPayload, "type")
	if rootType == "" {
		rootType = strings.TrimSpace(rootImpl.Type)
	}
	if rootType != nestedParamCodeObjType {
		return "", fmt.Errorf("%w: codeObj=%q type=%q", ErrAddKwargParentTypeUnsupported, topLevelParamID, rootType)
	}

	sharedSectionIDs, err := p.dictSectionIDsForTopLevelParam(topLevelParamID)
	if err != nil {
		return "", err
	}
	paramCore, paramVariant, paramImpl, err := newAddKwargCodeObject("")
	if err != nil {
		return "", err
	}
	p.storeCreatedCodeObject(paramCore, paramVariant, paramImpl)
	for _, sharedSectionID := range sharedSectionIDs {
		if err := p.setSectionCodeObjectVariant(sharedSectionID, paramCore.ID, paramVariant.ID); err != nil {
			return "", err
		}
	}

	nextChildIDs := append(payloadStringArrayField(rootPayload, "children"), paramCore.ID)
	if err := p.setCurrentCodeObjectField(sectionID, topLevelParamID, "children", nextChildIDs); err != nil {
		return "", err
	}
	return paramCore.ID, nil
}

func (p *Project) ensureDictTopLevelParam(sectionID string) (string, error) {
	rootCore, rootVariant, rootImpl, err := newAddKwargDictRootCodeObject(addKwargDictRootName)
	if err != nil {
		return "", err
	}
	p.storeCreatedCodeObject(rootCore, rootVariant, rootImpl)
	if err := p.setSectionCodeObjectVariant(sectionID, rootCore.ID, rootVariant.ID); err != nil {
		return "", err
	}
	if err := p.setCurrentSectionField(sectionID, "topLevelParamId", rootCore.ID); err != nil {
		return "", err
	}
	return rootCore.ID, nil
}

func (p Project) dictSectionIDsForTopLevelParam(topLevelParamID string) ([]string, error) {
	matches := []string{}
	for _, sectionID := range sortedProjectSectionIDs(p.SectionVariantMap) {
		sectionType, payload, err := p.resolveAddKwargSectionContext(sectionID)
		if err != nil {
			if errors.Is(err, ErrAddKwargUnsupported) {
				continue
			}
			return nil, err
		}
		if !isKwargDictLikeSectionType(sectionType) {
			continue
		}
		if payloadStringField(payload, "topLevelParamId") == topLevelParamID {
			matches = append(matches, sectionID)
		}
	}
	if len(matches) == 0 {
		return nil, fmt.Errorf("%w: %q", ErrSectionNotFound, topLevelParamID)
	}
	return matches, nil
}

func (p *Project) storeCreatedCodeObject(core CodeObject, variant CodeObjectVariant, impl CodeObjectImpl) {
	if p.CodeObjs == nil {
		p.CodeObjs = map[string]CodeObject{}
	}
	if p.CodeObjVariants == nil {
		p.CodeObjVariants = map[string]CodeObjectVariant{}
	}
	if p.CodeObjImpls == nil {
		p.CodeObjImpls = map[string]CodeObjectImpl{}
	}
	p.CodeObjs[core.ID] = core
	p.CodeObjVariants[variant.ID] = variant
	p.CodeObjImpls[impl.ID] = impl
}

func newAddKwargCodeObject(name string) (CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	codeObjID, err := newProjectStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	variantID, err := newProjectStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	implID, err := newProjectStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}

	payload, err := buildCreatedCodeObjectPayload(implID, codeParamType, map[string]any{
		"coreNameEditable": true,
		"passingStyle":     "DEFAULT",
		"value":            "",
	})
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	return CodeObject{
			ID:               codeObjID,
			Name:             strings.TrimSpace(name),
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		},
		CodeObjectVariant{
			ID:               variantID,
			ImplID:           implID,
			NonPresetImplIDs: []string{implID},
		},
		CodeObjectImpl{
			ID:      implID,
			Type:    codeParamType,
			Payload: payload,
		},
		nil
}

func newAddKwargDictRootCodeObject(name string) (CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	codeObjID, err := newProjectStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	variantID, err := newProjectStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	implID, err := newProjectStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}

	payload, err := buildCreatedCodeObjectPayload(implID, nestedParamCodeObjType, map[string]any{
		"children": []string{},
	})
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	return CodeObject{
			ID:               codeObjID,
			Name:             strings.TrimSpace(name),
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		},
		CodeObjectVariant{
			ID:               variantID,
			ImplID:           implID,
			NonPresetImplIDs: []string{implID},
		},
		CodeObjectImpl{
			ID:      implID,
			Type:    nestedParamCodeObjType,
			Payload: payload,
		},
		nil
}
