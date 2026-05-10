package projectstate

import (
	"fmt"
	"strings"
)

func cloneSectionImplForClipboard(sourceImpl SectionImpl) (SectionImpl, error) {
	newImplID, err := newProjectStateID()
	if err != nil {
		return SectionImpl{}, err
	}
	payload, err := rawObjectFromProjectPayload(sectionImplPayloadUnchecked(sourceImpl))
	if err != nil {
		return SectionImpl{}, err
	}
	payload["id"] = newImplID
	rawPayload, err := marshalProjectObject(payload)
	if err != nil {
		return SectionImpl{}, err
	}

	clonedImpl := sourceImpl.Clone()
	clonedImpl.ID = newImplID
	clonedImpl.Payload = rawPayload
	return clonedImpl, nil
}

func cloneCodeObjectImplForClipboard(sourceImpl CodeObjectImpl) (CodeObjectImpl, error) {
	newImplID, err := newProjectStateID()
	if err != nil {
		return CodeObjectImpl{}, err
	}
	payload, err := rawObjectFromProjectPayload(codeObjImplPayloadUnchecked(sourceImpl))
	if err != nil {
		return CodeObjectImpl{}, err
	}
	payload["id"] = newImplID
	rawPayload, err := marshalProjectObject(payload)
	if err != nil {
		return CodeObjectImpl{}, err
	}

	clonedImpl := sourceImpl.Clone()
	clonedImpl.ID = newImplID
	clonedImpl.Payload = rawPayload
	return clonedImpl, nil
}

func remapIDSlice(values []string, idMap map[string]string) []string {
	if len(values) == 0 {
		return []string{}
	}
	remapped := make([]string, 0, len(values))
	for _, value := range values {
		if mapped, ok := idMap[strings.TrimSpace(value)]; ok && mapped != "" {
			remapped = append(remapped, mapped)
		}
	}
	return remapped
}

func remapCodeObjectImpls(codeObjImpls map[string]CodeObjectImpl, codeObjIDMap map[string]string, codeObjImplIDMap map[string]string) error {
	for implID, impl := range codeObjImpls {
		payload, err := rawObjectFromProjectPayload(codeObjImplPayloadUnchecked(impl))
		if err != nil {
			return err
		}
		if err := remapIDListField(payload, "children", codeObjIDMap, "code object"); err != nil {
			return err
		}
		if codeObjImplIDMap[impl.ID] != impl.ID && strings.TrimSpace(payloadStringField(payload, "type")) == "PasswordParam" {
			payload["hasSecret"] = false
			if _, ok := payload["value"]; ok {
				payload["value"] = ""
			}
			if _, ok := payload["defaultVal"]; ok {
				payload["defaultVal"] = ""
			}
		}
		impl.Payload, err = marshalProjectObject(payload)
		if err != nil {
			return err
		}
		codeObjImpls[implID] = impl
	}
	return nil
}

func remapCodeObjectVariants(codeObjVariants map[string]CodeObjectVariant, codeObjIDMap map[string]string) error {
	for variantID, variant := range codeObjVariants {
		modifier, err := rawObjectFromProjectPayload(variant.Modifier)
		if err != nil {
			return err
		}
		if err := remapIDListField(modifier, "children", codeObjIDMap, "code object"); err != nil {
			return err
		}
		variant.Modifier, err = marshalOptionalProjectObject(modifier)
		if err != nil {
			return err
		}
		codeObjVariants[variantID] = variant
	}
	return nil
}

func remapCodeObjects(codeObjs map[string]CodeObject, codeObjIDMap map[string]string) error {
	for codeObjID, codeObj := range codeObjs {
		modifier, err := rawObjectFromProjectPayload(codeObj.SharedModifier)
		if err != nil {
			return err
		}
		if err := remapIDListField(modifier, "children", codeObjIDMap, "code object"); err != nil {
			return err
		}
		codeObj.SharedModifier, err = marshalOptionalProjectObject(modifier)
		if err != nil {
			return err
		}
		codeObjs[codeObjID] = codeObj
	}
	return nil
}

func remapSections(sections map[string]Section, sectionIDMap map[string]string, codeObjIDMap map[string]string, codeObjVariantIDMap map[string]string) error {
	for sectionID, section := range sections {
		if parentID := strings.TrimSpace(section.ParentSectionID); parentID != "" {
			mappedParentID, ok := sectionIDMap[parentID]
			if !ok {
				section.ParentSectionID = ""
			} else {
				section.ParentSectionID = mappedParentID
			}
		}
		modifier, err := rawObjectFromProjectPayload(section.SharedModifier)
		if err != nil {
			return err
		}
		if err := remapSectionRelationFields(modifier, sectionIDMap, codeObjIDMap, codeObjVariantIDMap); err != nil {
			return err
		}
		section.SharedModifier, err = marshalOptionalProjectObject(modifier)
		if err != nil {
			return err
		}
		sections[sectionID] = section
	}
	return nil
}

func remapSectionVariants(sectionVariants map[string]SectionVariant, sectionIDMap map[string]string, codeObjIDMap map[string]string, codeObjVariantIDMap map[string]string) error {
	for variantID, variant := range sectionVariants {
		modifier, err := rawObjectFromProjectPayload(variant.Modifier)
		if err != nil {
			return err
		}
		if err := remapSectionRelationFields(modifier, sectionIDMap, codeObjIDMap, codeObjVariantIDMap); err != nil {
			return err
		}
		variant.Modifier, err = marshalOptionalProjectObject(modifier)
		if err != nil {
			return err
		}
		sectionVariants[variantID] = variant
	}
	return nil
}

