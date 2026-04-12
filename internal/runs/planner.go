package runs

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"setta/internal/codegen"
	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/internal/statefs"
)

const (
	runSnapshotsCodeDirName = "code"
	snapshotDirPrefix       = "_"
	snapshotDirLayout       = "20060102_150405_000000"
	generatedEntryCodeKey   = "__generated_entry_code__"
	generatedEntryMetaKey   = "__generated_entry_meta__"
)

var (
	ErrProjectRuntimeRequired           = fmt.Errorf("runs: project runtime is required")
	ErrSettaFilesRootRequired           = fmt.Errorf("runs: setta files root is required")
	ErrRuntimeRootRequired              = fmt.Errorf("runs: runtime root is required")
	ErrRunTargetRequired                = fmt.Errorf("runs: select a manual code section to run")
	ErrRunTargetNotRunnable             = fmt.Errorf("runs: run is only available for Python and Bash")
	ErrRunSnapshotModeInvalid           = fmt.Errorf("runs: unsupported run snapshot mode")
	ErrCodeBindingRequired              = fmt.Errorf("runs: code section is missing a code file binding")
	ErrGeneratedEntryBindingRequired    = fmt.Errorf("runs: generated-entry run is missing a generated code binding")
	ErrPluginCodegenRunUnsupported      = fmt.Errorf("runs: plugin-codegen entry runs are not supported in Go yet")
	ErrInvalidParamOverrideKey          = fmt.Errorf("runs: invalid param override key")
	ErrParamOverridesDenied             = fmt.Errorf("runs: param overrides are not allowed for this run")
	ErrCodeParamOverridesDenied         = fmt.Errorf("runs: CodeParam overrides are not allowed for this run")
	ErrPasswordParamOverrideUnsupported = fmt.Errorf("runs: PasswordParam overrides are not supported in Go yet")
	ErrDropzoneParamOverrideUnsupported = fmt.Errorf("runs: DropzoneParam overrides are not supported in Go yet")
	ErrDuplicateSnapshotFileName        = fmt.Errorf("runs: duplicate snapshot file name")
)

type RunSnapshotMode = deployments.RunSnapshotMode

const (
	RunSnapshotModeNever     = deployments.RunSnapshotModeNever
	RunSnapshotModeEphemeral = deployments.RunSnapshotModeEphemeral
	RunSnapshotModeAlways    = deployments.RunSnapshotModeAlways
)

type PlannerOptions struct {
	ProjectState           *projectstate.Runtime
	SettaFilesRoot         string
	RuntimeRoot            string
	SnapshotRoot           string
	DefaultRunSnapshotMode RunSnapshotMode
	Now                    func() time.Time
}

type PlanRequest struct {
	ProjectID                  string
	SectionID                  string
	RunSnapshotMode            RunSnapshotMode
	SectionVariantOverrides    map[string]string
	ParamOverrides             map[string]string
	DisallowParamOverrides     bool
	DisallowCodeParamOverrides bool
}

type Plan struct {
	ProjectID         string
	TargetKind        projectstate.RunTargetKind
	SectionID         string
	VariantID         string
	Language          projectstate.CodeLanguage
	Command           string
	EntryPath         string
	RunSnapshotMode   RunSnapshotMode
	SnapshotDirectory string
	Revision          uint64
}

type Planner struct {
	projectState     *projectstate.Runtime
	settaFilesRoot   string
	runtimeRoot      string
	snapshotRootPath string
	defaultMode      RunSnapshotMode
	now              func() time.Time
	lookPath         func(string) (string, error)
}

type codeSectionInput struct {
	sectionID string
	language  projectstate.CodeLanguage
	fileName  string
	content   []byte
}

type parsedParamOverride struct {
	sectionID string
	codeObjID string
	value     string
}

