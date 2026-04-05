package projectstate

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
)

var (
	ErrClipboardSectionIDBlank        = errors.New("clipboard sectionIds must not contain blank ids")
	ErrClipboardSectionVariantMissing = errors.New("copied section variant id is required")
	ErrPasteSectionsPositionInvalid   = errors.New("paste sections position is invalid")
)

type ClipboardDataType string

const ClipboardDataTypeSections ClipboardDataType = "Sections"

type ClipboardProjectStateCore struct {
	Sections        map[string]Section           `json:"sections,omitempty" ts_type:"Record<string, Core>" ts_optional:"false"`
	SectionImpls    map[string]SectionImpl       `json:"sectionImpls,omitempty" ts_type:"Record<string, BaseSectionImplUnion>" ts_optional:"false" shared_schema_map_value_ref:"BaseSectionImpl"`
	SectionVariants map[string]SectionVariant    `json:"sectionVariants,omitempty" ts_type:"Record<string, Variant>" ts_optional:"false"`
	CodeObjs        map[string]CodeObject        `json:"codeObjs,omitempty" ts_type:"Record<string, Core>" ts_optional:"false"`
	CodeObjImpls    map[string]CodeObjectImpl    `json:"codeObjImpls,omitempty" ts_type:"Record<string, BaseCodeObjImplUnion>" ts_optional:"false" shared_schema_map_value_ref:"BaseCodeObjImpl"`
	CodeObjVariants map[string]CodeObjectVariant `json:"codeObjVariants,omitempty" ts_type:"Record<string, Variant>" ts_optional:"false"`
}

type ClipboardProjectStateCoreWithSectionVariantMap struct {
	Core              ClipboardProjectStateCore `json:"core"`
	SectionVariantMap map[string]string         `json:"sectionVariantMap,omitempty" ts_optional:"false"`
}

type SectionsClipboardData struct {
	Type ClipboardDataType                              `json:"type" ts_type:"typeof ClipboardDataTypeEnum.Sections"`
	Data ClipboardProjectStateCoreWithSectionVariantMap `json:"data"`
}

type PasteSectionsInput struct {
	Data     ClipboardProjectStateCoreWithSectionVariantMap `json:"data"`
	Position Position                                       `json:"position"`
	AsRef    bool                                           `json:"asRef"`
}

func (c ClipboardProjectStateCore) Clone() ClipboardProjectStateCore {
	cloned := ClipboardProjectStateCore{}
	if c.Sections != nil {
		cloned.Sections = make(map[string]Section, len(c.Sections))
		for id, section := range c.Sections {
			cloned.Sections[id] = section.Clone()
		}
	}
	if c.SectionImpls != nil {
		cloned.SectionImpls = make(map[string]SectionImpl, len(c.SectionImpls))
		for id, impl := range c.SectionImpls {
			cloned.SectionImpls[id] = impl.Clone()
		}
	}
	if c.SectionVariants != nil {
		cloned.SectionVariants = make(map[string]SectionVariant, len(c.SectionVariants))
		for id, variant := range c.SectionVariants {
			cloned.SectionVariants[id] = variant.Clone()
		}
	}
	if c.CodeObjs != nil {
		cloned.CodeObjs = make(map[string]CodeObject, len(c.CodeObjs))
		for id, codeObj := range c.CodeObjs {
			cloned.CodeObjs[id] = codeObj.Clone()
		}
	}
	if c.CodeObjImpls != nil {
		cloned.CodeObjImpls = make(map[string]CodeObjectImpl, len(c.CodeObjImpls))
		for id, impl := range c.CodeObjImpls {
			cloned.CodeObjImpls[id] = impl.Clone()
		}
	}
	if c.CodeObjVariants != nil {
		cloned.CodeObjVariants = make(map[string]CodeObjectVariant, len(c.CodeObjVariants))
		for id, variant := range c.CodeObjVariants {
			cloned.CodeObjVariants[id] = variant.Clone()
		}
	}
	return cloned
}

