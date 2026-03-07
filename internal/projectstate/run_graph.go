package projectstate

import (
	"fmt"
	"strings"
)

type ResolvedRunTarget struct {
	Project Project
	Section Section
	Variant SectionVariant
	Impl    SectionImpl
}

type TerminalSectionSeed struct {
	SectionID string
	VariantID string
	ImplID    string
	Name      string
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
	return project, nil
}

func (d Document) ResolveRunTarget(projectID string, sectionID string) (ResolvedRunTarget, error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return ResolvedRunTarget{}, err
	}

	resolvedSectionID := strings.TrimSpace(sectionID)
	if resolvedSectionID == "" {
		resolvedSectionID = project.EntryCodeBlockID
	}
	if resolvedSectionID == "" {
		return ResolvedRunTarget{Project: project}, nil
	}

	section, variant, impl, err := project.ResolveSection(resolvedSectionID)
	if err != nil {
		return ResolvedRunTarget{}, err
	}
	return ResolvedRunTarget{
		Project: project,
		Section: section,
		Variant: variant,
		Impl:    impl,
	}, nil
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
	code := target.Impl.Code
	if code.AttachedTerminalSectionID != trimmedTerminalID {
		return false, nil
	}
	if len(code.Children) != 1 || code.Children[0] != trimmedTerminalID {
		return false, nil
	}

	terminalSection, _, terminalImpl, err := target.Project.ResolveSection(trimmedTerminalID)
	if err != nil {
		return false, nil
	}
	if !terminalImpl.IsTerminal() {
		return false, nil
	}
	if terminalSection.ParentSectionID != target.Section.ID {
		return false, nil
	}
	if target.Project.HasTopLevelSection(trimmedTerminalID) {
		return false, nil
	}
	return true, nil
}

func (d *Document) EnsureCodeSectionAttachedTerminal(projectID string, sectionID string, seed TerminalSectionSeed) (string, error) {
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

	existingTerminalID := strings.TrimSpace(target.Impl.Code.AttachedTerminalSectionID)
	if existingTerminalID != "" {
		valid, err := d.ValidateAttachedTerminal(projectID, target.Section.ID, existingTerminalID)
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
		ParentSectionID:  target.Section.ID,
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

	updatedImpl := target.Impl.Clone()
	updatedImpl.Code.AttachedTerminalSectionID = normalizedSeed.SectionID
	updatedImpl.Code.Children = []string{normalizedSeed.SectionID}
	project.SectionImpls[updatedImpl.ID] = updatedImpl

	d.Projects[project.ID] = project
	return normalizedSeed.SectionID, nil
}

func (d *Document) CreateTemporaryTerminal(projectID string, seed TerminalSectionSeed) (string, error) {
	if d == nil {
		return "", fmt.Errorf("document is required")
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return "", err
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
	project.TopLevelSectionIDs = append(project.TopLevelSectionIDs, normalizedSeed.SectionID)

	d.Projects[project.ID] = project
	return normalizedSeed.SectionID, nil
}

func (r *Runtime) EnsureCodeSectionAttachedTerminal(projectID string, sectionID string, seed TerminalSectionSeed) (Snapshot, string, error) {
	var terminalID string
	snapshot, err := r.Mutate(func(document Document) (Document, error) {
		nextDocument := document.Clone()
		resolvedTerminalID, mutateErr := nextDocument.EnsureCodeSectionAttachedTerminal(projectID, sectionID, seed)
		if mutateErr != nil {
			return nextDocument, mutateErr
		}
		terminalID = resolvedTerminalID
		return nextDocument, nil
	})
	return snapshot, terminalID, err
}

func (r *Runtime) CreateTemporaryTerminal(projectID string, seed TerminalSectionSeed) (Snapshot, string, error) {
	var terminalID string
	snapshot, err := r.Mutate(func(document Document) (Document, error) {
		nextDocument := document.Clone()
		resolvedTerminalID, mutateErr := nextDocument.CreateTemporaryTerminal(projectID, seed)
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
