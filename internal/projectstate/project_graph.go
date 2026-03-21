package projectstate

import (
	"errors"
	"fmt"
	"strings"
)

var (
	ErrSectionIDRequired               = errors.New("section id is required")
	ErrSectionNameRequired             = errors.New("section name is required")
	ErrSectionIDKeyMismatch            = errors.New("section id must match its map key")
	ErrProjectNotFound                 = errors.New("project was not found in document")
	ErrProjectCodegenTargetLanguage    = errors.New("project codegen target language is required")
	ErrSectionVariantIDRequired        = errors.New("section variant id is required")
	ErrSectionVariantIDKeyMismatch     = errors.New("section variant id must match its map key")
	ErrSectionImplIDRequired           = errors.New("section impl id is required")
	ErrSectionImplIDKeyMismatch        = errors.New("section impl id must match its map key")
	ErrEntrySectionNotFound            = errors.New("entry code block id was not found in sections")
	ErrSectionNotFound                 = errors.New("section was not found in project")
	ErrSectionVariantNotFound          = errors.New("section variant was not found in project")
	ErrSectionImplNotFound             = errors.New("section impl was not found in project")
	ErrSectionActiveVariantNotFound    = errors.New("section active variant was not found")
	ErrSectionDefaultVariantMissing    = errors.New("section default variant id is required when variants exist")
	ErrSectionVariantMembership        = errors.New("section variant must belong to the section")
	ErrSectionImplKindRequired         = errors.New("section impl kind is required")
	ErrUnsupportedSectionImplKind      = errors.New("unsupported section impl kind")
	ErrCodeSectionConfigRequired       = errors.New("code section config is required")
	ErrTerminalSectionConfigRequired   = errors.New("terminal section config is required")
	ErrDrawSectionConfigRequired       = errors.New("draw section config is required")
	ErrGeneratedSectionConfigRequired  = errors.New("generated section config is required")
	ErrGeneratedSectionKindRequired    = errors.New("generated section kind is required")
	ErrUnsupportedGeneratedSectionKind = errors.New("unsupported generated section kind")
	ErrCodeLanguageRequired            = errors.New("code language is required")
	ErrCodeFileBindingPathRequired     = errors.New("code file binding path is required")
	ErrDrawRenderedImagePathRequired   = errors.New("draw rendered image path is required")
	ErrTopLevelSectionNotFound         = errors.New("top-level section was not found in project")
	ErrDuplicateTopLevelSection        = errors.New("duplicate top-level section id")
	ErrParentSectionNotFound           = errors.New("parent section was not found in project")
	ErrSectionConflict                 = errors.New("section already exists")
	ErrSectionVariantConflict          = errors.New("section variant already exists")
	ErrSectionImplConflict             = errors.New("section impl already exists")
	ErrTerminalSeedRequired            = errors.New("terminal section seed is required")
	ErrCodeSectionRequired             = errors.New("section must resolve to a code section")
	ErrTerminalSectionRequired         = errors.New("section must resolve to a terminal section")
	ErrDrawSectionRequired             = errors.New("section must resolve to a draw section")
	ErrCallableSectionRequired         = errors.New("section must resolve to a callable section")
	ErrGroupSectionRequired            = errors.New("section must resolve to a group section")
	ErrChatSectionRequired             = errors.New("section must resolve to a chat section")
	ErrPromptSectionRequired           = errors.New("section must resolve to a prompt section")
	ErrPromptFormatInvalid             = errors.New("prompt format is invalid")
	ErrChatPermissionModeInvalid       = errors.New("chat permission mode is invalid")
	ErrChatDictationModeInvalid        = errors.New("chat dictation mode is invalid")
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

type TerminalSectionImpl struct{}

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

	if p.ViewModes != nil {
		cloned.ViewModes = make(map[string]ViewMode, len(p.ViewModes))
		for viewModeID, viewMode := range p.ViewModes {
			cloned.ViewModes[viewModeID] = viewMode.Clone()
		}
	}
	if p.CodegenTargets != nil {
		cloned.CodegenTargets = make([]ProjectCodegenTarget, len(p.CodegenTargets))
		for index, target := range p.CodegenTargets {
			cloned.CodegenTargets[index] = target.Clone()
		}
	}
	if p.TopLevelSections != nil {
		cloned.TopLevelSections = make(map[string]TopLevelSectionLayout, len(p.TopLevelSections))
		for sectionID, layout := range p.TopLevelSections {
			cloned.TopLevelSections[sectionID] = layout.Clone()
		}
	}
	if p.WindowSpaces != nil {
		cloned.WindowSpaces = make(map[string]WindowSpaceConfig, len(p.WindowSpaces))
		for windowSpaceID, windowSpace := range p.WindowSpaces {
			cloned.WindowSpaces[windowSpaceID] = windowSpace.Clone()
		}
	}
	if p.Edges != nil {
		cloned.Edges = make([]Edge, len(p.Edges))
		for index, edge := range p.Edges {
			cloned.Edges[index] = edge.Clone()
		}
	}
	if p.AgenticEdges != nil {
		cloned.AgenticEdges = make([]AgenticEdge, len(p.AgenticEdges))
		for index, edge := range p.AgenticEdges {
			cloned.AgenticEdges[index] = edge.Clone()
		}
	}
	if p.StateMachineEdges != nil {
		cloned.StateMachineEdges = make([]StateMachineEdge, len(p.StateMachineEdges))
		for index, edge := range p.StateMachineEdges {
			cloned.StateMachineEdges[index] = edge.Clone()
		}
	}
	if p.ProjectChatWindowing != nil {
		clonedWindowing := p.ProjectChatWindowing.Clone()
		cloned.ProjectChatWindowing = &clonedWindowing
	}

	if p.SectionVariantMap != nil {
		cloned.SectionVariantMap = make(map[string]string, len(p.SectionVariantMap))
		for sectionID, variantID := range p.SectionVariantMap {
			cloned.SectionVariantMap[sectionID] = variantID
		}
	}
	if p.Sections != nil {
		cloned.Sections = make(map[string]Section, len(p.Sections))
		for sectionID, section := range p.Sections {
			cloned.Sections[sectionID] = section.Clone()
		}
	}
	if p.SectionVariants != nil {
		cloned.SectionVariants = make(map[string]SectionVariant, len(p.SectionVariants))
		for variantID, variant := range p.SectionVariants {
			cloned.SectionVariants[variantID] = variant.Clone()
		}
	}
	if p.SectionImpls != nil {
		cloned.SectionImpls = make(map[string]SectionImpl, len(p.SectionImpls))
		for implID, impl := range p.SectionImpls {
			cloned.SectionImpls[implID] = impl.Clone()
		}
	}
	if p.CodeObjs != nil {
		cloned.CodeObjs = make(map[string]CodeObject, len(p.CodeObjs))
		for codeObjID, codeObj := range p.CodeObjs {
			cloned.CodeObjs[codeObjID] = codeObj.Clone()
		}
	}
	if p.CodeObjVariants != nil {
		cloned.CodeObjVariants = make(map[string]CodeObjectVariant, len(p.CodeObjVariants))
		for variantID, variant := range p.CodeObjVariants {
			cloned.CodeObjVariants[variantID] = variant.Clone()
		}
	}
	if p.CodeObjImpls != nil {
		cloned.CodeObjImpls = make(map[string]CodeObjectImpl, len(p.CodeObjImpls))
		for implID, impl := range p.CodeObjImpls {
			cloned.CodeObjImpls[implID] = impl.Clone()
		}
	}

	return cloned
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
	normalized.PreviewImgColor = strings.TrimSpace(normalized.PreviewImgColor)
	normalized.ActiveViewModeID = strings.TrimSpace(normalized.ActiveViewModeID)
	normalized.EntryCodeBlockID = strings.TrimSpace(normalized.EntryCodeBlockID)
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
	var err error
	if normalized.WindowSpaces != nil {
		normalized.WindowSpaces, err = normalizeWindowSpaces(
			normalized.WindowSpaces,
			normalized.Sections,
		)
		if err != nil {
			return Project{}, fmt.Errorf("normalize window spaces: %w", err)
		}
	}
	if normalized.CodeObjs == nil {
		normalized.CodeObjs = map[string]CodeObject{}
	}
	if normalized.CodeObjVariants == nil {
		normalized.CodeObjVariants = map[string]CodeObjectVariant{}
	}
	if normalized.CodeObjImpls == nil {
		normalized.CodeObjImpls = map[string]CodeObjectImpl{}
	}
	normalizedWindowing := ProjectChatWindowingOrDefault(
		normalized.ProjectChatWindowing,
	)
	normalizedWindowing, err = normalizeProjectChatWindowingState(
		normalizedWindowing,
		normalized.Sections,
	)
	if err != nil {
		return Project{}, fmt.Errorf("normalize project chat windowing: %w", err)
	}
	normalized.ProjectChatWindowing = &normalizedWindowing
	for index, target := range normalized.CodegenTargets {
		normalizedTarget, err := target.Normalized()
		if err != nil {
			return Project{}, fmt.Errorf("normalize codegen target %d: %w", index, err)
		}
		normalized.CodegenTargets[index] = normalizedTarget
	}
	normalized.GeneratedCodeBinding, err = normalizeCodeFileBinding(normalized.GeneratedCodeBinding)
	if err != nil {
		return Project{}, fmt.Errorf("normalize generated code binding: %w", err)
	}
	normalized.GeneratedMetadataBinding, err = normalizeCodeFileBinding(normalized.GeneratedMetadataBinding)
	if err != nil {
		return Project{}, fmt.Errorf("normalize generated metadata binding: %w", err)
	}
	for viewModeKey, viewMode := range normalized.ViewModes {
		if strings.TrimSpace(viewModeKey) == "" {
			return Project{}, ErrViewModeIDRequired
		}
		if strings.TrimSpace(viewMode.ID) == "" {
			return Project{}, ErrViewModeIDRequired
		}
		if viewMode.ID != viewModeKey {
			return Project{}, fmt.Errorf("%w: key=%q id=%q", ErrViewModeIDKeyMismatch, viewModeKey, viewMode.ID)
		}
		normalized.ViewModes[viewModeKey] = viewMode.Clone()
	}
	for index, edge := range normalized.Edges {
		edge.Style, err = normalizeRawJSON(edge.Style, fmt.Sprintf("edge %q style", edge.ID))
		if err != nil {
			return Project{}, err
		}
		edge.Data, err = normalizeRawJSON(edge.Data, fmt.Sprintf("edge %q data", edge.ID))
		if err != nil {
			return Project{}, err
		}
		normalized.Edges[index] = edge.Clone()
	}
	for index, edge := range normalized.AgenticEdges {
		edge.Style, err = normalizeRawJSON(edge.Style, fmt.Sprintf("agentic edge %q style", edge.ID))
		if err != nil {
			return Project{}, err
		}
		normalized.AgenticEdges[index] = edge.Clone()
	}
	for index, edge := range normalized.StateMachineEdges {
		normalizedEdge, normalizeErr := edge.Normalized()
		if normalizeErr != nil {
			return Project{}, normalizeErr
		}
		normalized.StateMachineEdges[index] = normalizedEdge
	}

	for sectionKey, section := range normalized.Sections {
		if strings.TrimSpace(sectionKey) == "" {
			return Project{}, ErrSectionIDRequired
		}
		if strings.TrimSpace(section.ID) == "" {
			return Project{}, ErrSectionIDRequired
		}
		if section.ID != sectionKey {
			return Project{}, fmt.Errorf("%w: key=%q id=%q", ErrSectionIDKeyMismatch, sectionKey, section.ID)
		}
		if strings.TrimSpace(section.Name) == "" {
			return Project{}, fmt.Errorf("%w: %q", ErrSectionNameRequired, section.ID)
		}
		if len(section.VariantIDs) > 0 && strings.TrimSpace(section.DefaultVariantID) == "" {
			return Project{}, fmt.Errorf("%w: %q", ErrSectionDefaultVariantMissing, section.ID)
		}
		if parentID := strings.TrimSpace(section.ParentSectionID); parentID != "" {
			if _, ok := normalized.Sections[parentID]; !ok {
				return Project{}, fmt.Errorf("%w: child=%q parent=%q", ErrParentSectionNotFound, section.ID, parentID)
			}
		}
		section.SharedModifier, err = normalizeRawJSON(section.SharedModifier, fmt.Sprintf("section %q sharedModifier", section.ID))
		if err != nil {
			return Project{}, err
		}
		normalized.Sections[sectionKey] = section.Clone()
	}

	for variantKey, variant := range normalized.SectionVariants {
		if strings.TrimSpace(variantKey) == "" {
			return Project{}, ErrSectionVariantIDRequired
		}
		if strings.TrimSpace(variant.ID) == "" {
			return Project{}, ErrSectionVariantIDRequired
		}
		if variant.ID != variantKey {
			return Project{}, fmt.Errorf("%w: key=%q id=%q", ErrSectionVariantIDKeyMismatch, variantKey, variant.ID)
		}
		if strings.TrimSpace(variant.ImplID) == "" {
			return Project{}, fmt.Errorf("%w: variant=%q", ErrSectionImplIDRequired, variant.ID)
		}
		if _, ok := normalized.SectionImpls[variant.ImplID]; !ok {
			return Project{}, fmt.Errorf("%w: variant=%q impl=%q", ErrSectionImplNotFound, variant.ID, variant.ImplID)
		}
		variant.Modifier, err = normalizeRawJSON(variant.Modifier, fmt.Sprintf("section variant %q modifier", variant.ID))
		if err != nil {
			return Project{}, err
		}
		normalized.SectionVariants[variantKey] = variant.Clone()
	}

	for implKey, impl := range normalized.SectionImpls {
		if strings.TrimSpace(implKey) == "" {
			return Project{}, ErrSectionImplIDRequired
		}
		if strings.TrimSpace(impl.ID) == "" {
			return Project{}, ErrSectionImplIDRequired
		}
		if impl.ID != implKey {
			return Project{}, fmt.Errorf("%w: key=%q id=%q", ErrSectionImplIDKeyMismatch, implKey, impl.ID)
		}
		impl.Payload, err = normalizeRawJSON(impl.Payload, fmt.Sprintf("section impl %q payload", impl.ID))
		if err != nil {
			return Project{}, err
		}
		if strings.TrimSpace(string(impl.Kind)) == "" {
			return Project{}, fmt.Errorf("%w: %q", ErrSectionImplKindRequired, impl.ID)
		}
		switch impl.Kind {
		case SectionKindCode:
			if impl.Code == nil {
				return Project{}, fmt.Errorf("%w: %q", ErrCodeSectionConfigRequired, impl.ID)
			}
			impl.Code.Language = normalizeCodeLanguage(impl.Code.Language)
			if impl.Code.Language == "" {
				return Project{}, fmt.Errorf("%w: %q", ErrCodeLanguageRequired, impl.ID)
			}
			if impl.Code.Binding != nil {
				if strings.TrimSpace(impl.Code.Binding.Path) == "" {
					return Project{}, fmt.Errorf("%w: %q", ErrCodeFileBindingPathRequired, impl.ID)
				}
			}
		case SectionKindTerminal:
			if impl.Terminal == nil {
				return Project{}, fmt.Errorf("%w: %q", ErrTerminalSectionConfigRequired, impl.ID)
			}
		case SectionKindDraw:
			if impl.Draw == nil {
				return Project{}, fmt.Errorf("%w: %q", ErrDrawSectionConfigRequired, impl.ID)
			}
		case SectionKindGenerated:
			if impl.Generated == nil {
				return Project{}, fmt.Errorf("%w: %q", ErrGeneratedSectionConfigRequired, impl.ID)
			}
			if strings.TrimSpace(string(impl.Generated.Kind)) == "" {
				return Project{}, fmt.Errorf("%w: %q", ErrGeneratedSectionKindRequired, impl.ID)
			}
			switch impl.Generated.Kind {
			case GeneratedSectionKindPythonCode, GeneratedSectionKindPythonMetadata, GeneratedSectionKindPlugin:
			default:
				return Project{}, fmt.Errorf("%w: %q", ErrUnsupportedGeneratedSectionKind, impl.Generated.Kind)
			}
		default:
			// Allow richer frontend section kinds to coexist with the narrower
			// run-planning helpers. The payload becomes the source of truth for
			// projection until Go owns that section kind semantically.
		}
		normalized.SectionImpls[implKey] = impl.Clone()
	}

	for codeObjKey, codeObj := range normalized.CodeObjs {
		if strings.TrimSpace(codeObjKey) == "" {
			return Project{}, ErrCodeObjIDRequired
		}
		if strings.TrimSpace(codeObj.ID) == "" {
			return Project{}, ErrCodeObjIDRequired
		}
		if codeObj.ID != codeObjKey {
			return Project{}, fmt.Errorf("%w: key=%q id=%q", ErrCodeObjIDKeyMismatch, codeObjKey, codeObj.ID)
		}
		if strings.TrimSpace(codeObj.Name) == "" {
			allowsEmptyName, allowErr := normalized.codeObjectAllowsEmptyName(codeObj.ID)
			if allowErr != nil {
				return Project{}, allowErr
			}
			if !allowsEmptyName {
				return Project{}, fmt.Errorf("%w: %q", ErrCodeObjNameRequired, codeObj.ID)
			}
		}
		if len(codeObj.VariantIDs) > 0 && strings.TrimSpace(codeObj.DefaultVariantID) == "" {
			return Project{}, fmt.Errorf("%w: %q", ErrCodeObjDefaultVariantMissing, codeObj.ID)
		}
		codeObj.SharedModifier, err = normalizeRawJSON(codeObj.SharedModifier, fmt.Sprintf("code object %q sharedModifier", codeObj.ID))
		if err != nil {
			return Project{}, err
		}
		normalized.CodeObjs[codeObjKey] = codeObj.Clone()
	}

	for variantKey, variant := range normalized.CodeObjVariants {
		if strings.TrimSpace(variantKey) == "" {
			return Project{}, ErrCodeObjVariantIDRequired
		}
		if strings.TrimSpace(variant.ID) == "" {
			return Project{}, ErrCodeObjVariantIDRequired
		}
		if variant.ID != variantKey {
			return Project{}, fmt.Errorf("%w: key=%q id=%q", ErrCodeObjVariantIDKeyMismatch, variantKey, variant.ID)
		}
		if strings.TrimSpace(variant.ImplID) == "" {
			return Project{}, fmt.Errorf("%w: variant=%q", ErrCodeObjImplIDRequired, variant.ID)
		}
		if _, ok := normalized.CodeObjImpls[variant.ImplID]; !ok {
			return Project{}, fmt.Errorf("%w: variant=%q impl=%q", ErrCodeObjImplNotFound, variant.ID, variant.ImplID)
		}
		variant.Modifier, err = normalizeRawJSON(variant.Modifier, fmt.Sprintf("code object variant %q modifier", variant.ID))
		if err != nil {
			return Project{}, err
		}
		normalized.CodeObjVariants[variantKey] = variant.Clone()
	}

	for implKey, impl := range normalized.CodeObjImpls {
		if strings.TrimSpace(implKey) == "" {
			return Project{}, ErrCodeObjImplIDRequired
		}
		if strings.TrimSpace(impl.ID) == "" {
			return Project{}, ErrCodeObjImplIDRequired
		}
		if impl.ID != implKey {
			return Project{}, fmt.Errorf("%w: key=%q id=%q", ErrCodeObjImplIDKeyMismatch, implKey, impl.ID)
		}
		if strings.TrimSpace(impl.Type) == "" {
			return Project{}, fmt.Errorf("%w: %q", ErrCodeObjImplTypeRequired, impl.ID)
		}
		impl.Payload, err = normalizeRawJSON(impl.Payload, fmt.Sprintf("code object impl %q payload", impl.ID))
		if err != nil {
			return Project{}, err
		}
		normalized.CodeObjImpls[implKey] = impl.Clone()
	}

	if err := normalized.normalizeViewModesOnLoad(); err != nil {
		return Project{}, fmt.Errorf("normalize view modes: %w", err)
	}
	normalized.ActiveIDs = pruneStaleSectionIDs(normalized.ActiveIDs, normalized.Sections)

	topLevelSeen := make(map[string]struct{}, len(normalized.TopLevelSectionIDs))
	for _, sectionID := range normalized.TopLevelSectionIDs {
		if _, ok := normalized.Sections[sectionID]; !ok {
			return Project{}, fmt.Errorf("%w: %q", ErrTopLevelSectionNotFound, sectionID)
		}
		if _, ok := topLevelSeen[sectionID]; ok {
			return Project{}, fmt.Errorf("%w: %q", ErrDuplicateTopLevelSection, sectionID)
		}
		topLevelSeen[sectionID] = struct{}{}
	}
	for sectionID := range normalized.TopLevelSections {
		if _, ok := normalized.Sections[sectionID]; !ok {
			return Project{}, fmt.Errorf("%w: %q", ErrTopLevelSectionNotFound, sectionID)
		}
	}
	for viewModeID, viewMode := range normalized.ViewModes {
		for sectionID := range viewMode.TopLevelSections {
			if _, ok := normalized.Sections[sectionID]; !ok {
				return Project{}, fmt.Errorf("%w: viewMode=%q section=%q", ErrTopLevelSectionNotFound, viewModeID, sectionID)
			}
		}
	}
	if normalized.ActiveViewModeID != "" {
		if _, ok := normalized.ViewModes[normalized.ActiveViewModeID]; !ok {
			return Project{}, fmt.Errorf("%w: %q", ErrViewModeNotFound, normalized.ActiveViewModeID)
		}
	}

	for sectionID, activeVariantID := range normalized.SectionVariantMap {
		section, ok := normalized.Sections[sectionID]
		if !ok {
			return Project{}, fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
		}
		if _, ok := normalized.SectionVariants[activeVariantID]; !ok {
			return Project{}, fmt.Errorf("%w: section=%q variant=%q", ErrSectionActiveVariantNotFound, sectionID, activeVariantID)
		}
		if !containsString(section.VariantIDs, activeVariantID) {
			return Project{}, fmt.Errorf("%w: section=%q variant=%q", ErrSectionVariantMembership, sectionID, activeVariantID)
		}
	}

	for sectionID, section := range normalized.Sections {
		for _, variantID := range section.VariantIDs {
			if _, ok := normalized.SectionVariants[variantID]; !ok {
				return Project{}, fmt.Errorf("%w: section=%q variant=%q", ErrSectionVariantNotFound, sectionID, variantID)
			}
		}
		if section.DefaultVariantID != "" && !containsString(section.VariantIDs, section.DefaultVariantID) {
			return Project{}, fmt.Errorf("%w: section=%q variant=%q", ErrSectionVariantMembership, sectionID, section.DefaultVariantID)
		}
	}
	for codeObjID, codeObj := range normalized.CodeObjs {
		for _, variantID := range codeObj.VariantIDs {
			if _, ok := normalized.CodeObjVariants[variantID]; !ok {
				return Project{}, fmt.Errorf("%w: codeObj=%q variant=%q", ErrCodeObjVariantNotFound, codeObjID, variantID)
			}
		}
		if codeObj.DefaultVariantID != "" && !containsString(codeObj.VariantIDs, codeObj.DefaultVariantID) {
			return Project{}, fmt.Errorf("%w: codeObj=%q variant=%q", ErrCodeObjVariantMembership, codeObjID, codeObj.DefaultVariantID)
		}
	}

	if normalized.EntryCodeBlockID != "" {
		if _, ok := normalized.Sections[normalized.EntryCodeBlockID]; !ok {
			return Project{}, fmt.Errorf("%w: %q", ErrEntrySectionNotFound, normalized.EntryCodeBlockID)
		}
	}

	if err := normalized.ReconcileCodeSectionBindings(); err != nil {
		return Project{}, fmt.Errorf("reconcile code section bindings: %w", err)
	}
	if err := normalized.ReconcileGeneratedSectionBindings(); err != nil {
		return Project{}, fmt.Errorf("reconcile generated section bindings: %w", err)
	}

	return normalized, nil
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
