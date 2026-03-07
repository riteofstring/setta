package projectstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrPythonCodegenExportPayloadInvalid   = errors.New("project python codegen export payload is invalid")
	ErrPythonCodegenExportObjectRequired   = errors.New("project python codegen export payload must be a JSON object")
	ErrPythonCodegenExportSectionTypeEmpty = errors.New("project python codegen export section type is required")
	ErrPythonCodegenExportCodeObjTypeEmpty = errors.New("project python codegen export code object type is required")
)

type PythonCodegenExport struct {
	ProjectID             string
	ProjectName           string
	ActiveViewModeID      string
	EntryCodeBlockID      string
	ActiveIDs             []string
	ShowParamDisplayNames bool
	PreviewImgColor       string
	TopLevelSectionIDs    []string
	PythonTarget          PythonCodegenTarget
	SectionPolicy         PythonSectionCodegenPolicy
	CodeObjValuePolicy    PythonCodeObjValuePolicy
	project               Project
}

type PythonCodegenSection struct {
	ID              string
	Name            string
	DisplayName     string
	ParentSectionID string
	ImplID          string
	VariantID       string
	VariantName     string
	Type            string
	Payload         map[string]any
	IsTopLevel      bool
	Policy          ResolvedPythonSectionCodegenPolicy
	project         Project
	codeObjPolicy   PythonCodeObjValuePolicy
}

type PythonCodegenCodeObject struct {
	ID          string
	Name        string
	DisplayName string
	ImplID      string
	VariantID   string
	VariantName string
	Type        string
	Payload     map[string]any
	ValuePolicy ResolvedPythonCodeObjValuePolicy
}

func (p Project) PythonCodegenExport() (PythonCodegenExport, bool, error) {
	target, ok, err := p.PythonCodegenTarget()
	if err != nil {
		return PythonCodegenExport{}, false, err
	}
	if !ok {
		return PythonCodegenExport{}, false, nil
	}
	sectionPolicy, err := target.DecodedSectionPolicy()
	if err != nil {
		return PythonCodegenExport{}, false, err
	}
	codeObjValuePolicy, err := target.DecodedCodeObjValuePolicy()
	if err != nil {
		return PythonCodegenExport{}, false, err
	}

	projectSnapshot := p.Clone()
	return PythonCodegenExport{
		ProjectID:             projectSnapshot.ID,
		ProjectName:           projectSnapshot.Name,
		ActiveViewModeID:      projectSnapshot.ActiveViewModeID,
		EntryCodeBlockID:      projectSnapshot.EntryCodeBlockID,
		ActiveIDs:             append([]string(nil), projectSnapshot.ActiveIDs...),
		ShowParamDisplayNames: projectSnapshot.ShowParamDisplayNames,
		PreviewImgColor:       projectSnapshot.PreviewImgColor,
		TopLevelSectionIDs:    append([]string(nil), projectSnapshot.TopLevelSectionIDs...),
		PythonTarget:          target,
		SectionPolicy:         sectionPolicy,
		CodeObjValuePolicy:    codeObjValuePolicy,
		project:               projectSnapshot,
	}, true, nil
}

func (e PythonCodegenExport) ResolveSection(sectionID string) (PythonCodegenSection, error) {
	section, variant, impl, err := e.project.ResolveSection(sectionID)
	if err != nil {
		return PythonCodegenSection{}, err
	}
	return e.resolveSection(section, variant, impl)
}

func (e PythonCodegenExport) ResolveSectionWithVariant(sectionID string, variantID string) (PythonCodegenSection, error) {
	section, variant, impl, err := e.project.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return PythonCodegenSection{}, err
	}
	return e.resolveSection(section, variant, impl)
}

func (e PythonCodegenExport) resolveSection(
	section Section,
	variant SectionVariant,
	impl SectionImpl,
) (PythonCodegenSection, error) {
	payload, err := effectivePythonCodegenSectionObject(e.project, section, variant, impl)
	if err != nil {
		return PythonCodegenSection{}, err
	}
	sectionType := strings.TrimSpace(stringFieldFromPythonCodegenObject(payload, "type"))
	if sectionType == "" {
		return PythonCodegenSection{}, fmt.Errorf("%w: section=%q", ErrPythonCodegenExportSectionTypeEmpty, section.ID)
	}
	controlCodeObjType := stringFieldFromPythonCodegenObject(payload, "controlCodeObjType")
	if sectionType == "MetaControl" && controlCodeObjType == "" {
		metaControlParamID := stringFieldFromPythonCodegenObject(payload, "metaControlParamId")
		if metaControlParamID != "" {
			codeObjVariantMap := stringMapFieldFromPythonCodegenObject(payload, "codeObjVariantMap")
			metaControlCodeObj, err := e.resolveCodeObjectWithVariantMap(codeObjVariantMap, metaControlParamID)
			if err != nil {
				return PythonCodegenSection{}, err
			}
			controlCodeObjType = metaControlCodeObj.Type
		}
	}
	resolvedPolicy, err := ResolvePythonSectionCodegenPolicy(
		e.SectionPolicy,
		section.ID,
		sectionType,
		controlCodeObjType,
	)
	if err != nil {
		return PythonCodegenSection{}, err
	}
	return PythonCodegenSection{
		ID:              section.ID,
		Name:            section.Name,
		DisplayName:     section.DisplayName,
		ParentSectionID: section.ParentSectionID,
		ImplID:          impl.ID,
		VariantID:       variant.ID,
		VariantName:     variant.Name,
		Type:            sectionType,
		Payload:         clonePythonCodegenObject(payload),
		IsTopLevel:      e.project.HasTopLevelSection(section.ID),
		Policy:          resolvedPolicy,
		project:         e.project.Clone(),
		codeObjPolicy:   e.CodeObjValuePolicy,
	}, nil
}

