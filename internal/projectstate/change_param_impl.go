package projectstate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
)

var (
	ErrChangeParamImplUnsupported           = errors.New("section does not support change_param_impl")
	ErrChangeParamImplSelectedRequired      = errors.New("selected impl or code object type is required")
	ErrChangeParamImplCodeObjTypeUnknown    = errors.New("selected code object type is unsupported")
	ErrChangeParamImplCodeObjTypeNotAllowed = errors.New("selected code object type is not allowed for section")
	ErrPasswordParamMutationUnsupported     = errors.New("password param mutation requires password secret store")
)

var controlCodeObjectTypes = map[string]struct{}{
	"CodeParam":        {},
	"TextParam":        {},
	"DateParam":        {},
	"TimeParam":        {},
	"TextAreaParam":    {},
	"ButtonParam":      {},
	"SliderParam":      {},
	"RotaryParam":      {},
	"SwitchParam":      {},
	"ColorPickerParam": {},
	"DropdownParam":    {},
	"PasswordParam":    {},
	"DropzoneParam":    {},
}

var sectionParamCodeObjectTypes = map[string]struct{}{
	"CodeParam":        {},
	"TextParam":        {},
	"DateParam":        {},
	"TimeParam":        {},
	"TextAreaParam":    {},
	"SliderParam":      {},
	"RotaryParam":      {},
	"SwitchParam":      {},
	"ColorPickerParam": {},
	"DropdownParam":    {},
	"PasswordParam":    {},
	"DropzoneParam":    {},
	"NestedParam":      {},
}

var allParamCodeObjectTypes = map[string]struct{}{
	"CodeParam":        {},
	"TextParam":        {},
	"DateParam":        {},
	"TimeParam":        {},
	"TextAreaParam":    {},
	"ButtonParam":      {},
	"SliderParam":      {},
	"RotaryParam":      {},
	"SwitchParam":      {},
	"ColorPickerParam": {},
	"DropdownParam":    {},
	"PasswordParam":    {},
	"DropzoneParam":    {},
	"NestedParam":      {},
}

var childlessParamCodeObjectTypes = map[string]struct{}{
	"CodeParam":        {},
	"TextParam":        {},
	"DateParam":        {},
	"TimeParam":        {},
	"TextAreaParam":    {},
	"SliderParam":      {},
	"RotaryParam":      {},
	"SwitchParam":      {},
	"ColorPickerParam": {},
	"DropdownParam":    {},
	"PasswordParam":    {},
	"DropzoneParam":    {},
}

