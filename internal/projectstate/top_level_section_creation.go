package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/prompttemplates"
)

var (
	ErrTopLevelSectionImplTypeRequired           = errors.New("top-level section implType is required")
	ErrTopLevelSectionImplTypeUnsupported        = errors.New("top-level section implType is not supported yet")
	ErrTopLevelMetaControlCodeObjTypeUnsupported = errors.New("meta control code object type is not supported yet")
	ErrTopLevelMetaControlCodeObjTypeNotAllowed  = errors.New("controlCodeObjType is only valid for MetaControl sections")
	ErrTopLevelSectionPositionInvalid            = errors.New("top-level section position is invalid")
	ErrTopLevelSectionViewportBoundsInvalid      = errors.New("top-level section viewportBounds is invalid")
)

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type CreateTopLevelSectionInput struct {
	ImplType           string                           `json:"implType"`
	ControlCodeObjType *string                          `json:"controlCodeObjType,omitempty"`
	ImplOverrides      map[string]any                   `json:"implOverrides,omitempty"`
	Position           *Position                        `json:"position,omitempty"`
	Name               *string                          `json:"name,omitempty"`
	TopLevelSections   map[string]TopLevelSectionLayout `json:"topLevelSections,omitempty"`
	ViewportBounds     *ViewportBounds                  `json:"viewportBounds,omitempty"`
}

type CreateTopLevelSectionResult struct {
	SectionID          string    `json:"sectionId"`
	MetaControlParamID *string   `json:"metaControlParamId,omitempty"`
	PanTo              *Position `json:"panTo,omitempty"`
}

type createdTopLevelSectionState struct {
	section              Section
	variant              SectionVariant
	impl                 SectionImpl
	metaControlParamCore *CodeObject
	metaControlParamVar  *CodeObjectVariant
	metaControlParamImpl *CodeObjectImpl
}

func (d *Document) CreateTopLevelSection(
	projectID string,
	input CreateTopLevelSectionInput,
	settings StructuralMutationSettings,
) (CreateTopLevelSectionResult, error) {
	if d == nil {
		return CreateTopLevelSectionResult{}, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return CreateTopLevelSectionResult{}, err
	}
	result, err := project.CreateTopLevelSection(input, settings)
	if err != nil {
		return CreateTopLevelSectionResult{}, err
	}
	d.Projects[project.ID] = project
	return result, nil
}

func (r *Runtime) CreateTopLevelSection(
	ctx context.Context,
	projectID string,
	input CreateTopLevelSectionInput,
	settings StructuralMutationSettings,
) (Snapshot, CreateTopLevelSectionResult, error) {
	if r == nil {
		return Snapshot{}, CreateTopLevelSectionResult{}, ErrRuntimeClosed
	}

	var result CreateTopLevelSectionResult
	snapshot, err := r.MutateAndPersistLater(ctx, func(document Document) (Document, error) {
		var mutationErr error
		result, mutationErr = document.CreateTopLevelSection(projectID, input, settings)
		if mutationErr != nil {
			return document, mutationErr
		}
		if mutationErr = r.reconcileProjectPythonGeneratedSectionsAfterStructuralMutation(ctx, &document, projectID); mutationErr != nil {
			return document, mutationErr
		}
		return document, nil
	})
	if err != nil {
		return Snapshot{}, CreateTopLevelSectionResult{}, err
	}
	return snapshot, result, nil
}

func (p *Project) CreateTopLevelSection(
	input CreateTopLevelSectionInput,
	settings StructuralMutationSettings,
) (CreateTopLevelSectionResult, error) {
	if p == nil {
		return CreateTopLevelSectionResult{}, ErrProjectNotFound
	}

	normalizedSettings := normalizeStructuralMutationSettings(settings)
	normalized, err := normalizeCreateTopLevelSectionInput(input)
	if err != nil {
		return CreateTopLevelSectionResult{}, err
	}

	next := p.Clone()
	next.pruneTopLevelCreationViewState()
	applyTopLevelSectionLayoutSnapshot(&next, normalized.TopLevelSections)

	created, err := newCreatedTopLevelSectionState(next, normalized, normalizedSettings)
	if err != nil {
		return CreateTopLevelSectionResult{}, err
	}
	layout, panTo, err := next.resolveCreateTopLevelSectionLayout(
		normalizedSettings.SectionSizingPolicy,
		normalized,
		created.impl,
	)
	if err != nil {
		return CreateTopLevelSectionResult{}, err
	}

	metaControlParamID := applyCreatedTopLevelSectionState(&next, created, layout)
	if normalized.Name == nil {
		if err := next.syncCreatedTextBlockSectionName(created.section.ID); err != nil {
			return CreateTopLevelSectionResult{}, err
		}
	}
	if normalized.Name != nil {
		if err := next.SetSectionName(created.section.ID, *normalized.Name); err != nil {
			return CreateTopLevelSectionResult{}, err
		}
	}
	*p = next

	return CreateTopLevelSectionResult{
		SectionID:          created.section.ID,
		MetaControlParamID: metaControlParamID,
		PanTo:              panTo,
	}, nil
}

