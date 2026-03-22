package mcpx

import (
	"encoding/json"
	"fmt"
	"maps"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/tools"
)

func translateAgenticContextToCanonical(value *AgenticContext, store *TemporaryIDStore) (*AgenticContext, error) {
	if value == nil || store == nil {
		return value, nil
	}

	projectConfigID, err := resolveCanonicalClientID(store, value.ProjectConfigID)
	if err != nil {
		return nil, err
	}
	chatID, err := resolveCanonicalClientID(store, value.ChatID)
	if err != nil {
		return nil, err
	}
	sectionID, err := resolveCanonicalClientID(store, value.SectionID)
	if err != nil {
		return nil, err
	}

	cloned := *value
	cloned.ProjectConfigID = projectConfigID
	cloned.ChatID = chatID
	cloned.SectionID = sectionID
	return &cloned, nil
}

func translateArgumentsToCanonical(toolName string, metadata tools.Metadata, arguments map[string]any, store *TemporaryIDStore) (map[string]any, error) {
	if len(arguments) == 0 || store == nil {
		return arguments, nil
	}

	cloned := maps.Clone(arguments)
	if err := translateStringArgumentField(cloned, "projectConfigId", store); err != nil {
		return nil, err
	}
	for _, idType := range []tools.IDType{
		tools.IDTypeSection,
		tools.IDTypeSectionVariant,
		tools.IDTypeCodeObject,
	} {
		if err := translateIDsByTypeToCanonical(cloned, metadata, idType, store); err != nil {
			return nil, err
		}
	}
	switch toolName {
	case "set_agentic_context":
		if err := translateStringArgumentField(cloned, "chatId", store); err != nil {
			return nil, err
		}
		if err := translateStringArgumentField(cloned, "sectionId", store); err != nil {
			return nil, err
		}
	}
	return cloned, nil
}

func translateIDsByTypeToCanonical(arguments map[string]any, metadata tools.Metadata, idType tools.IDType, store *TemporaryIDStore) error {
	if len(arguments) == 0 || store == nil || len(metadata.IDPathsByType) == 0 {
		return nil
	}
	return translateIDsAtPaths(arguments, metadata.IDPathsByType[idType], func(value string) (string, error) {
		return resolveCanonicalClientID(store, value)
	})
}

func translateResultToTemporary(payload any, metadata tools.Metadata, store *TemporaryIDStore) (any, error) {
	if store == nil || payload == nil {
		return payload, nil
	}

	translatedPayload := payload
	switch metadata.ResultFilter {
	case tools.ResultFilterProjectStateSummary:
		switch typed := translatedPayload.(type) {
		case projectStateSummary:
			nextPayload, err := translateProjectStateSummaryToTemporary(typed, store)
			if err != nil {
				return nil, err
			}
			translatedPayload = nextPayload
		case *projectStateSummary:
			if typed == nil {
				return payload, nil
			}
			translated, err := translateProjectStateSummaryToTemporary(*typed, store)
			if err != nil {
				return nil, err
			}
			translatedPayload = &translated
		default:
			return nil, fmt.Errorf("mcpx: unsupported project-state summary result type %T", payload)
		}
	case tools.ResultFilterLSPDiagnostics:
		switch typed := translatedPayload.(type) {
		case projectstate.LSPDiagnosticsPayload:
			nextPayload, err := translateLSPDiagnosticsPayloadToTemporary(typed, store)
			if err != nil {
				return nil, err
			}
			translatedPayload = nextPayload
		case *projectstate.LSPDiagnosticsPayload:
			if typed == nil {
				return payload, nil
			}
			translated, err := translateLSPDiagnosticsPayloadToTemporary(*typed, store)
			if err != nil {
				return nil, err
			}
			translatedPayload = &translated
		default:
			return nil, fmt.Errorf("mcpx: unsupported lsp diagnostics result type %T", payload)
		}
	}

	if len(metadata.ResultIDPathsByType) == 0 {
		return translatedPayload, nil
	}

	return translateResultIDsByTypeToTemporary(translatedPayload, metadata.ResultIDPathsByType, store)
}

