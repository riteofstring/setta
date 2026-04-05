package projectstate

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

type SectionSizeValue struct {
	Auto  bool
	Value float64
}

type SectionSize struct {
	Width  SectionSizeValue `json:"width" ts_create_expr:"SectionSizeModeEnum.auto"`
	Height SectionSizeValue `json:"height" ts_create_expr:"SectionSizeModeEnum.auto"`
}

func (v SectionSizeValue) MarshalJSON() ([]byte, error) {
	if v.Auto {
		return json.Marshal(string(SectionSizeModeAuto))
	}
	return json.Marshal(v.Value)
}

func (v *SectionSizeValue) UnmarshalJSON(data []byte) error {
	if v == nil {
		return fmt.Errorf("section size value target is nil")
	}
	var mode string
	if err := json.Unmarshal(data, &mode); err == nil {
		switch strings.TrimSpace(mode) {
		case string(SectionSizeModeAuto):
			*v = AutoSectionSizeValue()
			return nil
		case "":
			return fmt.Errorf("section size value must not be empty")
		default:
			return fmt.Errorf("unsupported section size mode %q", mode)
		}
	}
	var fixed float64
	if err := json.Unmarshal(data, &fixed); err == nil {
		*v = FixedSectionSizeValue(fixed)
		return nil
	}
	return fmt.Errorf("section size value must be a number or %q", SectionSizeModeAuto)
}

func (s SectionSize) MarshalJSON() ([]byte, error) {
	type sectionSizeJSON struct {
		Width  SectionSizeValue `json:"width"`
		Height SectionSizeValue `json:"height"`
	}
	return json.Marshal(sectionSizeJSON{
		Width:  s.Width,
		Height: s.Height,
	})
}

func (s *SectionSize) UnmarshalJSON(data []byte) error {
	if s == nil {
		return fmt.Errorf("section size target is nil")
	}
	type sectionSizeJSON struct {
		Width  SectionSizeValue `json:"width"`
		Height SectionSizeValue `json:"height"`
	}
	var decoded sectionSizeJSON
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	*s = SectionSize{
		Width:  decoded.Width,
		Height: decoded.Height,
	}
	return nil
}

type sectionSizeMutationState struct {
	sectionID   string
	section     Section
	variant     SectionVariant
	impl        SectionImpl
	payload     map[string]any
	sectionType string
}

func AutoSectionSizeValue() SectionSizeValue {
	return SectionSizeValue{Auto: true}
}

func FixedSectionSizeValue(value float64) SectionSizeValue {
	return SectionSizeValue{Value: value}
}

func (d *Document) SetSectionSizes(
	projectID string,
	sectionSizes map[string]SectionSize,
	settings StructuralMutationSettings,
) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	policy := normalizeStructuralMutationSettings(settings).SectionSizingPolicy
	if err := project.SetSectionSizes(sectionSizes, policy); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetSectionSizes(
	ctx context.Context,
	projectID string,
	sectionSizes map[string]SectionSize,
	settings StructuralMutationSettings,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetSectionSizes(projectID, sectionSizes, settings); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) SetSectionSizes(
	sectionSizes map[string]SectionSize,
	policy AutoLayoutSectionSizingPolicy,
) error {
	if p == nil {
		return ErrProjectNotFound
	}
	if len(sectionSizes) == 0 {
		return nil
	}

	mutations := make(map[string]*sectionSizeMutationState, len(sectionSizes))
	normalized := make(map[string]SectionSize, len(sectionSizes))
	for sectionID, requested := range sectionSizes {
		state, err := p.ensureSectionSizeMutationState(mutations, sectionID)
		if err != nil {
			return err
		}
		nextSize, err := normalizeSectionSize(policy, state.sectionType, sectionID, requested)
		if err != nil {
			return err
		}
		writeSectionSizeToPayload(state.payload, nextSize)
		normalized[sectionID] = nextSize
	}

	if err := p.rejectConflictingAttachedTerminalWidths(mutations, normalized); err != nil {
		return err
	}
	if err := p.applyEmbeddedSectionSizeRules(mutations, normalized, policy); err != nil {
		return err
	}

	for _, mutation := range mutations {
		rawPayload, err := marshalProjectObject(mutation.payload)
		if err != nil {
			return err
		}
		mutation.impl.Payload = rawPayload
		p.SectionImpls[mutation.variant.ImplID] = mutation.impl
	}
	return nil
}