func normalizeCreateTopLevelSectionInput(input CreateTopLevelSectionInput) (CreateTopLevelSectionInput, error) {
	normalized := CreateTopLevelSectionInput{
		ImplType:         strings.TrimSpace(input.ImplType),
		ImplOverrides:    cloneProjectObject(input.ImplOverrides),
		TopLevelSections: cloneTopLevelSectionsMap(input.TopLevelSections),
	}
	if normalized.ImplType == "" {
		return CreateTopLevelSectionInput{}, ErrTopLevelSectionImplTypeRequired
	}
	if !isSupportedTopLevelSectionImplType(normalized.ImplType) {
		return CreateTopLevelSectionInput{}, fmt.Errorf("%w: %q", ErrTopLevelSectionImplTypeUnsupported, normalized.ImplType)
	}

	if input.ControlCodeObjType != nil {
		trimmed := strings.TrimSpace(*input.ControlCodeObjType)
		if trimmed != "" {
			normalized.ControlCodeObjType = &trimmed
		}
	}
	if normalized.ImplType != "MetaControl" && normalized.ControlCodeObjType != nil {
		return CreateTopLevelSectionInput{}, ErrTopLevelMetaControlCodeObjTypeNotAllowed
	}

	if input.Position != nil {
		if !isFinitePosition(*input.Position) {
			return CreateTopLevelSectionInput{}, ErrTopLevelSectionPositionInvalid
		}
		position := *input.Position
		normalized.Position = &position
	}
	if input.Name != nil {
		trimmed := strings.TrimSpace(*input.Name)
		if formatError := sectionNameFormatError(trimmed); formatError != "" {
			return CreateTopLevelSectionInput{}, &InvalidSectionNameError{Message: formatError}
		}
		normalized.Name = &trimmed
	}
	if input.ViewportBounds != nil {
		if !isFiniteViewportBounds(*input.ViewportBounds) {
			return CreateTopLevelSectionInput{}, ErrTopLevelSectionViewportBoundsInvalid
		}
		bounds := *input.ViewportBounds
		normalized.ViewportBounds = &bounds
	}
	return normalized, nil
}

func isFiniteViewportBounds(bounds ViewportBounds) bool {
	return isFiniteFloat(bounds.X) &&
		isFiniteFloat(bounds.Y) &&
		isFiniteFloat(bounds.W) &&
		isFiniteFloat(bounds.H)
}

func isSupportedTopLevelSectionImplType(implType string) bool {
	switch implType {
	case "Browser",
		"Callable",
		"Chart",
		"Chat",
		"Code",
		"Dict",
		"Draw",
		"GenPythonCode",
		"GenPythonMetadata",
		"GlobalVariables",
		"Group",
		"IFrame",
		"Image",
		"ListRoot",
		"MetaControl",
		"Plugin",
		"Prompt",
		"Social",
		"Spreadsheet",
		"StateMachineEnd",
		"StateMachineGate",
		"StateMachineStart",
		"TaskBoard",
		"Terminal",
		"TextBlock":
		return true
	default:
		return false
	}
}

func isSupportedMetaControlCodeObjType(codeObjType string) bool {
	_, ok := controlCodeObjectTypes[strings.TrimSpace(codeObjType)]
	return ok
}

func isFinitePosition(position Position) bool {
	return isFiniteFloat(position.X) && isFiniteFloat(position.Y)
}

func isFiniteFloat(value float64) bool {
	return value == value && value <= 1.7976931348623157e+308 && value >= -1.7976931348623157e+308
}

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

	p.Sections[created.section.ID] = created.section
	p.SectionVariants[created.variant.ID] = created.variant
	p.SectionImpls[created.impl.ID] = created.impl
	p.SectionVariantMap[created.section.ID] = created.variant.ID
	if !containsString(p.TopLevelSectionIDs, created.section.ID) {
		p.TopLevelSectionIDs = append(p.TopLevelSectionIDs, created.section.ID)
	}
	p.TopLevelSections[created.section.ID] = layout.Clone()
	for viewModeID, viewMode := range p.ViewModes {
		if viewMode.VisibilityBySectionID == nil {
			viewMode.VisibilityBySectionID = map[string]bool{}
		}
		viewMode.VisibilityBySectionID[created.section.ID] = true
		if viewMode.TopLevelSections == nil {
			viewMode.TopLevelSections = map[string]TopLevelSectionLayout{}
		}
		viewMode.TopLevelSections[created.section.ID] = layout.Clone()
		p.ViewModes[viewModeID] = viewMode
	}

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
	switch input.ImplType {
	case "Callable":
		return buildCreatedFrontendSectionImpl(implID, "Callable", createdCallableSectionDefaults(), settings, input.ImplOverrides)
	case "ListRoot":
		return buildCreatedFrontendSectionImpl(implID, "ListRoot", createdListRootSectionDefaults(), settings, input.ImplOverrides)
	case "Browser":
		return buildCreatedFrontendSectionImpl(implID, "Browser", createdBrowserSectionDefaults(), settings, input.ImplOverrides)
	case "Chart":
		return buildCreatedFrontendSectionImpl(implID, "Chart", createdChartSectionDefaults(), settings, input.ImplOverrides)
	case "Chat":
		payload, err := buildCreatedSectionPayload(implID, "Chat", createdChatSectionDefaults(), settings, input.ImplOverrides)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind("chat"), Payload: payload}, nil, nil, nil, nil
	case "Code":
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
	case "Draw":
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
	case "Dict":
		payload, err := buildCreatedSectionPayload(implID, "Dict", createdDictSectionDefaults(), settings, input.ImplOverrides)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind("dict"), Payload: payload}, nil, nil, nil, nil
	case "GenPythonCode":
		return buildCreatedGeneratedSectionImpl(
			implID,
			"GenPythonCode",
			GeneratedSectionKindPythonCode,
			createdGeneratedCodeSectionDefaults("GenPythonCode"),
			settings,
			input.ImplOverrides,
		)
	case "GenPythonMetadata":
		return buildCreatedGeneratedSectionImpl(
			implID,
			"GenPythonMetadata",
			GeneratedSectionKindPythonMetadata,
			createdGeneratedCodeSectionDefaults("GenPythonMetadata"),
			settings,
			input.ImplOverrides,
		)
	case "GlobalVariables":
		return buildCreatedFrontendSectionImpl(implID, "GlobalVariables", createdGlobalVariablesSectionDefaults(), settings, input.ImplOverrides)
	case "Group":
		payload, err := buildCreatedSectionPayload(implID, "Group", createdGroupSectionDefaults(), settings, input.ImplOverrides)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind("group"), Payload: payload}, nil, nil, nil, nil
	case "IFrame":
		return buildCreatedFrontendSectionImpl(implID, "IFrame", createdIFrameSectionDefaults(), settings, input.ImplOverrides)
	case "Image":
		return buildCreatedFrontendSectionImpl(implID, "Image", createdImageSectionDefaults(), settings, input.ImplOverrides)
	case "MetaControl":
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
	case "Plugin":
		return buildCreatedFrontendSectionImpl(implID, "Plugin", createdPluginSectionDefaults(), settings, input.ImplOverrides)
	case "Prompt":
		return buildCreatedFrontendSectionImpl(implID, "Prompt", createdPromptSectionDefaults(), settings, input.ImplOverrides)
	case "Social":
		return buildCreatedFrontendSectionImpl(implID, "Social", createdSocialSectionDefaults(), settings, input.ImplOverrides)
	case "Spreadsheet":
		return buildCreatedFrontendSectionImpl(implID, "Spreadsheet", createdSpreadsheetSectionDefaults(), settings, input.ImplOverrides)
	case "StateMachineStart":
		machineGroupID, err := newProjectStateID()
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		payload, err := buildCreatedSectionPayload(
			implID,
			"StateMachineStart",
			createdStateMachineStartSectionDefaults(machineGroupID),
			settings,
			input.ImplOverrides,
		)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind("StateMachineStart"), Payload: payload}, nil, nil, nil, nil
	case "StateMachineGate":
		machineGroupID, err := newProjectStateID()
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		payload, err := buildCreatedSectionPayload(
			implID,
			"StateMachineGate",
			createdStateMachineGateSectionDefaults(machineGroupID),
			settings,
			input.ImplOverrides,
		)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind("StateMachineGate"), Payload: payload}, nil, nil, nil, nil
	case "StateMachineEnd":
		machineGroupID, err := newProjectStateID()
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		payload, err := buildCreatedSectionPayload(
			implID,
			"StateMachineEnd",
			createdStateMachineEndSectionDefaults(machineGroupID),
			settings,
			input.ImplOverrides,
		)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind("StateMachineEnd"), Payload: payload}, nil, nil, nil, nil
	case "TaskBoard":
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
	case "Terminal":
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
	case "TextBlock":
		payload, err := buildCreatedSectionPayload(implID, "TextBlock", createdTextBlockSectionDefaults(), settings, input.ImplOverrides)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind("textblock"), Payload: payload}, nil, nil, nil, nil
	default:
		return SectionImpl{}, nil, nil, nil, fmt.Errorf("%w: %q", ErrTopLevelSectionImplTypeUnsupported, input.ImplType)
	}
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

