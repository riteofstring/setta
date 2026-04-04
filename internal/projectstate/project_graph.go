package projectstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrSectionIDRequired                          = errors.New("section id is required")
	ErrSectionNameRequired                        = errors.New("section name is required")
	ErrSectionIDKeyMismatch                       = errors.New("section id must match its map key")
	ErrProjectNotFound                            = errors.New("project was not found in document")
	ErrProjectCodegenTargetLanguage               = errors.New("project codegen target language is required")
	ErrSectionVariantIDRequired                   = errors.New("section variant id is required")
	ErrSectionVariantIDKeyMismatch                = errors.New("section variant id must match its map key")
	ErrSectionImplIDRequired                      = errors.New("section impl id is required")
	ErrSectionImplIDKeyMismatch                   = errors.New("section impl id must match its map key")
	ErrEntrySectionNotFound                       = errors.New("entry code block id was not found in sections")
	ErrSectionNotFound                            = errors.New("section was not found in project")
	ErrSectionVariantNotFound                     = errors.New("section variant was not found in project")
	ErrSectionImplNotFound                        = errors.New("section impl was not found in project")
	ErrSectionActiveVariantNotFound               = errors.New("section active variant was not found")
	ErrSectionDefaultVariantMissing               = errors.New("section default variant id is required when variants exist")
	ErrSectionVariantMembership                   = errors.New("section variant must belong to the section")
	ErrSectionImplKindRequired                    = errors.New("section impl kind is required")
	ErrUnsupportedSectionImplKind                 = errors.New("unsupported section impl kind")
	ErrCodeSectionConfigRequired                  = errors.New("code section config is required")
	ErrTerminalSectionConfigRequired              = errors.New("terminal section config is required")
	ErrDrawSectionConfigRequired                  = errors.New("draw section config is required")
	ErrGeneratedSectionConfigRequired             = errors.New("generated section config is required")
	ErrGeneratedSectionKindRequired               = errors.New("generated section kind is required")
	ErrUnsupportedGeneratedSectionKind            = errors.New("unsupported generated section kind")
	ErrCodeLanguageRequired                       = errors.New("code language is required")
	ErrCodeFileBindingPathRequired                = errors.New("code file binding path is required")
	ErrCodeFileBindingLegacyPayloadKeys           = errors.New("code file binding payload must use canonical_path and access_mode keys")
	ErrDrawRenderedImagePathRequired              = errors.New("draw rendered image path is required")
	ErrTopLevelSectionNotFound                    = errors.New("top-level section was not found in project")
	ErrDuplicateTopLevelSection                   = errors.New("duplicate top-level section id")
	ErrPersistedProjectViewModesRequireRepair     = errors.New("persisted project view modes require repair")
	ErrPersistedProjectActiveIDsRequireRepair     = errors.New("persisted project active ids require repair")
	ErrPersistedProjectChatWindowingRequireRepair = errors.New("persisted project chat windowing requires repair")
	ErrPersistedProjectWindowSpacesRequireRepair  = errors.New("persisted project window spaces require repair")
	ErrParentSectionNotFound                      = errors.New("parent section was not found in project")
	ErrSectionConflict                            = errors.New("section already exists")
	ErrSectionVariantConflict                     = errors.New("section variant already exists")
	ErrSectionImplConflict                        = errors.New("section impl already exists")
	ErrTerminalSeedRequired                       = errors.New("terminal section seed is required")
	ErrCodeSectionRequired                        = errors.New("section must resolve to a code section")
	ErrTerminalSectionRequired                    = errors.New("section must resolve to a terminal section")
	ErrDrawSectionRequired                        = errors.New("section must resolve to a draw section")
	ErrCallableSectionRequired                    = errors.New("section must resolve to a callable section")
	ErrGroupSectionRequired                       = errors.New("section must resolve to a group section")
	ErrChatSectionRequired                        = errors.New("section must resolve to a chat section")
	ErrPromptSectionRequired                      = errors.New("section must resolve to a prompt section")
	ErrPromptFormatInvalid                        = errors.New("prompt format is invalid")
	ErrChatPermissionModeInvalid                  = errors.New("chat permission mode is invalid")
	ErrChatDictationModeInvalid                   = errors.New("chat dictation mode is invalid")
)

