package httpapi

import (
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentprofiles"
	"setta/internal/deployments"
	"setta/internal/modes"
)

const RouteGetAgentProfiles = "/getAgentProfiles"
const RouteGetAgentProfile = "/getAgentProfile"
const RouteCreateAgentProfile = "/createAgentProfile"
const RouteUpdateAgentProfile = "/updateAgentProfile"
const RouteDeleteAgentProfile = "/deleteAgentProfile"

type AgentProfileRouteDependencies struct {
	ModePolicy modes.Policy
	Profiles   *agentprofiles.Store
	Deployment *deployments.Runtime
}

type createAgentProfileRequest struct {
	Name                        *string  `json:"name"`
	Description                 *string  `json:"description"`
	SystemPrompt                *string  `json:"systemPrompt"`
	EnableBackgroundSummaryFill *bool    `json:"enableBackgroundSummaryFill"`
	EnableLlmChatTitles         *bool    `json:"enableLlmChatTitles"`
	EngineConfigID              *string  `json:"engineConfigId"`
	ToolAllowlist               []string `json:"toolAllowlist"`
	MemoryScope                 *string  `json:"memoryScope"`
}

type getAgentProfileRequest struct {
	ProfileID string `json:"profileId"`
}

type updateAgentProfileRequest struct {
	Profile *agentProfilePayload `json:"profile"`
}

type agentProfilePayload struct {
	ID                          *string  `json:"id"`
	Name                        *string  `json:"name"`
	Description                 *string  `json:"description"`
	SystemPrompt                *string  `json:"systemPrompt"`
	EnableBackgroundSummaryFill *bool    `json:"enableBackgroundSummaryFill"`
	EnableLlmChatTitles         *bool    `json:"enableLlmChatTitles"`
	EngineConfigID              *string  `json:"engineConfigId"`
	ToolAllowlist               []string `json:"toolAllowlist"`
	MemoryScope                 *string  `json:"memoryScope"`
}

type deleteAgentProfileRequest struct {
	ProfileID string `json:"profileId"`
}

type agentProfileRouteError struct {
	Status  int
	Code    string
	Message string
}

func RegisterAgentProfileRoutes(router chi.Router, deps AgentProfileRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.Profiles == nil {
		return fmt.Errorf("agent profile store is required")
	}
	if deps.ModePolicy.IsDeployment() && deps.Deployment == nil {
		return fmt.Errorf("deployment runtime is required in deployment mode")
	}

	router.Get(RouteGetAgentProfiles, getAgentProfilesHandler(deps))
	router.Post(RouteGetAgentProfile, getAgentProfileHandler(deps))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteCreateAgentProfile, createAgentProfileHandler(deps.Profiles))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteUpdateAgentProfile, updateAgentProfileHandler(deps.Profiles))
	router.With(RequireIDEMode(deps.ModePolicy)).Post(RouteDeleteAgentProfile, deleteAgentProfileHandler(deps.Profiles))
	return nil
}

func ensureAgentProfileReadsAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps AgentProfileRouteDependencies,
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

func getAgentProfilesHandler(deps AgentProfileRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAgentProfileReadsAllowed(w, r, deps) {
			return
		}
		if deps.Profiles == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		profiles, err := deps.Profiles.List()
		if err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, profiles)
	}
}

func getAgentProfileHandler(deps AgentProfileRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAgentProfileReadsAllowed(w, r, deps) {
			return
		}
		if deps.Profiles == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[getAgentProfileRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		profileID := strings.TrimSpace(payload.ProfileID)
		if profileID == "" {
			writeError(w, r, http.StatusBadRequest, "profile_id_required", "Profile id is required.")
			return
		}
		profile, err := deps.Profiles.Get(profileID)
		if err != nil {
			if writeAgentProfileStoreError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, profile)
	}
}

func createAgentProfileHandler(store *agentprofiles.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[createAgentProfileRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		profile, routeErr := buildCreatedAgentProfile(payload)
		if routeErr != nil {
			writeError(w, r, routeErr.Status, routeErr.Code, routeErr.Message)
			return
		}
		created, err := store.Create(profile)
		if err != nil {
			if writeAgentProfileStoreError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, created)
	}
}

func updateAgentProfileHandler(store *agentprofiles.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[updateAgentProfileRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		profile, routeErr := buildUpdatedAgentProfile(payload)
		if routeErr != nil {
			writeError(w, r, routeErr.Status, routeErr.Code, routeErr.Message)
			return
		}
		updated, err := store.Update(profile)
		if err != nil {
			if writeAgentProfileStoreError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, updated)
	}
}

