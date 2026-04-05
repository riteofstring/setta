package httpapi

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/deployments"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/prompttemplates"
	"setta/internal/realtime"
)

const RouteGetPromptTemplates = "/getPromptTemplates"
const RouteGetPromptTemplate = "/getPromptTemplate"
const RouteCreatePromptTemplate = "/createPromptTemplate"
const RouteUpdatePromptTemplate = "/updatePromptTemplate"
const RouteDeletePromptTemplate = "/deletePromptTemplate"

type PromptTemplateRouteDependencies struct {
	ModePolicy   modes.Policy
	Templates    *prompttemplates.Store
	Watcher      *prompttemplates.Watcher
	ProjectState *projectstate.Runtime
	Deployment   *deployments.Runtime
	WebsocketHub *realtime.WebsocketHub
}

type CreatePromptTemplateRequest struct {
	Name        *string                 `json:"name"`
	Description *string                 `json:"description"`
	Template    *string                 `json:"template"`
	Format      *prompttemplates.Format `json:"format"`
	InputSchema map[string]any          `json:"inputSchema"`
	Metadata    map[string]any          `json:"metadata"`
}

type PromptTemplateList []prompttemplates.Template

type GetPromptTemplateRequest struct {
	TemplateID string `json:"templateId"`
}

type UpdatePromptTemplateRequest struct {
	Template *PromptTemplatePayload `json:"template"`
}

type PromptTemplatePayload struct {
	ID          *string                 `json:"id"`
	Name        *string                 `json:"name"`
	Description *string                 `json:"description"`
	Template    *string                 `json:"template"`
	Format      *prompttemplates.Format `json:"format"`
	InputSchema map[string]any          `json:"inputSchema"`
	Metadata    map[string]any          `json:"metadata"`
}