func (c ClipboardProjectStateCoreWithSectionVariantMap) Clone() ClipboardProjectStateCoreWithSectionVariantMap {
	cloned := ClipboardProjectStateCoreWithSectionVariantMap{
		Core: c.Core.Clone(),
	}
	if c.SectionVariantMap != nil {
		cloned.SectionVariantMap = make(map[string]string, len(c.SectionVariantMap))
		for sectionID, variantID := range c.SectionVariantMap {
			cloned.SectionVariantMap[sectionID] = variantID
		}
	}
	return cloned
}

func (c ClipboardProjectStateCoreWithSectionVariantMap) toProject() Project {
	cloned := c.Clone()
	return Project{
		Sections:        cloned.Core.Sections,
		SectionImpls:    cloned.Core.SectionImpls,
		SectionVariants: cloned.Core.SectionVariants,
		CodeObjs:        cloned.Core.CodeObjs,
		CodeObjImpls:    cloned.Core.CodeObjImpls,
		CodeObjVariants: cloned.Core.CodeObjVariants,
		SectionVariantMap: func() map[string]string {
			if cloned.SectionVariantMap != nil {
				return cloned.SectionVariantMap
			}
			return map[string]string{}
		}(),
	}
}

func (d *Document) PrepareSectionsForCopy(projectID string, sectionIDs []string) (SectionsClipboardData, error) {
	if d == nil {
		return SectionsClipboardData{}, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return SectionsClipboardData{}, err
	}
	return project.prepareSectionsForCopy(sectionIDs)
}

func (r *Runtime) PrepareSectionsForCopy(ctx context.Context, projectID string, sectionIDs []string) (SectionsClipboardData, error) {
	if r == nil {
		return SectionsClipboardData{}, ErrRuntimeClosed
	}

	var result SectionsClipboardData
	_, err := r.submit(operation{
		frontendOpID: frontendOpIDFromContext(ctx),
		run: func(state *runtimeState) (Snapshot, error) {
			clipboard, err := state.current.PrepareSectionsForCopy(projectID, sectionIDs)
			if err != nil {
				return snapshotFromState(*state), err
			}
			result = clipboard
			return snapshotFromState(*state), nil
		},
	})
	if err != nil {
		return SectionsClipboardData{}, err
	}
	return result, nil
}

func (p Project) prepareSectionsForCopy(sectionIDs []string) (SectionsClipboardData, error) {
	normalizedIDs, err := normalizeClipboardSectionIDs(sectionIDs)
	if err != nil {
		return SectionsClipboardData{}, err
	}
	coreWithVariants, err := p.prepareClipboardCoreWithVariants(normalizedIDs)
	if err != nil {
		return SectionsClipboardData{}, err
	}
	return SectionsClipboardData{
		Type: ClipboardDataTypeSections,
		Data: coreWithVariants,
	}, nil
}

func normalizeClipboardSectionIDs(sectionIDs []string) ([]string, error) {
	normalized := make([]string, 0, len(sectionIDs))
	seen := make(map[string]struct{}, len(sectionIDs))
	for _, rawID := range sectionIDs {
		sectionID := strings.TrimSpace(rawID)
		if sectionID == "" {
			return nil, ErrClipboardSectionIDBlank
		}
		if _, ok := seen[sectionID]; ok {
			continue
		}
		seen[sectionID] = struct{}{}
		normalized = append(normalized, sectionID)
	}
	return normalized, nil
}

