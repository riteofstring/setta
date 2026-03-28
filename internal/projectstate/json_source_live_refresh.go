package projectstate

import (
	"fmt"
	"strings"
)

func (d *Document) ShouldPreserveVariantJSONSourceLiveTreeOnMissingReload(projectID string, sectionID string, variantID string, requestedKeys []string) (bool, error) {
	if d == nil {
		return false, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return false, err
	}
	_, _, _, payload, err := project.resolveVariantDictSectionMutationState(sectionID, variantID)
	if err != nil {
		return false, err
	}
	if payloadBoolField(payload, "jsonSourceMissing") {
		return false, nil
	}
	if !stringSlicesEqual(
		payloadStringArrayField(payload, "jsonSourceKeys"),
		normalizeJSONSourceKeys(requestedKeys),
	) {
		return false, nil
	}
	topLevelParamID := strings.TrimSpace(payloadStringField(payload, "topLevelParamId"))
	if topLevelParamID == "" {
		return false, nil
	}
	codeObjVariantMap := payloadStringMapField(payload, "codeObjVariantMap")
	rootVariantID := strings.TrimSpace(codeObjVariantMap[topLevelParamID])
	if rootVariantID == "" {
		return false, nil
	}
	if _, err := effectiveCodeObjectPayloadForVariant(project, topLevelParamID, rootVariantID); err != nil {
		return false, err
	}
	return true, nil
}

func (d *Document) RefreshVariantJSONSourceLiveTree(projectID string, sectionID string, variantID string, requestedKeys []string, sourceObject JSONSourceObject) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.RefreshVariantJSONSourceLiveTree(sectionID, variantID, requestedKeys, sourceObject); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (p *Project) RefreshVariantJSONSourceLiveTree(sectionID string, variantID string, requestedKeys []string, sourceObject JSONSourceObject) error {
	if p == nil {
		return ErrProjectNotFound
	}

	section, variant, _, payload, err := p.resolveVariantDictSectionMutationState(sectionID, variantID)
	if err != nil {
		return err
	}

	currentMap := cloneProjectStringMap(payloadStringMapField(payload, "codeObjVariantMap"))
	topLevelParamID := strings.TrimSpace(payloadStringField(payload, "topLevelParamId"))
	oldSubtreeIDs := map[string]struct{}{}
	currentRootVariantID := ""
	if topLevelParamID != "" {
		currentRootVariantID = strings.TrimSpace(currentMap[topLevelParamID])
		if currentRootVariantID != "" {
			parentByID, _, err := collectCodeObjectHierarchy(*p, currentMap, topLevelParamID)
			if err != nil {
				return err
			}
			for codeObjID := range parentByID {
				oldSubtreeIDs[codeObjID] = struct{}{}
			}
		}
	}

	nextMap := cloneProjectStringMap(currentMap)
	for codeObjID := range oldSubtreeIDs {
		delete(nextMap, codeObjID)
	}

	rootID := topLevelParamID
	rootVariantID := currentRootVariantID
	if rootID == "" || rootVariantID == "" {
		rootID, rootVariantID, err = p.createJSONSourceRootCodeObject(jsonSourceRootName(payload, requestedKeys))
		if err != nil {
			return err
		}
	} else {
		isParent, err := p.codeObjectVariantIsParent(rootID, rootVariantID)
		if err != nil {
			return err
		}
		if !isParent {
			rootID, rootVariantID, err = p.createJSONSourceRootCodeObject(jsonSourceRootName(payload, requestedKeys))
			if err != nil {
				return err
			}
		}
	}
	nextMap[rootID] = rootVariantID

	if err := p.setCodeObjectName(rootID, jsonSourceRootName(payload, requestedKeys)); err != nil {
		return err
	}
	if err := p.syncJSONSourceObjectTree(currentMap, nextMap, rootID, rootVariantID, sourceObject); err != nil {
		return err
	}
	if err := p.setCurrentSectionCodeObjVariantMap(section.ID, nextMap); err != nil {
		return err
	}
	if payloadStringField(payload, "topLevelParamId") != rootID {
		if err := p.SetSectionFieldForVariant(section.ID, variant.ID, "topLevelParamId", rootID); err != nil {
			return err
		}
	}
	if payloadBoolField(payload, "jsonSourceMissing") {
		if err := p.SetSectionFieldForVariant(section.ID, variant.ID, "jsonSourceMissing", false); err != nil {
			return err
		}
	}

	return p.pruneUnusedCodeObjects()
}

