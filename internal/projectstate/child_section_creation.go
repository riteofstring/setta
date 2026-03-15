package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

const defaultTerminalSectionHeight = 150.0

var (
	ErrChildSectionParentIDRequired    = errors.New("child section parentId is required")
	ErrChildSectionImplTypeRequired    = errors.New("child section implType is required")
	ErrChildSectionImplTypeUnsupported = errors.New("child section implType is not supported yet")
	ErrChildSectionCountInvalid        = errors.New("child section numChildren must be at least 1")
	ErrChildSectionStartIdxInvalid     = errors.New("child section startIdx must be between 0 and the parent child count")
	ErrChildSectionParentUnsupported   = errors.New("parent section does not support child creation")
	ErrCodeSectionChildTypeInvalid     = errors.New("code sections can only create terminal children")
	ErrCodeSectionChildCountInvalid    = errors.New("code sections can only create one terminal child")
	ErrCodeSectionAlreadyHasChild      = errors.New("code section already has a child")
)

type CreateChildSectionsInput struct {
	ParentID    string `json:"parentId"`
	ImplType    string `json:"implType"`
	NumChildren int    `json:"numChildren"`
	StartIdx    *int   `json:"startIdx,omitempty"`
}

type CreateChildSectionsResult struct {
	SectionIDs []string `json:"sectionIds"`
}

type createdChildSectionState struct {
	section              Section
	variant              SectionVariant
	impl                 SectionImpl
	metaControlParamCore *CodeObject
	metaControlParamVar  *CodeObjectVariant
	metaControlParamImpl *CodeObjectImpl
}

func (d *Document) CreateChildSections(
	projectID string,
	input CreateChildSectionsInput,
	settings StructuralMutationSettings,
) (CreateChildSectionsResult, error) {
	if d == nil {
		return CreateChildSectionsResult{}, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return CreateChildSectionsResult{}, err
	}
	result, err := project.CreateChildSections(input, settings)
	if err != nil {
		return CreateChildSectionsResult{}, err
	}
	d.Projects[project.ID] = project
	return result, nil
}

func (r *Runtime) CreateChildSections(
	ctx context.Context,
	projectID string,
	input CreateChildSectionsInput,
	settings StructuralMutationSettings,
) (Snapshot, CreateChildSectionsResult, error) {
	if r == nil {
		return Snapshot{}, CreateChildSectionsResult{}, ErrRuntimeClosed
	}

	var result CreateChildSectionsResult
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		var mutationErr error
		result, mutationErr = document.CreateChildSections(projectID, input, settings)
		if mutationErr != nil {
			return document, mutationErr
		}
		return document, nil
	})
	if err != nil {
		return Snapshot{}, CreateChildSectionsResult{}, err
	}
	return snapshot, result, nil
}