func (p Project) prepareClipboardCoreWithVariants(sectionIDs []string) (ClipboardProjectStateCoreWithSectionVariantMap, error) {
	collectedSectionIDs := map[string]struct{}{}
	collectedSectionImplIDs := map[string]struct{}{}
	collectedSectionVariantIDs := map[string]struct{}{}
	collectedCodeObjIDs := map[string]struct{}{}
	collectedCodeObjImplIDs := map[string]struct{}{}
	collectedCodeObjVariantIDs := map[string]struct{}{}

	codeObjQueue := []string{}
	for len(sectionIDs) > 0 {
		sectionID := sectionIDs[0]
		sectionIDs = sectionIDs[1:]

		if _, ok := collectedSectionIDs[sectionID]; ok {
			continue
		}
		section, ok := p.Sections[sectionID]
		if !ok {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
		}
		collectedSectionIDs[sectionID] = struct{}{}

		for _, variantID := range section.VariantIDs {
			variant, impl, payload, err := p.resolveSectionVariantClipboardPayload(sectionID, variantID)
			if err != nil {
				return ClipboardProjectStateCoreWithSectionVariantMap{}, err
			}
			collectedSectionVariantIDs[variant.ID] = struct{}{}
			collectedSectionImplIDs[impl.ID] = struct{}{}

			for _, childID := range payloadStringArrayField(payload, "children") {
				sectionIDs = append(sectionIDs, childID)
			}
			for codeObjID := range payloadStringMapField(payload, "codeObjVariantMap") {
				codeObjQueue = append(codeObjQueue, codeObjID)
			}
			for _, codeObjID := range collectOptionalClipboardCodeObjectIDs(payload) {
				codeObjQueue = append(codeObjQueue, codeObjID)
			}
		}
	}

	for len(codeObjQueue) > 0 {
		codeObjID := codeObjQueue[0]
		codeObjQueue = codeObjQueue[1:]

		if _, ok := collectedCodeObjIDs[codeObjID]; ok {
			continue
		}
		codeObj, ok := p.CodeObjs[codeObjID]
		if !ok {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
		}
		collectedCodeObjIDs[codeObjID] = struct{}{}

		for _, variantID := range codeObj.VariantIDs {
			variant, impl, payload, err := p.resolveCodeObjectVariantClipboardPayload(codeObjID, variantID)
			if err != nil {
				return ClipboardProjectStateCoreWithSectionVariantMap{}, err
			}
			collectedCodeObjVariantIDs[variant.ID] = struct{}{}
			collectedCodeObjImplIDs[impl.ID] = struct{}{}

			for _, childID := range payloadStringArrayField(payload, "children") {
				codeObjQueue = append(codeObjQueue, childID)
			}
		}
	}

	core := ClipboardProjectStateCore{
		Sections:        map[string]Section{},
		SectionImpls:    map[string]SectionImpl{},
		SectionVariants: map[string]SectionVariant{},
		CodeObjs:        map[string]CodeObject{},
		CodeObjImpls:    map[string]CodeObjectImpl{},
		CodeObjVariants: map[string]CodeObjectVariant{},
	}
	for sectionID := range collectedSectionIDs {
		core.Sections[sectionID] = p.Sections[sectionID].Clone()
	}
	for implID := range collectedSectionImplIDs {
		core.SectionImpls[implID] = p.SectionImpls[implID].Clone()
	}
	for variantID := range collectedSectionVariantIDs {
		core.SectionVariants[variantID] = p.SectionVariants[variantID].Clone()
	}
	for codeObjID := range collectedCodeObjIDs {
		core.CodeObjs[codeObjID] = p.CodeObjs[codeObjID].Clone()
	}
	for implID := range collectedCodeObjImplIDs {
		core.CodeObjImpls[implID] = p.CodeObjImpls[implID].Clone()
	}
	for variantID := range collectedCodeObjVariantIDs {
		core.CodeObjVariants[variantID] = p.CodeObjVariants[variantID].Clone()
	}

	sectionVariantMap := make(map[string]string, len(core.Sections))
	for sectionID := range core.Sections {
		activeVariantID := strings.TrimSpace(p.SectionVariantMap[sectionID])
		if activeVariantID == "" {
			activeVariantID = strings.TrimSpace(core.Sections[sectionID].DefaultVariantID)
		}
		if activeVariantID == "" {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, fmt.Errorf("%w: section=%q", ErrClipboardSectionVariantMissing, sectionID)
		}
		sectionVariantMap[sectionID] = activeVariantID
	}

	return ClipboardProjectStateCoreWithSectionVariantMap{
		Core:              core,
		SectionVariantMap: sectionVariantMap,
	}, nil
}

func collectOptionalClipboardCodeObjectIDs(payload map[string]any) []string {
	ids := make([]string, 0, 3)
	for _, key := range []string{"metaControlParamId", "topLevelParamId", "callable"} {
		if value := payloadStringField(payload, key); value != "" {
			ids = append(ids, value)
		}
	}
	return ids
}

