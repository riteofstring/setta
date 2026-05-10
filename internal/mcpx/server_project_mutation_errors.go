package mcpx

import (
	"context"
	"errors"
	"strings"

	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

func resolveToolInvocationSessionKey(ctx context.Context) (string, error) {
	invocation, ok := ToolInvocationFromContext(ctx)
	if !ok || strings.TrimSpace(invocation.SessionKey) == "" {
		return "", newToolError("internal_error", "Unable to resolve MCP session for agentic context.")
	}
	return invocation.SessionKey, nil
}

func requireScopedProjectInvocation(ctx context.Context, projectConfigID string, missingContextMessage string) error {
	invocation, ok := ToolInvocationFromContext(ctx)
	if !ok || invocation.AgenticContext == nil || invocation.Scope == nil || invocation.ProjectView == nil {
		return newToolError("internal_error", missingContextMessage)
	}
	if projectConfigID != invocation.AgenticContext.ProjectConfigID {
		return newToolError(
			"invalid_arguments",
			"projectConfigId argument %q does not match agentic context projectConfigId %q.",
			projectConfigID,
			invocation.AgenticContext.ProjectConfigID,
		)
	}
	return nil
}

func executeScopedProjectStateOperation(
	ctx context.Context,
	projectConfigID string,
	missingContextMessage string,
	run func() (any, error),
) (any, error) {
	if err := requireScopedProjectInvocation(ctx, projectConfigID, missingContextMessage); err != nil {
		return nil, err
	}
	result, err := run()
	if err != nil {
		return nil, normalizeProjectStateMutationError(err)
	}
	return result, nil
}

func executeScopedStructuralMutation(
	ctx context.Context,
	projectConfigID string,
	missingContextMessage string,
	settingsState settingsStateProvider,
	run func(projectstate.StructuralMutationSettings) (any, error),
) (any, error) {
	if err := requireScopedProjectInvocation(ctx, projectConfigID, missingContextMessage); err != nil {
		return nil, err
	}
	settings, err := resolveStructuralMutationSettings(settingsState)
	if err != nil {
		return nil, normalizeProjectStateMutationError(err)
	}
	result, err := run(settings)
	if err != nil {
		return nil, normalizeProjectStateMutationError(err)
	}
	return result, nil
}

func reapplyCodeSectionIgnoreState(
	snapshot projectstate.Snapshot,
	projectConfigID string,
	sectionID string,
	diagnostics lspDiagnosticsProvider,
) error {
	project, err := snapshot.Document.ProjectByID(projectConfigID)
	if err != nil {
		return normalizeProjectStateMutationError(err)
	}
	return diagnostics.ReapplyCodeSectionIgnoreState(project, sectionID)
}

func normalizeProjectStateMutationError(err error) error {
	if err == nil {
		return nil
	}
	if code := projectStateMutationErrorCode(err); code != "" {
		return newToolError(code, "%s", err.Error())
	}
	return err
}

func projectStateMutationErrorCode(err error) string {
	switch {
	case errors.Is(err, projectstate.ErrProjectNotFound):
		return projectNotFoundErrorCode
	case errors.Is(err, appdefinition.ErrAppSpecNotFound):
		return "file_not_found"
	case projectstate.IsExpectedOldValueMismatchError(err):
		return "mutation_failed"
	case errors.Is(err, projectstate.ErrPersistedStoreUnsupported):
		return "internal_error"
	case isInvalidProjectStateMutationError(err):
		return "invalid_arguments"
	default:
		return ""
	}
}

func isInvalidProjectStateMutationError(err error) bool {
	return isBasicInvalidProjectStateMutationError(err) ||
		isSettingsOrWatchCodeMutationError(err) ||
		isAppSpecOrCodegenMutationError(err) ||
		isSectionOrParamMutationError(err) ||
		isStructureMutationError(err)
}

func isBasicInvalidProjectStateMutationError(err error) bool {
	return projectstate.IsInvalidSectionNameError(err) ||
		projectstate.IsInvalidSectionVariantSortOrderError(err) ||
		projectstate.IsFormatCodeError(err) ||
		projectstate.IsInvalidCodeObjectNameError(err) ||
		projectstate.IsInvalidAutoLayoutError(err)
}

func isSettingsOrWatchCodeMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrSettingsValueInvalid) ||
		errors.Is(err, settingsstate.ErrSettingsValueInvalid) ||
		errors.Is(err, projectstate.ErrWatchCodeWorkspaceRootRequired) ||
		errors.Is(err, projectstate.ErrWatchCodeInputPathInvalid)
}