type SectionKind string

const (
	SectionKindCode      SectionKind = "code"
	SectionKindTerminal  SectionKind = "terminal"
	SectionKindDraw      SectionKind = "draw"
	SectionKindGenerated SectionKind = "generated"
)

type CodeLanguage string

const (
	CodeLanguagePython CodeLanguage = "python"
	CodeLanguageBash   CodeLanguage = "bash"
)

type CodeFileAccessMode string

const (
	CodeFileAccessModeReadWrite CodeFileAccessMode = "read_write"
	CodeFileAccessModeReadOnly  CodeFileAccessMode = "read_only"
	CodeFileAccessModeWriteOnly CodeFileAccessMode = "write_only"
)

type Section struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	DisplayName      string   `json:"displayName,omitempty"`
	VariantIDs       []string `json:"variantIds,omitempty"`
	DefaultVariantID string   `json:"defaultVariantId,omitempty"`
	ParentSectionID  string   `json:"parentSectionId,omitempty"`
	SharedModifier   RawJSON  `json:"sharedModifier,omitempty"`
	UnsharedKeys     []string `json:"unsharedKeys,omitempty"`
}

type ProjectCodegenTarget struct {
	Language string  `json:"language"`
	Payload  RawJSON `json:"payload,omitempty"`
}

type SectionVariant struct {
	ID               string   `json:"id"`
	Name             string   `json:"name,omitempty"`
	ImplID           string   `json:"implId"`
	NonPresetImplIDs []string `json:"nonPresetImplIds,omitempty"`
	Modifier         RawJSON  `json:"modifier,omitempty"`
	IsFrozen         bool     `json:"isFrozen,omitempty"`
}

type SectionImpl struct {
	ID        string                `json:"id"`
	Kind      SectionKind           `json:"kind"`
	Payload   RawJSON               `json:"payload,omitempty"`
	Code      *CodeSectionImpl      `json:"code,omitempty"`
	Terminal  *TerminalSectionImpl  `json:"terminal,omitempty"`
	Draw      *DrawSectionImpl      `json:"draw,omitempty"`
	Generated *GeneratedSectionImpl `json:"generated,omitempty"`
}

type CodeSectionImpl struct {
	Language                  CodeLanguage     `json:"language"`
	Binding                   *CodeFileBinding `json:"binding,omitempty"`
	AttachedTerminalSectionID string           `json:"attachedTerminalSectionId,omitempty"`
	Children                  []string         `json:"children,omitempty"`
}

type CodeFileBinding struct {
	Path        string             `json:"path"`
	AccessMode  CodeFileAccessMode `json:"accessMode,omitempty"`
	AutoBinding bool               `json:"autoBinding,omitempty"`
}

type TerminalSessionMode string

const (
	TerminalSessionModeInteractive    TerminalSessionMode = ""
	TerminalSessionModeManagedConsole TerminalSessionMode = "managed_console"
)

type TerminalSectionImpl struct {
	SessionMode TerminalSessionMode `json:"sessionMode,omitempty"`
}

type DrawSectionImpl struct {
	RenderedImagePath string `json:"renderedImagePath,omitempty"`
}

type GeneratedSectionKind string

const (
	GeneratedSectionKindPythonCode     GeneratedSectionKind = "python_code"
	GeneratedSectionKindPythonMetadata GeneratedSectionKind = "python_metadata"
	GeneratedSectionKindPlugin         GeneratedSectionKind = "plugin"
)

type GeneratedSectionImpl struct {
	Kind GeneratedSectionKind `json:"kind"`
}

