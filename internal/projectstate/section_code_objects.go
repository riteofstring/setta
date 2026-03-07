package projectstate

import "strings"

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

func (p *Project) SetSectionCodeObjectValue(sectionID string, codeObjID string, value string) error {
	return p.setSectionCodeObjectField(sectionID, codeObjID, "value", value)
}