func (d *Document) ChangeParamImpl(projectID string, sectionID string, paramInfoID string, selectedID string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.ChangeParamImpl(sectionID, paramInfoID, selectedID); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) ChangeParamImpl(ctx context.Context, projectID string, sectionID string, paramInfoID string, selectedID string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.ChangeParamImpl(projectID, sectionID, paramInfoID, selectedID); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) ChangeParamImpl(sectionID string, paramInfoID string, selectedID string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return ErrSectionIDRequired
	}
	trimmedParamID := strings.TrimSpace(paramInfoID)
	if trimmedParamID == "" {
		return ErrCodeObjIDRequired
	}
	trimmedSelectedID := strings.TrimSpace(selectedID)
	if trimmedSelectedID == "" {
		return ErrChangeParamImplSelectedRequired
	}

	allowedTypes, err := p.allowedChangeParamImplTypes(trimmedSectionID)
	if err != nil {
		return err
	}

	oldPayload, _, oldVariant, oldImpl, err := p.ResolveSectionCodeObject(trimmedSectionID, trimmedParamID)
	if err != nil {
		return err
	}
	oldType := effectiveCodeObjType(oldPayload, oldImpl)

	nextImpl, nextType, err := p.resolveChangeParamImplTarget(trimmedSelectedID, allowedTypes)
	if err != nil {
		return err
	}
	if _, ok := allowedTypes[nextType]; !ok {
		return fmt.Errorf("%w: section=%q type=%q", ErrChangeParamImplCodeObjTypeNotAllowed, trimmedSectionID, nextType)
	}

	if nextImpl.ID != oldVariant.ImplID {
		if _, ok := p.CodeObjImpls[nextImpl.ID]; !ok {
			p.CodeObjImpls[nextImpl.ID] = nextImpl
		}
	}
	oldVariant.ImplID = nextImpl.ID
	if !codeObjImplIsPreset(nextImpl) && !containsString(oldVariant.NonPresetImplIDs, nextImpl.ID) {
		oldVariant.NonPresetImplIDs = append(oldVariant.NonPresetImplIDs, nextImpl.ID)
	}
	p.CodeObjVariants[oldVariant.ID] = oldVariant

	if isParamCodeObjectType(oldType) && isParamCodeObjectType(nextType) {
		if err := p.setSectionCodeObjectField(trimmedSectionID, trimmedParamID, "coreNameEditable", payloadBoolField(oldPayload, "coreNameEditable")); err != nil {
			return err
		}
		if err := p.setSectionCodeObjectField(trimmedSectionID, trimmedParamID, "coreNameType", stringFieldOrDefault(oldPayload, "coreNameType", "TEXT")); err != nil {
			return err
		}
		if err := p.setSectionCodeObjectField(trimmedSectionID, trimmedParamID, "passingStyle", stringFieldOrDefault(oldPayload, "passingStyle", "DEFAULT")); err != nil {
			return err
		}
		if err := p.setSectionCodeObjectField(trimmedSectionID, trimmedParamID, "typeAnnotation", payloadRawStringField(oldPayload, "typeAnnotation")); err != nil {
			return err
		}
	}

	return p.migrateChangedParamValue(trimmedSectionID, trimmedParamID, oldImpl, oldPayload, oldType, nextImpl)
}

func (p Project) allowedChangeParamImplTypes(sectionID string) (map[string]struct{}, error) {
	section, variant, impl, err := p.ResolveSection(sectionID)
	if err != nil {
		return nil, err
	}
	payload, err := effectiveSectionPayload(p, section.ID, variant.ID)
	if err != nil {
		return nil, err
	}
	switch canonicalSectionType(payloadStringField(payload, "type"), impl) {
	case "MetaControl":
		return controlCodeObjectTypes, nil
	case "Callable", "Dict":
		return sectionParamCodeObjectTypes, nil
	default:
		return nil, fmt.Errorf("%w: section=%q type=%q", ErrChangeParamImplUnsupported, sectionID, canonicalSectionType(payloadStringField(payload, "type"), impl))
	}
}

func canonicalSectionType(raw string, impl SectionImpl) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "metacontrol":
		return "MetaControl"
	case "callable":
		return "Callable"
	case "dict":
		return "Dict"
	case "globalvariables":
		return "GlobalVariables"
	}
	switch strings.ToLower(strings.TrimSpace(fallbackSectionType(impl))) {
	case "metacontrol":
		return "MetaControl"
	case "callable":
		return "Callable"
	case "dict":
		return "Dict"
	case "globalvariables":
		return "GlobalVariables"
	default:
		return strings.TrimSpace(raw)
	}
}

func (p *Project) resolveChangeParamImplTarget(selectedID string, allowedTypes map[string]struct{}) (CodeObjectImpl, string, error) {
	if impl, ok := p.CodeObjImpls[selectedID]; ok {
		nextType := effectiveCodeObjType(codeObjImplPayloadObject(impl), impl)
		if nextType == "" {
			nextType = strings.TrimSpace(impl.Type)
		}
		return impl, nextType, nil
	}

	nextType := strings.TrimSpace(selectedID)
	if _, ok := allowedTypes[nextType]; !ok {
		if isParamCodeObjectType(nextType) {
			return CodeObjectImpl{}, "", fmt.Errorf("%w: %q", ErrChangeParamImplCodeObjTypeNotAllowed, nextType)
		}
		return CodeObjectImpl{}, "", fmt.Errorf("%w: %q", ErrChangeParamImplCodeObjTypeUnknown, nextType)
	}
	impl, err := newCodeObjectImplForType(nextType)
	if err != nil {
		return CodeObjectImpl{}, "", err
	}
	return impl, nextType, nil
}