func NewPlanner(options PlannerOptions) (*Planner, error) {
	if options.ProjectState == nil {
		return nil, ErrProjectRuntimeRequired
	}

	settaFilesRoot, err := statefs.NormalizePath(options.SettaFilesRoot, "")
	if err != nil {
		return nil, fmt.Errorf("%w", ErrSettaFilesRootRequired)
	}
	runtimeRoot, err := statefs.NormalizePath(options.RuntimeRoot, "")
	if err != nil {
		return nil, fmt.Errorf("%w", ErrRuntimeRootRequired)
	}
	snapshotRoot := ""
	if strings.TrimSpace(options.SnapshotRoot) != "" {
		snapshotRoot, err = statefs.NormalizePath(options.SnapshotRoot, "")
		if err != nil {
			return nil, fmt.Errorf("runs: snapshot root is invalid")
		}
	}

	defaultMode := options.DefaultRunSnapshotMode
	if defaultMode == "" {
		defaultMode = RunSnapshotModeEphemeral
	}
	if err := validateRunSnapshotMode(defaultMode); err != nil {
		return nil, err
	}

	now := options.Now
	if now == nil {
		now = time.Now
	}
	lookPath := exec.LookPath

	return &Planner{
		projectState:     options.ProjectState,
		settaFilesRoot:   settaFilesRoot,
		runtimeRoot:      runtimeRoot,
		snapshotRootPath: snapshotRoot,
		defaultMode:      defaultMode,
		now:              now,
		lookPath:         lookPath,
	}, nil
}

func (p *Planner) withOptions(options PlannerOptions) (*Planner, error) {
	planner, err := NewPlanner(options)
	if err != nil {
		return nil, err
	}
	planner.now = p.now
	planner.lookPath = p.lookPath
	return planner, nil
}

func (p *Planner) Plan(request PlanRequest) (Plan, error) {
	if p == nil {
		return Plan{}, ErrProjectRuntimeRequired
	}

	revision, document, err := p.preparePlanDocument(request)
	if err != nil {
		return Plan{}, err
	}
	target, resolvedMode, err := p.resolvePlanTarget(document, request)
	if err != nil {
		return Plan{}, err
	}
	if target.Kind == projectstate.RunTargetKindGeneratedEntry {
		return p.planGeneratedEntry(target, resolvedMode, revision, hasOverrides(request))
	}
	return p.planManualCode(target, resolvedMode, revision, hasOverrides(request))
}

func (p *Planner) preparePlanDocument(request PlanRequest) (uint64, projectstate.Document, error) {
	snapshot := p.projectState.Snapshot()
	document := snapshot.Document.Clone()

	if err := applySectionVariantOverrides(&document, request.ProjectID, request.SectionVariantOverrides); err != nil {
		return 0, projectstate.Document{}, err
	}
	if err := applyParamOverrides(&document, request.ProjectID, request.ParamOverrides, request.DisallowParamOverrides, request.DisallowCodeParamOverrides); err != nil {
		return 0, projectstate.Document{}, err
	}
	return snapshot.Revision, document, nil
}

func (p *Planner) resolvePlanTarget(document projectstate.Document, request PlanRequest) (projectstate.ResolvedRunTarget, RunSnapshotMode, error) {
	target, err := document.ResolveRunTarget(request.ProjectID, request.SectionID)
	if err != nil {
		return projectstate.ResolvedRunTarget{}, "", err
	}
	mode, err := p.resolveRunSnapshotMode(request)
	if err != nil {
		return projectstate.ResolvedRunTarget{}, "", err
	}
	return target, mode, nil
}

func (p *Planner) planManualCode(target projectstate.ResolvedRunTarget, mode RunSnapshotMode, revision uint64, overridesApplied bool) (Plan, error) {
	if err := validateManualRunTarget(target); err != nil {
		return Plan{}, err
	}
	if mode == RunSnapshotModeNever {
		return p.planDirectManualCode(target, mode, revision)
	}
	return p.planSnapshotManualCode(target, mode, revision, overridesApplied)
}

