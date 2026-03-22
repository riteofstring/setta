package projectstate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
)

var (
	ErrInvalidCodeSectionDiagnosticsIgnoreState = errors.New("code section diagnostics ignore state is invalid")
	ErrInvalidCodeSectionDiagnosticCode         = errors.New("code section diagnostic code must be a string or integer")
)

type CodeSectionDiagnosticsIgnoreState struct {
	Muted           bool  `json:"muted"`
	SuppressedCodes []any `json:"suppressedCodes"`
}

func (p Project) CodeSectionDiagnosticsIgnoreStateForSection(sectionID string) (CodeSectionDiagnosticsIgnoreState, error) {
	_, _, _, payload, err := p.resolveCodeSectionDiagnosticsContext(sectionID)
	if err != nil {
		return CodeSectionDiagnosticsIgnoreState{}, err
	}
	return codeSectionDiagnosticsIgnoreStateFromValue(payload["diagnosticsIgnoreState"])
}

func (p *Project) SetCodeSectionDiagnosticsMute(sectionID string, mute bool) error {
	if p == nil {
		return ErrProjectNotFound
	}

	ignoreState, err := p.CodeSectionDiagnosticsIgnoreStateForSection(sectionID)
	if err != nil {
		return err
	}
	ignoreState.Muted = mute
	return p.setCurrentCodeSectionDiagnosticsIgnoreState(sectionID, ignoreState)
}

func (p *Project) SetCodeSectionDiagnosticCodeSuppression(sectionID string, code any, suppress bool) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalizedCode, err := normalizeCodeSectionDiagnosticCode(code)
	if err != nil {
		return err
	}

	ignoreState, err := p.CodeSectionDiagnosticsIgnoreStateForSection(sectionID)
	if err != nil {
		return err
	}
	nextCodes := cloneCodeSectionDiagnosticCodes(ignoreState.SuppressedCodes)
	if suppress {
		if !containsCodeSectionDiagnosticCode(nextCodes, normalizedCode) {
			nextCodes = append(nextCodes, normalizedCode)
		}
	} else {
		filtered := make([]any, 0, len(nextCodes))
		for _, existing := range nextCodes {
			if codeSectionDiagnosticCodeKey(existing) == codeSectionDiagnosticCodeKey(normalizedCode) {
				continue
			}
			filtered = append(filtered, existing)
		}
		nextCodes = filtered
	}
	ignoreState.SuppressedCodes = nextCodes
	return p.setCurrentCodeSectionDiagnosticsIgnoreState(sectionID, ignoreState)
}

func (d *Document) SetCodeSectionDiagnosticsMute(projectID string, sectionID string, mute bool) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetCodeSectionDiagnosticsMute(sectionID, mute); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (d *Document) SetCodeSectionDiagnosticCodeSuppression(projectID string, sectionID string, code any, suppress bool) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetCodeSectionDiagnosticCodeSuppression(sectionID, code, suppress); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetCodeSectionDiagnosticsMute(ctx context.Context, projectID string, sectionID string, mute bool) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetCodeSectionDiagnosticsMute(projectID, sectionID, mute); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (r *Runtime) SetCodeSectionDiagnosticCodeSuppression(
	ctx context.Context,
	projectID string,
	sectionID string,
	code any,
	suppress bool,
) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetCodeSectionDiagnosticCodeSuppression(projectID, sectionID, code, suppress); err != nil {
			return document, err
		}
		return document, nil
	})
}

func applyCodeSectionDiagnosticsIgnore(
	diagnostics []LSPDiagnostic,
	ignoreState CodeSectionDiagnosticsIgnoreState,
) []LSPDiagnostic {
	if ignoreState.Muted {
		return []LSPDiagnostic{}
	}
	if len(ignoreState.SuppressedCodes) == 0 {
		return diagnostics
	}

	suppressed := make(map[string]struct{}, len(ignoreState.SuppressedCodes))
	for _, code := range ignoreState.SuppressedCodes {
		key := codeSectionDiagnosticCodeKey(code)
		if key == "" {
			continue
		}
		suppressed[key] = struct{}{}
	}
	if len(suppressed) == 0 {
		return diagnostics
	}

	filtered := make([]LSPDiagnostic, 0, len(diagnostics))
	for _, diagnostic := range diagnostics {
		key := codeSectionDiagnosticCodeKey(diagnostic.Code)
		if key != "" {
			if _, ignored := suppressed[key]; ignored {
				continue
			}
		}
		filtered = append(filtered, diagnostic)
	}
	return filtered
}

