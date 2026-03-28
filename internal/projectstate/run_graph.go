package projectstate

import (
	"fmt"
	"strings"
)

type ResolvedRunTarget struct {
	Kind      RunTargetKind
	Project   Project
	Section   Section
	Variant   SectionVariant
	Impl      SectionImpl
	Generated *ResolvedGeneratedEntry
}

type TerminalSectionSeed struct {
	SectionID string
	VariantID string
	ImplID    string
	Name      string
}

type RunTargetKind string

const (
	RunTargetKindManualCode     RunTargetKind = "manual_code"
	RunTargetKindGeneratedEntry RunTargetKind = "generated_entry"
)

type ResolvedGeneratedEntry struct {
	CodeBinding       *CodeFileBinding
	MetadataBinding   *CodeFileBinding
	UsesPluginCodegen bool
}

func (d Document) ProjectByID(projectID string) (Project, error) {
	trimmedProjectID := strings.TrimSpace(projectID)
	if trimmedProjectID == "" {
		return Project{}, ErrProjectIDRequired
	}

	project, ok := d.Projects[trimmedProjectID]
	if !ok {
		return Project{}, fmt.Errorf("%w: %q", ErrProjectNotFound, trimmedProjectID)
	}
	project.passwordSecrets = d.passwordSecrets
	return project, nil
}

func (d Document) ResolveRunTarget(projectID string, sectionID string) (ResolvedRunTarget, error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return ResolvedRunTarget{}, err
	}

	resolvedSectionID := strings.TrimSpace(sectionID)
	if resolvedSectionID == "" {
		if project.HasPythonCodegenTarget() {
			return project.resolveGeneratedEntryRunTarget(false), nil
		}
		resolvedSectionID = project.EntryCodeBlockID
	}
	if resolvedSectionID == "" {
		return ResolvedRunTarget{Project: project}, nil
	}

	section, variant, impl, err := project.ResolveSection(resolvedSectionID)
	if err != nil {
		return ResolvedRunTarget{}, err
	}
	if impl.IsGeneratedEntrySection() {
		return project.resolveGeneratedEntryRunTarget(impl.UsesPluginCodegen()), nil
	}
	return ResolvedRunTarget{
		Kind:    RunTargetKindManualCode,
		Project: project,
		Section: section,
		Variant: variant,
		Impl:    impl,
	}, nil
}

func (p Project) resolveGeneratedEntryRunTarget(usesPluginCodegen bool) ResolvedRunTarget {
	return ResolvedRunTarget{
		Kind:    RunTargetKindGeneratedEntry,
		Project: p,
		Generated: &ResolvedGeneratedEntry{
			CodeBinding:       cloneCodeFileBinding(p.GeneratedCodeBinding),
			MetadataBinding:   cloneCodeFileBinding(p.GeneratedMetadataBinding),
			UsesPluginCodegen: usesPluginCodegen,
		},
	}
}

func (p Project) ResolveSectionWithVariant(sectionID string, variantID string) (Section, SectionVariant, SectionImpl, error) {
	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return Section{}, SectionVariant{}, SectionImpl{}, ErrSectionIDRequired
	}
	trimmedVariantID := strings.TrimSpace(variantID)
	if trimmedVariantID == "" {
		return Section{}, SectionVariant{}, SectionImpl{}, ErrSectionVariantIDRequired
	}

	section, ok := p.Sections[trimmedSectionID]
	if !ok {
		return Section{}, SectionVariant{}, SectionImpl{}, fmt.Errorf("%w: %q", ErrSectionNotFound, trimmedSectionID)
	}
	if !containsString(section.VariantIDs, trimmedVariantID) {
		return Section{}, SectionVariant{}, SectionImpl{}, fmt.Errorf("%w: section=%q variant=%q", ErrSectionVariantMembership, trimmedSectionID, trimmedVariantID)
	}

	variant, ok := p.SectionVariants[trimmedVariantID]
	if !ok {
		return Section{}, SectionVariant{}, SectionImpl{}, fmt.Errorf("%w: %q", ErrSectionVariantNotFound, trimmedVariantID)
	}
	impl, ok := p.SectionImpls[variant.ImplID]
	if !ok {
		return Section{}, SectionVariant{}, SectionImpl{}, fmt.Errorf("%w: %q", ErrSectionImplNotFound, variant.ImplID)
	}

	return section, variant, impl, nil
}

