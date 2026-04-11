package projectstate

import "strings"

type jsonSourcePersistenceInputs struct {
	topLevelParamID   string
	codeObjVariantMap map[string]string
}

func (d *Document) ClearJSONSourceValuesForPersistence() error {
	if d == nil {
		return ErrProjectNotFound
	}

	for projectID, project := range d.Projects {
		if err := project.ClearJSONSourceValuesForPersistence(); err != nil {
			return err
		}
		d.Projects[projectID] = project
	}
	return nil
}

func (p *Project) ClearJSONSourceValuesForPersistence() error {
	if p == nil {
		return ErrProjectNotFound
	}

	for sectionID, section := range p.Sections {
		if err := p.clearSectionJSONSourceValuesForPersistence(sectionID, section.VariantIDs); err != nil {
			return err
		}
	}

	return nil
}

func (p *Project) clearSectionJSONSourceValuesForPersistence(sectionID string, variantIDs []string) error {
	for _, sectionVariantID := range variantIDs {
		if err := p.clearSectionVariantJSONSourceValuesForPersistence(sectionID, sectionVariantID); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) clearSectionVariantJSONSourceValuesForPersistence(sectionID string, sectionVariantID string) error {
	sectionPayload, err := p.EffectiveSectionPayload(sectionID, sectionVariantID)
	if err != nil {
		return err
	}

	inputs, ok := jsonSourcePersistenceInputsForSectionPayload(sectionPayload)
	if !ok {
		return nil
	}
	return p.clearJSONSourceLeafValuesForPersistence(inputs)
}

func jsonSourcePersistenceInputsForSectionPayload(sectionPayload map[string]any) (jsonSourcePersistenceInputs, bool) {
	if !payloadBoolField(sectionPayload, "isJsonSource") {
		return jsonSourcePersistenceInputs{}, false
	}
	topLevelParamID := strings.TrimSpace(payloadStringField(sectionPayload, "topLevelParamId"))
	if topLevelParamID == "" {
		return jsonSourcePersistenceInputs{}, false
	}
	return jsonSourcePersistenceInputs{
		topLevelParamID:   topLevelParamID,
		codeObjVariantMap: payloadStringMapField(sectionPayload, "codeObjVariantMap"),
	}, true
}

func (p *Project) clearJSONSourceLeafValuesForPersistence(inputs jsonSourcePersistenceInputs) error {
	_, childrenByID, err := collectCodeObjectHierarchy(*p, inputs.codeObjVariantMap, inputs.topLevelParamID)
	if err != nil {
		return err
	}
	for codeObjID, childIDs := range childrenByID {
		if len(childIDs) != 0 {
			continue
		}
		if err := p.clearJSONSourceCodeObjectValueForPersistence(codeObjID, inputs.codeObjVariantMap[codeObjID]); err != nil {
			return err
		}
	}
	return nil
}

func (p *Project) clearJSONSourceCodeObjectValueForPersistence(codeObjID string, rawVariantID string) error {
	codeObjVariantID := strings.TrimSpace(rawVariantID)
	if codeObjVariantID == "" {
		return nil
	}
	codeObjPayload, err := effectiveCodeObjectPayloadForVariant(*p, codeObjID, codeObjVariantID)
	if err != nil {
		return err
	}
	if !jsonSourceCodeObjectHasPersistedValue(codeObjPayload) {
		return nil
	}
	return p.setCodeObjectFieldForVariant(codeObjID, codeObjVariantID, "value", "")
}

func jsonSourceCodeObjectHasPersistedValue(codeObjPayload map[string]any) bool {
	if _, ok := codeObjPayload["value"]; !ok {
		return false
	}
	return payloadRawStringField(codeObjPayload, "value") != ""
}