func (p Project) resolveSectionVariantClipboardPayload(sectionID string, variantID string) (SectionVariant, SectionImpl, map[string]any, error) {
	_, variant, impl, err := p.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return SectionVariant{}, SectionImpl{}, nil, err
	}
	payload, err := p.EffectiveSectionPayload(sectionID, variantID)
	if err != nil {
		return SectionVariant{}, SectionImpl{}, nil, err
	}
	return variant, impl, payload, nil
}

func (p Project) resolveCodeObjectVariantClipboardPayload(codeObjID string, variantID string) (CodeObjectVariant, CodeObjectImpl, map[string]any, error) {
	codeObj, ok := p.CodeObjs[codeObjID]
	if !ok {
		return CodeObjectVariant{}, CodeObjectImpl{}, nil, fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
	}
	if !containsString(codeObj.VariantIDs, variantID) {
		return CodeObjectVariant{}, CodeObjectImpl{}, nil, fmt.Errorf("%w: codeObj=%q variant=%q", ErrCodeObjVariantMembership, codeObjID, variantID)
	}
	variant, ok := p.CodeObjVariants[variantID]
	if !ok {
		return CodeObjectVariant{}, CodeObjectImpl{}, nil, fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, variantID)
	}
	impl, ok := p.CodeObjImpls[variant.ImplID]
	if !ok {
		return CodeObjectVariant{}, CodeObjectImpl{}, nil, fmt.Errorf("%w: %q", ErrCodeObjImplNotFound, variant.ImplID)
	}
	payload, err := effectiveCodeObjectPayloadForVariant(p, codeObjID, variantID)
	if err != nil {
		return CodeObjectVariant{}, CodeObjectImpl{}, nil, err
	}
	return variant, impl, payload, nil
}

func (d *Document) PasteSections(projectID string, input PasteSectionsInput) error {
	if d == nil {
		return ErrProjectNotFound
	}
	if !isFinitePosition(input.Position) {
		return ErrPasteSectionsPositionInvalid
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}

	normalizedData, err := normalizeClipboardProjectState(input.Data)
	if err != nil {
		return err
	}
	if len(normalizedData.Core.Sections) == 0 {
		return nil
	}
	if !input.AsRef {
		normalizedData, err = cloneClipboardProjectState(normalizedData)
		if err != nil {
			return err
		}
	}
	normalizedData, err = filterClipboardSingletonSections(project, normalizedData)
	if err != nil {
		return err
	}
	if len(normalizedData.Core.Sections) == 0 {
		return nil
	}

	project.pruneTopLevelCreationViewState()
	if err := project.mergeClipboardSections(normalizedData, input.Position); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) PasteSections(ctx context.Context, projectID string, input PasteSectionsInput) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.PasteSections(projectID, input); err != nil {
			return document, err
		}
		return document, nil
	})
}

func normalizeClipboardProjectState(data ClipboardProjectStateCoreWithSectionVariantMap) (ClipboardProjectStateCoreWithSectionVariantMap, error) {
	project, err := data.toProject().Normalized()
	if err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}

	rootIDs := inferClipboardRootSectionIDs(project)
	if len(rootIDs) == 0 {
		if len(project.Sections) == 0 {
			return ClipboardProjectStateCoreWithSectionVariantMap{
				Core: ClipboardProjectStateCore{
					Sections:        map[string]Section{},
					SectionImpls:    map[string]SectionImpl{},
					SectionVariants: map[string]SectionVariant{},
					CodeObjs:        map[string]CodeObject{},
					CodeObjImpls:    map[string]CodeObjectImpl{},
					CodeObjVariants: map[string]CodeObjectVariant{},
				},
				SectionVariantMap: map[string]string{},
			}, nil
		}
		return ClipboardProjectStateCoreWithSectionVariantMap{}, ErrClipboardSectionVariantMissing
	}
	return project.prepareClipboardCoreWithVariants(rootIDs)
}

