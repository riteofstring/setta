package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/statefs"
)

type deleteSectionVariantOrAskRequestState struct {
	projectID string
	sectionID string
	variantID string
	runtime   *projectstate.Runtime
}

func deleteSectionVariantOrAskHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requestState, ok := buildDeleteSectionVariantOrAskRequestState(w, r, deps)
		if !ok {
			return
		}
		resolvedPromptPath, ok := resolveDeleteSectionVariantPromptPath(w, r, deps.WorkspaceRoot, requestState)
		if !ok {
			return
		}
		if resolvedPromptPath != nil {
			writeJSON(w, http.StatusOK, *resolvedPromptPath)
			return
		}

		snapshot, err := requestState.runtime.DeleteSectionVariant(
			r.Context(),
			requestState.projectID,
			requestState.sectionID,
			requestState.variantID,
		)
		if err != nil {
			writeDeleteSectionVariantError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, requestState.runtime, snapshot, requestState.projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func buildDeleteSectionVariantOrAskRequestState(
	w http.ResponseWriter,
	r *http.Request,
	deps ProjectRouteDependencies,
) (deleteSectionVariantOrAskRequestState, bool) {
	payload, err := decodeJSONBody[DeleteSectionVariantOrAskRequest](r)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
		return deleteSectionVariantOrAskRequestState{}, false
	}

	projectID := strings.TrimSpace(payload.ProjectID)
	if projectID == "" {
		writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
		return deleteSectionVariantOrAskRequestState{}, false
	}
	sectionID := strings.TrimSpace(payload.SectionID)
	if sectionID == "" {
		writeError(w, r, http.StatusBadRequest, "section_id_required", "Section id is required.")
		return deleteSectionVariantOrAskRequestState{}, false
	}
	variantID := strings.TrimSpace(payload.VariantID)
	if variantID == "" {
		writeError(w, r, http.StatusBadRequest, "variant_id_required", "Variant id is required.")
		return deleteSectionVariantOrAskRequestState{}, false
	}
	if deps.ProjectState == nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return deleteSectionVariantOrAskRequestState{}, false
	}
	runtime, err := projectRuntimeForRequest(deps, r)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return deleteSectionVariantOrAskRequestState{}, false
	}
	return deleteSectionVariantOrAskRequestState{
		projectID: projectID,
		sectionID: sectionID,
		variantID: variantID,
		runtime:   runtime,
	}, true
}

func resolveDeleteSectionVariantPromptPath(
	w http.ResponseWriter,
	r *http.Request,
	workspaceRoot string,
	requestState deleteSectionVariantOrAskRequestState,
) (*string, bool) {
	promptPath, requiresPrompt, err := requestState.runtime.DeleteSectionVariantPromptPath(
		r.Context(),
		requestState.projectID,
		requestState.sectionID,
		requestState.variantID,
	)
	if err != nil {
		writeDeleteSectionVariantError(w, r, err)
		return nil, false
	}
	if !requiresPrompt {
		return nil, true
	}
	resolvedPath, err := statefs.ResolveWithinRoot(workspaceRoot, promptPath, "File path")
	if err != nil {
		writeError(w, r, http.StatusForbidden, "filepath_forbidden", "File path must be within the project root.")
		return nil, false
	}
	return &resolvedPath, true
}

func createNewSectionVariantHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[CreateNewSectionVariantRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectVariantMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, result, err := runtime.CreateNewSectionVariant(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			projectstate.CreateNewSectionVariantInput{SectionID: payload.SectionID},
		)
		if err != nil {
			writeSectionVariantMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, result)
	}
}

func setSectionVariantHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionVariantRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectVariantMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		snapshot, err := runtime.SetSectionVariant(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.SectionID,
			payload.VariantID,
		)
		if err != nil {
			writeSectionVariantMutationError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setDefaultSectionVariantHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetDefaultSectionVariantRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectVariantMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.SetDefaultSectionVariant(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.SectionID,
			payload.VariantID,
		); err != nil {
			writeSectionVariantMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setSectionVariantSortOrderHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionVariantSortOrderRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectVariantMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.SetSectionVariantSortOrder(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.SectionID,
			payload.OrderedVariantIDs,
		); err != nil {
			writeSectionVariantMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleVariantFrozenHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleVariantFrozenRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectVariantMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.ToggleVariantFrozen(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.VariantID,
		); err != nil {
			writeVariantMetadataMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func toggleVariantJSONSourceHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[ToggleVariantJSONSourceRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectVariantMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.ToggleVariantJSONSource(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.SectionID,
			payload.VariantID,
		); err != nil {
			writeVariantJSONSourceMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func setVariantJSONSourceKeysHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetVariantJSONSourceKeysRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectVariantMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		ctx := projectMutationContext(r.Context(), payload.FrontendOpID)
		snapshotDocument := runtime.Snapshot().Document
		resolution, preserveLiveTreeOnMissingReload, err := resolveVariantJSONSourceMutation(
			snapshotDocument,
			deps.WorkspaceRoot,
			projectID,
			payload,
		)
		if err != nil {
			writeVariantJSONSourceMutationError(w, r, err)
			return
		}
		if err := applyVariantJSONSourceMutation(
			runtime,
			ctx,
			projectID,
			payload,
			resolution,
			preserveLiveTreeOnMissingReload,
		); err != nil {
			writeVariantJSONSourceMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func resolveVariantJSONSourceMutation(
	snapshotDocument projectstate.Document,
	workspaceRoot string,
	projectID string,
	payload SetVariantJSONSourceKeysRequest,
) (projectstate.JSONSourceKeysResolution, bool, error) {
	resolution, err := projectstate.ResolveVariantJSONSourceKeys(
		snapshotDocument,
		workspaceRoot,
		projectID,
		payload.SectionID,
		payload.VariantID,
		payload.JSONSourceKeys,
	)
	if err != nil {
		return projectstate.JSONSourceKeysResolution{}, false, err
	}
	preserveLiveTreeOnMissingReload, err := resolveVariantJSONSourceMissingReloadPolicy(
		snapshotDocument,
		projectID,
		payload.SectionID,
		payload.VariantID,
		resolution,
	)
	if err != nil {
		return projectstate.JSONSourceKeysResolution{}, false, err
	}
	return resolution, preserveLiveTreeOnMissingReload, nil
}

func resolveVariantJSONSourceMissingReloadPolicy(
	snapshotDocument projectstate.Document,
	projectID string,
	sectionID string,
	variantID string,
	resolution projectstate.JSONSourceKeysResolution,
) (bool, error) {
	if !resolution.JSONSourceMissing {
		return false, nil
	}
	return snapshotDocument.ShouldPreserveVariantJSONSourceLiveTreeOnMissingReload(
		projectID,
		sectionID,
		variantID,
		resolution.JSONSourceKeys,
	)
}

func applyVariantJSONSourceMutation(
	runtime *projectstate.Runtime,
	ctx context.Context,
	projectID string,
	payload SetVariantJSONSourceKeysRequest,
	resolution projectstate.JSONSourceKeysResolution,
	preserveLiveTreeOnMissingReload bool,
) error {
	mutate := func(document projectstate.Document) (projectstate.Document, error) {
		return mutateVariantJSONSourceDocument(
			document,
			projectID,
			payload.SectionID,
			payload.VariantID,
			resolution,
			preserveLiveTreeOnMissingReload,
		)
	}
	if resolution.JSONSourceMissing && !preserveLiveTreeOnMissingReload {
		_, err := runtime.MutateAndSave(ctx, mutate)
		return err
	}
	_, err := runtime.MutateWithContext(ctx, mutate)
	return err
}

func mutateVariantJSONSourceDocument(
	document projectstate.Document,
	projectID string,
	sectionID string,
	variantID string,
	resolution projectstate.JSONSourceKeysResolution,
	preserveLiveTreeOnMissingReload bool,
) (projectstate.Document, error) {
	if resolution.JSONSourceMissing {
		if preserveLiveTreeOnMissingReload {
			return document, nil
		}
		if err := document.SetVariantJSONSourceKeysState(
			projectID,
			sectionID,
			variantID,
			resolution.JSONSourceKeys,
			true,
		); err != nil {
			return document, err
		}
		return document, nil
	}
	if resolution.JSONSourceObject == nil {
		return document, fmt.Errorf("json source object resolution missing for existing file")
	}
	if err := document.RefreshVariantJSONSourceLiveTree(
		projectID,
		sectionID,
		variantID,
		resolution.JSONSourceKeys,
		*resolution.JSONSourceObject,
	); err != nil {
		return document, err
	}
	return document, nil
}

func setSectionVariantNameHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[SetSectionVariantNameRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID := strings.TrimSpace(payload.ProjectID)
		if projectID == "" {
			writeError(w, r, http.StatusBadRequest, "project_config_id_required", "Project config id is required.")
			return
		}
		if !ensureProjectVariantMutationsAllowed(w, r, deps) {
			return
		}

		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		if _, err := runtime.SetSectionVariantName(
			projectMutationContext(r.Context(), payload.FrontendOpID),
			projectID,
			payload.VariantID,
			payload.Name,
		); err != nil {
			writeVariantMetadataMutationError(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteJSONSourceFileAndVariantHandler(deps ProjectRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[DeleteJSONSourceFileAndVariantRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		projectID, sectionID, variantID, err := deleteJSONSourceFileAndVariantIDs(payload)
		if err != nil {
			writeDeleteSectionVariantError(w, r, err)
			return
		}
		if deps.ProjectState == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		runtime, err := projectRuntimeForRequest(deps, r)
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		promptPath, requiresPrompt, err := runtime.DeleteSectionVariantPromptPath(r.Context(), projectID, sectionID, variantID)
		if err != nil {
			writeDeleteSectionVariantError(w, r, err)
			return
		}
		if !requiresPrompt {
			writeError(w, r, http.StatusUnprocessableEntity, "json_source_variant_required", "Section variant must resolve to a JSON source variant.")
			return
		}

		resolvedPath, err := statefs.ResolveWithinRoot(deps.WorkspaceRoot, promptPath, "File path")
		if err != nil {
			writeError(w, r, http.StatusForbidden, "filepath_forbidden", "File path must be within the project root.")
			return
		}
		removeFileAllowMissing(resolvedPath)

		snapshot, err := runtime.DeleteSectionVariant(r.Context(), projectID, sectionID, variantID)
		if err != nil {
			writeDeleteSectionVariantError(w, r, err)
			return
		}
		if err := broadcastProjectRouteStateUpdate(r, deps, runtime, snapshot, projectID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func deleteJSONSourceFileAndVariantIDs(payload DeleteJSONSourceFileAndVariantRequest) (string, string, string, error) {
	projectID := strings.TrimSpace(payload.ProjectID)
	if projectID == "" {
		return "", "", "", projectstate.ErrProjectIDRequired
	}
	sectionID := strings.TrimSpace(payload.SectionID)
	if sectionID == "" {
		return "", "", "", projectstate.ErrSectionIDRequired
	}
	variantID := strings.TrimSpace(payload.VariantID)
	if variantID == "" {
		return "", "", "", projectstate.ErrSectionVariantIDRequired
	}
	return projectID, sectionID, variantID, nil
}

func removeFileAllowMissing(path string) {
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return
	}
}