func (p *Project) syncJSONSourceObjectTree(currentMap map[string]string, nextMap map[string]string, parentID string, parentVariantID string, sourceObject JSONSourceObject) error {
	parentPayload, err := effectiveCodeObjectPayloadForVariant(*p, parentID, parentVariantID)
	if err != nil {
		return err
	}

	existingChildren := make(map[string]jsonSourceExistingCodeObject, len(payloadStringArrayField(parentPayload, "children")))
	for _, childID := range payloadStringArrayField(parentPayload, "children") {
		childVariantID := strings.TrimSpace(currentMap[childID])
		if childVariantID == "" {
			childVariantID = strings.TrimSpace(nextMap[childID])
		}
		if childVariantID == "" {
			continue
		}
		childCore, ok := p.CodeObjs[childID]
		if !ok {
			return fmt.Errorf("%w: %q", ErrCodeObjNotFound, childID)
		}
		isParent, err := p.codeObjectVariantIsParent(childID, childVariantID)
		if err != nil {
			return err
		}
		existingChildren[childCore.Name] = jsonSourceExistingCodeObject{
			CodeObjID:  childID,
			VariantID:  childVariantID,
			IsParent:   isParent,
			ShouldKeep: false,
		}
	}

	nextChildren := make([]string, 0, len(sourceObject.Entries))
	for _, entry := range sourceObject.Entries {
		existing, ok := existingChildren[entry.Key]
		if ok && existing.IsParent == entry.Value.IsObject() {
			existing.ShouldKeep = true
			existingChildren[entry.Key] = existing
			if err := p.setCodeObjectName(existing.CodeObjID, entry.Key); err != nil {
				return err
			}
			nextMap[existing.CodeObjID] = existing.VariantID
			if entry.Value.Object != nil {
				if err := p.syncJSONSourceObjectTree(currentMap, nextMap, existing.CodeObjID, existing.VariantID, *entry.Value.Object); err != nil {
					return err
				}
			} else {
				if err := p.setCodeObjectFieldForVariant(existing.CodeObjID, existing.VariantID, "value", entry.Value.Serialized); err != nil {
					return err
				}
			}
			nextChildren = append(nextChildren, existing.CodeObjID)
			continue
		}

		createdCodeObjID, createdVariantID, err := p.createJSONSourceCodeObject(entry)
		if err != nil {
			return err
		}
		nextMap[createdCodeObjID] = createdVariantID
		if entry.Value.Object != nil {
			if err := p.syncJSONSourceObjectTree(currentMap, nextMap, createdCodeObjID, createdVariantID, *entry.Value.Object); err != nil {
				return err
			}
		}
		nextChildren = append(nextChildren, createdCodeObjID)
	}

	return p.setCodeObjectFieldForVariant(parentID, parentVariantID, "children", nextChildren)
}

type jsonSourceExistingCodeObject struct {
	CodeObjID  string
	VariantID  string
	IsParent   bool
	ShouldKeep bool
}

func (p *Project) createJSONSourceRootCodeObject(name string) (string, string, error) {
	core, variant, impl, err := newJSONSourceNestedCodeObject(name)
	if err != nil {
		return "", "", err
	}
	p.storeCreatedCodeObject(core, variant, impl)
	return core.ID, variant.ID, nil
}

func (p *Project) createJSONSourceCodeObject(entry JSONSourceObjectEntry) (string, string, error) {
	var (
		core    CodeObject
		variant CodeObjectVariant
		impl    CodeObjectImpl
		err     error
	)
	if entry.Value.Object != nil {
		core, variant, impl, err = newJSONSourceNestedCodeObject(entry.Key)
	} else {
		core, variant, impl, err = newJSONSourceLeafCodeObject(entry.Key, entry.Value.Serialized)
	}
	if err != nil {
		return "", "", err
	}
	p.storeCreatedCodeObject(core, variant, impl)
	return core.ID, variant.ID, nil
}

func (p *Project) codeObjectVariantIsParent(codeObjID string, variantID string) (bool, error) {
	payload, err := effectiveCodeObjectPayloadForVariant(*p, codeObjID, variantID)
	if err != nil {
		return false, err
	}
	variant, ok := p.CodeObjVariants[variantID]
	if !ok {
		return false, fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, variantID)
	}
	impl, ok := p.CodeObjImpls[variant.ImplID]
	if !ok {
		return false, fmt.Errorf("%w: %q", ErrCodeObjImplNotFound, variant.ImplID)
	}
	return readableCodeObjectIsParent(payload, impl), nil
}

func (p *Project) setCodeObjectName(codeObjID string, name string) error {
	codeObj, ok := p.CodeObjs[strings.TrimSpace(codeObjID)]
	if !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
	}
	codeObj.Name = strings.TrimSpace(name)
	p.CodeObjs[codeObj.ID] = codeObj
	return nil
}

func (p *Project) setCodeObjectFieldForVariant(codeObjID string, variantID string, fieldName string, fieldValue any) error {
	codeObj, ok := p.CodeObjs[strings.TrimSpace(codeObjID)]
	if !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
	}
	variant, ok := p.CodeObjVariants[strings.TrimSpace(variantID)]
	if !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, variantID)
	}
	impl, ok := p.CodeObjImpls[variant.ImplID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjImplNotFound, variant.ImplID)
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

func newJSONSourceLeafCodeObject(name string, value string) (CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	core, variant, impl, err := newAddKwargCodeObject(name)
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	payload, err := buildCreatedCodeObjectPayload(impl.ID, codeParamType, map[string]any{
		"coreNameEditable": true,
		"passingStyle":     "DEFAULT",
		"value":            value,
	})
	if err != nil {
		return CodeObject{}, CodeObjectVariant{}, CodeObjectImpl{}, err
	}
	impl.Payload = payload
	return core, variant, impl, nil
}

func newJSONSourceNestedCodeObject(name string) (CodeObject, CodeObjectVariant, CodeObjectImpl, error) {
	return newAddKwargDictRootCodeObject(name)
}

func jsonSourceRootName(payload map[string]any, requestedKeys []string) string {
	currentKeys := payloadStringArrayField(payload, "jsonSourceKeys")
	if len(currentKeys) > 0 {
		return currentKeys[len(currentKeys)-1]
	}
	if len(requestedKeys) > 0 {
		return requestedKeys[len(requestedKeys)-1]
	}
	return ""
}

func cloneProjectStringMap(source map[string]string) map[string]string {
	if source == nil {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}
