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

	state, err := p.loadJSONSourceLiveRefreshState(payload)
	if err != nil {
		return err
	}

	rootName := jsonSourceRootName(payload, requestedKeys)
	rootID, rootVariantID, err := p.ensureJSONSourceLiveRefreshRoot(rootName, state)
	if err != nil {
		return err
	}
	state.nextMap[rootID] = rootVariantID

	if err := p.setCodeObjectName(rootID, rootName); err != nil {
		return err
	}
	if err := p.syncJSONSourceObjectTree(state.currentMap, state.nextMap, rootID, rootVariantID, sourceObject); err != nil {
		return err
	}
	if err := p.commitJSONSourceLiveRefresh(section.ID, variant.ID, payload, state.nextMap, rootID); err != nil {
		return err
	}
	return p.pruneUnusedCodeObjects()
}

type jsonSourceLiveRefreshState struct {
	currentMap           map[string]string
	nextMap              map[string]string
	topLevelParamID      string
	currentRootVariantID string
}

func (p *Project) loadJSONSourceLiveRefreshState(payload map[string]any) (jsonSourceLiveRefreshState, error) {
	state := jsonSourceLiveRefreshState{
		currentMap:      cloneProjectStringMap(payloadStringMapField(payload, "codeObjVariantMap")),
		topLevelParamID: strings.TrimSpace(payloadStringField(payload, "topLevelParamId")),
	}
	state.nextMap = cloneProjectStringMap(state.currentMap)
	if state.topLevelParamID == "" {
		return state, nil
	}

	state.currentRootVariantID = strings.TrimSpace(state.currentMap[state.topLevelParamID])
	if state.currentRootVariantID == "" {
		return state, nil
	}

	subtreeIDs, err := p.collectJSONSourceLiveSubtreeIDs(state.currentMap, state.topLevelParamID)
	if err != nil {
		return jsonSourceLiveRefreshState{}, err
	}
	for codeObjID := range subtreeIDs {
		delete(state.nextMap, codeObjID)
	}
	return state, nil
}

func (p *Project) collectJSONSourceLiveSubtreeIDs(codeObjVariantMap map[string]string, rootCodeObjID string) (map[string]struct{}, error) {
	parentByID, _, err := collectCodeObjectHierarchy(*p, codeObjVariantMap, rootCodeObjID)
	if err != nil {
		return nil, err
	}
	subtreeIDs := make(map[string]struct{}, len(parentByID))
	for codeObjID := range parentByID {
		subtreeIDs[codeObjID] = struct{}{}
	}
	return subtreeIDs, nil
}

func (p *Project) ensureJSONSourceLiveRefreshRoot(rootName string, state jsonSourceLiveRefreshState) (string, string, error) {
	if state.topLevelParamID == "" || state.currentRootVariantID == "" {
		return p.createJSONSourceRootCodeObject(rootName)
	}

	isParent, err := p.codeObjectVariantIsParent(state.topLevelParamID, state.currentRootVariantID)
	if err != nil {
		return "", "", err
	}
	if isParent {
		return state.topLevelParamID, state.currentRootVariantID, nil
	}
	return p.createJSONSourceRootCodeObject(rootName)
}

func (p *Project) commitJSONSourceLiveRefresh(sectionID string, variantID string, payload map[string]any, nextMap map[string]string, rootID string) error {
	if err := p.setCurrentSectionCodeObjVariantMap(sectionID, nextMap); err != nil {
		return err
	}
	if payloadStringField(payload, "topLevelParamId") != rootID {
		if err := p.SetSectionFieldForVariant(sectionID, variantID, "topLevelParamId", rootID); err != nil {
			return err
		}
	}
	if !payloadBoolField(payload, "jsonSourceMissing") {
		return nil
	}
	return p.SetSectionFieldForVariant(sectionID, variantID, "jsonSourceMissing", false)
}

func (p *Project) syncJSONSourceObjectTree(currentMap map[string]string, nextMap map[string]string, parentID string, parentVariantID string, sourceObject JSONSourceObject) error {
	parentPayload, err := effectiveCodeObjectPayloadForVariant(*p, parentID, parentVariantID)
	if err != nil {
		return err
	}

	existingChildren, err := p.loadJSONSourceExistingChildren(payloadStringArrayField(parentPayload, "children"), currentMap, nextMap)
	if err != nil {
		return err
	}

	nextChildren := make([]string, 0, len(sourceObject.Entries))
	for _, entry := range sourceObject.Entries {
		childID, err := p.syncJSONSourceObjectEntry(currentMap, nextMap, existingChildren, entry)
		if err != nil {
			return err
		}
		nextChildren = append(nextChildren, childID)
	}

	return p.setCodeObjectFieldForVariant(parentID, parentVariantID, "children", nextChildren)
}

func (p *Project) loadJSONSourceExistingChildren(childIDs []string, currentMap map[string]string, nextMap map[string]string) (map[string]jsonSourceExistingCodeObject, error) {
	existingChildren := make(map[string]jsonSourceExistingCodeObject, len(childIDs))
	for _, childID := range childIDs {
		childVariantID := jsonSourceChildVariantID(childID, currentMap, nextMap)
		if childVariantID == "" {
			continue
		}
		childCore, existing, err := p.loadJSONSourceExistingChild(childID, childVariantID)
		if err != nil {
			return nil, err
		}
		existingChildren[childCore.Name] = existing
	}
	return existingChildren, nil
}