func (p Project) Clone() Project {
	cloned := p
	cloned.TopLevelSectionIDs = append([]string(nil), p.TopLevelSectionIDs...)
	cloned.ActiveIDs = append([]string(nil), p.ActiveIDs...)
	cloned.WatchCodeFolders = cloneWatchCodeFolders(p.WatchCodeFolders)
	cloned.WatchCodeFiles = append([]string(nil), p.WatchCodeFiles...)
	cloned.WatchCodeRegistry = cloneWatchCodeRegistry(p.WatchCodeRegistry)
	cloned.WatchCodeBaselineByPath = cloneStringSliceMap(p.WatchCodeBaselineByPath)
	cloned.GeneratedCodeBinding = cloneCodeFileBinding(p.GeneratedCodeBinding)
	cloned.GeneratedMetadataBinding = cloneCodeFileBinding(p.GeneratedMetadataBinding)
	cloned.Viewport = cloneViewport(p.Viewport)
	copyProjectLayoutState(&cloned, p)
	copyProjectEdgeState(&cloned, p)
	copyProjectSectionState(&cloned, p)
	copyProjectCodeObjectState(&cloned, p)
	return cloned
}

func copyProjectLayoutState(dst *Project, src Project) {
	if src.ViewModes != nil {
		dst.ViewModes = make(map[string]ViewMode, len(src.ViewModes))
		for viewModeID, viewMode := range src.ViewModes {
			dst.ViewModes[viewModeID] = viewMode.Clone()
		}
	}
	if src.CodegenTargets != nil {
		dst.CodegenTargets = make([]ProjectCodegenTarget, len(src.CodegenTargets))
		for index, target := range src.CodegenTargets {
			dst.CodegenTargets[index] = target.Clone()
		}
	}
	if src.TopLevelSections != nil {
		dst.TopLevelSections = make(map[string]TopLevelSectionLayout, len(src.TopLevelSections))
		for sectionID, layout := range src.TopLevelSections {
			dst.TopLevelSections[sectionID] = layout.Clone()
		}
	}
	if src.WindowSpaces != nil {
		dst.WindowSpaces = make(map[string]WindowSpaceConfig, len(src.WindowSpaces))
		for windowSpaceID, windowSpace := range src.WindowSpaces {
			dst.WindowSpaces[windowSpaceID] = windowSpace.Clone()
		}
	}
	if src.ProjectChatWindowing != nil {
		clonedWindowing := src.ProjectChatWindowing.Clone()
		dst.ProjectChatWindowing = &clonedWindowing
	}
}

func copyProjectEdgeState(dst *Project, src Project) {
	if src.Edges != nil {
		dst.Edges = make([]Edge, len(src.Edges))
		for index, edge := range src.Edges {
			dst.Edges[index] = edge.Clone()
		}
	}
	if src.AgenticEdges != nil {
		dst.AgenticEdges = make([]AgenticEdge, len(src.AgenticEdges))
		for index, edge := range src.AgenticEdges {
			dst.AgenticEdges[index] = edge.Clone()
		}
	}
	if src.StateMachineEdges != nil {
		dst.StateMachineEdges = make([]StateMachineEdge, len(src.StateMachineEdges))
		for index, edge := range src.StateMachineEdges {
			dst.StateMachineEdges[index] = edge.Clone()
		}
	}
}

func copyProjectSectionState(dst *Project, src Project) {
	if src.SectionVariantMap != nil {
		dst.SectionVariantMap = make(map[string]string, len(src.SectionVariantMap))
		for sectionID, variantID := range src.SectionVariantMap {
			dst.SectionVariantMap[sectionID] = variantID
		}
	}
	if src.Sections != nil {
		dst.Sections = make(map[string]Section, len(src.Sections))
		for sectionID, section := range src.Sections {
			dst.Sections[sectionID] = section.Clone()
		}
	}
	if src.SectionVariants != nil {
		dst.SectionVariants = make(map[string]SectionVariant, len(src.SectionVariants))
		for variantID, variant := range src.SectionVariants {
			dst.SectionVariants[variantID] = variant.Clone()
		}
	}
	if src.SectionImpls != nil {
		dst.SectionImpls = make(map[string]SectionImpl, len(src.SectionImpls))
		for implID, impl := range src.SectionImpls {
			dst.SectionImpls[implID] = impl.Clone()
		}
	}
}

