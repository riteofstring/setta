package projectstate

func (p Project) EffectiveSectionPayload(sectionID string, variantID string) (map[string]any, error) {
	return effectiveSectionPayload(p, sectionID, variantID)
}

func (p Project) EffectiveCodeObjectPayload(
	codeObjVariantMap map[string]string,
	codeObjID string,
) (map[string]any, CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	return effectiveCodeObjectPayload(p, codeObjVariantMap, codeObjID)
}

func (p *Project) SetSectionFieldForVariant(
	sectionID string,
	variantID string,
	fieldName string,
	fieldValue any,
) error {
	section, variant, impl, err := p.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return err
	}

	switch {
	case !containsString(section.UnsharedKeys, fieldName):
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