func buildCreatedSectionObject(
	implID string,
	implType string,
	base map[string]any,
	settings StructuralMutationSettings,
	overrides map[string]any,
) (map[string]any, error) {
	payload := cloneProjectObject(base)
	if defaults, ok := settings.SectionDefaultsByType[implType]; ok {
		payload = mergeProjectObjects(payload, defaults)
	}
	if len(overrides) != 0 {
		payload = mergeProjectObjects(payload, overrides)
	}
	if rawBinding, ok := payload["codeFileBinding"]; ok && rawBinding == nil {
		delete(payload, "codeFileBinding")
	}
	payload["id"] = implID
	payload["type"] = implType
	return payload, nil
}

func createdBaseSectionDefaults(implType string) map[string]any {
	return map[string]any{
		"name":                    "",
		"isFrozen":                false,
		"isInOtherProjectConfigs": false,
		"tagColor":                nil,
		"styleColor":              nil,
		"size":                    createdSectionSizeDefaults(implType),
		"aspectRatio":             false,
		"aspectRatioExtraHeight":  0,
		"aspectRatioExtraWidth":   0,
		"isMinimized":             false,
		"positionAndSizeLocked":   false,
		"isPreset":                false,
	}
}

func createdSectionSizeDefaults(implType string) map[string]any {
	switch implType {
	case "Chat":
		return map[string]any{"width": 400.0, "height": 200.0}
	case "Browser":
		return map[string]any{"width": 720.0, "height": 460.0}
	case "Chart":
		return map[string]any{"width": 300.0, "height": 300.0}
	case "Code", "GenPythonCode", "GenPythonMetadata", "TextBlock":
		return map[string]any{"width": 500.0, "height": 150.0}
	case "Draw":
		return map[string]any{"width": 402.0, "height": 100.0}
	case "Prompt":
		return map[string]any{"width": 300.0, "height": 150.0}
	case "Spreadsheet":
		return map[string]any{"width": 760.0, "height": 500.0}
	case "TaskBoard":
		return map[string]any{"width": 720.0, "height": 430.0}
	default:
		return map[string]any{"width": 250.0, "height": 150.0}
	}
}

func createdBaseSectionWithParamsDefaults(implType string) map[string]any {
	defaults := createdBaseSectionDefaults(implType)
	defaults["codeObjVariantMap"] = map[string]any{}
	defaults["hideUnpinnedParams"] = false
	defaults["paramFilter"] = ""
	defaults["columnWidth"] = nil
	defaults["configLanguage"] = "python"
	defaults["pinnedParams"] = []any{}
	defaults["selectedParams"] = []any{}
	defaults["ignoreTypeErrors"] = map[string]any{
		"callable": false,
		"params":   map[string]any{},
	}
	defaults["edgeInputParams"] = []any{}
	defaults["edgeOutputPorts"] = []any{}
	return defaults
}

func createdBaseParentSectionDefaults(implType string) map[string]any {
	defaults := createdBaseSectionDefaults(implType)
	defaults["children"] = []any{}
	return defaults
}

func createdBaseCodeSectionLikeDefaults(implType string) map[string]any {
	defaults := createdBaseParentSectionDefaults(implType)
	defaults["code"] = ""
	defaults["codeFileBinding"] = nil
	defaults["attachedTerminalSectionId"] = nil
	return defaults
}

func createdCallableSectionDefaults() map[string]any {
	defaults := createdBaseSectionWithParamsDefaults("Callable")
	defaults["callable"] = nil
	defaults["hideParams"] = false
	return defaults
}

func createdListRootSectionDefaults() map[string]any {
	defaults := createdBaseParentSectionDefaults("ListRoot")
	defaults["defaultChildSectionType"] = "Callable"
	defaults["viewMode"] = string(ListRootViewModeDefault)
	return defaults
}

func createdChatSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Chat")
	defaults["managed"] = false
	defaults["engineConfigId"] = nil
	defaults["transcriptionProfileId"] = nil
	defaults["agentProfileId"] = nil
	defaults["chatId"] = nil
	defaults["thinking"] = true
	defaults["permissionMode"] = "minimal"
	defaults["searchEnabled"] = true
	defaults["dictationMode"] = "auto"
	defaults["messages"] = []any{}
	defaults["inputText"] = ""
	defaults["waitingForResponse"] = false
	defaults["toolCallArguments"] = map[string]any{}
	defaults["activeBranchId"] = nil
	defaults["branches"] = map[string]any{}
	return defaults
}

func createdCodeSectionDefaults() map[string]any {
	defaults := createdBaseCodeSectionLikeDefaults("Code")
	defaults["codeLanguage"] = "python"
	defaults["diagnosticsIgnoreState"] = map[string]any{
		"muted":           false,
		"suppressedCodes": []any{},
	}
	return defaults
}

func createdGeneratedCodeSectionDefaults(implType string) map[string]any {
	return createdBaseCodeSectionLikeDefaults(implType)
}

func createdDictSectionDefaults() map[string]any {
	defaults := createdBaseSectionWithParamsDefaults("Dict")
	defaults["children"] = []any{}
	defaults["topLevelParamId"] = nil
	defaults["isJsonSource"] = false
	defaults["jsonSourceKeys"] = []any{}
	defaults["jsonSourceMissing"] = false
	return defaults
}

func createdGlobalVariablesSectionDefaults() map[string]any {
	return createdDictSectionDefaults()
}

func createdGroupSectionDefaults() map[string]any {
	defaults := createdBaseParentSectionDefaults("Group")
	defaults["isHorizontalOrientation"] = false
	defaults["overflowMode"] = false
	defaults["defaultChildSectionType"] = "Callable"
	return defaults
}

func createdMetaControlSectionDefaults(paramID string, paramVariantID string) map[string]any {
	defaults := createdBaseSectionDefaults("MetaControl")
	defaults["metaControlParamId"] = paramID
	defaults["codeObjVariantMap"] = map[string]any{
		paramID: paramVariantID,
	}
	defaults["showSectionTitle"] = false
	return defaults
}

func createdImageSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Image")
	defaults["imagePath"] = ""
	return defaults
}

func createdChartSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Chart")
	defaults["dataPath"] = ""
	defaults["chartSettings"] = chartSettingsObject(defaultChartSettingsState(ChartTypeLine))
	return defaults
}

func createdFrontendChartSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Chart")
	defaults["dataPath"] = ""
	defaults["chartSettings"] = frontendChartSettingsObject(defaultChartSettingsState(ChartTypeLine))
	return defaults
}

func createdDrawSectionDefaults() map[string]any {
	layer, err := newCreatedDrawLayer()
	if err != nil {
		panic(err)
	}
	defaults := createdBaseSectionDefaults("Draw")
	defaults["layers"] = []any{layer}
	defaults["renderedImagePath"] = nil
	defaults["activeLayerIdx"] = 0
	defaults["brushColor"] = "#ff0000"
	defaults["brushSize"] = 16
	defaults["brushShape"] = "butt"
	defaults["brushOpacity"] = 1.0
	defaults["eraserBrushSize"] = 16
	defaults["drawThrottleDelay"] = 0
	defaults["canvasMode"] = "draw"
	defaults["colorChoices"] = []any{}
	return defaults
}

func createdTerminalSectionDefaults() map[string]any {
	return createdBaseSectionDefaults("Terminal")
}

func createdTextBlockSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("TextBlock")
	defaults["format"] = "Plaintext"
	defaults["masterFontSizePx"] = 14
	defaults["headingAsSectionName"] = false
	defaults["metaControlStyle"] = false
	defaults["textDisplayMode"] = "Render"
	defaults["text"] = ""
	return defaults
}

func createdPromptSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Prompt")
	defaults["promptTemplateId"] = nil
	defaults["template"] = ""
	defaults["format"] = string(prompttemplates.FormatJinja)
	defaults["inputs"] = map[string]any{}
	defaults["renderedText"] = ""
	defaults["missingVariables"] = []any{}
	defaults["renderError"] = nil
	return defaults
}

func createdSocialSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Social")
	defaults["url"] = ""
	return defaults
}

func createdIFrameSectionDefaults() map[string]any {
	return createdBaseSectionDefaults("IFrame")
}

func createdBrowserSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Browser")
	defaults["folder"] = ""
	defaults["hideColumn"] = false
	defaults["columnWidth"] = nil
	defaults["typesColumnWidth"] = nil
	defaults["viewMode"] = string(BrowserAreaViewModeList)
	defaults["savedSearches"] = []any{}
	return defaults
}

func createdPluginSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Plugin")
	defaults["pluginId"] = ""
	defaults["kind"] = "default"
	defaults["data"] = map[string]any{}
	defaults["schemaVersion"] = nil
	return defaults
}

func createdTaskBoardSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("TaskBoard")
	defaults["viewMode"] = string(TaskBoardViewModeKanban)
	defaults["columns"] = nil
	defaults["tasks"] = []any{}
	return defaults
}

func newCreatedDrawLayer() (map[string]any, error) {
	layerName, err := generateMemorableString()
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"name":         layerName,
		"elements":     []any{},
		"visible":      true,
		"layerOpacity": 1.0,
	}, nil
}

func initializeCreatedDrawSectionObject(payload map[string]any) error {
	layer, err := newCreatedDrawLayer()
	if err != nil {
		return err
	}
	payload["layers"] = []any{layer}
	return nil
}

func initializeCreatedTaskBoardColumns(
	payload map[string]any,
	settings StructuralMutationSettings,
	overrides map[string]any,
) error {
	if taskBoardColumnsExplicitlyOverridden(overrides) {
		return nil
	}
	settingsDefaults, ok := settings.SectionDefaultsByType["TaskBoard"]
	if !ok || settingsDefaults["columns"] != nil {
		return nil
	}
	todoColumn, err := newCreatedTaskBoardColumnPayload("Todo", "#3b82f6", 0)
	if err != nil {
		return err
	}
	doingColumn, err := newCreatedTaskBoardColumnPayload("Doing", "#a855f7", 1)
	if err != nil {
		return err
	}
	doneColumn, err := newCreatedTaskBoardColumnPayload("Done", "#10b981", 2)
	if err != nil {
		return err
	}
	payload["columns"] = []any{
		todoColumn,
		doingColumn,
		doneColumn,
	}
	return nil
}

