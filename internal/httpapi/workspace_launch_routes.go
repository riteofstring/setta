package httpapi

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/frontendorigins"
	"setta/internal/modes"
	"setta/internal/workspacelaunch"
)

const RouteCreateWorkspaceLaunchIntent = "/createWorkspaceLaunchIntent"

type WorkspaceLaunchRouteDependencies struct {
	ModePolicy modes.Policy
	Auth       *auth.Service
	Intents    *workspacelaunch.IntentService
}

type workspaceLaunchErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type createWorkspaceLaunchIntentRequest struct {
	LaunchRequest workspacelaunch.Request `json:"launchRequest"`
	ReturnURL     string                  `json:"returnUrl"`
}

type createWorkspaceLaunchIntentResponse struct {
	Ok                bool                         `json:"ok"`
	LaunchIntentToken *string                      `json:"launchIntentToken"`
	RequestedAt       *int64                       `json:"requestedAt"`
	Error             *workspaceLaunchErrorPayload `json:"error"`
}

func RegisterWorkspaceLaunchRoutes(router chi.Router, deps WorkspaceLaunchRouteDependencies) error {
	if router == nil {
		return fmt.Errorf("router is required")
	}
	if deps.ModePolicy.IsDeployment() {
		return nil
	}
	if deps.Auth == nil {
		return fmt.Errorf("auth service is required")
	}
	if deps.Intents == nil {
		return fmt.Errorf("workspace launch intent service is required")
	}

	router.Post(RouteCreateWorkspaceLaunchIntent, createWorkspaceLaunchIntentHandler(deps.Auth, deps.Intents))
	return nil
}

func createWorkspaceLaunchIntentHandler(authService *auth.Service, intentService *workspacelaunch.IntentService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		payload, err := decodeJSONBody[createWorkspaceLaunchIntentRequest](r)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid_json", "Invalid JSON payload.")
			return
		}

		currentSession, ok := authService.CurrentSession()
		if !ok {
			writeJSON(w, http.StatusOK, createWorkspaceLaunchIntentResponse{
				Ok: false,
				Error: &workspaceLaunchErrorPayload{
					Code:    "Unauthorized",
					Message: "Missing session.",
				},
			})
			return
		}

		result, err := intentService.CreateIntent(workspacelaunch.CreateIntentInput{
			Request:        payload.LaunchRequest,
			ReturnURL:      payload.ReturnURL,
			RequestOrigin:  frontendorigins.ResolveRequestOrigin(r, true),
			CurrentSession: currentSession,
		})
		if err != nil {
			intentErr, ok := err.(*workspacelaunch.IntentError)
			if !ok {
				writeError(w, r, http.StatusInternalServerError, "internal_error", "Internal Server Error")
				return
			}
			writeJSON(w, http.StatusOK, createWorkspaceLaunchIntentResponse{
				Ok: false,
				Error: &workspaceLaunchErrorPayload{
					Code:    intentErr.Code,
					Message: intentErr.Message,
				},
			})
			return
		}

		writeJSON(w, http.StatusOK, createWorkspaceLaunchIntentResponse{
			Ok:                true,
			LaunchIntentToken: &result.LaunchIntentToken,
			RequestedAt:       &result.RequestedAt,
			Error:             nil,
		})
	}
}