func copyProjectCodeObjectState(dst *Project, src Project) {
	if src.CodeObjs != nil {
		dst.CodeObjs = make(map[string]CodeObject, len(src.CodeObjs))
		for codeObjID, codeObj := range src.CodeObjs {
			dst.CodeObjs[codeObjID] = codeObj.Clone()
		}
	}
	if src.CodeObjVariants != nil {
		dst.CodeObjVariants = make(map[string]CodeObjectVariant, len(src.CodeObjVariants))
		for variantID, variant := range src.CodeObjVariants {
			dst.CodeObjVariants[variantID] = variant.Clone()
		}
	}
	if src.CodeObjImpls != nil {
		dst.CodeObjImpls = make(map[string]CodeObjectImpl, len(src.CodeObjImpls))
		for implID, impl := range src.CodeObjImpls {
			dst.CodeObjImpls[implID] = impl.Clone()
		}
	}
}

func (s Section) Clone() Section {
	cloned := s
	cloned.VariantIDs = append([]string(nil), s.VariantIDs...)
	cloned.SharedModifier = cloneRawJSON(s.SharedModifier)
	cloned.UnsharedKeys = append([]string(nil), s.UnsharedKeys...)
	return cloned
}

func (t ProjectCodegenTarget) Clone() ProjectCodegenTarget {
	cloned := t
	cloned.Payload = cloneRawJSON(t.Payload)
	return cloned
}

func (v SectionVariant) Clone() SectionVariant {
	cloned := v
	cloned.NonPresetImplIDs = append([]string(nil), v.NonPresetImplIDs...)
	cloned.Modifier = cloneRawJSON(v.Modifier)
	return cloned
}

func (i SectionImpl) Clone() SectionImpl {
	cloned := i
	cloned.Payload = cloneRawJSON(i.Payload)
	if i.Code != nil {
		code := *i.Code
		code.Children = append([]string(nil), i.Code.Children...)
		if i.Code.Binding != nil {
			binding := *i.Code.Binding
			code.Binding = &binding
		}
		cloned.Code = &code
	}
	if i.Terminal != nil {
		terminal := *i.Terminal
		cloned.Terminal = &terminal
	}
	if i.Draw != nil {
		draw := *i.Draw
		cloned.Draw = &draw
	}
	if i.Generated != nil {
		generated := *i.Generated
		cloned.Generated = &generated
	}
	return cloned
}

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
	if err := normalized.initializeNormalizedWatchCodeState(); err != nil {
		return err
	}
	if err := normalized.initializeNormalizedGraphCollections(); err != nil {
		return err
	}
	return normalized.initializeNormalizedCodeObjectCollections()
}

func (p *Project) initializeNormalizedWatchCodeState() error {
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
	if normalized.WatchCodeRegistry == nil {
		normalized.WatchCodeRegistry = map[string]WatchCodeRegistryEntry{}
	} else {
		normalized.WatchCodeRegistry = cloneWatchCodeRegistry(normalized.WatchCodeRegistry)
	}
	if normalized.WatchCodeBaselineByPath == nil {
		normalized.WatchCodeBaselineByPath = map[string][]string{}
	} else {
		normalized.WatchCodeBaselineByPath = cloneStringSliceMap(normalized.WatchCodeBaselineByPath)
	}
	normalized.WatchCodeFolders = cloneWatchCodeFolders(normalized.WatchCodeFolders)
	normalized.WatchCodeFiles = append([]string(nil), normalized.WatchCodeFiles...)
	return nil
}

