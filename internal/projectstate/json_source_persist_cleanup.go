package projectstate

import "strings"

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
		for _, sectionVariantID := range section.VariantIDs {
			sectionPayload, err := p.EffectiveSectionPayload(sectionID, sectionVariantID)
			if err != nil {
				return err
			}
			if !payloadBoolField(sectionPayload, "isJsonSource") {
				continue
			}
			topLevelParamID := strings.TrimSpace(payloadStringField(sectionPayload, "topLevelParamId"))
			if topLevelParamID == "" {
				continue
			}
			codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
			_, childrenByID, err := collectCodeObjectHierarchy(*p, codeObjVariantMap, topLevelParamID)
			if err != nil {
				return err
			}
			for codeObjID, childIDs := range childrenByID {
				if len(childIDs) != 0 {
					continue
				}
				codeObjVariantID := strings.TrimSpace(codeObjVariantMap[codeObjID])
				if codeObjVariantID == "" {
					continue
				}
				codeObjPayload, err := effectiveCodeObjectPayloadForVariant(*p, codeObjID, codeObjVariantID)
				if err != nil {
					return err
				}
				if _, ok := codeObjPayload["value"]; !ok {
					continue
				}
				if payloadRawStringField(codeObjPayload, "value") == "" {
					continue
				}
				if err := p.setCodeObjectFieldForVariant(codeObjID, codeObjVariantID, "value", ""); err != nil {
					return err
				}
			}
		}
	}

	return nil
}