func newCodeObjectImplForType(codeObjType string) (CodeObjectImpl, error) {
	implID, err := newProjectStateID()
	if err != nil {
		return CodeObjectImpl{}, err
	}

	base := paramImplBasePayload()
	switch strings.TrimSpace(codeObjType) {
	case codeParamType:
		base = childlessParamImplBasePayload()
	case "TextParam":
		base = childlessParamImplBasePayload()
		base["uiType"] = "plain"
	case "DateParam":
		base = childlessParamImplBasePayload()
		base["dateDisplayFormat"] = "iso"
		base["dateControlMode"] = "input"
		base["dateSelectionMode"] = "single"
		base["dateCalendarWeekStart"] = "sunday"
		base["dateIncludesTime"] = false
	case "TimeParam":
		base = childlessParamImplBasePayload()
		base["timeControlMode"] = "input"
		base["timeDisplayFormat"] = "twenty_four_hour"
		base["timeDisplayTransparent"] = false
		base["timeDisplayScale"] = 1.0
		base["timeDisplayFont"] = "monospace"
	case "ButtonParam":
		base["label"] = "Trigger"
		base["actionMode"] = "WEBSOCKET_LISTENER"
		base["requestMethod"] = "POST"
		base["requestUrl"] = ""
		base["requestHeaderKey"] = ""
		base["requestHeaderValue"] = ""
		base["requestBody"] = ""
	case "SliderParam":
		base = childlessParamImplBasePayload()
		base["min"] = 0
		base["max"] = 100
		base["step"] = 1
		base["value"] = "0"
	case "RotaryParam":
		base = childlessParamImplBasePayload()
		base["min"] = 0
		base["max"] = 1
		base["step"] = 0.1
		base["value"] = "0"
	case "SwitchParam":
		base = childlessParamImplBasePayload()
		base["value"] = "false"
	case "ColorPickerParam":
		base = childlessParamImplBasePayload()
		base["colorChoices"] = []any{}
		base["value"] = "#ff0000"
	case "DropdownParam":
		base = childlessParamImplBasePayload()
		base["choices"] = []any{}
	case "PasswordParam":
		base = childlessParamImplBasePayload()
		base["hasSecret"] = false
	case "TextAreaParam":
		base = childlessParamImplBasePayload()
	case "DropzoneParam":
		base = childlessParamImplBasePayload()
		base["mode"] = "STATEFUL"
		base["placeholder"] = "Drop a file here"
	case nestedParamCodeObjType:
		base["children"] = []any{}
	default:
		return CodeObjectImpl{}, fmt.Errorf("%w: %q", ErrChangeParamImplCodeObjTypeUnknown, codeObjType)
	}

	payload, err := buildCreatedCodeObjectPayload(implID, codeObjType, base)
	if err != nil {
		return CodeObjectImpl{}, err
	}
	return CodeObjectImpl{
		ID:      implID,
		Type:    codeObjType,
		Payload: payload,
	}, nil
}

func paramImplBasePayload() map[string]any {
	return map[string]any{
		"coreNameType":     "TEXT",
		"coreNameEditable": false,
		"passingStyle":     "DEFAULT",
		"typeAnnotation":   "",
	}
}

func childlessParamImplBasePayload() map[string]any {
	base := paramImplBasePayload()
	base["defaultVal"] = ""
	base["value"] = ""
	return base
}

