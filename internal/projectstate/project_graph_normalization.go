package projectstate

import (
	"encoding/json"
	"fmt"
	"strings"
)

func (p Project) Normalized() (Project, error) {
	normalized := p.Clone()
	if err := normalized.normalizeProjectStructure(); err != nil {
		return Project{}, err
	}
	if err := normalized.normalizeSectionState(); err != nil {
		return Project{}, err
	}
	if err := normalized.normalizeCodeObjectState(); err != nil {
		return Project{}, err
	}
	if err := normalized.validateNormalizedRelationships(); err != nil {
		return Project{}, err
	}
	if err := normalized.ReconcileCodeSectionBindings(); err != nil {
		return Project{}, fmt.Errorf("reconcile code section bindings: %w", err)
	}
	if err := normalized.ReconcileGeneratedSectionBindings(); err != nil {
		return Project{}, fmt.Errorf("reconcile generated section bindings: %w", err)
	}
	return normalized, nil
}

func (p *Project) normalizeProjectStructure() error {
	if p == nil {
		return nil
	}

	normalized := p
	if err := normalized.initializeNormalizedCollections(); err != nil {
		return err
	}
	if err := normalized.normalizeProjectWindowingState(); err != nil {
		return err
	}
	if err := normalized.normalizeProjectCodegenState(); err != nil {
		return err
	}
	return normalized.normalizeProjectViewAndEdgeState()
}

func (p *Project) initializeNormalizedCollections() error {
	if p == nil {
		return nil
	}

	normalized := p
	normalized.PreviewImgColor = strings.TrimSpace(normalized.PreviewImgColor)
	normalized.ActiveViewModeID = strings.TrimSpace(normalized.ActiveViewModeID)
	normalized.EntryCodeBlockID = strings.TrimSpace(normalized.EntryCodeBlockID)
	if err := normalized.initializeNormalizedGraphCollections(); err != nil {
		return err
	}
	return normalized.initializeNormalizedCodeObjectCollections()
}

func (p *Project) initializeNormalizedGraphCollections() error {
	if p == nil {
		return nil
	}

	normalized := p
	if normalized.SectionVariantMap == nil {
		normalized.SectionVariantMap = map[string]string{}
	}
	if normalized.ViewModes == nil {
		normalized.ViewModes = map[string]ViewMode{}
	}
	if normalized.Sections == nil {
		normalized.Sections = map[string]Section{}
	}
	if normalized.SectionVariants == nil {
		normalized.SectionVariants = map[string]SectionVariant{}
	}
	if normalized.SectionImpls == nil {
		normalized.SectionImpls = map[string]SectionImpl{}
	}
	if normalized.TopLevelSections == nil {
		normalized.TopLevelSections = map[string]TopLevelSectionLayout{}
	}
	if normalized.WindowSpaces != nil {
		windowSpaces, err := normalizeWindowSpaces(
			normalized.WindowSpaces,
			normalized.Sections,
		)
		if err != nil {
			return fmt.Errorf("normalize window spaces: %w", err)
		}
		normalized.WindowSpaces = windowSpaces
	}
	return nil
}

func (p *Project) initializeNormalizedCodeObjectCollections() error {
	if p == nil {
		return nil
	}

	if p.CodeObjs == nil {
		p.CodeObjs = map[string]CodeObject{}
	}
	if p.CodeObjVariants == nil {
		p.CodeObjVariants = map[string]CodeObjectVariant{}
	}
	if p.CodeObjImpls == nil {
		p.CodeObjImpls = map[string]CodeObjectImpl{}
	}
	if err := p.ensureSectionVariantNames(); err != nil {
		return fmt.Errorf("normalize section variant names: %w", err)
	}
	return nil
}

func (p *Project) normalizeProjectWindowingState() error {
	if p == nil {
		return nil
	}

	normalizedWindowing := ProjectChatWindowingOrDefault(p.ProjectChatWindowing)
	normalizedWindowing, err := normalizeProjectChatWindowingState(
		normalizedWindowing,
		p.Sections,
	)
	if err != nil {
		return fmt.Errorf("normalize project chat windowing: %w", err)
	}
	p.ProjectChatWindowing = &normalizedWindowing
	return nil
}