func translateToolErrorToTemporary(err error, store *TemporaryIDStore) error {
	if err == nil || store == nil {
		return err
	}
	typed, ok := err.(*toolError)
	if !ok || len(typed.data) == 0 {
		return err
	}

	data := copyMetaMap(typed.data)
	for _, key := range []string{"blockedSectionIds", "targetSectionIds", "unmappedCodeObjIds"} {
		values, ok := data[key]
		if !ok {
			continue
		}
		translated, translateErr := translateStringSliceValueToTemporary(values, store)
		if translateErr != nil {
			return translateErr
		}
		data[key] = translated
	}
	if value, ok := data["missingEdgesCanonical"]; ok {
		translated, translateErr := translateMissingEdgeHintsToTemporary(value, store)
		if translateErr != nil {
			return translateErr
		}
		data["missingEdges"] = translated
	}
	return &toolError{
		code:    typed.code,
		message: typed.message,
		data:    data,
	}
}

func translateMissingEdgeHintsToTemporary(value any, store *TemporaryIDStore) ([]scopeViolationMissingEdge, error) {
	if value == nil || store == nil {
		return nil, nil
	}

	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("mcpx: marshal missing edge hints for id translation: %w", err)
	}
	var hints []scopeViolationMissingEdge
	if err := json.Unmarshal(encoded, &hints); err != nil {
		return nil, fmt.Errorf("mcpx: decode missing edge hints for id translation: %w", err)
	}

	translated := make([]scopeViolationMissingEdge, 0, len(hints))
	for _, hint := range hints {
		sourceSectionID, err := translateStringValueToTemporary(hint.SourceSectionID, store)
		if err != nil {
			return nil, err
		}
		targetSectionID, err := translateStringValueToTemporary(hint.TargetSectionID, store)
		if err != nil {
			return nil, err
		}
		translated = append(translated, scopeViolationMissingEdge{
			SourceSectionID: sourceSectionID,
			TargetSectionID: targetSectionID,
			Kind:            hint.Kind,
		})
	}
	return translated, nil
}

func resolveCanonicalClientID(store *TemporaryIDStore, value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || store == nil {
		return trimmed, nil
	}
	resolved, err := store.ResolveClientID(trimmed)
	if err == nil {
		return resolved, nil
	}
	var unknown *UnknownTemporaryIDError
	if asUnknownTemporaryIDError(err, &unknown) {
		return "", newToolError("invalid_arguments", "%s", unknown.Error())
	}
	return "", err
}

func asUnknownTemporaryIDError(err error, target **UnknownTemporaryIDError) bool {
	if err == nil {
		return false
	}
	typed, ok := err.(*UnknownTemporaryIDError)
	if !ok {
		return false
	}
	*target = typed
	return true
}

func translateStringArgumentField(arguments map[string]any, key string, store *TemporaryIDStore) error {
	rawValue, ok := arguments[key]
	if !ok || rawValue == nil {
		return nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return nil
	}
	translated, err := resolveCanonicalClientID(store, value)
	if err != nil {
		return err
	}
	arguments[key] = translated
	return nil
}

func translateResultIDsByTypeToTemporary(
	payload any,
	resultIDPathsByType map[tools.IDType][]string,
	store *TemporaryIDStore,
) (any, error) {
	if payload == nil || len(resultIDPathsByType) == 0 || store == nil {
		return payload, nil
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("mcpx: marshal result payload for id translation: %w", err)
	}

	var decoded any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		return nil, fmt.Errorf("mcpx: decode result payload for id translation: %w", err)
	}

	rewritten := decoded
	for _, idType := range []tools.IDType{
		tools.IDTypeSection,
		tools.IDTypeSectionVariant,
		tools.IDTypeCodeObject,
	} {
		paths := resultIDPathsByType[idType]
		if len(paths) == 0 {
			continue
		}
		rewritten, err = rewriteIDsAtPaths(rewritten, paths, func(value string) (string, error) {
			return translateStringValueToTemporary(value, store)
		})
		if err != nil {
			return nil, err
		}
	}
	return rewritten, nil
}