func (p *Project) initializeNormalizedGraphCollections() error {
	if p == nil {
		return nil
	}

	normalized := p
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
		if strings.TrimSpace(sectionKey) == "" {
			return ErrSectionIDRequired
		}
		if strings.TrimSpace(section.ID) == "" {
			return ErrSectionIDRequired
		}
		if section.ID != sectionKey {
			return fmt.Errorf("%w: key=%q id=%q", ErrSectionIDKeyMismatch, sectionKey, section.ID)
		}
		if strings.TrimSpace(section.Name) == "" {
			return fmt.Errorf("%w: %q", ErrSectionNameRequired, section.ID)
		}
		if len(section.VariantIDs) > 0 && strings.TrimSpace(section.DefaultVariantID) == "" {
			return fmt.Errorf("%w: %q", ErrSectionDefaultVariantMissing, section.ID)
		}
		parentID := strings.TrimSpace(section.ParentSectionID)
		if parentID != "" {
			if _, ok := p.Sections[parentID]; !ok {
				return fmt.Errorf("%w: child=%q parent=%q", ErrParentSectionNotFound, section.ID, parentID)
			}
		}
		sharedModifier, err := normalizeRawJSON(section.SharedModifier, fmt.Sprintf("section %q sharedModifier", section.ID))
		if err != nil {
			return err
		}
		section.SharedModifier = sharedModifier
		p.Sections[sectionKey] = section.Clone()
	}
	return nil
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
		modifier, err := normalizeRawJSON(variant.Modifier, fmt.Sprintf("section variant %q modifier", variant.ID))
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
		if strings.TrimSpace(codeObjKey) == "" {
			return ErrCodeObjIDRequired
		}
		if strings.TrimSpace(codeObj.ID) == "" {
			return ErrCodeObjIDRequired
		}
		if codeObj.ID != codeObjKey {
			return fmt.Errorf("%w: key=%q id=%q", ErrCodeObjIDKeyMismatch, codeObjKey, codeObj.ID)
		}
		if strings.TrimSpace(codeObj.Name) == "" {
			allowsEmptyName, allowErr := p.codeObjectAllowsEmptyName(codeObj.ID)
			if allowErr != nil {
				return allowErr
			}
			if !allowsEmptyName {
				return fmt.Errorf("%w: %q", ErrCodeObjNameRequired, codeObj.ID)
			}
		}
		if len(codeObj.VariantIDs) > 0 && strings.TrimSpace(codeObj.DefaultVariantID) == "" {
			return fmt.Errorf("%w: %q", ErrCodeObjDefaultVariantMissing, codeObj.ID)
		}
		sharedModifier, err := normalizeRawJSON(codeObj.SharedModifier, fmt.Sprintf("code object %q sharedModifier", codeObj.ID))
		if err != nil {
			return err
		}
		codeObj.SharedModifier = sharedModifier
		p.CodeObjs[codeObjKey] = codeObj.Clone()
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

func (p *Project) validateNormalizedRelationships() error {
	if p == nil {
		return nil
	}

	if err := p.normalizeViewModesOnLoad(); err != nil {
		return fmt.Errorf("normalize view modes: %w", err)
	}
	p.ActiveIDs = pruneStaleSectionIDs(p.ActiveIDs, p.Sections)
	if err := p.validateTopLevelLayout(); err != nil {
		return err
	}
	if err := p.validateActiveSectionVariants(); err != nil {
		return err
	}
	if err := p.validateSectionVariantMemberships(); err != nil {
		return err
	}
	if err := p.validateCodeObjectVariantMemberships(); err != nil {
		return err
	}
	return p.validateEntryCodeBlock()
}

func (p *Project) validateTopLevelLayout() error {
	if p == nil {
		return nil
	}

	topLevelSeen := make(map[string]struct{}, len(p.TopLevelSectionIDs))
	for _, sectionID := range p.TopLevelSectionIDs {
		if _, ok := p.Sections[sectionID]; !ok {
			return fmt.Errorf("%w: %q", ErrTopLevelSectionNotFound, sectionID)
		}
		if _, ok := topLevelSeen[sectionID]; ok {
			return fmt.Errorf("%w: %q", ErrDuplicateTopLevelSection, sectionID)
		}
		topLevelSeen[sectionID] = struct{}{}
	}
	for sectionID := range p.TopLevelSections {
		if _, ok := p.Sections[sectionID]; !ok {
			return fmt.Errorf("%w: %q", ErrTopLevelSectionNotFound, sectionID)
		}
	}
	for viewModeID, viewMode := range p.ViewModes {
		for sectionID := range viewMode.TopLevelSections {
			if _, ok := p.Sections[sectionID]; !ok {
				return fmt.Errorf("%w: viewMode=%q section=%q", ErrTopLevelSectionNotFound, viewModeID, sectionID)
			}
		}
	}
	if p.ActiveViewModeID != "" {
		if _, ok := p.ViewModes[p.ActiveViewModeID]; !ok {
			return fmt.Errorf("%w: %q", ErrViewModeNotFound, p.ActiveViewModeID)
		}
	}
	return nil
}