func (p *Project) normalizeProjectCodegenState() error {
	if p == nil {
		return nil
	}

	for index, target := range p.CodegenTargets {
		normalizedTarget, err := target.Normalized()
		if err != nil {
			return fmt.Errorf("normalize codegen target %d: %w", index, err)
		}
		p.CodegenTargets[index] = normalizedTarget
	}
	var err error
	p.GeneratedCodeBinding, err = normalizeCodeFileBinding(p.GeneratedCodeBinding)
	if err != nil {
		return fmt.Errorf("normalize generated code binding: %w", err)
	}
	p.GeneratedMetadataBinding, err = normalizeCodeFileBinding(p.GeneratedMetadataBinding)
	if err != nil {
		return fmt.Errorf("normalize generated metadata binding: %w", err)
	}
	return nil
}

func (p *Project) normalizeProjectViewAndEdgeState() error {
	if p == nil {
		return nil
	}

	if err := p.normalizeProjectViewModes(); err != nil {
		return err
	}
	if err := p.normalizeProjectEdges(); err != nil {
		return err
	}
	return p.normalizeProjectStateMachineEdges()
}

func (p *Project) normalizeProjectViewModes() error {
	if p == nil {
		return nil
	}

	for viewModeKey, viewMode := range p.ViewModes {
		if strings.TrimSpace(viewModeKey) == "" {
			return ErrViewModeIDRequired
		}
		if strings.TrimSpace(viewMode.ID) == "" {
			return ErrViewModeIDRequired
		}
		if viewMode.ID != viewModeKey {
			return fmt.Errorf("%w: key=%q id=%q", ErrViewModeIDKeyMismatch, viewModeKey, viewMode.ID)
		}
		p.ViewModes[viewModeKey] = viewMode.Clone()
	}
	return nil
}

func (p *Project) normalizeProjectEdges() error {
	if p == nil {
		return nil
	}

	for index, edge := range p.Edges {
		style, err := normalizeRawJSON(edge.Style, fmt.Sprintf("edge %q style", edge.ID))
		if err != nil {
			return err
		}
		data, err := normalizeRawJSON(edge.Data, fmt.Sprintf("edge %q data", edge.ID))
		if err != nil {
			return err
		}
		edge.Style = style
		edge.Data = data
		p.Edges[index] = edge.Clone()
	}
	for index, edge := range p.AgenticEdges {
		style, err := normalizeRawJSON(edge.Style, fmt.Sprintf("agentic edge %q style", edge.ID))
		if err != nil {
			return err
		}
		edge.Style = style
		p.AgenticEdges[index] = edge.Clone()
	}
	return nil
}

func (p *Project) normalizeProjectStateMachineEdges() error {
	if p == nil {
		return nil
	}

	for index, edge := range p.StateMachineEdges {
		normalizedEdge, normalizeErr := edge.Normalized()
		if normalizeErr != nil {
			return normalizeErr
		}
		p.StateMachineEdges[index] = normalizedEdge
	}
	return nil
}

func (p *Project) normalizeSectionState() error {
	if p == nil {
		return nil
	}

	if err := p.normalizeSections(); err != nil {
		return err
	}
	if err := p.normalizeSectionVariants(); err != nil {
		return err
	}
	return p.normalizeSectionImpls()
}

func (p *Project) normalizeSections() error {
	if p == nil {
		return nil
	}

	for sectionKey, section := range p.Sections {
		normalizedSection, err := p.normalizeSection(sectionKey, section)
		if err != nil {
			return err
		}
		p.Sections[sectionKey] = normalizedSection
	}
	return nil
}

func (p *Project) normalizeSection(sectionKey string, section Section) (Section, error) {
	if err := validateSectionKey(sectionKey, section); err != nil {
		return Section{}, err
	}
	if err := validateSectionEntryName(section); err != nil {
		return Section{}, err
	}
	if err := validateSectionDefaultVariant(section); err != nil {
		return Section{}, err
	}
	if err := p.validateSectionParent(section); err != nil {
		return Section{}, err
	}
	sharedModifier, err := normalizeRawJSONObject(
		section.SharedModifier,
		fmt.Sprintf("section %q sharedModifier", section.ID),
	)
	if err != nil {
		return Section{}, err
	}
	section.SharedModifier = sharedModifier
	return section.Clone(), nil
}