func (p Project) resolveCodeSectionDiagnosticsContext(sectionID string) (Section, SectionVariant, SectionImpl, map[string]any, error) {
	section, variant, impl, err := p.ResolveSection(sectionID)
	if err != nil {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, err
	}
	payload, err := effectiveSectionPayload(p, section.ID, variant.ID)
	if err != nil {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, err
	}
	sectionType := payloadStringField(payload, "type")
	if sectionType == "" {
		sectionType = fallbackSectionType(impl)
	}
	if sectionType != "Code" {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, fmt.Errorf("%w: %q", ErrCodeSectionRequired, sectionID)
	}
	if !impl.IsCode() || impl.Code == nil {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, fmt.Errorf("%w: %q", ErrCodeSectionRequired, sectionID)
	}
	return section, variant, impl, payload, nil
}

func (p *Project) setCurrentCodeSectionDiagnosticsIgnoreState(sectionID string, ignoreState CodeSectionDiagnosticsIgnoreState) error {
	if p == nil {
		return ErrProjectNotFound
	}

	normalizedState, err := normalizeCodeSectionDiagnosticsIgnoreState(ignoreState)
	if err != nil {
		return err
	}

	section, variant, impl, _, err := p.resolveCodeSectionDiagnosticsContext(sectionID)
	if err != nil {
		return err
	}

	fieldValue := map[string]any{
		"muted":           normalizedState.Muted,
		"suppressedCodes": cloneCodeSectionDiagnosticCodes(normalizedState.SuppressedCodes),
	}
	fieldName := "diagnosticsIgnoreState"

	switch {
	case !sectionFieldIsUnshared(section, fieldName):
		modifier, err := rawObjectFromProjectPayload(section.SharedModifier)
		if err != nil {
			return err
		}
		modifier[fieldName] = fieldValue
		raw, err := marshalProjectObject(modifier)
		if err != nil {
			return err
		}
		section.SharedModifier = raw
		p.Sections[section.ID] = section
	case !sectionImplIsPreset(impl):
		payload, err := rawObjectFromProjectPayload(sectionImplPayloadUnchecked(impl))
		if err != nil {
			return err
		}
		payload[fieldName] = fieldValue
		raw, err := marshalProjectObject(payload)
		if err != nil {
			return err
		}
		impl.Payload = raw
		p.SectionImpls[impl.ID] = impl
	default:
		modifier, err := rawObjectFromProjectPayload(variant.Modifier)
		if err != nil {
			return err
		}
		modifier[fieldName] = fieldValue
		raw, err := marshalProjectObject(modifier)
		if err != nil {
			return err
		}
		variant.Modifier = raw
		p.SectionVariants[variant.ID] = variant
	}

	return nil
}

func codeSectionDiagnosticsIgnoreStateFromValue(value any) (CodeSectionDiagnosticsIgnoreState, error) {
	state := CodeSectionDiagnosticsIgnoreState{
		SuppressedCodes: []any{},
	}
	if value == nil {
		return state, nil
	}

	object, ok := value.(map[string]any)
	if !ok {
		return CodeSectionDiagnosticsIgnoreState{}, ErrInvalidCodeSectionDiagnosticsIgnoreState
	}
	if muted, ok := object["muted"]; ok {
		typed, ok := muted.(bool)
		if !ok {
			return CodeSectionDiagnosticsIgnoreState{}, ErrInvalidCodeSectionDiagnosticsIgnoreState
		}
		state.Muted = typed
	}
	if suppressed, ok := object["suppressedCodes"]; ok {
		entries, ok := suppressed.([]any)
		if !ok {
			return CodeSectionDiagnosticsIgnoreState{}, ErrInvalidCodeSectionDiagnosticsIgnoreState
		}
		state.SuppressedCodes = make([]any, 0, len(entries))
		for _, entry := range entries {
			normalized, err := normalizeCodeSectionDiagnosticCode(entry)
			if err != nil {
				return CodeSectionDiagnosticsIgnoreState{}, err
			}
			state.SuppressedCodes = append(state.SuppressedCodes, normalized)
		}
	}
	return state, nil
}