func taskBoardColumnsExplicitlyOverridden(overrides map[string]any) bool {
	if len(overrides) == 0 {
		return false
	}
	_, ok := overrides["columns"]
	return ok
}

func newCreatedTaskBoardColumnPayload(name string, color string, sortIndex int) (map[string]any, error) {
	columnID, err := newProjectStateID()
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id":        columnID,
		"name":      name,
		"color":     color,
		"sortIndex": sortIndex,
	}, nil
}

func createdSpreadsheetSectionDefaults() map[string]any {
	defaults := createdBaseSectionDefaults("Spreadsheet")
	defaults["filePath"] = ""
	defaults["activeSheet"] = nil
	defaults["readOnly"] = false
	defaults["showRowNumbers"] = true
	defaults["density"] = string(SpreadsheetGridDensityCompact)
	defaults["autoReloadOnExternalChange"] = false
	return defaults
}

// FrontendUserDefaultSectionDefaults exposes the Go-owned default payload used
// when generating frontend user-default section factories.
func FrontendUserDefaultSectionDefaults(implType string) (map[string]any, error) {
	switch strings.TrimSpace(implType) {
	case "Browser":
		return createdBrowserSectionDefaults(), nil
	case "Callable":
		return createdCallableSectionDefaults(), nil
	case "Chart":
		return createdFrontendChartSectionDefaults(), nil
	case "Chat":
		return createdChatSectionDefaults(), nil
	case "Code":
		return createdCodeSectionDefaults(), nil
	case "Dict":
		return createdDictSectionDefaults(), nil
	case "Group":
		return createdGroupSectionDefaults(), nil
	case "ListRoot":
		return createdListRootSectionDefaults(), nil
	case "Prompt":
		return createdPromptSectionDefaults(), nil
	case "Spreadsheet":
		return createdSpreadsheetSectionDefaults(), nil
	case "StateMachineEnd":
		return createdStateMachineEndSectionDefaults(""), nil
	case "StateMachineGate":
		return createdStateMachineGateSectionDefaults(""), nil
	case "StateMachineStart":
		return createdStateMachineStartSectionDefaults(""), nil
	case "TaskBoard":
		return createdTaskBoardSectionDefaults(), nil
	case "Terminal":
		return createdTerminalSectionDefaults(), nil
	case "TextBlock":
		return createdTextBlockSectionDefaults(), nil
	default:
		return nil, fmt.Errorf("%w: %q", ErrTopLevelSectionImplTypeUnsupported, implType)
	}
}

func newMetaControlParam(controlType string) (CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	codeObjID, err := newProjectStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	variantID, err := newProjectStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	if !isSupportedMetaControlCodeObjType(controlType) {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, fmt.Errorf("%w: %q", ErrTopLevelMetaControlCodeObjTypeUnsupported, controlType)
	}
	impl, err := newCodeObjectImplForType(controlType)
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	name, err := generateMemorableString()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	return CodeObject{
			ID:               codeObjID,
			Name:             name,
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		},
		CodeObjectVariant{
			ID:               variantID,
			ImplID:           impl.ID,
			NonPresetImplIDs: []string{impl.ID},
		},
		impl,
		nil
}

func (p *Project) syncCreatedTextBlockSectionName(sectionID string) error {
	section, _, payload, err := p.resolveTextBlockMutationState(sectionID)
	if err != nil {
		if errors.Is(err, ErrTextBlockSectionRequired) {
			return nil
		}
		return err
	}
	if !payloadBoolField(payload, "headingAsSectionName") {
		return nil
	}
	return p.syncTextBlockSectionName(
		section.ID,
		payloadRawStringField(payload, "text"),
		payloadStringField(payload, "format"),
	)
}

func buildCreatedSectionPayload(
	implID string,
	implType string,
	base map[string]any,
	settings StructuralMutationSettings,
	overrides map[string]any,
) (RawJSON, error) {
	payload, err := buildCreatedSectionObject(implID, implType, base, settings, overrides)
	if err != nil {
		return nil, err
	}
	return marshalProjectObject(payload)
}

func buildCreatedCodeObjectPayload(implID string, implType string, base map[string]any) (RawJSON, error) {
	payload := cloneProjectObject(base)
	payload["id"] = implID
	payload["type"] = implType
	return marshalProjectObject(payload)
}

func (p *Project) resolveCreateTopLevelSectionLayout(
	policy AutoLayoutSectionSizingPolicy,
	input CreateTopLevelSectionInput,
	impl SectionImpl,
) (TopLevelSectionLayout, *Position, error) {
	nextZIndex := p.nextCreateTopLevelSectionZIndex()
	if input.Position != nil {
		return TopLevelSectionLayout{
			X:      input.Position.X,
			Y:      input.Position.Y,
			ZIndex: nextZIndex,
		}, nil, nil
	}

	position, panTo, err := p.resolveCreateTopLevelSectionPosition(
		policy,
		input.ImplType,
		impl.Payload,
		input.ViewportBounds,
	)
	if err != nil {
		return TopLevelSectionLayout{}, nil, err
	}
	return TopLevelSectionLayout{
		X:      position.X,
		Y:      position.Y,
		ZIndex: nextZIndex,
	}, panTo, nil
}

