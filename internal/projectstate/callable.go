package projectstate

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
)

const (
	codeCallableType = "CodeCallable"
	codeParamType    = "CodeParam"
)

type SignatureHelpStatus string

const (
	SignatureHelpStatusMatched SignatureHelpStatus = "matched"
	SignatureHelpStatusNoMatch SignatureHelpStatus = "no_match"
	SignatureHelpStatusSkipped SignatureHelpStatus = "skipped"
)

type CallableParamProposal struct {
	Name           string
	DefaultValue   string
	Description    string
	TypeAnnotation string
	PassingStyle   string
}

type CallableSignatureResult struct {
	Documentation string
	Params        []CallableParamProposal
	Status        SignatureHelpStatus
}

type CallableSignatureResolver interface {
	ResolveCallableSignature(
		ctx context.Context,
		project Project,
		sectionID string,
		callableName string,
	) (CallableSignatureResult, bool, error)
}

type SetCallableChildCodeObj struct {
	CodeObjID string `json:"codeObjId"`
	Name      string `json:"name"`
}

type SetCallableResponse struct {
	CallableID    *string                   `json:"callableId,omitempty"`
	ChildCodeObjs []SetCallableChildCodeObj `json:"childCodeObjs"`
	LSPStatus     SignatureHelpStatus       `json:"lspStatus"`
}

func (d *Document) SetCallable(
	ctx context.Context,
	projectID string,
	sectionID string,
	callableName string,
	refetchParams bool,
	resolver CallableSignatureResolver,
) (SetCallableResponse, error) {
	if d == nil {
		return SetCallableResponse{}, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return SetCallableResponse{}, err
	}
	response, err := project.SetCallable(ctx, sectionID, callableName, refetchParams, resolver)
	if err != nil {
		return SetCallableResponse{}, err
	}
	d.Projects[project.ID] = project
	return response, nil
}

func (d *Document) SetCallableName(projectID string, sectionID string, callableName string) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetCallableName(sectionID, callableName); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetCallable(
	ctx context.Context,
	projectID string,
	sectionID string,
	callableName string,
	refetchParams bool,
	resolver CallableSignatureResolver,
) (Snapshot, SetCallableResponse, error) {
	if r == nil {
		return Snapshot{}, SetCallableResponse{}, ErrRuntimeClosed
	}

	var response SetCallableResponse
	snapshot, err := r.MutateAndSave(ctx, func(document Document) (Document, error) {
		var mutationErr error
		response, mutationErr = document.SetCallable(ctx, projectID, sectionID, callableName, refetchParams, resolver)
		if mutationErr != nil {
			return document, mutationErr
		}
		return document, nil
	})
	if err != nil {
		return Snapshot{}, SetCallableResponse{}, err
	}
	return snapshot, response, nil
}