func inferClipboardRootSectionIDs(project Project) []string {
	roots := make([]string, 0, len(project.Sections))
	for sectionID, section := range project.Sections {
		parentID := strings.TrimSpace(section.ParentSectionID)
		if parentID == "" {
			roots = append(roots, sectionID)
			continue
		}
		if _, ok := project.Sections[parentID]; !ok {
			roots = append(roots, sectionID)
		}
	}
	sort.Strings(roots)
	return roots
}

func filterClipboardSingletonSections(project Project, data ClipboardProjectStateCoreWithSectionVariantMap) (ClipboardProjectStateCoreWithSectionVariantMap, error) {
	existingSingletons, err := existingSingletonSectionTypes(project)
	if err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	if len(existingSingletons) == 0 {
		return data, nil
	}

	clipboardProject := data.toProject()
	rootIDs := inferClipboardRootSectionIDs(clipboardProject)
	keptRootIDs := make([]string, 0, len(rootIDs))
	for _, rootID := range rootIDs {
		variantID := strings.TrimSpace(data.SectionVariantMap[rootID])
		if variantID == "" {
			variantID = strings.TrimSpace(clipboardProject.Sections[rootID].DefaultVariantID)
		}
		if variantID == "" {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, fmt.Errorf("%w: section=%q", ErrClipboardSectionVariantMissing, rootID)
		}
		payload, err := clipboardProject.EffectiveSectionPayload(rootID, variantID)
		if err != nil {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, err
		}
		sectionType := payloadStringField(payload, "type")
		if _, ok := existingSingletons[sectionType]; ok && isSingletonSectionType(sectionType) {
			continue
		}
		keptRootIDs = append(keptRootIDs, rootID)
	}
	if len(keptRootIDs) == len(rootIDs) {
		return data, nil
	}
	if len(keptRootIDs) == 0 {
		return ClipboardProjectStateCoreWithSectionVariantMap{
			Core: ClipboardProjectStateCore{
				Sections:        map[string]Section{},
				SectionImpls:    map[string]SectionImpl{},
				SectionVariants: map[string]SectionVariant{},
				CodeObjs:        map[string]CodeObject{},
				CodeObjImpls:    map[string]CodeObjectImpl{},
				CodeObjVariants: map[string]CodeObjectVariant{},
			},
			SectionVariantMap: map[string]string{},
		}, nil
	}
	return clipboardProject.prepareClipboardCoreWithVariants(keptRootIDs)
}

func existingSingletonSectionTypes(project Project) (map[string]struct{}, error) {
	result := map[string]struct{}{}
	for sectionID, section := range project.Sections {
		variantID := strings.TrimSpace(project.SectionVariantMap[sectionID])
		if variantID == "" {
			variantID = strings.TrimSpace(section.DefaultVariantID)
		}
		if variantID == "" {
			continue
		}
		payload, err := project.EffectiveSectionPayload(sectionID, variantID)
		if err != nil {
			return nil, err
		}
		sectionType := payloadStringField(payload, "type")
		if isSingletonSectionType(sectionType) {
			result[sectionType] = struct{}{}
		}
	}
	return result, nil
}

func isSingletonSectionType(sectionType string) bool {
	switch strings.TrimSpace(sectionType) {
	case "GlobalVariables", "GenPythonCode", "GenPythonMetadata":
		return true
	default:
		return false
	}
}

