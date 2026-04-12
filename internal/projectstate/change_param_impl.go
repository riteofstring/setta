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

	resolvedChange, err := p.resolveChangeParamImpl(sectionID, paramInfoID, selectedID)
	if err != nil {
		return err
	}
	p.applyChangeParamImplVariant(&resolvedChange.oldVariant, resolvedChange.nextImpl)
	if err := p.copyChangedParamImplMetadata(
		resolvedChange.sectionID,
		resolvedChange.paramInfoID,
		resolvedChange.oldPayload,
		resolvedChange.oldType,
		resolvedChange.nextType,
	); err != nil {
		return err
	}
	return p.migrateChangedParamValue(
		resolvedChange.sectionID,
		resolvedChange.paramInfoID,
		resolvedChange.oldImpl,
		resolvedChange.oldPayload,
		resolvedChange.oldType,
	)
}

type resolvedChangeParamImpl struct {
	sectionID   string
	paramInfoID string
	oldPayload  map[string]any
	oldVariant  CodeObjectVariant
	oldImpl     CodeObjectImpl
	oldType     string
	nextImpl    CodeObjectImpl
	nextType    string
}

func normalizeChangeParamImplInput(sectionID string, paramInfoID string, selectedID string) (string, string, string, error) {
	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return "", "", "", ErrSectionIDRequired
	}
	trimmedParamID := strings.TrimSpace(paramInfoID)
	if trimmedParamID == "" {
		return "", "", "", ErrCodeObjIDRequired
	}
	trimmedSelectedID := strings.TrimSpace(selectedID)
	if trimmedSelectedID == "" {
		return "", "", "", ErrChangeParamImplSelectedRequired
	}
	return trimmedSectionID, trimmedParamID, trimmedSelectedID, nil
}

func (p *Project) resolveChangeParamImpl(sectionID string, paramInfoID string, selectedID string) (resolvedChangeParamImpl, error) {
	trimmedSectionID, trimmedParamID, trimmedSelectedID, err := normalizeChangeParamImplInput(sectionID, paramInfoID, selectedID)
	if err != nil {
		return resolvedChangeParamImpl{}, err
	}
	allowedTypes, err := p.allowedChangeParamImplTypes(trimmedSectionID)
	if err != nil {
		return resolvedChangeParamImpl{}, err
	}
	oldPayload, _, oldVariant, oldImpl, err := p.ResolveSectionCodeObject(trimmedSectionID, trimmedParamID)
	if err != nil {
		return resolvedChangeParamImpl{}, err
	}
	oldType := effectiveCodeObjType(oldPayload, oldImpl)
	nextImpl, nextType, err := p.resolveChangeParamImplTarget(trimmedSelectedID, allowedTypes)
	if err != nil {
		return resolvedChangeParamImpl{}, err
	}
	if _, ok := allowedTypes[nextType]; !ok {
		return resolvedChangeParamImpl{}, fmt.Errorf("%w: section=%q type=%q", ErrChangeParamImplCodeObjTypeNotAllowed, trimmedSectionID, nextType)
	}
	return resolvedChangeParamImpl{
		sectionID:   trimmedSectionID,
		paramInfoID: trimmedParamID,
		oldPayload:  oldPayload,
		oldVariant:  oldVariant,
		oldImpl:     oldImpl,
		oldType:     oldType,
		nextImpl:    nextImpl,
		nextType:    nextType,
	}, nil
}

func (p *Project) applyChangeParamImplVariant(variant *CodeObjectVariant, nextImpl CodeObjectImpl) {
	if nextImpl.ID != variant.ImplID {
		if _, ok := p.CodeObjImpls[nextImpl.ID]; !ok {
			p.CodeObjImpls[nextImpl.ID] = nextImpl
		}
	}
	variant.ImplID = nextImpl.ID
	if !codeObjImplIsPreset(nextImpl) && !containsString(variant.NonPresetImplIDs, nextImpl.ID) {
		variant.NonPresetImplIDs = append(variant.NonPresetImplIDs, nextImpl.ID)
	}
	p.CodeObjVariants[variant.ID] = *variant
}