func validateManualRunTarget(target projectstate.ResolvedRunTarget) error {
	if target.Section.ID == "" {
		return ErrRunTargetRequired
	}
	if !target.Impl.IsRunnableCode() {
		return ErrRunTargetNotRunnable
	}
	if target.Impl.Code == nil || target.Impl.Code.Binding == nil {
		return fmt.Errorf("%w: section %q", ErrCodeBindingRequired, target.Section.ID)
	}
	return nil
}

func (p *Planner) planDirectManualCode(target projectstate.ResolvedRunTarget, mode RunSnapshotMode, revision uint64) (Plan, error) {
	entryPath, err := p.resolveBindingPath(target.Impl.Code.Binding.Path)
	if err != nil {
		return Plan{}, fmt.Errorf("resolve entry code binding: %w", err)
	}
	if _, err := os.Stat(entryPath); err != nil {
		return Plan{}, fmt.Errorf("stat entry code file: %w", err)
	}

	command, err := p.buildCommand(target.Impl.Code.Language, entryPath)
	if err != nil {
		return Plan{}, err
	}
	return Plan{
		ProjectID:       target.Project.ID,
		TargetKind:      projectstate.RunTargetKindManualCode,
		SectionID:       target.Section.ID,
		VariantID:       target.Variant.ID,
		Language:        target.Impl.Code.Language,
		Command:         command,
		EntryPath:       entryPath,
		RunSnapshotMode: mode,
		Revision:        revision,
	}, nil
}

func (p *Planner) planSnapshotManualCode(target projectstate.ResolvedRunTarget, mode RunSnapshotMode, revision uint64, overridesApplied bool) (Plan, error) {
	codeSections, err := p.collectCodeSections(target.Project)
	if err != nil {
		return Plan{}, err
	}
	generatedInputs, err := p.collectManualRunGeneratedInputs(target.Project, overridesApplied)
	if err != nil {
		return Plan{}, err
	}

	snapshotDir, copiedPaths, err := p.writeSnapshot(append(codeSections, generatedInputs...), mode)
	if err != nil {
		return Plan{}, err
	}

	entryPath, ok := copiedPaths[target.Section.ID]
	if !ok {
		return Plan{}, fmt.Errorf("snapshot entry path missing for section %q", target.Section.ID)
	}

	command, err := p.buildCommand(target.Impl.Code.Language, entryPath)
	if err != nil {
		return Plan{}, err
	}

	return Plan{
		ProjectID:         target.Project.ID,
		TargetKind:        projectstate.RunTargetKindManualCode,
		SectionID:         target.Section.ID,
		VariantID:         target.Variant.ID,
		Language:          target.Impl.Code.Language,
		Command:           command,
		EntryPath:         entryPath,
		RunSnapshotMode:   mode,
		SnapshotDirectory: snapshotDir,
		Revision:          revision,
	}, nil
}

func (p *Planner) planGeneratedEntry(target projectstate.ResolvedRunTarget, mode RunSnapshotMode, revision uint64, overridesApplied bool) (Plan, error) {
	generated, err := resolvedGeneratedEntry(target)
	if err != nil {
		return Plan{}, err
	}

	if mode == RunSnapshotModeNever {
		return p.planDirectGeneratedEntry(target.Project.ID, generated, mode, revision)
	}
	return p.planSnapshotGeneratedEntry(target.Project, generated, mode, revision, overridesApplied)
}

func resolvedGeneratedEntry(target projectstate.ResolvedRunTarget) (projectstate.ResolvedGeneratedEntry, error) {
	if target.Generated == nil {
		return projectstate.ResolvedGeneratedEntry{}, ErrRunTargetRequired
	}
	if target.Generated.UsesPluginCodegen {
		return projectstate.ResolvedGeneratedEntry{}, ErrPluginCodegenRunUnsupported
	}
	if target.Generated.CodeBinding == nil {
		return projectstate.ResolvedGeneratedEntry{}, ErrGeneratedEntryBindingRequired
	}
	return *target.Generated, nil
}