func (p *Project) CreateChildSections(
	input CreateChildSectionsInput,
	settings StructuralMutationSettings,
) (CreateChildSectionsResult, error) {
	if p == nil {
		return CreateChildSectionsResult{}, ErrProjectNotFound
	}

	normalizedSettings := normalizeStructuralMutationSettings(settings)
	normalized, err := normalizeCreateChildSectionsInput(input)
	if err != nil {
		return CreateChildSectionsResult{}, err
	}

	parentSection, parentVariant, parentImpl, err := p.ResolveSection(normalized.ParentID)
	if err != nil {
		return CreateChildSectionsResult{}, err
	}
	parentPayload, err := effectiveSectionPayload(*p, parentSection.ID, parentVariant.ID)
	if err != nil {
		return CreateChildSectionsResult{}, err
	}
	parentType := payloadStringField(parentPayload, "type")
	if parentType == "" {
		parentType = fallbackSectionType(parentImpl)
	}
	parentChildren, parentHasChildren := payloadChildren(parentPayload)
	if !parentImpl.IsCode() && !parentHasChildren {
		return CreateChildSectionsResult{}, fmt.Errorf("%w: parent=%q", ErrChildSectionParentUnsupported, parentSection.ID)
	}
	if err := validateCreateChildSectionsParent(parentSection.ID, parentImpl, parentChildren, normalized); err != nil {
		return CreateChildSectionsResult{}, err
	}

	startIdx := len(parentChildren)
	if normalized.StartIdx != nil {
		startIdx = *normalized.StartIdx
	}
	if startIdx < 0 || startIdx > len(parentChildren) {
		return CreateChildSectionsResult{}, fmt.Errorf("%w: startIdx=%d childCount=%d", ErrChildSectionStartIdxInvalid, startIdx, len(parentChildren))
	}

	parentWidth, err := resolveAutoLayoutDimension(
		normalizedSettings.SectionSizingPolicy,
		parentSection.ID,
		parentType,
		"width",
		nil,
		parentPayload,
	)
	if err != nil {
		return CreateChildSectionsResult{}, err
	}
	childNames, err := childSiblingNames(*p, parentChildren)
	if err != nil {
		return CreateChildSectionsResult{}, err
	}

	createdChildren := make([]createdChildSectionState, 0, normalized.NumChildren)
	createdIDs := make([]string, 0, normalized.NumChildren)
	for range normalized.NumChildren {
		created, err := newCreatedChildSectionState(
			*p,
			childNames,
			parentSection.ID,
			normalized.ImplType,
			parentWidth,
			parentImpl.IsCode(),
			normalizedSettings,
		)
		if err != nil {
			return CreateChildSectionsResult{}, err
		}
		childNames = append(childNames, created.section.Name)
		createdChildren = append(createdChildren, created)
		createdIDs = append(createdIDs, created.section.ID)
	}

	if p.Sections == nil {
		p.Sections = map[string]Section{}
	}
	if p.SectionVariants == nil {
		p.SectionVariants = map[string]SectionVariant{}
	}
	if p.SectionImpls == nil {
		p.SectionImpls = map[string]SectionImpl{}
	}
	if p.SectionVariantMap == nil {
		p.SectionVariantMap = map[string]string{}
	}
	if p.CodeObjs == nil {
		p.CodeObjs = map[string]CodeObject{}
	}
	if p.CodeObjVariants == nil {
		p.CodeObjVariants = map[string]CodeObjectVariant{}
	}
	if p.CodeObjImpls == nil {
		p.CodeObjImpls = map[string]CodeObjectImpl{}
	}

	for _, created := range createdChildren {
		p.Sections[created.section.ID] = created.section
		p.SectionVariants[created.variant.ID] = created.variant
		p.SectionImpls[created.impl.ID] = created.impl
		p.SectionVariantMap[created.section.ID] = created.variant.ID
		if created.metaControlParamCore != nil && created.metaControlParamVar != nil && created.metaControlParamImpl != nil {
			p.CodeObjs[created.metaControlParamCore.ID] = *created.metaControlParamCore
			p.CodeObjVariants[created.metaControlParamVar.ID] = *created.metaControlParamVar
			p.CodeObjImpls[created.metaControlParamImpl.ID] = *created.metaControlParamImpl
		}
	}

	nextChildren := insertStringSlice(parentChildren, startIdx, createdIDs)
	parentPayload["children"] = append([]string(nil), nextChildren...)
	if parentImpl.IsCode() {
		parentPayload["attachedTerminalSectionId"] = createdIDs[0]
		if err := ensureEmbeddedCodeSectionPayloadSize(
			parentSection.ID,
			parentPayload,
			normalizedSettings.SectionSizingPolicy,
		); err != nil {
			return CreateChildSectionsResult{}, err
		}
		parentImpl.Code.AttachedTerminalSectionID = createdIDs[0]
		parentImpl.Code.Children = append([]string(nil), nextChildren...)
	}
	parentRaw, err := marshalProjectObject(parentPayload)
	if err != nil {
		return CreateChildSectionsResult{}, err
	}
	parentImpl.Payload = parentRaw
	p.SectionImpls[parentVariant.ImplID] = parentImpl

	return CreateChildSectionsResult{SectionIDs: createdIDs}, nil
}