func (r *Runtime) SetCallableName(ctx context.Context, projectID string, sectionID string, callableName string) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetCallableName(projectID, sectionID, callableName); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) SetCallable(
	ctx context.Context,
	sectionID string,
	callableName string,
	refetchParams bool,
	resolver CallableSignatureResolver,
) (SetCallableResponse, error) {
	if p == nil {
		return SetCallableResponse{}, ErrProjectNotFound
	}
	if ctx == nil {
		ctx = context.Background()
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	trimmedCallableName := strings.TrimSpace(callableName)
	_, _, _, sectionPayload, err := p.resolveCallableSectionContext(trimmedSectionID)
	if err != nil {
		return SetCallableResponse{}, err
	}

	currentCallableID := payloadStringField(sectionPayload, "callable")
	currentCallableName := p.callableNameByID(currentCallableID)
	if !refetchParams && currentCallableName != "" && currentCallableName == trimmedCallableName {
		return p.buildSetCallableResponse(trimmedSectionID, currentCallableID, SignatureHelpStatusSkipped)
	}

	if trimmedCallableName == "" {
		if err := p.setCurrentSectionField(trimmedSectionID, "callable", nil); err != nil {
			return SetCallableResponse{}, err
		}
		if err := p.syncWatchCodeRegistrySectionMembership(trimmedSectionID); err != nil {
			return SetCallableResponse{}, err
		}
		return p.buildSetCallableResponse(trimmedSectionID, "", SignatureHelpStatusSkipped)
	}

	prevSelectedID := p.findCallableIDByName(sectionPayload, trimmedCallableName)
	if prevSelectedID != "" && !refetchParams {
		if err := p.setCurrentSectionField(trimmedSectionID, "callable", prevSelectedID); err != nil {
			return SetCallableResponse{}, err
		}
		if err := p.syncWatchCodeRegistrySectionMembership(trimmedSectionID); err != nil {
			return SetCallableResponse{}, err
		}
		return p.buildSetCallableResponse(trimmedSectionID, prevSelectedID, SignatureHelpStatusSkipped)
	}

	signatureResult, ok, err := resolveCallableSignature(ctx, resolver, p.Clone(), trimmedSectionID, trimmedCallableName)
	if err != nil {
		return SetCallableResponse{}, err
	}
	if !ok {
		return p.buildSetCallableResponse(trimmedSectionID, currentCallableID, SignatureHelpStatusSkipped)
	}

	callableID := prevSelectedID
	if callableID == "" {
		callableCore, callableVariant, callableImpl, err := newCallableCodeObject(trimmedCallableName, signatureResult.Documentation)
		if err != nil {
			return SetCallableResponse{}, err
		}
		callableID = callableCore.ID
		p.CodeObjs[callableCore.ID] = callableCore
		p.CodeObjVariants[callableVariant.ID] = callableVariant
		p.CodeObjImpls[callableImpl.ID] = callableImpl
		if err := p.setSectionCodeObjectVariant(trimmedSectionID, callableCore.ID, callableVariant.ID); err != nil {
			return SetCallableResponse{}, err
		}
	} else if signatureResult.Documentation != "" {
		if err := p.setCurrentCodeObjectField(trimmedSectionID, callableID, "description", signatureResult.Documentation); err != nil {
			return SetCallableResponse{}, err
		}
	}

	if signatureResult.Status == SignatureHelpStatusMatched || prevSelectedID == "" {
		if err := p.applyCallableParamProposals(trimmedSectionID, callableID, signatureResult.Params); err != nil {
			return SetCallableResponse{}, err
		}
	}

	if err := p.setCurrentSectionField(trimmedSectionID, "callable", callableID); err != nil {
		return SetCallableResponse{}, err
	}
	if err := p.syncWatchCodeRegistrySectionMembership(trimmedSectionID); err != nil {
		return SetCallableResponse{}, err
	}
	return p.buildSetCallableResponse(trimmedSectionID, callableID, signatureResult.Status)
}

func (p *Project) SetCallableName(sectionID string, callableName string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	trimmedCallableName := strings.TrimSpace(callableName)
	if trimmedCallableName == "" {
		return ErrCodeObjNameRequired
	}

	_, _, _, sectionPayload, err := p.resolveCallableSectionContext(trimmedSectionID)
	if err != nil {
		return err
	}
	callableID := payloadStringField(sectionPayload, "callable")
	if callableID == "" {
		return fmt.Errorf("%w: section=%q", ErrCodeObjNotFound, trimmedSectionID)
	}

	callableCodeObj, ok := p.CodeObjs[callableID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjNotFound, callableID)
	}
	callableCodeObj.Name = trimmedCallableName
	p.CodeObjs[callableID] = callableCodeObj
	return nil
}

func resolveCallableSignature(
	ctx context.Context,
	resolver CallableSignatureResolver,
	project Project,
	sectionID string,
	callableName string,
) (CallableSignatureResult, bool, error) {
	if strings.TrimSpace(callableName) == "" {
		return CallableSignatureResult{
			Status: SignatureHelpStatusSkipped,
		}, true, nil
	}
	if resolver == nil {
		return CallableSignatureResult{}, false, nil
	}
	return resolver.ResolveCallableSignature(ctx, project, sectionID, callableName)
}

func (p Project) buildSetCallableResponse(
	sectionID string,
	callableID string,
	status SignatureHelpStatus,
) (SetCallableResponse, error) {
	childCodeObjs, err := p.collectSetCallableChildCodeObjs(sectionID, callableID)
	if err != nil {
		return SetCallableResponse{}, err
	}
	return SetCallableResponse{
		CallableID:    stringPointerOrNil(strings.TrimSpace(callableID)),
		ChildCodeObjs: childCodeObjs,
		LSPStatus:     status,
	}, nil
}