func (p Project) resolveCreateTopLevelSectionPosition(
	policy AutoLayoutSectionSizingPolicy,
	implType string,
	rawPayload RawJSON,
	viewportBounds *ViewportBounds,
) (Position, *Position, error) {
	payload, err := rawObjectFromProjectPayload(rawPayload)
	if err != nil {
		return Position{}, nil, err
	}
	newWidth, err := resolveAutoLayoutDimension(policy, "new-section", implType, "width", nil, payload)
	if err != nil {
		return Position{}, nil, err
	}
	newHeight, err := resolveAutoLayoutDimension(policy, "new-section", implType, "height", nil, payload)
	if err != nil {
		return Position{}, nil, err
	}
	if newWidth <= 0 || newHeight <= 0 {
		return Position{}, nil, &InvalidAutoLayoutError{
			Message: fmt.Sprintf("Section type %q has non-positive dimensions (%v, %v).", implType, newWidth, newHeight),
		}
	}

	rects, err := p.buildCreateTopLevelSectionLayoutRects(policy)
	if err != nil {
		return Position{}, nil, err
	}
	padding := 24.0
	step := gridStepForCreateTopLevelSection(newWidth, newHeight)

	if viewportBounds != nil && viewportBounds.W > 0 && viewportBounds.H > 0 {
		bounds := createTopLevelSectionLayoutRect{
			X: viewportBounds.X,
			Y: viewportBounds.Y,
			W: viewportBounds.W,
			H: viewportBounds.H,
		}
		useViewport := len(rects) == 0 || boundsIntersectAny(bounds, rects)
		if useViewport {
			if position, ok := findPositionInBounds(bounds, newWidth, newHeight, rects, padding, step); ok {
				return position, nil, nil
			}
			position, ok := findPositionAdjacentToBounds(bounds, newWidth, newHeight, rects, padding, step)
			if !ok {
				position = findPositionAfterExisting(rects, newWidth, newHeight, padding, step)
			}
			panTo := resolveCreateTopLevelSectionPanTarget(policy, implType, position, newWidth, newHeight)
			return position, &panTo, nil
		}

		position := findPositionAfterExisting(rects, newWidth, newHeight, padding, step)
		panTo := resolveCreateTopLevelSectionPanTarget(policy, implType, position, newWidth, newHeight)
		return position, &panTo, nil
	}

	position := findPositionAfterExisting(rects, newWidth, newHeight, padding, step)
	return position, nil, nil
}

func (p Project) resolveDeterministicCreateTopLevelSectionPosition(
	policy AutoLayoutSectionSizingPolicy,
	implType string,
	rawPayload RawJSON,
) (Position, error) {
	payload, err := rawObjectFromProjectPayload(rawPayload)
	if err != nil {
		return Position{}, err
	}
	newWidth, err := resolveAutoLayoutDimension(policy, "new-section", implType, "width", nil, payload)
	if err != nil {
		return Position{}, err
	}
	newHeight, err := resolveAutoLayoutDimension(policy, "new-section", implType, "height", nil, payload)
	if err != nil {
		return Position{}, err
	}
	if newWidth <= 0 || newHeight <= 0 {
		return Position{}, &InvalidAutoLayoutError{
			Message: fmt.Sprintf("Section type %q has non-positive dimensions (%v, %v).", implType, newWidth, newHeight),
		}
	}

	rects, err := p.buildCreateTopLevelSectionLayoutRects(policy)
	if err != nil {
		return Position{}, err
	}
	padding := 24.0
	step := gridStepForCreateTopLevelSection(newWidth, newHeight)
	return findDeterministicPositionAfterExisting(rects, newWidth, newHeight, padding, step), nil
}

type createTopLevelSectionLayoutRect struct {
	X float64
	Y float64
	W float64
	H float64
}

func (p Project) buildCreateTopLevelSectionLayoutRects(policy AutoLayoutSectionSizingPolicy) ([]createTopLevelSectionLayoutRect, error) {
	rects := make([]createTopLevelSectionLayoutRect, 0, len(p.TopLevelSections))
	for sectionID, layout := range p.TopLevelSections {
		section, ok := p.Sections[sectionID]
		if !ok || strings.TrimSpace(section.ParentSectionID) != "" {
			continue
		}
		width, height, err := p.resolveAutoLayoutSectionDimensions(sectionID, layout, policy)
		if err != nil {
			return nil, err
		}
		rects = append(rects, createTopLevelSectionLayoutRect{
			X: layout.X,
			Y: layout.Y,
			W: width,
			H: height,
		})
	}
	return rects, nil
}

func gridStepForCreateTopLevelSection(newWidth float64, newHeight float64) float64 {
	base := min(newWidth, newHeight) / 3
	return max(20.0, min(80.0, base))
}

func findPositionInBounds(
	bounds createTopLevelSectionLayoutRect,
	newWidth float64,
	newHeight float64,
	rects []createTopLevelSectionLayoutRect,
	padding float64,
	step float64,
) (Position, bool) {
	if bounds.W <= 0 || bounds.H <= 0 {
		return Position{}, false
	}
	startX := bounds.X + padding
	startY := bounds.Y + padding
	endX := bounds.X + bounds.W - newWidth - padding
	endY := bounds.Y + bounds.H - newHeight - padding
	if endX < startX || endY < startY {
		return Position{}, false
	}

	expanded := make([]createTopLevelSectionLayoutRect, 0, len(rects))
	for _, rect := range rects {
		expanded = append(expanded, expandCreateTopLevelSectionRect(rect, padding))
	}

	for y := startY; y <= endY; y += step {
		for x := startX; x <= endX; x += step {
			candidate := createTopLevelSectionLayoutRect{X: x, Y: y, W: newWidth, H: newHeight}
			if !createTopLevelSectionRectsIntersectAny(candidate, expanded) {
				return Position{X: x, Y: y}, true
			}
		}
	}
	return Position{}, false
}

func boundsIntersectAny(bounds createTopLevelSectionLayoutRect, rects []createTopLevelSectionLayoutRect) bool {
	return createTopLevelSectionRectsIntersectAny(bounds, rects)
}

func findPositionAdjacentToBounds(
	bounds createTopLevelSectionLayoutRect,
	newWidth float64,
	newHeight float64,
	rects []createTopLevelSectionLayoutRect,
	padding float64,
	step float64,
) (Position, bool) {
	rightBounds := createTopLevelSectionLayoutRect{
		X: bounds.X + bounds.W,
		Y: bounds.Y,
		W: newWidth + padding*2,
		H: bounds.H,
	}
	if position, ok := findPositionInBounds(rightBounds, newWidth, newHeight, rects, padding, step); ok {
		return position, true
	}

	bottomBounds := createTopLevelSectionLayoutRect{
		X: bounds.X,
		Y: bounds.Y + bounds.H,
		W: bounds.W,
		H: newHeight + padding*2,
	}
	return findPositionInBounds(bottomBounds, newWidth, newHeight, rects, padding, step)
}

