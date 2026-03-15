package mcpx

import "setta/internal/projectstate"

func filterLSPDiagnosticsPayload(payload projectstate.LSPDiagnosticsPayload, allowedSectionIDs map[string]struct{}, includeUnmapped bool) projectstate.LSPDiagnosticsPayload {
	filteredGenErrors := make(map[string]projectstate.SectionTypeErrors, len(payload.GenCode.Errors))
	for sectionID, errors := range payload.GenCode.Errors {
		if _, ok := allowedSectionIDs[sectionID]; !ok {
			continue
		}
		filteredGenErrors[sectionID] = cloneSectionTypeErrors(errors)
	}

	filteredCodeSections := make(map[string][]projectstate.LSPDiagnostic, len(payload.CodeSections))
	for sectionID, diagnostics := range payload.CodeSections {
		if _, ok := allowedSectionIDs[sectionID]; !ok {
			continue
		}
		filteredCodeSections[sectionID] = cloneDiagnostics(diagnostics)
	}

	unmapped := []projectstate.LSPDiagnostic{}
	if includeUnmapped {
		unmapped = cloneDiagnostics(payload.UnmappedGenCode)
	}

	return projectstate.LSPDiagnosticsPayload{
		ProjectID: payload.ProjectID,
		GenCode: projectstate.ProjectConfigDiagnostics{
			ProjectID: payload.GenCode.ProjectID,
			Errors:    filteredGenErrors,
			IsGenCode: payload.GenCode.IsGenCode,
		},
		CodeSections:    filteredCodeSections,
		UnmappedGenCode: unmapped,
	}
}

func cloneSectionTypeErrors(value projectstate.SectionTypeErrors) projectstate.SectionTypeErrors {
	cloned := projectstate.SectionTypeErrors{
		Callable: append([]string(nil), value.Callable...),
	}
	if value.Params != nil {
		cloned.Params = make(map[string][]string, len(value.Params))
		for key, values := range value.Params {
			cloned.Params[key] = append([]string(nil), values...)
		}
	}
	return cloned
}
