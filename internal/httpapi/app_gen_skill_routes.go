package httpapi

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/appgenskills"
	"setta/internal/modes"
)

const RouteGetAppGenSkills = "/getAppGenSkills"
const RouteGetAppGenSkillContent = "/getAppGenSkillContent"
const RouteUpsertAppGenCustomSkill = "/upsertAppGenCustomSkill"

type AppGenSkillRouteDependencies struct {
	ModePolicy modes.Policy
	Service    *appgenskills.Service
}

type GetAppGenSkillContentRequest struct {
	SkillID string `json:"skillId"`
}

type UpsertAppGenCustomSkillRequest struct {
	SkillID      *string `json:"skillId"`
	RelativePath *string `json:"relativePath"`
	Content      string  `json:"content"`
}

func RegisterAppGenSkillRoutes(router chi.Router, deps AppGenSkillRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsIDE() && deps.Service == nil {
		return fmt.Errorf("app gen skill service is required in ide mode")
	}

	protected := router.With(RequireIDEMode(deps.ModePolicy))
	protected.Get(RouteGetAppGenSkills, getAppGenSkillsHandler(deps.Service))
	protected.Post(RouteGetAppGenSkillContent, getAppGenSkillContentHandler(deps.Service))
	protected.Post(RouteUpsertAppGenCustomSkill, upsertAppGenCustomSkillHandler(deps.Service))
	return nil
}

func getAppGenSkillsHandler(service *appgenskills.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		response, err := service.ResolveSkillsResponse()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func getAppGenSkillContentHandler(service *appgenskills.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[GetAppGenSkillContentRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		content, err := service.ReadContent(payload.SkillID)
		if err != nil {
			writeAppGenSkillError(w, r, err, "invalid_app_gen_skill")
			return
		}
		writeJSON(w, http.StatusOK, content)
	}
}

func upsertAppGenCustomSkillHandler(service *appgenskills.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if service == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[UpsertAppGenCustomSkillRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		response, err := service.UpsertCustomSkill(optionalString(payload.SkillID), optionalString(payload.RelativePath), payload.Content)
		if err != nil {
			writeAppGenSkillError(w, r, err, "invalid_app_gen_custom_skill")
			return
		}
		writeJSON(w, http.StatusOK, response)
	}
}

func writeAppGenSkillError(w http.ResponseWriter, r *http.Request, err error, invalidCode string) {
	var notFoundErr *appgenskills.NotFoundError
	if errors.As(err, &notFoundErr) {
		writeError(w, r, http.StatusNotFound, "app_gen_skill_not_found", notFoundErr.Error())
		return
	}
	var invalidErr *appgenskills.InvalidError
	if errors.As(err, &invalidErr) {
		writeError(w, r, http.StatusBadRequest, invalidCode, invalidErr.Error())
		return
	}
	writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
}

func optionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