func (s PythonCodegenSection) ResolveCodeObject(codeObjID string) (PythonCodegenCodeObject, error) {
	codeObjVariantMap := s.CodeObjVariantMap()
	if len(codeObjVariantMap) == 0 {
		return PythonCodegenCodeObject{}, fmt.Errorf("%w: section=%q codeObjVariantMap", ErrCodeObjVariantNotFound, s.ID)
	}
	return s.resolveCodeObjectWithVariantMap(codeObjVariantMap, codeObjID)
}

func (e PythonCodegenExport) resolveCodeObjectWithVariantMap(codeObjVariantMap map[string]string, codeObjID string) (PythonCodegenCodeObject, error) {
	payload, codeObj, variant, err := effectivePythonCodegenCodeObject(e.project, codeObjVariantMap, codeObjID)
	if err != nil {
		return PythonCodegenCodeObject{}, err
	}
	codeObjType := strings.TrimSpace(codeObjTypeForPythonCodegen(e.project, codeObj.ID, payload))
	if codeObjType == "" {
		return PythonCodegenCodeObject{}, fmt.Errorf("%w: codeObj=%q", ErrPythonCodegenExportCodeObjTypeEmpty, codeObj.ID)
	}
	valuePolicy, err := ResolvePythonCodeObjValuePolicy(e.CodeObjValuePolicy, codeObj.ID, codeObjType)
	if err != nil {
		return PythonCodegenCodeObject{}, err
	}
	return PythonCodegenCodeObject{
		ID:          codeObj.ID,
		Name:        codeObj.Name,
		DisplayName: codeObj.DisplayName,
		ImplID:      variant.ImplID,
		VariantID:   variant.ID,
		VariantName: variant.Name,
		Type:        codeObjType,
		Payload:     clonePythonCodegenObject(payload),
		ValuePolicy: valuePolicy,
	}, nil
}

func (s PythonCodegenSection) resolveCodeObjectWithVariantMap(codeObjVariantMap map[string]string, codeObjID string) (PythonCodegenCodeObject, error) {
	payload, codeObj, variant, err := effectivePythonCodegenCodeObject(s.project, codeObjVariantMap, codeObjID)
	if err != nil {
		return PythonCodegenCodeObject{}, err
	}
	codeObjType := strings.TrimSpace(codeObjTypeForPythonCodegen(s.project, codeObj.ID, payload))
	if codeObjType == "" {
		return PythonCodegenCodeObject{}, fmt.Errorf("%w: codeObj=%q", ErrPythonCodegenExportCodeObjTypeEmpty, codeObj.ID)
	}
	valuePolicy, err := ResolvePythonCodeObjValuePolicy(s.codeObjPolicy, codeObj.ID, codeObjType)
	if err != nil {
		return PythonCodegenCodeObject{}, err
	}
	return PythonCodegenCodeObject{
		ID:          codeObj.ID,
		Name:        codeObj.Name,
		DisplayName: codeObj.DisplayName,
		ImplID:      variant.ImplID,
		VariantID:   variant.ID,
		VariantName: variant.Name,
		Type:        codeObjType,
		Payload:     clonePythonCodegenObject(payload),
		ValuePolicy: valuePolicy,
	}, nil
}

func (s PythonCodegenSection) CodeObjVariantMap() map[string]string {
	return stringMapFieldFromPythonCodegenObject(s.Payload, "codeObjVariantMap")
}

func (s PythonCodegenSection) CallableID() string {
	return stringFieldFromPythonCodegenObject(s.Payload, "callable")
}

func (s PythonCodegenSection) TopLevelParamID() string {
	return stringFieldFromPythonCodegenObject(s.Payload, "topLevelParamId")
}

func (s PythonCodegenSection) StringField(key string) string {
	return stringFieldFromPythonCodegenObject(s.Payload, key)
}

