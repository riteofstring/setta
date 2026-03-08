package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrTopLevelSectionImplTypeRequired           = errors.New("top-level section implType is required")
	ErrTopLevelSectionImplTypeUnsupported        = errors.New("top-level section implType is not supported yet")
	ErrTopLevelMetaControlCodeObjTypeUnsupported = errors.New("meta control code object type is not supported yet")
	ErrTopLevelMetaControlCodeObjTypeNotAllowed  = errors.New("controlCodeObjType is only valid for MetaControl sections")
	ErrTopLevelSectionPositionInvalid            = errors.New("top-level section position is invalid")
)

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type CreateTopLevelSectionInput struct {
	ImplType           string         `json:"implType"`
	ControlCodeObjType *string        `json:"controlCodeObjType,omitempty"`
	ImplOverrides      map[string]any `json:"implOverrides,omitempty"`
	Position           *Position      `json:"position,omitempty"`
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
	policy := normalizeStructuralMutationSettings(settings).SectionSizingPolicy
	result, err := project.CreateTopLevelSection(input, policy)
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
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		var mutationErr error
		result, mutationErr = document.CreateTopLevelSection(projectID, input, settings)
		if mutationErr != nil {
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
	policy AutoLayoutSectionSizingPolicy,
) (CreateTopLevelSectionResult, error) {
	if p == nil {
		return CreateTopLevelSectionResult{}, ErrProjectNotFound
	}

	normalized, err := normalizeCreateTopLevelSectionInput(input)
	if err != nil {
		return CreateTopLevelSectionResult{}, err
	}

	p.pruneTopLevelCreationViewState()

	created, err := newCreatedTopLevelSectionState(*p, normalized)
	if err != nil {
		return CreateTopLevelSectionResult{}, err
	}
	layout, err := p.resolveCreateTopLevelSectionLayout(policy, normalized, created.impl)
	if err != nil {
		return CreateTopLevelSectionResult{}, err
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
	p.TopLevelSections[created.section.ID] = layout
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

	var metaControlParamID *string
	if created.metaControlParamCore != nil && created.metaControlParamVar != nil && created.metaControlParamImpl != nil {
		p.CodeObjs[created.metaControlParamCore.ID] = *created.metaControlParamCore
		p.CodeObjVariants[created.metaControlParamVar.ID] = *created.metaControlParamVar
		p.CodeObjImpls[created.metaControlParamImpl.ID] = *created.metaControlParamImpl
		metaControlParamID = &created.metaControlParamCore.ID
	}

	return CreateTopLevelSectionResult{
		SectionID:          created.section.ID,
		MetaControlParamID: metaControlParamID,
		PanTo:              nil,
	}, nil
}

func normalizeCreateTopLevelSectionInput(input CreateTopLevelSectionInput) (CreateTopLevelSectionInput, error) {
	normalized := CreateTopLevelSectionInput{
		ImplType:      strings.TrimSpace(input.ImplType),
		ImplOverrides: cloneProjectObject(input.ImplOverrides),
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
	return normalized, nil
}

func isSupportedTopLevelSectionImplType(implType string) bool {
	switch implType {
	case "Chat", "Code", "Dict", "Group", "MetaControl", "Terminal", "TextBlock":
		return true
	default:
		return false
	}
}

func isSupportedMetaControlCodeObjType(codeObjType string) bool {
	switch codeObjType {
	case "SliderParam", "TextParam":
		return true
	default:
		return false
	}
}

func isFinitePosition(position Position) bool {
	return isFiniteFloat(position.X) && isFiniteFloat(position.Y)
}

func isFiniteFloat(value float64) bool {
	return value == value && value <= 1.7976931348623157e+308 && value >= -1.7976931348623157e+308
}

func newCreatedTopLevelSectionState(project Project, input CreateTopLevelSectionInput) (createdTopLevelSectionState, error) {
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

	impl, metaControlParamCore, metaControlParamVar, metaControlParamImpl, err := buildCreatedTopLevelSectionImpl(implID, input)
	if err != nil {
		return createdTopLevelSectionState{}, err
	}

	return createdTopLevelSectionState{
		section: Section{
			ID:               sectionID,
			Name:             nextAvailableCreatedTopLevelSectionName(project, input.ImplType),
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

func buildCreatedTopLevelSectionImpl(
	implID string,
	input CreateTopLevelSectionInput,
) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error) {
	switch input.ImplType {
	case "Chat":
		payload, err := buildCreatedSectionPayload(implID, "Chat", map[string]any{}, input.ImplOverrides)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind("chat"), Payload: payload}, nil, nil, nil, nil
	case "Code":
		payload, err := buildCreatedSectionPayload(implID, "Code", map[string]any{
			"codeLanguage": "python",
			"code":         "",
			"children":     []any{},
		}, input.ImplOverrides)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		payloadObject, err := rawObjectFromProjectPayload(payload)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		codeLanguage := payloadStringField(payloadObject, "codeLanguage")
		switch codeLanguage {
		case "", "python":
			codeLanguage = string(CodeLanguagePython)
		case "bash":
			codeLanguage = string(CodeLanguageBash)
		default:
			return SectionImpl{}, nil, nil, nil, fmt.Errorf("%w: %q", ErrCodeLanguageRequired, codeLanguage)
		}
		return SectionImpl{
			ID:      implID,
			Kind:    SectionKindCode,
			Payload: payload,
			Code: &CodeSectionImpl{
				Language: CodeLanguage(codeLanguage),
			},
		}, nil, nil, nil, nil
	case "Dict":
		payload, err := buildCreatedSectionPayload(implID, "Dict", map[string]any{
			"codeObjVariantMap": map[string]any{},
			"ignoreTypeErrors": map[string]any{
				"callable": false,
				"params":   map[string]any{},
			},
		}, input.ImplOverrides)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind("dict"), Payload: payload}, nil, nil, nil, nil
	case "Group":
		payload, err := buildCreatedSectionPayload(implID, "Group", map[string]any{
			"children": []any{},
		}, input.ImplOverrides)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind("group"), Payload: payload}, nil, nil, nil, nil
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
		payload, err := buildCreatedSectionPayload(implID, "MetaControl", map[string]any{
			"metaControlParamId": paramCore.ID,
			"codeObjVariantMap": map[string]any{
				paramCore.ID: paramVariant.ID,
			},
		}, input.ImplOverrides)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind("metacontrol"), Payload: payload}, &paramCore, &paramVariant, &paramImpl, nil
	case "Terminal":
		payload, err := buildCreatedSectionPayload(implID, "Terminal", map[string]any{}, input.ImplOverrides)
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
		payload, err := buildCreatedSectionPayload(implID, "TextBlock", map[string]any{}, input.ImplOverrides)
		if err != nil {
			return SectionImpl{}, nil, nil, nil, err
		}
		return SectionImpl{ID: implID, Kind: SectionKind("textblock"), Payload: payload}, nil, nil, nil, nil
	default:
		return SectionImpl{}, nil, nil, nil, fmt.Errorf("%w: %q", ErrTopLevelSectionImplTypeUnsupported, input.ImplType)
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
	implID, err := newProjectStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}

	basePayload := map[string]any{
		"value": "",
	}
	switch controlType {
	case "SliderParam":
		basePayload["value"] = "0"
		basePayload["min"] = 0
		basePayload["max"] = 100
		basePayload["step"] = 1
	case "TextParam":
	default:
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, fmt.Errorf("%w: %q", ErrTopLevelMetaControlCodeObjTypeUnsupported, controlType)
	}

	payload, err := buildCreatedCodeObjectPayload(implID, controlType, basePayload)
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	return CodeObject{
			ID:               codeObjID,
			Name:             "control",
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
			Type:    controlType,
			Payload: payload,
		},
		nil
}

func buildCreatedSectionPayload(implID string, implType string, base map[string]any, overrides map[string]any) (RawJSON, error) {
	payload := cloneProjectObject(base)
	if len(overrides) != 0 {
		payload = mergeProjectObjects(payload, overrides)
	}
	payload["id"] = implID
	payload["type"] = implType
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
) (TopLevelSectionLayout, error) {
	nextZIndex := p.nextCreateTopLevelSectionZIndex()
	if input.Position != nil {
		return TopLevelSectionLayout{
			X:      input.Position.X,
			Y:      input.Position.Y,
			ZIndex: nextZIndex,
		}, nil
	}

	position, err := p.resolveDeterministicCreateTopLevelSectionPosition(policy, input.ImplType, impl.Payload)
	if err != nil {
		return TopLevelSectionLayout{}, err
	}
	return TopLevelSectionLayout{
		X:      position.X,
		Y:      position.Y,
		ZIndex: nextZIndex,
	}, nil
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

	if len(p.TopLevelSections) == 0 {
		return Position{}, nil
	}

	maxX := 0.0
	minY := 0.0
	first := true
	for sectionID, layout := range p.TopLevelSections {
		width, _, err := p.resolveAutoLayoutSectionDimensions(sectionID, layout, policy)
		if err != nil {
			return Position{}, err
		}
		if first || layout.X+width > maxX {
			maxX = layout.X + width
		}
		if first || layout.Y < minY {
			minY = layout.Y
		}
		first = false
	}
	if first {
		return Position{}, nil
	}
	return Position{
		X: maxX + 24,
		Y: minY,
	}, nil
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

func nextAvailableCreatedTopLevelSectionName(project Project, implType string) string {
	base := defaultCreatedTopLevelSectionName(implType)
	if createTopLevelSectionNameAvailable(project, base) {
		return base
	}
	for suffix := 2; ; suffix++ {
		candidate := fmt.Sprintf("%s %d", base, suffix)
		if createTopLevelSectionNameAvailable(project, candidate) {
			return candidate
		}
	}
}

func defaultCreatedTopLevelSectionName(implType string) string {
	switch implType {
	case "Code":
		return "Code"
	case "Dict":
		return "Dict"
	case "Group":
		return "Group"
	case "MetaControl":
		return "Meta Control"
	case "Terminal":
		return "Terminal"
	case "TextBlock":
		return "Text Block"
	case "Chat":
		return "Chat"
	default:
		return "Section"
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
