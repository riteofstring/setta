package httpapi

import (
	"context"
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
	"setta/internal/realtime"
)

const RouteGetAgentProfiles = "/getAgentProfiles"
const RouteGetAgentProfile = "/getAgentProfile"
const RouteCreateAgentProfile = "/createAgentProfile"
const RouteUpdateAgentProfile = "/updateAgentProfile"
const RouteDeleteAgentProfile = "/deleteAgentProfile"

type AgentProfileRouteDependencies struct {
	ModePolicy   modes.Policy
	Profiles     *agentprofiles.Store
	Deployment   *deployments.Runtime
	WebsocketHub *realtime.WebsocketHub
}

type CreateAgentProfileRequest struct {
	Name                        *string  `json:"name"`
	Description                 *string  `json:"description"`
	SystemPrompt                *string  `json:"systemPrompt"`
	EnableBackgroundSummaryFill *bool    `json:"enableBackgroundSummaryFill"`
	EnableLlmChatTitles         *bool    `json:"enableLlmChatTitles"`
	EngineConfigID              *string  `json:"engineConfigId"`
	ToolAllowlist               []string `json:"toolAllowlist"`
	MemoryScope                 *string  `json:"memoryScope"`
}

type GetAgentProfileRequest struct {
	ProfileID string `json:"profileId"`
}

type UpdateAgentProfileRequest struct {
	Profile *AgentProfilePayload `json:"profile"`
}