func remapSectionImpls(sectionImpls map[string]SectionImpl, sectionIDMap map[string]string, codeObjIDMap map[string]string, codeObjVariantIDMap map[string]string) error {
	for implID, impl := range sectionImpls {
		payload, err := rawObjectFromProjectPayload(sectionImplPayloadUnchecked(impl))
		if err != nil {
			return err
		}
		if err := remapSectionRelationFields(payload, sectionIDMap, codeObjIDMap, codeObjVariantIDMap); err != nil {
			return err
		}
		if impl.IsCode() {
			impl.Code.Children = payloadStringArrayField(payload, "children")
			impl.Code.AttachedTerminalSectionID = payloadStringField(payload, "attachedTerminalSectionId")
		}
		impl.Payload, err = marshalProjectObject(payload)
		if err != nil {
			return err
		}
		sectionImpls[implID] = impl
	}
	return nil
}

func remapSectionRelationFields(object map[string]any, sectionIDMap map[string]string, codeObjIDMap map[string]string, codeObjVariantIDMap map[string]string) error {
	if err := remapIDListField(object, "children", sectionIDMap, "section"); err != nil {
		return err
	}
	if err := remapIDMapField(object, "codeObjVariantMap", codeObjIDMap, codeObjVariantIDMap, "code object", "variant"); err != nil {
		return err
	}
	for _, key := range []string{"pinnedParams", "selectedParams", "edgeInputParams"} {
		if err := remapIDListField(object, key, codeObjIDMap, "param"); err != nil {
			return err
		}
	}
	for _, key := range []string{"topLevelParamId", "metaControlParamId", "callable"} {
		if err := remapOptionalIDField(object, key, codeObjIDMap, "code object", false); err != nil {
			return err
		}
	}
	if err := remapOptionalIDField(object, "attachedTerminalSectionId", sectionIDMap, "section", true); err != nil {
		return err
	}
	if err := remapIgnoreTypeErrorsField(object, codeObjIDMap); err != nil {
		return err
	}
	return nil
}

func remapIDListField(object map[string]any, key string, idMap map[string]string, label string) error {
	value, ok := object[key]
	if !ok {
		return nil
	}
	rawEntries, ok := value.([]any)
	if !ok {
		return nil
	}
	remapped := make([]any, 0, len(rawEntries))
	for _, entry := range rawEntries {
		stringValue, ok := entry.(string)
		if !ok {
			continue
		}
		trimmed := strings.TrimSpace(stringValue)
		if trimmed == "" {
			continue
		}
		mapped, ok := idMap[trimmed]
		if !ok {
			return fmt.Errorf("%s %q missing for remap", label, trimmed)
		}
		remapped = append(remapped, mapped)
	}
	object[key] = remapped
	return nil
}

func remapOptionalIDField(object map[string]any, key string, idMap map[string]string, label string, missingToNil bool) error {
	value, ok := object[key]
	if !ok {
		return nil
	}
	if value == nil {
		return nil
	}
	stringValue, ok := value.(string)
	if !ok {
		return nil
	}
	trimmed := strings.TrimSpace(stringValue)
	if trimmed == "" {
		object[key] = nil
		return nil
	}
	mapped, ok := idMap[trimmed]
	if !ok {
		if missingToNil {
			object[key] = nil
			return nil
		}
		return fmt.Errorf("%s %q missing for remap", label, trimmed)
	}
	object[key] = mapped
	return nil
}

func remapIDMapField(object map[string]any, key string, keyMap map[string]string, valueMap map[string]string, keyLabel string, valueLabel string) error {
	value, ok := object[key]
	if !ok {
		return nil
	}
	rawEntries, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	remapped := make(map[string]any, len(rawEntries))
	for rawKey, rawValue := range rawEntries {
		trimmedKey := strings.TrimSpace(rawKey)
		if trimmedKey == "" {
			continue
		}
		mappedKey, ok := keyMap[trimmedKey]
		if !ok {
			return fmt.Errorf("%s %q missing for remap", keyLabel, trimmedKey)
		}
		stringValue, ok := rawValue.(string)
		if !ok {
			continue
		}
		trimmedValue := strings.TrimSpace(stringValue)
		if trimmedValue == "" {
			continue
		}
		mappedValue, ok := valueMap[trimmedValue]
		if !ok {
			return fmt.Errorf("%s %q missing for remap", valueLabel, trimmedValue)
		}
		remapped[mappedKey] = mappedValue
	}
	object[key] = remapped
	return nil
}

func remapIgnoreTypeErrorsField(object map[string]any, codeObjIDMap map[string]string) error {
	value, ok := object["ignoreTypeErrors"]
	if !ok {
		return nil
	}
	ignore, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	paramsValue, ok := ignore["params"]
	if !ok {
		return nil
	}
	params, ok := paramsValue.(map[string]any)
	if !ok {
		return nil
	}
	remapped := make(map[string]any, len(params))
	for paramID, rawValue := range params {
		trimmedID := strings.TrimSpace(paramID)
		if trimmedID == "" {
			continue
		}
		mappedID, ok := codeObjIDMap[trimmedID]
		if !ok {
			return fmt.Errorf("param %q missing for remap", trimmedID)
		}
		remapped[mappedID] = cloneProjectValue(rawValue)
	}
	ignore["params"] = remapped
	object["ignoreTypeErrors"] = ignore
	return nil
}

func marshalOptionalProjectObject(object map[string]any) (RawJSON, error) {
	if len(object) == 0 {
		return nil, nil
	}
	return marshalProjectObject(object)
}