func (s PythonCodegenSection) ArrayStringField(key string) []string {
	return arrayStringFieldFromPythonCodegenObject(s.Payload, key)
}

func (s PythonCodegenSection) ObjectField(key string) map[string]any {
	return objectFieldFromPythonCodegenObject(s.Payload, key)
}

func (c PythonCodegenCodeObject) Children() []string {
	return arrayStringFieldFromPythonCodegenObject(c.Payload, "children")
}

func (c PythonCodegenCodeObject) StringField(key string) string {
	return stringFieldFromPythonCodegenObject(c.Payload, key)
}

func (c PythonCodegenCodeObject) ObjectField(key string) map[string]any {
	return objectFieldFromPythonCodegenObject(c.Payload, key)
}

func effectivePythonCodegenSectionObject(
	project Project,
	section Section,
	variant SectionVariant,
	impl SectionImpl,
) (map[string]any, error) {
	base, err := rawObjectFromPythonCodegenPayload(sectionImplPayloadUncheckedForPythonCodegen(impl))
	if err != nil {
		return nil, err
	}
	sharedModifier, err := rawObjectFromPythonCodegenModifier(section.SharedModifier)
	if err != nil {
		return nil, err
	}
	modifier, err := rawObjectFromPythonCodegenModifier(variant.Modifier)
	if err != nil {
		return nil, err
	}
	return mergePythonCodegenObjects(mergePythonCodegenObjects(base, sharedModifier), modifier), nil
}

func effectivePythonCodegenCodeObject(
	project Project,
	codeObjVariantMap map[string]string,
	codeObjID string,
) (map[string]any, CodeObject, CodeObjectVariant, error) {
	codeObj, ok := project.CodeObjs[codeObjID]
	if !ok {
		return nil, CodeObject{}, CodeObjectVariant{}, fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
	}
	variantID, ok := codeObjVariantMap[codeObjID]
	if !ok {
		return nil, CodeObject{}, CodeObjectVariant{}, fmt.Errorf("%w: codeObj=%q", ErrCodeObjVariantNotFound, codeObjID)
	}
	if !containsString(codeObj.VariantIDs, variantID) {
		return nil, CodeObject{}, CodeObjectVariant{}, fmt.Errorf("%w: codeObj=%q variant=%q", ErrCodeObjVariantMembership, codeObjID, variantID)
	}
	variant, ok := project.CodeObjVariants[variantID]
	if !ok {
		return nil, CodeObject{}, CodeObjectVariant{}, fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, variantID)
	}
	impl, ok := project.CodeObjImpls[variant.ImplID]
	if !ok {
		return nil, CodeObject{}, CodeObjectVariant{}, fmt.Errorf("%w: %q", ErrCodeObjImplNotFound, variant.ImplID)
	}
	base, err := rawObjectFromPythonCodegenPayload(codeObjImplPayloadUncheckedForPythonCodegen(impl))
	if err != nil {
		return nil, CodeObject{}, CodeObjectVariant{}, err
	}
	sharedModifier, err := rawObjectFromPythonCodegenModifier(codeObj.SharedModifier)
	if err != nil {
		return nil, CodeObject{}, CodeObjectVariant{}, err
	}
	modifier, err := rawObjectFromPythonCodegenModifier(variant.Modifier)
	if err != nil {
		return nil, CodeObject{}, CodeObjectVariant{}, err
	}
	return mergePythonCodegenObjects(mergePythonCodegenObjects(base, sharedModifier), modifier), codeObj, variant, nil
}

func sectionImplPayloadUncheckedForPythonCodegen(impl SectionImpl) RawJSON {
	if len(impl.Payload) > 0 {
		return cloneRawJSON(impl.Payload)
	}
	payload := map[string]any{
		"id":   impl.ID,
		"type": fallbackSectionTypeForPythonCodegen(impl),
	}
	switch {
	case impl.IsCode():
		payload["codeLanguage"] = string(impl.Code.Language)
		if impl.Code.Binding != nil {
			payload["codeFileBinding"] = pythonCodegenBindingObject(impl.Code.Binding)
		}
		if impl.Code.AttachedTerminalSectionID != "" {
			payload["attachedTerminalSectionId"] = impl.Code.AttachedTerminalSectionID
		}
		payload["children"] = append([]string(nil), impl.Code.Children...)
	case impl.IsDraw():
		if impl.Draw.RenderedImagePath != "" {
			payload["renderedImagePath"] = impl.Draw.RenderedImagePath
		}
	}
	return mustMarshalPythonCodegenObject(payload)
}

func codeObjImplPayloadUncheckedForPythonCodegen(impl CodeObjectImpl) RawJSON {
	if len(impl.Payload) > 0 {
		return cloneRawJSON(impl.Payload)
	}
	return mustMarshalPythonCodegenObject(map[string]any{
		"id":   impl.ID,
		"type": impl.Type,
	})
}

