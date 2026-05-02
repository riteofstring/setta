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

type topLevelSectionImplBuilder func(
	implID string,
	input CreateTopLevelSectionInput,
	settings StructuralMutationSettings,
) (SectionImpl, *CodeObject, *CodeObjectVariant, *CodeObjectImpl, error)

var topLevelSectionImplBuilders = map[string]topLevelSectionImplBuilder{
	"Browser":           newFrontendTopLevelSectionImplBuilder("Browser", createdBrowserSectionDefaults),
	"Callable":          newFrontendTopLevelSectionImplBuilder("Callable", createdCallableSectionDefaults),
	"Chart":             newFrontendTopLevelSectionImplBuilder("Chart", createdChartSectionDefaults),
	"Chat":              newPayloadTopLevelSectionImplBuilder("Chat", SectionKind("chat"), createdChatSectionDefaults),
	"Code":              buildCreatedCodeTopLevelSectionImpl,
	"Dict":              newPayloadTopLevelSectionImplBuilder("Dict", SectionKind("dict"), createdDictSectionDefaults),
	"Draw":              buildCreatedDrawTopLevelSectionImpl,
	"GenPythonCode":     newGeneratedTopLevelSectionImplBuilder("GenPythonCode", GeneratedSectionKindPythonCode),
	"GenPythonMetadata": newGeneratedTopLevelSectionImplBuilder("GenPythonMetadata", GeneratedSectionKindPythonMetadata),
	"GlobalVariables":   newFrontendTopLevelSectionImplBuilder("GlobalVariables", createdGlobalVariablesSectionDefaults),
	"Group":             newPayloadTopLevelSectionImplBuilder("Group", SectionKind("group"), createdGroupSectionDefaults),
	"IFrame":            newFrontendTopLevelSectionImplBuilder("IFrame", createdIFrameSectionDefaults),
	"Image":             newFrontendTopLevelSectionImplBuilder("Image", createdImageSectionDefaults),
	"ListRoot":          newFrontendTopLevelSectionImplBuilder("ListRoot", createdListRootSectionDefaults),
	"MetaControl":       buildCreatedMetaControlTopLevelSectionImpl,
	"Plugin":            newFrontendTopLevelSectionImplBuilder("Plugin", createdPluginSectionDefaults),
	"Prompt":            newFrontendTopLevelSectionImplBuilder("Prompt", createdPromptSectionDefaults),
	"Social":            newFrontendTopLevelSectionImplBuilder("Social", createdSocialSectionDefaults),
	"Spreadsheet":       newFrontendTopLevelSectionImplBuilder("Spreadsheet", createdSpreadsheetSectionDefaults),
	"StateMachineEnd":   newStateMachineTopLevelSectionImplBuilder("StateMachineEnd", createdStateMachineEndSectionDefaults),
	"StateMachineGate":  newStateMachineTopLevelSectionImplBuilder("StateMachineGate", createdStateMachineGateSectionDefaults),
	"StateMachineStart": newStateMachineTopLevelSectionImplBuilder("StateMachineStart", createdStateMachineStartSectionDefaults),
	"TaskBoard":         buildCreatedTaskBoardTopLevelSectionImpl,
	"Terminal":          buildCreatedTerminalTopLevelSectionImpl,
	"TextBlock":         newPayloadTopLevelSectionImplBuilder("TextBlock", SectionKind("textblock"), createdTextBlockSectionDefaults),
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
	normalized, err := initializeCreateTopLevelSectionInput(input)
	if err != nil {
		return CreateTopLevelSectionInput{}, err
	}
	normalized.ControlCodeObjType, err = normalizeCreateTopLevelControlCodeObjType(
		normalized.ImplType,
		input.ControlCodeObjType,
	)
	if err != nil {
		return CreateTopLevelSectionInput{}, err
	}
	normalized.Position, err = cloneCreateTopLevelSectionPosition(input.Position)
	if err != nil {
		return CreateTopLevelSectionInput{}, err
	}
	normalized.Name, err = normalizeCreateTopLevelSectionName(input.Name)
	if err != nil {
		return CreateTopLevelSectionInput{}, err
	}
	normalized.ViewportBounds, err = cloneCreateTopLevelSectionViewportBounds(input.ViewportBounds)
	if err != nil {
		return CreateTopLevelSectionInput{}, err
	}
	return normalized, nil
}

func initializeCreateTopLevelSectionInput(input CreateTopLevelSectionInput) (CreateTopLevelSectionInput, error) {
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
	return normalized, nil
}

func normalizeCreateTopLevelControlCodeObjType(implType string, value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, nil
	}
	if implType != "MetaControl" {
		return nil, ErrTopLevelMetaControlCodeObjTypeNotAllowed
	}
	return &trimmed, nil
}

func cloneCreateTopLevelSectionPosition(position *Position) (*Position, error) {
	if position == nil {
		return nil, nil
	}
	if !isFinitePosition(*position) {
		return nil, ErrTopLevelSectionPositionInvalid
	}
	cloned := *position
	return &cloned, nil
}

func normalizeCreateTopLevelSectionName(name *string) (*string, error) {
	if name == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*name)
	if formatError := sectionNameFormatError(trimmed); formatError != "" {
		return nil, &InvalidSectionNameError{Message: formatError}
	}
	return &trimmed, nil
}

func cloneCreateTopLevelSectionViewportBounds(bounds *ViewportBounds) (*ViewportBounds, error) {
	if bounds == nil {
		return nil, nil
	}
	if !isFiniteViewportBounds(*bounds) {
		return nil, ErrTopLevelSectionViewportBoundsInvalid
	}
	cloned := *bounds
	return &cloned, nil
}

func isFiniteViewportBounds(bounds ViewportBounds) bool {
	return isFiniteFloat(bounds.X) &&
		isFiniteFloat(bounds.Y) &&
		isFiniteFloat(bounds.W) &&
		isFiniteFloat(bounds.H)
}

func isSupportedTopLevelSectionImplType(implType string) bool {
	_, ok := topLevelSectionImplBuilders[implType]
	return ok
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