func translateStringValueToTemporary(value string, store *TemporaryIDStore) (string, error) {
	if strings.TrimSpace(value) == "" || store == nil {
		return value, nil
	}
	return store.EnsureTemporaryID(value)
}

func translateOptionalStringPointerToTemporary(value *string, store *TemporaryIDStore) (*string, error) {
	if value == nil {
		return nil, nil
	}
	translated, err := translateStringValueToTemporary(*value, store)
	if err != nil {
		return nil, err
	}
	return &translated, nil
}

func translateStringSliceToTemporary(values []string, store *TemporaryIDStore) ([]string, error) {
	if len(values) == 0 {
		return nil, nil
	}
	translated := make([]string, len(values))
	for index, value := range values {
		resolved, err := translateStringValueToTemporary(value, store)
		if err != nil {
			return nil, err
		}
		translated[index] = resolved
	}
	return translated, nil
}

func translateStringMapKeysToTemporary(values map[string]projectstate.TopLevelSectionLayout, store *TemporaryIDStore) (map[string]projectstate.TopLevelSectionLayout, error) {
	if values == nil {
		return map[string]projectstate.TopLevelSectionLayout{}, nil
	}
	translated := make(map[string]projectstate.TopLevelSectionLayout, len(values))
	for canonicalID, layout := range values {
		temporaryID, err := translateStringValueToTemporary(canonicalID, store)
		if err != nil {
			return nil, err
		}
		translated[temporaryID] = layout.Clone()
	}
	return translated, nil
}

func translateBoolMapKeysToTemporary(values map[string]bool, store *TemporaryIDStore) (map[string]bool, error) {
	if values == nil {
		return map[string]bool{}, nil
	}
	translated := make(map[string]bool, len(values))
	for canonicalID, value := range values {
		temporaryID, err := translateStringValueToTemporary(canonicalID, store)
		if err != nil {
			return nil, err
		}
		translated[temporaryID] = value
	}
	return translated, nil
}

func translateProjectStateSummaryToTemporary(summary projectStateSummary, store *TemporaryIDStore) (projectStateSummary, error) {
	projectConfig, err := translateProjectConfigToTemporary(summary.ProjectConfig, store)
	if err != nil {
		return projectStateSummary{}, err
	}
	sections := make([]projectStateSummarySection, 0, len(summary.Sections))
	for _, section := range summary.Sections {
		sectionID, err := translateStringValueToTemporary(section.SectionID, store)
		if err != nil {
			return projectStateSummary{}, err
		}
		variantID, err := translateStringValueToTemporary(section.VariantID, store)
		if err != nil {
			return projectStateSummary{}, err
		}
		parentSectionID, err := translateOptionalStringPointerToTemporary(section.ParentSectionID, store)
		if err != nil {
			return projectStateSummary{}, err
		}
		childSectionIDs, err := translateStringSliceToTemporary(section.ChildSectionIDs, store)
		if err != nil {
			return projectStateSummary{}, err
		}
		sections = append(sections, projectStateSummarySection{
			SectionID:       sectionID,
			CoreName:        section.CoreName,
			VariantID:       variantID,
			VariantName:     section.VariantName,
			ParentSectionID: parentSectionID,
			ChildSectionIDs: childSectionIDs,
			TopLevelLayout:  cloneTopLevelLayout(section.TopLevelLayout),
		})
	}

	singletonSections, err := translateSingletonSectionsToTemporary(summary.SingletonSections, store)
	if err != nil {
		return projectStateSummary{}, err
	}
	parentSectionMap, err := translateParentSectionMapToTemporary(summary.ParentSectionMap, store)
	if err != nil {
		return projectStateSummary{}, err
	}
	return projectStateSummary{
		ProjectConfig:         projectConfig,
		Sections:              sections,
		SingletonSections:     singletonSections,
		ParentSectionMap:      parentSectionMap,
		RequiredDecodedImages: append([]string(nil), summary.RequiredDecodedImages...),
		GenCodeBinding:        cloneCodeFileBinding(summary.GenCodeBinding),
	}, nil
}