func validateSectionKey(sectionKey string, section Section) error {
	if strings.TrimSpace(sectionKey) == "" {
		return ErrSectionIDRequired
	}
	if strings.TrimSpace(section.ID) == "" {
		return ErrSectionIDRequired
	}
	if section.ID != sectionKey {
		return fmt.Errorf("%w: key=%q id=%q", ErrSectionIDKeyMismatch, sectionKey, section.ID)
	}
	return nil
}

func validateSectionEntryName(section Section) error {
	if strings.TrimSpace(section.Name) == "" {
		return fmt.Errorf("%w: %q", ErrSectionNameRequired, section.ID)
	}
	return nil
}

func validateSectionDefaultVariant(section Section) error {
	if len(section.VariantIDs) > 0 && strings.TrimSpace(section.DefaultVariantID) == "" {
		return fmt.Errorf("%w: %q", ErrSectionDefaultVariantMissing, section.ID)
	}
	return nil
}

func (p *Project) validateSectionParent(section Section) error {
	parentID := strings.TrimSpace(section.ParentSectionID)
	if parentID == "" {
		return nil
	}
	if _, ok := p.Sections[parentID]; ok {
		return nil
	}
	return fmt.Errorf("%w: child=%q parent=%q", ErrParentSectionNotFound, section.ID, parentID)
}

func (p *Project) normalizeSectionVariants() error {
	if p == nil {
		return nil
	}

	for variantKey, variant := range p.SectionVariants {
		if strings.TrimSpace(variantKey) == "" {
			return ErrSectionVariantIDRequired
		}
		if strings.TrimSpace(variant.ID) == "" {
			return ErrSectionVariantIDRequired
		}
		if variant.ID != variantKey {
			return fmt.Errorf("%w: key=%q id=%q", ErrSectionVariantIDKeyMismatch, variantKey, variant.ID)
		}
		if strings.TrimSpace(variant.ImplID) == "" {
			return fmt.Errorf("%w: variant=%q", ErrSectionImplIDRequired, variant.ID)
		}
		if _, ok := p.SectionImpls[variant.ImplID]; !ok {
			return fmt.Errorf("%w: variant=%q impl=%q", ErrSectionImplNotFound, variant.ID, variant.ImplID)
		}
		modifier, err := normalizeRawJSONObject(
			variant.Modifier,
			fmt.Sprintf("section variant %q modifier", variant.ID),
		)
		if err != nil {
			return err
		}
		variant.Modifier = modifier
		p.SectionVariants[variantKey] = variant.Clone()
	}
	return nil
}

func (p *Project) normalizeSectionImpls() error {
	if p == nil {
		return nil
	}

	for implKey, impl := range p.SectionImpls {
		normalizedImpl, err := normalizeSectionImpl(implKey, impl)
		if err != nil {
			return err
		}
		p.SectionImpls[implKey] = normalizedImpl
	}
	return nil
}

func normalizeSectionImpl(implKey string, impl SectionImpl) (SectionImpl, error) {
	if strings.TrimSpace(implKey) == "" {
		return SectionImpl{}, ErrSectionImplIDRequired
	}
	if strings.TrimSpace(impl.ID) == "" {
		return SectionImpl{}, ErrSectionImplIDRequired
	}
	if impl.ID != implKey {
		return SectionImpl{}, fmt.Errorf("%w: key=%q id=%q", ErrSectionImplIDKeyMismatch, implKey, impl.ID)
	}
	payload, err := normalizeSectionImplPayload(impl)
	if err != nil {
		return SectionImpl{}, err
	}
	impl.Payload = payload
	impl, err = normalizeSectionImplKind(impl)
	if err != nil {
		return SectionImpl{}, err
	}
	return impl.Clone(), nil
}

