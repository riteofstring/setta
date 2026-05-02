package projectstate

import (
	"context"
	"errors"
	"fmt"
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