func (d Document) ValidateAttachedTerminal(projectID string, sectionID string, terminalSectionID string) (bool, error) {
	trimmedTerminalID := strings.TrimSpace(terminalSectionID)
	if trimmedTerminalID == "" {
		return false, nil
	}

	target, err := d.ResolveRunTarget(projectID, sectionID)
	if err != nil {
		return false, err
	}
	if !target.Impl.IsCode() {
		return false, nil
	}
	return validateAttachedTerminalTarget(target.Project, target.Section, target.Impl, trimmedTerminalID), nil
}

func (d Document) ValidateAttachedTerminalForVariant(projectID string, sectionID string, variantID string, terminalSectionID string) (bool, error) {
	trimmedTerminalID := strings.TrimSpace(terminalSectionID)
	if trimmedTerminalID == "" {
		return false, nil
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return false, err
	}
	section, _, impl, err := project.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return false, err
	}
	if !impl.IsCode() {
		return false, nil
	}
	return validateAttachedTerminalTarget(project, section, impl, trimmedTerminalID), nil
}

func validateAttachedTerminalTarget(project Project, targetSection Section, targetImpl SectionImpl, terminalSectionID string) bool {
	if !targetImpl.IsCode() || targetImpl.Code == nil {
		return false
	}
	if targetImpl.Code.AttachedTerminalSectionID != terminalSectionID {
		return false
	}
	if len(targetImpl.Code.Children) != 1 || targetImpl.Code.Children[0] != terminalSectionID {
		return false
	}

	terminalSection, _, terminalImpl, err := project.ResolveSection(terminalSectionID)
	if err != nil {
		return false
	}
	if !terminalImpl.IsTerminal() {
		return false
	}
	if terminalSection.ParentSectionID != targetSection.ID {
		return false
	}
	if project.HasTopLevelSection(terminalSectionID) {
		return false
	}
	return true
}

func (d *Document) EnsureCodeSectionAttachedTerminal(projectID string, sectionID string, seed TerminalSectionSeed) (string, error) {
	return d.EnsureCodeSectionAttachedTerminalWithSettings(projectID, sectionID, seed, DefaultStructuralMutationSettings())
}

func (d *Document) EnsureCodeSectionAttachedTerminalWithSettings(projectID string, sectionID string, seed TerminalSectionSeed, settings StructuralMutationSettings) (string, error) {
	if d == nil {
		return "", fmt.Errorf("document is required")
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return "", err
	}
	target, err := d.ResolveRunTarget(projectID, sectionID)
	if err != nil {
		return "", err
	}
	if !target.Impl.IsCode() {
		return "", ErrCodeSectionRequired
	}
	return d.ensureCodeSectionAttachedTerminalForVariant(project, target.Section, target.Variant, target.Impl, seed, settings)
}

func (d *Document) EnsureCodeSectionAttachedTerminalForVariant(projectID string, sectionID string, variantID string, seed TerminalSectionSeed) (string, error) {
	return d.EnsureCodeSectionAttachedTerminalForVariantWithSettings(projectID, sectionID, variantID, seed, DefaultStructuralMutationSettings())
}

func (d *Document) EnsureCodeSectionAttachedTerminalForVariantWithSettings(projectID string, sectionID string, variantID string, seed TerminalSectionSeed, settings StructuralMutationSettings) (string, error) {
	if d == nil {
		return "", fmt.Errorf("document is required")
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return "", err
	}
	section, variant, impl, err := project.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return "", err
	}
	if !impl.IsCode() {
		return "", ErrCodeSectionRequired
	}
	return d.ensureCodeSectionAttachedTerminalForVariant(project, section, variant, impl, seed, settings)
}

