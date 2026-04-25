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

func (d Document) ResolveWatchCodeBoundSection(
	providerPluginID string,
	projectID string,
	sectionID string,
	workspaceRoot string,
) (WatchCodeBoundSection, bool, error) {
	data, _, err := d.decodeWatchCodePluginData(providerPluginID)
	if err != nil {
		return WatchCodeBoundSection{}, false, err
	}
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return WatchCodeBoundSection{}, false, err
	}
	projectData, _ := data.projectData(project.ID)
	section, ok, err := project.ResolveWatchCodeBoundSection(projectData, sectionID, workspaceRoot)
	if err != nil || !ok {
		return section, ok, err
	}
	section.ProjectID = project.ID
	return section, true, nil
}

func (d *Document) ApplyWatchCodeBoundSectionUpdate(
	ctx context.Context,
	providerPluginID string,
	projectID string,
	sectionID string,
	workspaceRoot string,
	resolver CallableSignatureResolver,
) (bool, error) {
	if d == nil {
		return false, ErrProjectNotFound
	}
	pluginID, err := normalizeWatchCodeProviderPluginID(providerPluginID)
	if err != nil {
		return false, err
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return false, err
	}
	data, existed, err := d.decodeWatchCodePluginData(pluginID)
	if err != nil {
		return false, err
	}
	projectData, _ := data.projectData(project.ID)
	didUpdate, err := project.ApplyWatchCodeBoundSectionUpdate(ctx, &projectData, sectionID, workspaceRoot, resolver)
	if err != nil {
		return false, err
	}
	d.Projects[project.ID] = project
	if didUpdate {
		data = data.withProjectData(project.ID, projectData, existed)
		if err := d.setWatchCodePluginData(pluginID, data, existed); err != nil {
			return false, err
		}
	}
	return didUpdate, nil
}

func (p Project) ResolveWatchCodeBoundSection(
	projectData WatchCodePluginProjectData,
	sectionID string,
	workspaceRoot string,
) (WatchCodeBoundSection, bool, error) {
	section, bindingPath, ok, err := p.resolveWatchCodeBoundSectionTarget(projectData, sectionID)
	if err != nil || !ok {
		return WatchCodeBoundSection{}, ok, err
	}
	resolved, ok, err := resolveWatchCodeBoundSectionDetails(p, section.ID, workspaceRoot, bindingPath)
	if err != nil || !ok {
		return WatchCodeBoundSection{}, ok, err
	}
	ignoreState, err := p.CodeSectionDiagnosticsIgnoreStateForSection(section.ID)
	if err != nil {
		return WatchCodeBoundSection{}, false, err
	}
	resolved.IgnoreState = ignoreState
	return resolved, true, nil
}

func (p Project) resolveWatchCodeBoundSectionTarget(
	projectData WatchCodePluginProjectData,
	sectionID string,
) (Section, string, bool, error) {
	if !projectData.Normalized().Enabled || !p.HasPythonCodegenTarget() {
		return Section{}, "", false, nil
	}

	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return Section{}, "", false, ErrSectionIDRequired
	}

	section, _, impl, err := p.ResolveSection(trimmedSectionID)
	if err != nil {
		return Section{}, "", false, err
	}
	if !isWatchCodePythonBoundSection(impl) {
		return Section{}, "", false, nil
	}
	return section, impl.Code.Binding.Path, true, nil
}

func resolveWatchCodeBoundSectionDetails(
	project Project,
	sectionID string,
	workspaceRoot string,
	bindingPath string,
) (WatchCodeBoundSection, bool, error) {
	relativePath, ok, err := normalizeWatchCodeInputPath(workspaceRoot, bindingPath, "code binding")
	if err != nil || !ok {
		return WatchCodeBoundSection{}, ok, err
	}

	code, ok, err := watchCodeBoundSectionSource(project, sectionID, workspaceRoot, relativePath)
	if err != nil || !ok {
		return WatchCodeBoundSection{}, ok, err
	}

	sourcePath, err := resolveWatchCodeAbsolutePath(workspaceRoot, relativePath, "code binding")
	if err != nil {
		return WatchCodeBoundSection{}, false, err
	}
	return WatchCodeBoundSection{
		SectionID:    sectionID,
		RelativePath: relativePath,
		SourcePath:   sourcePath,
		Code:         code,
	}, true, nil
}

func (p *Project) ApplyWatchCodeBoundSectionUpdate(
	ctx context.Context,
	projectData *WatchCodePluginProjectData,
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
	if projectData == nil {
		return false, ErrWatchCodeProjectDataRequired
	}
	*projectData = projectData.Normalized()

	section, ok, err := p.ResolveWatchCodeBoundSection(*projectData, sectionID, workspaceRoot)
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
		projectWatchCodeRegistryPlanView(projectData.Registry),
		cloneStringSliceMap(projectData.BaselineByPath),
	)
	return p.applyWatchCodeScanPlanWithParsedSignatures(
		ctx,
		projectData,
		scanPlan,
		resolver,
		watchCodeParsedSignatureResults(callables),
	)
}