func (p *Planner) planDirectGeneratedEntry(projectID string, target projectstate.ResolvedGeneratedEntry, mode RunSnapshotMode, revision uint64) (Plan, error) {
	entryPath, _, err := p.resolveGeneratedEntryBindingPaths(target)
	if err != nil {
		return Plan{}, err
	}

	command, err := p.buildCommand(projectstate.CodeLanguagePython, entryPath)
	if err != nil {
		return Plan{}, err
	}
	return Plan{
		ProjectID:       projectID,
		TargetKind:      projectstate.RunTargetKindGeneratedEntry,
		Language:        projectstate.CodeLanguagePython,
		Command:         command,
		EntryPath:       entryPath,
		RunSnapshotMode: mode,
		Revision:        revision,
	}, nil
}

func (p *Planner) resolveGeneratedEntryBindingPaths(target projectstate.ResolvedGeneratedEntry) (string, string, error) {
	entryPath, err := p.resolveBindingPath(target.CodeBinding.Path)
	if err != nil {
		return "", "", fmt.Errorf("resolve generated entry binding: %w", err)
	}
	if _, err := os.Stat(entryPath); err != nil {
		return "", "", fmt.Errorf("stat generated entry file: %w", err)
	}
	if target.MetadataBinding == nil {
		return entryPath, "", nil
	}

	metadataPath, err := p.resolveBindingPath(target.MetadataBinding.Path)
	if err != nil {
		return "", "", fmt.Errorf("resolve generated metadata binding: %w", err)
	}
	if _, err := os.Stat(metadataPath); err != nil {
		return "", "", fmt.Errorf("stat generated metadata file: %w", err)
	}
	return entryPath, metadataPath, nil
}

func (p *Planner) planSnapshotGeneratedEntry(
	project projectstate.Project,
	target projectstate.ResolvedGeneratedEntry,
	mode RunSnapshotMode,
	revision uint64,
	overridesApplied bool,
) (Plan, error) {
	codeSections, err := p.collectCodeSections(project)
	if err != nil {
		return Plan{}, err
	}
	generatedInputs, err := p.collectGeneratedEntryInputs(project, target, overridesApplied)
	if err != nil {
		return Plan{}, err
	}

	snapshotDir, copiedPaths, err := p.writeSnapshot(append(codeSections, generatedInputs...), mode)
	if err != nil {
		return Plan{}, err
	}
	snapshotEntryPath, ok := copiedPaths[generatedEntryCodeKey]
	if !ok {
		return Plan{}, fmt.Errorf("snapshot entry path missing for generated entry")
	}

	command, err := p.buildCommand(projectstate.CodeLanguagePython, snapshotEntryPath)
	if err != nil {
		return Plan{}, err
	}
	return Plan{
		ProjectID:         project.ID,
		TargetKind:        projectstate.RunTargetKindGeneratedEntry,
		Language:          projectstate.CodeLanguagePython,
		Command:           command,
		EntryPath:         snapshotEntryPath,
		RunSnapshotMode:   mode,
		SnapshotDirectory: snapshotDir,
		Revision:          revision,
	}, nil
}

func (p *Planner) resolveRunSnapshotMode(request PlanRequest) (RunSnapshotMode, error) {
	mode := request.RunSnapshotMode
	if mode == "" {
		mode = p.defaultMode
	}
	if err := validateRunSnapshotMode(mode); err != nil {
		return "", err
	}
	if hasOverrides(request) && mode == RunSnapshotModeNever {
		return RunSnapshotModeEphemeral, nil
	}
	return mode, nil
}