func normalizeCodeSectionDiagnosticsIgnoreState(state CodeSectionDiagnosticsIgnoreState) (CodeSectionDiagnosticsIgnoreState, error) {
	normalized := CodeSectionDiagnosticsIgnoreState{
		Muted:           state.Muted,
		SuppressedCodes: make([]any, 0, len(state.SuppressedCodes)),
	}
	for _, code := range state.SuppressedCodes {
		normalizedCode, err := normalizeCodeSectionDiagnosticCode(code)
		if err != nil {
			return CodeSectionDiagnosticsIgnoreState{}, err
		}
		normalized.SuppressedCodes = append(normalized.SuppressedCodes, normalizedCode)
	}
	return normalized, nil
}

func normalizeCodeSectionDiagnosticCode(value any) (any, error) {
	switch typed := value.(type) {
	case string:
		return typed, nil
	case int:
		return typed, nil
	case int8:
		return int(typed), nil
	case int16:
		return int(typed), nil
	case int32:
		return int(typed), nil
	case int64:
		if typed > math.MaxInt || typed < math.MinInt {
			return nil, ErrInvalidCodeSectionDiagnosticCode
		}
		return int(typed), nil
	case float64:
		if math.Trunc(typed) != typed || typed > float64(math.MaxInt) || typed < float64(math.MinInt) {
			return nil, ErrInvalidCodeSectionDiagnosticCode
		}
		return int(typed), nil
	case json.Number:
		intValue, err := typed.Int64()
		if err != nil {
			return nil, ErrInvalidCodeSectionDiagnosticCode
		}
		if intValue > math.MaxInt || intValue < math.MinInt {
			return nil, ErrInvalidCodeSectionDiagnosticCode
		}
		return int(intValue), nil
	default:
		return nil, ErrInvalidCodeSectionDiagnosticCode
	}
}

func codeSectionDiagnosticCodeKey(value any) string {
	switch typed := value.(type) {
	case string:
		return "s:" + typed
	case int:
		return fmt.Sprintf("i:%d", typed)
	case int8:
		return fmt.Sprintf("i:%d", typed)
	case int16:
		return fmt.Sprintf("i:%d", typed)
	case int32:
		return fmt.Sprintf("i:%d", typed)
	case int64:
		return fmt.Sprintf("i:%d", typed)
	case float64:
		if math.Trunc(typed) != typed || typed > float64(math.MaxInt) || typed < float64(math.MinInt) {
			return ""
		}
		return fmt.Sprintf("i:%d", int(typed))
	case json.Number:
		intValue, err := typed.Int64()
		if err != nil {
			return ""
		}
		return fmt.Sprintf("i:%d", intValue)
	default:
		return ""
	}
}

func containsCodeSectionDiagnosticCode(values []any, expected any) bool {
	expectedKey := codeSectionDiagnosticCodeKey(expected)
	if expectedKey == "" {
		return false
	}
	for _, value := range values {
		if codeSectionDiagnosticCodeKey(value) == expectedKey {
			return true
		}
	}
	return false
}

func cloneCodeSectionDiagnosticCodes(values []any) []any {
	if len(values) == 0 {
		return []any{}
	}
	cloned := make([]any, len(values))
	copy(cloned, values)
	return cloned
}

func sectionImplIsPreset(impl SectionImpl) bool {
	payload, err := rawObjectFromProjectPayload(sectionImplPayloadUnchecked(impl))
	if err != nil {
		return false
	}
	value, ok := payload["isPreset"]
	if !ok {
		return false
	}
	typed, ok := value.(bool)
	return ok && typed
}

func marshalProjectObject(value map[string]any) (RawJSON, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return cloneRawJSON(encoded), nil
}
