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
	return ClipboardProjectStateCore{
		Sections:        cloneMapValues(c.Sections, func(section Section) Section { return section.Clone() }),
		SectionImpls:    cloneMapValues(c.SectionImpls, func(impl SectionImpl) SectionImpl { return impl.Clone() }),
		SectionVariants: cloneMapValues(c.SectionVariants, func(variant SectionVariant) SectionVariant { return variant.Clone() }),
		CodeObjs:        cloneMapValues(c.CodeObjs, func(codeObj CodeObject) CodeObject { return codeObj.Clone() }),
		CodeObjImpls:    cloneMapValues(c.CodeObjImpls, func(impl CodeObjectImpl) CodeObjectImpl { return impl.Clone() }),
		CodeObjVariants: cloneMapValues(c.CodeObjVariants, func(variant CodeObjectVariant) CodeObjectVariant { return variant.Clone() }),
	}
}

func (c ClipboardProjectStateCoreWithSectionVariantMap) Clone() ClipboardProjectStateCoreWithSectionVariantMap {
	return ClipboardProjectStateCoreWithSectionVariantMap{
		Core:              c.Core.Clone(),
		SectionVariantMap: cloneStringMap(c.SectionVariantMap),
	}
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

func cloneMapValues[T any](source map[string]T, clone func(T) T) map[string]T {
	if source == nil {
		return nil
	}
	cloned := make(map[string]T, len(source))
	for id, value := range source {
		cloned[id] = clone(value)
	}
	return cloned
}

func cloneStringMap(source map[string]string) map[string]string {
	if source == nil {
		return nil
	}
	cloned := make(map[string]string, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
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
	collector := newClipboardCoreCollector(p, sectionIDs)
	if err := collector.collect(); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	sectionVariantMap, err := collector.buildSectionVariantMap()
	if err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	return ClipboardProjectStateCoreWithSectionVariantMap{
		Core:              collector.buildCore(),
		SectionVariantMap: sectionVariantMap,
	}, nil
}

type clipboardCoreCollector struct {
	project Project

	sectionIDs        map[string]struct{}
	sectionImplIDs    map[string]struct{}
	sectionVariantIDs map[string]struct{}
	codeObjIDs        map[string]struct{}
	codeObjImplIDs    map[string]struct{}
	codeObjVariantIDs map[string]struct{}

	pendingSectionIDs []string
	pendingCodeObjIDs []string
}

func newClipboardCoreCollector(project Project, sectionIDs []string) *clipboardCoreCollector {
	return &clipboardCoreCollector{
		project:           project,
		sectionIDs:        map[string]struct{}{},
		sectionImplIDs:    map[string]struct{}{},
		sectionVariantIDs: map[string]struct{}{},
		codeObjIDs:        map[string]struct{}{},
		codeObjImplIDs:    map[string]struct{}{},
		codeObjVariantIDs: map[string]struct{}{},
		pendingSectionIDs: append([]string{}, sectionIDs...),
	}
}

func (c *clipboardCoreCollector) collect() error {
	if err := c.collectSections(); err != nil {
		return err
	}
	return c.collectCodeObjects()
}

func (c *clipboardCoreCollector) collectSections() error {
	for len(c.pendingSectionIDs) > 0 {
		sectionID := c.pendingSectionIDs[0]
		c.pendingSectionIDs = c.pendingSectionIDs[1:]
		if err := c.collectSection(sectionID); err != nil {
			return err
		}
	}
	return nil
}

func (c *clipboardCoreCollector) collectSection(sectionID string) error {
	if _, ok := c.sectionIDs[sectionID]; ok {
		return nil
	}
	section, ok := c.project.Sections[sectionID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
	}
	c.sectionIDs[sectionID] = struct{}{}

	for _, variantID := range section.VariantIDs {
		variant, impl, payload, err := c.project.resolveSectionVariantClipboardPayload(sectionID, variantID)
		if err != nil {
			return err
		}
		c.sectionVariantIDs[variant.ID] = struct{}{}
		c.sectionImplIDs[impl.ID] = struct{}{}
		c.pendingSectionIDs = append(c.pendingSectionIDs, payloadStringArrayField(payload, "children")...)
		c.enqueueSectionPayloadCodeObjects(payload)
	}
	return nil
}

func (c *clipboardCoreCollector) enqueueSectionPayloadCodeObjects(payload map[string]any) {
	for codeObjID := range payloadStringMapField(payload, "codeObjVariantMap") {
		c.pendingCodeObjIDs = append(c.pendingCodeObjIDs, codeObjID)
	}
	c.pendingCodeObjIDs = append(c.pendingCodeObjIDs, collectOptionalClipboardCodeObjectIDs(payload)...)
}

func (c *clipboardCoreCollector) collectCodeObjects() error {
	for len(c.pendingCodeObjIDs) > 0 {
		codeObjID := c.pendingCodeObjIDs[0]
		c.pendingCodeObjIDs = c.pendingCodeObjIDs[1:]
		if err := c.collectCodeObject(codeObjID); err != nil {
			return err
		}
	}
	return nil
}

func (c *clipboardCoreCollector) collectCodeObject(codeObjID string) error {
	if _, ok := c.codeObjIDs[codeObjID]; ok {
		return nil
	}
	codeObj, ok := c.project.CodeObjs[codeObjID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
	}
	c.codeObjIDs[codeObjID] = struct{}{}

	for _, variantID := range codeObj.VariantIDs {
		variant, impl, payload, err := c.project.resolveCodeObjectVariantClipboardPayload(codeObjID, variantID)
		if err != nil {
			return err
		}
		c.codeObjVariantIDs[variant.ID] = struct{}{}
		c.codeObjImplIDs[impl.ID] = struct{}{}
		c.pendingCodeObjIDs = append(c.pendingCodeObjIDs, payloadStringArrayField(payload, "children")...)
	}
	return nil
}

func (c *clipboardCoreCollector) buildCore() ClipboardProjectStateCore {
	core := ClipboardProjectStateCore{
		Sections:        map[string]Section{},
		SectionImpls:    map[string]SectionImpl{},
		SectionVariants: map[string]SectionVariant{},
		CodeObjs:        map[string]CodeObject{},
		CodeObjImpls:    map[string]CodeObjectImpl{},
		CodeObjVariants: map[string]CodeObjectVariant{},
	}
	for sectionID := range c.sectionIDs {
		core.Sections[sectionID] = c.project.Sections[sectionID].Clone()
	}
	for implID := range c.sectionImplIDs {
		core.SectionImpls[implID] = c.project.SectionImpls[implID].Clone()
	}
	for variantID := range c.sectionVariantIDs {
		core.SectionVariants[variantID] = c.project.SectionVariants[variantID].Clone()
	}
	for codeObjID := range c.codeObjIDs {
		core.CodeObjs[codeObjID] = c.project.CodeObjs[codeObjID].Clone()
	}
	for implID := range c.codeObjImplIDs {
		core.CodeObjImpls[implID] = c.project.CodeObjImpls[implID].Clone()
	}
	for variantID := range c.codeObjVariantIDs {
		core.CodeObjVariants[variantID] = c.project.CodeObjVariants[variantID].Clone()
	}
	return core
}

func (c *clipboardCoreCollector) buildSectionVariantMap() (map[string]string, error) {
	sectionVariantMap := make(map[string]string, len(c.sectionIDs))
	for sectionID := range c.sectionIDs {
		activeVariantID := strings.TrimSpace(c.project.SectionVariantMap[sectionID])
		if activeVariantID == "" {
			activeVariantID = strings.TrimSpace(c.project.Sections[sectionID].DefaultVariantID)
		}
		if activeVariantID == "" {
			return nil, fmt.Errorf("%w: section=%q", ErrClipboardSectionVariantMissing, sectionID)
		}
		sectionVariantMap[sectionID] = activeVariantID
	}
	return sectionVariantMap, nil
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
	p.ensureClipboardMergeMaps()

	rootIDs := inferClipboardRootSectionIDs(data.toProject())
	rootSet := stringSetFromSlice(rootIDs)
	p.mergeClipboardCore(data.Core, rootSet)
	mergeStringMap(p.SectionVariantMap, data.SectionVariantMap)
	p.addClipboardRootLayouts(rootIDs, position)
	return nil
}

func (p *Project) ensureClipboardMergeMaps() {
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
}

func (p *Project) mergeClipboardCore(core ClipboardProjectStateCore, rootSet map[string]struct{}) {
	p.mergeClipboardSectionsMap(core.Sections, rootSet)
	mergeClonedEntries(p.SectionImpls, core.SectionImpls, func(impl SectionImpl) SectionImpl { return impl.Clone() })
	mergeClonedEntries(p.SectionVariants, core.SectionVariants, func(variant SectionVariant) SectionVariant { return variant.Clone() })
	mergeClonedEntries(p.CodeObjs, core.CodeObjs, func(codeObj CodeObject) CodeObject { return codeObj.Clone() })
	mergeClonedEntries(p.CodeObjImpls, core.CodeObjImpls, func(impl CodeObjectImpl) CodeObjectImpl { return impl.Clone() })
	mergeClonedEntries(p.CodeObjVariants, core.CodeObjVariants, func(variant CodeObjectVariant) CodeObjectVariant { return variant.Clone() })
}

func (p *Project) mergeClipboardSectionsMap(sections map[string]Section, rootSet map[string]struct{}) {
	for sectionID, section := range sections {
		cloned := section.Clone()
		if _, ok := rootSet[sectionID]; ok {
			cloned.ParentSectionID = ""
		}
		p.Sections[sectionID] = cloned
		if strings.TrimSpace(cloned.ParentSectionID) != "" {
			p.removeTopLevelSectionViewState(sectionID)
		}
	}
}

func (p *Project) addClipboardRootLayouts(rootIDs []string, position Position) {
	nextZIndex := p.nextCreateTopLevelSectionZIndex()
	for _, sectionID := range rootIDs {
		p.addTopLevelSectionViewState(sectionID, TopLevelSectionLayout{
			X:      position.X,
			Y:      position.Y,
			ZIndex: nextZIndex,
		})
		nextZIndex++
	}
}

func mergeClonedEntries[T any](dest map[string]T, source map[string]T, clone func(T) T) {
	for id, value := range source {
		dest[id] = clone(value)
	}
}

func mergeStringMap(dest map[string]string, source map[string]string) {
	for key, value := range source {
		dest[key] = value
	}
}

func cloneClipboardProjectState(data ClipboardProjectStateCoreWithSectionVariantMap) (ClipboardProjectStateCoreWithSectionVariantMap, error) {
	remapper := newClipboardCloneRemapper(data.Clone())
	if err := remapper.cloneCodeObjectCore(); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	if err := remapper.remapCodeObjectRelations(); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	if err := remapper.cloneSectionCore(); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	if err := remapper.remapSectionRelations(); err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	sectionVariantMap, err := remapper.remapSectionVariantMap()
	if err != nil {
		return ClipboardProjectStateCoreWithSectionVariantMap{}, err
	}
	remapper.data.SectionVariantMap = sectionVariantMap
	return remapper.data, nil
}

type clipboardCloneRemapper struct {
	data ClipboardProjectStateCoreWithSectionVariantMap

	codeObjImplIDMap    map[string]string
	codeObjVariantIDMap map[string]string
	codeObjIDMap        map[string]string
	sectionImplIDMap    map[string]string
	sectionVariantIDMap map[string]string
	sectionIDMap        map[string]string
}

func newClipboardCloneRemapper(data ClipboardProjectStateCoreWithSectionVariantMap) *clipboardCloneRemapper {
	return &clipboardCloneRemapper{
		data:                data,
		codeObjImplIDMap:    make(map[string]string, len(data.Core.CodeObjImpls)),
		codeObjVariantIDMap: make(map[string]string, len(data.Core.CodeObjVariants)),
		codeObjIDMap:        make(map[string]string, len(data.Core.CodeObjs)),
		sectionImplIDMap:    make(map[string]string, len(data.Core.SectionImpls)),
		sectionVariantIDMap: make(map[string]string, len(data.Core.SectionVariants)),
		sectionIDMap:        make(map[string]string, len(data.Core.Sections)),
	}
}

func (r *clipboardCloneRemapper) cloneCodeObjectCore() error {
	codeObjImpls, err := r.cloneCodeObjectImpls()
	if err != nil {
		return err
	}
	codeObjVariants, err := r.cloneCodeObjectVariants()
	if err != nil {
		return err
	}
	codeObjs, err := r.cloneCodeObjects()
	if err != nil {
		return err
	}
	r.data.Core.CodeObjImpls = codeObjImpls
	r.data.Core.CodeObjVariants = codeObjVariants
	r.data.Core.CodeObjs = codeObjs
	return nil
}

func (r *clipboardCloneRemapper) cloneCodeObjectImpls() (map[string]CodeObjectImpl, error) {
	clonedImpls := make(map[string]CodeObjectImpl, len(r.data.Core.CodeObjImpls))
	for oldID, impl := range r.data.Core.CodeObjImpls {
		if codeObjImplIsPreset(impl) {
			clonedImpls[oldID] = impl.Clone()
			r.codeObjImplIDMap[oldID] = oldID
			continue
		}
		copiedImpl, err := cloneCodeObjectImplForClipboard(impl)
		if err != nil {
			return nil, err
		}
		clonedImpls[copiedImpl.ID] = copiedImpl
		r.codeObjImplIDMap[oldID] = copiedImpl.ID
	}
	return clonedImpls, nil
}

func (r *clipboardCloneRemapper) cloneCodeObjectVariants() (map[string]CodeObjectVariant, error) {
	clonedVariants := make(map[string]CodeObjectVariant, len(r.data.Core.CodeObjVariants))
	for oldID, variant := range r.data.Core.CodeObjVariants {
		newVariantID, err := newProjectStateID()
		if err != nil {
			return nil, err
		}
		copied := variant.Clone()
		copied.ID = newVariantID
		copied.ImplID = r.codeObjImplIDMap[variant.ImplID]
		copied.NonPresetImplIDs = remapIDSlice(variant.NonPresetImplIDs, r.codeObjImplIDMap)
		clonedVariants[newVariantID] = copied
		r.codeObjVariantIDMap[oldID] = newVariantID
	}
	return clonedVariants, nil
}

func (r *clipboardCloneRemapper) cloneCodeObjects() (map[string]CodeObject, error) {
	clonedCodeObjs := make(map[string]CodeObject, len(r.data.Core.CodeObjs))
	for oldID, codeObj := range r.data.Core.CodeObjs {
		newCodeObjID, err := newProjectStateID()
		if err != nil {
			return nil, err
		}
		copied := codeObj.Clone()
		copied.ID = newCodeObjID
		copied.VariantIDs = remapIDSlice(codeObj.VariantIDs, r.codeObjVariantIDMap)
		if copied.DefaultVariantID != "" {
			copied.DefaultVariantID = r.codeObjVariantIDMap[codeObj.DefaultVariantID]
		}
		clonedCodeObjs[newCodeObjID] = copied
		r.codeObjIDMap[oldID] = newCodeObjID
	}
	return clonedCodeObjs, nil
}

func (r *clipboardCloneRemapper) remapCodeObjectRelations() error {
	if err := remapCodeObjectImpls(r.data.Core.CodeObjImpls, r.codeObjIDMap, r.codeObjImplIDMap); err != nil {
		return err
	}
	if err := remapCodeObjects(r.data.Core.CodeObjs, r.codeObjIDMap); err != nil {
		return err
	}
	return remapCodeObjectVariants(r.data.Core.CodeObjVariants, r.codeObjIDMap)
}

func (r *clipboardCloneRemapper) cloneSectionCore() error {
	sectionImpls, err := r.cloneSectionImpls()
	if err != nil {
		return err
	}
	sectionVariants, err := r.cloneSectionVariants()
	if err != nil {
		return err
	}
	sections, err := r.cloneSections()
	if err != nil {
		return err
	}
	r.data.Core.SectionImpls = sectionImpls
	r.data.Core.SectionVariants = sectionVariants
	r.data.Core.Sections = sections
	return nil
}

func (r *clipboardCloneRemapper) cloneSectionImpls() (map[string]SectionImpl, error) {
	clonedImpls := make(map[string]SectionImpl, len(r.data.Core.SectionImpls))
	for oldID, impl := range r.data.Core.SectionImpls {
		if sectionImplIsPreset(impl) {
			clonedImpls[oldID] = impl.Clone()
			r.sectionImplIDMap[oldID] = oldID
			continue
		}
		copiedImpl, err := cloneSectionImplForClipboard(impl)
		if err != nil {
			return nil, err
		}
		clonedImpls[copiedImpl.ID] = copiedImpl
		r.sectionImplIDMap[oldID] = copiedImpl.ID
	}
	return clonedImpls, nil
}

func (r *clipboardCloneRemapper) cloneSectionVariants() (map[string]SectionVariant, error) {
	clonedVariants := make(map[string]SectionVariant, len(r.data.Core.SectionVariants))
	for oldID, variant := range r.data.Core.SectionVariants {
		newVariantID, err := newProjectStateID()
		if err != nil {
			return nil, err
		}
		copied := variant.Clone()
		copied.ID = newVariantID
		copied.ImplID = r.sectionImplIDMap[variant.ImplID]
		copied.NonPresetImplIDs = remapIDSlice(variant.NonPresetImplIDs, r.sectionImplIDMap)
		clonedVariants[newVariantID] = copied
		r.sectionVariantIDMap[oldID] = newVariantID
	}
	return clonedVariants, nil
}

func (r *clipboardCloneRemapper) cloneSections() (map[string]Section, error) {
	clonedSections := make(map[string]Section, len(r.data.Core.Sections))
	for oldID, section := range r.data.Core.Sections {
		newSectionID, err := newProjectStateID()
		if err != nil {
			return nil, err
		}
		copied := section.Clone()
		copied.ID = newSectionID
		copied.VariantIDs = remapIDSlice(section.VariantIDs, r.sectionVariantIDMap)
		if copied.DefaultVariantID != "" {
			copied.DefaultVariantID = r.sectionVariantIDMap[section.DefaultVariantID]
		}
		copied.ParentSectionID = section.ParentSectionID
		clonedSections[newSectionID] = copied
		r.sectionIDMap[oldID] = newSectionID
	}
	return clonedSections, nil
}

func (r *clipboardCloneRemapper) remapSectionRelations() error {
	if err := remapSections(r.data.Core.Sections, r.sectionIDMap, r.codeObjIDMap, r.codeObjVariantIDMap); err != nil {
		return err
	}
	if err := remapSectionVariants(r.data.Core.SectionVariants, r.sectionIDMap, r.codeObjIDMap, r.codeObjVariantIDMap); err != nil {
		return err
	}
	return remapSectionImpls(r.data.Core.SectionImpls, r.sectionIDMap, r.codeObjIDMap, r.codeObjVariantIDMap)
}

func (r *clipboardCloneRemapper) remapSectionVariantMap() (map[string]string, error) {
	remapped := make(map[string]string, len(r.data.SectionVariantMap))
	for sectionID, variantID := range r.data.SectionVariantMap {
		mappedSectionID, ok := r.sectionIDMap[sectionID]
		if !ok {
			return nil, fmt.Errorf("%w: section=%q", ErrSectionNotFound, sectionID)
		}
		mappedVariantID, ok := r.sectionVariantIDMap[variantID]
		if !ok {
			return nil, fmt.Errorf("%w: variant=%q", ErrSectionVariantNotFound, variantID)
		}
		remapped[mappedSectionID] = mappedVariantID
	}
	return remapped, nil
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