func (d *Document) ensureCodeSectionAttachedTerminalForVariant(project Project, section Section, variant SectionVariant, impl SectionImpl, seed TerminalSectionSeed, settings StructuralMutationSettings) (string, error) {
	existingTerminalID := strings.TrimSpace(impl.Code.AttachedTerminalSectionID)
	if existingTerminalID != "" {
		valid, err := d.ValidateAttachedTerminalForVariant(project.ID, section.ID, variant.ID, existingTerminalID)
		if err != nil {
			return "", err
		}
		if valid {
			return existingTerminalID, nil
		}
	}

	normalizedSeed, err := seed.Normalized()
	if err != nil {
		return "", err
	}
	if err := ensureTerminalSeedAvailable(project, normalizedSeed); err != nil {
		return "", err
	}

	project.Sections[normalizedSeed.SectionID] = Section{
		ID:               normalizedSeed.SectionID,
		Name:             normalizedSeed.Name,
		VariantIDs:       []string{normalizedSeed.VariantID},
		DefaultVariantID: normalizedSeed.VariantID,
		ParentSectionID:  section.ID,
	}
	project.SectionVariants[normalizedSeed.VariantID] = SectionVariant{
		ID:     normalizedSeed.VariantID,
		ImplID: normalizedSeed.ImplID,
	}
	project.SectionImpls[normalizedSeed.ImplID] = SectionImpl{
		ID:       normalizedSeed.ImplID,
		Kind:     SectionKindTerminal,
		Terminal: &TerminalSectionImpl{},
	}
	project.SectionVariantMap[normalizedSeed.SectionID] = normalizedSeed.VariantID
	normalizedSettings := normalizeStructuralMutationSettings(settings)
	if err := project.attachCodeSectionTerminal(
		section,
		variant,
		impl,
		normalizedSeed.SectionID,
		normalizedSettings.SectionSizingPolicy,
		normalizedSettings.TerminalDefaultHeight,
	); err != nil {
		return "", err
	}

	d.Projects[project.ID] = project
	return normalizedSeed.SectionID, nil
}

func (d *Document) CreateTemporaryTerminal(projectID string, seed TerminalSectionSeed) (string, error) {
	return d.CreateTemporaryTerminalWithSettings(projectID, seed, DefaultStructuralMutationSettings())
}

func (d *Document) CreateTemporaryTerminalWithSettings(projectID string, seed TerminalSectionSeed, settings StructuralMutationSettings) (string, error) {
	if d == nil {
		return "", fmt.Errorf("document is required")
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return "", err
	}
	project.pruneTopLevelCreationViewState()

	normalizedSeed, err := seed.Normalized()
	if err != nil {
		return "", err
	}
	if err := ensureTerminalSeedAvailable(project, normalizedSeed); err != nil {
		return "", err
	}
	normalizedSettings := normalizeStructuralMutationSettings(settings)

	payload, err := buildCreatedSectionPayload(
		normalizedSeed.ImplID,
		"Terminal",
		createdTerminalSectionDefaults(),
		normalizedSettings,
		nil,
	)
	if err != nil {
		return "", err
	}

	project.Sections[normalizedSeed.SectionID] = Section{
		ID:               normalizedSeed.SectionID,
		Name:             normalizedSeed.Name,
		VariantIDs:       []string{normalizedSeed.VariantID},
		DefaultVariantID: normalizedSeed.VariantID,
	}
	project.SectionVariants[normalizedSeed.VariantID] = SectionVariant{
		ID:     normalizedSeed.VariantID,
		ImplID: normalizedSeed.ImplID,
	}
	project.SectionImpls[normalizedSeed.ImplID] = SectionImpl{
		ID:      normalizedSeed.ImplID,
		Kind:    SectionKindTerminal,
		Payload: payload,
		Terminal: &TerminalSectionImpl{
			SessionMode: TerminalSessionModeManagedConsole,
		},
	}
	project.SectionVariantMap[normalizedSeed.SectionID] = normalizedSeed.VariantID

	if layout, ok := project.existingTopLevelSectionLayout(normalizedSeed.SectionID); ok {
		project.addTopLevelSectionViewState(normalizedSeed.SectionID, layout)
	} else {
		position, err := project.resolveDeterministicCreateTopLevelSectionPosition(
			normalizedSettings.SectionSizingPolicy,
			"Terminal",
			payload,
		)
		if err != nil {
			return "", err
		}
		project.addTopLevelSectionViewState(normalizedSeed.SectionID, TopLevelSectionLayout{
			X:      position.X,
			Y:      position.Y,
			ZIndex: project.nextCreateTopLevelSectionZIndex(),
		})
	}

	d.Projects[project.ID] = project
	return normalizedSeed.SectionID, nil
}