func normalizeSectionSize(
	policy AutoLayoutSectionSizingPolicy,
	sectionType string,
	sectionID string,
	size SectionSize,
) (SectionSize, error) {
	dimensions, ok := policy.ByType[strings.TrimSpace(sectionType)]
	if !ok {
		return SectionSize{}, &InvalidAutoLayoutError{
			Message: fmt.Sprintf("Section %q has unsupported type %q for section sizing.", sectionID, sectionType),
		}
	}

	width, err := normalizeSectionSizeValue(sectionID, "width", size.Width, dimensions.MinWidth, dimensions.MaxWidth)
	if err != nil {
		return SectionSize{}, err
	}
	height, err := normalizeSectionSizeValue(sectionID, "height", size.Height, dimensions.MinHeight, dimensions.MaxHeight)
	if err != nil {
		return SectionSize{}, err
	}
	return SectionSize{Width: width, Height: height}, nil
}

func normalizeSectionSizeValue(
	sectionID string,
	dimension string,
	value SectionSizeValue,
	minValue float64,
	maxValue float64,
) (SectionSizeValue, error) {
	if value.Auto {
		return AutoSectionSizeValue(), nil
	}
	if math.IsNaN(value.Value) || math.IsInf(value.Value, 0) {
		return SectionSizeValue{}, &InvalidAutoLayoutError{
			Message: fmt.Sprintf("Section %q has non-finite %s value %v.", sectionID, dimension, value.Value),
		}
	}

	boundedMin := max(0, minValue)
	boundedMax := maxValue
	if boundedMax < boundedMin {
		boundedMax = boundedMin
	}
	return FixedSectionSizeValue(max(boundedMin, min(boundedMax, value.Value))), nil
}

func writeSectionSizeToPayload(payload map[string]any, size SectionSize) {
	sizeObject, ok := payloadObjectField(payload, "size")
	if !ok {
		sizeObject = map[string]any{}
	}
	sizeObject["width"] = sectionSizePayloadValue(size.Width)
	sizeObject["height"] = sectionSizePayloadValue(size.Height)
	payload["size"] = sizeObject
}

func writeSectionSizeDimensionToPayload(payload map[string]any, dimension string, value SectionSizeValue) {
	sizeObject, ok := payloadObjectField(payload, "size")
	if !ok {
		sizeObject = map[string]any{}
	}
	sizeObject[dimension] = sectionSizePayloadValue(value)
	payload["size"] = sizeObject
}

func sectionSizePayloadValue(value SectionSizeValue) any {
	if value.Auto {
		return "auto"
	}
	return value.Value
}

func (p *Project) ensureSectionSizeMutationState(
	mutations map[string]*sectionSizeMutationState,
	sectionID string,
) (*sectionSizeMutationState, error) {
	if mutation, ok := mutations[sectionID]; ok {
		return mutation, nil
	}

	section, variant, impl, err := p.ResolveSection(sectionID)
	if err != nil {
		return nil, err
	}
	payload, err := effectiveSectionPayload(*p, sectionID, variant.ID)
	if err != nil {
		return nil, err
	}
	sectionType := canonicalSectionType(payloadStringField(payload, "type"), impl)
	if sectionType == "" {
		sectionType = strings.TrimSpace(payloadStringField(payload, "type"))
	}

	mutation := &sectionSizeMutationState{
		sectionID:   sectionID,
		section:     section,
		variant:     variant,
		impl:        impl.Clone(),
		payload:     payload,
		sectionType: sectionType,
	}
	mutations[sectionID] = mutation
	return mutation, nil
}

func (p *Project) rejectConflictingAttachedTerminalWidths(
	mutations map[string]*sectionSizeMutationState,
	normalized map[string]SectionSize,
) error {
	for sectionID := range normalized {
		codeSectionID, terminalSectionID, ok, err := p.embeddedAttachedTerminalPair(mutations, sectionID)
		if err != nil {
			return err
		}
		if !ok {
			continue
		}

		codeSize, codeUpdated := normalized[codeSectionID]
		terminalSize, terminalUpdated := normalized[terminalSectionID]
		if !codeUpdated || !terminalUpdated || codeSize.Width.Auto || terminalSize.Width.Auto {
			continue
		}
		if codeSize.Width.Value != terminalSize.Width.Value {
			return &InvalidAutoLayoutError{
				Message: fmt.Sprintf(
					"Embedded code section %q and attached terminal %q must use the same width in a single set_section_sizes mutation.",
					codeSectionID,
					terminalSectionID,
				),
			}
		}
	}
	return nil
}