func normalizeSectionImplPayload(impl SectionImpl) (json.RawMessage, error) {
	payloadJSON, err := normalizeRawJSON(impl.Payload, fmt.Sprintf("section impl %q payload", impl.ID))
	if err != nil {
		return nil, err
	}
	payload, err := rawObjectFromProjectPayload(payloadJSON)
	if err != nil {
		return nil, fmt.Errorf("decode section impl %q payload: %w", impl.ID, err)
	}
	if err := validateCanonicalCodeFileBindingPayload(payload); err != nil {
		return nil, fmt.Errorf("validate section impl %q code file binding payload: %w", impl.ID, err)
	}
	return payloadJSON, nil
}

func normalizeSectionImplKind(impl SectionImpl) (SectionImpl, error) {
	if strings.TrimSpace(string(impl.Kind)) == "" {
		return SectionImpl{}, fmt.Errorf("%w: %q", ErrSectionImplKindRequired, impl.ID)
	}
	switch impl.Kind {
	case SectionKindCode:
		normalizedCodeImpl, err := normalizeCodeSectionImpl(impl)
		if err != nil {
			return SectionImpl{}, err
		}
		impl = normalizedCodeImpl
	case SectionKindTerminal:
		if impl.Terminal == nil {
			return SectionImpl{}, fmt.Errorf("%w: %q", ErrTerminalSectionConfigRequired, impl.ID)
		}
	case SectionKindDraw:
		if impl.Draw == nil {
			return SectionImpl{}, fmt.Errorf("%w: %q", ErrDrawSectionConfigRequired, impl.ID)
		}
	case SectionKindGenerated:
		if err := validateGeneratedSectionImpl(impl); err != nil {
			return SectionImpl{}, err
		}
	}
	return impl, nil
}

func normalizeCodeSectionImpl(impl SectionImpl) (SectionImpl, error) {
	if impl.Code == nil {
		return SectionImpl{}, fmt.Errorf("%w: %q", ErrCodeSectionConfigRequired, impl.ID)
	}
	impl.Code.Language = normalizeCodeLanguage(impl.Code.Language)
	if impl.Code.Language == "" {
		return SectionImpl{}, fmt.Errorf("%w: %q", ErrCodeLanguageRequired, impl.ID)
	}
	if impl.Code.Binding != nil && strings.TrimSpace(impl.Code.Binding.Path) == "" {
		return SectionImpl{}, fmt.Errorf("%w: %q", ErrCodeFileBindingPathRequired, impl.ID)
	}
	return impl, nil
}

func validateGeneratedSectionImpl(impl SectionImpl) error {
	if impl.Generated == nil {
		return fmt.Errorf("%w: %q", ErrGeneratedSectionConfigRequired, impl.ID)
	}
	if strings.TrimSpace(string(impl.Generated.Kind)) == "" {
		return fmt.Errorf("%w: %q", ErrGeneratedSectionKindRequired, impl.ID)
	}
	switch impl.Generated.Kind {
	case GeneratedSectionKindPythonCode, GeneratedSectionKindPythonMetadata, GeneratedSectionKindPlugin:
		return nil
	default:
		return fmt.Errorf("%w: %q", ErrUnsupportedGeneratedSectionKind, impl.Generated.Kind)
	}
}

func (p *Project) normalizeCodeObjectState() error {
	if p == nil {
		return nil
	}

	if err := p.normalizeCodeObjects(); err != nil {
		return err
	}
	if err := p.normalizeCodeObjectVariants(); err != nil {
		return err
	}
	return p.normalizeCodeObjectImpls()
}

func (p *Project) normalizeCodeObjects() error {
	if p == nil {
		return nil
	}

	for codeObjKey, codeObj := range p.CodeObjs {
		normalizedCodeObj, err := p.normalizeCodeObject(codeObjKey, codeObj)
		if err != nil {
			return err
		}
		p.CodeObjs[codeObjKey] = normalizedCodeObj
	}
	return nil
}