func (p Project) collectSetCallableChildCodeObjs(sectionID string, callableID string) ([]SetCallableChildCodeObj, error) {
	trimmedCallableID := strings.TrimSpace(callableID)
	if trimmedCallableID == "" {
		return []SetCallableChildCodeObj{}, nil
	}

	sectionPayload, err := p.currentCallableSectionPayload(sectionID)
	if err != nil {
		return nil, err
	}
	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	codeObjPayload, _, _, _, err := effectiveCodeObjectPayload(p, codeObjVariantMap, trimmedCallableID)
	if err != nil {
		return nil, err
	}

	childIDs := payloadStringArrayField(codeObjPayload, "children")
	output := make([]SetCallableChildCodeObj, 0, len(childIDs))
	for _, childID := range childIDs {
		codeObj, ok := p.CodeObjs[childID]
		if !ok {
			return nil, fmt.Errorf("%w: %q", ErrCodeObjNotFound, childID)
		}
		output = append(output, SetCallableChildCodeObj{
			CodeObjID: childID,
			Name:      codeObj.Name,
		})
	}
	return output, nil
}

func (p *Project) applyCallableParamProposals(sectionID string, callableID string, proposals []CallableParamProposal) error {
	callablePayload, _, _, _, err := p.resolveCurrentCodeObjectContext(sectionID, callableID)
	if err != nil {
		return err
	}

	existingParamIDs := payloadStringArrayField(callablePayload, "children")
	existingParamIDsByName := make(map[string]string, len(existingParamIDs))
	for _, paramID := range existingParamIDs {
		codeObj, ok := p.CodeObjs[paramID]
		if !ok {
			return fmt.Errorf("%w: %q", ErrCodeObjNotFound, paramID)
		}
		existingParamIDsByName[codeObj.Name] = codeObj.ID
	}

	nextChildIDs := make([]string, 0, len(proposals))
	for _, proposal := range proposals {
		paramName := strings.TrimSpace(proposal.Name)
		if paramName == "" || paramName == "/" || paramName == "*" || paramName == "..." {
			continue
		}

		existingParamID, ok := existingParamIDsByName[paramName]
		if ok {
			existingValue, err := p.currentCodeObjectValue(sectionID, existingParamID)
			if err != nil {
				return err
			}
			if err := p.updateExistingCallableParam(sectionID, existingParamID, proposal, existingValue); err != nil {
				return err
			}
			nextChildIDs = append(nextChildIDs, existingParamID)
			continue
		}

		paramCore, paramVariant, paramImpl, err := newCallableParamCodeObject(proposal)
		if err != nil {
			return err
		}
		p.CodeObjs[paramCore.ID] = paramCore
		p.CodeObjVariants[paramVariant.ID] = paramVariant
		p.CodeObjImpls[paramImpl.ID] = paramImpl
		if err := p.setSectionCodeObjectVariant(sectionID, paramCore.ID, paramVariant.ID); err != nil {
			return err
		}
		nextChildIDs = append(nextChildIDs, paramCore.ID)
	}

	return p.setCurrentCodeObjectField(sectionID, callableID, "children", nextChildIDs)
}

func (p *Project) updateExistingCallableParam(
	sectionID string,
	codeObjID string,
	proposal CallableParamProposal,
	value string,
) error {
	codeObj, ok := p.CodeObjs[codeObjID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
	}

	for _, variantID := range codeObj.VariantIDs {
		variant, ok := p.CodeObjVariants[variantID]
		if !ok {
			return fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, variantID)
		}
		impl, ok := p.CodeObjImpls[variant.ImplID]
		if !ok {
			return fmt.Errorf("%w: %q", ErrCodeObjImplNotFound, variant.ImplID)
		}
		payload, err := rawObjectFromProjectPayload(codeObjImplPayloadUnchecked(impl))
		if err != nil {
			return err
		}
		payload["type"] = codeParamType
		payload["description"] = proposal.Description
		payload["passingStyle"] = defaultCallablePassingStyle(proposal.PassingStyle)
		payload["typeAnnotation"] = proposal.TypeAnnotation
		payload["defaultVal"] = proposal.DefaultValue
		payload["value"] = value
		raw, err := marshalProjectObject(payload)
		if err != nil {
			return err
		}
		impl.Type = codeParamType
		impl.Payload = raw
		p.CodeObjImpls[impl.ID] = impl
	}

	return nil
}

