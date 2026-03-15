package httpapi

import (
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/prompttemplates"
)

const RouteGetPromptTemplates = "/getPromptTemplates"
const RouteGetPromptTemplate = "/getPromptTemplate"
const RouteCreatePromptTemplate = "/createPromptTemplate"
const RouteUpdatePromptTemplate = "/updatePromptTemplate"
const RouteDeletePromptTemplate = "/deletePromptTemplate"

type PromptTemplateRouteDependencies struct {
	ModePolicy   modes.Policy
	Templates    *prompttemplates.Store
	ProjectState *projectstate.Runtime
}

type createPromptTemplateRequest struct {
	Name        *string                 `json:"name"`
	Description *string                 `json:"description"`
	Template    *string                 `json:"template"`
	Format      *prompttemplates.Format `json:"format"`
	InputSchema map[string]any          `json:"inputSchema"`
	Metadata    map[string]any          `json:"metadata"`
}

type getPromptTemplateRequest struct {
	TemplateID string `json:"templateId"`
}

type updatePromptTemplateRequest struct {
	Template *promptTemplatePayload `json:"template"`
}

type promptTemplatePayload struct {
	ID          *string                 `json:"id"`
	Name        *string                 `json:"name"`
	Description *string                 `json:"description"`
	Template    *string                 `json:"template"`
	Format      *prompttemplates.Format `json:"format"`
	InputSchema map[string]any          `json:"inputSchema"`
	Metadata    map[string]any          `json:"metadata"`
}

type deletePromptTemplateRequest struct {
	TemplateID string `json:"templateId"`
}

type promptTemplateRouteError struct {
	Status  int
	Code    string
	Message string
}

func RegisterPromptTemplateRoutes(router chi.Router, deps PromptTemplateRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Templates == nil {
		return fmt.Errorf("prompt template store is required in ide mode")
	}

	router.With(RequireIDEMode(deps.ModePolicy)).Get(RouteGetPromptTemplates, getPromptTemplatesHandler(deps.Templates))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteGetPromptTemplate, getPromptTemplateHandler(deps.Templates))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreatePromptTemplate, createPromptTemplateHandler(deps.Templates))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUpdatePromptTemplate, updatePromptTemplateHandler(deps.Templates, deps.ProjectState))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeletePromptTemplate, deletePromptTemplateHandler(deps.Templates, deps.ProjectState))
	return nil
}

func getPromptTemplatesHandler(store *prompttemplates.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		templates, err := store.List()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, templates)
	}
}

func getPromptTemplateHandler(store *prompttemplates.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[getPromptTemplateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		templateID := strings.TrimSpace(payload.TemplateID)
		if templateID == "" {
			writeError(w, r, http.StatusBadRequest, "template_id_required", "Template id is required.")
			return
		}
		template, err := store.Get(templateID)
		if err != nil {
			if writePromptTemplateStoreError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, template)
	}
}

func createPromptTemplateHandler(store *prompttemplates.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[createPromptTemplateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		template, routeErr := buildCreatedPromptTemplate(payload)
		if routeErr != nil {
			writeError(w, r, routeErr.Status, routeErr.Code, routeErr.Message)
			return
		}
		if err := store.Save(template); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		saved, err := store.Get(template.ID)
		if err != nil {
			if writePromptTemplateStoreError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, saved)
	}
}