func (p *Project) validateActiveSectionVariants() error {
	if p == nil {
		return nil
	}

	for sectionID, activeVariantID := range p.SectionVariantMap {
		section, ok := p.Sections[sectionID]
		if !ok {
			return fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
		}
		if _, ok := p.SectionVariants[activeVariantID]; !ok {
			return fmt.Errorf("%w: section=%q variant=%q", ErrSectionActiveVariantNotFound, sectionID, activeVariantID)
		}
		if !containsString(section.VariantIDs, activeVariantID) {
			return fmt.Errorf("%w: section=%q variant=%q", ErrSectionVariantMembership, sectionID, activeVariantID)
		}
	}
	return nil
}

func (p *Project) validateSectionVariantMemberships() error {
	if p == nil {
		return nil
	}

	for sectionID, section := range p.Sections {
		for _, variantID := range section.VariantIDs {
			if _, ok := p.SectionVariants[variantID]; !ok {
				return fmt.Errorf("%w: section=%q variant=%q", ErrSectionVariantNotFound, sectionID, variantID)
			}
		}
		if section.DefaultVariantID != "" && !containsString(section.VariantIDs, section.DefaultVariantID) {
			return fmt.Errorf("%w: section=%q variant=%q", ErrSectionVariantMembership, sectionID, section.DefaultVariantID)
		}
	}
	return nil
}

func (p *Project) validateCodeObjectVariantMemberships() error {
	if p == nil {
		return nil
	}

	for codeObjID, codeObj := range p.CodeObjs {
		for _, variantID := range codeObj.VariantIDs {
			if _, ok := p.CodeObjVariants[variantID]; !ok {
				return fmt.Errorf("%w: codeObj=%q variant=%q", ErrCodeObjVariantNotFound, codeObjID, variantID)
			}
		}
		if codeObj.DefaultVariantID != "" && !containsString(codeObj.VariantIDs, codeObj.DefaultVariantID) {
			return fmt.Errorf("%w: codeObj=%q variant=%q", ErrCodeObjVariantMembership, codeObjID, codeObj.DefaultVariantID)
		}
	}
	return nil
}

func (p *Project) validateEntryCodeBlock() error {
	if p == nil || p.EntryCodeBlockID == "" {
		return nil
	}
	if _, ok := p.Sections[p.EntryCodeBlockID]; !ok {
		return fmt.Errorf("%w: %q", ErrEntrySectionNotFound, p.EntryCodeBlockID)
	}
	return nil
}

func pruneStaleSectionIDs(sectionIDs []string, sections map[string]Section) []string {
	if len(sectionIDs) == 0 {
		return []string{}
	}

	pruned := make([]string, 0, len(sectionIDs))
	for _, sectionID := range sectionIDs {
		if _, ok := sections[sectionID]; !ok {
			continue
		}
		pruned = append(pruned, sectionID)
	}
	return pruned
}

func validateActiveIDsOnLoad(sectionIDs []string, sections map[string]Section) error {
	equal, err := persistedJSONEqual(
		struct {
			ActiveIDs []string `json:"activeIds,omitempty"`
		}{
			ActiveIDs: pruneStaleSectionIDs(sectionIDs, sections),
		},
		struct {
			ActiveIDs []string `json:"activeIds,omitempty"`
		}{
			ActiveIDs: sectionIDs,
		},
	)
	if err != nil {
		return err
	}
	if !equal {
		return ErrPersistedProjectActiveIDsRequireRepair
	}
	return nil
}

func (p Project) HasTopLevelSection(sectionID string) bool {
	return containsString(p.TopLevelSectionIDs, sectionID)
}