func (p Project) currentCodeObjectValue(sectionID string, codeObjID string) (string, error) {
	payload, _, _, _, err := p.ResolveSectionCodeObject(sectionID, codeObjID)
	if err != nil {
		return "", err
	}
	return payloadRawStringField(payload, "value"), nil
}

func (p Project) currentCallableSectionPayload(sectionID string) (map[string]any, error) {
	_, _, _, payload, err := p.resolveCallableSectionContext(sectionID)
	if err != nil {
		return nil, err
	}
	return payload, nil
}

func (p Project) resolveCallableSectionContext(sectionID string) (Section, SectionVariant, SectionImpl, map[string]any, error) {
	section, variant, impl, err := p.ResolveSection(strings.TrimSpace(sectionID))
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
	if sectionType != "Callable" {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, fmt.Errorf("%w: %q", ErrCallableSectionRequired, sectionID)
	}
	return section, variant, impl, payload, nil
}

func (p Project) resolveCurrentCodeObjectContext(
	sectionID string,
	codeObjID string,
) (map[string]any, CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	return p.ResolveSectionCodeObject(sectionID, codeObjID)
}

func (p *Project) setSectionCodeObjectVariant(sectionID string, codeObjID string, variantID string) error {
	section, variant, _, err := p.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return err
	}
	sectionPayload, err := effectiveSectionPayload(*p, section.ID, variant.ID)
	if err != nil {
		return err
	}
	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	codeObjVariantMap[strings.TrimSpace(codeObjID)] = strings.TrimSpace(variantID)
	return p.setCurrentSectionCodeObjVariantMap(sectionID, codeObjVariantMap)
}

func (p *Project) setCurrentSectionCodeObjVariantMap(sectionID string, codeObjVariantMap map[string]string) error {
	section, variant, impl, err := p.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return err
	}

	normalizedMap := make(map[string]string, len(codeObjVariantMap))
	for codeObjID, variantID := range codeObjVariantMap {
		trimmedCodeObjID := strings.TrimSpace(codeObjID)
		trimmedVariantID := strings.TrimSpace(variantID)
		if trimmedCodeObjID == "" || trimmedVariantID == "" {
			continue
		}
		normalizedMap[trimmedCodeObjID] = trimmedVariantID
	}

	if sectionFieldIsUnshared(section, "codeObjVariantMap") {
		if !sectionImplIsPreset(impl) {
			payload, err := rawObjectFromProjectPayload(sectionImplPayloadUnchecked(impl))
			if err != nil {
				return err
			}
			payload["codeObjVariantMap"] = cloneProjectValue(normalizedMap)
			rawPayload, err := marshalProjectObject(payload)
			if err != nil {
				return err
			}
			impl.Payload = rawPayload
			p.SectionImpls[impl.ID] = impl

			modifier, err := rawObjectFromProjectPayload(variant.Modifier)
			if err != nil {
				return err
			}
			if _, ok := modifier["codeObjVariantMap"]; ok {
				delete(modifier, "codeObjVariantMap")
				rawModifier, err := marshalProjectObject(modifier)
				if err != nil {
					return err
				}
				variant.Modifier = rawModifier
				p.SectionVariants[variant.ID] = variant
			}
		} else {
			modifier, err := rawObjectFromProjectPayload(variant.Modifier)
			if err != nil {
				return err
			}
			modifier["codeObjVariantMap"] = cloneProjectValue(normalizedMap)
			rawModifier, err := marshalProjectObject(modifier)
			if err != nil {
				return err
			}
			variant.Modifier = rawModifier
			p.SectionVariants[variant.ID] = variant
		}
	} else {
		payload, err := rawObjectFromProjectPayload(sectionImplPayloadUnchecked(impl))
		if err != nil {
			return err
		}
		payload["codeObjVariantMap"] = cloneProjectValue(normalizedMap)
		rawPayload, err := marshalProjectObject(payload)
		if err != nil {
			return err
		}
		impl.Payload = rawPayload
		p.SectionImpls[impl.ID] = impl
	}

	modifier, err := rawObjectFromProjectPayload(section.SharedModifier)
	if err != nil {
		return err
	}
	if sectionFieldIsUnshared(section, "codeObjVariantMap") {
		if _, ok := modifier["codeObjVariantMap"]; ok {
			delete(modifier, "codeObjVariantMap")
			rawModifier, err := marshalProjectObject(modifier)
			if err != nil {
				return err
			}
			section.SharedModifier = rawModifier
			p.Sections[section.ID] = section
		}
		return nil
	}

	if modifierMap, ok := modifier["codeObjVariantMap"]; ok {
		if existing, ok := modifierMap.(map[string]any); ok && len(existing) == 0 && len(normalizedMap) == 0 {
			return nil
		}
	}
	delete(modifier, "codeObjVariantMap")
	rawModifier, err := marshalProjectObject(modifier)
	if err != nil {
		return err
	}
	section.SharedModifier = rawModifier
	p.Sections[section.ID] = section
	return nil
}