func translateProjectConfigToTemporary(config projectview.ProjectConfig, store *TemporaryIDStore) (projectview.ProjectConfig, error) {
	projectID, err := translateStringValueToTemporary(config.ID, store)
	if err != nil {
		return projectview.ProjectConfig{}, err
	}
	activeViewModeID, err := translateOptionalStringPointerToTemporary(config.ActiveViewModeID, store)
	if err != nil {
		return projectview.ProjectConfig{}, err
	}
	entryCodeBlockID, err := translateOptionalStringPointerToTemporary(config.EntryCodeBlockID, store)
	if err != nil {
		return projectview.ProjectConfig{}, err
	}
	topLevelSections, err := translateStringMapKeysToTemporary(config.TopLevelSections, store)
	if err != nil {
		return projectview.ProjectConfig{}, err
	}
	windowSpaces, err := translateWindowSpacesToTemporary(config.WindowSpaces, store)
	if err != nil {
		return projectview.ProjectConfig{}, err
	}
	sectionVariantMap, err := translateSectionVariantMapToTemporary(config.SectionVariantMap, store)
	if err != nil {
		return projectview.ProjectConfig{}, err
	}
	activeIDs, err := translateStringSliceToTemporary(config.ActiveIDs, store)
	if err != nil {
		return projectview.ProjectConfig{}, err
	}
	edges, err := translateEdgesToTemporary(config.Edges, store)
	if err != nil {
		return projectview.ProjectConfig{}, err
	}
	agenticEdges, err := translateAgenticEdgesToTemporary(config.AgenticEdges, store)
	if err != nil {
		return projectview.ProjectConfig{}, err
	}
	viewModes, err := translateViewModesToTemporary(config.ViewModes, store)
	if err != nil {
		return projectview.ProjectConfig{}, err
	}

	return projectview.ProjectConfig{
		ID:                      projectID,
		Name:                    config.Name,
		ShowParamDisplayNames:   config.ShowParamDisplayNames,
		AllowJSONSourceKeyEdits: config.AllowJSONSourceKeyEdits,
		PreviewImgColor:         config.PreviewImgColor,
		Viewport:                cloneViewport(config.Viewport),
		ViewportInitialized:     config.ViewportInitialized,
		ViewModes:               viewModes,
		ActiveViewModeID:        activeViewModeID,
		IsEditingViewMode:       config.IsEditingViewMode,
		CodegenTargets:          cloneRawJSONList(config.CodegenTargets),
		WatchCodeEnabled:        config.WatchCodeEnabled,
		WatchCodeFolders:        cloneWatchCodeFolders(config.WatchCodeFolders),
		WatchCodeFiles:          append([]string(nil), config.WatchCodeFiles...),
		WatchCodeRegistry:       cloneWatchCodeRegistry(config.WatchCodeRegistry),
		WatchCodeBaselineByPath: cloneStringSliceMap(config.WatchCodeBaselineByPath),
		EntryCodeBlockID:        entryCodeBlockID,
		TopLevelSections:        topLevelSections,
		WindowSpaces:            windowSpaces,
		SectionVariantMap:       sectionVariantMap,
		ActiveIDs:               activeIDs,
		Edges:                   edges,
		AgenticEdges:            agenticEdges,
	}, nil
}

