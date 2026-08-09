package projectstate

import (
	"fmt"
	"strings"
)

func (p Project) ResolveSectionCodeObject(
	sectionID string,
	codeObjID string,
) (map[string]any, CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	return p.ResolveSectionCodeObjectForVariant(sectionID, "", codeObjID)
}

func (p Project) ResolveSectionCodeObjectForVariant(
	sectionID string,
	sectionVariantID string,
	codeObjID string,
) (map[string]any, CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	trimmedSectionVariantID := strings.TrimSpace(sectionVariantID)
	if trimmedSectionVariantID == "" {
		section, variant, _, err := p.ResolveSection(strings.TrimSpace(sectionID))
		if err != nil {
			return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
		}
		sectionPayload, err := effectiveSectionPayload(p, section.ID, variant.ID)
		if err != nil {
			return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
		}
		codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
		return effectiveCodeObjectPayload(p, codeObjVariantMap, codeObjID)
	}

	section, variant, _, err := p.ResolveSectionWithVariant(
		strings.TrimSpace(sectionID),
		trimmedSectionVariantID,
	)
	if err != nil {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	sectionPayload, err := effectiveSectionPayload(p, section.ID, variant.ID)
	if err != nil {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	return effectiveCodeObjectPayload(p, codeObjVariantMap, codeObjID)
}

func (p Project) resolveSectionCodeObjectValueMutationContextForVariant(
	sectionID string,
	sectionVariantID string,
	codeObjID string,
) (map[string]any, CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	payload, codeObj, variant, impl, err := p.ResolveSectionCodeObjectForVariant(
		sectionID,
		sectionVariantID,
		codeObjID,
	)
	if err != nil {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	if _, ok := payload["value"]; !ok {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, fmt.Errorf("%w: %q (%s)", ErrCodeObjectValueMutationUnsupported, codeObjID, impl.Type)
	}
	return payload, codeObj, variant, impl, nil
}

func (p *Project) SetSectionCodeObjectValueForVariant(
	sectionID string,
	sectionVariantID string,
	codeObjID string,
	value string,
) error {
	if p == nil {
		return ErrProjectNotFound
	}
	payload, _, _, impl, err := p.resolveSectionCodeObjectValueMutationContextForVariant(
		sectionID,
		sectionVariantID,
		codeObjID,
	)
	if err != nil {
		return err
	}
	switch effectiveCodeObjType(payload, impl) {
	case "PasswordParam":
		if p.passwordSecrets == nil {
			return ErrPasswordParamMutationUnsupported
		}
		if err := p.passwordSecrets.Set(impl.ID, value); err != nil {
			return err
		}
		if err := p.setSectionCodeObjectFieldForVariant(
			sectionID,
			sectionVariantID,
			codeObjID,
			"hasSecret",
			value != "",
		); err != nil {
			return err
		}
		value = ""
	case "DropzoneParam":
		if stringFieldOrDefault(payload, "mode", "STATEFUL") == "STATELESS" {
			value = ""
		} else {
			value = normalizeDropzoneValue(value, optionalPositiveIntField(payload, "maxAttachments"))
		}
	}
	return p.setSectionCodeObjectFieldForVariant(
		sectionID,
		sectionVariantID,
		codeObjID,
		"value",
		value,
	)
}

func (p Project) resolveSectionCodeObjectValueMutationContext(
	sectionID string,
	codeObjID string,
) (map[string]any, CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	return p.resolveSectionCodeObjectValueMutationContextForVariant(
		sectionID,
		"",
		codeObjID,
	)
}

func (p *Project) SetSectionCodeObjectValue(sectionID string, codeObjID string, value string) error {
	return p.SetSectionCodeObjectValueForVariant(sectionID, "", codeObjID, value)
}