func findPositionAfterExisting(
	rects []createTopLevelSectionLayoutRect,
	newWidth float64,
	newHeight float64,
	padding float64,
	step float64,
) Position {
	if len(rects) == 0 {
		return Position{X: padding, Y: padding}
	}
	bounds, ok := layoutBounds(rects)
	if !ok {
		return Position{X: padding, Y: padding}
	}

	interiorBounds := createTopLevelSectionLayoutRect{
		X: bounds.X - padding,
		Y: bounds.Y - padding,
		W: bounds.W + padding*2,
		H: bounds.H + padding*2,
	}
	if position, ok := findPositionInBounds(interiorBounds, newWidth, newHeight, rects, padding, step); ok {
		return position
	}

	rightBounds := createTopLevelSectionLayoutRect{
		X: bounds.X + bounds.W,
		Y: bounds.Y - padding,
		W: newWidth + padding*2,
		H: bounds.H + padding*2,
	}
	bottomBounds := createTopLevelSectionLayoutRect{
		X: bounds.X - padding,
		Y: bounds.Y + bounds.H,
		W: bounds.W + padding*2,
		H: newHeight + padding*2,
	}
	rightPosition, rightOK := findPositionInBounds(rightBounds, newWidth, newHeight, rects, padding, step)
	bottomPosition, bottomOK := findPositionInBounds(bottomBounds, newWidth, newHeight, rects, padding, step)
	if !rightOK && !bottomOK {
		maxX := rects[0].X + rects[0].W
		minY := rects[0].Y
		for _, rect := range rects[1:] {
			if rect.X+rect.W > maxX {
				maxX = rect.X + rect.W
			}
			if rect.Y < minY {
				minY = rect.Y
			}
		}
		return Position{X: maxX + padding, Y: minY}
	}
	if !rightOK {
		return bottomPosition
	}
	if !bottomOK {
		return rightPosition
	}
	rightScore := candidateAspectScore(bounds, rightPosition, newWidth, newHeight)
	bottomScore := candidateAspectScore(bounds, bottomPosition, newWidth, newHeight)
	if bottomScore < rightScore {
		return bottomPosition
	}
	if rightScore < bottomScore {
		return rightPosition
	}
	if bounds.W < bounds.H {
		return rightPosition
	}
	return bottomPosition
}

func findDeterministicPositionAfterExisting(
	rects []createTopLevelSectionLayoutRect,
	newWidth float64,
	newHeight float64,
	padding float64,
	step float64,
) Position {
	if len(rects) == 0 {
		return Position{X: padding, Y: padding}
	}
	bounds, ok := layoutBounds(rects)
	if !ok {
		return Position{X: padding, Y: padding}
	}

	interiorBounds := createTopLevelSectionLayoutRect{
		X: bounds.X - padding,
		Y: bounds.Y - padding,
		W: bounds.W + padding*2,
		H: bounds.H + padding*2,
	}
	if position, ok := findPositionInBounds(interiorBounds, newWidth, newHeight, rects, padding, step); ok {
		return position
	}

	rightBounds := createTopLevelSectionLayoutRect{
		X: bounds.X + bounds.W,
		Y: bounds.Y - padding,
		W: newWidth + padding*2,
		H: bounds.H + padding*2,
	}
	if position, ok := findPositionInBounds(rightBounds, newWidth, newHeight, rects, padding, step); ok {
		return position
	}

	bottomBounds := createTopLevelSectionLayoutRect{
		X: bounds.X - padding,
		Y: bounds.Y + bounds.H,
		W: bounds.W + padding*2,
		H: newHeight + padding*2,
	}
	if position, ok := findPositionInBounds(bottomBounds, newWidth, newHeight, rects, padding, step); ok {
		return position
	}

	maxX := rects[0].X + rects[0].W
	minY := rects[0].Y
	for _, rect := range rects[1:] {
		if rect.X+rect.W > maxX {
			maxX = rect.X + rect.W
		}
		if rect.Y < minY {
			minY = rect.Y
		}
	}
	return Position{X: maxX + padding, Y: minY}
}

func candidateAspectScore(
	bounds createTopLevelSectionLayoutRect,
	candidate Position,
	newWidth float64,
	newHeight float64,
) float64 {
	minX := min(bounds.X, candidate.X)
	minY := min(bounds.Y, candidate.Y)
	maxX := max(bounds.X+bounds.W, candidate.X+newWidth)
	maxY := max(bounds.Y+bounds.H, candidate.Y+newHeight)
	width := maxX - minX
	height := maxY - minY
	if width <= 0 || height <= 0 {
		return 1.0e308
	}
	return max(width, height) / min(width, height)
}

func layoutBounds(rects []createTopLevelSectionLayoutRect) (createTopLevelSectionLayoutRect, bool) {
	if len(rects) == 0 {
		return createTopLevelSectionLayoutRect{}, false
	}
	minX := rects[0].X
	minY := rects[0].Y
	maxX := rects[0].X + rects[0].W
	maxY := rects[0].Y + rects[0].H
	for _, rect := range rects[1:] {
		minX = min(minX, rect.X)
		minY = min(minY, rect.Y)
		maxX = max(maxX, rect.X+rect.W)
		maxY = max(maxY, rect.Y+rect.H)
	}
	return createTopLevelSectionLayoutRect{
		X: minX,
		Y: minY,
		W: maxX - minX,
		H: maxY - minY,
	}, true
}

func createTopLevelSectionRectsIntersectAny(candidate createTopLevelSectionLayoutRect, rects []createTopLevelSectionLayoutRect) bool {
	for _, rect := range rects {
		if createTopLevelSectionRectsIntersect(candidate, rect) {
			return true
		}
	}
	return false
}