func deleteAgentProfileHandler(store *agentprofiles.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[deleteAgentProfileRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		profileID := strings.TrimSpace(payload.ProfileID)
		if profileID == "" {
			writeError(w, r, http.StatusBadRequest, "profile_id_required", "Profile id is required.")
			return
		}
		if err := store.Delete(profileID); err != nil {
			if writeAgentProfileStoreError(w, r, err) {
				return
			}
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func buildCreatedAgentProfile(payload createAgentProfileRequest) (agentprofiles.Profile, *agentProfileRouteError) {
	if payload.Name == nil || strings.TrimSpace(*payload.Name) == "" {
		return agentprofiles.Profile{}, &agentProfileRouteError{
			Status:  http.StatusBadRequest,
			Code:    "agent_profile_name_required",
			Message: "Agent profile name is required.",
		}
	}

	profile := agentprofiles.Profile{
		ID:   newAgentProfileID(),
		Name: *payload.Name,
	}
	if payload.Description != nil {
		profile.Description = *payload.Description
	}
	if payload.SystemPrompt != nil {
		profile.SystemPrompt = *payload.SystemPrompt
	}
	if payload.EnableBackgroundSummaryFill != nil {
		profile.EnableBackgroundSummaryFill = *payload.EnableBackgroundSummaryFill
	}
	if payload.EnableLlmChatTitles != nil {
		profile.EnableLlmChatTitles = *payload.EnableLlmChatTitles
	}
	if payload.EngineConfigID != nil {
		profile.EngineConfigID = cloneAgentProfileOptionalString(payload.EngineConfigID)
	}
	if payload.ToolAllowlist != nil {
		profile.ToolAllowlist = append([]string(nil), payload.ToolAllowlist...)
	}
	if payload.MemoryScope != nil {
		profile.MemoryScope = cloneAgentProfileOptionalString(payload.MemoryScope)
	}
	return profile, nil
}

func buildUpdatedAgentProfile(payload updateAgentProfileRequest) (agentprofiles.Profile, *agentProfileRouteError) {
	if payload.Profile == nil {
		return agentprofiles.Profile{}, &agentProfileRouteError{
			Status:  http.StatusBadRequest,
			Code:    "agent_profile_required",
			Message: "Agent profile is required.",
		}
	}
	if payload.Profile.ID == nil || strings.TrimSpace(*payload.Profile.ID) == "" {
		return agentprofiles.Profile{}, &agentProfileRouteError{
			Status:  http.StatusBadRequest,
			Code:    "profile_id_required",
			Message: "Profile id is required.",
		}
	}
	if payload.Profile.Name == nil || strings.TrimSpace(*payload.Profile.Name) == "" {
		return agentprofiles.Profile{}, &agentProfileRouteError{
			Status:  http.StatusBadRequest,
			Code:    "agent_profile_name_required",
			Message: "Agent profile name is required.",
		}
	}

	profile := agentprofiles.Profile{
		ID:   strings.TrimSpace(*payload.Profile.ID),
		Name: *payload.Profile.Name,
	}
	if payload.Profile.Description != nil {
		profile.Description = *payload.Profile.Description
	}
	if payload.Profile.SystemPrompt != nil {
		profile.SystemPrompt = *payload.Profile.SystemPrompt
	}
	if payload.Profile.EnableBackgroundSummaryFill != nil {
		profile.EnableBackgroundSummaryFill = *payload.Profile.EnableBackgroundSummaryFill
	}
	if payload.Profile.EnableLlmChatTitles != nil {
		profile.EnableLlmChatTitles = *payload.Profile.EnableLlmChatTitles
	}
	if payload.Profile.EngineConfigID != nil {
		profile.EngineConfigID = cloneAgentProfileOptionalString(payload.Profile.EngineConfigID)
	}
	if payload.Profile.ToolAllowlist != nil {
		profile.ToolAllowlist = append([]string(nil), payload.Profile.ToolAllowlist...)
	}
	if payload.Profile.MemoryScope != nil {
		profile.MemoryScope = cloneAgentProfileOptionalString(payload.Profile.MemoryScope)
	}
	return profile, nil
}

func writeAgentProfileStoreError(w http.ResponseWriter, r *http.Request, err error) bool {
	switch {
	case errors.Is(err, agentprofiles.ErrInvalidProfile):
		writeError(w, r, http.StatusBadRequest, "invalid_agent_profile", err.Error())
		return true
	case errors.Is(err, agentprofiles.ErrProfileNotFound):
		writeError(w, r, http.StatusNotFound, "agent_profile_not_found", "Agent profile not found.")
		return true
	default:
		return false
	}
}

func cloneAgentProfileOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func newAgentProfileID() string {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return fmt.Sprintf("agent-profile-%d", time.Now().UnixNano())
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", raw[0:4], raw[4:6], raw[6:8], raw[8:10], raw[10:16])
}