func (p Project) ResolveSection(sectionID string) (Section, SectionVariant, SectionImpl, error) {
	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return Section{}, SectionVariant{}, SectionImpl{}, ErrSectionIDRequired
	}

	section, ok := p.Sections[trimmedSectionID]
	if !ok {
		return Section{}, SectionVariant{}, SectionImpl{}, fmt.Errorf("%w: %q", ErrSectionNotFound, trimmedSectionID)
	}
	activeVariantID, ok := p.SectionVariantMap[trimmedSectionID]
	if !ok {
		return Section{}, SectionVariant{}, SectionImpl{}, fmt.Errorf("%w: %q", ErrSectionActiveVariantNotFound, trimmedSectionID)
	}
	variant, ok := p.SectionVariants[activeVariantID]
	if !ok {
		return Section{}, SectionVariant{}, SectionImpl{}, fmt.Errorf("%w: section=%q variant=%q", ErrSectionVariantNotFound, trimmedSectionID, activeVariantID)
	}
	impl, ok := p.SectionImpls[variant.ImplID]
	if !ok {
		return Section{}, SectionVariant{}, SectionImpl{}, fmt.Errorf("%w: variant=%q impl=%q", ErrSectionImplNotFound, activeVariantID, variant.ImplID)
	}

	return section, variant, impl, nil
}

func (i SectionImpl) IsCode() bool {
	return i.Kind == SectionKindCode && i.Code != nil
}

func (i SectionImpl) IsTerminal() bool {
	return i.Kind == SectionKindTerminal && i.Terminal != nil
}

func (i SectionImpl) IsDraw() bool {
	return i.Kind == SectionKindDraw && i.Draw != nil
}

func (i SectionImpl) IsGenerated() bool {
	return i.Kind == SectionKindGenerated && i.Generated != nil
}

func (i SectionImpl) IsGeneratedCodeSection() bool {
	if !i.IsGenerated() {
		return false
	}
	return i.Generated.Kind == GeneratedSectionKindPythonCode ||
		i.Generated.Kind == GeneratedSectionKindPythonMetadata
}

func (i SectionImpl) IsBaseCodeSection() bool {
	return i.IsCode() || i.IsGeneratedCodeSection()
}

func (i SectionImpl) IsGeneratedEntrySection() bool {
	if !i.IsGenerated() {
		return false
	}
	return i.Generated.Kind == GeneratedSectionKindPythonCode ||
		i.Generated.Kind == GeneratedSectionKindPythonMetadata ||
		i.Generated.Kind == GeneratedSectionKindPlugin
}

func (i SectionImpl) UsesPluginCodegen() bool {
	return i.IsGenerated() && i.Generated.Kind == GeneratedSectionKindPlugin
}

func (i SectionImpl) IsRunnableCode() bool {
	if !i.IsCode() {
		return false
	}
	return i.Code.Language == CodeLanguagePython || i.Code.Language == CodeLanguageBash
}

func (p Project) HasPythonCodegenTarget() bool {
	for _, target := range p.CodegenTargets {
		if target.Language == string(CodeLanguagePython) {
			return true
		}
	}
	return false
}

func (t ProjectCodegenTarget) Normalized() (ProjectCodegenTarget, error) {
	normalized := ProjectCodegenTarget{
		Language: strings.TrimSpace(t.Language),
		Payload:  cloneRawJSON(t.Payload),
	}
	if normalized.Language == "" {
		return ProjectCodegenTarget{}, ErrProjectCodegenTargetLanguage
	}
	var err error
	normalized.Payload, err = normalizeRawJSON(normalized.Payload, fmt.Sprintf("project codegen target %q payload", normalized.Language))
	if err != nil {
		return ProjectCodegenTarget{}, err
	}
	return normalized, nil
}

func cloneCodeFileBinding(binding *CodeFileBinding) *CodeFileBinding {
	if binding == nil {
		return nil
	}
	cloned := *binding
	return &cloned
}

func normalizeCodeFileBinding(binding *CodeFileBinding) (*CodeFileBinding, error) {
	if binding == nil {
		return nil, nil
	}
	normalized := *binding
	normalized.Path = strings.TrimSpace(normalized.Path)
	if normalized.Path == "" {
		return nil, ErrCodeFileBindingPathRequired
	}
	return &normalized, nil
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