func createTopLevelSectionRectsIntersect(left createTopLevelSectionLayoutRect, right createTopLevelSectionLayoutRect) bool {
	return left.X < right.X+right.W &&
		left.X+left.W > right.X &&
		left.Y < right.Y+right.H &&
		left.Y+left.H > right.Y
}

func expandCreateTopLevelSectionRect(rect createTopLevelSectionLayoutRect, padding float64) createTopLevelSectionLayoutRect {
	return createTopLevelSectionLayoutRect{
		X: rect.X - padding,
		Y: rect.Y - padding,
		W: rect.W + padding*2,
		H: rect.H + padding*2,
	}
}

func resolveCreateTopLevelSectionPanTarget(
	policy AutoLayoutSectionSizingPolicy,
	implType string,
	position Position,
	newWidth float64,
	newHeight float64,
) Position {
	panXOffset := newWidth / 2
	if dimensions, ok := policy.ByType[implType]; ok {
		panXOffset = max(panXOffset, dimensions.MinWidth)
	}
	return Position{
		X: position.X + panXOffset,
		Y: position.Y + newHeight/2,
	}
}

func applyTopLevelSectionLayoutSnapshot(
	p *Project,
	layoutSnapshot map[string]TopLevelSectionLayout,
) {
	if p == nil || layoutSnapshot == nil {
		return
	}
	if p.TopLevelSections == nil {
		p.TopLevelSections = map[string]TopLevelSectionLayout{}
	}

	for sectionID, layout := range layoutSnapshot {
		section, ok := p.Sections[sectionID]
		if !ok || strings.TrimSpace(section.ParentSectionID) != "" {
			continue
		}

		nextLayout := layout.Clone()
		if existing, ok := p.TopLevelSections[sectionID]; ok {
			if nextLayout.W == nil {
				nextLayout.W = cloneFloat64Pointer(existing.W)
			}
			if nextLayout.H == nil {
				nextLayout.H = cloneFloat64Pointer(existing.H)
			}
		}
		p.TopLevelSections[sectionID] = nextLayout

		activeViewModeID := strings.TrimSpace(p.ActiveViewModeID)
		if activeViewModeID == "" {
			continue
		}
		viewMode, ok := p.ViewModes[activeViewModeID]
		if !ok {
			continue
		}
		if viewMode.TopLevelSections == nil {
			viewMode.TopLevelSections = map[string]TopLevelSectionLayout{}
		}
		viewMode.TopLevelSections[sectionID] = nextLayout.Clone()
		p.ViewModes[activeViewModeID] = viewMode
	}
}

func (p Project) nextCreateTopLevelSectionZIndex() int {
	next := 0
	for _, layout := range p.TopLevelSections {
		if layout.ZIndex >= next {
			next = layout.ZIndex + 1
		}
	}
	return next
}

func (p *Project) pruneTopLevelCreationViewState() {
	if p == nil {
		return
	}

	validSections := map[string]struct{}{}
	for sectionID := range p.Sections {
		validSections[sectionID] = struct{}{}
	}
	validTopLevelSections := p.validTopLevelSectionIDs()

	seenTopLevels := map[string]struct{}{}
	filteredTopLevelIDs := make([]string, 0, len(p.TopLevelSectionIDs))
	for _, sectionID := range p.TopLevelSectionIDs {
		if _, ok := validTopLevelSections[sectionID]; !ok {
			continue
		}
		if _, duplicate := seenTopLevels[sectionID]; duplicate {
			continue
		}
		seenTopLevels[sectionID] = struct{}{}
		filteredTopLevelIDs = append(filteredTopLevelIDs, sectionID)
	}
	p.TopLevelSectionIDs = filteredTopLevelIDs

	for sectionID := range p.TopLevelSections {
		if _, ok := validTopLevelSections[sectionID]; ok {
			continue
		}
		delete(p.TopLevelSections, sectionID)
	}

	for viewModeID, viewMode := range p.ViewModes {
		for sectionID := range viewMode.TopLevelSections {
			if _, ok := validTopLevelSections[sectionID]; ok {
				continue
			}
			delete(viewMode.TopLevelSections, sectionID)
		}
		for sectionID := range viewMode.VisibilityBySectionID {
			if _, ok := validSections[sectionID]; ok {
				continue
			}
			delete(viewMode.VisibilityBySectionID, sectionID)
		}
		p.ViewModes[viewModeID] = viewMode
	}
}

func nextAvailableCreatedTopLevelSectionName(project Project, implType string) (string, error) {
	if preferredName, ok := preferredCreatedSectionName(implType); ok && createTopLevelSectionNameAvailable(project, preferredName) {
		return preferredName, nil
	}
	return nextAvailableMemorableName(func(candidate string) (bool, error) {
		return createTopLevelSectionNameAvailable(project, candidate), nil
	})
}

func preferredCreatedSectionName(implType string) (string, bool) {
	switch strings.TrimSpace(implType) {
	case "GlobalVariables":
		return "Global Variables", true
	case "GenPythonCode":
		return "Generated Python Code", true
	case "GenPythonMetadata":
		return "Generated Python Metadata", true
	case "StateMachineStart":
		return "State Machine Start", true
	case "StateMachineGate":
		return "State Machine Gate", true
	case "StateMachineEnd":
		return "State Machine End", true
	default:
		return "", false
	}
}

func createTopLevelSectionNameAvailable(project Project, candidate string) bool {
	normalized := strings.TrimSpace(candidate)
	if normalized == "" {
		return false
	}
	normalizedSlug := sanitizeSectionSlug(normalized)
	normalizedIdentifier := sanitizeSectionPythonIdentifier(normalized)
	for sectionID := range project.SectionVariantMap {
		section, ok := project.Sections[sectionID]
		if !ok {
			continue
		}
		if strings.TrimSpace(section.ParentSectionID) != "" {
			continue
		}
		existingName := strings.TrimSpace(section.Name)
		if existingName == normalized {
			return false
		}
		if sanitizeSectionSlug(existingName) == normalizedSlug {
			return false
		}
		if sanitizeSectionPythonIdentifier(existingName) == normalizedIdentifier {
			return false
		}
	}
	return true
}