func (p *Project) migrateChangedParamValue(
	sectionID string,
	paramInfoID string,
	oldImpl CodeObjectImpl,
	oldPayload map[string]any,
	oldType string,
	newImpl CodeObjectImpl,
) error {
	newPayload, _, _, resolvedNewImpl, err := p.ResolveSectionCodeObject(sectionID, paramInfoID)
	if err != nil {
		return err
	}
	newType := effectiveCodeObjType(newPayload, resolvedNewImpl)

	oldValue, oldHasValue := payloadRawStringFieldWithPresence(oldPayload, "value")
	oldIsPassword := oldType == "PasswordParam"
	newIsPassword := newType == "PasswordParam"

	if oldIsPassword || newIsPassword {
		if p.passwordSecrets == nil {
			return ErrPasswordParamMutationUnsupported
		}
	}

	if oldIsPassword {
		oldSecret, err := p.passwordSecrets.Get(oldImpl.ID)
		if err != nil {
			return err
		}
		if newIsPassword {
			if resolvedNewImpl.ID != oldImpl.ID && oldSecret != "" {
				if err := p.passwordSecrets.Set(resolvedNewImpl.ID, oldSecret); err != nil {
					return err
				}
			}
			if resolvedNewImpl.ID != oldImpl.ID {
				if err := p.passwordSecrets.Set(oldImpl.ID, ""); err != nil {
					return err
				}
			}
		} else {
			if err := p.passwordSecrets.Set(oldImpl.ID, ""); err != nil {
				return err
			}
		}
		oldValue = ""
		oldHasValue = true
		if resolvedNewImpl.ID != oldImpl.ID {
			if err := p.setCodeObjectImplBaseField(oldImpl.ID, "hasSecret", false); err != nil {
				return err
			}
		}
	}

	if newIsPassword {
		if !oldIsPassword && oldHasValue && oldValue != "" {
			if err := p.passwordSecrets.Set(resolvedNewImpl.ID, oldValue); err != nil {
				return err
			}
		}
		hasSecret, err := p.passwordSecrets.Get(resolvedNewImpl.ID)
		if err != nil {
			return err
		}
		if err := p.setSectionCodeObjectField(sectionID, paramInfoID, "hasSecret", hasSecret != ""); err != nil {
			return err
		}
		if _, ok := childlessParamCodeObjectTypes[newType]; ok {
			return p.setSectionCodeObjectField(sectionID, paramInfoID, "value", "")
		}
		return nil
	}

	if _, ok := childlessParamCodeObjectTypes[oldType]; !ok {
		return nil
	}
	if _, ok := childlessParamCodeObjectTypes[newType]; !ok {
		return nil
	}
	if !oldHasValue {
		return nil
	}

	convertedValue, err := convertCodeObjectValueForType(newPayload, oldValue)
	if err != nil {
		return err
	}
	return p.setSectionCodeObjectField(sectionID, paramInfoID, "value", convertedValue)
}

func convertCodeObjectValueForType(payload map[string]any, value string) (string, error) {
	switch strings.TrimSpace(payloadStringField(payload, "type")) {
	case codeParamType, "TextParam", "DateParam", "TimeParam", "DropdownParam", "PasswordParam", "TextAreaParam":
		return value, nil
	case "DropzoneParam":
		if stringFieldOrDefault(payload, "mode", "STATEFUL") == "STATELESS" {
			return "", nil
		}
		return normalizeDropzoneValue(value, optionalPositiveIntField(payload, "maxAttachments")), nil
	case "SliderParam", "RotaryParam":
		minimum := numberFieldOrDefault(payload, "min", 0)
		maximum := numberFieldOrDefault(payload, "max", minimum)
		parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		if err != nil || math.IsNaN(parsed) {
			return formatProjectNumber(minimum), nil
		}
		if parsed < minimum {
			parsed = minimum
		}
		if parsed > maximum {
			parsed = maximum
		}
		return formatProjectNumber(parsed), nil
	case "SwitchParam":
		if value == "0" {
			return "false", nil
		}
		return "true", nil
	case "ColorPickerParam":
		choices := colorChoiceValues(payload["colorChoices"])
		if len(choices) > 0 {
			for _, choice := range choices {
				if value == choice {
					return value, nil
				}
			}
			return choices[0], nil
		}
		if isColorHex(value) {
			return value, nil
		}
		return "#ff0000", nil
	default:
		return value, nil
	}
}