func normalizeCreateChildSectionsInput(input CreateChildSectionsInput) (CreateChildSectionsInput, error) {
	normalized := CreateChildSectionsInput{
		ParentID:    strings.TrimSpace(input.ParentID),
		ImplType:    strings.TrimSpace(input.ImplType),
		NumChildren: input.NumChildren,
	}
	if input.StartIdx != nil {
		startIdx := *input.StartIdx
		normalized.StartIdx = &startIdx
	}
	if normalized.ParentID == "" {
		return CreateChildSectionsInput{}, ErrChildSectionParentIDRequired
	}
	if normalized.ImplType == "" {
		return CreateChildSectionsInput{}, ErrChildSectionImplTypeRequired
	}
	normalizedImplType, err := normalizeCreateChildSectionImplType(normalized.ImplType)
	if err != nil {
		return CreateChildSectionsInput{}, err
	}
	normalized.ImplType = normalizedImplType
	if normalized.NumChildren < 1 {
		return CreateChildSectionsInput{}, ErrChildSectionCountInvalid
	}
	return normalized, nil
}

func isSupportedChildSectionImplType(implType string) bool {
	_, err := normalizeCreateChildSectionImplType(implType)
	return err == nil
}

func normalizeCreateChildSectionImplType(implType string) (string, error) {
	trimmed := strings.TrimSpace(implType)
	switch trimmed {
	case "", "StateMachineStart", "StateMachineGate", "StateMachineEnd":
		return "", fmt.Errorf("%w: %q", ErrChildSectionImplTypeUnsupported, trimmed)
	}
	if !isSupportedTopLevelSectionImplType(trimmed) {
		return "", fmt.Errorf("%w: %q", ErrChildSectionImplTypeUnsupported, trimmed)
	}
	return trimmed, nil
}

func validateCreateChildSectionsParent(
	parentID string,
	parentImpl SectionImpl,
	parentChildren []string,
	input CreateChildSectionsInput,
) error {
	if !parentImpl.IsCode() {
		return nil
	}
	if input.ImplType != "Terminal" {
		return fmt.Errorf("%w: parent=%q implType=%q", ErrCodeSectionChildTypeInvalid, parentID, input.ImplType)
	}
	if input.NumChildren != 1 {
		return fmt.Errorf("%w: parent=%q numChildren=%d", ErrCodeSectionChildCountInvalid, parentID, input.NumChildren)
	}
	if len(parentChildren) != 0 || strings.TrimSpace(parentImpl.Code.AttachedTerminalSectionID) != "" {
		return fmt.Errorf("%w: parent=%q", ErrCodeSectionAlreadyHasChild, parentID)
	}
	return nil
}

func newCreatedChildSectionState(
	project Project,
	existingSiblingNames []string,
	parentID string,
	implType string,
	parentWidth float64,
	codeParent bool,
	settings StructuralMutationSettings,
) (createdChildSectionState, error) {
	sectionID, err := newProjectStateID()
	if err != nil {
		return createdChildSectionState{}, err
	}
	variantID, err := newProjectStateID()
	if err != nil {
		return createdChildSectionState{}, err
	}
	implID, err := newProjectStateID()
	if err != nil {
		return createdChildSectionState{}, err
	}

	impl, metaControlParamCore, metaControlParamVar, metaControlParamImpl, err := buildCreatedTopLevelSectionImpl(
		implID,
		CreateTopLevelSectionInput{
			ImplType: implType,
		},
		settings,
	)
	if err != nil {
		return createdChildSectionState{}, err
	}
	impl, err = applyCreatedChildSectionSizing(
		impl,
		parentWidth,
		codeParent,
		settings.TerminalDefaultHeight,
	)
	if err != nil {
		return createdChildSectionState{}, err
	}
	sectionName, err := nextAvailableCreatedChildSectionName(existingSiblingNames, implType)
	if err != nil {
		return createdChildSectionState{}, err
	}

	return createdChildSectionState{
		section: Section{
			ID:               sectionID,
			Name:             sectionName,
			ParentSectionID:  parentID,
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		},
		variant: SectionVariant{
			ID:               variantID,
			ImplID:           impl.ID,
			NonPresetImplIDs: []string{impl.ID},
		},
		impl:                 impl,
		metaControlParamCore: metaControlParamCore,
		metaControlParamVar:  metaControlParamVar,
		metaControlParamImpl: metaControlParamImpl,
	}, nil
}

