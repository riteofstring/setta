package projectstate

import (
	"reflect"
	"strings"
	"sync"
)

type LSPDiagnosticPosition struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}

type LSPDiagnosticRange struct {
	Start LSPDiagnosticPosition `json:"start"`
	End   LSPDiagnosticPosition `json:"end"`
}

type LSPDiagnostic struct {
	Message  string             `json:"message"`
	Severity *int               `json:"severity"`
	Code     any                `json:"code"`
	Source   *string            `json:"source"`
	Range    LSPDiagnosticRange `json:"range"`
	URI      *string            `json:"uri"`
}

type SectionTypeErrors struct {
	Callable []string            `json:"callable"`
	Params   map[string][]string `json:"params"`
}

type ProjectConfigDiagnostics struct {
	ProjectID string                       `json:"projectConfigId"`
	Errors    map[string]SectionTypeErrors `json:"errors"`
	IsGenCode bool                         `json:"isGenCode"`
}

type LSPDiagnosticsPayload struct {
	ProjectID       string                     `json:"projectConfigId"`
	GenCode         ProjectConfigDiagnostics   `json:"genCode"`
	CodeSections    map[string][]LSPDiagnostic `json:"codeSections"`
	UnmappedGenCode []LSPDiagnostic            `json:"unmappedGenCode"`
}

type LSPDiagnosticsChangeHandler func(LSPDiagnosticsPayload)

type LSPDiagnosticsRegistryOptions struct {
	OnChange LSPDiagnosticsChangeHandler
}

type LSPDiagnosticsRegistry struct {
	mu       sync.Mutex
	onChange LSPDiagnosticsChangeHandler
	projects map[string]projectLSPDiagnosticsState
}

type projectLSPDiagnosticsState struct {
	projectID       string
	genCode         ProjectConfigDiagnostics
	rawCodeSections map[string][]LSPDiagnostic
	codeSections    map[string][]LSPDiagnostic
	unmappedGenCode []LSPDiagnostic
}

func NewLSPDiagnosticsRegistry(options LSPDiagnosticsRegistryOptions) *LSPDiagnosticsRegistry {
	return &LSPDiagnosticsRegistry{
		onChange: options.OnChange,
		projects: map[string]projectLSPDiagnosticsState{},
	}
}

func (r *LSPDiagnosticsRegistry) SetOnChange(onChange LSPDiagnosticsChangeHandler) {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.onChange = onChange
	r.mu.Unlock()
}

