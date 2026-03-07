package projectstate

import (
	"fmt"
	"strings"
)

func (p Project) ResolveSectionCodeObject(
	sectionID string,
	codeObjID string,
) (map[string]any, CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
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

func (p Project) resolveSectionCodeObjectValueMutationContext(
	sectionID string,
	codeObjID string,
) (map[string]any, CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	payload, codeObj, variant, impl, err := p.ResolveSectionCodeObject(sectionID, codeObjID)
	if err != nil {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	switch impl.Type {
	case "PasswordParam":
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, ErrPasswordParamMutationUnsupported
	case "DropzoneParam":
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, ErrDropzoneParamMutationUnsupported
	}
	if _, ok := payload["value"]; !ok {
		return nil, CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, fmt.Errorf("%w: %q (%s)", ErrCodeObjectValueMutationUnsupported, codeObjID, impl.Type)
	}
	return payload, codeObj, variant, impl, nil
}

func (p *Project) SetSectionCodeObjectValue(sectionID string, codeObjID string, value string) error {
	if p == nil {
		return ErrProjectNotFound
	}
	if _, _, _, _, err := p.resolveSectionCodeObjectValueMutationContext(sectionID, codeObjID); err != nil {
		return err
	}
	return p.setSectionCodeObjectField(sectionID, codeObjID, "value", value)
}