func translateWindowSpacesToTemporary(values map[string]projectstate.WindowSpaceConfig, store *TemporaryIDStore) (map[string]projectstate.WindowSpaceConfig, error) {
	if values == nil {
		return map[string]projectstate.WindowSpaceConfig{}, nil
	}
	translated := make(map[string]projectstate.WindowSpaceConfig, len(values))
	for windowSpaceID, windowSpace := range values {
		temporaryWindowSpaceID, err := translateStringValueToTemporary(windowSpaceID, store)
		if err != nil {
			return nil, err
		}
		internalWindowSpaceID, err := translateStringValueToTemporary(windowSpace.ID, store)
		if err != nil {
			return nil, err
		}
		order, err := translateStringSliceToTemporary(windowSpace.Order, store)
		if err != nil {
			return nil, err
		}
		windowsByID := make(map[string]projectstate.WindowSpaceWindow, len(windowSpace.WindowsByID))
		for instanceID, window := range windowSpace.WindowsByID {
			temporaryInstanceID, err := translateStringValueToTemporary(instanceID, store)
			if err != nil {
				return nil, err
			}
			clonedWindow := window.Clone()
			clonedWindow.SectionIDOrNull, err = translateOptionalStringPointerToTemporary(window.SectionIDOrNull, store)
			if err != nil {
				return nil, err
			}
			clonedWindow.ChatID, err = translateOptionalStringPointerToTemporary(window.ChatID, store)
			if err != nil {
				return nil, err
			}
			windowsByID[temporaryInstanceID] = clonedWindow
		}
		translated[temporaryWindowSpaceID] = projectstate.WindowSpaceConfig{
			WindowsByID: windowsByID,
			Order:       order,
			ID:          internalWindowSpaceID,
			Name:        windowSpace.Name,
			SortIndex:   windowSpace.SortIndex,
		}
	}
	return translated, nil
}

func translateViewModesToTemporary(values map[string]projectstate.ViewMode, store *TemporaryIDStore) (map[string]projectstate.ViewMode, error) {
	if values == nil {
		return map[string]projectstate.ViewMode{}, nil
	}
	translated := make(map[string]projectstate.ViewMode, len(values))
	for viewModeID, viewMode := range values {
		temporaryViewModeID, err := translateStringValueToTemporary(viewModeID, store)
		if err != nil {
			return nil, err
		}
		internalViewModeID, err := translateStringValueToTemporary(viewMode.ID, store)
		if err != nil {
			return nil, err
		}
		visibilityBySectionID, err := translateBoolMapKeysToTemporary(viewMode.VisibilityBySectionID, store)
		if err != nil {
			return nil, err
		}
		topLevelSections, err := translateStringMapKeysToTemporary(viewMode.TopLevelSections, store)
		if err != nil {
			return nil, err
		}
		translated[temporaryViewModeID] = projectstate.ViewMode{
			ID:                    internalViewModeID,
			Name:                  viewMode.Name,
			SortIndex:             viewMode.SortIndex,
			IsUserFacing:          viewMode.IsUserFacing,
			IsTab:                 viewMode.IsTab,
			VisibilityBySectionID: visibilityBySectionID,
			Viewport:              cloneViewport(viewMode.Viewport),
			ViewportInitialized:   viewMode.ViewportInitialized,
			TopLevelSections:      topLevelSections,
		}
	}
	return translated, nil
}

func translateSectionVariantMapToTemporary(values map[string]string, store *TemporaryIDStore) (map[string]string, error) {
	if values == nil {
		return map[string]string{}, nil
	}
	translated := make(map[string]string, len(values))
	for sectionID, variantID := range values {
		temporarySectionID, err := translateStringValueToTemporary(sectionID, store)
		if err != nil {
			return nil, err
		}
		temporaryVariantID, err := translateStringValueToTemporary(variantID, store)
		if err != nil {
			return nil, err
		}
		translated[temporarySectionID] = temporaryVariantID
	}
	return translated, nil
}