func (p *Project) normalizeCodeObject(codeObjKey string, codeObj CodeObject) (CodeObject, error) {
	if err := validateCodeObjectKey(codeObjKey, codeObj); err != nil {
		return CodeObject{}, err
	}
	if err := p.validateCodeObjectName(codeObj); err != nil {
		return CodeObject{}, err
	}
	if err := validateCodeObjectDefaultVariant(codeObj); err != nil {
		return CodeObject{}, err
	}
	sharedModifier, err := normalizeRawJSON(
		codeObj.SharedModifier,
		fmt.Sprintf("code object %q sharedModifier", codeObj.ID),
	)
	if err != nil {
		return CodeObject{}, err
	}
	codeObj.SharedModifier = sharedModifier
	return codeObj.Clone(), nil
}

func validateCodeObjectKey(codeObjKey string, codeObj CodeObject) error {
	if strings.TrimSpace(codeObjKey) == "" {
		return ErrCodeObjIDRequired
	}
	if strings.TrimSpace(codeObj.ID) == "" {
		return ErrCodeObjIDRequired
	}
	if codeObj.ID != codeObjKey {
		return fmt.Errorf("%w: key=%q id=%q", ErrCodeObjIDKeyMismatch, codeObjKey, codeObj.ID)
	}
	return nil
}

func (p *Project) validateCodeObjectName(codeObj CodeObject) error {
	if strings.TrimSpace(codeObj.Name) != "" {
		return nil
	}
	allowsEmptyName, err := p.codeObjectAllowsEmptyName(codeObj.ID)
	if err != nil {
		return err
	}
	if allowsEmptyName {
		return nil
	}
	return fmt.Errorf("%w: %q", ErrCodeObjNameRequired, codeObj.ID)
}

func validateCodeObjectDefaultVariant(codeObj CodeObject) error {
	if len(codeObj.VariantIDs) > 0 && strings.TrimSpace(codeObj.DefaultVariantID) == "" {
		return fmt.Errorf("%w: %q", ErrCodeObjDefaultVariantMissing, codeObj.ID)
	}
	return nil
}

func (p *Project) normalizeCodeObjectVariants() error {
	if p == nil {
		return nil
	}

	for variantKey, variant := range p.CodeObjVariants {
		if strings.TrimSpace(variantKey) == "" {
			return ErrCodeObjVariantIDRequired
		}
		if strings.TrimSpace(variant.ID) == "" {
			return ErrCodeObjVariantIDRequired
		}
		if variant.ID != variantKey {
			return fmt.Errorf("%w: key=%q id=%q", ErrCodeObjVariantIDKeyMismatch, variantKey, variant.ID)
		}
		if strings.TrimSpace(variant.ImplID) == "" {
			return fmt.Errorf("%w: variant=%q", ErrCodeObjImplIDRequired, variant.ID)
		}
		if _, ok := p.CodeObjImpls[variant.ImplID]; !ok {
			return fmt.Errorf("%w: variant=%q impl=%q", ErrCodeObjImplNotFound, variant.ID, variant.ImplID)
		}
		modifier, err := normalizeRawJSON(variant.Modifier, fmt.Sprintf("code object variant %q modifier", variant.ID))
		if err != nil {
			return err
		}
		variant.Modifier = modifier
		p.CodeObjVariants[variantKey] = variant.Clone()
	}
	return nil
}

func (p *Project) normalizeCodeObjectImpls() error {
	if p == nil {
		return nil
	}

	for implKey, impl := range p.CodeObjImpls {
		if strings.TrimSpace(implKey) == "" {
			return ErrCodeObjImplIDRequired
		}
		if strings.TrimSpace(impl.ID) == "" {
			return ErrCodeObjImplIDRequired
		}
		if impl.ID != implKey {
			return fmt.Errorf("%w: key=%q id=%q", ErrCodeObjImplIDKeyMismatch, implKey, impl.ID)
		}
		if strings.TrimSpace(impl.Type) == "" {
			return fmt.Errorf("%w: %q", ErrCodeObjImplTypeRequired, impl.ID)
		}
		payload, err := normalizeRawJSON(impl.Payload, fmt.Sprintf("code object impl %q payload", impl.ID))
		if err != nil {
			return err
		}
		impl.Payload = payload
		p.CodeObjImpls[implKey] = impl.Clone()
	}
	return nil
}
