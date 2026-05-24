package projectstate

import (
	"fmt"
	"strings"
)

func newCreatedTopLevelSectionState(
	project Project,
	input CreateTopLevelSectionInput,
	settings StructuralMutationSettings,
) (createdTopLevelSectionState, error) {
	sectionID, err := newProjectStateID()
	if err != nil {
		return createdTopLevelSectionState{}, err
	}
	variantID, err := newProjectStateID()
	if err != nil {
		return createdTopLevelSectionState{}, err
	}
	implID, err := newProjectStateID()
	if err != nil {
		return createdTopLevelSectionState{}, err
	}

	impl, metaControlParamCore, metaControlParamVar, metaControlParamImpl, err := buildCreatedTopLevelSectionImpl(
		implID,
		input,
		settings,
	)
	if err != nil {
		return createdTopLevelSectionState{}, err
	}
	sectionName, err := nextAvailableCreatedTopLevelSectionName(project, input.ImplType)
	if err != nil {
		return createdTopLevelSectionState{}, err
	}

	return createdTopLevelSectionState{
		section: Section{
			ID:               sectionID,
			Name:             sectionName,
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		},
		variant: SectionVariant{
			ID:               variantID,
			Name:             sectionName,
			ImplID:           impl.ID,
			NonPresetImplIDs: []string{impl.ID},
		},
		impl:                 impl,
		metaControlParamCore: metaControlParamCore,
		metaControlParamVar:  metaControlParamVar,
		metaControlParamImpl: metaControlParamImpl,
	}, nil
}

func applyCreatedTopLevelSectionState(
	p *Project,
	created createdTopLevelSectionState,
	layout TopLevelSectionLayout,
) *string {
	if p == nil {
		return nil
	}
	initializeCreatedTopLevelSectionMaps(p)
	attachCreatedTopLevelSectionState(p, created, layout)
	applyCreatedTopLevelSectionViewModes(p, created.section.ID, layout)
	return applyCreatedTopLevelSectionMetaControlParam(p, created)
}

func initializeCreatedTopLevelSectionMaps(p *Project) {
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
	if p.TopLevelSections == nil {
		p.TopLevelSections = map[string]TopLevelSectionLayout{}
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
}

func attachCreatedTopLevelSectionState(
	p *Project,
	created createdTopLevelSectionState,
	layout TopLevelSectionLayout,
) {
	p.Sections[created.section.ID] = created.section
	p.SectionVariants[created.variant.ID] = created.variant
	p.SectionImpls[created.impl.ID] = created.impl
	p.SectionVariantMap[created.section.ID] = created.variant.ID
	if !containsString(p.TopLevelSectionIDs, created.section.ID) {
		p.TopLevelSectionIDs = append(p.TopLevelSectionIDs, created.section.ID)
	}
	p.TopLevelSections[created.section.ID] = layout.Clone()
}

func applyCreatedTopLevelSectionViewModes(p *Project, sectionID string, layout TopLevelSectionLayout) {
	for viewModeID, viewMode := range p.ViewModes {
		if viewMode.VisibilityBySectionID == nil {
			viewMode.VisibilityBySectionID = map[string]bool{}
		}
		viewMode.VisibilityBySectionID[sectionID] = true
		if viewMode.TopLevelSections == nil {
			viewMode.TopLevelSections = map[string]TopLevelSectionLayout{}
		}
		viewMode.TopLevelSections[sectionID] = layout.Clone()
		p.ViewModes[viewModeID] = viewMode
	}
}

func applyCreatedTopLevelSectionMetaControlParam(
	p *Project,
	created createdTopLevelSectionState,
) *string {
	if created.metaControlParamCore == nil || created.metaControlParamVar == nil || created.metaControlParamImpl == nil {
		return nil
	}
	p.CodeObjs[created.metaControlParamCore.ID] = *created.metaControlParamCore
	p.CodeObjVariants[created.metaControlParamVar.ID] = *created.metaControlParamVar
	p.CodeObjImpls[created.metaControlParamImpl.ID] = *created.metaControlParamImpl
	return &created.metaControlParamCore.ID
}

func buildCreatedTopLevelSectionImpl(
	implID string,
	input CreateTopLevelSectionInput,
	settings StructuralMutationSettings,
) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
	builder, ok := topLevelSectionImplBuilders[input.ImplType]
	if !ok {
		return SectionImpl{}, nil, nil, nil, fmt.Errorf("%w: %q", ErrTopLevelSectionImplTypeUnsupported, input.ImplType)
	}
	return builder(implID, input, settings)
}

func newFrontendTopLevelSectionImplBuilder(
	implType string,
	defaults func() map[string]any,
) topLevelSectionImplBuilder {
	return func(
		implID string,
		input CreateTopLevelSectionInput,
		settings StructuralMutationSettings,
	) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
		return buildCreatedFrontendSectionImpl(implID, implType, defaults(), settings, input.ImplOverrides)
	}
}

func newPayloadTopLevelSectionImplBuilder(
	implType string,
	kind SectionKind,
	defaults func() map[string]any,
) topLevelSectionImplBuilder {
	return func(
		implID string,
		input CreateTopLevelSectionInput,
		settings StructuralMutationSettings,
	) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
		payload, err := buildCreatedSectionPayload(implID, implType, defaults(), settings, input.ImplOverrides)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: kind, Payload: payload}, nil, nil, nil, nil
	}
}

func newGeneratedTopLevelSectionImplBuilder(
	implType string,
	generatedKind GeneratedSectionKind,
) topLevelSectionImplBuilder {
	return func(
		implID string,
		input CreateTopLevelSectionInput,
		settings StructuralMutationSettings,
	) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
		return buildCreatedGeneratedSectionImpl(
			implID,
			implType,
			generatedKind,
			createdGeneratedCodeSectionDefaults(implType),
			settings,
			input.ImplOverrides,
		)
	}
}