func (r *LSPDiagnosticsRegistry) Snapshot(projectID string) LSPDiagnosticsPayload {
	trimmedProjectID := strings.TrimSpace(projectID)
	if trimmedProjectID == "" {
		return emptyLSPDiagnosticsPayload("")
	}
	if r == nil {
		return emptyLSPDiagnosticsPayload(trimmedProjectID)
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	state, ok := r.projects[trimmedProjectID]
	if !ok {
		return emptyLSPDiagnosticsPayload(trimmedProjectID)
	}
	return state.snapshot()
}

func (r *LSPDiagnosticsRegistry) UpdateCodeSection(projectID string, sectionID string, diagnostics []LSPDiagnostic) {
	trimmedProjectID := strings.TrimSpace(projectID)
	trimmedSectionID := strings.TrimSpace(sectionID)
	if r == nil || trimmedProjectID == "" || trimmedSectionID == "" {
		return
	}

	r.mu.Lock()
	state := r.projectStateLocked(trimmedProjectID)

	if diagnosticsEqual(state.rawCodeSections[trimmedSectionID], diagnostics) &&
		diagnosticsEqual(state.codeSections[trimmedSectionID], diagnostics) {
		r.projects[trimmedProjectID] = state
		r.mu.Unlock()
		return
	}

	if len(diagnostics) == 0 {
		delete(state.rawCodeSections, trimmedSectionID)
		delete(state.codeSections, trimmedSectionID)
	} else {
		state.rawCodeSections[trimmedSectionID] = cloneLSPDiagnostics(diagnostics)
		state.codeSections[trimmedSectionID] = cloneLSPDiagnostics(diagnostics)
	}

	payload := state.snapshot()
	onChange := r.onChange
	r.projects[trimmedProjectID] = state
	r.mu.Unlock()

	if onChange != nil {
		onChange(payload)
	}
}

func (r *LSPDiagnosticsRegistry) PruneDocument(document Document) error {
	if r == nil {
		return nil
	}

	validProjectSectionIDs := make(map[string]map[string]struct{}, len(document.Projects))
	for projectID, project := range document.Projects {
		sectionFiles, err := project.ActivePythonCodeSectionFiles()
		if err != nil {
			return err
		}
		validSectionIDs := make(map[string]struct{}, len(sectionFiles))
		for _, file := range sectionFiles {
			validSectionIDs[file.SectionID] = struct{}{}
		}
		validProjectSectionIDs[projectID] = validSectionIDs
	}

	r.mu.Lock()
	changedPayloads := make([]LSPDiagnosticsPayload, 0, len(validProjectSectionIDs))
	onChange := r.onChange

	for projectID, state := range r.projects {
		validSectionIDs, ok := validProjectSectionIDs[projectID]
		if !ok {
			delete(r.projects, projectID)
			continue
		}

		changed := false
		for sectionID := range state.rawCodeSections {
			if _, ok := validSectionIDs[sectionID]; ok {
				continue
			}
			delete(state.rawCodeSections, sectionID)
			changed = true
		}
		for sectionID := range state.codeSections {
			if _, ok := validSectionIDs[sectionID]; ok {
				continue
			}
			delete(state.codeSections, sectionID)
			changed = true
		}

		if changed {
			r.projects[projectID] = state
			changedPayloads = append(changedPayloads, state.snapshot())
		}
	}
	r.mu.Unlock()

	if onChange != nil {
		for _, payload := range changedPayloads {
			onChange(payload)
		}
	}

	return nil
}

func (r *LSPDiagnosticsRegistry) projectStateLocked(projectID string) projectLSPDiagnosticsState {
	state, ok := r.projects[projectID]
	if ok {
		return state
	}
	return projectLSPDiagnosticsState{
		projectID: projectID,
		genCode: ProjectConfigDiagnostics{
			ProjectID: projectID,
			Errors:    map[string]SectionTypeErrors{},
			IsGenCode: true,
		},
		rawCodeSections: map[string][]LSPDiagnostic{},
		codeSections:    map[string][]LSPDiagnostic{},
		unmappedGenCode: []LSPDiagnostic{},
	}
}

func (s projectLSPDiagnosticsState) snapshot() LSPDiagnosticsPayload {
	return LSPDiagnosticsPayload{
		ProjectID:       s.projectID,
		GenCode:         cloneProjectConfigDiagnostics(s.genCode),
		CodeSections:    cloneCodeSectionDiagnosticsMap(s.codeSections),
		UnmappedGenCode: cloneLSPDiagnostics(s.unmappedGenCode),
	}
}

func emptyLSPDiagnosticsPayload(projectID string) LSPDiagnosticsPayload {
	return LSPDiagnosticsPayload{
		ProjectID: projectID,
		GenCode: ProjectConfigDiagnostics{
			ProjectID: projectID,
			Errors:    map[string]SectionTypeErrors{},
			IsGenCode: true,
		},
		CodeSections:    map[string][]LSPDiagnostic{},
		UnmappedGenCode: []LSPDiagnostic{},
	}
}

func cloneProjectConfigDiagnostics(input ProjectConfigDiagnostics) ProjectConfigDiagnostics {
	cloned := ProjectConfigDiagnostics{
		ProjectID: strings.TrimSpace(input.ProjectID),
		Errors:    map[string]SectionTypeErrors{},
		IsGenCode: input.IsGenCode,
	}
	for sectionID, errors := range input.Errors {
		cloned.setSectionTypeErrors(sectionID, errors)
	}
	return cloned
}

func (p *ProjectConfigDiagnostics) setSectionTypeErrors(sectionID string, errors SectionTypeErrors) {
	if p.Errors == nil {
		p.Errors = map[string]SectionTypeErrors{}
	}
	cloned := SectionTypeErrors{
		Callable: append([]string(nil), errors.Callable...),
		Params:   map[string][]string{},
	}
	for paramID, messages := range errors.Params {
		cloned.Params[paramID] = append([]string(nil), messages...)
	}
	p.Errors[sectionID] = cloned
}

func cloneCodeSectionDiagnosticsMap(input map[string][]LSPDiagnostic) map[string][]LSPDiagnostic {
	cloned := make(map[string][]LSPDiagnostic, len(input))
	for sectionID, diagnostics := range input {
		cloned[sectionID] = cloneLSPDiagnostics(diagnostics)
	}
	return cloned
}

func cloneLSPDiagnostics(input []LSPDiagnostic) []LSPDiagnostic {
	if len(input) == 0 {
		return []LSPDiagnostic{}
	}
	cloned := make([]LSPDiagnostic, len(input))
	copy(cloned, input)
	return cloned
}

func diagnosticsEqual(left []LSPDiagnostic, right []LSPDiagnostic) bool {
	if len(left) == 0 && len(right) == 0 {
		return true
	}
	return reflect.DeepEqual(left, right)
}