func (p *Planner) collectCodeSections(project projectstate.Project) ([]codeSectionInput, error) {
	sectionIDs := make([]string, 0, len(project.Sections))
	for sectionID := range project.Sections {
		sectionIDs = append(sectionIDs, sectionID)
	}
	sort.Strings(sectionIDs)

	inputs := make([]codeSectionInput, 0, len(sectionIDs))
	for _, sectionID := range sectionIDs {
		_, _, impl, err := project.ResolveSection(sectionID)
		if err != nil {
			return nil, err
		}
		if !impl.IsCode() {
			continue
		}
		if impl.Code == nil || impl.Code.Binding == nil {
			return nil, fmt.Errorf("%w: section %q", ErrCodeBindingRequired, sectionID)
		}

		resolvedPath, err := p.resolveBindingPath(impl.Code.Binding.Path)
		if err != nil {
			return nil, fmt.Errorf("resolve code binding for section %q: %w", sectionID, err)
		}
		content, err := os.ReadFile(resolvedPath)
		if err != nil {
			return nil, fmt.Errorf("read code file for section %q: %w", sectionID, err)
		}

		inputs = append(inputs, codeSectionInput{
			sectionID: sectionID,
			language:  impl.Code.Language,
			fileName:  filepath.Base(resolvedPath),
			content:   content,
		})
	}
	return inputs, nil
}

func (p *Planner) collectGeneratedEntryInputs(
	project projectstate.Project,
	target projectstate.ResolvedGeneratedEntry,
	overridesApplied bool,
) ([]codeSectionInput, error) {
	if overridesApplied {
		return p.renderGeneratedEntryInputs(project)
	}
	if target.CodeBinding == nil {
		return nil, ErrGeneratedEntryBindingRequired
	}

	entryPath, err := p.resolveBindingPath(target.CodeBinding.Path)
	if err != nil {
		return nil, fmt.Errorf("resolve generated entry binding: %w", err)
	}
	entryContent, err := os.ReadFile(entryPath)
	if err != nil {
		return nil, fmt.Errorf("read generated entry file: %w", err)
	}

	inputs := []codeSectionInput{{
		sectionID: generatedEntryCodeKey,
		language:  projectstate.CodeLanguagePython,
		fileName:  filepath.Base(entryPath),
		content:   entryContent,
	}}
	if target.MetadataBinding == nil {
		return inputs, nil
	}

	metadataPath, err := p.resolveBindingPath(target.MetadataBinding.Path)
	if err != nil {
		return nil, fmt.Errorf("resolve generated metadata binding: %w", err)
	}
	metadataContent, err := os.ReadFile(metadataPath)
	if err != nil {
		return nil, fmt.Errorf("read generated metadata file: %w", err)
	}
	inputs = append(inputs, codeSectionInput{
		sectionID: generatedEntryMetaKey,
		language:  projectstate.CodeLanguagePython,
		fileName:  filepath.Base(metadataPath),
		content:   metadataContent,
	})
	return inputs, nil
}

func (p *Planner) collectManualRunGeneratedInputs(project projectstate.Project, overridesApplied bool) ([]codeSectionInput, error) {
	if !project.HasPythonCodegenTarget() {
		return nil, nil
	}
	return p.collectGeneratedEntryInputs(project, projectstate.ResolvedGeneratedEntry{
		CodeBinding:     project.GeneratedCodeBinding,
		MetadataBinding: project.GeneratedMetadataBinding,
	}, overridesApplied)
}

func (p *Planner) renderGeneratedEntryInputs(project projectstate.Project) ([]codeSectionInput, error) {
	rendered, ok, err := codegen.RenderPythonProject(project, p.settaFilesRoot, p.runtimeRoot)
	if err != nil {
		return nil, err
	}
	if !ok || project.GeneratedCodeBinding == nil {
		return nil, ErrGeneratedEntryBindingRequired
	}

	inputs := []codeSectionInput{{
		sectionID: generatedEntryCodeKey,
		language:  projectstate.CodeLanguagePython,
		fileName:  filepath.Base(project.GeneratedCodeBinding.Path),
		content:   []byte(rendered.Code),
	}}
	if !rendered.Target.GenerateMetadata {
		return inputs, nil
	}
	if project.GeneratedMetadataBinding == nil {
		return nil, ErrGeneratedEntryBindingRequired
	}

	inputs = append(inputs, codeSectionInput{
		sectionID: generatedEntryMetaKey,
		language:  projectstate.CodeLanguagePython,
		fileName:  filepath.Base(project.GeneratedMetadataBinding.Path),
		content:   []byte(rendered.MetadataCode),
	})
	return inputs, nil
}