type DeletePromptTemplateRequest struct {
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
	if deps.Templates == nil {
		return fmt.Errorf("prompt template store is required")
	}
	if deps.ModePolicy.IsDeployment() && deps.Deployment == nil {
		return fmt.Errorf("deployment runtime is required in deployment mode")
	}

	registerOpenAPIGet[PromptTemplateList](
		router,
		"getPromptTemplates",
		RouteGetPromptTemplates,
		getPromptTemplatesHandler(deps),
		withOpenAPITags("Prompt Templates"),
		withOpenAPISummary("List prompt templates when allowed by the current mode and policy."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[GetPromptTemplateRequest, prompttemplates.Template](
		router,
		"getPromptTemplate",
		RouteGetPromptTemplate,
		getPromptTemplateHandler(deps),
		withOpenAPITags("Prompt Templates"),
		withOpenAPISummary("Get a single prompt template."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[CreatePromptTemplateRequest, prompttemplates.Template](
		router,
		"createPromptTemplate",
		RouteCreatePromptTemplate,
		createPromptTemplateHandler(deps),
		withOpenAPITags("Prompt Templates"),
		withOpenAPISummary("Create a prompt template."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[UpdatePromptTemplateRequest, prompttemplates.Template](
		router,
		"updatePromptTemplate",
		RouteUpdatePromptTemplate,
		updatePromptTemplateHandler(deps),
		withOpenAPITags("Prompt Templates"),
		withOpenAPISummary("Update a prompt template."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[DeletePromptTemplateRequest, openAPIJSONNull](
		router,
		"deletePromptTemplate",
		RouteDeletePromptTemplate,
		deletePromptTemplateHandler(deps),
		withOpenAPITags("Prompt Templates"),
		withOpenAPISummary("Delete a prompt template."),
		withOpenAPIModeRequirement("ide"),
	)
	return nil
}

func ensurePromptTemplateReadsAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps PromptTemplateRouteDependencies,
) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if err := requestInfo.Policy.RequireNotLauncher(); err != nil {
		if writeModesError(w, r, err) {
			return false
		}
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if !requestInfo.Policy.IsDeployment() {
		return true
	}
	if deps.Deployment == nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if deps.Deployment.Policy().AllowLLM {
		return true
	}
	writeError(
		w,
		r,
		http.StatusForbidden,
		"llm_access_forbidden",
		"Deployment policy disallows LLM access.",
	)
	return false
}

func ensurePromptTemplateMutationsAllowed(
	w http.ResponseWriter,
	r *http.Request,
	action string,
) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if requestInfo.Policy.IsDeployment() {
		writeError(
			w,
			r,
			http.StatusForbidden,
			"mode_forbidden",
			fmt.Sprintf("Share mode does not allow %s prompt templates.", action),
		)
		return false
	}
	if err := requestInfo.Policy.RequireIDE(); err != nil {
		if writeModesError(w, r, err) {
			return false
		}
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	return true
}

func getPromptTemplatesHandler(deps PromptTemplateRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensurePromptTemplateReadsAllowed(w, r, deps) {
			return
		}
		if deps.Templates == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		templates, err := deps.Templates.List()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, templates)
	}
}

func getPromptTemplateHandler(deps PromptTemplateRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensurePromptTemplateReadsAllowed(w, r, deps) {
			return
		}
		if deps.Templates == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[GetPromptTemplateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		templateID := strings.TrimSpace(payload.TemplateID)
		if templateID == "" {
			writeError(w, r, http.StatusBadRequest, "template_id_required", "Template id is required.")
			return
		}
		template, err := deps.Templates.Get(templateID)
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

func createPromptTemplateHandler(deps PromptTemplateRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensurePromptTemplateMutationsAllowed(w, r, "creating") {
			return
		}
		store := deps.Templates
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[CreatePromptTemplateRequest](r)
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
		if deps.Watcher != nil {
			if err := deps.Watcher.SyncKnownState(); err != nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
		}
		if err := broadcastPromptTemplatesUpdated(r.Context(), store, deps.WebsocketHub); err != nil {
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

func updatePromptTemplateHandler(deps PromptTemplateRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensurePromptTemplateMutationsAllowed(w, r, "updating") {
			return
		}
		store := deps.Templates
		projectState := deps.ProjectState
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[UpdatePromptTemplateRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		template, routeErr := buildUpdatedPromptTemplate(payload)
		if routeErr != nil {
			writeError(w, r, routeErr.Status, routeErr.Code, routeErr.Message)
			return
		}
		linkedProjectIDs := []string(nil)
		if projectState != nil {
			linkedProjectIDs, err = linkedPromptTemplateProjectIDs(
				projectState.Snapshot().Document,
				template.ID,
			)
			if err != nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
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
		projectSnapshot := projectstate.Snapshot{}
		if projectState != nil {
			projectSnapshot, _, err = projectState.RefreshLinkedPromptSectionsForTemplate(
				r.Context(),
				template.ID,
				template.Template,
				template.Format,
			)
			if err != nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
		}
		if deps.Watcher != nil {
			if err := deps.Watcher.SyncKnownState(); err != nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
		}
		if err := broadcastPromptTemplatesUpdated(r.Context(), store, deps.WebsocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		if err := broadcastLinkedPromptTemplateProjectStateUpdates(
			r.Context(),
			deps.WebsocketHub,
			projectState,
			projectSnapshot,
			linkedProjectIDs,
		); err != nil {
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

func deletePromptTemplateHandler(deps PromptTemplateRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensurePromptTemplateMutationsAllowed(w, r, "deleting") {
			return
		}
		store := deps.Templates
		projectState := deps.ProjectState
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[DeletePromptTemplateRequest](r)
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
		if deps.Watcher != nil {
			if err := deps.Watcher.SyncKnownState(); err != nil {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
		}
		if err := broadcastPromptTemplatesUpdated(r.Context(), store, deps.WebsocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func broadcastPromptTemplatesUpdated(
	ctx context.Context,
	store *prompttemplates.Store,
	websocketHub *realtime.WebsocketHub,
) error {
	if websocketHub == nil || store == nil {
		return nil
	}
	templates, err := store.List()
	if err != nil {
		return err
	}
	_, err = websocketHub.BroadcastJSON(
		ctx,
		realtime.NewPromptTemplatesUpdatedMessage(templates),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	return err
}

func linkedPromptTemplateProjectIDs(
	document projectstate.Document,
	templateID string,
) ([]string, error) {
	normalizedTemplateID := strings.TrimSpace(templateID)
	if normalizedTemplateID == "" || len(document.Projects) == 0 {
		return nil, nil
	}

	projectIDs := make([]string, 0, len(document.Projects))
	for projectID := range document.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	linkedProjectIDs := make([]string, 0)
	for _, projectID := range projectIDs {
		project := document.Projects[projectID]
		sectionIDs := make([]string, 0, len(project.Sections))
		for sectionID := range project.Sections {
			sectionIDs = append(sectionIDs, sectionID)
		}
		sort.Strings(sectionIDs)

		for _, sectionID := range sectionIDs {
			source, err := project.PromptSectionSource(sectionID)
			if err != nil {
				if errors.Is(err, projectstate.ErrPromptSectionRequired) {
					continue
				}
				return nil, err
			}
			if source.PromptTemplateID == nil || *source.PromptTemplateID != normalizedTemplateID {
				continue
			}
			linkedProjectIDs = append(linkedProjectIDs, projectID)
			break
		}
	}

	return linkedProjectIDs, nil
}

func broadcastLinkedPromptTemplateProjectStateUpdates(
	ctx context.Context,
	websocketHub *realtime.WebsocketHub,
	projectState *projectstate.Runtime,
	snapshot projectstate.Snapshot,
	projectIDs []string,
) error {
	if websocketHub == nil || projectState == nil || len(projectIDs) == 0 {
		return nil
	}

	status := projectState.FrontendOpStatus()
	for _, projectID := range projectIDs {
		projectStateView, err := projectview.SingleConfigByProjectID(
			snapshot.Document,
			projectID,
		)
		if err != nil {
			return err
		}
		if _, err := websocketHub.BroadcastJSON(
			ctx,
			realtime.NewProjectStateUpdateMessage(realtime.ProjectStateUpdateContent{
				ProjectState:   projectStateView,
				CompletedOpIDs: status.Completed,
				PendingOpIDs:   status.Pending,
			}),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		); err != nil {
			return err
		}
	}

	return nil
}

func buildCreatedPromptTemplate(payload CreatePromptTemplateRequest) (prompttemplates.Template, *promptTemplateRouteError) {
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

func buildUpdatedPromptTemplate(payload UpdatePromptTemplateRequest) (prompttemplates.Template, *promptTemplateRouteError) {
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