func applyCreatedChildSectionSizing(
	impl SectionImpl,
	parentWidth float64,
	codeParent bool,
	terminalDefaultHeight float64,
) (SectionImpl, error) {
	payload, err := rawObjectFromProjectPayload(impl.Payload)
	if err != nil {
		return SectionImpl{}, err
	}
	size, ok := payloadObjectField(payload, "size")
	if !ok {
		size = map[string]any{}
	}
	size["width"] = parentWidth
	if codeParent && strings.EqualFold(payloadStringField(payload, "type"), "Terminal") {
		size["height"] = terminalDefaultHeight
	}
	payload["size"] = size

	raw, err := marshalProjectObject(payload)
	if err != nil {
		return SectionImpl{}, err
	}
	impl.Payload = raw
	return impl, nil
}

func ensureEmbeddedCodeSectionPayloadSize(
	sectionID string,
	payload map[string]any,
	policy AutoLayoutSectionSizingPolicy,
) error {
	codeMinimum, ok := policy.ByType["Code"]
	if !ok {
		return &InvalidAutoLayoutError{
			Message: fmt.Sprintf("Section %q is missing Code sizing policy.", sectionID),
		}
	}
	terminalMinimum, ok := policy.ByType["Terminal"]
	if !ok {
		return &InvalidAutoLayoutError{
			Message: fmt.Sprintf("Section %q is missing Terminal sizing policy.", sectionID),
		}
	}

	targetHeight := codeMinimum.MinHeight + terminalMinimum.MinHeight + 80.0
	size, ok := payloadObjectField(payload, "size")
	if !ok {
		size = map[string]any{}
	}
	currentHeight, isAuto, present, err := payloadAutoLayoutSizeValue(size, "height")
	if err != nil {
		return err
	}
	if !present || isAuto || currentHeight < targetHeight {
		size["height"] = targetHeight
	}
	payload["size"] = size
	return nil
}

func payloadChildren(payload map[string]any) ([]string, bool) {
	if payload == nil {
		return nil, false
	}
	_, ok := payload["children"]
	return payloadStringArrayField(payload, "children"), ok
}

func childSiblingNames(project Project, childIDs []string) ([]string, error) {
	names := make([]string, 0, len(childIDs))
	for _, childID := range childIDs {
		section, ok := project.Sections[childID]
		if !ok {
			return nil, fmt.Errorf("%w: %q", ErrSectionNotFound, childID)
		}
		names = append(names, section.Name)
	}
	return names, nil
}

func nextAvailableCreatedChildSectionName(existingNames []string, implType string) (string, error) {
	if preferredName, ok := preferredCreatedSectionName(implType); ok && createdSectionNameAvailable(existingNames, preferredName) {
		return preferredName, nil
	}
	return nextAvailableMemorableName(func(candidate string) (bool, error) {
		return createdSectionNameAvailable(existingNames, candidate), nil
	})
}

func createdSectionNameAvailable(existingNames []string, candidate string) bool {
	normalized := strings.TrimSpace(candidate)
	if normalized == "" {
		return false
	}
	normalizedSlug := sanitizeSectionSlug(normalized)
	normalizedIdentifier := sanitizeSectionPythonIdentifier(normalized)
	for _, existingName := range existingNames {
		trimmedExisting := strings.TrimSpace(existingName)
		if trimmedExisting == normalized {
			return false
		}
		if sanitizeSectionSlug(trimmedExisting) == normalizedSlug {
			return false
		}
		if sanitizeSectionPythonIdentifier(trimmedExisting) == normalizedIdentifier {
			return false
		}
	}
	return true
}

func insertStringSlice(values []string, index int, inserts []string) []string {
	if len(inserts) == 0 {
		return append([]string(nil), values...)
	}
	output := make([]string, 0, len(values)+len(inserts))
	output = append(output, values[:index]...)
	output = append(output, inserts...)
	output = append(output, values[index:]...)
	return output
}