func (p *Project) applyEmbeddedSectionSizeRules(
	mutations map[string]*sectionSizeMutationState,
	normalized map[string]SectionSize,
	policy AutoLayoutSectionSizingPolicy,
) error {
	enforcedCodeSections := map[string]struct{}{}
	for sectionID, size := range normalized {
		codeSectionID, terminalSectionID, ok, err := p.embeddedAttachedTerminalPair(mutations, sectionID)
		if err != nil {
			return err
		}
		if !ok {
			continue
		}

		if sectionID == codeSectionID && !size.Width.Auto {
			terminalState, err := p.ensureSectionSizeMutationState(mutations, terminalSectionID)
			if err != nil {
				return err
			}
			writeSectionSizeDimensionToPayload(terminalState.payload, "width", size.Width)
		}
		if sectionID == terminalSectionID && !size.Width.Auto {
			codeState, err := p.ensureSectionSizeMutationState(mutations, codeSectionID)
			if err != nil {
				return err
			}
			writeSectionSizeDimensionToPayload(codeState.payload, "width", size.Width)
		}
		if _, ok := enforcedCodeSections[codeSectionID]; ok {
			continue
		}
		codeState, err := p.ensureSectionSizeMutationState(mutations, codeSectionID)
		if err != nil {
			return err
		}
		if err := ensureEmbeddedCodeSectionPayloadSize(codeSectionID, codeState.payload, policy); err != nil {
			return err
		}
		enforcedCodeSections[codeSectionID] = struct{}{}
	}
	return nil
}

func (p *Project) embeddedAttachedTerminalPair(
	mutations map[string]*sectionSizeMutationState,
	sectionID string,
) (string, string, bool, error) {
	state, err := p.ensureSectionSizeMutationState(mutations, sectionID)
	if err != nil {
		return "", "", false, err
	}

	if isCodeFamilySectionType(state.sectionType) {
		attachedTerminalID := strings.TrimSpace(payloadStringField(state.payload, "attachedTerminalSectionId"))
		if attachedTerminalID == "" {
			children := payloadStringArrayField(state.payload, "children")
			if len(children) == 1 {
				attachedTerminalID = children[0]
			}
		}
		if attachedTerminalID == "" {
			return "", "", false, nil
		}
		terminalState, err := p.ensureSectionSizeMutationState(mutations, attachedTerminalID)
		if err != nil {
			return "", "", false, err
		}
		if strings.TrimSpace(terminalState.section.ParentSectionID) != sectionID {
			return "", "", false, nil
		}
		if !strings.EqualFold(terminalState.sectionType, "Terminal") {
			return "", "", false, ErrTerminalSectionRequired
		}
		return sectionID, attachedTerminalID, true, nil
	}

	if !strings.EqualFold(state.sectionType, "Terminal") {
		return "", "", false, nil
	}
	parentSectionID := strings.TrimSpace(state.section.ParentSectionID)
	if parentSectionID == "" {
		return "", "", false, nil
	}
	parentState, err := p.ensureSectionSizeMutationState(mutations, parentSectionID)
	if err != nil {
		return "", "", false, err
	}
	if !isCodeFamilySectionType(parentState.sectionType) {
		return "", "", false, nil
	}
	attachedTerminalID := strings.TrimSpace(payloadStringField(parentState.payload, "attachedTerminalSectionId"))
	if attachedTerminalID == "" {
		children := payloadStringArrayField(parentState.payload, "children")
		if len(children) == 1 {
			attachedTerminalID = children[0]
		}
	}
	if attachedTerminalID != sectionID {
		return "", "", false, nil
	}
	return parentSectionID, sectionID, true, nil
}

func isCodeFamilySectionType(sectionType string) bool {
	switch strings.TrimSpace(sectionType) {
	case "Code", "GenPythonCode", "GenPythonMetadata":
		return true
	default:
		return false
	}
}
