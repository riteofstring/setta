package projectstate

import (
	"errors"
	"fmt"
	"strings"
)

var (
	ErrSectionIDRequired             = errors.New("section id is required")
	ErrSectionNameRequired           = errors.New("section name is required")
	ErrSectionIDKeyMismatch          = errors.New("section id must match its map key")
	ErrProjectNotFound               = errors.New("project was not found in document")
	ErrSectionVariantIDRequired      = errors.New("section variant id is required")
	ErrSectionVariantIDKeyMismatch   = errors.New("section variant id must match its map key")
	ErrSectionImplIDRequired         = errors.New("section impl id is required")
	ErrSectionImplIDKeyMismatch      = errors.New("section impl id must match its map key")
	ErrEntrySectionNotFound          = errors.New("entry code block id was not found in sections")
	ErrSectionNotFound               = errors.New("section was not found in project")
	ErrSectionVariantNotFound        = errors.New("section variant was not found in project")
	ErrSectionImplNotFound           = errors.New("section impl was not found in project")
	ErrSectionActiveVariantNotFound  = errors.New("section active variant was not found")
	ErrSectionDefaultVariantMissing  = errors.New("section default variant id is required when variants exist")
	ErrSectionVariantMembership      = errors.New("section variant must belong to the section")
	ErrSectionImplKindRequired       = errors.New("section impl kind is required")
	ErrUnsupportedSectionImplKind    = errors.New("unsupported section impl kind")
	ErrCodeSectionConfigRequired     = errors.New("code section config is required")
	ErrTerminalSectionConfigRequired = errors.New("terminal section config is required")
	ErrDrawSectionConfigRequired     = errors.New("draw section config is required")
	ErrCodeLanguageRequired          = errors.New("code language is required")
	ErrCodeFileBindingPathRequired   = errors.New("code file binding path is required")
	ErrDrawRenderedImagePathRequired = errors.New("draw rendered image path is required")
	ErrTopLevelSectionNotFound       = errors.New("top-level section was not found in project")
	ErrDuplicateTopLevelSection      = errors.New("duplicate top-level section id")
	ErrParentSectionNotFound         = errors.New("parent section was not found in project")
	ErrSectionConflict               = errors.New("section already exists")
	ErrSectionVariantConflict        = errors.New("section variant already exists")
	ErrSectionImplConflict           = errors.New("section impl already exists")
	ErrTerminalSeedRequired          = errors.New("terminal section seed is required")
	ErrCodeSectionRequired           = errors.New("section must resolve to a code section")
	ErrTerminalSectionRequired       = errors.New("section must resolve to a terminal section")
	ErrDrawSectionRequired           = errors.New("section must resolve to a draw section")
)

type SectionKind string

const (
	SectionKindCode     SectionKind = "code"
	SectionKindTerminal SectionKind = "terminal"
	SectionKindDraw     SectionKind = "draw"
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
)

type Section struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	VariantIDs       []string `json:"variantIds,omitempty"`
	DefaultVariantID string   `json:"defaultVariantId,omitempty"`
	ParentSectionID  string   `json:"parentSectionId,omitempty"`
}

type SectionVariant struct {
	ID     string `json:"id"`
	ImplID string `json:"implId"`
}

type SectionImpl struct {
	ID       string               `json:"id"`
	Kind     SectionKind          `json:"kind"`
	Code     *CodeSectionImpl     `json:"code,omitempty"`
	Terminal *TerminalSectionImpl `json:"terminal,omitempty"`
	Draw     *DrawSectionImpl     `json:"draw,omitempty"`
}

type CodeSectionImpl struct {
	Language                  CodeLanguage     `json:"language"`
	Binding                   *CodeFileBinding `json:"binding,omitempty"`
	AttachedTerminalSectionID string           `json:"attachedTerminalSectionId,omitempty"`
	Children                  []string         `json:"children,omitempty"`
}

type CodeFileBinding struct {
	Path       string             `json:"path"`
	AccessMode CodeFileAccessMode `json:"accessMode,omitempty"`
}

type TerminalSectionImpl struct{}

type DrawSectionImpl struct {
	RenderedImagePath string `json:"renderedImagePath,omitempty"`
}

func (p Project) Clone() Project {
	cloned := p
	cloned.TopLevelSectionIDs = append([]string(nil), p.TopLevelSectionIDs...)

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
			cloned.SectionVariants[variantID] = variant
		}
	}
	if p.SectionImpls != nil {
		cloned.SectionImpls = make(map[string]SectionImpl, len(p.SectionImpls))
		for implID, impl := range p.SectionImpls {
			cloned.SectionImpls[implID] = impl.Clone()
		}
	}

	return cloned
}

func (s Section) Clone() Section {
	cloned := s
	cloned.VariantIDs = append([]string(nil), s.VariantIDs...)
	return cloned
}

func (i SectionImpl) Clone() SectionImpl {
	cloned := i
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
	return cloned
}

func (p Project) Normalized() (Project, error) {
	normalized := p.Clone()
	if normalized.SectionVariantMap == nil {
		normalized.SectionVariantMap = map[string]string{}
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
		if strings.TrimSpace(string(impl.Kind)) == "" {
			return Project{}, fmt.Errorf("%w: %q", ErrSectionImplKindRequired, impl.ID)
		}
		switch impl.Kind {
		case SectionKindCode:
			if impl.Code == nil {
				return Project{}, fmt.Errorf("%w: %q", ErrCodeSectionConfigRequired, impl.ID)
			}
			if strings.TrimSpace(string(impl.Code.Language)) == "" {
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
		default:
			return Project{}, fmt.Errorf("%w: %q", ErrUnsupportedSectionImplKind, impl.Kind)
		}
		normalized.SectionImpls[implKey] = impl.Clone()
	}

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

	if normalized.EntryCodeBlockID != "" {
		if _, ok := normalized.Sections[normalized.EntryCodeBlockID]; !ok {
			return Project{}, fmt.Errorf("%w: %q", ErrEntrySectionNotFound, normalized.EntryCodeBlockID)
		}
	}

	return normalized, nil
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

func (i SectionImpl) IsRunnableCode() bool {
	if !i.IsCode() {
		return false
	}
	return i.Code.Language == CodeLanguagePython || i.Code.Language == CodeLanguageBash
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