func updatePromptTemplateHandler(store *prompttemplates.Store, projectState *projectstate.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[updatePromptTemplateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		template, routeErr := buildUpdatedPromptTemplate(payload)
		if routeErr != nil {
			writeError(w, r, routeErr.Status, routeErr.Code, routeErr.Message)
			return
		}
		if _, err := store.Get(template.ID); err != nil {
			if writePromptTemplateStoreError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if err := store.Save(template); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if projectState != nil {
			if _, _, err := projectState.RefreshLinkedPromptSectionsForTemplate(
				r.Context(),
				template.ID,
				template.Template,
				projectstate.PromptFormat(template.Format),
			); err != nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
		}

		saved, err := store.Get(template.ID)
		if err != nil {
			if writePromptTemplateStoreError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, saved)
	}
}

func deletePromptTemplateHandler(store *prompttemplates.Store, projectState *projectstate.Runtime) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[deletePromptTemplateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		templateID := strings.TrimSpace(payload.TemplateID)
		if templateID == "" {
			writeError(w, r, http.StatusBadRequest, "template_id_required", "Template id is required.")
			return
		}
		if _, err := store.Get(templateID); err != nil {
			if writePromptTemplateStoreError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if projectState != nil {
			references := projectState.Snapshot().Document.WorkflowPromptTemplateReferences(templateID)
			if len(references) > 0 {
				writeError(
					w,
					r,
					http.StatusConflict,
					"prompt_template_in_use",
					fmt.Sprintf(
						"Prompt template %s is still referenced by workflow edges: %s",
						templateID,
						strings.Join(references, "; "),
					),
				)
				return
			}
		}
		if err := store.Delete(templateID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func buildCreatedPromptTemplate(payload createPromptTemplateRequest) (prompttemplates.Template, *promptTemplateRouteError) {
	if payload.Name == nil {
		return prompttemplates.Template{}, &promptTemplateRouteError{
			Status:  http.StatusBadRequest,
			Code:    "prompt_template_name_required",
			Message: "Prompt template name is required.",
		}
	}
	if payload.Template == nil {
		return prompttemplates.Template{}, &promptTemplateRouteError{
			Status:  http.StatusBadRequest,
			Code:    "prompt_template_template_required",
			Message: "Prompt template template is required.",
		}
	}

	format, routeErr := resolvePromptTemplateFormat(payload.Format)
	if routeErr != nil {
		return prompttemplates.Template{}, routeErr
	}

	template := prompttemplates.Template{
		ID:          newPromptTemplateID(),
		Name:        *payload.Name,
		Template:    *payload.Template,
		Format:      format,
		InputSchema: payload.InputSchema,
		Metadata:    payload.Metadata,
	}
	if payload.Description != nil {
		template.Description = *payload.Description
	}
	return template, nil
}

func buildUpdatedPromptTemplate(payload updatePromptTemplateRequest) (prompttemplates.Template, *promptTemplateRouteError) {
	if payload.Template == nil {
		return prompttemplates.Template{}, &promptTemplateRouteError{
			Status:  http.StatusBadRequest,
			Code:    "prompt_template_required",
			Message: "Prompt template is required.",
		}
	}
	if payload.Template.ID == nil || strings.TrimSpace(*payload.Template.ID) == "" {
		return prompttemplates.Template{}, &promptTemplateRouteError{
			Status:  http.StatusBadRequest,
			Code:    "template_id_required",
			Message: "Template id is required.",
		}
	}
	if payload.Template.Name == nil {
		return prompttemplates.Template{}, &promptTemplateRouteError{
			Status:  http.StatusBadRequest,
			Code:    "prompt_template_name_required",
			Message: "Prompt template name is required.",
		}
	}
	if payload.Template.Template == nil {
		return prompttemplates.Template{}, &promptTemplateRouteError{
			Status:  http.StatusBadRequest,
			Code:    "prompt_template_template_required",
			Message: "Prompt template template is required.",
		}
	}

	format, routeErr := resolvePromptTemplateFormat(payload.Template.Format)
	if routeErr != nil {
		return prompttemplates.Template{}, routeErr
	}

	template := prompttemplates.Template{
		ID:          strings.TrimSpace(*payload.Template.ID),
		Name:        *payload.Template.Name,
		Template:    *payload.Template.Template,
		Format:      format,
		InputSchema: payload.Template.InputSchema,
		Metadata:    payload.Template.Metadata,
	}
	if payload.Template.Description != nil {
		template.Description = *payload.Template.Description
	}
	return template, nil
}

func resolvePromptTemplateFormat(raw *prompttemplates.Format) (prompttemplates.Format, *promptTemplateRouteError) {
	if raw == nil {
		return "", nil
	}
	switch *raw {
	case "", prompttemplates.FormatJinja:
		return *raw, nil
	default:
		return "", &promptTemplateRouteError{
			Status:  http.StatusBadRequest,
			Code:    "invalid_prompt_template_format",
			Message: "Prompt template format is invalid.",
		}
	}
}

func writePromptTemplateStoreError(w http.ResponseWriter, r *http.Request, err error) bool {
	if errors.Is(err, prompttemplates.ErrTemplateNotFound) {
		writeError(w, r, http.StatusNotFound, "prompt_template_not_found", "Prompt template not found.")
		return true
	}
	return false
}

func newPromptTemplateID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return fmt.Sprintf("prompt-template-%d", time.Now().UnixNano())
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", raw[0:4], raw[4:6], raw[6:8], raw[8:10], raw[10:16])
}
