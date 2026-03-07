package runs

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"setta/internal/projectstate"
	"setta/internal/statefs"
)

const (
	runSnapshotsCodeDirName = "code"
	snapshotDirPrefix       = "_"
	snapshotDirLayout       = "20060102_150405_000000"
)

var (
	ErrProjectRuntimeRequired    = fmt.Errorf("runs: project runtime is required")
	ErrSettaFilesRootRequired    = fmt.Errorf("runs: setta files root is required")
	ErrRuntimeRootRequired       = fmt.Errorf("runs: runtime root is required")
	ErrRunTargetRequired         = fmt.Errorf("runs: select a manual code section to run")
	ErrRunTargetNotRunnable      = fmt.Errorf("runs: run is only available for Python and Bash")
	ErrRunSnapshotModeInvalid    = fmt.Errorf("runs: unsupported run snapshot mode")
	ErrCodeBindingRequired       = fmt.Errorf("runs: code section is missing a code file binding")
	ErrInvalidParamOverrideKey   = fmt.Errorf("runs: invalid param override key")
	ErrParamOverridesUnsupported = fmt.Errorf("runs: param overrides are not supported until Go owns parameter state")
	ErrDuplicateSnapshotFileName = fmt.Errorf("runs: duplicate snapshot file name")
)

type RunSnapshotMode string

const (
	RunSnapshotModeNever     RunSnapshotMode = "never"
	RunSnapshotModeEphemeral RunSnapshotMode = "ephemeral"
	RunSnapshotModeAlways    RunSnapshotMode = "always"
)

type PlannerOptions struct {
	ProjectState           *projectstate.Runtime
	SettaFilesRoot         string
	RuntimeRoot            string
	DefaultRunSnapshotMode RunSnapshotMode
	Now                    func() time.Time
}

type PlanRequest struct {
	ProjectID               string
	SectionID               string
	RunSnapshotMode         RunSnapshotMode
	SectionVariantOverrides map[string]string
	ParamOverrides          map[string]string
}

type Plan struct {
	ProjectID         string
	SectionID         string
	Language          projectstate.CodeLanguage
	Command           string
	EntryPath         string
	RunSnapshotMode   RunSnapshotMode
	SnapshotDirectory string
	Revision          uint64
}

type Planner struct {
	projectState   *projectstate.Runtime
	settaFilesRoot string
	runtimeRoot    string
	defaultMode    RunSnapshotMode
	now            func() time.Time
	lookPath       func(string) (string, error)
}

type codeSectionInput struct {
	sectionID string
	language  projectstate.CodeLanguage
	fileName  string
	content   []byte
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
		projectState:   options.ProjectState,
		settaFilesRoot: settaFilesRoot,
		runtimeRoot:    runtimeRoot,
		defaultMode:    defaultMode,
		now:            now,
		lookPath:       lookPath,
	}, nil
}

func (p *Planner) Plan(request PlanRequest) (Plan, error) {
	if p == nil {
		return Plan{}, ErrProjectRuntimeRequired
	}

	snapshot := p.projectState.Snapshot()
	document := snapshot.Document.Clone()

	if err := applySectionVariantOverrides(&document, request.ProjectID, request.SectionVariantOverrides); err != nil {
		return Plan{}, err
	}
	if err := validateParamOverrides(request.ParamOverrides); err != nil {
		return Plan{}, err
	}

	target, err := document.ResolveRunTarget(request.ProjectID, request.SectionID)
	if err != nil {
		return Plan{}, err
	}
	if target.Section.ID == "" {
		return Plan{}, ErrRunTargetRequired
	}
	if !target.Impl.IsRunnableCode() {
		return Plan{}, ErrRunTargetNotRunnable
	}
	if target.Impl.Code == nil || target.Impl.Code.Binding == nil {
		return Plan{}, fmt.Errorf("%w: section %q", ErrCodeBindingRequired, target.Section.ID)
	}

	resolvedMode, err := p.resolveRunSnapshotMode(request)
	if err != nil {
		return Plan{}, err
	}

	if resolvedMode == RunSnapshotModeNever {
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
			SectionID:       target.Section.ID,
			Language:        target.Impl.Code.Language,
			Command:         command,
			EntryPath:       entryPath,
			RunSnapshotMode: resolvedMode,
			Revision:        snapshot.Revision,
		}, nil
	}

	codeSections, err := p.collectCodeSections(target.Project)
	if err != nil {
		return Plan{}, err
	}

	snapshotDir, copiedPaths, err := p.writeSnapshot(codeSections, resolvedMode)
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
		SectionID:         target.Section.ID,
		Language:          target.Impl.Code.Language,
		Command:           command,
		EntryPath:         entryPath,
		RunSnapshotMode:   resolvedMode,
		SnapshotDirectory: snapshotDir,
		Revision:          snapshot.Revision,
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

		section, ok := project.Sections[trimmedSectionID]
		if !ok {
			return fmt.Errorf("unknown section id: %q", trimmedSectionID)
		}
		if _, ok := project.SectionVariants[trimmedVariantID]; !ok {
			return fmt.Errorf("unknown variant id: %q", trimmedVariantID)
		}
		if !containsString(section.VariantIDs, trimmedVariantID) {
			return fmt.Errorf("variant %q is not part of section %q", trimmedVariantID, trimmedSectionID)
		}
		project.SectionVariantMap[trimmedSectionID] = trimmedVariantID
	}

	document.Projects[project.ID] = project
	return nil
}

func validateParamOverrides(paramOverrides map[string]string) error {
	if len(paramOverrides) == 0 {
		return nil
	}
	for key := range paramOverrides {
		parts := strings.SplitN(key, ":", 2)
		if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
			return fmt.Errorf("%w: %q", ErrInvalidParamOverrideKey, key)
		}
	}
	return ErrParamOverridesUnsupported
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

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