type AgentProfilePayload struct {
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

type DeleteAgentProfileRequest struct {
	ProfileID string `json:"profileId"`
}

type agentProfileRouteError struct {
	Status  int
	Code    string
	Message string
}

type agentProfileFields struct {
	Name                        *string
	Description                 *string
	SystemPrompt                *string
	EnableBackgroundSummaryFill *bool
	EnableLlmChatTitles         *bool
	EngineConfigID              *string
	ToolAllowlist               []string
	MemoryScope                 *string
}

func RegisterAgentProfileRoutes(router chi.Router, deps AgentProfileRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	documentOnly := openAPIDocumentOnlyFromRouter(router)
	if deps.Profiles == nil && !documentOnly {
		return fmt.Errorf("agent profile store is required")
	}
	if deps.ModePolicy.IsDeployment() && deps.Deployment == nil && !documentOnly {
		return fmt.Errorf("deployment runtime is required in deployment mode")
	}

	registerOpenAPIGet[[]agentprofiles.Profile](
		router,
		"getAgentProfiles",
		RouteGetAgentProfiles,
		getAgentProfilesHandler(deps),
		withOpenAPITags("Agent Profiles"),
		withOpenAPISummary("List agent profiles when allowed by the current mode and policy."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[GetAgentProfileRequest, agentprofiles.Profile](
		router,
		"getAgentProfile",
		RouteGetAgentProfile,
		getAgentProfileHandler(deps),
		withOpenAPITags("Agent Profiles"),
		withOpenAPISummary("Get a single agent profile."),
		withOpenAPIModeRequirement("not-launcher"),
	)
	registerOpenAPIPost[CreateAgentProfileRequest, agentprofiles.Profile](
		router,
		"createAgentProfile",
		RouteCreateAgentProfile,
		createAgentProfileHandler(deps),
		withOpenAPITags("Agent Profiles"),
		withOpenAPISummary("Create an agent profile."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[UpdateAgentProfileRequest, agentprofiles.Profile](
		router,
		"updateAgentProfile",
		RouteUpdateAgentProfile,
		updateAgentProfileHandler(deps),
		withOpenAPITags("Agent Profiles"),
		withOpenAPISummary("Update an agent profile."),
		withOpenAPIModeRequirement("ide"),
	)
	registerOpenAPIPost[DeleteAgentProfileRequest, openAPIJSONNull](
		router,
		"deleteAgentProfile",
		RouteDeleteAgentProfile,
		deleteAgentProfileHandler(deps),
		withOpenAPITags("Agent Profiles"),
		withOpenAPISummary("Delete an agent profile."),
		withOpenAPIModeRequirement("ide"),
	)
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

func ensureAgentProfileMutationAllowed(
	w http.ResponseWriter,
	r *http.Request,
	deps AgentProfileRouteDependencies,
	detail string,
) bool {
	requestInfo, ok := modes.RequestInfoFromRequest(r)
	if !ok {
		requestInfo = modes.RequestInfo{Policy: modes.NewPolicy(deps.ModePolicy.Mode())}
	}
	if err := requestInfo.Policy.RequireNotLauncher(); err != nil {
		var violation *modes.Violation
		if errors.As(err, &violation) {
			writeDetail(w, violation.StatusCode, violation.Message)
			return false
		}
		writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
		return false
	}
	if requestInfo.Policy.IsIDE() {
		return true
	}
	writeDetail(w, http.StatusForbidden, detail)
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

		payload, err := decodeStrictJSONBody[GetAgentProfileRequest](r)
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

func createAgentProfileHandler(deps AgentProfileRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAgentProfileMutationAllowed(w, r, deps, "Share mode does not allow creating agent profiles.") {
			return
		}
		store := deps.Profiles
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[CreateAgentProfileRequest](r)
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
		if err := broadcastAgentProfilesUpdated(r.Context(), store, deps.WebsocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, created)
	}
}

func updateAgentProfileHandler(deps AgentProfileRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAgentProfileMutationAllowed(w, r, deps, "Share mode does not allow updating agent profiles.") {
			return
		}
		store := deps.Profiles
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[UpdateAgentProfileRequest](r)
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
		if err := broadcastAgentProfilesUpdated(r.Context(), store, deps.WebsocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, updated)
	}
}

func deleteAgentProfileHandler(deps AgentProfileRouteDependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ensureAgentProfileMutationAllowed(w, r, deps, "Share mode does not allow deleting agent profiles.") {
			return
		}
		store := deps.Profiles
		if store == nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}

		payload, err := decodeStrictJSONBody[DeleteAgentProfileRequest](r)
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
		if err := broadcastAgentProfilesUpdated(r.Context(), store, deps.WebsocketHub); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
			return
		}
		writeJSON(w, http.StatusOK, nil)
	}
}

func broadcastAgentProfilesUpdated(
	ctx context.Context,
	store *agentprofiles.Store,
	websocketHub *realtime.WebsocketHub,
) error {
	if websocketHub == nil || store == nil {
		return nil
	}
	profiles, err := store.List()
	if err != nil {
		return err
	}
	_, err = websocketHub.BroadcastJSON(
		ctx,
		realtime.NewAgentProfilesUpdatedMessage(profiles),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	return err
}

func buildCreatedAgentProfile(payload CreateAgentProfileRequest) (agentprofiles.Profile, *agentProfileRouteError) {
	profile, routeErr := buildAgentProfileFields(agentProfileFields{
		Name:                        payload.Name,
		Description:                 payload.Description,
		SystemPrompt:                payload.SystemPrompt,
		EnableBackgroundSummaryFill: payload.EnableBackgroundSummaryFill,
		EnableLlmChatTitles:         payload.EnableLlmChatTitles,
		EngineConfigID:              payload.EngineConfigID,
		ToolAllowlist:               payload.ToolAllowlist,
		MemoryScope:                 payload.MemoryScope,
	})
	if routeErr != nil {
		return agentprofiles.Profile{}, routeErr
	}
	profile.ID = newAgentProfileID()
	return profile, nil
}

func buildUpdatedAgentProfile(payload UpdateAgentProfileRequest) (agentprofiles.Profile, *agentProfileRouteError) {
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
	profile, routeErr := buildAgentProfileFields(agentProfileFields{
		Name:                        payload.Profile.Name,
		Description:                 payload.Profile.Description,
		SystemPrompt:                payload.Profile.SystemPrompt,
		EnableBackgroundSummaryFill: payload.Profile.EnableBackgroundSummaryFill,
		EnableLlmChatTitles:         payload.Profile.EnableLlmChatTitles,
		EngineConfigID:              payload.Profile.EngineConfigID,
		ToolAllowlist:               payload.Profile.ToolAllowlist,
		MemoryScope:                 payload.Profile.MemoryScope,
	})
	if routeErr != nil {
		return agentprofiles.Profile{}, routeErr
	}
	profile.ID = strings.TrimSpace(*payload.Profile.ID)
	return profile, nil
}

func buildAgentProfileFields(fields agentProfileFields) (agentprofiles.Profile, *agentProfileRouteError) {
	if fields.Name == nil || strings.TrimSpace(*fields.Name) == "" {
		return agentprofiles.Profile{}, &agentProfileRouteError{
			Status:  http.StatusBadRequest,
			Code:    "agent_profile_name_required",
			Message: "Agent profile name is required.",
		}
	}

	profile := agentprofiles.Profile{Name: *fields.Name}
	applyAgentProfileFields(&profile, fields)
	return profile, nil
}

func applyAgentProfileFields(profile *agentprofiles.Profile, fields agentProfileFields) {
	if profile == nil {
		return
	}
	if fields.Description != nil {
		profile.Description = *fields.Description
	}
	if fields.SystemPrompt != nil {
		profile.SystemPrompt = *fields.SystemPrompt
	}
	if fields.EnableBackgroundSummaryFill != nil {
		profile.EnableBackgroundSummaryFill = *fields.EnableBackgroundSummaryFill
	}
	if fields.EnableLlmChatTitles != nil {
		profile.EnableLlmChatTitles = *fields.EnableLlmChatTitles
	}
	if fields.EngineConfigID != nil {
		profile.EngineConfigID = cloneAgentProfileOptionalString(fields.EngineConfigID)
	}
	if fields.ToolAllowlist != nil {
		profile.ToolAllowlist = append([]string(nil), fields.ToolAllowlist...)
	}
	if fields.MemoryScope != nil {
		profile.MemoryScope = cloneAgentProfileOptionalString(fields.MemoryScope)
	}
}

func writeAgentProfileStoreError(w http.ResponseWriter, r *http.Request, err error) bool {
	switch {
	case errors.Is(err, agentprofiles.ErrInvalidProfile):
		writeError(w, r, http.StatusBadRequest, "invalid_agent_profile", err.Error())
		return true
	case errors.Is(err, agentprofiles.ErrProfileNotFound):
		writeDetail(w, http.StatusNotFound, "Agent profile not found")
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
