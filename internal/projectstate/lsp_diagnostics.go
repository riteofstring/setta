package projectstate

import (
	"log/slog"
	"reflect"
	"sort"
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
	Logger   *slog.Logger
}

type LSPDiagnosticsRegistry struct {
	mu       sync.Mutex
	onChange LSPDiagnosticsChangeHandler
	logger   *slog.Logger
	projects map[string]projectLSPDiagnosticsState
}

type projectLSPDiagnosticsState struct {
	projectID       string
	rawCodeSections map[string][]LSPDiagnostic
	codeSections    map[string][]LSPDiagnostic
	generatedDocs   map[string]generatedDocumentDiagnostics
}

type generatedDocumentDiagnostics struct {
	Errors   map[string]SectionTypeErrors
	Unmapped []LSPDiagnostic
}

const (
	GeneratedDiagnosticsDocumentCode     = "generated_code"
	GeneratedDiagnosticsDocumentMetadata = "generated_metadata"
)

func NewLSPDiagnosticsRegistry(options LSPDiagnosticsRegistryOptions) *LSPDiagnosticsRegistry {
	return &LSPDiagnosticsRegistry{
		onChange: options.OnChange,
		logger:   options.Logger,
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
	r.UpdateCodeSectionWithIgnoreState(projectID, sectionID, diagnostics, CodeSectionDiagnosticsIgnoreState{})
}

func (r *LSPDiagnosticsRegistry) UpdateCodeSectionWithIgnoreState(
	projectID string,
	sectionID string,
	diagnostics []LSPDiagnostic,
	ignoreState CodeSectionDiagnosticsIgnoreState,
) {
	trimmedProjectID := strings.TrimSpace(projectID)
	trimmedSectionID := strings.TrimSpace(sectionID)
	if r == nil || trimmedProjectID == "" || trimmedSectionID == "" {
		return
	}

	filtered := applyCodeSectionDiagnosticsIgnore(diagnostics, ignoreState)

	r.mu.Lock()
	state := r.projectStateLocked(trimmedProjectID)

	if diagnosticsEqual(state.rawCodeSections[trimmedSectionID], diagnostics) &&
		diagnosticsEqual(state.codeSections[trimmedSectionID], filtered) {
		r.projects[trimmedProjectID] = state
		r.mu.Unlock()
		return
	}

	if len(diagnostics) == 0 {
		delete(state.rawCodeSections, trimmedSectionID)
		delete(state.codeSections, trimmedSectionID)
	} else {
		state.rawCodeSections[trimmedSectionID] = cloneLSPDiagnostics(diagnostics)
		if len(filtered) == 0 {
			delete(state.codeSections, trimmedSectionID)
		} else {
			state.codeSections[trimmedSectionID] = cloneLSPDiagnostics(filtered)
		}
	}

	payload := state.snapshot()
	onChange := r.onChange
	logger := r.logger
	r.projects[trimmedProjectID] = state
	r.mu.Unlock()

	logLSPDiagnosticsSummary(
		logger,
		"lsp_code_section_updated",
		payload,
		slog.String("section_id", trimmedSectionID),
		slog.Int("raw_diagnostic_count", len(diagnostics)),
		slog.Int("filtered_diagnostic_count", len(filtered)),
	)
	if onChange != nil {
		onChange(payload)
	}
}

func (r *LSPDiagnosticsRegistry) ReapplyCodeSectionIgnoreState(project Project, sectionID string) error {
	trimmedSectionID := strings.TrimSpace(sectionID)
	if r == nil || strings.TrimSpace(project.ID) == "" || trimmedSectionID == "" {
		return nil
	}

	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection(trimmedSectionID)
	if err != nil {
		return err
	}

	r.mu.Lock()
	state := r.projectStateLocked(project.ID)
	rawDiagnostics := state.rawCodeSections[trimmedSectionID]
	filtered := applyCodeSectionDiagnosticsIgnore(rawDiagnostics, ignoreState)
	if diagnosticsEqual(state.codeSections[trimmedSectionID], filtered) {
		r.projects[project.ID] = state
		r.mu.Unlock()
		return nil
	}

	if len(filtered) == 0 {
		delete(state.codeSections, trimmedSectionID)
	} else {
		state.codeSections[trimmedSectionID] = cloneLSPDiagnostics(filtered)
	}

	payload := state.snapshot()
	onChange := r.onChange
	logger := r.logger
	r.projects[project.ID] = state
	r.mu.Unlock()

	logLSPDiagnosticsSummary(
		logger,
		"lsp_code_section_ignore_reapplied",
		payload,
		slog.String("section_id", trimmedSectionID),
		slog.Int("filtered_diagnostic_count", len(filtered)),
	)
	if onChange != nil {
		onChange(payload)
	}
	return nil
}

func (r *LSPDiagnosticsRegistry) PruneDocument(document Document) error {
	if r == nil {
		return nil
	}

	validProjectSectionIDs := make(map[string]map[string]struct{}, len(document.Projects))
	for projectID, project := range document.Projects {
		sectionFiles, err := project.ActiveCodeSectionFiles()
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
		project, ok := document.Projects[projectID]
		if !ok {
			delete(r.projects, projectID)
			continue
		}
		validSectionIDs := validProjectSectionIDs[projectID]
		if validSectionIDs == nil {
			validSectionIDs = map[string]struct{}{}
		}
		changed := false
		if !project.HasPythonCodegenTarget() && len(state.generatedDocs) > 0 {
			state.generatedDocs = map[string]generatedDocumentDiagnostics{}
			changed = true
		}

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
		projectID:       projectID,
		rawCodeSections: map[string][]LSPDiagnostic{},
		codeSections:    map[string][]LSPDiagnostic{},
		generatedDocs:   map[string]generatedDocumentDiagnostics{},
	}
}

func (s projectLSPDiagnosticsState) snapshot() LSPDiagnosticsPayload {
	genCode, unmappedGenCode := mergeGeneratedDocumentDiagnostics(s.projectID, s.generatedDocs)
	return LSPDiagnosticsPayload{
		ProjectID:       s.projectID,
		GenCode:         genCode,
		CodeSections:    cloneCodeSectionDiagnosticsMap(s.codeSections),
		UnmappedGenCode: unmappedGenCode,
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

func (r *LSPDiagnosticsRegistry) UpdateGeneratedDocument(
	projectID string,
	documentKey string,
	diagnostics ProjectConfigDiagnostics,
	unmapped []LSPDiagnostic,
) {
	trimmedProjectID := strings.TrimSpace(projectID)
	trimmedDocumentKey := strings.TrimSpace(documentKey)
	if r == nil || trimmedProjectID == "" || trimmedDocumentKey == "" {
		return
	}

	next := generatedDocumentDiagnostics{
		Errors:   cloneSectionTypeErrorsMap(diagnostics.Errors),
		Unmapped: cloneLSPDiagnostics(unmapped),
	}

	r.mu.Lock()
	state := r.projectStateLocked(trimmedProjectID)
	existing, ok := state.generatedDocs[trimmedDocumentKey]
	if ok && reflect.DeepEqual(existing, next) {
		r.projects[trimmedProjectID] = state
		r.mu.Unlock()
		return
	}
	state.generatedDocs[trimmedDocumentKey] = next
	payload := state.snapshot()
	onChange := r.onChange
	logger := r.logger
	r.projects[trimmedProjectID] = state
	r.mu.Unlock()

	logLSPDiagnosticsSummary(
		logger,
		"lsp_generated_document_updated",
		payload,
		slog.String("document_key", trimmedDocumentKey),
		slog.Int("generated_error_sections", len(next.Errors)),
		slog.Int("generated_unmapped_count", len(next.Unmapped)),
	)
	if onChange != nil {
		onChange(payload)
	}
}

func (r *LSPDiagnosticsRegistry) ClearGeneratedDocument(projectID string, documentKey string) {
	trimmedProjectID := strings.TrimSpace(projectID)
	trimmedDocumentKey := strings.TrimSpace(documentKey)
	if r == nil || trimmedProjectID == "" || trimmedDocumentKey == "" {
		return
	}

	r.mu.Lock()
	state, ok := r.projects[trimmedProjectID]
	if !ok {
		r.mu.Unlock()
		return
	}
	if _, exists := state.generatedDocs[trimmedDocumentKey]; !exists {
		r.mu.Unlock()
		return
	}
	delete(state.generatedDocs, trimmedDocumentKey)
	payload := state.snapshot()
	onChange := r.onChange
	logger := r.logger
	r.projects[trimmedProjectID] = state
	r.mu.Unlock()

	logLSPDiagnosticsSummary(
		logger,
		"lsp_generated_document_cleared",
		payload,
		slog.String("document_key", trimmedDocumentKey),
	)
	if onChange != nil {
		onChange(payload)
	}
}

func logLSPDiagnosticsSummary(
	logger *slog.Logger,
	traceEvent string,
	payload LSPDiagnosticsPayload,
	extra ...slog.Attr,
) {
	if logger == nil {
		return
	}
	args := []any{
		slog.String("trace_event", strings.TrimSpace(traceEvent)),
		slog.String("project_id", strings.TrimSpace(payload.ProjectID)),
		slog.Int("code_section_count", len(payload.CodeSections)),
		slog.Int("generated_error_sections", len(payload.GenCode.Errors)),
		slog.Int("generated_callable_error_count", totalGeneratedCallableErrors(payload.GenCode.Errors)),
		slog.Int("generated_param_error_count", totalGeneratedParamErrors(payload.GenCode.Errors)),
		slog.Int("unmapped_generated_diagnostic_count", len(payload.UnmappedGenCode)),
	}
	for _, attr := range extra {
		args = append(args, attr)
	}
	logger.Debug("lsp diagnostics summary", args...)
}

func totalGeneratedCallableErrors(errors map[string]SectionTypeErrors) int {
	total := 0
	for _, sectionErrors := range errors {
		total += len(sectionErrors.Callable)
	}
	return total
}

func totalGeneratedParamErrors(errors map[string]SectionTypeErrors) int {
	total := 0
	for _, sectionErrors := range errors {
		for _, messages := range sectionErrors.Params {
			total += len(messages)
		}
	}
	return total
}

func cloneSectionTypeErrorsMap(input map[string]SectionTypeErrors) map[string]SectionTypeErrors {
	if len(input) == 0 {
		return map[string]SectionTypeErrors{}
	}
	cloned := make(map[string]SectionTypeErrors, len(input))
	for sectionID, errors := range input {
		cloned[sectionID] = cloneSectionTypeErrors(errors)
	}
	return cloned
}

func cloneSectionTypeErrors(input SectionTypeErrors) SectionTypeErrors {
	cloned := SectionTypeErrors{
		Callable: append([]string(nil), input.Callable...),
		Params:   map[string][]string{},
	}
	for paramID, messages := range input.Params {
		cloned.Params[paramID] = append(cloned.Params[paramID], messages...)
	}
	return cloned
}

func mergeGeneratedDocumentDiagnostics(
	projectID string,
	generatedDocs map[string]generatedDocumentDiagnostics,
) (ProjectConfigDiagnostics, []LSPDiagnostic) {
	mergedErrors := map[string]SectionTypeErrors{}
	mergedUnmapped := make([]LSPDiagnostic, 0)
	documentKeys := make([]string, 0, len(generatedDocs))
	for documentKey := range generatedDocs {
		documentKeys = append(documentKeys, documentKey)
	}
	sort.Strings(documentKeys)

	for _, documentKey := range documentKeys {
		document := generatedDocs[documentKey]
		for sectionID, errors := range document.Errors {
			existing := mergedErrors[sectionID]
			existing.Callable = append(existing.Callable, errors.Callable...)
			if existing.Params == nil {
				existing.Params = map[string][]string{}
			}
			for paramID, messages := range errors.Params {
				existing.Params[paramID] = append(existing.Params[paramID], messages...)
			}
			mergedErrors[sectionID] = existing
		}
		mergedUnmapped = append(mergedUnmapped, document.Unmapped...)
	}

	return ProjectConfigDiagnostics{
			ProjectID: projectID,
			Errors:    mergedErrors,
			IsGenCode: true,
		},
		cloneLSPDiagnostics(mergedUnmapped)
}