func (p *Project) mergeClipboardSections(data ClipboardProjectStateCoreWithSectionVariantMap, position Position) error {
	if p == nil {
		return ErrProjectNotFound
	}

	if p.Sections == nil {
		p.Sections = map[string]Section{}
	}
	if p.SectionImpls == nil {
		p.SectionImpls = map[string]SectionImpl{}
	}
	if p.SectionVariants == nil {
		p.SectionVariants = map[string]SectionVariant{}
	}
	if p.CodeObjs == nil {
		p.CodeObjs = map[string]CodeObject{}
	}
	if p.CodeObjImpls == nil {
		p.CodeObjImpls = map[string]CodeObjectImpl{}
	}
	if p.CodeObjVariants == nil {
		p.CodeObjVariants = map[string]CodeObjectVariant{}
	}
	if p.SectionVariantMap == nil {
		p.SectionVariantMap = map[string]string{}
	}
	if p.TopLevelSections == nil {
		p.TopLevelSections = map[string]TopLevelSectionLayout{}
	}

	rootIDs := inferClipboardRootSectionIDs(data.toProject())
	rootSet := stringSetFromSlice(rootIDs)
	nextZIndex := p.nextCreateTopLevelSectionZIndex()

	for sectionID, section := range data.Core.Sections {
		cloned := section.Clone()
		if _, ok := rootSet[sectionID]; ok {
			cloned.ParentSectionID = ""
		}
		p.Sections[sectionID] = cloned
		if strings.TrimSpace(cloned.ParentSectionID) != "" {
			p.removeTopLevelSectionViewState(sectionID)
		}
	}
	for implID, impl := range data.Core.SectionImpls {
		p.SectionImpls[implID] = impl.Clone()
	}
	for variantID, variant := range data.Core.SectionVariants {
		p.SectionVariants[variantID] = variant.Clone()
	}
	for codeObjID, codeObj := range data.Core.CodeObjs {
		p.CodeObjs[codeObjID] = codeObj.Clone()
	}
	for implID, impl := range data.Core.CodeObjImpls {
		p.CodeObjImpls[implID] = impl.Clone()
	}
	for variantID, variant := range data.Core.CodeObjVariants {
		p.CodeObjVariants[variantID] = variant.Clone()
	}
	for sectionID, variantID := range data.SectionVariantMap {
		p.SectionVariantMap[sectionID] = variantID
	}

	for _, sectionID := range rootIDs {
		p.addTopLevelSectionViewState(sectionID, TopLevelSectionLayout{
			X:      position.X,
			Y:      position.Y,
			ZIndex: nextZIndex,
		})
		nextZIndex++
	}
	return nil
}