func effectiveCodeObjType(payload map[string]any, impl CodeObjectImpl) string {
	codeObjType := payloadStringField(payload, "type")
	if codeObjType != "" {
		return codeObjType
	}
	return strings.TrimSpace(impl.Type)
}

func codeObjImplPayloadObject(impl CodeObjectImpl) map[string]any {
	payload, err := rawObjectFromProjectPayload(codeObjImplPayloadUnchecked(impl))
	if err != nil {
		return map[string]any{
			"id":   impl.ID,
			"type": impl.Type,
		}
	}
	return payload
}

func isParamCodeObjectType(codeObjType string) bool {
	_, ok := allParamCodeObjectTypes[strings.TrimSpace(codeObjType)]
	return ok
}

func stringFieldOrDefault(payload map[string]any, key string, fallback string) string {
	value := payloadStringField(payload, key)
	if value == "" {
		return fallback
	}
	return value
}

func numberFieldOrDefault(payload map[string]any, key string, fallback float64) float64 {
	raw, ok := payload[key]
	if !ok {
		return fallback
	}
	switch typed := raw.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case json.Number:
		value, err := typed.Float64()
		if err == nil {
			return value
		}
	}
	return fallback
}

func optionalPositiveIntField(payload map[string]any, key string) *int {
	raw, ok := payload[key]
	if !ok || raw == nil {
		return nil
	}
	switch typed := raw.(type) {
	case float64:
		value := int(typed)
		if typed > 0 && float64(value) == typed {
			return &value
		}
	case int:
		if typed > 0 {
			value := typed
			return &value
		}
	}
	return nil
}

func formatProjectNumber(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func colorChoiceValues(raw any) []string {
	entries, ok := raw.([]any)
	if !ok {
		return nil
	}
	output := make([]string, 0, len(entries))
	for _, entry := range entries {
		object, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		color := payloadRawStringField(object, "color")
		if color == "" {
			continue
		}
		output = append(output, color)
	}
	return output
}

func isColorHex(value string) bool {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) != 7 || trimmed[0] != '#' {
		return false
	}
	for _, r := range trimmed[1:] {
		switch {
		case r >= '0' && r <= '9':
		case r >= 'a' && r <= 'f':
		case r >= 'A' && r <= 'F':
		default:
			return false
		}
	}
	return true
}

func normalizeDropzoneValue(value string, maxAttachments *int) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(trimmed), &payload); err != nil {
		return value
	}
	rawAttachments, ok := payload["attachments"].([]any)
	if !ok {
		return value
	}
	if len(rawAttachments) == 0 {
		return ""
	}
	if maxAttachments == nil || *maxAttachments <= 0 || len(rawAttachments) <= *maxAttachments {
		return value
	}
	payload["attachments"] = append([]any(nil), rawAttachments[:*maxAttachments]...)
	encoded, err := json.Marshal(payload)
	if err != nil {
		return value
	}
	return string(encoded)
}

func (p *Project) setCodeObjectImplBaseField(implID string, fieldName string, fieldValue any) error {
	trimmedImplID := strings.TrimSpace(implID)
	if trimmedImplID == "" {
		return ErrCodeObjImplIDRequired
	}
	impl, ok := p.CodeObjImpls[trimmedImplID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjImplNotFound, trimmedImplID)
	}
	payload, err := rawObjectFromProjectPayload(codeObjImplPayloadUnchecked(impl))
	if err != nil {
		return err
	}
	payload[fieldName] = cloneProjectValue(fieldValue)
	raw, err := marshalProjectObject(payload)
	if err != nil {
		return err
	}
	impl.Payload = raw
	p.CodeObjImpls[impl.ID] = impl
	return nil
}