func translateEdgesToTemporary(values []projectstate.Edge, store *TemporaryIDStore) ([]projectstate.Edge, error) {
	if values == nil {
		return nil, nil
	}
	translated := make([]projectstate.Edge, 0, len(values))
	for _, edge := range values {
		id, err := translateStringValueToTemporary(edge.ID, store)
		if err != nil {
			return nil, err
		}
		sourceSectionID, err := translateStringValueToTemporary(edge.SourceSectionID, store)
		if err != nil {
			return nil, err
		}
		sourceVariantID, err := translateStringValueToTemporary(edge.SourceVariantID, store)
		if err != nil {
			return nil, err
		}
		sourcePortID, err := translateStringValueToTemporary(edge.SourcePortID, store)
		if err != nil {
			return nil, err
		}
		targetSectionID, err := translateStringValueToTemporary(edge.TargetSectionID, store)
		if err != nil {
			return nil, err
		}
		targetVariantID, err := translateStringValueToTemporary(edge.TargetVariantID, store)
		if err != nil {
			return nil, err
		}
		targetPortID, err := translateStringValueToTemporary(edge.TargetPortID, store)
		if err != nil {
			return nil, err
		}
		cloned := edge.Clone()
		cloned.ID = id
		cloned.SourceSectionID = sourceSectionID
		cloned.SourceVariantID = sourceVariantID
		cloned.SourcePortID = sourcePortID
		cloned.TargetSectionID = targetSectionID
		cloned.TargetVariantID = targetVariantID
		cloned.TargetPortID = targetPortID
		translated = append(translated, cloned)
	}
	return translated, nil
}

func translateAgenticEdgesToTemporary(values []projectstate.AgenticEdge, store *TemporaryIDStore) ([]projectstate.AgenticEdge, error) {
	if values == nil {
		return nil, nil
	}
	translated := make([]projectstate.AgenticEdge, 0, len(values))
	for _, edge := range values {
		id, err := translateStringValueToTemporary(edge.ID, store)
		if err != nil {
			return nil, err
		}
		sourceSectionID, err := translateStringValueToTemporary(edge.SourceSectionID, store)
		if err != nil {
			return nil, err
		}
		targetSectionID, err := translateStringValueToTemporary(edge.TargetSectionID, store)
		if err != nil {
			return nil, err
		}
		cloned := edge.Clone()
		cloned.ID = id
		cloned.SourceSectionID = sourceSectionID
		cloned.TargetSectionID = targetSectionID
		translated = append(translated, cloned)
	}
	return translated, nil
}

func translateSingletonSectionsToTemporary(value projectview.SingletonSections, store *TemporaryIDStore) (projectview.SingletonSections, error) {
	globalVariables, err := translateOptionalStringPointerToTemporary(value.GlobalVariables, store)
	if err != nil {
		return projectview.SingletonSections{}, err
	}
	genPythonCode, err := translateOptionalStringPointerToTemporary(value.GenPythonCode, store)
	if err != nil {
		return projectview.SingletonSections{}, err
	}
	genPythonMetadata, err := translateOptionalStringPointerToTemporary(value.GenPythonMetadata, store)
	if err != nil {
		return projectview.SingletonSections{}, err
	}
	return projectview.SingletonSections{
		GlobalVariables:   globalVariables,
		GenPythonCode:     genPythonCode,
		GenPythonMetadata: genPythonMetadata,
	}, nil
}

func translateParentSectionMapToTemporary(values map[string]*string, store *TemporaryIDStore) (map[string]*string, error) {
	if values == nil {
		return map[string]*string{}, nil
	}
	translated := make(map[string]*string, len(values))
	for sectionID, parentSectionID := range values {
		temporarySectionID, err := translateStringValueToTemporary(sectionID, store)
		if err != nil {
			return nil, err
		}
		temporaryParentSectionID, err := translateOptionalStringPointerToTemporary(parentSectionID, store)
		if err != nil {
			return nil, err
		}
		translated[temporarySectionID] = temporaryParentSectionID
	}
	return translated, nil
}