func isAppSpecOrCodegenMutationError(err error) bool {
	return isCodegenMutationError(err)
}

func isSectionOrParamMutationError(err error) bool {
	return isSectionLookupMutationError(err) ||
		isKwargMutationError(err) ||
		isParamMutationError(err) ||
		isCodeObjectMutationError(err) ||
		isSectionCapabilityMutationError(err) ||
		isTypeErrorMutationError(err)
}

func isStructureMutationError(err error) bool {
	return isChildSectionMutationError(err) ||
		isIncrementerMutationError(err) ||
		isDecrementerMutationError(err) ||
		isDeleteSectionsMutationError(err) ||
		isTopLevelSectionMutationError(err) ||
		isCodeSectionStructureMutationError(err)
}

func isCodegenMutationError(err error) bool {
	return isProjectCodegenMutationError(err) || isPythonCodegenMutationError(err)
}

func isProjectCodegenMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrProjectCodegenTargetLanguage) ||
		errors.Is(err, projectstate.ErrProjectCodegenTargetDuplicateLanguage) ||
		errors.Is(err, projectstate.ErrProjectCodegenTargetValidatorRequired) ||
		errors.Is(err, projectstate.ErrProjectCodegenPythonReconcilerRequired) ||
		errors.Is(err, plugins.ErrRegisteredCodegenTargetNotFound) ||
		errors.Is(err, plugins.ErrRegisteredCodegenTargetConflict)
}

func isPythonCodegenMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrProjectCodegenPythonTargetPayloadInvalid) ||
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetObjectRequired) ||
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetFieldUnknown) ||
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetFieldInvalid) ||
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetMissing) ||
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetLanguageMismatch)
}

func isSectionLookupMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrSectionNotFound) ||
		errors.Is(err, projectstate.ErrSectionVariantNotFound) ||
		errors.Is(err, projectstate.ErrSectionVariantMembership) ||
		errors.Is(err, projectstate.ErrCodeObjNotFound) ||
		errors.Is(err, projectstate.ErrCallableSectionRequired) ||
		errors.Is(err, projectstate.ErrGroupSectionRequired)
}

func isKwargMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrAddKwargUnsupported) ||
		errors.Is(err, projectstate.ErrAddKwargCallableUnset) ||
		errors.Is(err, projectstate.ErrAddKwargParentTypeUnsupported) ||
		errors.Is(err, projectstate.ErrDeleteKwargUnsupported) ||
		errors.Is(err, projectstate.ErrDeleteKwargCallableUnset) ||
		errors.Is(err, projectstate.ErrDeleteKwargNoParams) ||
		errors.Is(err, projectstate.ErrDeleteKwargRootMissing) ||
		errors.Is(err, projectstate.ErrDeleteKwargParentUnsupported)
}

func isParamMutationError(err error) bool {
	return isChangeParamMutationError(err) ||
		isUpdateParamConfigMutationError(err) ||
		isDeleteSelectedParamsMutationError(err)
}

func isChangeParamMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrChangeParamImplUnsupported) ||
		errors.Is(err, projectstate.ErrChangeParamImplSelectedRequired) ||
		errors.Is(err, projectstate.ErrChangeParamImplCodeObjTypeUnknown) ||
		errors.Is(err, projectstate.ErrChangeParamImplCodeObjTypeNotAllowed)
}

func isUpdateParamConfigMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrUpdateParamImplConfigUnsupported) ||
		errors.Is(err, projectstate.ErrUpdateParamImplConfigFieldUnsupported) ||
		errors.Is(err, projectstate.ErrUpdateParamImplConfigFieldInvalid)
}

func isDeleteSelectedParamsMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrDeleteSelectedParamsUnsupported) ||
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParamIDBlank) ||
		errors.Is(err, projectstate.ErrDeleteSelectedParamsRootMissing) ||
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParamUnsupported) ||
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParentMissing) ||
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParentUnsupported)
}

func isCodeObjectMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrCodeObjRenameUnsupported) ||
		errors.Is(err, projectstate.ErrCodeObjActiveReferenceNotFound) ||
		errors.Is(err, projectstate.ErrCodeObjectValueMutationUnsupported) ||
		errors.Is(err, projectstate.ErrPasswordParamMutationUnsupported)
}

func isSectionCapabilityMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrSectionParamFilterUnsupported) ||
		errors.Is(err, projectstate.ErrMetaControlSectionRequired) ||
		errors.Is(err, projectstate.ErrCodeSectionRequired) ||
		errors.Is(err, projectstate.ErrCodeSectionReadOnly)
}

func isTypeErrorMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrInvalidTypeErrorIgnoreState) ||
		errors.Is(err, projectstate.ErrTypeErrorIgnoreUnsupported)
}

func isChildSectionMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrChildSectionParentIDRequired) ||
		errors.Is(err, projectstate.ErrChildSectionImplTypeRequired) ||
		errors.Is(err, projectstate.ErrChildSectionImplTypeUnsupported) ||
		errors.Is(err, projectstate.ErrChildSectionCountInvalid) ||
		errors.Is(err, projectstate.ErrChildSectionStartIdxInvalid) ||
		errors.Is(err, projectstate.ErrChildSectionParentUnsupported)
}

func isCodeSectionStructureMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrCodeSectionChildTypeInvalid) ||
		errors.Is(err, projectstate.ErrCodeSectionChildCountInvalid) ||
		errors.Is(err, projectstate.ErrCodeSectionAlreadyHasChild) ||
		errors.Is(err, projectstate.ErrInvalidCodeSectionDiagnosticCode)
}

func isIncrementerMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrChildSectionIncrementerCalledByRequired) ||
		errors.Is(err, projectstate.ErrChildSectionIncrementerCalledByUnsupported) ||
		errors.Is(err, projectstate.ErrChildSectionIncrementerCalledByNotInParent)
}

func isDecrementerMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrChildSectionDecrementerCalledByRequired) ||
		errors.Is(err, projectstate.ErrChildSectionDecrementerCalledByUnsupported) ||
		errors.Is(err, projectstate.ErrChildSectionDecrementerCalledByNotInParent) ||
		errors.Is(err, projectstate.ErrChildSectionDecrementerCountInvalid)
}

func isDeleteSectionsMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrDeleteSectionsSectionIDsRequired) ||
		errors.Is(err, projectstate.ErrDeleteSectionsSectionIDBlank)
}

func isTopLevelSectionMutationError(err error) bool {
	return errors.Is(err, projectstate.ErrTopLevelSectionImplTypeRequired) ||
		errors.Is(err, projectstate.ErrTopLevelSectionImplTypeUnsupported) ||
		errors.Is(err, projectstate.ErrTopLevelMetaControlCodeObjTypeUnsupported) ||
		errors.Is(err, projectstate.ErrTopLevelMetaControlCodeObjTypeNotAllowed) ||
		errors.Is(err, projectstate.ErrTopLevelSectionPositionInvalid)
}

func resolveStructuralMutationSettings(
	settingsState settingsStateProvider,
) (projectstate.StructuralMutationSettings, error) {
	if settingsState == nil {
		return projectstate.DefaultStructuralMutationSettings(), nil
	}
	return settingsstate.StructuralMutationSettingsForDocument(settingsState.Snapshot().Document)
}