func newStateMachineTopLevelSectionImplBuilder(
	implType string,
	defaults func(string) map[string]any,
) topLevelSectionImplBuilder {
	return func(
		implID string,
		input CreateTopLevelSectionInput,
		settings StructuralMutationSettings,
	) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
		machineGroupID, err := newProjectStateID()
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		payload, err := buildCreatedSectionPayload(implID, implType, defaults(machineGroupID), settings, input.ImplOverrides)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind(implType), Payload: payload}, nil, nil, nil, nil
	}
}

func buildCreatedCodeTopLevelSectionImpl(
	implID string,
	input CreateTopLevelSectionInput,
	settings StructuralMutationSettings,
) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
	payload, err := buildCreatedSectionPayload(implID, "Code", createdCodeSectionDefaults(), settings, input.ImplOverrides)
	if err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	payloadObject, err := rawObjectFromProjectPayload(payload)
	if err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	codeLanguage := normalizeCodeLanguage(CodeLanguage(payloadStringField(payloadObject, "codeLanguage")))
	if codeLanguage == "" {
		codeLanguage = CodeLanguagePython
	}
	return SectionImpl{
		ID:      implID,
		Kind:    SectionKindCode,
		Payload: payload,
		Code: &CodeSectionImpl{
			Language: codeLanguage,
		},
	}, nil, nil, nil, nil
}

func buildCreatedDrawTopLevelSectionImpl(
	implID string,
	input CreateTopLevelSectionInput,
	settings StructuralMutationSettings,
) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
	payloadObject, err := buildCreatedSectionObject(implID, "Draw", createdDrawSectionDefaults(), settings, input.ImplOverrides)
	if err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	if err := initializeCreatedDrawSectionObject(payloadObject); err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	payload, err := marshalProjectObject(payloadObject)
	if err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	payloadObject, err = rawObjectFromProjectPayload(payload)
	if err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	return SectionImpl{
		ID:      implID,
		Kind:    SectionKindDraw,
		Payload: payload,
		Draw: &DrawSectionImpl{
			RenderedImagePath: payloadRawStringField(payloadObject, "renderedImagePath"),
		},
	}, nil, nil, nil, nil
}

func buildCreatedMetaControlTopLevelSectionImpl(
	implID string,
	input CreateTopLevelSectionInput,
	settings StructuralMutationSettings,
) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
	controlType := "SliderParam"
	if input.ControlCodeObjType != nil && strings.TrimSpace(*input.ControlCodeObjType) != "" {
		controlType = strings.TrimSpace(*input.ControlCodeObjType)
	}
	if !isSupportedMetaControlCodeObjType(controlType) {
		return SectionImpl{}, nil, nil, nil, fmt.Errorf("%w: %q", ErrTopLevelMetaControlCodeObjTypeUnsupported, controlType)
	}
	paramCore, paramVariant, paramImpl, err := newMetaControlParam(controlType)
	if err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	payload, err := buildCreatedSectionPayload(
		implID,
		"MetaControl",
		createdMetaControlSectionDefaults(paramCore.ID, paramVariant.ID),
		settings,
		input.ImplOverrides,
	)
	if err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	return SectionImpl{ID: implID, Kind: SectionKind("metacontrol"), Payload: payload}, &paramCore, &paramVariant, &paramImpl, nil
}

func buildCreatedTaskBoardTopLevelSectionImpl(
	implID string,
	input CreateTopLevelSectionInput,
	settings StructuralMutationSettings,
) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
	payloadObject, err := buildCreatedSectionObject(
		implID,
		"TaskBoard",
		createdTaskBoardSectionDefaults(),
		settings,
		input.ImplOverrides,
	)
	if err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	if err := initializeCreatedTaskBoardColumns(payloadObject, settings, input.ImplOverrides); err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	payload, err := marshalProjectObject(payloadObject)
	if err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	return SectionImpl{
		ID:      implID,
		Kind:    SectionKind("frontend"),
		Payload: payload,
	}, nil, nil, nil, nil
}

func buildCreatedTerminalTopLevelSectionImpl(
	implID string,
	input CreateTopLevelSectionInput,
	settings StructuralMutationSettings,
) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
	payload, err := buildCreatedSectionPayload(implID, "Terminal", createdTerminalSectionDefaults(), settings, input.ImplOverrides)
	if err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	return SectionImpl{
		ID:       implID,
		Kind:     SectionKindTerminal,
		Payload:  payload,
		Terminal: &TerminalSectionImpl{},
	}, nil, nil, nil, nil
}

func buildCreatedFrontendSectionImpl(
	implID string,
	implType string,
	defaults map[string]any,
	settings StructuralMutationSettings,
	overrides map[string]any,
) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
	payload, err := buildCreatedSectionPayload(implID, implType, defaults, settings, overrides)
	if err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	return SectionImpl{
		ID:      implID,
		Kind:    SectionKind("frontend"),
		Payload: payload,
	}, nil, nil, nil, nil
}

func buildCreatedGeneratedSectionImpl(
	implID string,
	implType string,
	generatedKind GeneratedSectionKind,
	defaults map[string]any,
	settings StructuralMutationSettings,
	overrides map[string]any,
) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
	payload, err := buildCreatedSectionPayload(implID, implType, defaults, settings, overrides)
	if err != nil {
		return SectionImpl{}, nil, nil, nil, err
	}
	return SectionImpl{
		ID:      implID,
		Kind:    SectionKindGenerated,
		Payload: payload,
		Generated: &GeneratedSectionImpl{
			Kind: generatedKind,
		},
	}, nil, nil, nil, nil
}