func translateLSPDiagnosticsPayloadToTemporary(payload projectstate.LSPDiagnosticsPayload, store *TemporaryIDStore) (projectstate.LSPDiagnosticsPayload, error) {
	projectID, err := translateStringValueToTemporary(payload.ProjectID, store)
	if err != nil {
		return projectstate.LSPDiagnosticsPayload{}, err
	}
	genProjectID, err := translateStringValueToTemporary(payload.GenCode.ProjectID, store)
	if err != nil {
		return projectstate.LSPDiagnosticsPayload{}, err
	}
	genErrors, err := translateSectionTypeErrorsMapToTemporary(payload.GenCode.Errors, store)
	if err != nil {
		return projectstate.LSPDiagnosticsPayload{}, err
	}
	codeSections, err := translateDiagnosticsBySectionToTemporary(payload.CodeSections, store)
	if err != nil {
		return projectstate.LSPDiagnosticsPayload{}, err
	}
	return projectstate.LSPDiagnosticsPayload{
		ProjectID: projectID,
		GenCode: projectstate.ProjectConfigDiagnostics{
			ProjectID: genProjectID,
			Errors:    genErrors,
			IsGenCode: payload.GenCode.IsGenCode,
		},
		CodeSections:    codeSections,
		UnmappedGenCode: cloneDiagnostics(payload.UnmappedGenCode),
	}, nil
}

func translateSectionTypeErrorsMapToTemporary(values map[string]projectstate.SectionTypeErrors, store *TemporaryIDStore) (map[string]projectstate.SectionTypeErrors, error) {
	if values == nil {
		return map[string]projectstate.SectionTypeErrors{}, nil
	}
	translated := make(map[string]projectstate.SectionTypeErrors, len(values))
	for sectionID, errors := range values {
		temporarySectionID, err := translateStringValueToTemporary(sectionID, store)
		if err != nil {
			return nil, err
		}
		cloned := projectstate.SectionTypeErrors{
			Callable: append([]string(nil), errors.Callable...),
		}
		if errors.Params != nil {
			cloned.Params = make(map[string][]string, len(errors.Params))
			for key, values := range errors.Params {
				cloned.Params[key] = append([]string(nil), values...)
			}
		}
		translated[temporarySectionID] = cloned
	}
	return translated, nil
}

func translateDiagnosticsBySectionToTemporary(values map[string][]projectstate.LSPDiagnostic, store *TemporaryIDStore) (map[string][]projectstate.LSPDiagnostic, error) {
	if values == nil {
		return map[string][]projectstate.LSPDiagnostic{}, nil
	}
	translated := make(map[string][]projectstate.LSPDiagnostic, len(values))
	for sectionID, diagnostics := range values {
		temporarySectionID, err := translateStringValueToTemporary(sectionID, store)
		if err != nil {
			return nil, err
		}
		translated[temporarySectionID] = cloneDiagnostics(diagnostics)
	}
	return translated, nil
}

func translateStringSliceValueToTemporary(value any, store *TemporaryIDStore) ([]string, error) {
	rawValues, ok := value.([]string)
	if !ok {
		rawAnyValues, ok := value.([]any)
		if !ok {
			return nil, fmt.Errorf("mcpx: expected string slice, got %T", value)
		}
		rawValues = make([]string, 0, len(rawAnyValues))
		for _, entry := range rawAnyValues {
			typed, ok := entry.(string)
			if !ok {
				return nil, fmt.Errorf("mcpx: expected string slice entry, got %T", entry)
			}
			rawValues = append(rawValues, typed)
		}
	}
	return translateStringSliceToTemporary(rawValues, store)
}

func cloneTopLevelLayout(value *projectstate.TopLevelSectionLayout) *projectstate.TopLevelSectionLayout {
	if value == nil {
		return nil
	}
	cloned := value.Clone()
	return &cloned
}

func cloneDiagnostics(values []projectstate.LSPDiagnostic) []projectstate.LSPDiagnostic {
	if values == nil {
		return nil
	}
	cloned := make([]projectstate.LSPDiagnostic, len(values))
	copy(cloned, values)
	return cloned
}