func (p *Project) setCurrentSectionField(sectionID string, fieldName string, fieldValue any) error {
	section, variant, impl, err := p.ResolveSection(strings.TrimSpace(sectionID))
	if err != nil {
		return err
	}

	switch {
	case !sectionFieldIsUnshared(section, fieldName):
		modifier, err := rawObjectFromProjectPayload(section.SharedModifier)
		if err != nil {
			return err
		}
		modifier[fieldName] = cloneProjectValue(fieldValue)
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
		payload[fieldName] = cloneProjectValue(fieldValue)
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
		modifier[fieldName] = cloneProjectValue(fieldValue)
		raw, err := marshalProjectObject(modifier)
		if err != nil {
			return err
		}
		variant.Modifier = raw
		p.SectionVariants[variant.ID] = variant
	}

	return nil
}

func (p *Project) setCurrentCodeObjectField(sectionID string, codeObjID string, fieldName string, fieldValue any) error {
	return p.setSectionCodeObjectField(sectionID, codeObjID, fieldName, fieldValue)
}

func (p *Project) setSectionCodeObjectField(sectionID string, codeObjID string, fieldName string, fieldValue any) error {
	_, codeObj, variant, impl, err := p.ResolveSectionCodeObject(sectionID, codeObjID)
	if err != nil {
		return err
	}

	switch {
	case !codeObjectFieldIsUnshared(codeObj, fieldName):
		modifier, err := rawObjectFromProjectPayload(codeObj.SharedModifier)
		if err != nil {
			return err
		}
		modifier[fieldName] = cloneProjectValue(fieldValue)
		raw, err := marshalProjectObject(modifier)
		if err != nil {
			return err
		}
		codeObj.SharedModifier = raw
		p.CodeObjs[codeObj.ID] = codeObj
	case !codeObjImplIsPreset(impl):
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
	default:
		modifier, err := rawObjectFromProjectPayload(variant.Modifier)
		if err != nil {
			return err
		}
		modifier[fieldName] = cloneProjectValue(fieldValue)
		raw, err := marshalProjectObject(modifier)
		if err != nil {
			return err
		}
		variant.Modifier = raw
		p.CodeObjVariants[variant.ID] = variant
	}

	return nil
}

func (p Project) callableNameByID(codeObjID string) string {
	trimmedCodeObjID := strings.TrimSpace(codeObjID)
	if trimmedCodeObjID == "" {
		return ""
	}
	codeObj, ok := p.CodeObjs[trimmedCodeObjID]
	if !ok {
		return ""
	}
	return codeObj.Name
}

func (p Project) findCallableIDByName(sectionPayload map[string]any, callableName string) string {
	targetName := strings.TrimSpace(callableName)
	if targetName == "" {
		return ""
	}
	for codeObjID := range payloadStringMapField(sectionPayload, "codeObjVariantMap") {
		codeObj, ok := p.CodeObjs[codeObjID]
		if ok && codeObj.Name == targetName {
			return codeObj.ID
		}
	}
	return ""
}