func (p *Project) copyChangedParamImplMetadata(
	sectionID string,
	paramInfoID string,
	oldPayload map[string]any,
	oldType string,
	newType string,
) error {
	if !isParamCodeObjectType(oldType) || !isParamCodeObjectType(newType) {
		return nil
	}
	metadataFields := []struct {
		name  string
		value any
	}{
		{name: "coreNameEditable", value: payloadBoolField(oldPayload, "coreNameEditable")},
		{name: "coreNameType", value: stringFieldOrDefault(oldPayload, "coreNameType", "TEXT")},
		{name: "passingStyle", value: stringFieldOrDefault(oldPayload, "passingStyle", "DEFAULT")},
		{name: "typeAnnotation", value: payloadRawStringField(oldPayload, "typeAnnotation")},
	}
	for _, field := range metadataFields {
		if err := p.setSectionCodeObjectField(sectionID, paramInfoID, field.name, field.value); err != nil {
			return err
		}
	}
	return nil
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
	case "Callable", "Dict", "GlobalVariables":
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

var paramImplBasePayloadFactories = map[string]func() map[string]any{
	codeParamType:          childlessParamImplBasePayload,
	"TextParam":            textParamImplBasePayload,
	"DateParam":            dateParamImplBasePayload,
	"TimeParam":            timeParamImplBasePayload,
	"ButtonParam":          buttonParamImplBasePayload,
	"SliderParam":          sliderParamImplBasePayload,
	"RotaryParam":          rotaryParamImplBasePayload,
	"SwitchParam":          switchParamImplBasePayload,
	"ColorPickerParam":     colorPickerParamImplBasePayload,
	"DropdownParam":        dropdownParamImplBasePayload,
	"PasswordParam":        passwordParamImplBasePayload,
	"TextAreaParam":        childlessParamImplBasePayload,
	"DropzoneParam":        dropzoneParamImplBasePayload,
	nestedParamCodeObjType: nestedParamImplBasePayload,
}

func newCodeObjectImplForType(codeObjType string) (CodeObjectImpl, error) {
	implID, err := newProjectStateID()
	if err != nil {
		return CodeObjectImpl{}, err
	}

	trimmedType := strings.TrimSpace(codeObjType)
	factory, ok := paramImplBasePayloadFactories[trimmedType]
	if !ok {
		return CodeObjectImpl{}, fmt.Errorf("%w: %q", ErrChangeParamImplCodeObjTypeUnknown, codeObjType)
	}
	payload, err := buildCreatedCodeObjectPayload(implID, trimmedType, factory())
	if err != nil {
		return CodeObjectImpl{}, err
	}
	return CodeObjectImpl{
		ID:      implID,
		Type:    trimmedType,
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

func textParamImplBasePayload() map[string]any {
	base := childlessParamImplBasePayload()
	base["uiType"] = "plain"
	return base
}

func dateParamImplBasePayload() map[string]any {
	base := childlessParamImplBasePayload()
	base["dateDisplayFormat"] = "iso"
	base["dateControlMode"] = "input"
	base["dateSelectionMode"] = "single"
	base["dateCalendarWeekStart"] = "sunday"
	base["dateIncludesTime"] = false
	return base
}

func timeParamImplBasePayload() map[string]any {
	base := childlessParamImplBasePayload()
	base["timeControlMode"] = "input"
	base["timeDisplayFormat"] = "twenty_four_hour"
	base["timeDisplayTransparent"] = false
	base["timeDisplayScale"] = 1.0
	base["timeDisplayFont"] = "monospace"
	return base
}

func buttonParamImplBasePayload() map[string]any {
	base := paramImplBasePayload()
	base["label"] = "Trigger"
	base["actionMode"] = "WEBSOCKET_LISTENER"
	base["requestMethod"] = "POST"
	base["requestUrl"] = ""
	base["requestHeaderKey"] = ""
	base["requestHeaderValue"] = ""
	base["requestBody"] = ""
	return base
}

func sliderParamImplBasePayload() map[string]any {
	return rangedParamImplBasePayload(0, 100, 1)
}

func rotaryParamImplBasePayload() map[string]any {
	return rangedParamImplBasePayload(0, 1, 0.1)
}

func rangedParamImplBasePayload(minimum float64, maximum float64, step float64) map[string]any {
	base := childlessParamImplBasePayload()
	base["min"] = minimum
	base["max"] = maximum
	base["step"] = step
	base["value"] = formatProjectNumber(minimum)
	return base
}

func switchParamImplBasePayload() map[string]any {
	base := childlessParamImplBasePayload()
	base["value"] = "false"
	return base
}

func colorPickerParamImplBasePayload() map[string]any {
	base := childlessParamImplBasePayload()
	base["colorChoices"] = []any{}
	base["value"] = "#ff0000"
	return base
}

func dropdownParamImplBasePayload() map[string]any {
	base := childlessParamImplBasePayload()
	base["choices"] = []any{}
	return base
}

func passwordParamImplBasePayload() map[string]any {
	base := childlessParamImplBasePayload()
	base["hasSecret"] = false
	return base
}

func dropzoneParamImplBasePayload() map[string]any {
	base := childlessParamImplBasePayload()
	base["mode"] = "STATEFUL"
	base["placeholder"] = "Drop a file here"
	return base
}

func nestedParamImplBasePayload() map[string]any {
	base := paramImplBasePayload()
	base["children"] = []any{}
	return base
}

type changedParamValueMigration struct {
	sectionID     string
	paramInfoID   string
	oldImpl       CodeObjectImpl
	newImpl       CodeObjectImpl
	oldType       string
	newType       string
	oldValue      string
	oldHasValue   bool
	oldIsPassword bool
	newIsPassword bool
	newPayload    map[string]any
}

func (p *Project) migrateChangedParamValue(
	sectionID string,
	paramInfoID string,
	oldImpl CodeObjectImpl,
	oldPayload map[string]any,
	oldType string,
) error {
	migration, err := p.resolveChangedParamValueMigration(sectionID, paramInfoID, oldImpl, oldPayload, oldType)
	if err != nil {
		return err
	}
	if err := p.requireChangedParamPasswordStore(migration); err != nil {
		return err
	}
	if err := p.migrateChangedParamOldPassword(&migration); err != nil {
		return err
	}
	if migration.newIsPassword {
		return p.finalizeChangedPasswordParamValue(migration)
	}
	return p.migrateChangedChildlessParamValue(migration)
}

func (p *Project) resolveChangedParamValueMigration(
	sectionID string,
	paramInfoID string,
	oldImpl CodeObjectImpl,
	oldPayload map[string]any,
	oldType string,
) (changedParamValueMigration, error) {
	newPayload, _, _, resolvedNewImpl, err := p.ResolveSectionCodeObject(sectionID, paramInfoID)
	if err != nil {
		return changedParamValueMigration{}, err
	}
	oldValue, oldHasValue := payloadRawStringFieldWithPresence(oldPayload, "value")
	newType := effectiveCodeObjType(newPayload, resolvedNewImpl)
	return changedParamValueMigration{
		sectionID:     sectionID,
		paramInfoID:   paramInfoID,
		oldImpl:       oldImpl,
		newImpl:       resolvedNewImpl,
		oldType:       oldType,
		newType:       newType,
		oldValue:      oldValue,
		oldHasValue:   oldHasValue,
		oldIsPassword: oldType == "PasswordParam",
		newIsPassword: newType == "PasswordParam",
		newPayload:    newPayload,
	}, nil
}

func (p *Project) requireChangedParamPasswordStore(migration changedParamValueMigration) error {
	if (migration.oldIsPassword || migration.newIsPassword) && p.passwordSecrets == nil {
		return ErrPasswordParamMutationUnsupported
	}
	return nil
}

func (p *Project) migrateChangedParamOldPassword(migration *changedParamValueMigration) error {
	if !migration.oldIsPassword {
		return nil
	}

	oldSecret, err := p.passwordSecrets.Get(migration.oldImpl.ID)
	if err != nil {
		return err
	}
	if err := p.transferChangedParamPasswordSecret(*migration, oldSecret); err != nil {
		return err
	}

	migration.oldValue = ""
	migration.oldHasValue = true
	if migration.newImpl.ID == migration.oldImpl.ID {
		return nil
	}
	return p.setCodeObjectImplBaseField(migration.oldImpl.ID, "hasSecret", false)
}

func (p *Project) transferChangedParamPasswordSecret(migration changedParamValueMigration, oldSecret string) error {
	if !migration.newIsPassword {
		return p.passwordSecrets.Set(migration.oldImpl.ID, "")
	}
	if migration.newImpl.ID == migration.oldImpl.ID {
		return nil
	}
	if oldSecret != "" {
		if err := p.passwordSecrets.Set(migration.newImpl.ID, oldSecret); err != nil {
			return err
		}
	}
	return p.passwordSecrets.Set(migration.oldImpl.ID, "")
}

func (p *Project) finalizeChangedPasswordParamValue(migration changedParamValueMigration) error {
	if !migration.oldIsPassword && migration.oldHasValue && migration.oldValue != "" {
		if err := p.passwordSecrets.Set(migration.newImpl.ID, migration.oldValue); err != nil {
			return err
		}
	}

	hasSecret, err := p.passwordSecrets.Get(migration.newImpl.ID)
	if err != nil {
		return err
	}
	if err := p.setSectionCodeObjectField(migration.sectionID, migration.paramInfoID, "hasSecret", hasSecret != ""); err != nil {
		return err
	}
	if !isChildlessParamCodeObjectType(migration.newType) {
		return nil
	}
	return p.setSectionCodeObjectField(migration.sectionID, migration.paramInfoID, "value", "")
}

func (p *Project) migrateChangedChildlessParamValue(migration changedParamValueMigration) error {
	if !migration.oldHasValue || !isChildlessParamCodeObjectType(migration.oldType) || !isChildlessParamCodeObjectType(migration.newType) {
		return nil
	}
	convertedValue, err := convertCodeObjectValueForType(migration.newPayload, migration.oldValue)
	if err != nil {
		return err
	}
	return p.setSectionCodeObjectField(migration.sectionID, migration.paramInfoID, "value", convertedValue)
}

func isChildlessParamCodeObjectType(codeObjType string) bool {
	_, ok := childlessParamCodeObjectTypes[codeObjType]
	return ok
}

type paramImplValueConverter func(payload map[string]any, value string) (string, error)

var paramImplValueConverters = map[string]paramImplValueConverter{
	codeParamType:      passThroughParamImplValue,
	"TextParam":        passThroughParamImplValue,
	"DateParam":        passThroughParamImplValue,
	"TimeParam":        passThroughParamImplValue,
	"DropdownParam":    passThroughParamImplValue,
	"PasswordParam":    passThroughParamImplValue,
	"TextAreaParam":    passThroughParamImplValue,
	"DropzoneParam":    convertDropzoneParamImplValue,
	"SliderParam":      convertRangedParamImplValue,
	"RotaryParam":      convertRangedParamImplValue,
	"SwitchParam":      convertSwitchParamImplValue,
	"ColorPickerParam": convertColorPickerParamImplValue,
}

func convertCodeObjectValueForType(payload map[string]any, value string) (string, error) {
	converter, ok := paramImplValueConverters[strings.TrimSpace(payloadStringField(payload, "type"))]
	if !ok {
		return value, nil
	}
	return converter(payload, value)
}

func passThroughParamImplValue(_ map[string]any, value string) (string, error) {
	return value, nil
}

func convertDropzoneParamImplValue(payload map[string]any, value string) (string, error) {
	if stringFieldOrDefault(payload, "mode", "STATEFUL") == "STATELESS" {
		return "", nil
	}
	return normalizeDropzoneValue(value, optionalPositiveIntField(payload, "maxAttachments")), nil
}

func convertRangedParamImplValue(payload map[string]any, value string) (string, error) {
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
}

func convertSwitchParamImplValue(_ map[string]any, value string) (string, error) {
	if value == "0" {
		return "false", nil
	}
	return "true", nil
}

func convertColorPickerParamImplValue(payload map[string]any, value string) (string, error) {
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
}

func effectiveCodeObjType(payload map[string]any, impl CodeObjectImpl) string {
	codeObjType := payloadStringField(payload, "type")
	if codeObjType != "" {
		return codeObjType
	}
	return strings.TrimSpace(impl.Type)
}

func codeObjImplPayloadObject(impl CodeObjectImpl) map[string]any {
	payload, err := normalizedCodeObjImplPayloadObject(impl)
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
	rawAttachmentsValue, ok := payload["attachments"]
	if !ok {
		return ""
	}
	rawAttachments, ok := rawAttachmentsValue.([]any)
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