func (p *Project) loadJSONSourceExistingChild(childID string, childVariantID string) (CodeObject, jsonSourceExistingCodeObject, error) {
	childCore, ok := p.CodeObjs[childID]
	if !ok {
		return CodeObject{}, jsonSourceExistingCodeObject{}, fmt.Errorf("%w: %q", ErrCodeObjNotFound, childID)
	}
	isParent, err := p.codeObjectVariantIsParent(childID, childVariantID)
	if err != nil {
		return CodeObject{}, jsonSourceExistingCodeObject{}, err
	}
	return childCore, jsonSourceExistingCodeObject{
		CodeObjID: childID,
		VariantID: childVariantID,
		IsParent:  isParent,
	}, nil
}

func (p *Project) syncJSONSourceObjectEntry(currentMap map[string]string, nextMap map[string]string, existingChildren map[string]jsonSourceExistingCodeObject, entry JSONSourceObjectEntry) (string, error) {
	if existing, ok := existingChildren[entry.Key]; ok && existing.IsParent == entry.Value.IsObject() {
		if err := p.setCodeObjectName(existing.CodeObjID, entry.Key); err != nil {
			return "", err
		}
		nextMap[existing.CodeObjID] = existing.VariantID
		if err := p.syncJSONSourceEntryValue(currentMap, nextMap, existing.CodeObjID, existing.VariantID, entry.Value); err != nil {
			return "", err
		}
		return existing.CodeObjID, nil
	}

	createdCodeObjID, createdVariantID, err := p.createJSONSourceCodeObject(entry)
	if err != nil {
		return "", err
	}
	nextMap[createdCodeObjID] = createdVariantID
	if err := p.syncJSONSourceEntryValue(currentMap, nextMap, createdCodeObjID, createdVariantID, entry.Value); err != nil {
		return "", err
	}
	return createdCodeObjID, nil
}

func (p *Project) syncJSONSourceEntryValue(currentMap map[string]string, nextMap map[string]string, codeObjID string, variantID string, value JSONSourceValue) error {
	if value.Object != nil {
		return p.syncJSONSourceObjectTree(currentMap, nextMap, codeObjID, variantID, *value.Object)
	}
	return p.setCodeObjectFieldForVariant(codeObjID, variantID, "value", value.Serialized)
}

func jsonSourceChildVariantID(childID string, currentMap map[string]string, nextMap map[string]string) string {
	childVariantID := strings.TrimSpace(currentMap[childID])
	if childVariantID != "" {
		return childVariantID
	}
	return strings.TrimSpace(nextMap[childID])
}

type jsonSourceExistingCodeObject struct {
	CodeObjID string
	VariantID string
	IsParent  bool
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

type codeObjectFieldStorageTarget uint8

const (
	codeObjectFieldStorageSharedModifier codeObjectFieldStorageTarget = iota
	codeObjectFieldStorageImplPayload
	codeObjectFieldStorageVariantModifier
)

type codeObjectVariantMutationState struct {
	codeObj CodeObject
	variant CodeObjectVariant
	impl    CodeObjectImpl
}

func (p *Project) setCodeObjectFieldForVariant(codeObjID string, variantID string, fieldName string, fieldValue any) error {
	state, err := p.loadCodeObjectVariantMutationState(codeObjID, variantID)
	if err != nil {
		return err
	}
	target, currentRaw := state.fieldStorageTarget(fieldName)
	updatedRaw, err := rewriteProjectObjectField(currentRaw, fieldName, fieldValue)
	if err != nil {
		return err
	}
	p.storeCodeObjectFieldStorage(state, target, updatedRaw)
	return nil
}

func (p *Project) loadCodeObjectVariantMutationState(codeObjID string, variantID string) (codeObjectVariantMutationState, error) {
	codeObj, ok := p.CodeObjs[strings.TrimSpace(codeObjID)]
	if !ok {
		return codeObjectVariantMutationState{}, fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
	}
	variant, ok := p.CodeObjVariants[strings.TrimSpace(variantID)]
	if !ok {
		return codeObjectVariantMutationState{}, fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, variantID)
	}
	impl, ok := p.CodeObjImpls[variant.ImplID]
	if !ok {
		return codeObjectVariantMutationState{}, fmt.Errorf("%w: %q", ErrCodeObjImplNotFound, variant.ImplID)
	}
	return codeObjectVariantMutationState{
		codeObj: codeObj,
		variant: variant,
		impl:    impl,
	}, nil
}

func (state codeObjectVariantMutationState) fieldStorageTarget(fieldName string) (codeObjectFieldStorageTarget, RawJSON) {
	if !codeObjectFieldIsUnshared(state.codeObj, fieldName) {
		return codeObjectFieldStorageSharedModifier, state.codeObj.SharedModifier
	}
	if !codeObjImplIsPreset(state.impl) {
		return codeObjectFieldStorageImplPayload, codeObjImplPayloadUnchecked(state.impl)
	}
	return codeObjectFieldStorageVariantModifier, state.variant.Modifier
}

func rewriteProjectObjectField(raw RawJSON, fieldName string, fieldValue any) (RawJSON, error) {
	object, err := rawObjectFromProjectPayload(raw)
	if err != nil {
		return nil, err
	}
	object[fieldName] = cloneProjectValue(fieldValue)
	return marshalProjectObject(object)
}

func (p *Project) storeCodeObjectFieldStorage(
	state codeObjectVariantMutationState,
	target codeObjectFieldStorageTarget,
	updatedRaw RawJSON,
) {
	switch target {
	case codeObjectFieldStorageSharedModifier:
		state.codeObj.SharedModifier = updatedRaw
		p.CodeObjs[state.codeObj.ID] = state.codeObj
	case codeObjectFieldStorageImplPayload:
		state.impl.Payload = updatedRaw
		p.CodeObjImpls[state.impl.ID] = state.impl
	default:
		state.variant.Modifier = updatedRaw
		p.CodeObjVariants[state.variant.ID] = state.variant
	}
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