func (p *Planner) writeSnapshot(inputs []codeSectionInput, mode RunSnapshotMode) (string, map[string]string, error) {
	snapshotRoot := p.snapshotRoot(mode)
	snapshotDir := filepath.Join(snapshotRoot, snapshotDirPrefix+p.now().UTC().Format(snapshotDirLayout))
	if err := os.MkdirAll(snapshotDir, 0o755); err != nil {
		return "", nil, fmt.Errorf("create snapshot dir: %w", err)
	}

	copiedPaths := make(map[string]string, len(inputs))
	seenNames := make(map[string]string, len(inputs))
	for _, input := range inputs {
		if existingSectionID, ok := seenNames[input.fileName]; ok {
			return "", nil, fmt.Errorf("%w: %q for sections %q and %q", ErrDuplicateSnapshotFileName, input.fileName, existingSectionID, input.sectionID)
		}
		seenNames[input.fileName] = input.sectionID

		targetPath := filepath.Join(snapshotDir, input.fileName)
		if err := statefs.AtomicWriteFile(targetPath, input.content, 0o644); err != nil {
			return "", nil, fmt.Errorf("write snapshot code file: %w", err)
		}
		copiedPaths[input.sectionID] = targetPath
	}
	return snapshotDir, copiedPaths, nil
}

func (p *Planner) resolveBindingPath(rawPath string) (string, error) {
	trimmedPath := strings.TrimSpace(rawPath)
	if trimmedPath == "" {
		return "", ErrCodeBindingRequired
	}
	return statefs.NormalizePath(trimmedPath, p.settaFilesRoot)
}

func (p *Planner) snapshotRoot(mode RunSnapshotMode) string {
	if p.snapshotRootPath != "" {
		return p.snapshotRootPath
	}
	switch mode {
	case RunSnapshotModeEphemeral:
		return p.runtimeRoot
	case RunSnapshotModeAlways:
		return filepath.Join(p.settaFilesRoot, runSnapshotsCodeDirName)
	default:
		return p.runtimeRoot
	}
}

func applySectionVariantOverrides(document *projectstate.Document, projectID string, overrides map[string]string) error {
	if document == nil || len(overrides) == 0 {
		return nil
	}

	project, err := document.ProjectByID(projectID)
	if err != nil {
		return err
	}

	for sectionID, variantID := range overrides {
		trimmedSectionID := strings.TrimSpace(sectionID)
		trimmedVariantID := strings.TrimSpace(variantID)
		if _, _, _, err := project.ResolveSectionWithVariant(trimmedSectionID, trimmedVariantID); err != nil {
			return err
		}
		project.SectionVariantMap[trimmedSectionID] = trimmedVariantID
	}

	document.Projects[project.ID] = project
	return nil
}

func applyParamOverrides(
	document *projectstate.Document,
	projectID string,
	paramOverrides map[string]string,
	disallowParamOverrides bool,
	disallowCodeParamOverrides bool,
) error {
	if document == nil || len(paramOverrides) == 0 {
		return nil
	}

	parsedOverrides, err := parseParamOverrides(paramOverrides)
	if err != nil {
		return err
	}
	if disallowParamOverrides {
		return ErrParamOverridesDenied
	}

	project, err := document.ProjectByID(projectID)
	if err != nil {
		return err
	}

	if err := applyParsedParamOverrides(&project, parsedOverrides, disallowCodeParamOverrides); err != nil {
		return err
	}

	document.Projects[project.ID] = project
	return nil
}

