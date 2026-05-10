package httpapi

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"setta/internal/codegen"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/settingsstate"
)

func writeChildSectionMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrChildSectionParentIDRequired):
		writeError(w, r, http.StatusBadRequest, "parent_id_required", "Parent id is required.")
	case errors.Is(err, projectstate.ErrChildSectionIncrementerCalledByRequired),
		errors.Is(err, projectstate.ErrChildSectionDecrementerCalledByRequired):
		writeError(w, r, http.StatusBadRequest, "called_by_required", "Called-by section id is required.")
	case errors.Is(err, projectstate.ErrChildSectionImplTypeRequired):
		writeError(w, r, http.StatusBadRequest, "impl_type_required", "Section type is required.")
	case errors.Is(err, projectstate.ErrChildSectionCountInvalid),
		errors.Is(err, projectstate.ErrChildSectionDecrementerCountInvalid),
		errors.Is(err, projectstate.ErrChildSectionStartIdxInvalid):
		writeError(w, r, http.StatusBadRequest, "child_section_request_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrChildSectionImplTypeUnsupported),
		errors.Is(err, projectstate.ErrChildSectionParentUnsupported),
		errors.Is(err, projectstate.ErrCodeSectionChildTypeInvalid),
		errors.Is(err, projectstate.ErrCodeSectionChildCountInvalid),
		errors.Is(err, projectstate.ErrCodeSectionAlreadyHasChild),
		errors.Is(err, projectstate.ErrChildSectionIncrementerCalledByUnsupported),
		errors.Is(err, projectstate.ErrChildSectionIncrementerCalledByNotInParent),
		errors.Is(err, projectstate.ErrChildSectionDecrementerCalledByUnsupported),
		errors.Is(err, projectstate.ErrChildSectionDecrementerCalledByNotInParent):
		writeError(w, r, http.StatusUnprocessableEntity, "child_section_mutation_invalid", err.Error())
	case projectstate.IsInvalidAutoLayoutError(err),
		errors.Is(err, projectstate.ErrSettingsValueInvalid),
		errors.Is(err, settingsstate.ErrSettingsValueInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_auto_layout", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeProjectRouteStateError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeGetPasswordParamValueError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrPasswordParamRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "password_param_required", "Param info must resolve to a password param.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeChangeParamImplError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
	case errors.Is(err, projectstate.ErrChangeParamImplSelectedRequired):
		writeError(w, r, http.StatusBadRequest, "selected_id_required", "Selected impl or code object type is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrChangeParamImplUnsupported),
		errors.Is(err, projectstate.ErrChangeParamImplCodeObjTypeUnknown),
		errors.Is(err, projectstate.ErrChangeParamImplCodeObjTypeNotAllowed):
		writeError(w, r, http.StatusUnprocessableEntity, "change_param_impl_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeParamValueMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrCodeObjectValueMutationUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "param_value_mutation_unsupported", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeUpdateParamImplConfigError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrUpdateParamImplConfigUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "param_impl_config_unsupported", err.Error())
	case errors.Is(err, projectstate.ErrUpdateParamImplConfigFieldUnsupported),
		errors.Is(err, projectstate.ErrUpdateParamImplConfigFieldInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "param_impl_config_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeCodeObjNameMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "code_obj_id_required", "Code object id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "code_obj_not_found", "Code object not found.")
	case errors.Is(err, projectstate.ErrCodeObjActiveReferenceNotFound):
		writeError(w, r, http.StatusUnprocessableEntity, "code_obj_active_reference_not_found", err.Error())
	case errors.Is(err, projectstate.ErrCodeObjRenameUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "code_obj_rename_unsupported", err.Error())
	case projectstate.IsInvalidCodeObjectNameError(err):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeCodeObjDisplayNameMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "code_obj_id_required", "Code object id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "code_obj_not_found", "Code object not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeCodeSectionAttachedTerminalError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrCodeSectionRequired):
		writeError(w, r, http.StatusBadRequest, "invalid_code_section", "Section must resolve to a code section.")
	case errors.Is(err, projectstate.ErrTerminalSectionRequired):
		writeError(w, r, http.StatusBadRequest, "invalid_terminal_section", "Section must resolve to a terminal section.")
	case errors.Is(err, projectstate.ErrCodeSectionAttachedTerminalConflict),
		errors.Is(err, projectstate.ErrCodeSectionMultipleChildren):
		writeError(w, r, http.StatusUnprocessableEntity, "attached_terminal_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeDeleteSectionVariantError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrSectionVariantIDRequired):
		writeError(w, r, http.StatusBadRequest, "variant_id_required", "Variant id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrSectionVariantNotFound),
		errors.Is(err, projectstate.ErrSectionVariantMembership):
		writeError(w, r, http.StatusNotFound, "variant_not_found", "Variant not found.")
	case errors.Is(err, projectstate.ErrSectionVariantDeletePromptPathRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "json_source_filepath_required", "JSON source variants must have a file path.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSectionVariantMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrSectionVariantIDRequired):
		writeError(w, r, http.StatusBadRequest, "variant_id_required", "Variant id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrSectionVariantNotFound),
		errors.Is(err, projectstate.ErrSectionVariantMembership):
		writeError(w, r, http.StatusNotFound, "variant_not_found", "Variant not found.")
	case projectstate.IsInvalidSectionVariantSortOrderError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "variant_sort_order_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeVariantMetadataMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionVariantIDRequired):
		writeError(w, r, http.StatusBadRequest, "variant_id_required", "Variant id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionVariantNotFound):
		writeError(w, r, http.StatusNotFound, "variant_not_found", "Variant not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeVariantJSONSourceMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrJSONSourceKeyEditsDisabled):
		writeError(w, r, http.StatusForbidden, "json_source_key_edits_disabled", "JSON source key edits are disabled for this project.")
	case errors.Is(err, projectstate.ErrJSONSourceKeysPathNotFound):
		writeError(w, r, http.StatusBadRequest, "json_source_keys_path_not_found", err.Error())
	case errors.Is(err, projectstate.ErrJSONSourceKeysMustResolveToObject):
		writeError(w, r, http.StatusBadRequest, "json_source_keys_object_required", err.Error())
	case errors.Is(err, projectstate.ErrSectionVariantDictSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "dict_section_required", "Section variant must resolve to a dict section.")
	default:
		writeSectionVariantMutationError(w, r, err)
	}
}

func writeDeleteSectionsError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrDeleteSectionsSectionIDsRequired),
		errors.Is(err, projectstate.ErrDeleteSectionsSectionIDBlank):
		writeError(w, r, http.StatusBadRequest, "section_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeProjectLayoutMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case writeProjectLayoutMutationRequiredError(w, r, err):
	case writeProjectLayoutMutationNotFoundError(w, r, err):
	case writeProjectLayoutMutationUnsupportedError(w, r, err):
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeProjectLayoutMutationRequiredError(
	w http.ResponseWriter,
	r *http.Request,
	err error,
) bool {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	default:
		return false
	}
	return true
}

func writeProjectLayoutMutationNotFoundError(
	w http.ResponseWriter,
	r *http.Request,
	err error,
) bool {
	switch {
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	default:
		return false
	}
	return true
}

func writeProjectLayoutMutationUnsupportedError(
	w http.ResponseWriter,
	r *http.Request,
	err error,
) bool {
	switch {
	case errors.Is(err, projectstate.ErrGroupSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "group_section_required", "Section must resolve to a group section.")
	case errors.Is(err, projectstate.ErrDefaultChildSectionParentRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "default_child_section_parent_required", "Section must resolve to a list root or group section.")
	case errors.Is(err, projectstate.ErrDefaultChildSectionTypeInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "default_child_section_type_invalid", err.Error())
	case errors.Is(err, projectstate.ErrListRootSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "list_root_section_required", "Section must resolve to a list root section.")
	case errors.Is(err, projectstate.ErrListRootViewModeInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "list_root_view_mode_invalid", err.Error())
	case errors.Is(err, projectstate.ErrSectionParamFilterUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "section_param_filter_unsupported", err.Error())
	case errors.Is(err, projectstate.ErrMetaControlSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "meta_control_section_required", "Section must resolve to a meta control section.")
	case projectstate.IsInvalidAutoLayoutError(err),
		errors.Is(err, projectstate.ErrSettingsValueInvalid),
		errors.Is(err, settingsstate.ErrSettingsValueInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_auto_layout", err.Error())
	case errors.Is(err, projectstate.ErrSectionParamColumnWidthUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "section_param_column_width_unsupported", err.Error())
	default:
		return false
	}
	return true
}

func writeSectionEdgeMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrSectionEdgeIOUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "section_edge_io_unsupported", err.Error())
	case errors.Is(err, projectstate.ErrSectionEdgeInputParamUnsupported),
		errors.Is(err, projectstate.ErrChangeParamImplUnsupported),
		errors.Is(err, projectstate.ErrChangeParamImplCodeObjTypeNotAllowed):
		writeError(w, r, http.StatusUnprocessableEntity, "edge_input_param_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeGraphEdgeMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case writeGraphEdgeMutationRequiredError(w, r, err):
	case writeGraphEdgeMutationNotFoundError(w, r, err):
	case writeGraphEdgeMutationConflictError(w, r, err):
	case writeGraphEdgeMutationValidationError(w, r, err):
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeGraphEdgeMutationRequiredError(
	w http.ResponseWriter,
	r *http.Request,
	err error,
) bool {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrSectionVariantIDRequired):
		writeError(w, r, http.StatusBadRequest, "variant_id_required", "Variant id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "port_id_required", "Port id is required.")
	case errors.Is(err, projectstate.ErrEdgeIDRequired):
		writeError(w, r, http.StatusBadRequest, "edge_id_required", "Edge id is required.")
	default:
		return false
	}
	return true
}

func writeGraphEdgeMutationNotFoundError(
	w http.ResponseWriter,
	r *http.Request,
	err error,
) bool {
	switch {
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrEdgeNotFound):
		writeError(w, r, http.StatusNotFound, "edge_not_found", "Edge not found.")
	case errors.Is(err, projectstate.ErrStateMachineEdgeNotFound):
		writeError(w, r, http.StatusNotFound, "state_machine_edge_not_found", "State machine edge not found.")
	case errors.Is(err, projectstate.ErrAgenticEdgeNotFound):
		writeError(w, r, http.StatusNotFound, "agentic_edge_not_found", "Agentic edge not found.")
	default:
		return false
	}
	return true
}

func writeGraphEdgeMutationConflictError(
	w http.ResponseWriter,
	r *http.Request,
	err error,
) bool {
	switch {
	case errors.Is(err, projectstate.ErrEdgeDuplicateID):
		writeError(w, r, http.StatusConflict, "edge_id_conflict", err.Error())
	case errors.Is(err, projectstate.ErrStateMachineEdgeDuplicateID):
		writeError(w, r, http.StatusConflict, "state_machine_edge_id_conflict", err.Error())
	case errors.Is(err, projectstate.ErrAgenticEdgeDuplicateID):
		writeError(w, r, http.StatusConflict, "agentic_edge_id_conflict", err.Error())
	default:
		return false
	}
	return true
}

func writeGraphEdgeMutationValidationError(
	w http.ResponseWriter,
	r *http.Request,
	err error,
) bool {
	switch {
	case errors.Is(err, projectstate.ErrProjectCodegenPythonTargetMissing):
		writeError(w, r, http.StatusUnprocessableEntity, "project_codegen_python_target_missing", err.Error())
	case errors.Is(err, projectstate.ErrEdgeEndpointSectionUnsupported),
		errors.Is(err, projectstate.ErrEdgeSourcePortNotFound),
		errors.Is(err, projectstate.ErrEdgeTargetPortNotFound):
		writeError(w, r, http.StatusUnprocessableEntity, "edge_endpoint_invalid", err.Error())
	case errors.Is(err, projectstate.ErrStateMachineEdgeInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "state_machine_edge_invalid", err.Error())
	case errors.Is(err, projectstate.ErrPromptSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "prompt_section_required", "Section must resolve to a prompt section.")
	case errors.Is(err, projectstate.ErrAgenticEdgeKindInvalid),
		errors.Is(err, projectstate.ErrAgenticEdgeSourceSectionType),
		errors.Is(err, projectstate.ErrAgenticEdgeTargetSectionType):
		writeError(w, r, http.StatusUnprocessableEntity, "agentic_edge_invalid", err.Error())
	case errors.Is(err, projectstate.ErrAgenticEdgeContextModeInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "agentic_edge_context_mode_invalid", err.Error())
	case errors.Is(err, codegen.ErrPythonDependencyNodeNotFound):
		writeError(w, r, http.StatusUnprocessableEntity, "edge_expression_unavailable", err.Error())
	default:
		return false
	}
	return true
}

func writeGroupSectionsError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrGroupSectionsSectionIDsRequired),
		errors.Is(err, projectstate.ErrGroupSectionsSectionIDBlank):
		writeError(w, r, http.StatusBadRequest, "section_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrGroupSectionsParentMismatch),
		errors.Is(err, projectstate.ErrTopLevelSectionLayoutRequired),
		errors.Is(err, projectstate.ErrChildSectionParentIDRequired),
		errors.Is(err, projectstate.ErrChildSectionImplTypeRequired),
		errors.Is(err, projectstate.ErrChildSectionImplTypeUnsupported),
		errors.Is(err, projectstate.ErrChildSectionCountInvalid),
		errors.Is(err, projectstate.ErrChildSectionStartIdxInvalid),
		errors.Is(err, projectstate.ErrChildSectionParentUnsupported),
		errors.Is(err, projectstate.ErrCodeSectionChildTypeInvalid),
		errors.Is(err, projectstate.ErrCodeSectionChildCountInvalid),
		errors.Is(err, projectstate.ErrCodeSectionAlreadyHasChild):
		writeError(w, r, http.StatusUnprocessableEntity, "group_sections_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeMoveSectionsError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrChildSectionParentIDRequired):
		writeError(w, r, http.StatusBadRequest, "parent_id_required", "Parent id is required.")
	case errors.Is(err, projectstate.ErrMoveSectionsSectionIDBlank):
		writeError(w, r, http.StatusBadRequest, "section_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrMoveSectionsPositionsRequired),
		errors.Is(err, projectstate.ErrMoveSectionsPositionMissing),
		errors.Is(err, projectstate.ErrMoveSectionsPositionInvalid):
		writeError(w, r, http.StatusBadRequest, "positions_invalid", err.Error())
	case errors.Is(err, projectstate.ErrMoveSectionsNewIndexRequired),
		errors.Is(err, projectstate.ErrMoveSectionsNewIndexNegative):
		writeError(w, r, http.StatusBadRequest, "new_index_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrMoveSectionsAncestorSelection),
		errors.Is(err, projectstate.ErrMoveSectionsNewIndexOutOfRange),
		errors.Is(err, projectstate.ErrMoveSectionsNewParentSelected),
		errors.Is(err, projectstate.ErrMoveSectionsNewParentDescendant),
		errors.Is(err, projectstate.ErrChildSectionParentUnsupported),
		errors.Is(err, projectstate.ErrCodeSectionChildTypeInvalid),
		errors.Is(err, projectstate.ErrCodeSectionChildCountInvalid),
		errors.Is(err, projectstate.ErrCodeSectionAlreadyHasChild):
		writeError(w, r, http.StatusUnprocessableEntity, "move_sections_invalid", err.Error())
	case projectstate.IsInvalidAutoLayoutError(err),
		errors.Is(err, projectstate.ErrSettingsValueInvalid),
		errors.Is(err, settingsstate.ErrSettingsValueInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_auto_layout", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writePrepareSectionsForCopyError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrClipboardSectionIDBlank):
		writeError(w, r, http.StatusBadRequest, "section_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrSectionVariantNotFound),
		errors.Is(err, projectstate.ErrSectionImplNotFound),
		errors.Is(err, projectstate.ErrCodeObjNotFound),
		errors.Is(err, projectstate.ErrCodeObjVariantNotFound),
		errors.Is(err, projectstate.ErrCodeObjImplNotFound),
		errors.Is(err, projectstate.ErrClipboardSectionVariantMissing):
		writeError(w, r, http.StatusUnprocessableEntity, "prepare_sections_for_copy_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func isClipboardProjectStateValidationError(err error) bool {
	switch {
	case errors.Is(err, projectstate.ErrSectionIDRequired),
		errors.Is(err, projectstate.ErrSectionNameRequired),
		errors.Is(err, projectstate.ErrSectionIDKeyMismatch),
		errors.Is(err, projectstate.ErrSectionVariantIDRequired),
		errors.Is(err, projectstate.ErrSectionVariantIDKeyMismatch),
		errors.Is(err, projectstate.ErrSectionImplIDRequired),
		errors.Is(err, projectstate.ErrSectionImplIDKeyMismatch),
		errors.Is(err, projectstate.ErrSectionDefaultVariantMissing),
		errors.Is(err, projectstate.ErrSectionImplKindRequired),
		errors.Is(err, projectstate.ErrParentSectionNotFound),
		errors.Is(err, projectstate.ErrSectionVariantNotFound),
		errors.Is(err, projectstate.ErrSectionImplNotFound),
		errors.Is(err, projectstate.ErrSectionVariantMembership),
		errors.Is(err, projectstate.ErrCodeObjIDRequired),
		errors.Is(err, projectstate.ErrCodeObjNameRequired),
		errors.Is(err, projectstate.ErrCodeObjIDKeyMismatch),
		errors.Is(err, projectstate.ErrCodeObjVariantIDRequired),
		errors.Is(err, projectstate.ErrCodeObjVariantIDKeyMismatch),
		errors.Is(err, projectstate.ErrCodeObjImplIDRequired),
		errors.Is(err, projectstate.ErrCodeObjImplIDKeyMismatch),
		errors.Is(err, projectstate.ErrCodeObjDefaultVariantMissing),
		errors.Is(err, projectstate.ErrCodeObjImplTypeRequired),
		errors.Is(err, projectstate.ErrCodeObjNotFound),
		errors.Is(err, projectstate.ErrCodeObjVariantNotFound),
		errors.Is(err, projectstate.ErrCodeObjImplNotFound),
		errors.Is(err, projectstate.ErrCodeObjVariantMembership),
		errors.Is(err, projectstate.ErrFrontendPayloadInvalid):
		return true
	default:
		return false
	}
}

func writePasteSectionsError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrPasteSectionsPositionInvalid):
		writeError(w, r, http.StatusBadRequest, "position_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrClipboardSectionIDBlank),
		errors.Is(err, projectstate.ErrClipboardSectionVariantMissing),
		errors.Is(err, projectstate.ErrSectionNotFound),
		errors.Is(err, projectstate.ErrSectionVariantNotFound),
		errors.Is(err, projectstate.ErrSectionImplNotFound),
		errors.Is(err, projectstate.ErrCodeObjNotFound),
		errors.Is(err, projectstate.ErrCodeObjVariantNotFound),
		errors.Is(err, projectstate.ErrCodeObjImplNotFound),
		errors.Is(err, projectstate.ErrSectionVariantMembership),
		errors.Is(err, projectstate.ErrCodeObjVariantMembership):
		writeError(w, r, http.StatusUnprocessableEntity, "paste_sections_invalid", err.Error())
	case isClipboardProjectStateValidationError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "paste_sections_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeUngroupGroupsError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrUngroupGroupsGroupIDsRequired),
		errors.Is(err, projectstate.ErrUngroupGroupsGroupIDBlank):
		writeError(w, r, http.StatusBadRequest, "group_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrGroupSectionRequired),
		errors.Is(err, projectstate.ErrTopLevelSectionLayoutRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "ungroup_groups_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeParamSelectionMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrCodeObjIDRequired):
		writeError(w, r, http.StatusBadRequest, "param_info_id_required", "Param info id is required.")
	case errors.Is(err, projectstate.ErrDeleteSelectedParamsParamIDBlank):
		writeError(w, r, http.StatusBadRequest, "param_info_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrParamSelectionUnsupported),
		errors.Is(err, projectstate.ErrParamSelectionTargetUnsupported),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsUnsupported),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsRootMissing),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParamUnsupported),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParentMissing),
		errors.Is(err, projectstate.ErrDeleteSelectedParamsParentUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "param_selection_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeParamMoveMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrParamMoveParamIDBlank):
		writeError(w, r, http.StatusBadRequest, "param_ids_invalid", err.Error())
	case errors.Is(err, projectstate.ErrParamMoveNewParentRequired):
		writeError(w, r, http.StatusBadRequest, "new_parent_id_required", "New parent id is required.")
	case errors.Is(err, projectstate.ErrParamMoveNewIndexNegative):
		writeError(w, r, http.StatusBadRequest, "new_index_invalid", err.Error())
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeObjNotFound),
		errors.Is(err, projectstate.ErrParamMoveParamNotFound):
		writeError(w, r, http.StatusNotFound, "param_info_not_found", "Param info not found.")
	case errors.Is(err, projectstate.ErrParamMoveNewParentNotFound):
		writeError(w, r, http.StatusNotFound, "new_parent_not_found", "New parent not found.")
	case errors.Is(err, projectstate.ErrParamMoveUnsupported),
		errors.Is(err, projectstate.ErrParamMoveRootMissing),
		errors.Is(err, projectstate.ErrParamMoveFilterActive),
		errors.Is(err, projectstate.ErrParamMoveParamUnsupported),
		errors.Is(err, projectstate.ErrParamMoveParentMissing),
		errors.Is(err, projectstate.ErrParamMoveParentUnsupported),
		errors.Is(err, projectstate.ErrParamMoveSelectionSpansParents),
		errors.Is(err, projectstate.ErrParamMoveAncestorSelection),
		errors.Is(err, projectstate.ErrParamMoveNewParentSelected),
		errors.Is(err, projectstate.ErrParamMoveNewParentDescendant),
		errors.Is(err, projectstate.ErrParamMoveNewIndexOutOfRange),
		errors.Is(err, projectstate.ErrParamMoveParentMissingFromGrand),
		errors.Is(err, projectstate.ErrChangeParamImplUnsupported),
		errors.Is(err, projectstate.ErrChangeParamImplCodeObjTypeNotAllowed):
		writeError(w, r, http.StatusUnprocessableEntity, "param_move_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeKwargMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrAddKwargUnsupported),
		errors.Is(err, projectstate.ErrAddKwargCallableUnset),
		errors.Is(err, projectstate.ErrAddKwargParentTypeUnsupported),
		errors.Is(err, projectstate.ErrDeleteKwargUnsupported),
		errors.Is(err, projectstate.ErrDeleteKwargCallableUnset),
		errors.Is(err, projectstate.ErrDeleteKwargNoParams),
		errors.Is(err, projectstate.ErrDeleteKwargRootMissing),
		errors.Is(err, projectstate.ErrDeleteKwargParentUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "kwarg_mutation_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeBrowserSectionMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrBrowserSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "browser_section_required", "Section must resolve to a browser section.")
	case errors.Is(err, projectstate.ErrBrowserAreaViewModeInvalid):
		writeError(w, r, http.StatusBadRequest, "browser_area_view_mode_invalid", err.Error())
	case errors.Is(err, projectstate.ErrBrowserSearchScopeInvalid):
		writeError(w, r, http.StatusBadRequest, "browser_search_scope_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeSectionDataMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrSpreadsheetSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "spreadsheet_section_required", "Section must resolve to a spreadsheet section.")
	case errors.Is(err, projectstate.ErrSpreadsheetGridDensityInvalid):
		writeError(w, r, http.StatusBadRequest, "spreadsheet_grid_density_invalid", err.Error())
	case errors.Is(err, projectstate.ErrTaskBoardSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "task_board_section_required", "Section must resolve to a task board section.")
	case errors.Is(err, projectstate.ErrTaskBoardViewModeInvalid):
		writeError(w, r, http.StatusBadRequest, "task_board_view_mode_invalid", err.Error())
	case errors.Is(err, projectstate.ErrImageSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "image_section_required", "Section must resolve to an image section.")
	case errors.Is(err, projectstate.ErrSocialSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "social_section_required", "Section must resolve to a social section.")
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeDrawAreaMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrDrawSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "draw_section_required", "Section must resolve to a draw section.")
	case errors.Is(err, projectstate.ErrDrawAreaLayerIndexInvalid):
		writeError(w, r, http.StatusBadRequest, "draw_layer_index_invalid", err.Error())
	case errors.Is(err, projectstate.ErrDrawAreaLayerItemTypeInvalid):
		writeError(w, r, http.StatusBadRequest, "draw_area_layer_item_type_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeChartMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrChartSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "chart_section_required", "Section must resolve to a chart section.")
	case errors.Is(err, projectstate.ErrChartTypeInvalid):
		writeError(w, r, http.StatusBadRequest, "chart_type_invalid", err.Error())
	case errors.Is(err, projectstate.ErrChartSettingsFieldInvalid):
		writeError(w, r, http.StatusBadRequest, "chart_settings_field_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeTextBlockMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrTextBlockSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "text_block_section_required", "Section must resolve to a text block section.")
	case errors.Is(err, projectstate.ErrTextBlockDisplayModeInvalid):
		writeError(w, r, http.StatusBadRequest, "text_block_display_mode_invalid", err.Error())
	case errors.Is(err, projectstate.ErrTextBlockFormatInvalid):
		writeError(w, r, http.StatusBadRequest, "text_block_format_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writePromptSectionMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrPromptSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "prompt_section_required", "Section must resolve to a prompt section.")
	case errors.Is(err, projectstate.ErrPromptFormatInvalid):
		writeError(w, r, http.StatusBadRequest, "prompt_format_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writePromptTemplateLinkMutationError(
	w http.ResponseWriter,
	r *http.Request,
	err error,
	sectionID string,
) {
	if errors.Is(err, projectstate.ErrPromptSectionRequired) {
		writeDetail(
			w,
			http.StatusBadRequest,
			fmt.Sprintf("Section %s failed type guard", strings.TrimSpace(sectionID)),
		)
		return
	}
	writePromptSectionMutationError(w, r, err)
}

func writeChatSectionMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrChatSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "chat_section_required", "Section must resolve to a chat section.")
	case errors.Is(err, projectstate.ErrChatPermissionModeInvalid):
		writeError(w, r, http.StatusBadRequest, "chat_permission_mode_invalid", err.Error())
	case errors.Is(err, projectstate.ErrChatDictationModeInvalid):
		writeError(w, r, http.StatusBadRequest, "chat_dictation_mode_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeStateMachineSectionMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrStateMachineSectionRequired):
		writeError(w, r, http.StatusUnprocessableEntity, "state_machine_section_required", "Section must resolve to a state machine section.")
	case errors.Is(err, projectstate.ErrStateMachineGateTypeInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "state_machine_gate_type_invalid", err.Error())
	case errors.Is(err, projectstate.ErrStateMachineEdgeInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "state_machine_section_settings_invalid", err.Error())
	default:
		writeProjectLayoutMutationError(w, r, err)
	}
}

func writeWindowSpaceMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrWindowSpaceIDRequired):
		writeError(w, r, http.StatusBadRequest, "window_space_id_required", "Window space id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrWindowSpaceNotFound):
		writeError(w, r, http.StatusNotFound, "window_space_not_found", "Window space not found.")
	case projectstate.IsInvalidWindowSpaceNameError(err):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
	case projectstate.IsInvalidWindowSpaceSortOrderError(err):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
	case projectstate.IsInvalidWindowSpaceStateError(err):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeProjectChatWindowingMutationError(
	w http.ResponseWriter,
	r *http.Request,
	err error,
) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectChatWindowIDRequired):
		writeError(w, r, http.StatusBadRequest, "instance_id_required", "Instance id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrProjectChatWindowNotFound):
		writeError(w, r, http.StatusNotFound, "project_chat_window_not_found", "Project chat window not found.")
	case projectstate.IsInvalidProjectChatWindowingError(err):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeProjectChatWindowChatIDMutationError(
	w http.ResponseWriter,
	r *http.Request,
	err error,
) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectChatWindowIDRequired):
		writeError(w, r, http.StatusBadRequest, "instance_id_required", "Instance id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrProjectChatWindowNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": err.Error()})
	case projectstate.IsInvalidProjectChatWindowingError(err):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeCreateTopLevelSectionError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrTopLevelSectionImplTypeRequired):
		writeError(w, r, http.StatusBadRequest, "impl_type_required", "Top-level section implType is required.")
	case errors.Is(err, projectstate.ErrTopLevelSectionImplTypeUnsupported):
		writeError(w, r, http.StatusUnprocessableEntity, "impl_type_unsupported", err.Error())
	case errors.Is(err, projectstate.ErrTopLevelMetaControlCodeObjTypeUnsupported),
		errors.Is(err, projectstate.ErrTopLevelMetaControlCodeObjTypeNotAllowed):
		writeError(w, r, http.StatusUnprocessableEntity, "control_code_obj_type_invalid", err.Error())
	case projectstate.IsInvalidSectionNameError(err):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSectionNameMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case projectstate.IsInvalidSectionNameError(err):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeRenameRefactorMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrRenameRefactorFrontendOpRequired):
		writeError(w, r, http.StatusBadRequest, "frontend_op_id_required", "Frontend op id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrRenameRefactorPendingNotFound):
		writeError(w, r, http.StatusNotFound, "rename_refactor_not_found", "Pending rename refactor not found.")
	case errors.Is(err, projectstate.ErrRenameRefactorProjectMismatch):
		writeError(w, r, http.StatusConflict, "rename_refactor_project_mismatch", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeAutoLayoutError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case projectstate.IsInvalidAutoLayoutError(err),
		errors.Is(err, projectstate.ErrSettingsValueInvalid),
		errors.Is(err, settingsstate.ErrSettingsValueInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_auto_layout", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeViewModeMutationError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrViewModeIDRequired):
		writeError(w, r, http.StatusBadRequest, "view_mode_id_required", "View mode id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrViewModeNotFound):
		writeError(w, r, http.StatusNotFound, "view_mode_not_found", "View mode not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case projectstate.IsInvalidViewModeNameError(err):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
	case projectstate.IsInvalidViewModeSortOrderError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_view_mode_sort_order", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSetProjectConfigCodegenTargetsError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrProjectCodegenPythonTargetPayloadInvalid),
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetObjectRequired),
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetFieldUnknown),
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetFieldInvalid),
		errors.Is(err, projectstate.ErrProjectCodegenPythonTargetLanguageMismatch),
		errors.Is(err, projectstate.ErrPythonSectionCodegenPolicyInvalid),
		errors.Is(err, projectstate.ErrPythonSectionCodegenPolicyFieldUnknown),
		errors.Is(err, projectstate.ErrPythonSectionCodegenPolicyFieldInvalid),
		errors.Is(err, projectstate.ErrPythonCodeObjValuePolicyInvalid),
		errors.Is(err, projectstate.ErrPythonCodeObjValuePolicyFieldUnknown),
		errors.Is(err, projectstate.ErrPythonCodeObjValuePolicyFieldInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_project_codegen_targets", err.Error())
	case errors.Is(err, ErrProjectCodegenTargetObjectRequired),
		errors.Is(err, ErrProjectCodegenTargetLanguageRequired),
		errors.Is(err, projectstate.ErrFrontendPayloadInvalid),
		errors.Is(err, projectstate.ErrProjectCodegenTargetLanguage),
		errors.Is(err, projectstate.ErrProjectCodegenTargetDuplicateLanguage),
		errors.Is(err, projectstate.ErrProjectCodegenTargetValidatorRequired),
		errors.Is(err, projectstate.ErrProjectCodegenPythonReconcilerRequired),
		errors.Is(err, plugins.ErrRegisteredCodegenTargetNotFound),
		errors.Is(err, plugins.ErrRegisteredCodegenTargetConflict):
		writeError(w, r, http.StatusBadRequest, "invalid_project_codegen_targets", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSetGenCodePrefixSuffixError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectview.ErrProjectConfigIDRequired),
		errors.Is(err, projectstate.ErrProjectIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrProjectCodegenPythonTargetMissing):
		writeError(w, r, http.StatusUnprocessableEntity, "project_codegen_python_target_missing", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSetCallableError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectview.ErrProjectConfigIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCallableSectionRequired):
		writeError(w, r, http.StatusBadRequest, "invalid_callable_section", "Section must resolve to a callable section.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSetCodeError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectview.ErrProjectConfigIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeSectionReadOnly):
		writeError(w, r, http.StatusForbidden, "code_section_read_only", "Code section is read-only.")
	case errors.Is(err, projectstate.ErrCodeSectionRequired):
		writeError(w, r, http.StatusBadRequest, "invalid_code_section", "Section must resolve to a code section.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeSetCodeFileBindingError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectview.ErrProjectConfigIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeSectionRequired):
		writeError(w, r, http.StatusBadRequest, "invalid_code_section", "Section must resolve to a code section.")
	case errors.Is(err, projectstate.ErrCodeFileBindingPathRequired):
		writeError(w, r, http.StatusBadRequest, "code_file_binding_path_required", "Code file binding path is required.")
	case errors.Is(err, projectstate.ErrCodeFileAccessModeInvalid):
		writeError(w, r, http.StatusBadRequest, "code_file_access_mode_invalid", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}

func writeFormatCodeError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired),
		errors.Is(err, projectview.ErrProjectConfigIDRequired):
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		writeError(w, r, http.StatusNotFound, "project_config_not_found", "Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		writeError(w, r, http.StatusNotFound, "section_not_found", "Section not found.")
	case errors.Is(err, projectstate.ErrCodeSectionReadOnly):
		writeError(w, r, http.StatusForbidden, "code_section_read_only", "Code section is read-only.")
	case projectstate.IsFormatCodeError(err):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_format_code", err.Error())
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
	}
}
