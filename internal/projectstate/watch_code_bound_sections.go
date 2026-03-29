package projectstate

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/watchcode"
)

type WatchCodeBoundSection struct {
	ProjectID    string
	SectionID    string
	RelativePath string
	SourcePath   string
	Code         string
	IgnoreState  CodeSectionDiagnosticsIgnoreState
}

func (d Document) ResolveWatchCodeBoundSection(projectID string, sectionID string, workspaceRoot string) (WatchCodeBoundSection, bool, error) {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return WatchCodeBoundSection{}, false, err
	}
	section, ok, err := project.ResolveWatchCodeBoundSection(sectionID, workspaceRoot)
	if err != nil || !ok {
		return section, ok, err
	}
	section.ProjectID = project.ID
	return section, true, nil
}

func (d *Document) ApplyWatchCodeBoundSectionUpdate(
	ctx context.Context,
	projectID string,
	sectionID string,
	workspaceRoot string,
	resolver CallableSignatureResolver,
) (bool, error) {
	if d == nil {
		return false, ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return false, err
	}
	didUpdate, err := project.ApplyWatchCodeBoundSectionUpdate(ctx, sectionID, workspaceRoot, resolver)
	if err != nil {
		return false, err
	}
	d.Projects[project.ID] = project
	return didUpdate, nil
}

func (p Project) ResolveWatchCodeBoundSection(sectionID string, workspaceRoot string) (WatchCodeBoundSection, bool, error) {
	if !p.WatchCodeEnabled || !p.HasPythonCodegenTarget() {
		return WatchCodeBoundSection{}, false, nil
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return WatchCodeBoundSection{}, false, ErrSectionIDRequired
	}

	section, _, impl, err := p.ResolveSection(trimmedSectionID)
	if err != nil {
		return WatchCodeBoundSection{}, false, err
	}
	if !impl.IsCode() || impl.Code == nil || impl.Code.Language != CodeLanguagePython || impl.Code.Binding == nil {
		return WatchCodeBoundSection{}, false, nil
	}

	relativePath, ok, err := normalizeWatchCodeInputPath(workspaceRoot, impl.Code.Binding.Path, "code binding")
	if err != nil {
		return WatchCodeBoundSection{}, false, err
	}
	if !ok {
		return WatchCodeBoundSection{}, false, nil
	}

	code, ok, err := watchCodeBoundSectionSource(p, section.ID, workspaceRoot, relativePath)
	if err != nil {
		return WatchCodeBoundSection{}, false, err
	}
	if !ok {
		return WatchCodeBoundSection{}, false, nil
	}

	sourcePath, err := resolveWatchCodeAbsolutePath(workspaceRoot, relativePath, "code binding")
	if err != nil {
		return WatchCodeBoundSection{}, false, err
	}
	ignoreState, err := p.CodeSectionDiagnosticsIgnoreStateForSection(section.ID)
	if err != nil {
		return WatchCodeBoundSection{}, false, err
	}

	return WatchCodeBoundSection{
		SectionID:    section.ID,
		RelativePath: relativePath,
		SourcePath:   sourcePath,
		Code:         code,
		IgnoreState:  ignoreState,
	}, true, nil
}

func (p *Project) ApplyWatchCodeBoundSectionUpdate(
	ctx context.Context,
	sectionID string,
	workspaceRoot string,
	resolver CallableSignatureResolver,
) (bool, error) {
	if p == nil {
		return false, ErrProjectNotFound
	}
	if ctx == nil {
		ctx = context.Background()
	}

	section, ok, err := p.ResolveWatchCodeBoundSection(sectionID, workspaceRoot)
	if err != nil || !ok {
		return false, err
	}

	callables, parsed, err := watchcode.ParsePythonCallables(section.Code, section.RelativePath)
	if err != nil {
		return false, fmt.Errorf("parse watch code bound section %q: %w", section.SectionID, err)
	}
	if !parsed {
		return false, nil
	}

	scanPlan := watchcode.PlanScanUpdate(
		section.SourcePath,
		callables,
		projectWatchCodeRegistryPlanView(p.WatchCodeRegistry),
		cloneStringSliceMap(p.WatchCodeBaselineByPath),
	)
	return p.applyWatchCodeScanPlanWithParsedSignatures(
		ctx,
		scanPlan,
		resolver,
		watchCodeParsedSignatureResults(callables),
	)
}