func applyParsedParamOverrides(project *projectstate.Project, overrides []parsedParamOverride, disallowCodeParamOverrides bool) error {
	for _, override := range overrides {
		if err := applySingleParamOverride(project, override, disallowCodeParamOverrides); err != nil {
			return err
		}
	}
	return nil
}

func applySingleParamOverride(project *projectstate.Project, override parsedParamOverride, disallowCodeParamOverrides bool) error {
	_, _, _, impl, err := project.ResolveSectionCodeObject(override.sectionID, override.codeObjID)
	if err != nil {
		return err
	}
	if err := validateParamOverrideType(impl.Type, disallowCodeParamOverrides); err != nil {
		return err
	}
	return project.SetSectionCodeObjectValue(override.sectionID, override.codeObjID, override.value)
}

func validateParamOverrideType(rawType string, disallowCodeParamOverrides bool) error {
	switch strings.TrimSpace(rawType) {
	case "CodeParam":
		if disallowCodeParamOverrides {
			return ErrCodeParamOverridesDenied
		}
	case "PasswordParam":
		return ErrPasswordParamOverrideUnsupported
	case "DropzoneParam":
		return ErrDropzoneParamOverrideUnsupported
	}
	return nil
}

func parseParamOverrides(paramOverrides map[string]string) ([]parsedParamOverride, error) {
	if len(paramOverrides) == 0 {
		return nil, nil
	}

	keys := make([]string, 0, len(paramOverrides))
	for key := range paramOverrides {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	parsed := make([]parsedParamOverride, 0, len(keys))
	for _, key := range keys {
		sectionID, codeObjID, err := parseParamOverrideKey(key)
		if err != nil {
			return nil, err
		}
		parsed = append(parsed, parsedParamOverride{
			sectionID: sectionID,
			codeObjID: codeObjID,
			value:     paramOverrides[key],
		})
	}
	return parsed, nil
}

func parseParamOverrideKey(key string) (string, string, error) {
	parts := strings.SplitN(key, ":", 2)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("%w: %q", ErrInvalidParamOverrideKey, key)
	}

	sectionID := strings.TrimSpace(parts[0])
	codeObjID := strings.TrimSpace(parts[1])
	if sectionID == "" || codeObjID == "" {
		return "", "", fmt.Errorf("%w: %q", ErrInvalidParamOverrideKey, key)
	}
	return sectionID, codeObjID, nil
}

func validateRunSnapshotMode(mode RunSnapshotMode) error {
	switch mode {
	case RunSnapshotModeNever, RunSnapshotModeEphemeral, RunSnapshotModeAlways:
		return nil
	default:
		return fmt.Errorf("%w: %q", ErrRunSnapshotModeInvalid, mode)
	}
}

func (p *Planner) buildCommand(language projectstate.CodeLanguage, entryPath string) (string, error) {
	switch language {
	case projectstate.CodeLanguagePython:
		executable, err := p.resolveExecutable("python3", "python")
		if err != nil {
			return "", err
		}
		return shellQuote(executable) + " " + shellQuote(entryPath), nil
	case projectstate.CodeLanguageBash:
		executable, err := p.resolveExecutable("bash")
		if err != nil {
			return "", err
		}
		return shellQuote(executable) + " " + shellQuote(entryPath), nil
	default:
		return "", ErrRunTargetNotRunnable
	}
}

func (p *Planner) resolveExecutable(names ...string) (string, error) {
	lookPath := p.lookPath
	if lookPath == nil {
		lookPath = exec.LookPath
	}
	for _, name := range names {
		path, err := lookPath(name)
		if err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("runs: required executable not found: %s", strings.Join(names, ", "))
}

func hasOverrides(request PlanRequest) bool {
	return len(request.SectionVariantOverrides) > 0 || len(request.ParamOverrides) > 0
}

func shellQuote(value string) string {
	if value == "" {
		return "''"
	}
	return "'" + strings.ReplaceAll(value, "'", `'"'"'`) + "'"
}