func (r *Runtime) EnsureCodeSectionAttachedTerminal(projectID string, sectionID string, seed TerminalSectionSeed) (Snapshot, string, error) {
	return r.EnsureCodeSectionAttachedTerminalWithSettings(projectID, sectionID, seed, DefaultStructuralMutationSettings())
}

func (r *Runtime) EnsureCodeSectionAttachedTerminalWithSettings(projectID string, sectionID string, seed TerminalSectionSeed, settings StructuralMutationSettings) (Snapshot, string, error) {
	var terminalID string
	snapshot, err := r.Mutate(func(document Document) (Document, error) {
		nextDocument := document.Clone()
		resolvedTerminalID, mutateErr := nextDocument.EnsureCodeSectionAttachedTerminalWithSettings(projectID, sectionID, seed, settings)
		if mutateErr != nil {
			return nextDocument, mutateErr
		}
		terminalID = resolvedTerminalID
		return nextDocument, nil
	})
	return snapshot, terminalID, err
}

func (r *Runtime) EnsureCodeSectionAttachedTerminalForVariant(projectID string, sectionID string, variantID string, seed TerminalSectionSeed) (Snapshot, string, error) {
	return r.EnsureCodeSectionAttachedTerminalForVariantWithSettings(projectID, sectionID, variantID, seed, DefaultStructuralMutationSettings())
}

func (r *Runtime) EnsureCodeSectionAttachedTerminalForVariantWithSettings(projectID string, sectionID string, variantID string, seed TerminalSectionSeed, settings StructuralMutationSettings) (Snapshot, string, error) {
	var terminalID string
	snapshot, err := r.Mutate(func(document Document) (Document, error) {
		nextDocument := document.Clone()
		resolvedTerminalID, mutateErr := nextDocument.EnsureCodeSectionAttachedTerminalForVariantWithSettings(projectID, sectionID, variantID, seed, settings)
		if mutateErr != nil {
			return nextDocument, mutateErr
		}
		terminalID = resolvedTerminalID
		return nextDocument, nil
	})
	return snapshot, terminalID, err
}

func (r *Runtime) CreateTemporaryTerminal(projectID string, seed TerminalSectionSeed) (Snapshot, string, error) {
	return r.CreateTemporaryTerminalWithSettings(projectID, seed, DefaultStructuralMutationSettings())
}

func (r *Runtime) CreateTemporaryTerminalWithSettings(projectID string, seed TerminalSectionSeed, settings StructuralMutationSettings) (Snapshot, string, error) {
	var terminalID string
	snapshot, err := r.Mutate(func(document Document) (Document, error) {
		nextDocument := document.Clone()
		resolvedTerminalID, mutateErr := nextDocument.CreateTemporaryTerminalWithSettings(projectID, seed, settings)
		if mutateErr != nil {
			return nextDocument, mutateErr
		}
		terminalID = resolvedTerminalID
		return nextDocument, nil
	})
	return snapshot, terminalID, err
}

func (s TerminalSectionSeed) Normalized() (TerminalSectionSeed, error) {
	normalized := TerminalSectionSeed{
		SectionID: strings.TrimSpace(s.SectionID),
		VariantID: strings.TrimSpace(s.VariantID),
		ImplID:    strings.TrimSpace(s.ImplID),
		Name:      strings.TrimSpace(s.Name),
	}
	if normalized.SectionID == "" || normalized.VariantID == "" || normalized.ImplID == "" {
		return TerminalSectionSeed{}, ErrTerminalSeedRequired
	}
	if normalized.Name == "" {
		normalized.Name = "Terminal"
	}
	return normalized, nil
}

func ensureTerminalSeedAvailable(project Project, seed TerminalSectionSeed) error {
	if _, ok := project.Sections[seed.SectionID]; ok {
		return fmt.Errorf("%w: %q", ErrSectionConflict, seed.SectionID)
	}
	if _, ok := project.SectionVariants[seed.VariantID]; ok {
		return fmt.Errorf("%w: %q", ErrSectionVariantConflict, seed.VariantID)
	}
	if _, ok := project.SectionImpls[seed.ImplID]; ok {
		return fmt.Errorf("%w: %q", ErrSectionImplConflict, seed.ImplID)
	}
	return nil
}