func effectiveCodeObjectPayload(
	project Project,
	codeObjVariantMap map[string]string,
	codeObjID string,
) (map[string]any, CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	codeObj, ok := project.CodeObjs[strings.TrimSpace(codeObjID)]
	if !ok {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
	}
	variantID, ok := codeObjVariantMap[codeObj.ID]
	if !ok {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, fmt.Errorf("%w: codeObj=%q", ErrCodeObjVariantNotFound, codeObj.ID)
	}
	variant, ok := project.CodeObjVariants[variantID]
	if !ok {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, variantID)
	}
	impl, ok := project.CodeObjImpls[variant.ImplID]
	if !ok {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, fmt.Errorf("%w: %q", ErrCodeObjImplNotFound, variant.ImplID)
	}
	base, err := rawObjectFromProjectPayload(codeObjImplPayloadUnchecked(impl))
	if err != nil {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	sharedModifier, err := rawObjectFromProjectPayload(codeObj.SharedModifier)
	if err != nil {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	modifier, err := rawObjectFromProjectPayload(variant.Modifier)
	if err != nil {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	return mergeProjectObjects(mergeProjectObjects(base, sharedModifier), modifier), codeObj, variant, impl, nil
}

func codeObjImplPayloadUnchecked(impl CodeObjectImpl) RawJSON {
	if len(impl.Payload) > 0 {
		return cloneRawJSON(impl.Payload)
	}
	return mustMarshalProjectObject(map[string]any{
		"id":   impl.ID,
		"type": impl.Type,
	})
}

func payloadStringMapField(object map[string]any, key string) map[string]string {
	value, ok := object[key]
	if !ok {
		return map[string]string{}
	}
	entries, ok := value.(map[string]any)
	if !ok {
		return map[string]string{}
	}
	output := make(map[string]string, len(entries))
	for entryKey, entryValue := range entries {
		stringValue, ok := entryValue.(string)
		if !ok {
			continue
		}
		trimmedValue := strings.TrimSpace(stringValue)
		if trimmedValue == "" {
			continue
		}
		output[entryKey] = trimmedValue
	}
	return output
}

func codeObjImplIsPreset(impl CodeObjectImpl) bool {
	payload, err := rawObjectFromProjectPayload(codeObjImplPayloadUnchecked(impl))
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

func newCallableCodeObject(callableName string, description string) (CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	callableID, err := newCallableStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	variantID, err := newCallableStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	implID, err := newCallableStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	payload := map[string]any{
		"id":          implID,
		"type":        codeCallableType,
		"description": strings.TrimSpace(description),
		"children":    []string{},
	}
	raw, err := marshalProjectObject(payload)
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	return CodeObject{
			ID:               callableID,
			Name:             strings.TrimSpace(callableName),
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		},
		CodeObjectVariant{
			ID:     variantID,
			ImplID: implID,
		},
		CodeObjectImpl{
			ID:      implID,
			Type:    codeCallableType,
			Payload: raw,
		},
		nil
}

func newCallableParamCodeObject(proposal CallableParamProposal) (CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	paramID, err := newCallableStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	variantID, err := newCallableStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	implID, err := newCallableStateID()
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	payload := map[string]any{
		"id":             implID,
		"type":           codeParamType,
		"description":    proposal.Description,
		"passingStyle":   defaultCallablePassingStyle(proposal.PassingStyle),
		"typeAnnotation": proposal.TypeAnnotation,
		"defaultVal":     proposal.DefaultValue,
		"value":          "",
	}
	raw, err := marshalProjectObject(payload)
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	return CodeObject{
			ID:               paramID,
			Name:             strings.TrimSpace(proposal.Name),
			VariantIDs:       []string{variantID},
			DefaultVariantID: variantID,
		},
		CodeObjectVariant{
			ID:     variantID,
			ImplID: implID,
		},
		CodeObjectImpl{
			ID:      implID,
			Type:    codeParamType,
			Payload: raw,
		},
		nil
}

func defaultCallablePassingStyle(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "DEFAULT"
	}
	return trimmed
}

func newCallableStateID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func stringPointerOrNil(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	output := trimmed
	return &output
}