func fallbackSectionTypeForPythonCodegen(impl SectionImpl) string {
	switch {
	case impl.IsCode():
		return "Code"
	case impl.IsTerminal():
		return "Terminal"
	case impl.IsDraw():
		return "Draw"
	case impl.IsGenerated():
		switch impl.Generated.Kind {
		case GeneratedSectionKindPythonCode:
			return "GenPythonCode"
		case GeneratedSectionKindPythonMetadata:
			return "GenPythonMetadata"
		case GeneratedSectionKindPlugin:
			return "Plugin"
		}
	}
	if impl.Kind == "" {
		return ""
	}
	return string(impl.Kind)
}

func codeObjTypeForPythonCodegen(project Project, codeObjID string, payload map[string]any) string {
	if objectType := stringFieldFromPythonCodegenObject(payload, "type"); objectType != "" {
		return objectType
	}
	codeObj, ok := project.CodeObjs[codeObjID]
	if !ok || len(codeObj.VariantIDs) == 0 {
		return ""
	}
	variant, ok := project.CodeObjVariants[codeObj.VariantIDs[0]]
	if !ok {
		return ""
	}
	impl, ok := project.CodeObjImpls[variant.ImplID]
	if !ok {
		return ""
	}
	return strings.TrimSpace(impl.Type)
}

func pythonCodegenBindingObject(binding *CodeFileBinding) map[string]any {
	return map[string]any{
		"canonical_path": binding.Path,
		"access_mode":    pythonCodegenBindingAccessMode(binding.AccessMode),
		"autoBinding":    false,
	}
}

func pythonCodegenBindingAccessMode(mode CodeFileAccessMode) string {
	if strings.TrimSpace(string(mode)) == "" {
		return string(CodeFileAccessModeReadWrite)
	}
	return string(mode)
}

func rawObjectFromPythonCodegenModifier(raw RawJSON) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	return rawObjectFromPythonCodegenPayload(raw)
}

func rawObjectFromPythonCodegenPayload(raw RawJSON) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}

	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrPythonCodegenExportPayloadInvalid, err)
	}
	object, ok := payload.(map[string]any)
	if !ok {
		return nil, ErrPythonCodegenExportObjectRequired
	}
	return object, nil
}

func mergePythonCodegenObjects(base map[string]any, modifier map[string]any) map[string]any {
	merged := clonePythonCodegenObject(base)
	for key, value := range modifier {
		baseObject, baseIsObject := merged[key].(map[string]any)
		modifierObject, modifierIsObject := value.(map[string]any)
		if baseIsObject && modifierIsObject {
			merged[key] = mergePythonCodegenObjects(baseObject, modifierObject)
			continue
		}
		merged[key] = clonePythonCodegenValue(value)
	}
	return merged
}

func clonePythonCodegenObject(source map[string]any) map[string]any {
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = clonePythonCodegenValue(value)
	}
	return cloned
}

func clonePythonCodegenValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return clonePythonCodegenObject(typed)
	case []any:
		cloned := make([]any, len(typed))
		for index, entry := range typed {
			cloned[index] = clonePythonCodegenValue(entry)
		}
		return cloned
	default:
		return typed
	}
}

func stringFieldFromPythonCodegenObject(object map[string]any, key string) string {
	value, ok := object[key]
	if !ok {
		return ""
	}
	typed, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(typed)
}

func arrayStringFieldFromPythonCodegenObject(object map[string]any, key string) []string {
	value, ok := object[key]
	if !ok {
		return nil
	}
	rawValues, ok := value.([]any)
	if !ok {
		return nil
	}
	values := make([]string, 0, len(rawValues))
	for _, rawValue := range rawValues {
		typed, ok := rawValue.(string)
		if !ok {
			continue
		}
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			continue
		}
		values = append(values, trimmed)
	}
	return values
}

func objectFieldFromPythonCodegenObject(object map[string]any, key string) map[string]any {
	value, ok := object[key]
	if !ok {
		return nil
	}
	typed, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	return clonePythonCodegenObject(typed)
}

func stringMapFieldFromPythonCodegenObject(object map[string]any, key string) map[string]string {
	value, ok := object[key]
	if !ok {
		return nil
	}
	typed, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	output := make(map[string]string, len(typed))
	for rawKey, rawValue := range typed {
		trimmedKey := strings.TrimSpace(rawKey)
		if trimmedKey == "" {
			continue
		}
		typedValue, ok := rawValue.(string)
		if !ok {
			continue
		}
		trimmedValue := strings.TrimSpace(typedValue)
		if trimmedValue == "" {
			continue
		}
		output[trimmedKey] = trimmedValue
	}
	return output
}

func mustMarshalPythonCodegenObject(value map[string]any) RawJSON {
	raw, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return raw
}
