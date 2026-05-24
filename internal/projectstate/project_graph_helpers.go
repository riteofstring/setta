package projectstate

import (
	"fmt"
	"strings"
)

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