func cloneClipboardProjectState(data ClipboardProjectStateCoreWithSectionVariantMap) (ClipboardProjectStateCoreWithSectionVariantMap, error) {
	cloned := data.Clone()

	newCodeObjImpls := make(map[string]CodeObjectImpl, len(cloned.Core.CodeObjImpls))
	codeObjImplIDMap := make(map[string]string, len(cloned.Core.CodeObjImpls))
	for oldID, impl := range cloned.Core.CodeObjImpls {
		if codeObjImplIsPreset(impl) {
			newCodeObjImpls[oldID] = impl.Clone()
			codeObjImplIDMap[oldID] = oldID
			continue
		}
		copiedImpl, err := cloneCodeObjectImplForClipboard(impl)
		if err != nil {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, err
		}
		newCodeObjImpls[copiedImpl.ID] = copiedImpl
		codeObjImplIDMap[oldID] = copiedImpl.ID
	}

	newCodeObjVariants := make(map[string]CodeObjectVariant, len(cloned.Core.CodeObjVariants))
	codeObjVariantIDMap := make(map[string]string, len(cloned.Core.CodeObjVariants))
	for oldID, variant := range cloned.Core.CodeObjVariants {
		newVariantID, err := newProjectStateID()
		if err != nil {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, err
		}
		copied := variant.Clone()
		copied.ID = newVariantID
		copied.ImplID = codeObjImplIDMap[variant.ImplID]
		copied.NonPresetImplIDs = remapIDSlice(variant.NonPresetImplIDs, codeObjImplIDMap)
		newCodeObjVariants[newVariantID] = copied
		codeObjVariantIDMap[oldID] = newVariantID
	}

	newCodeObjs := make(map[string]CodeObject, len(cloned.Core.CodeObjs))
	codeObjIDMap := make(map[string]string, len(cloned.Core.CodeObjs))
	for oldID, codeObj := range cloned.Core.CodeObjs {
		newCodeObjID, err := newProjectStateID()
		if err != nil {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, err
		}
		copied := codeObj.Clone()
		copied.ID = newCodeObjID
		copied.VariantIDs = remapIDSlice(codeObj.VariantIDs, codeObjVariantIDMap)
		if copied.DefaultVariantID != "" {
			copied.DefaultVariantID = codeObjVariantIDMap[codeObj.DefaultVariantID]
		}
		newCodeObjs[newCodeObjID] = copied
		codeObjIDMap[oldID] = newCodeObjID
	}

	if err := remapCodeObjectImpls(newCodeObjImpls, codeObjIDMap, codeObjImplIDMap); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	if err := remapCodeObjects(newCodeObjs, codeObjIDMap); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	if err := remapCodeObjectVariants(newCodeObjVariants, codeObjIDMap); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}

	newSectionImpls := make(map[string]SectionImpl, len(cloned.Core.SectionImpls))
	sectionImplIDMap := make(map[string]string, len(cloned.Core.SectionImpls))
	for oldID, impl := range cloned.Core.SectionImpls {
		if sectionImplIsPreset(impl) {
			newSectionImpls[oldID] = impl.Clone()
			sectionImplIDMap[oldID] = oldID
			continue
		}
		copiedImpl, err := cloneSectionImplForClipboard(impl)
		if err != nil {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, err
		}
		newSectionImpls[copiedImpl.ID] = copiedImpl
		sectionImplIDMap[oldID] = copiedImpl.ID
	}

	newSectionVariants := make(map[string]SectionVariant, len(cloned.Core.SectionVariants))
	sectionVariantIDMap := make(map[string]string, len(cloned.Core.SectionVariants))
	for oldID, variant := range cloned.Core.SectionVariants {
		newVariantID, err := newProjectStateID()
		if err != nil {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, err
		}
		copied := variant.Clone()
		copied.ID = newVariantID
		copied.ImplID = sectionImplIDMap[variant.ImplID]
		copied.NonPresetImplIDs = remapIDSlice(variant.NonPresetImplIDs, sectionImplIDMap)
		newSectionVariants[newVariantID] = copied
		sectionVariantIDMap[oldID] = newVariantID
	}

	newSections := make(map[string]Section, len(cloned.Core.Sections))
	sectionIDMap := make(map[string]string, len(cloned.Core.Sections))
	for oldID, section := range cloned.Core.Sections {
		newSectionID, err := newProjectStateID()
		if err != nil {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, err
		}
		copied := section.Clone()
		copied.ID = newSectionID
		copied.VariantIDs = remapIDSlice(section.VariantIDs, sectionVariantIDMap)
		if copied.DefaultVariantID != "" {
			copied.DefaultVariantID = sectionVariantIDMap[section.DefaultVariantID]
		}
		copied.ParentSectionID = section.ParentSectionID
		newSections[newSectionID] = copied
		sectionIDMap[oldID] = newSectionID
	}

	if err := remapSections(newSections, sectionIDMap, codeObjIDMap, codeObjVariantIDMap); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	if err := remapSectionVariants(newSectionVariants, sectionIDMap, codeObjIDMap, codeObjVariantIDMap); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	if err := remapSectionImpls(newSectionImpls, sectionIDMap, codeObjIDMap, codeObjVariantIDMap); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}

	nextVariantMap := make(map[string]string, len(cloned.SectionVariantMap))
	for sectionID, variantID := range cloned.SectionVariantMap {
		mappedSectionID, ok := sectionIDMap[sectionID]
		if !ok {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, fmt.Errorf("%w: section=%q", ErrSectionNotFound, sectionID)
		}
		mappedVariantID, ok := sectionVariantIDMap[variantID]
		if !ok {
			return ClipboardProjectStateCoreWithSectionVariantMap{}, fmt.Errorf("%w: variant=%q", ErrSectionVariantNotFound, variantID)
		}
		nextVariantMap[mappedSectionID] = mappedVariantID
	}

	return ClipboardProjectStateCoreWithSectionVariantMap{
		Core: ClipboardProjectStateCore{
			Sections:        newSections,
			SectionImpls:    newSectionImpls,
			SectionVariants: newSectionVariants,
			CodeObjs:        newCodeObjs,
			CodeObjImpls:    newCodeObjImpls,
			CodeObjVariants: newCodeObjVariants,
		},
		SectionVariantMap: nextVariantMap,
	}, nil
}

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
